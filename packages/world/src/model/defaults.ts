import { newId } from './ids';
import {
  WORLD_VERSION,
  type Bubble,
  type BubbleId,
  type BubbleKind,
  type HoverFx,
  type LabelStyle,
  type Link,
  type Skin,
  type World,
} from './types';

/** Colors offered for new main bubbles, used in turn. */
export const BUBBLE_PALETTE = [
  '#4C97FF',
  '#FF8C1A',
  '#59C059',
  '#9966FF',
  '#FF6680',
  '#0FBD8C',
  '#FFBF00',
  '#5CB1D6',
];

export const MAIN_SIZE = 120;
export const MIN_SIZE = 8;

export function defaultLabel(): LabelStyle {
  return { color: '#FFFFFF', font: 'Segoe UI', size: 14, position: 'below' };
}

export function defaultSkin(color: string = BUBBLE_PALETTE[0] ?? '#4C97FF'): Skin {
  return { shape: 'circle', size: MAIN_SIZE, fill: color, label: defaultLabel() };
}

export function defaultLink(): Link {
  return { inherit: false, type: 'line', color: '#FFFFFF', width: 2, opacity: 0.45 };
}

export function defaultHover(): HoverFx {
  return { grow: true, shake: false, glow: true, tooltip: true };
}

export function emptyWorld(): World {
  return {
    version: WORLD_VERSION,
    bubbles: [],
    sharedScripts: [],
    customBlocks: [],
    templates: [],
    globals: [],
    homeView: { x: 0, y: 0, zoom: 1 },
  };
}

export interface NewBubbleOptions {
  kind: BubbleKind;
  parentId?: BubbleId | null;
  name?: string;
  position?: { x: number; y: number };
  order?: number;
  color?: string;
  /** Size of the parent's resolved skin; children start smaller than their parent. */
  parentSize?: number;
}

/**
 * A new bubble with sensible defaults. Main bubbles get their own skin;
 * sub-bubbles inherit the parent's skin and only override the size (and color when given).
 */
export function createBubble(opts: NewBubbleOptions): Bubble {
  const parentId = opts.parentId ?? null;
  const isMain = parentId === null;
  const childSize = Math.max(MIN_SIZE, Math.round((opts.parentSize ?? MAIN_SIZE) * 0.65));
  return {
    id: newId(),
    parentId,
    kind: opts.kind,
    name: opts.name ?? '',
    order: opts.order ?? 0,
    ...(opts.kind === 'folder' ? { expanded: true } : {}),
    position: opts.position ?? { x: 0, y: 0 },
    attach: isMain ? 'world' : 'parent',
    skin: isMain
      ? { mode: 'own', skin: defaultSkin(opts.color) }
      : {
          mode: 'inherit',
          from: 'parent',
          overrides: { size: childSize, ...(opts.color ? { fill: opts.color } : {}) },
        },
    motion: {},
    physics: {},
    link: defaultLink(),
    hover: defaultHover(),
    scripts: [],
  };
}
