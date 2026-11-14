# Rayon Playwright SDK

Use managed public material without collecting scripts. Your integration keeps
control of its browser, HTTP client and target session. The adapter never launches
a browser or sends the target request.

## Install

Requires the preparation-required server and core SDK 3.0.1 or newer within major 3.

Requires Node.js 20.18.1+ and your existing Playwright setup. ESM, CommonJS and
TypeScript are included.

```sh
npm install rayon-sdk-playwright@^2.0.1 playwright-core
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
  // Apply every result.headers entry, including optional a0, with your target client.
} finally {
  await client.close();
}
```

Replace the reserved URLs with your approved supported public source and endpoint.
`profile: {}` uses the default managed profile. Supply supported measured profile
values directly for managed generation. Use the optional collection and preparation
flow below for your own material. Keep `scripts` and `material_ref`
omitted on later automatic calls so updates are selected.
No page capture or preparation is required for this flow. Managed form mode is
not supported; use explicit material for form telemetry.

Successful preparation fallback preserves `path: isolated` and
`fallback_reason: material_preparing`. The core client advertises support
automatically; the application request body stays unchanged.

Generation errors include safe request metadata. Retain the request ID for support.
Custom uploads stay private.

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
    const targetRequest = {
      url:'https://example.com/submit', method:'POST',
      content_type:'application/json', body:' {"item": 1}\n',
    };
    const ready = await rayon.prepareAndWait(material, { request: targetRequest });
    const { scripts, ...context } = material;
    return await rayon.generate({ ...context, material_ref: ready.material_ref,
      request: targetRequest,
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
change. Pass collected sources to preparation, then use the ready reference for generation.
Form mode returns `form_fields` and `form_body`.

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

## Required custom preparation

`collectMaterial` returns `CollectedMaterial`, not server readiness. The ambiguous
`PreparedMaterial` collection alias has been removed; use `ReadyMaterial` for
confirmed server readiness. Prepare custom material
before generation:

```typescript
const collected = await client.collectMaterial(page, collectionOptions);
const job = await client.prepareMaterial(collected, { request: targetRequest });
const ready = await client.waitUntilReady(job.preparation_id);
// Or: await client.prepareAndWait(collected, { request: targetRequest });
const { scripts, ...context } = collected;
const result = await client.generate({ ...context, request: targetRequest, material_ref: ready.material_ref });
```

Preparation can take several minutes; wait helpers allow 30 minutes by default.
`getPreparation` and bounded wait helpers remain available. Wait timeout or abort
leaves the server job running; resume with the typed error's `preparationId`.
Only successfully validated material becomes ready. Readiness expires separately
from the source reference.

[Quickstart](https://docs.rayonapi.com/quickstart) · [Adapter reference](docs/reference.md) ·
[Release instructions](RELEASE.md)
