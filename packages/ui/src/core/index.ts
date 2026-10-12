import { MockCore } from './mock';
import { TauriCore } from './tauri';
import type { Core } from './types';

export * from './types';
export { MockCore } from './mock';

let instance: Core | null = null;

/** The core API: Tauri IPC inside the app, a localStorage mock in a plain browser. */
export function getCore(): Core {
  if (!instance) {
    instance = '__TAURI_INTERNALS__' in window ? new TauriCore() : new MockCore();
  }
  return instance;
}
