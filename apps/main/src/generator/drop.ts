import { listen } from '@tauri-apps/api/event';
import { enterEdit } from '../lib/actions';
import { store } from '../lib/store.svelte';

/**
 * Files dropped from Explorer open the bulk generator (spec §4.6): on a folder bubble the
 * bubbles go into it, on an action bubble next to it, elsewhere to the main level. The page
 * cannot read file paths, so it hands the files to WebView2 and the core sends the paths back.
 */

interface WebView2 {
  postMessageWithAdditionalObjects?: (message: string, objects: FileList) => void;
}

let dropAt: { x: number; y: number } | null = null;

export function onDragOver(e: DragEvent): void {
  if (!e.dataTransfer?.types.includes('Files')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
}

export function onDrop(e: DragEvent): void {
  const files = e.dataTransfer?.files;
  if (!files?.length) return;
  e.preventDefault();
  dropAt = { x: e.clientX, y: e.clientY };
  const wv = (window as unknown as { chrome?: { webview?: WebView2 } }).chrome?.webview;
  wv?.postMessageWithAdditionalObjects?.('bv-drop', files);
}

function filesDropped(paths: string[]): void {
  const at = dropAt;
  dropAt = null;
  if (!store.editor) enterEdit();
  const editor = store.editor;
  if (!editor) return;
  const r = store.renderer;
  const wp = at && r ? r.screenToWorld(at) : null;
  const hit = wp && r ? r.hitTest(wp) : null;
  const b = hit ? editor.index.get(hit) : undefined;
  const parentId = b ? (b.kind === 'folder' ? b.id : b.parentId) : null;
  editor.modal = { kind: 'generator', parentId, files: paths };
}

export async function startFileDrop(): Promise<() => void> {
  if (!store.core.isTauri) return () => {};
  return listen<string[]>('bv://files-dropped', (e) => filesDropped(e.payload));
}
