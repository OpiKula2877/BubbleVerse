<script lang="ts">
  import { t, tk } from '@bv/ui';
  import { generateScene, type World, type WorldRenderer } from '@bv/world';
  import { onDestroy, onMount } from 'svelte';
  import EditMode from './edit/EditMode.svelte';
  import { Editor } from './lib/editor.svelte';
  import { handleKey, runAction } from './lib/actions';
  import { store } from './lib/store.svelte';
  import Settings from './settings/Settings.svelte';
  import DialogHost from './shell/DialogHost.svelte';
  import FpsMeter from './shell/FpsMeter.svelte';
  import Toast from './shell/Toast.svelte';
  import TopIcons from './shell/TopIcons.svelte';
  import WorldCanvas from './world/WorldCanvas.svelte';
  import SearchOverlay from './search/SearchOverlay.svelte';
  import { search } from './search/search.svelte';

  const offs: (() => void)[] = [];
  let booted: { draft: { world: World; updatedAt: number } | null } | null = null;

  onMount(async () => {
    const b = await store.core.bootstrap();
    store.settings = b.settings;
    store.layout = b.layout;
    store.published = b.published;
    // Developer test scene (AI prompt §5.3): ?scene=200 or ?scene=1000, not saved unless edited.
    const scene = Number(new URLSearchParams(location.search).get('scene'));
    if (scene > 0) store.published = generateScene(scene);
    store.paused = b.paused;
    store.version = b.version;
    store.applyLook();
    store.ready = true;
    booted = { draft: b.draft };
    startIfReady();
    const core = store.core;
    offs.push(
      core.on('world-published', (w) => {
        store.published = w;
        if (!store.editor) {
          store.renderer?.setWorld(w);
          store.renderer?.clearScriptChanges();
        }
      }),
      core.on('settings', (s) => {
        store.settings = s;
        store.applyLook();
        syncMotion();
      }),
      core.on('layout', (l) => {
        store.layout = l;
        store.renderer?.setLayout(store.screenLayout);
      }),
      core.on('pause', (p) => {
        store.paused = p;
        syncMotion();
      }),
      core.on('fx', (fx) => store.renderer?.scriptFx(fx)),
      // Script errors also show as a message so they are noticed outside the script editor.
      core.on('log', (entry) => {
        if (entry.level !== 'error') return;
        const key = `error.${entry.code}`;
        const msg = entry.code
          ? tk(key, { path: entry.detail ?? '', message: entry.text })
          : entry.text;
        store.notify(`${entry.path}: ${msg === key ? entry.text : msg}`, true);
      }),
      core.on('open-settings', () => (store.settingsOpen = true)),
      core.on('shortcut', (action) => runAction(action)),
      core.on('search', () => void search.start()),
    );
  });

  onDestroy(() => offs.forEach((o) => o()));

  let renderer: WorldRenderer | null = null;

  function onRenderer(r: WorldRenderer) {
    renderer = r;
    store.renderer = r;
    startIfReady();
  }

  /** Runs once both the core data and the renderer are ready. */
  function startIfReady() {
    if (!renderer || !booted) return;
    const r = renderer;
    const draft = booted.draft;
    booted = null;
    r.setLayout(store.screenLayout);
    r.setWorld(store.published, true);
    r.setCamera(store.home);
    store.applyLook();
    syncMotion();
    if (draft) {
      // Recovery after a crash or restart (spec §4.7).
      store.dialog = {
        title: t('dialog.recoverTitle'),
        text: t('dialog.recoverText', { time: new Date(draft.updatedAt).toLocaleString() }),
        buttons: [
          { label: t('dialog.recoverDiscard'), action: () => void store.core.discardDraft() },
          {
            label: t('dialog.recoverContinue'),
            kind: 'primary',
            action: () => {
              store.editor = new Editor(draft.world, true);
              store.mode = 'edit';
              r.setWorld(draft.world);
              syncMotion();
            },
          },
        ],
      };
    }
  }

  function syncMotion() {
    const r = store.renderer;
    if (!r) return;
    const ed = store.editor;
    r.setMotion(ed ? ed.preview : !store.paused && !store.settings.view.motionPaused);
  }

  $effect(() => {
    // Keep motion in sync with mode, preview and pause toggles.
    void store.editor?.preview;
    void store.mode;
    void store.settings.view.motionPaused;
    void store.paused;
    syncMotion();
  });

  function resize() {
    store.viewport = { w: window.innerWidth, h: window.innerHeight };
    store.renderer?.setLayout(store.screenLayout);
  }

  const ui = $derived(store.uiRect);
  const scale = $derived(store.settings.appearance.uiScale / 100);
</script>

<svelte:window onkeydown={handleKey} onresize={resize} />

<WorldCanvas onready={onRenderer} />

{#if store.ready}
  <div
    class="ui"
    style:left="{ui.x}px"
    style:top="{ui.y}px"
    style:width="{ui.w / scale}px"
    style:height="{ui.h / scale}px"
    style:zoom={scale}
  >
    {#if store.editor}<EditMode editor={store.editor} />{/if}
    <TopIcons />
    {#if store.settings.performance.showFps}<FpsMeter />{/if}
    <SearchOverlay />
    {#if store.settingsOpen}<Settings />{/if}
    {#if store.dialog}<DialogHost />{/if}
    {#if store.toast}<Toast />{/if}
  </div>
{/if}

<style>
  .ui {
    position: absolute;
    pointer-events: none;
    overflow: hidden;
  }
  .ui :global(> *) {
    pointer-events: auto;
  }
</style>
