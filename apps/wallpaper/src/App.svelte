<script lang="ts">
  import {
    applyTheme,
    resolveBackground,
    getCore,
    hexToRgb,
    setLang,
    themeColors,
    type Layout,
    type Settings,
  } from '@bv/ui';
  import {
    fitCamera,
    WorldIndex,
    WorldRenderer,
    type Camera,
    type ScreenLayout,
    type World,
  } from '@bv/world';
  import { listen } from '@tauri-apps/api/event';
  import { onDestroy, onMount } from 'svelte';

  /**
   * The desktop wallpaper (spec §2.2): the saved world from the home view, no mouse, its own
   * FPS limit, asleep while covered, greyed out and following the camera during desktop search.
   */
  interface DesktopSearch {
    active: boolean;
    colored: string[];
    path: string[];
    current: string | null;
    /** Aim the camera at this bubble and its children (`null` = main bubbles). */
    focus?: string | null;
  }

  const core = getCore();
  let host: HTMLDivElement;
  let renderer: WorldRenderer | null = null;
  let world: World | null = null;
  let settings: Settings | null = null;
  let layout: Layout | null = null;
  let sleeping = false;
  let autoPaused = false;
  let trayPaused = false;
  let searching = false;
  const offs: (() => void)[] = [];

  function screenLayout(): ScreenLayout {
    const l = layout;
    if (!l || l.windowed) {
      const dpr = window.devicePixelRatio || 1;
      const rect = { x: 0, y: 0, w: innerWidth * dpr, h: innerHeight * dpr };
      return {
        monitors: [{ id: 'w', rect, scale: dpr }],
        uiMonitor: 'w',
        origin: { x: 0, y: 0 },
        cssScale: dpr,
      };
    }
    return {
      monitors: l.monitors.map((m) => ({ id: m.id, rect: m.rect, scale: m.scale })),
      uiMonitor: l.uiMonitor,
      origin: { x: l.origin.x, y: l.origin.y },
      cssScale: l.cssScale,
    };
  }

  function home(): Camera {
    const h = world?.homeView ?? { x: 0, y: 0, zoom: 1 };
    return { x: h.x, y: h.y, zoom: h.zoom };
  }

  function look() {
    const s = settings;
    const r = renderer;
    if (!s) return;
    const a = s.appearance;
    const colors = themeColors(a.theme, a.custom);
    applyTheme(colors, {
      font: a.font,
      radius: a.radius,
      panelOpacity: a.panelOpacity,
      uiScale: a.uiScale,
    });
    setLang(s.general.language);
    if (!r) return;
    const bg = s.background.same ? s.background.app : s.background.wallpaper;
    void resolveBackground(bg, core).then((b) => r.setBackground(b));
    r.setPrefs({ names: s.view.names, skins: s.view.skins });
    r.setLodZoom(s.performance.lodZoom);
    r.setMaxVideos(s.performance.maxVideos);
    r.setFpsLimit(s.performance.wallpaperFps);
    const grid = hexToRgb(colors.grid);
    r.setColors({
      selection: hexToRgb(colors.selection).color,
      highlight: hexToRgb(colors.highlight).color,
      guide: hexToRgb(colors.guide).color,
      grid: grid.color,
      gridAlpha: grid.alpha,
      error: hexToRgb(colors.error).color,
    });
    sync();
  }

  /** Draws only while visible and not paused; desktop search always wakes it up. */
  function sync() {
    const r = renderer;
    if (!r || !settings) return;
    const asleep = !searching && (sleeping || autoPaused);
    r.setSuspended(asleep);
    // Every bubble stays in view, also while it moves (unless the home view is chosen).
    r.setFollow(settings.view.camera === 'fit' && !searching);
    r.setMotion(!trayPaused && !settings.view.motionPaused && !autoPaused);
  }

  function aim(id: string | null) {
    const r = renderer;
    if (!r || !world) return;
    const index = new WorldIndex(world);
    const ids = id ? [id, ...index.children(id).map((b) => b.id)] : index.roots().map((b) => b.id);
    const box = r.boxOf(ids);
    if (box) r.setCamera(fitCamera(screenLayout(), box, 0.1, 2.5), 450);
  }

  function desktopSearch(d: DesktopSearch) {
    const r = renderer;
    if (!r) return;
    searching = d.active;
    sync();
    if (!d.active) {
      r.setSearch({ active: false, colored: new Set(), path: new Set(), current: null });
      r.setWorld(world!, true);
      if (settings?.view.camera !== 'fit') r.setCamera(home(), 450);
      return;
    }
    for (const id of d.path) if (!r.expand.isExpanded(id)) r.expand.set(id, true);
    r.setSearch({
      active: true,
      colored: new Set(d.colored),
      path: new Set(d.path),
      current: d.current,
    });
    if (d.focus !== undefined) aim(d.focus);
  }

  onMount(async () => {
    const b = await core.bootstrap();
    world = b.published;
    settings = b.settings;
    layout = b.layout;
    trayPaused = b.paused;
    const r = await WorldRenderer.create({
      host,
      assetUrl: (h) => core.assetUrl(h),
      graphicsApi: b.settings.performance.graphicsApi,
    });
    renderer = r;
    r.setLayout(screenLayout());
    r.setWorld(world, true);
    r.setCamera(home());
    look();
    const snapshotIfFallback = async () => {
      if (core.isTauri && (await core.call<string>('wallpaper_status')) === 'fallback') {
        await core.call('wallpaper_snapshot', { pngBase64: r.snapshot() });
      }
    };
    void snapshotIfFallback();
    offs.push(
      core.on('world-published', (w) => {
        world = w;
        r.setWorld(w, true);
        r.clearScriptChanges();
        if (!searching) r.setCamera(home());
        void snapshotIfFallback();
      }),
      core.on('settings', (s) => {
        settings = s;
        look();
      }),
      core.on('layout', (l) => {
        layout = l;
        r.setLayout(screenLayout());
      }),
      core.on('pause', (p) => {
        trayPaused = p;
        sync();
      }),
      core.on('fx', (fx) => r.scriptFx(fx)),
    );
    if (core.isTauri) {
      offs.push(
        await listen<boolean>('bv://wallpaper-sleep', (e) => {
          sleeping = e.payload;
          sync();
        }),
        await listen<{ paused: boolean }>('bv://autopause', (e) => {
          autoPaused = e.payload.paused;
          sync();
        }),
        await listen<DesktopSearch>('bv://desktop-search', (e) => desktopSearch(e.payload)),
        await listen('bv://wallpaper-snapshot', () => {
          void core.call('wallpaper_snapshot', { pngBase64: r.snapshot() });
        }),
      );
    }
  });

  onDestroy(() => {
    offs.forEach((o) => o());
    renderer?.destroy();
  });
</script>

<svelte:window onresize={() => renderer?.setLayout(screenLayout())} />

<div class="wall" bind:this={host}></div>

<style>
  .wall {
    position: fixed;
    inset: 0;
    pointer-events: none;
  }
</style>
