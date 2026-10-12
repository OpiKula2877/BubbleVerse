/** World data model (spec §9.1). Pure data: everything here is JSON-serializable. */

export type BubbleId = string;
/** Content hash of an asset file (spec §9.2). */
export type AssetHash = string;
/** `#RRGGBB` or `#RRGGBBAA`. */
export type Color = string;

export interface Vec2 {
  x: number;
  y: number;
}

export const WORLD_VERSION = 1;

export interface World {
  /** Format version, used for migrations. */
  version: number;
  /** Flat list; the tree is built through `parentId`. */
  bubbles: Bubble[];
  sharedScripts: SharedScript[];
  customBlocks: CustomBlock[];
  templates: Template[];
  globals: VariableDef[];
  homeView: HomeView;
}

export interface HomeView {
  x: number;
  y: number;
  zoom: number;
}

export type BubbleKind = 'folder' | 'action';
export type Attach = 'parent' | 'world';
export type ShowName = 'inherit' | 'always' | 'hover' | 'never';

export interface Bubble {
  id: BubbleId;
  /** `null` = main (top) level. */
  parentId: BubbleId | null;
  kind: BubbleKind;
  name: string;
  order: number;
  /** Folders only: default expanded state. */
  expanded?: boolean;
  /** Relative to the parent (attach 'parent') or in the world (attach 'world'). */
  position: Vec2;
  attach: Attach;
  skin: SkinRef;
  /** At most one track motion (path, orbit or wander), plus optional pulse and spin. */
  motion: Motion;
  physics: Physics;
  /** Link to the parent. */
  link: Link;
  hover: HoverFx;
  showName?: ShowName;
  /** Action bubbles only. */
  scripts: ScriptSlot[];
}

// ---------- Skin (§3.2, §3.3) ----------

export type Shape = 'circle' | 'rounded' | 'hexagon' | 'star' | { mask: AssetHash };

export interface GradientStop {
  at: number;
  color: Color;
}

export interface Gradient {
  type: 'linear' | 'radial';
  /** Degrees, linear gradients only. */
  angle: number;
  stops: GradientStop[];
}

export type Fill = Color | Gradient;

export type MediaType = 'icon' | 'image' | 'gif' | 'video';
export type AutoSource = 'exe' | 'steam' | 'epic' | 'favicon';

export type Media =
  | { type: MediaType; asset: AssetHash }
  /** `asset` caches the icon the core resolved from the action's target. */
  | { type: 'auto'; source: AutoSource; asset?: AssetHash };

export interface Outline {
  color: Color;
  width: number;
}

export interface Glow {
  color: Color;
  strength: number;
}

export interface Shadow {
  color: Color;
  blur: number;
  offset: Vec2;
}

export interface Particles {
  color: Color;
  count: number;
  speed: number;
}

export interface Edge {
  outline?: Outline;
  glow?: Glow;
  shadow?: Shadow;
  glass?: boolean;
  particles?: Particles;
}

export type LabelPosition = 'below' | 'inside' | 'above';

export interface LabelStyle {
  color: Color;
  font: string;
  size: number;
  position: LabelPosition;
}

export interface Skin {
  shape: Shape;
  /** Diameter in world units. */
  size: number;
  fill: Fill;
  media?: Media;
  edge?: Edge;
  label?: LabelStyle;
}

export type InheritFrom = 'parent' | 'root' | { ancestor: BubbleId };

export type SkinRef =
  { mode: 'own'; skin: Skin } | { mode: 'inherit'; from: InheritFrom; overrides?: Partial<Skin> };

// ---------- Motion (§3.5) ----------

export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

export interface PathPoint {
  x: number;
  y: number;
  /** Bezier handles relative to the point. A sharp point has none. */
  in?: Vec2;
  out?: Vec2;
  smooth: boolean;
}

