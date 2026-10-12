<script lang="ts">
  import { Button, Modal, Segmented, Select, t, TextField, Toggle, tk } from '@bv/ui';
  import type { Editor } from '../lib/editor.svelte';
  import { store } from '../lib/store.svelte';
  import type { GenLayout, NameTemplate } from './generate';
  import { GeneratorState, type AppSource, type GenSource } from './gen-state.svelte';

  /** The bulk generator of action bubbles (spec §4.6). */
  let { editor, gen, onclose }: { editor: Editor; gen: GeneratorState; onclose: () => void } =
    $props();

  const sources: { value: GenSource; label: string }[] = [
    { value: 'files', label: t('gen.source.files') },
    { value: 'folder', label: t('gen.source.folder') },
    { value: 'apps', label: t('gen.source.apps') },
    { value: 'web', label: t('gen.source.web') },
  ];
  const appSources: { value: AppSource; label: string }[] = [
    { value: 'start', label: t('gen.apps.start') },
    { value: 'store', label: t('gen.apps.store') },
    { value: 'steam', label: t('gen.apps.steam') },
    { value: 'epic', label: t('gen.apps.epic') },
  ];
  const nameTemplates: { value: NameTemplate; label: string }[] = [
    { value: 'name', label: t('gen.name.name') },
    { value: 'nameExt', label: t('gen.name.nameExt') },
    { value: 'folder', label: t('gen.name.folder') },
  ];
  const layouts: { value: GenLayout; label: string }[] = [
    { value: 'circle', label: t('gen.layout.circle') },
    { value: 'grid', label: t('gen.layout.grid') },
    { value: 'spiral', label: t('gen.layout.spiral') },
  ];

  const world = $derived(store.world);
  const folders = $derived([{ value: '', label: t('gen.mainLevel') }, ...gen.folders()]);
  const sharedScripts = $derived(
    world.sharedScripts.filter((s) => !s.id.startsWith('builtin.') && s.params.length > 0),
  );
  const scriptValue = $derived(
    gen.options.script.kind === 'builtin' ? 'builtin' : gen.options.script.id,
  );
  const scriptParams = $derived(
    gen.options.script.kind === 'shared'
      ? (sharedScripts.find((s) => s.id === scriptValue)?.params ?? [])
      : [],
  );
  const lookValue = $derived(
    gen.options.look.kind === 'template'
      ? `template:${gen.options.look.id}`
      : gen.options.look.kind,
  );
  const count = $derived(gen.rows.filter((r) => r.on).length);

  function setScript(v: string) {
    if (v === 'builtin') gen.options.script = { kind: 'builtin' };
    else {
      const s = sharedScripts.find((x) => x.id === v);
      gen.options.script = { kind: 'shared', id: v, param: s?.params[0]?.name ?? '' };
    }
  }

  function setLook(v: string) {
    if (v.startsWith('template:')) gen.options.look = { kind: 'template', id: v.slice(9) };
    else gen.options.look = { kind: v === 'inherit' ? 'inherit' : 'auto' };
    void gen.resolveIcons();
  }

  function create() {
    const n = gen.create(editor);
    if (n) {
      store.notify(tk('gen.created', { n }));
      onclose();
    }
  }
</script>

