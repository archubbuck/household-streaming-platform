---
{
  "schema_version": 1,
  "id": "architecture.streaming-implementation-boundaries",
  "title": "Streaming Product Implementation Boundaries",
  "type": "architecture",
  "status": "verified",
  "scope": {
    "repository": "household-streaming-platform",
    "domain": "product-status"
  },
  "provenance": {
    "source_files": [
      {
        "path": "household_streaming_platform_specification.md",
        "sha256": "3ff3285f47148353c90e3b321683ced0305a57bc645b8f8981a221f868ab18a0"
      },
      {
        "path": "apps/experience-api/src/app.ts",
        "sha256": "9d2a78a327ea361647fe9ae542c2cbffd8fc6695775642a1b475b41ec654f928"
      },
      {
        "path": "apps/experience-api/src/api.test.ts",
        "sha256": "d21ceafd9558923ee55df03da0fdce47baac659ea7f60842f3b66798510620c3"
      }
    ],
    "evidence": [
      {
        "kind": "file",
        "ref": "apps/experience-api/src/app.ts"
      },
      {
        "kind": "file",
        "ref": "apps/experience-api/src/app.ts"
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
    "content_hash": "3e9db87ec3fd1b01eeea10f86722355659408c8ade8b9a56f31437512d5b5a30"
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
    "related_to": ["architecture.ai-engineering-harness"],
    "owned_by": []
  },
  "tags": ["jellyfin", "playback", "planned", "unimplemented"]
}
---

The product specification defines requirements and is not proof that they are
implemented. The current API is an incomplete foundation: its playback routes
explicitly return an unavailable response. Do not describe the repository as a
completed streaming application or infer live Jellyfin or Roku behavior from
mock and static checks.
