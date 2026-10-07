import { describe, expect, it } from 'vitest';
import {
  comboFromEvent,
  eventMatches,
  findCollisions,
  normalizeCombo,
  parseCombo,
} from './shortcuts';

const ev = (
  key: string,
  code: string,
  mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {},
) => ({
  key,
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe('shortcuts', () => {
  it('parses and normalizes combos', () => {
    expect(parseCombo('ctrl+alt+b')).toEqual({
      ctrl: true,
      alt: true,
      shift: false,
      win: false,
      key: 'B',
    });
    expect(normalizeCombo('shift + ctrl + alt + s')).toBe('Ctrl+Alt+Shift+S');
    expect(normalizeCombo('alt+space')).toBe('Alt+Space');
    expect(normalizeCombo('Home')).toBe('Home');
    expect(normalizeCombo('Ctrl++')).toBe('Ctrl+Plus');
    expect(normalizeCombo('win+f12')).toBe('Win+F12');
    expect(normalizeCombo('Ctrl+Alt')).toBeNull();
    expect(normalizeCombo('Ctrl+A+B')).toBeNull();
    expect(normalizeCombo('Ctrl+Nope')).toBeNull();
  });

  it('reads combos from keyboard events, also on a Czech layout', () => {
    expect(comboFromEvent(ev('f', 'KeyF', { ctrlKey: true }))).toBe('Ctrl+F');
    // On a Czech layout the "2" key types "ě".
    expect(comboFromEvent(ev('ě', 'Digit2', { ctrlKey: true }))).toBe('Ctrl+2');
    expect(comboFromEvent(ev(' ', 'Space', { altKey: true }))).toBe('Alt+Space');
    expect(comboFromEvent(ev('Control', 'ControlLeft', { ctrlKey: true }))).toBeNull();
    expect(
      eventMatches(
        ev('S', 'KeyS', { ctrlKey: true, altKey: true, shiftKey: true }),
        'Ctrl+Alt+Shift+S',
      ),
    ).toBe(true);
  });

  it('finds collisions between shortcuts and with Windows', () => {
    const c = findCollisions([
      { id: 'a', combo: 'Ctrl+Alt+B', scope: 'global' },
      { id: 'b', combo: 'ctrl+alt+b', scope: 'app' },
      { id: 'c', combo: 'Alt+Space', scope: 'global' },
      { id: 'd', combo: 'Win+L', scope: 'global' },
    ]);
    expect(c).toContainEqual({ id: 'a', with: 'b', combo: 'Ctrl+Alt+B' });
    expect(c).toContainEqual({ id: 'c', with: 'windows', combo: 'Alt+Space' });
    expect(c).toContainEqual({ id: 'd', with: 'windows', combo: 'Win+L', reserved: true });
  });
});
