import { WorldIndex, type AssetHash, type AutoSource, type BubbleId } from '@bv/world';
import type { Editor } from '../lib/editor.svelte';
import { store } from '../lib/store.svelte';
import {
  defaultGenOptions,
  fileItem,
  generate,
  itemName,
  urlItem,
  type GenItem,
  type GenOptions,
} from './generate';

/** State of the bulk generator window (spec §4.6). */

export type GenSource = 'files' | 'folder' | 'apps' | 'web';
export type AppSource = 'start' | 'store' | 'steam' | 'epic';

export interface GenRow {
  item: GenItem;
  on: boolean;
}

interface AppEntry {
  name: string;
  target: string;
  kind: 'file' | 'url';
  icon: AutoSource;
}

/** Icons resolved in this session, by source and target. */
const iconCache = new Map<string, AssetHash | null>();
/** Icons fetched at the same time. */
const ICON_WORKERS = 4;

export class GeneratorState {
  source = $state<GenSource>('files');
  rows = $state.raw<GenRow[]>([]);
  options = $state<GenOptions>(defaultGenOptions(null));
  folder = $state('');
  exts = $state('exe, lnk');
  recursive = $state(false);
  appSource = $state<AppSource>('start');
  filter = $state('');
  webText = $state('');
  loading = $state(false);
  /** Resolved icons: key → hash (null = none). */
  icons = $state.raw<Record<string, AssetHash | null>>({});
  private apps = new Map<AppSource, GenRow[]>();
  private iconRun = 0;

  constructor(parentId: BubbleId | null, files: string[] = []) {
    this.options = defaultGenOptions(parentId);
    if (files.length) this.setFiles(files);
  }

  static key(item: GenItem): string {
    return `${item.icon}:${item.target}`;
  }

  setSource(s: GenSource): void {
    this.source = s;
    if (s === 'apps') void this.loadApps(this.appSource);
    else if (s === 'web') this.setWeb(this.webText);
  }

  setFiles(paths: string[]): void {
    this.source = 'files';
    this.rows = paths.map((p) => ({ item: fileItem(p), on: true }));
    void this.resolveIcons();
  }

  async pickFiles(): Promise<void> {
    const files = await store.core.pickFiles();
    if (files.length) this.setFiles([...this.rows.map((r) => r.item.target), ...files]);
  }

  async pickFolder(): Promise<void> {
    const dir = await store.core.pickFolder();
    if (dir) {
      this.folder = dir;
      await this.scanFolder();
    }
  }

  async scanFolder(): Promise<void> {
    if (!this.folder.trim()) return;
    this.loading = true;
    try {
      const exts = this.exts
        .split(/[\s,;]+/)
        .map((e) => e.trim())
        .filter(Boolean);
      const paths = await store.core.call<string[]>('scan_folder', {
        path: this.folder,
        exts,
        recursive: this.recursive,
      });
      this.rows = paths.map((p) => ({ item: fileItem(p), on: true }));
      void this.resolveIcons();
    } catch (e) {
      store.error(e);
      this.rows = [];
    } finally {
      this.loading = false;
    }
  }

  async loadApps(src: AppSource): Promise<void> {
    this.appSource = src;
    const cached = this.apps.get(src);
    if (cached) {
      this.rows = cached;
      void this.resolveIcons();
      return;
    }
    this.loading = true;
    this.rows = [];
    try {
      const list = await store.core.call<AppEntry[]>('list_apps', { source: src });
      const rows = list.map((a) => ({
        item: {
          target: a.target,
          name: a.name,
          ext: a.kind === 'file' ? '.lnk' : '',
          folder: '',
          kind: a.kind,
          icon: a.icon,
        },
        // Lists of installed apps are long: nothing is ticked at first.
        on: false,
      }));
      this.apps.set(src, rows);
      if (this.appSource === src) this.rows = rows;
      void this.resolveIcons();
    } catch (e) {
      store.error(e);
    } finally {
      this.loading = false;
    }
  }

  setWeb(text: string): void {
    this.webText = text;
    this.rows = text
      .split(/\r?\n/)
      .map(urlItem)
      .filter((x): x is GenItem => !!x)
      .map((item) => ({ item, on: true }));
    void this.resolveIcons();
  }

  toggle(i: number, on: boolean): void {
    this.rows = this.rows.map((r, j) => (j === i ? { ...r, on } : r));
    if (this.source === 'apps') this.apps.set(this.appSource, this.rows);
  }

  setAll(on: boolean): void {
    const visible = new Set(this.visible.map((v) => v.index));
    this.rows = this.rows.map((r, i) => (visible.has(i) ? { ...r, on } : r));
    if (this.source === 'apps') this.apps.set(this.appSource, this.rows);
  }

  /** Rows matching the filter (apps), with their index in `rows`. */
  get visible(): { row: GenRow; index: number }[] {
    const f = this.filter.trim().toLowerCase();
    return this.rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => !f || row.item.name.toLowerCase().includes(f));
  }

  get chosen(): GenItem[] {
    return this.rows
      .filter((r) => r.on)
      .map((r) => {
        const asset = this.icons[GeneratorState.key(r.item)];
        return asset ? { ...r.item, asset } : r.item;
      });
  }

  name(item: GenItem): string {
    return itemName(item, this.options);
  }

  /** Fetches the auto icons of the rows a few at a time (preview and the new bubbles). */
  async resolveIcons(): Promise<void> {
    if (this.options.look.kind !== 'auto' || !store.core.isTauri) return;
    const run = ++this.iconRun;
    const todo = this.rows.map((r) => r.item).filter((i) => !(GeneratorState.key(i) in this.icons));
    const next = async (): Promise<void> => {
      while (todo.length && run === this.iconRun) {
        const item = todo.shift()!;
        const key = GeneratorState.key(item);
        let hash = iconCache.get(key);
        if (hash === undefined) {
          try {
            const info = await store.core.call<{ hash: string } | null>('auto_icon', {
              source: item.icon,
              target: item.target,
            });
            hash = info?.hash ?? null;
          } catch {
            hash = null;
          }
          iconCache.set(key, hash);
        }
        if (run === this.iconRun) this.icons = { ...this.icons, [key]: hash };
      }
    };
    await Promise.all(Array.from({ length: ICON_WORKERS }, next));
  }

  /** Folders the bubbles can go into, with their path. */
  folders(): { value: string; label: string }[] {
    const w = store.world;
    const index = new WorldIndex(w);
    return w.bubbles
      .filter((b) => b.kind === 'folder')
      .map((b) => ({ value: b.id, label: index.pathString(b.id) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  /** Creates the bubbles as one undo step and selects them. */
  create(editor: Editor): number {
    const items = this.chosen;
    if (!items.length) return 0;
    let ids: BubbleId[] = [];
    editor.apply((w) => {
      const out = generate(w, items, this.options);
      ids = out.ids;
      return out.world;
    });
    const parent = this.options.parentId;
    if (parent && !store.renderer?.expand.isExpanded(parent))
      store.renderer?.expand.set(parent, true);
    editor.select(ids, ids[0] ?? null);
    return ids.length;
  }
}
