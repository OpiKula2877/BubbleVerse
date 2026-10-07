import type { World } from '../model/types';

export const UNDO_LIMIT = 200;
const COALESCE_MS = 1000;

interface Entry {
  world: World;
  key?: string;
  at: number;
}

/**
 * Undo/redo over immutable world snapshots (unchanged bubbles are shared between snapshots).
 * Consecutive edits with the same `key` within a second (typing a name, dragging a slider)
 * become one step.
 */
export class History {
  private past: Entry[] = [];
  private future: World[] = [];

  constructor(private readonly limit = UNDO_LIMIT) {}

  /** Call before replacing `before` with a new world. */
  record(before: World, key?: string, now: number = Date.now()): void {
    const last = this.past[this.past.length - 1];
    this.future = [];
    if (key && last && last.key === key && now - last.at < COALESCE_MS) {
      last.at = now;
      return;
    }
    this.past.push({ world: before, key, at: now });
    if (this.past.length > this.limit) this.past.shift();
  }

  undo(current: World): World | null {
    const entry = this.past.pop();
    if (!entry) return null;
    this.future.push(current);
    return entry.world;
  }

  redo(current: World): World | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push({ world: current, at: 0 });
    return next;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get size(): number {
    return this.past.length;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
