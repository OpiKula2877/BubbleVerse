<script lang="ts">
  import { playSound, setFullscreenActive, t, tk } from '@bv/ui';
  import {
    effectsShowcase,
    generateScene,
    solarSystem,
    type World,
    type WorldRenderer,
  } from '@bv/world';
  import { onDestroy, onMount } from 'svelte';
  import EditMode from './edit/EditMode.svelte';
  import { motionEditor } from './edit/motion-editor.svelte';
  import MotionOverlay from './edit/MotionOverlay.svelte';
  import { Editor } from './lib/editor.svelte';
  import { handleKey, handleKeyUp, resetKeys, runAction } from './lib/actions';
  import { sendWorldToEditor, startScriptEditorBridge } from './lib/script-editor';
  import { startFileDrop } from './generator/drop';
  import { openPackageFile } from './lib/packages';
  import { checkForUpdates } from './lib/updates';
  import { listen } from '@tauri-apps/api/event';
  import { store } from './lib/store.svelte';
  import Settings from './settings/Settings.svelte';
  import DialogHost from './shell/DialogHost.svelte';
  import FpsMeter from './shell/FpsMeter.svelte';
  import Toast from './shell/Toast.svelte';
  import TopIcons from './shell/TopIcons.svelte';
  import WorldCanvas from './world/WorldCanvas.svelte';
  import SearchOverlay from './search/SearchOverlay.svelte';
  import { search } from './search/search.svelte';
  import { enterUniverse } from './lib/intro';

  const offs: (() => void)[] = [];
  // Development: the store is reachable from the dev tools (and CDP checks).
  if (import.meta.env.DEV) Object.assign(window, { bvStore: store, bvMotion: motionEditor });
  let booted: { draft: { world: World; updatedAt: number } | null } | null = null;

  onMount(async () => {
    const b = await store.core.bootstrap();
    store.settings = b.settings;
    store.layout = b.layout;
    store.published = b.published;
    // Developer test scenes (AI prompt §5.3): ?scene=200, ?scene=1000, ?scene=solar, ?scene=fx;
    // not saved unless edited.
    const scene = new URLSearchParams(location.search).get('scene');
    if (scene === 'solar') store.published = solarSystem();
    else if (scene === 'fx') store.published = effectsShowcase();
    else if (Number(scene) > 0) store.published = generateScene(Number(scene));
    store.paused = b.paused;
    store.version = b.version;
    store.applyLook();
    if (store.core.isTauri) {
      store.wallpaperStatus = await store.core.call('wallpaper_status');
    }
    store.ready = true;
    booted = { draft: b.draft };
    startIfReady();
    offs.push(await startScriptEditorBridge(), await startFileDrop());
    if (store.core.isTauri) {
      // A .bubble file this start was opened with, and ones opened later (spec §9.4).
      const startup = await store.core.call<string | null>('startup_package');
      if (startup) void openPackageFile(startup);
      offs.push(await listen<string>('bv://open-package', (e) => void openPackageFile(e.payload)));
      // Updates are looked for a while after start, never in development builds.
      if (store.settings.general.checkUpdates && !import.meta.env.DEV) {
        window.setTimeout(() => void checkForUpdates(false), 15000);
      }
    }
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
      core.on('fx', (fx) => {
        store.renderer?.scriptFx(fx);
        if (fx.kind === 'activated') playSound('activate');
      }),
      // Sounds are muted while a game runs full screen (spec §7.7).
      core.on('autopause', (a) => setFullscreenActive(a.signals?.fullscreen ?? false)),
      // Script errors also show as a message so they are noticed outside the script editor.
      core.on('log', (entry) => {
        if (entry.level !== 'error') return;
        const key = `error.${entry.code}`;
        const msg = entry.code
          ? tk(key, { path: entry.detail ?? '', message: entry.text })
          : entry.text;
        store.notify(`${entry.path}: ${msg === key ? entry.text : msg}`, true);
      }),
      core.on('open-settings', (tab) => {
        if (tab) store.settingsTab = tab;
        store.settingsOpen = true;
      }),
      core.on('shortcut', (action) => runAction(action)),
      core.on('search', (mode) => {
        if (mode !== 'global') return void search.start();
        // The universe comes up over the desktop with the search field.
        void search.start(true).then(() => enterUniverse());
      }),
      core.on('wallpaper-status', (s) => (store.wallpaperStatus = s)),
    );
  });

  onDestroy(() => offs.forEach((o) => o()));

  // The open script editor follows the draft (renames, undo).
  $effect(() => sendWorldToEditor(store.world));

  let renderer: WorldRenderer | null = null;
  /** The renderer exists (store.renderer itself is not reactive). */
  let rendererReady = $state(false);

  function onRenderer(r: WorldRenderer) {
    renderer = r;
    store.renderer = r;
    rendererReady = true;
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

  // In view mode the camera keeps every shown bubble on screen, also while they move,
  // until the user moves the view by hand (Home brings it back).
  $effect(() => {
    if (!rendererReady) return;
    store.renderer?.setFollow(
      store.settings.view.camera === 'fit' &&
        store.mode === 'user' &&
        !search.open &&
        !store.cameraTouched,
    );
  });

  function resize() {
    store.viewport = { w: window.innerWidth, h: window.innerHeight };
    store.renderer?.setLayout(store.screenLayout);
  }

  const ui = $derived(store.uiRect);
  const scale = $derived(store.settings.appearance.uiScale / 100);
</script>

<svelte:window onkeydown={handleKey} onkeyup={handleKeyUp} onblur={resetKeys} onresize={resize} />

<WorldCanvas onready={onRenderer} />

{#if store.editor && motionEditor.active}<MotionOverlay editor={store.editor} />{/if}

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
