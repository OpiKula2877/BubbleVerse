<script lang="ts">
  import { getCore, Icon, t, type MessageKey } from '@bv/ui';
  import { tick } from 'svelte';
  import { formatValue, type EditorSession } from './session.svelte';

  /**
   * Bottom area: the debug console (spec §5.5: prints, errors with bubble path and block,
   * times) and the variables of the open scripts (spec §5.1).
   */
  let { s }: { s: EditorSession } = $props();

  const core = getCore();
  const scopeKey: Record<string, MessageKey> = {
    s: 'editor.scopeS',
    b: 'editor.scopeB',
    g: 'editor.scopeG',
  };
  let open = $state(true);
  let tab = $state<'console' | 'vars'>('console');
  let onlyThis = $state(true);
  let list: HTMLDivElement | undefined = $state();

  const lines = $derived(onlyThis ? s.lines.filter((l) => l.mine) : s.lines);

  function time(at: number): string {
    const d = new Date(at);
    const p = (n: number, w = 2) => String(n).padStart(w, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
  }

  $effect(() => {
    void lines.length;
    void tick().then(() => list?.scrollTo({ top: list.scrollHeight }));
  });
</script>

<section class="console" class:open>
  <header>
    <button type="button" class="toggle" onclick={() => (open = !open)}>
      <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
    </button>
    <button
      type="button"
      class="tab"
      class:on={open && tab === 'console'}
      onclick={() => ((tab = 'console'), (open = true))}>{t('editor.console')}</button
    >
    <button
      type="button"
      class="tab"
      class:on={open && tab === 'vars'}
      onclick={() => {
        tab = 'vars';
        open = true;
        void s.refreshValues();
      }}>{t('editor.variables')} ({s.panel.vars.length})</button
    >
    {#if open && tab === 'console'}
      <label class="only">
        <input type="checkbox" bind:checked={onlyThis} />
        {t('editor.onlyThis')}
      </label>
      <button type="button" class="clear" onclick={() => s.clearConsole()}
        >{t('editor.clear')}</button
      >
    {:else if open}
      <button type="button" class="clear" onclick={() => void s.refreshValues()}
        >{t('editor.refresh')}</button
      >
      <button
        type="button"
        class="clear"
        onclick={() => void core.call('open_settings', { tab: 'scripts' })}
        >{t('editor.allGlobals')}</button
      >
    {/if}
  </header>
  {#if open && tab === 'vars'}
    <div class="lines">
      {#each s.panel.vars as v (`${v.scope}:${v.name}`)}
        <div class="var">
          <span class="vname">{v.name}</span>
          <span class="muted">{t(scopeKey[v.scope]!)}</span>
          {#if v.scope === 's'}
            <span class="muted">{t('editor.varRunOnly')}</span>
          {:else}
            <input
              class="value"
              value={formatValue(s.values[v.scope][v.name])}
              aria-label={v.name}
              onchange={(e) =>
                void s.setVariable(v.scope as 'b' | 'g', v.name, e.currentTarget.value)}
            />
          {/if}
        </div>
      {/each}
    </div>
  {:else if open}
    <div class="lines" bind:this={list}>
      {#each lines as l (l.id)}
        <button
          type="button"
          class="line {l.level}"
          disabled={!l.jump}
          onclick={() => l.jump && s.jumpTo(l.jump)}
        >
          <span class="time">{time(l.at)}</span>
          {#if l.path && !l.mine}<span class="path">{l.path}</span>{/if}
          {#if l.block}<span class="block">{l.block}</span>{/if}
          <span class="text">{l.text}</span>
        </button>
      {/each}
    </div>
  {/if}
</section>

<style>
  .console {
    border-top: 1px solid var(--bv-border);
    background: var(--bv-bar);
    font-size: 12px;
  }
  .console.open {
    height: 190px;
    display: grid;
    grid-template-rows: auto 1fr;
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 10px;
  }
  .toggle,
  .tab,
  .clear {
    display: flex;
    align-items: center;
    gap: 4px;
    border: none;
    background: none;
    color: var(--bv-text-2);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .tab {
    padding: 2px 4px;
    border-bottom: 2px solid transparent;
  }
  .tab.on {
    color: var(--bv-text);
    border-bottom-color: var(--bv-accent);
  }
  .clear {
    font-weight: 400;
    color: var(--bv-accent);
  }
  .only + .clear,
  .tab + .clear {
    margin-left: auto;
  }
  .var {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 3px 0;
  }
  .vname {
    font-weight: 600;
    font-family: inherit;
  }
  .muted {
    color: var(--bv-text-muted);
  }
  .value {
    height: 22px;
    max-width: 200px;
    padding: 0 6px;
    border-radius: calc(var(--bv-radius) * 0.5);
    border: 1px solid var(--bv-input-border);
    background: var(--bv-input);
    color: var(--bv-text);
    font: inherit;
  }
  .only {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--bv-text-2);
  }
  .lines {
    overflow-y: auto;
    padding: 0 10px 6px;
    font-family: ui-monospace, Consolas, monospace;
  }
  .line {
    display: flex;
    gap: 10px;
    width: 100%;
    padding: 2px 0;
    border: none;
    background: none;
    color: var(--bv-text);
    font: inherit;
    text-align: left;
  }
  .line:not(:disabled) {
    cursor: pointer;
  }
  .line:not(:disabled):hover {
    background: var(--bv-button-hover);
  }
  .line.error {
    color: var(--bv-error);
  }
  .line.system {
    color: var(--bv-text-2);
  }
  .time {
    color: var(--bv-text-muted);
  }
  .path {
    color: var(--bv-text-2);
  }
  .block {
    color: var(--bv-accent);
  }
  .text {
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
