<script lang="ts">
  import {
    Button,
    ColorField,
    Field,
    NumberField,
    Segmented,
    Select,
    t,
    TextField,
    Toggle,
  } from '@bv/ui';
  import {
    defaultLabel,
    isOverridden,
    resetOverride,
    setSkinMode,
    writeLabel,
    writeSkin,
    type BubbleId,
    type Edge,
    type Fill,
    type Gradient,
    type InheritFrom,
    type LabelPosition,
    type Media,
    type Shape,
    type SkinKey,
  } from '@bv/world';
  import { actionTarget } from '@bv/blocks';
  import { autoSourceFor } from '../../lib/auto-icons';
  import type { Editor } from '../../lib/editor.svelte';
  import { pickImageAsset } from '../assets';
  import { commonField, commonSkin } from './common';

  let { editor, ids }: { editor: Editor; ids: BubbleId[] } = $props();

  const w = $derived(editor.world!);
  const mode = $derived(commonField(w, ids, (b) => b.skin.mode));
  const from = $derived(
    commonField(w, ids, (b) =>
      b.skin.mode === 'inherit'
        ? typeof b.skin.from === 'object'
          ? 'ancestor'
          : b.skin.from
        : 'parent',
    ),
  );
  const single = $derived(ids.length === 1 ? editor.index.get(ids[0]!) : undefined);
  const ancestors = $derived(single ? editor.index.ancestors(single.id) : []);
  const ancestorId = $derived(
    single?.skin.mode === 'inherit' && typeof single.skin.from === 'object'
      ? single.skin.from.ancestor
      : '',
  );

  const shape = $derived(
    commonSkin(w, ids, (s) => (typeof s.shape === 'string' ? s.shape : 'mask')),
  );
  const size = $derived(commonSkin(w, ids, (s) => s.size));
  const fill = $derived(commonSkin(w, ids, (s) => s.fill));
  const fillKind = $derived(fill && typeof fill.value === 'object' ? 'gradient' : 'color');
  const media = $derived(commonSkin(w, ids, (s) => s.media ?? null));
  const edge = $derived(commonSkin(w, ids, (s) => s.edge ?? {}));
  const label = $derived(commonSkin(w, ids, (s) => s.label ?? defaultLabel()));

  const overridden = (key: SkinKey) =>
    ids.some((id) => {
      const b = editor.index.get(id);
      return b ? isOverridden(b, key) : false;
    });

  function set<K extends SkinKey>(
    key: K,
    value: Parameters<typeof writeSkin<K>>[3],
    coalesce?: string,
  ) {
    editor.apply(
      (x) => writeSkin(x, ids, key, value),
      coalesce ? `${coalesce}:${ids.join()}` : undefined,
    );
  }

  function reset(key: SkinKey) {
    editor.apply((x) => resetOverride(x, ids, key));
  }

  function setFrom(v: string) {
    const f: InheritFrom =
      v === 'ancestor'
        ? { ancestor: ancestors[ancestors.length - 1]?.id ?? '' }
        : (v as 'parent' | 'root');
    editor.apply((x) => setSkinMode(x, ids, 'inherit', f));
  }

  function gradientOf(f: Fill | undefined): Gradient {
    if (f && typeof f === 'object') return f;
    const c = typeof f === 'string' ? f : '#4C97FF';
    return {
      type: 'radial',
      angle: 90,
      stops: [
        { at: 0, color: '#FFFFFF' },
        { at: 1, color: c },
      ],
    };
  }

  function setGradient(patch: Partial<Gradient>, stop?: { i: number; color: string }) {
    const g = structuredClone(gradientOf(fill?.value));
    Object.assign(g, patch);
    if (stop) {
      const s = g.stops[stop.i];
      if (s) s.color = stop.color;
    }
    set('fill', g, 'gradient');
  }

  async function pickMedia(type: 'icon' | 'image' | 'gif' | 'video') {
    const m = await pickImageAsset(type);
    if (m) set('media', m);
  }

  async function pickMask() {
    const m = await pickImageAsset('image');
    if (m && 'asset' in m && m.asset) set('shape', { mask: m.asset } as Shape);
  }

  function setMediaType(v: string) {
    if (v === 'none') set('media', undefined);
    else if (v === 'auto') {
      // Guess the source from the action (Steam game, Epic game, web site, file).
      const first = ids.map((id) => editor.index.get(id)).find((b) => b && actionTarget(b));
      const target = first ? actionTarget(first)?.value : undefined;
      set('media', { type: 'auto', source: target ? autoSourceFor(target) : 'exe' } as Media);
    } else void pickMedia(v as 'icon' | 'image' | 'gif' | 'video');
  }

  function setEdge(patch: Partial<Edge>) {
    const next: Edge = { ...(edge?.value ?? {}), ...patch };
    for (const k of Object.keys(next) as (keyof Edge)[])
      if (next[k] === undefined || next[k] === false) delete next[k];
    set('edge', next, 'edge');
  }
