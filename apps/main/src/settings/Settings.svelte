<script lang="ts">
  import { Icon, t, tk } from '@bv/ui';
  import { store } from '../lib/store.svelte';
  import AppearanceTab from './AppearanceTab.svelte';
  import GeneralTab from './GeneralTab.svelte';

  const tabs = [
    { id: 'general', icon: 'gear' },
    { id: 'appearance', icon: 'image' },
  ];
</script>

<div class="settings bv-glass" role="dialog" aria-label={t('settings.title')}>
  <nav>
    <h2>{t('settings.title')}</h2>
    {#each tabs as tab (tab.id)}
      <button class:on={store.settingsTab === tab.id} onclick={() => (store.settingsTab = tab.id)}>
        <Icon name={tab.icon} size={16} />
        {tk(`settings.${tab.id}`)}
      </button>
    {/each}
    <div class="grow"></div>
    <span class="version bv-muted">{t('app.name')} {store.version}</span>
  </nav>
  <section>
    <header>
      <h3>{tk(`settings.${store.settingsTab}`)}</h3>
      <button class="x" onclick={() => (store.settingsOpen = false)} aria-label={t('common.close')}>
        <Icon name="close" size={16} />
      </button>
    </header>
    <div class="body">
      {#if store.settingsTab === 'general'}<GeneralTab />{/if}
      {#if store.settingsTab === 'appearance'}<AppearanceTab />{/if}
    </div>
  </section>
</div>

<style>
  .settings {
    position: absolute;
    top: 64px;
    right: 12px;
    width: min(780px, calc(100% - 24px));
    height: min(620px, calc(100% - 80px));
    z-index: 35;
    display: flex;
    overflow: hidden;
    background: var(--bv-dialog);
  }
  nav {
    width: 200px;
    flex: none;
    padding: 12px 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--bv-bar);
    border-right: 1px solid var(--bv-border);
  }
  h2 {
    margin: 4px 8px 10px;
    font-size: 15px;
  }
  nav button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 0;
    border-radius: 6px;
    background: none;
    cursor: pointer;
    text-align: left;
    color: var(--bv-text-2);
  }
  nav button:hover {
    background: var(--bv-button-hover);
  }
  nav button.on {
    background: var(--bv-button-active);
    color: var(--bv-text);
  }
  .grow {
    flex: 1;
  }
  .version {
    padding: 0 8px;
    font-size: 11px;
  }
  section {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--bv-border);
  }
  h3 {
    flex: 1;
    margin: 0;
    font-size: 14px;
  }
  .x {
    border: 0;
    background: none;
    padding: 4px;
    border-radius: 6px;
    cursor: pointer;
    color: var(--bv-text-2);
  }
  .x:hover {
    background: var(--bv-button-hover);
  }
  .body {
    flex: 1;
    overflow: auto;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
</style>
