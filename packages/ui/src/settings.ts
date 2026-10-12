/** Settings (spec §7) – mirror of `src-tauri/src/storage/settings.rs`; defaults from §14. */

export interface Shortcut {
  action: string;
  combo: string;
  scope: 'app' | 'global';
  overrideWindows: boolean;
}

export interface Background {
  kind: 'color' | 'gradient' | 'image' | 'video' | 'windows';
  color: string;
  color2: string;
  angle: number;
  asset: string | null;
  stars: boolean;
  parallax: boolean;
  grid: boolean;
}

export interface Settings {
  version: number;
  general: {
    autostart: boolean;
    wallpaper: boolean;
    hideDesktopIcons: boolean;
    language: 'en' | 'cs';
    primaryMonitor: string | null;
    coverTaskbar: boolean;
    closeBehavior: 'tray' | 'quit';
    checkUpdates: boolean;
  };
  appearance: {
    theme: 'light' | 'dark' | 'opikula' | 'custom';
    custom: Record<string, string>;
    uiScale: number;
    font: string;
    radius: number;
    panelOpacity: number;
  };
  shortcuts: Shortcut[];
  performance: {
    appFps: number;
    wallpaperFps: number;
    quality: 'low' | 'medium' | 'high';
    maxVideos: number;
    pauseFullscreen: boolean;
    pauseMaximized: boolean;
    pauseBatterySaver: boolean;
    pauseLocked: boolean;
    lodZoom: number;
    graphicsApi: 'auto' | 'webgpu' | 'webgl';
    showFps: boolean;
  };
  data: { dataDir: string | null; backups: number };
  background: { same: boolean; app: Background; wallpaper: Background };
  sounds: {
    ui: boolean;
    activation: boolean;
    volume: number;
    activationSound: string | null;
    clickSound: string | null;
    muteInFullscreen: boolean;
  };
  search: {
    sortByUsage: boolean;
    /** Global search shows the whole universe with the field, or only the field. */
    globalLook: 'universe' | 'bar';
    animation: SearchAnimation;
  };
  view: {
    names: 'always' | 'hover' | 'never';
    skins: boolean;
    motionPaused: boolean;
    /** `fit`: the camera keeps every shown bubble in view; `home`: the saved home view. */
    camera: 'fit' | 'home';
  };
}

/** How the universe appears with the global search. */
export type SearchAnimation = 'none' | 'fade' | 'zoom' | 'portal' | 'blur';

export const DEFAULT_SHORTCUTS: Shortcut[] = [
  { action: 'toggleApp', combo: 'Ctrl+Alt+B', scope: 'global', overrideWindows: false },
  { action: 'search', combo: 'Ctrl+F', scope: 'app', overrideWindows: false },
  { action: 'globalSearch', combo: 'Alt+Space', scope: 'global', overrideWindows: true },
  { action: 'editMode', combo: 'Ctrl+E', scope: 'app', overrideWindows: false },
  { action: 'save', combo: 'Ctrl+S', scope: 'app', overrideWindows: false },
  { action: 'stopScripts', combo: 'Ctrl+Alt+Shift+S', scope: 'global', overrideWindows: false },
  { action: 'homeView', combo: 'Home', scope: 'app', overrideWindows: false },
];

export function defaultBackground(): Background {
  return {
    kind: 'gradient',
    color: '#0E1220',
    color2: '#1B1030',
    angle: 135,
    asset: null,
    stars: true,
    parallax: true,
    grid: false,
  };
}

export function defaultSettings(): Settings {
  return {
    version: 1,
    general: {
      autostart: true,
      wallpaper: true,
      hideDesktopIcons: false,
      language: 'en',
      primaryMonitor: null,
      coverTaskbar: true,
      closeBehavior: 'tray',
      checkUpdates: true,
    },
    appearance: {
      theme: 'dark',
      custom: {},
      uiScale: 100,
      font: 'Segoe UI Variable Text, Segoe UI, sans-serif',
      radius: 8,
      panelOpacity: 0.94,
    },
    shortcuts: DEFAULT_SHORTCUTS.map((s) => ({ ...s })),
    performance: {
      appFps: 60,
      wallpaperFps: 30,
      quality: 'high',
      maxVideos: 8,
      pauseFullscreen: true,
      pauseMaximized: true,
      pauseBatterySaver: true,
      pauseLocked: true,
      lodZoom: 0.35,
      graphicsApi: 'auto',
      showFps: false,
    },
    data: { dataDir: null, backups: 10 },
    background: { same: true, app: defaultBackground(), wallpaper: defaultBackground() },
    sounds: {
      ui: false,
      activation: false,
      volume: 0.6,
      activationSound: null,
      clickSound: null,
      muteInFullscreen: true,
    },
    search: { sortByUsage: false, globalLook: 'universe', animation: 'zoom' },
    view: { names: 'always', skins: true, motionPaused: false, camera: 'fit' },
  };
}
