import { normalizeText } from './normalize';

/**
 * The one search engine used by the app window, the desktop and the compact bar (spec §6).
 * Pure logic: the UI feeds text and keys, the session tells what to show and what to do.
 */

export const SEPARATOR = ' | ';
export const HISTORY_SIZE = 50;

export interface SearchItem {
  id: string;
  parentId: string | null;
  name: string;
  kind: 'folder' | 'action';
  order: number;
}

export interface SearchOptions {
  /** Newest first (paths like `Apps | Work | X`). */
  history?: readonly string[];
  /** Activation counts per bubble id. */
  usage?: Readonly<Record<string, number>>;
  sortByUsage?: boolean;
}

export interface SearchOption {
  item: SearchItem;
  /** Full path of the bubble, e.g. `Louka | Složka | Kouzlo`. */
  path: string;
  /** Matched by fuzzy fallback rather than by the start of the name. */
  fuzzy: boolean;
}

export type SearchKey = 'up' | 'down' | 'tab' | 'enter' | 'backspace' | 'escape';

export type SearchResult =
  | { kind: 'none' }
  | { kind: 'close' }
  /** Run an action bubble (or select it in edit mode). */
  | { kind: 'activate'; id: string; path: string }
  /** A level was confirmed: the camera should show this bubble and its children. */
  | { kind: 'focus'; id: string | null };

export interface SearchView {
  /** Confirmed levels, ending with the separator, e.g. `Apps | Work | `. */
  prefix: string;
  text: string;
  /** Rest of the current option's name after the typed text (start-of-name matches). */
  ghost: string;
  /** Name of the current option when it matched only by fuzzy search. */
  suggestion: string;
  /** Shown grey in an empty field: the last command (spec §6.6). */
  placeholder: string;
  prev: SearchOption | null;
  current: SearchOption | null;
  next: SearchOption | null;
  position: number;
  total: number;
  /** Red path above the field: in `:` mode and for duplicate names (spec §6.7). */
  showPaths: boolean;
  global: boolean;
  /** Browsing the history with ↑/↓ in an empty field. */
  historyEntry: string | null;
  /** Bubbles to color (options of the current level); everything else is greyed out. */
  colored: ReadonlySet<string>;
  /** Confirmed path (highlighted edge). */
  path: ReadonlySet<string>;
  /** Folders that must be shown expanded while searching. */
  expanded: ReadonlySet<string>;
}

/** Score of a subsequence match, or null when `query` is not a subsequence of `target`. */
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.replace(/\s+/g, '');
  if (!q) return 0;
  let from = 0;
  let prev = -2;
  let score = 0;
  for (const ch of q) {
    // Prefer the start of a word for this character, else the first occurrence.
    let found = -1;
    for (let j = from; j < target.length; j++) {
      if (target[j] !== ch) continue;
      if (found < 0) found = j;
      if (j === 0 || /[\s\-_.|/]/.test(target[j - 1] ?? '')) {
        found = j;
        break;
      }
    }
    if (found < 0) return null;
    let s = 1;
    if (found === prev + 1) s += 3;
    if (found === 0 || /[\s\-_.|/]/.test(target[found - 1] ?? '')) s += 4;
    score += s;
    prev = found;
    from = found + 1;
  }
  return score - target.length * 0.01;
}

const collator = new Intl.Collator('cs', { sensitivity: 'base', numeric: true });

export class SearchSession {
  private readonly byId = new Map<string, SearchItem>();
  private readonly kids = new Map<string | null, SearchItem[]>();
  private readonly paths = new Map<string, string>();
  private readonly norm = new Map<string, string>();
  private segments: string[] = [];
  private text = '';
  private global = false;
  private index = 0;
  private historyIndex: number | null = null;

  constructor(
    items: readonly SearchItem[],
    private readonly opts: SearchOptions = {},
  ) {
    for (const it of items) this.byId.set(it.id, it);
    for (const it of items) {
      const parent = it.parentId && this.byId.has(it.parentId) ? it.parentId : null;
      const list = this.kids.get(parent);
      if (list) list.push(it);
      else this.kids.set(parent, [it]);
      this.norm.set(it.id, normalizeText(it.name));
    }
  }

  // ---------------------------------------------------------------- queries

