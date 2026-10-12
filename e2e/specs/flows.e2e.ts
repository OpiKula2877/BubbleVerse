import { browser, expect } from '@wdio/globals';

/**
 * The end-to-end flows of spec §12. The app is a debug build served by the dev server, so
 * the store is reachable as `window.bvStore` for setting up and checking state; the user's
 * steps (shortcuts, typing, clicks) go through the real UI.
 */

/** The app has several webviews (app, search bar, wallpaper); the tests drive the app window. */
async function toAppWindow(): Promise<void> {
  await browser.waitUntil(
    async () => {
      for (const handle of await browser.getWindowHandles()) {
        await browser.switchToWindow(handle);
        if ((await browser.getUrl()).includes('/main/')) return true;
      }
      return false;
    },
    { timeout: 30_000, interval: 500 },
  );
}

const ready = async () => {
  await toAppWindow();
  await browser.waitUntil(
    () =>
      browser.execute(
        () => !!(window as unknown as { bvStore?: { ready: boolean } }).bvStore?.ready,
      ),
    {
      timeout: 30_000,
    },
  );
};

/** Runs code in the app window with the store and the core. */
function inApp<T>(fn: string): Promise<T> {
  return browser.execute(
    `return (async () => { const s = window.bvStore; ${fn} })()`,
  ) as Promise<T>;
}

describe('BubbleVerse', () => {
  before(ready);

  it('creates a bubble, saves it, finds it with Ctrl+F and runs it', async () => {
    await browser.keys(['Control', 'e']);
    await browser.waitUntil(() => inApp<boolean>('return !!s.editor;'));
    // A main action bubble whose script sets a global variable when activated.
    await inApp(`
      const ed = s.editor;
      ed.create('action', null, { x: 0, y: 0 }, { x: 400, y: 300 });
      const id = ed.selected[0];
      ed.apply((w) => ({ ...w, bubbles: w.bubbles.map((b) => b.id === id ? { ...b, name: 'E2E Target', scripts: [{ kind: 'inline', script: { v: 1, trigger: [1], body: [[220, 'g:e2e', 'ran']], runMode: 'ignore' } }] } : b) }));
      ed.quickCreate = null;
    `);
    await browser.keys(['Control', 's']);
    await browser.waitUntil(() => inApp<boolean>('return !s.editor.dirty;'));
    await browser.keys(['Control', 'e']);
    await browser.waitUntil(() => inApp<boolean>('return !s.editor;'));
    await browser.keys(['Control', 'f']);
    await browser.keys('E2E Target'.split(''));
    await browser.keys('Enter');
    await browser.waitUntil(
      async () =>
        (await inApp<Record<string, unknown>>('return await s.core.call("get_globals");')).e2e ===
        'ran',
      {
        timeout: 10_000,
      },
    );
  });

  it('creates bubbles with the bulk generator', async () => {
    await browser.keys(['Control', 'e']);
    await browser.waitUntil(() => inApp<boolean>('return !!s.editor;'));
    const before = await inApp<number>('return s.world.bubbles.length;');
    await inApp(
      `s.editor.modal = { kind: 'generator', parentId: null, files: ['C:/Windows/notepad.exe', 'C:/Windows/regedit.exe'] };`,
    );
    const create = await browser.$('button*=Create');
    await create.waitForClickable();
    await create.click();
    await browser.waitUntil(
      async () => (await inApp<number>('return s.world.bubbles.length;')) === before + 2,
    );
    const names = await inApp<string[]>('return s.world.bubbles.map((b) => b.name);');
    expect(names).toContain('notepad');
    expect(names).toContain('regedit');
  });

  it('warns about dangerous blocks when importing a package', async () => {
    const path = await inApp<string>(`
      const dir = (await s.core.call('data_info')).dir;
      const path = dir + '\\\\e2e.bubble';
      const branch = { bubbles: [{ id: 'x', parentId: null, kind: 'action', name: 'Danger', order: 0, position: { x: 0, y: 0 }, attach: 'world',
        skin: { mode: 'own', skin: { shape: 'circle', size: 100, fill: '#ff0000' } }, motion: {}, physics: {},
        link: { inherit: true, type: 'line', color: '#ffffff', width: 1, opacity: 1 }, hover: { grow: true, shake: false, glow: false, tooltip: true },
        scripts: [{ kind: 'inline', script: { v: 1, trigger: [1], body: [[303, 'dir', 'hidden', 's:']], runMode: 'ignore' } }] }],
        sharedScripts: [], customBlocks: [], globals: [], templates: [] };
      await s.core.call('export_package', { path, manifest: { format: 1, app: 'e2e', name: 'Danger', root: 'x', bubbles: 1, created: 0 }, branch });
      return path;
    `);
    await inApp(`
      const r = await s.core.call('import_package', { path: ${JSON.stringify(path)} });
      s.editor.modal = { kind: 'import', pkg: { manifest: r.manifest, data: r.branch }, parentId: null };
    `);
    const warning = await browser.$('.imp .warn');
    await warning.waitForDisplayed();
    expect(await warning.getText()).toMatch(/1/);
    await (await browser.$('button=Import')).click();
    await browser.waitUntil(() =>
      inApp<boolean>('return s.world.bubbles.some((b) => b.name === "Danger");'),
    );
  });
});
