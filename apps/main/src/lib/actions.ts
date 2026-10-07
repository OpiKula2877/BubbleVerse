import { t } from '@bv/ui';
import { Editor } from './editor.svelte';
import { store } from './store.svelte';

/** Enters edit mode with the saved world (spec §2.6). */
export function enterEdit(): void {
  if (store.editor) return;
  store.editor = new Editor(store.published);
  store.mode = 'edit';
  store.renderer?.setWorld(store.editor.world!);
}

function finishEdit(): void {
  store.editor?.dispose();
  store.editor = null;
  store.mode = 'user';
  const r = store.renderer;
  r?.setSelection(new Set());
  r?.setOverlay({ rect: null, guides: [], grid: null });
  r?.setWorld(store.published, true);
}

/** Leaves edit mode; with unsaved changes asks Save / Discard draft / Stay (spec §4.7). */
export function leaveEdit(): void {
  const ed = store.editor;
  if (!ed) return;
  if (!ed.dirty) return finishEdit();
  store.dialog = {
    title: t('dialog.leaveTitle'),
    text: t('dialog.leaveText'),
    buttons: [
      { label: t('dialog.leaveStay'), action: () => {} },
      {
        label: t('dialog.leaveDiscard'),
        kind: 'danger',
        action: async () => {
          await ed.discard();
          finishEdit();
        },
      },
      {
        label: t('dialog.leaveSave'),
        kind: 'primary',
        action: async () => {
          if (await ed.save()) finishEdit();
        },
      },
    ],
  };
}

export function toggleEdit(): void {
  if (store.editor) leaveEdit();
  else enterEdit();
}

export function goHome(): void {
  store.renderer?.setCamera(store.home, 450);
}

/** App actions from shortcuts and the core (spec §7.3, §14). */
export function runAction(action: string): void {
  const ed = store.editor;
  switch (action) {
    case 'editMode':
      toggleEdit();
      break;
    case 'save':
      if (ed) void ed.save();
      break;
    case 'homeView':
      goHome();
      break;
    case 'toggleApp':
      void store.core.hideMain();
      break;
    case 'stopScripts':
      void store.core.stopAllScripts();
      break;
  }
}

function typing(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/** In-app keyboard shortcuts. */
export function handleKey(e: KeyboardEvent): void {
  if (store.dialog) return;
  const ctrl = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (ctrl && key === 'e') {
    e.preventDefault();
    return runAction('editMode');
  }
  if (ctrl && key === 's') {
    e.preventDefault();
    return runAction('save');
  }
  if (typing(e)) return;
  if (e.key === 'Home') return runAction('homeView');
  if (e.key === 'Escape') {
    if (store.settingsOpen) store.settingsOpen = false;
    else if (store.viewMenuOpen) store.viewMenuOpen = false;
    else if (store.editor?.menu) store.editor.menu = null;
    else if (store.editor?.selection.ids.size) store.editor.select([]);
    return;
  }
  const ed = store.editor;
  if (!ed) return;
  if (ctrl && key === 'z' && !e.shiftKey) {
    e.preventDefault();
    ed.undo();
  } else if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) {
    e.preventDefault();
    ed.redo();
  } else if (ctrl && key === 'c') {
    ed.copy();
  } else if (ctrl && key === 'v') {
    ed.paste();
  } else if (ctrl && key === 'd') {
    e.preventDefault();
    ed.duplicate();
  } else if (ctrl && key === 'a') {
    e.preventDefault();
    ed.selectAll();
  } else if (e.key === 'Delete') {
    ed.deleteSelected();
  }
}
