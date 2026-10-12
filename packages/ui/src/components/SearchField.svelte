<script lang="ts">
  import type { SearchKey, SearchView } from '@bv/search';
  import { t } from '../i18n/i18n.svelte';

  let {
    view,
    oninput,
    onkey,
    compact = false,
  }: {
    view: SearchView;
    oninput: (text: string) => void;
    onkey: (key: SearchKey) => void;
    /** Compact bar: no bubbles around, slightly smaller. */
    compact?: boolean;
  } = $props();

  let input: HTMLInputElement | undefined = $state();

  export function focus() {
    input?.focus();
  }

  $effect(() => {
    input?.focus();
  });

  // Keep the input in sync when the engine changes the text (TAB, history).
  $effect(() => {
    if (input && input.value !== view.text) input.value = view.text;
  });

  function keydown(e: KeyboardEvent) {
    const map: Record<string, SearchKey> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      Tab: 'tab',
      Enter: 'enter',
      Escape: 'escape',
    };
    const k = map[e.key];
    if (k) {
      e.preventDefault();
      e.stopPropagation();
      onkey(k);
    } else if (e.key === 'Backspace' && !(input?.value ?? '')) {
      e.preventDefault();
      onkey('backspace');
    }
  }

  const empty = $derived(!view.text && !view.prefix);
</script>

<div class="search" class:compact role="search">
  {#if view.showPaths && view.current}
    <div class="red-path">{view.current.path}</div>
  {/if}
  <div class="box bv-glass">
    <div class="line dim">
      {#if view.prev}
        <span class="name">{view.prev.item.name}</span>
        {#if view.showPaths}<span class="small-path">{view.prev.path}</span>{/if}
      {/if}
    </div>
    <div class="line current">
      <span class="caret">▸</span>
      {#if view.prefix}<span class="prefix">{view.prefix}</span>{/if}
      <span class="field">
        <input
          bind:this={input}
          type="text"
          spellcheck="false"
          autocomplete="off"
          aria-label={t('search.label')}
          oninput={(e) => oninput((e.currentTarget as HTMLInputElement).value)}
          onkeydown={keydown}
        />
        <span class="overlay" aria-hidden="true">
          <span class="typed">{view.text}</span>{#if view.historyEntry}<span class="ghost"
              >{view.historyEntry}</span
            >{:else if view.ghost}<span class="ghost">{view.ghost}</span
            >{:else if view.suggestion}<span class="ghost"
              >{t('search.suggestion', { name: view.suggestion })}</span
            >{:else if empty && view.placeholder}<span class="ghost">{view.placeholder}</span
            >{:else if empty}<span class="ghost">{t('search.hint')}</span>{/if}
        </span>
      </span>
    </div>
    <div class="line dim">
      {#if view.next}
        <span class="name">{view.next.item.name}</span>
        {#if view.showPaths}<span class="small-path">{view.next.path}</span>{/if}
      {/if}
      <span class="count">{view.total ? `${view.position} / ${view.total}` : t('search.none')}</span
      >
    </div>
  </div>
</div>

<style>
  .search {
    width: min(640px, calc(100vw - 32px));
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 16px;
  }
  .compact {
    width: 100%;
  }
  .red-path {
    padding: 0 18px;
    color: var(--bv-red-path);
    font-weight: 600;
    font-size: 14px;
    text-align: center;
    text-shadow: 0 1px 6px color-mix(in srgb, var(--bv-bg) 80%, transparent);
  }
  .box {
    display: flex;
    flex-direction: column;
    padding: 6px 0;
    background: var(--bv-dialog);
  }
  .line {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-height: 30px;
    padding: 4px 18px;
    white-space: nowrap;
    overflow: hidden;
  }
  .dim {
    color: var(--bv-text-muted);
    font-size: 14px;
    min-height: 24px;
  }
  .current {
    gap: 6px;
  }
  .caret {
    color: var(--bv-accent);
  }
  .prefix {
    color: var(--bv-text-2);
  }
  .field {
    position: relative;
    flex: 1;
    min-width: 0;
  }
  input {
    width: 100%;
    border: 0;
    outline: none;
    padding: 0;
    background: transparent;
    font: inherit;
    color: var(--bv-text);
    caret-color: var(--bv-accent);
  }
  .overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    white-space: pre;
    overflow: hidden;
  }
  .typed {
    visibility: hidden;
  }
  .ghost {
    color: var(--bv-ghost);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .small-path {
    color: color-mix(in srgb, var(--bv-red-path) 70%, transparent);
    font-size: 11px;
  }
  .count {
    margin-left: auto;
    color: var(--bv-text-muted);
    font-size: 12px;
  }
</style>
