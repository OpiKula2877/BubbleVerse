/** Keyboard shortcuts: parsing, formatting, matching and collisions (spec §7.3). */

export interface Combo {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  win: boolean;
  /** Canonical key name: `A`–`Z`, `0`–`9`, `F1`–`F24`, `Space`, `Home`, `Num5`, `Comma`… */
  key: string;
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
  const c: Combo = { ctrl: false, alt: false, shift: false, win: false, key: '' };
  for (const p of parts) {
    const l = p.toLowerCase();
    if (l === 'ctrl' || l === 'control') c.ctrl = true;
    else if (l === 'alt') c.alt = true;
    else if (l === 'shift') c.shift = true;
    else if (l === 'win' || l === 'meta' || l === 'super') c.win = true;
    else {
      const k = keyName(p);
      if (!k || c.key) return null;
      c.key = k;
    }
  }
  return c.key ? c : null;
}

export function formatCombo(c: Combo): string {
  return [c.ctrl && 'Ctrl', c.alt && 'Alt', c.shift && 'Shift', c.win && 'Win', c.key]
    .filter(Boolean)
    .join('+');
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

/** Combo pressed in a keyboard event; null while only modifiers are held. */
export function comboFromEvent(
  e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>,
): string | null {
  let key: string | null = null;
  if (e.code.startsWith('Digit')) key = e.code.slice(5);
  else if (e.code.startsWith('Numpad') && /^Numpad[0-9]$/.test(e.code))
    key = `Num${e.code.slice(6)}`;
  else if (CODE_KEYS[e.code]) key = CODE_KEYS[e.code]!;
  else if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'OS'].includes(e.key)) return null;
  else key = keyName(e.key);
  if (!key) return null;
  return formatCombo({ ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, win: e.metaKey, key });
}

export function eventMatches(e: Parameters<typeof comboFromEvent>[0], combo: string): boolean {
  const pressed = comboFromEvent(e);
  return pressed !== null && pressed === normalizeCombo(combo);
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
  const norm = entries.map((e) => ({ ...e, n: normalizeCombo(e.combo) }));
  for (let i = 0; i < norm.length; i++) {
    const a = norm[i]!;
    if (!a.n) continue;
    for (let j = 0; j < norm.length; j++) {
      const b = norm[j]!;
      if (i !== j && b.n === a.n) out.push({ id: a.id, with: b.id, combo: a.n });
    }
    if (RESERVED_SHORTCUTS.includes(a.n))
      out.push({ id: a.id, with: 'windows', combo: a.n, reserved: true });
    else if (WINDOWS_SHORTCUTS.includes(a.n)) out.push({ id: a.id, with: 'windows', combo: a.n });
  }
  return out;
}
