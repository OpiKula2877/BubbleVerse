import {
  packBranch,
  packWorld,
  PACKAGE_FORMAT,
  type PackageData,
  type PackageManifest,
} from '@bv/blocks';
import { t, tk } from '@bv/ui';
import type { BubbleId, World } from '@bv/world';
import { store } from './store.svelte';

/** Export and import of `.bubble` packages (spec §9.4). */

const FILTERS = [{ name: 'BubbleVerse', extensions: ['bubble'] }];

export interface LoadedPackage {
  manifest: PackageManifest;
  data: PackageData;
}

function fileName(name: string): string {
  const clean = name.replace(/[\\/:*?"<>|]+/g, ' ').trim();
  return `${clean || 'BubbleVerse'}.bubble`;
}

async function write(name: string, root: BubbleId | null, data: PackageData): Promise<void> {
  const path = await store.core.saveFile(fileName(name), FILTERS);
  if (!path) return;
  const manifest: PackageManifest = {
    format: PACKAGE_FORMAT,
    app: store.version,
    name,
    root,
    bubbles: data.bubbles.length,
    created: Date.now(),
  };
  try {
    await store.core.call('export_package', { path, manifest, branch: data });
    store.notify(tk('package.exported', { n: data.bubbles.length }));
  } catch (e) {
    store.error(e);
  }
}

/** Right click on a bubble → Export… (the whole branch). */
export async function exportBranch(world: World, rootId: BubbleId): Promise<void> {
  const root = world.bubbles.find((b) => b.id === rootId);
  if (!root) return;
  await write(root.name, rootId, packBranch(world, rootId));
}

/** Settings → Data → Export the world. */
export async function exportWorld(world: World): Promise<void> {
  await write(t('package.worldName'), null, packWorld(world));
}

/** Replaces asset hashes that changed in this store (never in practice: assets keep their hash). */
function renameAssets<T>(value: T, renamed: Record<string, string>): T {
  if (!Object.keys(renamed).length) return value;
  const json = JSON.stringify(value, (_k, v: unknown) =>
    typeof v === 'string' && v in renamed ? renamed[v] : v,
  );
  return JSON.parse(json) as T;
}

/** Asks for a `.bubble` file and reads it; `null` when cancelled or unreadable. */
export async function pickPackage(): Promise<LoadedPackage | null> {
  const path = await store.core.pickFile(FILTERS);
  return path ? readPackage(path) : null;
}

/** Reads a `.bubble` file; `null` when it cannot be read (the error is shown). */
export async function readPackage(path: string): Promise<LoadedPackage | null> {
  try {
    const r = await store.core.call<{
      manifest: PackageManifest;
      branch: PackageData;
      renamed: Record<string, string>;
    }>('import_package', { path });
    const data = renameAssets(r.branch, r.renamed);
    return {
      manifest: r.manifest,
      data: {
        bubbles: data.bubbles ?? [],
        sharedScripts: data.sharedScripts ?? [],
        customBlocks: data.customBlocks ?? [],
        globals: data.globals ?? [],
        templates: data.templates ?? [],
        ...(data.homeView ? { homeView: data.homeView } : {}),
      },
    };
  } catch (e) {
    store.error(e);
    return null;
  }
}

/** A `.bubble` file opened from Explorer: the import preview in edit mode (spec §9.4). */
export async function openPackageFile(path: string): Promise<void> {
  const pkg = await readPackage(path);
  if (!pkg) return;
  if (!store.editor) (await import('./actions')).enterEdit();
  if (store.editor) store.editor.modal = { kind: 'import', pkg, parentId: null };
}
