# Design: CSO ingestion, revisions, storage and read APIs

## Shared platform and CSO-specific boundary

Add a `Cso` domain/application module in the same new .NET backend as gauge observations, with an independent scheduled collector entry point and domain-specific read services behind the existing authenticated API Gateway / read Lambda. Reuse source catalogue concepts, DI, logging, AWS stage/account checks, archive integrity interfaces, IAM OIDC/SigV4 mechanisms and shared `{data,meta}` wire conventions. **Do not reuse the scalar Observation entity, its Dynamo partition keys or its 365-day TTL rule.**

The upstream `cso-asset-catalogue-and-selection` change owns what to poll. This change consumes a deterministic selection plan and owns provider status fetches, durable evidence and event reconciliation. One failed asset must not block independent successes.

## Severn Trent source mapping and data distinctions

The reviewed old adapter returns ArcGIS attributes `Id`, `Status`, `StatusStart`, `LatestEventStart`, `LatestEventEnd` and `LastUpdated`, plus coordinates. The live Severn Trent layer's definitive schema/coded status values were **not independently verified** in this refinement; verify and pin provider-specific fixture/schema tests before implementing mappings. The existing UI interprets status 1 as active, 0 as stopped and -1 as offline; do not treat that as a new universal platform status standard without confirming provider documentation. ArcGIS may return an embedded JSON error despite HTTP 200.

Three distinct records:

1. `CsoSourceClaim`: one versioned source statement about an outfall: original provider asset identity, raw/normalised payload digest, reported status, sourceUpdatedAt, provider event start/end, observed/collected/fetchedAt, schema, quality, stage/config/collection run IDs and immutable S3 evidence reference. Successful polling without changed status is still a new **run outcome**, not automatically a new spill event. Store evidence for each new/changed source claim and source-metadata checkpoints; don't multiply identical event rows for repeated 15-minute fetches.
2. `CsoCurrentStatus`: one per-outfall latest **reportedState** (`spilling|not_spilling|offline|unknown`) with latest source/fetched timestamps and `freshness` (`fresh|stale|unknown`), plus **effectiveState** (`spilling|not_spilling|unknown`). Offline/stale/unavailable never maps to confident `not_spilling`; `lastReportedState` remains visible with provenance.
3. `CsoSpillEvent`: stable internal `eventId`, provider + asset identity, optional verified providerEventId, reported `startedAt`/`endedAt`, `lifecycle` (`ongoing|completed|unresolved`), `boundaryProvenance` (`provider_reported|bounded_inference|unknown`), version, source references, confidence/ambiguity and `lastReconciledAt`. Event lifecycle must not be confused with monitoring status. Revisions retain old values, input claim IDs and supersession/reason.

Valid provider-reported boundaries are preferred to first-seen/last-seen poll times. If the provider lacks exact timestamps, the platform may preserve a **bounded, explicitly inferred interval** but MUST NOT fabricate exact starts/ends or report precise duration. A completed start/end pair can be created from one poll even if no prior spilling poll was witnessed. No inference of "ended" from outage, inactivity, missing poll, asset being disabled, source status `offline` or time passing.

## Identity, deduplication, revision and disagreement

- Canonical outfall ID is provider+external asset ID, not ArcGIS OBJECTID. A source claim has an idempotency key derived from provider, asset, source-revision/event attributes and stable payload digest (exclude volatile poll/run timestamps from semantic identity).
- Prefer an explicit trustworthy provider event ID when available; otherwise mint stable platform eventId at first unambiguous identification and record an **identity linkage ledger** between provider claims and eventId. Original start timestamp is a matching hint **not** the event primary key.
- A late repeated claim must not create a second event. If a new claim unambiguously describes an existing event, add a new revision if effective times/status/provenance changed; otherwise no-op. Source `LastUpdated` can order changes only when provider semantics are validated; otherwise an explicit deterministic claim/revision policy prevents older fetched/replayed data overriding newer authoritative evidence.
- When multiple nearby events could match, or a corrected start could be mistaken for a second discharge, mark evidence `needs_reconciliation` and preserve all claims. No automatic merge or silently dropping the record. A future reviewed/manual reconciliation mechanism may resolve ambiguities; **no admin UI in this slice**. Audit/logging must make outstanding ambiguity visible.
- Authoritative `completed` event requires a valid provider-reported end or a later explicitly authoritative source correction. If `end < start`, fail validation/quarantine the claim without changing the published event. A provider-provided changed event end/start updates **the same** eventId with a new revision, and event query indexes must be revised consistently.
- The current status can advance independently from event reconciliation. An ambiguous event may be excluded from definitive completed-event counts yet preserved as unresolved data.

