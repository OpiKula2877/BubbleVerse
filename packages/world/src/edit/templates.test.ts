import { describe, expect, it } from 'vitest';
import { emptyWorld } from '../model/defaults';
import { fixtureBubble } from '../model/fixtures';
import type { Bubble, World } from '../model/types';
import {
  addTemplate,
  applyTemplate,
  removeTemplate,
  templateFrom,
  withTemplate,
} from './templates';

function styled(): Bubble {
  return fixtureBubble('src', 'f', 'Source', 'action', 0, {
    skin: { mode: 'own', skin: { shape: 'star', size: 50, fill: '#FF0000' } },
    motion: { spin: { speed: 30, dir: 'cw' } },
    hover: { grow: false, shake: true, glow: false, tooltip: true },
    showName: 'hover',
    scripts: [{ kind: 'shared', ref: 'builtin.openUrl', params: { url: 'https://x.cz' } }],
  });
}

function world(): World {
  return {
    ...emptyWorld(),
    bubbles: [
      fixtureBubble('f', null, 'Folder', 'folder'),
      styled(),
      fixtureBubble('a', 'f', 'Target', 'action', 1),
      fixtureBubble('g', 'f', 'Sub folder', 'folder', 2),
    ],
  };
}

describe('templates', () => {
  it('stores look, behaviour and scripts of a bubble as a copy', () => {
    const b = styled();
    const t = templateFrom(b, 't1', 'Red star');
    expect(t).toMatchObject({ id: 't1', name: 'Red star', showName: 'hover', attach: 'parent' });
    expect(t.skin).toEqual(b.skin);
    expect(t.scripts).toEqual(b.scripts);
    expect(t.skin).not.toBe(b.skin);
  });

  it('adds, replaces and removes templates', () => {
    let w = addTemplate(world(), templateFrom(styled(), 't1', 'One'));
    w = addTemplate(w, templateFrom(styled(), 't1', 'One again'));
    expect(w.templates.map((t) => t.name)).toEqual(['One again']);
    expect(removeTemplate(w, 't1').templates).toEqual([]);
  });

  it('applies to selected bubbles; folders keep their scripts', () => {
    const t = templateFrom(styled(), 't1', 'Red star');
    const w = applyTemplate(world(), ['a', 'g'], t);
    const a = w.bubbles.find((b) => b.id === 'a')!;
    const g = w.bubbles.find((b) => b.id === 'g')!;
    expect(a.skin).toEqual(t.skin);
    expect(a.scripts).toEqual(t.scripts);
    expect(a.name).toBe('Target');
    expect(g.skin).toEqual(t.skin);
    expect(g.scripts).toEqual([]);
    expect(g.showName).toBe('hover');
  });

  it('keeps main bubbles attached to the world', () => {
    const t = templateFrom(styled(), 't1', 'x');
    expect(withTemplate(fixtureBubble('m', null, 'Main', 'action'), t).attach).toBe('world');
  });
});
