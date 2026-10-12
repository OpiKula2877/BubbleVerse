import { BitmapText, Container, Sprite, type Texture } from 'pixi.js';
import type { LabelStyle } from '../model/types';
import { PAD, TEX } from './textures';

/** Base font size of labels; labels are scaled down from it so zooming in stays sharp. */
const LABEL_BASE = 32;

export interface ViewState {
  x: number;
  y: number;
  /** Diameter in world units (after pulse, hover grow and expand animation). */
  size: number;
  rotation: number;
  alpha: number;
  tint: number;
  label: string | null;
  labelStyle: LabelStyle | null;
  glow: number;
  glowTint: number;
  ring: number;
  ringTint: number;
}

/** Display objects of one bubble: glow, body, selection ring and name. */
export class BubbleView {
  readonly root = new Container();
  private readonly glow: Sprite;
  private readonly body = new Sprite();
  private readonly ring: Sprite;
  private label: BitmapText | null = null;
  private labelKey = '';
  private labelLook = '';
  bodyTexture: Texture | null = null;

  constructor(glowTex: Texture, ringTex: Texture) {
    this.glow = new Sprite(glowTex);
    this.ring = new Sprite(ringTex);
    for (const s of [this.glow, this.body, this.ring]) s.anchor.set(0.5);
    this.glow.visible = false;
    this.ring.visible = false;
    this.root.addChild(this.glow, this.body, this.ring);
  }

  setTexture(tex: Texture): void {
    if (this.bodyTexture === tex) return;
    this.bodyTexture = tex;
    this.body.texture = tex;
  }

  /** What was set last; Pixi setters cost even when the value does not change. */
  private last = { x: NaN, y: NaN, alpha: NaN, scale: NaN, rotation: NaN, tint: NaN };

  update(s: ViewState): void {
    const l = this.last;
    if (s.x !== l.x || s.y !== l.y) {
      this.root.position.set(s.x, s.y);
      l.x = s.x;
      l.y = s.y;
    }
    if (s.alpha !== l.alpha) this.root.alpha = l.alpha = s.alpha;
    const scale = (s.size * PAD) / TEX;
    if (scale !== l.scale) {
      this.body.scale.set(scale);
      l.scale = scale;
    }
    if (s.rotation !== l.rotation) this.body.rotation = l.rotation = s.rotation;
    if (s.tint !== l.tint) this.body.tint = l.tint = s.tint;
    const glowOn = s.glow > 0.01;
    if (this.glow.visible !== glowOn) this.glow.visible = glowOn;
    if (glowOn) {
      this.glow.scale.set(scale * (1.15 + 0.25 * s.glow));
      this.glow.alpha = Math.min(1, s.glow);
      this.glow.tint = s.glowTint;
    }
    const ringOn = s.ring > 0.01;
    if (this.ring.visible !== ringOn) this.ring.visible = ringOn;
    if (ringOn) {
      this.ring.scale.set(scale);
      this.ring.alpha = s.ring;
      this.ring.tint = s.ringTint;
    }
    this.updateLabel(s);
  }

  private updateLabel(s: ViewState): void {
    if (!s.label || !s.labelStyle) {
      if (this.label?.visible) this.label.visible = false;
      return;
    }
    const st = s.labelStyle;
    const key = `${s.label}|${st.font}`;
    if (!this.label || key !== this.labelKey) {
      if (this.label) {
        this.root.removeChild(this.label);
        this.label.destroy();
      }
      this.label = new BitmapText({
        text: s.label,
        style: { fontFamily: st.font || 'Segoe UI', fontSize: LABEL_BASE, fill: 0xffffff },
      });
      this.label.anchor.set(0.5);
      this.labelKey = key;
      this.labelLook = '';
      this.root.addChild(this.label);
    }
    const l = this.label;
    if (!l.visible) l.visible = true;
    const half = s.size / 2;
    const gap = 4 + st.size * 0.6;
    const y = st.position === 'inside' ? 0 : st.position === 'above' ? -half - gap : half + gap;
    const look = `${st.color}|${st.size}|${y}`;
    // Setting these on a BitmapText makes it lay out again: only when something changed.
    if (look !== this.labelLook) {
      this.labelLook = look;
      l.tint = parseInt(st.color.slice(1, 7), 16) || 0xffffff;
      l.scale.set(st.size / LABEL_BASE);
      l.position.set(0, y);
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
