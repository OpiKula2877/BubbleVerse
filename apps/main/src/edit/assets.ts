import type { Media, MediaType } from '@bv/world';
import { store } from '../lib/store.svelte';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'ico', 'gif'];
const VIDEO_EXT = ['mp4', 'webm'];

/** Lets the user pick a file and stores it as an asset (spec §9.2). */
export async function pickImageAsset(type: MediaType): Promise<Media | null> {
  const ext = type === 'video' ? VIDEO_EXT : type === 'gif' ? ['gif', 'webp'] : IMAGE_EXT;
  const path = await store.core.pickFile([{ name: type, extensions: ext }]);
  if (!path) return null;
  try {
    const info = await store.core.importAsset(path);
    const kind: MediaType = type === 'image' && info.animated ? 'gif' : type;
    store.renderer?.refreshTextures();
    return { type: kind, asset: info.hash };
  } catch (e) {
    store.error(e);
    return null;
  }
}
