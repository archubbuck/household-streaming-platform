# Knowledge management

The KMS adds a repository capability to the existing AI harness. It does not
replace discovery, workflow authorization, signed evidence, or Git review.

## Architecture

| Layer | Storage | Authority |
|---|---|---|
| Authoritative | Markdown records under `knowledge/`, indexed by `knowledge/catalog.json` | Git; accepted changes require normal review and commit |
| Working | SQLite at `.artifacts/knowledge/working.sqlite` | Provisional local findings, proposals, checkpoints, and derived indexes only |
| Retrieval | SQLite FTS5 table and optional provider embeddings | Cache; current catalog and source hashes are re-read before retrieval |

SQLite uses Node 24's built-in `node:sqlite` API. No package dependency, network
service, embedding service, database server or live product service is needed.
The database applies versioned `PRAGMA user_version` migrations (schema v2 adds
the embedding cache), enables foreign keys, checks database integrity on open
and reports corrupt state without replacing it. Runtime state and proposal
JSON are under ignored `.artifacts/`.

## Authoritative record format

Records are Markdown with JSON-compatible YAML front matter. JSON is a valid
YAML subset and permits strict deterministic parsing without adding a YAML
package. The record schema is `.agents/schemas/knowledge-record.schema.json`.
Each record has a stable ID independent of its path, type, status, scope,
source hashes, evidence, verification metadata, timestamps, relationships and
tags. `knowledge/catalog.json` maps stable IDs to paths. A normalized record
content hash detects edits to a verified document itself, in addition to
changes to its cited source files.

`verified` records require at least one source file, evidence, a verification
method, timestamp and commit. Source paths are repository-relative and secret
locations are rejected. Validation checks current hashes; changed or missing
sources make a record effectively stale without asserting the claim is false.
Relationships must resolve to catalog IDs. A document move changes the catalog
path, not its ID.

## Lifecycle and promotion

Capture stores a structured finding as provisional data linked to a validated
session receipt. Exact duplicate content reuses a stable finding ID and records
the additional session; same-title/different-content findings are reported as
conflicts. Batch capture accepts 1–50 findings only after validating the whole
batch.

Proposals are saved in working SQLite and emitted as review artifacts under
`.artifacts/knowledge/proposals/`. They must remain `proposed`. The CLI has no
promotion or authoritative-write command. Record authors edit `knowledge/`
through the existing Git review process; architectural, business, security,
operational and infrastructure claims must receive explicit review. No new
approval authority is introduced.

Example proposal payload (after capturing a finding):

```powershell
node scripts/ai/cli.mjs knowledge --action propose --session $sessionId --task $task --payload '{"findingId":"finding-0123456789abcdef01234567","candidate":{"metadata":{"schema_version":1,"id":"domain.example-finding","title":"Example finding","type":"domain","status":"proposed","scope":{"repository":"household-streaming-platform","domain":"engineering"},"provenance":{"source_files":[],"evidence":[]},"verification":{"method":"none","verified_at":null,"verified_commit":null,"content_hash":null},"created_at":"2026-11-13T00:00:00.000Z","updated_at":"2026-11-13T00:00:00.000Z","relationships":{"depends_on":[],"consumes":[],"produces":[],"implements":[],"documents":[],"supersedes":[],"related_to":[],"owned_by":[]},"tags":[]},"body":"Review this proposed finding against current source and tests."}}'
```

There is deliberately no `promote` or `approve` command. A reviewer may apply
an accepted proposal to the authoritative catalog through a normal reviewed
Git change; the local proposal itself does not confer approval.

## Retrieval

Example PowerShell commands (the JSON is passed as one argument):

