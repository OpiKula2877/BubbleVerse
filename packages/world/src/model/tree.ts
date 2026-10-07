import type { Bubble, BubbleId, World } from './types';

export const PATH_SEPARATOR = ' | ';

/** Read-only index over the flat bubble list: lookups by id and ordered children. */
export class WorldIndex {
  readonly byId = new Map<BubbleId, Bubble>();
  private readonly kids = new Map<BubbleId | null, Bubble[]>();

  constructor(readonly world: World) {
    for (const b of world.bubbles) this.byId.set(b.id, b);
    for (const b of world.bubbles) {
      // A bubble whose parent is missing is treated as a main bubble.
      const parent = this.effectiveParent(b);
      const list = this.kids.get(parent);
      if (list) list.push(b);
      else this.kids.set(parent, [b]);
    }
    for (const list of this.kids.values()) list.sort(compareOrder);
  }

  private effectiveParent(b: Bubble): BubbleId | null {
    return b.parentId !== null && this.byId.has(b.parentId) ? b.parentId : null;
  }

  get(id: BubbleId): Bubble | undefined {
    return this.byId.get(id);
  }

  /** Children ordered by `order` (then name). `null` = main bubbles. */
  children(id: BubbleId | null): readonly Bubble[] {
    return this.kids.get(id) ?? [];
  }

  roots(): readonly Bubble[] {
    return this.children(null);
  }

  parentOf(id: BubbleId): Bubble | undefined {
    const b = this.byId.get(id);
    if (!b) return undefined;
    const pid = this.effectiveParent(b);
    return pid ? this.byId.get(pid) : undefined;
  }

  /** Ancestors from the parent up to the main bubble. */
  ancestors(id: BubbleId): Bubble[] {
    const out: Bubble[] = [];
    const seen = new Set<BubbleId>([id]);
    let cur = this.parentOf(id);
    while (cur && !seen.has(cur.id)) {
      out.push(cur);
      seen.add(cur.id);
      cur = this.parentOf(cur.id);
    }
    return out;
  }

  /** The main bubble at the top of this bubble's branch (itself when it is a main bubble). */
  rootOf(id: BubbleId): Bubble | undefined {
    const anc = this.ancestors(id);
    return anc.length ? anc[anc.length - 1] : this.byId.get(id);
  }

  depth(id: BubbleId): number {
    return this.ancestors(id).length;
  }

  /** All descendants, depth-first in order. */
  descendants(id: BubbleId): Bubble[] {
    const out: Bubble[] = [];
    const seen = new Set<BubbleId>([id]);
    const walk = (pid: BubbleId) => {
      for (const c of this.children(pid)) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        out.push(c);
        walk(c.id);
      }
    };
    walk(id);
    return out;
  }

  isAncestor(ancestor: BubbleId, of: BubbleId): boolean {
    return this.ancestors(of).some((a) => a.id === ancestor);
  }

  /** Names from the main bubble down to this bubble. */
  pathNames(id: BubbleId): string[] {
    const b = this.byId.get(id);
    if (!b) return [];
    const names = this.ancestors(id)
      .reverse()
      .map((a) => a.name);
    names.push(b.name);
    return names;
  }

  /** e.g. `Apps | Work | Claude Code` */
  pathString(id: BubbleId): string {
    return this.pathNames(id).join(PATH_SEPARATOR);
  }

  /** A bubble can move under `newParent` if that is a folder and not the bubble itself or its descendant. */
  canReparent(id: BubbleId, newParent: BubbleId | null): boolean {
    if (!this.byId.has(id)) return false;
    if (newParent === null) return true;
    const target = this.byId.get(newParent);
    if (!target || target.kind !== 'folder') return false;
    if (newParent === id) return false;
    return !this.isAncestor(id, newParent);
  }

  /** Depth-first order of the whole tree (as shown in the Tree panel). */
  flatten(): Bubble[] {
    const out: Bubble[] = [];
    for (const r of this.roots()) {
      out.push(r);
      out.push(...this.descendants(r.id));
    }
    return out;
  }

  /** Selected bubbles without those whose ancestor is selected too. */
  topmost(ids: Iterable<BubbleId>): BubbleId[] {
    const set = new Set(ids);
    return [...set].filter(
      (id) => this.byId.has(id) && !this.ancestors(id).some((a) => set.has(a.id)),
    );
  }
}

export function compareOrder(a: Bubble, b: Bubble): number {
  return a.order - b.order || a.name.localeCompare(b.name);
}
