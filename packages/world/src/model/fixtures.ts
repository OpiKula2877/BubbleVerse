import { createBubble, emptyWorld } from './defaults';
import type { Bubble, BubbleKind, World } from './types';

/** Builds a bubble with a fixed id for tests and samples. */
export function fixtureBubble(
  id: string,
  parentId: string | null,
  name: string,
  kind: BubbleKind,
  order = 0,
  patch: Partial<Bubble> = {},
): Bubble {
  return { ...createBubble({ kind, parentId }), id, name, order, ...patch };
}

/**
 * Apps ─┬─ Editor
 *       └─ Work ── Claude Code
 * Games ┬─ CS2
 *       └─ Minecraft
 */
export function sampleWorld(): World {
  return {
    ...emptyWorld(),
    bubbles: [
      fixtureBubble('apps', null, 'Apps', 'folder', 0, { position: { x: 0, y: 0 } }),
      fixtureBubble('work', 'apps', 'Work', 'folder', 1, { position: { x: 200, y: 0 } }),
      fixtureBubble('cc', 'work', 'Claude Code', 'action', 0, { position: { x: 100, y: 50 } }),
      fixtureBubble('games', null, 'Games', 'folder', 1, { position: { x: 0, y: 500 } }),
      fixtureBubble('cs2', 'games', 'CS2', 'action', 0, { position: { x: -150, y: 0 } }),
      fixtureBubble('mc', 'games', 'Minecraft', 'action', 1, { position: { x: 150, y: 0 } }),
      fixtureBubble('ed', 'apps', 'Editor', 'action', 0, { position: { x: -200, y: 0 } }),
    ],
  };
}
