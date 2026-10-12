import { describe, expect, it } from 'vitest';
import { buildToolbox, searchBlocks, toolboxBlock } from './toolbox';
import { BLOCKS } from '../generated/catalog';

describe('block toolbox', () => {
  it('finds blocks by English and Czech names and keywords, ignoring diacritics', () => {
    const ids = (q: string) => searchBlocks(q).map((b) => b.id);
    expect(ids('run file')).toContain('sys_run_file');
    expect(ids('spustit soubor')).toContain('sys_run_file');
    expect(ids('pockej')).toContain('ctl_wait');
    expect(ids('schranka')).toContain('clip_get');
    expect(ids('smycka')).toEqual(expect.arrayContaining(['ctl_repeat', 'ctl_forever']));
    expect(ids('')).toEqual([]);
  });

  it('builds one category per catalog category plus search', () => {
    const tb = buildToolbox({ lang: 'cs', customBlocks: [], searchLabel: 'Hledat' }) as {
      contents: { name: string }[];
    };
    expect(tb.contents[0]!.name).toBe('Hledat');
    expect(tb.contents.map((c) => c.name)).toContain('Ovládání');
  });

  it('gives value inputs their default as a shadow block', () => {
    const wait = toolboxBlock(BLOCKS.find((b) => b.id === 'ctl_wait')!);
    expect(wait).toEqual({
      kind: 'block',
      type: 'ctl_wait',
      inputs: { N: { shadow: { type: 'math_number', fields: { NUM: 1 } } } },
    });
  });
});
