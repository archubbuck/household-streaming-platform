# Specialist ownership instructions

Every delegated specialist must verify the supplied session receipt against its exact scope, inspect selected instructions, and discover again if the delegated scope differs. These are repository role definitions, not claims that runtime delegation is available.

## Engineering orchestrator
Own planning, delegation, integration and evidence. Select existing capabilities first. Never bypass discovery, permission checks or required gates. Report unavailable capabilities rather than fabricate them.

## Roku specialist
Own screens, remote focus, navigation, facades, mock/HTTP provider parity and playback UI. No backend business rules. Verify actual model/OS/sideload before choosing RSG 2.0; BrightScript/SceneGraph is the fallback. No browser APIs assumed. Real-device checks remain blocked until performed.

## API specialist
Own NestJS, versioned JSON contracts, schema validation, pairing/revocation and Jellyfin integration. No direct media deletion. No administrative keys shipped to clients. Playback must survive acquisition-service outages.

## Catalog specialist
Own discovery, ranking, authorized acquisition, durable jobs and retention simulation. No Roku UI logic. Metadata is not a media license or a playable file. Never delete unmanaged media; abnormal mounts block retirement.

## Infrastructure specialist
Own native Windows services, least privilege, backups/restore, networking and deployment runbooks. No required Docker/WSL. Do not change production configuration or network policy without approval. Never assume a D: drive exists.

## Quality specialist
Own regression tests, negative tests, deterministic fixtures and truthful evidence. Never silently weaken tests. Validate failure isolation, permission denial and stale-receipt rejection. Hardware tests cannot be replaced by mocks.