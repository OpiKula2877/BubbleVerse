<script lang="ts">
  import { Field, t, Toggle } from '@bv/ui';
  import type { BubbleId, HoverFx } from '@bv/world';
  import type { Editor } from '../../lib/editor.svelte';
  import { commonField, update } from './common';

  let { editor, ids }: { editor: Editor; ids: BubbleId[] } = $props();

  const w = $derived(editor.world!);
  const keys = ['grow', 'shake', 'glow', 'tooltip'] as const;
  const values = $derived(
    Object.fromEntries(keys.map((k) => [k, commonField(w, ids, (b) => b.hover[k])])),
  );
</script>

<!-- Same layout as the other sections: label column, then the switch. -->
{#each keys as k (k)}
  <Field label={t(`hover.${k}` as 'hover.grow')}>
    <Toggle
      checked={values[k]?.value}
      mixed={values[k]?.mixed}
      onchange={(v) => update(editor, (b) => ({ ...b, hover: { ...b.hover, [k]: v } as HoverFx }))}
    />
  </Field>
{/each}
