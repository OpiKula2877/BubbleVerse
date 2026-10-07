import { describe, expect, it } from 'vitest';
import { fuzzyScore, pushHistory, SearchSession, type SearchItem } from './engine';
import { normalizeText } from './normalize';

const item = (id: string, parentId: string | null, name: string, kind: SearchItem['kind'] = 'action'): SearchItem => ({
  id,
  parentId,
  name,
  kind,
  order: 0,
});

/**
 * Aplikáce ── Automatika ─┬─ Minecraft auto gui
 *                         └─ Minecraft servery
 * House ── Website ── Kouzlo
 * Louka ── Složka ── Kouzlo
 * Games ─┬─ Mine (folder) ── Deep ── Run me
 *        └─ CS2
 */
const items: SearchItem[] = [
  item('apl', null, 'Aplikáce', 'folder'),
  item('auto', 'apl', 'Automatika', 'folder'),
  item('mag', 'auto', 'Minecraft auto gui'),
  item('ms', 'auto', 'Minecraft servery'),
  item('house', null, 'House', 'folder'),
  item('web', 'house', 'Website', 'folder'),
  item('k1', 'web', 'Kouzlo'),
  item('louka', null, 'Louka', 'folder'),
  item('slozka', 'louka', 'Složka', 'folder'),
  item('k2', 'slozka', 'Kouzlo'),
  item('games', null, 'Games', 'folder'),
  item('mine', 'games', 'Mine', 'folder'),
  item('deep', 'mine', 'Deep', 'folder'),
  item('run', 'deep', 'Run me'),
  item('cs2', 'games', 'CS2'),
];

const names = (s: SearchSession) => s.options().map((o) => o.item.name);

describe('search engine', () => {
  it('ignores case and diacritics', () => {
    expect(normalizeText('Aplikáce ŠKODA')).toBe('aplikace skoda');
    const s = new SearchSession(items);
    s.input('aplikace');
    expect(names(s)).toEqual(['Aplikáce']);
  });

  it('starts with all main bubbles colored, sorted alphabetically', () => {
    const s = new SearchSession(items);
    const v = s.view();
    expect(names(s)).toEqual(['Aplikáce', 'Games', 'House', 'Louka']);
    expect([...v.colored].sort()).toEqual(['apl', 'games', 'house', 'louka']);
    expect(v.position).toBe(1);
    expect(v.total).toBe(4);
  });

  it('filters by the start of the name with ghost text and cycles with arrows', () => {
    const s = new SearchSession(items);
    s.input('a');
    s.key('tab');
    s.key('tab');
    s.input('Mi');
    let v = s.view();
    expect(v.prefix).toBe('Aplikáce | Automatika | ');
    expect(v.current?.item.name).toBe('Minecraft auto gui');
    expect(v.ghost).toBe('necraft auto gui');
    expect(v.next?.item.name).toBe('Minecraft servery');
    expect([v.position, v.total]).toEqual([1, 2]);
    s.key('down');
    v = s.view();
    expect(v.current?.item.name).toBe('Minecraft servery');
    expect(v.prev?.item.name).toBe('Minecraft auto gui');
    s.key('down');
    expect(s.view().position).toBe(1);
  });

  it('does not go a level down without TAB', () => {
    const s = new SearchSession(items);
    s.input('Minecraft');
    expect(s.view().total).toBe(0);
  });

  it('falls back to fuzzy matching', () => {
    expect(fuzzyScore('mcgui', 'minecraft auto gui')).not.toBeNull();
    expect(fuzzyScore('xyz', 'minecraft')).toBeNull();
    const s = new SearchSession(items);
    s.input(':mcgui');
    const v = s.view();
    expect(v.current?.item.name).toBe('Minecraft auto gui');
    expect(v.current?.fuzzy).toBe(true);
    expect(v.suggestion).toBe('Minecraft auto gui');
    expect(v.ghost).toBe('');
  });

  it('runs an action three levels deep only with the keyboard', () => {
    const s = new SearchSession(items);
    s.input('g');
    expect(s.key('tab')).toEqual({ kind: 'focus', id: 'games' });
    s.input('m');
    s.key('enter');
    s.input('d');
    s.key('tab');
    s.input('r');
    expect(s.key('enter')).toEqual({ kind: 'activate', id: 'run', path: 'Games | Mine | Deep | Run me' });
  });

  it('goes a level up with Backspace in an empty segment', () => {
    const s = new SearchSession(items);
    s.input('h');
    s.key('tab');
    expect(s.view().prefix).toBe('House | ');
    expect(s.key('backspace')).toEqual({ kind: 'focus', id: null });
    expect(s.view().prefix).toBe('');
    expect(names(s)).toContain('House');
  });

  it('searches everything with ":" and shows paths for duplicates', () => {
    const s = new SearchSession(items);
    s.input(':kouz');
    const v = s.view();
    expect(v.global).toBe(true);
    expect(v.showPaths).toBe(true);
    expect(v.total).toBe(2);
    expect(v.current?.path).toBe('House | Website | Kouzlo');
    expect(v.next?.path).toBe('Louka | Složka | Kouzlo');
    // Collapsed or not, the parents of global matches are shown.
    expect([...v.expanded].sort()).toEqual(['house', 'louka', 'slozka', 'web']);
    s.key('backspace');
    s.key('backspace');
    s.key('backspace');
    s.key('backspace');
    s.key('backspace');
    expect(s.view().global).toBe(false);
  });

  it('switches to the level mode inside a folder confirmed in ":" mode', () => {
    const s = new SearchSession(items);
    s.input(':slo');
    expect(s.key('tab')).toEqual({ kind: 'focus', id: 'slozka' });
    const v = s.view();
    expect(v.global).toBe(false);
    expect(v.prefix).toBe('Louka | Složka | ');
    expect(names(s)).toEqual(['Kouzlo']);
  });

  it('shows the last command and browses, fills and runs the history', () => {
    const history = ['Games | Mine | Deep | Run me', 'Games | CS2'];
    const s = new SearchSession(items, { history });
    expect(s.view().placeholder).toBe('Games | Mine | Deep | Run me');
    s.key('down');
    expect(s.view().historyEntry).toBe('Games | Mine | Deep | Run me');
    s.key('down');
    expect(s.view().historyEntry).toBe('Games | CS2');
    expect(s.key('enter')).toEqual({ kind: 'activate', id: 'cs2', path: 'Games | CS2' });
    const t = new SearchSession(items, { history });
    t.key('up');
    t.key('tab');
    expect(t.view().prefix).toBe('Games | ');
    expect(t.view().text).toBe('CS2');
    const u = new SearchSession(items, { history });
    expect(u.key('enter')).toMatchObject({ kind: 'activate', id: 'run' });
  });

  it('can sort by usage', () => {
    const s = new SearchSession(items, { sortByUsage: true, usage: { louka: 5, games: 2 } });
    expect(names(s)).toEqual(['Louka', 'Games', 'Aplikáce', 'House']);
  });

  it('TAB on an action writes out its name', () => {
    const s = new SearchSession(items);
    s.input('g');
    s.key('tab');
    s.input('c');
    expect(s.key('tab')).toEqual({ kind: 'none' });
    expect(s.view().text).toBe('CS2');
  });

  it('keeps 50 unique history entries, newest first', () => {
    let h: string[] = [];
    for (let i = 0; i < 60; i++) h = pushHistory(h, `cmd ${i}`);
    h = pushHistory(h, 'cmd 20');
    expect(h).toHaveLength(50);
    expect(h[0]).toBe('cmd 20');
    expect(h.filter((x) => x === 'cmd 20')).toHaveLength(1);
  });
});
