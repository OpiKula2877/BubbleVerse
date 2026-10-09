<script lang="ts">
  import { Button, Icon, t } from '@bv/ui';
  import { normalizeText } from '@bv/search';
  import { WorldIndex, type Bubble, type BubbleId } from '@bv/world';
  import type { Editor } from '../lib/editor.svelte';
  import { store } from '../lib/store.svelte';

  let { editor }: { editor: Editor } = $props();

  let filter = $state('');
  let collapsed = $state<Record<string, boolean>>({});
  /**
   * Rows are dragged with the pointer, not HTML5 drag and drop: the app window takes files
   * from Explorer through Tauri, which turns HTML5 drag and drop off on Windows.
   */
  let press: { id: BubbleId; x: number; y: number } | null = null;
  let dragId = $state<BubbleId | null>(null);
  /** A finished drag also ends in a click; that click must not change the selection. */
  let dragged = false;
  let dropHint = $state<{ id: BubbleId; where: 'before' | 'after' | 'inside' } | null>(null);

  interface Row {
    b: Bubble;
    depth: number;
    hasKids: boolean;
  }

  const rows = $derived.by(() => {
    const index = new WorldIndex(editor.world!);
    const out: Row[] = [];
    const q = normalizeText(filter.trim());
    if (q) {
      for (const b of index.flatten()) {
        if (normalizeText(b.name).includes(q)) out.push({ b, depth: 0, hasKids: false });
      }
      return out;
    }
    const walk = (parent: BubbleId | null, depth: number) => {
      for (const b of index.children(parent)) {
        const kids = index.children(b.id).length > 0;
        out.push({ b, depth, hasKids: kids });
        if (kids && !collapsed[b.id]) walk(b.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  });

  function rowClick(e: MouseEvent, b: Bubble) {
    editor.click(b.id, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
    // Make it visible: expand its ancestors in the world.
    const r = store.renderer;
    if (r) {
      for (const a of editor.index.ancestors(b.id)) r.expand.set(a.id, true);
      r.requestRender();
    }
  }

  function focus(b: Bubble) {
    const d = store.renderer?.displayedById(b.id);
    if (d && store.renderer)
      store.renderer.setCamera({ ...store.renderer.camera, x: d.x, y: d.y }, 350);
  }

  function pointerDown(e: PointerEvent, row: Row) {
    if (e.button !== 0) return;
    press = { id: row.b.id, x: e.clientX, y: e.clientY };
    dragged = false;
  }

  function pointerMove(e: PointerEvent) {
    if (!press) return;
    if (!dragId && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5) return;
    dragId = press.id;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-row]');
    const id = el?.dataset.row;
    const b = id ? editor.index.get(id) : undefined;
    if (!el || !b) {
      dropHint = null;
      return;
    }
    const r = el.getBoundingClientRect();
    const f = (e.clientY - r.top) / r.height;
    const where =
      b.kind === 'folder' && f > 0.28 && f < 0.72 ? 'inside' : f < 0.5 ? 'before' : 'after';
    dropHint = { id: b.id, where };
  }

  function pointerUp() {
    press = null;
    if (!dragId) return;
    dragged = true;
    drop();
  }

  function drop() {
    const hint = dropHint;
    const id = dragId;
    dropHint = null;
    dragId = null;
    if (!hint || !id || hint.id === id) return;
    const index = editor.index;
    const target = index.get(hint.id);
    if (!target) return;
    if (hint.where === 'inside') {
      editor.reparent(id, target.id);
      return;
    }
    const parent = index.parentOf(target.id)?.id ?? null;
    const siblings = index.children(parent).filter((b) => b.id !== id);
    const at = siblings.findIndex((b) => b.id === target.id) + (hint.where === 'after' ? 1 : 0);
    editor.reparent(id, parent, at);
  }
</script>

<svelte:window onpointermove={pointerMove} onpointerup={pointerUp} />

<aside class="tree bv-glass" class:closed={!editor.treeOpen}>
  <header>
    {#if editor.treeOpen}<h3>{t('tree.title')}</h3>{/if}
    <Button
      small
      variant="ghost"
      icon={editor.treeOpen ? 'chevronDown' : 'chevronRight'}
      title={editor.treeOpen ? t('tree.collapse') : t('tree.expand')}
      onclick={() => (editor.treeOpen = !editor.treeOpen)}
    />
  </header>
  {#if editor.treeOpen}
    <div class="filter">
      <Icon name="search" size={14} />
      <input placeholder={t('tree.filter')} bind:value={filter} />
    </div>
    <div class="rows" class:dragging={!!dragId} role="tree" tabindex="0">
      {#if rows.length === 0}
        <p class="empty">{t('tree.empty')}</p>
      {/if}
      {#each rows as row (row.b.id)}
        <div
          class="row"
          class:sel={editor.selection.ids.has(row.b.id)}
          class:before={dropHint?.id === row.b.id && dropHint.where === 'before'}
          class:after={dropHint?.id === row.b.id && dropHint.where === 'after'}
          class:inside={dropHint?.id === row.b.id && dropHint.where === 'inside'}
          style:padding-left="{8 + row.depth * 14}px"
          role="treeitem"
          aria-selected={editor.selection.ids.has(row.b.id)}
          tabindex="-1"
          data-row={row.b.id}
          onpointerdown={(e) => pointerDown(e, row)}
          onclick={(e) => {
            if (dragged) dragged = false;
            else rowClick(e, row.b);
          }}
          ondblclick={() => focus(row.b)}
          onkeydown={() => {}}
        >
          {#if row.hasKids}
            <button
              class="twisty"
              onclick={(e) => {
                e.stopPropagation();
                collapsed[row.b.id] = !collapsed[row.b.id];
              }}
              ><Icon
                name={collapsed[row.b.id] ? 'chevronRight' : 'chevronDown'}
                size={12}
              /></button
            >
          {:else}
            <span class="twisty"></span>
          {/if}
          <Icon name={row.b.kind === 'folder' ? 'folder' : 'bolt'} size={14} />
          <span class="name">{row.b.name}</span>
          {#if editor.missing.has(row.b.id)}
            <span class="warn" title={t('inspector.missingFile')}
              ><Icon name="warning" size={13} /></span
            >
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</aside>

<style>
  .tree {
    position: absolute;
    top: 64px;
    left: 12px;
    bottom: 12px;
    width: 250px;
    z-index: 20;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .tree.closed {
    bottom: auto;
    width: auto;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 6px 6px 12px;
  }
  h3 {
    margin: 0;
    font-size: 13px;
  }
  .filter {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 8px 6px;
    padding: 0 8px;
    height: 30px;
    border-radius: calc(var(--bv-radius) * 0.75);
    background: var(--bv-input);
    border: 1px solid var(--bv-input-border);
    color: var(--bv-text-muted);
  }
  .filter input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    outline: none;
    color: var(--bv-text);
  }
  .rows {
    flex: 1;
    overflow: auto;
    padding: 0 4px 8px;
  }
  .empty {
    padding: 8px;
    color: var(--bv-text-muted);
    font-size: 12px;
    line-height: 1.5;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding-right: 6px;
    border-radius: 6px;
    cursor: default;
    border-top: 2px solid transparent;
    border-bottom: 2px solid transparent;
  }
  .row:hover {
    background: var(--bv-button-hover);
  }
  .rows.dragging {
    cursor: grabbing;
    user-select: none;
  }
  .row.sel {
    background: color-mix(in srgb, var(--bv-selection) 28%, transparent);
  }
  .row.before {
    border-top-color: var(--bv-accent);
  }
  .row.after {
    border-bottom-color: var(--bv-accent);
  }
  .row.inside {
    outline: 1px solid var(--bv-accent);
  }
  .twisty {
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    background: none;
    color: var(--bv-text-muted);
    cursor: pointer;
  }
  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .warn {
    color: var(--bv-warning);
    display: inline-flex;
  }
</style>
