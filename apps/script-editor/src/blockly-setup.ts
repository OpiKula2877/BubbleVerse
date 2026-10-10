import {
  allBlockJson,
  buildToolbox,
  CUSTOM_CATEGORY,
  CUSTOM_PREFIX,
  customBlockJson,
  customFlyout,
  SEARCH_CATEGORY,
  searchBlocks,
  toolboxBlock,
  type Lang,
} from '@bv/blocks';
import type { ThemeColors } from '@bv/ui';
import type { CustomBlock } from '@bv/world';
import * as Blockly from 'blockly/core';
import * as Cs from 'blockly/msg/cs';
import * as En from 'blockly/msg/en';
import { registerFieldCombo } from './field-combo';

/**
 * Blockly for the script editor: blocks generated from the catalog (spec §8.3), the theme
 * from the app's colour tokens and the dynamic toolbox categories (search, my blocks).
 */

export type Workspace = Blockly.WorkspaceSvg;
export { Blockly };

/** Number and text literals that sit in value inputs as shadow blocks. */
function literalBlocks(c: ThemeColors): Record<string, unknown>[] {
  return [
    {
      type: 'math_number',
      message0: '%1',
      args0: [{ type: 'field_number', name: 'NUM', value: 0 }],
      output: 'Number',
      colour: c.panel,
    },
    {
      type: 'text',
      message0: '%1',
      args0: [{ type: 'field_input', name: 'TEXT', text: '' }],
      output: 'String',
      colour: c.panel,
    },
  ];
}

/** (Re)defines every block for a language; custom blocks get their current signature. */
export function defineBlocks(
  lang: Lang,
  colors: ThemeColors,
  custom: readonly CustomBlock[],
): void {
  registerFieldCombo();
  Blockly.setLocale((lang === 'cs' ? Cs : En) as unknown as Record<string, string>);
  const defs = [
    ...literalBlocks(colors),
    ...allBlockJson(lang),
    ...custom.map((c) => customBlockJson(c)),
  ];
  for (const d of defs) delete Blockly.Blocks[(d as { type: string }).type];
  Blockly.common.defineBlocksWithJsonArray(defs);
}

export function defineCustomBlock(c: CustomBlock): void {
  const json = customBlockJson(c);
  delete Blockly.Blocks[json.type];
  Blockly.common.defineBlocksWithJsonArray([json]);
}

export function makeTheme(c: ThemeColors, font: string): Blockly.Theme {
  const theme = new Blockly.Theme(
    'bv',
    {},
    {},
    {
      workspaceBackgroundColour: c.bg,
      toolboxBackgroundColour: c.bar,
      toolboxForegroundColour: c.text,
      flyoutBackgroundColour: c.panel,
      flyoutForegroundColour: c['text-2'],
      flyoutOpacity: 0.97,
      scrollbarColour: c.scrollbar,
      scrollbarOpacity: 0.7,
      insertionMarkerColour: c.text,
      insertionMarkerOpacity: 0.3,
      markerColour: c.accent,
      cursorColour: c.accent,
      selectedGlowColour: c.highlight,
      selectedGlowOpacity: 0.6,
    },
  );
  theme.setFontStyle({ family: font, weight: '600', size: 11 });
  return theme;
}

/**
 * The block palette (flyout) has its own size: zooming the workspace does not change it, the
 * palette's own magnifier does. Remembered per computer as a view convenience.
 */
const PALETTE_KEY = 'bv.paletteScale';
export const PALETTE_SCALE = { min: 0.5, max: 1.5, start: 0.85, step: 1.15 };

function storedPaletteScale(): number {
  try {
    const v = Number(localStorage.getItem(PALETTE_KEY));
    return v >= PALETTE_SCALE.min && v <= PALETTE_SCALE.max ? v : PALETTE_SCALE.start;
  } catch {
    return PALETTE_SCALE.start;
  }
}

let paletteScale = storedPaletteScale();

class PaletteFlyout extends Blockly.VerticalFlyout {
  override getFlyoutScale(): number {
    return paletteScale;
  }
}

export function getPaletteScale(): number {
  return paletteScale;
}

/** Makes the palette bigger (1), smaller (-1) or resets it (0); returns the new scale. */
export function zoomPalette(ws: Workspace, dir: 1 | -1 | 0): number {
  const next =
    dir === 0
      ? PALETTE_SCALE.start
      : paletteScale * (dir > 0 ? PALETTE_SCALE.step : 1 / PALETTE_SCALE.step);
  paletteScale = Math.min(PALETTE_SCALE.max, Math.max(PALETTE_SCALE.min, next));
  try {
    localStorage.setItem(PALETTE_KEY, String(paletteScale));
  } catch {
    /* only a convenience */
  }
  const flyout = ws.getFlyout();
  if (flyout?.isVisible()) flyout.reflow();
  return paletteScale;
}

