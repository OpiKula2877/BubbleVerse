import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { defaultLabel } from '../model/defaults';
import { fillColor, SkinResolver } from '../model/skin';
import { WorldIndex } from '../model/tree';
import type { BubbleId, Skin, Vec2, World } from '../model/types';
import type { Guide } from '../edit/snap';
import { pulseScale, spinAngle } from '../sim/motion';
import { hasPhysics, PhysicsSim, type PhysicsInput } from '../sim/physics';
import { computePositions } from '../sim/position';
import { BubbleView, type ViewState } from './bubble-view';
import { ExpandState } from './expand';
import { SkinTextures } from './textures';
import {
  computeViewports,
  cssToWorld,
  lerpCamera,
  viewportAt,
  visibleWorld,
  type Camera,
  type PxRect,
  type ScreenLayout,
  type Viewport,
} from './viewports';

export interface RenderColors {
  selection: number;
  highlight: number;
  guide: number;
  grid: number;
  gridAlpha: number;
  error: number;
}

export interface ViewPrefs {
  names: 'always' | 'hover' | 'never';
  skins: boolean;
}

export interface SearchVisual {
  /** Grey out everything except `colored`. */
  active: boolean;
  colored: ReadonlySet<BubbleId>;
  /** Confirmed path: highlighted edge. */
  path: ReadonlySet<BubbleId>;
  current: BubbleId | null;
}

export interface Overlay {
  /** Rubber band selection in world coordinates. */
  rect: PxRect | null;
  guides: Guide[];
  /** Grid spacing in world units, or null. */
  grid: number | null;
}

export interface BackgroundLook {
  kind: string;
  color: string;
  color2: string;
  angle: number;
}

export interface RenderStats {
  fps: number;
  frameMs: number;
  bubbles: number;
}

export interface DisplayBubble {
  id: BubbleId;
  x: number;
  y: number;
  r: number;
  vis: number;
}

export interface RendererOptions {
  host: HTMLElement;
  assetUrl: (hash: string) => string;
  graphicsApi?: 'auto' | 'webgpu' | 'webgl';
  onStats?: (s: RenderStats) => void;
}

interface Pulse {
  chain: BubbleId[];
  start: number;
}

const HOVER_GROW = 1.12;
const PULSE_SECONDS = 0.6;
const GLOW_SECONDS = 1.2;

function hex(color: string): number {
  return parseInt(color.replace('#', '').slice(0, 6), 16) || 0;
}

/**
 * Draws the world with PixiJS: one camera, one render pass per monitor (spec §8.5),
 * motion and physics, expand animation, search dimming, edit overlays and script effects.
 * Renders only while something changes (idle = 0 FPS, spec §10.1).
 */
export class WorldRenderer {
  private app: Application;
  private stage = new Container();
  private bgLayer = new Container();
  private bgSprite = new Sprite();
  private passRoot = new Container();
  private clip = new Graphics();
  private worldLayer = new Container();
  private linkG = new Graphics();
  private bubbleLayer = new Container();
  private overlayG = new Graphics();
  private fxG = new Graphics();
  private textures: SkinTextures;

  private world: World | null = null;
  private index: WorldIndex | null = null;
  private resolver: SkinResolver | null = null;
  private order: BubbleId[] = [];
  private views = new Map<BubbleId, BubbleView>();
  readonly expand = new ExpandState();
  private physics = new PhysicsSim();
  private staticPositions = new Map<BubbleId, Vec2>();
  private display: DisplayBubble[] = [];
  private displayById = new Map<BubbleId, DisplayBubble>();

  private layout: ScreenLayout = {
    monitors: [],
    uiMonitor: '',
    origin: { x: 0, y: 0 },
    cssScale: 1,
  };
  camera: Camera = { x: 0, y: 0, zoom: 1 };
  private camAnim: { from: Camera; to: Camera; start: number; ms: number } | null = null;
  private vps: Viewport[] = [];

