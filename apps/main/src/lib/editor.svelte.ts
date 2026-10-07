import { actionTarget } from '@bv/blocks';
import { t, tk } from '@bv/ui';
import {
  BUBBLE_PALETTE,
  clickSelect,
  copyBranches,
  createBubble,
  deleteBubbles,
  duplicateBranches,
  EMPTY_SELECTION,
  History,
  nextOrder,
  pasteBranches,
  reparent,
  SkinResolver,
  WorldIndex,
  type BranchClip,
  type BubbleId,
  type BubbleKind,
  type Camera,
  type ClickMods,
  type SelectionState,
  type SkinRef,
  type Vec2,
  type World,
} from '@bv/world';
import { store } from './store.svelte';

/** Autosave of the draft 2 s after the last change (spec §4.7). */
export const AUTOSAVE_MS = 2000;
export const GRID_SIZE = 40;

/** Edit mode: the draft world, undo/redo, selection, clipboard and saving. */
export class Editor {
  world = $state.raw<World>();
  selection = $state.raw<SelectionState>(EMPTY_SELECTION);
  canUndo = $state(false);
  canRedo = $state(false);
  /** Differs from the saved version. */
  dirty = $state(false);
  draftSavedAt = $state<number | null>(null);
  grid = $state(false);
  preview = $state(false);
  /** Action bubbles whose file does not exist (path check, spec §4.5). */
  missing = $state.raw<ReadonlySet<BubbleId>>(new Set());
  quickCreate = $state<{ id: BubbleId; x: number; y: number } | null>(null);
  menu = $state<{ x: number; y: number; target: BubbleId | null; world: Vec2 } | null>(null);
  treeOpen = $state(true);

  private history = new History();
  private clip: BranchClip | null = null;
  skinClip = $state.raw<SkinRef | null>(null);
  private autosaveTimer = 0;
  private colorTurn = 0;

  constructor(world: World, dirty = false) {
    this.world = world;
    this.dirty = dirty;
    void this.checkPaths();
  }

  get index(): WorldIndex {
    return new WorldIndex(this.world!);
  }

  get selected(): BubbleId[] {
    return [...this.selection.ids].filter((id) => this.index.get(id));
  }

  // ---------------------------------------------------------------- changes

  /** Applies an edit with undo. Edits with the same `key` in a row merge into one step. */
  apply(fn: (w: World) => World, key?: string): void {
    const prev = this.world!;
    const next = fn(prev);
    if (next === prev) return;
    this.history.record(prev, key);
    this.commit(next);
  }

  /** Replaces the world without recording a step (live dragging); call `record` afterwards. */
  live(next: World): void {
    this.world = next;
    store.renderer?.setWorld(next);
  }

  /** Records one undo step from `before` to the current world (end of a drag). */
  record(before: World): void {
    if (before === this.world) return;
    this.history.record(before);
    this.commit(this.world!);
  }

  private commit(next: World): void {
    this.world = next;
    this.canUndo = this.history.canUndo;
    this.canRedo = this.history.canRedo;
    this.dirty = true;
    store.renderer?.setWorld(next);
    this.scheduleAutosave();
  }

  undo(): void {
    const w = this.history.undo(this.world!);
    if (w) this.restore(w);
  }

  redo(): void {
    const w = this.history.redo(this.world!);
    if (w) this.restore(w);
  }

  private restore(w: World): void {
    this.world = w;
    this.canUndo = this.history.canUndo;
    this.canRedo = this.history.canRedo;
    this.dirty = true;
    const idx = new WorldIndex(w);
    this.selection = { ids: new Set([...this.selection.ids].filter((id) => idx.get(id))), anchor: this.selection.anchor };
    store.renderer?.setWorld(w);
    store.renderer?.setSelection(this.selection.ids);
    this.scheduleAutosave();
  }

  private scheduleAutosave(): void {
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = window.setTimeout(() => void this.autosave(), AUTOSAVE_MS);
  }

  async autosave(): Promise<void> {
    clearTimeout(this.autosaveTimer);
    if (!this.dirty) return;
    try {
      this.draftSavedAt = await store.core.saveDraft($state.snapshot(this.world) as World);
    } catch (e) {
      store.error(e);
    }
  }

  /** Save (Ctrl+S): the draft becomes the published version (spec §4.7). */
  async save(): Promise<boolean> {
    clearTimeout(this.autosaveTimer);
    try {
      const w = $state.snapshot(this.world) as World;
      await store.core.publish(w);
      store.published = this.world!;
      this.dirty = false;
      this.draftSavedAt = null;
      store.notify(t('toolbar.saved'));
      void this.checkPaths();
      return true;
    } catch (e) {
      store.error(e);
      return false;
    }
  }

  async discard(): Promise<void> {
    clearTimeout(this.autosaveTimer);
    await store.core.discardDraft();
    this.history.clear();
    this.world = store.published;
    this.dirty = false;
    this.canUndo = false;
    this.canRedo = false;
    this.selection = EMPTY_SELECTION;
    store.renderer?.setWorld(this.world, true);
    store.renderer?.setSelection(this.selection.ids);
  }

  dispose(): void {
    clearTimeout(this.autosaveTimer);
  }

  // ---------------------------------------------------------------- selection

  select(ids: Iterable<BubbleId>, anchor: BubbleId | null = null): void {
    this.selection = { ids: new Set(ids), anchor };
    store.renderer?.setSelection(this.selection.ids);
  }

  click(id: BubbleId, mods: ClickMods): void {
    const order = this.index.flatten().map((b) => b.id);
    this.selection = clickSelect(this.selection, id, mods, order);
    store.renderer?.setSelection(this.selection.ids);
  }

  selectAll(): void {
    this.select(this.world!.bubbles.map((b) => b.id));
  }

