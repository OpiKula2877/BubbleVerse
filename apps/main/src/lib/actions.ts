import { ComboTracker, comboId, parseCombo, t } from '@bv/ui';
import { Editor } from './editor.svelte';
import { search } from '../search/search.svelte';
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
  store.cameraTouched = false;
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

/** Home: back to the camera that shows every bubble, or to the saved home view. */
export function goHome(): void {
  store.cameraTouched = false;
  if (store.settings.view.camera === 'home' || store.editor)
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
    case 'search':
      void search.start();
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
  return (
    !!el &&
    (el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' ||
      el.isContentEditable)
  );
}

/** Keys held in the window, for shortcuts like `T+L+P` or `Ctrl` alone. */
const tracker = new ComboTracker();

/** The app action whose configured shortcut a pressed combo is (spec §7.3). */
function shortcutAction(pressed: string | null): string | null {
  if (!pressed) return null;
  const id = comboId(pressed);
  for (const s of store.settings.shortcuts) {
    // Shortcuts that the core hook catches never reach the window, except in the browser preview.
    const viaHook = store.core.isTauri && (s.scope === 'global' || s.overrideWindows);
    if (!viaHook && comboId(s.combo) === id) return s.action;
  }
  return null;
}

/** Shortcuts without Ctrl, Alt or Win (like Home or T+L+P) would break typing in text fields. */
function plainCombo(pressed: string): boolean {
  const c = parseCombo(pressed);
  return !c || (!c.ctrl && !c.alt && !c.win);
}

/** Key releases end taps of modifiers alone (`Ctrl` as a shortcut). */
export function handleKeyUp(e: KeyboardEvent): void {
  const pressed = tracker.up(e);
  if (store.dialog || !pressed) return;
  const action = shortcutAction(pressed);
  if (action && !(plainCombo(pressed) && typing(e)) && !(search.open && action !== 'search'))
    runAction(action);
}

/** The window lost the keyboard: keys held now are released elsewhere. */
export function resetKeys(): void {
  tracker.reset();
}

export function handleKey(e: KeyboardEvent): void {
  const pressed = tracker.down(e);
  if (store.dialog) return;
  const ctrl = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  const action = shortcutAction(pressed);
  if (
    action &&
    !(pressed && plainCombo(pressed) && typing(e)) &&
    !(search.open && action !== 'search')
  ) {
    e.preventDefault();
    return runAction(action);
  }
  if (search.open || typing(e)) return;
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
