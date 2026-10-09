# Tasks: Authenticated observation read API (#69)

**Docs-only refinement:** unchecked tasks are implementation acceptance for the future backend agent; do not tick as complete until code/tests/reviews exist. This is the **read API backend** workstream, not Next.js consumer migration.

## 1. Runtime, API contract and versioning

- [ ] 1.1 Add a separate read-only .NET 10 Lambda project/entrypoint to the *new* `river-data-platform` repo, sharing the collector's domain and Dynamo/S3 read adapters without sharing its write permissions; pin SDK and local fixture tests.
- [ ] 1.2 Define an explicit `/v1` JSON/OpenAPI contract corresponding to [api-contract.md](api-contract.md): registry, batch latest, unified history and measurement health. Use `{data, meta}` successes, structured error codes + requestId; do not alter existing Next.js public envelopes.
- [ ] 1.3 Implement registry-backed measurement lookup and precise validation of canonical IDs, enabled status, UTC timestamp/date ranges, IDs/row/byte limits. Fixture test no observations vs unknown measurement, malformed values and level/flow at same timestamp.

## 2. IAM and stage isolation

- [ ] 2.1 Define stage-isolated SAM API Gateway **HTTP API** routes with `AWS_IAM` authentication on **every explicit GET route**, no unauthenticated default/ANY route, no browser CORS requirement. Add a separate read Lambda execution role limited to read-only Dynamo/S3 required operations and logs.
- [ ] 2.2 Document Vercel OIDC role trust, project + environment constrained `sub`/`aud`, scoped `execute-api:Invoke` stage/resource methods and stage-specific AWS region. Production and Preview roles must never cross-call each other's API. Backend PR owns IAM/API spec; [#51](https://github.com/tclare95/isHPPOpen/issues/51) owns live Vercel role integration and signing client.
- [ ] 2.3 Verify with policy/contract tests that unsigned, wrong-stage, wrong-role and forbidden write-method requests are rejected before handler execution. No persisted AWS secret/API token or anonymous S3 object exposure.

## 3. Latest and health

- [ ] 3.1 Implement GET `/v1/measurements` from the validated published registry, and batch latest with 1–20 unique IDs, deterministic request order and independent per-measure outcomes (`available` / `no_observations` / `unavailable`).
- [ ] 3.2 Latest results preserve source observedAt, value/unit/quality and separate retrieval timestamp/freshness. Test stale-valid, missing, one failure with successful neighbours, all storage failures and bad IDs.
- [ ] 3.3 Health endpoint uses persisted ingestion run metrics and last observation timestamps, not mere HTTP polling success. Test 200-with-stale-data, source failure, persistence failure and absent collection history.

## 4. Unified full-resolution history

- [ ] 4.1 Implement bounded `from` inclusive / `to` exclusive UTC query, max 366 days, default 2,000 / max 5,000 points and max 4MB serialised response. Ascending canonical observations, no fabricated samples/downsampling.
- [ ] 4.2 Route at one pinned observedAt-based 365-day hot/archive boundary, query only matching Dynamo monthly measurement keys and S3 committed manifest object versions. Merge, resolve authorised corrections, dedup source identity across boundary, and sort correctly.
- [ ] 4.3 Handle Dynamo `LastEvaluatedKey` internally (1 MB Dynamo Query limit), multiple pages and S3 streamed/decompressed bounded reads, with an authenticated-encrypted opaque cursor expiring after 30 minutes. Bind cursor to caller stage, measurement, full window, page-size, cutoff and immutable archive revisions. Test tampering, expiry, changed query, missing revision and UTC leap/month/year boundaries.
- [ ] 4.4 Test history in hot only, archive only and across boundary, under source corrections/TTL lag, no-data periods, known legacy gaps, unknown coverage and legitimate missing quarter-hour samples.
- [ ] 4.5 Implement `coverage.complete|partial|unknown` with explicit gap reason/ranges and page-level integrity semantics. Distinguish non-collected data from expected but missing/corrupt/denied archive chunks; return `503 ARCHIVE_INTEGRITY` for the latter rather than an apparent `200` partial.
- [ ] 4.6 Bound application processing budget (~20s) and output bytes independently of the 30s/10MB API Gateway ceilings. Verify large archive compression/record counts, throttle and timeout safety, and no unbounded table scans/S3 listings.

## 5. Errors, diagnostics and release discipline

- [ ] 5.1 Contract-test all stated errors: `400` validation/invalid cursor, `404` unknown measurement, `409` expired/stale cursor, `429` stage throttle, `503` dependency/archive integrity, `504` query timeout and `500` internal. Never log secrets or include raw S3 keys in user errors.
- [ ] 5.2 Emit structured request/measurement IDs, tier, rows/page, latency, gaps, 4xx/5xx, throttling, integrity and operational cost metrics, without raw tokens or sensitive provider payloads. Stage-specific tracing, IAM and alarms.
- [ ] 5.3 Run normal .NET restore/build/test/format and SAM validation. Use approved staging-only manually reviewed prepare/apply to test SigV4, endpoint contract and Dynamo/S3 failure cases. A documentation merge does **not** approve cloud deployment.
- [ ] 5.4 Link implementation PR, contract fixtures and stage evidence to [#69](https://github.com/tclare95/isHPPOpen/issues/69). Hand off Next.js OIDC client, feature flags, shadow parity and consumer order (**Trent → observed levels → gauge alerts**) to [#51](https://github.com/tclare95/isHPPOpen/issues/51); do not implement that work in this PR.

## Explicit boundaries

No old scraper changes, production data reads/writes, TTL activation, archive cleanup, history backfill, new public API, user authentication or web consumer cutover. Keep former production Next.js routes unchanged until #51's separate feature-flag/rollback reviews.

## Minimal-stage API handoff (#75)

- [ ] 5.5 Add an optional, separately approved **on-demand** stage API smoke using compact IAM-scoped Dynamo/S3 fixture history and negative wrong-stage invocation checks. Do not require full staging history replication, automatic continuous collection or a production mirror.
- [ ] 5.6 Verify stage OIDC/role/table/bucket isolation from production if sharing one AWS account, and record stage API evidence in [#75](https://github.com/tclare95/isHPPOpen/issues/75).
