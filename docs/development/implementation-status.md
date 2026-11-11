# Implementation status

## Implemented in this increment

- M0.1: root session-discovery instructions and VS Code instruction bridge.
- M0.2–M0.3: strict capability manifests, completeness/dependency validation, inventory, discover, explain and session verification.
- M0.4: six specialist role definitions plus mandatory ownership, deterministic execution, recovery, security, validation and documentation behaviors.
- M0.5: constrained script-only runner, closed workflow inputs, allowlisted commands, artifact-only repository writes and verifiable evidence. This is not a general agent orchestration engine or process sandbox.
- M0.6: pinned native toolchain, isolated fixtures, negative regression tests, Windows/Linux CI definition.
- M0.7: sample foundation workflow exercised in isolated committed test repositories; real workspace evidence also generated, but commit-bound completion remains blocked until changes are reviewed and committed.

## Not yet accepted / implemented

- Hosted CI execution and cross-platform parity have not yet been observed; no source-control remote or branch protection is configured.
- No fresh-editor-chat enforcement experiment has been performed. AGENTS/Copilot instructions direct new chats; deterministic rejection is tested at the workflow boundary.
- No generic agent-step workflow executor, scaffolders, Roku build/deploy scripts, API or product tests exist. Do not advertise planned commands as usable.
- No app/package implementations exist; the pnpm workspace only reserves their future locations.
- Roku hardware checks are blocked, not passed. No Jellyfin, media, acquisition or Windows production services were touched.

## Next: M1 hardware gate and mock prototype

Record these facts before choosing an SDK or deploying:

| Prerequisite | Current value / evidence |
| --- | --- |
| Roku manufacturer/model and Roku OS | Unknown |
| Resolution, codec/HDR/audio support, memory | Unknown; do not infer from model branding |
| LAN address, developer mode and successful sideload | Unverified; deployment requires explicit scope and credentials entered outside chat |
| RSG 2.0 SDK availability and host requirements | Unverified; use BrightScript/SceneGraph if unsupported |
| Jellyfin version, service mode/account and household user | Unknown; preserve installation |
| Library/staging paths, mount health and free capacity | Unknown; do not assume D: exists |
| Authorized acquisition sources and licenses | Unknown; discovery metadata alone is insufficient |
| Source-control hosting and Windows service manager | Undecided |

After the device gate, scaffold the mock-only Roku application with provider/facade separation, deterministic fixtures and remote-focus tests. Prove real-device navigation before the M2 API/playback milestone. Catalog automation and retention remain later milestones; deletion stays disabled and dry-run stays enabled.