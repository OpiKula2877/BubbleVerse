import { store } from './store.svelte';

/**
 * Entrance of the universe for the global search (the "universe" look): the window opens
 * transparent over the desktop and the world comes in with the chosen animation; when the
 * search ends it leaves the same way and the window hides again. Styles: `intro.css`.
 */

const IN_MS = 520;
const OUT_MS = 280;

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The animation grows from the search field: bottom center of the UI monitor. */
function setOrigin(): void {
  const r = store.uiRect;
  const root = document.documentElement;
  root.style.setProperty('--intro-x', `${r.x + r.w / 2}px`);
  root.style.setProperty('--intro-y', `${r.y + r.h * 0.9}px`);
}

export async function enterUniverse(): Promise<void> {
  const anim = store.settings.search.animation;
  const root = document.documentElement;
  setOrigin();
  if (anim !== 'none') root.dataset.intro = `${anim}-start`;
  // The hidden start state is painted before the window shows: nothing flashes.
  await frame();
  await frame();
  await store.core.call('present_main').catch(() => undefined);
  if (anim === 'none') return;
  root.dataset.intro = anim;
  await wait(IN_MS);
  if (root.dataset.intro === anim) delete root.dataset.intro;
}

export async function leaveUniverse(): Promise<void> {
  const anim = store.settings.search.animation;
  const root = document.documentElement;
  if (anim !== 'none') {
    setOrigin();
    root.dataset.intro = `${anim}-out`;
    await wait(OUT_MS);
  }
  await store.core.hideMain().catch(() => undefined);
  delete root.dataset.intro;
}
