import {
  applyTheme,
  configureSounds,
  resolveBackground,
  defaultSettings,
  getCore,
  hexToRgb,
  isCoreError,
  setLang,
  themeColors,
  tk,
  type Layout,
  type Settings,
  type ThemeColors,
} from '@bv/ui';
import {
  emptyWorld,
  type Camera,
  type PxRect,
  type RenderColors,
  type RenderStats,
  type ScreenLayout,
  type Vec2,
  type World,
  type WorldRenderer,
} from '@bv/world';
import type { Editor } from './editor.svelte';

export interface DialogButton {
  label: string;
  kind?: 'primary' | 'danger' | 'default';
  action: () => void;
}

export interface DialogSpec {
  title: string;
  text: string;
  buttons: DialogButton[];
  onclose?: () => void;
}

/** Global state of the app window. */
class AppStore {
  readonly core = getCore();
  ready = $state(false);
  settings = $state<Settings>(defaultSettings());
  layout = $state.raw<Layout | null>(null);
  published = $state.raw<World>(emptyWorld());
  mode = $state<'user' | 'edit'>('user');
  /** Animations paused from the tray. */
  paused = $state(false);
  settingsOpen = $state(false);
  settingsTab = $state('general');
  viewMenuOpen = $state(false);
  /** The user moved the view by hand: the camera stops following the bubbles until Home. */
  cameraTouched = $state(false);
  stats = $state<RenderStats | null>(null);
  toast = $state<{ text: string; error: boolean } | null>(null);
  dialog = $state<DialogSpec | null>(null);
  editor = $state<Editor | null>(null);
  version = $state('');
  wallpaperStatus = $state<'off' | 'live' | 'fallback'>('off');
  /** Window size, to rebuild the layout in windowed mode. */
  viewport = $state({ w: window.innerWidth, h: window.innerHeight });
  renderer: WorldRenderer | null = null;
  private toastTimer = 0;

  get colors(): ThemeColors {
    return themeColors(this.settings.appearance.theme, this.settings.appearance.custom);
  }

  /** Monitors in the coordinates the renderer needs. */
  get screenLayout(): ScreenLayout {
    const l = this.layout;
    if (!l || l.windowed) {
      const dpr = window.devicePixelRatio || 1;
      const rect = { x: 0, y: 0, w: this.viewport.w * dpr, h: this.viewport.h * dpr };
      return {
        monitors: [{ id: 'window', rect, scale: dpr }],
        uiMonitor: 'window',
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

  /** Where the UI goes: the primary monitor's area in CSS pixels (spec §2.1). */
  get uiRect(): PxRect {
    const sl = this.screenLayout;
    const m = sl.monitors.find((x) => x.id === sl.uiMonitor) ?? sl.monitors[0];
    if (!m) return { x: 0, y: 0, w: this.viewport.w, h: this.viewport.h };
    const l = this.layout;
    const work =
      l && !l.windowed && !this.settings.general.coverTaskbar
        ? l.monitors.find((x) => x.id === m.id)?.work
        : null;
    const r = work ?? m.rect;
    return {
      x: (r.x - sl.origin.x) / sl.cssScale,
      y: (r.y - sl.origin.y) / sl.cssScale,
      w: r.w / sl.cssScale,
      h: r.h / sl.cssScale,
    };
  }

  /** Zoom of the UI layer (Scale GUI). */
  get uiScale(): number {
    return this.settings.appearance.uiScale / 100;
  }

  /** A window point (CSS px) in the coordinates of the zoomed UI layer. */
  toUi(p: Vec2): Vec2 {
    const r = this.uiRect;
    const k = this.uiScale;
    return { x: (p.x - r.x) / k, y: (p.y - r.y) / k };
  }

  /** A UI layer point back in window coordinates. */
  fromUi(p: Vec2): Vec2 {
    const r = this.uiRect;
    const k = this.uiScale;
    return { x: r.x + p.x * k, y: r.y + p.y * k };
  }

  /** The world currently shown: the draft in edit mode, else the saved version. */
  get world(): World {
    return this.editor?.world ?? this.published;
  }

  get home(): Camera {
    const h = this.world.homeView;
    return { x: h.x, y: h.y, zoom: h.zoom };
  }

  applyLook(): void {
    const a = this.settings.appearance;
    applyTheme(this.colors, {
      font: a.font,
      radius: a.radius,
      panelOpacity: a.panelOpacity,
      uiScale: a.uiScale,
    });
    setLang(this.settings.general.language);
    configureSounds(this.settings.sounds, (h) => this.core.assetUrl(h));
    const c = this.colors;
    const rgb = (k: keyof ThemeColors) => hexToRgb(c[k]).color;
    const grid = hexToRgb(c.grid);
    const colors: RenderColors = {
      selection: rgb('selection'),
      highlight: rgb('highlight'),
      guide: rgb('guide'),
      grid: grid.color,
      gridAlpha: grid.alpha,
      error: rgb('error'),
    };
    const r = this.renderer;
    if (r) {
      r.setColors(colors);
      const bg = this.settings.background.app;
      void resolveBackground(bg, this.core).then((b) => r.setBackground(b));
      r.setPrefs({ names: this.settings.view.names, skins: this.settings.view.skins });
      r.setLodZoom(this.settings.performance.lodZoom);
      r.setMaxVideos(this.settings.performance.maxVideos);
      r.setFpsLimit(this.settings.performance.appFps);
    }
  }

  async saveSettings(next: Settings): Promise<void> {
    this.settings = next;
    this.applyLook();
    try {
      this.settings = await this.core.setSettings(JSON.parse(JSON.stringify(next)) as Settings);
      this.applyLook();
    } catch (e) {
      this.error(e);
    }
  }

  notify(text: string, error = false): void {
    this.toast = { text, error };
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toast = null), error ? 6000 : 2500);
  }

  /** Shows a core error as a readable message (translated by its code when possible). */
  error(e: unknown): void {
    if (isCoreError(e)) {
      const key = `error.${e.code === 'message' ? e.message : e.code}`;
      const text = tk(key, { path: e.detail ?? '', message: e.message });
      this.notify(text === key ? tk('common.unknownError', { message: e.message }) : text, true);
    } else {
      this.notify(tk('common.unknownError', { message: String(e) }), true);
    }
  }
}

export const store = new AppStore();
