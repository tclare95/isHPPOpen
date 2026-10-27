# Design: Production-only, fail-closed observation lifecycle

## Verified starting point
RDP's stage collector, Dynamo/S3 archive and read API are implemented. The signed stage transport smoke passed 13/13 on 24 October 2026; collection is currently disabled and staging has only three measurement entries. A genuine Vercel Preview role exchange and production deployment have **not** been proven by that smoke; web OIDC belongs to #51.

Specific source restrictions needing deliberate production support:
- `template.yaml`: `HasObservationStorage` depends on `IsStaging`, rules `StorageIsStagingOnly` and `StagingCollectionOnly`, `ReadApiEnabled` and allocation constrained to staging, and `CollectorSchedule.State=DISABLED`.
- `deploy/release.py`: `require_target` rejects production storage/collection/read API.
- `deploy/bootstrap.py`: generates staging-only bootstrap, OIDC and exact resources.
- `PlatformOptionsValidator`: production `CollectorsEnabled` invalid.
- `Infrastructure/Composition.cs`: collector S3/Dynamo clients reject non-staging and store names are literally staging.
- `ObservationCollector`: iterates only `StagingMeasurementIds`; registry contains three measurements with stage selection.
- The read Lambda composition already derives production storage names from validated `PlatformOptions`; production IAM/SAM/release bootstrap are still absent.
- #69 read-side `coverage.json` begins unknown by design. New production polling does not prove uninterrupted earlier source coverage.

## 1. Same-account but separate production trust and data
Keep `eu-west-1` and the approved AWS account as an **explicitly revalidated target during each release**; never fall back to stage target or an implicit CLI profile. Resource names, immutable release artifacts and account IDs are derived from independently verified production configuration.

Distinct `river-data-platform-production` stack and `river-data-platform-production-*` bootstrap/deploy, CloudFormation, Lambda execution and web invoke identities. Production GitHub OIDC trust pins the *immutable* repository identity and `environment:production` with expected STS audience; stage continues its original trust. Distinct artifact bucket/prefix, collector/table/bucket, API Gateway ID/stage, cursor secret, logs, cost allocation and budget. CloudFormation service role and deployment policy must be limited to exact owned production stack/change sets and named role pass privileges. Use per-role permissions boundaries and explicit IAM simulation/negative tests for stage↔production (read, write, invoke, IAM policy/PassRole, deploy); preserve all existing protections for legacy infrastructure.

Read Lambda: read-only GetItem/Query, S3 GET and required exact-bucket ListBucket absence semantics, own logs. Collector: conditional Dynamo writes and only canonical S3 prefix GET/PUT on production store, not arbitrary object deletion. No web role gets Dynamo/S3 access. Production Vercel trust is project + **Production** environment-scoped and can invoke only four `AWS_IAM` GET routes of its exact production API; Preview must be denied. Reuse existing stage API allocation → exact ID-bound bootstrap → activation pattern without wildcard API privileges. No anonymous routes, browser credentials or public S3 access.

Preserve `Retain` of canonical S3/Dynamo and versioning, PITR, encryption/TLS/public-access block, and audit record of resource IDs and verified delete/replace behavior. A disabled collector **must not** imply detaching managed observation storage.

## 2. Configuration, schedule and collector correctness
Keep validated common registry of canonical provider/station/exact measure IDs, but introduce an explicit reviewed `productionMeasurementIds` distinct from `stagingMeasurementIds`; catalogue registration/publication is not automatic polling. Retain stage 1–3 cap and disabled schedule; production initially selects the three already stage-tested measures, later all six only after #52 exact metadata and a separately authorised config change. Disabled/unknown/duplicate/unsupported IDs fail validation before provider/storage I/O. Prove another registered but unselected measurement remains dormant.

