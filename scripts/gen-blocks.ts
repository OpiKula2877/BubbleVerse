/**
 * Generates the Blockly-side catalog (TypeScript) and the interpreter opcodes (Rust)
 * from packages/blocks/catalog.yaml. `--check` fails when the generated files are stale.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse } from 'yaml';
import {
  generateHelpTs,
  generateRust,
  generateTs,
  normalize,
  validateCatalog,
  validateHelp,
  type BlockHelp,
} from './gen-blocks-lib.ts';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'packages/blocks/catalog.yaml');
const catalog = normalize(parse(readFileSync(source, 'utf8')));
const help = parse(readFileSync(resolve(root, 'packages/blocks/help.yaml'), 'utf8')) as Record<
  string,
  BlockHelp
>;

const outputs = [
  { path: resolve(root, 'packages/blocks/src/generated/catalog.ts'), gen: generateTs },
  { path: resolve(root, 'src-tauri/src/script/generated/opcodes.rs'), gen: generateRust },
  {
    path: resolve(root, 'packages/blocks/src/generated/help.ts'),
    gen: () => generateHelpTs(help),
  },
];

const errors = [...validateCatalog(catalog), ...validateHelp(catalog, help)];
if (errors.length) {
  console.error(`catalog.yaml or help.yaml is invalid:\n  ${errors.join('\n  ')}`);
  process.exit(1);
}

const check = process.argv.includes('--check');
let stale = false;
for (const out of outputs) {
  const content = out.gen(catalog);
  const current = existsSync(out.path) ? readFileSync(out.path, 'utf8') : '';
  if (current === content) continue;
  if (check) {
    console.error(`stale: ${out.path} (run pnpm gen:blocks)`);
    stale = true;
  } else {
    mkdirSync(dirname(out.path), { recursive: true });
    writeFileSync(out.path, content);
    console.log(`wrote ${out.path}`);
  }
}
if (stale) process.exit(1);
console.log(
  `catalog OK: ${catalog.blocks.length} blocks in ${catalog.categories.length} categories`,
);
