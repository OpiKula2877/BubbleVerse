import { describe, expect, it } from 'vitest';
import { dictionary, interpolate, translate } from './translate';

describe('i18n', () => {
  it('Czech has exactly the same keys as English', () => {
    const en = Object.keys(dictionary('en')).sort();
    const cs = Object.keys(dictionary('cs')).sort();
    expect(cs.filter((k) => !en.includes(k))).toEqual([]);
    expect(en.filter((k) => !cs.includes(k))).toEqual([]);
  });

  it('keeps the same placeholders in both languages', () => {
    const en = dictionary('en');
    const cs = dictionary('cs');
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en)) {
      expect(names(cs[key] ?? ''), key).toEqual(names(en[key] ?? ''));
    }
  });

  it('interpolates params and leaves unknown placeholders', () => {
    expect(interpolate('Hi {name}, {x}', { name: 'Ann' })).toBe('Hi Ann, {x}');
  });

  it('falls back to English, then to the key', () => {
    expect(translate('cs', 'app.name')).toBe('BubbleVerse');
    expect(translate('en', 'no.such.key')).toBe('no.such.key');
  });
});
