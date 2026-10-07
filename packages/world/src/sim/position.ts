import type { WorldIndex } from '../model/tree';
import type { Bubble, BubbleId, Vec2 } from '../model/types';
import { hashSeed, orbitOffset, pathOffset, wanderOffset } from './motion';

export interface PositionOptions {
  /** Seconds; `null` = no motion (edit mode, bubbles stand at their base positions). */
  time: number | null;
  /** Runtime position overrides from scripts ("move bubble to x, y"), in world coordinates. */
  overrides?: ReadonlyMap<BubbleId, Vec2>;
}

/**
 * World position of every bubble.
 * Base: attach 'world' = own position; attach 'parent' = parent position + own position.
 * Track motion adds its offset to the base; an orbit circles the (moving) center bubble.
 */
export function computePositions(index: WorldIndex, opts: PositionOptions): Map<BubbleId, Vec2> {
  const out = new Map<BubbleId, Vec2>();
  const visiting = new Set<BubbleId>();

  const posOf = (b: Bubble): Vec2 => {
    const done = out.get(b.id);
    if (done) return done;
    const forced = opts.overrides?.get(b.id);
    if (forced) {
      out.set(b.id, forced);
      return forced;
    }
    if (visiting.has(b.id)) {
      // A dependency cycle (the editor forbids it); break it with the static position.
      return { x: b.position.x, y: b.position.y };
    }
    visiting.add(b.id);
    const parent = b.attach === 'parent' ? index.parentOf(b.id) : undefined;
    const pp = parent ? posOf(parent) : { x: 0, y: 0 };
    let p: Vec2 = { x: pp.x + b.position.x, y: pp.y + b.position.y };
    const track = b.motion.track;
    if (opts.time !== null && track) {
      const t = opts.time;
      if (track.type === 'orbit') {
        const center = index.get(track.center);
        const c = center && center.id !== b.id ? posOf(center) : p;
        const o = orbitOffset(track, t);
        p = { x: c.x + o.x, y: c.y + o.y };
      } else {
        const o =
          track.type === 'path' ? pathOffset(track, t) : wanderOffset(track, t, hashSeed(b.id));
        p = { x: p.x + o.x, y: p.y + o.y };
      }
    }
    visiting.delete(b.id);
    out.set(b.id, p);
    return p;
  };

  for (const b of index.world.bubbles) posOf(b);
  return out;
}

/** Bubbles whose position depends on `b`: the parent (if attached to it) and the orbit center. */
function dependencies(index: WorldIndex, b: Bubble): BubbleId[] {
  const deps: BubbleId[] = [];
  if (b.attach === 'parent' && b.parentId && index.get(b.parentId)) deps.push(b.parentId);
  if (b.motion.track?.type === 'orbit') deps.push(b.motion.track.center);
  return deps;
}

/** True when making `id` orbit `center` would create a cycle (e.g. A orbits B and B orbits A). */
export function orbitWouldCycle(index: WorldIndex, id: BubbleId, center: BubbleId): boolean {
  if (id === center) return true;
  const stack = [center];
  const seen = new Set<BubbleId>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === id) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const b = index.get(cur);
    if (b) stack.push(...dependencies(index, b));
  }
  return false;
}

/** Position relative to a new parent that keeps the same world position. */
export function relativeTo(world: Vec2, parentWorld: Vec2 | null): Vec2 {
  return parentWorld ? { x: world.x - parentWorld.x, y: world.y - parentWorld.y } : { ...world };
}
