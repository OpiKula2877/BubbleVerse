import { describe, expect, it } from 'vitest';
import { sampleWorld } from '../model/fixtures';
import { WorldIndex } from '../model/tree';
import type { World } from '../model/types';
import { computePositions } from '../sim/position';
import { copyBranches, duplicateBranches, pasteBranches } from './clipboard';
import { History } from './history';
import { deleteBubbles, moveBubbles, reorderInto, reparent, setAttach, updateBubble } from './ops';
import { clickSelect, normalizeRect, rectSelect } from './selection';
import { snapPoint, snapToGrid } from './snap';

const positions = (w: World) => computePositions(new WorldIndex(w), { time: null });
const byId = (w: World, id: string) => w.bubbles.find((b) => b.id === id)!;

describe('history', () => {
  it('undoes and redoes snapshots', () => {
    const h = new History();
    const a = sampleWorld();
    const b = updateBubble(a, 'apps', { name: 'A' });
    h.record(a);
    expect(h.undo(b)).toBe(a);
    expect(h.redo(a)).toBe(b);
    expect(h.canRedo).toBe(false);
  });

  it('coalesces edits with the same key and keeps 200 steps', () => {
    const h = new History();
    let w = sampleWorld();
    const start = w;
    for (let i = 0; i < 5; i++) {
      h.record(w, 'name:apps', 1000 + i * 100);
      w = updateBubble(w, 'apps', { name: `A${i}` });
    }
    expect(h.size).toBe(1);
    expect(h.undo(w)).toBe(start);
    const h2 = new History();
    for (let i = 0; i < 250; i++) h2.record(sampleWorld());
    expect(h2.size).toBe(200);
  });

  it('a new edit clears the redo stack', () => {
    const h = new History();
    const a = sampleWorld();
    h.record(a);
    h.undo(a);
    h.record(a);
    expect(h.canRedo).toBe(false);
  });
});

describe('ops', () => {
  it('deletes with descendants and drops orbits around deleted bubbles', () => {
    const w = sampleWorld();
    byId(w, 'mc').motion.track = {
      type: 'orbit',
      center: 'cc',
      rx: 1,
      ry: 1,
      tilt: 0,
      speed: 1,
      dir: 'cw',
      phase: 0,
    };
    const out = deleteBubbles(w, ['apps']);
    expect(out.bubbles.map((b) => b.id).sort()).toEqual(['cs2', 'games', 'mc']);
    expect(byId(out, 'mc').motion.track).toBeUndefined();
  });

  it('moves only topmost selected bubbles', () => {
    const w = moveBubbles(sampleWorld(), ['apps', 'work'], { x: 10, y: 5 });
    expect(byId(w, 'apps').position).toEqual({ x: 10, y: 5 });
    expect(byId(w, 'work').position).toEqual({ x: 200, y: 0 });
  });

  it('reparents keeping the world position', () => {
    const w = sampleWorld();
    const before = positions(w).get('cc')!;
    const out = reparent(w, 'cc', 'games', positions(w));
    expect(byId(out, 'cc').parentId).toBe('games');
    expect(positions(out).get('cc')).toEqual(before);
    expect(reparent(w, 'apps', 'cc', positions(w))).toBe(w);
  });

  it('reparenting to the main level attaches to the world', () => {
    const w = sampleWorld();
    const out = reparent(w, 'cc', null, positions(w));
    expect(byId(out, 'cc').attach).toBe('world');
    expect(byId(out, 'cc').position).toEqual(positions(w).get('cc'));
  });

  it('reorders siblings', () => {
    const out = reorderInto(sampleWorld(), 'work', 0);
    expect(new WorldIndex(out).children('apps').map((b) => b.id)).toEqual(['work', 'ed']);
  });

  it('switches attachment and keeps the world position', () => {
    const w = sampleWorld();
    const out = setAttach(w, ['cc'], 'world', positions(w));
    expect(byId(out, 'cc').position).toEqual({ x: 300, y: 50 });
    expect(positions(out).get('cc')).toEqual({ x: 300, y: 50 });
  });
});

