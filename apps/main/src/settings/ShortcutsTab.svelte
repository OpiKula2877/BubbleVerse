<script lang="ts">
  import { OP, resolveSlot } from '@bv/blocks';
  import {
    Button,
    cancelCapture,
    captureCombo,
    DEFAULT_SHORTCUTS,
    findCollisions,
    Icon,
    normalizeCombo,
    Segmented,
    t,
    tk,
    Toggle,
    type Shortcut,
  } from '@bv/ui';
  import { WorldIndex } from '@bv/world';
  import { store } from '../lib/store.svelte';

  const shortcuts = $derived(store.settings.shortcuts);
  let capturing = $state<string | null>(null);

  // A click anywhere else cancels typing a shortcut.
  $effect(() => {
    if (capturing === null) return;
    const cancel = () => cancelCapture();
    const timer = setTimeout(() => window.addEventListener('pointerdown', cancel, true));
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', cancel, true);
    };
  });

  /** Hotkeys from bubble scripts, shown in the same list (spec §7.3). */
  const scriptKeys = $derived.by(() => {
    const w = store.published;
    const index = new WorldIndex(w);
    const out: { id: string; combo: string; scope: 'app' | 'global'; path: string }[] = [];
    for (const b of w.bubbles) {
      const hotkeys = b.scripts
        .map((slot, i) => ({ s: resolveSlot(w, slot), i }))
        .filter(({ s }) => s && s.trigger[0] === OP.ev_hotkey);
      for (const { s, i } of hotkeys) {
        const path = index.pathString(b.id);
        out.push({
          id: `script:${b.id}:${i}`,
          combo: String(s!.trigger[1] ?? ''),
          scope: s!.trigger[2] === 'app' ? 'app' : 'global',
          // Several hotkey scripts in one bubble are told apart by their number.
          path: hotkeys.length > 1 ? t('shortcuts.scriptN', { path, n: i + 1 }) : path,
        });
      }
    }
    return out;
  });

  const collisions = $derived(
    findCollisions([
      ...shortcuts.map((s) => ({ id: s.action, combo: s.combo, scope: s.scope })),
      ...scriptKeys.map((s) => ({ id: s.id, combo: s.combo, scope: s.scope })),
    ]),
  );

  function nameOf(id: string): string {
    const script = scriptKeys.find((s) => s.id === id);
    return script ? script.path : tk(`shortcut.${id}`);
  }

  /** Distinct messages: two scripts in one bubble (or same-named bubbles) read the same. */
  function problems(id: string): string[] {
    const list = collisions
      .filter((c) => c.id === id)
      .map((c) =>
        c.reserved
          ? t('shortcuts.reserved', { combo: c.combo })
          : c.with === 'windows'
            ? t('shortcuts.windows')
            : t('shortcuts.collision', { other: nameOf(c.with) }),
      );
    return [...new Set(list)];
  }

  function save(list: Shortcut[]) {
    void store.saveSettings({ ...store.settings, shortcuts: list });
  }

  function patch(action: string, p: Partial<Shortcut>) {
    save(shortcuts.map((s) => (s.action === action ? { ...s, ...p } : s)));
  }

  /** The core takes every key meanwhile, so even `Alt+Space` or `Win` can be chosen. */
  async function capture(action: string) {
    if (capturing) cancelCapture();
    capturing = action;
    const combo = await captureCombo();
    if (capturing === action) capturing = null;
    if (combo && normalizeCombo(combo)) patch(action, { combo });
  }
</script>

<div class="list">
  {#each shortcuts as s (s.action)}
    <div class="row">
      <div class="name">{tk(`shortcut.${s.action}`)}</div>
      <button
        class="combo"
        class:capturing={capturing === s.action}
        onclick={() => void capture(s.action)}
      >
        {capturing === s.action ? t('shortcuts.press') : s.combo}
      </button>
      <Segmented
        value={s.scope}
        options={[
          { value: 'app', label: t('shortcuts.scope.app') },
          { value: 'global', label: t('shortcuts.scope.global') },
        ]}
        onchange={(v) => patch(s.action, { scope: v })}
      />
      <Toggle
        checked={s.overrideWindows}
        label={t('shortcuts.override')}
        onchange={(v) => patch(s.action, { overrideWindows: v })}
      />
      {#each problems(s.action) as p (p)}
        <div class="warn"><Icon name="warning" size={13} />{p}</div>
      {/each}
    </div>
  {/each}
</div>

<Button small icon="undo" onclick={() => save(DEFAULT_SHORTCUTS.map((s) => ({ ...s })))}
  >{t('shortcuts.reset')}</Button
>

{#if scriptKeys.length}
  <h4>{t('shortcuts.scripts')}</h4>
  <div class="list">
    {#each scriptKeys as s (s.id)}
      <div class="row">
        <div class="name">{s.path}</div>
        <span class="combo static">{s.combo}</span>
        <span class="bv-muted"
          >{s.scope === 'app' ? t('shortcuts.scope.app') : t('shortcuts.scope.global')}</span
        >
        {#each problems(s.id) as p (p)}
          <div class="warn"><Icon name="warning" size={13} />{p}</div>
        {/each}
      </div>
    {/each}
  </div>
{/if}

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row {
    /* Wraps the scope and override controls under the name when the panel is narrow. */
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--bv-border);
    border-radius: calc(var(--bv-radius) * 0.75);
  }
  .name {
    flex: 1 1 160px;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .combo {
    flex: none;
    width: 150px;
    height: 30px;
    padding: 0 10px;
    border-radius: calc(var(--bv-radius) * 0.75);
    border: 1px solid var(--bv-input-border);
    background: var(--bv-input);
    font-family: Consolas, monospace;
    font-size: 12px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .combo.capturing {
    outline: 2px solid var(--bv-accent);
    color: var(--bv-accent);
  }
  .combo.static {
    cursor: default;
  }
  .warn {
    flex-basis: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--bv-warning);
    font-size: 12px;
  }
  h4 {
    margin: 10px 0 0;
    font-size: 13px;
  }
</style>
