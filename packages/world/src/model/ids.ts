const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

let lastTime = 0;
let lastRandom: number[] = [];

/**
 * Short ULID: 10 chars of millisecond time + 6 random chars (Crockford base32).
 * Sortable by creation time; monotonic within the same millisecond.
 */
export function newId(now: number = Date.now()): string {
  let random: number[];
  if (now === lastTime) {
    random = increment(lastRandom);
  } else {
    random = Array.from({ length: 6 }, () => Math.floor(Math.random() * 32));
  }
  lastTime = now;
  lastRandom = random;
  let time = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  return time + random.map((r) => ALPHABET[r]).join('');
}

function increment(digits: number[]): number[] {
  const next = [...digits];
  for (let i = next.length - 1; i >= 0; i--) {
    if ((next[i] ?? 0) < 31) {
      next[i] = (next[i] ?? 0) + 1;
      return next;
    }
    next[i] = 0;
  }
  return next;
}
