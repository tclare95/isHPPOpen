# ADR-001: Observation storage and retention investigation

- **Date:** 8 October 2026
- **Status:** Proposed architecture; **not an approved production storage decision**
- **Tracking:** [isHPPOpen #48](https://github.com/tclare95/isHPPOpen/issues/48)
- **Scope:** Cross-repository design and read-only source audit; no deployment, live database inspection, migration or retention deletion
- **Repositories reviewed:** isHPPOpen, ishppopenScraper, trent-predictor, riverscraper, reservoir-levels

## Decision proposed for review

**Use DynamoDB on-demand for canonical, queryable gauge observations and current measurement pointers, and S3 for raw/immutable historical exports and long-term access.** Put new writes behind a provider-neutral ingestion/persistence interface. Keep HPP status transitions, CSO spill intervals, water-quality snapshots, forecasts, subscriptions and alert-delivery state as distinct domain models, not rows in a generic time-series table.

This is a **conditional recommendation**, not permission to provision tables or retire MongoDB. In particular:
1. Live Atlas collection/index sizes, existing S3 volumes, actual CSO-monitor counts and region-specific monthly cost are **not verified**. The GitHub connection provides source access, not approved operational credentials or AWS billing/inventory access.
2. The user must accept a hot-history service level (suggested 90 days of raw observations, with year-chart rollups available separately), and confirm whether years-old *raw* points must be available synchronously.
3. A small isolated fixture-backed proof must establish DynamoDB query and web-access patterns, record reconciliation, request-unit consumption and archive retrieval behaviour before the selection is recorded as Accepted.
4. If arbitrary historical SQL-style analytics or frequent multi-measure joins are central requirements, **PostgreSQL + S3 may be preferable**, even with a modest higher steady-state compute bill.

**Do not migrate all Mongo collections as one operation.** The first bounded target is gauge observations; evaluate CSO/latest operational storage separately. Retaining CSO snapshots in Mongo may continue to dominate Atlas footprint even after moving the river arrays.

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

## 3. DynamoDB + S3 access design (candidate)

**DynamoDB observations table:** PAY_PER_REQUEST, single region eu-west-1 near the scraper for first slice. Partition key **measurementId#YYYY-MM**; sort key **UTC observedAt** (fixed-width ISO 8601). An observation is one item per measurement/timestamp. Query one month for a particular measurement or fan out over bounded month/measurement pairs for comparisons; use server-controlled limits/pagination. For small measurements and their frequencies, month partitioning is practical; revisit if measured hot partitions emerge.

**Latest measurement table or separate typed keys:** one row per measurementId, updated only if observedAt is newer or the *same timestamp* has a source-authorised correction. A stale backfill cannot regress latest; condition failures are expected, not ingestion failure. Prefer simple conditional writes; if atomicity becomes necessary test transactional costs. Avoid a GSI unless a measured query needs it. Gauge configurations are version controlled; metadata may be materialised as a view, but configuration remains authoritative.

**S3 raw/history:** private versioned archive, provider/measurement/day partitioning, compressed JSONL or Parquet (choose against consumer/query needs). Append/write daily partitions through a safe staged-object + versioned-manifest commit; manifests include row counts, hashes, watermarks and revision policies. Coalesce many measurements into appropriately sized objects rather than thousands of tiny Glacier objects. Keep the existing public **levels/latest.json** contract as a derived compatibility artifact until the web has switched. Preserve existing historic objects unmodified for audit/replay.

**Queries to prove in a sandbox:**

| Consumer query | Dynamo access / fallback | Essential test |
| --- | --- | --- |
| Latest per named measure and alert evaluation | GetItem current pointer per measurement (batch for bounded list); require freshness/observedAt | Older replay, equal-time correction and missing-source health |
| 24h / 7d history | Query 1-2 month partitions per measurement, in timestamp order | Correct ordering and pagination across UTC month edge |
| Rolling year chart | Hourly/daily derived rollup or bounded paginated raw queries; S3 served/exported on demand | 35,040 15-minute rows/measure/year, response size and time budget |
| Bounded multi-gauge comparison | Batch/fan-out of explicit measurement/time slices; no scan | Shardlow level and flow same timestamp never collide |
| Bulk backfill | Conditional batch writes with retries, unprocessed-item handling and checkpoints | Replay and partial-failure idempotency |
| Archive/history export | S3 manifest + partition retrieval, audit checks and pagination | Restore 5 years of raw data, checksummed, without Dynamo hot retention |

DynamoDB Query results are paginated (up to 1 MB of data per request), and queries must know the partition key. It is *not* a natural backend for unconstrained cross-station SQL analytics. Use rollup artifacts or a separate analytical path for longer cross-measure periods rather than scans. Raw S3 archives should not become latency-critical without an explicitly built index/cold-query route.

## 4. Quantified workload and retention scenarios

**Inputs (hypotheses, not production inventory):** one reading every 15 minutes per measurement; 96/day; 35,040/year; 365-day year; no gaps or corrections. Current web dashboard defines **6 measure views**, not six newly ingested time series. CSO workload and predictor forecast volume are **excluded** because they have different shapes and need their own live counts.

| Measures | New obs/month (30d) | Raw observations 1y / 3y / 5y | Hot storage, 90d @350 B | Hot storage, 365d @350 B | 5y S3 raw @200 B |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 25 | 72,000 | 0.876m / 2.628m / 4.380m | 0.076 GB | 0.307 GB | 0.876 GB |
| 100 | 288,000 | 3.504m / 10.512m / 17.520m | 0.302 GB | 1.226 GB | 3.504 GB |
| 500 | 1,440,000 | 17.520m / 52.560m / 87.600m | 1.512 GB | 6.132 GB | 17.520 GB |

Size assumptions are intentionally provisional: Dynamo 350 B/item **includes a rough allowance for key attributes and per-item overhead**, but not extra GSI copies; S3 raw 200 B/observation is **before compression** and omits manifests, object/version overhead and request charges. Measure actual serialised samples before budget sign-off.

**Retention profile A, preferred starting hypothesis:** 90 days full-resolution hot Dynamo; hourly/daily rollups kept queryable for at least 5 years; raw, correction-aware S3 records retained for 5 years or a user-agreed duration. Year charts use rollups; older raw points served through asynchronous/on-demand archive API. Do not expire hot items before an independently verified archive manifest covers them.

**Retention profile B, higher-queryability option:** 365 days full-resolution Dynamo; S3 retains 5-year or longer immutable raw history and monthly/daily summaries. This is a small storage increase at anticipated volumes and removes much of the year-chart complexity. At only 25-100 measures this may be the simpler **product** default; decide based on read UX rather than a negligible storage saving.

**Illustrative Dynamo request budget, NOT an eu-west-1 quote:** each arriving observation costs one <=1 KB write; assume one additional <=1 KB latest-pointer write, no GSI, no transaction and 30-day month. At the AWS-published **EU (Germany)** on-demand example rate of **€0.7525 / million writes** and **€0.30198 / GB-month storage**, estimated baseline is:

| Measures | 2 writes/obs per month | Monthly write requests | 90d hot storage/month | 365d hot storage/month |
| ---: | ---: | ---: | ---: | ---: |
| 25 | 144,000 | €0.11 | €0.02 | €0.09 |
| 100 | 576,000 | €0.43 | €0.09 | €0.37 |
| 500 | 2,880,000 | €2.17 | €0.46 | €1.85 |

AWS example **read price €0.1505/million read units**: e.g. 250,000 eventually consistent <=4 KB item reads would represent 125,000 RRUs, approximately **€0.02**. Real graph-range reads span *many items* and pagination, so that example is not a credible web-read forecast. Add paid PITR/backups, any GSI writes/storage, backfills, data transfer, CloudWatch, KMS, archive storage/requests/transitions/retrieval, existing infrastructure and taxes. These are not included above. The German price is used solely because its exact example figures are publicly inspectable; **do not treat as an Irish/London price**. Resolve current eu-west-1/eu-west-2 prices using AWS Pricing Calculator/current regional offer and measured monthly read units before implementation.

**S3 object-count consequence:** one dated *full-window* snapshot per 15-minute run creates 35,040 small history objects **per year for one source** and repeats its history. A daily, compacted archive is roughly 365 objects per measurement/year *if archived per measurement/day*; coalescing further may save transition and metadata costs. Do not send tiny per-reading objects to Glacier. Current levels bucket has **versioning**, so overwriting latest may also create noncurrent versions: inventory both current and noncurrent bytes.

Pricing and constraints checked **8 October 2026**: [AWS DynamoDB on-demand rules and EU Germany example](https://aws.amazon.com/dynamodb/pricing/on-demand/), [Nov 2024 write-price reduction](https://aws.amazon.com/about-aws/whats-new/2024/11/amazon-dynamo-db-reduces-prices-on-demand-throughput-global-tables/), [DynamoDB GSI costs](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html), [Mongo Atlas M0 limits](https://www.mongodb.com/pricing), [S3 lifecycle minimums and small-object concerns](https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-transition-general-considerations.html), [Dynamo TTL](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html).

## 5. Options compared

| Criterion | Improve MongoDB + S3 | PostgreSQL + S3 | DynamoDB + S3 |
| --- | --- | --- | --- |
| Fit for current code | Least migration; normalise level readings and archive existing arrays | Strong relational mapping, SQL window/aggregate queries; would replace Mongo query idioms | Good for fixed measurement/time/latest access; requires explicit query design and pagination |
| Cost floor | M0 512 MB free; may already be tight due to CSO and repeated snapshots; paid Atlas cluster/backup must be priced for region | Free/scale-to-zero or paid managed PostgreSQL possible; continuously polled workloads reduce idle benefits; provider tier varies | Low read/write/storage cost for small sparse on-demand workload; PITR, IAM, GSIs, S3 and backfills extra |
| History and cross-station analytics | Flexible aggregation but Atlas index/data size trade-offs | **Best** for joins, full-history SQL, gap-fill and arbitrary analytics | Bounded per-measure range queries efficient; cross-measure and year-history need rollups or parallel reads |
| Operational burden | Already deployed but Atlas credential/preview issues remain | Migrations, pool/connection handling, indexes/partition lifecycle | No connection pool, AWS IAM/observability; app-side modelling and archive lifecycle complexity |
| Migration | Lowest risk; still needs de-dup and retention | More data conversion and different web query layer | Targeted dual-write and new consumer read boundary; no forced rewrite of editorial/alerts |
| Main reason not selected first | Does not, by itself, remove Atlas dependence or solve CSO history growth | Query flexibility may be under-used versus continuous serverless operations | **Recommended narrowly**, provided historical read needs are bounded and IAM/web access is proven |

**Preferred provisional choice:** DynamoDB + S3 **for gauge observations only**. Keep Mongo's editorial, CSO and alert operational collections intact initially; assess whether keeping Atlas solely for these collections is acceptable. If minimizing *total distinct databases* is more important than separating workloads, PostgreSQL + S3 deserves a fresh look as the single consolidated operational store.

## 6. Migration and rollback boundaries

1. **Inventory/approval gate:** approved *read-only* Atlas statistics, indexes and min/max timestamps, CSO_ID cardinality, S3 object/version inventory and AWS monthly billing; establish a baseline health/latency/error period. No PII exports. User explicitly approves any live read-only interrogation before it happens.
2. **Isolated proof:** non-production Dynamo table + private S3 fixture bucket and synthetic EA measurements (including Shardlow level + flow at same UTC timestamp, correction, duplicates, gaps and cross-month history). Record consumed WRUs/RRUs, p50/p95 query timings, billed storage, read API pagination, archive manifest verification and backup/restore procedure. No production mutations.
3. **Contracts first (#49):** introduce validated provider config, source and measurement IDs, UTC/unit/quality/provenance mapping and collection-run health. Add an adapter behind existing producers; **keep existing Mongo and latest S3 writes** as authoritative during an opt-in shadow phase.
4. **Historical migration (#50):** backfill from available S3 dated history and Mongo arrays; deduplicate by measurementId + observedAt; checksum partitions; reconcile counts, min/max times, missing gaps, values/units and sample records. EA API backfill is opportunistic and rate-limited, not presumed complete. Forecasts and CSO incidents are excluded from observation backfill.
5. **Shadow validation:** record new-vs-old agreement by measurement/time window, p95 read latency, ingest lag, missing/corrected percentage and stale/failure statuses. Query both independently while serving existing responses; do not dual-send user alerts. Use measured signoff thresholds (proposed: 100% identity correctness; zero unintended timestamp collisions; >=99.9% value parity among comparable records, with every mismatch explained; no unreconciled missing archive partitions).
6. **Consumer cutover (#51):** switch one read API at a time using feature-controlled read preference with tested fallback; preserve levels/latest.json, HPP event semantics, existing API response envelopes and front-end health fields. Predictor direct EA history remains until separately adopted. Alert evaluation and idempotency need dedicated parity tests.
7. **Grace/rollback:** reversible web read flag; keep original Mongo reads/writes and S3 keys for an agreed 30-day overlap **after final parity signoff** (hypothesis, subject to cost); rollback web first, then producer; no automatic destructive TTL before manifest verification and approval. If the new ingestion is unavailable, track backlog and resume from source watermark rather than writing fabricated data.
8. **Retirement:** only after independent monitoring, archive-verification audits, backups/restore rehearsal, all consumers migrated and explicit change approval may old Mongo histories be pruned. Existing CSO archives require a separate verified cleanup design, and should never be deleted by this ADR.

**Security and preview:** AWS IAM write only from ingestion Lambdas; read only for explicitly authorised consumer; private buckets, encryption, S3 versioning; production and preview resource isolation by table/bucket/role; no static AWS keys committed or casually placed in Vercel. Investigate supported OIDC federation or a narrow AWS read API for Vercel before #51. Secret rotation and old Atlas-user revocation are separate operational tasks.

## 7. Missing live evidence and exact collection plan

This source audit **cannot assert** current live object count, Atlas bytes/indexes, older/newest dates, CSO fan-out, AWS S3 bytes or bills. Obtain the following with approved READ-ONLY access and record **only aggregate data**, not raw contact/subscription documents:

- **Atlas:** for riverschemas, waterQuality, csoData, openIndicator and alert/editorial collections record estimated counts, collStats size/storageSize/totalIndexSize where permitted, index definitions, oldest/latest event or scrape UTC timestamp and last-7/30-day insert counts; note Atlas Free restrictions, expensive collection scans and whether date indexes exist. Inspect document-shape samples **only after stripping identifiers and PII**. Record current Atlas tier, provider cloud/region, capacity limit and billed amount.
- **CSO:** count unique attributes.Id (no ID values required), expected SQS work items per scrape, worker retries/DLQ depth and three-month growth; distinguish one polling snapshot from a new spill incident.
- **S3 levels:** bucket region, present/noncurrent version count and bytes for latest and dated prefix, current object count/average bytes, oldest/newest object, lifecycle and public access. **CSO archives:** batch count, total bytes, earliest/latest key, manifest/metadata verification and recoverability. **Predictor:** history and CSV sizes, cadence and age without downloading model assets.
- **AWS cost:** last 30/90 days CloudWatch+Lambda+SQS+S3, including PUT/version storage/transition and transfer; current Dynamo regional list prices and PITR; expected Vercel region. No Terraform/SAM apply to collect this evidence.
- **Performance acceptance:** synthetic 25/100/500 measurement fixtures, 15-min cadence, 90d and 365d history, per-query p50/p95 time and consumed units at latest, 24h, 7d, yearly view and 5-measure comparison; separately model the much larger CSO feed. Use isolated resources and teardown after approval.

After those measurements, update this ADR with actuals, a same-region price estimate and a firm retention/query SLA, mark Accepted or Rejected, and only then unblock #49 persistence and #50 migration.

## 8. Follow-on issues and ownership

- [#49](https://github.com/tclare95/isHPPOpen/issues/49): provider-neutral EA configuration/ingestion and collection-run health; no live persistence commitment before ADR acceptance.
- [#50](https://github.com/tclare95/isHPPOpen/issues/50): canonical observation backfill, dedup, archive verification and rollback; **avoid repeated window-array snapshots**.
- [#51](https://github.com/tclare95/isHPPOpen/issues/51): web reader adapters, retained response contracts, HPP status boundary, freshness/fallback and alert idempotency.
- [#52](https://github.com/tclare95/isHPPOpen/issues/52): further gauges only after stable data contracts and migration; configure flow separately from level.
- **Source-audit defects filed:** [ishppopenScraper #10](https://github.com/tclare95/ishppopenScraper/issues/10) (SQS batch failure reporting), [ishppopenScraper #11](https://github.com/tclare95/ishppopenScraper/issues/11) (CSO archive integrity), and [isHPPOpen #63](https://github.com/tclare95/isHPPOpen/issues/63) (year-window HPP state carry-forward). These are separate bounded fixes, not an observation-store migration. Live inventory approval remains with #48.

## Review decisions requested

1. Should the ordinary user-facing one-year graph show hourly rollups, with full 15-minute readings available for export, or must all year-old samples be synchronously browseable? This determines profile A versus B; profile B may be simpler.
2. Is **five-year raw observation retention** a reasonable starting policy, or must the full raw source history be retained indefinitely?
3. Is it acceptable to **retain Mongo for CSO, editorial and alerts** during a phased gauge migration, rather than aim for a single datastore in the first release?
4. May a later read-only investigation collect live Atlas/S3 aggregate metrics using a restricted operator session? No live access has been attempted in this investigation.

Once agreed, the implementation spec should be split by producer, archive/backfill, and web-consumer boundaries; this ADR itself does not approve infrastructure changes.
