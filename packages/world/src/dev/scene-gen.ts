import { BUBBLE_PALETTE, createBubble, emptyWorld } from '../model/defaults';
import type { Bubble, Shape, Skin, World } from '../model/types';

/**
 * Developer test scene (AI prompt §5.3): N bubbles with a mix of skins, motions and physics,
 * used to watch FPS from the first phase on (targets in spec §10.2).
 */
export function generateScene(count: number, seed = 1): World {
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;
  const shapes: Shape[] = ['circle', 'circle', 'rounded', 'hexagon', 'star'];
  const world = emptyWorld();
  const bubbles: Bubble[] = [];
  const mains = Math.max(3, Math.round(Math.sqrt(count) / 2));
  const ring = 260 + mains * 70;

  for (let m = 0; m < mains && bubbles.length < count; m++) {
    const a = (m / mains) * Math.PI * 2;
    const main = createBubble({
      kind: 'folder',
      name: `Main ${m + 1}`,
      order: m,
      color: BUBBLE_PALETTE[m % BUBBLE_PALETTE.length],
      position: { x: Math.cos(a) * ring, y: Math.sin(a) * ring },
    });
    if (main.skin.mode === 'own') {
      main.skin.skin = {
        ...main.skin.skin,
        shape: pick(shapes),
        fill: {
          type: 'radial',
          angle: 0,
          stops: [
            { at: 0, color: '#FFFFFF' },
            { at: 1, color: BUBBLE_PALETTE[m % BUBBLE_PALETTE.length] ?? '#4C97FF' },
          ],
        },
        edge: { outline: { color: '#FFFFFF', width: 3 }, shadow: { color: '#00000080', blur: 12, offset: { x: 0, y: 4 } } },
      };
    }
    if (m % 3 === 1) main.physics = { float: { amplitude: 8, speed: 0.3 } };
    bubbles.push(main);

    // Children for this main bubble; the rest is shared by the remaining main bubbles.
    const perMain = Math.ceil((count - bubbles.length - (mains - m - 1)) / (mains - m));
    let made = 0;
    let folder: Bubble = main;
    while (made < perMain && bubbles.length < count) {
      const isFolder = made % 9 === 0 && made > 0;
      const idx = made;
      const angle = rnd() * Math.PI * 2;
      const dist = 140 + rnd() * 220;
      const parent = isFolder ? main : folder;
      const b = createBubble({
        kind: isFolder ? 'folder' : 'action',
        parentId: parent.id,
        name: `${isFolder ? 'Folder' : 'Action'} ${m + 1}.${idx + 1}`,
        order: idx,
        parentSize: 100,
        position: { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist },
      });
      if (rnd() < 0.5) {
        const skin: Skin = {
          shape: pick(shapes),
          size: 34 + Math.round(rnd() * 40),
          fill: pick(BUBBLE_PALETTE),
          label: { color: '#FFFFFF', font: 'Segoe UI', size: 12, position: 'below' },
          edge: rnd() < 0.4 ? { outline: { color: '#FFFFFF', width: 2 } } : undefined,
        };
        b.skin = { mode: 'own', skin };
      }
      const r = rnd();
      if (r < 0.15) {
        b.motion.track = { type: 'orbit', center: parent.id, rx: dist, ry: dist * 0.7, tilt: rnd() * 90, speed: 10 + rnd() * 30, dir: rnd() < 0.5 ? 'cw' : 'ccw', phase: rnd() * 360 };
      } else if (r < 0.3) {
        b.motion.track = { type: 'wander', area: { shape: 'circle', r: 40 }, speed: 20, smoothness: 0.6 };
      }
      if (rnd() < 0.15) b.motion.pulse = { min: 0.9, max: 1.1, period: 2 + rnd() * 2 };
      if (rnd() < 0.1) b.motion.spin = { mode: 'pendulum', speed: 60, angle: 15 };
      bubbles.push(b);
      if (isFolder) folder = b;
      made++;
    }
  }
  world.bubbles = bubbles.slice(0, count);
  return world;
}