export interface PathMotion {
  type: 'path';
  /** Relative to the bubble's base position. */
  points: PathPoint[];
  loop: 'loop' | 'pingpong';
  /** World units per second. */
  speed: number;
  easing: Easing;
}

export interface OrbitMotion {
  type: 'orbit';
  center: BubbleId;
  rx: number;
  ry: number;
  /** Ellipse rotation in degrees. */
  tilt: number;
  /** Degrees per second. */
  speed: number;
  dir: 'cw' | 'ccw';
  /** Starting angle in degrees. */
  phase: number;
}

export type WanderArea = { shape: 'circle'; r: number } | { shape: 'rect'; w: number; h: number };

export interface WanderMotion {
  type: 'wander';
  /** Centered on the bubble's base position. */
  area: WanderArea;
  /** Roughly world units per second. */
  speed: number;
  /** 0 = jittery, 1 = very smooth. */
  smoothness: number;
}

export type TrackMotion = PathMotion | OrbitMotion | WanderMotion;

export interface Pulse {
  /** Size multipliers. */
  min: number;
  max: number;
  /** Seconds. */
  period: number;
}

export interface Spin {
  mode: 'constant' | 'pendulum';
  /** Degrees per second (pendulum: one swing period = 360 / speed seconds). */
  speed: number;
  /** Pendulum amplitude in degrees. */
  angle: number;
}

export interface Motion {
  track?: TrackMotion;
  pulse?: Pulse;
  spin?: Spin;
}

// ---------- Physics (§3.6) ----------

export interface Float {
  amplitude: number;
  speed: number;
}

export interface Collide {
  with: 'siblings' | 'all';
}

export interface Spring {
  stiffness: number;
  damping: number;
  /** Slack: the spring pulls only when farther than this from the target. */
  length: number;
}

export interface MouseReact {
  mode: 'repel' | 'attract';
  strength: number;
  radius: number;
}

export interface Physics {
  float?: Float;
  collide?: Collide;
  spring?: Spring;
  mouse?: MouseReact;
}

// ---------- Link (§3.7) & hover (§3.8) ----------

export type LinkType = 'none' | 'line' | 'lightning' | 'rope' | 'flow' | 'laser' | 'chain';

export interface Link {
  /** "Same as parent": use the parent's link style. */
  inherit: boolean;
  type: LinkType;
  color: Color;
  width: number;
  opacity: number;
  /** Particle flow only. */
  dash?: 'dotted' | 'dashed';
}

export interface HoverFx {
  grow: boolean;
  shake: boolean;
  glow: boolean;
  tooltip: boolean;
}

// ---------- Scripts (§5, §9.3) ----------

export type Value = null | boolean | number | string | Value[] | { [key: string]: Value };

/** `[opcode, ...args]`. An arg is a literal, another node or a list of nodes (a substack). */
export type ScriptNode = [number, ...ScriptArg[]];
export type ScriptArg = null | boolean | number | string | ScriptNode | ScriptNode[];

export type RunMode = 'ignore' | 'restart' | 'parallel';

export interface Script {
  v: 1;
  trigger: ScriptNode;
  body: ScriptNode[];
  runMode: RunMode;
}

export type ScriptSlot =
  | { kind: 'inline'; script: Script }
  | { kind: 'shared'; ref: string; params: Record<string, Value> };

export type ParamType = 'number' | 'text' | 'bool';

export interface ParamDef {
  name: string;
  type: ParamType;
  default: Value;
}

export interface SharedScript {
  id: string;
  name: string;
  params: ParamDef[];
  script: Script;
}

export interface CustomBlock {
  id: string;
  name: string;
  params: ParamDef[];
  body: ScriptNode[];
}

export interface Template {
  id: string;
  name: string;
  skin: SkinRef;
  attach: Attach;
  motion: Motion;
  physics: Physics;
  link: Link;
  hover: HoverFx;
  showName?: ShowName;
  scripts: ScriptSlot[];
}

export interface VariableDef {
  name: string;
  value: Value;
}
