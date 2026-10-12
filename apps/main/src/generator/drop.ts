import { getCurrentWebview } from '@tauri-apps/api/webview';
import { enterEdit } from '../lib/actions';
import { store } from '../lib/store.svelte';

/**
 * Files dropped from Explorer open the bulk generator (spec §4.6): on a folder bubble the
 * bubbles go into it, on an action bubble next to it, elsewhere to the main level.
 */

function filesDropped(paths: string[], at: { x: number; y: number }): void {
  if (!paths.length) return;
  if (!store.editor) enterEdit();
  const editor = store.editor;
  if (!editor) return;
  const r = store.renderer;
  const wp = r ? r.screenToWorld(at) : null;
  const hit = wp && r ? r.hitTest(wp) : null;
  const b = hit ? editor.index.get(hit) : undefined;
  const parentId = b ? (b.kind === 'folder' ? b.id : b.parentId) : null;
  editor.modal = { kind: 'generator', parentId, files: paths };
}

export async function startFileDrop(): Promise<() => void> {
  if (!store.core.isTauri) return () => {};
  return getCurrentWebview().onDragDropEvent((e) => {
    if (e.payload.type !== 'drop') return;
    // Physical pixels of the window to CSS pixels.
    const scale = window.devicePixelRatio || 1;
    const { x, y } = e.payload.position;
    filesDropped(e.payload.paths, { x: x / scale, y: y / scale });
  });
}
