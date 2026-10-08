# Observation read API v1 — illustrative, testable wire contract

This is the **internal** HTTP contract between Vercel server-side code and the .NET Read Lambda. Version prefix: `/v1`. Client auth is SigV4 over an assumed Vercel workload role; no browser calls.

## Common conventions

- Request/response JSON; UTC ISO 8601 time with explicit `Z` or offset input, canonical output in `Z`; never local/naive timestamps. `from` is inclusive and `to` exclusive.
- Success envelope: `{ "data": ..., "meta": ... }`. Error envelope: `{ "error": { "code": "...", "message": "..." }, "requestId": "..." }`. The existing **public** Next.js envelope is unrelated and unchanged.
- Positive or zero finite source observations only as dictated by the provider's parameter/domain validation; never invent values, interpolate missing samples or convert missing to zero.
- One canonical ID maps to exactly one source measurement, not station alone. `ea:4009-level` below is a **placeholder**, not the confirmed upstream external measure identifier.

## GET /v1/measurements

Success `200`, deterministic order by canonical measurementId, only published enabled non-sensitive metadata:

```json
{
  "data": [
    {
      "measurementId": "ea:4009-level",
      "provider": "ea",
      "stationId": "4009",
      "parameter": "level",
      "unit": "m",
      "datum": null,
      "expectedIntervalSeconds": 900,
      "name": "Colwick"
    }
  ],
  "meta": { "retrievedAt": "2026-10-08T18:18:00Z" }
}
```

At the initial catalog size this is bounded by validated version-controlled registry (no arbitrary filtering or admin changes in v1). Revisit page size if the catalog exceeds a safe JSON response bound.

## GET /v1/measurements/latest?ids={id1,id2,...}

Require 1–20 **unique** known measurement IDs; return caller ordering. Valid partial response `200`:

```json
{
  "data": [
    {
      "measurementId": "ea:4009-level",
      "status": "available",
      "observedAt": "2026-10-08T18:15:00Z",
      "value": 2.14,
      "unit": "m",
      "quality": "good",
      "freshness": "fresh"
    },
    {
      "measurementId": "ea:4007-flow",
      "status": "unavailable",
      "observedAt": null,
      "value": null,
      "unit": "m3/s",
      "quality": null,
      "freshness": "unknown",
      "errorCode": "STORAGE_UNAVAILABLE"
    }
  ],
  "meta": {
    "retrievedAt": "2026-10-08T18:18:00Z",
    "partial": true
  }
}
```

A known measurement with no stored observations is `status=no_observations` rather than `unavailable` or value=0. A complete failure of all requested retrievals is `503`. An unknown ID rejects the whole batch as `404`, rather than probing arbitrary partition keys. `freshness` is `fresh|stale|unknown` and determined from observedAt + configured expected interval/freshness policy; it does not depend on HTTP 200.

## GET /v1/measurements/{id}/observations

Required `from` and `to`; optional `limit` (default 2000, max 5000); optional `cursor`. Max span 366 days and serialized JSON page size 4 MB. A cursor fixes original query, stage, cutoff and archive revision references, has 30-minute TTL and cannot be altered to change query semantics.

Success with **known historic gaps**, `200`:

```json
{
  "data": [
    {
      "observedAt": "2025-04-01T12:00:00Z",
      "value": 2.14,
      "unit": "m",
      "quality": "good"
    }
  ],
  "meta": {
    "measurementId": "ea:4009-level",
    "from": "2025-04-01T00:00:00Z",
    "to": "2025-05-01T00:00:00Z",
    "coverage": {
      "status": "partial",
      "gaps": [
        {
          "from": "2025-04-02T00:00:00Z",
          "to": "2025-04-03T00:00:00Z",
          "reason": "legacy_unrecoverable"
        }
      ]
    },
    "pageIntegrity": "verified",
    "nextCursor": null
  }
}
```

`coverage.status` is `complete|partial|unknown` as determined by source/migration/manifest metadata for the **original requested window**, not the shape/number of readings on the current page. Gap `reason` can be `not_collected|legacy_unrecoverable|source_outage|unknown`. Unknown coverage must have an explicit interval; a known lack of source samples is not an archive integrity failure. `pageIntegrity=verified` covers **read and validated page objects**, not future unread pages.

If a manifest points to an object that should exist and it is unavailable or corrupt, do **not** emit this success example: return `503 ARCHIVE_INTEGRITY` with a safe error body and requestId. If metadata cannot establish whether a historic period was ever archived, return available data with `coverage.status=unknown` and corresponding gap(s), not a false full-coverage claim.

Pagination must not repeat/drop an observation because of calendar boundaries or overlapping hot/cold sources. Cursor unknown/tampered `400`, expired/revision stale `409`. Do not expose Dynamo `LastEvaluatedKey` or S3 paths in decoded/plain tokens.

## GET /v1/measurements/{id}/health

Success `200`:

```json
{
  "data": {
    "measurementId": "ea:4009-level",
    "lastAttemptAt": "2026-10-08T18:17:00Z",
    "lastPersistedAt": "2026-10-08T18:17:02Z",
    "lastObservedAt": "2026-10-08T18:15:00Z",
    "sourceState": "healthy",
    "freshness": "fresh",
    "ingestLagSeconds": 122,
    "lastErrorCode": null
  },
  "meta": { "retrievedAt": "2026-10-08T18:18:00Z" }
}
```

HTTP successful collection with unchanged observedAt can be `sourceState=healthy` while `freshness=stale`. Unexpected/temporary dependency failure is an error, not a healthy synthetic timestamp.

## Error example

```json
{
  "error": {
    "code": "ARCHIVE_INTEGRITY",
    "message": "Expected archived observations could not be verified."
  },
  "requestId": "example-request-id"
}
```

Stable `400` codes: `VALIDATION_ERROR`, `INVALID_CURSOR`. `404 MEASUREMENT_NOT_FOUND`. `409 CURSOR_EXPIRED` / `CURSOR_STALE`. `429` rate limited by gateway. `503 STORAGE_UNAVAILABLE` / `ARCHIVE_INTEGRITY`. `504 QUERY_TIMEOUT`. `500 INTERNAL_ERROR`. IAM failures are gateway-denied before the handler; consumers must not misinterpret `403` as no observations.

## Compatibility boundary

Next.js web adapters keep current public `{ ok: true, data }` wrapper, `/api/trentweirs` snapshot shape, `/api/levels` `level_data` and separate `forecast_data`, `/api/hppstatus` Mongo state, and alert subscription/delivery behaviour. No public exposed `/v1` URL or client-side bearer token. Consumer migration lives in [#51](https://github.com/tclare95/isHPPOpen/issues/51).
