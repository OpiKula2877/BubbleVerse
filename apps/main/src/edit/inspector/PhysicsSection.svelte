<script lang="ts">
  import { Field, NumberField, Segmented, t, Toggle } from '@bv/ui';
  import type { BubbleId, Collide, Float, MouseReact, Physics, Spring } from '@bv/world';
  import type { Editor } from '../../lib/editor.svelte';
  import { commonField, update } from './common';

  let { editor, ids }: { editor: Editor; ids: BubbleId[] } = $props();

  const w = $derived(editor.world!);
  const float = $derived(commonField(w, ids, (b) => b.physics.float ?? null));
  const collide = $derived(commonField(w, ids, (b) => b.physics.collide ?? null));
  const spring = $derived(commonField(w, ids, (b) => b.physics.spring ?? null));
  const mouse = $derived(commonField(w, ids, (b) => b.physics.mouse ?? null));

  function set<K extends keyof Physics>(key: K, value: Physics[K] | undefined, coalesce?: string) {
    update(
      editor,
      (b) => {
        const p = { ...b.physics };
        if (value === undefined) delete p[key];
        else p[key] = value;
        return { ...b, physics: p };
      },
      coalesce,
    );
  }
</script>

<Field label={t('physics.float')}>
  <Toggle
    checked={!!float?.value}
    mixed={float?.mixed}
    onchange={(v) => set('float', v ? { amplitude: 8, speed: 0.4 } : undefined)}
  />
</Field>
{#if float?.value && !float.mixed}
  {@const f = float.value}
  <Field label={t('physics.amplitude')}>
    <NumberField
      value={f.amplitude}
      min={0}
      onchange={(v) => set('float', { ...f, amplitude: v } as Float, 'famp')}
    />
  </Field>
  <Field label={t('motion.speed')}>
    <NumberField
      value={f.speed}
      min={0}
      step={0.05}
      onchange={(v) => set('float', { ...f, speed: v } as Float, 'fspeed')}
    />
  </Field>
{/if}

<Field label={t('physics.collide')}>
  <Toggle
    checked={!!collide?.value}
    mixed={collide?.mixed}
    onchange={(v) => set('collide', v ? { with: 'siblings' } : undefined)}
  />
</Field>
{#if collide?.value && !collide.mixed}
  <Field label="">
    <Segmented
      value={collide.value.with}
      options={[
        { value: 'siblings', label: t('physics.siblings') },
        { value: 'all', label: t('physics.all') },
      ]}
      onchange={(v) => set('collide', { with: v } as Collide)}
    />
  </Field>
{/if}

<Field label={t('physics.spring')}>
  <Toggle
    checked={!!spring?.value}
    mixed={spring?.mixed}
    onchange={(v) => set('spring', v ? { stiffness: 60, damping: 6, length: 0 } : undefined)}
  />
</Field>
{#if spring?.value && !spring.mixed}
  {@const s = spring.value}
  <Field label={t('physics.stiffness')}>
    <NumberField
      value={s.stiffness}
      min={1}
      max={2000}
      onchange={(v) => set('spring', { ...s, stiffness: v } as Spring, 'sst')}
    />
  </Field>
  <Field label={t('physics.damping')}>
    <NumberField
      value={s.damping}
      min={0}
      max={200}
      step={0.5}
      onchange={(v) => set('spring', { ...s, damping: v } as Spring, 'sda')}
    />
  </Field>
  <Field label={t('physics.length')}>
    <NumberField
      value={s.length}
      min={0}
      onchange={(v) => set('spring', { ...s, length: v } as Spring, 'sle')}
    />
  </Field>
{/if}

<Field label={t('physics.mouse')}>
  <Toggle
    checked={!!mouse?.value}
    mixed={mouse?.mixed}
    onchange={(v) => set('mouse', v ? { mode: 'repel', strength: 1, radius: 160 } : undefined)}
  />
</Field>
{#if mouse?.value && !mouse.mixed}
  {@const m = mouse.value}
  <Field label="">
    <Segmented
      value={m.mode}
      options={[
        { value: 'repel', label: t('physics.repel') },
        { value: 'attract', label: t('physics.attract') },
      ]}
      onchange={(v) => set('mouse', { ...m, mode: v } as MouseReact)}
    />
  </Field>
  <Field label={t('physics.strength')}>
    <NumberField
      value={m.strength}
      min={0}
      step={0.1}
      onchange={(v) => set('mouse', { ...m, strength: v } as MouseReact, 'mst')}
    />
  </Field>
  <Field label={t('physics.radius')}>
    <NumberField
      value={m.radius}
      min={1}
      onchange={(v) => set('mouse', { ...m, radius: v } as MouseReact, 'mra')}
    />
  </Field>
{/if}
