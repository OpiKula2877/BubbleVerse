<script lang="ts" generics="T extends string | number">
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

<div class="seg" role="radiogroup">
  {#each options as o (o.value)}
    <button
      type="button"
      role="radio"
      aria-checked={!mixed && value === o.value}
      class:on={!mixed && value === o.value}
      onclick={() => {
        value = o.value;
        onchange?.(o.value);
      }}>{o.label}</button
    >
  {/each}
</div>

<style>
  .seg {
    display: inline-flex;
    flex-wrap: wrap;
    background: var(--bv-input);
    border: 1px solid var(--bv-input-border);
    border-radius: calc(var(--bv-radius) * 0.75);
    padding: 2px;
    gap: 2px;
  }
  button {
    border: 0;
    background: transparent;
    padding: 4px 10px;
    border-radius: calc(var(--bv-radius) * 0.6);
    cursor: pointer;
    color: var(--bv-text-2);
  }
  button:hover {
    background: var(--bv-button-hover);
  }
  button.on {
    background: var(--bv-accent);
    color: var(--bv-accent-text);
  }
</style>
