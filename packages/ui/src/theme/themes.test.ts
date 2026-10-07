import { describe, expect, it } from 'vitest';
import { hexToRgb } from './apply';
import { BUILTIN_THEMES, themeColors } from './themes';
import { HEX_COLOR, TOKENS } from './tokens';

describe('themes', () => {
  for (const [id, colors] of Object.entries(BUILTIN_THEMES)) {
    it(`${id} defines every token with a valid hex color`, () => {
      for (const token of TOKENS) expect(colors[token], token).toMatch(HEX_COLOR);
      expect(Object.keys(colors).sort()).toEqual([...TOKENS].sort());
    });
  }

  it('OpiKula style uses the palette from the spec', () => {
    const c = BUILTIN_THEMES.opikula;
    expect([c.bg, c.panel, c.accent, c['button-hover'], c.text]).toEqual([
      '#0B0B0D',
      '#1A1A1F',
      '#D7192A',
      '#7A0E14',
      '#F2F2F2',
    ]);
  });

  it('custom theme overrides tokens on top of dark', () => {
    const c = themeColors('custom', { accent: '#00FF00' });
    expect(c.accent).toBe('#00FF00');
    expect(c.bg).toBe(BUILTIN_THEMES.dark.bg);
  });

  it('converts hex to pixi color and alpha', () => {
    expect(hexToRgb('#FF0000')).toEqual({ color: 0xff0000, alpha: 1 });
    expect(hexToRgb('#00000080').alpha).toBeCloseTo(128 / 255);
  });
});
