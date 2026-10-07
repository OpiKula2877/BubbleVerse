import { describe, expect, it } from 'vitest';
import { createBubble } from './defaults';
import { sampleWorld } from './fixtures';
import { newId } from './ids';
import { WorldIndex } from './tree';

describe('ids', () => {
  it('creates sortable unique short ids', () => {
    const ids = Array.from({ length: 500 }, () => newId(1_700_000_000_000));
    expect(new Set(ids).size).toBe(500);
    expect(ids[0]).toHaveLength(16);
    expect([...ids].sort()).toEqual(ids);
    expect(newId(1) < newId(2)).toBe(true);
  });
});

describe('createBubble', () => {
  it('gives main bubbles their own skin and sub-bubbles an inherited, smaller one', () => {
    const main = createBubble({ kind: 'folder' });
    expect(main.skin.mode).toBe('own');
    expect(main.attach).toBe('world');
    expect(main.expanded).toBe(true);
    const child = createBubble({
      kind: 'action',
      parentId: main.id,
      parentSize: 100,
      color: '#FF0000',
    });
    expect(child.attach).toBe('parent');
    expect(child.skin).toEqual({
      mode: 'inherit',
      from: 'parent',
      overrides: { size: 65, fill: '#FF0000' },
    });
    expect(child.expanded).toBeUndefined();
  });
});

describe('WorldIndex', () => {
  const idx = new WorldIndex(sampleWorld());

  it('orders children and roots', () => {
    expect(idx.roots().map((b) => b.id)).toEqual(['apps', 'games']);
    expect(idx.children('apps').map((b) => b.id)).toEqual(['ed', 'work']);
  });

  it('builds paths', () => {
    expect(idx.pathString('cc')).toBe('Apps | Work | Claude Code');
    expect(idx.depth('cc')).toBe(2);
    expect(idx.rootOf('cc')?.id).toBe('apps');
    expect(idx.rootOf('apps')?.id).toBe('apps');
  });

  it('lists descendants depth first', () => {
    expect(idx.descendants('apps').map((b) => b.id)).toEqual(['ed', 'work', 'cc']);
    expect(idx.flatten().map((b) => b.id)).toEqual([
      'apps',
      'ed',
      'work',
      'cc',
      'games',
      'cs2',
      'mc',
    ]);
  });

  it('prevents cycles and non-folder parents when reparenting', () => {
    expect(idx.canReparent('apps', 'cc')).toBe(false);
    expect(idx.canReparent('apps', 'work')).toBe(false);
    expect(idx.canReparent('work', 'work')).toBe(false);
    expect(idx.canReparent('work', 'games')).toBe(true);
    expect(idx.canReparent('cc', null)).toBe(true);
  });

  it('keeps only topmost selected bubbles', () => {
    expect(idx.topmost(['apps', 'cc', 'cs2']).sort()).toEqual(['apps', 'cs2']);
  });

  it('treats bubbles with a missing parent as main bubbles', () => {
    const w = sampleWorld();
    w.bubbles.push({
      ...createBubble({ kind: 'action', parentId: 'ghost' }),
      id: 'orphan',
      order: 5,
    });
    const i = new WorldIndex(w);
    expect(i.roots().map((b) => b.id)).toContain('orphan');
    expect(i.ancestors('orphan')).toEqual([]);
  });
});