## Collection, persistence and failure semantics

CSO collector runs according to the validated selection plan, initially every 15 minutes; bounded batched ArcGIS queries, per-asset timeout/retry/backoff, 429 handling, controlled concurrency, no unbounded self-invocations. Initial operational freshness for 15-minute polling is 30 minutes, configurable per provider/measurement policy later; freshness is calculated from validated provider source timestamps and collection health (not just a recent HTTP 200). Store explicit attempted/succeeded/failed/unchanged/persisted counts and last success; no `HTTP 200 == healthy data` assumption.

**Durability order:** (1) validate source claims; (2) write immutable source evidence or evidence checkpoint to private S3; (3) verify/checksum and commit manifest/reference; (4) conditionally update Dynamo latest state/event head/query indexes and health; (5) acknowledge asset success. If S3 fails, do not advance the durable event/latest checkpoint; if Dynamo fails after S3 succeeds, replay idempotently. Outage/failure only updates *collection health* and derived freshness, not the previously reported source state or event end.

Avoid repeatedly storing identical full payloads, but ensure a committed claim's digest/reference can always be resolved to original evidence and polling-run provenance is retained. No source credential/raw payload logging.

## Storage and tiered 24-month retention

Keep logical views separate even if a deliberate single-table Dynamo design is selected later:

- Latest per outfall: stable non-expiring current-state item.
- Event head and efficient per-outfall time-window index, keyed with stable event ID and supported start/end overlap retrieval; no full Dynamo `Scan` and no refetch of whole S3 history for a bounded query.
- Immutable source claim, corrected event revisions and canonical event archive: private S3 Standard, versioned time/asset partitions and **committed schema-versioned manifests** with count/checksum/source timestamp coverage and generation. S3 direct GetObject must be possible without Glacier restore for the *new canonical archive*.
- The current archiver `cso-archive` transitions its existing objects to IA/Glacier. Its legacy objects are **not** presumed to be instantly retrievable, compatible with new manifests or safe for direct cutover.

An event is eligible for hot-event TTL only when `lifecycle=completed`, it has a valid `endedAt`, **endedAt + 24 UTC calendar months** has passed, and its authoritative event/revisions/evidence are verifiably recoverable from committed S3 archives. Open or unresolved events **never** get an expiry timestamp. Late corrections/reopens cancel or refresh pending TTL, archive the correction first, and update indexes/hot materialisation as needed. A correction of an archived event stays queryable through the latest committed manifest; it is not silently recreated as a second event. Dynamo TTL is eventually applied and must not be treated as a hard date cutover; the read API uses a pinned logical cutoff and deduplicates overlap. If missing or corrupt expected S3 data, block new expiry and return explicit integrity error on affected reads. No automatic S3 raw/revision deletion or transition-to-Glacier policy unless separately approved.

**Important event-index boundary:** do not route event queries solely by `startedAt < now-24months`. An event that started three years ago but remains open, one ended recently after starting before the cutoff, or a newly corrected older event may still have a hot index record. Query planning must account for lifecycle and endedAt-based eligibility, retrieve relevant carried-in events and deduplicate stable eventIds against archives. A pinned cutoff is a query planning input, not proof that all earlier-started events are archived or deleted.

For v1, **24 calendar months** is the precise engineering interpretation of “about two years”; if a review wants a deliberately approximate 730 days instead, change the accepted design explicitly rather than mixing calculations.

## CSO read API contract

