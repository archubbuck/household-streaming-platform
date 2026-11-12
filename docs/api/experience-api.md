# Experience API foundation

This is an incomplete NestJS foundation, **not production-ready**. It is
used by the development browser preview. No actual Jellyfin server,
Roku, playback, Windows ACL, or TLS proxy has been verified. Do not expose it on
the network or deploy it until authentication, transport, compatibility,
contracts and operational security are independently reviewed and validated.

## Local development

Build and test with:

```sh
pnpm --filter @household/experience-api build
pnpm --filter @household/experience-api test
```

The API and device CLI automatically create and initialize the device database
at `~/.household-streaming/devices.sqlite` in the current OS user's home
directory. They create the required tables on first use and preserve existing
records on subsequent launches. No accounts, pairing codes, or pre-authorized
devices are seeded; the owner must explicitly approve each device. The home
directory must be the same for the API and CLI, including when a service runs
under a separate account.

The former `HOUSEHOLD_DEVICE_DB` setting is ignored. Existing databases at that
location are not migrated and devices paired there must be paired again. On
POSIX the new directory is created mode 0700 and the database mode 0600;
existing unsafe permissions, symlinks and additional hard links are rejected
rather than changed. Windows owners must configure and verify appropriate ACLs
themselves; the application does not currently enforce Windows ACLs. Back up
the database securely. Pairing codes and bearer credentials are stored only as
SHA-256 digests; loss of this database invalidates paired devices.

For a real server, set `HOUSEHOLD_JELLYFIN_MODE=live`, `JELLYFIN_BASE_URL`, `JELLYFIN_API_KEY`, and
`JELLYFIN_HOUSEHOLD_USER_ID` as environment variables outside Git. The process
does not automatically load `.env`. Use a scoped service credential where
supported; never put it in a Roku client. Cleartext Jellyfin URLs are accepted
only for loopback; other addresses require HTTPS. No Jellyfin configuration
changes are performed.

Start the compiled service with `pnpm --filter @household/experience-api start`.
It binds only `127.0.0.1`, port 3000 by default; `HOUSEHOLD_API_PORT` changes
the port. `HOUSEHOLD_API_HOST` is currently ignored. A remotely accessible
service would require a separately secured TLS termination and threat review,
not included here. Do not forward plaintext pairing codes or credentials over a
network.

As the same OS user as the API, run
`pnpm --filter @household/experience-api device pair-code` in a private local
terminal. It prints a random one-time code valid for five minutes. Treat the
output as a secret; do not capture it in logs, tickets or chat. Send it as
`{"code":"..."}` to `POST /v1/devices/pair` over a trusted connection.
The response contains the device ID and a bearer credential shown only once.
The client must store that credential securely. To revoke access locally, run
`pnpm --filter @household/experience-api device revoke <device-id>`; revocation
is persistent. An invalid, expired or reused code is rejected.

## Routes and limitations

All routes other than pairing, health, and the sample-only preview catalog
require a bearer credential. `/openapi` provides generated preliminary Swagger documentation;
response schemas and error contracts are not yet complete.

| Route | Current behavior |
|---|---|
| `GET /v1/health` | Process liveness, configuration status, and `catalogSource` (`live` or `mock`); connectivity is not checked. |
| `GET /v1/preview/catalog` | Unauthenticated, explicitly marked sample catalog for the local browser preview; not real media or a production contract. |
| `GET /v1/home` | Recently added playable movies with media sources. |
| `GET /v1/catalog/movies`, `/v1/catalog/series` | First 100 entries; optional `genre`, `sort` (`SortName`, `DateCreated`, `ProductionYear`) and `order` (`Ascending`, `Descending`). Pagination is not yet implemented. |
| `GET /v1/catalog/search?q=` | Search for playable movies and episodes. |
| `GET /v1/catalog/:id` | Item and related titles. |
| `GET /v1/series/:id/episodes` | Episodes grouped by season. |
| `POST /v1/devices/pair` | Consume a local owner-generated pairing code. |
| `POST /v1/household/favorites` | Set a Jellyfin favorite with `{"id":"...","favorite":true}`. |
| `POST /v1/playback/sessions`, `/v1/playback/:id/progress`, `/v1/playback/:id/stop` | Return 501; playback and progress are not implemented. |

Artwork proxying, pagination, full OpenAPI schemas, playback negotiation,
progress and resume, robust readiness, real-service compatibility tests,
credential lifecycle operations beyond local revocation, and native Roku
integration remain outstanding. A missing Jellyfin configuration or upstream
failure is an error, not an empty catalog.

## Browser preview

Start the API and preview as described in the README. The preview's loopback
server forwards only its allowlisted routes to the loopback API, validates its
Host header, and requires a same-origin POST for pairing and favorites. It is
not a TLS proxy, production gateway, or protection against other local
processes. Do not expose it or forward pairing codes over an untrusted
connection. **Connect Jellyfin** exchanges a local owner-generated pairing code
and keeps the bearer credential only in browser memory. Reloading or closing
the tab discards it but does not revoke the device; the profile displays its
device ID for the local revoke command. A new connection requires a new code.

The preview loads API sample data without pairing; after pairing it loads
movies and series from the authenticated mock or live catalog and shows samples separately.
No failed authenticated request falls back to samples. Search is local to the
loaded entries. Real favorite changes go to the API; sample favorites and all
playback are simulations. Missing artwork, runtime and genre are not filled
with invented details about a real title. Catalog pagination, real playback
and live Jellyfin validation remain outstanding.

## Offline mock Jellyfin

Mock mode is the default when `HOUSEHOLD_JELLYFIN_MODE` is unset; it can also
be explicitly set to `mock`. Unset `JELLYFIN_BASE_URL`, `JELLYFIN_API_KEY`,
and `JELLYFIN_HOUSEHOLD_USER_ID` for the API process: mock mode rejects
nonempty real connection settings. To use a real server, explicitly set
`HOUSEHOLD_JELLYFIN_MODE=live` along with the connection settings. Live mode
never falls back to the mock if Jellyfin is missing or fails.

Mock mode starts an ephemeral loopback-only fake upstream with a synthetic
catalog; the existing Jellyfin HTTP adapter, device pairing, authorization and
API routes remain in the path. Generate a pairing code using the usual device
CLI and connect in the preview. Movies, series, episodes, search, details and
favorites are simulated; favorites are shared in memory until the API exits.
No media files exist, and playback routes still return 501. The preview
identifies the upstream as mock. This mock is not a full Jellyfin implementation
and does not establish compatibility with a real server.
