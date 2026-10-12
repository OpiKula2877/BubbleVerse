import type { CatalogBlock, CatalogInput } from '../catalog-types';
import { BLOCKS, CATEGORIES } from '../generated/catalog';

/**
 * Blockly block definitions generated from the catalog (spec §8.3): the editor never defines
 * blocks by hand. Pure JSON, so it is testable without Blockly.
 */

export type Lang = 'en' | 'cs';

export const DAY_LABELS: Record<Lang, string[]> = {
  en: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
  cs: ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'],
};

export const VAR_SCOPES: Record<Lang, [string, string][]> = {
  en: [
    ['script', 's'],
    ['bubble', 'b'],
    ['global', 'g'],
  ],
  cs: [
    ['script', 's'],
    ['bublina', 'b'],
    ['globální', 'g'],
  ],
};

/** Prefix of block types for custom blocks (`bv_custom_<id>`). */
export const CUSTOM_PREFIX = 'bv_custom_';

const catColour = new Map(CATEGORIES.map((c) => [c.id, c.colour]));

/** Field names a catalog input becomes in Blockly. */
export function fieldNames(input: CatalogInput): string[] {
  if (input.type === 'days') return Array.from({ length: 7 }, (_, i) => `${input.name}_${i}`);
  if (input.type === 'var') return [`${input.name}_SCOPE`, input.name];
  return [input.name];
}

export interface BlockJson {
  type: string;
  message0: string;
  args0: Record<string, unknown>[];
  colour: string;
  tooltip: string;
  inputsInline: boolean;
  previousStatement?: null;
  nextStatement?: null;
  output?: string | null;
  /** Only the hat shape; colours come from `colour`. */
  style?: { hat: string };
}

function argsFor(
  input: CatalogInput,
  lang: Lang,
): { text: string; args: Record<string, unknown>[] } {
  switch (input.type) {
    case 'num':
    case 'text':
    case 'any':
      return { text: '%', args: [{ type: 'input_value', name: input.name }] };
    case 'bool':
      return { text: '%', args: [{ type: 'input_value', name: input.name, check: 'Boolean' }] };
    case 'numf':
      return {
        text: '%',
        args: [{ type: 'field_number', name: input.name, value: Number(input.default ?? 0) }],
      };
    case 'combo':
      // Filled by pressing the keys (the editor registers `field_combo`).
      return {
        text: '%',
        args: [{ type: 'field_combo', name: input.name, value: String(input.default ?? '') }],
      };
    case 'textf':
    case 'time':
      return {
        text: '%',
        args: [{ type: 'field_input', name: input.name, text: String(input.default ?? '') }],
      };
    case 'menu':
      return {
        text: '%',
        args: [
          {
            type: 'field_dropdown',
            name: input.name,
            options: (input.options ?? []).map(([value, en, cs]) => [
              lang === 'cs' ? cs : en,
              value,
            ]),
          },
        ],
      };
    case 'check':
      return {
        text: '%',
        args: [{ type: 'field_checkbox', name: input.name, checked: input.default === true }],
      };
    case 'days': {
      const mask = String(input.default ?? '1111111');
      const labels = DAY_LABELS[lang];
      return {
        text: labels.map((l) => `${l} %`).join(' '),
        args: labels.map((_, i) => ({
          type: 'field_checkbox',
          name: `${input.name}_${i}`,
          checked: mask[i] !== '0',
        })),
      };
    }
    case 'var': {
      const [scope, name] = String(input.default ?? 's:value').split(':');
      return {
        text: '% %',
        args: [
          {
            type: 'field_dropdown',
            name: `${input.name}_SCOPE`,
            options: VAR_SCOPES[lang],
            ...(scope ? { value: scope } : {}),
          },
          { type: 'field_input', name: input.name, text: name ?? 'value' },
        ],
      };
    }
    case 'stack':
      return { text: '%', args: [{ type: 'input_statement', name: input.name }] };
  }
}

/** Blockly JSON definition of one catalog block in a language. */
export function blockJson(b: CatalogBlock, lang: Lang): BlockJson {
  const template = lang === 'cs' ? b.cs : b.en;
  const args: Record<string, unknown>[] = [];
  let n = 0;
  // Replace each %NAME with Blockly's %1, %2…; multi-field inputs expand into several.
  const message = template.replace(/%([A-Z][A-Z0-9_]*)/g, (_, name: string) => {
    const input = b.inputs.find((i) => i.name === name);
    if (!input) return '';
    const a = argsFor(input, lang);
    args.push(...a.args);
    return a.text.replace(/%/g, () => `%${++n}`);
  });
  const def: BlockJson = {
    type: b.id,
    message0: (b.danger ? '⚠ ' : '') + message,
    args0: args,
    colour: catColour.get(b.cat) ?? '#888888',
    tooltip: b.danger ? (lang === 'cs' ? 'Nebezpečný blok' : 'Dangerous block') : '',
    inputsInline: !b.inputs.some((i) => i.type === 'stack'),
  };
  if (b.shape === 'reporter') def.output = null;
  else if (b.shape === 'boolean') def.output = 'Boolean';
  else if (b.shape === 'hat') {
    def.nextStatement = null;
    def.style = { hat: 'cap' };
  } else if (b.shape === 'cap' || b.cap) def.previousStatement = null;
  else {
    def.previousStatement = null;
    def.nextStatement = null;
  }
  return def;
}

export function allBlockJson(lang: Lang): BlockJson[] {
  return BLOCKS.filter((b) => b.id !== 'cb_call').map((b) => blockJson(b, lang));
}

/** A custom block as its own Blockly block (`define block [name]` with parameters, spec §5.2). */
export function customBlockJson(
  c: { id: string; name: string; params: { name: string; type: string }[] },
  colour = catColour.get('custom') ?? '#FF6680',
): BlockJson {
  let message = c.name;
  const args: Record<string, unknown>[] = [];
  c.params.forEach((p, i) => {
    message += ` ${p.name} %${i + 1}`;
    args.push({
      type: 'input_value',
      name: `ARG${i}`,
      ...(p.type === 'bool' ? { check: 'Boolean' } : {}),
    });
  });
  return {
    type: `${CUSTOM_PREFIX}${c.id}`,
    message0: message,
    args0: args,
    colour,
    tooltip: '',
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
  };
}
