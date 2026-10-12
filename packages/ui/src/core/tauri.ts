import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import type { World } from '@bv/world';
import type { Settings } from '../settings';
import type {
  AssetInfo,
  BackupInfo,
  Bootstrap,
  Core,
  CoreEvents,
  FileFilter,
  Layout,
  RunningScript,
  Unsubscribe,
} from './types';

/** Core API over Tauri IPC. */
export class TauriCore implements Core {
  readonly isTauri = true;

  call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    return invoke<T>(command, args);
  }

  bootstrap() {
    return this.call<Bootstrap>('bootstrap');
  }
  saveDraft(world: World) {
    return this.call<number>('save_draft', { world });
  }
  discardDraft() {
    return this.call<void>('discard_draft');
  }
  publish(world: World) {
    return this.call<number>('publish', { world });
  }
  getSettings() {
    return this.call<Settings>('get_settings');
  }
  setSettings(settings: Settings) {
    return this.call<Settings>('set_settings', { settings });
  }
  getLayout() {
    return this.call<Layout>('get_layout');
  }
  activate(id: string) {
    return this.call<number>('activate', { id });
  }
  importAsset(path: string) {
    return this.call<AssetInfo>('import_asset', { path });
  }
  checkTargets(targets: string[]) {
    return this.call<boolean[]>('check_targets', { targets });
  }
  async pickFile(filters?: FileFilter[]) {
    const r = await open({ multiple: false, directory: false, filters });
    return typeof r === 'string' ? r : null;
  }
  async pickFiles(filters?: FileFilter[]) {
    const r = await open({ multiple: true, directory: false, filters });
    return Array.isArray(r) ? r : r ? [r] : [];
  }
  async saveFile(defaultName: string, filters?: FileFilter[]) {
    return (await save({ defaultPath: defaultName, filters })) ?? null;
  }
  async pickFolder() {
    const r = await open({ multiple: false, directory: true });
    return typeof r === 'string' ? r : null;
  }
  assetUrl(hash: string) {
    return convertFileSrc(hash, 'bvasset');
  }
  hideMain() {
    return this.call<void>('hide_main');
  }
  quit() {
    return this.call<void>('quit');
  }
  setPaused(paused: boolean) {
    return this.call<void>('set_paused', { paused });
  }
  runningScripts() {
    return this.call<RunningScript[]>('running_scripts');
  }
  stopScript(id: number) {
    return this.call<void>('stop_script', { id });
  }
  stopAllScripts() {
    return this.call<void>('stop_all_scripts');
  }
  searchHistory() {
    return this.call<string[]>('search_history');
  }
  pushHistory(text: string) {
    return this.call<void>('push_history', { text });
  }
  usageCounts() {
    return this.call<Record<string, number>>('usage_counts');
  }
  listBackups() {
    return this.call<BackupInfo[]>('list_backups');
  }
  restoreBackup(file: string) {
    return this.call<void>('restore_backup', { file });
  }
  runAction(action: string) {
    return this.call<void>('run_action', { action });
  }

  on<K extends keyof CoreEvents>(event: K, cb: (payload: CoreEvents[K]) => void): Unsubscribe {
    let off: (() => void) | null = null;
    let cancelled = false;
    void listen<CoreEvents[K]>(`bv://${event}`, (e) => cb(e.payload)).then((u) => {
      if (cancelled) u();
      else off = u;
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }
}
