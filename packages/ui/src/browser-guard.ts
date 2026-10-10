/**
 * BubbleVerse windows are an app, not web pages: the browser's own context menu (Back,
 * Reload, Save as, Print) and browser shortcuts (Ctrl+P, F5, Alt+Left, find, zoom) never
 * show. The core turns them off in WebView2 too; this covers the first page load, where that
 * setting does not apply yet. Only the default action is stopped, so the app's own menus and
 * shortcuts (Blockly's included) still get every event.
 */

/** Ctrl (or Win) plus these: print, reload, view source, downloads, history, find, save as… */
const CTRL_CODES = new Set([
  'KeyP',
  'KeyR',
  'KeyU',
  'KeyJ',
  'KeyH',
  'KeyG',
  'KeyF',
  'KeyS',
  'KeyO',
  'KeyN',
  'KeyT',
  'KeyW',
  'KeyE',
  'KeyK',
  'KeyL',
  'Equal',
  'Minus',
  'Digit0',
  'NumpadAdd',
  'NumpadSubtract',
  'Numpad0',
]);

const PLAIN_CODES = new Set([
  'F3',
  'F5',
  'F7',
  'BrowserBack',
  'BrowserForward',
  'BrowserRefresh',
  'BrowserSearch',
  'BrowserHome',
]);

function isBrowserKey(e: KeyboardEvent, dev: boolean): boolean {
  if (PLAIN_CODES.has(e.code)) return true;
  // Developer tools stay reachable in development builds.
  if (!dev && (e.code === 'F12' || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyI')))
    return true;
  if (e.altKey && !e.ctrlKey && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) return true;
  return (e.ctrlKey || e.metaKey) && !e.altKey && CTRL_CODES.has(e.code);
}

export function guardBrowserUi(dev = false): void {
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (isBrowserKey(e, dev)) e.preventDefault();
  });
  // Ctrl + wheel would zoom the page.
  window.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false },
  );
}
