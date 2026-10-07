import type { RunMode, Script, ScriptArg, ScriptNode } from '@bv/world';
import type { CatalogBlock, CatalogInput } from '../catalog-types';
import { BLOCKS, OP } from '../generated/catalog';
import { CUSTOM_PREFIX, fieldNames } from './defs';

/**
 * Two-way conversion between Blockly's JSON serialization and the compact script format
 * (spec §9.3). Block positions are not part of scripts; they live in the layout.
 * Nodes are numbered in pre-order (trigger = 0) exactly like the Rust interpreter, so the
 * editor can highlight the running block (spec §5.5).
 */

export interface BlockState {
  type: string;
  id?: string;
  x?: number;
  y?: number;
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block?: BlockState; shadow?: BlockState }>;
  next?: { block?: BlockState };
  data?: string;
}

export interface WorkspaceState {
  blocks: { languageVersion: number; blocks: BlockState[] };
}

/** Positions of the scripts' hat blocks and blocks lying around (not part of any script). */
export interface Layout {
  positions: { x: number; y: number }[];
  loose: BlockState[];
}

export interface CustomBlockInfo {
  id: string;
  params: { name: string }[];
}

const byId = new Map<string, CatalogBlock>(BLOCKS.map((b) => [b.id, b]));
const byOp = new Map<number, CatalogBlock>(BLOCKS.map((b) => [b.op, b]));
const VALUE = new Set(['num', 'text', 'any', 'bool']);

function isNode(a: unknown): a is ScriptNode {
  return Array.isArray(a) && typeof a[0] === 'number';
}

function shadowFor(input: CatalogInput, literal: ScriptArg | undefined, id: string): BlockState | undefined {
  if (input.type === 'bool') return undefined;
  const value = literal !== undefined && literal !== null && !isNode(literal) && !Array.isArray(literal) ? literal : input.default;
  if (input.type === 'num' || (input.type === 'any' && typeof value === 'number')) {
    return { type: 'math_number', id, fields: { NUM: typeof value === 'number' ? value : Number(value ?? 0) || 0 } };
  }
  return { type: 'text', id, fields: { TEXT: value === undefined || value === null ? '' : String(value) } };
}

// ---------------------------------------------------------------- compact → Blockly

class ToBlockly {
  map: string[] = [];
  private counter = 0;

  constructor(private readonly prefix: string) {}

  block(node: ScriptNode): BlockState {
    const nodeId = this.counter++;
    const id = `${this.prefix}${nodeId}`;
    this.map[nodeId] = id;
    const op = node[0];
    if (op === OP.cb_call) {
      // Custom block call: [cb_call, id, ...args]
      const inputs: BlockState['inputs'] = {};
      node.slice(2).forEach((arg, i) => {
        const name = `ARG${i}`;
        inputs[name] = isNode(arg)
          ? { block: this.block(arg), shadow: { type: 'text', id: `${id}.s${i}`, fields: { TEXT: '' } } }
          : { shadow: { type: typeof arg === 'number' ? 'math_number' : 'text', id: `${id}.s${i}`, fields: typeof arg === 'number' ? { NUM: arg } : { TEXT: arg === null || arg === undefined ? '' : String(arg) } } };
      });
      return { type: `${CUSTOM_PREFIX}${String(node[1] ?? '')}`, id, inputs };
    }
    const def = byOp.get(op);
    if (!def) throw new Error(`unknown block ${op}`);
    const state: BlockState = { type: def.id, id };
    const fields: Record<string, unknown> = {};
    const inputs: NonNullable<BlockState['inputs']> = {};
    def.inputs.forEach((input, i) => {
      const arg = node[i + 1] as ScriptArg | undefined;
      if (VALUE.has(input.type)) {
        const shadow = shadowFor(input, isNode(arg) ? undefined : arg, `${id}.${input.name}`);
        const entry: { block?: BlockState; shadow?: BlockState } = {};
        if (shadow) entry.shadow = shadow;
        if (isNode(arg)) entry.block = this.block(arg);
        if (entry.block || entry.shadow) inputs[input.name] = entry;
      } else if (input.type === 'stack') {
        const list = Array.isArray(arg) && !isNode(arg) ? (arg as ScriptNode[]) : [];
        const first = this.chain(list);
        if (first) inputs[input.name] = { block: first };
      } else if (input.type === 'days') {
        const mask = typeof arg === 'string' ? arg : String(input.default ?? '1111111');
        fieldNames(input).forEach((f, d) => (fields[f] = mask[d] !== '0'));
      } else if (input.type === 'var') {
        const [scope, ...rest] = String(arg ?? input.default ?? 's:').split(':');
        fields[`${input.name}_SCOPE`] = rest.length ? scope : 's';
        fields[input.name] = rest.length ? rest.join(':') : scope;
      } else if (input.type === 'check') {
        fields[input.name] = arg === true;
      } else if (input.type === 'numf') {
        fields[input.name] = typeof arg === 'number' ? arg : Number(arg ?? input.default ?? 0);
      } else {
        fields[input.name] = arg === null || arg === undefined ? String(input.default ?? '') : String(arg);
      }
    });
    if (Object.keys(fields).length) state.fields = fields;
    if (Object.keys(inputs).length) state.inputs = inputs;
    return state;
  }

  chain(nodes: readonly ScriptNode[]): BlockState | undefined {
    let first: BlockState | undefined;
    let prev: BlockState | undefined;
    for (const n of nodes) {
      const b = this.block(n);
      if (prev) prev.next = { block: b };
      else first = b;
      prev = b;
    }
    return first;
  }
}

