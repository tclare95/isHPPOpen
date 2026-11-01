# CSO first-party read API v1 — proposed contract fixtures (#72)

This describes **six CSO GET routes added to the existing RDP HTTP API Gateway / read Lambda**, alongside the implemented four observation routes. All routes use `AWS_IAM` and exact stage-scoped server-to-server Vercel OIDC + SigV4. No browser invocation, public API change, storage write permission or arbitrary S3 key input. The implementation should keep its existing `{data,meta}` / `{error:{code,message},requestId}` conventions.

## Explicit routes

| Route | Purpose and shape |
| --- | --- |
| `GET /v1/cso/outfalls` | Bounded/paginated verified #71 catalogue metadata (provider/outfall identity, optional metadata, selected/set attribution and verified catalogue version/freshness). No implied downstream impact. |
| `GET /v1/cso/outfalls/status?ids=...` | 1–20 unique canonical IDs, independent per-ID status, reported/effective/freshness and attempt/durable times. |
| `GET /v1/cso/outfalls/{id}/events?from=...&to=...&limit=...&cursor=...` | Completed, ongoing and unresolved events overlapping UTC `[from,to)`, across hot and archived tiers, ordered by authoritative `startedAt`, then stable `eventId` (uncertain boundaries explicitly indicated). |
| `GET /v1/cso/events/{eventId}` | Stable ID, canonical outfall, authoritative interval or uncertain bounds, lifecycle, current revision, reconciliation and source provenance. |
| `GET /v1/cso/events/{eventId}/revisions` | Bounded/paginated immutable material revision summaries, claim references and change reasons; no raw S3 paths or provider bodies. |
| `GET /v1/cso/outfalls/{id}/health` | Selection/catalogue health, last attempt, last successful fetch, source age, last **durable** ingest, failure and unresolved-claim diagnostics. |

Canonical outfall IDs are provider-scoped, not ArcGIS `OBJECTID`. Example `severn-trent:overflow:SVE0227` is illustrative; #71's verified ID model is authoritative. All timestamps are UTC ISO 8601 `Z` in output. Required `from` inclusive and `to` exclusive accept full timestamps with numeric offset or `Z` as the existing RDP API does. Reject duplicate, malformed, unexpected or excessive request values.

Initial operational budgets (design defaults, adjustable with evidence): status up to 20 IDs, event history default 100 / max 500 events, up to 366 days per query, same approximately 20s work and 4MiB response limits as RDP's read API; bounded catalogue/revisions too. No unbounded scans or a full-history download in one request.

## Current status example

`GET /v1/cso/outfalls/status?ids=severn-trent%3Aoverflow%3ASVE0227`

```json
{
  "data": [{
    "assetId": "severn-trent:overflow:SVE0227",
    "reportedState": "spilling",
    "effectiveState": "unknown",
    "freshness": "stale",
    "sourceUpdatedAt": "2026-10-08T12:00:00Z",
    "fetchedAt": "2026-10-08T12:05:00Z",
    "lastSuccessfulPollAt": "2026-10-08T12:05:00Z",
    "lastDurablePersistAt": "2026-10-08T12:05:02Z",
    "status": "available"
  }],
  "meta": { "retrievedAt": "2026-10-08T13:00:00Z", "partial": false }
}
```

Allowed `reportedState`: `spilling | not_spilling | offline | unknown`. Allowed `effectiveState`: `spilling | not_spilling | unknown`. Allowed `freshness`: `fresh | stale | unknown`. Current status is not event lifecycle. A cached/old `spilling` statement with stale source time becomes effective `unknown` without ending the event. A fresh stopped statement without a verified event end does **not** manufacture one.

Known-but-never-collected assets yield `no_observations`, last reported/effective status unknown. A configured but unresolved ID is exposed as unresolved in selection health (and may be reported as an explicit unresolved per-ID batch outcome); it cannot be represented as not spilling. Unknown IDs absent from known catalogue/selection yield `ASSET_NOT_FOUND`. Per-ID dependency failures can yield `unavailable` with `meta.partial=true`; all failed → 503.

