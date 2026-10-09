import { Container, Rectangle, Sprite, Texture } from 'pixi.js';

/**
 * Links and particles drawn with reused sprites from one small texture (a white square, a
 * disc and a ring), so the GPU draws them in one batch and nothing is rebuilt every frame
 * (spec §10.1).
 */

const SQUARE = 8;
const DISC = 32;

function atlas(): { square: Texture; disc: Texture; ring: Texture } {
  const el = document.createElement('canvas');
  el.width = SQUARE + DISC * 2 + 4;
  el.height = DISC;
  const ctx = el.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SQUARE, SQUARE);
    ctx.beginPath();
    ctx.arc(SQUARE + 2 + DISC / 2, DISC / 2, DISC / 2 - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(SQUARE + 4 + DISC * 1.5, DISC / 2, DISC / 2 - 3, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }
  const base = Texture.from(el);
  const frame = (x: number, w: number, h: number) =>
    new Texture({ source: base.source, frame: new Rectangle(x, 0, w, h) });
  return {
    // Inner part of the square: no blurry edges when stretched.
    square: new Texture({
      source: base.source,
      frame: new Rectangle(2, 2, SQUARE - 4, SQUARE - 4),
    }),
    disc: frame(SQUARE + 2, DISC, DISC),
    ring: frame(SQUARE + 4 + DISC, DISC, DISC),
  };
}

export class SpritePool {
  readonly layer = new Container();
  private sprites: Sprite[] = [];
  private used = 0;
  private tex = atlas();

  /** Starts a new frame: every sprite becomes free. */
  begin(): void {
    this.used = 0;
  }

  /** Hides the sprites this frame did not use. */
  end(): void {
    for (let i = this.used; i < this.sprites.length; i++) this.sprites[i]!.visible = false;
  }

  private next(texture: Texture): Sprite {
    let s = this.sprites[this.used];
    if (!s) {
      s = new Sprite(texture);
      this.sprites.push(s);
      this.layer.addChild(s);
    }
    this.used++;
    s.visible = true;
    if (s.texture !== texture) s.texture = texture;
    return s;
  }

  /** A straight line from (x0, y0) to (x1, y1). */
  segment(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    width: number,
    color: number,
    alpha: number,
  ): void {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 0.01 || alpha <= 0) return;
    const s = this.next(this.tex.square);
    s.anchor.set(0, 0.5);
    s.position.set(x0, y0);
    s.rotation = Math.atan2(y1 - y0, x1 - x0);
    s.scale.set(len / this.tex.square.width, width / this.tex.square.height);
    s.tint = color;
    s.alpha = alpha;
  }

  /** A polyline (flat x, y list). */
  polyline(pts: readonly number[], width: number, color: number, alpha: number): void {
    for (let i = 2; i < pts.length; i += 2) {
      this.segment(pts[i - 2]!, pts[i - 1]!, pts[i]!, pts[i + 1]!, width, color, alpha);
    }
  }

  /** A filled dot, or a ring when `ring` is true. */
  dot(x: number, y: number, r: number, color: number, alpha: number, ring = false): void {
    if (alpha <= 0) return;
    const tex = ring ? this.tex.ring : this.tex.disc;
    const s = this.next(tex);
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.rotation = 0;
    s.scale.set((r * 2) / tex.width);
    s.tint = color;
    s.alpha = alpha;
  }
}
