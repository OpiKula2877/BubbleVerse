import type { BubbleId, Vec2 } from '../model/types';

export interface SelectionState {
  ids: ReadonlySet<BubbleId>;
  /** The bubble Shift+click ranges start from. */
  anchor: BubbleId | null;
}

export const EMPTY_SELECTION: SelectionState = { ids: new Set(), anchor: null };

export interface ClickMods {
  ctrl: boolean;
  shift: boolean;
}

/**
 * Click: select only this. Ctrl+click: toggle. Shift+click: range in tree order from the anchor.
 * `order` is the depth-first order of the tree.
 */
export function clickSelect(
  state: SelectionState,
  id: BubbleId,
  mods: ClickMods,
  order: readonly BubbleId[],
): SelectionState {
  if (mods.shift && state.anchor && order.includes(state.anchor) && order.includes(id)) {
    const a = order.indexOf(state.anchor);
    const b = order.indexOf(id);
    const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
    const ids = new Set(mods.ctrl ? [...state.ids, ...range] : range);
    return { ids, anchor: state.anchor };
  }
  if (mods.ctrl) {
    const ids = new Set(state.ids);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    return { ids, anchor: id };
  }
  return { ids: new Set([id]), anchor: id };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function normalizeRect(a: Vec2, b: Vec2): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

/** Bubbles whose circle intersects the rectangle (world coordinates). */
export function rectSelect(
  rect: Rect,
  bubbles: Iterable<{ id: BubbleId; pos: Vec2; radius: number }>,
  base: ReadonlySet<BubbleId> = new Set(),
): Set<BubbleId> {
  const out = new Set(base);
  for (const b of bubbles) {
    const cx = Math.max(rect.x, Math.min(b.pos.x, rect.x + rect.w));
    const cy = Math.max(rect.y, Math.min(b.pos.y, rect.y + rect.h));
    if (Math.hypot(b.pos.x - cx, b.pos.y - cy) <= b.radius) out.add(b.id);
  }
  return out;
}
