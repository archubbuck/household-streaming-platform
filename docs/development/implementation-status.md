# Implementation status

> Generated from [roadmap.json](./roadmap.json). Edit that file, then run `pnpm roadmap:write`; CI checks generated output with `pnpm roadmap:check`.

Requirements source: [household_streaming_platform_specification.md](../../household_streaming_platform_specification.md).

## Milestones

| ID | Milestone | State | Outcome |
|---|---|---|---|
| M0 | AI Engineering Foundation | complete | Mandatory discovery, constrained workflows, deterministic tests, and source-bound evidence. |
| M0-RK | Incremental Roku MCP integration | in progress | Pinned read-only tooling inspection and safe, evidence-backed device workflows without weakening M0. |
| M1 | Roku Mock Prototype | blocked | A native sideloaded mock Roku app with remote navigation, verified on the target device. |
| M2 | Playable MVP | in progress | A Roku client that browses and plays existing Jellyfin content with shared watch state. |
| M3 | Autonomous Catalog | not started | Authorized, validated media enters Jellyfin through durable catalog jobs. |
| M4 | Self-Maintaining Platform | not started | Observable, backed-up Windows services with safe dry-run retention. |

## M0 — AI Engineering Foundation

| Work package | State | Implementation / verification | Dependencies | Blockers | Evidence |
|---|---|---|---|---|---|
| M0.1 — Session discovery instructions | complete | Root discovery instructions and the VS Code instruction bridge are in place.<br>Verification: passed | — | — | [AGENTS.md](../../AGENTS.md) — Mandatory discovery sequence and trust boundary. |
| M0.2 — Capability schema and registry validation | complete | Strict capability manifests, completeness checks, and dependency validation are implemented.<br>Verification: passed | M0.1 | — | [.agents/schemas/capability.schema.json](../../.agents/schemas/capability.schema.json) — Strict manifest schema.<br>[scripts/ai/tests/foundation.test.mjs](../../scripts/ai/tests/foundation.test.mjs) — Registry and invalid-manifest regression coverage. |
| M0.3 — Discovery, inventory, explain, and session verification | complete | The CLI scans capabilities and issues exact-task and registry-bound receipts.<br>Verification: passed | M0.2 | — | [scripts/ai/cli.mjs](../../scripts/ai/cli.mjs) — Implemented discovery and registry commands.<br>[scripts/ai/tests/foundation.test.mjs](../../scripts/ai/tests/foundation.test.mjs) — Receipt matching and invalidation tests. |
| M0.4 — Specialist roles and mandatory behaviors | complete | Specialist ownership and mandatory engineering behaviors are registered.<br>Verification: passed | M0.2 | — | [.agents/agents/specialists.md](../../.agents/agents/specialists.md) — Role boundaries.<br>[.agents/behaviors/core.md](../../.agents/behaviors/core.md) — Mandatory safety, validation, and documentation behaviors. |
| M0.5 — Constrained workflow runner and signed evidence | complete | The runner enforces closed inputs, command allowlists, artifact-only writes, and signed source-bound evidence.<br>Verification: passed | M0.3, M0.4 | — | [scripts/ai/runner.mjs](../../scripts/ai/runner.mjs) — Workflow execution and evidence verification.<br>[scripts/ai/tests/foundation.test.mjs](../../scripts/ai/tests/foundation.test.mjs) — Workflow policy, tamper, and source-integrity coverage. |
| M0.6 — Pinned toolchain, regression tests, and CI definition | complete | The native Node test suite, pinned dependencies, and Windows/Linux CI workflow are defined.<br>Verification: passed | M0.5 | — | [package.json](../../package.json) — Pinned package manager and dependencies.<br>[.github/workflows/foundation.yml](../../.github/workflows/foundation.yml) — Cross-platform foundation CI definition; hosted execution is tracked separately. |
| M0.7 — Sample workflow | complete | The foundation workflow is exercised against isolated committed test repositories.<br>Verification: passed | M0.5, M0.6 | — | [scripts/ai/tests/foundation.test.mjs](../../scripts/ai/tests/foundation.test.mjs) — Clean committed fixture completes and verifies the workflow. |

## M0-RK — Incremental Roku MCP integration

