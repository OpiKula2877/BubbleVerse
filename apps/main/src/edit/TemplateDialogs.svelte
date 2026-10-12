<script lang="ts">
  import { Button, Modal, t, TextField, tk } from '@bv/ui';
  import { addTemplate, applyTemplate, newId, removeTemplate, templateFrom } from '@bv/world';
  import type { Editor } from '../lib/editor.svelte';
  import { store } from '../lib/store.svelte';

  /** Save as template / Apply template (spec §4.5). */
  let { editor }: { editor: Editor } = $props();

  const m = $derived(editor.modal);
  let name = $state('');

  $effect(() => {
    if (m?.kind === 'saveTemplate') name = editor.index.get(m.id)?.name ?? '';
  });

  function close() {
    editor.modal = null;
  }

  function save(id: string) {
    const b = editor.index.get(id);
    const n = name.trim();
    if (!b || !n) return;
    editor.apply((w) => addTemplate(w, templateFrom(b, newId(), n)));
    store.notify(t('template.saved'));
    close();
  }

  function apply(ids: string[], templateId: string) {
    const tpl = editor.world?.templates.find((x) => x.id === templateId);
    if (!tpl) return;
    editor.apply((w) => applyTemplate(w, ids, tpl, store.renderer?.basePositions()));
    store.notify(tk('template.applied', { n: ids.length }));
    close();
  }
</script>

{#if m?.kind === 'saveTemplate'}
  {@const id = m.id}
  <Modal title={t('template.saveTitle')} width={400} onclose={close}>
    <TextField
      value={name}
      autofocus
      placeholder={t('template.name')}
      oninput={(v) => (name = v)}
      onenter={() => save(id)}
    />
    {#snippet actions()}
      <Button variant="primary" disabled={!name.trim()} onclick={() => save(id)}>
        {t('common.create')}
      </Button>
      <Button onclick={close}>{t('common.cancel')}</Button>
    {/snippet}
  </Modal>
{:else if m?.kind === 'applyTemplate'}
  {@const ids = m.ids}
  <Modal title={t('template.applyTitle')} width={420} onclose={close}>
    <div class="list">
      {#each editor.world?.templates ?? [] as tpl (tpl.id)}
        <div class="row">
          <button type="button" class="name" onclick={() => apply(ids, tpl.id)}>{tpl.name}</button>
          <Button
            small
            icon="trash"
            title={t('template.delete')}
            onclick={() => editor.apply((w) => removeTemplate(w, tpl.id))}
          />
        </div>
      {:else}
        <p class="bv-muted">{t('template.none')}</p>
      {/each}
    </div>
    {#snippet actions()}
      <Button onclick={close}>{t('common.close')}</Button>
    {/snippet}
  </Modal>
{/if}

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .name {
    flex: 1;
    padding: 8px 10px;
    border: 1px solid var(--bv-border);
    border-radius: calc(var(--bv-radius) * 0.6);
    background: var(--bv-button);
    color: var(--bv-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .name:hover {
    background: var(--bv-button-hover);
  }
</style>
