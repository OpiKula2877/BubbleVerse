<script lang="ts">
  import { Field, Segmented, t, type Settings } from '@bv/ui';
  import { store } from '../lib/store.svelte';

  const a = $derived(store.settings.appearance);

  function set(patch: Partial<Settings['appearance']>) {
    void store.saveSettings({ ...store.settings, appearance: { ...a, ...patch } });
  }
</script>

<Field label={t('settings.theme')}>
  <Segmented
    value={a.theme}
    options={[
      { value: 'light', label: t('settings.theme.light') },
      { value: 'dark', label: t('settings.theme.dark') },
    ]}
    onchange={(v) => set({ theme: v })}
  />
</Field>
