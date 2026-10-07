import { Texture } from 'pixi.js';
import type { Fill, Shape, Skin } from '../model/types';

/**
 * Bubble skins are pre-drawn with Canvas 2D into shared textures (shape, fill, outline, shadow,
 * image or icon), so the GPU only draws batched sprites (spec §10.1). Bubbles with the same
 * look share one texture.
 */

/** Pixel size of skin textures; the shape takes `1 / PAD` of it, the rest is room for effects. */
export const TEX = 256;
export const PAD = 1.5;
/** Radius of the shape inside a texture, in texture pixels. */
export const SHAPE_R = TEX / PAD / 2;

export type MediaLoader = (hash: string) => string;

function shapeKey(shape: Shape): string {
  return typeof shape === 'string' ? shape : `mask:${shape.mask}`;
}

function fillKey(fill: Fill): string {
  return typeof fill === 'string' ? fill : JSON.stringify(fill);
}

/** Traces a shape path centered at (c, c) with radius r. */
export function tracePath(ctx: CanvasRenderingContext2D, shape: Shape, c: number, r: number): void {
  ctx.beginPath();
  if (shape === 'rounded') {
    const s = r * 0.9;
    ctx.roundRect(c - s, c - s, s * 2, s * 2, s * 0.32);
  } else if (shape === 'hexagon') {
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      const x = c + r * Math.cos(a);
      const y = c + r * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else if (shape === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r : r * 0.48;
      const x = c + rr * Math.cos(a);
      const y = c + rr * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else {
    ctx.arc(c, c, r, 0, Math.PI * 2);
  }
}

function fillStyle(
  ctx: CanvasRenderingContext2D,
  fill: Fill,
  c: number,
  r: number,
): string | CanvasGradient {
  if (typeof fill === 'string') return fill;
  let g: CanvasGradient;
  if (fill.type === 'radial') {
    g = ctx.createRadialGradient(c - r * 0.3, c - r * 0.3, r * 0.05, c, c, r);
  } else {
    const a = (fill.angle * Math.PI) / 180;
    const dx = Math.cos(a) * r;
    const dy = Math.sin(a) * r;
    g = ctx.createLinearGradient(c - dx, c - dy, c + dx, c + dy);
  }
  for (const s of fill.stops) g.addColorStop(Math.min(1, Math.max(0, s.at)), s.color);
  return g;
}

function canvas(size = TEX): HTMLCanvasElement {
  const el = document.createElement('canvas');
  el.width = size;
  el.height = size;
  return el;
}

export interface BodyLook {
  shape: Shape;
  fill: Fill;
  outline?: { color: string; width: number };
  shadow?: { color: string; blur: number; offset: { x: number; y: number } };
  /** Image covering the shape, or an icon drawn smaller inside it. */
  media?: { kind: 'image' | 'icon'; img: CanvasImageSource; w: number; h: number };
  /** Custom shape mask image (alpha), for `{ mask }` shapes. */
  mask?: CanvasImageSource;
  /** Width of a skin size unit in texture pixels when drawn at `size` (keeps outlines even). */
  size: number;
}

/** Draws a bubble body into a 2D context of size TEX. */
export function drawBody(ctx: CanvasRenderingContext2D, look: BodyLook): void {
  const c = TEX / 2;
  const r = SHAPE_R;
  const unit = (SHAPE_R * 2) / Math.max(1, look.size);
  const shape = look.mask ? 'circle' : look.shape;
  ctx.save();
  if (look.shadow) {
    ctx.shadowColor = look.shadow.color;
    ctx.shadowBlur = look.shadow.blur * unit;
    ctx.shadowOffsetX = look.shadow.offset.x * unit;
    ctx.shadowOffsetY = look.shadow.offset.y * unit;
  }
  if (look.mask) {
    ctx.drawImage(look.mask, c - r, c - r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = fillStyle(ctx, look.fill, c, r);
    ctx.fillRect(0, 0, TEX, TEX);
  } else {
    tracePath(ctx, shape, c, r);
    ctx.fillStyle = fillStyle(ctx, look.fill, c, r);
    ctx.fill();
  }
  ctx.restore();
  if (look.media) {
    const m = look.media;
    ctx.save();
    if (m.kind === 'image') {
      if (look.mask) {
        ctx.globalCompositeOperation = 'source-atop';
      } else {
        tracePath(ctx, shape, c, r);
        ctx.clip();
      }
      // Cover: fill the shape, crop the longer side.
      const scale = Math.max((r * 2) / m.w, (r * 2) / m.h);
      ctx.drawImage(m.img, c - (m.w * scale) / 2, c - (m.h * scale) / 2, m.w * scale, m.h * scale);
    } else {
      const box = r * 1.25;
      const scale = Math.min(box / m.w, box / m.h);
      ctx.drawImage(m.img, c - (m.w * scale) / 2, c - (m.h * scale) / 2, m.w * scale, m.h * scale);
    }
    ctx.restore();
  }
  if (look.outline && look.outline.width > 0 && !look.mask) {
    ctx.save();
    tracePath(ctx, shape, c, r - (look.outline.width * unit) / 2);
    ctx.lineWidth = look.outline.width * unit;
    ctx.strokeStyle = look.outline.color;
    ctx.stroke();
    ctx.restore();
  }
}

interface LoadedImage {
  img: HTMLImageElement;
  w: number;
  h: number;
}

/** Shared caches for skin textures and loaded images. */
export class SkinTextures {
  private bodies = new Map<string, Texture>();
  private images = new Map<string, Promise<LoadedImage | null>>();
  private ready = new Map<string, LoadedImage | null>();
  private glowTex: Texture | null = null;
  private ringTex: Texture | null = null;

  constructor(
    private readonly assetUrl: MediaLoader,
    private readonly onLoaded: () => void,
  ) {}

  /** Starts loading an asset image; returns it once ready. */
  image(hash: string): LoadedImage | null {
    if (this.ready.has(hash)) return this.ready.get(hash) ?? null;
    if (!this.images.has(hash)) {
      const url = this.assetUrl(hash);
      const p = new Promise<LoadedImage | null>((resolve) => {
        if (!url) return resolve(null);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve({ img, w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
        img.onerror = () => resolve(null);
        img.src = url;
      }).then((r) => {
        this.ready.set(hash, r);
        this.onLoaded();
        return r;
      });
      this.images.set(hash, p);
    }
    return null;
  }

  /**
   * Texture of a skin. `showMedia` false = plain colored bubble (skins off or far away).
   * Animated media (GIF, video) is drawn live elsewhere; here it shows only the fill.
   */
  body(skin: Skin, showMedia: boolean): Texture {
    const media = showMedia ? skin.media : undefined;
    const staticHash =
      media && (media.type === 'image' || media.type === 'icon' || media.type === 'auto')
        ? media.asset
        : undefined;
    const maskHash = typeof skin.shape === 'object' ? skin.shape.mask : undefined;
    const edge = skin.edge;
    const key = [
      shapeKey(skin.shape),
      fillKey(skin.fill),
      staticHash ? `${media?.type}:${staticHash}` : '',
      edge?.outline ? `o${edge.outline.color}${edge.outline.width}` : '',
      edge?.shadow ? `s${JSON.stringify(edge.shadow)}` : '',
      edge?.outline || edge?.shadow ? `z${Math.round(skin.size / 8)}` : '',
    ].join('|');
    const cached = this.bodies.get(key);
    if (cached) return cached;
    const img = staticHash ? this.image(staticHash) : null;
    const mask = maskHash ? this.image(maskHash) : null;
    if ((staticHash && !img) || (maskHash && !mask)) {
      // Not loaded yet: show the plain shape; the renderer asks again once the image loads.
      const loadingKey = `${key}|loading`;
      let tex = this.bodies.get(loadingKey);
      if (!tex) {
        const plain = {
          ...skin,
          media: undefined,
          shape: maskHash && !mask ? ('circle' as const) : skin.shape,
        };
        tex = this.draw(plain, null, null);
        this.bodies.set(loadingKey, tex);
      }
      return tex;
    }
    const tex = this.draw(skin, img, mask);
    this.bodies.set(key, tex);
    return tex;
  }

  private draw(skin: Skin, img: LoadedImage | null, mask: LoadedImage | null): Texture {
    const el = canvas();
    const ctx = el.getContext('2d');
    if (ctx) {
      drawBody(ctx, {
        shape: skin.shape,
        fill: skin.fill,
        outline: skin.edge?.outline,
        shadow: skin.edge?.shadow,
        media: img
          ? {
              kind: skin.media?.type === 'image' ? 'image' : 'icon',
              img: img.img,
              w: img.w,
              h: img.h,
            }
          : undefined,
        mask: mask?.img,
        size: skin.size,
      });
    }
    return Texture.from(el);
  }

  /** Soft white radial glow, tinted per bubble. */
  glow(): Texture {
    if (!this.glowTex) {
      const el = canvas();
      const ctx = el.getContext('2d');
      if (ctx) {
        const c = TEX / 2;
        const g = ctx.createRadialGradient(c, c, SHAPE_R * 0.7, c, c, TEX / 2);
        g.addColorStop(0, 'rgba(255,255,255,0.9)');
        g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, TEX, TEX);
      }
      this.glowTex = Texture.from(el);
    }
    return this.glowTex;
  }

  /** Ring for selection and search highlight, tinted. */
  ring(): Texture {
    if (!this.ringTex) {
      const el = canvas();
      const ctx = el.getContext('2d');
      if (ctx) {
        ctx.beginPath();
        ctx.arc(TEX / 2, TEX / 2, SHAPE_R + 10, 0, Math.PI * 2);
        ctx.lineWidth = 7;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
      this.ringTex = Texture.from(el);
    }
    return this.ringTex;
  }

  /** Drops cached textures (theme or asset changes). */
  clear(): void {
    for (const t of this.bodies.values()) t.destroy(true);
    this.bodies.clear();
  }
}
