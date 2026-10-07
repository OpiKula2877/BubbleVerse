<script lang="ts">
  import Icon from './Icon.svelte';
  import type { MenuItem } from './menu';

  let { x, y, items, onclose }: { x: number; y: number; items: MenuItem[]; onclose: () => void } =
    $props();

  let el: HTMLDivElement | undefined = $state();
  let pos = $state({ x: 0, y: 0 });

  $effect(() => {
    // Keep the menu inside its container.
    const parent = el?.offsetParent as HTMLElement | null;
    const w = el?.offsetWidth ?? 0;
    const h = el?.offsetHeight ?? 0;
    const pw = parent?.clientWidth ?? window.innerWidth;
    const ph = parent?.clientHeight ?? window.innerHeight;
    pos = { x: Math.max(4, Math.min(x, pw - w - 4)), y: Math.max(4, Math.min(y, ph - h - 4)) };
  });

  function pick(item: MenuItem) {
    if (item.disabled) return;
    onclose();
    item.action?.();
  }
</script>

<svelte:window
  onkeydown={(e) => e.key === 'Escape' && onclose()}
  onpointerdown={(e) => {
    if (el && !el.contains(e.target as Node)) onclose();
  }}
/>

<div class="menu bv-glass" bind:this={el} style:left="{pos.x}px" style:top="{pos.y}px" role="menu">
  {#each items as item, i (i)}
    {#if item.separator}
      <div class="sep"></div>
    {:else}
      <button
        type="button"
        role="menuitem"
        class:danger={item.danger}
        disabled={item.disabled}
        onclick={() => pick(item)}
      >
        <span class="ic"
          >{#if item.icon}<Icon name={item.icon} size={15} />{/if}</span
        >
        <span class="label">{item.label}</span>
        {#if item.shortcut}<span class="sc">{item.shortcut}</span>{/if}
      </button>
    {/if}
  {/each}
</div>

<style>
  .menu {
    position: absolute;
    z-index: 60;
    min-width: 220px;
    padding: 4px;
    background: var(--bv-dialog);
    display: flex;
    flex-direction: column;
  }
  button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border: 0;
    border-radius: 6px;
    background: none;
    cursor: pointer;
    text-align: left;
  }
  button:hover:not(:disabled) {
    background: var(--bv-button-hover);
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .danger {
    color: var(--bv-error);
  }
  .ic {
    width: 16px;
    display: inline-flex;
    color: var(--bv-text-2);
  }
  .label {
    flex: 1;
  }
  .sc {
    color: var(--bv-text-muted);
    font-size: 11px;
  }
  .sep {
    height: 1px;
    margin: 4px 6px;
    background: var(--bv-border);
  }
</style>
