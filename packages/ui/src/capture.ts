import { getCore } from './core/index';
import { MODIFIER_NAMES, eventKey, formatCombo, type Combo } from './shortcuts';

/**
 * Typing a new shortcut (settings and the "when ... is pressed" block). In the app the core's
 * keyboard hook takes every key meanwhile, so `Alt+Space`, `Win` and the like reach neither
 * Windows nor other apps. Resolves with the combo once all keys are released, or null (Esc
 * alone, cancelled, 30 s without keys).
 */
export function captureCombo(): Promise<string | null> {
  const core = getCore();
  if (!core.isTauri) return captureInPage();
  // The page listens too: if Windows ever dropped the core's hook, the keys reach the page and
  // the capture still ends (keys the hook takes never reach the page, so only one answers).
  return new Promise((resolve) => {
    let done = false;
    const finish = (combo: string | null, from: 'core' | 'page') => {
      if (done) return;
      done = true;
      if (from === 'page') void core.call('cancel_capture').catch(() => undefined);
      else pageCancel?.();
      resolve(combo);
    };
    void core
      .call<string | null>('capture_combo')
      .catch(() => null)
      .then((c) => finish(c, 'core'));
    void captureInPage().then((c) => finish(c, 'page'));
  });
}

/** Stops a running capture (a click elsewhere); its promise resolves with null. */
export function cancelCapture(): void {
  const core = getCore();
  if (core.isTauri) void core.call('cancel_capture').catch(() => undefined);
  pageCancel?.();
}

let pageCancel: (() => void) | null = null;

/** Browser preview: the same rules from the page's own key events. */
function captureInPage(): Promise<string | null> {
  pageCancel?.();
  return new Promise((resolve) => {
    const combo: Combo = { ctrl: false, alt: false, shift: false, win: false, keys: [] };
    const held = new Set<string>();
    const finish = (text: string | null) => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      pageCancel = null;
      resolve(text);
    };
    const name = (e: KeyboardEvent) => MODIFIER_NAMES[e.key] ?? eventKey(e) ?? e.code;
    const down = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      const n = name(e);
      held.add(n);
      const mod = MODIFIER_NAMES[e.key];
      if (mod) combo[mod] = true;
      else if (eventKey(e) && !combo.keys.includes(n)) combo.keys.push(n);
    };
    const up = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!held.delete(name(e)) || held.size) return;
      const loneEsc =
        !combo.ctrl && !combo.alt && !combo.shift && !combo.win && combo.keys.join() === 'Esc';
      finish(loneEsc ? null : formatCombo(combo));
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    pageCancel = () => finish(null);
  });
}
