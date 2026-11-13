---
{
  "schema_version": 1,
  "id": "architecture.ai-engineering-harness",
  "title": "AI Engineering Harness and Evidence Boundaries",
  "type": "architecture",
  "status": "verified",
  "scope": {
    "repository": "household-streaming-platform",
    "domain": "engineering"
  },
  "provenance": {
    "source_files": [
      {
        "path": "AGENTS.md",
        "sha256": "32c49f157b123803972d234182aab99be9e1115e6cfb807215ac10741c7b0c9f"
      },
      {
        "path": "scripts/ai/runner.mjs",
        "sha256": "271b8f3b093637f5b92671da6d3cc01532a0766cf6cf558882802de158604717"
      }
    ],
    "evidence": [
      {
        "kind": "file",
        "ref": "AGENTS.md"
      },
      {
        "kind": "commit",
        "ref": "641cb1a606a45dc0ac3bda92b27b839cd3e24cde"
      }
    ]
  },
  "verification": {
    "method": "code",
    "verified_at": "2026-11-13T00:36:56.171Z",
    "verified_commit": "641cb1a606a45dc0ac3bda92b27b839cd3e24cde",
    "content_hash": "5d7e79c884e31624b576d04ee56b9098325dea554e1460ed3e4e25a501ef99d5"
  },
  "created_at": "2026-11-13T00:36:56.171Z",
  "updated_at": "2026-11-13T00:36:56.171Z",
  "relationships": {
    "depends_on": [],
    "consumes": [],
    "produces": [],
    "implements": [],
    "documents": [],
    "supersedes": [],
    "related_to": ["architecture.streaming-implementation-boundaries"],
    "owned_by": []
  },
  "tags": ["discovery", "receipts", "workflows", "evidence"]
}
---

Every new engineering session starts with repository instructions and a fresh,
exact-task discovery receipt. Receipts bind the task fingerprint, selected
capabilities, instruction paths, registry hash, and a 24-hour validity window.
The registry hash covers registered instruction and implementation files, so
relevant registry changes require fresh discovery.

The workflow runner executes only registered checks. Its task evidence is
signed and tied to the current commit and source digest. A clean committed
worktree is required for merge readiness; local validation does not commit
changes or prove Roku hardware behavior.
