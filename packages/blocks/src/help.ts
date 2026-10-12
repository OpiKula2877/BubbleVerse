import type { BlockShape, CatalogBlock, CatalogInput } from './catalog-types';
import type { Lang } from './blockly/defs';
import { BLOCKS, CATEGORIES } from './generated/catalog';
import { HELP } from './generated/help';

/**
 * The help of a block (the ? in the script editor): what it does, its inputs numbered as they
 * appear on the block, what to type into each, and which blocks fit into it.
 */
export interface BlockHelpView {
  /** The block's text with its inputs as ①, ②, … */
  title: string;
  text: string;
  danger: boolean;
  shape: BlockShape;
  category: { name: string; colour: string };
  inputs: InputHelp[];
}

export type InputKind =
  /** A typed value or a round block. */
  | 'value'
  /** A pointed (yes/no) block. */
  | 'condition'
  /** Typed in the block itself. */
  | 'field'
  | 'menu'
  | 'check'
  | 'days'
  | 'var'
  | 'keys'
  | 'stack';

export interface InputHelp {
  n: number;
  name: string;
  kind: InputKind;
  hint: string;
  /** Choices of a menu, in the block's language. */
  options?: string[];
  /** Blocks that fit into the input, grouped by category. */
  fits: { category: string; colour: string; blocks: string[] }[];
}

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩';

function kindOf(input: CatalogInput): InputKind {
  switch (input.type) {
    case 'num':
    case 'text':
    case 'any':
      return 'value';
    case 'bool':
      return 'condition';
    case 'combo':
      return 'keys';
    case 'menu':
    case 'check':
    case 'days':
    case 'var':
    case 'stack':
      return input.type;
    default:
      return 'field';
  }
}

/**
 * A block's text as a name: menus show their first choice, variables say so, other inputs
 * become "…" (e.g. "abs of …", "current year", "variable").
 */
function plainName(block: CatalogBlock, lang: Lang): string {
  return block[lang]
    .replace(/%([A-Z][A-Z0-9_]*)/g, (_, name: string) => {
      const input = (block.inputs ?? []).find((i) => i.name === name);
      const first = input?.options?.[0];
      if (first) return lang === 'cs' ? first[2] : first[1];
      if (input?.type === 'var') return lang === 'cs' ? 'proměnná' : 'variable';
      return '…';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** Blocks that give a value of the shape (round = value, pointed = yes/no). */
function fitting(shape: 'reporter' | 'boolean', lang: Lang): InputHelp['fits'] {
  return CATEGORIES.flatMap((c) => {
    const blocks = BLOCKS.filter(
      (b) => b.cat === c.id && b.shape === shape && !b.id.startsWith('cb_'),
    ).map((b) => plainName(b, lang));
    return blocks.length ? [{ category: c[lang], colour: c.colour, blocks }] : [];
  });
}

/** Whether a block of the catalog has a help page. */
export function hasHelp(id: string): boolean {
  return id in HELP;
}

export function blockHelp(id: string, lang: Lang): BlockHelpView | null {
  const block = BLOCKS.find((b) => b.id === id);
  const help = HELP[id];
  if (!block || !help) return null;
  const category = CATEGORIES.find((c) => c.id === block.cat);
  // Inputs in the order they appear in this language's text.
  const order = [...block[lang].matchAll(/%([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]!);
  const inputs = order.flatMap((name, i): InputHelp[] => {
    const input = (block.inputs ?? []).find((x) => x.name === name);
    if (!input) return [];
    const kind = kindOf(input);
    return [
      {
        n: i + 1,
        name,
        kind,
        hint: help.inputs?.[name]?.[lang] ?? '',
        ...(input.options
          ? { options: input.options.map(([, en, cs]) => (lang === 'cs' ? cs : en)) }
          : {}),
        fits:
          kind === 'value'
            ? fitting('reporter', lang)
            : kind === 'condition'
              ? fitting('boolean', lang)
              : [],
      },
    ];
  });
  let n = 0;
  const title = block[lang]
    .replace(/%[A-Z][A-Z0-9_]*/g, () => CIRCLED[n++] ?? '…')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    title,
    text: help[lang],
    danger: !!block.danger,
    shape: block.shape,
    category: { name: category?.[lang] ?? '', colour: category?.colour ?? '#888888' },
    inputs,
  };
}
