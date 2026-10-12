import { emptyWorld, fixtureBubble, type World } from '@bv/world';
import { describe, expect, it } from 'vitest';
import { OP } from './generated/catalog';
import { dangerousBlocks, newScript, walkNodes } from './script';
import {
  actionTarget,
  OPEN_URL_SCRIPT,
  readSimpleAction,
  RUN_FILE_SCRIPT,
  setSimpleAction,
} from './simple-action';

function world(): World {
  return {
    ...emptyWorld(),
    bubbles: [fixtureBubble('a', null, 'A', 'action'), fixtureBubble('f', null, 'F', 'folder')],
  };
}

describe('compact scripts', () => {
  it('walks nested nodes and substacks', () => {
    const s = newScript(
      [OP.ev_activate],
      [[OP.ctl_if, [OP.op_gt, [OP.sen_battery], 20], [[OP.ctl_log, 'hi'], [OP.sys_lock]]]],
    );
    const ops: number[] = [];
    walkNodes([s.trigger, ...s.body], (n) => ops.push(n[0]));
    expect(ops).toEqual([
      OP.ev_activate,
      OP.ctl_if,
      OP.op_gt,
      OP.sen_battery,
      OP.ctl_log,
      OP.sys_lock,
    ]);
  });

  it('is compact: a simple run-file script takes a few dozen bytes', () => {
    const s = newScript(
      [OP.ev_activate],
      [[OP.sys_run_file, [OP.cb_param, 'path'], '', false, false, false]],
    );
    expect(JSON.stringify(s).length).toBeLessThan(100);
  });

  it('finds dangerous blocks from content, also inside custom blocks', () => {
    const w = world();
    w.customBlocks = [{ id: 'cb1', name: 'wipe', params: [], body: [[OP.fs_delete, 'C:\\x']] }];
    w.bubbles[0]!.scripts = [
      {
        kind: 'inline',
        script: newScript(
          [OP.ev_activate],
          [
            [OP.ctl_repeat, 2, [[OP.in_type, 'x', 10]]],
            [OP.cb_call, 'cb1'],
          ],
        ),
      },
    ];
    expect(dangerousBlocks(w, w.bubbles[0]!)).toEqual(['fs_delete', 'in_type']);
  });
});

describe('simple actions', () => {
  it('stores run-file as a shared script reference with parameters', () => {
    const w = setSimpleAction(world(), ['a', 'f'], {
      kind: 'runFile',
      path: 'C:\\x.exe',
      args: '-q',
    });
    expect(w.sharedScripts.map((s) => s.id)).toEqual([RUN_FILE_SCRIPT]);
    const a = w.bubbles[0]!;
    expect(a.scripts).toEqual([
      { kind: 'shared', ref: RUN_FILE_SCRIPT, params: { path: 'C:\\x.exe', args: '-q' } },
    ]);
    expect(w.bubbles[1]!.scripts).toEqual([]);
    expect(readSimpleAction(a)).toEqual({ kind: 'runFile', path: 'C:\\x.exe', args: '-q' });
    expect(actionTarget(a)).toEqual({ kind: 'file', value: 'C:\\x.exe' });
    expect(dangerousBlocks(w, a)).toEqual(['sys_run_file']);
  });

  it('reuses the shared script for many bubbles and switches to open-url', () => {
    let w = setSimpleAction(world(), ['a'], { kind: 'runFile', path: 'x', args: '' });
    w = setSimpleAction(w, ['a'], { kind: 'runFile', path: 'y', args: '' });
    expect(w.sharedScripts).toHaveLength(1);
    w = setSimpleAction(w, ['a'], { kind: 'openUrl', url: 'https://a.cz' });
    expect(w.sharedScripts.map((s) => s.id)).toEqual([RUN_FILE_SCRIPT, OPEN_URL_SCRIPT]);
    expect(readSimpleAction(w.bubbles[0]!)).toEqual({ kind: 'openUrl', url: 'https://a.cz' });
  });

  it('recognizes custom scripts and clears actions', () => {
    const w = world();
    w.bubbles[0]!.scripts = [{ kind: 'inline', script: newScript([OP.ev_activate]) }];
    expect(readSimpleAction(w.bubbles[0]!)).toBe('custom');
    expect(readSimpleAction(setSimpleAction(w, ['a'], null).bubbles[0]!)).toBeNull();
  });
});
