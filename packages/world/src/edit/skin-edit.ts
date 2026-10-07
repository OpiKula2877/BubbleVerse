import { defaultLabel, defaultSkin } from '../model/defaults';
import { SkinResolver, type SkinKey } from '../model/skin';
import { WorldIndex } from '../model/tree';
import type { Bubble, BubbleId, InheritFrom, LabelStyle, Skin, SkinRef, World } from '../model/types';
import { mapBubbles } from './ops';

/**
 * Skin editing that respects inheritance (spec §3.3): on a bubble with its own skin a change
 * edits the skin; on an inheriting bubble it becomes an override. Works on many bubbles at once.
 */

export type Mixed<T> = { mixed: false; value: T } | { mixed: true; value: T };

/** Common value of the selected bubbles' resolved skins ("—" when they differ). */
export function commonValue<T>(world: World, ids: readonly BubbleId[], get: (s: Skin, b: Bubble) => T): Mixed<T> | null {
  const index = new WorldIndex(world);
  const resolver = new SkinResolver(index);
  let first: { v: T; key: string } | null = null;
  let mixed = false;
  for (const id of ids) {
    const b = index.get(id);
    if (!b) continue;
    const v = get(resolver.skin(id), b);
    const key = JSON.stringify(v ?? null);
    if (!first) first = { v, key };
    else if (first.key !== key) mixed = true;
  }
  return first ? { mixed, value: first.v } : null;
}

function setKey(skin: Partial<Skin>, key: SkinKey, value: unknown): Partial<Skin> {
  const out = { ...skin } as Record<string, unknown>;
  if (value === undefined) delete out[key];
  else out[key] = value;
  return out as Partial<Skin>;
}

/** Sets one skin property on all bubbles. */
export function writeSkin<K extends SkinKey>(world: World, ids: Iterable<BubbleId>, key: K, value: Skin[K]): World {
  return mapBubbles(world, ids, (b) => {
    if (b.skin.mode === 'own') return { ...b, skin: { mode: 'own', skin: setKey(b.skin.skin, key, value) as Skin } };
    return { ...b, skin: { ...b.skin, overrides: setKey(b.skin.overrides ?? {}, key, value) } };
  });
}

/** Sets one field of the name style; inheriting bubbles override only that field. */
export function writeLabel<K extends keyof LabelStyle>(world: World, ids: Iterable<BubbleId>, field: K, value: LabelStyle[K]): World {
  return mapBubbles(world, ids, (b) => {
    if (b.skin.mode === 'own') {
      const label = { ...(b.skin.skin.label ?? defaultLabel()), [field]: value };
      return { ...b, skin: { mode: 'own', skin: { ...b.skin.skin, label } } };
    }
    const overrides = b.skin.overrides ?? {};
    const label = { ...(overrides.label ?? {}), [field]: value } as LabelStyle;
    return { ...b, skin: { ...b.skin, overrides: { ...overrides, label } } };
  });
}

export function isOverridden(b: Bubble, key: SkinKey): boolean {
  return b.skin.mode === 'inherit' && b.skin.overrides !== undefined && key in b.skin.overrides;
}

/** Removes an override so the property is inherited again. */
export function resetOverride(world: World, ids: Iterable<BubbleId>, key: SkinKey): World {
  return mapBubbles(world, ids, (b) => {
    if (b.skin.mode !== 'inherit' || !b.skin.overrides || !(key in b.skin.overrides)) return b;
    return { ...b, skin: { ...b.skin, overrides: setKey(b.skin.overrides, key, undefined) } };
  });
}

/**
 * Switches between an own skin and "same as". Switching to own freezes the currently resolved
 * look; switching to inherit keeps the current look's differences as overrides only for size.
 */
export function setSkinMode(world: World, ids: Iterable<BubbleId>, mode: 'own' | 'inherit', from: InheritFrom = 'parent'): World {
  const resolver = new SkinResolver(new WorldIndex(world));
  return mapBubbles(world, ids, (b) => {
    if (mode === 'own') {
      if (b.skin.mode === 'own') return b;
      return { ...b, skin: { mode: 'own', skin: structuredClone(resolver.skin(b.id)) } };
    }
    const size = resolver.skin(b.id).size;
    const next: SkinRef = { mode: 'inherit', from, overrides: { size } };
    if (b.skin.mode === 'inherit') return { ...b, skin: { ...b.skin, from } };
    return { ...b, skin: next };
  });
}

/** The default skin a fresh main bubble would get, for "reset". */
export function freshSkin(color?: string): Skin {
  return defaultSkin(color);
}
