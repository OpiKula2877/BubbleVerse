<script lang="ts">
  import { Button, Section, t, TextField, type RunningScript } from '@bv/ui';
  import type { Value } from '@bv/world';
  import { onDestroy, onMount } from 'svelte';
  import { openScriptEditor } from '../lib/script-editor';
  import { store } from '../lib/store.svelte';

  /** Running scripts with Stop (spec §5.5) and global variables with their values (spec §5.3). */
  let running = $state<RunningScript[]>([]);
  let globals = $state<Record<string, Value>>({});
  let newName = $state('');
  let timer = 0;

  async function refresh() {
    try {
      const [r, g] = await Promise.all([
        store.core.runningScripts(),
        store.core.call<Record<string, Value>>('get_globals'),
      ]);
      running = r;
      globals = g;
    } catch (e) {
      store.error(e);
    }
  }

  onMount(() => {
    void refresh();
    timer = window.setInterval(() => void refresh(), 1000);
  });
  onDestroy(() => clearInterval(timer));

  function show(v: Value | undefined): string {
    if (v === undefined || v === null) return '';
    return typeof v === 'string' ? v : JSON.stringify(v);
  }

  function parse(text: string): Value {
    const s = text.trim();
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s !== '' && !Number.isNaN(Number(s))) return Number(s);
    return text;
  }

  async function setGlobal(name: string, text: string) {
    await store.core.call('set_global', { name, value: parse(text) });
    await refresh();
  }

  async function addGlobal() {
    const name = newName.trim();
    if (!name || name in globals) return;
    newName = '';
    await setGlobal(name, '');
  }

  async function removeGlobal(name: string) {
    await store.core.call('delete_global', { name });
    await refresh();
  }

  function seconds(started: number): string {
    return `${Math.max(0, Math.round((Date.now() - started) / 1000))} s`;
  }

  const names = $derived(Object.keys(globals).sort((a, b) => a.localeCompare(b)));
</script>

<Section title={t('scripts.running')}>
  {#each running as r (r.id)}
    <div class="row">
      <button
        type="button"
        class="path"
        title={t('scripts.openEditor')}
        onclick={() => void openScriptEditor(r.bubble)}
      >
        {r.path || r.bubble}
      </button>
      <span class="bv-muted">{r.slot === null ? t('scripts.test') : seconds(r.started)}</span>
      <Button small icon="stop" onclick={() => void store.core.stopScript(r.id).then(refresh)}>
        {t('scripts.stop')}
      </Button>
    </div>
  {:else}
    <p class="bv-muted">{t('scripts.noneRunning')}</p>
  {/each}
  {#if running.length > 1}
    <Button small variant="danger" onclick={() => void store.core.stopAllScripts().then(refresh)}>
      {t('scripts.stopAll')}
    </Button>
  {/if}
</Section>

<Section title={t('scripts.globals')}>
  <p class="bv-muted hint">{t('scripts.globalsHint')}</p>
  {#each names as name (name)}
    <div class="row">
      <span class="name">{name}</span>
      <input
        class="edit"
        value={show(globals[name])}
        aria-label={name}
        onchange={(e) => void setGlobal(name, e.currentTarget.value)}
      />
      <Button
        small
        icon="trash"
        title={t('common.remove')}
        onclick={() => void removeGlobal(name)}
      />
    </div>
  {:else}
    <p class="bv-muted">{t('scripts.noGlobals')}</p>
  {/each}
  <div class="row add">
    <TextField
      value={newName}
      placeholder={t('scripts.newGlobal')}
      oninput={(v) => (newName = v)}
      onenter={() => void addGlobal()}
    />
    <Button small icon="plus" disabled={!newName.trim()} onclick={() => void addGlobal()}>
      {t('common.add')}
    </Button>
  </div>
</Section>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }
  .path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: none;
    background: none;
    padding: 0;
    color: var(--bv-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .path:hover {
    color: var(--bv-accent);
  }
  .name {
    width: 160px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .edit {
    flex: 1;
    height: 28px;
    padding: 0 8px;
    border-radius: calc(var(--bv-radius) * 0.6);
    border: 1px solid var(--bv-input-border);
    background: var(--bv-input);
    color: var(--bv-text);
    font: inherit;
  }
  .hint {
    margin: 0 0 8px;
  }
  .add {
    margin-top: 6px;
  }
</style>