Use two separate controls: `CollectorsEnabled` gates collector runtime; a dedicated `ScheduleEnabled` gates EventBridge activation, both false by default for production and staging. Schedule enable requires durable store, explicit nonempty production selection, tested alarm destinations and separate approved release. Permit bounded manual collection with schedule off; permit read API operation with collector off. Release input and reviewed change set must display all flags and the **exact source selection/config hash**. Keep 15-minute schedule, reserved Lambda concurrency one and max 3 per-measure concurrent operations initially. Verify 6-series duration and provider request ceilings against existing 40s per-measure budgets and Lambda 180s timeout before full selection.

The collector's cursor currently covers a 6h overlap with 48h maximum lookback; if `cursor - 6h` is older than `now - 48h` the source raises `BackfillRequired` (roughly 42h elapsed). Do not expand the lookback or silently reset the cursor merely to clear errors. No duplicate scheduled/manual runs should modify immutable history twice; only verified archive receipts permit Dynamo hot writes, latest or cursor advancement. Preserve normal *live-source correction* revision semantics inside the established overlap; operator catch-up/backfill must not bypass #50's protection of existing committed canonical readings.

Explicit state evidence: enabled+schedule enabled, runtime disabled, scheduled but failing, per-measure stale, per-measure `BackfillRequired`, and source outage are distinct. A measurement failure is isolated from healthy peers; shared fatal storage failures fail visibly.

## 3. Monitoring, alert delivery and budgets
Use existing structured collector and API logs plus CloudWatch metrics rather than introducing a control-plane service.

- **Schedule heartbeat:** detect no completed enabled collector invocation after ~35–45 minutes, accounting for scheduling jitter; configure disabled-state suppression so intentionally-off deployments do not page. Also monitor EventBridge failed targets, Lambda Errors/Throttles and execution nearing deadline.
- **Per-measure freshness:** derive age from source `observedAt` (not success HTTP timestamp or ingestion `completedAt`); warn after around two expected intervals (30m at 15m cadence), escalate sustained staleness around 60–90m, with configurable/source-specific noise dampening.
- **Durability:** archive commit/checksum/manifest integrity, conditional Dynamo persistence, cursor stall, repeated `PartialFailure`, `BackfillRequired`, and abnormal gaps/lag. Alert on integrity errors promptly.
- **Read API:** bounded 5xx, 403/authentication drift, throttling, query budget/latency and integrity errors; monitor while API is intentionally enabled.
- **Delivery:** production-specific SNS/email or similarly minimal approved notification destination; prove alarm delivery and recovery without logging destinations/secrets.
- **Cost:** independent production budget/alert and resource/cost tags, on-demand Dynamo request units, S3 version storage/write/read growth, API/Lambda calls, logs and any eventual SNS. Budget is an alert, never a hard cost cap. Review initial three-measure usage before enabling six and estimate longer-term archive/version growth.

Alarms should distinguish stale **source** data from healthy collector execution and distinguish intentionally disabled sources from unexpectedly silent schedules. Alarm owner and runbook link are required before continuous enablement.

## 4. Retention and archive-first safeguards
Reuse ADR-001: source-observed-time +365d hot eligibility, encrypted on-demand Dynamo with PITR, S3 Standard versioned immutable archived observation chunks and permanent committed manifests. Never attach S3 expiration/Glacier transitions or shorter stage cleanup policies to production canonical history. New archive objects are committed and independently verified **before** hot writes, latest/cursor changes or TTL-eligibility metadata.

Leave Dynamo TTL **OFF** during initial deployment and collection. A separate operator-approved TTL enable gate requires proven archive/hot parity, committed-manifest integrity, absence of unsafe unarchived rows, retention configuration limited to eligible history records (not latest/cursor/health), and #69 history tests across cutoff/TTL deletion and its 31-minute overlap for 30-minute cursors. Include replay after partial S3/Dynamo write and rollback behavior. TTL enabling is not required for the first seven-day web cutover; do not infer physical deletion is immediate when TTL activates.

Never remove archive chunks, versions, source-history provenance or existing legacy data during rollout/rollback. Before any schema/storage change, demonstrate Retain behavior and review the CloudFormation planned replacement risk.

## 5. Outage recovery and explicit gap acknowledgement
**Short outage:** when the durable cursor remains within configured normal source lookback (including correction overlap), simply retry the next run with existing bounded fetch/replay; report source health from observed time. Do not mark a skipped run as successful durable ingestion.

