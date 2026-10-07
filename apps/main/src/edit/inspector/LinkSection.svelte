<script lang="ts">
  import { ColorField, Field, NumberField, Select, t, Toggle } from '@bv/ui';
  import type { BubbleId, Link, LinkType } from '@bv/world';
  import type { Editor } from '../../lib/editor.svelte';
  import { commonField, update } from './common';

  let { editor, ids }: { editor: Editor; ids: BubbleId[] } = $props();

  const w = $derived(editor.world!);
  const inherit = $derived(commonField(w, ids, (b) => b.link.inherit));
  const type = $derived(commonField(w, ids, (b) => b.link.type));
  const color = $derived(commonField(w, ids, (b) => b.link.color));
  const width = $derived(commonField(w, ids, (b) => b.link.width));
  const opacity = $derived(commonField(w, ids, (b) => b.link.opacity));
  const dash = $derived(commonField(w, ids, (b) => b.link.dash ?? 'dotted'));

  function set(patch: Partial<Link>, key?: string) {
    update(editor, (b) => ({ ...b, link: { ...b.link, ...patch } }), key);
  }

  const types: LinkType[] = ['none', 'line', 'lightning', 'rope', 'flow', 'laser', 'chain'];
</script>

<Field label="">
  <Toggle checked={inherit?.value} mixed={inherit?.mixed} label={t('link.inherit')} onchange={(v) => set({ inherit: v })} />
</Field>
{#if !(inherit && !inherit.mixed && inherit.value)}
  <Field label={t('link.type')}>
    <Select
      value={type?.value}
      mixed={type?.mixed}
      options={types.map((v) => ({ value: v, label: t(`link.${v}` as 'link.none') }))}
      onchange={(v) => set({ type: v as LinkType })}
    />
  </Field>
  {#if type?.value === 'flow'}
    <Field label="">
      <Select
        value={dash?.value}
        options={[
          { value: 'dotted', label: '· · ·' },
          { value: 'dashed', label: '— — —' },
        ]}
        onchange={(v) => set({ dash: v as Link['dash'] })}
      />
    </Field>
  {/if}
  <Field label={t('link.color')}>
    <ColorField value={color?.value ?? '#FFFFFF'} mixed={color?.mixed} onchange={(c) => set({ color: c }, 'lcolor')} />
  </Field>
  <Field label={t('link.width')}>
    <NumberField value={width?.value ?? 2} mixed={width?.mixed} min={0.5} max={40} step={0.5} onchange={(v) => set({ width: v }, 'lwidth')} />
  </Field>
  <Field label={t('link.opacity')}>
    <NumberField
      value={Math.round((opacity?.value ?? 1) * 100)}
      mixed={opacity?.mixed}
      min={0}
      max={100}
      step={5}
      suffix="%"
      onchange={(v) => set({ opacity: v / 100 }, 'lopacity')}
    />
  </Field>
{/if}
