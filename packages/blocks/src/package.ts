import {
  newId,
  nextOrder,
  WorldIndex,
  type Bubble,
  type BubbleId,
  type CustomBlock,
  type HomeView,
  type Script,
  type ScriptArg,
  type ScriptNode,
  type ScriptSlot,
  type SharedScript,
  type Template,
  type VariableDef,
  type World,
} from '@bv/world';
import { usedVariables } from './editing';
import { OP } from './generated/catalog';
import { isNode, isNodeList, scriptNodes, walkNodes } from './script';

/**
 * `.bubble` packages (spec §9.4): a branch (or the whole world) with the shared scripts,
 * custom blocks and variable definitions it uses. On import ids are renumbered and equal
 * shared scripts and custom blocks are not duplicated.
 */

export const PACKAGE_FORMAT = 1;

export interface PackageData {
  bubbles: Bubble[];
  sharedScripts: SharedScript[];
  customBlocks: CustomBlock[];
  globals: VariableDef[];
  templates: Template[];
  /** Whole-world packages only. */
  homeView?: HomeView;
}

export interface PackageManifest {
  format: number;
  /** App version that wrote the package. */
  app: string;
  name: string;
  /** Root bubble of a branch; `null` for the whole world. */
  root: BubbleId | null;
  bubbles: number;
  created: number;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

const BUILTIN_PREFIX = 'builtin.';

function slotScripts(world: Pick<World, 'sharedScripts'>, slots: readonly ScriptSlot[]): Script[] {
  return slots.flatMap((s) => {
    if (s.kind === 'inline') return [s.script];
    const shared = world.sharedScripts.find((x) => x.id === s.ref);
    return shared ? [shared.script] : [];
  });
}

function calledBlocks(nodes: readonly ScriptNode[]): string[] {
  const ids: string[] = [];
  walkNodes(nodes, (n) => {
    if (n[0] === OP.cb_call && typeof n[1] === 'string') ids.push(n[1]);
  });
  return ids;
}

/** A branch with everything its scripts need. */
export function packBranch(world: World, rootId: BubbleId): PackageData {
  const index = new WorldIndex(world);
  const root = index.get(rootId);
  if (!root) throw new Error(`bubble ${rootId} not found`);
  const bubbles = [root, ...index.descendants(rootId)];
  const sharedIds = new Set(
    bubbles.flatMap((b) => b.scripts.flatMap((s) => (s.kind === 'shared' ? [s.ref] : []))),
  );
  const sharedScripts = world.sharedScripts.filter((s) => sharedIds.has(s.id));
  const scripts = bubbles.flatMap((b) => slotScripts(world, b.scripts));
  // Custom blocks, following calls inside custom blocks.
  const custom = new Map<string, CustomBlock>();
  const queue = scripts.flatMap((s) => calledBlocks(scriptNodes(s)));
  while (queue.length) {
    const id = queue.pop()!;
    if (custom.has(id)) continue;
    const c = world.customBlocks.find((x) => x.id === id);
    if (!c) continue;
    custom.set(id, c);
    queue.push(...calledBlocks(c.body));
  }
  const customScripts = [...custom.values()].map((c) => ({
    v: 1 as const,
    trigger: [OP.ev_activate] as ScriptNode,
    body: c.body,
    runMode: 'ignore' as const,
  }));
  const globalNames = new Set(
    usedVariables([...scripts, ...customScripts])
      .filter((v) => v.scope === 'g')
      .map((v) => v.name),
  );
  return clone({
    bubbles,
    sharedScripts,
    customBlocks: [...custom.values()],
    globals: world.globals.filter((g) => globalNames.has(g.name)),
    templates: [],
  });
}

export function packWorld(world: World): PackageData {
  return clone({
    bubbles: world.bubbles,
    sharedScripts: world.sharedScripts,
    customBlocks: world.customBlocks,
    globals: world.globals,
    templates: world.templates,
    homeView: world.homeView,
  });
}

// ---------------------------------------------------------------- import

export interface PathReplacement {
  find: string;
  replace: string;
}

export interface ImportOptions {
  /** Folder to put the package's top bubbles into; `null` = main level. */
  parentId: BubbleId | null;
  /** Bulk find and replace in paths and texts of scripts (missing paths, spec §9.4). */
  replacements: PathReplacement[];
}

function replaceAll(text: string, reps: readonly PathReplacement[]): string {
  let out = text;
  for (const r of reps) {
    if (!r.find) continue;
    const re = new RegExp(r.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, () => r.replace);
  }
  return out;
}

/** Applies path replacements and renames custom block calls in script nodes. */
function mapNodes(
  nodes: readonly ScriptNode[],
  reps: readonly PathReplacement[],
  customIds: ReadonlyMap<string, string>,
): ScriptNode[] {
  const mapArg = (a: ScriptArg): ScriptArg => {
    if (typeof a === 'string') return replaceAll(a, reps);
    if (isNode(a)) return mapNode(a);
    if (isNodeList(a) && Array.isArray(a)) return a.map(mapNode);
    return a;
  };
  const mapNode = (n: ScriptNode): ScriptNode => {
    if (n[0] === OP.cb_call && typeof n[1] === 'string') {
      return [n[0], customIds.get(n[1]) ?? n[1], ...n.slice(2).map((a) => mapArg(a as ScriptArg))];
    }
    return [n[0], ...n.slice(1).map((a) => mapArg(a as ScriptArg))];
  };
  return nodes.map(mapNode);
}

function mapScript(
  s: Script,
  reps: readonly PathReplacement[],
  customIds: ReadonlyMap<string, string>,
): Script {
  const [trigger, ...body] = mapNodes([s.trigger, ...s.body], reps, customIds);
  return { ...s, trigger: trigger!, body };
}

/** Same content (ids aside) = the same library item. */
function same<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Library items of the package: reused when the world has an equal one, added under a new
 * id when the id is taken by something different. Built-in shared scripts are always reused.
 */
function mergeLibrary<T extends { id: string }>(
  existing: readonly T[],
  incoming: readonly T[],
  isBuiltin: (id: string) => boolean,
): { added: T[]; ids: Map<string, string> } {
  const added: T[] = [];
  const ids = new Map<string, string>();
  for (const item of incoming) {
    const found = existing.find((x) => x.id === item.id);
    if (found && (isBuiltin(item.id) || same(found, item))) {
      ids.set(item.id, item.id);
      continue;
    }
    // An equal item under another id (imported before).
    const equal = existing.find((x) => same({ ...x, id: '' }, { ...item, id: '' }));
    if (equal) {
      ids.set(item.id, equal.id);
      continue;
    }
    const id = found ? newId() : item.id;
    ids.set(item.id, id);
    added.push({ ...item, id });
  }
  return { added, ids };
}

/**
 * Custom blocks of a package: a block whose id is taken by a different block gets a new id,
 * and so does every block that calls such a block (its calls change).
 */
function mergeCustom(
  existing: readonly CustomBlock[],
  incoming: readonly CustomBlock[],
): { added: CustomBlock[]; ids: Map<string, string> } {
  const taken = (id: string) => existing.find((x) => x.id === id);
  const differs = new Set(
    incoming.filter((c) => taken(c.id) && !same(taken(c.id), c)).map((c) => c.id),
  );
  for (let changed = true; changed;) {
    changed = false;
    for (const c of incoming) {
      if (differs.has(c.id) || !taken(c.id)) continue;
      if (calledBlocks(c.body).some((x) => differs.has(x))) {
        differs.add(c.id);
        changed = true;
      }
    }
  }
  const ids = new Map<string, string>();
  const added: CustomBlock[] = [];
  for (const c of incoming) {
    if (taken(c.id) && !differs.has(c.id)) {
      ids.set(c.id, c.id);
      continue;
    }
    const id = taken(c.id) ? newId() : c.id;
    ids.set(c.id, id);
    added.push({ ...c, id });
  }
  return { added, ids };
}

/** Adds a package to the world: new ids, library items merged, paths replaced. */
export function importPackage(
  world: World,
  data: PackageData,
  o: ImportOptions,
): { world: World; ids: BubbleId[] } {
  const pkg = clone(data);
  const reps = o.replacements.filter((r) => r.find);
  const bubbleIds = new Map(pkg.bubbles.map((b) => [b.id, newId()]));
  // Custom blocks first: their new ids are needed in every script.
  const customMerge = mergeCustom(world.customBlocks, pkg.customBlocks);
  const customIds = customMerge.ids;
  const customAdded = customMerge.added.map((c) => ({
    ...c,
    body: mapNodes(c.body, reps, customIds),
  }));
  const sharedIncoming = pkg.sharedScripts.map((s) => ({
    ...s,
    script: mapScript(s.script, reps, customIds),
  }));
  const sharedMerge = mergeLibrary(world.sharedScripts, sharedIncoming, (id) =>
    id.startsWith(BUILTIN_PREFIX),
  );
  const index = new WorldIndex(world);
  let order = nextOrder(world, o.parentId);
  const tops = pkg.bubbles.filter((b) => !b.parentId || !bubbleIds.has(b.parentId));
  const first = tops[0]?.position ?? { x: 0, y: 0 };
  const bubbles: Bubble[] = pkg.bubbles.map((b) => {
    const top = !b.parentId || !bubbleIds.has(b.parentId);
    const out: Bubble = { ...b, id: bubbleIds.get(b.id)! };
    if (top) {
      out.parentId = o.parentId && index.get(o.parentId) ? o.parentId : null;
      out.order = order++;
      if (out.parentId) {
        out.attach = 'parent';
        out.position = { x: b.position.x - first.x, y: b.position.y - first.y + 160 };
      } else {
        out.attach = 'world';
        out.position = {
          x: world.homeView.x + b.position.x - first.x,
          y: world.homeView.y + b.position.y - first.y,
        };
      }
    } else {
      out.parentId = bubbleIds.get(b.parentId!)!;
    }
    if (out.skin.mode === 'inherit' && typeof out.skin.from === 'object') {
      const a = bubbleIds.get(out.skin.from.ancestor);
      out.skin = { ...out.skin, from: a ? { ancestor: a } : 'parent' };
    }
    const track = out.motion.track;
    if (track?.type === 'orbit') {
      out.motion = {
        ...out.motion,
        track: { ...track, center: bubbleIds.get(track.center) ?? track.center },
      };
    }
    out.scripts = b.scripts.map((s): ScriptSlot => {
      if (s.kind === 'inline')
        return { kind: 'inline', script: mapScript(s.script, reps, customIds) };
      const params = Object.fromEntries(
        Object.entries(s.params).map(([k, v]) => [
          k,
          typeof v === 'string' ? replaceAll(v, reps) : v,
        ]),
      );
      return { kind: 'shared', ref: sharedMerge.ids.get(s.ref) ?? s.ref, params };
    });
    return out;
  });
  const globals = pkg.globals.filter((g) => !world.globals.some((x) => x.name === g.name));
  const templates = mergeLibrary(world.templates, pkg.templates, () => false).added;
  return {
    world: {
      ...world,
      bubbles: [...world.bubbles, ...bubbles],
      sharedScripts: [...world.sharedScripts, ...sharedMerge.added],
      customBlocks: [...world.customBlocks, ...customAdded],
      globals: [...world.globals, ...globals],
      templates: [...world.templates, ...templates],
    },
    ids: bubbles.map((b) => b.id),
  };
}

/** A whole-world package as the new world (paths replaced, ids kept). */
export function replaceWorld(
  world: World,
  data: PackageData,
  replacements: PathReplacement[],
): World {
  const empty: World = {
    ...world,
    bubbles: [],
    sharedScripts: [],
    customBlocks: [],
    globals: [],
    templates: [],
  };
  const out = importPackage(empty, data, { parentId: null, replacements }).world;
  return { ...out, homeView: data.homeView ?? world.homeView };
}

/** The package as a world of its own (for previews: tree, dangerous blocks, paths). */
export function packageWorld(data: PackageData, base: World): World {
  return { ...base, ...clone(data), homeView: data.homeView ?? base.homeView };
}
