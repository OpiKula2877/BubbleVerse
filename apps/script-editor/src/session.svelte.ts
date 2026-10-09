import {
  applyScriptEdit,
  BLOCKS,
  blocklyToCustomBody,
  blocklyToScripts,
  customBlockUses,
  customToBlockly,
  inlineToShared,
  macroToNodes,
  scriptsToBlockly,
  sharedToInline,
  stackToBlockly,
  syncParams,
  usedVariables,
  type BlockState,
  type Lang,
  type Layout,
  type MacroEvent,
  type ScriptEdit,
  type UsedVariable,
  type WorkspaceState,
} from '@bv/blocks';
import { getCore, t, tk, type LogEntry, type TraceEvent } from '@bv/ui';
import {
  newId,
  WorldIndex,
  type CustomBlock,
  type ParamDef,
  type RunMode,
  type Script,
  type ScriptSlot,
  type SharedScript,
  type Value,
  type World,
} from '@bv/world';
import { emitTo, listen } from '@tauri-apps/api/event';
import { Blockly, defineCustomBlock, type Workspace } from './blockly-setup';

/** One tab of the editor: the bubble's own scripts, one shared script or one custom block. */
export interface Doc {
  key: string;
  kind: 'inline' | 'shared' | 'custom';
  /** Shared script or custom block id; the bubble id for own scripts. */
  id: string;
  state: WorkspaceState;
  /** Changed since loading or saving. */
  changed: boolean;
  /** Node → block id of the saved scripts, to highlight runs of the saved version. */
  savedMaps: string[][];
  /** Custom block tabs can be closed; their changes are still saved. */
  open: boolean;
  /** No stored layout yet: Blockly arranges the scripts in a column when shown. */
  arrange: boolean;
}

export interface ConsoleLine {
  id: number;
  at: number;
  level: 'info' | 'error' | 'system';
  text: string;
  path: string;
  block: string;
  /** From this bubble. */
  mine: boolean;
  /** Where to jump when the line is clicked. */
  jump: { doc: string; block: string } | null;
}

export interface TestRun {
  task: number;
  doc: string;
  map: string[];
  started: number;
  step: boolean;
  paused: boolean;
}

export interface PanelInfo {
  hat: { id: string; type: string; runMode: RunMode; scope: string | null } | null;
  vars: UsedVariable[];
  params: ParamDef[];
}

export interface EditorRequest {
  bubble: string;
  world: World;
}

const EMPTY_STATE: WorkspaceState = { blocks: { languageVersion: 0, blocks: [] } };
const MAX_LINES = 500;
const SAVE_TIMEOUT_MS = 15000;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Block states without ids: Blockly gives them new ones (no clashes with loaded blocks). */
export function stripIds(b: BlockState): BlockState {
  const out: BlockState = { ...b };
  delete out.id;
  if (b.inputs) {
    out.inputs = Object.fromEntries(
      Object.entries(b.inputs).map(([k, v]) => [
        k,
        {
          ...(v.block ? { block: stripIds(v.block) } : {}),
          ...(v.shadow ? { shadow: stripIds(v.shadow) } : {}),
        },
      ]),
    );
  }
  if (b.next?.block) out.next = { block: stripIds(b.next.block) };
  return out;
}

/** Custom block calls keep only the inputs the block still has. */
function fitCustomCalls(b: BlockState, custom: readonly CustomBlock[]): BlockState {
  const out: BlockState = { ...b };
  if (b.inputs) {
    let entries = Object.entries(b.inputs);
    if (b.type.startsWith('bv_custom_')) {
      const c = custom.find((x) => `bv_custom_${x.id}` === b.type);
      const n = c?.params.length ?? 0;
      entries = entries.filter(([k]) => !/^ARG\d+$/.test(k) || Number(k.slice(3)) < n);
    }
    out.inputs = Object.fromEntries(
      entries.map(([k, v]) => [
        k,
        {
          ...(v.block ? { block: fitCustomCalls(v.block, custom) } : {}),
          ...(v.shadow ? { shadow: v.shadow } : {}),
        },
      ]),
    );
  }
  if (b.next?.block) out.next = { block: fitCustomCalls(b.next.block, custom) };
  return out;
}

function parseRunMode(data: string | undefined | null): RunMode {
  try {
    const m = data ? (JSON.parse(data) as { runMode?: RunMode }).runMode : undefined;
    return m === 'restart' || m === 'parallel' ? m : 'ignore';
  } catch {
    return 'ignore';
  }
}

