import { describe, expect, it } from 'vitest';
import { sampleWorld } from '../model/fixtures';
import { SkinResolver } from '../model/skin';
import { WorldIndex } from '../model/tree';
import type { World } from '../model/types';
import {
  commonValue,
  isOverridden,
  resetOverride,
  setSkinMode,
  writeLabel,
  writeSkin,
} from './skin-edit';

const skinOf = (w: World, id: string) => new SkinResolver(new WorldIndex(w)).skin(id);

describe('skin editing', () => {
  it('edits own skins and turns edits on inheriting bubbles into overrides', () => {
    let w = sampleWorld();
    w = writeSkin(w, ['apps', 'work'], 'fill', '#123456');
    const apps = w.bubbles.find((b) => b.id === 'apps')!;
    const work = w.bubbles.find((b) => b.id === 'work')!;
    expect(apps.skin.mode === 'own' && apps.skin.skin.fill).toBe('#123456');
    expect(isOverridden(work, 'fill')).toBe(true);
    expect(skinOf(w, 'cc').fill).toBe('#123456');
  });

  it('reports common and mixed values', () => {
    let w = sampleWorld();
    expect(commonValue(w, ['work', 'ed'], (s) => s.fill)).toEqual({
      mixed: false,
      value: skinOf(w, 'work').fill,
    });
    w = writeSkin(w, ['ed'], 'fill', '#000000');
    expect(commonValue(w, ['work', 'ed'], (s) => s.fill)?.mixed).toBe(true);
    expect(commonValue(w, [], (s) => s.fill)).toBeNull();
  });

  it('overrides a single label field and resets overrides', () => {
    let w = writeLabel(sampleWorld(), ['cc'], 'color', '#FF0000');
    expect(skinOf(w, 'cc').label?.color).toBe('#FF0000');
    expect(skinOf(w, 'cc').label?.size).toBe(skinOf(w, 'work').label?.size);
    w = resetOverride(w, ['cc'], 'label');
    expect(skinOf(w, 'cc').label?.color).toBe(skinOf(w, 'work').label?.color);
  });

  it('switches between own and inherited skins keeping the look', () => {
    let w = writeSkin(sampleWorld(), ['apps'], 'fill', '#ABCDEF');
    const before = skinOf(w, 'cc');
    w = setSkinMode(w, ['cc'], 'own');
    expect(w.bubbles.find((b) => b.id === 'cc')!.skin.mode).toBe('own');
    expect(skinOf(w, 'cc')).toEqual(before);
    w = setSkinMode(w, ['cc'], 'inherit', 'root');
    expect(w.bubbles.find((b) => b.id === 'cc')!.skin).toMatchObject({
      mode: 'inherit',
      from: 'root',
    });
    expect(skinOf(w, 'cc').fill).toBe('#ABCDEF');
  });
});
