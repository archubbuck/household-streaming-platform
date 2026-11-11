# Repository agent bootstrap

## Discover before acting — every new chat and subagent

1. Read this file before planning or task-specific execution.
2. Run `node scripts/ai/cli.mjs discover --task "<exact task scope>"` from the repository root. After installation, `pnpm ai:discover --task "..."` is equivalent; on Windows without global pnpm use `npx pnpm@10.11.0`.
3. Read **all** `instructions` paths emitted by discovery, including mandatory behaviors and dependencies. A receipt proves deterministic matching, not that an agent understood the instructions.
4. Carry the returned session ID and exact task into every workflow and verification command. A new chat requires a new receipt. Subagents must receive the receipt, validate it, and read applicable instructions, or discover independently.
5. Only then plan and execute. Task or registry changes require fresh discovery. Never edit receipts or evidence to make a gate pass.

If dependencies are missing, installing the pinned lockfile with `npx pnpm@10.11.0 install --frozen-lockfile` is a bootstrap-only action. If discovery fails, stop product work and report the blocker. Explicit repair requests may repair only the broken bootstrap, then must run discovery before any other work. Initial creation of this foundation is the one-time bootstrap case, not a successful historical discovery.

## Scope and trust boundary

The specification is the product plan, not implemented functionality. M0 precedes feature work. Do not invent Roku SDK APIs, hardware capability, source authorization, or live Jellyfin configuration. No production deployments, deletion, credential rotation, firewall changes, or acquisition are authorized by an implementation request.

Registry instructions are vendor-neutral repository capabilities, not automatically installed VS Code custom agents. The runner enforces its own allowlist and artifact permissions; it cannot sandbox arbitrary editor tools or an OS user who can rewrite the repository. CI independently discovers and validates rather than trusting submitted local evidence.