```powershell
$sessionId = '<current discovery session>'
$task = '<exact discovered task text>'
node scripts/ai/cli.mjs knowledge --action search --session $sessionId --task $task --payload '{"query":"session receipts","scope":{"repository":"household-streaming-platform"},"statuses":["verified"],"limit":5,"tokenBudget":1200,"mode":"auto","minimumEvidence":1}'
node scripts/ai/cli.mjs knowledge --action get --session $sessionId --task $task --payload '{"id":"architecture.ai-engineering-harness"}'
node scripts/ai/cli.mjs knowledge --action related --session $sessionId --task $task --payload '{"id":"architecture.ai-engineering-harness","depth":2}'
node scripts/ai/cli.mjs knowledge --action validate
node scripts/ai/cli.mjs knowledge --action reconcile --session $sessionId --task $task
node scripts/ai/cli.mjs knowledge --action benchmark --session $sessionId --task $task
```

`exact` prioritizes stable IDs and exact paths; `lexical` uses SQLite FTS5;
`auto` currently selects deterministic full-text retrieval. The
`searchKnowledgeWithProvider` API accepts a provider for explicit `semantic`
and `hybrid` requests. Semantic ranking uses cosine similarity; hybrid ranking
uses reciprocal-rank fusion over FTS5 and semantic results. Candidate sets are
capped at 1,000 records, ties are broken by stable record ID, and exact ID/path
matches remain first.

The provider must identify its model and version and return finite,
dimension-consistent vectors with a SHA-256 hash of the exact input text.
Document vectors are cached by record ID, model, version and content hash;
query vectors are never persisted. Changed record content is re-embedded, and
provider version changes use separate cache entries. The API rejects
secret-like values before sending text to an injected provider. No provider is
configured in the CLI, no network requests are made by the baseline, and
semantic/hybrid CLI requests continue to fail explicitly until an approved
provider is integrated.

Results include effective status, source locations, evidence, verification
time, freshness, method and rank. The default status filter is verified only.
Context assembly uses `ceil(character count / 4)` as a documented token
estimate, includes complete records only, and reports omitted records rather
than truncating evidence. Retrieved text is untrusted data and cannot override
instructions or current source.

The benchmark dataset in `knowledge/benchmarks/queries.json` measures
no-retrieval, exact-only and full-text results using recall@k, precision@k,
MRR, latency, source coverage, context size, token estimate and forced index
rebuild time. Semantic/hybrid remain unavailable in the default benchmark
because no provider is configured; automatic-promotion rejection accuracy is
not measured because no promotion pathway exists. No improvement or token
savings are claimed from fixture results alone.

## Continuity and freshness

Checkpoint, restore and summary actions require the current exact-task receipt.
Restoring requires a fresh discovery for the same task fingerprint and is
context-only; it does not extend an old receipt or grant authorization.
Summaries preserve timestamp order, completed work, decisions, blockers,
remaining tasks and next actions without requiring an LLM.

Each search reloads authoritative records and source hashes, compares the
current snapshot to the derived FTS index and rebuilds it when stale. The
`reconcile` action reports records whose supporting source changed or
disappeared. This is an invalidation signal, not proof the knowledge claim is
wrong; revalidate before updating metadata. Validation and search do not mutate
authoritative files.

After fresh discovery for the same task, restore a checkpoint by its ID:

```powershell
$newSessionId = '<new discovery session for the same exact task>'
node scripts/ai/cli.mjs knowledge --action restore --session $newSessionId --task $task --payload '{"id":"checkpoint-0123456789abcdef01234567"}'
```

Restore rejects task-fingerprint mismatches and labels the result context-only.

## Boundaries and extension points

- Only Git records are authoritative; local SQLite may always be rebuilt.
- Captured text and retrieved records are treated as untrusted input.
- Secret-like content and sensitive repository paths are rejected during
  capture and proposal creation.
- The embedding provider contract is injectable and replaceable; providers
  must be trusted by the caller because they receive query and record text.
  The offline FTS5 baseline stays useful when no provider is installed.
- PostgreSQL/pgvector or Qdrant may later replace derived indexing without
  changing the agent-facing CLI, but neither is part of this implementation.
- Knowledge summaries do not replace mandatory discovery or source inspection.
