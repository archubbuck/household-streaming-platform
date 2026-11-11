# Foundation validation workflow

Discover → read selected instructions → define exact scope and acceptance → identify roadmap impact → implement → rediscover after registry changes → update roadmap when status/evidence changes → regenerate summaries → run foundation-check → verify evidence → report honestly.

The runner is intentionally limited to trusted read-only foundation checks and writes only its run's artifact directory. It supports script steps only, no arbitrary shell, interpolation, external commands, deployment or autonomous agent execution. Unknown step types/commands/inputs and broader permissions fail closed. Extend the allowlist and tests before registering future workflows. Repository-local Node test code is trusted, not an OS sandbox; tests may create isolated temporary fixtures but must not mutate source or production resources.

Invoke `pnpm ai:run --workflow foundation-check --session <id> --task "<exact scope>" --inputs '{}'` after discovery. Inspect the returned run ID and artifacts. Invoke `pnpm ai:verify --run <id> --session <id> --task "<exact scope>"` to verify signature, discovery, artifact hashes, required checks and unchanged source.

Before closeout, record changed roadmap package IDs and supporting evidence in the task report, or explicitly state why no roadmap status changed. Edit `docs/development/roadmap.json`, run `pnpm roadmap:write`, and ensure `pnpm roadmap:check` passes. The foundation workflow runs the roadmap check and regression tests so generated status summaries cannot silently drift.

Unborn or dirty Git worktrees produce a blocked commit-bound check and `readyForMerge: false`; run exits 2 for blocked completion. Failed checks exit 1. Only a clean, committed, current source with every required check passed exits 0. No automatic commits are made. Refresh and rerun after changes. Device validation is out of this workflow's scope, not passed by it.