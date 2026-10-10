import type { Core } from './core/types';
import type { Background } from './settings';

/**
 * The world background as the renderer needs it (spec §7.6). "Windows wallpaper" becomes an
 * image asset of the user's wallpaper, looked up once per window.
 */
let windowsAsset: Promise<string | null> | null = null;

export async function resolveBackground(bg: Background, core: Core): Promise<Background> {
  if (bg.kind !== 'windows') return bg;
  if (!core.isTauri) return { ...bg, kind: 'gradient' };
  windowsAsset ??= core
    .call<{ hash: string } | null>('windows_wallpaper_asset')
    .then((info) => info?.hash ?? null)
    .catch(() => null);
  return { ...bg, asset: await windowsAsset };
}
