import { describe, expect, it } from 'vitest';
import { OP } from './generated/catalog';
import { macroToNodes, type MacroEvent } from './macro';

function key(
  t: number,
  k: string,
  o: Partial<Extract<MacroEvent, { kind: 'key' }>> = {},
): MacroEvent {
  return {
    kind: 'key',
    t,
    key: k,
    down: true,
    ctrl: false,
    alt: false,
    shift: false,
    win: false,
    modifier: false,
    text: k.length === 1 ? k.toLowerCase() : null,
    dead: false,
    ...o,
  };
}

function click(t: number, x: number, y: number, button: 'left' | 'right' = 'left'): MacroEvent[] {
  return [
    { kind: 'button', t, button, down: true, x, y },
    { kind: 'button', t: t + 60, button, down: false, x, y },
  ];
}

describe('macro recording to blocks', () => {
  it('merges typed keys into one type block and skips key-ups and modifiers', () => {
    const nodes = macroToNodes([
      key(0, 'Shift', { modifier: true, text: null }),
      key(10, 'H', { shift: true, text: 'H' }),
      key(80, 'H', { down: false, text: null }),
      key(150, 'I'),
      key(300, 'Space', { text: ' ' }),
      key(400, '2', { text: 'ě' }),
    ]);
    expect(nodes).toEqual([[OP.in_type, 'Hi ě', 30]]);
  });

  it('turns shortcuts and keys without text into press blocks', () => {
    const nodes = macroToNodes([
      key(0, 'A', { text: 'a' }),
      key(100, 'C', { ctrl: true, text: null }),
      key(200, 'Enter', { text: null }),
      key(300, 'S', { ctrl: true, shift: true, alt: true, win: true, text: null }),
    ]);
    expect(nodes).toEqual([
      [OP.in_type, 'a', 30],
      [OP.in_press, 'Ctrl+C'],
      [OP.in_press, 'Enter'],
      [OP.in_press, 'Ctrl+Alt+Shift+Win+S'],
    ]);
  });

  it('keeps text typed with AltGr (Ctrl+Alt) as text', () => {
    expect(macroToNodes([key(0, 'V', { ctrl: true, alt: true, text: '@' })])).toEqual([
      [OP.in_type, '@', 30],
    ]);
  });

  it('presses a dead key and the key after it so the accent is composed again', () => {
    const nodes = macroToNodes([
      key(0, 'Oem2', { shift: true, text: null, dead: true }),
      key(100, 'C', { text: 'c' }),
      key(200, 'A', { text: 'a' }),
    ]);
    expect(nodes).toEqual([
      [OP.in_press, 'Shift+Oem2'],
      [OP.in_press, 'C'],
      [OP.in_type, 'a', 30],
    ]);
  });

  it('adds wait blocks for pauses from 0.4 s, rounded to tenths', () => {
    const nodes = macroToNodes([
      key(0, 'A', { text: 'a' }),
      key(300, 'B', { text: 'b' }),
      key(1560, 'C', { text: 'c' }),
      key(1700, 'Enter', { text: null }),
    ]);
    expect(nodes).toEqual([
      [OP.in_type, 'ab', 30],
      [OP.ctl_wait, 1.3, 's'],
      [OP.in_type, 'c', 30],
      [OP.in_press, 'Enter'],
    ]);
  });

  it('records clicks at the press position and joins quick double clicks', () => {
    const nodes = macroToNodes([
      ...click(0, 100, 200),
      ...click(250, 102, 201),
      ...click(2000, 50, 60, 'right'),
    ]);
    expect(nodes).toEqual([
      [OP.in_dblclick, 100, 200],
      [OP.ctl_wait, 1.7, 's'],
      [OP.in_click, 'right', 50, 60],
    ]);
  });

  it('sums wheel turns in a row and records a drag as a click', () => {
    const nodes = macroToNodes([
      { kind: 'wheel', t: 0, notches: -1 },
      { kind: 'wheel', t: 50, notches: -1 },
      { kind: 'wheel', t: 90, notches: -1 },
      { kind: 'button', t: 200, button: 'left', down: true, x: 10, y: 10 },
      { kind: 'button', t: 350, button: 'left', down: false, x: 300, y: 10 },
    ]);
    expect(nodes).toEqual([
      [OP.in_wheel, -3],
      [OP.in_click, 'left', 10, 10],
    ]);
  });

  it('returns nothing for an empty recording', () => {
    expect(macroToNodes([])).toEqual([]);
  });
});
