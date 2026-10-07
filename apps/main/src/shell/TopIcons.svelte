<script lang="ts">
  import { Button, Segmented, t, Toggle } from '@bv/ui';
  import { toggleEdit } from '../lib/actions';
  import { store } from '../lib/store.svelte';

  const view = $derived(store.settings.view);

  function setView(patch: Partial<typeof view>) {
    void store.saveSettings({ ...store.settings, view: { ...view, ...patch } });
  }
</script>

<div class="top">
  <Button
    variant="ghost"
    icon="eye"
    title={t('top.view')}
    active={store.viewMenuOpen}
    onclick={() => (store.viewMenuOpen = !store.viewMenuOpen)}
  />
  <Button
    variant="ghost"
    icon="hammer"
    title={t('top.edit')}
    active={store.mode === 'edit'}
    onclick={toggleEdit}
  />
  <Button
    variant="ghost"
    icon="gear"
    title={t('top.settings')}
    active={store.settingsOpen}
    onclick={() => (store.settingsOpen = !store.settingsOpen)}
  />
  {#if store.core.isTauri && !store.layout?.windowed}
    <Button
      variant="ghost"
      icon="minus"
      title={t('top.hide')}
      onclick={() => void store.core.hideMain()}
    />
  {/if}
</div>

{#if store.viewMenuOpen}
  <div class="view bv-glass">
    <div class="row">
      <span>{t('view.names')}</span>
      <Segmented
        value={view.names}
        options={[
          { value: 'always', label: t('view.names.always') },
          { value: 'hover', label: t('view.names.hover') },
          { value: 'never', label: t('view.names.never') },
        ]}
        onchange={(v) => setView({ names: v })}
      />
    </div>
    <div class="row">
      <span>{t('view.skins')}</span>
      <Toggle checked={view.skins} onchange={(v) => setView({ skins: v })} />
    </div>
    <div class="row">
      <span>{t('view.motion.pause')}</span>
      <Toggle checked={view.motionPaused} onchange={(v) => setView({ motionPaused: v })} />
    </div>
  </div>
{/if}

<style>
  .top {
    position: absolute;
    top: 10px;
    right: 12px;
    display: flex;
    gap: 4px;
    padding: 4px;
    z-index: 30;
    border-radius: var(--bv-radius);
    background: color-mix(in srgb, var(--bv-bar) 70%, transparent);
    backdrop-filter: blur(10px);
  }
  .view {
    position: absolute;
    top: 58px;
    right: 12px;
    z-index: 31;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 280px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
</style>
