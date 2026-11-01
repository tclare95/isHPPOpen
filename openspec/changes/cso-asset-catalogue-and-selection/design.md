# Design: CSO provider catalogue and explicit selection (#71)

This is **engineering guidance**, not the normative product specification. Follow the behaviour in [cso-collection-selection](specs/cso-collection-selection/spec.md); leave reasonable implementation latitude. Only Severn Trent is in scope initially.

## Actual RDP architecture and reusable boundaries (reviewed 1 November 2026)

The .NET 10 solution in [river-data-platform](https://github.com/tclare95/river-data-platform) already has independent Core/Infrastructure/Lambda/ReadApi projects, DI, typed options, \`IHttpClientFactory\`, injected \`TimeProvider\`, bounded cancellation, source/measurement registries, structured run outcomes, stage-specific IAM and manual prepare/review/apply deployments. Reuse **conventions**, not observation-specific types:

| Reuse across domains | CSO-specific; do not inherit from EA gauges |
| --- | --- |
| Stable \`providerId\` and \`sourceId\` concepts; store upstream IDs separately | CSO outfall identity, provider catalogue fields and identity mappings |
| Options/config validation, deterministic registry selection, bounded HTTP and safe diagnostics | Discovery paging, completeness policy, source-specific metadata and status-code interpretation |
| Stage/prod isolation, disabled-by-default activation, release provenance | Catalogue snapshots, refresh/version diagnostics and CSO selection plans |
| TimeProvider, cancellation, run ID/start/duration/outcome pattern | CSO selection health and eventual per-outfall polling/event health |

Do **not** share \`MeasurementRegistry\`'s EA-specific validation, non-empty/1–3/1–6 limits, \`ObservationCollector\`, \`IObservationStore\`, \`IObservationArchive\`, observation Dynamo keys, 365-day TTL or #81-B2 observation-cursor recovery. The current \`Platform:CollectorsEnabled\`/storage validator and 15-minute \`CollectorFunction\` schedule belong to observation collection. A catalogue-only job must not require observation storage or enable gauge collection. Avoid premature shared provider/storage abstractions; introduce a small CSO-owned discovery/planning seam in the existing solution.

## Public source evidence and assumptions

The [legacy Node reader](https://github.com/tclare95/ishppopenScraper/blob/main/is-hpp-open-scraper/is-hpp-open/waterQuality.mjs) queries Severn Trent's public ArcGIS FeatureServer layer
\`https://services1.arcgis.com/NO7lTIlnxRMMG9Gw/arcgis/rest/services/Severn_Trent_Water_Storm_Overflow_Activity/FeatureServer/0\`, filtering with \`Id\` and reading \`Status\`, \`StatusStart\`, \`LatestEventStart\`, \`LatestEventEnd\` and \`LastUpdated\`. This verifies the **old integration contract**, not live layer guarantees.

The [published EDM activity field standard](https://github.com/icebreakerone/stream-data-standards/blob/main/docs/schema/storm-overflow-activity.md) describes those fields and their conventions; the existing consumer treats status \`1\` as spilling, \`0\` as not spilling and \`-1\` as offline. **A direct read-only check of the current Severn Trent layer did not conclusively verify** its present schema, coded-domain values, paging, \`maxRecordCount\`, edit/change tracking, rate limits or publication lag. These are **unverified assumptions** until an approved bounded probe records actual responses. \`LastUpdated\` must not be assumed to be a catalogue change watermark; \`OBJECTID\` is not a canonical outfall identity. The \`Id\` field is the candidate authoritative provider asset ID; long-term stability across source republications is not proven by a single sample.

PR 1 should contain a small opt-in, **read-only and bounded** source probe and trimmed, attributed schema fixtures. Record the UTC check date, layer URL/metadata, \`fields\` and coded domains, \`objectIdField\`, advertised pagination capability, \`maxRecordCount\`, response shape, feature counts, duplicate \`Id\` evidence, \`exceededTransferLimit\` and error handling. Confirm \`returnCountOnly\` and supported \`returnIdsOnly\`/object-ID batching or offset paging using safe query sizes; compare complete enumeration to reported count, without assuming count alone proves correctness. Include a small repeat read for update timestamps/identity consistency; it cannot prove historical stability or a rate limit. Do not stress-test or brute-force a threshold; respect \`429\` and \`Retry-After\`, record restrictions/terms if supplied. Explicitly label still-unknown ID reuse, source lag and cadence constraints. An HTTP 200 response with an ArcGIS \`error\` object, malformed content, unexpectedly truncated page or incomplete ID enumeration is a discovery failure.

## CSO catalogue model and source continuity

Use a domain-owned provider adapter for complete discovery and a separate pure planner for selection; exact .NET interface names are deliberately left to the implementing agent. Keep \`providerId\`, \`sourceId\`, original external \`Id\`, source URL/type/version, snapshot fetch/verification timestamps and optional asset metadata separate. A stable internal outfall identity should include its provider/source association; provider \`OBJECTID\` is only a transient query aid.

Required identity errors (missing/blank \`Id\`, conflicting duplicates, unexplained count/page loss or ambiguous identity mapping) invalidate a **candidate refresh as a whole**. Optional null name/coordinates/receiving watercourse/permit must be represented as unknown rather than fabricated; report aggregate metadata completeness but do not reject valid identities solely for optional gaps. Validate and bound coordinates when present. Do not silently discard malformed identity rows to publish a plausible-but-incomplete catalogue.

When the upstream source changes, explicitly verify that it is an official equivalent public source, check identity continuity, preserve evidence of old and new source attribution, and **review the change before activation**. Do not auto-match a changed external ID using coordinates, names or GIS proximity. Keep old identity/selection unresolved until a reviewed mapping/configuration change; a verified reappearance of the *same* ID resolves normally. A source replacement does not justify automatically starting new asset polling.

## Initial version-controlled configuration (illustrative)

The examples are **placeholders**; they are not known Severn Trent IDs. Native JSON is reasonable because RDP already ships a validated \`measurements.json\` registry, but YAML or another clear version-controlled format is acceptable. Prefer one source of truth for named sets with explicit per-environment enablement, not competing \`enabled\` flags on both sets and environments.

\`\`\`yaml
schemaVersion: 1
providers:
  severn-trent:
    sourceId: storm-overflow-edm
    catalogueRefreshHours: 24
collectionSets:
  hpp-reviewed:
    provider: severn-trent
    assetIds: [EXAMPLE_OUTFALL_001, EXAMPLE_OUTFALL_002]
    provenance: reviewed-legacy-id-import
  stage-smoke:
    provider: severn-trent
    assetIds: [EXAMPLE_OUTFALL_001]
environments:
  staging:
    enabledSets: [stage-smoke]
  production:
    enabledSets: [hpp-reviewed]
polling:
  plannedIntervalMinutes: 15
\`\`\`

The catalogue refresh and polling intervals are **initial planning defaults**, subject to live source evidence; \`polling.plannedIntervalMinutes\` describes the intended #72 consumer cadence, **not** an enabled EventBridge schedule. Independent runtime and deployment gates control whether a job executes. Stage uses on-demand catalogue checks and a tiny explicit later status-poll test selection; no continuously running stage schedule.

Validate schema version; known provider/source/set/environment; unique named sets; nonempty syntactically valid explicit IDs (use provider-aware validation rather than forced EA-style lowercase IDs); no duplicate within a set; and finite supported intervals/bounded work. Duplicates **across** sets are permitted. An intentionally empty environment selection is valid and results in no poll. An absent but syntactically valid upstream ID is a **runtime resolution warning**, never silently removed or an invalid-config deployment blocker. Any reviewed imported IDs carry source/approval attribution, not claimed hydrological upstream proof. No admin UI or location-based set expansion.

## Pure deterministic selection plan

Given a validated configuration version, environment and **last verified catalogue**, union enabled named sets by (provider, external ID), preserving contributing set names. Output stable, sorted resolved and unresolved entries; last verified catalogue version; stale/last-attempt diagnostics; config version and a reproducible digest/diff (added, removed, unchanged and unresolved). Distinguish configured selections from those currently eligible for provider requests. One eligible asset should produce at most one planned request per polling cycle; request batching/execution is owned by #72.

With no verified catalogue, **fail closed** for enabled selections, never reinterpret a missing catalogue as an empty authoritative catalogue. With a last-good catalogue and failed refresh, plan from the last-good version **with explicit stale/failure diagnostics**. Reappearing exact IDs resolve on the next successful refresh. A new outfall discovered outside all enabled sets remains unselected. The pure planner and dry-run have **no provider write, S3 write, spill-event fetch or data persistence** in PR 1.

## Catalogue snapshot lifecycle, incremental refresh and failure isolation

**Accepted implementation choice:** small versioned private **S3 Standard** snapshots, **no DynamoDB catalogue initially**. Use stage/prod-isolated prefixes or buckets and narrowly scoped IAM. Reuse the principles of immutable/versioned archive content, checksums and verified promotion, but **not** the gauge observation archive types, manifest schema, retention policy or 365-day TTL.

A refresh is a complete, bounded provider enumeration. Reconcile the validated candidate against the last verified snapshot to identify additions, removals and metadata changes; only changed catalogue content needs a new content version. This is **incremental comparison of complete snapshots**, not an unverified ArcGIS delta feed. Promote the candidate to the active last-good version only after complete validation and durable snapshot verification; an interrupted promotion must leave a recoverable previous version. Keep safe minimal refresh/run diagnostics separate from the active snapshot so errors cannot overwrite good catalogue content. Avoid an additional database, elaborate catalogue event sourcing or an independent always-on processing service.

A provider-wide incomplete/identity-ambiguous response fails **that provider's** refresh and leaves its prior active snapshot. Optional malformed metadata may be recorded as unknown where identity remains trustworthy. A later multi-provider implementation should isolate providers; one failed provider must not invalidate another's healthy catalogue. Per-selected-outfall status request failures and event durability are **#72**, not catalogue-refresh success metrics.

Provide the useful health distinctions: latest attempt outcome/error category and time, last verified snapshot/version/age, snapshot stale/healthy status, configured/selected/resolved/unresolved counts and safe ID-specific resolution diagnostics. Do not log raw provider bodies, untrusted exception text or secrets. A successful HTTP request by itself is not proof of a complete catalogue.

## Jobs, stage/prod gates and cost

- **PR 1:** local/CI fixture discovery, explicit selected plan, optional authorised bounded public-read probe; no S3 writes, AWS template/IAM changes, scheduled collector, spill-event polling or provider mutations.
- **PR 2:** add stage/prod-isolated S3 last-good catalogue and refresh diagnostics, with offline fake-S3 validation of interrupted writes and stale fallback. No Dynamo catalogue, event schema or automatic schedule.
- **PR 3:** expose a separately gated catalogue refresh operation/job (initial production target daily, subject to source evidence), activation and health independently of the existing EA \`CollectorFunction\`; hand selection plans to #72 without implementing #72 ingestion. No automatic trigger from discovery to polling and no new SQS pipeline unless justified.

The current RDP staging AWS account/region, isolated resources, IAM boundaries and reviewed prepare/apply flow remain authoritative; a documentation PR and its merge grant **no AWS access or deployment approval**. Production and staging must never share writable catalogue objects/roles. Do not expand existing gauge collector permissions or enable its schedule to support CSO work. If deploying later, independently approve IAM/prefix changes and keep the stage schedule off after a finite smoke. #72 may add its own independently gated 15-minute selected status poller **later**.

Cost expectation: a small full-catalogue JSON/manifest history in S3 Standard, sparse reads/writes, bounded Lambda executions and existing 30-day log retention, rather than a staging Dynamo table, 15-minute background jobs, NAT/VPC or replicated event history. Track catalogue version count/object bytes, request count and invocation/diagnostic volume; retain verified snapshots rather than using test cleanup to weaken canonical data protections. Existing stage budget/monitoring are cost *alerts*, not hard caps. Do not state a fixed cost or refresh SLA until source size/request volume are measured.

## Review/acceptance and scope guard

[Tasks](tasks.md) owns fixture scenarios and PR-specific acceptance. #72 owns status-code-to-event interpretation, polling per-asset failure isolation, S3 evidence/CSO event retention (24 calendar months of completed hot events) and IAM read API. #68 owns eventual legacy retirement. Leave existing Node/SQS/Mongo/S3 publication, alerts, web contracts and Python predictor unchanged. All current changes are **documentation only; no implementation, live AWS writes or deployment**.
