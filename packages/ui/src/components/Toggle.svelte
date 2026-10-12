<script lang="ts">
  let {
    checked = $bindable(false),
    label,
    mixed = false,
    disabled = false,
    onchange,
  }: {
    checked?: boolean;
    label?: string;
    mixed?: boolean;
    disabled?: boolean;
    onchange?: (v: boolean) => void;
  } = $props();

  function flip() {
    if (disabled) return;
    checked = mixed ? true : !checked;
    onchange?.(checked);
  }
</script>

<button
  type="button"
  class="toggle"
  class:on={checked && !mixed}
  class:mixed
  role="switch"
  aria-checked={mixed ? 'mixed' : checked}
  {disabled}
  onclick={flip}
>
  <span class="track"><span class="knob"></span></span>
  {#if label}<span class="label">{label}</span>{/if}
</button>

<style>
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: 0;
    padding: 2px 0;
    cursor: pointer;
    text-align: left;
  }
  .track {
    position: relative;
    flex: none;
    width: 32px;
    height: 18px;
    border-radius: 9px;
    background: var(--bv-input-border);
    transition: background 0.15s;
  }
  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--bv-text);
    transition: transform 0.15s;
  }
  .on .track {
    background: var(--bv-accent);
  }
  .on .knob {
    transform: translateX(14px);
    background: var(--bv-accent-text);
  }
  .mixed .knob {
    transform: translateX(7px);
    opacity: 0.6;
  }
  .toggle:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .toggle:focus-visible .track {
    outline: 2px solid var(--bv-accent);
    outline-offset: 2px;
  }
</style>
