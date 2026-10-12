import { applyScriptEdit, type ScriptEdit } from '@bv/blocks';
import type { BubbleId, World } from '@bv/world';
import { emitTo, listen } from '@tauri-apps/api/event';
import { store } from './store.svelte';

/**
 * The bridge to the script editor window (spec §5.1). The app window holds the draft
 * (spec §8.4): the editor gets it when it opens and after changes, and its Save comes back
 * here to be written into the draft and saved (DECISIONS).
 */

const EDITOR = 'script-editor';
let editorOpen = false;
let worldTimer = 0;

export async function openScriptEditor(bubble: BubbleId): Promise<void> {
  try {
    await store.core.call('open_script_editor', { bubble, world: store.world });
    editorOpen = store.core.isTauri;
  } catch (e) {
    store.error(e);
  }
}

/** Sends the shown world to the open editor (renames, undo…), at most every 300 ms. */
export function sendWorldToEditor(world: World): void {
  if (!editorOpen) return;
  clearTimeout(worldTimer);
  worldTimer = window.setTimeout(() => void emitTo(EDITOR, 'bv://editor-world', world), 300);
}

async function saveFromEditor(edit: ScriptEdit): Promise<void> {
  const editor = store.editor;
  if (editor) {
    editor.apply((w) => applyScriptEdit(w, edit));
    if (!(await editor.save())) throw new Error('save failed');
    return;
  }
  const next = applyScriptEdit(store.published, edit);
  await store.core.publish(next);
  store.published = next;
}

export async function startScriptEditorBridge(): Promise<() => void> {
  if (!store.core.isTauri) return () => {};
  const offs = [
    await listen<{ id: string; edit: ScriptEdit }>('bv://editor-save', async (e) => {
      const { id, edit } = e.payload;
      try {
        await saveFromEditor(edit);
        await emitTo(EDITOR, 'bv://editor-saved', { id, ok: true });
      } catch (err) {
        await emitTo(EDITOR, 'bv://editor-saved', { id, ok: false, error: String(err) });
      }
    }),
    await listen('bv://editor-closed', () => {
      editorOpen = false;
    }),
  ];
  return () => offs.forEach((o) => o());
}
