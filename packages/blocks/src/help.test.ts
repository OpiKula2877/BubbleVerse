import { describe, expect, it } from 'vitest';
import { blockHelp } from './help';

describe('block help', () => {
  it('explains a block with numbered inputs', () => {
    const h = blockHelp('sys_open_url', 'en')!;
    expect(h.title).toBe('open URL ① in browser ②');
    expect(h.text).toMatch(/web page/);
    expect(h.inputs.map((i) => [i.n, i.name])).toEqual([
      [1, 'URL'],
      [2, 'BROWSER'],
    ]);
    expect(h.inputs[0]!.hint).toMatch(/example\.com/);
    // Text inputs take a typed value or a round block.
    expect(h.inputs[0]!.kind).toBe('value');
    expect(h.inputs[0]!.fits.length).toBeGreaterThan(3);
    expect(h.inputs[0]!.fits.flatMap((f) => f.blocks)).toContain('clipboard text');
  });

  it('offers only pointed blocks for conditions', () => {
    const h = blockHelp('ctl_if', 'cs')!;
    const cond = h.inputs.find((i) => i.name === 'COND')!;
    expect(cond.kind).toBe('condition');
    const names = cond.fits.flatMap((f) => f.blocks);
    expect(names).toContain('je připojen internet?');
    expect(names).not.toContain('text ze schránky');
    expect(h.inputs.find((i) => i.name === 'DO')!.kind).toBe('stack');
  });

  it('lists menu choices and marks dangerous blocks', () => {
    const h = blockHelp('sys_power', 'en')!;
    expect(h.danger).toBe(true);
    const menu = h.inputs.find((i) => i.name === 'ACTION')!;
    expect(menu.kind).toBe('menu');
    expect(menu.options).toEqual(['sleep', 'restart', 'shut down']);
    expect(menu.fits).toEqual([]);
  });

  it('is null for unknown blocks', () => {
    expect(blockHelp('nope', 'en')).toBeNull();
  });
});
