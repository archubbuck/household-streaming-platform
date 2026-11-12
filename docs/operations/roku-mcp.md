# Roku MCP inspection runbook

## Scope and safety

Only read-only SDK inspection is enabled. No app, deployment, remote-key, screenshot, device-registration, signing, reboot or acquisition command is available through the repository bridge. Vendor skills describe a larger SDK surface; they do not authorize any operation. Never use an active/default TV implicitly or expose the raw SDK to bypass missing repository safety controls.

`scripts/roku/device-policy.mjs` contains pure, non-wired policy decisions for explicit target resolution, lease transitions and operation authorization. It does not provide atomic lease storage, verify human approvals, call an adapter or enable any device operation. Its synthetic tests validate policy inputs only.

The `roku-mcp-setup` workflow includes `.artifacts/tasks/<run-id>/roku-device/evidence.json` in its signed artifact hashes. Until an authorized device workflow exists, this record is always `blocked`, leaves device/lease fields unobserved, and is not evidence that a physical check ran. Verification validates its schema and binds it to the task run, commit and source digest.

For browser UI iteration, build and start the Experience API, then start the
preview with `pnpm preview:roku` on the same machine. The loopback preview
proxies the API's sample catalog and, after owner pairing, authenticated
Jellyfin catalog and favorite requests. Sample favorites and playback remain
simulated. The preview does not call `rk` or a Roku and must not be exposed as
a household service. See the [API runbook](../api/experience-api.md) for pairing,
failure handling and limitations. Arrow keys move focus, Enter selects, and
Escape backs out. Browser rendering is not evidence of native Roku compatibility.

## Reproducible setup

1. Use Node 24 and `npx --yes pnpm@10.11.0 install --frozen-lockfile --ignore-scripts`. No global package manager or firewall changes are required.
2. Discover the exact task through the existing AI CLI and read all returned instructions. Discovery includes static SDK/config/context observations without launching a device or assuming editor MCP access.
3. Use `pnpm roku:mcp:check --session <id> --task "<exact task>"` for bounded local protocol inspection. It runs only initialize, initialized notification and tools/list against the pinned installed `rk mcp`. SDK 2.19.1 does not implement ping. No tools/call, device list, LAN probes or mutations are sent.
4. Run `roku-mcp-setup` through the existing workflow runner with the exact receipt/task and empty inputs, then verify its run. This produces signed current-source evidence in the existing task artifact directory. A setup pass is **inspection only**, not device-integration acceptance.
5. Reload VS Code to discover the `roku-sdk-inspection` MCP server. Its sole tool is `roku_mcp_check`; it is a safe inspection bridge, not an unrestricted SDK server. Editor access remains unobserved until a real editor call occurs.

The configuration invokes Node directly and resolves the installed SDK from the workspace. It never uses an unpinned registry fallback. Persistent server mode remains off; actual backend is unobserved because the official stdio process can forward requests. Do not start/stop existing servers automatically.

## SDK context and drift

The SDK's `rk update-ai-context --yes` generated the managed skills in their prescribed locations. Use `rk update-ai-context --check` to detect managed-context drift. Do not edit managed files. Upgrades require reviewing generated diffs, updating the verified reference from actual observations, adjusting registry coverage, running tests and refreshing discovery. Hashes are observations, not proof of device support.

The versioned reference contains the installed tooling version, tool-definition source checksum and advertised schema fingerprint. An unexpected version/schema/config/context is a failed preflight, not a reason to silently replace the reference. Missing tooling or unavailable protocol transport is blocked; malformed configuration or drift is failed. Raw tool output is discarded, not logged.

## Physical verification remains blocked

Provide a named development TV and observed model/OS (RSG 2.0 requires OS 16+), developer mode, trusted LAN reachability, secure credentials outside chat/Git, maintenance window, and explicit approval to replace the current sideloaded app. First implement/test shared identity resolution, exclusive leases, bounded device adapter, smoke assertions and physical evidence schema. A blocked or unexecuted device check is never passed.

Keep the Jellyfin Roku app available. Do not change existing Jellyfin, media paths, service accounts or household storage. Acquisition sources need documented authorization. Retention stays disabled/dry-run until later milestones and explicit approval.

## Recovery

- Missing package: install the frozen lockfile; never use an unpinned `npx rk` fallback.
- Timeout/process exit/protocol error: inspect the normalized error code; no automatic retry or persistent-server restart. Raw diagnostics may contain secrets and are intentionally not persisted.
- Each SDK subprocess has a 20-second deadline and 2 MiB output limit. Deadline termination uses Node's `SIGKILL` handling (TerminateProcess on Windows); only read-only inspections are launched, and no uncertain device mutation is retried. Persistent servers are not killed or restarted by the inspector.
- Drift: review SDK/context/config changes, rerun verification, rediscover; never edit evidence to pass.
- Editor cannot connect: verify Node is on its PATH and the workspace config is trusted. A successful shell probe does not prove editor connectivity.
- No device: leave physical status blocked and continue unrelated offline checks.