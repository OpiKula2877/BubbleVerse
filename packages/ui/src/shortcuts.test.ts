import { describe, expect, it } from 'vitest';
import {
  comboFromEvent,
  ComboTracker,
  comboId,
  findCollisions,
  normalizeCombo,
  parseCombo,
} from './shortcuts';

const ev = (
  key: string,
  code: string,
  mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'repeat', boolean>> = {},
) => ({
  key,
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  repeat: false,
  ...mods,
});

describe('shortcuts', () => {
  it('parses and normalizes combos', () => {
    expect(parseCombo('ctrl+alt+b')).toEqual({
      ctrl: true,
      alt: true,
      shift: false,
      win: false,
      keys: ['B'],
    });
    expect(normalizeCombo('shift + ctrl + alt + s')).toBe('Ctrl+Alt+Shift+S');
    expect(normalizeCombo('alt+space')).toBe('Alt+Space');
    expect(normalizeCombo('Home')).toBe('Home');
    expect(normalizeCombo('Ctrl++')).toBe('Ctrl+Plus');
    expect(normalizeCombo('win+f12')).toBe('Win+F12');
    expect(normalizeCombo('Ctrl+Nope')).toBeNull();
    expect(normalizeCombo('')).toBeNull();
    // Names the core reports for any key.
    expect(normalizeCombo('oem1+capslock+vk07')).toBe('Oem1+CapsLock+Vk07');
  });

  it('accepts modifiers alone and keys held together', () => {
    expect(normalizeCombo('ctrl')).toBe('Ctrl');
    expect(normalizeCombo('Ctrl+Alt')).toBe('Ctrl+Alt');
    // The keys keep the order they were pressed in, but the order never makes a difference.
    expect(normalizeCombo('t+l+p')).toBe('T+L+P');
    expect(normalizeCombo('Ctrl+A+B')).toBe('Ctrl+A+B');
    expect(comboId('T+L+P')).toBe(comboId('P+T+L'));
    expect(comboId('Ctrl+A')).not.toBe(comboId('A'));
  });

  it('reads combos from keyboard events, also on a Czech layout', () => {
    expect(comboFromEvent(ev('f', 'KeyF', { ctrlKey: true }))).toBe('Ctrl+F');
    // On a Czech layout the "2" key types "ě".
    expect(comboFromEvent(ev('ě', 'Digit2', { ctrlKey: true }))).toBe('Ctrl+2');
    expect(comboFromEvent(ev(' ', 'Space', { altKey: true }))).toBe('Alt+Space');
    expect(comboFromEvent(ev('Control', 'ControlLeft', { ctrlKey: true }))).toBeNull();
  });

  it('tracks keys held together and taps of modifiers', () => {
    const t = new ComboTracker();
    expect(t.down(ev('Control', 'ControlLeft', { ctrlKey: true }))).toBeNull();
    expect(t.down(ev('s', 'KeyS', { ctrlKey: true }))).toBe('Ctrl+S');
    // Held key repeating: nothing new.
    expect(t.down(ev('s', 'KeyS', { ctrlKey: true, repeat: true }))).toBeNull();
    expect(t.up(ev('s', 'KeyS', { ctrlKey: true }))).toBeNull();
    // A key was pressed with Ctrl: releasing Ctrl is no tap.
    expect(t.up(ev('Control', 'ControlLeft'))).toBeNull();

    expect(t.down(ev('t', 'KeyT'))).toBe('T');
    expect(t.down(ev('l', 'KeyL'))).toBe('T+L');
    expect(t.down(ev('p', 'KeyP'))).toBe('T+L+P');
    t.up(ev('t', 'KeyT'));
    t.up(ev('l', 'KeyL'));
    t.up(ev('p', 'KeyP'));

    t.down(ev('Control', 'ControlLeft', { ctrlKey: true }));
    t.down(ev('Shift', 'ShiftLeft', { ctrlKey: true, shiftKey: true }));
    t.up(ev('Shift', 'ShiftLeft', { ctrlKey: true }));
    expect(t.up(ev('Control', 'ControlLeft'))).toBeNull();
    // The tap is reported once, on the first release, with every modifier that was held.
    const t2 = new ComboTracker();
    t2.down(ev('Control', 'ControlLeft', { ctrlKey: true }));
    t2.down(ev('Shift', 'ShiftLeft', { ctrlKey: true, shiftKey: true }));
    expect(t2.up(ev('Shift', 'ShiftLeft', { ctrlKey: true }))).toBe('Ctrl+Shift');
    expect(t2.up(ev('Control', 'ControlLeft'))).toBeNull();
    t2.down(ev('Control', 'ControlLeft', { ctrlKey: true }));
    expect(t2.up(ev('Control', 'ControlLeft'))).toBe('Ctrl');
  });

  it('finds collisions between shortcuts and with Windows', () => {
    const c = findCollisions([
      { id: 'a', combo: 'Ctrl+Alt+B', scope: 'global' },
      { id: 'b', combo: 'ctrl+alt+b', scope: 'app' },
      { id: 'c', combo: 'Alt+Space', scope: 'global' },
      { id: 'd', combo: 'Win+L', scope: 'global' },
      { id: 'e', combo: 'T+L+P', scope: 'global' },
      { id: 'f', combo: 'P+L+T', scope: 'global' },
    ]);
    expect(c).toContainEqual({ id: 'a', with: 'b', combo: 'Ctrl+Alt+B' });
    expect(c).toContainEqual({ id: 'c', with: 'windows', combo: 'Alt+Space' });
    expect(c).toContainEqual({ id: 'd', with: 'windows', combo: 'Win+L', reserved: true });
    expect(c).toContainEqual({ id: 'e', with: 'f', combo: 'T+L+P' });
  });
});
