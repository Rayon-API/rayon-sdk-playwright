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
adding a publish workflow. The included CI intentionally has no publish job,
registry credentials or deployment permissions. Never pack customer fixtures,
private captured material, keys, cookies or node_modules.