## Event history example

`GET /v1/cso/outfalls/{id}/events?from=2024-01-01T00:00:00Z&to=2025-01-01T00:00:00Z&limit=100`

```json
{
  "data": [{
    "eventId": "evt_example_001",
    "assetId": "severn-trent:overflow:SVE0227",
    "startedAt": "2024-04-01T10:04:00Z",
    "endedAt": "2024-04-01T10:52:00Z",
    "lifecycle": "completed",
    "boundaryProvenance": "provider_reported",
    "revision": 2,
    "reconciliation": "resolved"
  }],
  "meta": {
    "assetId": "severn-trent:overflow:SVE0227",
    "from": "2024-01-01T00:00:00Z",
    "to": "2025-01-01T00:00:00Z",
    "coverage": {
      "status": "partial",
      "gaps": [{ "from": "2024-01-01T00:00:00Z", "to": "2024-03-01T00:00:00Z", "reason": "not_collected" }]
    },
    "pageIntegrity": "verified",
    "nextCursor": null
  }
}
```

IDs/timestamps are fixtures only; no claim of actual 2024 Severn Trent events. Full event interval overlaps `[from,to)` when `startedAt < to` and (`endedAt` absent or `endedAt > from`); an uncertain interval must expose bounded/potential overlap and provenance rather than a fictitious exact duration. A carried-in event starting before `from` remains discoverable. Ordering and pagination must be deterministic when an event changes its start time; no duplicate from the hot/S3 overlap. A stale archive generation or unsafe continuation returns a stable cursor error, never silently resets.

Coverage `complete | partial | unknown` is separate from event freshness, missing-provider reports, and the integrity of archive records actually read. Do not infer complete coverage from a 15-minute poll cadence, event count or HTTP 200. Verified available events may accompany known source coverage gaps. Missing/corrupt/inaccessible **expected committed** archive objects fail the affected request (503), not 200 with a manufactured gap.

## Event detail and revisions

`GET /v1/cso/events/{eventId}` returns one canonical identity, event lifecycle (`ongoing | completed | unresolved`), authoritative or bounded uncertain boundaries, current revision, provenance and reconciliation status. A completed event corrected after archiving returns the newer authoritative values under **the same ID**. An event still open despite offline telemetry retains `endedAt: null`.

`GET /v1/cso/events/{eventId}/revisions` returns bounded summaries with `revision`, `recordedAt`, `sourceUpdatedAt` where validated, `claimId`, `changeReason`, previous/current fields and reconciliation attribution. Contradictory unresolved claims are visible through safe metadata, not fabricated revisions or raw provider payload disclosure.

## Errors and safety

| Case | Code / HTTP |
| --- | --- |
| Bad/duplicate input, malformed ID, excessive window/limit | `VALIDATION_ERROR` / 400 |
| Tampered or mismatched continuation | `INVALID_CURSOR` / 400 |
| Expired / generation-stale continuation | `CURSOR_EXPIRED` or `CURSOR_STALE` / 409 |
| Unknown asset/event | `ASSET_NOT_FOUND` / 404, `EVENT_NOT_FOUND` / 404 |
| Expected archive/revision object missing, denied or corrupt | `ARCHIVE_INTEGRITY` / 503 |
| Unavailable Dynamo/S3 dependency or unrepairably inconsistent query index | `STORAGE_UNAVAILABLE` / 503 |
| Valid but uncollected or unproven historical coverage | 200 with explicit `coverage.partial | unknown` |
| Work deadline exceeded | `QUERY_TIMEOUT` / 504 |
| Unsigned, invalid signature, wrong role/project/stage | API Gateway rejection before Lambda |
| Gateway throttle | Gateway 429 and bounded retry policy |

Use existing read API safe error payloads/transport conventions. Preserve the four `/v1/measurements*` routes unchanged. IAM caller role needs the **six exact GET route resources** in its allowlist and deny outside it; Lambda integration permission and its read-only resource permissions/boundary need explicit CSO entries. New routes are **proposed only**; merging docs does not deploy them.
