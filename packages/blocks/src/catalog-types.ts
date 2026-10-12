/** Types of the block catalog (`packages/blocks/catalog.yaml`). */

export type BlockShape = 'hat' | 'stack' | 'c' | 'c2' | 'cap' | 'reporter' | 'boolean';

export type InputType =
  | 'num'
  | 'text'
  | 'any'
  | 'bool'
  | 'numf'
  | 'textf'
  | 'combo'
  | 'time'
  | 'menu'
  | 'check'
  | 'days'
  | 'var'
  | 'stack';

/** `[value, English label, Czech label]` */
export type MenuOption = [string, string, string];

export interface CatalogInput {
  name: string;
  type: InputType;
  default?: string | number | boolean;
  options?: MenuOption[];
}

export interface CatalogCategory {
  id: string;
  colour: string;
  en: string;
  cs: string;
}

export interface CatalogBlock {
  op: number;
  id: string;
  cat: string;
  shape: BlockShape;
  /** Nothing can be attached below (e.g. "forever"). */
  cap?: boolean;
  danger?: boolean;
  /** Extra arguments follow the declared inputs (custom block calls). */
  variadic?: boolean;
  en: string;
  cs: string;
  inputs: CatalogInput[];
  keywords?: { en?: string; cs?: string };
}

export interface Catalog {
  version: number;
  categories: CatalogCategory[];
  blocks: CatalogBlock[];
}

/** Value inputs take a literal or a reporter block; everything else is a field or a substack. */
export const VALUE_INPUTS: ReadonlySet<InputType> = new Set(['num', 'text', 'any', 'bool']);
