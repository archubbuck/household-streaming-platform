# Knowledge maintenance runbook

## Validate and search

Run `node scripts/ai/cli.mjs knowledge --action validate` to validate the
catalog, record schemas, relationships, provenance paths and source hashes.
Use `--action search` or `--action get` for read operations. Search refreshes
the ignored SQLite/FTS index whenever its source snapshot differs from the
current Git-managed records.

Run `--action reconcile --session <id> --task "<exact task>"` after discovery
and code changes to list potentially stale records and refresh the index. A stale record means evidence changed or disappeared;
it does not establish that the documented claim is false. Inspect current
source and tests before correcting a record or its verification metadata.

## Capture and propose

Capture and checkpoint commands must include the exact task and current
discovery session:

```powershell
node scripts/ai/cli.mjs knowledge --action capture --session <id> --task 'Implement persistent agent knowledge management capability' --payload '{"classification":"observation","title":"A verified finding","details":"The observation and its evidence.","source_refs":[{"path":"scripts/ai/runner.mjs"}],"related_knowledge":["architecture.ai-engineering-harness"]}'
node scripts/ai/cli.mjs knowledge --action checkpoint --session <id> --task 'Implement persistent agent knowledge management capability' --payload '{"objective":"Continue task","completed":[],"remaining":[],"decisions":[],"findings":[],"files":[],"validations":[],"blockers":[],"next_actions":[]}'
```

These are working-state writes only. Findings remain provisional. A proposal
must reference a captured finding and a `proposed` record; inspect its
`.artifacts/knowledge/proposals/` artifact and apply accepted changes through
normal Git review. There is intentionally no automatic promotion command.

## Restore after a new session

Run mandatory discovery again in the new session for the exact task, read its
instructions and validate the new receipt. Then run `knowledge --action
restore` with that new session ID and same task text. If the task text differs,
the checkpoint is not restored. Treat checkpoint content as untrusted context
and re-check current source and authorization.

## Database recovery

The local database is disposable derived state. If opening it reports an
integrity or schema-version error, preserve the file for diagnosis; never edit
it to fabricate valid state. If the user confirms that provisional findings
and checkpoints may be discarded, move only
`.artifacts/knowledge/working.sqlite` plus its specific `-wal`/`-shm` sidecars
aside, then run `knowledge --action index` to rebuild authoritative search
data. Findings/checkpoints are not recoverable from the Git catalog, so do not
remove them without explicit authorization. A future export/restore workflow
may address working-state backups.

## Security and limitations

The runtime database and proposal artifacts are ignored by Git. Avoid placing
credentials, access tokens, private keys, household content or unrelated
personal data in findings. Path checks reject secrets, environment files,
runtime artifacts, dependency folders and repository metadata. This is
application-level filtering, not an OS sandbox.

Provider-injected semantic and hybrid retrieval and a local, versioned
embedding cache are implemented. No provider is configured in the default CLI
or benchmark, so those operations continue to report unavailable rather than
silently falling back. Full-text fallback remains offline. Automatic
promotion, source-symbol analysis, automatic proposal conflict resolution and
remote database adapters are not implemented. Promotion and material changes
to governance require existing Git review.
