<script lang="ts">
  import { Button, Modal } from '@bv/ui';
  import { store } from '../lib/store.svelte';

  const d = $derived(store.dialog);

  function close() {
    const cb = d?.onclose;
    store.dialog = null;
    cb?.();
  }
</script>

{#if d}
  <Modal title={d.title} onclose={close}>
    <p>{d.text}</p>
    {#snippet actions()}
      {#each d.buttons as b (b.label)}
        <Button
          variant={b.kind === 'primary' ? 'primary' : b.kind === 'danger' ? 'danger' : 'default'}
          onclick={() => {
            store.dialog = null;
            b.action();
          }}>{b.label}</Button
        >
      {/each}
    {/snippet}
  </Modal>
{/if}

<style>
  p {
    margin: 0;
    line-height: 1.5;
    color: var(--bv-text-2);
  }
</style>