export interface FlyoutSources {
  query: () => string;
  searchHint: () => string;
  makeLabel: () => string;
  customBlocks: () => readonly CustomBlock[];
  /** Inputs of the custom block being edited; parameters of the shared script being edited. */
  argNames: () => string[];
  paramNames: () => string[];
}

export function createWorkspace(
  div: HTMLElement,
  o: {
    lang: Lang;
    colors: ThemeColors;
    font: string;
    searchLabel: string;
    flyouts: FlyoutSources;
    onMakeBlock: () => void;
  },
): Workspace {
  const ws = Blockly.inject(div, {
    toolbox: buildToolbox({
      lang: o.lang,
      customBlocks: [],
      searchLabel: o.searchLabel,
    }) as unknown as Blockly.utils.toolbox.ToolboxDefinition,
    renderer: 'zelos',
    theme: makeTheme(o.colors, o.font),
    media: '/blockly-media/',
    sounds: false,
    trashcan: true,
    zoom: {
      controls: true,
      wheel: true,
      startScale: 0.85,
      maxScale: 2,
      minScale: 0.3,
      scaleSpeed: 1.15,
    },
    grid: { spacing: 32, length: 3, colour: o.colors.grid, snap: false },
    move: { scrollbars: true, drag: true, wheel: false },
    plugins: { flyoutsVerticalToolbox: PaletteFlyout },
  });
  ws.registerToolboxCategoryCallback(SEARCH_CATEGORY, () => {
    const found = searchBlocks(o.flyouts.query());
    if (!found.length) return [{ kind: 'label', text: o.flyouts.searchHint() }];
    return found.map(toolboxBlock) as unknown as Blockly.utils.toolbox.FlyoutItemInfoArray;
  });
  ws.registerToolboxCategoryCallback(CUSTOM_CATEGORY, () => {
    const items = customFlyout([...o.flyouts.customBlocks()], o.flyouts.makeLabel()).filter(
      (i) => i.type !== 'cb_arg' && i.type !== 'cb_param',
    );
    const named = (type: string, names: string[]) =>
      names.map((n) => ({ kind: 'block', type, fields: { NAME: n } }));
    const params = o.flyouts.paramNames();
    return [
      ...items,
      // Arguments exist only inside a custom block's definition.
      ...named('cb_arg', o.flyouts.argNames()),
      ...named('cb_param', params.length ? params : ['path']),
    ] as unknown as Blockly.utils.toolbox.FlyoutItemInfoArray;
  });
  ws.registerButtonCallback('BV_MAKE_BLOCK', () => o.onMakeBlock());
  return ws;
}

/** Rebuilds the toolbox (after a language change). */
export function updateToolbox(ws: Workspace, lang: Lang, searchLabel: string): void {
  ws.updateToolbox(
    buildToolbox({
      lang,
      customBlocks: [],
      searchLabel,
    }) as unknown as Blockly.utils.toolbox.ToolboxDefinition,
  );
}

/** Opens the search category, or refreshes it while it is open. */
export function showSearch(ws: Workspace): void {
  const toolbox = ws.getToolbox() as Blockly.Toolbox | null;
  if (!toolbox) return;
  const item = toolbox.getToolboxItems()[0];
  if (!item) return;
  if (toolbox.getSelectedItem() === item) toolbox.refreshSelection();
  else toolbox.setSelectedItem(item);
}

/** Puts an element at the top (the block search field) or bottom (the palette zoom) of the toolbox. */
export function mountInToolbox(ws: Workspace, el: HTMLElement, at: 'top' | 'bottom' = 'top'): void {
  const div = (ws.getToolbox() as Blockly.Toolbox | null)?.HtmlDiv;
  if (!div || el.parentElement === div) return;
  if (at === 'top') div.prepend(el);
  else div.append(el);
}

export function isCustomType(type: string): boolean {
  return type.startsWith(CUSTOM_PREFIX);
}

/** A context menu entry on custom block calls: open the block's definition. */
export function registerEditCustom(label: () => string, open: (id: string) => void): void {
  const id = 'bv_edit_custom';
  if (Blockly.ContextMenuRegistry.registry.getItem(id))
    Blockly.ContextMenuRegistry.registry.unregister(id);
  Blockly.ContextMenuRegistry.registry.register({
    id,
    scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
    weight: -1,
    displayText: () => label(),
    preconditionFn: (scope) =>
      scope.block && isCustomType(scope.block.type) ? 'enabled' : 'hidden',
    callback: (scope) => {
      if (scope.block) open(scope.block.type.slice(CUSTOM_PREFIX.length));
    },
  });
}
