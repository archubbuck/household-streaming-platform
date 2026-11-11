# Incremental assessment — M0 Roku MCP

Baseline inspected: `a07a6b1`, initially clean `master`, tracking GitHub `origin/master`.
The existing M0 registry, runner, signed receipts and evidence are retained. The specification is not an implemented product.

| Package | Existing capability | Required enhancement / action | Affected files | Validation / status |
| --- | --- | --- | --- | --- |
| M0-RK-01 | M0 discovery and foundation checks | Assess actual baseline and gaps | This report | Assessment complete |
| M0-RK-02 | Node 24, pnpm 10.11 | Pin SDK 2.19.1; Windows CLI and stdio inspection; no toolchain migration | Package/lockfile, editor config, SDK reference | CLI observed; app build and TV compatibility unverified |
| M0-RK-03 | Strict manifest coverage | Install official context once in SDK-prescribed locations; register without edits | `.agents/skills`, Roku manifest | SDK context drift check and registry validation |
| M0-RK-04 | Signed task/registry receipts | Include static SDK/config/context observations; distinguish unknown tool/device facts | Discovery and inspection modules | Missing SDK, config and drift regression tests |
| M0-RK-05 | Script-only command allowlist | Bounded read-only stdio inspector; no device-control adapter yet | Roku scripts and tests | Fake transport and actual local advertisement checks; full adapter pending |
| M0-RK-06 | No device mutation surface | Deny every device operation at editor inspection boundary | Inspection server | Negative policy tests; leases not implemented, so control remains disabled |
| M0-RK-07 | Foundation workflow | Add read-only setup workflow; preserve blocked exit status | Runner, workflow manifest | Runner tests; smoke workflow pending |
| M0-RK-08 | Signed source-bound task artifacts | Aggregate preflight through existing checks | Existing evidence runner | Current-commit preflight evidence; physical evidence schema pending |
| M0-RK-09 | No approved target or app | Physical smoke blocked | Status/runbook | Needs named OS-16+ development TV, developer mode, secure credentials, maintenance window, sideload-slot approval, adapter/lease implementation and an app |
| M0-RK-10 | Windows/Linux CI definition | Offline regression coverage, runbook, transport/security ADR | CI, docs | Local Windows results recorded separately from hosted CI |

## Compatibility observations

- Official published `@roku-sdk/tooling@2.19.1` requires Node >=24 and npm >=8.5; its package metadata does not require pnpm 11. The getting-started documentation recommends pnpm 11. Keep M0's pnpm 10.11 until an app-build spike justifies migration.
- Installation with lifecycle scripts disabled and local `rk --help` / `rk update-ai-context` succeeded on native Windows with Node 24.15.0. This does not establish native app build or hardware support.
- Official first-app documentation requires Roku OS 16+. Plain `rk dev` and Hermes bytecode deployment have different signing/token requirements; bytecode needs the `rsg_typescript` claim. No signing was attempted.
- The SDK stdio implementation can forward to a running persistent server. Local stdio configuration does not prove a local in-process backend.
- `get_server_health` requires persistent server mode. `list_devices` can contact Roku Cloud Emulator when configured. Neither is used by automatic discovery.
- The documentation index returned an HTML shell during assessment; the official `.md` MCP and getting-started pages and installed source were readable. Do not equate an index fetch with a verified tool catalog.

## Completion boundary

This increment is read-only engineering groundwork, **not full M0-RK acceptance or M1–M4 completion**. No TV alias/model/OS, Jellyfin configuration, media roots, source licenses or deployment window were supplied; the owner was unavailable. No LAN scanning, device registration, sideload, network-policy change, acquisition, deletion or production service change was performed.

Follow-on order: implement/test target identity and exclusive leases; authorized adapter and smoke workflow; device evidence schema; hardware compatibility spike; M1 mock client; M2 API/Jellyfin playback; M3 authorized catalog; M4 dry-run retention and service/restore drills. Physical acceptance and destructive enablement cannot be manufactured by additional offline iterations.