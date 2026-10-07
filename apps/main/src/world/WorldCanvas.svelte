<script lang="ts">
  import {
    computePositions,
    moveBubbles,
    normalizeRect,
    panBy,
    rectSelect,
    reparent,
    snapPoint,
    viewportAt,
    WorldIndex,
    WorldRenderer,
    zoomAt,
    type BubbleId,
    type Guide,
    type Vec2,
    type World,
  } from '@bv/world';
  import { onDestroy, onMount } from 'svelte';
  import { GRID_SIZE } from '../lib/editor.svelte';
  import { store } from '../lib/store.svelte';

  let { onready }: { onready: (r: WorldRenderer) => void } = $props();

  let host: HTMLDivElement;
  let renderer: WorldRenderer | null = null;
  let tooltip = $state<{ x: number; y: number; text: string } | null>(null);

  interface MoveDrag {
    kind: 'move';
    start: Vec2;
    startWorld: Vec2;
    before: World;
    ids: BubbleId[];
    /** Moving bubbles and their descendants. */
    moving: Set<BubbleId>;
    lead: Vec2;
    neighbors: Vec2[];
    moved: boolean;
    alt: boolean;
    hit: BubbleId;
    mods: { ctrl: boolean; shift: boolean };
  }

  type Drag =
    | { kind: 'pan'; start: Vec2; moved: boolean; button: number; hit: BubbleId | null }
    | MoveDrag
    | { kind: 'rect'; start: Vec2; startWorld: Vec2; additive: boolean; moved: boolean };

  let drag: Drag | null = null;

  const css = (e: PointerEvent | MouseEvent | WheelEvent): Vec2 => ({ x: e.clientX, y: e.clientY });
  const far = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y) > 4;
  const gridOverlay = () => (store.editor?.grid ? GRID_SIZE : null);

  onMount(() => {
    void WorldRenderer.create({
      host,
      assetUrl: (h) => store.core.assetUrl(h),
      graphicsApi: store.settings.performance.graphicsApi,
      onStats: (s) => (store.stats = s),
    }).then((r) => {
      renderer = r;
      onready(r);
    });
  });

  onDestroy(() => renderer?.destroy());

  function worldAt(p: Vec2): Vec2 | null {
    return renderer?.screenToWorld(p) ?? null;
  }

  function pointerdown(e: PointerEvent) {
    if (!renderer) return;
    host.setPointerCapture(e.pointerId);
    const p = css(e);
    const wp = worldAt(p);
    const hit = wp ? renderer.hitTest(wp) : null;
    tooltip = null;
    const ed = store.editor;
    if (!ed || e.button !== 0) {
      drag = { kind: 'pan', start: p, moved: false, button: e.button, hit };
      return;
    }
    if (hit && wp) {
      const mods = { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey };
      if (!ed.selection.ids.has(hit) || mods.shift) ed.click(hit, mods);
      else if (mods.ctrl) ed.click(hit, mods);
      const before = ed.world!;
      const index = new WorldIndex(before);
      const ids = index.topmost(ed.selected);
      const moving = new Set(ids.flatMap((id) => [id, ...index.descendants(id).map((b) => b.id)]));
      const positions = computePositions(index, { time: null });
      drag = {
        kind: 'move',
        start: p,
        startWorld: wp,
        before,
        ids,
        moving,
        lead: positions.get(hit) ?? wp,
        neighbors: [...positions].filter(([id]) => !moving.has(id)).map(([, v]) => v),
        moved: false,
        alt: e.altKey,
        hit,
        mods,
      };
    } else if (wp) {
      drag = { kind: 'rect', start: p, startWorld: wp, additive: e.ctrlKey || e.shiftKey, moved: false };
    }
  }

  function moveDelta(d: MoveDrag, wp: Vec2): { delta: Vec2; guides: Guide[] } {
    const raw = { x: wp.x - d.startWorld.x, y: wp.y - d.startWorld.y };
    if (!store.editor?.grid || !renderer) return { delta: raw, guides: [] };
    const target = { x: d.lead.x + raw.x, y: d.lead.y + raw.y };
    const k = renderer.viewports().find((v) => v.primary)?.k ?? 1;
    const snap = snapPoint(target, d.neighbors, GRID_SIZE, 8 / k);
    return { delta: { x: snap.point.x - d.lead.x, y: snap.point.y - d.lead.y }, guides: snap.guides };
  }

  function pointermove(e: PointerEvent) {
    if (!renderer) return;
    const p = css(e);
    const wp = worldAt(p);
    renderer.setMouse(wp);
    if (!drag) {
      const hit = wp ? renderer.hitTest(wp) : null;
      renderer.setHover(hit);
      updateTooltip(hit, p);
      return;
    }
    if (!drag.moved && !far(drag.start, p)) return;
    drag.moved = true;
    if (drag.kind === 'pan') {
      const vp = viewportAt(renderer.viewports(), p);
      if (vp) renderer.setCamera(panBy(renderer.camera, vp, e.movementX, e.movementY));
    } else if (drag.kind === 'move' && wp) {
      const { delta, guides } = moveDelta(drag, wp);
      store.editor?.live(moveBubbles(drag.before, drag.ids, delta));
      renderer.setOverlay({ rect: null, guides, grid: gridOverlay() });
    } else if (drag.kind === 'rect' && wp) {
      renderer.setOverlay({ rect: normalizeRect(drag.startWorld, wp), guides: [], grid: gridOverlay() });
    }
  }

  function pointerup(e: PointerEvent) {
    const d = drag;
    drag = null;
    if (!renderer || !d) return;
    const p = css(e);
    const wp = worldAt(p);
    const ed = store.editor;
    renderer.setOverlay({ rect: null, guides: [], grid: gridOverlay() });
    if (d.kind === 'pan') {
      if (d.moved) return;
      if (d.button === 2) return openMenu(p, wp, d.hit);
      if (d.button === 0 && !ed) void clickUser(d.hit);
      return;
    }
    if (!ed) return;
    if (d.kind === 'move') {
      if (!d.moved) {
        if (!d.mods.ctrl && !d.mods.shift) ed.click(d.hit, d.mods);
        return;
      }
      if (d.alt && wp) {
        // Alt + drag onto a folder changes the parent (spec §4.3).
        const target = renderer
          .displayed()
          .slice()
          .reverse()
          .find(
            (b) =>
              !d.moving.has(b.id) &&
              Math.hypot(b.x - wp.x, b.y - wp.y) <= b.r &&
              new WorldIndex(d.before).get(b.id)?.kind === 'folder',
          );
        if (target) {
          let w = ed.world!;
          for (const id of d.ids) {
            w = reparent(w, id, target.id, computePositions(new WorldIndex(w), { time: null }));
          }
          ed.live(w);
        }
      }
      ed.record(d.before);
      return;
    }
    if (!d.moved) {
      if (!d.additive) ed.select([]);
      return;
    }
    if (!wp) return;
    const ids = rectSelect(
      normalizeRect(d.startWorld, wp),
      renderer
        .displayed()
        .filter((b) => b.vis > 0.5)
        .map((b) => ({ id: b.id, pos: { x: b.x, y: b.y }, radius: b.r })),
      d.additive ? ed.selection.ids : new Set(),
    );
    ed.select(ids);
  }

  async function clickUser(hit: BubbleId | null) {
    if (!hit || !renderer) return;
    const b = new WorldIndex(store.published).get(hit);
    if (!b) return;
    if (b.kind === 'folder') {
      renderer.expand.toggle(b.id);
      renderer.requestRender();
      return;
    }
    try {
      await store.core.activate(b.id);
    } catch (e) {
      store.error(e);
    }
  }

  function dblclick(e: MouseEvent) {
    if (!renderer || !store.editor) return;
    const wp = worldAt(css(e));
    const hit = wp ? renderer.hitTest(wp) : null;
    if (hit && store.editor.index.get(hit)?.kind === 'folder') {
      renderer.expand.toggle(hit);
      renderer.requestRender();
    }
  }

  function openMenu(p: Vec2, wp: Vec2 | null, hit: BubbleId | null) {
    const ed = store.editor;
    if (!ed || !wp) return;
    if (hit && !ed.selection.ids.has(hit)) ed.select([hit], hit);
    if (!hit) ed.select([]);
    ed.menu = { x: p.x - store.uiRect.x, y: p.y - store.uiRect.y, target: hit, world: wp };
  }

  function wheel(e: WheelEvent) {
    if (!renderer) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    renderer.setCamera(zoomAt(store.screenLayout, renderer.camera, css(e), factor));
  }

  function updateTooltip(hit: BubbleId | null, p: Vec2) {
    const index = new WorldIndex(store.world);
    const b = hit ? index.get(hit) : undefined;
    tooltip = b && b.hover.tooltip ? { x: p.x + 14, y: p.y + 18, text: index.pathString(b.id) } : null;
  }
</script>

<div
  class="canvas"
  bind:this={host}
  role="application"
  onpointerdown={pointerdown}
  onpointermove={pointermove}
  onpointerup={pointerup}
  onpointerleave={() => {
    renderer?.setHover(null);
    renderer?.setMouse(null);
    tooltip = null;
  }}
  ondblclick={dblclick}
  onwheel={wheel}
  oncontextmenu={(e) => e.preventDefault()}
></div>

{#if tooltip}
  <div class="tooltip" style:left="{tooltip.x}px" style:top="{tooltip.y}px">{tooltip.text}</div>
{/if}

<style>
  .canvas {
    position: absolute;
    inset: 0;
    touch-action: none;
  }
  .tooltip {
    position: absolute;
    z-index: 40;
    pointer-events: none;
    padding: 4px 8px;
    border-radius: 6px;
    background: var(--bv-tooltip);
    color: var(--bv-tooltip-text);
    font-size: 12px;
    white-space: nowrap;
  }
</style>
