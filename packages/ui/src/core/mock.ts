import { emptyWorld, type World } from '@bv/world';
import { defaultSettings, type Settings } from '../settings';
import type {
  AssetInfo,
  Bootstrap,
  Core,
  CoreEvents,
  Layout,
  Unsubscribe,
  WorldDoc,
} from './types';

/**
 * Browser stand-in for the core, so the UI can be developed and tested with `pnpm dev`
 * in a normal browser. Data lives in localStorage; nothing is launched.
 */
export class MockCore implements Core {
  readonly isTauri = false;
  private listeners = new Map<string, Set<(p: unknown) => void>>();
  private assets = new Map<string, string>();
  private pending = new Map<string, { info: AssetInfo; url: string }>();

  constructor(private readonly prefix = 'bv.mock.') {
    try {
      const saved = localStorage.getItem(this.prefix + 'assets');
      if (saved)
        for (const [k, v] of Object.entries(JSON.parse(saved))) this.assets.set(k, String(v));
    } catch {
      /* storage unavailable */
    }
  }

  private load<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(this.prefix + key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private store(key: string, value: unknown): void {
    try {
      if (value === null) localStorage.removeItem(this.prefix + key);
      else localStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch {
      /* quota or private mode */
    }
  }

  private emit<K extends keyof CoreEvents>(event: K, payload: CoreEvents[K]): void {
    for (const cb of this.listeners.get(event) ?? []) cb(payload);
  }

  layoutNow(): Layout {
    const dpr = window.devicePixelRatio || 1;
    const rect = {
      x: 0,
      y: 0,
      w: Math.round(window.innerWidth * dpr),
      h: Math.round(window.innerHeight * dpr),
    };
    return {
      monitors: [{ id: 'mock', rect, work: rect, scale: dpr, primary: true }],
      uiMonitor: 'mock',
      origin: rect,
      cssScale: dpr,
      windowed: true,
    };
  }

  async call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    console.info('[mock core]', command, args);
    return undefined as T;
  }

  async bootstrap(): Promise<Bootstrap> {
    return {
      window: new URLSearchParams(location.search).get('window') ?? 'main',
      version: 'dev',
      settings: await this.getSettings(),
      layout: this.layoutNow(),
      published: this.load<World>('published', emptyWorld()),
      draft: this.load<WorldDoc | null>('draft', null),
      paused: false,
      dbDamaged: false,
    };
  }

  async saveDraft(world: World) {
    const updatedAt = Date.now();
    this.store('draft', { world, updatedAt });
    return updatedAt;
  }

  async discardDraft() {
    this.store('draft', null);
  }

  async publish(world: World) {
    this.store('published', world);
    this.store('draft', null);
    this.emit('world-published', world);
    return Date.now();
  }

  async getSettings(): Promise<Settings> {
    const d = defaultSettings();
    const s = this.load<Partial<Settings>>('settings', {});
    return {
      ...d,
      ...s,
      general: { ...d.general, ...s.general },
      appearance: { ...d.appearance, ...s.appearance },
    };
  }

  async setSettings(settings: Settings) {
    this.store('settings', settings);
    this.emit('settings', settings);
    return settings;
  }

  async getLayout() {
    return this.layoutNow();
  }

  async activate(id: string) {
    console.info('[mock core] activate', id);
    this.emit('fx', { kind: 'activated', bubble: id });
    return 1;
  }

  async importAsset(path: string): Promise<AssetInfo> {
    const p = this.pending.get(path);
    if (!p) throw { code: 'fileNotFound', message: `file not found: ${path}`, detail: path };
    this.assets.set(p.info.hash, p.url);
    this.store('assets', Object.fromEntries(this.assets));
    return p.info;
  }

  async checkTargets(targets: string[]) {
    return targets.map((t) => t.trim().length > 0);
  }

  private pickWithInput(accept: string, multiple: boolean): Promise<string[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.multiple = multiple;
      input.onchange = async () => {
        const out: string[] = [];
        for (const file of Array.from(input.files ?? [])) {
          const url = await new Promise<string>((r) => {
            const fr = new FileReader();
            fr.onload = () => r(String(fr.result));
            fr.readAsDataURL(file);
          });
          const hash = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
            b.toString(16).padStart(2, '0'),
          ).join('');
          const path = `C:\\mock\\${file.name}`;
          const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
          this.pending.set(path, {
            url,
            info: {
              hash,
              ext,
              width: 0,
              height: 0,
              animated: ext === 'gif',
              bytes: file.size,
              warning: null,
            },
          });
          out.push(path);
        }
        resolve(out);
      };
      input.click();
    });
  }

  async pickFile(filters?: { name: string; extensions: string[] }[]) {
    const accept = filters?.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(',') ?? '';
    return (await this.pickWithInput(accept, false))[0] ?? null;
  }

  async pickFiles(filters?: { name: string; extensions: string[] }[]) {
    const accept = filters?.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(',') ?? '';
    return this.pickWithInput(accept, true);
  }

  async saveFile(defaultName: string) {
    return window.prompt('Save as', defaultName);
  }
  async pickFolder() {
    return 'C:\\mock\\folder';
  }

  assetUrl(hash: string) {
    return this.assets.get(hash) ?? '';
  }

  async hideMain() {}
  async quit() {}
  async setPaused(paused: boolean) {
    this.emit('pause', paused);
  }
  async runningScripts() {
    return [];
  }
  async stopScript() {}
  async stopAllScripts() {}

  async searchHistory() {
    return this.load<string[]>('history', []);
  }

  async pushHistory(text: string) {
    const h = (await this.searchHistory()).filter((x) => x !== text);
    this.store('history', [text, ...h].slice(0, 50));
  }

  async usageCounts() {
    return {};
  }

  async listBackups() {
    return [];
  }

  async restoreBackup() {}

  async runAction(action: string) {
    this.emit('shortcut', action);
  }

  on<K extends keyof CoreEvents>(event: K, cb: (payload: CoreEvents[K]) => void): Unsubscribe {
    const set = this.listeners.get(event) ?? new Set();
    set.add(cb as (p: unknown) => void);
    this.listeners.set(event, set);
    return () => set.delete(cb as (p: unknown) => void);
  }
}
