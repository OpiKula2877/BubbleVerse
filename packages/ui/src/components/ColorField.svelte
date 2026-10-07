<script lang="ts">
  import { t } from '../i18n/i18n.svelte';

  let {
    value = $bindable('#FFFFFF'),
    mixed = false,
    onchange,
  }: { value?: string; mixed?: boolean; onchange?: (v: string) => void } = $props();

  let text = $state('');
  $effect(() => {
    text = mixed ? '' : value.toUpperCase();
  });

  function set(v: string) {
    const m = v.trim().match(/^#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/);
    if (!m) return;
    const next = `#${m[1]}${m[2] ?? ''}`.toUpperCase();
    value = next;
    onchange?.(next);
  }
</script>

<div class="color">
  <input
    class="swatch"
    type="color"
    value={mixed ? '#808080' : value.slice(0, 7)}
    oninput={(e) =>
      set((e.currentTarget as HTMLInputElement).value + (value.length > 7 ? value.slice(7) : ''))}
  />
  <input
    class="hex"
    type="text"
    bind:value={text}
    placeholder={mixed ? t('common.mixed') : ''}
    onchange={() => set(text)}
  />
</div>

<style>
  .color {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .swatch {
    flex: none;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid var(--bv-input-border);
    border-radius: calc(var(--bv-radius) * 0.75);
    background: none;
    cursor: pointer;
  }
  .swatch::-webkit-color-swatch-wrapper {
    padding: 3px;
  }
  .swatch::-webkit-color-swatch {
    border: 0;
    border-radius: 4px;
  }
  .hex {
    flex: 1;
    min-width: 0;
    height: 30px;
    padding: 0 8px;
    background: var(--bv-input);
    border: 1px solid var(--bv-input-border);
    border-radius: calc(var(--bv-radius) * 0.75);
    font-family: Consolas, monospace;
    font-size: 12px;
    outline: none;
  }
  .hex:focus {
    outline: 2px solid var(--bv-accent);
    outline-offset: -1px;
  }
</style>
