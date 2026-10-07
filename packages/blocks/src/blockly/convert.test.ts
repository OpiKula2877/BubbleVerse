import type { Script } from '@bv/world';
import { describe, expect, it } from 'vitest';
import { BLOCKS, OP } from '../generated/catalog';
import { blocklyToCustomBody, blocklyToScripts, customToBlockly, scriptsToBlockly } from './convert';
import { allBlockJson, blockJson } from './defs';

const scripts: Script[] = [
  {
    v: 1,
    trigger: [OP.ev_activate],
    body: [
      [OP.var_set, 's:count', 0],
      [OP.ctl_repeat, [OP.op_add, 2, [OP.var_get, 'g:times']], [[OP.var_change, 's:count', 1], [OP.ctl_log, 'tick']]],
      [OP.ctl_if_else, [OP.op_gt, [OP.sen_battery], 20], [[OP.sys_run_file, 'C:\\a.exe', '-x', true, false, true]], []],
      [OP.cb_call, 'cb1', 'hi', [OP.op_join, 'a', 'b'], 3],
    ],
    runMode: 'restart',
  },
  { v: 1, trigger: [OP.ev_at_time, '07:30', '1111100'], body: [[OP.ctl_wait, 5, 'min']], runMode: 'ignore' },
  { v: 1, trigger: [OP.ev_hotkey, 'Ctrl+Alt+K', 'app'], body: [], runMode: 'parallel' },
  { v: 1, trigger: [OP.ev_every, 10, 's'], body: [[OP.ctl_log, 42]], runMode: 'ignore' },
];

describe('Blockly ↔ compact format', () => {
  it('round-trips scripts without losing anything', () => {
    const { state } = scriptsToBlockly(scripts);
    const back = blocklyToScripts(JSON.parse(JSON.stringify(state)));
    expect(back.scripts).toEqual(scripts);
  });

  it('numbers nodes in pre-order like the interpreter', () => {
    const { nodeMaps } = scriptsToBlockly(scripts);
    // trigger 0, var_set 1, repeat 2, op_add 3, var_get 4, var_change 5, log 6, if_else 7 …
    expect(nodeMaps[0]![0]).toBe('s0.0');
    expect(nodeMaps[0]!.length).toBe(13);
    const back = blocklyToScripts(scriptsToBlockly(scripts).state);
    expect(back.nodeMaps[0]).toEqual(nodeMaps[0]);
  });

  it('keeps positions and loose blocks in the layout', () => {
    const layout = { positions: [{ x: 5, y: 6 }], loose: [{ type: 'ctl_log', id: 'x', x: 1, y: 2 }] };
    const { state } = scriptsToBlockly(scripts.slice(0, 1), layout);
    const back = blocklyToScripts(state);
    expect(back.layout).toEqual(layout);
    expect(back.scripts).toHaveLength(1);
  });

  it('reads a block edited in Blockly (number shadow replaced by a reporter)', () => {
    const { state } = scriptsToBlockly([{ v: 1, trigger: [OP.ev_activate], body: [[OP.ctl_wait, 1, 's']], runMode: 'ignore' }]);
    const wait = state.blocks.blocks[0]!.next!.block!;
    wait.inputs!.N = { ...wait.inputs!.N, block: { type: 'sen_battery', id: 'new' } };
    wait.fields = { UNIT: 'min' };
    expect(blocklyToScripts(state).scripts[0]!.body).toEqual([[OP.ctl_wait, [OP.sen_battery], 'min']]);
  });

  it('round-trips custom block bodies', () => {
    const body = [[OP.ctl_log, [OP.cb_arg, 'who']]] as Script['body'];
    expect(blocklyToCustomBody(customToBlockly({ id: 'c', name: 'greet', body }))).toEqual(body);
  });
});

describe('block definitions', () => {
  it('defines every block in both languages with matching arguments', () => {
    for (const lang of ['en', 'cs'] as const) {
      for (const def of allBlockJson(lang)) {
        const placeholders = [...def.message0.matchAll(/%(\d+)/g)].map((m) => Number(m[1]));
        expect(placeholders.length, `${lang} ${def.type}`).toBe(def.args0.length);
      }
    }
  });

  it('marks dangerous blocks and shapes hats and reporters', () => {
    const run = blockJson(BLOCKS.find((b) => b.id === 'sys_run_file')!, 'cs');
    expect(run.message0.startsWith('⚠ ')).toBe(true);
    expect(blockJson(BLOCKS.find((b) => b.id === 'ev_activate')!, 'en').nextStatement).toBeNull();
    expect(blockJson(BLOCKS.find((b) => b.id === 'op_add')!, 'en').output).toBeNull();
    const forever = blockJson(BLOCKS.find((b) => b.id === 'ctl_forever')!, 'en');
    expect(forever.nextStatement).toBeUndefined();
  });
});
