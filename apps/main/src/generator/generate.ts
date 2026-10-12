import { ensureBuiltin, OPEN_URL_SCRIPT, RUN_FILE_SCRIPT } from '@bv/blocks';
import {
  createBubble,
  MAIN_SIZE,
  MIN_SIZE,
  nextOrder,
  SkinResolver,
  withTemplate,
  WorldIndex,
  type AssetHash,
  type AutoSource,
  type Bubble,
  type BubbleId,
  type ScriptSlot,
  type Vec2,
  type World,
} from '@bv/world';

/**
 * The bulk generator of action bubbles (spec §4.6): items from files, a folder, installed
 * apps and games or a list of web sites become action bubbles in one undo step.
 */

export interface GenItem {
  /** File path, URL, `steam://rungameid/…`, `shell:AppsFolder\…` */
  target: string;
  /** Name from the source (file name without extension, app or game name, web host). */
  name: string;
  /** File extension with the dot (`.exe`); empty for apps and web sites. */
  ext: string;
  /** Name of the folder the file is in; empty for apps and web sites. */
  folder: string;
  /** Files run with "Run file", everything else opens with "Open URL". */
  kind: 'file' | 'url';
  /** Where the auto icon comes from. */
  icon: AutoSource;
  /** The icon the core found (preview). */
  asset?: AssetHash;
}

export type NameTemplate = 'name' | 'nameExt' | 'folder';
export type GenLayout = 'circle' | 'grid' | 'spiral';
export type GenLook = { kind: 'auto' } | { kind: 'inherit' } | { kind: 'template'; id: string };
/** The built-in "Run file / Open URL" scripts, or another shared script with one parameter. */
export type GenScript = { kind: 'builtin' } | { kind: 'shared'; id: string; param: string };

export interface GenOptions {
  parentId: BubbleId | null;
  nameTemplate: NameTemplate;
  prefix: string;
  suffix: string;
  script: GenScript;
  look: GenLook;
  layout: GenLayout;
}

export function defaultGenOptions(parentId: BubbleId | null): GenOptions {
  return {
    parentId,
    nameTemplate: 'name',
    prefix: '',
    suffix: '',
    script: { kind: 'builtin' },
    look: { kind: 'auto' },
    layout: 'circle',
  };
}

export function itemName(
  item: GenItem,
  o: Pick<GenOptions, 'nameTemplate' | 'prefix' | 'suffix'>,
): string {
  const base =
    o.nameTemplate === 'nameExt'
      ? `${item.name}${item.ext}`
      : o.nameTemplate === 'folder' && item.folder
        ? item.folder
        : item.name;
  return `${o.prefix}${base}${o.suffix}`;
}

/** Name, extension and folder of a file path (`C:\Games\Doom\doom.exe`). */
export function fileItem(path: string): GenItem {
  const parts = path.split(/[\\/]/).filter(Boolean);
  const file = parts[parts.length - 1] ?? path;
  const dot = file.lastIndexOf('.');
  const ext = dot > 0 ? file.slice(dot) : '';
  return {
    target: path,
    name: dot > 0 ? file.slice(0, dot) : file,
    ext,
    folder: parts.length > 1 ? (parts[parts.length - 2] ?? '') : '',
    kind: 'file',
    icon: 'exe',
  };
}

/** A web site from one line of the URL list; `null` for lines that are not addresses. */
export function urlItem(line: string): GenItem | null {
  const text = line.trim();
  if (!text) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname) return null;
    const host = u.hostname.replace(/^www\./, '');
    return { target: u.href, name: host, ext: '', folder: '', kind: 'url', icon: 'favicon' };
  } catch {
    return null;
  }
}

