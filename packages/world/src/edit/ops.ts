import { WorldIndex } from '../model/tree';
import type { Bubble, BubbleId, HomeView, Vec2, World } from '../model/types';
import { relativeTo } from '../sim/position';

/** Pure edit operations: each returns a new world and shares unchanged bubbles. */

export function mapBubbles(
  world: World,
  ids: Iterable<BubbleId>,
  fn: (b: Bubble) => Bubble,
): World {
  const set = new Set(ids);
  if (set.size === 0) return world;
  let changed = false;
  const bubbles = world.bubbles.map((b) => {
    if (!set.has(b.id)) return b;
    const nb = fn(b);
    if (nb !== b) changed = true;
    return nb;
  });
  return changed ? { ...world, bubbles } : world;
}

export function updateBubble(world: World, id: BubbleId, patch: Partial<Bubble>): World {
  return mapBubbles(world, [id], (b) => ({ ...b, ...patch }));
}

export function nextOrder(world: World, parentId: BubbleId | null): number {
  let max = -1;
  for (const b of world.bubbles) if (b.parentId === parentId) max = Math.max(max, b.order);
  return max + 1;
}

export function addBubbles(world: World, bubbles: Bubble[]): World {
  return bubbles.length ? { ...world, bubbles: [...world.bubbles, ...bubbles] } : world;
}

/** Deletes bubbles with all their descendants; orbits around deleted bubbles are removed. */
export function deleteBubbles(world: World, ids: Iterable<BubbleId>): World {
  const index = new WorldIndex(world);
  const gone = new Set<BubbleId>();
  for (const id of ids) {
    if (!index.get(id)) continue;
    gone.add(id);
    for (const d of index.descendants(id)) gone.add(d.id);
  }
  if (gone.size === 0) return world;
  const bubbles = world.bubbles
    .filter((b) => !gone.has(b.id))
    .map((b) => {
      const track = b.motion.track;
      if (track?.type === 'orbit' && gone.has(track.center)) {
        const { track: _removed, ...motion } = b.motion;
        return { ...b, motion };
      }
      return b;
    });
  return { ...world, bubbles };
}

/** Moves bubbles by a world-space delta. Children of moved bubbles are not moved twice. */
export function moveBubbles(world: World, ids: Iterable<BubbleId>, delta: Vec2): World {
  if (delta.x === 0 && delta.y === 0) return world;
  const top = new WorldIndex(world).topmost(ids);
  return mapBubbles(world, top, (b) => ({
    ...b,
    position: { x: b.position.x + delta.x, y: b.position.y + delta.y },
  }));
}

/** Sets world positions (from the static layout `positions`) and converts them to stored positions. */
export function placeBubbles(
  world: World,
  targets: ReadonlyMap<BubbleId, Vec2>,
  positions: ReadonlyMap<BubbleId, Vec2>,
): World {
  const index = new WorldIndex(world);
  return mapBubbles(world, targets.keys(), (b) => {
    const target = targets.get(b.id)!;
    const parent = b.attach === 'parent' ? index.parentOf(b.id) : undefined;
    const pp = parent ? (positions.get(parent.id) ?? null) : null;
    return { ...b, position: relativeTo(target, pp) };
  });
}

/**
 * Moves a bubble under a new parent (or to the main level) and keeps its world position.
 * Returns the world unchanged when the move is not allowed.
 */
export function reparent(
  world: World,
  id: BubbleId,
  newParent: BubbleId | null,
  positions: ReadonlyMap<BubbleId, Vec2>,
  orderIndex?: number,
): World {
  const index = new WorldIndex(world);
  const bubble = index.get(id);
  if (!bubble || !index.canReparent(id, newParent)) return world;
  const worldPos = positions.get(id) ?? bubble.position;
  const parentPos = newParent ? (positions.get(newParent) ?? null) : null;
  const attach = newParent === null ? 'world' : bubble.attach;
  const moved: Bubble = {
    ...bubble,
    parentId: newParent,
    attach,
    position: attach === 'parent' ? relativeTo(worldPos, parentPos) : { ...worldPos },
  };
  return reorderInto(
    { ...world, bubbles: world.bubbles.map((b) => (b.id === id ? moved : b)) },
    id,
    orderIndex,
  );
}

/** Puts a bubble at `orderIndex` among its siblings (end when omitted) and renumbers orders. */
export function reorderInto(world: World, id: BubbleId, orderIndex?: number): World {
  const index = new WorldIndex(world);
  const bubble = index.get(id);
  if (!bubble) return world;
  const siblings = index.children(index.parentOf(id)?.id ?? null).filter((b) => b.id !== id);
  const at =
    orderIndex === undefined ? siblings.length : Math.max(0, Math.min(orderIndex, siblings.length));
  siblings.splice(at, 0, bubble);
  const orders = new Map(siblings.map((b, i) => [b.id, i]));
  return mapBubbles(world, orders.keys(), (b) =>
    b.order === orders.get(b.id) ? b : { ...b, order: orders.get(b.id)! },
  );
}

export function setHomeView(world: World, homeView: HomeView): World {
  return { ...world, homeView };
}

/** Changes a bubble's attachment and keeps its world position. */
export function setAttach(
  world: World,
  ids: Iterable<BubbleId>,
  attach: Bubble['attach'],
  positions: ReadonlyMap<BubbleId, Vec2>,
): World {
  const index = new WorldIndex(world);
  return mapBubbles(world, ids, (b) => {
    if (b.attach === attach) return b;
    const parent = index.parentOf(b.id);
    if (attach === 'parent' && !parent) return b;
    const wp = positions.get(b.id) ?? b.position;
    const pp = attach === 'parent' && parent ? (positions.get(parent.id) ?? null) : null;
    return { ...b, attach, position: relativeTo(wp, pp) };
  });
}