/** A typed value from a text field: number, yes/no or text. */
export function parseValue(text: string): Value {
  const s = text.trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s !== '' && !Number.isNaN(Number(s))) return Number(s);
  return text;
}

export function formatValue(v: Value | undefined): string {
  if (v === undefined || v === null) return '';
  return typeof v === 'string' ? v : JSON.stringify(v);
}

/** Short name of a catalog block for the console (`run file` instead of `sys_run_file`). */
export function blockLabel(id: string | null, lang: Lang): string {
  if (!id) return '';
  const b = BLOCKS.find((x) => x.id === id);
  if (!b) return id;
  return (lang === 'cs' ? b.cs : b.en)
    .replace(/%[A-Z_0-9]+/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
}

export class EditorSession {
  readonly core = getCore();
  world = $state.raw<World | null>(null);
  bubbleId = $state('');
  docs = $state.raw<Doc[]>([]);
  current = $state('inline');
  dirty = $state(false);
  missing = $state(false);
  lines = $state.raw<ConsoleLine[]>([]);
  test = $state.raw<TestRun | null>(null);
  recording = $state(false);
  saving = $state(false);
  panel = $state.raw<PanelInfo>({ hat: null, vars: [], params: [] });
  /** Working copies: the bubble's slots, its shared scripts and the custom block library. */
  slots = $state.raw<ScriptSlot[]>([]);
  shared = $state.raw<SharedScript[]>([]);
  customBlocks = $state.raw<CustomBlock[]>([]);
  values = $state.raw<{ g: Record<string, Value>; b: Record<string, Value> }>({ g: {}, b: {} });
  lang: Lang = 'en';
  ws: Workspace | null = null;
  private removedCustom: string[] = [];
  private loading = false;
  private lineId = 0;
  private lastTest: TestRun | null = null;
  private panelTimer = 0;
  /** Last selected block: Blockly drops its selection when a toolbar button takes the focus. */
  private selectedId: string | null = null;

  get bubble() {
    return this.world?.bubbles.find((b) => b.id === this.bubbleId) ?? null;
  }

  get path(): string {
    return this.world && this.bubble ? new WorldIndex(this.world).pathString(this.bubbleId) : '';
  }

  get doc(): Doc | undefined {
    return this.docs.find((d) => d.key === this.current);
  }

  // ------------------------------------------------------------------ loading

  async load(req: EditorRequest): Promise<void> {
    this.world = req.world;
    this.bubbleId = req.bubble;
    this.missing = !this.bubble;
    this.slots = clone(this.bubble?.scripts ?? []);
    this.customBlocks = clone(req.world.customBlocks);
    this.removedCustom = [];
    this.shared = this.slots.flatMap((s) => {
      if (s.kind !== 'shared') return [];
      const found = req.world.sharedScripts.find((x) => x.id === s.ref);
      return found ? [clone(found)] : [];
    });
    const docs: Doc[] = [];
    const inline = this.slots.flatMap((s) => (s.kind === 'inline' ? [s.script] : []));
    const inlineLayout = await this.readLayout(req.bubble, 'inline');
    const conv = scriptsToBlockly(inline, inlineLayout);
    docs.push({
      ...this.newDoc('inline', 'inline', req.bubble, conv.state, conv.nodeMaps),
      arrange: !inlineLayout && inline.length > 1,
    });
    for (const s of this.shared) {
      const c = scriptsToBlockly([s.script], await this.readLayout(`shared:${s.id}`, 'script'));
      docs.push(this.newDoc(`shared:${s.id}`, 'shared', s.id, c.state, c.nodeMaps));
    }
    this.docs = docs;
    this.current = 'inline';
    this.dirty = false;
    this.test = null;
    this.showDoc(docs[0]!);
    void this.core.call('editor_trace', { bubble: req.bubble }).catch(() => {});
    void this.refreshValues();
  }

  private newDoc(
    key: string,
    kind: Doc['kind'],
    id: string,
    state: WorkspaceState,
    savedMaps: string[][] = [],
  ): Doc {
    return { key, kind, id, state, changed: false, savedMaps, open: true, arrange: false };
  }

  private async readLayout(owner: string, slot: string): Promise<Layout | undefined> {
    try {
      const data = await this.core.call<string | null>('get_script_layout', { owner, slot });
      return data ? (JSON.parse(data) as Layout) : undefined;
    } catch {
      return undefined;
    }
  }

  /** The main window's draft changed (rename, undo…). Reload only when nothing is unsaved here. */
  updateWorld(world: World): void {
    const before = this.world;
    this.world = world;
    this.missing = !this.bubble;
    if (this.dirty || this.missing || !before) return;
    const was = before.bubbles.find((b) => b.id === this.bubbleId)?.scripts;
    const sharedIds = this.shared.map((s) => s.id);
    const pick = (w: World) => ({
      shared: w.sharedScripts.filter((s) => sharedIds.includes(s.id)),
      custom: w.customBlocks,
    });
    if (
      JSON.stringify(was) !== JSON.stringify(this.bubble?.scripts) ||
      JSON.stringify(pick(before)) !== JSON.stringify(pick(world))
    ) {
      const current = this.current;
      void this.load({ bubble: this.bubbleId, world }).then(() => {
        if (this.docs.some((d) => d.key === current)) this.show(current);
      });
    }
  }

  // ------------------------------------------------------------------ workspace

  private showState(state: WorkspaceState): void {
    const ws = this.ws;
    if (!ws) return;
    this.selectedId = null;
    this.loading = true;
    Blockly.Events.disable();
    try {
      Blockly.serialization.workspaces.load(
        clone(fitState(state, this.customBlocks)) as object,
        ws,
      );
    } catch (e) {
      this.system(String(e), 'error');
    } finally {
      Blockly.Events.enable();
      this.loading = false;
    }
    ws.clearUndo();
    this.schedulePanel();
  }

  private showDoc(d: Doc): void {
    this.showState(d.state);
    if (d.arrange && this.ws) {
      this.loading = true;
      Blockly.Events.disable();
      this.ws.cleanUp();
      Blockly.Events.enable();
      this.loading = false;
      this.replaceDoc({ ...d, arrange: false, state: this.stateOf(d) });
    }
  }

  /** Workspace content of the current tab (live) or of another tab (last state). */
  stateOf(doc: Doc): WorkspaceState {
    if (doc.key === this.current && this.ws) {
      return Blockly.serialization.workspaces.save(this.ws) as unknown as WorkspaceState;
    }
    return doc.state;
  }

  private keepCurrent(): void {
    const d = this.doc;
    if (d && this.ws) this.replaceDoc({ ...d, state: this.stateOf(d) });
  }

  private replaceDoc(next: Doc): void {
    this.docs = this.docs.map((d) => (d.key === next.key ? next : d));
  }

  show(key: string): void {
    if (key === this.current) return;
    this.keepCurrent();
    const d = this.docs.find((x) => x.key === key);
    if (!d) return;
    this.current = key;
    if (!d.open) this.replaceDoc({ ...d, open: true });
    this.showDoc(d);
  }

  /** Called by Blockly for every change. */
  onChange(e: Blockly.Events.Abstract): void {
    if (this.loading) return;
    if (e.isUiEvent) {
      if (e.type === Blockly.Events.SELECTED) {
        const id = (e as Blockly.Events.Selected).newElementId ?? null;
        const inside = this.ws?.getInjectionDiv().contains(document.activeElement) ?? false;
        if (id || inside) this.selectedId = id;
        this.schedulePanel();
      }
      return;
    }
    this.touch();
    this.schedulePanel();
  }

  /** Marks the current tab (and the editor) as changed. */
  touch(): void {
    const d = this.doc;
    if (d && !d.changed) this.replaceDoc({ ...d, changed: true });
    this.dirty = true;
  }

  // ------------------------------------------------------------------ side panel

  private schedulePanel(): void {
    clearTimeout(this.panelTimer);
    this.panelTimer = window.setTimeout(() => this.refreshPanel(), 120);
  }

  /** The hat of the selected block's script, else the first script of the tab. */
  selectedHat(): Blockly.BlockSvg | null {
    const ws = this.ws;
    if (!ws) return null;
    const current = Blockly.common.getSelected();
    const sel = current ?? (this.selectedId ? ws.getBlockById(this.selectedId) : null);
    if (sel instanceof Blockly.BlockSvg && sel.workspace === ws) {
      const root = sel.getRootBlock();
      if (isHat(root.type)) return root;
    }
    return ws.getTopBlocks(true).find((b) => isHat(b.type)) ?? null;
  }

  refreshPanel(): void {
    const d = this.doc;
    if (!d || !this.ws) return;
    const hat = this.selectedHat();
    const scripts = this.scriptsFor(d);
    let params: ParamDef[] = [];
    if (d.kind === 'shared') {
      const s = this.shared.find((x) => x.id === d.id);
      if (s) params = syncParams({ ...s, script: scripts[0] ?? s.script }).params;
    } else if (d.kind === 'custom') {
      params = this.customBlocks.find((c) => c.id === d.id)?.params ?? [];
    }
    this.panel = {
      hat: hat
        ? {
            id: hat.id,
            type: hat.type,
            runMode: parseRunMode(hat.data),
            scope: hat.type === 'ev_hotkey' ? String(hat.getFieldValue('SCOPE')) : null,
          }
        : null,
      vars: usedVariables(scripts),
      params,
    };
  }

  /** Scripts of a tab (a custom block's body counts as one script). */
  scriptsFor(d: Doc): Script[] {
    try {
      const state = this.stateOf(d);
      if (d.kind === 'custom')
        return [blocklyToScripts(asScriptState(state)).scripts[0]].filter(Boolean) as Script[];
      return blocklyToScripts(state).scripts;
    } catch {
      return [];
    }
  }

  setRunMode(mode: RunMode): void {
    const hat = this.selectedHat();
    if (!hat) return;
    let data: Record<string, unknown> = {};
    try {
      data = hat.data ? (JSON.parse(hat.data) as Record<string, unknown>) : {};
    } catch {
      /* foreign data */
    }
    hat.data = JSON.stringify({ ...data, runMode: mode });
    this.touch();
    this.refreshPanel();
  }

  setScope(scope: string): void {
    this.selectedHat()?.setFieldValue(scope, 'SCOPE');
  }

  /** Type or default of a shared script parameter. */
  setParam(name: string, patch: Partial<ParamDef>): void {
    const d = this.doc;
    if (d?.kind !== 'shared') return;
    this.shared = this.shared.map((s) => {
      if (s.id !== d.id) return s;
      const synced = syncParams({ ...s, script: this.scriptsFor(d)[0] ?? s.script });
      return {
        ...synced,
        params: synced.params.map((p) => (p.name === name ? { ...p, ...patch } : p)),
      };
    });
    this.touch();
    this.refreshPanel();
  }

  /** The bubble's own value of a shared script parameter (`undefined` = default). */
  paramValue(name: string): Value | undefined {
    const d = this.doc;
    const slot = this.slots.find((s) => s.kind === 'shared' && s.ref === d?.id);
    return slot?.kind === 'shared' ? slot.params[name] : undefined;
  }

  setParamValue(name: string, value: Value | undefined): void {
    const d = this.doc;
    this.slots = this.slots.map((s) => {
      if (s.kind !== 'shared' || s.ref !== d?.id) return s;
      const params = { ...s.params };
      if (value === undefined) delete params[name];
      else params[name] = value;
      return { ...s, params };
    });
    this.touch();
  }

  sharedName(id: string): string {
    return this.shared.find((s) => s.id === id)?.name ?? '';
  }

  customName(id: string): string {
    return this.customBlocks.find((c) => c.id === id)?.name ?? '';
  }

  /** Shared scripts of the library the bubble does not use yet. */
  get availableShared(): SharedScript[] {
    const used = new Set(this.shared.map((s) => s.id));
    return (this.world?.sharedScripts ?? []).filter((s) => !used.has(s.id));
  }

  // ------------------------------------------------------------------ shared scripts (⇄)

  addShared(id: string): void {
    const s = this.world?.sharedScripts.find((x) => x.id === id);
    if (!s) return;
    this.keepCurrent();
    this.slots = [...this.slots, { kind: 'shared', ref: id, params: {} }];
    this.shared = [...this.shared, clone(s)];
    const c = scriptsToBlockly([s.script]);
    this.docs = [...this.docs, this.newDoc(`shared:${id}`, 'shared', id, c.state)];
    this.dirty = true;
    this.show(`shared:${id}`);
  }

  removeShared(id: string): void {
    this.keepCurrent();
    this.slots = this.slots.filter((s) => !(s.kind === 'shared' && s.ref === id));
    this.shared = this.shared.filter((s) => s.id !== id);
    this.docs = this.docs.filter((d) => d.key !== `shared:${id}`);
    this.dirty = true;
    if (this.current === `shared:${id}`) {
      this.current = '';
      this.show('inline');
    }
  }

  /** ⇄ on the selected own script: it becomes a shared script in the library. */
  toShared(name: string): boolean {
    const hat = this.selectedHat();
    const d = this.doc;
    if (!hat || d?.kind !== 'inline' || !this.ws) return false;
    const conv = blocklyToScripts(this.stateOf(d));
    const i = conv.nodeMaps.findIndex((m) => m[0] === hat.id);
    const script = conv.scripts[i];
    if (!script) return false;
    const id = newId();
    const { shared, slot } = inlineToShared(script, id, name);
    hat.dispose(false);
    this.keepCurrent();
    this.slots = [...this.slots, slot];
    this.shared = [...this.shared, shared];
    const c = scriptsToBlockly([script]);
    this.docs = [
      ...this.docs,
      { ...this.newDoc(`shared:${id}`, 'shared', id, c.state), changed: true },
    ];
    this.dirty = true;
    this.show(`shared:${id}`);
    return true;
  }

  /** ⇄ on a shared script: the bubble gets its own copy with its values filled in. */
  toInline(): void {
    const d = this.doc;
    if (d?.kind !== 'shared') return;
    const s = this.shared.find((x) => x.id === d.id);
    const slot = this.slots.find((x) => x.kind === 'shared' && x.ref === d.id);
    if (!s || slot?.kind !== 'shared') return;
    const working = { ...s, script: this.scriptsFor(d)[0] ?? s.script };
    const script = sharedToInline(syncParams(working), slot.params);
    this.removeShared(d.id);
    const hat = scriptsToBlockly([script]).state.blocks.blocks[0];
    if (hat && this.ws) {
      const block = Blockly.serialization.blocks.append(
        stripIds(hat) as unknown as Blockly.serialization.blocks.State,
        this.ws,
      );
      this.placeVisible(block);
    }
    this.touch();
  }

  // ------------------------------------------------------------------ custom blocks

  makeBlock(name: string, params: ParamDef[]): void {
    const c: CustomBlock = { id: newId(), name, params, body: [] };
    this.customBlocks = [...this.customBlocks, c];
    defineCustomBlock(c);
    this.dirty = true;
    this.openCustom(c.id);
  }

  editBlock(id: string, name: string, params: ParamDef[]): void {
    this.keepCurrent();
    this.customBlocks = this.customBlocks.map((c) => (c.id === id ? { ...c, name, params } : c));
    const c = this.customBlocks.find((x) => x.id === id);
    if (c) defineCustomBlock(c);
    const d = this.docs.find((x) => x.key === `custom:${id}`);
    if (d) {
      // The definition hat shows the name.
      const blocks = d.state.blocks.blocks.map((b) =>
        b.type === 'cb_define' ? { ...b, fields: { ...b.fields, NAME: name } } : b,
      );
      this.replaceDoc({ ...d, state: { blocks: { ...d.state.blocks, blocks } } });
    }
    this.dirty = true;
    // Calls on the current tab get the new inputs.
    const cur = this.doc;
    if (cur) this.showState(cur.state);
  }

  async openCustom(id: string): Promise<void> {
    if (this.docs.some((d) => d.key === `custom:${id}`)) {
      this.show(`custom:${id}`);
      return;
    }
    const c = this.customBlocks.find((x) => x.id === id);
    if (!c) return;
    const layout = await this.readLayout(`custom:${id}`, 'body');
    const state = customToBlockly(c, layout?.positions[0]);
    for (const b of layout?.loose ?? []) state.blocks.blocks.push(b);
    this.keepCurrent();
    this.docs = [...this.docs, this.newDoc(`custom:${id}`, 'custom', id, state)];
    this.show(`custom:${id}`);
  }

  closeCustom(key: string): void {
    const d = this.docs.find((x) => x.key === key);
    if (!d) return;
    if (this.current === key) {
      this.keepCurrent();
      this.replaceDoc({ ...this.doc!, open: false });
      this.current = '';
      this.show('inline');
    } else {
      this.replaceDoc({ ...d, open: false });
    }
  }

  /** Calls of a custom block in the world and in the open tabs. */
  customUses(id: string): number {
    if (!this.world) return 0;
    let w: World = { ...this.world, customBlocks: this.customBlocks };
    const inline = this.docs.find((d) => d.kind === 'inline');
    if (inline) {
      const scripts = blocklyToScripts(this.stateOf(inline)).scripts;
      w = applyScriptEdit(w, {
        bubble: this.bubbleId,
        scripts: scripts.map((script) => ({ kind: 'inline' as const, script })),
        sharedScripts: [],
        customBlocks: [],
        removedCustomBlocks: [],
      });
    }
    return customBlockUses(w, id);
  }

  deleteBlock(id: string): void {
    this.customBlocks = this.customBlocks.filter((c) => c.id !== id);
    this.removedCustom = [...this.removedCustom, id];
    this.docs = this.docs.filter((d) => d.key !== `custom:${id}`);
    this.dirty = true;
    if (this.current === `custom:${id}`) {
      this.current = '';
      this.show('inline');
    }
  }

  /** Custom blocks with the bodies as the open tabs have them. */
  private currentCustomBlocks(): CustomBlock[] {
    return this.customBlocks.map((c) => {
      const d = this.docs.find((x) => x.key === `custom:${c.id}`);
      if (!d) return c;
      const state = this.stateOf(d);
      const hat = state.blocks.blocks.find((b) => b.type === 'cb_define');
      const name = String(hat?.fields?.NAME ?? c.name).trim() || c.name;
      return { ...c, name, body: blocklyToCustomBody(state) };
    });
  }

  // ------------------------------------------------------------------ saving

  /** Builds what Save changes; `null` when a tab cannot be saved (the reason is in the console). */
  buildEdit(): { edit: ScriptEdit; layouts: [string, string, Layout][] } | null {
    this.keepCurrent();
    const layouts: [string, string, Layout][] = [];
    const inline = this.docs.find((d) => d.kind === 'inline');
    const conv = inline ? blocklyToScripts(inline.state) : null;
    if (conv) layouts.push([this.bubbleId, 'inline', cleanLayout(conv.layout)]);
    const sharedOut: SharedScript[] = [];
    for (const d of this.docs.filter((x) => x.kind === 'shared')) {
      const c = blocklyToScripts(d.state);
      if (c.scripts.length !== 1) {
        this.system(tk('editor.sharedOneTrigger', { name: this.sharedName(d.id) }), 'error');
        this.show(d.key);
        return null;
      }
      const s = this.shared.find((x) => x.id === d.id);
      if (s) sharedOut.push(syncParams({ ...s, script: c.scripts[0]! }));
      layouts.push([`shared:${d.id}`, 'script', cleanLayout(c.layout)]);
    }
    const custom = this.currentCustomBlocks();
    for (const d of this.docs.filter((x) => x.kind === 'custom')) {
      const hat = d.state.blocks.blocks.find((b) => b.type === 'cb_define');
      const loose = d.state.blocks.blocks.filter((b) => b !== hat).map(stripIds);
      layouts.push([
        `custom:${d.id}`,
        'body',
        { positions: [{ x: hat?.x ?? 40, y: hat?.y ?? 40 }], loose },
      ]);
    }
    const before = this.world?.customBlocks ?? [];
    const changedCustom = custom.filter(
      (c) => JSON.stringify(c) !== JSON.stringify(before.find((b) => b.id === c.id)),
    );
    const slots: ScriptSlot[] = [
      ...(conv?.scripts ?? []).map((script) => ({ kind: 'inline' as const, script })),
      ...this.slots.filter((s) => s.kind === 'shared'),
    ];
    return {
      edit: {
        bubble: this.bubbleId,
        scripts: slots,
        sharedScripts: sharedOut,
        customBlocks: changedCustom,
        removedCustomBlocks: this.removedCustom,
      },
      layouts,
    };
  }

  /** Save: the main window writes the scripts into its draft and saves it (DECISIONS). */
  async save(): Promise<boolean> {
    if (this.saving || this.missing) return false;
    const built = this.buildEdit();
    if (!built) return false;
    this.saving = true;
    try {
      await this.requestSave(built.edit);
      for (const [owner, slot, layout] of built.layouts) {
        await this.core
          .call('set_script_layout', { owner, slot, data: JSON.stringify(layout) })
          .catch(() => {});
      }
      const world = applyScriptEdit(this.world!, built.edit);
      const current = this.current;
      await this.load({ bubble: this.bubbleId, world });
      if (this.docs.some((d) => d.key === current)) this.show(current);
      this.system(t('editor.saved'));
      return true;
    } catch (e) {
      this.system(tk('editor.saveFailed', { message: String(e) }), 'error');
      return false;
    } finally {
      this.saving = false;
    }
  }

  private async requestSave(edit: ScriptEdit): Promise<void> {
    if (!this.core.isTauri) return;
    const id = `${Date.now()}-${Math.random()}`;
    let off: (() => void) | null = null;
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('timeout')), SAVE_TIMEOUT_MS);
        void listen<{ id: string; ok: boolean; error?: string }>('bv://editor-saved', (e) => {
          if (e.payload.id !== id) return;
          clearTimeout(timer);
          if (e.payload.ok) resolve();
          else reject(new Error(e.payload.error ?? 'save failed'));
        }).then((u) => {
          off = u;
          void emitTo('main', 'bv://editor-save', { id, edit });
        });
      });
    } finally {
      (off as (() => void) | null)?.();
    }
  }

  // ------------------------------------------------------------------ test, step, stop

  async runTest(step: boolean): Promise<void> {
    const d = this.doc;
    if (!d || !this.ws) return;
    const state = this.stateOf(d);
    let params: Record<string, Value> = {};
    const conv = blocklyToScripts(d.kind === 'custom' ? asScriptState(state) : state);
    const hat = this.selectedHat();
    const i = Math.max(0, hat ? conv.nodeMaps.findIndex((m) => m[0] === hat.id) : 0);
    const script: Script | undefined = conv.scripts[i];
    const map: string[] = conv.nodeMaps[i] ?? [];
    if (d.kind === 'shared') {
      const s = this.shared.find((x) => x.id === d.id);
      const slot = this.slots.find((x) => x.kind === 'shared' && x.ref === d.id);
      const defs = s && script ? syncParams({ ...s, script }).params : [];
      params = Object.fromEntries(defs.map((p) => [p.name, p.default]));
      if (slot?.kind === 'shared') params = { ...params, ...slot.params };
    }
    if (!script) {
      this.system(t('editor.nothingToTest'), 'error');
      return;
    }
    try {
      const task = await this.core.call<number>('test_script', {
        req: {
          bubble: this.bubbleId,
          path: this.path,
          script,
          params,
          customBlocks: this.currentCustomBlocks(),
          step,
        },
      });
      this.test = { task, doc: d.key, map, started: Date.now(), step, paused: false };
      this.lastTest = this.test;
      this.system(t(step ? 'editor.stepStarted' : 'editor.testStarted'));
    } catch (e) {
      this.system(tk('editor.testFailed', { message: errorText(e) }), 'error');
    }
  }

  async step(): Promise<void> {
    if (this.test?.step) await this.core.call('step_script', { task: this.test.task });
    else await this.runTest(true);
  }

  async stop(): Promise<void> {
    await this.core.call('stop_bubble_scripts', { bubble: this.bubbleId }).catch(() => {});
  }

  highlight(id: string | null): void {
    const ws = this.ws;
    if (!ws) return;
    if (id && !ws.getBlockById(id)) return;
    ws.highlightBlock(id);
  }

  /** Where a run of the saved version is in the tabs: (tab, script index) of a slot. */
  private slotTarget(slot: number): { doc: Doc; script: number } | null {
    const s = this.slots[slot];
    if (!s) return null;
    if (s.kind === 'inline') {
      const doc = this.docs.find((d) => d.kind === 'inline');
      const index = this.slots.slice(0, slot).filter((x) => x.kind === 'inline').length;
      return doc ? { doc, script: index } : null;
    }
    const doc = this.docs.find((d) => d.key === `shared:${s.ref}`);
    return doc ? { doc, script: 0 } : null;
  }

  onTrace(ev: TraceEvent): void {
    if (ev.bubble !== this.bubbleId) return;
    const test = this.test;
    if (test && ev.task === test.task) {
      if (ev.node === null) {
        this.highlight(null);
        this.system(tk('editor.testDone', { ms: Date.now() - test.started }));
        this.test = null;
        void this.refreshValues();
        return;
      }
      if (test.paused !== ev.paused) this.test = { ...test, paused: ev.paused };
      if (this.current === test.doc) this.highlight(test.map[ev.node] ?? null);
      return;
    }
    if (ev.slot === null || this.dirty) return;
    const target = this.slotTarget(ev.slot);
    if (!target || target.doc.key !== this.current || target.doc.changed) return;
    this.highlight(
      ev.node === null ? null : (target.doc.savedMaps[target.script]?.[ev.node] ?? null),
    );
  }

  // ------------------------------------------------------------------ console

  private push(line: Omit<ConsoleLine, 'id'>): void {
    const next = [...this.lines, { ...line, id: ++this.lineId }];
    this.lines = next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
  }

  system(text: string, level: 'system' | 'error' = 'system'): void {
    this.push({ at: Date.now(), level, text, path: '', block: '', mine: true, jump: null });
  }

  clearConsole(): void {
    this.lines = [];
  }

  onLog(e: LogEntry): void {
    const mine = e.bubble === this.bubbleId;
    let jump: ConsoleLine['jump'] = null;
    if (mine && e.node !== null) {
      const test = this.lastTest;
      if (test && e.task === test.task) {
        const block = test.map[e.node];
        if (block) jump = { doc: test.doc, block };
      } else if (e.slot !== null && !this.dirty) {
        const target = this.slotTarget(e.slot);
        const block = target?.doc.savedMaps[target.script]?.[e.node];
        if (target && block) jump = { doc: target.doc.key, block };
      }
    }
    this.push({
      at: e.at,
      level: e.level,
      text: logText(e),
      path: e.path,
      block: blockLabel(e.block, this.lang),
      mine,
      jump,
    });
    if (e.level === 'error' && jump) this.jumpTo(jump);
  }

  jumpTo(j: { doc: string; block: string }): void {
    this.show(j.doc);
    const b = this.ws?.getBlockById(j.block);
    if (b && this.ws) {
      b.select();
      this.ws.centerOnBlock(j.block, true);
    }
  }

  // ------------------------------------------------------------------ variables

  async refreshValues(): Promise<void> {
    if (!this.core.isTauri) return;
    try {
      const [g, b] = await Promise.all([
        this.core.call<Record<string, Value>>('get_globals'),
        this.core.call<Record<string, Value>>('bubble_variables', { bubble: this.bubbleId }),
      ]);
      this.values = { g, b };
    } catch {
      /* the core answers later */
    }
  }

  async setVariable(scope: 'b' | 'g', name: string, text: string): Promise<void> {
    const value = parseValue(text);
    if (scope === 'g') await this.core.call('set_global', { name, value });
    else await this.core.call('set_bubble_variable', { bubble: this.bubbleId, name, value });
    await this.refreshValues();
  }

  // ------------------------------------------------------------------ macro recording

  async toggleRecording(): Promise<void> {
    if (!this.recording) {
      await this.core.call('macro_start');
      this.recording = true;
      this.system(t('editor.recordingStarted'));
      return;
    }
    const events = await this.core.call<MacroEvent[]>('macro_stop').catch(() => [] as MacroEvent[]);
    this.recording = false;
    const nodes = macroToNodes(events);
    if (!nodes.length) {
      this.system(t('editor.macroEmpty'));
      return;
    }
    this.insertStack(nodes);
    this.system(tk('editor.macroAdded', { n: nodes.length }));
  }

  private insertStack(nodes: Parameters<typeof stackToBlockly>[0]): void {
    const ws = this.ws;
    const state = stackToBlockly(nodes, `m${Date.now()}.`);
    if (!ws || !state) return;
    const current = Blockly.common.getSelected();
    const selected = current ?? (this.selectedId ? ws.getBlockById(this.selectedId) : null);
    const block = Blockly.serialization.blocks.append(
      state as unknown as Blockly.serialization.blocks.State,
      ws,
    ) as Blockly.BlockSvg;
    if (
      selected instanceof Blockly.BlockSvg &&
      selected.workspace === ws &&
      selected.nextConnection &&
      block.previousConnection
    ) {
      selected.nextConnection.connect(block.previousConnection);
    } else {
      this.placeVisible(block);
    }
    block.select();
  }

  private placeVisible(block: Blockly.Block): void {
    const ws = this.ws;
    if (!ws || !(block instanceof Blockly.BlockSvg)) return;
    const view = ws.getMetricsManager().getViewMetrics(true);
    block.moveTo(new Blockly.utils.Coordinate(view.left + 60, view.top + 60));
  }
}

