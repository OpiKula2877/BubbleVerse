<script lang="ts">
  import { Button, Field, NumberField, Section, t, tk, type BackupInfo } from '@bv/ui';
  import { onMount } from 'svelte';
  import { enterEdit } from '../lib/actions';
  import { exportWorld, pickPackage } from '../lib/packages';
  import { store } from '../lib/store.svelte';

  /** Settings → Data (spec §7.5). */
  interface DataInfo {
    dir: string;
    dbBytes: number;
    assetsBytes: number;
    backupsBytes: number;
  }

  let info = $state<DataInfo | null>(null);
  let backups = $state<BackupInfo[]>([]);

  async function refresh() {
    try {
      [info, backups] = await Promise.all([
        store.core.call<DataInfo>('data_info'),
        store.core.listBackups(),
      ]);
    } catch (e) {
      store.error(e);
    }
  }

  onMount(() => void refresh());

  function size(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function when(ms: number): string {
    return new Date(ms).toLocaleString(store.settings.general.language);
  }

  function setBackups(n: number) {
    void store.saveSettings({
      ...store.settings,
      data: { ...store.settings.data, backups: Math.max(1, Math.min(100, Math.round(n))) },
    });
  }

  async function move() {
    const dir = await store.core.pickFolder();
    if (!dir) return;
    store.dialog = {
      title: t('data.moveTitle'),
      text: tk('data.moveText', { dir }),
      buttons: [
        {
          label: t('data.move'),
          kind: 'primary',
          action: () => void store.core.call('move_data', { dir }).catch((e) => store.error(e)),
        },
        { label: t('common.cancel'), action: () => {} },
      ],
    };
  }

  function restore(b: BackupInfo) {
    store.dialog = {
      title: t('data.restoreTitle'),
      text: tk('data.restoreText', { time: when(b.at) }),
      buttons: [
        {
          label: t('data.restore'),
          kind: 'danger',
          action: () =>
            void store.core
              .restoreBackup(b.file)
              .then(() => store.notify(t('data.restored')))
              .catch((e) => store.error(e)),
        },
        { label: t('common.cancel'), action: () => {} },
      ],
    };
  }

  /** Everything back to a fresh install; the current world stays in the backups. */
  function reset() {
    store.dialog = {
      title: t('data.resetTitle'),
      text: t('data.resetText'),
      buttons: [
        {
          label: t('data.resetButton'),
          kind: 'danger',
          action: () =>
            void store.core
              .call('reset_app')
              .then(async () => {
                store.renderer?.setCamera({ x: 0, y: 0, zoom: 1 }, 450);
                store.notify(t('data.resetDone'));
                await refresh();
              })
              .catch((e) => store.error(e)),
        },
        { label: t('common.cancel'), action: () => {} },
      ],
    };
  }

  async function clean() {
    try {
      const n = await store.core.call<number>('clean_assets');
      store.notify(tk('data.cleaned', { n }));
      await refresh();
    } catch (e) {
      store.error(e);
    }
  }

  async function importPackage() {
    const pkg = await pickPackage();
    if (!pkg) return;
    if (!store.editor) enterEdit();
    if (!store.editor) return;
    store.settingsOpen = false;
    store.editor.modal = { kind: 'import', pkg, parentId: null };
  }
</script>

<Section title={t('data.location')}>
  <p class="path" title={info?.dir}>{info?.dir ?? ''}</p>
  <div class="row">
    <Button small icon="folder" onclick={() => void store.core.call('open_data_folder')}>
      {t('data.open')}
    </Button>
    <Button small onclick={() => void move()}>{t('data.moveButton')}</Button>
  </div>
</Section>

<Section title={t('data.backups')}>
  <Field label={t('data.keep')}>
    <NumberField value={store.settings.data.backups} min={1} max={100} onchange={setBackups} />
  </Field>
  {#if store.editor}<p class="bv-muted hint">{t('data.restoreEditHint')}</p>{/if}
  <div class="list">
    {#each backups as b (b.file)}
      <div class="row">
        <span>{when(b.at)}</span>
        <span class="bv-muted">{size(b.size)}</span>
        <Button small disabled={!!store.editor} onclick={() => restore(b)}
          >{t('data.restore')}</Button
        >
      </div>
    {:else}
      <p class="bv-muted">{t('data.noBackups')}</p>
    {/each}
  </div>
</Section>

<Section title={t('data.exportImport')}>
  <div class="row">
    <Button small icon="download" onclick={() => void exportWorld(store.world)}
      >{t('data.exportWorld')}</Button
    >
    <Button small icon="upload" onclick={() => void importPackage()}>{t('data.import')}</Button>
  </div>
</Section>

<Section title={t('data.size')}>
  {#if info}
    <div class="sizes">
      <span>{t('data.db')}</span><span>{size(info.dbBytes)}</span>
      <span>{t('data.assets')}</span><span>{size(info.assetsBytes)}</span>
      <span>{t('data.backupsSize')}</span><span>{size(info.backupsBytes)}</span>
    </div>
  {/if}
  <div class="row">
    <Button small icon="trash" onclick={() => void clean()}>{t('data.clean')}</Button>
  </div>
</Section>

<Section title={t('data.reset')}>
  <p class="bv-muted hint">{t('data.resetHint')}</p>
  {#if store.editor}<p class="bv-muted hint">{t('data.resetEditHint')}</p>{/if}
  <div class="row">
    <Button small variant="danger" icon="undo" disabled={!!store.editor} onclick={reset}
      >{t('data.resetButton')}</Button
    >
  </div>
</Section>

<style>
  .path {
    margin: 0 0 8px;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 0;
  }
  .row > span:first-child {
    flex: 1;
  }
  .list {
    max-height: 200px;
    overflow-y: auto;
  }
  .hint {
    margin: 0 0 6px;
    font-size: 12px;
  }
  .sizes {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 16px;
    margin-bottom: 10px;
    font-size: 13px;
  }
</style>
