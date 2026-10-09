import { emptyWorld, fixtureBubble, type SharedScript, type World } from '@bv/world';
import { describe, expect, it } from 'vitest';
import {
  applyScriptEdit,
  customBlockUses,
  inlineToShared,
  scriptParamNames,
  sharedToInline,
  syncParams,
  usedVariables,
} from './editing';
import { OP } from './generated/catalog';
import { newScript } from './script';

const runFile = newScript(
  [OP.ev_activate],
  [
    [OP.sys_run_file, [OP.cb_param, 'path'], [OP.cb_param, 'args'], false, false, false],
    [OP.ctl_if, [OP.cb_param, 'loud'], [[OP.ctl_log, [OP.op_join, 'ran ', [OP.cb_param, 'path']]]]],
  ],
);

function world(): World {
  const a = fixtureBubble('a', null, 'A', 'action');
  return {
    ...emptyWorld(),
    bubbles: [
      { ...a, scripts: [{ kind: 'inline', script: runFile }] },
      fixtureBubble('b', null, 'B', 'action'),
    ],
  };
}

describe('shared scripts', () => {
  it('finds parameter names in order of use, once each', () => {
    expect(scriptParamNames(runFile)).toEqual(['path', 'args', 'loud']);
  });

  it('turns an own script into a shared one with its parameters', () => {
    const { shared, slot } = inlineToShared(runFile, 'sh1', 'Run');
    expect(shared).toEqual({
      id: 'sh1',
      name: 'Run',
      params: [
        { name: 'path', type: 'text', default: '' },
        { name: 'args', type: 'text', default: '' },
        { name: 'loud', type: 'text', default: '' },
      ],
      script: runFile,
    });
    expect(slot).toEqual({ kind: 'shared', ref: 'sh1', params: {} });
  });

  it('turns a shared script back into an own copy with the bubble values filled in', () => {
    const shared: SharedScript = {
      id: 'sh1',
      name: 'Run',
      params: [
        { name: 'path', type: 'text', default: 'C:/default.exe' },
        { name: 'args', type: 'text', default: '' },
        { name: 'loud', type: 'bool', default: false },
      ],
      script: runFile,
    };
    const s = sharedToInline(shared, { path: 'C:/app.exe', loud: true });
    expect(s.body[0]).toEqual([OP.sys_run_file, 'C:/app.exe', '', false, false, false]);
    // A yes/no value stays a condition block, Blockly has no literal for it.
    expect(s.body[1]![1]).toEqual([OP.op_eq, 1, 1]);
    expect(s.body[1]![2]).toEqual([[OP.ctl_log, [OP.op_join, 'ran ', 'C:/app.exe']]]);
    expect(scriptParamNames(s)).toEqual([]);
  });

  it('keeps parameter settings in sync with the parameter blocks', () => {
    const shared: SharedScript = {
      id: 'sh1',
      name: 'Run',
      params: [
        { name: 'path', type: 'text', default: 'x' },
        { name: 'gone', type: 'number', default: 1 },
      ],
      script: runFile,
    };
    expect(syncParams(shared).params).toEqual([
      { name: 'path', type: 'text', default: 'x' },
      { name: 'args', type: 'text', default: '' },
      { name: 'loud', type: 'text', default: '' },
    ]);
  });
});

describe('variables', () => {
  it('lists the variables scripts use, by scope', () => {
    const s = newScript(
      [OP.ev_activate],
      [
        [OP.var_set, 'g:count', 1],
        [OP.var_change, 'b:clicks', 1],
        [OP.ctl_log, [OP.var_get, 's:tmp']],
        [OP.var_set, 'g:count', 2],
        [OP.sys_cmd, 'dir', 'hidden', 's:'],
      ],
    );
    expect(usedVariables([s])).toEqual([
      { scope: 's', name: 'tmp' },
      { scope: 'b', name: 'clicks' },
      { scope: 'g', name: 'count' },
    ]);
  });
});

describe('saving from the editor', () => {
  it('replaces the bubble scripts and updates the libraries', () => {
    const w0 = {
      ...world(),
      customBlocks: [
        { id: 'c1', name: 'old', params: [], body: [] },
        { id: 'c2', name: 'gone', params: [], body: [] },
      ],
    };
    const { shared, slot } = inlineToShared(runFile, 'sh1', 'Run');
    const w = applyScriptEdit(w0, {
      bubble: 'a',
      scripts: [slot],
      sharedScripts: [shared],
      customBlocks: [{ id: 'c1', name: 'new', params: [], body: [[OP.ctl_log, 'x']] }],
      removedCustomBlocks: ['c2'],
    });
    expect(w.bubbles.find((b) => b.id === 'a')?.scripts).toEqual([slot]);
    expect(w.bubbles.find((b) => b.id === 'b')).toBe(w0.bubbles[1]);
    expect(w.sharedScripts).toEqual([shared]);
    expect(w.customBlocks).toEqual([
      { id: 'c1', name: 'new', params: [], body: [[OP.ctl_log, 'x']] },
    ]);
  });

  it('counts where a custom block is used', () => {
    const w0: World = {
      ...world(),
      customBlocks: [
        { id: 'c1', name: 'one', params: [], body: [] },
        { id: 'c2', name: 'two', params: [], body: [[OP.cb_call, 'c1']] },
      ],
      sharedScripts: [
        {
          id: 's',
          name: 's',
          params: [],
          script: newScript([OP.ev_activate], [[OP.cb_call, 'c1']]),
        },
      ],
    };
    expect(customBlockUses(w0, 'c1')).toBe(2);
    expect(customBlockUses(w0, 'c2')).toBe(0);
  });
});
