<script lang="ts">
  import { Field, Select, t, TextField, Toggle } from '@bv/ui';
  import type { BubbleId, ShowName } from '@bv/world';
  import { kindLabel, type Editor } from '../../lib/editor.svelte';
  import { store } from '../../lib/store.svelte';
  import { commonField, update } from './common';

  let { editor, ids }: { editor: Editor; ids: BubbleId[] } = $props();

  const w = $derived(editor.world!);
  const name = $derived(commonField(w, ids, (b) => b.name));
  const kind = $derived(commonField(w, ids, (b) => b.kind));
  const folders = $derived(ids.filter((id) => editor.index.get(id)?.kind === 'folder'));
  const expanded = $derived(commonField(w, folders, (b) => b.expanded !== false));
  const showName = $derived(commonField(w, ids, (b) => b.showName ?? 'inherit'));

  let nameText = $derived(name && !name.mixed ? name.value : '');
</script>

<Field label={t('inspector.name')}>
  <TextField
    bind:value={nameText}
    mixed={name?.mixed}
    oninput={(v) => update(editor, (b) => ({ ...b, name: v }), 'name')}
  />
</Field>
<Field label={t('inspector.kind')}>
  <span class="bv-muted"
    >{kind ? (kind.mixed ? t('common.mixed') : kindLabel(kind.value)) : ''}</span
  >
</Field>
{#if folders.length && expanded}
  <Field label="">
    <Toggle
      checked={expanded.value}
      mixed={expanded.mixed}
      label={t('inspector.expanded')}
      onchange={(v) => {
        editor.apply((x) => ({
          ...x,
          bubbles: x.bubbles.map((b) => (folders.includes(b.id) ? { ...b, expanded: v } : b)),
        }));
        for (const id of folders) store.renderer?.expand.set(id, v);
      }}
    />
  </Field>
{/if}
<Field label={t('inspector.showName')}>
  <Select
    value={showName?.value}
    mixed={showName?.mixed}
    options={[
      { value: 'inherit', label: t('inspector.showName.inherit') },
      { value: 'always', label: t('view.names.always') },
      { value: 'hover', label: t('view.names.hover') },
      { value: 'never', label: t('view.names.never') },
    ]}
    onchange={(v) => update(editor, (b) => ({ ...b, showName: v as ShowName }))}
  />
</Field>
