<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import { t } from '../i18n/i18n.svelte';

  let {
    title,
    width = 420,
    onclose,
    children,
    actions,
  }: {
    title: string;
    width?: number;
    onclose?: () => void;
    children: Snippet;
    actions?: Snippet;
  } = $props();

  function key(e: KeyboardEvent) {
    if (e.key === 'Escape' && onclose) {
      e.stopPropagation();
      onclose();
    }
  }
</script>

<svelte:window onkeydown={key} />

<div class="backdrop" role="presentation" onpointerdown={(e) => e.target === e.currentTarget && onclose?.()}>
  <div class="modal bv-glass" style:width="{width}px" role="dialog" aria-modal="true" aria-label={title}>
    <header>
      <h2>{title}</h2>
      {#if onclose}
        <button type="button" class="x" onclick={onclose} aria-label={t('common.close')}>
          <Icon name="close" size={16} />
        </button>
      {/if}
    </header>
    <div class="content">{@render children()}</div>
    {#if actions}<footer>{@render actions()}</footer>{/if}
  </div>
</div>

<style>
  .backdrop {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--bv-bg) 45%, transparent);
    z-index: 50;
  }
  .modal {
    max-width: calc(100% - 32px);
    max-height: calc(100% - 32px);
    display: flex;
    flex-direction: column;
    background: var(--bv-dialog);
  }
  header {
    display: flex;
    align-items: center;
    padding: 14px 16px 6px;
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
  .x {
    background: none;
    border: 0;
    padding: 4px;
    border-radius: 6px;
    cursor: pointer;
    color: var(--bv-text-2);
  }
  .x:hover {
    background: var(--bv-button-hover);
  }
  .content {
    padding: 8px 16px 12px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 8px 16px 16px;
  }
</style>
