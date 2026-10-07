import { newId } from '../model/ids';
import { WorldIndex } from '../model/tree';
import type { Bubble, BubbleId, SharedScript, SkinRef, Vec2, World } from '../model/types';
import { nextOrder } from './ops';

/** Copied branches: whole subtrees including scripts and the shared scripts they use. */
export interface BranchClip {
  kind: 'branches';
  /** Roots first, then their descendants. */
  bubbles: Bubble[];
  rootIds: BubbleId[];
  /** World positions of the roots at copy time. */
  rootPositions: Record<BubbleId, Vec2>;
  sharedScripts: SharedScript[];
}

export function copyBranches(
  world: World,
  ids: Iterable<BubbleId>,
  positions: ReadonlyMap<BubbleId, Vec2>,
): BranchClip | null {
  const index = new WorldIndex(world);
  const rootIds = index.topmost(ids);
  if (rootIds.length === 0) return null;
  const bubbles: Bubble[] = [];
  const rootPositions: Record<BubbleId, Vec2> = {};
  for (const id of rootIds) {
    bubbles.push(index.get(id)!);
    bubbles.push(...index.descendants(id));
    rootPositions[id] = positions.get(id) ?? index.get(id)!.position;
  }
  const refs = new Set<string>();
  for (const b of bubbles) for (const s of b.scripts) if (s.kind === 'shared') refs.add(s.ref);
  const sharedScripts = world.sharedScripts.filter((s) => refs.has(s.id));
  return structuredClone({ kind: 'branches', bubbles, rootIds, rootPositions, sharedScripts });
}

export interface PasteResult {
  world: World;
  rootIds: BubbleId[];
  allIds: BubbleId[];
}

/**
 * Pastes branches with new ids under `parentId` (null = main level). Roots keep their layout
 * relative to each other; the first root lands on `at` (world coordinates) or is offset a bit.
 */
export function pasteBranches(
  world: World,
  clip: BranchClip,
  parentId: BubbleId | null,
  positions: ReadonlyMap<BubbleId, Vec2>,
  at?: Vec2,
): PasteResult {
  const index = new WorldIndex(world);
  const target = parentId ? index.get(parentId) : undefined;
  // Pasting onto an action bubble puts the copy next to it, under the same parent.
  const parent =
    target && target.kind === 'action'
      ? (index.parentOf(target.id)?.id ?? null)
      : (target?.id ?? null);
  const parentPos = parent ? (positions.get(parent) ?? null) : null;

  const ids = new Map<BubbleId, BubbleId>();
  for (const b of clip.bubbles) ids.set(b.id, newId());
  const first = clip.rootIds[0]!;
  const anchor = clip.rootPositions[first] ?? { x: 0, y: 0 };
  const offset = at ? { x: at.x - anchor.x, y: at.y - anchor.y } : { x: 30, y: 30 };
  const roots = new Set(clip.rootIds);
  let order = nextOrder(world, parent);

  const copies = clip.bubbles.map((src): Bubble => {
    const b = structuredClone(src);
    b.id = ids.get(src.id)!;
    if (roots.has(src.id)) {
      const wp = clip.rootPositions[src.id] ?? src.position;
      const np = { x: wp.x + offset.x, y: wp.y + offset.y };
      b.parentId = parent;
      b.order = order++;
      if (parent === null) {
        b.attach = 'world';
        b.position = np;
      } else {
        b.attach = 'parent';
        b.position = parentPos ? { x: np.x - parentPos.x, y: np.y - parentPos.y } : np;
      }
    } else {
      b.parentId = b.parentId ? (ids.get(b.parentId) ?? b.parentId) : null;
      if (b.attach === 'world')
        b.position = { x: b.position.x + offset.x, y: b.position.y + offset.y };
    }
    if (b.motion.track?.type === 'orbit') {
      b.motion.track.center = ids.get(b.motion.track.center) ?? b.motion.track.center;
    }
    b.skin = remapSkin(b.skin, ids);
    return b;
  });

  const existing = new Set(world.sharedScripts.map((s) => s.id));
  const shared = clip.sharedScripts.filter((s) => !existing.has(s.id));
  return {
    world: {
      ...world,
      bubbles: [...world.bubbles, ...copies],
      sharedScripts: shared.length
        ? [...world.sharedScripts, ...structuredClone(shared)]
        : world.sharedScripts,
    },
    rootIds: clip.rootIds.map((id) => ids.get(id)!),
    allIds: copies.map((b) => b.id),
  };
}

function remapSkin(skin: SkinRef, ids: ReadonlyMap<BubbleId, BubbleId>): SkinRef {
  if (skin.mode === 'inherit' && typeof skin.from === 'object') {
    return { ...skin, from: { ancestor: ids.get(skin.from.ancestor) ?? skin.from.ancestor } };
  }
  return skin;
}

/** Copies branches and pastes them right next to the originals, under the same parents. */
export function duplicateBranches(
  world: World,
  ids: Iterable<BubbleId>,
  positions: ReadonlyMap<BubbleId, Vec2>,
): PasteResult {
  const index = new WorldIndex(world);
  let current = world;
  const rootIds: BubbleId[] = [];
  const allIds: BubbleId[] = [];
  for (const id of index.topmost(ids)) {
    const clip = copyBranches(world, [id], positions);
    if (!clip) continue;
    const parent = index.parentOf(id)?.id ?? null;
    const p = positions.get(id) ?? index.get(id)!.position;
    const res = pasteBranches(current, clip, parent, positions, { x: p.x + 30, y: p.y + 30 });
    current = res.world;
    rootIds.push(...res.rootIds);
    allIds.push(...res.allIds);
  }
  return { world: current, rootIds, allIds };
}
