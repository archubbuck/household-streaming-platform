# ADR 0001 — Bootstrap-first, constrained engineering automation

- Status: accepted for the initial M0 increment
- Scope: repository engineering only; no product/runtime technology commitment

## Context

The initial repository contained only the specification and an empty ignore file. Discovery could not run because no AGENTS instructions, scripts or registry existed. Pretending the initial session had passed discovery would violate the design.

## Decision

Treat initial creation and explicitly requested repair of discovery as a narrow bootstrap-only exception. Do not execute product work until real discovery succeeds. Once created, every new chat must discover; task or registry changes invalidate old receipts. No previous session is retroactively marked discovered.

Use Node 24 ESM for bootstrap scripts, Ajv with pinned dependencies for JSON Schema validation, and Node's native test runner. This avoids a TypeScript compilation dependency before discovery. Future apps/packages remain TypeScript, NestJS/Jest/Prisma choices remain per the specification, and Roku SDK/toolchain selection remains gated by real hardware.

Use JSON workflow definitions (the specification's YAML was illustrative). M0 supports **script-only** foundation checks. Command manifests must match a code-level allowlist; no shell strings, arbitrary executables, interpolation, delegated agent execution, deploy steps or source-write commands are supported. Add schema, permission and regression coverage before broadening that surface.

Each capability declares full metadata. Bundled specialists and global behaviors keep initial instructions compact; selected agents share the specialist document. Completeness covers all `.agents` files except manifests (which are independently validated), every script, ADR/runbook, and recognized `.github` agent customization directories. Other documentation is included when declared as a resource. Registry hashing includes instructions, capabilities, scripts/tests, package/lockfile, CI, workspace and ignore configuration.

Receipts bind exact task fingerprints, selected capabilities, instruction paths, registry hash, session UUID and a 24-hour lifetime. Evidence also binds commit SHA and source digest (tracked plus nonignored untracked files). A committed, clean tree and all mandatory checks are required for `readyForMerge`.

## Trust boundaries and limitations

- A local HMAC detects accidental/manual edits to receipts/evidence without the key. It is **not** attestation against a user or agent with filesystem/key access. CI recreates discovery and evidence on the checked-out commit and never trusts a submitted local receipt.
- Instructions cannot prove an agent read/understood text or prevent unrelated editor tools from executing. The runner enforces gates on its own execution surface only.
- Repository scripts/tests are trusted code. They are not isolated in an OS sandbox. The runner denies unregistered commands, validates declared repository writes, rejects existing symlink/junction paths and detects source changes; this is not race-proof Windows media-file identity protection. No destructive media operations are exposed.
- Git and Node executables are trusted host dependencies. Secrets are ignored, never used in this workflow, and must not be put into task text or test logs. Windows ACL hardening for service identities remains M4 work.
- A receipt can be validated locally only while its local key exists; CI uploads task artifacts but not the signing key. Downloaded evidence is inspectable, not locally re-attestable. Rerun CI for authoritative status.
- Hardware checks, mock Roku UI, playback, API, catalog, retention and deployment remain explicitly unimplemented. Foundation readiness is not product readiness.

## Consequences

The first real local workflow is expected to be blocked at the commit gate until the user reviews and commits changes. Tests demonstrate full pass/verify behavior using isolated temporary committed repositories, never by committing the user's repository. CI is configured for Windows and Linux but must run on hosting before CI parity can be claimed as observed.