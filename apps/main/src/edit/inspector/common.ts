import {
  commonValue,
  mapBubbles,
  type Bubble,
  type BubbleId,
  type Skin,
  type World,
} from '@bv/world';
import type { Editor } from '../../lib/editor.svelte';

export interface Common<T> {
  value: T;
  mixed: boolean;
}

/** Common value of a bubble field across the selection ("—" when different, spec §4.1). */
export function commonField<T>(
  world: World,
  ids: readonly BubbleId[],
  get: (b: Bubble) => T,
): Common<T> | null {
  let first: { v: T; k: string } | null = null;
  let mixed = false;
  const set = new Set(ids);
  for (const b of world.bubbles) {
    if (!set.has(b.id)) continue;
    const v = get(b);
    const k = JSON.stringify(v ?? null);
    if (!first) first = { v, k };
    else if (k !== first.k) mixed = true;
  }
  return first ? { value: first.v, mixed } : null;
}

export function commonSkin<T>(
  world: World,
  ids: readonly BubbleId[],
  get: (s: Skin) => T,
): Common<T> | null {
  const r = commonValue(world, ids, get);
  return r ? { value: r.value, mixed: r.mixed } : null;
}

/** Writes a change to every selected bubble as one undo step (merged while typing). */
export function update(editor: Editor, fn: (b: Bubble) => Bubble, key?: string): void {
  const ids = editor.selected;
  editor.apply((w) => mapBubbles(w, ids, fn), key ? `${key}:${ids.join(',')}` : undefined);
}
