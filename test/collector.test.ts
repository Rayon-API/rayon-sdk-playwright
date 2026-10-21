import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { chromium, type Browser, type Page } from 'playwright-core';
import { RayonPlaywright, MaterialCollectionError } from '../src/index.js';
let server: Server, cross: Server, origin: string, other: string, browser: Browser;
const hits: string[] = [];
before(async () => {
    cross = createServer((req, res) => {
        res.setHeader('Content-Type', 'application/javascript');
        res.end('window.crossFixture = true;');
    });
    await new Promise<void>(r => cross.listen(0, '127.0.0.1', r));
    other = `http://localhost:${(cross.address() as any).port}`;
    server = createServer((req, res) => {
        hits.push(req.url!);
        if (req.url === '/page') {
            res.setHeader('Content-Type', 'text/html');
            res.setHeader('Set-Cookie', ['visible=local; Path=/', 'hidden=local; HttpOnly; Path=/']);
            res.end(`<script src="/b.js"></script><script src="/a.js"></script><script src="${other}/cross.js"></script>`);
        }
        else if (req.url === '/bom.js') {
            res.setHeader('Content-Type', 'application/javascript');
            res.end('\ufeff/* exact BOM */');
        }
        else if (req.url === '/html.js') {
            res.setHeader('Content-Type', 'text/html');
            res.end('<html>secret-cookie</html>');
        }
        else if (req.url === '/redirect.js') {
            res.writeHead(302, { Location: '/a.js' });
            res.end();
        }
        else if (req.url === '/bad.js') {
            res.writeHead(403, { 'Content-Type': 'application/javascript' });
            res.end('secret');
        }
        else if (req.url?.startsWith('/large-')) {
            res.setHeader('Content-Type', 'application/javascript');
            res.end('/*' + 'x'.repeat(1600 * 1024) + '*/');
        }
        else if (req.url === '/huge.js') {
            res.setHeader('Content-Type', 'application/javascript');
            res.end('x'.repeat(2 * 1024 * 1024 + 1));
        }
        else {
            res.setHeader('Content-Type', 'application/javascript');
            res.end(`window.fixture = ${JSON.stringify(req.url)};`);
        }
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    origin = `http://127.0.0.1:${(server.address() as any).port}`;
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
});
after(async () => {
    await browser?.close();
    await Promise.all([new Promise<void>(r => server?.close(() => r())), new Promise<void>(r => cross?.close(() => r()))]);
});
async function fixture(run: (page: Page, sdk: RayonPlaywright) => Promise<void>) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const sdk = new RayonPlaywright('fixture-private-key');
    try {
        await run(page, sdk);
    }
    finally {
        await sdk.close();
        await context.close();
    }
}
const code = (expected: string) => (error: unknown) => error instanceof MaterialCollectionError && error.code === expected && !String(error).includes('secret');
test('collects exact ordered full sources across origins after caller navigation; cookies opt in', async () => fixture(async (page, sdk) => {
    const before = hits.length;
    const material = await sdk.collectMaterial(page, { scriptUrls: [`${origin}/a.js`, `${other}/cross.js`, `${origin}/b.js`], action: async (p) => {
            await p.goto(`${origin}/page`);
        } });
    assert.deepEqual(material.scripts.map(s => s.url), [`${origin}/a.js`, `${other}/cross.js`, `${origin}/b.js`]);
    assert.equal(material.scripts[0].source, 'window.fixture = "/a.js";');
    assert.equal(material.source_url, `${origin}/page`);
    assert.equal(material.profile.user_agent, await page.evaluate(() => navigator.userAgent));
    assert.equal(material.profile.navigator?.webdriver, true);
    assert.equal(material.profile.canvas, undefined);
    assert.equal(material.document_cookie, undefined);
    assert.equal(hits.slice(before).filter(x => x === '/page').length, 1);
    const withCookie = await sdk.collectMaterial(page, { scriptUrls: [`${origin}/a.js`], includeDocumentCookie: true, action: async (p) => {
            await p.reload();
        } });
    assert.equal(withCookie.document_cookie, 'visible=local');
}));
test('does not collect old responses or issue a fallback fetch', async () => fixture(async (page, sdk) => {
    await page.goto(`${origin}/page`);
    const before = hits.length;
    await assert.rejects(sdk.collectMaterial(page, { scriptUrls: [`${origin}/a.js`], timeoutMs: 50, action: async () => {
        } }), code('missing_scripts'));
    assert.equal(hits.length, before);
}));
test('rejects duplicate input without invoking action', async () => fixture(async (page, sdk) => {
    let called = false;
    await assert.rejects(sdk.collectMaterial(page, { scriptUrls: [`${origin}/a.js`, `${origin}/a.js`], action: async () => {
            called = true;
        } }), code('invalid_options'));
    assert.equal(called, false);
}));
for (const [path, expected] of [['html.js', 'invalid_response'], ['bad.js', 'invalid_response'], ['redirect.js', 'redirect'], ['huge.js', 'size_limit']] as const) {
    test(`rejects ${path} safely`, async () => fixture(async (page, sdk) => {
        await page.goto(origin);
        await assert.rejects(sdk.collectMaterial(page, { scriptUrls: [`${origin}/${path}`], action: async (p) => {
                await p.addScriptTag({ url: `${origin}/${path}` }).catch(() => {
                });
            } }), code(expected));
    }));
}
test('rejects duplicate observed scripts and removes listeners', async () => fixture(async (page, sdk) => {
    await page.goto(origin);
    const responses = page.listenerCount('response'), requests = page.listenerCount('request');
    await assert.rejects(sdk.collectMaterial(page, { scriptUrls: [`${origin}/a.js`], action: async (p) => {
            await p.addScriptTag({ url: `${origin}/a.js` });
            await p.addScriptTag({ url: `${origin}/a.js` });
        } }), code('duplicate_script'));
    assert.equal(page.listenerCount('response'), responses);
    assert.equal(page.listenerCount('request'), requests);
}));
test('timeout detaches listeners and signals caller action', async () => fixture(async (page, sdk) => {
    const before = page.listenerCount('response');
    let signal: AbortSignal | undefined;
    await assert.rejects(sdk.collectMaterial(page, { scriptUrls: [`${origin}/a.js`], timeoutMs: 30, action: async (_, s) => {
            signal = s;
            await new Promise(r => setTimeout(r, 100));
        } }), code('timeout'));
    assert.equal(signal?.aborted, true);
    assert.equal(page.listenerCount('response'), before);
}));
test('close aborts collection without closing caller page/context', async () => fixture(async (page, sdk) => {
    const pending = sdk.collectMaterial(page, { scriptUrls: [`${origin}/a.js`], action: async () => {
            await new Promise(r => setTimeout(r, 100));
        } });
    await sdk.close();
    await assert.rejects(pending, code('disposed'));
    assert.equal(page.isClosed(), false);
    assert.equal(page.listenerCount('response'), 0);
}));
test('rejects navigation after collecting material from an earlier document', async () => fixture(async (page, sdk) => {
    await page.goto(origin);
    await assert.rejects(sdk.collectMaterial(page, { scriptUrls: [`${origin}/a.js`], action: async (p) => {
            await p.addScriptTag({ url: `${origin}/a.js` });
            await p.goto(origin + '/next');
        } }), code('stale_material'));
}));
test('caller action exceptions are redacted and cleaned up', async () => fixture(async (page, sdk) => {
    await assert.rejects(sdk.collectMaterial(page, { scriptUrls: [`${origin}/a.js`], action: async () => {
            throw new Error('secret fixture-private-key');
        } }), code('action_failed'));
    assert.equal(page.listenerCount('response'), 0);
}));
test('keeps deadline active during profile evaluation', async () => fixture(async (page, sdk) => {
    await page.goto(origin);
    const evaluate = page.evaluate.bind(page);
    // Browser profile collection can stall; this controlled transport stall must remain bounded.
    page.evaluate = (() => new Promise(() => {
    })) as typeof page.evaluate;
    try {
        await assert.rejects(sdk.collectMaterial(page, { scriptUrls: [`${origin}/a.js`], timeoutMs: 75, action: async (p) => {
                await p.addScriptTag({ url: `${origin}/a.js` });
            } }), code('timeout'));
        assert.equal(page.listenerCount('response'), 0);
    }
    finally {
        page.evaluate = evaluate;
    }
}));
test('external abort and parallel same-page collection are rejected safely', async () => fixture(async (page, sdk) => {
    const abort = new AbortController();
    const pending = sdk.collectMaterial(page, { scriptUrls: [`${origin}/a.js`], signal: abort.signal, action: async () => {
            await new Promise(r => setTimeout(r, 100));
        } });
    await assert.rejects(sdk.collectMaterial(page, { scriptUrls: [`${origin}/a.js`], action: async () => {
        } }), code('collection_in_progress'));
    abort.abort();
    await assert.rejects(pending, code('aborted'));
    assert.equal(page.listenerCount('response'), 0);
}));
test('does not mix iframe script material into the main document', async () => fixture(async (page, sdk) => {
    await page.goto(origin);
    await assert.rejects(sdk.collectMaterial(page, { scriptUrls: [`${origin}/a.js`], timeoutMs: 120, action: async (p) => {
            await p.evaluate(url => {
                const iframe = document.createElement('iframe');
                iframe.src = url;
                document.body.append(iframe);
            }, `${origin}/page`);
            await p.waitForTimeout(70);
        } }), code('missing_scripts'));
}));
test('rejects aggregate material over 3 MiB', async () => fixture(async (page, sdk) => {
    await page.goto(origin);
    await assert.rejects(sdk.collectMaterial(page, { scriptUrls: [`${origin}/large-a.js`, `${origin}/large-b.js`], action: async (p) => {
            await p.addScriptTag({ url: `${origin}/large-a.js` });
            await p.addScriptTag({ url: `${origin}/large-b.js` });
        } }), code('size_limit'));
}));
test('disposal before the action microtask prevents caller action execution', async () => fixture(async (page, sdk) => {
    let called = false;
    const pending = sdk.collectMaterial(page, { scriptUrls: [`${origin}/a.js`], action: async () => {
            called = true;
        } });
    await sdk.dispose();
    await assert.rejects(pending, code('disposed'));
    assert.equal(called, false);
}));
test('preserves the complete source exposed by Playwright, including its encoding normalization', async () => fixture(async (page, sdk) => {
    await page.goto(origin);
    const response = page.waitForResponse(`${origin}/bom.js`);
    const material = await sdk.collectMaterial(page, { scriptUrls: [`${origin}/bom.js`], action: async (p) => {
            await p.addScriptTag({ url: `${origin}/bom.js` });
        } });
    const browserSource = (await (await response).body()).toString('utf8');
    assert.equal(material.scripts[0].source, browserSource);
    assert.ok(material.scripts[0].source.includes('/* exact BOM */'));
}));
