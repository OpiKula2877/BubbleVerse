import type { Bubble, Script, ScriptArg, ScriptNode, ScriptSlot, World } from '@bv/world';
import { BLOCKS, OP } from './generated/catalog';
import type { CatalogBlock } from './catalog-types';

/** Compact script format helpers (spec §9.3). */

const byOp = new Map<number, CatalogBlock>(BLOCKS.map((b) => [b.op, b]));

export function blockByOp(op: number): CatalogBlock | undefined {
  return byOp.get(op);
}

export function isNode(arg: unknown): arg is ScriptNode {
  return Array.isArray(arg) && typeof arg[0] === 'number';
}

export function isNodeList(arg: unknown): arg is ScriptNode[] {
  return Array.isArray(arg) && (arg.length === 0 || Array.isArray(arg[0]));
}

/** Visits every node of a node tree (depth first). */
export function walkNodes(nodes: readonly ScriptNode[], visit: (node: ScriptNode) => void): void {
  const walkArg = (arg: ScriptArg) => {
    if (isNode(arg)) walk(arg);
    else if (isNodeList(arg)) for (const n of arg) walk(n);
  };
  const walk = (node: ScriptNode) => {
    visit(node);
    for (let i = 1; i < node.length; i++) walkArg(node[i] as ScriptArg);
  };
  for (const n of nodes) walk(n);
}

export function scriptNodes(script: Script): ScriptNode[] {
  return [script.trigger, ...script.body];
}

/** The script a slot runs: inline, or the referenced shared script. */
export function resolveSlot(world: World, slot: ScriptSlot): Script | null {
  if (slot.kind === 'inline') return slot.script;
  return world.sharedScripts.find((s) => s.id === slot.ref)?.script ?? null;
}

/**
 * Dangerous blocks used by a bubble's scripts, found from the script content itself
 * (never from a package manifest, spec §5.6). Custom blocks are followed.
 */
export function dangerousBlocks(world: World, bubble: Bubble): string[] {
  const found = new Set<string>();
  const seenCustom = new Set<string>();
  const visit = (nodes: readonly ScriptNode[]) =>
    walkNodes(nodes, (node) => {
      const def = byOp.get(node[0]);
      if (def?.danger) found.add(def.id);
      if (node[0] === OP.cb_call && typeof node[1] === 'string' && !seenCustom.has(node[1])) {
        seenCustom.add(node[1]);
        const custom = world.customBlocks.find((c) => c.id === node[1]);
        if (custom) visit(custom.body);
      }
    });
  for (const slot of bubble.scripts) {
    const script = resolveSlot(world, slot);
    if (script) visit(scriptNodes(script));
  }
  return [...found].sort();
}

/** Short name of a catalog block: its text up to the first input (`run file`). */
export function blockLabel(id: string | null, lang: 'en' | 'cs'): string {
  if (!id) return '';
  const b = BLOCKS.find((x) => x.id === id);
  if (!b) return id;
  const text = (lang === 'cs' ? b.cs : b.en).replace(/s+/g, ' ');
  const head = text.split(/%[A-Z_0-9]+/)[0]!.trim();
  return head || text.replace(/%[A-Z_0-9]+/g, '…').trim();
}

export function newScript(trigger: ScriptNode, body: ScriptNode[] = []): Script {
  return { v: 1, trigger, body, runMode: 'ignore' };
}