**Beyond lookback:** `BackfillRequired` is a fail-closed, per-measurement operational condition. Keep original cursor and committed readings; do not reset/advance or skip silently. Other selected healthy measurements continue normally. Operator receives the missing interval and source/cursor evidence.

A separately approved bounded repair procedure:
1. Identify the exact canonical measurement and the historical interval between durable cursor and desired resumption (with overlap), verified provider reach, existing RDP canonical data, requested requests/time/bytes and expected storage impact.
2. Produce a dry-run/reconciliation report using read-only provider/archive evidence; classify already-canonical, accepted missing candidates, source-unavailable and ambiguously conflicting observations. **Never override existing canonical readings automatically**; use a distinct reviewed correction operation for conflicting values.
3. Approve explicit target, interval and bounds, run archive-first conditional insert/verification and hot repair where applicable; checkpoint progress idempotently. Do not permit a generic direct Dynamo cursor edit or unbounded source replay.
4. If provider history cannot fill everything, record and review each **known unrecoverable gap** with UTC range and `not_collected`, `source_outage`, `legacy_unrecoverable` or `unknown` reason. Do not upgrade unknown to complete just to resume. Where #69 coverage inventory is updated, publish reviewed evidence and preserve read API partial/unknown and expected-archive-integrity distinctions.
5. **Only after** repair and/or approved gap acknowledgement, run a guarded cursor-resumption operation with target measurement, previous cursor precondition, chosen new resume boundary, operator identity/reason, evidence link and CAS concurrency check. Never advance a cursor based solely on wall clock or a failed import.
6. Resume normal collection and verify archive receipt, latest, cursor, health and no unexpected duplicate/correction. Record skipped/irrecoverable intervals for later #50 attempts, rather than pretending they never existed.

A cursor resumption is an explicit operational mutation and must not be part of a documentation merge, routine collector error handler or standard re-deployment. It cannot silently mutate unrelated measurement cursors.

## 6. Phased production activation and rollback

| Gate | Intended state | Evidence / approval |
| --- | --- | --- |
| P0 — Code ready | No new production resources | CI, .NET tests, SAM validation, isolated IAM/bootstrap simulations, explicit target/safety checks |
| P1 — Inert foundation | Production logs/roles + disabled collector/schedule; no provider calls | Separate bootstrap and manual prepare/review/apply approval; stage/prod denial |
| P2 — Durable storage | Production Dynamo/S3 provisioned, retained; collection still off | PITR/versioning/private encryption, resource policy and rollback verification |
| P3 — Bounded source smoke | Manual, finite three-measure invokes; schedule off | Per-measure EA values, S3 verified chunks/manifests, hot latest/cursor, idempotent replay, observed spend |
| P4 — Continuous collection | Approved 15m schedule + runtime collector; three measures initially | Alarms/destination tested, missing-run/freshness evidence, logs and stop procedure |
| P5 — Six-series operation | #52 reviewed exact IDs and approved expanded prod selection | Six gauges independently healthy, provider quotas, duration, per-measure lag and cost |
| P6 — Production read API | AWS_IAM endpoint active independent of collector | Separate exact-API IAM/bootstrap approval, signer success, wrong-stage denies, history/health/integrity smoke |
| P7 — Consumer handoff | Web remains legacy until #51's separate activation | Verified recent history, successful Vercel Production identity testing, shadow parity and cache-aware rollback |

The P4/P6 ordering is flexible as long as P6 reads valid isolated storage; neither enables web consumption. All cloud phases need *distinct explicit* operator approvals for IAM bootstrap, prepare, apply, source invocation, schedule activation, API activation and eventually TTL. Merging this OpenSpec or implementation code is never authorisation.

Rollback should stop scheduled invocation and runtime collection without deleting storage; optionally deactivate production read API while preserving observation data and cursor secret semantics. Re-enable through reviewed change sets, not by direct console drift. Web rollback belongs to #51; staging resources remain untouched.
