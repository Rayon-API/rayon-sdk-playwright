# Release

This repository is prepared for the public package `rayon-sdk-playwright`.
No publication is performed by tests, local builds or CI.

Before publication, confirm npm ownership of the package name and create/verify
the intended `Rayon-API/rayon-sdk-playwright` repository. Review metadata, README
and compatibility with the published `rayon-sdk-js` dependency. Update the version
and lockfile together, then run from a clean, reviewed checkout:

```sh
npm ci
npx playwright-core install --with-deps chromium
npm test
npm run build
npm run test:package
npm pack --dry-run
```

CI covers Node.js 20, 22 and 24, real headless Chromium fixtures, both builds and a
fresh tarball install with ESM/CommonJS runtime and TypeScript consumers. Ensure
all checks pass before making any release. Tests make only local fixture calls.

Publishing requires a maintainer's separately authorized npm authentication or
configured trusted publisher. For an authorized first release:

```sh
npm publish --access public
```

Use immutable tags/versions; never overwrite a published version. Configure npm
trusted publishing against the exact repository, workflow and environment before
running the release workflow. The release workflow publishes through the scoped GitHub Actions trusted publisher
and the `npm` environment; it stores no registry token. Never pack customer fixtures,
private captured material, keys, cookies or node_modules.


## Managed-material release gate

Publish core JS 3.0.0-rc.1 first, then adapter 2.0.0-rc.1. Verify managed generation,
existing collection and preparation, ESM/CJS builds and declaration consumers.
Regenerate the core dependency lock entry from the published tarball before
adapter publication; do not invent an integrity hash. The candidate uses the
local core package for offline verification. No package is published by this work.

## Preparation-required release candidate

Use this release with a compatible server. Generation rejects raw sources and
never uploads sources, starts learning or retries on expiry. Custom material
must reach ready before its reference is used. Make compatible preparation available, distribute reviewed SDKs, migrate clients,
then enforce the new solve contract. Publish core SDK major 3 before Playwright major 2.
Keep all account/context/readiness and billing checks. Do not move published tags.
Refresh the Playwright registry lock entry after core JS is published; the new
core version cannot resolve from npm before that publication.

The candidate lock records the locally packed core artifact. After core publication, compare its registry distribution integrity and refresh the lock before releasing this adapter.
