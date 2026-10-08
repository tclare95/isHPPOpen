# Internal CSO HTTP read contract v1 (draft fixtures)

This extends the **existing first-party API** from `observation-read-api` (#69), **not** a new browser API. All CSO routes are GET, `AWS_IAM` SigV4 required via project/environment-scoped Vercel OIDC roles. Same internal envelopes: success `{data,meta}` and error `{error:{code,message},requestId}`.

## Current status

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
    "status": "available"
  }],
  "meta": {"retrievedAt":"2026-10-08T13:00:00Z","partial":false}
}
```

This deliberately demonstrates **last reported spilling + now stale = effective unknown**. The source's status is evidence, not a present-tense guarantee. `reportedState` may be `spilling|not_spilling|offline|unknown`; `effectiveState` may be `spilling|not_spilling|unknown`; `freshness` may be `fresh|stale|unknown`. One missing outfall does not imply it is idle. Configured-but-never-collected responds with `no_observations`; unknown asset `404`. Per-item dependency errors return `unavailable`; total dependency failure is `503`.

## Event history

`GET /v1/cso/outfalls/{assetId}/events?from=2024-01-01T00:00:00Z&to=2025-01-01T00:00:00Z&limit=100`

```json
{
  "data": [{
    "eventId": "evt_example_001",
    "assetId": "severn-trent:overflow:SVE0227",
    "startedAt": "2024-04-01T10:04:00Z",
    "endedAt": "2024-04-01T10:52:00Z",
    "lifecycle": "completed",
    "boundaryProvenance": "provider_reported",
    "revision": 2
  }],
  "meta": {
    "assetId": "severn-trent:overflow:SVE0227",
    "from": "2024-01-01T00:00:00Z",
    "to": "2025-01-01T00:00:00Z",
    "coverage": {
      "status": "partial",
      "gaps": [{
        "from": "2024-01-01T00:00:00Z",
        "to": "2024-03-01T00:00:00Z",
        "reason": "not_collected"
      }]
    },
    "pageIntegrity": "verified",
    "nextCursor": null
  }
}
```

All IDs/times are **illustrative**. An event overlaps the query when `startedAt < to` and `endedAt == null || endedAt > from` (or is `unresolved` with explicit ambiguity metadata). A completed event started before the query and ended within it must appear once. For an uncertain inferred boundary, return its bounds/uncertainty rather than fabricating an exact time or misleading duration. Order by `startedAt`, then eventId. A hot/S3 duplicate is collapsed to the latest authoritative event revision by eventId.

Historical pagination defaults to 100, maximum 500 and a 366-day span; no full historical scan. Cursor carries a fixed as-of cutoff, archive revisions and paging state in authenticated-encrypted form. A S3 committed expected object missing/corrupt/inaccessible yields `503 ARCHIVE_INTEGRITY` (safe request ID), never `200 partial`. Uncollected/unknown history still yields verified events with `coverage.status=partial|unknown` and explicit interval reasons. Evidence for future unread pages is not claimed verified by a prior page.

## Event detail/revision

`GET /v1/cso/events/{eventId}` returns stable ID, provider asset ID, provider-reported/inferred bounded start/end, `ongoing|completed|unresolved`, revision number, source provenance/reconciliation state. `GET /v1/cso/events/{eventId}/revisions` returns bounded immutable revision summaries including `revision`, `recordedAt`, `sourceUpdatedAt`, `claimId`, `changeReason`, previous/revised event fields. Never reveal original raw provider object URLs, storage keys, IAM identity or internal signature tokens.

`GET /v1/cso/outfalls` lists bounded verified catalogue metadata with optional provider filter and opaque pagination. `GET /v1/cso/outfalls/{assetId}/health` includes last attempt/successful fetch/**durable persist**/source update, config+catalogue versions, stale and unresolved selection health.

## Errors

| Condition | Status/code |
| --- | --- |
| Bad ID format/UTC range/max 366 days/max 500/invalid cursor | `400 VALIDATION_ERROR` / `INVALID_CURSOR` |
| Unknown asset or event | `404 ASSET_NOT_FOUND` / `EVENT_NOT_FOUND` |
| Expired or stale cursor/version | `409 CURSOR_EXPIRED` / `CURSOR_STALE` |
| Expected S3 event/evidence manifest or object missing/denied/corrupt | `503 ARCHIVE_INTEGRITY` |
| Dependency unavailable / stale read index cannot be recovered | `503 STORAGE_UNAVAILABLE` |
| Valid historical coverage gaps but verified available events | `200`, with `coverage.partial|unknown` |
| Gateway stage throttled | `429`; safe retry hint |
| Wrong-stage/unsigned/unauthorised caller | API Gateway IAM denial, **before** Lambda |

No new public Next.js response changes in this backend slice.
