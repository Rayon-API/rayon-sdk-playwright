# Rayon Playwright SDK

Use managed public material without collecting scripts. Your integration keeps
control of its browser, HTTP client and target session. The adapter never launches
a browser or sends the target request.

## Install

Requires Node.js 20.18.1+ and your existing Playwright setup. ESM, CommonJS and
TypeScript are included.

```sh
npm install rayon-sdk-playwright@^1.1.0 playwright-core
```

## Generate with managed material

```typescript
import { RayonPlaywright } from 'rayon-sdk-playwright';

const apiKey = process.env.RAYON_API_KEY;
if (!apiKey) throw new Error('Set RAYON_API_KEY');
const client = new RayonPlaywright(apiKey);
try {
  const result = await client.generateManaged({
    source_url: 'https://shop.example.com/account',
    profile: {},
    request: {
      url: 'https://shop.example.com/api/check', method: 'POST',
      content_type: 'application/json', body: '{}',
    },
  });
  if (result.fallback_reason) {
    console.warn('A fallback was used. Contact support with request ID:', result.request_id);
  }
  // Apply every result.headers entry, including optional a0, with your target client.
} finally {
  await client.close();
}
```

Replace the reserved URLs with your approved supported public source and endpoint.
`profile: {}` uses defaults; supply measured values when needed. Keep `scripts`
and `material_ref` omitted on later automatic calls so updates are selected.
No page capture or preparation is required for this flow. Managed form mode is
not supported; use explicit material for form telemetry.

Fallback and operation metadata come from the core SDK. A non-null
`fallback_reason` means a fallback was used; report the request ID to support.
Timing alone does not identify fallback. Customer uploads stay private.

## Optional collection from an existing page

Use collection when you need to supply your own material. You own the `Page`,
profile and session. Collection does not establish server readiness.

```typescript
import { RayonPlaywright } from 'rayon-sdk-playwright';
import type { Page } from 'playwright-core';

async function generateForPage(page: Page) {
  const apiKey = process.env.RAYON_API_KEY;
  if (!apiKey) throw new Error('Set RAYON_API_KEY');
  const rayon = new RayonPlaywright(apiKey);
  try {
    const usage = await rayon.usage(); // Free; no generation quota used.
    const material = await rayon.collectMaterial(page, {
      scriptUrls: ['https://example.com/protection.js'], // Known, ordered URLs.
      action: async (page, signal) => {
        signal.throwIfAborted();
        await page.goto('https://example.com/source', { timeout: 25_000 });
      },
      // includeDocumentCookie: true, // Opt in only when required.
    });
    return await rayon.generate(material, {
      request: {
        url: 'https://example.com/submit', method: 'POST',
        content_type: 'application/json', body: ' {"item": 1}\n',
      },
    });
  } finally {
    await rayon.close(); // Leaves your page/context/browser open.
  }
}
```

Apply returned `headers` unchanged using your existing target client/session.
The adapter never sends the target request or applies output automatically.
Keep one client across generations for connection pooling and explicit material reuse. Supply the exact current
request every time; recollect or update snapshots when scripts, profile or cookies
change. Collected `{ source_url, scripts, profile, document_cookie? }` also works
with `generate` directly. Form mode returns `form_fields` and `form_body`.

Collection observes only the explicitly listed main-frame script requests started
during `action`. Default deadline: 30 seconds. Limits: 16 scripts, 2 MiB each,
3 MiB combined. Cookies are opt-in and never include HttpOnly cookies. Captured
profiles omit canvas pixels; omitted fields use API defaults, not measurements.
Honor the action's abort signal and set Playwright timeouts. Read the
[reference](docs/reference.md) for collection/cancellation and encoding limits.

API errors, output types, caching and retry policy come from `rayon-sdk-js`.
Check request history before resubmitting an uncertain billing outcome. See
[error guidance](https://docs.rayonapi.com/errors),
[profiles and sessions](https://docs.rayonapi.com/profiles-and-sessions), and
[form integration](https://docs.rayonapi.com/form-payload-integration).

Development: `npm ci`, `npx playwright-core install chromium`, `npm test`,
`npm run build`, `npm run test:package`. Tests use local fixtures only. Set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to reuse a browser. See
[release instructions](RELEASE.md), [security](SECURITY.md), and [license](LICENSE).

## Optional server preparation

`collectMaterial` returns `CollectedMaterial`; the deprecated `PreparedMaterial`
alias means collected inputs, not server readiness. To check explicit material
before a workload:

```typescript
const collected = await client.collectMaterial(page, collectionOptions);
const job = await client.prepareMaterial(collected, { request: targetRequest });
const ready = await client.waitUntilReady(job.preparation_id, { waitTimeoutMs: 60_000 });
// Or: await client.prepareAndWait(collected, { request: targetRequest });
const result = await client.generate(collected, { request: targetRequest });
```

`getPreparation` and bounded wait helpers remain available. Wait timeout or abort
leaves the server job running; resume with the typed error's `preparationId`.
Usable validated defaulted mappings can become ready. Required output validation
still applies. Readiness expires separately from the source reference.

[Quickstart](https://docs.rayonapi.com/quickstart) · [Adapter reference](docs/reference.md) ·
[Release instructions](RELEASE.md)
