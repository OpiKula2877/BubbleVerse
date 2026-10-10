<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    children,
    wide = false,
  }: { label: string; children: Snippet; wide?: boolean } = $props();
</script>

<div class="field" class:wide>
  <span class="label" title={label}>{label}</span>
  <div class="control">{@render children()}</div>
</div>

<style>
  .field {
    display: grid;
    grid-template-columns: 96px 1fr;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .field.wide {
    grid-template-columns: 1fr;
    gap: 4px;
  }
  .label {
    color: var(--bv-text-2);
    font-size: 12px;
    line-height: 1.25;
    /* Long labels (and longer translations) wrap instead of being cut off. */
    overflow-wrap: anywhere;
  }
  .control {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }
</style>
