# Security

Report suspected vulnerabilities privately to support@rayonapi.com. Include the
package version and a minimal synthetic reproduction. Do not include production
API keys, captured scripts, cookies, generated telemetry or customer payloads.

Keep API keys in Node-side secret storage. Browser scripts and document cookies
can contain secrets: treat PreparedMaterial and API input bodies as sensitive,
keep them out of logs, and collect only authorized pages. The adapter emits no
logs, never exports HttpOnly cookies, and uses constant collection error messages.
Core SDK errors and result inspection follow the core SDK's redaction contract.
Direct access or JSON serialization of material/results still exposes their data.

Collection observes the caller's existing browser; it is not a sandbox for
untrusted scripts. Use a separate caller-owned context when isolation is needed.
The size limits apply to accepted material; Playwright/browser body buffering is
not streaming or forcibly cancellable. See README.md for lifecycle limitations.
