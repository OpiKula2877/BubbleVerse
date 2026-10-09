import { OPEN_URL_SCRIPT, RUN_FILE_SCRIPT } from '@bv/blocks';
import { emptyWorld, fixtureBubble, templateFrom, type World } from '@bv/world';
import { describe, expect, it } from 'vitest';
import {
  defaultGenOptions,
  fileItem,
  generate,
  itemName,
  layoutPositions,
  urlItem,
} from './generate';

function world(): World {
  return {
    ...emptyWorld(),
    bubbles: [
      fixtureBubble('apps', null, 'Apps', 'folder', 0, {
        skin: { mode: 'own', skin: { shape: 'circle', size: 100, fill: '#123456' } },
      }),
      fixtureBubble('old', 'apps', 'Old', 'action', 4),
    ],
  };
}

describe('generator items', () => {
  it('reads name, extension and folder from a path', () => {
    expect(fileItem('C:\\Games\\Doom\\doom.exe')).toMatchObject({
      target: 'C:\\Games\\Doom\\doom.exe',
      name: 'doom',
      ext: '.exe',
      folder: 'Doom',
      kind: 'file',
      icon: 'exe',
    });
    expect(fileItem('C:/x/README')).toMatchObject({ name: 'README', ext: '' });
  });

  it('accepts web sites with or without a scheme and skips other lines', () => {
    expect(urlItem('www.seznam.cz')).toMatchObject({
      target: 'https://www.seznam.cz/',
      name: 'seznam.cz',
      kind: 'url',
      icon: 'favicon',
    });
    expect(urlItem('  https://github.com/x  ')?.name).toBe('github.com');
    expect(urlItem('')).toBeNull();
    expect(urlItem('not a url')).toBeNull();
  });

  it('names bubbles from the template with prefix and suffix', () => {
    const item = fileItem('C:\\Games\\Doom\\doom.exe');
    const o = { nameTemplate: 'name' as const, prefix: '', suffix: '' };
    expect(itemName(item, o)).toBe('doom');
    expect(itemName(item, { ...o, nameTemplate: 'nameExt' })).toBe('doom.exe');
    expect(itemName(item, { ...o, nameTemplate: 'folder', prefix: '[', suffix: ']' })).toBe(
      '[Doom]',
    );
  });
});

describe('layout', () => {
  it('spreads bubbles without overlap in every layout', () => {
    for (const layout of ['circle', 'grid', 'spiral'] as const) {
      const pts = layoutPositions(30, layout, 100, 65);
      expect(pts).toHaveLength(30);
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const d = Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y);
          expect(d, `${layout} ${i}-${j}`).toBeGreaterThanOrEqual(65);
        }
        // Outside the parent.
        expect(Math.hypot(pts[i]!.x, pts[i]!.y)).toBeGreaterThan(50 + 32);
      }
    }
  });
});

describe('generate', () => {
  it('creates action bubbles under the folder with the built-in scripts and auto icons', () => {
    const items = [fileItem('C:\\a\\one.exe'), fileItem('C:\\a\\two.exe'), urlItem('example.com')!];
    items[0]!.asset = 'abc';
    const { world: w, ids } = generate(world(), items, defaultGenOptions('apps'));
    expect(ids).toHaveLength(3);
    const made = w.bubbles.filter((b) => ids.includes(b.id));
    expect(made.map((b) => b.name)).toEqual(['one', 'two', 'example.com']);
    expect(made.map((b) => b.order)).toEqual([5, 6, 7]);
    expect(
      made.every((b) => b.parentId === 'apps' && b.kind === 'action' && b.attach === 'parent'),
    ).toBe(true);
    expect(made[0]!.scripts).toEqual([
      { kind: 'shared', ref: RUN_FILE_SCRIPT, params: { path: 'C:\\a\\one.exe', args: '' } },
    ]);
    expect(made[2]!.scripts).toEqual([
      { kind: 'shared', ref: OPEN_URL_SCRIPT, params: { url: 'https://example.com/' } },
    ]);
    expect(made[0]!.skin).toEqual({
      mode: 'inherit',
      from: 'parent',
      overrides: { size: 65, media: { type: 'auto', source: 'exe', asset: 'abc' } },
    });
    expect(w.sharedScripts.map((s) => s.id).sort()).toEqual(
      [OPEN_URL_SCRIPT, RUN_FILE_SCRIPT].sort(),
    );
  });

  it('uses another shared script with the target as its parameter', () => {
    const o = {
      ...defaultGenOptions('apps'),
      script: { kind: 'shared' as const, id: 'sh', param: 'game' },
    };
    const { world: w, ids } = generate(world(), [fileItem('C:\\g.exe')], o);
    expect(w.bubbles.find((b) => b.id === ids[0])!.scripts).toEqual([
      { kind: 'shared', ref: 'sh', params: { game: 'C:\\g.exe' } },
    ]);
    expect(w.sharedScripts).toEqual([]);
  });

  it('can inherit the look or use a template', () => {
    const base = world();
    const tpl = templateFrom(
      fixtureBubble('x', 'apps', 'X', 'action', 0, {
        skin: { mode: 'own', skin: { shape: 'star', size: 40, fill: '#FF0000' } },
      }),
      't1',
      'Star',
    );
    const withTpl: World = { ...base, templates: [tpl] };
    const a = generate(base, [fileItem('C:\\g.exe')], {
      ...defaultGenOptions('apps'),
      look: { kind: 'inherit' },
    });
    expect(a.world.bubbles.at(-1)!.skin).toEqual({
      mode: 'inherit',
      from: 'parent',
      overrides: { size: 65 },
    });
    const b = generate(withTpl, [fileItem('C:\\g.exe')], {
      ...defaultGenOptions('apps'),
      look: { kind: 'template', id: 't1' },
    });
    expect(b.world.bubbles.at(-1)!.skin).toEqual(tpl.skin);
    // The generator's script wins over the template's scripts.
    expect(b.world.bubbles.at(-1)!.scripts[0]).toMatchObject({ ref: RUN_FILE_SCRIPT });
  });

  it('places main-level bubbles around the home view', () => {
    const w = { ...world(), homeView: { x: 1000, y: 500, zoom: 1 } };
    const { world: out, ids } = generate(w, [fileItem('C:\\g.exe')], defaultGenOptions(null));
    const b = out.bubbles.find((x) => x.id === ids[0])!;
    expect(b.attach).toBe('world');
    expect(Math.hypot(b.position.x - 1000, b.position.y - 500)).toBeGreaterThan(60);
  });
});