  pathOf(id: string): string {
    const cached = this.paths.get(id);
    if (cached !== undefined) return cached;
    const names: string[] = [];
    const seen = new Set<string>();
    let cur = this.byId.get(id);
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      names.unshift(cur.name);
      cur = cur.parentId ? this.byId.get(cur.parentId) : undefined;
    }
    const p = names.join(SEPARATOR);
    this.paths.set(id, p);
    return p;
  }

  private pathIds(id: string): string[] {
    const ids: string[] = [];
    const seen = new Set<string>();
    let cur = this.byId.get(id);
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      ids.unshift(cur.id);
      cur = cur.parentId ? this.byId.get(cur.parentId) : undefined;
    }
    return ids;
  }

  /** Finds a bubble by its full path (case and diacritics do not matter). */
  findPath(path: string): SearchItem | undefined {
    const parts = path.split('|').map((p) => normalizeText(p.trim()));
    let parent: string | null = null;
    let found: SearchItem | undefined;
    for (const part of parts) {
      found = (this.kids.get(parent) ?? []).find((c) => this.norm.get(c.id) === part);
      if (!found) return undefined;
      parent = found.id;
    }
    return found;
  }

  private candidates(): SearchItem[] {
    if (this.global) return [...this.byId.values()];
    const parent = this.segments.length ? this.segments[this.segments.length - 1]! : null;
    return this.kids.get(parent) ?? [];
  }

  private compare = (a: SearchItem, b: SearchItem): number => {
    if (this.opts.sortByUsage) {
      const d = (this.opts.usage?.[b.id] ?? 0) - (this.opts.usage?.[a.id] ?? 0);
      if (d !== 0) return d;
    }
    return collator.compare(a.name, b.name) || collator.compare(this.pathOf(a.id), this.pathOf(b.id));
  };

  /** Options of the current level filtered by the typed text (spec §6.3, §6.4). */
  options(): SearchOption[] {
    const all = this.candidates();
    const q = normalizeText(this.text);
    const wrap = (item: SearchItem, fuzzy: boolean) => ({ item, path: this.pathOf(item.id), fuzzy });
    if (!q) return [...all].sort(this.compare).map((i) => wrap(i, false));
    const prefix = all.filter((i) => (this.norm.get(i.id) ?? '').startsWith(q));
    if (prefix.length) return prefix.sort(this.compare).map((i) => wrap(i, false));
    return all
      .map((i) => ({ i, s: fuzzyScore(q, this.norm.get(i.id) ?? '') }))
      .filter((x): x is { i: SearchItem; s: number } => x.s !== null)
      .sort((a, b) => b.s - a.s || this.compare(a.i, b.i))
      .map((x) => wrap(x.i, true));
  }

  view(): SearchView {
    const opts = this.options();
    const total = opts.length;
    const i = total ? Math.min(this.index, total - 1) : 0;
    const current = opts[i] ?? null;
    const at = (k: number) => (total > 1 ? (opts[(k + total) % total] ?? null) : null);
    const q = normalizeText(this.text);
    let ghost = '';
    let suggestion = '';
    if (current && this.text) {
      const name = current.item.name;
      if (!current.fuzzy && normalizeText(name).startsWith(q)) ghost = name.slice(this.text.length);
      else suggestion = name;
    }
    const names = new Map<string, number>();
    for (const o of opts) names.set(this.norm.get(o.item.id) ?? '', (names.get(this.norm.get(o.item.id) ?? '') ?? 0) + 1);
    const duplicate = current ? (names.get(this.norm.get(current.item.id) ?? '') ?? 0) > 1 : false;
    const prefix = this.segments.map((id) => `${this.byId.get(id)?.name ?? ''}${SEPARATOR}`).join('');
    const expanded = new Set<string>(this.segments);
    if (this.global) for (const o of opts) for (const a of this.pathIds(o.item.id).slice(0, -1)) expanded.add(a);
    const historyEntry = this.historyIndex !== null ? (this.opts.history?.[this.historyIndex] ?? null) : null;
    return {
      prefix,
      text: this.text,
      ghost,
      suggestion,
      placeholder: !this.text && !this.segments.length && !this.global ? (this.opts.history?.[0] ?? '') : '',
      prev: at(i - 1),
      current,
      next: at(i + 1),
      position: total ? i + 1 : 0,
      total,
      showPaths: this.global || duplicate,
      global: this.global,
      historyEntry,
      colored: new Set(opts.map((o) => o.item.id)),
      path: new Set(this.segments),
      expanded,
    };
  }

  // ---------------------------------------------------------------- input

  /** The text of the current segment changed (typing). A leading `:` starts the global mode. */
  input(raw: string): SearchResult {
    let text = raw;
    if (!this.segments.length && !this.global && text.startsWith(':')) {
      this.global = true;
      text = text.slice(1);
    }
    this.text = text;
    this.index = 0;
    this.historyIndex = null;
    return { kind: 'none' };
  }

  key(k: SearchKey): SearchResult {
    switch (k) {
      case 'escape':
        return { kind: 'close' };
      case 'up':
      case 'down':
        return this.move(k === 'up' ? -1 : 1);
      case 'backspace':
        return this.backspace();
      case 'tab':
        return this.confirm(false);
      case 'enter':
        return this.confirm(true);
    }
  }

  private move(d: number): SearchResult {
    const history = this.opts.history ?? [];
    if (!this.text && !this.segments.length && !this.global && history.length) {
      // ↑/↓ in an empty field browses the history (spec §6.6).
      const n = Math.min(history.length, HISTORY_SIZE);
      const cur = this.historyIndex;
      this.historyIndex = cur === null ? (d > 0 ? 0 : n - 1) : (cur + d + n) % n;
      return { kind: 'none' };
    }
    const total = this.options().length;
    if (total) this.index = (Math.min(this.index, total - 1) + d + total) % total;
    return { kind: 'none' };
  }

  private backspace(): SearchResult {
    this.historyIndex = null;
    if (this.text) {
      this.text = this.text.slice(0, -1);
      this.index = 0;
      return { kind: 'none' };
    }
    if (this.global && !this.segments.length) {
      this.global = false;
      this.index = 0;
      return { kind: 'none' };
    }
    if (this.segments.length) {
      this.segments.pop();
      this.index = 0;
      return { kind: 'focus', id: this.segments[this.segments.length - 1] ?? null };
    }
    return { kind: 'none' };
  }

  /** TAB confirms a level; Enter runs an action or confirms a folder (spec §6.3). */
  private confirm(enter: boolean): SearchResult {
    const history = this.opts.history ?? [];
    if (this.historyIndex !== null || (enter && !this.text && !this.segments.length && !this.global)) {
      // TAB writes out the history command, Enter runs it.
      const entry = history[this.historyIndex ?? 0];
      this.historyIndex = null;
      const item = entry ? this.findPath(entry) : undefined;
      if (!item) return { kind: 'none' };
      if (enter && item.kind === 'action') return { kind: 'activate', id: item.id, path: this.pathOf(item.id) };
      this.enterPathOf(item);
      return { kind: 'focus', id: item.kind === 'folder' ? item.id : (item.parentId ?? null) };
    }
    const current = this.view().current;
    if (!current) return { kind: 'none' };
    const item = current.item;
    if (item.kind === 'action') {
      if (enter) return { kind: 'activate', id: item.id, path: current.path };
      this.text = item.name;
      this.index = 0;
      return { kind: 'none' };
    }
    // A folder: fix the segment and go one level down; `:` mode switches to levels inside it.
    this.segments = this.pathIds(item.id);
    this.global = false;
    this.text = '';
    this.index = 0;
    return { kind: 'focus', id: item.id };
  }

  /** Sets the levels so the field shows the bubble's path (for actions: parent levels + name). */
  private enterPathOf(item: SearchItem): void {
    this.global = false;
    this.index = 0;
    if (item.kind === 'folder') {
      this.segments = this.pathIds(item.id);
      this.text = '';
    } else {
      this.segments = item.parentId ? this.pathIds(item.parentId) : [];
      this.text = item.name;
    }
  }
}

/** Adds a command to the history: newest first, no duplicates, at most 50 (spec §6.6). */
export function pushHistory(history: readonly string[], path: string): string[] {
  return [path, ...history.filter((h) => h !== path)].slice(0, HISTORY_SIZE);
}
