<script lang="ts">
  import { Button, t } from '@bv/ui';
  import type { Editor } from '../lib/editor.svelte';
  import { store } from '../lib/store.svelte';

  let { editor }: { editor: Editor } = $props();

  function discard() {
    store.dialog = {
      title: t('dialog.discardTitle'),
      text: t('dialog.discardText'),
      buttons: [
        { label: t('common.cancel'), action: () => {} },
        { label: t('toolbar.discard'), kind: 'danger', action: () => void editor.discard() },
      ],
    };
  }
</script>

<div class="toolbar bv-glass">
  <Button variant="primary" icon="save" onclick={() => void editor.save()} title="Ctrl+S">{t('toolbar.save')}</Button>
  <Button icon="discard" disabled={!editor.dirty} onclick={discard}>{t('toolbar.discard')}</Button>
  <div class="sep"></div>
  <Button variant="ghost" icon="undo" title={t('toolbar.undo')} disabled={!editor.canUndo} onclick={() => editor.undo()} />
  <Button variant="ghost" icon="redo" title={t('toolbar.redo')} disabled={!editor.canRedo} onclick={() => editor.redo()} />
  <div class="sep"></div>
  <Button
    variant="ghost"
    icon={editor.preview ? 'stop' : 'play'}
    active={editor.preview}
    onclick={() => (editor.preview = !editor.preview)}
    >{editor.preview ? t('toolbar.stopPreview') : t('toolbar.preview')}</Button
  >
  <Button variant="ghost" icon="grid" active={editor.grid} onclick={() => (editor.grid = !editor.grid)}
    >{t('toolbar.grid')}</Button
  >
  <span class="status" class:dirty={editor.dirty}>{editor.status}</span>
</div>

<style>
  .toolbar {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px;
    background: var(--bv-bar);
  }
  .sep {
    width: 1px;
    height: 22px;
    background: var(--bv-border);
    margin: 0 2px;
  }
  .status {
    padding: 0 8px;
    font-size: 12px;
    color: var(--bv-success);
    white-space: nowrap;
  }
  .status.dirty {
    color: var(--bv-warning);
  }
</style>
