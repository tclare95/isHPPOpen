# Tasks: CSO ingestion, revisions, tiered history and read API (#72)

**Documentation planning only:** tasks are unchecked until implementation PRs and verification evidence exist.

## Ingestion and domain
- [ ] 1.1 Define CSO domain records (source claim, current reported/effective state, event identity/revision/lifecycle), API DTOs, provider seam; no generic scalar Observation misuse.
- [ ] 1.2 Verify Severn Trent live status codes, `LatestEvent*` / `StatusStart` / `LastUpdated` semantics and ArcGIS error/paging constraints. Commit normalised fixtures and document provider confidence/assumptions.
- [ ] 1.3 Consume verified selection plans from #71 with one planned poll per selected asset per cycle, bounded provider batching/concurrency/timeouts/429 backoff and individual failure isolation.
- [ ] 1.4 Persist changed/unique original source claims immutably in S3 with checksum/manifest, run-level heartbeat for unchanged polls and idempotent durable checkpoint.
- [ ] 1.5 Build current status projection showing reported state separately from freshness/effective state; failure/offline/stale never reports "not spilling" with confidence.

## Event reconciliation and revision safety
- [ ] 2.1 Extract completed and ongoing event claims using valid provider start/end timestamps (including complete events between polls). Do not invent precise poll-time boundaries.
- [ ] 2.2 Implement stable internal event ID and source linkage; duplicate or out-of-order poll/replay idempotency; source correction to start/end with unchanged eventId and immutable prior revision.
- [ ] 2.3 Detect ambiguous near-time matches and inconsistent/missing timestamps; keep evidence unresolved/needs_reconciliation with health diagnostics instead of silent merge/precise fabrication.
- [ ] 2.4 Implement replayable S3-commit-before-Dynamo persistence with conditional event/latest/index updates, checkpoint recovery and tests for S3 success / Dynamo failure.

## Tiered storage and API
- [ ] 3.1 Build efficient asset/latest/event/overlap time indexes (no table Scan), private versioned immutable per-asset/time S3 event/archive records, committed integrity manifests and correction generations.
- [ ] 3.2 Implement **24-calendar-month-after-endedAt** completed-event TTL eligibility only after independent S3 verification. Open/unresolved events non-expiring; correction/reopen prevents wrongful expiry, and legacy archives are not deleted.
- [ ] 3.3 Extend the shared HTTP API Gateway/read Lambda with the six CSO GET routes in [api-contract.md](api-contract.md); read-only stage IAM, auth-required paths, bounded batch/list/page/response size and OIDC/SigV4 compatibility.
- [ ] 3.4 Implement unified Dynamo+S3 event queries including cross-hot/archive boundary, interval overlap, pinned cutoff, ascending ordering, stable eventId/revision dedup and encrypted expiring cursors.
- [ ] 3.5 Return verified events with explicit historical coverage gaps/unknown intervals; missing, denied, unreadable or corrupt **expected** S3 archived events cause `503 ARCHIVE_INTEGRITY`.
- [ ] 3.6 Contract-test current state/batch partial failures, old event correction and lost cursor generation, provider provenance and isolated health; test IAM wrong-stage/unsigned denies.

## Operational acceptance and boundaries
- [ ] 4.1 Test outage after reported active, stale state, source offline, two spills between polls, ambiguous matching, duplicate replay, mid-write crash, correction after archive/TTL cutoff, late import and archive corruption.
- [ ] 4.2 Emit source health, unresolved event reconciliation count, provider retry/throttle, S3 integrity errors, hot/archive result and cost/latency metrics with bounded alarms. Never log tokens or provider payloads.
- [ ] 4.3 Run .NET format/build/test, SAM validation, fixture and policy tests without production credentials. Stage smoke test only through separately authorised manual deployment/account checks; no production activation.
- [ ] 4.4 Keep legacy Mongo+Node CSO, S3 archive and public water-quality/alerts unchanged. Record shadow-comparison and reversible web cutover as separate follow-on work; no current production data movement.
- [ ] 4.5 Link verified implementation and evidence to [#72](https://github.com/tclare95/isHPPOpen/issues/72); keep historical EDM/Mongo/Glacier reconciliation and site impact assessment separate specs.

## Cost-controlled deployment and verification (#75)

- [ ] 4.6 Verify CSO event/correction/TTL/archive paths with compact synthetic older-than-24-month stage fixtures and injected time, **not** two years of live stage collection. Prove open/unresolved events cannot be expired.
- [ ] 4.7 Stage only a few explicit outfall IDs; demonstrate a bounded, manually approved source polling run with stage-only Dynamo/S3/IAM, schedule disabled afterwards, low-volume logs, and no full historical/legacy clone. Record smoke/stop evidence against [#75](https://github.com/tclare95/isHPPOpen/issues/75).
