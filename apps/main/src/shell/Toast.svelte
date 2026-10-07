<script lang="ts">
  import { Icon } from '@bv/ui';
  import { store } from '../lib/store.svelte';
</script>

{#if store.toast}
  <div class="toast bv-glass" class:error={store.toast.error} role="status">
    <Icon name={store.toast.error ? 'warning' : 'check'} size={16} />
    <span>{store.toast.text}</span>
  </div>
{/if}

<style>
  .toast {
    position: absolute;
    left: 50%;
    bottom: 28px;
    transform: translateX(-50%);
    z-index: 70;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    max-width: 70%;
    color: var(--bv-success);
  }
  .toast span {
    color: var(--bv-text);
  }
  .error {
    color: var(--bv-error);
    border-color: var(--bv-error);
  }
</style>
