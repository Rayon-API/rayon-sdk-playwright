# Release

Publish the core JavaScript SDK 3.0.0 first, then Playwright SDK 2.0.0.
Refresh the adapter lockfile from the published core tarball and verify its registry
integrity. Never invent an integrity hash or move a published tag.

Use a compatible server, migrate direct-upload clients to preparation, and verify
managed generation and custom ready references before promoting the release.
Generation does not upload material or start preparation.

Run from the reviewed checkout:

```sh
npm ci
npm test
npm run build
npm run test:package
npm pack --dry-run
```

Browser tests use authored local fixtures. CI covers Node.js 20, 22 and 24,
Chromium, both module formats, and TypeScript consumers. Install the required
Chromium build before browser tests.

Publish through the authorized GitHub release workflow and the scoped npm trusted
publisher in environment `npm`. The workflow stores no registry token. Local
tests and builds do not publish. Never include customer material, keys, cookies
or node_modules in a package.