| Work package | State | Implementation / verification | Dependencies | Blockers | Evidence |
|---|---|---|---|---|---|
| M0-RK-01 — Baseline gap assessment | complete | The existing foundation was assessed and Roku MCP gaps were recorded without recreating M0.<br>Verification: passed | M0.1, M0.5 | — | [docs/development/roku-mcp-gap-analysis.md](../../docs/development/roku-mcp-gap-analysis.md) — Incremental gap matrix and acceptance boundary. |
| M0-RK-02 — Pinned SDK and editor configuration | in progress | Tooling is pinned and both repository MCP configurations use editor-specific formats and workspace-relative paths.<br>Verification: partial | M0-RK-01 | Editor-client connectivity and physical-device compatibility have not been verified. | [.vscode/mcp.json](../../.vscode/mcp.json) — VS Code stdio configuration.<br>[.mcp.json](../../.mcp.json) — Second editor configuration; editor discovery/callability remains unobserved.<br>[scripts/roku/tests/inspection.test.mjs](../../scripts/roku/tests/inspection.test.mjs) — Configuration validity and failure tests. |
| M0-RK-03 — Official SDK skill registration | complete | Generated Roku SDK skills are present at their prescribed locations without divergent edits.<br>Verification: passed | M0-RK-02 | — | [.agents/manifests/roku.json](../../.agents/manifests/roku.json) — Official skills are registered.<br>[docs/development/third-party-notices.md](../../docs/development/third-party-notices.md) — Vendor notice retained. |
| M0-RK-04 — SDK and MCP availability observations | in progress | Discovery records static SDK/config/context observations and the local tooling probe has observed 80 advertised tools; callability and editor access are not inferred.<br>Verification: partial | M0-RK-03 | Connected-editor tool callability remains unobserved. | [scripts/roku/inspection.mjs](../../scripts/roku/inspection.mjs) — Closed, normalized availability observations.<br>[docs/development/implementation-status.md](../../docs/development/implementation-status.md) — Generated status summary from this roadmap. |
| M0-RK-05 — Bounded inspection and device adapter | in progress | Bounded read-only stdio inspection and pure policy helpers exist; no device-control adapter or operation surface is wired.<br>Verification: partial | M0-RK-02, M0-RK-04 | An authorized, policy-enforced device adapter remains unimplemented. | [scripts/roku/inspection.mjs](../../scripts/roku/inspection.mjs) — Read-only protocol inspection.<br>[scripts/roku/device-policy.mjs](../../scripts/roku/device-policy.mjs) — Policy helpers are not runtime enforcement.<br>[scripts/roku/tests/inspection.test.mjs](../../scripts/roku/tests/inspection.test.mjs) — Fake-transport and policy regression coverage. |
| M0-RK-06 — Runtime device leases and authorization | blocked | Pure target/lease/authorization helpers are not connected to atomic runtime lease storage or an authorized adapter.<br>Verification: blocked | M0-RK-05 | Implement and test exclusive runtime leases, authorization enforcement, and uncertain-operation reconciliation before enabling controls. | [scripts/roku/device-policy.mjs](../../scripts/roku/device-policy.mjs) — Non-wired policy helpers only. |
| M0-RK-07 — Setup and device-smoke workflows | in progress | The read-only setup-inspection workflow exists; an authorized physical smoke workflow does not.<br>Verification: partial | M0-RK-05, M0-RK-06 | Device smoke must wait for runtime authorization/leases, an adapter, and approved hardware access. | [.agents/workflows/roku-mcp-setup.json](../../.agents/workflows/roku-mcp-setup.json) — Setup workflow and offline gates.<br>[docs/operations/roku-mcp.md](../../docs/operations/roku-mcp.md) — Setup scope and physical verification blockers. |
| M0-RK-08 — Device evidence schema and aggregation | in progress | A strict schema and always-blocked physical-evidence record are integrated into setup runs; real device evidence collection is not implemented.<br>Verification: partial | M0-RK-05, M0-RK-07 | Physical device evidence collection requires the authorized adapter and smoke workflow. | [.agents/schemas/roku-device-evidence.schema.json](../../.agents/schemas/roku-device-evidence.schema.json) — Evidence shape and integrity constraints.<br>[scripts/ai/runner.mjs](../../scripts/ai/runner.mjs) — Setup runs bind blocked device evidence to source and commit. |
| M0-RK-09 — Authorized physical smoke | blocked | No physical smoke test has been run or reported as passed.<br>Verification: blocked | M0-RK-02, M0-RK-05, M0-RK-07 | No verified named Roku target, model/OS, developer mode, maintenance window, or sideload-slot approval is recorded. | [docs/operations/roku-mcp.md](../../docs/operations/roku-mcp.md) — Physical verification remains blocked; no device check was claimed. |
| M0-RK-10 — Runbooks, ADR, and CI | in progress | The transport/security ADR, setup runbook, gap assessment, and offline CI definition exist.<br>Verification: partial | M0-RK-01, M0-RK-02, M0-RK-09 | Hosted CI execution and cross-platform parity have not been observed. | [docs/adr/0002-roku-mcp-inspection.md](../../docs/adr/0002-roku-mcp-inspection.md) — Inspection-only transport and trust-boundary decision.<br>[docs/operations/roku-mcp.md](../../docs/operations/roku-mcp.md) — Reproducible setup and recovery instructions.<br>[.github/workflows/foundation.yml](../../.github/workflows/foundation.yml) — Offline-capable CI workflow definition. |

