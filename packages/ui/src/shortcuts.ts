/** Keyboard shortcuts: parsing, formatting, matching and collisions (spec §7.3). */

/**
 * A shortcut: modifiers plus other keys held together, like `Ctrl+Alt+B`, `T+L+P`, or a
 * modifier alone (`Ctrl`), which fires when it is pressed and released with nothing else.
 */
export interface Combo {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  win: boolean;
  /** Canonical key names in press order: `A`–`Z`, `0`–`9`, `F1`–`F24`, `Space`, `Num5`… */
  keys: string[];
}

const NAMED = new Map<string, string>(
  [
    'Space',
    'Enter',
    'Tab',
    'Esc',
    'Backspace',
    'Delete',
    'Insert',
    'Home',
    'End',
    'PageUp',
    'PageDown',
    'Left',
    'Up',
    'Right',
    'Down',
    'PrintScreen',
    'Pause',
    'Comma',
    'Period',
    'Minus',
    'Plus',
    'CapsLock',
    'NumLock',
    'ScrollLock',
    'Apps',
    'VolumeMute',
    'VolumeDown',
    'VolumeUp',
    'MediaNext',
    'MediaPrev',
    'MediaStop',
    'MediaPlayPause',
    'NumMultiply',
    'NumAdd',
    'NumSubtract',
    'NumDecimal',
    'NumDivide',
    'Oem1',
    'Oem2',
    'Oem3',
    'Oem4',
    'Oem5',
    'Oem6',
    'Oem7',
    'Oem8',
    'Oem102',
  ].map((k) => [k.toLowerCase(), k]),
);

const ALIASES: Record<string, string> = {
  escape: 'Esc',
  del: 'Delete',
  ins: 'Insert',
  return: 'Enter',
  pgup: 'PageUp',
  pgdn: 'PageDown',
  arrowleft: 'Left',
  arrowup: 'Up',
  arrowright: 'Right',
  arrowdown: 'Down',
  printscr: 'PrintScreen',
  ' ': 'Space',
};

/** Canonical key name, or null when the name is unknown. */
export function keyName(raw: string): string | null {
  if (raw === ' ') return 'Space';
  const k = raw.trim();
  if (/^[a-z]$/i.test(k)) return k.toUpperCase();
  if (/^[0-9]$/.test(k)) return k;
  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(k)) return k.toUpperCase();
  if (/^num[0-9]$/i.test(k)) return `Num${k.slice(3)}`;
  // Any other key, by its Windows key code (as the core names keys without a usual name).
  if (/^vk[0-9a-f]{2}$/i.test(k)) return `Vk${k.slice(2).toUpperCase()}`;
  const lower = k.toLowerCase();
  return ALIASES[lower] ?? NAMED.get(lower) ?? null;
}

export function parseCombo(text: string): Combo | null {
  const parts = text
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  // "Ctrl++" means the Plus key.
  if (text.trim().endsWith('++')) parts.push('Plus');
  const c: Combo = { ctrl: false, alt: false, shift: false, win: false, keys: [] };
  for (const p of parts) {
    const l = p.toLowerCase();
    if (l === 'ctrl' || l === 'control') c.ctrl = true;
    else if (l === 'alt') c.alt = true;
    else if (l === 'shift') c.shift = true;
    else if (l === 'win' || l === 'meta' || l === 'super') c.win = true;
    else {
      const k = keyName(p);
      if (!k) return null;
      if (!c.keys.includes(k)) c.keys.push(k);
    }
  }
  return c.keys.length || hasModifier(c) ? c : null;
}

function hasModifier(c: Combo): boolean {
  return c.ctrl || c.alt || c.shift || c.win;
}

export function formatCombo(c: Combo): string {
  return [c.ctrl && 'Ctrl', c.alt && 'Alt', c.shift && 'Shift', c.win && 'Win', ...c.keys]
    .filter(Boolean)
    .join('+');
}

/** Identity of a combo for comparing: keys held together match in any order. */
export function comboId(text: string): string | null {
  const c = parseCombo(text);
  return c ? formatCombo({ ...c, keys: [...c.keys].sort() }) : null;
}

/** Normalizes a combo text (e.g. `alt+space` → `Alt+Space`); null when invalid. */
export function normalizeCombo(text: string): string | null {
  const c = parseCombo(text);
  return c ? formatCombo(c) : null;
}

const CODE_KEYS: Record<string, string> = {
  Comma: 'Comma',
  Period: 'Period',
  Minus: 'Minus',
  Equal: 'Plus',
  NumpadAdd: 'Plus',
  NumpadSubtract: 'Minus',
};

type KeyEventLike = Pick<
  KeyboardEvent,
  'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'
>;

/** `KeyboardEvent.key` of modifier keys and the combo flag each one sets. */
export const MODIFIER_NAMES: Record<string, 'ctrl' | 'alt' | 'shift' | 'win'> = {
  Control: 'ctrl',
  Alt: 'alt',
  AltGraph: 'alt',
  Shift: 'shift',
  Meta: 'win',
  OS: 'win',
};

