<script lang="ts">
  import {
    actionTarget,
    blockLabel,
    dangerousBlocks,
    importPackage,
    packageWorld,
    replaceWorld,
    type PathReplacement,
  } from '@bv/blocks';
  import { Button, Icon, i18n, Modal, Select, t, TextField, tk } from '@bv/ui';
  import { emptyWorld, WorldIndex, type Bubble, type BubbleId } from '@bv/world';
  import type { Editor } from '../lib/editor.svelte';
  import type { LoadedPackage } from '../lib/packages';
  import { store } from '../lib/store.svelte';

  /**
   * Import preview (spec §9.4): the tree, dangerous blocks found in the scripts themselves,
   * missing paths with bulk find and replace, and where to put it.
   */
  let {
    editor,
    pkg,
    parentId,
    onclose,
  }: { editor: Editor; pkg: LoadedPackage; parentId: BubbleId | null; onclose: () => void } =
    $props();

  // svelte-ignore state_referenced_locally
  let where = $state<string>(parentId ?? '');
  let reps = $state<PathReplacement[]>([{ find: '', replace: '' }]);
  let exists = $state<Record<string, boolean>>({});

  const pw = $derived(packageWorld(pkg.data, emptyWorld()));
  const rows = $derived.by(() => {
    const index = new WorldIndex(pw);
    const out: { b: Bubble; depth: number; danger: string[] }[] = [];
    const walk = (parent: BubbleId | null, depth: number) => {
      for (const b of index.children(parent)) {
        out.push({ b, depth, danger: dangerousBlocks(pw, b) });
        walk(b.id, depth + 1);
      }
    };
    // Tops of a branch package have a parent outside the package.
    const ids = new Set(pw.bubbles.map((b) => b.id));
    for (const top of pw.bubbles.filter((b) => !b.parentId || !ids.has(b.parentId))) {
      out.push({ b: top, depth: 0, danger: dangerousBlocks(pw, top) });
      walk(top.id, 1);
    }
    return out;
  });
  const dangerCount = $derived(rows.filter((r) => r.danger.length).length);

  function replaced(text: string): string {
    let out = text;
    for (const r of reps) {
      if (!r.find) continue;
      const re = new RegExp(r.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      out = out.replace(re, () => r.replace);
    }
    return out;
  }

  const files = $derived(
    pw.bubbles.flatMap((b) => {
      const target = actionTarget(b);
      return target?.kind === 'file' && target.value
        ? [{ id: b.id, name: b.name, path: replaced(target.value) }]
        : [];
    }),
  );
  const missing = $derived(files.filter((f) => exists[f.path] === false));

  // Check the (replaced) paths on this PC.
  let timer = 0;
  $effect(() => {
    const paths = [...new Set(files.map((f) => f.path))].filter((p) => !(p in exists));
    clearTimeout(timer);
    if (!paths.length) return;
    timer = window.setTimeout(async () => {
      try {
        const ok = await store.core.checkTargets(paths);
        exists = { ...exists, ...Object.fromEntries(paths.map((p, i) => [p, ok[i] ?? false])) };
      } catch {
        /* the check is only a hint */
      }
    }, 250);
  });

  const folders = $derived.by(() => {
    const index = new WorldIndex(store.world);
    return store.world.bubbles
      .filter((b) => b.kind === 'folder')
      .map((b) => ({ value: b.id, label: index.pathString(b.id) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });
  const whereOptions = $derived([
    { value: '', label: t('package.mainLevel') },
    ...folders,
    ...(pkg.manifest.root === null ? [{ value: 'replace', label: t('package.replaceWorld') }] : []),
  ]);

  function run() {
    const replacements = reps.filter((r) => r.find);
    if (where === 'replace') {
      editor.apply((w) => replaceWorld(w, pkg.data, replacements));
      editor.select([]);
    } else {
      let ids: BubbleId[] = [];
      editor.apply((w) => {
        const r = importPackage(w, pkg.data, { parentId: where || null, replacements });
        ids = r.ids;
        return r.world;
      });
      if (where && !store.renderer?.expand.isExpanded(where))
        store.renderer?.expand.set(where, true);
      editor.select(ids, ids[0] ?? null);
    }
    store.notify(tk('package.imported', { n: pkg.data.bubbles.length }));
    onclose();
  }
</script>

<Modal title={tk('package.importTitle', { name: pkg.manifest.name })} width={820} {onclose}>
  <div class="imp">
    <section class="tree">
      <h4>{tk('package.bubbles', { n: pkg.data.bubbles.length })}</h4>
      {#if dangerCount}
        <p class="warn">
          <Icon name="warning" size={14} />
          {tk('package.dangerHint', { n: dangerCount })}
        </p>
      {/if}
      <div class="list">
        {#each rows as r (r.b.id)}
          <div class="row" style:padding-left="{6 + r.depth * 14}px">
            <Icon name={r.b.kind === 'folder' ? 'folder' : 'bolt'} size={13} />
            <span class="name">{r.b.name}</span>
            {#if r.danger.length}
              <span class="danger" title={r.danger.map((d) => blockLabel(d, i18n.lang)).join('\n')}>
                ⚠ {r.danger.map((d) => blockLabel(d, i18n.lang)).join(', ')}
              </span>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <section class="side">
      <h4>{t('package.paths')}</h4>
      {#if missing.length}
        <p class="warn">{tk('package.missing', { n: missing.length })}</p>
        <div class="missing">
          {#each missing as m (m.id)}
            <div class="path" title={m.path}><b>{m.name}</b> {m.path}</div>
          {/each}
        </div>
      {:else if files.length}
        <p class="bv-muted">{t('package.pathsOk')}</p>
      {:else}
        <p class="bv-muted">{t('package.noPaths')}</p>
      {/if}
      {#each reps as r, i (i)}
        <div class="rep">
          <TextField
            value={r.find}
            placeholder={t('package.find')}
            oninput={(v) => (reps[i] = { ...reps[i]!, find: v })}
          />
          <Icon name="chevronRight" size={14} />
          <TextField
            value={r.replace}
            placeholder={t('package.replace')}
            oninput={(v) => (reps[i] = { ...reps[i]!, replace: v })}
          />
        </div>
      {/each}
      <Button small icon="plus" onclick={() => reps.push({ find: '', replace: '' })}
        >{t('package.addReplace')}</Button
      >

      <h4>{t('package.where')}</h4>
      <Select options={whereOptions} value={where} onchange={(v) => (where = v)} />
      {#if where === 'replace'}<p class="warn">{t('package.replaceHint')}</p>{/if}
    </section>
  </div>
  {#snippet actions()}
    <Button variant="primary" onclick={run}>{t('package.import')}</Button>
    <Button onclick={onclose}>{t('common.cancel')}</Button>
  {/snippet}
</Modal>

<style>
  .imp {
    display: grid;
    grid-template-columns: 1fr 340px;
    gap: 18px;
    min-height: 380px;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  h4 {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--bv-text-2);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .list,
  .missing {
    overflow-y: auto;
    border: 1px solid var(--bv-border);
    border-radius: calc(var(--bv-radius) * 0.6);
    background: var(--bv-input);
  }
  .list {
    flex: 1;
    max-height: 46vh;
  }
  .missing {
    max-height: 120px;
  }
  .row,
  .path {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    font-size: 13px;
    border-bottom: 1px solid var(--bv-border);
  }
  .path {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 12px;
  }
  .name {
    font-weight: 600;
  }
  .danger {
    margin-left: auto;
    color: var(--bv-warning);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .warn {
    margin: 0;
    color: var(--bv-warning);
    font-size: 12px;
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .rep {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 6px;
    align-items: center;
  }
</style>
