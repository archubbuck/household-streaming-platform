# Implementation status

## Existing M0 foundation (retained)

- M0.1: root session-discovery instructions and VS Code instruction bridge.
- M0.2–M0.3: strict capability manifests, completeness/dependency validation, inventory, discover, explain and session verification.
- M0.4: six specialist role definitions plus mandatory ownership, deterministic execution, recovery, security, validation and documentation behaviors.
- M0.5: constrained script-only runner, closed workflow inputs, allowlisted commands, artifact-only repository writes and verifiable evidence. This is not a general agent orchestration engine or process sandbox.
- M0.6: pinned native toolchain, isolated fixtures, negative regression tests, Windows/Linux CI definition.
- M0.7: sample foundation workflow exercised in isolated committed test repositories. Current work requires fresh clean-commit evidence; historical dirty-worktree evidence is not reused.

## Incremental Roku tooling inspection

- M0-RK gap matrix, transport/security ADR and operations runbook added; M0 was not recreated.
- Exact `@roku-sdk/tooling@2.19.1` dependency and frozen lockfile. Native Windows Node 24.15.0 / pnpm 10.11 installation and CLI/context-generation checks observed; no lifecycle-script approval or toolchain migration needed for inspection.
- SDK-generated skills registered at their prescribed locations without hand edits; vendor license retained. LF attributes protect managed hashes across checkouts.
- Discovery signs static SDK/config/context observations. Registry/context/config changes and observed SDK availability changes invalidate receipts.
- Bounded official stdio initialization and tool advertisement check; actual local observation: 80 tools and matching versioned catalog fingerprint. No tools/call, device list, LAN scan or TV control.
- Editor exposes only receipt-bound `roku_mcp_check`. Native SDK controls are deliberately unavailable until shared device safety enforcement exists.
- Existing runner aggregates inspection results into signed source/commit-bound artifacts. Missing tooling remains blocked; default foundation tests remain offline.
- 52 local regression tests passed during implementation, including new fake-transport, missing SDK/config, drift, timeout, output suppression, protocol, schema and workflow checks. These are not physical tests. Final workflow verification must be rerun on the submitted commit.

## Not yet accepted / implemented

- GitHub remote and tracking branch are configured. Hosted CI execution and cross-platform parity are reported separately from local results; branch protection is not configured by this implementation.
- No fresh-editor-chat enforcement experiment has been performed. AGENTS/Copilot instructions direct new chats; deterministic rejection is tested at the workflow boundary.
- No generic agent-step workflow executor, device-control adapter, leases, physical evidence schema, smoke workflow, scaffolders, Roku build/deploy scripts, API or product tests exist. Do not advertise planned commands as usable.
- No app/package implementations exist; the pnpm workspace only reserves their future locations.
- Roku hardware checks are blocked, not passed. No Jellyfin, media, acquisition or Windows production services were touched.

## Next: finish M0-RK safety layer, then M1 hardware gate and mock prototype

Record these facts before choosing an SDK or deploying:

| Prerequisite | Current value / evidence |
| --- | --- |
| Roku manufacturer/model and Roku OS | Unknown |
| Resolution, codec/HDR/audio support, memory | Unknown; do not infer from model branding |
| LAN address, developer mode and successful sideload | Unverified; deployment requires explicit scope and credentials entered outside chat |
| RSG 2.0 SDK availability and host requirements | Public tooling 2.19.1 installed; CLI/stdio inspection works on Windows Node 24.15.0 / pnpm 10.11. App-build and TV compatibility unverified; RSG 2.0 requires OS 16+ |
| Jellyfin version, service mode/account and household user | Unknown; preserve installation |
| Library/staging paths, mount health and free capacity | Unknown; do not assume D: exists |
| Authorized acquisition sources and licenses | Unknown; discovery metadata alone is insufficient |
| Source-control hosting and Windows service manager | GitHub remote configured; Windows service manager undecided |

After the device gate, scaffold the mock-only Roku application with provider/facade separation, deterministic fixtures and remote-focus tests. Prove real-device navigation before the M2 API/playback milestone. Catalog automation and retention remain later milestones; deletion stays disabled and dry-run stays enabled.