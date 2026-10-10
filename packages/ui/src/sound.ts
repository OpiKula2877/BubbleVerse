import type { Settings } from './settings';

/**
 * Sounds (spec §7.7): a short click for the UI and a chime when a bubble is activated. The
 * default sounds are synthesized (no sound files ship with the app); custom sounds are
 * assets. Everything respects the volume and is muted while a game runs full screen.
 */

export type SoundKind = 'click' | 'activate';

interface SoundState {
  config: Settings['sounds'];
  assetUrl: (hash: string) => string;
  fullscreen: boolean;
}

const state: SoundState = {
  config: {
    ui: false,
    activation: false,
    volume: 0.6,
    activationSound: null,
    clickSound: null,
    muteInFullscreen: true,
  },
  assetUrl: () => '',
  fullscreen: false,
};

let ctx: AudioContext | null = null;
let lastClick = 0;

export function configureSounds(
  config: Settings['sounds'],
  assetUrl: (hash: string) => string,
): void {
  state.config = config;
  state.assetUrl = assetUrl;
}

/** A game or app runs full screen (from the core's auto-pause signals). */
export function setFullscreenActive(on: boolean): void {
  state.fullscreen = on;
}

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** A tone with a quick attack and an exponential fade. */
function tone(
  ac: AudioContext,
  freq: number,
  start: number,
  length: number,
  gain: number,
  type: OscillatorType = 'sine',
): void {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(g).connect(ac.destination);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

function synth(kind: SoundKind, volume: number): void {
  const ac = audio();
  if (!ac) return;
  const now = ac.currentTime;
  if (kind === 'click') {
    tone(ac, 1900, now, 0.035, 0.18 * volume, 'triangle');
  } else {
    tone(ac, 660, now, 0.22, 0.22 * volume);
    tone(ac, 990, now + 0.07, 0.3, 0.18 * volume);
  }
}

/** Plays a sound if the settings allow it now. */
export function playSound(kind: SoundKind): void {
  const c = state.config;
  if (kind === 'click' ? !c.ui : !c.activation) return;
  if (c.muteInFullscreen && state.fullscreen) return;
  const volume = Math.max(0, Math.min(1, c.volume));
  if (volume <= 0) return;
  if (kind === 'click') {
    // A burst of clicks (keyboard repeat, fast double clicks) plays once.
    const now = performance.now();
    if (now - lastClick < 40) return;
    lastClick = now;
  }
  const custom = kind === 'click' ? c.clickSound : c.activationSound;
  if (custom) {
    const el = new Audio(state.assetUrl(custom));
    el.volume = volume;
    void el.play().catch(() => synth(kind, volume));
    return;
  }
  synth(kind, volume);
}
