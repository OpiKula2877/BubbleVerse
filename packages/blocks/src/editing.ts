import type {
  BubbleId,
  CustomBlock,
  ParamDef,
  Script,
  ScriptArg,
  ScriptNode,
  ScriptSlot,
  SharedScript,
  Value,
  World,
} from '@bv/world';
import { OP } from './generated/catalog';
import { blockByOp, isNode, isNodeList, scriptNodes, walkNodes } from './script';

/** Editing helpers of the script editor (spec §5.1, §5.3). */

/** Names of the `parameter` blocks of a script, in order of use. */
export function scriptParamNames(script: Script): string[] {
  const names: string[] = [];
  walkNodes(scriptNodes(script), (n) => {
    if (n[0] === OP.cb_param && typeof n[1] === 'string' && n[1] && !names.includes(n[1])) {
      names.push(n[1]);
    }
  });
  return names;
}

/** Parameter settings for every `parameter` block: existing ones stay, new ones are text. */
export function syncParams(shared: SharedScript): SharedScript {
  const params: ParamDef[] = scriptParamNames(shared.script).map(
    (name) => shared.params.find((p) => p.name === name) ?? { name, type: 'text', default: '' },
  );
  return { ...shared, params };
}

/** ⇄ on an own script: it moves to the library, the bubble keeps a reference (spec §5.3). */
export function inlineToShared(
  script: Script,
  id: string,
  name: string,
): { shared: SharedScript; slot: ScriptSlot } {
  const shared = syncParams({ id, name, params: [], script });
  return { shared, slot: { kind: 'shared', ref: id, params: {} } };
}

function literal(v: Value | undefined): ScriptArg {
  if (v === undefined || v === null) return '';
  // Blockly has no literal for yes/no inputs: a condition that is always true or false.
  if (typeof v === 'boolean') return [OP.op_eq, 1, v ? 1 : 0];
  if (typeof v === 'number' || typeof v === 'string') return v;
  return JSON.stringify(v);
}

/** ⇄ on a shared script: an own copy with the bubble's parameter values filled in. */
export function sharedToInline(shared: SharedScript, values: Record<string, Value>): Script {
  const valueOf = (name: string): ScriptArg => {
    const def = shared.params.find((p) => p.name === name);
    return literal(name in values ? values[name] : def?.default);
  };
  const mapArg = (a: ScriptArg): ScriptArg => {
    if (isNode(a)) {
      if (a[0] === OP.cb_param && typeof a[1] === 'string') return valueOf(a[1]);
      return mapNode(a);
    }
    if (isNodeList(a) && Array.isArray(a)) return a.map(mapNode);
    return a;
  };
  const mapNode = (n: ScriptNode): ScriptNode => [
    n[0],
    ...n.slice(1).map((a) => mapArg(a as ScriptArg)),
  ];
  const s = shared.script;
  return { ...s, trigger: mapNode(s.trigger), body: s.body.map(mapNode) };
}

export interface UsedVariable {
  scope: 's' | 'b' | 'g';
  name: string;
}

const SCOPE_ORDER = { s: 0, b: 1, g: 2 } as const;

/** Variables the scripts read or write (`var` inputs), without duplicates. */
export function usedVariables(scripts: readonly Script[]): UsedVariable[] {
  const seen = new Map<string, UsedVariable>();
  for (const s of scripts) {
    walkNodes(scriptNodes(s), (n) => {
      const def = blockByOp(n[0]);
      def?.inputs.forEach((input, i) => {
        const ref = n[i + 1];
        if (input.type !== 'var' || typeof ref !== 'string') return;
        const m = /^([sbg]):(.*)$/.exec(ref);
        const v: UsedVariable = m
          ? { scope: m[1] as 's' | 'b' | 'g', name: m[2]! }
          : { scope: 's', name: ref };
        if (v.name) seen.set(`${v.scope}:${v.name}`, v);
      });
    });
  }
  return [...seen.values()].sort(
    (a, b) => SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] || a.name.localeCompare(b.name),
  );
}

/** What Save in the script editor changes in the world. */
export interface ScriptEdit {
  bubble: BubbleId;
  /** All script slots of the bubble. */
  scripts: ScriptSlot[];
  /** Shared scripts that are new or changed. */
  sharedScripts: SharedScript[];
  /** Custom blocks that are new or changed. */
  customBlocks: CustomBlock[];
  removedCustomBlocks: string[];
}

function upsert<T extends { id: string }>(list: readonly T[], items: readonly T[]): T[] {
  const out = list.map((x) => items.find((i) => i.id === x.id) ?? x);
  for (const i of items) if (!list.some((x) => x.id === i.id)) out.push(i);
  return out;
}

export function applyScriptEdit(world: World, edit: ScriptEdit): World {
  return {
    ...world,
    bubbles: world.bubbles.map((b) => (b.id === edit.bubble ? { ...b, scripts: edit.scripts } : b)),
    sharedScripts: upsert(world.sharedScripts, edit.sharedScripts),
    customBlocks: upsert(world.customBlocks, edit.customBlocks).filter(
      (c) => !edit.removedCustomBlocks.includes(c.id),
    ),
  };
}

/** How many calls of a custom block there are in scripts, shared scripts and other blocks. */
export function customBlockUses(world: World, id: string): number {
  let n = 0;
  const count = (nodes: readonly ScriptNode[]) =>
    walkNodes(nodes, (node) => {
      if (node[0] === OP.cb_call && node[1] === id) n++;
    });
  for (const b of world.bubbles) {
    for (const slot of b.scripts) if (slot.kind === 'inline') count(scriptNodes(slot.script));
  }
  for (const s of world.sharedScripts) count(scriptNodes(s.script));
  for (const c of world.customBlocks) if (c.id !== id) count(c.body);
  return n;
}
