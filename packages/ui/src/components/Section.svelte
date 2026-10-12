<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  let {
    title,
    open = $bindable(true),
    children,
    extra,
  }: { title: string; open?: boolean; children: Snippet; extra?: Snippet } = $props();
</script>

<section class="section">
  <header>
    <button type="button" class="head" onclick={() => (open = !open)} aria-expanded={open}>
      <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
      <span>{title}</span>
    </button>
    {#if extra}<div class="extra">{@render extra()}</div>{/if}
  </header>
  {#if open}
    <div class="body">{@render children()}</div>
  {/if}
</section>

<style>
  .section {
    border-bottom: 1px solid var(--bv-border);
  }
  header {
    display: flex;
    align-items: center;
  }
  .head {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 9px 12px;
    background: none;
    border: 0;
    cursor: pointer;
    font-weight: 600;
    color: var(--bv-text);
    text-align: left;
  }
  .head:hover {
    background: var(--bv-button-hover);
  }
  .extra {
    padding-right: 8px;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 4px 12px 12px;
  }
</style>