  // ---------------------------------------------------------------- create & delete

  /** Creates a bubble and opens the quick dialog (spec §4.2). */
  create(kind: BubbleKind, parentId: BubbleId | null, at: Vec2, screen: Vec2): void {
    const w = this.world!;
    const index = new WorldIndex(w);
    const resolver = new SkinResolver(index);
    const parent = parentId ? index.get(parentId) : undefined;
    const positions = store.renderer?.basePositions() ?? new Map();
    let position = at;
    if (parent) {
      const pp = positions.get(parent.id) ?? parent.position;
      position = { x: at.x - pp.x, y: at.y - pp.y };
    }
    const color = parent ? undefined : BUBBLE_PALETTE[this.colorTurn++ % BUBBLE_PALETTE.length];
    const b = createBubble({
      kind,
      parentId: parent?.id ?? null,
      name: kind === 'folder' ? t('quick.defaultFolder') : t('quick.defaultAction'),
      position,
      order: nextOrder(w, parent?.id ?? null),
      color,
      parentSize: parent ? resolver.skin(parent.id).size : undefined,
    });
    this.apply((x) => ({ ...x, bubbles: [...x.bubbles, b] }));
    if (parent && !store.renderer?.expand.isExpanded(parent.id)) store.renderer?.expand.set(parent.id, true);
    this.select([b.id], b.id);
    this.quickCreate = { id: b.id, x: screen.x, y: screen.y };
  }

  /** A position around `parentId` for a new child bubble. */
  childSpot(parentId: BubbleId): Vec2 {
    const index = this.index;
    const resolver = new SkinResolver(index);
    const parent = index.get(parentId);
    const pos = store.renderer?.basePositions().get(parentId) ?? parent?.position ?? { x: 0, y: 0 };
    const n = index.children(parentId).length;
    const r = resolver.skin(parentId).size * 1.4;
    const a = -Math.PI / 2 + n * 0.9;
    return { x: pos.x + Math.cos(a) * r, y: pos.y + Math.sin(a) * r };
  }

  /** Deletes the selection; folders with children ask first (spec §4.3). */
  deleteSelected(): void {
    const ids = this.index.topmost(this.selected);
    if (!ids.length) return;
    const index = this.index;
    const descendants = ids.reduce((n, id) => n + index.descendants(id).length, 0);
    const run = () => {
      this.apply((w) => deleteBubbles(w, ids));
      this.select([]);
    };
    if (descendants === 0) return run();
    const first = index.get(ids[0]!)!;
    store.dialog = {
      title: t('dialog.deleteTitle'),
      text:
        ids.length === 1
          ? t('dialog.deleteFolder', { name: first.name, count: descendants })
          : t('dialog.deleteMany', { count: ids.length + descendants }),
      buttons: [
        { label: t('common.cancel'), action: () => {} },
        { label: t('menu.delete'), kind: 'danger', action: run },
      ],
    };
  }

  // ---------------------------------------------------------------- clipboard

  copy(): void {
    const clip = copyBranches(this.world!, this.selected, store.renderer?.basePositions() ?? new Map());
    if (clip) this.clip = clip;
  }

  get canPaste(): boolean {
    return this.clip !== null;
  }

  paste(at?: Vec2, parent?: BubbleId | null): void {
    if (!this.clip) return;
    const sel = this.selected;
    const target = parent !== undefined ? parent : sel.length === 1 ? sel[0]! : null;
    const res = pasteBranches(this.world!, this.clip, target, store.renderer?.basePositions() ?? new Map(), at);
    this.apply(() => res.world);
    this.select(res.rootIds);
  }

  duplicate(): void {
    const res = duplicateBranches(this.world!, this.selected, store.renderer?.basePositions() ?? new Map());
    if (!res.rootIds.length) return;
    this.apply(() => res.world);
    this.select(res.rootIds);
  }

  copySkin(id: BubbleId): void {
    const b = this.index.get(id);
    if (b) this.skinClip = structuredClone(b.skin);
  }

  pasteSkin(ids: BubbleId[]): void {
    const skin = this.skinClip;
    if (!skin) return;
    this.apply((w) => ({
      ...w,
      bubbles: w.bubbles.map((b) => (ids.includes(b.id) ? { ...b, skin: structuredClone(skin) } : b)),
    }));
  }

  // ---------------------------------------------------------------- tree

  reparent(id: BubbleId, parent: BubbleId | null, orderIndex?: number): boolean {
    const positions = store.renderer?.basePositions() ?? new Map();
    const before = this.world!;
    this.apply((w) => reparent(w, id, parent, positions, orderIndex));
    return this.world !== before;
  }

  setHomeView(cam: Camera): void {
    this.apply((w) => ({ ...w, homeView: { x: cam.x, y: cam.y, zoom: cam.zoom } }));
    store.notify(t('menu.setHome'));
  }

  // ---------------------------------------------------------------- path check

  async checkPaths(): Promise<void> {
    const w = this.world!;
    const files = w.bubbles
      .map((b) => ({ id: b.id, target: actionTarget(b) }))
      .filter((x): x is { id: string; target: { kind: 'file'; value: string } } => x.target?.kind === 'file');
    if (!files.length) {
      this.missing = new Set();
      return;
    }
    try {
      const ok = await store.core.checkTargets(files.map((f) => f.target.value));
      this.missing = new Set(files.filter((_, i) => !ok[i]).map((f) => f.id));
    } catch {
      /* the check is a hint only */
    }
  }

  /** Short status for the toolbar. */
  get status(): string {
    if (!this.dirty) return t('toolbar.saved');
    return this.draftSavedAt ? t('toolbar.draftSaved') : t('toolbar.unsaved');
  }
}

export function kindLabel(kind: BubbleKind): string {
  return tk(`kind.${kind}`);
}
