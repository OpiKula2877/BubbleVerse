/** All color tokens of the UI (spec §7.2). Each becomes the CSS variable `--bv-<token>`. */
export const TOKENS = [
  'bg',
  'panel',
  'bar',
  'dialog',
  'text',
  'text-2',
  'text-muted',
  'accent',
  'accent-text',
  'border',
  'input',
  'input-border',
  'button',
  'button-hover',
  'button-active',
  'button-text',
  'search-dim',
  'ghost',
  'red-path',
  'selection',
  'grid',
  'guide',
  'highlight',
  'error',
  'warning',
  'success',
  'tooltip',
  'tooltip-text',
  'scrollbar',
] as const;

export type Token = (typeof TOKENS)[number];
export type ThemeColors = Record<Token, string>;
export type ThemeId = 'light' | 'dark' | 'opikula' | 'custom';

export const HEX_COLOR = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

export function cssVar(token: Token): string {
  return `--bv-${token}`;
}
