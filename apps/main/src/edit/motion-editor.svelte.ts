import {
  mapBubbles,
  orbitWouldCycle,
  type BubbleId,
  type OrbitMotion,
  type PathMotion,
  type TrackMotion,
  type WanderMotion,
} from '@bv/world';
import { t } from '@bv/ui';
import type { Editor } from '../lib/editor.svelte';
import { store } from '../lib/store.svelte';

export type MotionEditKind = 'path' | 'orbit' | 'wander';

/** Default tracks for a bubble that has none of this kind yet. */
function defaultTrack(kind: MotionEditKind): TrackMotion {
  if (kind === 'path') {
    const p: PathMotion = {
      type: 'path',
      points: [{ x: 0, y: 0, smooth: false }],
      loop: 'pingpong',
      speed: 60,
      easing: 'easeInOut',
    };
    return p;
  }
  if (kind === 'wander') {
    const w: WanderMotion = {
      type: 'wander',
      area: { shape: 'circle', r: 80 },
      speed: 25,
      smoothness: 0.6,
    };
    return w;
  }
  const o: OrbitMotion = {
    type: 'orbit',
    center: '',
    rx: 220,
    ry: 160,
    tilt: 0,
    speed: 20,
    dir: 'cw',
    phase: 0,
  };
  return o;
}

/**
 * The on-canvas editors for a path, an orbit and a wander area (spec §4.4). They work on a
 * copy of the track; Enter writes it as one undo step, Esc throws it away.
 */
class MotionEditorState {
  active = $state<{ kind: MotionEditKind; id: BubbleId } | null>(null);
  track = $state.raw<TrackMotion | null>(null);
  /** Orbit: waiting for a click on the center bubble. */
  picking = $state(false);
  /** ▶ preview of the motion. */
  playing = $state(false);
  selected = $state<number | null>(null);

  start(kind: MotionEditKind, id: BubbleId, editor: Editor): void {
    const b = editor.index.get(id);
    if (!b) return;
    const current = b.motion.track;
    this.track = current?.type === kind ? current : defaultTrack(kind);
    this.active = { kind, id };
    this.picking = kind === 'orbit' && !(this.track as OrbitMotion).center;
    this.playing = false;
    this.selected = null;
    editor.menu = null;
    // The inspector shows the bubble (orbit speed, direction and phase are set there).
    editor.select([id], id);
  }

  /** Orbit center by click; a center that would make a cycle is refused (spec §3.5). */
  pickCenter(editor: Editor, center: BubbleId): boolean {
    const a = this.active;
    if (!a || this.track?.type !== 'orbit') return false;
    if (orbitWouldCycle(editor.index, a.id, center)) {
      store.notify(t('motionEdit.cycle'), true);
      return false;
    }
    this.track = { ...this.track, center };
    this.picking = false;
    return true;
  }

  commit(editor: Editor): void {
    const a = this.active;
    const track = this.track;
    if (a && track && !(track.type === 'orbit' && !track.center)) {
      editor.apply((w) => mapBubbles(w, [a.id], (b) => ({ ...b, motion: { ...b.motion, track } })));
    }
    this.stop();
  }

  stop(): void {
    this.active = null;
    this.track = null;
    this.picking = false;
    this.playing = false;
    this.selected = null;
  }
}

export const motionEditor = new MotionEditorState();
