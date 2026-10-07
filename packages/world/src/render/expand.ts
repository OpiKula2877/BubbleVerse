import type { WorldIndex } from '../model/tree';
import type { BubbleId, Vec2 } from '../model/types';

/** Duration of the fly-out / hide-in animation of sub-bubbles (seconds). */
export const EXPAND_SECONDS = 0.35;

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Expanded state of folders and its animation (spec §3.1): children fly out of the parent
 * when it expands and hide back in when it collapses.
 */
export class ExpandState {
  /** Folder id → progress 0 (collapsed) … 1 (expanded). */
  private progress = new Map<BubbleId, number>();
  private target = new Map<BubbleId, boolean>();

  /** Takes default states from the world; keeps the current state of known folders. */
  sync(index: WorldIndex, resetToDefaults = false): void {
    const seen = new Set<BubbleId>();
    for (const b of index.world.bubbles) {
      if (b.kind !== 'folder') continue;
      seen.add(b.id);
      if (resetToDefaults || !this.target.has(b.id)) {
        const open = b.expanded !== false;
        this.target.set(b.id, open);
        this.progress.set(b.id, open ? 1 : 0);
      }
    }
    for (const id of [...this.target.keys()]) {
      if (!seen.has(id)) {
        this.target.delete(id);
        this.progress.delete(id);
      }
    }
  }

  isExpanded(id: BubbleId): boolean {
    return this.target.get(id) ?? true;
  }

  set(id: BubbleId, expanded: boolean, animate = true): void {
    this.target.set(id, expanded);
    if (!animate) this.progress.set(id, expanded ? 1 : 0);
  }

  toggle(id: BubbleId): boolean {
    const next = !this.isExpanded(id);
    this.set(id, next);
    return next;
  }

  /** Advances animations; returns true while anything is still moving. */
  step(dt: number): boolean {
    let moving = false;
    for (const [id, open] of this.target) {
      const p = this.progress.get(id) ?? 1;
      const goal = open ? 1 : 0;
      if (p === goal) continue;
      const delta = dt / EXPAND_SECONDS;
      const next = open ? Math.min(1, p + delta) : Math.max(0, p - delta);
      this.progress.set(id, next);
      if (next !== goal) moving = true;
    }
    return moving;
  }

  /** Eased progress of one folder. */
  amount(id: BubbleId): number {
    return smooth(this.progress.get(id) ?? 1);
  }

  /** How visible a bubble is: the product of its ancestors' progress (0 = hidden). */
  visibility(index: WorldIndex, id: BubbleId): number {
    let v = 1;
    for (const a of index.ancestors(id)) {
      v *= this.amount(a.id);
      if (v === 0) return 0;
    }
    return v;
  }

  /**
   * Displayed position: while a parent is (un)folding, the child slides between the
   * parent's displayed position and its own.
   */
  displayPositions(
    index: WorldIndex,
    positions: ReadonlyMap<BubbleId, Vec2>,
  ): Map<BubbleId, { pos: Vec2; vis: number }> {
    const out = new Map<BubbleId, { pos: Vec2; vis: number }>();
    const visit = (id: BubbleId, parentPos: Vec2 | null) => {
      const own = positions.get(id) ?? { x: 0, y: 0 };
      const parent = index.parentOf(id);
      const a = parent ? this.amount(parent.id) : 1;
      const parentVis = parent ? (out.get(parent.id)?.vis ?? 1) : 1;
      const pos =
        parentPos && a < 1
          ? {
              x: parentPos.x + (own.x - parentPos.x) * a,
              y: parentPos.y + (own.y - parentPos.y) * a,
            }
          : own;
      out.set(id, { pos, vis: parentVis * a });
      for (const c of index.children(id)) visit(c.id, pos);
    };
    for (const r of index.roots()) visit(r.id, null);
    return out;
  }
}
