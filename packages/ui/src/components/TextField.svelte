<script lang="ts">
  import { t } from '../i18n/i18n.svelte';

  let {
    value = $bindable(''),
    placeholder = '',
    mixed = false,
    autofocus = false,
    multiline = false,
    oninput,
    onenter,
    onkeydown,
    input = $bindable(),
  }: {
    value?: string;
    placeholder?: string;
    mixed?: boolean;
    autofocus?: boolean;
    multiline?: boolean;
    oninput?: (v: string) => void;
    onenter?: () => void;
    onkeydown?: (e: KeyboardEvent) => void;
    input?: HTMLInputElement | HTMLTextAreaElement;
  } = $props();

  $effect(() => {
    if (autofocus && input) {
      input.focus();
      if ('select' in input) input.select();
    }
  });

  function keydown(e: KeyboardEvent) {
    onkeydown?.(e);
    if (e.key === 'Enter' && !multiline && onenter) {
      e.preventDefault();
      onenter();
    }
  }
</script>

{#if multiline}
  <textarea
    class="field multi"
    bind:this={input}
    bind:value
    placeholder={mixed ? t('common.mixed') : placeholder}
    oninput={() => oninput?.(value)}
    onkeydown={keydown}></textarea>
{:else}
  <input
    class="field"
    type="text"
    bind:this={input}
    bind:value
    placeholder={mixed ? t('common.mixed') : placeholder}
    oninput={() => oninput?.(value)}
    onkeydown={keydown}
  />
{/if}

<style>
  .field {
    width: 100%;
    min-width: 0;
    height: 30px;
    padding: 0 8px;
    background: var(--bv-input);
    border: 1px solid var(--bv-input-border);
    border-radius: calc(var(--bv-radius) * 0.75);
    outline: none;
  }
  .field.multi {
    height: 110px;
    padding: 6px 8px;
    resize: vertical;
    font-family: Consolas, monospace;
    font-size: 12px;
  }
  .field:focus {
    outline: 2px solid var(--bv-accent);
    outline-offset: -1px;
  }
  .field::placeholder {
    color: var(--bv-text-muted);
  }
</style>
