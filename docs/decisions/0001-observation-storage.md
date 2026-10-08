# ADR-001: Observation storage and retention

- **Date:** 8 October 2026
- **Status:** **Accepted — architecture decision only.** No authorisation to deploy, migrate, read production credentials or delete historical data.
- **Tracking:** [isHPPOpen #48](https://github.com/tclare95/isHPPOpen/issues/48), [review PR #62](https://github.com/tclare95/isHPPOpen/pull/62)
- **Scope:** Gauge observations first; independently deployed web, scraper and predictor remain compatible.
- **Evidence:** Cross-repository source audit. No live Atlas or AWS inventory was accessed.

## Decision

**Adopt DynamoDB on-demand + S3 as the target persistence architecture for canonical gauge observations.** This is a technology and data-lifecycle decision, not approval of a production release.

1. **DynamoDB:** a rolling **365 days** of full-resolution observations and latest per-measure pointers.
2. **S3 Standard:** versioned, private, **indefinite raw observation history**, with deterministic date-partitioned object keys and a lightweight integrity/coverage manifest. **Direct S3 GetObject reads** of the relevant month/day partitions are an acceptable normal historical query path, even if slower than DynamoDB. No separate SQL analytics warehouse, Athena, S3 Select, prototype or asynchronous export service is required.
3. **Phased cutover:** introduce observations first; keep the existing MongoDB Free cluster for HPP transition events, CSO snapshots/incidents, editorial and alert-domain records. Preserve the public `levels/latest.json` and other existing contracts during migration. Later migration of those other domains is a separate decision.
4. **Providers:** Environment Agency first; provider-neutral station and **measurement** IDs, version-controlled gauge configuration, no initial admin UI.

### Why this is sufficient to decide

The existing application runs on **MongoDB Atlas Free**, with a published **512 MB storage allowance** (not a measurement of current bytes; the suite's S3 archives are additional). The source audit identifies a small number of operational query shapes and the main inefficiency: repeated overlapping river-reading arrays. Even scenarios of 25–500 measurements at 15-minute cadence are tractable, without a proof-of-concept project. The user is comfortable paying a modest latency cost for direct historical S3 object reads.

A standalone 25/100/500-measure infrastructure benchmark, live Atlas inventory, exact regional cloud bill and synthetic 5/10/20-year restore benchmark are **not prerequisites to this architecture choice**. An implementation still needs ordinary unit/integration/contract checks and measured operational sanity checks on its first deployment. A simple cost budget and billing alarms are appropriate; false precision is not.

**Rejected as the initial choice:** improved MongoDB + S3 (preserves dependency on the constrained Free cluster for observation growth and repeated-history shape) and PostgreSQL + S3 (powerful arbitrary SQL/joins but unnecessary for known gauge/time/latest access patterns). Revisit only if actual future product analytics require it, not as part of #48.

### Important boundary

This decision concerns **canonical gauge observations**, not CSO archive retention, private contact data, editorial records, forecast/model files or HPP status-event lifetimes. Indefinite gauge retention is not an instruction to keep every temporary, duplicate or derived S3 object indefinitely. No deletion of existing history is authorised.

## 1. Evidence inventory (verified from code, not live data)

| Domain | Current writer / cadence | Current store and shape | Readers and likely access pattern | Retention evidence |
| --- | --- | --- | --- | --- |
| Colwick levels and government page forecast | Scraper scheduled every 15 min; default 120 readings per normal run, 480 every 6h; merge with cached history | Mongo **riverschemas**: append one document per run with **level_readings[]**, forecast_readings[], model_date, level_source; S3 **levels/latest.json** and **levels/year=YYYY/month=MM/levels-*.json** | Web levelsService reads latest S3; scraper can fall back to S3 then Mongo; HPP threshold uses newest level | No Mongo expiry/compaction in reviewed code; S3 dated snapshots accumulate, bucket versioning enabled; latest key is publicly readable |
| HPP open/closed | Same scraper; level threshold defaults to 2.2 m | Mongo **openIndicator** with timestamp and boolean value, appended **on transition only** | Web hppStatusService queries last year, orders transitions, calculates 7/28/182/365-day closure totals; alerts read same snapshot | No expiry; **last-year-only query loses carried-in boundary state** where the last change predates the window |
| Water-quality summary | Scraper at 15-minute intervals when source succeeds | Mongo **waterQuality** with scrape_timestamp, id, water_quality including CSO_IDs and density | Latest by scrape_timestamp desc; density series bounded by date (typically 3-120h); alert evaluation | No retention/archive evident for this collection |
| CSO point-in-time snapshots | Scraper enqueues each CSO_ID each 15m; SQS worker fetches each ID; inline fallback also inserts | Mongo **csoData** with attributes.Id, DateScraped and source attributes; repeated individual documents | Latest record per CSO ID using grouped top-by-DateScraped; current web view uses 30-min freshness and 48h recent-event semantics | Weekly archive of records older than **3 months** into private S3 JSONL batches; archive bucket versioned; lifecycle moves to Standard-IA at 30 days, Glacier at 365 |
| Colwick ML forecasts | Predictor Lambda in **eu-west-2**, hourly | S3 **forecasts/colwick_forecast.csv**, stability/accuracy/model-health CSVs, **forecasts/history/**; models stored separately | Web forecast APIs and alert evaluator; predictor reads upstream EA observations for inference | Separate forecast issue/target times; forecast history present, exact inventory unverified |
| Live Trent dashboard and gauge alerts | Web calls EA directly via backend endpoint for 5 station IDs / **6 level-or-flow measures**; cached 15 minutes | EA direct, not persisted in the suite's normalised store | Latest, one-hour/day delta and 672-point (~7d) readings; alert threshold evaluation | No local canonical history for these measures |
| Editorial and administration | Web | Mongo **eventschemas**, **sitebannerschemas**, **trentlockdata** | Events/banner cache; manual Trent Lock user submission with nearby gauge arrays | Business/PII retention decisions independent of observation store |
| Email alerts | Web and scheduled evaluator | Mongo **alertSubscriptions**, **alertManageSessions**, **alertDeliveries**, **alertRuns**, **alertRateLimits** | Active-rule lookup, token lookup, delivery idempotency, management access | PII and token expiry require separate retention and security design |

**Sources:** [scraper app](https://github.com/tclare95/ishppopenScraper/blob/main/is-hpp-open-scraper/is-hpp-open/app.mjs), [CSO worker](https://github.com/tclare95/ishppopenScraper/blob/main/is-hpp-open-scraper/is-hpp-open/csoWorker.mjs), [CSO archival](https://github.com/tclare95/ishppopenScraper/blob/main/is-hpp-open-scraper/is-hpp-open/csoArchival.mjs), [SAM](https://github.com/tclare95/ishppopenScraper/blob/main/is-hpp-open-scraper/template.yaml), [web water-quality service](https://github.com/tclare95/isHPPOpen/blob/main/libs/services/waterQualityService.js), [web status service](https://github.com/tclare95/isHPPOpen/blob/main/libs/services/hppStatusService.js), [gauge configuration](https://github.com/tclare95/isHPPOpen/blob/main/libs/trentWeirsConfig.js), [predictor](https://github.com/tclare95/trent-predictor/blob/main/deploy/lambda_handler.py).

**Other-repository lessons:** riverscraper already has a DynamoDB PAY_PER_REQUEST prototype, but its primary key is **StationId + Timestamp**, while Measure is only an attribute. Level and flow measured at the same instant would overwrite: do **not** copy the key model. reservoir-levels' PostgreSQL/Drizzle adapters demonstrate provider-specific ingestion boundaries for slower-changing source series, not a benchmark for 15-minute measurements.

### Concrete risks found

- **Write amplification:** with one 480-reading snapshot every 15 minutes, one station can write roughly 35,040 Mongo history documents, each containing up to 480 overlapping level points, and as many S3 dated objects in a 365-day year. Up to ~16.8 million embedded reading occurrences/year for ~35,040 distinct 15-minute timestamps, ignoring gaps and overlapping S3 versions. This is a **model estimate** for a continuously full window, not a measured live count.
- **CSO queue failure reporting:** worker returns per-message batchItemFailures but the SAM SQS mapping does **not** declare ReportBatchItemFailures; partial failures may be acknowledged rather than retried. The worker also insertOne's every task without a source-event uniqueness constraint, so retries can duplicate snapshots. See [AWS SQS partial batch handling](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html) and [scraper #10](https://github.com/tclare95/ishppopenScraper/issues/10).
- **Archive verification gap:** CSO archival HEAD verification checks only object metadata recordCount, not uploaded bytes/checksum, readable JSONL or record IDs. If an exception occurs after records have been deleted, generic error cleanup attempts to delete the uploaded archive object. Preserve the existing copy-before-delete order but strengthen it before any future destructive operation.
- **Status carry-forward:** status history query starting one year ago can omit a long-running open/closed state. The new design must retrieve the last transition before the interval start as well as transitions within it.
- **Separation of responsibilities:** the predictor accesses external EA history directly; replacing the web gauge reader alone does not centralise inference or create a stable historic API. S3 public latest, Mongo transition/event readers and existing CSO handling remain compatibility contracts.
- **Preview exposure:** current Vercel Preview shares Production Mongo/auth/email variable entries (docs/SYSTEM.md). All future Dynamo/S3 previews must use separate tables, buckets, roles and no production sends before testing dual paths.
- **Cross-region:** scraper and its S3 buckets are in **eu-west-1**, predictor in **eu-west-2**, Vercel region/placement has not been verified. Cross-region reads and egress/latency cannot be excluded from an operating quote.

## 2. Domain-neutral target contract

Represent provider IDs as external identifiers and stable app identities as separate fields, with canonical IDs never derived from display names:

| Type | Identity and minimum fields | Notes |
| --- | --- | --- |
| Source | sourceId; providerCode; attribution; API/version | Initially Environment Agency, adapters later; metadata from version-controlled gauge config |
| Station | stationId; sourceId; providerStationId; name; location and timezone metadata | A physical station can expose multiple measures |
| Measurement | measurementId; stationId; providerMeasureId; parameter (level/flow/etc); unit; datum/reference; status/config version | **The identity includes the provider measure, not just station or measure type**; persist unit as source datum, normalise separately |
| Observation | measurementId + observedAt UTC (logical unique key); numeric value; unit; observedAt; ingestedAt; quality; sourceUpdatedAt; provenance/runId; revision | Preserve exact upstream timestamp; no fabricated readings; distinguish late/backfilled readings from late ingestion |
| Collection run | runId; provider; started/completed; attempted/succeeded/failed; per-measure high-water marks; error/lag | Observability is not inferred from whether a measurement value exists |
| Archive manifest | partition key and schemaVersion; path; item count; UTC min/max; digest; generation/correction revision; verification status | No hot-data expiry until archival manifests are independently verified |

**Duplicate/correction rule:** key a canonical observation by measurementId + exact upstream observedAt. On normal re-fetch, identical data is idempotent. If the value, unit, provider quality or upstream revision changes, use a deterministic authoritative-source update rule (prefer source revision/updatedAt when available; otherwise explicit ingestion correction policy); retain replaced versions in audit/archive metadata. Older retry batches must not overwrite a newer correction. Invalid or missing observed timestamps/units are quarantined, not silently rounded or converted.

**Do not conflate:** HPP threshold *transitions* are events with changedAt, boolean status, threshold and originating measurement/version. CSO *spills* have interval start/end and uncertain/in-progress status; raw point-in-time CSO API samples are snapshots, not automatically distinct incidents. Forecasts are keyed by measurement, **issuedAt + targetAt + model/version**, and must allow overlapping runs for the same future time. Alerts, delivery attempts and subscription contact details remain operational state with separate access controls/PII retention.

## 3. Selected DynamoDB and S3 design

### DynamoDB

- **Observations:** on-demand table with partition key `measurementId#YYYY-MM` and sort key `observedAt` in fixed-width UTC ISO 8601. One item for each source-measurement/timestamp pair, with value, unit, source/datum, quality, provenance and revision fields. Do not key by station/timestamp alone: Shardlow level and flow may share timestamps.
- **Latest pointer:** per-measurement item (or tiny separate table), conditionally updated so older backfills never replace later observations; a corrected value for the latest timestamp may update it when authoritative. No GSI until an access pattern requires it.
- **Read paths:** `GetItem`/bounded batch for latest; `Query` by measurement/month and bounded timestamp range for up to 365-day, full-resolution data. Page results, apply explicit row/response limits, and guard against accidental scans. Optional graph downsampling belongs at the response/UI boundary, **not in raw retention**.
- **Corrections/idempotency:** deterministic observation identity; re-scrapes do not multiply records; ignore stale source revisions, preserve correction audit history and quarantined invalid input. Different providers' equivalent physical gauges remain independently identifiable until a mapping policy is defined.
- **365-day expiry:** raw observations can be deleted/TTL-eligible **only after their corresponding permanent S3 archive partition is verified**. Use `observedAt` for retention eligibility, treat TTL as eventual (not scheduled at an exact second), and exclude expired records logically in API queries. Never attach TTL to an unarchived record. See [AWS TTL behaviour](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html).

### S3 Standard: direct historical reads, permanently retained

- **Format:** prefer compressed, self-describing JSONL with schema version and explicit measurement identity; partition by provider/measurement/YYYY/MM. For completed months, compact daily immutable ingest chunks into **one or a small number of immutable month objects per measurement**. Keep current-month chunks readable without repeatedly rewriting the whole month. A correction generates a new version/manifest reference; readers see the latest committed canonical version, and prior revisions remain traceable.
- **Query:** for a requested measurement and UTC range **older than 365 days**, find relevant manifest partitions, directly `GetObject` those S3 objects, decode/parse on the server, filter requested timestamps and return a bounded/paginated API response. The period and measurement constrain retrieval; do not download a multi-year monolith or list the entire bucket per request. Cache manifest/queries where appropriate. This deliberately tolerates slower historical reads and does **not** require a hard p95 SLA or a separate archive-query service.
- **Storage class:** start with **S3 Standard** for immediate `GetObject` availability and a simple user experience. No automatic Glacier transition or retention expiry in this change. A later cost-optimisation change can select another class if direct retrieval requirements are preserved or the user explicitly accepts restore waits. `S3 Select` is **not** the solution; [AWS no longer offers it to new customers](https://docs.aws.amazon.com/AmazonS3/latest/userguide/selecting-content-from-objects.html).
- **Archive safety:** manifests record object key/version, measurement, min/max timestamps, count and checksum. Confirm content integrity/coverage before tagging corresponding Dynamo records eligible to expire. Missing or corrupted archive partition: alert, do not expire hot copies, preserve recoverable ingest/checkpoints.
- **Compatibility:** retain current public `levels/latest.json` as a derived artifact; archive objects and manifests stay **private**. Serve historical data through a narrow application-side access path or short-lived scoped URLs, not public-read on the entire bucket. Prefer an AWS role/read API over broadly scoped static credentials in Vercel. Direct S3 reads means direct object retrieval, **not** granting anonymous users unrestricted S3 access.

A normal historical year involves approximately twelve measurement/month objects after compaction, not 35,040 repetitive 15-minute snapshot objects. Current-month object layout and archived corrections must be covered in implementation tests; avoid prematurely introducing Parquet/Athena if compressed JSONL is adequate.

## 4. Scale, cost and retention

**Model assumptions — not production measurements:** each measurement reports every 15 minutes = 96 observations/day and ~35,040/year; Dynamo billable observation-item model ~350 B each (approximate, verify actual schema/indexes); S3 uncompressed canonical item allowance ~200 B (before compression, manifests and versioned corrections). Source outages, retries, CSO records and predictor products excluded.

| Measurements | New observations per 30-day month | One year's observations | 365-day Dynamo data estimate | Indefinite S3 raw at 5 / 10 / 20 years (uncompressed estimates) |
| ---: | ---: | ---: | ---: | ---: |
| 25 | 72,000 | 0.876m | 0.307 GB | 0.876 / 1.752 / 3.504 GB |
| 100 | 288,000 | 3.504m | 1.226 GB | 3.504 / 7.008 / 14.016 GB |
| 500 | 1,440,000 | 17.520m | 6.132 GB | 17.520 / 35.040 / 70.080 GB |

Illustrative Dynamo workload: each new observation + conditional latest-pointer update consumes roughly **two <=1KB writes** (plus retries/correction writes); estimated 25/100/500 measurement write counts **144,000 / 576,000 / 2,880,000 per 30-day month**. This is not an all-inclusive bill, and full-year range queries are subject to read-unit, 1 MB-per-response pagination and app response-size costs.

For order-of-magnitude context only, AWS's [EU Germany on-demand pricing example](https://aws.amazon.com/dynamodb/pricing/on-demand/) cites €0.7525 per million write requests and €0.30198 per GB-month for Dynamo Standard. Using those *non-Irish* example rates yields approximately €0.11 / €0.43 / €2.17 of monthly writes and €0.09 / €0.37 / €1.85 of steady-state 365-day observation storage for 25/100/500 measures respectively, before reads, PITR, table overhead, corrections, S3, Lambda, egress, CloudWatch and tax. These figures **must not be represented as eu-west-1 quotes**.

S3 raw storage **grows indefinitely**, but the estimated 5/10/20-year size remains modest at the modelled scale. S3 PUT/GET counts, manifest versions, noncurrent object versions, object sizes, cross-region transfers, and the legacy levels snapshot history could matter more than raw payload GB. Use conservative alarms/budget limits and actual cost monitoring with the first deployment, not a separate procurement-grade exercise.

The current MongoDB Atlas Free tier's **512 MB cap is a capacity bound, not a measured inventory**; never infer exact collection or index usage from it. Do a bounded read-only baseline count/index/age scan **when planning the backfill**, to reconcile outcomes and avoid missing history; this is not a storage-decision gate. See [MongoDB Atlas pricing](https://www.mongodb.com/pricing).

## 5. Risk and implementation acceptance (not architecture gates)

The architecture is accepted. These are **bounded acceptance requirements for #49 (producer), #50 (migration/archive) and #51 (consumer)**, assessed in ordinary CI, non-production integration checks and review of each change. No dedicated infrastructure prototype is required.

| Workstream | Required proof before that particular production cutover |
| --- | --- |
| Source and identity (#49) | Deterministic per-provider/measurement IDs; level and flow coexist at identical timestamps; unit/datum UTC handling; collection-run freshness; duplicate and corrected observations; retry safety |
| Dynamo read/write (#49/#51) | Latest pointer cannot regress; raw 24h, seven-day and 365-day bounded `Query`, pagination across UTC month/year boundaries; API response size and errors; no unbounded table scan; catch unexpected cost/latency in a normal staging smoke test |
| S3 permanence (#50) | Private Standard-class object partitions; reliable immutable commit/manifest/checksum; one date-window direct `GetObject` read and server filter, correct monthly boundary and corrections; recover a missing/partial write; no expiry on archive data |
| Safe hot expiry (#50) | A record becomes TTL-eligible only after verified archive coverage; deletion failure is recoverable; old-data backfill is written to archive rather than inserted with unverified immediately-expired TTL; UTC date boundaries handled |
| Backfill (#50) | Read-only source counts/index/timestamp baseline from Mongo Free, list legacy S3 histories, dedup conflicting arrays, reconcile counts + representative timestamps/values and quantify unavailable history; no assumed ability to reconstruct all historic points from EA |
| Deployment and reads (#49/#51) | Explicit IAM least privilege, Vercel app/private S3 access strategy, source+reader feature flag, production/Preview separation, cost monitoring and alarming; no production secrets or uncontrolled public-read on archives |
| Cutover and rollback (#49/#50/#51) | Producer additive/shadow writes before consumers; retain Mongo and old S3 read paths during overlap; compare source timeliness/value parity and fallback; reversible switch; no double emails or silently dropped records |

**Not needed to accept #48:** live AWS/Mongo credential access, Atlas collection-by-collection bytes, pre-production load-testing at 500 measures, restoring a fake 20-year archive, exact eu-west-1 cost quotes, strict historic S3 p95 targets, or designing Athena/Glue/S3 Select. They may be revisited only if normal implementation evidence surfaces an actual constraint.

**Operational consent remains separate:** Source code/ADR approval is not permission to deploy Lambdas, run mutations, provision AWS resources, archive/delete historical data, change TTL or use production credentials. Existing manual reviewed apply workflows and repository protections govern that work.

## 6. Migration and rollback sequence

1. **Contract (#49):** implement provider-neutral source/station/measurement/observation identity; introduce Dynamo/S3 writers behind existing scrape orchestration with in-code provider config. No behavior change to old consumers.
2. **Archive first (#50):** implement new S3 raw archive partitions/manifests/verification, then safe conditional writes to Dynamo. Continue writing legacy Mongo `riverschemas` and S3 `levels/latest.json` while compatibility is needed.
3. **Reconstruct:** bounded read-only baseline of small Mongo Free database + existing S3 history. Build idempotent canonical observations; dedup by measurement and upstream observedAt, preserve corrections, document known gaps. Do not treat historical forecast outputs or CSO snapshots as observed gauge readings.
4. **Shadow parity:** instrument missed readings, source timestamp/lag, count/value disagreements and archive completeness. Investigate nontrivial discrepancies; correct before serving new reads. No double alert sends.
5. **Consumers (#51):** switch latest and historical APIs incrementally to new store, retain current response envelopes, freshness and fallbacks. Keep HPP transition computation and alert state in Mongo unless separately migrated. Use direct S3 read for older raw windows, with sensible per-request bounds and caching.
6. **Grace period:** keep original writes and read rollback for a practical overlap (30 days is a **planning assumption**, not a contractual requirement). Roll back web reads first; pause TTL/cleanup if archive coverage or reader parity is uncertain.
7. **Retirement:** only after explicit review of completed migration, reconcile and confirm backups/restores may redundant old Mongo river documents be removed. Existing CSO deletion/archive defects remain separate issues.

## 7. Investigation outcome and follow-on tracking

**Accepted design questions:** DynamoDB + S3 for **gauge observations**; 365 days queryable full-resolution DynamoDB; indefinitely retained S3 Standard raw observations queried by direct object GET; Mongo retained initially; EA first and other providers later; no dedicated feasibility prototype or strict archive-lookup SLA.

**Unmeasured but nonblocking facts:** actual Atlas data/index bytes, S3 current and noncurrent bytes, real CSO count/fan-out, live query throughput and regional bill. No live resource inspection was attempted. Implementer should collect only the minimum safe metrics needed for migration parity and initial cost monitoring, without PII export.

**Follow-on tracking:**
- [#49](https://github.com/tclare95/isHPPOpen/issues/49): configurable gauge ingestion, source/measurement identities, Dynamo/S3 producer boundaries and collection-run health.
- [#50](https://github.com/tclare95/isHPPOpen/issues/50): reconstruct/backfill historical observations, S3 month archive/manifests/direct reads, verified expiry and rollback.
- [#51](https://github.com/tclare95/isHPPOpen/issues/51): web gauge readers, latest/year history, S3 older history, HPP/alert compatibility and fallback.
- [#52](https://github.com/tclare95/isHPPOpen/issues/52): additional gauges after current contracts work.
- Source-audit defects: [scraper #10](https://github.com/tclare95/ishppopenScraper/issues/10) (SQS partial batch reporting), [scraper #11](https://github.com/tclare95/ishppopenScraper/issues/11) (CSO archive integrity), [web #63](https://github.com/tclare95/isHPPOpen/issues/63) (HPP carry-forward).

## Sources consulted

- [Scraper writer](https://github.com/tclare95/ishppopenScraper/blob/main/is-hpp-open-scraper/is-hpp-open/app.mjs), [SQS worker](https://github.com/tclare95/ishppopenScraper/blob/main/is-hpp-open-scraper/is-hpp-open/csoWorker.mjs), [CSO archival](https://github.com/tclare95/ishppopenScraper/blob/main/is-hpp-open-scraper/is-hpp-open/csoArchival.mjs), [SAM infrastructure](https://github.com/tclare95/ishppopenScraper/blob/main/is-hpp-open-scraper/template.yaml)
- [Web level service](https://github.com/tclare95/isHPPOpen/blob/main/libs/services/levelsService.js), [HPP status](https://github.com/tclare95/isHPPOpen/blob/main/libs/services/hppStatusService.js), [water-quality/CSO](https://github.com/tclare95/isHPPOpen/blob/main/libs/services/waterQualityService.js), [Trent definitions](https://github.com/tclare95/isHPPOpen/blob/main/libs/trentWeirsConfig.js), [predictor](https://github.com/tclare95/trent-predictor/blob/main/deploy/lambda_handler.py)
- [Mongo Free pricing/limits](https://www.mongodb.com/pricing), [AWS GetObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html), [Dynamo TTL](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html), [AWS DynamoDB on-demand](https://aws.amazon.com/dynamodb/pricing/on-demand/), [S3 Select availability](https://docs.aws.amazon.com/AmazonS3/latest/userguide/selecting-content-from-objects.html)

This investigation uses OpenSpec `skip_specs: true` and does not introduce application behavior, infrastructure resources or production data changes.
