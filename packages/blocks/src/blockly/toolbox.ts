import type { CatalogBlock } from '../catalog-types';
import { BLOCKS, CATEGORIES } from '../generated/catalog';
import { CUSTOM_PREFIX, type Lang } from './defs';

/** Toolbox of the script editor: one colored category per catalog category (spec §5.2). */

export const SEARCH_CATEGORY = 'BV_SEARCH';
export const CUSTOM_CATEGORY = 'BV_CUSTOM';

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Toolbox entry with default values as shadow blocks. */
export function toolboxBlock(b: CatalogBlock): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  for (const i of b.inputs) {
    if (i.type === 'num' || (i.type === 'any' && typeof i.default === 'number')) {
      inputs[i.name] = { shadow: { type: 'math_number', fields: { NUM: Number(i.default ?? 0) } } };
    } else if (i.type === 'text' || i.type === 'any') {
      inputs[i.name] = { shadow: { type: 'text', fields: { TEXT: String(i.default ?? '') } } };
    }
  }
  return { kind: 'block', type: b.id, ...(Object.keys(inputs).length ? { inputs } : {}) };
}

/** Blocks whose English or Czech name or keywords contain every word of the query (spec §5.1). */
export function searchBlocks(query: string): CatalogBlock[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return BLOCKS.filter((b) => {
    if (b.id === 'cb_call' || b.id === 'cb_define') return false;
    const text = norm(
      [b.en, b.cs, b.keywords?.en ?? '', b.keywords?.cs ?? '', b.id]
        .join(' ')
        .replace(/%[A-Z_0-9]+/g, ' '),
    );
    return words.every((w) => text.includes(w));
  });
}

export interface ToolboxOptions {
  lang: Lang;
  customBlocks: { id: string; name: string }[];
  /** Translated label of the search category. */
  searchLabel: string;
}

export function buildToolbox(o: ToolboxOptions): Record<string, unknown> {
  const contents: Record<string, unknown>[] = [
    { kind: 'category', name: o.searchLabel, colour: '#888888', custom: SEARCH_CATEGORY },
  ];
  for (const c of CATEGORIES) {
    if (c.id === 'custom') {
      contents.push({
        kind: 'category',
        name: o.lang === 'cs' ? c.cs : c.en,
        colour: c.colour,
        custom: CUSTOM_CATEGORY,
      });
      continue;
    }
    const blocks = BLOCKS.filter((b) => b.cat === c.id).map(toolboxBlock);
    contents.push({
      kind: 'category',
      name: o.lang === 'cs' ? c.cs : c.en,
      colour: c.colour,
      contents: blocks,
    });
  }
  return { kind: 'categoryToolbox', contents };
}

/** Flyout of "My blocks": a button to make a block, calls of existing ones, arguments, parameters. */
export function customFlyout(
  customBlocks: { id: string; name: string }[],
  makeLabel: string,
): Record<string, unknown>[] {
  const arg = BLOCKS.find((b) => b.id === 'cb_arg');
  const param = BLOCKS.find((b) => b.id === 'cb_param');
  return [
    { kind: 'button', text: makeLabel, callbackKey: 'BV_MAKE_BLOCK' },
    ...customBlocks.map((c) => ({ kind: 'block', type: `${CUSTOM_PREFIX}${c.id}` })),
    ...(arg ? [toolboxBlock(arg)] : []),
    ...(param ? [toolboxBlock(param)] : []),
  ];
}
