<script lang="ts">
  import {
    addPathPoint,
    buildPathTable,
    dragOrbitHandle,
    movePathPoint,
    orbitHandles,
    orbitOffset,
    pathOffset,
    removePathPoint,
    setPathHandle,
    SkinResolver,
    toggleSmooth,
    panBy,
    viewportAt,
    visibleWorld,
    wanderAreaFromDrag,
    wanderOffset,
    worldToCss,
    zoomAt,
    hashSeed,
    type PathMotion,
    type Vec2,
  } from '@bv/world';
  import { onDestroy, onMount } from 'svelte';
  import type { Editor } from '../lib/editor.svelte';
  import { store } from '../lib/store.svelte';
  import { motionEditor } from './motion-editor.svelte';

  /**
   * The canvas part of the motion editors (spec §4.4): the world is dimmed, the path, ellipse
   * or wander area is drawn with handles to drag.
   */
  let { editor }: { editor: Editor } = $props();

  /** Re-renders when the camera moves or the preview runs. */
  let frame = $state(0);
  let raf = 0;
  const loop = () => {
    frame++;
    raf = requestAnimationFrame(loop);
  };
  onMount(() => (raf = requestAnimationFrame(loop)));
  onDestroy(() => cancelAnimationFrame(raf));

  type Drag =
    | { kind: 'point'; i: number }
    | { kind: 'handle'; i: number; which: 'in' | 'out' }
    | { kind: 'new'; i: number; start: Vec2 }
    | { kind: 'rx' | 'ry' }
    | { kind: 'wander' };
  let drag: Drag | null = null;
  /** Right or middle button drag moves the view while editing. */
  let panning = false;

  const active = $derived(motionEditor.active);
  const track = $derived(motionEditor.track);

  function toScreen(w: Vec2): Vec2 {
    // Everything drawn follows the camera, so each use re-runs with the frame counter.
    void frame;
    const r = store.renderer;
    if (!r) return w;
    const vps = r.viewports();
    const vp =
      vps.find((v) => {
        const b = visibleWorld(v);
        return w.x >= b.x && w.x <= b.x + b.w && w.y >= b.y && w.y <= b.y + b.h;
      }) ??
      vps.find((v) => v.primary) ??
      vps[0];
    return vp ? worldToCss(vp, w) : w;
  }

  function toWorld(c: Vec2): Vec2 | null {
    return store.renderer?.screenToWorld(c) ?? null;
  }

  /** CSS pixels per world unit around a point. */
  function scaleAt(c: Vec2): number {
    const vp = store.renderer ? viewportAt(store.renderer.viewports(), c) : undefined;
    return vp?.k ?? 1;
  }

  const base = $derived.by(() => {
    void frame;
    const id = active?.id;
    return id
      ? (store.renderer?.basePositions().get(id) ??
          editor.index.get(id)?.position ?? { x: 0, y: 0 })
      : { x: 0, y: 0 };
  });
  const centerPos = $derived.by(() => {
    void frame;
    if (track?.type !== 'orbit' || !track.center) return null;
    return store.renderer?.basePositions().get(track.center) ?? null;
  });
  const radius = $derived(active ? new SkinResolver(editor.index).skin(active.id).size / 2 : 20);

  /** The ▶ preview dot. */
  const ghost = $derived.by(() => {
    void frame;
    if (!motionEditor.playing || !track || !active) return null;
    const t = performance.now() / 1000;
    if (track.type === 'path') {
      const o = pathOffset(track, t);
      return { x: base.x + o.x, y: base.y + o.y };
    }
    if (track.type === 'orbit') {
      if (!centerPos) return null;
      const o = orbitOffset(track, t);
      return { x: centerPos.x + o.x, y: centerPos.y + o.y };
    }
    const o = wanderOffset(track, t, hashSeed(active.id));
    return { x: base.x + o.x, y: base.y + o.y };
  });

  function rel(c: Vec2, origin: Vec2): Vec2 | null {
    const w = toWorld(c);
    return w ? { x: w.x - origin.x, y: w.y - origin.y } : null;
  }

  const near = (a: Vec2, b: Vec2, px = 9) => Math.hypot(a.x - b.x, a.y - b.y) <= px;

  function pointerDown(e: PointerEvent) {
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      panning = true;
      return;
    }
    if (e.button !== 0 || !track || !active) return;
    const c = { x: e.clientX, y: e.clientY };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (motionEditor.picking) {
      const w = toWorld(c);
      const hit = w ? store.renderer?.hitTest(w) : null;
      if (hit && hit !== active.id) motionEditor.pickCenter(editor, hit);
      return;
    }
    if (track.type === 'path') {
      // Handles first, then points, else a new point.
      for (let i = track.points.length - 1; i >= 0; i--) {
        const p = track.points[i]!;
        for (const which of ['out', 'in'] as const) {
          const h = p[which];
          if (h && near(c, toScreen({ x: base.x + p.x + h.x, y: base.y + p.y + h.y }))) {
            drag = { kind: 'handle', i, which };
            motionEditor.selected = i;
            return;
          }
        }
      }
      for (let i = track.points.length - 1; i >= 0; i--) {
        const p = track.points[i]!;
        if (near(c, toScreen({ x: base.x + p.x, y: base.y + p.y }), 10)) {
          drag = { kind: 'point', i };
          motionEditor.selected = i;
          return;
        }
      }
      const r = rel(c, base);
      if (!r) return;
      const next = addPathPoint(track, r);
      motionEditor.track = next;
      motionEditor.selected = next.points.length - 1;
      drag = { kind: 'new', i: next.points.length - 1, start: c };
    } else if (track.type === 'orbit' && centerPos) {
      const h = orbitHandles(track);
      if (near(c, toScreen({ x: centerPos.x + h.rx.x, y: centerPos.y + h.rx.y }), 11))
        drag = { kind: 'rx' };
      else if (near(c, toScreen({ x: centerPos.x + h.ry.x, y: centerPos.y + h.ry.y }), 11))
        drag = { kind: 'ry' };
    } else if (track.type === 'wander') {
      drag = { kind: 'wander' };
      move(e);
    }
  }

  function move(e: PointerEvent) {
    if (panning) {
      const r = store.renderer;
      const vp = r ? viewportAt(r.viewports(), { x: e.clientX, y: e.clientY }) : undefined;
      if (r && vp) r.setCamera(panBy(r.camera, vp, e.movementX, e.movementY));
      return;
    }
    const d = drag;
    const tr = motionEditor.track;
    if (!d || !tr) return;
    const c = { x: e.clientX, y: e.clientY };
    if (tr.type === 'path') {
      const r = rel(c, base);
      if (!r) return;
      if (d.kind === 'point') motionEditor.track = movePathPoint(tr, d.i, r);
      else if (d.kind === 'handle') {
        const p = tr.points[d.i]!;
        motionEditor.track = setPathHandle(tr, d.i, d.which, { x: r.x - p.x, y: r.y - p.y });
      } else if (d.kind === 'new' && Math.hypot(c.x - d.start.x, c.y - d.start.y) > 4) {
        // Dragging out of a new point creates its curve handles.
        const p = tr.points[d.i]!;
        motionEditor.track = setPathHandle(tr, d.i, 'out', { x: r.x - p.x, y: r.y - p.y });
      }
    } else if (tr.type === 'orbit' && centerPos && (d.kind === 'rx' || d.kind === 'ry')) {
      const r = rel(c, centerPos);
      if (r) motionEditor.track = dragOrbitHandle(tr, d.kind, r);
    } else if (tr.type === 'wander' && d.kind === 'wander') {
      const r = rel(c, base);
      if (r) motionEditor.track = { ...tr, area: wanderAreaFromDrag(tr.area.shape, r) };
    }
  }

  function up() {
    drag = null;
    panning = false;
  }

  function dblclick(e: MouseEvent) {
    const tr = motionEditor.track;
    if (tr?.type !== 'path') return;
    const c = { x: e.clientX, y: e.clientY };
    const i = tr.points.findIndex((p) =>
      near(c, toScreen({ x: base.x + p.x, y: base.y + p.y }), 10),
    );
    if (i >= 0) {
      // The click before the double click added a point; drop it again.
      let path: PathMotion = tr;
      const last = tr.points.length - 1;
      if (
        i !== last &&
        near(c, toScreen({ x: base.x + tr.points[last]!.x, y: base.y + tr.points[last]!.y }), 10)
      ) {
        path = removePathPoint(path, last);
      }
      motionEditor.track = toggleSmooth(path, i);
    }
  }

  function key(e: KeyboardEvent) {
    if (!motionEditor.active) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      motionEditor.commit(editor);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      motionEditor.stop();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && motionEditor.selected !== null) {
      const tr = motionEditor.track;
      if (tr?.type === 'path') {
        e.preventDefault();
        e.stopPropagation();
        motionEditor.track = removePathPoint(tr, motionEditor.selected);
        motionEditor.selected = null;
      }
    }
  }

  function wheel(e: WheelEvent) {
    const r = store.renderer;
    if (!r) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    r.setCamera(zoomAt(store.screenLayout, r.camera, { x: e.clientX, y: e.clientY }, factor));
  }

  // Screen geometry.
  const pathLine = $derived.by(() => {
    void frame;
    if (track?.type !== 'path' || track.points.length < 2) return '';
    return buildPathTable(track)
      .pts.map((p) => toScreen({ x: base.x + p.x, y: base.y + p.y }))
      .map((p) => `${p.x},${p.y}`)
      .join(' ');
  });
  const ellipse = $derived.by(() => {
    void frame;
    if (track?.type !== 'orbit' || !centerPos) return '';
    const pts: string[] = [];
    for (let i = 0; i <= 72; i++) {
      const o = orbitOffset({ ...track, speed: 0, phase: (i / 72) * 360 }, 0);
      const s = toScreen({ x: centerPos.x + o.x, y: centerPos.y + o.y });
      pts.push(`${s.x},${s.y}`);
    }
    return pts.join(' ');
  });
  const baseScreen = $derived.by(() => {
    void frame;
    return toScreen(base);
  });
  const k = $derived.by(() => {
    void frame;
    return scaleAt(baseScreen);
  });