  /** Motion and physics run (user mode or preview). */
  private motion = false;
  private prefs: ViewPrefs = { names: 'always', skins: true };
  private colors: RenderColors = {
    selection: 0x5b8cff,
    highlight: 0xffc247,
    guide: 0xff5c93,
    grid: 0xffffff,
    gridAlpha: 0.08,
    error: 0xff4d5a,
  };
  private lodZoom = 0.35;
  private selection: ReadonlySet<BubbleId> = new Set();
  private hover: BubbleId | null = null;
  private hoverAmount = new Map<BubbleId, number>();
  private search: SearchVisual = {
    active: false,
    colored: new Set(),
    path: new Set(),
    current: null,
  };
  private overlay: Overlay = { rect: null, guides: [], grid: null };
  private mouseWorld: Vec2 | null = null;
  private background: BackgroundLook = {
    kind: 'color',
    color: '#0E1220',
    color2: '#0E1220',
    angle: 0,
  };

  // Script effects (runtime only, spec §5.4)
  private glows = new Map<BubbleId, { until: number; tint: number }>();
  private running = new Set<BubbleId>();
  private pulses: Pulse[] = [];
  private says = new Map<BubbleId, { text: string; until: number }>();
  private sayLayer = new Container();
  private sayViews = new Map<BubbleId, Container>();
  private colorOverride = new Map<BubbleId, string>();
  private sizeOverride = new Map<BubbleId, number>();
  private skinOverride = new Map<BubbleId, BubbleId>();
  private hidden = new Set<BubbleId>();
  private moved = new Map<BubbleId, Vec2>();

  private raf = 0;
  private dirty = true;
  private lastFrame = 0;
  private lastRender = 0;
  private fpsLimit = 60;
  private frames = 0;
  private statWindow = 0;
  private frameTime = 0;
  private destroyed = false;

  private constructor(private readonly opts: RendererOptions) {
    this.app = new Application();
    this.textures = new SkinTextures(opts.assetUrl, () => this.invalidateSkins());
  }