/** Canonical name of the key of an event; null for modifiers and unknown keys. */
export function eventKey(e: Pick<KeyboardEvent, 'key' | 'code'>): string | null {
  if (e.code.startsWith('Digit')) return e.code.slice(5);
  if (/^Numpad[0-9]$/.test(e.code)) return `Num${e.code.slice(6)}`;
  if (CODE_KEYS[e.code]) return CODE_KEYS[e.code]!;
  // Letters by position, so other layouts (and Shift) give the same name.
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  if (MODIFIER_NAMES[e.key]) return null;
  return keyName(e.key);
}

/** Combo pressed in a keyboard event (one key and the modifiers); null for modifiers. */
export function comboFromEvent(e: KeyEventLike): string | null {
  const key = eventKey(e);
  if (!key) return null;
  return formatCombo({
    ctrl: e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
    win: e.metaKey,
    keys: [key],
  });
}

/**
 * Follows the keys held in a window to report combos the way the core's keyboard hook does:
 * keys held together (`T+L+P`) on the key-down that completes them, and a tap of modifiers
 * alone (`Ctrl`) on the first release.
 */
export class ComboTracker {
  private held: string[] = [];
  private tap: { mods: Set<'ctrl' | 'alt' | 'shift' | 'win'>; clean: boolean } | null = null;

  /** A key went down; returns the combo it completes. */
  down(e: KeyEventLike & { repeat?: boolean }): string | null {
    const mod = MODIFIER_NAMES[e.key];
    if (mod) {
      if (!this.tap) this.tap = { mods: new Set(), clean: this.held.length === 0 };
      this.tap.mods.add(mod);
      return null;
    }
    if (this.tap) this.tap.clean = false;
    const key = eventKey(e);
    if (!key || e.repeat) return null;
    if (!this.held.includes(key)) this.held.push(key);
    return formatCombo({
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      win: e.metaKey,
      keys: [...this.held],
    });
  }

  /** A key went up; returns a modifier-only combo when it ends a clean tap. */
  up(e: KeyEventLike): string | null {
    const mod = MODIFIER_NAMES[e.key];
    if (!mod) {
      const key = eventKey(e);
      this.held = this.held.filter((k) => k !== key);
      return null;
    }
    const tap = this.tap;
    let out: string | null = null;
    if (tap?.clean) {
      tap.clean = false;
      out = formatCombo({
        ctrl: tap.mods.has('ctrl'),
        alt: tap.mods.has('alt'),
        shift: tap.mods.has('shift'),
        win: tap.mods.has('win'),
        keys: [],
      });
    }
    // The flags of the release event still count the modifiers held after it.
    const others =
      (mod !== 'ctrl' && e.ctrlKey) ||
      (mod !== 'alt' && e.altKey) ||
      (mod !== 'shift' && e.shiftKey) ||
      (mod !== 'win' && e.metaKey);
    if (!others) this.tap = null;
    return out;
  }

  /** Forgets everything (the window lost the keyboard). */
  reset(): void {
    this.held = [];
    this.tap = null;
  }
}

/** System shortcuts of Windows that a shortcut may collide with. */
export const WINDOWS_SHORTCUTS = [
  'Alt+Tab',
  'Alt+F4',
  'Alt+Space',
  'Alt+Esc',
  'Ctrl+Esc',
  'Ctrl+Shift+Esc',
  'Ctrl+Alt+Delete',
  'Win+L',
  'Win+D',
  'Win+E',
  'Win+R',
  'Win+I',
  'Win+S',
  'Win+A',
  'Win+V',
  'Win+X',
  'Win+Tab',
  'Win+Shift+S',
  'PrintScreen',
];

/** Windows never lets anyone take these (spec §7.3). */
export const RESERVED_SHORTCUTS = ['Ctrl+Alt+Delete', 'Win+L'];

export interface ShortcutEntry {
  id: string;
  combo: string;
  scope: 'app' | 'global';
}

export interface Collision {
  id: string;
  /** Another shortcut id, or `windows` for a Windows system shortcut. */
  with: string;
  combo: string;
  reserved?: boolean;
}

/**
 * Collisions between shortcuts (any two with the same combo; an in-app shortcut and a global
 * one collide while BubbleVerse is in front) and with Windows shortcuts.
 */
export function findCollisions(entries: readonly ShortcutEntry[]): Collision[] {
  const out: Collision[] = [];
  const norm = entries.map((e) => ({ ...e, n: normalizeCombo(e.combo), id2: comboId(e.combo) }));
  for (let i = 0; i < norm.length; i++) {
    const a = norm[i]!;
    if (!a.n) continue;
    for (let j = 0; j < norm.length; j++) {
      const b = norm[j]!;
      if (i !== j && b.id2 === a.id2) out.push({ id: a.id, with: b.id, combo: a.n });
    }
    if (RESERVED_SHORTCUTS.includes(a.n))
      out.push({ id: a.id, with: 'windows', combo: a.n, reserved: true });
    else if (WINDOWS_SHORTCUTS.includes(a.n)) out.push({ id: a.id, with: 'windows', combo: a.n });
  }
  return out;
}