</script>

<svelte:window onkeydowncapture={key} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<svg
  class="motion"
  class:picking={motionEditor.picking}
  onpointerdown={pointerDown}
  onpointermove={move}
  onpointerup={up}
  ondblclick={dblclick}
  onwheel={wheel}
  oncontextmenu={(e) => e.preventDefault()}
>
  <rect class="dim" x="0" y="0" width="100%" height="100%" />
  <circle class="me" cx={baseScreen.x} cy={baseScreen.y} r={Math.max(6, radius * k)} />

  {#if track?.type === 'path'}
    <polyline class="line" points={pathLine} />
    {#each track.points as p, i (i)}
      {@const s = toScreen({ x: base.x + p.x, y: base.y + p.y })}
      {#each ['in', 'out'] as const as which (which)}
        {@const h = p[which]}
        {#if h}
          {@const hs = toScreen({ x: base.x + p.x + h.x, y: base.y + p.y + h.y })}
          <line class="arm" x1={s.x} y1={s.y} x2={hs.x} y2={hs.y} />
          <circle class="handle" cx={hs.x} cy={hs.y} r="5" />
        {/if}
      {/each}
      <rect
        class="point"
        class:sel={motionEditor.selected === i}
        class:smooth={p.smooth}
        x={s.x - 6}
        y={s.y - 6}
        width="12"
        height="12"
        rx={p.smooth ? 6 : 1}
      />
    {/each}
  {:else if track?.type === 'orbit' && centerPos}
    {@const c = toScreen(centerPos)}
    {@const h = orbitHandles(track)}
    {@const hx = toScreen({ x: centerPos.x + h.rx.x, y: centerPos.y + h.rx.y })}
    {@const hy = toScreen({ x: centerPos.x + h.ry.x, y: centerPos.y + h.ry.y })}
    <polyline class="line" points={ellipse} />
    <line class="arm" x1={c.x} y1={c.y} x2={hx.x} y2={hx.y} />
    <line class="arm" x1={c.x} y1={c.y} x2={hy.x} y2={hy.y} />
    <circle class="center" cx={c.x} cy={c.y} r="7" />
    <circle class="handle big" cx={hx.x} cy={hx.y} r="8" />
    <circle class="handle big" cx={hy.x} cy={hy.y} r="8" />
  {:else if track?.type === 'wander'}
    {#if track.area.shape === 'circle'}
      <circle class="area" cx={baseScreen.x} cy={baseScreen.y} r={track.area.r * k} />
    {:else}
      <rect
        class="area"
        x={baseScreen.x - (track.area.w / 2) * k}
        y={baseScreen.y - (track.area.h / 2) * k}
        width={track.area.w * k}
        height={track.area.h * k}
      />
    {/if}
  {/if}

  {#if ghost}
    {@const g = toScreen(ghost)}
    <circle class="ghost" cx={g.x} cy={g.y} r={Math.max(6, radius * k)} />
  {/if}
</svg>

<style>
  .motion {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 5;
    cursor: crosshair;
    touch-action: none;
  }
  .motion.picking {
    cursor: pointer;
  }
  .dim {
    fill: var(--bv-search-dim);
  }
  .me {
    fill: none;
    stroke: var(--bv-highlight);
    stroke-width: 3;
  }
  .line {
    fill: none;
    stroke: var(--bv-accent);
    stroke-width: 3;
  }
  .arm {
    stroke: var(--bv-text-2);
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
  }
  .point {
    fill: var(--bv-dialog);
    stroke: var(--bv-accent);
    stroke-width: 2.5;
    cursor: move;
  }
  .point.sel {
    fill: var(--bv-accent);
  }
  .handle {
    fill: var(--bv-highlight);
    stroke: var(--bv-dialog);
    stroke-width: 1.5;
    cursor: move;
  }
  .center {
    fill: var(--bv-highlight);
  }
  .area {
    fill: color-mix(in srgb, var(--bv-accent) 18%, transparent);
    stroke: var(--bv-accent);
    stroke-width: 2;
    stroke-dasharray: 8 5;
  }
  .ghost {
    fill: color-mix(in srgb, var(--bv-highlight) 55%, transparent);
    stroke: var(--bv-highlight);
    stroke-width: 2;
  }
</style>
