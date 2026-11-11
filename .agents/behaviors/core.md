# Mandatory engineering behaviors

- **Ownership:** Jellyfin owns playable media and watch state; API composes contracts and never manipulates files; orchestrator owns authorized acquisition and retention; Roku owns transient presentation. Inspect existing implementations before editing.
- **Determinism:** Prefer registered scripts, fixed fixtures/clocks, pinned dependencies and explicit inputs. Never invent an available command. Register and test capabilities before using them. Keep changes scoped.
- **Recovery:** Fail closed on missing discovery, invalid manifests, stale evidence, unsafe paths and unavailable dependencies. Bound retries. Do not treat failures as empty successful results.
- **Security:** Never put credentials, playback tokens or sensitive URLs in logs, tasks or evidence. Use sanitized task descriptions. Require explicit approval for deployment, destructive changes, credential rotation and firewall changes. Acquire only authorized sources. Deletion remains disabled and dry-run enabled.
- **Validation:** Run affected deterministic tests after changes. Record passed, failed, skipped or blocked honestly. A build is not proof of device playback or focus behavior. Tie evidence to Git commit and source digest; an unborn or dirty repository is not merge-ready.
- **Documentation:** Update contracts, ADRs and runbooks with behavior. Record missing hardware/configuration as explicit gates. Keep mock-only UI independent of live services and presentation dependent on facades/provider interfaces.

Discovery is refreshed after registry/instruction/script changes. Receipts expire after 24 hours, are exact-task-bound, and must be explicitly passed to a workflow. Never reuse a previous chat's receipt as a new chat's discovery.