  static async create(opts: RendererOptions): Promise<WorldRenderer> {
    const r = new WorldRenderer(opts);
    const pref = opts.graphicsApi === 'webgpu' ? 'webgpu' : 'webgl';
    await r.app.init({
      resizeTo: opts.host,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      backgroundAlpha: 0,
      preference: pref,
      autoStart: false,
      sharedTicker: false,
    });
    r.app.ticker.stop();
    opts.host.appendChild(r.app.canvas);
    r.app.canvas.style.display = 'block';
    r.stage.addChild(r.bgLayer, r.passRoot, r.clip);
    r.bgLayer.addChild(r.bgSprite);
    r.passRoot.addChild(r.worldLayer);
    r.worldLayer.addChild(r.linkG, r.bubbleLayer, r.fxG, r.sayLayer, r.overlayG);
    r.app.renderer.on('resize', () => r.requestRender());
    return r;
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  // ---------------------------------------------------------------- inputs

  setWorld(world: World, resetExpanded = false): void {
    this.world = world;
    this.index = new WorldIndex(world);
    this.resolver = new SkinResolver(this.index);
    this.expand.sync(this.index, resetExpanded);
    this.order = this.index.flatten().map((b) => b.id);
    this.staticPositions = computePositions(this.index, { time: null });
    const keep = new Set(this.order);
    for (const [id, v] of this.views) {
      if (!keep.has(id)) {
        v.destroy();
        this.views.delete(id);
      }
    }
    this.order.forEach((id, i) => {
      let v = this.views.get(id);
      if (!v) {
        v = new BubbleView(this.textures.glow(), this.textures.ring());
        this.views.set(id, v);
      }
      this.bubbleLayer.addChildAt(v.root, Math.min(i, this.bubbleLayer.children.length));
    });
    for (const v of this.views.values()) v.bodyTexture = null;
    this.requestRender();
  }

  setLayout(layout: ScreenLayout): void {
    this.layout = layout;
    this.requestRender();
  }

  setCamera(cam: Camera, animateMs = 0): void {
    if (animateMs > 0) {
      this.camAnim = { from: { ...this.camera }, to: cam, start: performance.now(), ms: animateMs };
    } else {
      this.camAnim = null;
      this.camera = cam;
    }
    this.requestRender();
  }

  setMotion(on: boolean): void {
    if (this.motion !== on && !on) this.physics.reset();
    this.motion = on;
    this.requestRender();
  }

  setPrefs(prefs: ViewPrefs): void {
    this.prefs = prefs;
    this.requestRender();
  }

  setColors(colors: RenderColors): void {
    this.colors = colors;
    this.requestRender();
  }

  setBackground(bg: BackgroundLook): void {
    this.background = bg;
    this.bgSprite.texture = this.backgroundTexture(bg);
    this.requestRender();
  }

  setLodZoom(z: number): void {
    this.lodZoom = z;
    this.requestRender();
  }

  setFpsLimit(fps: number): void {
    this.fpsLimit = fps;
  }

  setSelection(ids: ReadonlySet<BubbleId>): void {
    this.selection = ids;
    this.requestRender();
  }

  setHover(id: BubbleId | null): void {
    if (this.hover === id) return;
    this.hover = id;
    this.requestRender();
  }

  setSearch(s: SearchVisual): void {
    this.search = s;
    this.requestRender();
  }

  setOverlay(o: Overlay): void {
    this.overlay = o;
    this.requestRender();
  }

  setMouse(world: Vec2 | null): void {
    this.mouseWorld = world;
    if (this.motion) this.requestRender();
  }

  /** Effects from scripts (spec §3.8, §5.2 "Bubbles & UI"). */
  scriptFx(fx: { kind: string; bubble: string; [k: string]: unknown }): void {
    const now = performance.now() / 1000;
    const id = fx.bubble;
    switch (fx.kind) {
      case 'activated': {
        const chain = this.index
          ? [
              ...this.index
                .ancestors(id)
                .reverse()
                .map((b) => b.id),
              id,
            ]
          : [id];
        this.pulses.push({ chain, start: now });
        break;
      }
      case 'running':
        if (fx.on) this.running.add(id);
        else this.running.delete(id);
        break;
      case 'error':
        this.glows.set(id, { until: now + GLOW_SECONDS, tint: this.colors.error });
        break;
      case 'glow':
        this.pulses.push({
          chain: this.index
            ? [
                ...this.index
                  .ancestors(id)
                  .reverse()
                  .map((b) => b.id),
                id,
              ]
            : [id],
          start: now,
        });
        break;
      case 'say':
        this.says.set(id, { text: String(fx.text ?? ''), until: now + Number(fx.seconds ?? 2) });
        break;
      case 'change':
        if (fx.prop === 'color') this.colorOverride.set(id, String(fx.value));
        else if (fx.prop === 'size') this.sizeOverride.set(id, Number(fx.value));
        else if (fx.prop === 'skin') {
          const src = this.index?.world.bubbles.find(
            (b) => b.id === fx.value || this.index?.pathString(b.id) === fx.value,
          );
          if (src) this.skinOverride.set(id, src.id);
        }
        break;
      case 'visibility':
        if (fx.visible) this.hidden.delete(id);
        else this.hidden.add(id);
        break;
      case 'move':
        this.moved.set(id, { x: Number(fx.x), y: Number(fx.y) });
        break;
    }
    this.requestRender();
  }

  /** Forgets runtime changes from scripts (after Save, they are not stored). */
  clearScriptChanges(): void {
    this.colorOverride.clear();
    this.sizeOverride.clear();
    this.skinOverride.clear();
    this.hidden.clear();
    this.moved.clear();
    this.requestRender();
  }

  // ---------------------------------------------------------------- queries

  viewports(): Viewport[] {
    return computeViewports(this.layout, this.camera);
  }

  screenToWorld(css: Vec2): Vec2 | null {
    const vp = viewportAt(this.viewports(), css);
    return vp ? cssToWorld(vp, css) : null;
  }

  /** Topmost visible bubble at a world point. */
  hitTest(p: Vec2, slack = 0): BubbleId | null {
    for (let i = this.display.length - 1; i >= 0; i--) {
      const d = this.display[i]!;
      if (d.vis < 0.5) continue;
      if (Math.hypot(p.x - d.x, p.y - d.y) <= d.r + slack) return d.id;
    }
    return null;
  }

  displayed(): readonly DisplayBubble[] {
    return this.display;
  }

  displayedById(id: BubbleId): DisplayBubble | undefined {
    return this.displayById.get(id);
  }

  /** Positions without motion (edit mode layout). */
  basePositions(): ReadonlyMap<BubbleId, Vec2> {
    return this.staticPositions;
  }

  // ---------------------------------------------------------------- frame loop

  requestRender(): void {
    this.dirty = true;
    if (!this.raf && !this.destroyed) this.raf = requestAnimationFrame(this.loop);
  }

  private loop = (now: number): void => {
    this.raf = 0;
    if (this.destroyed) return;
    const minGap = this.fpsLimit > 0 ? 1000 / this.fpsLimit - 1 : 0;
    if (now - this.lastRender < minGap) {
      this.raf = requestAnimationFrame(this.loop);
      return;
    }
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = now;
    this.dirty = false;
    const t0 = performance.now();
    const busy = this.update(dt, now);
    this.renderPasses();
    this.lastRender = now;
    this.stats(now, performance.now() - t0);
    if (busy || this.dirty) {
      this.raf = requestAnimationFrame(this.loop);
    } else {
      this.lastFrame = 0;
    }
  };

  private stats(now: number, ms: number): void {
    this.frames++;
    this.frameTime = this.frameTime * 0.9 + ms * 0.1;
    if (!this.statWindow) this.statWindow = now;
    if (now - this.statWindow >= 1000) {
      this.opts.onStats?.({
        fps: Math.round((this.frames * 1000) / (now - this.statWindow)),
        frameMs: Math.round(this.frameTime * 10) / 10,
        bubbles: this.views.size,
      });
      this.frames = 0;
      this.statWindow = now;
    }
  }

  /** Updates everything for this frame; returns true when another frame is needed. */
  private update(dt: number, nowMs: number): boolean {
    let busy = false;
    if (this.camAnim) {
      const a = this.camAnim;
      const t = Math.min(1, (nowMs - a.start) / a.ms);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.camera = lerpCamera(a.from, a.to, e);
      if (t >= 1) this.camAnim = null;
      else busy = true;
    }
    this.vps = computeViewports(this.layout, this.camera);
    const index = this.index;
    const resolver = this.resolver;
    if (!index || !resolver) return busy;

    const time = Date.now() / 1000;
    let positions: ReadonlyMap<BubbleId, Vec2> = this.staticPositions;
    if (this.motion || this.moved.size) {
      positions = computePositions(index, {
        time: this.motion ? time : null,
        overrides: this.moved,
      });
    }
    let anyMotion = false;
    if (this.motion) {
      const inputs: PhysicsInput[] = [];
      for (const b of index.world.bubbles) {
        const m = b.motion;
        if (m.track || m.pulse || m.spin || b.physics.float) anyMotion = true;
        if (!hasPhysics(b.physics)) continue;
        inputs.push({
          id: b.id,
          parentId: b.parentId,
          target: positions.get(b.id) ?? b.position,
          radius: resolver.skin(b.id).size / 2,
          physics: b.physics,
        });
      }
      if (inputs.length) {
        const sim = this.physics.update(inputs, dt, time, this.mouseWorld);
        const merged = new Map(positions);
        for (const [id, p] of sim) merged.set(id, p);
        positions = merged;
        if (!this.physics.atRest) busy = true;
      }
    }
    if (anyMotion) busy = true;
    if (this.expand.step(dt)) busy = true;
    const shown = this.expand.displayPositions(index, positions);

    const lod = this.camera.zoom < this.lodZoom;
    const nowS = nowMs / 1000;
    this.display = [];
    this.displayById.clear();
    const prefsNames = this.prefs.names;

    for (const id of this.order) {
      const view = this.views.get(id);
      const b = index.get(id);
      if (!view || !b) continue;
      const d = shown.get(id);
      const vis = this.hidden.has(id) ? 0 : (d?.vis ?? 1);
      if (vis <= 0.001) {
        view.root.visible = false;
        continue;
      }
      view.root.visible = true;
      const skinSrc = this.skinOverride.get(id);
      let skin: Skin = skinSrc ? resolver.skin(skinSrc) : resolver.skin(id);
      const color = this.colorOverride.get(id);
      if (color) skin = { ...skin, fill: color, media: undefined };
      const sizeOverride = this.sizeOverride.get(id);
      if (sizeOverride !== undefined) skin = { ...skin, size: sizeOverride };
      view.setTexture(this.textures.body(skin, this.prefs.skins && !lod));

      // Hover grow / shake / glow
      const hovered = this.hover === id && vis > 0.5;
      const h0 = this.hoverAmount.get(id) ?? 0;
      const h1 = hovered ? Math.min(1, h0 + dt * 8) : Math.max(0, h0 - dt * 8);
      if (h1 !== h0) busy = true;
      if (h1 > 0) this.hoverAmount.set(id, h1);
      else this.hoverAmount.delete(id);
      const hoverFx = b.hover;
      const pos = d?.pos ?? positions.get(id) ?? { x: 0, y: 0 };
      let size = skin.size * vis;
      if (this.motion && b.motion.pulse) size *= pulseScale(b.motion.pulse, Date.now() / 1000);
      if (hoverFx.grow) size *= 1 + (HOVER_GROW - 1) * h1;
      let rotation = this.motion && b.motion.spin ? spinAngle(b.motion.spin, Date.now() / 1000) : 0;
      if (hoverFx.shake && h1 > 0) {
        rotation += Math.sin(nowS * 40) * 0.06 * h1;
        busy = true;
      }

      let glow = hoverFx.glow ? h1 * 0.8 : 0;
      let glowTint = 0xffffff;
      const g = this.glows.get(id);
      if (g) {
        if (g.until > nowS) {
          glow = Math.max(glow, (g.until - nowS) / GLOW_SECONDS);
          glowTint = g.tint;
          busy = true;
        } else {
          this.glows.delete(id);
        }
      }
      if (this.running.has(id)) {
        glow = Math.max(glow, 0.45 + 0.2 * Math.sin(nowS * 4));
        busy = true;
      }

      // Search dimming (spec §6.5)
      let tint = 0xffffff;
      let alpha = Math.min(1, vis * 1.2);
      if (this.search.active && !this.search.colored.has(id) && !this.search.path.has(id)) {
        tint = 0x8a8a8a;
        alpha *= 0.28;
        glow = 0;
      }
      let ring = 0;
      let ringTint = this.colors.selection;
      if (this.selection.has(id)) ring = 1;
      else if (this.search.active && (this.search.path.has(id) || this.search.current === id)) {
        ring = this.search.current === id ? 1 : 0.7;
        ringTint = this.colors.highlight;
      }

      const showName = b.showName && b.showName !== 'inherit' ? b.showName : prefsNames;
      const labelOn =
        !lod && b.name && (showName === 'always' || (showName === 'hover' && h1 > 0.05));
      const state: ViewState = {
        x: pos.x,
        y: pos.y,
        size,
        rotation,
        alpha,
        tint,
        label: labelOn ? b.name : null,
        labelStyle: skin.label ?? defaultLabel(),
        glow: lod ? 0 : glow,
        glowTint,
        ring,
        ringTint,
      };
      view.update(state);
      const disp = { id, x: pos.x, y: pos.y, r: size / 2, vis };
      this.display.push(disp);
      this.displayById.set(id, disp);
    }

    this.drawLinks(index, resolver);
    if (this.drawFx(nowS)) busy = true;
    if (this.drawSays(nowS)) busy = true;
    this.drawOverlay();
    return busy;
  }

  private drawLinks(index: WorldIndex, resolver: SkinResolver): void {
    const g = this.linkG;
    g.clear();
    for (const d of this.display) {
      const parent = index.parentOf(d.id);
      if (!parent) continue;
      const p = this.displayById.get(parent.id);
      if (!p || d.vis < 0.02) continue;
      const link = resolver.link(d.id);
      if (link.type === 'none') continue;
      const dx = d.x - p.x;
      const dy = d.y - p.y;
      const len = Math.hypot(dx, dy);
      if (len < p.r + d.r) continue;
      const ux = dx / len;
      const uy = dy / len;
      const dimmed =
        this.search.active && !this.search.colored.has(d.id) && !this.search.path.has(d.id);
      g.moveTo(p.x + ux * p.r, p.y + uy * p.r)
        .lineTo(d.x - ux * d.r, d.y - uy * d.r)
        .stroke({
          color: hex(link.color),
          width: Math.max(0.5, link.width),
          alpha: link.opacity * Math.min(1, d.vis) * (dimmed ? 0.25 : 1),
        });
    }
  }

  /** Neuron pulse along the links from the main bubble to the activated one (spec §3.8). */
  private drawFx(nowS: number): boolean {
    const g = this.fxG;
    g.clear();
    if (!this.pulses.length) return false;
    const alive: Pulse[] = [];
    for (const p of this.pulses) {
      const pts = p.chain
        .map((id) => this.displayById.get(id))
        .filter((d): d is DisplayBubble => !!d);
      const segs = Math.max(0, pts.length - 1);
      const total = segs > 0 ? PULSE_SECONDS : 0;
      const t = nowS - p.start;
      const target = p.chain[p.chain.length - 1]!;
      if (t >= total) {
        if (!this.glows.has(target) || (this.glows.get(target)?.tint ?? 0) !== this.colors.error) {
          this.glows.set(target, { until: nowS + GLOW_SECONDS, tint: 0xffffff });
        }
        continue;
      }
      alive.push(p);
      const u = (t / total) * segs;
      const i = Math.min(segs - 1, Math.floor(u));
      const f = u - i;
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const x = a.x + (b.x - a.x) * f;
      const y = a.y + (b.y - a.y) * f;
      const r = Math.max(4, Math.min(a.r, b.r) * 0.25);
      g.circle(x, y, r * 2.2).fill({ color: 0xffffff, alpha: 0.18 });
      g.circle(x, y, r).fill({ color: 0xffffff, alpha: 0.95 });
      for (let k = 0; k <= i; k++) {
        const s = pts[k]!;
        const e = k === i ? { x, y } : pts[k + 1]!;
        g.moveTo(s.x, s.y)
          .lineTo(e.x, e.y)
          .stroke({ color: 0xffffff, width: Math.max(1.5, r * 0.5), alpha: 0.5 });
      }
    }
    this.pulses = alive;
    return true;
  }

  /** Comic speech bubbles from the "say" block. */
  private drawSays(nowS: number): boolean {
    let any = false;
    for (const [id, s] of this.says) {
      const d = this.displayById.get(id);
      if (s.until <= nowS || !d) {
        if (s.until <= nowS) this.says.delete(id);
        const old = this.sayViews.get(id);
        if (old) {
          old.destroy({ children: true });
          this.sayViews.delete(id);
        }
        continue;
      }
      any = true;
      let box = this.sayViews.get(id);
      if (!box || box.label !== s.text) {
        box?.destroy({ children: true });
        box = new Container();
        box.label = s.text;
        const text = new Text({
          text: s.text,
          style: {
            fontFamily: 'Segoe UI',
            fontSize: 18,
            fill: 0x111111,
            wordWrap: true,
            wordWrapWidth: 260,
          },
        });
        const pad = 10;
        const w = text.width + pad * 2;
        const h = text.height + pad * 2;
        const bg = new Graphics()
          .roundRect(-w / 2, -h - 12, w, h, 12)
          .fill({ color: 0xffffff })
          .stroke({ color: 0x333333, width: 2 })
          .poly([-10, -13, 0, 0, 10, -13])
          .fill({ color: 0xffffff });
        text.position.set(-w / 2 + pad, -h - 12 + pad);
        box.addChild(bg, text);
        this.sayLayer.addChild(box);
        this.sayViews.set(id, box);
      }
      const k = this.vps.find((v) => v.primary)?.k ?? 1;
      box.scale.set(1 / Math.max(0.05, k));
      box.position.set(d.x + d.r * 0.5, d.y - d.r);
    }
    for (const [id, box] of this.sayViews) {
      if (!this.says.has(id)) {
        box.destroy({ children: true });
        this.sayViews.delete(id);
      }
    }
    return any;
  }

  private drawOverlay(): void {
    const g = this.overlayG;
    g.clear();
    const k = this.vps.find((v) => v.primary)?.k ?? 1;
    const px = 1 / Math.max(0.0001, k);
    const o = this.overlay;
    if (o.grid && o.grid > 0) {
      let step = o.grid;
      while (step * k < 10) step *= 2;
      for (const vp of this.vps) {
        const r = visibleWorld(vp);
        const x0 = Math.floor(r.x / step) * step;
        const y0 = Math.floor(r.y / step) * step;
        for (let x = x0; x <= r.x + r.w; x += step) g.moveTo(x, r.y).lineTo(x, r.y + r.h);
        for (let y = y0; y <= r.y + r.h; y += step) g.moveTo(r.x, y).lineTo(r.x + r.w, y);
      }
      g.stroke({ color: this.colors.grid, width: px, alpha: this.colors.gridAlpha * 3 });
    }
    for (const guide of o.guides) {
      if (guide.axis === 'x') g.moveTo(guide.value, guide.from).lineTo(guide.value, guide.to);
      else g.moveTo(guide.from, guide.value).lineTo(guide.to, guide.value);
    }
    if (o.guides.length) g.stroke({ color: this.colors.guide, width: px * 1.5, alpha: 0.9 });
    if (o.rect) {
      g.rect(o.rect.x, o.rect.y, o.rect.w, o.rect.h)
        .fill({ color: this.colors.selection, alpha: 0.12 })
        .stroke({ color: this.colors.selection, width: px, alpha: 0.9 });
    }
  }

  private renderPasses(): void {
    const r = this.app.renderer;
    const multi = this.vps.length > 1;
    this.passRoot.mask = multi ? this.clip : null;
    this.clip.visible = multi;
    this.vps.forEach((vp, i) => {
      this.worldLayer.scale.set(vp.k);
      this.worldLayer.position.set(
        vp.anchorCss.x - vp.anchorWorld.x * vp.k,
        vp.anchorCss.y - vp.anchorWorld.y * vp.k,
      );
      this.bgSprite.position.set(vp.css.x, vp.css.y);
      this.bgSprite.width = vp.css.w;
      this.bgSprite.height = vp.css.h;
      if (multi) this.clip.clear().rect(vp.css.x, vp.css.y, vp.css.w, vp.css.h).fill(0xffffff);
      this.cull(vp);
      r.render({ container: this.stage, clear: i === 0 });
    });
    if (!this.vps.length) r.render({ container: this.stage, clear: true });
  }

  /** Hides bubbles outside a viewport (spec §10.1 culling). */
  private cull(vp: Viewport): void {
    const w = visibleWorld(vp);
    for (const d of this.display) {
      const v = this.views.get(d.id);
      if (!v) continue;
      const m = d.r * 2.5 + 60;
      v.root.renderable =
        d.x + m >= w.x && d.x - m <= w.x + w.w && d.y + m >= w.y && d.y - m <= w.y + w.h;
    }
  }

  private backgroundTexture(bg: BackgroundLook): Texture {
    const el = document.createElement('canvas');
    el.width = 256;
    el.height = 256;
    const ctx = el.getContext('2d');
    if (ctx) {
      if (bg.kind === 'gradient') {
        const a = (bg.angle * Math.PI) / 180;
        const dx = Math.cos(a) * 128;
        const dy = Math.sin(a) * 128;
        const g = ctx.createLinearGradient(128 - dx, 128 - dy, 128 + dx, 128 + dy);
        g.addColorStop(0, bg.color);
        g.addColorStop(1, bg.color2);
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = bg.color;
      }
      ctx.fillRect(0, 0, 256, 256);
    }
    return Texture.from(el);
  }

  private invalidateSkins(): void {
    for (const v of this.views.values()) v.bodyTexture = null;
    this.requestRender();
  }

  /** Clears cached textures, e.g. after assets changed. */
  refreshTextures(): void {
    this.textures.clear();
    this.invalidateSkins();
  }

  /** Average fill color of a bubble (for UI previews). */
  colorOf(id: BubbleId): string {
    return this.resolver ? fillColor(this.resolver.skin(id)) : '#888888';
  }

  destroy(): void {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
    this.app.destroy(true, { children: true });
  }
}
