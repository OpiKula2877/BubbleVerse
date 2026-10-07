import type { BubbleId } from '@bv/world';

export type MotionEditKind = 'path' | 'orbit' | 'wander';

/** State of the on-canvas editors for path, orbit and wander area (spec §4.4). */
class MotionEditorState {
  active = $state<{ kind: MotionEditKind; id: BubbleId } | null>(null);

  start(kind: MotionEditKind, id: BubbleId): void {
    this.active = { kind, id };
  }

  stop(): void {
    this.active = null;
  }
}

export const motionEditor = new MotionEditorState();
