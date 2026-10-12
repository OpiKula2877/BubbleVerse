import type { ScriptNode } from '@bv/world';
import { OP } from './generated/catalog';

/**
 * Turning a recorded macro into blocks (spec §5.1 "Record macro"). Typed text becomes one
 * `type` block, other keys `press` blocks, clicks `click` blocks and pauses `wait` blocks.
 */

/** A recorded key, click or wheel turn, as the core sends it. Times are in milliseconds. */
export type MacroEvent =
  | {
      kind: 'key';
      t: number;
      /** Key name for `press` blocks (`A`, `Enter`, `Oem2`…). */
      key: string;
      down: boolean;
      ctrl: boolean;
      alt: boolean;
      shift: boolean;
      win: boolean;
      /** Shift, Ctrl, Alt or Win itself. */
      modifier: boolean;
      /** The text the key types, if any. */
      text: string | null;
      /** An accent key that changes the next key. */
      dead: boolean;
    }
  | {
      kind: 'button';
      t: number;
      button: 'left' | 'right' | 'middle';
      down: boolean;
      x: number;
      y: number;
    }
  | { kind: 'wheel'; t: number; notches: number };

export interface MacroOptions {
  /** Shorter pauses are left out (seconds). */
  minPause: number;
  /** Typing speed of `type` blocks (characters per second). */
  cps: number;
}

const DEFAULTS: MacroOptions = { minPause: 0.4, cps: 30 };
/** Two clicks this close in time and space are a double click. */
const DOUBLE_CLICK_MS = 500;
const DOUBLE_CLICK_PX = 4;
/** Wheel turns this close together are one block. */
const WHEEL_JOIN_MS = 300;

type KeyEvent = Extract<MacroEvent, { kind: 'key' }>;

function combo(e: KeyEvent): string {
  const parts: string[] = [];
  if (e.ctrl) parts.push('Ctrl');
  if (e.alt) parts.push('Alt');
  if (e.shift) parts.push('Shift');
  if (e.win) parts.push('Win');
  parts.push(e.key);
  return parts.join('+');
}

/** Text keys: no shortcut modifiers held, except Ctrl+Alt together (AltGr). */
function typesText(e: KeyEvent): boolean {
  const altGr = e.ctrl && e.alt;
  return !!e.text && !e.win && (altGr || (!e.ctrl && !e.alt));
}

export function macroToNodes(
  events: readonly MacroEvent[],
  options: Partial<MacroOptions> = {},
): ScriptNode[] {
  const o = { ...DEFAULTS, ...options };
  const nodes: ScriptNode[] = [];
  let text = '';
  /** End of the last recorded action. */
  let last: number | null = null;
  let afterDead = false;
  let lastClick: { button: string; x: number; y: number; up: number; index: number } | null = null;
  let lastWheel: { t: number; index: number } | null = null;
  let pressed: Extract<MacroEvent, { kind: 'button' }> | null = null;

  const flushText = () => {
    if (text) nodes.push([OP.in_type, text, o.cps]);
    text = '';
  };
  /** Adds a wait block when the pause before an action at time `t` is long enough. */
  const pause = (t: number) => {
    if (last === null) return;
    const seconds = Math.round((t - last) / 100) / 10;
    if (seconds >= o.minPause) {
      flushText();
      nodes.push([OP.ctl_wait, seconds, 's']);
    }
  };

  for (const e of events) {
    if (e.kind === 'key') {
      if (!e.down || e.modifier) continue;
      pause(e.t);
      if (typesText(e) && !afterDead) {
        text += e.text;
      } else {
        flushText();
        nodes.push([OP.in_press, combo(e)]);
      }
      afterDead = e.dead;
      last = e.t;
      lastClick = null;
      lastWheel = null;
    } else if (e.kind === 'button') {
      if (e.down) {
        pressed = e;
        continue;
      }
      const down = pressed && pressed.button === e.button ? pressed : e;
      pressed = null;
      const prev = lastClick;
      const double =
        prev !== null &&
        e.button === 'left' &&
        prev.button === 'left' &&
        prev.index === nodes.length - 1 &&
        down.t - prev.up <= DOUBLE_CLICK_MS &&
        Math.abs(down.x - prev.x) <= DOUBLE_CLICK_PX &&
        Math.abs(down.y - prev.y) <= DOUBLE_CLICK_PX;
      if (double && prev) {
        nodes[prev.index] = [OP.in_dblclick, prev.x, prev.y];
        lastClick = null;
      } else {
        pause(down.t);
        flushText();
        nodes.push([OP.in_click, e.button, down.x, down.y]);
        lastClick = { button: e.button, x: down.x, y: down.y, up: e.t, index: nodes.length - 1 };
      }
      last = e.t;
      lastWheel = null;
    } else {
      const prev = lastWheel ? nodes[lastWheel.index] : null;
      if (
        lastWheel &&
        prev &&
        e.t - lastWheel.t <= WHEEL_JOIN_MS &&
        Math.sign(Number(prev[1])) === Math.sign(e.notches)
      ) {
        nodes[lastWheel.index] = [OP.in_wheel, Number(prev[1]) + e.notches];
        lastWheel.t = e.t;
      } else {
        pause(e.t);
        flushText();
        nodes.push([OP.in_wheel, e.notches]);
        lastWheel = { t: e.t, index: nodes.length - 1 };
      }
      last = e.t;
      lastClick = null;
    }
  }
  flushText();
  return nodes;
}
