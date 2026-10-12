import {
  mapBubbles,
  type Bubble,
  type BubbleId,
  type ScriptSlot,
  type SharedScript,
  type World,
} from '@bv/world';
import { OP } from './generated/catalog';
import { newScript } from './script';

/**
 * Simple actions "Run file" / "Open URL" are shared scripts with parameters (spec §5.3):
 * the script lives once in the library and each bubble keeps only its parameter values.
 */

export const RUN_FILE_SCRIPT = 'builtin.runFile';
export const OPEN_URL_SCRIPT = 'builtin.openUrl';

export type SimpleAction =
  { kind: 'runFile'; path: string; args: string } | { kind: 'openUrl'; url: string };

export function builtinSharedScript(
  id: typeof RUN_FILE_SCRIPT | typeof OPEN_URL_SCRIPT,
): SharedScript {
  if (id === RUN_FILE_SCRIPT) {
    return {
      id,
      name: 'Run file {path}',
      params: [
        { name: 'path', type: 'text', default: '' },
        { name: 'args', type: 'text', default: '' },
      ],
      script: newScript(
        [OP.ev_activate],
        [[OP.sys_run_file, [OP.cb_param, 'path'], [OP.cb_param, 'args'], false, false, false]],
      ),
    };
  }
  return {
    id,
    name: 'Open URL {url}',
    params: [{ name: 'url', type: 'text', default: '' }],
    script: newScript([OP.ev_activate], [[OP.sys_open_url, [OP.cb_param, 'url'], '']]),
  };
}

/** Adds the built-in shared script to the library when it is missing. */
export function ensureBuiltin(
  world: World,
  id: typeof RUN_FILE_SCRIPT | typeof OPEN_URL_SCRIPT,
): World {
  if (world.sharedScripts.some((s) => s.id === id)) return world;
  return { ...world, sharedScripts: [...world.sharedScripts, builtinSharedScript(id)] };
}

/**
 * The simple action of a bubble; `custom` when it has other scripts, `null` when it has none.
 */
export function readSimpleAction(bubble: Bubble): SimpleAction | 'custom' | null {
  if (bubble.scripts.length === 0) return null;
  if (bubble.scripts.length > 1) return 'custom';
  const slot = bubble.scripts[0]!;
  if (slot.kind !== 'shared') return 'custom';
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  if (slot.ref === RUN_FILE_SCRIPT) {
    return { kind: 'runFile', path: str(slot.params.path), args: str(slot.params.args) };
  }
  if (slot.ref === OPEN_URL_SCRIPT) return { kind: 'openUrl', url: str(slot.params.url) };
  return 'custom';
}

/** Sets (or clears with `null`) the simple action of action bubbles. */
export function setSimpleAction(
  world: World,
  ids: Iterable<BubbleId>,
  action: SimpleAction | null,
): World {
  let w = world;
  if (action) w = ensureBuiltin(w, action.kind === 'runFile' ? RUN_FILE_SCRIPT : OPEN_URL_SCRIPT);
  return mapBubbles(w, ids, (b) => {
    if (b.kind !== 'action') return b;
    if (!action) return { ...b, scripts: [] };
    const slot: ScriptSlot =
      action.kind === 'runFile'
        ? {
            kind: 'shared' as const,
            ref: RUN_FILE_SCRIPT,
            params: { path: action.path, args: action.args },
          }
        : { kind: 'shared' as const, ref: OPEN_URL_SCRIPT, params: { url: action.url } };
    return { ...b, scripts: [slot] };
  });
}

/** The file or URL a simple action points to (for the path check and auto icons). */
export function actionTarget(bubble: Bubble): { kind: 'file' | 'url'; value: string } | null {
  const a = readSimpleAction(bubble);
  if (!a || a === 'custom') return null;
  return a.kind === 'runFile' ? { kind: 'file', value: a.path } : { kind: 'url', value: a.url };
}
