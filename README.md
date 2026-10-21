# Rayon Playwright SDK

Optional collection for integrations already using Playwright. Your integration
owns the existing page, browser context and target session. Prepared inputs can
use [rayon-sdk-js](https://github.com/Rayon-API/rayon-sdk-js) without Playwright.

[Quickstart](https://docs.rayonapi.com/quickstart) ·
[Required inputs](https://docs.rayonapi.com/material) ·
[Collection, profiles, limits and errors](docs/reference.md)

Source is public; the npm release is pending. Build a source checkout:

```sh
git clone https://github.com/Rayon-API/rayon-sdk-playwright.git
cd rayon-sdk-playwright
npm ci
npm run build
```

In your application: `npm install /absolute/path/to/rayon-sdk-playwright`.
After the npm release: `npm install rayon-sdk-playwright playwright-core`.

Use your existing Playwright installation and browser. Requires Node.js 20.18.1+;
includes ESM, CommonJS and TypeScript. The adapter downloads or launches no browser.

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
Keep one client across generations for material caching. Supply the exact current
request every time; recollect or update snapshots when scripts, profile or cookies
change. Prepared `{ source_url, scripts, profile, document_cookie? }` also works
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
