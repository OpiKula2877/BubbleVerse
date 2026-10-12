<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import { playSound } from '../sound';

  let {
    variant = 'default',
    icon,
    title,
    disabled = false,
    active = false,
    small = false,
    type = 'button',
    onclick,
    children,
  }: {
    variant?: 'default' | 'primary' | 'ghost' | 'danger';
    icon?: string;
    title?: string;
    disabled?: boolean;
    active?: boolean;
    small?: boolean;
    type?: 'button' | 'submit';
    onclick?: (e: MouseEvent) => void;
    children?: Snippet;
  } = $props();
</script>

<button
  {type}
  class="btn {variant}"
  class:active
  class:small
  class:iconOnly={!children}
  {title}
  aria-label={title}
  {disabled}
  onclick={(e) => {
    playSound('click');
    onclick?.(e);
  }}
>
  {#if icon}<Icon name={icon} size={small ? 15 : 17} />{/if}
  {#if children}<span>{@render children()}</span>{/if}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    border-radius: calc(var(--bv-radius) * 0.75);
    border: 1px solid transparent;
    background: var(--bv-button);
    color: var(--bv-button-text);
    cursor: pointer;
    white-space: nowrap;
    transition:
      background 0.12s,
      border-color 0.12s;
  }
  .btn.small {
    height: 26px;
    padding: 0 8px;
    font-size: 12px;
  }
  .btn.iconOnly {
    width: 32px;
    padding: 0;
  }
  .btn.small.iconOnly {
    width: 26px;
  }
  .btn:hover:not(:disabled) {
    background: var(--bv-button-hover);
  }
  .btn:active:not(:disabled),
  .btn.active {
    background: var(--bv-button-active);
  }
  .btn.active {
    border-color: var(--bv-accent);
  }
  .btn.primary {
    background: var(--bv-accent);
    color: var(--bv-accent-text);
  }
  .btn.primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--bv-accent) 85%, var(--bv-text));
  }
  .btn.ghost {
    background: transparent;
  }
  .btn.ghost:hover:not(:disabled) {
    background: var(--bv-button-hover);
  }
  .btn.danger {
    color: var(--bv-error);
  }
  .btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .btn:focus-visible {
    outline: 2px solid var(--bv-accent);
    outline-offset: 1px;
  }
</style>
