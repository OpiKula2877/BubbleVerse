import { actionTarget } from '@bv/blocks';
import { mapBubbles, type AutoSource, type Bubble, type Media, type World } from '@bv/world';
import type { Editor } from './editor.svelte';
import { store } from './store.svelte';

/**
 * Auto icons (spec §3.2): bubbles whose media is "auto icon" get the icon of their action's
 * target from the core, once per bubble, source and target.
 */

/** The likely icon source of an action target. */
export function autoSourceFor(target: string): AutoSource {
  const t = target.trim().toLowerCase();
  if (t.startsWith('steam://')) return 'steam';
  if (t.startsWith('com.epicgames.launcher://')) return 'epic';
  if (t.startsWith('http://') || t.startsWith('https://')) return 'favicon';
  return 'exe';
}

function ownMedia(b: Bubble): Media | undefined {
  return b.skin.mode === 'own' ? b.skin.skin.media : b.skin.overrides?.media;
}

function withAsset(world: World, id: string, asset: string): World {
  return mapBubbles(world, [id], (b) => {
    const m = ownMedia(b);
    if (m?.type !== 'auto') return b;
    const media = { ...m, asset };
    return b.skin.mode === 'own'
      ? { ...b, skin: { ...b.skin, skin: { ...b.skin.skin, media } } }
      : { ...b, skin: { ...b.skin, overrides: { ...b.skin.overrides, media } } };
  });
}

const tried = new Set<string>();
let busy = false;

/** Looks up missing auto icons of the draft; changes merge into one undo step. */
export async function resolveAutoIcons(editor: Editor): Promise<void> {
  if (busy || !store.core.isTauri || !editor.world) return;
  busy = true;
  try {
    for (;;) {
      const todo = editor.world.bubbles.flatMap((b) => {
        const m = ownMedia(b);
        const target = actionTarget(b);
        if (m?.type !== 'auto' || m.asset || !target?.value) return [];
        const key = `${b.id}|${m.source}|${target.value}`;
        return tried.has(key) ? [] : [{ id: b.id, source: m.source, target: target.value, key }];
      });
      if (!todo.length) break;
      for (const x of todo) {
        tried.add(x.key);
        try {
          const info = await store.core.call<{ hash: string } | null>('auto_icon', {
            source: x.source,
            target: x.target,
          });
          if (info) editor.apply((w) => withAsset(w, x.id, info.hash), 'auto-icon');
        } catch {
          /* no icon for this target */
        }
      }
    }
  } finally {
    busy = false;
  }
}
