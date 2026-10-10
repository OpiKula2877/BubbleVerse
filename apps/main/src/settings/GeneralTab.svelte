<script lang="ts">
  import { Button, Field, Icon, Segmented, Select, t, Toggle, type Settings } from '@bv/ui';
  import { checkForUpdates } from '../lib/updates';
  import { store } from '../lib/store.svelte';

  const g = $derived(store.settings.general);

  function set(patch: Partial<Settings['general']>) {
    void store.saveSettings({ ...store.settings, general: { ...g, ...patch } });
  }

  const monitors = $derived(
    (store.layout?.monitors ?? []).map((m, i) => ({
      value: m.id,
      label: t('settings.monitorLabel', {
        n: i + 1,
        w: m.rect.w,
        h: m.rect.h,
        scale: Math.round(m.scale * 100),
      }),
    })),
  );
</script>

<Toggle
  checked={g.autostart}
  label={t('settings.autostart')}
  onchange={(v) => set({ autostart: v })}
/>
<Toggle
  checked={g.wallpaper}
  label={t('settings.wallpaper')}
  onchange={(v) => set({ wallpaper: v })}
/>
{#if g.wallpaper && store.wallpaperStatus === 'fallback'}
  <div class="warn"><Icon name="warning" size={15} />{t('settings.wallpaperFallback')}</div>
{/if}
<Toggle
  checked={g.hideDesktopIcons}
  label={t('settings.hideIcons')}
  disabled={!g.wallpaper}
  onchange={(v) => set({ hideDesktopIcons: v })}
/>
<Field label={t('settings.language')}>
  <Segmented
    value={g.language}
    options={[
      { value: 'en', label: 'English' },
      { value: 'cs', label: 'Čeština' },
    ]}
    onchange={(v) => set({ language: v })}
  />
</Field>
<Field label={t('settings.primaryMonitor')}>
  <Select
    value={g.primaryMonitor ?? ''}
    options={[{ value: '', label: t('settings.monitorSystem') }, ...monitors]}
    onchange={(v) => set({ primaryMonitor: v || null })}
  />
</Field>
<Toggle
  checked={g.coverTaskbar}
  label={t('settings.coverTaskbar')}
  onchange={(v) => set({ coverTaskbar: v })}
/>
<Field label={t('settings.closeBehavior')}>
  <Segmented
    value={g.closeBehavior}
    options={[
      { value: 'tray', label: t('settings.close.tray') },
      { value: 'quit', label: t('settings.close.quit') },
    ]}
    onchange={(v) => set({ closeBehavior: v })}
  />
</Field>
<Toggle
  checked={store.settings.search.sortByUsage}
  label={t('settings.sortByUsage')}
  onchange={(v) => void store.saveSettings({ ...store.settings, search: { sortByUsage: v } })}
/>
<div class="updates">
  <Toggle
    checked={g.checkUpdates}
    label={t('settings.checkUpdates')}
    onchange={(v) => set({ checkUpdates: v })}
  />
  <Button small onclick={() => void checkForUpdates(true)}>{t('update.checkNow')}</Button>
</div>

<style>
  .updates {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .warn {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px 10px;
    border: 1px solid var(--bv-warning);
    border-radius: calc(var(--bv-radius) * 0.75);
    color: var(--bv-warning);
    font-size: 12px;
  }
</style>