## M1 — Roku Mock Prototype

| Work package | State | Implementation / verification | Dependencies | Blockers | Evidence |
|---|---|---|---|---|---|
| M1.1 — Verify hardware, OS, SDK, and sideload | blocked | Target-device compatibility and a minimal-app sideload have not been verified.<br>Verification: blocked | M0-RK-02, M0-RK-06, M0-RK-09 | Obtain authorized access to a named Roku and verify model, OS, developer mode, and sideload prerequisites. | [docs/development/implementation-status.md](../../docs/development/implementation-status.md) — Generated prerequisites and blocked state. |
| M1.2 — Scaffold the native Roku app | blocked | No native Roku application is implemented; the browser preview is a separate mock.<br>Verification: not run | M1.1 | Wait for the hardware/SDK compatibility gate before choosing or scaffolding the client. | [README.md](../../README.md) — Generated status distinguishes the browser preview from a Roku app. |
| M1.3 — Design components and focus/navigation | not started | Native app design system, components, and focus manager are not started.<br>Verification: not run | M1.2 | — | None recorded |
| M1.4 — Implement mock-backed Roku screens | not started | Native Home, Movies, Series, Search, and Details screens are not started.<br>Verification: not run | M1.2, M1.3 | — | [apps/roku-preview/app.js](../../apps/roku-preview/app.js) — Browser-only mock preview exists but does not satisfy this package. |
| M1.5 — Build/deploy scripts and remote tests | not started | Native build/deploy scripts and remote navigation tests are not implemented.<br>Verification: not run | M1.2, M1.3, M1.4 | — | None recorded |
| M1.6 — Run authorized device smoke | blocked | No native startup/navigation/focus smoke or current-commit device evidence exists.<br>Verification: blocked | M0-RK-06, M0-RK-07, M0-RK-08, M1.5 | Requires the M0-RK safety layer and authorized, compatible Roku hardware. | None recorded |

## M2 — Playable MVP

| Work package | State | Implementation / verification | Dependencies | Blockers | Evidence |
|---|---|---|---|---|---|
| M2.1 — Experience API and contracts | in progress | A loopback NestJS API foundation serves sample preview data and authenticated catalog and favorites; the browser preview connects through a loopback proxy. Playback is unavailable.<br>Verification: partial | M1 | Complete OpenAPI contracts, pagination, production security review and M1 device acceptance remain outstanding. | [apps/experience-api/src/app.ts](../../apps/experience-api/src/app.ts) — Initial versioned routes; playback explicitly unavailable.<br>[apps/experience-api/src/api.test.ts](../../apps/experience-api/src/api.test.ts) — Offline route, authentication and preview proxy tests.<br>[scripts/roku/tests/ui-preview.test.mjs](../../scripts/roku/tests/ui-preview.test.mjs) — Browser preview proxy and mock interaction tests. |
| M2.2 — Jellyfin library and artwork adapter | in progress | A scoped Jellyfin adapter supports initial catalog and favorite requests with a default loopback mock upstream; connecting a real server requires explicit live mode. Artwork proxying is not implemented.<br>Verification: partial | M2.1 | Artwork and live Jellyfin compatibility remain unverified. | [apps/experience-api/src/jellyfin.ts](../../apps/experience-api/src/jellyfin.ts) — Initial adapter; live Jellyfin compatibility remains unverified.<br>[apps/experience-api/src/mock-jellyfin.ts](../../apps/experience-api/src/mock-jellyfin.ts) — Default simulated upstream, not a real Jellyfin implementation.<br>[apps/experience-api/src/api.test.ts](../../apps/experience-api/src/api.test.ts) — Offline upstream request, mock catalog, favorites and error coverage. |
| M2.3 — Device pairing and credential lifecycle | in progress | The API and CLI initialize a per-user device database; owner-generated single-use codes and revocable credentials support local pairing, including a browser preview with an in-memory credential.<br>Verification: partial | M2.1 | Windows ACLs, secure remote transport and native-device pairing remain unverified. | [apps/experience-api/src/devices.ts](../../apps/experience-api/src/devices.ts) — Automatic database initialization, SQLite pairing and revocation.<br>[apps/experience-api/src/api.test.ts](../../apps/experience-api/src/api.test.ts) — Offline first launch, pairing, expiry, persistence and revocation checks. |
| M2.4 — Playback, progress, and resume | not started | Playback endpoints explicitly return 501; negotiation, progress, resume, and completion are not implemented.<br>Verification: not run | M2.2, M2.3 | — | [apps/experience-api/src/app.ts](../../apps/experience-api/src/app.ts) — Unavailable routes fail explicitly rather than simulating playback. |
| M2.5 — Real-device playback compatibility | not started | No Direct Play or transcoding behavior has been tested on a Roku.<br>Verification: not run | M1.6, M2.4 | — | None recorded |
| M2.6 — Playback and focus audits | not started | No device focus/playback audit journeys are implemented.<br>Verification: not run | M2.5 | — | None recorded |

