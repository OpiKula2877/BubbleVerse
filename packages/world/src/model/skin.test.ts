import { describe, expect, it } from 'vitest';
import { defaultSkin } from './defaults';
import { fixtureBubble } from './fixtures';
import { mergeSkin, SkinResolver } from './skin';
import { WorldIndex } from './tree';
import type { Skin, World } from './types';
import { emptyWorld } from './defaults';

const own = (skin: Partial<Skin>) => ({
  mode: 'own' as const,
  skin: { ...defaultSkin(), ...skin },
});

/** Spec §3.3: Aplikace (blue) → Pracovní Aplikace (image) → Práce 1 (gif) → Claude Code (= Pracovní Aplikace) */
function specWorld(): World {
  return {
    ...emptyWorld(),
    bubbles: [
      fixtureBubble('apl', null, 'Aplikace', 'folder', 0, { skin: own({ fill: '#0000FF' }) }),
      fixtureBubble('pa', 'apl', 'Pracovní Aplikace', 'folder', 0, {
        skin: {
          mode: 'inherit',
          from: 'parent',
          overrides: { media: { type: 'image', asset: 'img' } },
        },
      }),
      fixtureBubble('p1', 'pa', 'Práce 1', 'folder', 0, {
        skin: {
          mode: 'inherit',
          from: 'parent',
          overrides: { media: { type: 'gif', asset: 'gif' } },
        },
      }),
      fixtureBubble('cc', 'p1', 'Claude Code', 'action', 0, {
        skin: {
          mode: 'inherit',
          from: { ancestor: 'pa' },
          overrides: { label: { color: '#FF0000' } as Skin['label'] },
        },
      }),
      fixtureBubble('root-kid', 'p1', 'Root kid', 'action', 1, {
        skin: { mode: 'inherit', from: 'root' },
      }),
    ],
  };
}

describe('skin inheritance', () => {
  it('follows the example from the spec', () => {
    const r = new SkinResolver(new WorldIndex(specWorld()));
    expect(r.skin('pa').fill).toBe('#0000FF');
    expect(r.skin('pa').media).toEqual({ type: 'image', asset: 'img' });
    expect(r.skin('p1').media).toEqual({ type: 'gif', asset: 'gif' });
    const cc = r.skin('cc');
    expect(cc.media).toEqual({ type: 'image', asset: 'img' });
    expect(cc.fill).toBe('#0000FF');
    // Override of a single label field keeps the other inherited label fields.
    expect(cc.label?.color).toBe('#FF0000');
    expect(cc.label?.size).toBe(defaultSkin().label?.size);
  });

  it('inherits from the top ancestor', () => {
    const r = new SkinResolver(new WorldIndex(specWorld()));
    expect(r.skin('root-kid').media).toBeUndefined();
    expect(r.skin('root-kid').fill).toBe('#0000FF');
  });

  it('changing an ancestor changes all bubbles inheriting from it', () => {
    const w = specWorld();
    const apl = w.bubbles[0];
    if (apl?.skin.mode === 'own') apl.skin.skin.fill = '#00FF00';
    const r = new SkinResolver(new WorldIndex(w));
    expect(['pa', 'p1', 'cc', 'root-kid'].map((id) => r.skin(id).fill)).toEqual([
      '#00FF00',
      '#00FF00',
      '#00FF00',
      '#00FF00',
    ]);
  });

  it('falls back to the parent when the chosen ancestor is not an ancestor any more', () => {
    const w = specWorld();
    const cc = w.bubbles.find((b) => b.id === 'cc');
    if (cc && cc.skin.mode === 'inherit') cc.skin.from = { ancestor: 'missing' };
    const r = new SkinResolver(new WorldIndex(w));
    expect(r.skin('cc').media).toEqual({ type: 'gif', asset: 'gif' });
  });

  it('uses the default skin for a main bubble that inherits', () => {
    const w = specWorld();
    w.bubbles[0] = {
      ...w.bubbles[0]!,
      skin: { mode: 'inherit', from: 'parent', overrides: { size: 10 } },
    };
    const r = new SkinResolver(new WorldIndex(w));
    expect(r.skin('apl')).toEqual({ ...defaultSkin(), size: 10 });
  });

  it('merges edge field by field', () => {
    const base: Skin = {
      ...defaultSkin(),
      edge: { glass: true, outline: { color: '#000000', width: 2 } },
    };
    const out = mergeSkin(base, { edge: { glow: { color: '#FFFFFF', strength: 1 } } });
    expect(out.edge).toEqual({
      glass: true,
      outline: { color: '#000000', width: 2 },
      glow: { color: '#FFFFFF', strength: 1 },
    });
  });
});

describe('link inheritance', () => {
  it('uses the parent link style for "same as parent"', () => {
    const w = specWorld();
    w.bubbles[1]!.link = {
      inherit: false,
      type: 'lightning',
      color: '#123456',
      width: 3,
      opacity: 1,
    };
    w.bubbles[2]!.link = { inherit: true, type: 'line', color: '#FFFFFF', width: 1, opacity: 1 };
    w.bubbles[3]!.link = { inherit: true, type: 'line', color: '#FFFFFF', width: 1, opacity: 1 };
    const r = new SkinResolver(new WorldIndex(w));
    expect(r.link('cc').type).toBe('lightning');
    expect(r.link('cc').color).toBe('#123456');
    expect(r.link('p1').inherit).toBe(false);
  });
});
