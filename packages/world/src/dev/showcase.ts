import { createBubble, emptyWorld } from '../model/defaults';
import type { Bubble, LinkType, OrbitMotion, Skin, World } from '../model/types';

/**
 * Developer scenes for phase 6 (spec §13): the solar system from spec §3.5 and a showcase of
 * every link type and edge effect. Opened with `?scene=solar` and `?scene=fx`.
 */

function own(b: Bubble, skin: Partial<Skin>): Bubble {
  if (b.skin.mode === 'own')
    return { ...b, skin: { mode: 'own', skin: { ...b.skin.skin, ...skin } } };
  return { ...b, skin: { ...b.skin, overrides: { ...b.skin.overrides, ...skin } } };
}

function orbit(
  center: string,
  rx: number,
  ry: number,
  speed: number,
  phase: number,
  tilt = 0,
): OrbitMotion {
  return { type: 'orbit', center, rx, ry, tilt, speed, dir: 'ccw', phase };
}

/**
 * "The action bubble Sun has only scripts. The main folders Apps, Games and Work orbit it on
 * ellipses. Games' sub-folders orbit Games like moons." (spec §3.5)
 */
export function solarSystem(): World {
  const sun = own(createBubble({ kind: 'action', name: 'Slunce', position: { x: 0, y: 0 } }), {
    size: 170,
    fill: {
      type: 'radial',
      angle: 0,
      stops: [
        { at: 0, color: '#FFF4B0' },
        { at: 1, color: '#FF9A1F' },
      ],
    },
    edge: {
      glow: { color: '#FFB020', strength: 18 },
      particles: { color: '#FFE08A', count: 24, speed: 1 },
    },
  });
  sun.scripts = [];
  const planet = (name: string, color: string, o: OrbitMotion, order: number): Bubble => {
    const b = own(
      createBubble({ kind: 'folder', name, order, color, position: { x: o.rx, y: 0 } }),
      { size: 90 },
    );
    return { ...b, motion: { track: o, spin: { mode: 'constant', speed: 12, angle: 0 } } };
  };
  const apps = planet('Apps', '#4C97FF', orbit(sun.id, 360, 250, 14, 0, 10), 0);
  const games = planet('Games', '#FF6680', orbit(sun.id, 640, 430, 9, 150, -8), 1);
  const work = planet('Work', '#59C059', orbit(sun.id, 920, 610, 6, 260, 4), 2);
  const moons = ['CS2', 'Minecraft', 'Doom'].map((name, i) => {
    const m = createBubble({ kind: 'folder', parentId: games.id, name, order: i, parentSize: 90 });
    return {
      ...m,
      attach: 'world' as const,
      motion: { track: orbit(games.id, 110 + i * 35, 110 + i * 35, 40 - i * 9, i * 120) },
      link: {
        ...m.link,
        inherit: false,
        type: 'line' as const,
        color: '#FFFFFF',
        width: 1.5,
        opacity: 0.35,
      },
    };
  });
  return {
    ...emptyWorld(),
    bubbles: [sun, apps, games, work, ...moons],
    homeView: { x: 0, y: 0, zoom: 0.45 },
  };
}

/** One main bubble per link type with children, and bubbles with every edge effect. */
export function effectsShowcase(): World {
  const types: LinkType[] = ['line', 'lightning', 'rope', 'flow', 'laser', 'chain'];
  const bubbles: Bubble[] = [];
  types.forEach((type, i) => {
    const main = createBubble({
      kind: 'folder',
      name: type,
      order: i,
      position: { x: i * 330 - 820, y: -260 },
    });
    bubbles.push(main);
    for (let k = 0; k < 3; k++) {
      const a = Math.PI / 2 + (k - 1) * 0.7;
      const child = createBubble({
        kind: 'action',
        parentId: main.id,
        name: `${type} ${k + 1}`,
        order: k,
        parentSize: 120,
        position: { x: Math.cos(a) * 190, y: Math.sin(a) * 190 },
      });
      bubbles.push({
        ...child,
        link: {
          inherit: false,
          type,
          color: type === 'laser' ? '#FF4D5A' : '#9FD0FF',
          width: 3,
          opacity: 0.9,
          ...(type === 'flow' ? { dash: 'dotted' as const } : {}),
        },
      });
    }
  });
  const effects: [string, Partial<Skin>][] = [
    ['glow', { edge: { glow: { color: '#5B8CFF', strength: 14 } } }],
    ['glass', { edge: { glass: true } }],
    ['particles', { edge: { particles: { color: '#FFFFFF', count: 18, speed: 1.2 } } }],
    ['outline', { edge: { outline: { color: '#FFFFFF', width: 4 } } }],
    ['shadow', { edge: { shadow: { color: '#000000AA', blur: 16, offset: { x: 0, y: 6 } } } }],
    ['star', { shape: 'star' }],
    ['hexagon', { shape: 'hexagon' }],
    ['rounded', { shape: 'rounded' }],
  ];
  effects.forEach(([name, skin], i) => {
    bubbles.push(
      own(
        createBubble({
          kind: 'action',
          name,
          order: 10 + i,
          position: { x: i * 220 - 770, y: 330 },
        }),
        skin,
      ),
    );
  });
  return { ...emptyWorld(), bubbles, homeView: { x: 0, y: 40, zoom: 0.55 } };
}