function isHat(type: string): boolean {
  const b = BLOCKS.find((x) => x.id === type);
  return b?.shape === 'hat';
}

/** A custom block tab as a script (its define hat becomes "when activated") for tests. */
function asScriptState(state: WorkspaceState): WorkspaceState {
  const blocks = state.blocks.blocks.map((b) =>
    b.type === 'cb_define' ? { ...b, type: 'ev_activate', fields: {} } : b,
  );
  return { blocks: { ...state.blocks, blocks } };
}

function fitState(state: WorkspaceState, custom: readonly CustomBlock[]): WorkspaceState {
  return {
    blocks: { ...state.blocks, blocks: state.blocks.blocks.map((b) => fitCustomCalls(b, custom)) },
  };
}

/** Loose blocks are stored without ids so they never clash with converted scripts. */
function cleanLayout(l: Layout): Layout {
  return { positions: l.positions, loose: l.loose.map(stripIds) };
}

function errorText(e: unknown): string {
  if (typeof e === 'object' && e && 'message' in e)
    return String((e as { message: unknown }).message);
  return String(e);
}

/** A log line: errors with a code are translated like everywhere else. */
function logText(e: LogEntry): string {
  if (!e.code) return e.text;
  const key = `error.${e.code === 'message' ? e.text : e.code}`;
  const text = tk(key, { path: e.detail ?? '', message: e.text });
  return text === key ? e.text : text;
}

export { EMPTY_STATE };
