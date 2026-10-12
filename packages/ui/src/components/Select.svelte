<script lang="ts" generics="T extends string | number">
  import { t } from '../i18n/i18n.svelte';

  let {
    options,
    value = $bindable(),
    mixed = false,
    onchange,
  }: {
    options: { value: T; label: string }[];
    value?: T;
    mixed?: boolean;
    onchange?: (v: T) => void;
  } = $props();
</script>

<select
  class="select"
  value={mixed ? '__mixed' : String(value)}
  onchange={(e) => {
    const raw = (e.currentTarget as HTMLSelectElement).value;
    const found = options.find((o) => String(o.value) === raw);
    if (found) {
      value = found.value;
      onchange?.(found.value);
    }
  }}
>
  {#if mixed}<option value="__mixed" disabled>{t('common.mixed')}</option>{/if}
  {#each options as o (o.value)}
    <option value={String(o.value)}>{o.label}</option>
  {/each}
</select>

<style>
  .select {
    height: 30px;
    min-width: 0;
    width: 100%;
    padding: 0 8px;
    background: var(--bv-input);
    border: 1px solid var(--bv-input-border);
    border-radius: calc(var(--bv-radius) * 0.75);
    color: var(--bv-text);
  }
  .select:focus {
    outline: 2px solid var(--bv-accent);
    outline-offset: -1px;
  }
  option {
    background: var(--bv-dialog);
    color: var(--bv-text);
  }
</style>