</script>

<Field label={t('skin.mode')}>
  <Segmented
    value={mode?.value}
    mixed={mode?.mixed}
    options={[
      { value: 'own', label: t('skin.mode.own') },
      { value: 'inherit', label: t('skin.mode.inherit') },
    ]}
    onchange={(v) => editor.apply((x) => setSkinMode(x, ids, v as 'own' | 'inherit'))}
  />
</Field>
{#if mode && !mode.mixed && mode.value === 'inherit'}
  <Field label={t('skin.from')}>
    <Select
      value={from?.value}
      mixed={from?.mixed}
      options={[
        { value: 'parent', label: t('skin.from.parent') },
        { value: 'root', label: t('skin.from.root') },
        ...(single ? [{ value: 'ancestor', label: t('skin.from.ancestor') }] : []),
      ]}
      onchange={setFrom}
    />
  </Field>
  {#if single && from?.value === 'ancestor'}
    <Field label="">
      <Select
        value={ancestorId}
        options={ancestors.map((a) => ({ value: a.id, label: a.name }))}
        onchange={(v) => editor.apply((x) => setSkinMode(x, ids, 'inherit', { ancestor: v }))}
      />
    </Field>
  {/if}
{/if}

{#snippet resetBtn(key: SkinKey)}
  {#if overridden(key)}
    <Button
      small
      variant="ghost"
      icon="undo"
      title={t('common.reset')}
      onclick={() => reset(key)}
    />
  {/if}
{/snippet}

<Field label={t('skin.shape')}>
  <Select
    value={shape?.value}
    mixed={shape?.mixed}
    options={[
      { value: 'circle', label: t('skin.shape.circle') },
      { value: 'rounded', label: t('skin.shape.rounded') },
      { value: 'hexagon', label: t('skin.shape.hexagon') },
      { value: 'star', label: t('skin.shape.star') },
      { value: 'mask', label: t('skin.shape.mask') },
    ]}
    onchange={(v) => (v === 'mask' ? void pickMask() : set('shape', v as Shape))}
  />
  {@render resetBtn('shape')}
</Field>
<Field label={t('skin.size')}>
  <NumberField
    value={size?.value ?? 0}
    mixed={size?.mixed}
    min={8}
    max={2000}
    step={2}
    onchange={(v) => set('size', v, 'size')}
  />
  {@render resetBtn('size')}
</Field>
<Field label={t('skin.fill')}>
  <Segmented
    value={fillKind}
    mixed={fill?.mixed}
    options={[
      { value: 'color', label: t('skin.fill.color') },
      { value: 'gradient', label: t('skin.fill.gradient') },
    ]}
    onchange={(v) =>
      v === 'gradient'
        ? setGradient({})
        : set('fill', gradientOf(fill?.value).stops[1]?.color ?? '#4C97FF')}
  />
  {@render resetBtn('fill')}
</Field>
{#if fillKind === 'color'}
  <Field label="">
    <ColorField
      value={typeof fill?.value === 'string' ? fill.value : '#4C97FF'}
      mixed={fill?.mixed}
      onchange={(v) => set('fill', v, 'fill')}
    />
  </Field>
{:else if fill && typeof fill.value === 'object'}
  <Field label="">
    <Select
      value={fill.value.type}
      options={[
        { value: 'linear', label: t('skin.gradient.linear') },
        { value: 'radial', label: t('skin.gradient.radial') },
      ]}
      onchange={(v) => setGradient({ type: v as Gradient['type'] })}
    />
  </Field>
  <Field label={t('skin.gradient.from')}>
    <ColorField
      value={fill.value.stops[0]?.color ?? '#FFFFFF'}
      onchange={(c) => setGradient({}, { i: 0, color: c })}
    />
  </Field>
  <Field label={t('skin.gradient.to')}>
    <ColorField
      value={fill.value.stops[1]?.color ?? '#000000'}
      onchange={(c) => setGradient({}, { i: 1, color: c })}
    />
  </Field>
  {#if fill.value.type === 'linear'}
    <Field label={t('skin.gradient.angle')}>
      <NumberField
        value={fill.value.angle}
        min={0}
        max={360}
        step={15}
        suffix="°"
        onchange={(v) => setGradient({ angle: v })}
      />
    </Field>
  {/if}
{/if}

<Field label={t('skin.media')}>
  <Select
    value={media?.value?.type ?? 'none'}
    mixed={media?.mixed}
    options={[
      { value: 'none', label: t('skin.media.none') },
      { value: 'icon', label: t('skin.media.icon') },
      { value: 'image', label: t('skin.media.image') },
      { value: 'gif', label: t('skin.media.gif') },
      { value: 'video', label: t('skin.media.video') },
      { value: 'auto', label: t('skin.media.auto') },
    ]}
    onchange={setMediaType}
  />
  {@render resetBtn('media')}
</Field>
{#if media?.value && !media.mixed && media.value.type !== 'auto'}
  <Field label="">
    <Button
      small
      icon="image"
      onclick={() =>
        media?.value && media.value.type !== 'auto' && void pickMedia(media.value.type)}
      >{t('skin.media.pick')}</Button
    >
  </Field>
{:else if media?.value?.type === 'auto' && !media.mixed}
  <Field label="">
    <Select
      value={media.value.source}
      options={[
        { value: 'exe', label: t('skin.auto.exe') },
        { value: 'steam', label: t('skin.auto.steam') },
        { value: 'epic', label: t('skin.auto.epic') },
        { value: 'favicon', label: t('skin.auto.favicon') },
      ]}
      onchange={(v) => set('media', { type: 'auto', source: v } as Media)}
    />
  </Field>
{/if}

<div class="sub">{t('skin.edge')} {@render resetBtn('edge')}</div>
<Field label={t('skin.edge.outline')}>
  <Toggle
    checked={!!edge?.value.outline}
    mixed={edge?.mixed}
    onchange={(v) => setEdge({ outline: v ? { color: '#FFFFFF', width: 3 } : undefined })}
  />
  {#if edge?.value.outline}
    <ColorField
      value={edge.value.outline.color}
      onchange={(c) => setEdge({ outline: { ...edge!.value.outline!, color: c } })}
    />
    <NumberField
      value={edge.value.outline.width}
      min={1}
      max={40}
      onchange={(v) => setEdge({ outline: { ...edge!.value.outline!, width: v } })}
    />
  {/if}
</Field>
<Field label={t('skin.edge.glow')}>
  <Toggle
    checked={!!edge?.value.glow}
    mixed={edge?.mixed}
    onchange={(v) => setEdge({ glow: v ? { color: '#FFFFFF', strength: 0.6 } : undefined })}
  />
  {#if edge?.value.glow}
    <ColorField
      value={edge.value.glow.color}
      onchange={(c) => setEdge({ glow: { ...edge!.value.glow!, color: c } })}
    />
  {/if}
</Field>
<Field label={t('skin.edge.shadow')}>
  <Toggle
    checked={!!edge?.value.shadow}
    mixed={edge?.mixed}
    onchange={(v) =>
      setEdge({ shadow: v ? { color: '#00000099', blur: 12, offset: { x: 0, y: 4 } } : undefined })}
  />
  {#if edge?.value.shadow}
    <NumberField
      value={edge.value.shadow.blur}
      min={0}
      max={80}
      onchange={(v) => setEdge({ shadow: { ...edge!.value.shadow!, blur: v } })}
    />
  {/if}
</Field>
<Field label={t('skin.edge.glass')}>
  <Toggle
    checked={!!edge?.value.glass}
    mixed={edge?.mixed}
    onchange={(v) => setEdge({ glass: v || undefined })}
  />
</Field>
<Field label={t('skin.edge.particles')}>
  <Toggle
    checked={!!edge?.value.particles}
    mixed={edge?.mixed}
    onchange={(v) =>
      setEdge({ particles: v ? { color: '#FFFFFF', count: 12, speed: 1 } : undefined })}
  />
  {#if edge?.value.particles}
    <ColorField
      value={edge.value.particles.color}
      onchange={(c) => setEdge({ particles: { ...edge!.value.particles!, color: c } })}
    />
  {/if}
</Field>

<div class="sub">{t('skin.label')} {@render resetBtn('label')}</div>
<Field label={t('skin.label.color')}>
  <ColorField
    value={label?.value.color ?? '#FFFFFF'}
    mixed={label?.mixed}
    onchange={(c) => editor.apply((x) => writeLabel(x, ids, 'color', c), `lc:${ids.join()}`)}
  />
</Field>
<Field label={t('skin.label.size')}>
  <NumberField
    value={label?.value.size ?? 14}
    mixed={label?.mixed}
    min={6}
    max={96}
    onchange={(v) => editor.apply((x) => writeLabel(x, ids, 'size', v), `ls:${ids.join()}`)}
  />
</Field>
<Field label={t('skin.label.font')}>
  <TextField
    value={label?.value.font ?? ''}
    mixed={label?.mixed}
    oninput={(v) => editor.apply((x) => writeLabel(x, ids, 'font', v), `lf:${ids.join()}`)}
  />
</Field>
<Field label={t('skin.label.position')}>
  <Segmented
    value={label?.value.position}
    mixed={label?.mixed}
    options={[
      { value: 'below', label: t('skin.label.below') },
      { value: 'inside', label: t('skin.label.inside') },
      { value: 'above', label: t('skin.label.above') },
    ]}
    onchange={(v) => editor.apply((x) => writeLabel(x, ids, 'position', v as LabelPosition))}
  />
</Field>

<style>
  .sub {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--bv-text-muted);
  }
</style>
