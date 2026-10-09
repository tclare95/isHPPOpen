# Design: CSO catalogue and selection

## Provider catalogue adapter
`ICsoAssetProvider.DiscoverAssetsAsync` exposes source-specific paging and maps an explicit stable external `Id` to platform `providerId:overflow:externalId`. Store original provider IDs, optional permits, coordinates and receiving watercourse with unknown/null when unavailable. **Never key canonical assets by ArcGIS OBJECTID.** Include `sourceUpdatedAt`, `fetchedAt`, source attribution and schema version. Validate geometry/duplicate asset IDs/required fields; quarantine malformed records with safe per-record diagnostics.

The current Severn Trent code queries an ArcGIS feature layer via `Id`, and reads `Status`, `StatusStart`, `LatestEventStart`, `LatestEventEnd`, `LastUpdated`. Before writing adapter integration tests, confirm the **current live layer schema, coded status values, rate/pagination limits and data terms**. It was not possible to verify the live schema conclusively during refinement; do not assume standard ArcGIS defaults apply. Fetch all object IDs or use supported paging, then bounded feature batches, verify complete iteration before committing a new catalogue version.

An incomplete/invalid refresh does **not** delete assets or replace a previously verified snapshot. Store last good catalogue version and its freshness; expose missing/changed assets as diagnostic changes and retain historical identities when provider drops assets.

## Version-controlled configuration
Example (placeholders, not verified outfalls):

```yaml
schemaVersion: 1
providers:
  severn-trent:
    adapter: arcgis-storm-overflows
    enabled: true
    catalogueRefreshHours: 24
collection:
  pollIntervalMinutes: 15
collectionSets:
  hpp-upstream:
    provider: severn-trent
    enabled: true
    assetIds: [SVE0227, SVE0123]
    provenance:
      source: legacy-sewage-map-import
  trent-other:
    provider: severn-trent
    enabled: false
    assetIds: []
```

The config is validated in CI and at function startup: unique set IDs, recognised providers, finite bounded polling interval, canonical ID normalisation, no duplicates within a set, and no zero-length/invalid IDs. An *unresolvable but syntactically valid ID* is a runtime planning problem, not config corruption. No dynamic selection by geography in v1. Existing site mappings may reference named sets but do not dictate whether they collect.

## Compile selection into a plan
Compute union of enabled configured external IDs grouped per provider. Resolve against **last successfully committed catalogue snapshot**. One selected ID appears once regardless of set count. Record config version/hash, catalogue version, effective selected IDs, unresolved IDs, expected count and issue list for every collection run. Plan generation is deterministic for identical inputs; provide a dry-run command/report with added/removed/unchanged/unresolved IDs. An unresolved ID persists in the plan as `unresolved` and is automatically re-eligible on next successful catalogue refresh.

No automatic collection on discovery. A missing catalogue does not become an empty authoritative selection; the plan either uses the last verified catalogue with stale indication or fails closed when none exists. An intentionally empty enabled selection means no operational polling, not an error.

## Jobs and reliability
- Independently scheduled catalogue refresh (initially daily) and CSO poll (initially 15 minutes); same .NET repo but separate entrypoints/jobs.
- Poller consumes only the validated plan. Prefer provider-supported bounded batch query, controlled concurrency/timeout/backoff and provider 429 handling; avoid unbounded per-ID fan-out or unnecessary SQS.
- Partial per-asset errors do not prevent successful peers from being fetched. Separate **asset resolved**, **provider requested**, **response received** and **durably persisted** metrics; the next [#72](https://github.com/tclare95/isHPPOpen/issues/72) change owns durable snapshot/event writes.
- A status API response of HTTP 200 with embedded ArcGIS error, malformed content or missing selected ID is a failure for that ID, never a benign `not_spilling`.
- No runtime calls to Sewage Map: legacy import is a separately reviewed, offline utility/config preparation step, preserving attribution and selection semantics without claiming independently verified hydrological upstream relationships.

## Acceptance boundaries
Fixture and recorded-schema tests for pagination, disappearing IDs, duplicate selection, stale catalogue, config validation and source API errors. Staging-only externally reviewed release; existing Node polling remains unchanged until independently approved consumer migration.

## Minimal, independently selected integration stage

Use stage-local **version-controlled collection sets** with a few explicit test outfall IDs; do not dynamically select all discovered Severn Trent assets or infer stage selection from production config. The provider's complete catalogue can be discovered on demand in bounded pages, optionally seeded from fixture snapshots during ordinary CI. The initial daily catalogue / 15-minute operational polling values are **production defaults, not a requirement for continuously running staging schedules**. Leave EventBridge stage collection disabled by default; a reviewed integration smoke manually invokes a bounded run and reports plan/config/collection health. Stage catalogue snapshots and any later spill evidence belong only to stage-specific Dynamo/S3 resources and IAM (same AWS account allowed with isolation). See [#75](https://github.com/tclare95/isHPPOpen/issues/75).
