import type { Bubble, BubbleId, Template, Vec2, World } from '../model/types';
import { mapBubbles, setAttach } from './ops';

/**
 * Templates (spec §4.5): skin, attachment, motion, physics, link, hover and scripts of a
 * bubble, to be used when creating bubbles, in the generator or on selected bubbles.
 */

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function templateFrom(bubble: Bubble, id: string, name: string): Template {
  return clone({
    id,
    name,
    skin: bubble.skin,
    attach: bubble.attach,
    motion: bubble.motion,
    physics: bubble.physics,
    link: bubble.link,
    hover: bubble.hover,
    ...(bubble.showName ? { showName: bubble.showName } : {}),
    scripts: bubble.scripts,
  });
}

export function addTemplate(world: World, t: Template): World {
  return { ...world, templates: [...world.templates.filter((x) => x.id !== t.id), t] };
}

export function removeTemplate(world: World, id: string): World {
  return { ...world, templates: world.templates.filter((t) => t.id !== id) };
}

/** A bubble with the template's look and behaviour; scripts only for action bubbles. */
export function withTemplate(b: Bubble, t: Template): Bubble {
  const c = clone(t);
  const out: Bubble = {
    ...b,
    skin: c.skin,
    motion: c.motion,
    physics: c.physics,
    link: c.link,
    hover: c.hover,
    scripts: b.kind === 'action' ? c.scripts : b.scripts,
  };
  if (c.showName) out.showName = c.showName;
  else delete out.showName;
  // Main bubbles have no parent to attach to.
  out.attach = b.parentId === null ? 'world' : b.attach;
  return out;
}

/**
 * "Use template" on selected bubbles. The attachment changes only when the current world
 * positions are known (they are needed to keep the bubbles where they are).
 */
export function applyTemplate(
  world: World,
  ids: Iterable<BubbleId>,
  t: Template,
  positions?: ReadonlyMap<BubbleId, Vec2>,
): World {
  const list = [...ids];
  let w = mapBubbles(world, list, (b) => withTemplate(b, t));
  if (positions) w = setAttach(w, list, t.attach, positions);
  return w;
}
