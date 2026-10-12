<script lang="ts">
  import { t } from '../i18n/i18n.svelte';

  let {
    value = $bindable(0),
    min = -Infinity,
    max = Infinity,
    step = 1,
    mixed = false,
    suffix,
    onchange,
  }: {
    value?: number;
    min?: number;
    max?: number;
    step?: number;
    mixed?: boolean;
    suffix?: string;
    onchange?: (v: number) => void;
  } = $props();

  let text = $state('');
  let focused = $state(false);

  $effect(() => {
    if (!focused) text = mixed ? '' : String(Math.round(value * 1000) / 1000);
  });

  function commit(raw: string) {
    const n = Number(raw.replace(',', '.'));
    if (!Number.isFinite(n) || raw.trim() === '') return;
    const v = Math.min(max, Math.max(min, n));
    value = v;
    onchange?.(v);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const base = mixed ? 0 : value;
      const mult = e.shiftKey ? 10 : 1;
      commit(String(base + (e.key === 'ArrowUp' ? step : -step) * mult));
      text = String(Math.round(value * 1000) / 1000);
    } else if (e.key === 'Enter') {
      (e.currentTarget as HTMLInputElement).blur();
    }
  }
</script>

<label class="num">
  <input
    type="text"
    inputmode="decimal"
    placeholder={mixed ? t('common.mixed') : ''}
    bind:value={text}
    onfocus={() => (focused = true)}
    onblur={() => {
      focused = false;
      commit(text);
    }}
    oninput={() => commit(text)}
    onkeydown={onKey}
  />
  {#if suffix}<span class="suffix">{suffix}</span>{/if}
</label>

<style>
  .num {
    display: flex;
    align-items: center;
    height: 30px;
    min-width: 0;
    background: var(--bv-input);
    border: 1px solid var(--bv-input-border);
    border-radius: calc(var(--bv-radius) * 0.75);
    padding: 0 8px;
  }
  .num:focus-within {
    outline: 2px solid var(--bv-accent);
    outline-offset: -1px;
  }
  input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    outline: none;
  }
  input::placeholder {
    color: var(--bv-text-muted);
  }
  .suffix {
    color: var(--bv-text-muted);
    margin-left: 4px;
  }
</style>
