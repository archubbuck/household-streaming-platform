# Foundation operations runbook

## Start a session

1. Read AGENTS.md. Install the pinned lockfile only if dependencies are missing.
2. Discover using an explicit sanitized task (no credentials or token-bearing URLs).
3. Read the returned instructions and record missing capabilities. The registry records actual assets, not proposed commands from the specification.
4. Verify the receipt before delegating. A different subtask scope needs its own discovery; a fresh chat always needs fresh discovery.
5. After edits, rediscover if registry-bound content changed. Run and verify `foundation-check` with the exact task/session.

PowerShell automation may capture JSON from `node scripts/ai/cli.mjs ... | ConvertFrom-Json`; using `pnpm` in a JSON pipeline also emits package-manager banners. Check `$LASTEXITCODE` before treating JSON as successful execution.

## Read evidence

Each run lives at `.artifacts/tasks/<run-id>/` and contains task, discovery, context, plan, execution, signed validation, a human-readable summary, and individual check evidence. The report lists status, exit code, command, timestamps, evidence path and reason. `ai:verify` rechecks local signature, current discovery, every artifact hash, source digest, commit and required gates.

The local session key is `.artifacts/receipt-key`; never commit, upload or print it. `.artifacts` is ignored. Restrict its Windows directory ACL to the development identity if sharing the machine. A missing key requires fresh discovery and fresh workflow execution, not hand editing old receipts.

## Failure/recovery

| Symptom | Action |
| --- | --- |
| Dependency missing / unsupported Node | Use Node 24 and install the pinned lockfile; do not silently bypass schemas |
| Registry file unregistered, missing or invalid | Stop product work; repair the manifest/entrypoint under an explicit bootstrap repair scope, then rediscover |
| Unknown command, extra workflow inputs or broad permissions | Denied by design; implement, register and test a narrow command instead of supplying shell text |
| Registry changed, expired receipt, task mismatch | Start discovery again and use the new session ID; exact task text matters |
| Signature or artifact hash mismatch | Treat evidence as invalid; investigate and rerun, never edit a result to passed |
| Failed test / timeout | Inspect individual evidence, fix, refresh discovery when necessary and rerun all affected checks |
| Blocked commit-bound check | Review and commit changes yourself, ensure a clean worktree, then discover and rerun; scripts do not commit for you |
| Source changed during/after tests | Rerun on a stable source tree; previous evidence is stale |
| Symlink/junction/unsafe path | Use ordinary repository directories; do not relax containment checks |

Do not delete household files, change firewall settings, rotate credentials or sideload devices as a recovery action for an engineering check.

## Adding a capability

Create the actual asset and a strict manifest entry with an ID, type, description, tags, entrypoint/resources, dependencies, applicability, specialist owner, permissions, validations and version. Keep resources repository-relative with `/`, no traversal. Run registry validation and tests, then fresh discovery before use. Add negative tests when broadening the command or permission model. Full agent-executed feature/deploy workflows remain future work.

## CI

CI installs the pinned lockfile with lifecycle scripts disabled, independently discovers, reads selected instructions, runs foundation and read-only SDK inspection workflows and verifies their current-commit evidence. Any failed or blocked gate fails the job. Artifacts are uploaded without the signing key. SDK inspection never calls device tools; default foundation checks remain usable without SDK/device access. Windows execution is locally tested; Linux and hosted Actions execution are not claimed until CI actually runs. Branch protection remains an owner decision.