<script lang="ts">
  import {
    Button,
    ColorField,
    Field,
    NumberField,
    Section,
    Segmented,
    t,
    Toggle,
    type Background,
    type Settings,
  } from '@bv/ui';
  import { pickImageAsset } from '../edit/assets';
  import { store } from '../lib/store.svelte';

  /** Settings → World background (spec §7.6). */
  const b = $derived(store.settings.background);

  function setAll(patch: Partial<Settings['background']>) {
    void store.saveSettings({ ...store.settings, background: { ...b, ...patch } });
  }

  function set(which: 'app' | 'wallpaper', patch: Partial<Background>) {
    setAll({ [which]: { ...b[which], ...patch } });
  }

  async function pick(which: 'app' | 'wallpaper', kind: 'image' | 'video') {
    const media = await pickImageAsset(kind);
    if (media && 'asset' in media && media.asset) set(which, { kind, asset: media.asset });
  }

  const kinds = [
    { value: 'color', label: t('background.color') },
    { value: 'gradient', label: t('background.gradient') },
    { value: 'image', label: t('background.image') },
    { value: 'video', label: t('background.video') },
    { value: 'windows', label: t('background.windows') },
  ] as const;
</script>

{#snippet editor(which: 'app' | 'wallpaper', bg: Background)}
  <Field label={t('background.kind')}>
    <Segmented
      options={[...kinds]}
      value={bg.kind}
      onchange={(v) => {
        if ((v === 'image' || v === 'video') && !bg.asset) void pick(which, v);
        else set(which, { kind: v });
      }}
    />
  </Field>
  {#if bg.kind === 'color' || bg.kind === 'gradient'}
    <Field label={t('background.color1')}>
      <ColorField value={bg.color} onchange={(v) => set(which, { color: v })} />
    </Field>
  {/if}
  {#if bg.kind === 'gradient'}
    <Field label={t('background.color2')}>
      <ColorField value={bg.color2} onchange={(v) => set(which, { color2: v })} />
    </Field>
    <Field label={t('background.angle')}>
      <NumberField
        value={bg.angle}
        step={15}
        suffix="°"
        onchange={(v) => set(which, { angle: v })}
      />
    </Field>
  {/if}
  {#if bg.kind === 'image' || bg.kind === 'video'}
    <Field label="">
      <Button
        small
        icon="image"
        onclick={() => void pick(which, bg.kind === 'video' ? 'video' : 'image')}
      >
        {t('background.pick')}
      </Button>
    </Field>
  {/if}
  {#if bg.kind === 'windows'}
    <p class="bv-muted hint">{t('background.windowsHint')}</p>
  {/if}
  <Field label={t('background.stars')}>
    <Toggle checked={bg.stars} onchange={(v) => set(which, { stars: v })} />
  </Field>
  <Field label={t('background.parallax')}>
    <Toggle checked={bg.parallax} onchange={(v) => set(which, { parallax: v })} />
  </Field>
  <Field label={t('background.grid')}>
    <Toggle checked={bg.grid} onchange={(v) => set(which, { grid: v })} />
  </Field>
{/snippet}

<Field label={t('background.same')}>
  <Toggle checked={b.same} onchange={(v) => setAll({ same: v })} />
</Field>

<Section title={b.same ? t('background.both') : t('background.app')}>
  {@render editor('app', b.app)}
</Section>
{#if !b.same}
  <Section title={t('background.wallpaper')}>
    {@render editor('wallpaper', b.wallpaper)}
  </Section>
{/if}

<style>
  .hint {
    margin: 0 0 8px;
    font-size: 12px;
  }
</style>
