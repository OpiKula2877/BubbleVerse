import type { Value, World } from '@bv/world';
import type { Settings } from '../settings';

/** Types exchanged with the Rust core over IPC (spec §8.4). */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MonitorInfo {
  id: string;
  /** Physical pixels of the virtual desktop. */
  rect: Rect;
  work: Rect;
  scale: number;
  primary: boolean;
}

export interface Layout {
  monitors: MonitorInfo[];
  uiMonitor: string;
  /** The virtual desktop = the app window, physical pixels. */
  origin: Rect;
  /** WebView rasterization scale (CSS px → physical px). */
  cssScale: number;
  windowed: boolean;
}

export interface WorldDoc {
  world: World;
  updatedAt: number;
}

export interface Bootstrap {
  window: string;
  version: string;
  settings: Settings;
  layout: Layout;
  published: World;
  draft: WorldDoc | null;
  paused: boolean;
  dbDamaged: boolean;
}

export interface AssetInfo {
  hash: string;
  ext: string;
  width: number;
  height: number;
  animated: boolean;
  bytes: number;
  warning: string | null;
}

export interface CoreError {
  code: string;
  message: string;
  detail: string | null;
}

export type ScriptFx =
  | { kind: 'activated'; bubble: string }
  | { kind: 'running'; bubble: string; on: boolean }
  | { kind: 'error'; bubble: string }
  | { kind: 'glow'; bubble: string }
  | { kind: 'say'; bubble: string; text: string; seconds: number }
  | { kind: 'change'; bubble: string; prop: 'color' | 'skin' | 'size'; value: Value }
  | { kind: 'visibility'; bubble: string; visible: boolean }
  | { kind: 'move'; bubble: string; x: number; y: number };

export interface LogEntry {
  at: number;
  level: 'info' | 'error';
  bubble: string;
  path: string;
  /** `null` for a test run from the editor. */
  slot: number | null;
  task: number | null;
  block: string | null;
  node: number | null;
  text: string;
  /** Error code for a translated message (`error.<code>`). */
  code: string | null;
  detail: string | null;
}

/** The running block of a traced script (spec §5.5); `node: null` = the task ended. */
export interface TraceEvent {
  bubble: string;
  slot: number | null;
  task: number;
  node: number | null;
  /** Waiting for the next step. */
  paused: boolean;
}

export interface RunningScript {
  id: number;
  bubble: string;
  path: string;
  /** `null` for a test run from the editor. */
  slot: number | null;
  started: number;
}

export interface BackupInfo {
  file: string;
  at: number;
  size: number;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface CoreEvents {
  'world-published': World;
  settings: Settings;
  layout: Layout;
  pause: boolean;
  fx: ScriptFx;
  log: LogEntry;
  trace: TraceEvent;
  /** The settings tab to show, if any. */
  'open-settings': string | null;
  shortcut: string;
  search: string;
  'wallpaper-status': 'off' | 'live' | 'fallback';
  autopause: { paused: boolean; signals?: { fullscreen: boolean } };
}

export type Unsubscribe = () => void;

/** The API of the core as seen from a window. */
export interface Core {
  readonly isTauri: boolean;
  bootstrap(): Promise<Bootstrap>;
  saveDraft(world: World): Promise<number>;
  discardDraft(): Promise<void>;
  publish(world: World): Promise<number>;
  getSettings(): Promise<Settings>;
  setSettings(settings: Settings): Promise<Settings>;
  getLayout(): Promise<Layout>;
  activate(id: string): Promise<number>;
  importAsset(path: string): Promise<AssetInfo>;
  checkTargets(targets: string[]): Promise<boolean[]>;
  pickFile(filters?: FileFilter[]): Promise<string | null>;
  pickFiles(filters?: FileFilter[]): Promise<string[]>;
  pickFolder(): Promise<string | null>;
  /** Save dialog; `null` when cancelled. */
  saveFile(defaultName: string, filters?: FileFilter[]): Promise<string | null>;
  assetUrl(hash: string): string;
  hideMain(): Promise<void>;
  quit(): Promise<void>;
  setPaused(paused: boolean): Promise<void>;
  runningScripts(): Promise<RunningScript[]>;
  stopScript(id: number): Promise<void>;
  stopAllScripts(): Promise<void>;
  searchHistory(): Promise<string[]>;
  pushHistory(text: string): Promise<void>;
  usageCounts(): Promise<Record<string, number>>;
  listBackups(): Promise<BackupInfo[]>;
  restoreBackup(file: string): Promise<void>;
  runAction(action: string): Promise<void>;
  /** Any other command (added in later phases). */
  call<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  on<K extends keyof CoreEvents>(event: K, cb: (payload: CoreEvents[K]) => void): Unsubscribe;
}

export function isCoreError(e: unknown): e is CoreError {
  return typeof e === 'object' && e !== null && 'code' in e && 'message' in e;
}
