<script lang="ts">
  import {
    applyTheme,
    Button,
    configureSounds,
    getCore,
    Icon,
    Modal,
    Select,
    setLang,
    t,
    TextField,
    themeColors,
    tk,
    type Settings,
  } from '@bv/ui';
  import type { ParamDef, World } from '@bv/world';
  import { emitTo, listen } from '@tauri-apps/api/event';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { onDestroy, onMount } from 'svelte';
  import BlockDialog from './BlockDialog.svelte';
  import {
    Blockly,
    createWorkspace,
    defineBlocks,
    getPaletteScale,
    makeTheme,
    mountInToolbox,
    registerEditCustom,
    registerRunModeMenu,
    showSearch,
    updateToolbox,
    zoomPalette,
  } from './blockly-setup';
  import Console from './Console.svelte';
  import { EditorSession, isHat, parseRunMode, type EditorRequest } from './session.svelte';
  import SidePanel from './SidePanel.svelte';

  /** The script editor window (spec §5.1). */
  const core = getCore();
  const s = new EditorSession();
  // Development: the session is reachable from the dev tools (and CDP checks).
  if (import.meta.env.DEV) Object.assign(window, { bvEditor: s, bvBlockly: Blockly });
  let host: HTMLDivElement | undefined = $state();
  let searchBox: HTMLDivElement | undefined = $state();
  let paletteBar: HTMLDivElement | undefined = $state();
  let paletteScale = $state(getPaletteScale());
  let searchInput: HTMLInputElement | undefined = $state();
  let query = $state('');
  let ready = $state(false);
  let closing = false;
  let addPick = $state('');
  type Dialog =
    | { kind: 'close' }
    | { kind: 'switch'; req: EditorRequest }
    | { kind: 'shared'; name: string }
    | { kind: 'block'; id: string | null };
  let dialog = $state<Dialog | null>(null);
  const offs: (() => void)[] = [];

  function look(next: Settings) {
    const a = next.appearance;
    const colors = themeColors(a.theme, a.custom);
    applyTheme(colors, {
      font: a.font,
      radius: a.radius,
      panelOpacity: a.panelOpacity,
      uiScale: a.uiScale,
    });
    const lang = next.general.language;
    const langChanged = lang !== s.lang;
    setLang(lang);
    configureSounds(next.sounds, (h) => core.assetUrl(h));
    s.lang = lang;
    const ws = s.ws;
    if (!ws) return;
    ws.setTheme(makeTheme(colors, a.font));
    if (langChanged) {
      // Blocks are defined per language: keep the content, redefine, load it again.
      const doc = s.doc;
      const state = doc ? s.stateOf(doc) : null;
      defineBlocks(lang, colors, s.customBlocks);
      updateToolbox(ws, lang, t('editor.searchCategory'));
      if (state) Blockly.serialization.workspaces.load(state as object, ws);
    }
  }

  function setTitle() {
    if (core.isTauri) void getCurrentWindow().setTitle(tk('editor.title', { path: s.path }));
  }

  $effect(() => {
    void s.path;
    setTitle();
  });

  /** Outside Tauri (browser preview) the editor shows the first action bubble of the mock world. */
  async function firstRequest(world: World): Promise<EditorRequest | null> {
    if (core.isTauri) {
      const r = await core.call<{ bubble: string; world: World } | null>('editor_request');
      return r;
    }
    const b = world.bubbles.find((x) => x.kind === 'action');
    return b ? { bubble: b.id, world } : null;
  }

  onMount(async () => {
    const boot = await core.bootstrap();
    s.lang = boot.settings.general.language;
    look(boot.settings);
    const req = await firstRequest(boot.draft?.world ?? boot.published);
    const a = boot.settings.appearance;
    const colors = themeColors(a.theme, a.custom);
    defineBlocks(s.lang, colors, req?.world.customBlocks ?? []);
    if (!host) return;
    const ws = createWorkspace(host, {
      lang: s.lang,
      colors,
      font: a.font,
      searchLabel: t('editor.searchCategory'),
      flyouts: {
        query: () => query,
        searchHint: () => t('editor.searchHint'),
        makeLabel: () => t('editor.makeBlock'),
        customBlocks: () => s.customBlocks,
        argNames: () =>
          s.doc?.kind === 'custom'
            ? (s.customBlocks.find((c) => c.id === s.doc?.id)?.params ?? []).map((p) => p.name)
            : [],
        paramNames: () => (s.doc?.kind === 'shared' ? s.panel.params.map((p) => p.name) : []),
      },
      onMakeBlock: () => (dialog = { kind: 'block', id: null }),
    });
    s.ws = ws;
    ws.addChangeListener((e) => s.onChange(e));
    if (searchBox) mountInToolbox(ws, searchBox);
    if (paletteBar) mountInToolbox(ws, paletteBar, 'bottom');
    registerEditCustom(
      () => t('editor.editBlock'),
      (id) => void s.openCustom(id),
    );
    registerRunModeMenu({
      isHat,
      label: (mode) =>
        t('editor.runModeItem', {
          mode: t(
            mode === 'ignore'
              ? 'editor.runIgnore'
              : mode === 'restart'
                ? 'editor.runRestart'
                : 'editor.runParallel',
          ),
        }),
      current: (block) => parseRunMode(block.data),
      set: (block, mode) => s.setRunMode(mode, block),
    });
    if (req) await s.load(req);
    ready = true;
    const resize = new ResizeObserver(() => Blockly.svgResize(ws));
    resize.observe(host);
    offs.push(() => resize.disconnect());
    offs.push(
      core.on('trace', (ev) => s.onTrace(ev)),
      core.on('log', (e) => s.onLog(e)),
      core.on('settings', (next) => look(next)),
    );
    if (core.isTauri) {
      offs.push(
        await listen<EditorRequest>('bv://editor-open', (e) => {
          if (e.payload.bubble === s.bubbleId && !s.dirty) {
            s.updateWorld(e.payload.world);
          } else if (s.dirty && e.payload.bubble !== s.bubbleId) {
            dialog = { kind: 'switch', req: e.payload };
          } else {
            void s.load(e.payload);
          }
        }),
        await listen<World>('bv://editor-world', (e) => s.updateWorld(e.payload)),
        await getCurrentWindow().onCloseRequested((e) => {
          if (closing || !s.dirty) {
            void emitTo('main', 'bv://editor-closed', null);
            return;
          }
          e.preventDefault();
          dialog = { kind: 'close' };
        }),
      );
      await getCurrentWindow().show();
      await getCurrentWindow().setFocus();
    }
  });

  onDestroy(() => {
    offs.forEach((o) => o());
    s.ws?.dispose();
  });

  async function closeNow() {
    closing = true;
    dialog = null;
    await getCurrentWindow().close();
  }

  function onKey(e: KeyboardEvent) {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void s.save();
    } else if (ctrl && e.key.toLowerCase() === 'f') {
      // Ctrl+F jumps to the block search (spec §5.1).
      e.preventDefault();
      searchInput?.focus();
      searchInput?.select();
    }
  }

  function search(v: string) {
    query = v;
    if (s.ws) showSearch(s.ws);
  }

  /** ⇄: own script ↔ shared script (spec §5.3). */
  function swap() {
    const d = s.doc;
    if (d?.kind === 'shared') {
      s.toInline();
    } else if (d?.kind === 'inline') {
      if (!s.selectedHat()) {
        s.system(t('editor.selectScript'), 'error');
        return;
      }
      dialog = { kind: 'shared', name: `${s.bubble?.name ?? ''}`.trim() };
    }
  }

  function makeShared(name: string) {
    dialog = null;
    if (!s.toShared(name.trim() || t('editor.sharedNameLabel')))
      s.system(t('editor.selectScript'), 'error');
  }

  function saveBlock(id: string | null, name: string, params: ParamDef[]) {
    dialog = null;
    if (id) s.editBlock(id, name, params);
    else s.makeBlock(name, params);
  }

  const tabs = $derived(s.docs.filter((d) => d.open));
  const status = $derived(
    s.missing
      ? t('editor.missing')
      : s.saving
        ? t('editor.saving')
        : s.dirty
          ? t('editor.unsaved')
          : '',
  );