describe('clipboard', () => {
  it('copies a branch with scripts and pastes it with new ids', () => {
    const w = sampleWorld();
    byId(w, 'cc').scripts = [{ kind: 'shared', ref: 'run', params: { path: 'x.exe' } }];
    w.sharedScripts = [
      {
        id: 'run',
        name: 'Run',
        params: [],
        script: { v: 1, trigger: [1], body: [], runMode: 'ignore' },
      },
    ];
    const clip = copyBranches(w, ['work', 'cc'], positions(w))!;
    expect(clip.rootIds).toEqual(['work']);
    expect(clip.bubbles).toHaveLength(2);
    expect(clip.sharedScripts).toHaveLength(1);
    const res = pasteBranches({ ...w, sharedScripts: [] }, clip, 'games', positions(w), {
      x: 0,
      y: 900,
    });
    expect(res.world.bubbles).toHaveLength(w.bubbles.length + 2);
    const [root] = res.rootIds;
    const pasted = byId(res.world, root!);
    expect(pasted.parentId).toBe('games');
    expect(positions(res.world).get(root!)).toEqual({ x: 0, y: 900 });
    const child = res.world.bubbles.find((b) => b.parentId === root)!;
    expect(child.name).toBe('Claude Code');
    expect(child.scripts).toEqual([{ kind: 'shared', ref: 'run', params: { path: 'x.exe' } }]);
    expect(res.world.sharedScripts).toHaveLength(1);
  });

  it('remaps orbit centers and ancestor skins inside the copied branch', () => {
    const w = sampleWorld();
    byId(w, 'cc').motion.track = {
      type: 'orbit',
      center: 'work',
      rx: 1,
      ry: 1,
      tilt: 0,
      speed: 1,
      dir: 'cw',
      phase: 0,
    };
    byId(w, 'cc').skin = { mode: 'inherit', from: { ancestor: 'work' } };
    const clip = copyBranches(w, ['work'], positions(w))!;
    const res = pasteBranches(w, clip, null, positions(w));
    const newWork = res.rootIds[0]!;
    const child = res.world.bubbles.find((b) => b.parentId === newWork)!;
    expect(child.motion.track).toMatchObject({ center: newWork });
    expect(child.skin).toEqual({ mode: 'inherit', from: { ancestor: newWork } });
    expect(byId(res.world, newWork).attach).toBe('world');
  });

  it('duplicates next to the original under the same parent', () => {
    const w = sampleWorld();
    const res = duplicateBranches(w, ['cs2'], positions(w));
    const copy = byId(res.world, res.rootIds[0]!);
    expect(copy.parentId).toBe('games');
    const p = positions(res.world).get(copy.id)!;
    const o = positions(w).get('cs2')!;
    expect(p).toEqual({ x: o.x + 30, y: o.y + 30 });
  });

  it('pasting onto an action puts the copy next to it', () => {
    const w = sampleWorld();
    const clip = copyBranches(w, ['ed'], positions(w))!;
    const res = pasteBranches(w, clip, 'cs2', positions(w));
    expect(byId(res.world, res.rootIds[0]!).parentId).toBe('games');
  });
});

describe('snap', () => {
  it('snaps to grid', () => {
    expect(snapToGrid({ x: 23, y: -26 }, 20)).toEqual({ x: 20, y: -20 });
  });

  it('aligns with neighbors and shows guides', () => {
    const r = snapPoint(
      { x: 103, y: 47 },
      [
        { x: 100, y: 300 },
        { x: 500, y: 50 },
      ],
      20,
      6,
    );
    expect(r.point).toEqual({ x: 100, y: 50 });
    expect(r.guides).toEqual([
      { axis: 'x', value: 100, from: 50, to: 300 },
      { axis: 'y', value: 50, from: 100, to: 500 },
    ]);
  });
});

describe('selection', () => {
  const order = ['a', 'b', 'c', 'd'];
  it('handles click, ctrl and shift', () => {
    let s = clickSelect(
      { ids: new Set(), anchor: null },
      'b',
      { ctrl: false, shift: false },
      order,
    );
    expect([...s.ids]).toEqual(['b']);
    s = clickSelect(s, 'd', { ctrl: false, shift: true }, order);
    expect([...s.ids]).toEqual(['b', 'c', 'd']);
    s = clickSelect(s, 'c', { ctrl: true, shift: false }, order);
    expect([...s.ids].sort()).toEqual(['b', 'd']);
  });

  it('selects by rectangle', () => {
    const rect = normalizeRect({ x: 10, y: 10 }, { x: 0, y: 0 });
    const ids = rectSelect(rect, [
      { id: 'in', pos: { x: 5, y: 5 }, radius: 1 },
      { id: 'touch', pos: { x: 15, y: 5 }, radius: 6 },
      { id: 'out', pos: { x: 30, y: 30 }, radius: 5 },
    ]);
    expect([...ids].sort()).toEqual(['in', 'touch']);
  });
});
