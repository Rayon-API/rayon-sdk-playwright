# Changelog

## 2.0.0

- Require preparation for custom material; use ready references for generation.
- Keep managed generation available without material fields.
- Allow preparation waits up to 30 minutes and retain job IDs for resuming a wait.
- Remove generation-time source uploads and automatic material replacement.

## 2.0.0-rc.2

- Allow preparation waits up to 30 minutes by default; explicit timeouts and cancellation remain supported.
- Keep per-request deadlines bounded and retain job IDs for resuming a wait.

## Preparation-required release candidate

- Generation accepts ready managed material or a ready private reference; raw sources belong to preparation.
- No generation source-upload cache, automatic expiry recovery, foreground learning or solve-time preparation.
- Existing preparation/wait helpers and supported-context checks remain; refresh outside generation.
- Breaking candidate: core SDK major 3, Playwright major 2. Not published or deployed.


## 1.1.0 — managed material

- Add generateManaged for public header flows without collection or preparation.
- Use core SDK 2.1.0 and retain safe fallback metadata.
- Preserve collection, explicit header/form generation and preparation helpers.


## 1.0.0 — material preparation

- Add explicit preparation, status, bounded wait and prepare-and-wait helpers.
- Validate safe readiness metadata and preserve resumable preparation IDs on typed errors.
- Preserve explicit generation and existing confirmed unbilled source-miss recovery.
