import { Container, Sprite, Texture } from 'pixi.js';
import { rng } from './links';
import { SpritePool } from './sprite-pool';
import type { Camera, Viewport } from './viewports';
import { visibleWorld } from './viewports';

/**
 * The world background (spec §7.6): a color, gradient, image, video or the Windows wallpaper,
 * with animated stars, parallax (the background moves slower than the bubbles) and a grid.
 * Stars live on a far plane in screen pixels, so zooming does not change them.
 */

export interface BackgroundLook {
  kind: string;
  color: string;
  color2: string;
  angle: number;
  /** Image or video asset (also the Windows wallpaper, as an image). */
  asset?: string | null;
  stars?: boolean;
  parallax?: boolean;
  grid?: boolean;
}

/** Size of a star tile in CSS pixels. */
const TILE = 256;
const STARS_PER_TILE = 7;
/** The far plane moves this much of the camera movement. */
const PARALLAX = 0.15;
/** Image and video backgrounds may shift this part of their size. */
const MEDIA_SHIFT = 0.05;

export function starsInTile(
  tx: number,
  ty: number,
): { x: number; y: number; r: number; a: number; p: number }[] {
  const next = rng((tx * 73856093) ^ (ty * 19349663));
  return Array.from({ length: STARS_PER_TILE }, () => ({
    x: next() * TILE,
    y: next() * TILE,
    r: 0.5 + next() * 1.1,
    a: 0.25 + next() * 0.65,
    p: next() * Math.PI * 2,
  }));
}

function gradientTexture(look: BackgroundLook): Texture {
  const el = document.createElement('canvas');
  el.width = 256;
  el.height = 256;
  const ctx = el.getContext('2d');
  if (ctx) {
    if (look.kind === 'gradient') {
      const a = (look.angle * Math.PI) / 180;
      const dx = Math.cos(a) * 128;
      const dy = Math.sin(a) * 128;
      const g = ctx.createLinearGradient(128 - dx, 128 - dy, 128 + dx, 128 + dy);
      g.addColorStop(0, look.color);
      g.addColorStop(1, look.color2);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = look.color;
    }
    ctx.fillRect(0, 0, 256, 256);
  }
  return Texture.from(el);
}

export class WorldBackground {
  /** Screen space: the base (color, image, video) and the stars. */
  readonly screen = new Container();
  /** World space: the grid. */
  readonly world: SpritePool;
  private base = new Sprite();
  private media = new Sprite();
  private stars = new SpritePool();
  private look: BackgroundLook = { kind: 'color', color: '#0E1220', color2: '#0E1220', angle: 0 };
  private video: HTMLVideoElement | null = null;
  private lastVideoFrame = -1;
  private mediaW = 1;
  private mediaH = 1;

  constructor(
    private readonly assetUrl: (hash: string) => string,
    private readonly onReady: () => void,
  ) {
    this.world = new SpritePool();
    this.media.visible = false;
    this.screen.addChild(this.base, this.media, this.stars.layer);
  }