Extend the existing *server-only* API Gateway HTTP API / `AWS_IAM` / Vercel OIDC+SigV4 read Lambda with explicitly configured CSO GET routes. Stage-specific permissions and no public browser authentication, no arbitrary provider query or archive-path argument. Distinguish unknown/unconfigured asset, configured but never observed, stale, offline and storage failure.

| GET route | Response |
| --- | --- |
| `/v1/cso/outfalls` | Bounded/paginated verified catalogue: IDs, provider, name, location, receiving watercourse, asset metadata; includes selection status, not an upstream-impact claim. |
| `/v1/cso/outfalls/status?ids=...` | Up to 20 outfalls' latest state, sourceUpdatedAt/observedAt/fetchedAt, freshness, effectiveState, partial per-ID failures and retrievedAt. |
| `/v1/cso/outfalls/{id}/events?from=...&to=...&limit=...&cursor=...` | Unified paged spill events **overlapping** requested UTC `[from,to)`; default 100/max 500 rows, max 366-day query span, direct S3 older than 24-month cutoff, ascending by startedAt then eventId, event provenance and coverage. |
| `/v1/cso/events/{eventId}` | Authoritative event and source revision metadata, including `ongoing/completed/unresolved` lifecycle and uncertain boundaries. |
| `/v1/cso/events/{eventId}/revisions` | Bounded paged immutable revision summaries with source claim references for audit; no raw provider payload in responses. |
| `/v1/cso/outfalls/{id}/health` | Source polling and durable ingest outcomes separately from event/current state; catalogue/config freshness and unresolved selection flags. |

Same internal success envelope `{data,meta}`, error envelope `{error:{code,message},requestId}` as [#69](https://github.com/tclare95/isHPPOpen/issues/69). No changes to existing **public** Next.js API envelopes.

Use inclusive `from`, exclusive `to`, UTC `Z` canonical output, opaque authenticated-encrypted expiring cursors bound to stage/asset/time/cutoff/archive generations, maximum response byte/work budget as in #69. For overlapping event queries, a cross-window carry-in event must not be silently lost just because its start preceded `from`; maintain suitable bounded index/carry-forward state. A historical event that was revised to move its start must keep the same eventId and update its query-index position.

**Historical coverage** is `complete|partial|unknown` with reasoned time ranges. Return verified available events when older historical reporting was never collected/recoverable, flagging gaps; a missing/corrupt/inaccessible **expected archive object** fails `503 ARCHIVE_INTEGRITY`, never fake `200`. Do not assert that every spill was captured by 15-minute polling. Per-page integrity is distinct from source coverage and does not promise the integrity of unread future pages.

## First-party compatibility, security and rollout

- Collector read/write IAM roles are separate; CSO read role permits only bounded Dynamo Get/Query and S3 GetObject/GetObjectVersion on dedicated CSO resources. No Scan, default unauthenticated route, wildcard external write methods or public S3 reads.
- Stage-prod isolated stacks/resources, signed credentials, exact invoke policy and no hardcoded Secrets Manager ARN or static credentials. Do not assume existing web Preview isolation (currently shares some production variables) is safe for new AWS roles.
- Old `ishppopenScraper` CSO Mongo writes, legacy archival job, site/quality indicator (density / runoff), alert logic and existing S3 keys stay live; no double alerts/writes. Shadow comparison of current state + recent event boundaries and reversible consumer cutover are **future separate specs**.
- Detailed EDM 2024/25 files and legacy Mongo/Glacier record reconciliation belong to a historical import spec, not this ingestion spec. The EA has published detailed event start/stop submissions, but notes they were not formally verified by the agency; preserve source/provenance and do not silently overwrite current claims.

## Release checks

CI tests for duplicate/reordered polls, two spills between polls, 0/1/offline mapping, stale/outage, source corrections and ambiguous event matching, S3 success+Dynamo failure replay, archive-before-TTL, cross-boundary and corrupt archive read, API IAM denial, query/page/byte limits. A separately approved non-prod integration smoke test can verify real ArcGIS schema/query, AWS credentials, Dynamo/S3 read path and alarming. No production code deployment, secret change, data migration or legacy decommission from drafting or merging this spec.