## M3 — Autonomous Catalog

| Work package | State | Implementation / verification | Dependencies | Blockers | Evidence |
|---|---|---|---|---|---|
| M3.1 — Metadata discovery and normalization | not started | Metadata discovery adapters are not implemented.<br>Verification: not run | M2 | — | None recorded |
| M3.2 — Household ranking and policies | not started | Ranking and catalog policy are not implemented.<br>Verification: not run | M3.1 | — | None recorded |
| M3.3 — Authorized acquisition adapters | not started | No acquisition adapters or authorization policy are implemented.<br>Verification: not run | M3.2 | — | None recorded |
| M3.4 — Media validation and reconciliation | not started | Media validation, quarantine, import, and Jellyfin reconciliation are not implemented.<br>Verification: not run | M3.3 | — | None recorded |
| M3.5 — Durable scheduler and audit log | not started | Durable scheduling, bounded retries, and audit history are not implemented.<br>Verification: not run | M3.4 | — | None recorded |

## M4 — Self-Maintaining Platform

| Work package | State | Implementation / verification | Dependencies | Blockers | Evidence |
|---|---|---|---|---|---|
| M4.1 — Storage budget and retention simulation | not started | Storage budgeting and retention simulation are not implemented.<br>Verification: not run | M3 | — | None recorded |
| M4.2 — Dry-run cleanup safeguards | not started | Cleanup remains unimplemented; deletion must stay disabled and dry-run by default.<br>Verification: not run | M4.1 | — | None recorded |
| M4.3 — Health, backup, and restore drills | not started | Health reporting, backups, and restore drills are not implemented.<br>Verification: not run | M4.1 | — | None recorded |
| M4.4 — Windows service deployment and rollback | not started | Windows service installation and rollback are not implemented.<br>Verification: not run | M4.3 | — | None recorded |
| M4.5 — Explicitly approved retirement enablement | not started | Automated retirement is not enabled or implemented.<br>Verification: not run | M4.2, M4.3, M4.4 | — | None recorded |

## Next actions

- **M0-RK-05:** Design and test the narrowest approved device adapter while preserving the inspection-only boundary.
- **M0-RK-06:** Implement atomic exclusive leases and explicit authorization before exposing device controls.
- **M0-RK-07:** Add the authorized device-smoke workflow only after adapter and lease enforcement are testable.
- **M1.1:** Collect the approved Roku model/OS, developer-mode, and sideload prerequisites; keep hardware claims blocked until observed.

## Status maintenance

- At kickoff, record impacted package IDs and expected status/evidence changes in the task brief; explicitly state when no roadmap change is expected.
- At closeout, update `roadmap.json` when implementation or verification changes, or record why status did not change.
- Keep implementation status separate from verification. Mock/static checks do not prove physical-device behavior.
- Run `pnpm roadmap:write` after edits and `pnpm roadmap:check` before closeout; the foundation workflow and CI enforce freshness.
