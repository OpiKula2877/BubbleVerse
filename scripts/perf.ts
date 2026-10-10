/**
 * Performance test (spec §12): loads the 200 and 1000 bubble scenes in the running app and
 * measures FPS and frame time against the targets of spec §10.2.
 *
 * Start the app for development with DevTools access first:
 *   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 pnpm tauri dev
 * then:
 *   node scripts/perf.ts
 */
const port = process.env.CDP_PORT ?? '9222';

interface PageInfo {
  url: string;
  type: string;
  webSocketDebuggerUrl: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function connect(): Promise<{ ev: (expr: string) => Promise<unknown>; close: () => void }> {
  let page: PageInfo | undefined;
  for (let i = 0; i < 30 && !page; i++) {
    try {
      const pages = (await (
        await fetch(`http://127.0.0.1:${port}/json/list`)
      ).json()) as PageInfo[];
      page = pages.find((p) => p.type === 'page' && p.url.includes('/main/'));
    } catch {
      /* not up yet */
    }
    if (!page) await sleep(1000);
  }
  if (!page) throw new Error('the app window is not reachable on the DevTools port');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map<number, (v: unknown) => void>();
  ws.onmessage = (m) => {
    const d = JSON.parse(String(m.data)) as {
      id?: number;
      result?: { result?: { value?: unknown } };
    };
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)!(d.result?.result?.value);
      pending.delete(d.id);
    }
  };
  const ev = (expression: string) =>
    new Promise<unknown>((resolve) => {
      const i = ++id;
      pending.set(i, resolve);
      ws.send(
        JSON.stringify({
          id: i,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      );
    });
  return { ev, close: () => ws.close() };
}

const SCENES: { count: number; target: number; zooms: number[] }[] = [
  { count: 200, target: 60, zooms: [0.2, 0.5, 1] },
  { count: 1000, target: 45, zooms: [0.2, 0.5, 1] },
];

let failed = false;
for (const scene of SCENES) {
  let c = await connect();
  await c.ev(`location.search = '?scene=${scene.count}'`);
  c.close();
  await sleep(6000);
  c = await connect();
  for (const zoom of scene.zooms) {
    const result = (await c.ev(`(async () => {
      const s = window.bvStore;
      s.renderer.setCamera({ x: 0, y: 0, zoom: ${zoom} });
      await new Promise(r => setTimeout(r, 2500));
      const fps = [], ms = [];
      for (let i = 0; i < 4; i++) {
        await new Promise(r => setTimeout(r, 1000));
        fps.push(s.stats.fps); ms.push(s.stats.frameMs);
      }
      return { fps: Math.min(...fps), ms: Math.max(...ms) };
    })()`)) as { fps: number; ms: number };
    const ok = result.fps >= scene.target * 0.95;
    if (!ok) failed = true;
    console.log(
      `${ok ? 'ok  ' : 'SLOW'} ${String(scene.count).padStart(4)} bubbles, zoom ${zoom}: ${result.fps} FPS (target ${scene.target}), frame ${result.ms} ms`,
    );
  }
  c.close();
}
process.exit(failed ? 1 : 0);
