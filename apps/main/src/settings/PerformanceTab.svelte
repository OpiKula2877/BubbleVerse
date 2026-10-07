<script lang="ts">
  import { Field, NumberField, Segmented, t, Toggle, type Settings } from '@bv/ui';
  import { store } from '../lib/store.svelte';

  const p = $derived(store.settings.performance);

  function set(patch: Partial<Settings['performance']>) {
    void store.saveSettings({ ...store.settings, performance: { ...p, ...patch } });
  }
</script>

<Field label={t('perf.appFps')}>
  <Segmented
    value={p.appFps}
    options={[
      { value: 30, label: '30' },
      { value: 60, label: '60' },
      { value: 120, label: '120' },
      { value: 0, label: t('perf.monitorRate') },
    ]}
    onchange={(v) => set({ appFps: v })}
  />
</Field>
<Field label={t('perf.wallpaperFps')}>
  <Segmented
    value={p.wallpaperFps}
    options={[
      { value: 15, label: '15' },
      { value: 30, label: '30' },
      { value: 60, label: '60' },
    ]}
    onchange={(v) => set({ wallpaperFps: v })}
  />
</Field>
<Field label={t('perf.quality')}>
  <Segmented
    value={p.quality}
    options={[
      { value: 'low', label: t('perf.quality.low') },
      { value: 'medium', label: t('perf.quality.medium') },
      { value: 'high', label: t('perf.quality.high') },
    ]}
    onchange={(v) => set({ quality: v })}
  />
</Field>
<Field label={t('perf.maxVideos')}>
  <NumberField value={p.maxVideos} min={0} max={64} onchange={(v) => set({ maxVideos: v })} />
</Field>
<Field label={t('perf.lodZoom')}>
  <NumberField
    value={Math.round(p.lodZoom * 100)}
    min={1}
    max={100}
    step={5}
    suffix="%"
    onchange={(v) => set({ lodZoom: v / 100 })}
  />
</Field>
<Field label={t('perf.graphicsApi')}>
  <Segmented
    value={p.graphicsApi}
    options={[
      { value: 'auto', label: t('perf.api.auto') },
      { value: 'webgpu', label: 'WebGPU' },
      { value: 'webgl', label: 'WebGL' },
    ]}
    onchange={(v) => set({ graphicsApi: v })}
  />
</Field>
<Toggle checked={p.showFps} label={t('perf.showFps')} onchange={(v) => set({ showFps: v })} />

<h4>{t('perf.autoPause')}</h4>
<Toggle
  checked={p.pauseFullscreen}
  label={t('perf.pause.fullscreen')}
  onchange={(v) => set({ pauseFullscreen: v })}
/>
<Toggle
  checked={p.pauseMaximized}
  label={t('perf.pause.maximized')}
  onchange={(v) => set({ pauseMaximized: v })}
/>
<Toggle
  checked={p.pauseBatterySaver}
  label={t('perf.pause.battery')}
  onchange={(v) => set({ pauseBatterySaver: v })}
/>
<Toggle
  checked={p.pauseLocked}
  label={t('perf.pause.locked')}
  onchange={(v) => set({ pauseLocked: v })}
/>

<style>
  h4 {
    margin: 8px 0 0;
    font-size: 13px;
  }
</style>
