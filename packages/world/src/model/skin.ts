import { defaultSkin } from './defaults';
import type { WorldIndex } from './tree';
import type { Bubble, BubbleId, InheritFrom, Link, Skin } from './types';

/** Keys of `Skin` that can be overridden one by one (spec §3.3). */
export const SKIN_KEYS = ['shape', 'size', 'fill', 'media', 'edge', 'label'] as const;
export type SkinKey = (typeof SKIN_KEYS)[number];

/** Applies overrides on top of a base skin. `edge` and `label` merge field by field. */
export function mergeSkin(base: Skin, overrides: Partial<Skin> | undefined): Skin {
  if (!overrides) return base;
  const out: Skin = { ...base };
  for (const key of SKIN_KEYS) {
    if (!(key in overrides)) continue;
    const value = overrides[key];
    if (key === 'edge' && value && base.edge) {
      out.edge = { ...base.edge, ...(value as Skin['edge']) };
    } else if (key === 'label' && value && base.label) {
      out.label = { ...base.label, ...(value as Skin['label']) };
    } else {
      (out as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

/** The bubble a skin is inherited from, or null when there is none (then the default skin is used). */
export function inheritSource(
  index: WorldIndex,
  bubble: Bubble,
  from: InheritFrom,
): BubbleId | null {
  const parent = index.parentOf(bubble.id);
  if (from === 'parent') return parent?.id ?? null;
  if (from === 'root') {
    const root = index.rootOf(bubble.id);
    return root && root.id !== bubble.id ? root.id : null;
  }
  // A specific ancestor; when it is no longer an ancestor (after a move) fall back to the parent.
  return index.isAncestor(from.ancestor, bubble.id) ? from.ancestor : (parent?.id ?? null);
}

/** Resolves skins and links with inheritance; caches results for one world snapshot. */
export class SkinResolver {
  private readonly skins = new Map<BubbleId, Skin>();
  private readonly links = new Map<BubbleId, Link>();

  constructor(readonly index: WorldIndex) {}

  skin(id: BubbleId): Skin {
    return this.resolveSkin(id, new Set());
  }

  private resolveSkin(id: BubbleId, visiting: Set<BubbleId>): Skin {
    const cached = this.skins.get(id);
    if (cached) return cached;
    const bubble = this.index.get(id);
    if (!bubble) return defaultSkin();
    let skin: Skin;
    if (bubble.skin.mode === 'own') {
      skin = bubble.skin.skin;
    } else {
      const src = inheritSource(this.index, bubble, bubble.skin.from);
      visiting.add(id);
      const base = src && !visiting.has(src) ? this.resolveSkin(src, visiting) : defaultSkin();
      skin = mergeSkin(base, bubble.skin.overrides);
    }
    this.skins.set(id, skin);
    return skin;
  }

  /** The link style, following "same as parent" upwards. */
  link(id: BubbleId): Link {
    const cached = this.links.get(id);
    if (cached) return cached;
    const chain: Bubble[] = [];
    let cur = this.index.get(id);
    const seen = new Set<BubbleId>();
    while (cur && cur.link.inherit && !seen.has(cur.id)) {
      seen.add(cur.id);
      chain.push(cur);
      cur = this.index.parentOf(cur.id);
    }
    const base = cur?.link ?? this.index.get(id)?.link;
    const link: Link = base
      ? { ...base, inherit: false }
      : { inherit: false, type: 'none', color: '#FFFFFF', width: 1, opacity: 1 };
    this.links.set(id, link);
    for (const b of chain) this.links.set(b.id, link);
    return link;
  }
}

/** Primary fill color of a skin (first gradient stop for gradients). */
export function fillColor(skin: Skin): string {
  return typeof skin.fill === 'string' ? skin.fill : (skin.fill.stops[0]?.color ?? '#FFFFFF');
}
