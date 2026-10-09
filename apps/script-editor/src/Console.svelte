<script lang="ts">
  import { Icon, t } from '@bv/ui';
  import { tick } from 'svelte';
  import type { EditorSession } from './session.svelte';

  /** Debug console (spec §5.5): prints, errors with bubble path and block, times. */
  let { s }: { s: EditorSession } = $props();

  let open = $state(true);
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
      {t('editor.console')}
    </button>
    {#if open}
      <label class="only">
        <input type="checkbox" bind:checked={onlyThis} />
        {t('editor.onlyThis')}
      </label>
      <button type="button" class="clear" onclick={() => s.clearConsole()}
        >{t('editor.clear')}</button
      >
    {/if}
  </header>
  {#if open}
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
  .clear {
    margin-left: auto;
    font-weight: 400;
    color: var(--bv-accent);
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
