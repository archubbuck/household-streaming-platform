# Household Streaming Platform

Private, Roku-first household streaming on Windows, backed by an existing Jellyfin server. The [engineering specification](household_streaming_platform_specification.md) defines the product; it is **not yet a working streaming application**.

## Current implementation: M0 foundation and read-only Roku inspection

- Strict capability registry with completeness, dependency, owner and workflow validation.
- Deterministic discovery with mandatory instructions and task-bound, expiring session receipts.
- Allowlisted foundation workflow with closed inputs, artifact-only repository write permissions, and no shell execution.
- Signed, source/commit-bound evidence and computed merge readiness; skipped/blocked checks never count as passed.
- Native Node regression tests and Windows/Linux CI configuration.

The Roku SDK tooling is pinned at 2.19.1. Official skills, signed static availability observations, a bounded stdio inspector and a receipt-gated inspection-only editor bridge are implemented. An actual local probe observed 80 advertised tools; tool callability, editor connectivity and physical-device compatibility remain unverified.

No Roku application, device-control adapter, API, database, Jellyfin integration, acquisition or deletion is implemented. **The platform and full M0-RK integration are not complete.** No media or existing Jellyfin configuration is modified. See the [gap assessment](docs/development/roku-mcp-gap-analysis.md).

## Prerequisites

- Node.js 24 LTS (bootstrap tooling only; Roku SDK compatibility still requires verification).
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
| `pnpm test` | Runs foundation and fake-transport inspection regression tests, no live services |
| `pnpm roku:mcp:check --session <id> --task "..."` | Read-only installed SDK/context/advertisement inspection; no tool calls or TV access |
| `pnpm ai:run --workflow roku-mcp-setup --session <id> --task "..." --inputs '{}'` | Signed tooling-inspection evidence, not physical integration acceptance |
| `pnpm ai:run --workflow foundation-check --session <id> --task "..." --inputs '{}'` | Runs the gated foundation checks and records evidence |
| `pnpm ai:verify --run <id> --session <id> --task "..."` | Independently verifies current evidence and computes the result |

Exit codes: **0** passed, **1** invalid/failed, **2** completion blocked. An unborn or dirty worktree intentionally exits 2 for the workflow, even when all runnable tests pass. No automatic source commits are made. Read [the foundation runbook](docs/operations/foundation.md) for recovery and trust boundaries.

## Next milestone

See [implementation status and prerequisites](docs/development/implementation-status.md) and the [inspection runbook](docs/operations/roku-mcp.md). Finish target/lease/authorization and physical evidence enforcement before enabling device controls. Then verify actual Roku model/OS/developer mode and authorized minimal-app sideload before committing to a client SDK. Existing Jellyfin and all household media remain untouched.