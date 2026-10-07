import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { checkCss, checkSvelte } from './hardcoded.ts';

const root = resolve(import.meta.dirname, '..');
const dirs = ['apps', 'packages'];

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'generated') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (p.endsWith('.svelte') || p.endsWith('.css')) yield p;
  }
}

let count = 0;
for (const d of dirs) {
  for (const f of files(join(root, d))) {
    const src = readFileSync(f, 'utf8');
    for (const x of f.endsWith('.css') ? checkCss(src) : checkSvelte(src)) {
      console.error(`${relative(root, f)}:${x.line} hardcoded ${x.kind}: ${x.snippet}`);
      count++;
    }
  }
}
if (count) {
  console.error(`\n${count} hardcoded texts/colors. Use i18n keys and theme tokens.`);
  process.exit(1);
}
console.log('no hardcoded UI texts or colors');
