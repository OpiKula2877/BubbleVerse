import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import type { Catalog } from '../packages/blocks/src/catalog-types';
import {
  generateHelpTs,
  generateRust,
  generateTs,
  normalize,
  placeholders,
  validateCatalog,
  validateHelp,
  type BlockHelp,
} from './gen-blocks-lib';

const catalog = normalize(
  parse(readFileSync(resolve(import.meta.dirname, '../packages/blocks/catalog.yaml'), 'utf8')),
);

const tiny = (): Catalog => ({
  version: 1,
  categories: [{ id: 'c', colour: '#000000', en: 'C', cs: 'C' }],
  blocks: [
    {
      op: 1,
      id: 'a_b',
      cat: 'c',
      shape: 'stack',
      en: 'do %X',
      cs: 'dělej %X',
      inputs: [{ name: 'X', type: 'num' }],
    },
  ],
});

describe('block catalog', () => {
  it('is valid', () => {
    expect(validateCatalog(catalog)).toEqual([]);
  });

  it('covers every category from the spec', () => {
    const cats = new Set(catalog.blocks.map((b) => b.cat));
    expect(cats.size).toBe(catalog.categories.length);
  });

  it('marks the dangerous blocks from spec §5.6', () => {
    const danger = new Set(catalog.blocks.filter((b) => b.danger).map((b) => b.id));
    for (const id of [
      'sys_run_file',
      'sys_cmd',
      'sys_powershell',
      'in_press',
      'in_type',
      'in_click',
      'fs_write',
      'fs_copy',
      'fs_delete',
      'http_request',
      'http_download',
      'win_kill',
      'sys_power',
    ]) {
      expect(danger.has(id), id).toBe(true);
    }
    expect(danger.has('sys_open_url')).toBe(false);
  });

  it('finds placeholders', () => {
    expect(placeholders('run %PATH with %ARGS_2')).toEqual(['PATH', 'ARGS_2']);
  });

  it('reports duplicate ops, unknown categories and placeholder mismatches', () => {
    const bad = tiny();
    bad.blocks.push({ ...bad.blocks[0]!, id: 'other', cat: 'nope', cs: 'bez' });
    const errors = validateCatalog(bad);
    expect(errors.some((e) => e.includes('op already used'))).toBe(true);
    expect(errors.some((e) => e.includes('unknown category'))).toBe(true);
    expect(errors.some((e) => e.includes('cs text placeholders'))).toBe(true);
  });

  it('generates matching TypeScript and Rust', () => {
    const ts = generateTs(tiny());
    expect(ts).toContain('a_b: 1,');
    const rs = generateRust(tiny());
    expect(rs).toContain('AB = 1,');
    expect(rs).toContain('pub mod a_b {');
    expect(rs).toContain('pub const X: usize = 0;');
    expect(rs).toContain('fn is_dangerous(self) -> bool {\n        false');
  });
});

describe('block help', () => {
  const help = parse(
    readFileSync(resolve(import.meta.dirname, '../packages/blocks/help.yaml'), 'utf8'),
  ) as Record<string, BlockHelp>;

  it('explains every block and every input in both languages', () => {
    expect(validateHelp(catalog, help)).toEqual([]);
  });

  it('reports what is missing', () => {
    const errors = validateHelp(tiny(), { a_b: { en: 'Does.', cs: '', inputs: {} } });
    expect(errors).toContain('help a_b: missing cs text');
    expect(errors).toContain('help a_b: input X needs en and cs');
    expect(validateHelp(tiny(), {})).toContain('help a_b: missing');
    expect(
      validateHelp(tiny(), {
        a_b: { en: 'x', cs: 'y', inputs: { X: { en: 'a', cs: 'b' } } },
        zz: { en: 'x', cs: 'y' },
      }),
    ).toContain('help zz: no such block');
  });

  it('generates a typed module', () => {
    const ts = generateHelpTs({
      a_b: { en: 'Does.', cs: 'Dělá.', inputs: { X: { en: 'a', cs: 'b' } } },
    });
    expect(ts).toContain('export const HELP');
    expect(ts).toContain('"Dělá."');
  });
});
