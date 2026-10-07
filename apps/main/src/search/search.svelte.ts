import { SearchSession, type SearchKey, type SearchResult, type SearchView } from '@bv/search';
import { fitCamera, WorldIndex, type BubbleId, type Camera } from '@bv/world';
import { store } from '../lib/store.svelte';

/** Search in the app window (`Ctrl+F`, spec §6.1): one engine, the world greys out, the camera follows. */
class SearchController {
  open = $state(false);
  view = $state.raw<SearchView | null>(null);
  private session: SearchSession | null = null;
  private cameraBefore: Camera | null = null;
  /** Folders opened only for searching; they collapse again on close (spec §6.3). */
  private opened = new Set<BubbleId>();

  async start(): Promise<void> {
    if (this.open) return;
    const world = store.world;
    const [history, usage] = await Promise.all([
      store.core.searchHistory().catch(() => [] as string[]),
      store.core.usageCounts().catch(() => ({}) as Record<string, number>),
    ]);
    this.session = new SearchSession(
      world.bubbles.map((b) => ({
        id: b.id,
        parentId: b.parentId,
        name: b.name,
        kind: b.kind,
        order: b.order,
      })),
      { history, usage, sortByUsage: store.settings.search.sortByUsage },
    );
    this.cameraBefore = store.renderer ? { ...store.renderer.camera } : null;
    this.opened.clear();
    this.open = true;
    this.refresh();
  }

  input(text: string): void {
    if (!this.session) return;
    this.handle(this.session.input(text));
  }

  key(k: SearchKey): void {
    if (!this.session) return;
    this.handle(this.session.key(k));
  }

  private handle(r: SearchResult): void {
    switch (r.kind) {
      case 'close':
        return this.close();
      case 'focus':
        this.refresh();
        return this.aim(r.id);
      case 'activate':
        return void this.activate(r.id, r.path);
      default:
        this.refresh();
    }
  }

  private refresh(): void {
    const s = this.session;
    const r = store.renderer;
    if (!s) return;
    const v = s.view();
    this.view = v;
    if (!r) return;
    for (const id of v.expanded) {
      if (!r.expand.isExpanded(id)) {
        r.expand.set(id, true);
        this.opened.add(id);
      }
    }
    r.setSearch({
      active: true,
      colored: v.colored,
      path: v.path,
      current: v.current?.item.id ?? null,
    });
  }

  /** Shows the confirmed bubble and its direct children with a margin (spec §6.5). */
  private aim(id: BubbleId | null): void {
    const r = store.renderer;
    if (!r) return;
    const index = new WorldIndex(store.world);
    const ids = id ? [id, ...index.children(id).map((b) => b.id)] : index.roots().map((b) => b.id);
    const box = r.boxOf(ids);
    if (box) r.setCamera(fitCamera(store.screenLayout, box, 0.1, 2.5), 450);
  }

  private async activate(id: BubbleId, path: string): Promise<void> {
    const ed = store.editor;
    if (ed) {
      // In edit mode Enter selects the bubble and zooms to it instead of running it.
      ed.select([id], id);
      this.close(false);
      this.aim(id);
      return;
    }
    this.close();
    try {
      await store.core.pushHistory(path);
      await store.core.activate(id);
    } catch (e) {
      store.error(e);
    }
  }

  close(restoreCamera = true): void {
    if (!this.open) return;
    this.open = false;
    this.view = null;
    this.session = null;
    const r = store.renderer;
    if (!r) return;
    for (const id of this.opened) r.expand.set(id, false);
    this.opened.clear();
    r.setSearch({ active: false, colored: new Set(), path: new Set(), current: null });
    if (restoreCamera && this.cameraBefore) r.setCamera(this.cameraBefore, 450);
    this.cameraBefore = null;
  }
}

export const search = new SearchController();
