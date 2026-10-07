<script lang="ts">
  import { readSimpleAction, setSimpleAction, type SimpleAction } from '@bv/blocks';
  import { Button, Field, Segmented, t, TextField } from '@bv/ui';
  import type { BubbleId } from '@bv/world';
  import type { Editor } from '../../lib/editor.svelte';
  import { store } from '../../lib/store.svelte';

  let { editor, ids }: { editor: Editor; ids: BubbleId[] } = $props();

  const actions = $derived(
    ids.map((id) => editor.index.get(id)).map((b) => (b ? readSimpleAction(b) : null)),
  );
  const custom = $derived(actions.some((a) => a === 'custom'));
  const first = $derived(actions.find((a): a is SimpleAction => !!a && a !== 'custom'));
  const kind = $derived(first?.kind ?? 'runFile');
  const same = (f: (a: SimpleAction) => string) => {
    const vals = new Set(actions.map((a) => (a && a !== 'custom' ? f(a) : '')));
    return { value: [...vals][0] ?? '', mixed: vals.size > 1 };
  };
  const path = $derived(same((a) => (a.kind === 'runFile' ? a.path : '')));
  const args = $derived(same((a) => (a.kind === 'runFile' ? a.args : '')));
  const url = $derived(same((a) => (a.kind === 'openUrl' ? a.url : '')));

  let pathText = $state('');
  let argsText = $state('');
  let urlText = $state('');
  $effect(() => {
    pathText = path.mixed ? '' : path.value;
    argsText = args.mixed ? '' : args.value;
    urlText = url.mixed ? '' : url.value;
  });

  function set(action: SimpleAction | null, key?: string) {
    editor.apply((w) => setSimpleAction(w, ids, action), key ? `${key}:${ids.join()}` : undefined);
    void editor.checkPaths();
  }

  async function browse() {
    const p = await store.core.pickFile();
    if (p) {
      pathText = p;
      set({ kind: 'runFile', path: p, args: argsText });
    }
  }

  function openEditor() {
    void store.core.call('open_script_editor', { bubble: ids[0] });
  }
</script>

{#if custom}
  <p class="bv-muted note">{t('action.custom')}</p>
{:else}
  <Field label={t('action.kind')}>
    <Segmented
      value={kind}
      options={[
        { value: 'runFile', label: t('action.runFile') },
        { value: 'openUrl', label: t('action.openUrl') },
      ]}
      onchange={(v) =>
        set(
          v === 'runFile'
            ? { kind: 'runFile', path: pathText, args: argsText }
            : { kind: 'openUrl', url: urlText },
        )}
    />
  </Field>
  {#if kind === 'runFile'}
    <Field label={t('action.path')} wide>
      <TextField
        bind:value={pathText}
        mixed={path.mixed}
        placeholder={t('action.pathPlaceholder')}
        oninput={(v) => set({ kind: 'runFile', path: v, args: argsText }, 'path')}
      />
      <Button small onclick={browse}>{t('common.browse')}</Button>
    </Field>
    <Field label={t('action.args')}>
      <TextField
        bind:value={argsText}
        mixed={args.mixed}
        oninput={(v) => set({ kind: 'runFile', path: pathText, args: v }, 'args')}
      />
    </Field>
  {:else}
    <Field label={t('action.url')} wide>
      <TextField
        bind:value={urlText}
        mixed={url.mixed}
        placeholder={t('action.urlPlaceholder')}
        oninput={(v) => set({ kind: 'openUrl', url: v }, 'url')}
      />
    </Field>
  {/if}
{/if}
{#if ids.length === 1}
  <Button small icon="code" onclick={openEditor}>{t('action.openEditor')}</Button>
{/if}

<style>
  .note {
    margin: 0;
    line-height: 1.5;
    font-size: 12px;
  }
</style>
