<script lang="ts">
  import { Field, NumberField, Segmented, t } from '@bv/ui';
  import { setAttach, type Attach, type BubbleId } from '@bv/world';
  import type { Editor } from '../../lib/editor.svelte';
  import { store } from '../../lib/store.svelte';
  import { commonField, update } from './common';

  let { editor, ids }: { editor: Editor; ids: BubbleId[] } = $props();

  const w = $derived(editor.world!);
  const attach = $derived(commonField(w, ids, (b) => b.attach));
  const x = $derived(commonField(w, ids, (b) => b.position.x));
  const y = $derived(commonField(w, ids, (b) => b.position.y));
  const anyChild = $derived(ids.some((id) => editor.index.get(id)?.parentId));
</script>

{#if anyChild}
  <Field label={t('attach.mode')}>
    <Segmented
      value={attach?.value}
      mixed={attach?.mixed}
      options={[
        { value: 'parent', label: t('attach.parent') },
        { value: 'world', label: t('attach.world') },
      ]}
      onchange={(v) =>
        editor.apply((x) =>
          setAttach(x, ids, v as Attach, store.renderer?.basePositions() ?? new Map()),
        )}
    />
  </Field>
{/if}
<Field label={t('attach.x')}>
  <NumberField
    value={x?.value ?? 0}
    mixed={x?.mixed}
    onchange={(v) => update(editor, (b) => ({ ...b, position: { ...b.position, x: v } }), 'px')}
  />
</Field>
<Field label={t('attach.y')}>
  <NumberField
    value={y?.value ?? 0}
    mixed={y?.mixed}
    onchange={(v) => update(editor, (b) => ({ ...b, position: { ...b.position, y: v } }), 'py')}
  />
</Field>