/** Positions around the parent (relative to it), `size` = size of the new bubbles. */
export function layoutPositions(
  n: number,
  layout: GenLayout,
  parentSize: number,
  size: number,
): Vec2[] {
  const gap = size * 1.35;
  const out: Vec2[] = [];
  if (n <= 0) return out;
  if (layout === 'circle') {
    const r = Math.max(parentSize * 0.5 + size * 1.1, (n * gap) / (2 * Math.PI));
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      out.push({ x: Math.round(r * Math.cos(a)), y: Math.round(r * Math.sin(a)) });
    }
  } else if (layout === 'grid') {
    const cols = Math.ceil(Math.sqrt(n));
    const top = parentSize * 0.5 + size;
    for (let i = 0; i < n; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      out.push({ x: Math.round((col - (cols - 1) / 2) * gap), y: Math.round(top + row * gap) });
    }
  } else {
    // Archimedean spiral with even spacing along the curve.
    const start = parentSize * 0.5 + size * 1.1;
    const b = gap / (2 * Math.PI);
    let theta = 0;
    for (let i = 0; i < n; i++) {
      const r = start + b * theta;
      out.push({
        x: Math.round(r * Math.cos(theta - Math.PI / 2)),
        y: Math.round(r * Math.sin(theta - Math.PI / 2)),
      });
      theta += gap / Math.max(r, 1);
    }
  }
  return out;
}

function scriptFor(item: GenItem, s: GenScript): ScriptSlot {
  if (s.kind === 'shared') return { kind: 'shared', ref: s.id, params: { [s.param]: item.target } };
  return item.kind === 'file'
    ? { kind: 'shared', ref: RUN_FILE_SCRIPT, params: { path: item.target, args: '' } }
    : { kind: 'shared', ref: OPEN_URL_SCRIPT, params: { url: item.target } };
}

/** Creates the action bubbles; returns the new world and the new ids. */
export function generate(
  world: World,
  items: readonly GenItem[],
  o: GenOptions,
): { world: World; ids: BubbleId[] } {
  if (!items.length) return { world, ids: [] };
  let w = world;
  if (o.script.kind === 'builtin') {
    if (items.some((i) => i.kind === 'file')) w = ensureBuiltin(w, RUN_FILE_SCRIPT);
    if (items.some((i) => i.kind === 'url')) w = ensureBuiltin(w, OPEN_URL_SCRIPT);
  }
  const index = new WorldIndex(w);
  const parent = o.parentId ? index.get(o.parentId) : undefined;
  const parentSize = parent ? new SkinResolver(index).skin(parent.id).size : MAIN_SIZE;
  const size = parent ? Math.max(MIN_SIZE, Math.round(parentSize * 0.65)) : MAIN_SIZE;
  const origin = parent ? { x: 0, y: 0 } : { x: w.homeView.x, y: w.homeView.y };
  const positions = layoutPositions(items.length, o.layout, parent ? parentSize : MAIN_SIZE, size);
  const template =
    o.look.kind === 'template'
      ? w.templates.find((t) => t.id === (o.look as { id: string }).id)
      : undefined;
  let order = nextOrder(w, parent?.id ?? null);
  const bubbles: Bubble[] = items.map((item, i) => {
    const p = positions[i] ?? { x: 0, y: 0 };
    let b = createBubble({
      kind: 'action',
      parentId: parent?.id ?? null,
      name: itemName(item, o),
      order: order++,
      position: { x: origin.x + p.x, y: origin.y + p.y },
      parentSize: parent ? parentSize : undefined,
    });
    if (template) b = withTemplate(b, template);
    if (o.look.kind === 'auto') {
      const media = {
        type: 'auto' as const,
        source: item.icon,
        ...(item.asset ? { asset: item.asset } : {}),
      };
      b =
        b.skin.mode === 'own'
          ? { ...b, skin: { mode: 'own', skin: { ...b.skin.skin, media } } }
          : { ...b, skin: { ...b.skin, overrides: { ...b.skin.overrides, media } } };
    }
    return { ...b, scripts: [scriptFor(item, o.script)] };
  });
  return { world: { ...w, bubbles: [...w.bubbles, ...bubbles] }, ids: bubbles.map((b) => b.id) };
}