export interface ToBlocklyResult {
  state: WorkspaceState;
  /** nodeMaps[script][node] = Blockly block id. */
  nodeMaps: string[][];
}

export function scriptsToBlockly(scripts: readonly Script[], layout?: Layout): ToBlocklyResult {
  const blocks: BlockState[] = [];
  const nodeMaps: string[][] = [];
  scripts.forEach((s, i) => {
    const conv = new ToBlockly(`s${i}.`);
    const hat = conv.block(s.trigger);
    const body = conv.chain(s.body);
    if (body) hat.next = { block: body };
    hat.data = JSON.stringify({ runMode: s.runMode });
    const pos = layout?.positions[i] ?? { x: 40, y: 40 + i * 180 };
    hat.x = pos.x;
    hat.y = pos.y;
    blocks.push(hat);
    nodeMaps.push(conv.map);
  });
  for (const b of layout?.loose ?? []) blocks.push(b);
  return { state: { blocks: { languageVersion: 0, blocks } }, nodeMaps };
}

// ---------------------------------------------------------------- Blockly → compact

class FromBlockly {
  map: string[] = [];
  private counter = 0;

  node(b: BlockState): ScriptNode {
    const nodeId = this.counter++;
    this.map[nodeId] = b.id ?? '';
    if (b.type.startsWith(CUSTOM_PREFIX)) {
      const args: ScriptArg[] = [];
      for (let i = 0; b.inputs && `ARG${i}` in b.inputs; i++) args.push(this.value(b.inputs[`ARG${i}`]));
      return [OP.cb_call, b.type.slice(CUSTOM_PREFIX.length), ...args];
    }
    const def = byId.get(b.type);
    if (!def) throw new Error(`unknown block type ${b.type}`);
    const args: ScriptArg[] = def.inputs.map((input) => {
      const f = b.fields ?? {};
      if (VALUE.has(input.type)) return this.value(b.inputs?.[input.name]);
      if (input.type === 'stack') return this.chain(b.inputs?.[input.name]?.block);
      if (input.type === 'days') return fieldNames(input).map((n) => (truthy(f[n]) ? '1' : '0')).join('');
      if (input.type === 'var') return `${String(f[`${input.name}_SCOPE`] ?? 's')}:${String(f[input.name] ?? '')}`;
      if (input.type === 'check') return truthy(f[input.name]);
      if (input.type === 'numf') return Number(f[input.name] ?? 0);
      return f[input.name] === undefined ? '' : String(f[input.name]);
    });
    return [def.op, ...args];
  }

  value(entry: { block?: BlockState; shadow?: BlockState } | undefined): ScriptArg {
    if (!entry) return null;
    if (entry.block && entry.block.type !== 'math_number' && entry.block.type !== 'text') return this.node(entry.block);
    const lit = entry.block ?? entry.shadow;
    if (!lit) return null;
    if (lit.type === 'math_number') return Number(lit.fields?.NUM ?? 0);
    return String(lit.fields?.TEXT ?? '');
  }

  chain(first: BlockState | undefined): ScriptNode[] {
    const out: ScriptNode[] = [];
    for (let b = first; b; b = b.next?.block) out.push(this.node(b));
    return out;
  }
}

function truthy(v: unknown): boolean {
  return v === true || v === 'TRUE';
}

export interface FromBlocklyResult {
  scripts: Script[];
  nodeMaps: string[][];
  layout: Layout;
}

function isTriggerType(type: string): boolean {
  const def = byId.get(type);
  return !!def && def.shape === 'hat' && def.id !== 'cb_define';
}

/** Every trigger (hat) block with its chain becomes one script (spec §5.1). */
export function blocklyToScripts(state: WorkspaceState): FromBlocklyResult {
  const scripts: Script[] = [];
  const nodeMaps: string[][] = [];
  const layout: Layout = { positions: [], loose: [] };
  for (const top of state.blocks?.blocks ?? []) {
    if (!isTriggerType(top.type)) {
      layout.loose.push(top);
      continue;
    }
    const conv = new FromBlockly();
    const trigger = conv.node({ ...top, next: undefined });
    const body = conv.chain(top.next?.block);
    let runMode: RunMode = 'ignore';
    try {
      const data = top.data ? (JSON.parse(top.data) as { runMode?: RunMode }) : {};
      if (data.runMode === 'restart' || data.runMode === 'parallel') runMode = data.runMode;
    } catch {
      /* old or foreign data */
    }
    scripts.push({ v: 1, trigger, body, runMode });
    nodeMaps.push(conv.map);
    layout.positions.push({ x: top.x ?? 0, y: top.y ?? 0 });
  }
  return { scripts, nodeMaps, layout };
}

// ---------------------------------------------------------------- custom block bodies

/** A custom block's body as a workspace with its `define` hat. */
export function customToBlockly(c: { id: string; name: string; body: ScriptNode[] }, pos = { x: 40, y: 40 }): WorkspaceState {
  const conv = new ToBlockly(`c.`);
  const hat: BlockState = { type: 'cb_define', id: 'c.define', x: pos.x, y: pos.y, fields: { NAME: c.name } };
  const body = conv.chain(c.body);
  if (body) hat.next = { block: body };
  return { blocks: { languageVersion: 0, blocks: [hat] } };
}

export function blocklyToCustomBody(state: WorkspaceState): ScriptNode[] {
  const hat = state.blocks?.blocks?.find((b) => b.type === 'cb_define');
  if (!hat) return [];
  return new FromBlockly().chain(hat.next?.block);
}
