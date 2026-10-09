import { emptyWorld, fixtureBubble, type Bubble, type World } from '@bv/world';
import { describe, expect, it } from 'vitest';
import { OP } from './generated/catalog';
import { importPackage, packBranch, packWorld, replaceWorld } from './package';
import { newScript } from './script';
import { builtinSharedScript, RUN_FILE_SCRIPT } from './simple-action';

function world(): World {
  const runFile = (id: string, parent: string, name: string, path: string): Bubble =>
    fixtureBubble(id, parent, name, 'action', 0, {
      scripts: [{ kind: 'shared', ref: RUN_FILE_SCRIPT, params: { path, args: '' } }],
    });
  return {
    ...emptyWorld(),
    bubbles: [
      fixtureBubble('apps', null, 'Apps', 'folder'),
      fixtureBubble('work', 'apps', 'Work', 'folder', 0, {
        skin: { mode: 'inherit', from: { ancestor: 'apps' } },
      }),
      runFile('code', 'work', 'Code', 'C:\\Users\\old\\code.exe'),
      fixtureBubble('mac', 'work', 'Macro', 'action', 1, {
        scripts: [
          {
            kind: 'inline',
            script: newScript(
              [OP.ev_activate],
              [
                [OP.cb_call, 'greet', 'C:\\Users\\old\\x.txt'],
                [OP.var_set, 'g:count', 1],
              ],
            ),
          },
        ],
        motion: {
          track: {
            type: 'orbit',
            center: 'code',
            rx: 50,
            ry: 50,
            tilt: 0,
            speed: 10,
            dir: 'cw',
            phase: 0,
          },
        },
      }),
      fixtureBubble('games', null, 'Games', 'folder', 1),
    ],
    sharedScripts: [builtinSharedScript(RUN_FILE_SCRIPT)],
    customBlocks: [
      {
        id: 'greet',
        name: 'greet',
        params: [{ name: 'p', type: 'text', default: '' }],
        body: [[OP.cb_call, 'inner']],
      },
      { id: 'inner', name: 'inner', params: [], body: [[OP.ctl_log, 'hi']] },
      { id: 'unused', name: 'unused', params: [], body: [] },
    ],
    globals: [
      { name: 'count', value: 0 },
      { name: 'other', value: 1 },
    ],
  };
}

describe('packing', () => {
  it('takes the branch with the shared scripts, custom blocks and globals it uses', () => {
    const p = packBranch(world(), 'work');
    expect(p.bubbles.map((b) => b.id).sort()).toEqual(['code', 'mac', 'work']);
    expect(p.sharedScripts.map((s) => s.id)).toEqual([RUN_FILE_SCRIPT]);
    expect(p.customBlocks.map((c) => c.id).sort()).toEqual(['greet', 'inner']);
    expect(p.globals).toEqual([{ name: 'count', value: 0 }]);
  });

  it('takes the whole world', () => {
    const p = packWorld(world());
    expect(p.bubbles).toHaveLength(5);
    expect(p.customBlocks).toHaveLength(3);
    expect(p.homeView).toEqual(world().homeView);
  });
});

describe('importing', () => {
  it('renumbers ids, keeps the tree and references, and puts the root into the folder', () => {
    const w = world();
    const { world: out, ids } = importPackage(w, packBranch(w, 'work'), {
      parentId: 'games',
      replacements: [],
    });
    expect(ids).toHaveLength(3);
    expect(ids.some((id) => ['work', 'code', 'mac'].includes(id))).toBe(false);
    const added = out.bubbles.filter((b) => ids.includes(b.id));
    const root = added.find((b) => b.name === 'Work')!;
    const code = added.find((b) => b.name === 'Code')!;
    const mac = added.find((b) => b.name === 'Macro')!;
    expect(root.parentId).toBe('games');
    expect(root.attach).toBe('parent');
    expect(code.parentId).toBe(root.id);
    // The ancestor is outside the package: inherit from the parent instead.
    expect(root.skin).toMatchObject({ mode: 'inherit', from: 'parent' });
    expect(mac.motion.track).toMatchObject({ type: 'orbit', center: code.id });
    // Equal library items are not duplicated.
    expect(out.sharedScripts).toHaveLength(1);
    expect(out.customBlocks).toHaveLength(3);
    expect(out.globals).toHaveLength(2);
  });

  it('replaces paths in parameters and script texts', () => {
    const w = world();
    const { world: out, ids } = importPackage(w, packBranch(w, 'work'), {
      parentId: null,
      replacements: [{ find: 'c:\\users\\old', replace: 'D:\\Me' }],
    });
    const added = out.bubbles.filter((b) => ids.includes(b.id));
    const code = added.find((b) => b.name === 'Code')!;
    const mac = added.find((b) => b.name === 'Macro')!;
    expect(code.scripts[0]).toMatchObject({ params: { path: 'D:\\Me\\code.exe' } });
    const slot = mac.scripts[0]!;
    expect(slot.kind === 'inline' && slot.script.body[0]).toEqual([
      OP.cb_call,
      'greet',
      'D:\\Me\\x.txt',
    ]);
  });

  it('gives a new id to a different library item with a taken id and renames its calls', () => {
    const w = world();
    const pkg = packBranch(w, 'work');
    pkg.customBlocks = pkg.customBlocks.map((c) =>
      c.id === 'inner' ? { ...c, body: [[OP.ctl_log, 'changed']] } : c,
    );
    const { world: out, ids } = importPackage(w, pkg, { parentId: null, replacements: [] });
    const inner = out.customBlocks.filter((c) => c.name === 'inner');
    expect(inner).toHaveLength(2);
    const newInner = inner.find((c) => c.id !== 'inner')!;
    const greet = out.customBlocks.find((c) => c.name === 'greet' && c.id !== 'greet');
    expect(greet?.body).toEqual([[OP.cb_call, newInner.id]]);
    const mac = out.bubbles.find((b) => ids.includes(b.id) && b.name === 'Macro')!;
    const slot = mac.scripts[0]!;
    expect(slot.kind === 'inline' && slot.script.body[0]![1]).toBe(greet!.id);
  });

  it('replaces the whole world from a world package', () => {
    const w = world();
    const out = replaceWorld(
      { ...emptyWorld(), bubbles: [fixtureBubble('x', null, 'X', 'folder')] },
      packWorld(w),
      [],
    );
    expect(out.bubbles.map((b) => b.name).sort()).toEqual([
      'Apps',
      'Code',
      'Games',
      'Macro',
      'Work',
    ]);
    expect(out.customBlocks).toHaveLength(3);
  });
});
