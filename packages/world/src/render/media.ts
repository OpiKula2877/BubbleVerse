import { Texture } from 'pixi.js';
import type { Skin } from '../model/types';
import { drawBody, TEX, type MediaLoader } from './textures';

/**
 * Animated media of skins (spec §10.1): a GIF (stored as animated WebP) is decoded once in
 * the background into frames; a video plays in one hidden element. Every asset has one
 * playback, drawn into one texture per look (shape, fill, edge) that all bubbles with that
 * look share. Media nobody sees is not drawn and videos pause; at most N videos play.
 */

/** Frames kept of one GIF (longer ones are cut). */
const MAX_FRAMES = 240;
/** Videos are drawn at most this often. */
const VIDEO_FPS = 30;

interface Frame {
  image: ImageBitmap;
  /** Milliseconds. */
  duration: number;
}

interface Playback {
  kind: 'gif' | 'video';
  frames: Frame[];
  total: number;
  video: HTMLVideoElement | null;
  ready: boolean;
  w: number;
  h: number;
}

interface Look {
  skin: Skin;
  canvas: HTMLCanvasElement;
  texture: Texture;
  hash: string;
  /** Frame drawn last (GIF index or video time). */
  drawn: number;
  /** Seen in the current frame. */
  visible: boolean;
}

export function animatedHash(skin: Skin): { kind: 'gif' | 'video'; hash: string } | null {
  const m = skin.media;
  if (m && (m.type === 'gif' || m.type === 'video') && m.asset)
    return { kind: m.type, hash: m.asset };
  return null;
}

function lookKey(skin: Skin, hash: string): string {
  return JSON.stringify([
    hash,
    skin.shape,
    skin.fill,
    skin.edge ?? null,
    Math.round(skin.size / 8),
  ]);
}

export class AnimatedMedia {
  private playbacks = new Map<string, Playback>();
  private looks = new Map<string, Look>();
  private maxVideos = 8;

  constructor(
    private readonly assetUrl: MediaLoader,
    private readonly onReady: () => void,
  ) {}

  setMaxVideos(n: number): void {
    this.maxVideos = Math.max(0, Math.round(n));
  }

  private load(kind: 'gif' | 'video', hash: string): Playback {
    const existing = this.playbacks.get(hash);
    if (existing) return existing;
    const p: Playback = { kind, frames: [], total: 0, video: null, ready: false, w: 1, h: 1 };
    this.playbacks.set(hash, p);
    const url = this.assetUrl(hash);
    if (!url) return p;
    if (kind === 'video') {
      const v = document.createElement('video');
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.crossOrigin = 'anonymous';
      v.onloadeddata = () => {
        p.w = v.videoWidth || 1;
        p.h = v.videoHeight || 1;
        p.ready = true;
        this.onReady();
      };
      v.src = url;
      p.video = v;
    } else {
      void this.decodeGif(url, p);
    }
    return p;
  }

  /** Decodes all frames once, in the background (spec §10.1). */
  private async decodeGif(url: string, p: Playback): Promise<void> {
    try {
      const data = await (await fetch(url)).arrayBuffer();
      const decoder = new ImageDecoder({ data, type: 'image/webp' });
      await decoder.tracks.ready;
      const count = Math.min(MAX_FRAMES, decoder.tracks.selectedTrack?.frameCount ?? 1);
      for (let i = 0; i < count; i++) {
        const { image } = await decoder.decode({ frameIndex: i });
        const duration = Math.max(20, (image.duration ?? 100_000) / 1000);
        const scale = Math.min(1, TEX / Math.max(image.displayWidth, image.displayHeight));
        const bitmap = await createImageBitmap(image, {
          resizeWidth: Math.max(1, Math.round(image.displayWidth * scale)),
          resizeHeight: Math.max(1, Math.round(image.displayHeight * scale)),
        });
        p.w = image.displayWidth;
        p.h = image.displayHeight;
        image.close();
        p.frames.push({ image: bitmap, duration });
        p.total += duration;
      }
      decoder.close();
      p.ready = p.frames.length > 0;
      if (p.ready) this.onReady();
    } catch {
      p.ready = false;
    }
  }

  /** The shared texture of a skin with a GIF or video; `null` until its first frame is there. */
  texture(skin: Skin): Texture | null {
    const a = animatedHash(skin);
    if (!a) return null;
    const p = this.load(a.kind, a.hash);
    if (!p.ready) return null;
    const key = lookKey(skin, a.hash);
    let look = this.looks.get(key);
    if (!look) {
      const canvas = document.createElement('canvas');
      canvas.width = TEX;
      canvas.height = TEX;
      look = {
        skin,
        canvas,
        texture: Texture.from(canvas),
        hash: a.hash,
        drawn: -1,
        visible: false,
      };
      this.looks.set(key, look);
      this.draw(look, p, 0);
    }
    look.visible = true;
    return look.texture;
  }

  private draw(look: Look, p: Playback, nowMs: number): boolean {
    const ctx = look.canvas.getContext('2d');
    if (!ctx) return false;
    let source: CanvasImageSource | null = null;
    let stamp = 0;
    if (p.kind === 'gif') {
      let t = p.total ? nowMs % p.total : 0;
      let i = 0;
      while (i < p.frames.length - 1 && t >= p.frames[i]!.duration) {
        t -= p.frames[i]!.duration;
        i++;
      }
      stamp = i;
      source = p.frames[i]?.image ?? null;
    } else if (p.video) {
      stamp = Math.floor(p.video.currentTime * VIDEO_FPS);
      source = p.video;
    }
    if (!source || stamp === look.drawn) return false;
    look.drawn = stamp;
    ctx.clearRect(0, 0, TEX, TEX);
    const s = look.skin;
    drawBody(ctx, {
      shape: s.shape,
      fill: s.fill,
      outline: s.edge?.outline,
      shadow: s.edge?.shadow,
      glow: s.edge?.glow,
      glass: s.edge?.glass,
      media: { kind: 'image', img: source, w: p.w, h: p.h },
      size: s.size,
    });
    look.texture.source.update();
    return true;
  }

  /**
   * Advances playback for the looks used in this frame (call `texture` for them first) and
   * starts or pauses videos. Returns true while something animates.
   */
  tick(nowMs: number): boolean {
    let animating = false;
    const wanted = new Set<string>();
    for (const look of this.looks.values()) {
      if (!look.visible) continue;
      const p = this.playbacks.get(look.hash);
      if (!p?.ready) continue;
      if (p.kind === 'video') wanted.add(look.hash);
      else if (p.frames.length > 1) animating = true;
    }
    // Videos: the first N visible ones play, the others show their current frame.
    let playing = 0;
    for (const [hash, p] of this.playbacks) {
      const v = p.video;
      if (!v) continue;
      const play = wanted.has(hash) && playing < this.maxVideos;
      if (play) {
        playing++;
        animating = true;
        if (v.paused) void v.play().catch(() => {});
      } else if (!v.paused) {
        v.pause();
      }
    }
    for (const look of this.looks.values()) {
      if (!look.visible) continue;
      const p = this.playbacks.get(look.hash);
      if (p?.ready) this.draw(look, p, nowMs);
      look.visible = false;
    }
    return animating;
  }

  destroy(): void {
    for (const p of this.playbacks.values()) {
      p.video?.pause();
      p.video?.removeAttribute('src');
      for (const f of p.frames) f.image.close();
    }
    for (const l of this.looks.values()) l.texture.destroy(true);
    this.playbacks.clear();
    this.looks.clear();
  }
}
