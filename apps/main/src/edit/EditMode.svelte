<script lang="ts">
  import { Menu, t, type MenuItem } from '@bv/ui';
  import type { Editor } from '../lib/editor.svelte';
  import { resolveAutoIcons } from '../lib/auto-icons';
  import { openScriptEditor } from '../lib/script-editor';
  import { store } from '../lib/store.svelte';
  import Generator from '../generator/Generator.svelte';
  import { GeneratorState } from '../generator/gen-state.svelte';
  import Inspector from './Inspector.svelte';
  import TemplateDialogs from './TemplateDialogs.svelte';
  import QuickCreate from './QuickCreate.svelte';
  import Toolbar from './Toolbar.svelte';
  import Tree from './Tree.svelte';

  let { editor }: { editor: Editor } = $props();

  $effect(() => {
    store.renderer?.setOverlay({ rect: null, guides: [], grid: editor.grid ? 40 : null });
  });

  // Bubbles switched to "auto icon" get their icon from the core.
  $effect(() => {
    void editor.world;
    void resolveAutoIcons(editor);
  });

  function menuItems(): MenuItem[] {
    const m = editor.menu;
    if (!m) return [];
    const screen = { x: m.x + store.uiRect.x, y: m.y + store.uiRect.y };
    const target = m.target ? editor.index.get(m.target) : undefined;
    if (!target) {
      return [
        {
          label: t('menu.newMainFolder'),
          icon: 'folder',
          action: () => editor.create('folder', null, m.world, screen),
        },
        {
          label: t('menu.newMainAction'),
          icon: 'bolt',
          action: () => editor.create('action', null, m.world, screen),
        },
        { separator: true },
        {
          label: t('menu.paste'),
          icon: 'copy',
          disabled: !editor.canPaste,
          action: () => editor.paste(m.world, null),
          shortcut: 'Ctrl+V',
        },
        {
          label: t('menu.bulk'),
          icon: 'sparkles',
          action: () => (editor.modal = { kind: 'generator', parentId: null, files: [] }),
        },
        { separator: true },
        {
          label: t('menu.setHome'),
          icon: 'home',
          action: () => store.renderer && editor.setHomeView(store.renderer.camera),
        },
      ];
    }
    const sel = editor.selected;
    const isFolder = target.kind === 'folder';
    const childAt = () => editor.childSpot(target.id);
    return [
      ...(isFolder
        ? [
            {
              label: t('menu.newChildFolder'),
              icon: 'folder',
              action: () => editor.create('folder', target.id, childAt(), screen),
            },
            {
              label: t('menu.newChildAction'),
              icon: 'bolt',
              action: () => editor.create('action', target.id, childAt(), screen),
            },
            {
              label: t('menu.bulk'),
              icon: 'sparkles',
              action: () => (editor.modal = { kind: 'generator', parentId: target.id, files: [] }),
            },
          ]
        : [
            {
              label: t('menu.actions'),
              icon: 'code',
              action: () => void openScriptEditor(target.id),
            },
          ]),
      { separator: true },
      { label: t('menu.setPath'), icon: 'target', disabled: true },
      { label: t('menu.setOrbit'), icon: 'target', disabled: true },
      { label: t('menu.setWander'), icon: 'target', disabled: true },
      { separator: true },
      { label: t('menu.copySkin'), icon: 'copy', action: () => editor.copySkin(target.id) },
      {
        label: t('menu.pasteSkin'),
        icon: 'copy',
        disabled: !editor.skinClip,
        action: () => editor.pasteSkin(sel),
      },
      {
        label: t('menu.saveTemplate'),
        icon: 'save',
        action: () => (editor.modal = { kind: 'saveTemplate', id: target.id }),
      },
      {
        label: t('menu.applyTemplate'),
        icon: 'sparkles',
        action: () => (editor.modal = { kind: 'applyTemplate', ids: sel }),
      },
      { separator: true },
      { label: t('menu.copy'), icon: 'copy', action: () => editor.copy(), shortcut: 'Ctrl+C' },
      {
        label: t('menu.paste'),
        icon: 'copy',
        disabled: !editor.canPaste,
        action: () => editor.paste(undefined, target.id),
        shortcut: 'Ctrl+V',
      },
      {
        label: t('menu.duplicate'),
        icon: 'copy',
        action: () => editor.duplicate(),
        shortcut: 'Ctrl+D',
      },
      { label: t('menu.export'), icon: 'download', disabled: true },
      { separator: true },
      {
        label: t('menu.delete'),
        icon: 'trash',
        danger: true,
        action: () => editor.deleteSelected(),
        shortcut: 'Del',
      },
    ];
  }
</script>

<Toolbar {editor} />
<Tree {editor} />
<Inspector {editor} />

{#if editor.menu}
  <Menu
    x={editor.menu.x}
    y={editor.menu.y}
    items={menuItems()}
    onclose={() => (editor.menu = null)}
  />
{/if}

{#if editor.modal?.kind === 'generator'}
  {#key editor.modal}
    {@const m = editor.modal}
    <Generator
      {editor}
      gen={new GeneratorState(m.parentId, m.files)}
      onclose={() => (editor.modal = null)}
    />
  {/key}
{:else if editor.modal}
  <TemplateDialogs {editor} />
{/if}

{#if editor.quickCreate}
  {#key editor.quickCreate.id}
    <QuickCreate {editor} />
  {/key}
{/if}