</script>

<svelte:window onkeydowncapture={onKey} />

<div class="editor">
  <header class="toolbar">
    <Button
      variant="primary"
      icon="save"
      disabled={!s.dirty || s.saving || s.missing}
      title={t('editor.saveHint')}
      onclick={() => void s.save()}>{t('editor.save')}</Button
    >
    <Button icon="play" disabled={!ready} onclick={() => void s.runTest(false)}
      >{t('editor.test')}</Button
    >
    <Button icon="stop" onclick={() => void s.stop()}>{t('editor.stop')}</Button>
    <Button icon="step" active={!!s.test?.step} onclick={() => void s.step()}
      >{t('editor.step')}</Button
    >
    <Button icon="record" active={s.recording} onclick={() => void s.toggleRecording()}>
      {s.recording ? t('editor.stopRecording') : t('editor.record')}
    </Button>
    <Button
      icon="link"
      disabled={s.doc?.kind === 'custom'}
      title={t('editor.sharedHint')}
      onclick={swap}
    >
      {t('editor.shared')}
    </Button>
    <span class="status" class:warn={s.missing}>{status}</span>
  </header>

  <nav class="tabs">
    {#each tabs as d (d.key)}
      <div class="tab" class:active={d.key === s.current}>
        <button type="button" class="tab-label" onclick={() => s.show(d.key)}>
          {#if d.kind === 'inline'}
            {t('editor.ownScripts')}
          {:else if d.kind === 'shared'}
            ⇄ {s.sharedName(d.id)}
          {:else}
            ▣ {s.customName(d.id)}
          {/if}
          {#if d.changed}<span class="dot">•</span>{/if}
        </button>
        {#if d.kind === 'custom'}
          <button
            type="button"
            class="tab-close"
            title={t('editor.closeTab')}
            onclick={() => s.closeCustom(d.key)}
          >
            <Icon name="close" size={12} />
          </button>
        {/if}
      </div>
    {/each}
    {#if s.availableShared.length}
      <div class="add">
        <Select
          options={[
            { value: '', label: t('editor.addShared') },
            ...s.availableShared.map((x) => ({ value: x.id, label: x.name })),
          ]}
          bind:value={addPick}
          onchange={(v) => {
            if (v) s.addShared(v);
            addPick = '';
          }}
        />
      </div>
    {/if}
  </nav>

  <main class="body" class:side={s.doc?.kind === 'shared' || s.doc?.kind === 'custom'}>
    <div class="blockly" bind:this={host}></div>
    {#if s.doc?.kind === 'shared' || s.doc?.kind === 'custom'}
      <SidePanel {s} onEditBlock={(id) => (dialog = { kind: 'block', id })} />
    {/if}
  </main>

  <Console {s} />
</div>

<!-- Moved to the bottom of Blockly's toolbox: the palette's own zoom. -->
<div class="palette-zoom" bind:this={paletteBar}>
  <Icon name="search" size={14} />
  <button
    type="button"
    title={t('editor.paletteSmaller')}
    aria-label={t('editor.paletteSmaller')}
    onclick={() => s.ws && (paletteScale = zoomPalette(s.ws, -1))}
  >
    <Icon name="minus" size={14} />
  </button>
  <button
    type="button"
    class="pct"
    title={t('editor.paletteReset')}
    onclick={() => s.ws && (paletteScale = zoomPalette(s.ws, 0))}
  >
    {Math.round(paletteScale * 100)} %
  </button>
  <button
    type="button"
    title={t('editor.paletteBigger')}
    aria-label={t('editor.paletteBigger')}
    onclick={() => s.ws && (paletteScale = zoomPalette(s.ws, 1))}
  >
    <Icon name="plus" size={14} />
  </button>
</div>

<!-- Moved into Blockly's toolbox: the block search sits on top of the palette (spec §5.1). -->
<div class="search" bind:this={searchBox}>
  <Icon name="search" size={14} />
  <input
    bind:this={searchInput}
    value={query}
    placeholder={t('editor.searchBlocks')}
    aria-label={t('editor.searchBlocks')}
    oninput={(e) => search(e.currentTarget.value)}
    onfocus={() => query && search(query)}
    onkeydown={(e) => {
      if (e.key === 'Escape') {
        search('');
        e.currentTarget.blur();
      }
    }}
  />
</div>

{#if dialog?.kind === 'close' || dialog?.kind === 'switch'}
  {@const d = dialog}
  <Modal title={t('editor.closeTitle')} onclose={() => (dialog = null)}>
    <p>{t('editor.closeText')}</p>
    {#snippet actions()}
      <Button
        variant="primary"
        onclick={async () => {
          if (!(await s.save())) return;
          if (d.kind === 'close') await closeNow();
          else {
            dialog = null;
            await s.load(d.req);
          }
        }}>{t('editor.save')}</Button
      >
      <Button
        variant="danger"
        onclick={async () => {
          if (d.kind === 'close') await closeNow();
          else {
            dialog = null;
            await s.load(d.req);
          }
        }}>{t('editor.discard')}</Button
      >
      <Button onclick={() => (dialog = null)}>{t('editor.stay')}</Button>
    {/snippet}
  </Modal>
{:else if dialog?.kind === 'shared'}
  {@const d = dialog}
  <Modal title={t('editor.sharedNameTitle')} width={420} onclose={() => (dialog = null)}>
    <p class="hint">{t('editor.sharedInfo')}</p>
    <TextField
      value={d.name}
      autofocus
      placeholder={t('editor.sharedNameLabel')}
      oninput={(v) => (d.name = v)}
      onenter={() => makeShared(d.name)}
    />
    {#snippet actions()}
      <Button variant="primary" onclick={() => makeShared(d.name)}>{t('common.create')}</Button>
      <Button onclick={() => (dialog = null)}>{t('common.cancel')}</Button>
    {/snippet}
  </Modal>
{:else if dialog?.kind === 'block'}
  {@const id = dialog.id}
  {@const c = id ? s.customBlocks.find((x) => x.id === id) : undefined}
  <BlockDialog
    name={c?.name ?? ''}
    params={c?.params ?? []}
    editing={!!c}
    onsave={(name, params) => saveBlock(id, name, params)}
    oncancel={() => (dialog = null)}
  />
{/if}

<style>
  .editor {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    background: var(--bv-bg);
    color: var(--bv-text);
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    background: var(--bv-bar);
    border-bottom: 1px solid var(--bv-border);
  }
  .status {
    margin-left: auto;
    color: var(--bv-text-muted);
    font-size: 12px;
  }
  .status.warn {
    color: var(--bv-warning);
  }
  .tabs {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    padding: 6px 10px 0;
    background: var(--bv-bar);
    border-bottom: 1px solid var(--bv-border);
    overflow-x: auto;
  }
  .tab {
    display: flex;
    align-items: center;
    border: 1px solid var(--bv-border);
    border-bottom: none;
    border-radius: calc(var(--bv-radius) * 0.6) calc(var(--bv-radius) * 0.6) 0 0;
    background: var(--bv-button);
  }
  .tab.active {
    background: var(--bv-bg);
  }
  .tab-label,
  .tab-close {
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 13px;
    padding: 6px 12px;
    cursor: pointer;
    white-space: nowrap;
  }
  .tab-close {
    padding: 6px 8px 6px 0;
    color: var(--bv-text-muted);
  }
  .dot {
    color: var(--bv-accent);
    margin-left: 4px;
  }
  .add {
    margin-left: 8px;
    margin-bottom: 4px;
    min-width: 180px;
  }
  .body {
    display: grid;
    grid-template-columns: 1fr;
    min-height: 0;
  }
  .body.side {
    grid-template-columns: 1fr 300px;
  }
  .blockly {
    position: relative;
    min-width: 0;
    min-height: 0;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 8px;
    padding: 0 8px;
    height: 30px;
    border-radius: calc(var(--bv-radius) * 0.6);
    border: 1px solid var(--bv-input-border);
    background: var(--bv-input);
    color: var(--bv-text-muted);
  }
  .search input {
    flex: 1;
    min-width: 0;
    width: 150px;
    border: none;
    outline: none;
    background: none;
    color: var(--bv-text);
    font: inherit;
    font-size: 13px;
  }
  .palette-zoom {
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: 8px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 6px;
    height: 30px;
    border-radius: calc(var(--bv-radius) * 0.6);
    border: 1px solid var(--bv-border);
    background: var(--bv-panel);
    color: var(--bv-text-muted);
  }
  .palette-zoom button {
    display: grid;
    place-items: center;
    min-width: 26px;
    height: 24px;
    border: none;
    border-radius: calc(var(--bv-radius) * 0.4);
    background: none;
    color: var(--bv-text);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .palette-zoom button:hover {
    background: var(--bv-button-hover);
  }
  .palette-zoom .pct {
    flex: 1;
  }
  :global(.blocklyToolbox) {
    padding-bottom: 46px;
  }
  .hint {
    color: var(--bv-text-2);
    font-size: 13px;
    margin: 0 0 10px;
  }
  /* Blockly pop-ups follow the theme. */
  :global(.blocklyDropDownDiv),
  :global(.blocklyWidgetDiv .blocklyMenu) {
    background: var(--bv-dialog) !important;
    border-color: var(--bv-border) !important;
    color: var(--bv-text) !important;
  }
  :global(.blocklyMenuItem) {
    color: var(--bv-text) !important;
  }
  :global(.blocklyMenuItemHighlight) {
    background: var(--bv-button-hover) !important;
  }
  :global(.blocklyToolboxCategoryLabel),
  :global(.blocklyTreeLabel) {
    color: var(--bv-text) !important;
  }
  :global(.blocklyToolboxSelected .blocklyToolboxCategoryLabel) {
    color: var(--bv-accent-text) !important;
  }
  :global(.blocklyFlyoutButton .blocklyText),
  :global(.blocklyFlyoutLabelText) {
    fill: var(--bv-text) !important;
  }
</style>
