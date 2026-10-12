/**
 * Developer helper: talks to a running BubbleVerse webview over the Chrome DevTools Protocol.
 * Start the app with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222, then:
 *   node scripts/cdp.ts <page-substring> [ms-to-collect-console] [js-expression]
 * Prints console messages, exceptions and the expression's result.
 * With CDP_SHOT=<file.png> it also saves a screenshot of the page.
 */
const [target = 'main', waitArg = '1500', expr] = process.argv.slice(2);
const port = process.env.CDP_PORT ?? '9222';

interface PageInfo {
  url: string;
  type: string;
  webSocketDebuggerUrl: string;
}

// Waits up to a minute for the app (and the page) to come up.
let pages: PageInfo[] = [];
let page: PageInfo | undefined;
for (let i = 0; i < 60 && !page; i++) {
  try {
    pages = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as PageInfo[];
    page = pages.find((p) => p.type === 'page' && p.url.includes(target));
  } catch {
    /* not up yet */
  }
  if (!page) await new Promise((r) => setTimeout(r, 1000));
}
if (!page) {
  console.error(`no page matching "${target}". Pages: ${pages.map((p) => p.url).join(', ')}`);
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map<number, (v: unknown) => void>();
const send = (method: string, params: Record<string, unknown> = {}) =>
  new Promise<unknown>((resolve) => {
    const msgId = ++id;
    pending.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

ws.onmessage = (ev) => {
  const msg = JSON.parse(String(ev.data));
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)?.(msg.result ?? msg.error);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const args = msg.params.args.map((a: { value?: unknown; description?: string }) =>
      a.value !== undefined ? JSON.stringify(a.value) : a.description,
    );
    console.log(`[console.${msg.params.type}] ${args.join(' ')}`);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    console.log(`[exception] ${d.exception?.description ?? d.text}`);
  } else if (msg.method === 'Log.entryAdded') {
    console.log(
      `[log.${msg.params.entry.level}] ${msg.params.entry.text} ${msg.params.entry.url ?? ''}`,
    );
  }
};

await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable');
await send('Log.enable');
if (expr) {
  const res = (await send('Runtime.evaluate', {
    expression: expr,
    awaitPromise: true,
    returnByValue: true,
  })) as {
    result?: { value?: unknown; description?: string };
    exceptionDetails?: { text: string };
  };
  console.log('[result]', JSON.stringify(res.result?.value ?? res.result?.description ?? res));
}
await new Promise((r) => setTimeout(r, Number(waitArg)));
if (process.env.CDP_SHOT) {
  const shot = (await send('Page.captureScreenshot', { format: 'png' })) as { data?: string };
  if (shot.data) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(process.env.CDP_SHOT, Buffer.from(shot.data, 'base64'));
    console.log('[screenshot]', process.env.CDP_SHOT);
  }
}
ws.close();

export {};
