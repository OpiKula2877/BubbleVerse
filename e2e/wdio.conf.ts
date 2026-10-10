/**
 * End-to-end tests (spec §12) with tauri-driver and WebdriverIO.
 *
 * Needs, once:  cargo install tauri-driver
 *               msedgedriver.exe matching the installed WebView2 version, path in MSEDGEDRIVER
 * Run:          pnpm dev   (the debug app loads the dev server)
 *               cd src-tauri && cargo build
 *               pnpm test:e2e
 * The app runs windowed with its own temporary data folder, so real data is never touched.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
let driver: ChildProcess | null = null;

export const config: WebdriverIO.Config = {
  runner: 'local',
  host: '127.0.0.1',
  port: 4444,
  specs: [join(root, 'e2e/specs/**/*.e2e.ts')],
  maxInstances: 1,
  capabilities: [
    {
      // @ts-expect-error tauri-driver's own capability
      'tauri:options': {
        application: join(root, 'src-tauri/target/debug/bubbleverse.exe'),
      },
    },
  ],
  logLevel: 'warn',
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 120_000 },

  beforeSession: () => {
    const data = mkdtempSync(join(tmpdir(), 'bubbleverse-e2e-'));
    const native = process.env.MSEDGEDRIVER;
    driver = spawn('tauri-driver', native ? ['--native-driver', native] : [], {
      stdio: [null, process.stdout, process.stderr],
      env: { ...process.env, BV_WINDOWED: '1', BUBBLEVERSE_DATA: data },
    });
  },

  afterSession: () => {
    driver?.kill();
    driver = null;
  },
};
