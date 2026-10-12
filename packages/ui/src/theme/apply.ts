import { TOKENS, cssVar, type ThemeColors } from './tokens';

export interface AppearanceVars {
  font: string;
  radius: number;
  panelOpacity: number;
  uiScale: number;
}

/** Writes theme colors and appearance options as CSS variables on the document root. */
export function applyTheme(colors: ThemeColors, look: AppearanceVars, root?: HTMLElement): void {
  const el = root ?? document.documentElement;
  for (const token of TOKENS) el.style.setProperty(cssVar(token), colors[token]);
  el.style.setProperty('--bv-font', look.font);
  el.style.setProperty('--bv-radius', `${look.radius}px`);
  el.style.setProperty('--bv-panel-alpha', String(look.panelOpacity));
  el.style.setProperty('--bv-ui-scale', String(look.uiScale / 100));
}

/** `#RRGGBB[AA]` → 0xRRGGBB number and alpha 0..1 (for the PixiJS canvas). */
export function hexToRgb(hex: string): { color: number; alpha: number } {
  const h = hex.replace('#', '');
  const color = parseInt(h.slice(0, 6), 16) || 0;
  const alpha = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { color, alpha };
}
