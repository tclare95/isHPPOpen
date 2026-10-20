# Design: Verified, insert-only historical gauge backfill

## Input inventory and recovery policy
- Use read-only, paginated inventory of legacy Mongo `riverschemas` and S3 `levels/latest.json` / dated snapshots; note observation range, distinct original times, counts, access restrictions and object versions. Never assume a live production inventory was already performed.
- Obtain bounded official EA history only through supported provider endpoints and the registered *exact measurement* identity; report retrieval limits and known upstream gaps. Do not scrape arbitrary historic government pages as a mandatory requirement.
- Repeated snapshots can contain newer provider values merged with old S3 history, so record source wrapper, document ID/object key+version, snapshot timestamp, `level_source`, observed time and native numeric text **separately**. A snapshot copied at time T is not proof a reading was sourced at T.
- The legacy fallback may use government page station 2102 rather than EA 4009. Quarantine until identity, datum/unit and equivalence are supported by concrete evidence. Never guess transformations between datums.
- Initially focus on Colwick's available legacy history. The other five dashboard series are currently EA-direct consumers: #52 supplies their canonical identities; import bounded accessible official history where possible rather than assuming equivalent Mongo archives.
- Stop investigation when readily accessible original Mongo/S3 and supported EA history have been evaluated, with optional easy version recovery for significant gaps. Record effort/recovery exclusions explicitly instead of attempting exhaustive reconstruction.

## Candidate identity, provenance and precedence
Identity is the configured RDP `measurementId` plus exact source-observed UTC timestamp. Reject candidates without a verified measurement/parameter/unit/datum mapping, finite source value or valid time; do not coerce missing values to zero or round away source evidence.

Group candidates by identity. Identical measured values with compatible metadata deduplicate; keep source evidence counts. For a missing canonical identity, prefer a verified direct EA historical reading; then an individually verifiable legacy direct-source reading; then identifiable government-page fallback; finally carried-forward/cached snapshots. A strong storage medium (S3 vs Mongo) does not by itself outrank another, and a `flood-api` snapshot label does not prove every embedded reading is direct. Conflicts between similarly credible candidates are unresolved and skipped. Differences in value, verified unit/datum, source quality, and observational identity require explicit classification. Use exact source decimal values after an explicitly justified conversion, not arbitrary tolerances.

**Canonical protection:** inspect live RDP state when planning but make the no-overwrite decision an **atomic conditional storage operation** against the committed authoritative archive (and appropriate hot representation), including races with live collector writes. Existing canonical data is preserved even if the imported evidence seems newer or more authoritative. A conflict is emitted with source references and values, requiring explicit authorisation through a *separate* correction path. Backfill must never modify the live collector cursor, health record or regress its latest pointer.

## RDP migration write boundary
The existing RDP archive validates direct EA source-reference URLs and orders ordinary corrections by `FetchedAt`. Do not forge a direct EA URL, use migration execution time as original fetched evidence or replay legacy snapshots through the normal correction ordering.

Provide a narrowly scoped provenance-aware import operation with a distinct `historical-import` evidence type, stable import batch/run identity and explicit evidence timestamp (which may be unknown). It must enforce immutability of pre-existing canonical identities under concurrent writes, retain source provenance in a queryable/auditable way and reuse committed S3 manifest integrity. Extend validation in a typed and auditable way rather than globally disabling checks. Import batches must only mark committed after archive verification; conditional hot writes may be repaired on retry, without overwriting a newer canonical revision.

Older-than-365-day rows are committed to S3 history without a new long-lived Dynamo copy. For hot rows, ensure expiry eligibility requires verified S3, and no forced overwrite of latest/cursor/health. Checksum-referenced archive corruption is a hard failure, not a source-data gap.

## Execution, checkpoints and safety
1. Inventory sources and produce an immutable/snapshot-aware candidate input manifest with source locator, content hash, UTC ranges and IDs.
2. Normalise and reconcile in a deterministic dry run (sorted by measurement/time and recorded evidence precedence), producing accepted, duplicate, conflict, invalid and unexplained-gap summaries.
3. Fixture and mock testing first; a tiny approved stage fixture verifies restart, month boundaries, overlap with a live writer and missing/corrupt manifests. No full stage clone.
4. A separately approved production operator chooses exact measurement/time ranges, source credentials, AWS target/account/region, batch cap, request budget and planned total write impact. Backfill is on-demand, never scheduled.
5. Import bounded monthly/time-window batches with deterministic checkpoints keyed by input manifest/version and target commit evidence. On interruption, replay rather than skip uncommitted batches. Keep failure/partial progress visible.
6. Reconcile per measurement: distinct timestamps, accepted/duplicate/conflict/rejected counts, min/max times, source evidence, sample values, verified archive checksums and explicit source-history gaps.

Dynamo/S3 eventual consistency and two-store writes cannot be treated as one transaction: archive durability is required first; failed hot repair remains pending until acknowledged. A dry-run plan becoming stale due to newer live writes should safely produce additional `existing_canonical` conflicts, never an overwrite.

## Coverage handoff to #69
Produce durable per-measurement intervals with `not_collected`, `legacy_unrecoverable`, `source_outage` or `unknown` and evidence references. Explain whether absence means no historical archive was expected vs a committed archive unexpectedly disappeared; #69 must return verified available rows for legitimate/unknown gaps but errors for missing/corrupt committed objects. Do not infer a complete interval solely from sample cadence, counts or job completion.

## Verification and release
Normal .NET restore/build/test/format and archive-adapter tests; deterministic replay and atomic-write contract tests. No production cloud resource/data operations without a separate approval. No Node Lambda change, consumer switch or legacy deletion. Record operator dry-run/commit report and an explicit hold list of unresolved corrections.
