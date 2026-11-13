# Household Streaming Platform

Private, Roku-first household streaming on Windows, backed by an existing Jellyfin server. The [engineering specification](household_streaming_platform_specification.md) defines the product; it is **not yet a working streaming application**.

An incomplete, loopback-only NestJS API foundation is documented in
[docs/api/experience-api.md](docs/api/experience-api.md). It is not
production-ready; the browser preview uses it through a local development proxy.

<!-- ROADMAP:START -->
**Active workstream:** M0-RK — Incremental Roku MCP integration (in progress).
**Overall roadmap:** 10/40 work packages complete; statuses are tracked per package below.

| Milestone | State | Package summary |
|---|---|---|
| M0 — AI Engineering Foundation | complete | 8 complete, 0 in progress, 0 blocked, 0 not started |
| M0-RK — Incremental Roku MCP integration | in progress | 2 complete, 6 in progress, 2 blocked, 0 not started |
| M1 — Roku Mock Prototype | blocked | 0 complete, 0 in progress, 3 blocked, 3 not started |
| M2 — Playable MVP | in progress | 0 complete, 3 in progress, 0 blocked, 3 not started |
| M3 — Autonomous Catalog | not started | 0 complete, 0 in progress, 0 blocked, 5 not started |
| M4 — Self-Maintaining Platform | not started | 0 complete, 0 in progress, 0 blocked, 5 not started |

**Next product milestone:** M1 — Roku Mock Prototype (blocked).

**Next actions:**
- **M0.8:** Keep semantic/hybrid CLI activation gated on an approved provider; continue requiring normal Git review for every authoritative knowledge change.
- **M0-RK-05:** Design and test the narrowest approved device adapter while preserving the inspection-only boundary.
- **M0-RK-06:** Implement atomic exclusive leases and explicit authorization before exposing device controls.
- **M0-RK-07:** Add the authorized device-smoke workflow only after adapter and lease enforcement are testable.
- **M1.1:** Collect the approved Roku model/OS, developer-mode, and sideload prerequisites; keep hardware claims blocked until observed.

The product requirements remain in [household_streaming_platform_specification.md](./household_streaming_platform_specification.md).
Detailed implementation state and evidence: [docs/development/implementation-status.md](./docs/development/implementation-status.md).
<!-- ROADMAP:END -->

## Prerequisites

- Node.js 24 LTS; Roku SDK compatibility still requires verification.
- Git.
- pnpm 10.11.0, or `npx --yes pnpm@10.11.0` if pnpm is not installed globally.

From the repository root, install with `npx --yes pnpm@10.11.0 install --frozen-lockfile --ignore-scripts`. SDK lifecycle scripts are not needed for this inspection increment. No Docker, WSL or global package-manager changes are needed. App-build compatibility remains a separate gate.

## Agent entry point

Read [AGENTS.md](AGENTS.md) at the beginning of **every** chat. Before planning, run:

```powershell
node scripts/ai/cli.mjs discover --task "Implement M0 foundation"
```

Read every returned `instructions` file. Keep the session ID and exact task. Any registry, instruction, command or lockfile change requires fresh discovery.

## Available commands

Use the pinned npx prefix in place of `pnpm` if needed. All CLI commands accept `--help`.

| Command | Behavior |
| --- | --- |
| `pnpm ai:inventory` | Validates and lists capabilities and covered files |
| `pnpm ai:validate-registry` / `pnpm validate` | Validates registry completeness, schemas and workflow policy |
| `pnpm ai:discover --task "..."` | Issues a new session receipt; lists instruction paths and missing capabilities |
| `pnpm ai:explain --capability foundation-check` | Displays a registered capability |
| `pnpm ai:verify-session --session <id> --task "..."` | Checks signature, task, lifetime and current registry |
| `pnpm test` | Runs foundation, knowledge, preview, Roku inspection, and API regression tests using offline fixtures |
| `pnpm roku:mcp:check --session <id> --task "..."` | Read-only installed SDK/context/advertisement inspection; no tool calls or TV access |
| `pnpm ai:run --workflow roku-mcp-setup --session <id> --task "..." --inputs '{}'` | Signed tooling-inspection evidence, not physical integration acceptance |
| `pnpm ai:run --workflow foundation-check --session <id> --task "..." --inputs '{}'` | Runs the gated foundation checks and records evidence |
| `pnpm ai:verify --run <id> --session <id> --task "..."` | Independently verifies current evidence and computes the result |
| `pnpm roadmap:check` | Validates roadmap data and generated status summaries |
| `pnpm roadmap:write` | Regenerates README and implementation-status summaries from the roadmap |

Exit codes: **0** passed, **1** invalid/failed, **2** completion blocked. An unborn or dirty worktree intentionally exits 2 for the workflow, even when all runnable tests pass. No automatic source commits are made. Read [the foundation runbook](docs/operations/foundation.md) for recovery and trust boundaries.

## Agent knowledge

The Git-managed [knowledge catalog](knowledge/catalog.json) is authoritative;
findings, proposals, checkpoints, and the rebuildable SQLite/FTS index live
under ignored `.artifacts/knowledge/`. Search, validate, and maintain local
state with the existing CLI:

```powershell
$sessionId = '<current discovery session>'
$task = '<exact discovered task text>'
node scripts/ai/cli.mjs knowledge --action search --session $sessionId --task $task --payload '{"query":"session receipts","limit":5,"mode":"auto"}'
node scripts/ai/cli.mjs knowledge --action validate
node scripts/ai/cli.mjs knowledge --action benchmark --session $sessionId --task $task
```

Capture and checkpoint commands require the current discovery session and the
exact task text. Proposals remain pending for normal Git review; no command
automatically promotes them. See the [KMS guide](docs/development/knowledge-management.md)
and [maintenance runbook](docs/operations/knowledge-maintenance.md).

## Browser preview and Experience API

Build the API with `pnpm --filter @household/experience-api build`, start it
with `pnpm --filter @household/experience-api start`, then run
`pnpm preview:roku` and open `http://localhost:4173` on the same machine. Both
services bind to loopback; the preview proxies a narrow set of requests to the
API. If `HOUSEHOLD_API_PORT` is changed, set it for both processes.

The API defaults to a private, in-memory mock Jellyfin library; no connection
settings are required. It also serves sample titles without pairing. To browse
the mock library, use **Connect Jellyfin** and an owner-generated pairing code
as described in the [API runbook](docs/api/experience-api.md). The UI labels
the library **MOCK JELLYFIN**, and its favorites reset on API restart. Preview
sample artwork uses external URLs and may be unavailable offline.

To connect a real server, explicitly set `HOUSEHOLD_JELLYFIN_MODE=live` and
provide the Jellyfin connection variables. Mock mode rejects nonempty real
connection settings. Real favorites update Jellyfin; sample favorites are
temporary. API errors are shown rather than silently replaced with samples.
The browser holds the device credential only in memory; reload requires a new
pairing code, and disconnecting does not revoke the device. Playback remains
simulated. Do not deploy or expose this development preview as a household
service.

## Roadmap

The [implementation roadmap](docs/development/implementation-status.md) is generated from [roadmap.json](docs/development/roadmap.json). The [product specification](household_streaming_platform_specification.md) remains authoritative for requirements; the [Roku inspection runbook](docs/operations/roku-mcp.md) records setup and safety boundaries.