  set(look: BackgroundLook): void {
    this.look = look;
    this.base.texture = gradientTexture(look);
    this.stopVideo();
    this.media.visible = false;
    const url = look.asset ? this.assetUrl(look.asset) : '';
    if (!url || (look.kind !== 'image' && look.kind !== 'video' && look.kind !== 'windows')) return;
    if (look.kind === 'video') {
      const v = document.createElement('video');
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.crossOrigin = 'anonymous';
      v.onloadeddata = () => {
        this.mediaW = v.videoWidth || 1;
        this.mediaH = v.videoHeight || 1;
        this.media.texture = Texture.from(v);
        this.media.visible = true;
        this.onReady();
      };
      v.src = url;
      this.video = v;
    } else {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (this.look !== look) return;
        this.mediaW = img.naturalWidth || 1;
        this.mediaH = img.naturalHeight || 1;
        this.media.texture = Texture.from(img);
        this.media.visible = true;
        this.onReady();
      };
      img.src = url;
    }
  }

  private stopVideo(): void {
    if (!this.video) return;
    this.video.pause();
    this.video.removeAttribute('src');
    this.video = null;
  }

  get hasVideo(): boolean {
    return this.look.kind === 'video' && !!this.video;
  }

  /** Needs frames by itself: twinkling stars or a playing video (only while motion runs). */
  animated(motion: boolean): boolean {
    return motion && (!!this.look.stars || (this.look.kind === 'video' && !!this.video));
  }

  /** Starts or pauses the video background. */
  setPlaying(on: boolean): void {
    const v = this.video;
    if (!v) return;
    if (on && v.paused) void v.play().catch(() => {});
    else if (!on && !v.paused) v.pause();
  }

  /** Positions everything for one viewport (one monitor) before it is drawn. */
  drawPass(vp: Viewport, cam: Camera, nowS: number, motion: boolean): void {
    const { css } = vp;
    this.base.position.set(css.x, css.y);
    this.base.width = css.w;
    this.base.height = css.h;
    const par = this.look.parallax ? PARALLAX : 0;

    if (this.media.visible) {
      // Cover the monitor, a bit larger so the parallax shift never shows an edge.
      const scale = Math.max(css.w / this.mediaW, css.h / this.mediaH) * (1 + MEDIA_SHIFT * 2);
      const w = this.mediaW * scale;
      const h = this.mediaH * scale;
      const sx = par ? Math.tanh((cam.x * vp.k * par) / css.w) : 0;
      const sy = par ? Math.tanh((cam.y * vp.k * par) / css.h) : 0;
      this.media.width = w;
      this.media.height = h;
      this.media.position.set(
        css.x + (css.w - w) / 2 - sx * MEDIA_SHIFT * w,
        css.y + (css.h - h) / 2 - sy * MEDIA_SHIFT * h,
      );
      if (this.video && motion) {
        const frame = Math.floor(this.video.currentTime * 30);
        if (frame !== this.lastVideoFrame) {
          this.lastVideoFrame = frame;
          this.media.texture.source.update();
        }
      }
    }

    const stars = this.stars;
    stars.begin();
    if (this.look.stars) {
      const ox = cam.x * vp.k * par;
      const oy = cam.y * vp.k * par;
      const t0x = Math.floor((css.x + ox) / TILE);
      const t1x = Math.floor((css.x + css.w + ox) / TILE);
      const t0y = Math.floor((css.y + oy) / TILE);
      const t1y = Math.floor((css.y + css.h + oy) / TILE);
      for (let ty = t0y; ty <= t1y; ty++) {
        for (let tx = t0x; tx <= t1x; tx++) {
          for (const s of starsInTile(tx, ty)) {
            const x = tx * TILE + s.x - ox;
            const y = ty * TILE + s.y - oy;
            if (x < css.x || x > css.x + css.w || y < css.y || y > css.y + css.h) continue;
            const tw = motion ? 0.65 + 0.35 * Math.sin(nowS * 1.3 + s.p) : 1;
            stars.dot(x, y, s.r, 0xffffff, s.a * tw);
          }
        }
      }
    }
    stars.end();

    const grid = this.world;
    grid.begin();
    if (this.look.grid) {
      // About every 60–300 CSS pixels: 1, 5, 25… world units times 100.
      let step = 100;
      while (step * vp.k < 60) step *= 5;
      while (step * vp.k > 300) step /= 5;
      const w = visibleWorld(vp);
      const px = 1 / vp.k;
      for (let x = Math.ceil(w.x / step) * step; x <= w.x + w.w; x += step) {
        grid.segment(x, w.y, x, w.y + w.h, px, 0xffffff, 0.05);
      }
      for (let y = Math.ceil(w.y / step) * step; y <= w.y + w.h; y += step) {
        grid.segment(w.x, y, w.x + w.w, y, px, 0xffffff, 0.05);
      }
    }
    grid.end();
  }

  destroy(): void {
    this.stopVideo();
  }
}
