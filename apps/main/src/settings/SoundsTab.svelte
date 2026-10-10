<script lang="ts">
  import { Button, Field, NumberField, playSound, t, Toggle, type Settings } from '@bv/ui';
  import { store } from '../lib/store.svelte';

  /** Settings → Sounds (spec §7.7). */
  const s = $derived(store.settings.sounds);

  async function set(patch: Partial<Settings['sounds']>) {
    await store.saveSettings({ ...store.settings, sounds: { ...s, ...patch } });
  }

  async function pick(key: 'clickSound' | 'activationSound') {
    const path = await store.core.pickFile([
      { name: t('sounds.files'), extensions: ['mp3', 'wav', 'ogg'] },
    ]);
    if (!path) return;
    try {
      const info = await store.core.importAsset(path);
      await set({ [key]: info.hash });
    } catch (e) {
      store.error(e);
    }
  }
</script>

<Field label={t('sounds.ui')}>
  <Toggle checked={s.ui} onchange={(v) => void set({ ui: v })} />
</Field>
<Field label={t('sounds.activation')}>
  <Toggle checked={s.activation} onchange={(v) => void set({ activation: v })} />
</Field>
<Field label={t('sounds.volume')}>
  <NumberField
    value={Math.round(s.volume * 100)}
    min={0}
    max={100}
    step={5}
    suffix="%"
    onchange={(v) => void set({ volume: Math.min(100, Math.max(0, v)) / 100 })}
  />
</Field>
<Field label={t('sounds.muteFullscreen')}>
  <Toggle checked={s.muteInFullscreen} onchange={(v) => void set({ muteInFullscreen: v })} />
</Field>

{#each [['clickSound', 'click', 'sounds.clickSound'], ['activationSound', 'activate', 'sounds.activationSound']] as const as [key, kind, label] (key)}
  <Field label={t(label)}>
    <div class="row">
      <span class="bv-muted">{s[key] ? t('sounds.custom') : t('sounds.default')}</span>
      <Button small onclick={() => void pick(key)}>{t('common.browse')}</Button>
      {#if s[key]}
        <Button small onclick={() => void set({ [key]: null })}>{t('common.reset')}</Button>
      {/if}
      <Button small icon="play" title={t('sounds.test')} onclick={() => playSound(kind)} />
    </div>
  </Field>
{/each}

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .row span {
    min-width: 70px;
  }
</style>
