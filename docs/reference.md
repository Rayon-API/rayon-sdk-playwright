# Playwright adapter reference

## Managed generation

`generateManaged({ source_url, profile, request, document_cookie? }, options?)`
uses current registered public material in header mode. Omit both material fields
on every automatic call. It needs no page or collector. `fallback_reason` and
`fallback_message` are retained by the core SDK; report fallback with the request
ID. Explicit `generate(material, input, options?)` remains unchanged.

## Collection contract

The collector passively observes main-frame script requests started during the
callback. Cross-origin script responses are supported. It never downloads missing
URLs, discovers protection scripts, logs in, changes browser identity or retries
the callback. Responses loaded before collection, iframe/worker scripts, inline
scripts, and requests handled without a readable Playwright response are not
collected. A missing response fails rather than returning partial material.

URLs must be absolute, canonical HTTP(S) URLs without fragments or embedded
credentials. Supply 1–16 unique URLs. Sources are capped at 2 MiB each and 3 MiB combined as exposed by
Playwright. Chromium may normalize a source encoding or strip a leading BOM;
this captures the complete Playwright source, not original wire bytes. Only successful JavaScript/ecmascript or text/plain responses are
accepted; HTML, redirects, empty sources, duplicate observed URLs and invalid UTF-8 in the exposed response
fail. The returned list follows `scriptUrls`, regardless of network completion
order. Script order and protection selection remain the caller's responsibility.

One main-document navigation is allowed in the callback. Redirected or repeated
navigations and scripts from a previous document fail to prevent mixing sessions.
Call collection again for a different document. Only one collection per page per
adapter may run at a time; avoid other collectors or concurrent mutations of that
page/context while collecting. Service workers and unusual caching strategies can
make responses unavailable; use explicitly prepared material for those flows.

The default overall collection deadline is 30 seconds (configurable from 1 ms to
5 minutes), including callback execution, response bodies and profile evaluation.
Listeners are removed on every outcome. Timeout, abort, disposal or failure aborts
the callback's signal. JavaScript cannot forcibly cancel an arbitrary caller
callback or Playwright response-body/evaluate operation. Honor the signal, set
appropriate Playwright operation timeouts, and await your own unfinished work
before reusing the page. Playwright buffers response bodies before their actual
size can be checked; Content-Length is checked early when provided. The limits
bound accepted material, not browser/network memory use for malicious responses.

## Profile and cookies

After the callback and required bodies complete, `page.evaluate` reads supported
navigator, screen, window and available WebGL renderer/vendor values from the main
document. It does not change these values. No API key is sent into the browser.
Canvas pixels are omitted: an arbitrary canvas drawing is not a measurement of
the protection's canvas operation. WebGL may be absent or restricted. Omitted
profile fields use API emulation defaults, which are not browser measurements.
This limited profile is not a complete browser replay or a guarantee of target
acceptance. Supply additional correctly measured supported values when required.

`includeDocumentCookie` defaults to `false`. When enabled, only `document.cookie`
from the final main document is read; HttpOnly and other origins' cookies are
never accessed. Browser-context cookie export and session automation are outside
this adapter. Keep collected material and cookies private.

## Form mode and errors

```typescript
const result = await rayon.generate(material, {
  mode: 'form',
  form: { id: 'checkout' },
  request: {
    url: 'https://example.com/submit', method: 'POST',
    content_type: 'application/x-www-form-urlencoded',
    body: 'tag=one&tag=two&csrf=a%2Bb',
  },
});
// result.form_fields / result.form_body contain telemetry only.
// Prepend form_body once to the exact application body with your target client.
```

See [form payload integration](https://docs.rayonapi.com/form-payload-integration).
Header/form result types, validation, redacted inspection, caching and API errors
are delegated to `rayon-sdk-js`. The adapter adds no generation retries. The core
may recover once only after a confirmed uncharged material miss; ambiguous billing
outcomes are never automatically retried. Check request history before retrying
an uncertain result. See [API error guidance](https://docs.rayonapi.com/errors).

Collection throws `MaterialCollectionError` with a constant, private-data-free
message and `code`: `invalid_options`, `invalid_response`, `size_limit`, `redirect`,
`stale_material`, `duplicate_script`, `missing_scripts`, `timeout`, `aborted`,
`disposed`, `page_closed`, `action_failed`, `profile_failed`, or
`collection_in_progress`. Caller exceptions are not attached as causes. API calls
retain the core `RayonError` and its billing/retry metadata.

`close()` and its alias `dispose()` abort active collections and close the owned
core client. They do not close any Playwright resource. No generated value is
applied to the page or target automatically. Target responses establish acceptance.