<Modal title={t('gen.title')} width={940} {onclose}>
  <div class="gen">
    <div class="left">
      <Segmented options={sources} value={gen.source} onchange={(v) => gen.setSource(v)} />

      {#if gen.source === 'files'}
        <div class="bar">
          <p class="bv-muted hint">{t('gen.files.hint')}</p>
          <Button small icon="plus" onclick={() => void gen.pickFiles()}
            >{t('gen.files.add')}</Button
          >
        </div>
      {:else if gen.source === 'folder'}
        <div class="bar">
          <TextField
            value={gen.folder}
            placeholder={t('gen.folder.path')}
            oninput={(v) => (gen.folder = v)}
            onenter={() => void gen.scanFolder()}
          />
          <Button small onclick={() => void gen.pickFolder()}>{t('common.browse')}</Button>
        </div>
        <div class="bar">
          <TextField
            value={gen.exts}
            placeholder={t('gen.folder.exts')}
            oninput={(v) => (gen.exts = v)}
            onenter={() => void gen.scanFolder()}
          />
          <Toggle
            checked={gen.recursive}
            label={t('gen.folder.recursive')}
            onchange={(v) => (gen.recursive = v)}
          />
          <Button small onclick={() => void gen.scanFolder()}>{t('gen.folder.scan')}</Button>
        </div>
      {:else if gen.source === 'apps'}
        <Segmented
          options={appSources}
          value={gen.appSource}
          onchange={(v) => void gen.loadApps(v)}
        />
        <div class="bar">
          <TextField
            value={gen.filter}
            placeholder={t('gen.apps.filter')}
            oninput={(v) => (gen.filter = v)}
          />
          <Button small onclick={() => gen.setAll(true)}>{t('gen.all')}</Button>
          <Button small onclick={() => gen.setAll(false)}>{t('gen.none')}</Button>
        </div>
      {:else}
        <TextField
          multiline
          value={gen.webText}
          placeholder={t('gen.web.placeholder')}
          oninput={(v) => gen.setWeb(v)}
        />
      {/if}

      <div class="list" aria-busy={gen.loading}>
        {#if gen.loading}
          <p class="bv-muted empty">{t('gen.loading')}</p>
        {:else}
          {#each gen.visible as { row, index } (index)}
            {@const icon = gen.icons[GeneratorState.key(row.item)]}
            <label class="row" class:off={!row.on}>
              <input
                type="checkbox"
                checked={row.on}
                onchange={(e) => gen.toggle(index, e.currentTarget.checked)}
              />
              <span class="icon">
                {#if icon}<img src={store.core.assetUrl(icon)} alt="" />{/if}
              </span>
              <span class="name">{gen.name(row.item)}</span>
              <span class="target bv-muted" title={row.item.target}>{row.item.target}</span>
            </label>
          {:else}
            <p class="bv-muted empty">{t('gen.emptyList')}</p>
          {/each}
        {/if}
      </div>
    </div>

    <div class="right">
      <label class="field">
        <span>{t('gen.where')}</span>
        <Select
          options={folders}
          value={gen.options.parentId ?? ''}
          onchange={(v) => (gen.options.parentId = v || null)}
        />
      </label>
      <label class="field">
        <span>{t('gen.name')}</span>
        <Segmented
          options={nameTemplates}
          value={gen.options.nameTemplate}
          onchange={(v) => (gen.options.nameTemplate = v)}
        />
      </label>
      <div class="pair">
        <TextField
          value={gen.options.prefix}
          placeholder={t('gen.prefix')}
          oninput={(v) => (gen.options.prefix = v)}
        />
        <TextField
          value={gen.options.suffix}
          placeholder={t('gen.suffix')}
          oninput={(v) => (gen.options.suffix = v)}
        />
      </div>
      <label class="field">
        <span>{t('gen.script')}</span>
        <Select
          options={[
            { value: 'builtin', label: t('gen.script.builtin') },
            ...sharedScripts.map((s) => ({ value: s.id, label: s.name })),
          ]}
          value={scriptValue}
          onchange={setScript}
        />
      </label>
      {#if gen.options.script.kind === 'shared'}
        {@const script = gen.options.script}
        <label class="field">
          <span>{t('gen.script.param')}</span>
          <Select
            options={scriptParams.map((p) => ({ value: p.name, label: p.name }))}
            value={script.param}
            onchange={(v) => (gen.options.script = { ...script, param: v })}
          />
        </label>
      {/if}
      <label class="field">
        <span>{t('gen.look')}</span>
        <Select
          options={[
            { value: 'auto', label: t('gen.look.auto') },
            { value: 'inherit', label: t('gen.look.inherit') },
            ...world.templates.map((x) => ({
              value: `template:${x.id}`,
              label: tk('gen.look.template', { name: x.name }),
            })),
          ]}
          value={lookValue}
          onchange={setLook}
        />
      </label>
      <label class="field">
        <span>{t('gen.layout')}</span>
        <Segmented
          options={layouts}
          value={gen.options.layout}
          onchange={(v) => (gen.options.layout = v)}
        />
      </label>
    </div>
  </div>
  {#snippet actions()}
    <Button variant="primary" disabled={count === 0} onclick={create}>
      {tk('gen.create', { n: count })}
    </Button>
    <Button onclick={onclose}>{t('common.cancel')}</Button>
  {/snippet}
</Modal>

<style>
  .gen {
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 18px;
    min-height: 420px;
  }
  .left,
  .right {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .bar,
  .pair {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .pair > :global(*) {
    flex: 1;
  }
  .hint {
    flex: 1;
    margin: 0;
    font-size: 12px;
  }
  .list {
    flex: 1;
    min-height: 260px;
    max-height: 46vh;
    overflow-y: auto;
    border: 1px solid var(--bv-border);
    border-radius: calc(var(--bv-radius) * 0.6);
    background: var(--bv-input);
  }
  .row {
    display: grid;
    grid-template-columns: auto 28px minmax(120px, 1fr) minmax(0, 1.4fr);
    gap: 8px;
    align-items: center;
    padding: 4px 8px;
    border-bottom: 1px solid var(--bv-border);
    font-size: 13px;
    cursor: pointer;
  }
  .row.off {
    opacity: 0.55;
  }
  .icon {
    width: 24px;
    height: 24px;
  }
  .icon img {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }
  .name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .target {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }
  .empty {
    padding: 20px;
    text-align: center;
  }
  .field {
    display: grid;
    gap: 4px;
    font-size: 12px;
    color: var(--bv-text-2);
  }
</style>
