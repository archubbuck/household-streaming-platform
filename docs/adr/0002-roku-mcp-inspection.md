# ADR 0002 — Read-only SDK inspection before device automation

- Status: accepted for the incremental compatibility spike; device control deferred
- Baseline: ADR 0001 remains in effect

Pin `@roku-sdk/tooling` 2.19.1 and retain Node 24 / pnpm 10.11. Install official generated context in `.agents/skills` without hand-editing vendor content. Registry hashing includes this context, editor configuration and the verified reference. SDK upgrades require review, fresh discovery and repeat validation.

Use the official local `rk mcp` binary over stdio for bounded protocol inspection. Do not download a binary at runtime or require global pnpm. Do not start a persistent server, enumerate household devices, or mutate the TV during discovery. Configured transport and observed backend are different facts; backend stays null unless actually observed.

The editor initially exposes only a repository **inspection** tool, backed by the official SDK, rather than forwarding arbitrary native SDK tools. This deliberate restriction prevents bypassing the not-yet-implemented target/lease/authorization layer. `tools/list` advertisement is measured independently from `tools/call` and device reachability; neither callability nor physical validation is inferred from successful protocol initialization. This is not a fully enabled official device-automation integration.

No device operation is implemented or authorized in this increment. Later expansion must implement shared targeting, leases, maintenance-window and sideload-slot authorization, uncertain-operation reconciliation, normalized device evidence, and regression tests before exposing controls. No fake adapter or static check may satisfy a physical gate.

Persist only closed, normalized observations and hashes. Raw SDK stdout/stderr, paths, identifiers, network details and error strings are not evidence. The SDK is trusted executable dependency code, not an OS sandbox; repository guards do not constrain an owner invoking the SDK directly.

Keep offline foundation checks independent of SDK installation and device availability. A separate setup workflow requires actual tooling/preflight checks and reports unavailable prerequisites as blocked. Reuse existing signed task artifacts and commit/source verification; do not introduce a parallel evidence store.