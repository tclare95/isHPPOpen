# Design: Protected historical reconstruction and import

This file records architectural constraints and safe reuse. Observable behaviour belongs in the [capability spec](specs/historical-observation-backfill/spec.md); concrete implementation checks belong in [tasks](tasks.md). Implementation is in RDP, not the Node scraper. Prefer adapting existing RDP components to introducing a new migration subsystem.

## Current implementation and safe reuse (31 October 2026)

- RDP's archive is authoritative: per-measurement monthly S3 Standard JSONL chunks, immutable versions and conditionally committed manifests. Commit/verify rejects corruption and concurrent manifest changes. The existing `InsertVacantAsync` path from merged [RDP #81-B2](https://github.com/tclare95/river-data-platform/pull/25) can be reused for *archive identity protection*, subject to historical-provenance validation.
- `VerifyCoverageAsync` and verified archive receipts establish the prerequisite for any eligible Dynamo hot write. The existing conditional hot-insert pattern is useful, **but its current recovery implementation also updates `LATEST`**. Historical import must not invoke that side effect; reuse or narrowly separate the insert-only behaviour without latest, cursor or health mutation.
- The read API already supports registered measurements, direct archive + hot history, verified versions, rollover and separately reviewed `coverage.json` intervals. The inventory is currently empty; a finished backfill must not imply `complete` coverage.
- Ordinary live collector writes may create later source corrections using fetch evidence. **Historical import is not a correction path** and cannot use an invented fetch time to participate in that ordering.
- #81-B2 operator recovery is expressly for a *selected measure behind its durable cursor*: provider re-fetches in bounded outage windows, repair checkpoints, gap acknowledgement and CAS cursor resumption. Historical import must not call the recovery plan/repair/resume workflow, write its `REPAIR`/`GAP`/`RESUME` records or inherit its seven-day/48-hour cursor bounds. Share only safe archive/verification/conditional-persistence mechanisms and common conventions.

RDP implementation references: [archive](https://github.com/tclare95/river-data-platform/blob/main/src/RiverDataPlatform.Infrastructure/S3ObservationArchive.cs), [recovery ledger](https://github.com/tclare95/river-data-platform/blob/main/src/RiverDataPlatform.Infrastructure/DynamoObservationStore.Recovery.cs), [registry](https://github.com/tclare95/river-data-platform/blob/main/src/RiverDataPlatform.Infrastructure/measurements.json), [read API](https://github.com/tclare95/river-data-platform/blob/main/docs/READ-API.md), [recovery contract](https://github.com/tclare95/river-data-platform/blob/main/docs/RECOVERY.md).

## Slice A: read-only source evidence and normalisation

### Sources and scope

Begin with Colwick `ea-colwick-level`; inventory official historical availability for the other five published EA series, but do not make those import-eligible without later approval. Inspect:

1. Read-only, bounded/paginated legacy Mongo `ishppopen.riverschemas`, retaining document ID, `model_date`, `level_source` and each `level_readings[]` row.
2. Read-only legacy S3 `levels/latest.json` and `levels/year=YYYY/month=MM/levels-*.json`, including readily accessible versioned objects that materially recover gaps. Retain bucket/key/version, snapshot time, payload hash and per-row observed time.
3. Supported official EA exact-measure history where accessible. Investigate recent measure readings, [flood-monitoring daily historical CSVs](https://environment.data.gov.uk/flood-monitoring/archive) and [Hydrology historical data](https://environment.data.gov.uk/hydrology/doc/reference). Do not assume historical dates or data are accessible merely because an endpoint is documented; record actual access, measures, date windows and limitations. Hydrology series/quality flags and newer station IDs must be mapped explicitly; `sameAs` at station level is not proof of measurement/datum equivalence.

Stop after reasonably accessible original sources and supported EA contracts have been evaluated; document skipped archives, inaccessible intervals, meaningful S3-version checks and any optional follow-up. No indefinite Glacier restore, mass scraping or automatic request for offline EA data. Credentials and raw private source payloads must not be put into issues or public PRs.

### Colwick 2102 / 4009

The EA [Colwick station record](https://environment.data.gov.uk/flood-monitoring/id/stations/4009.html) explicitly lists telemetry station reference `4009`, RLOI identifier `2102` and measured series `4009-level-stage-i-15_min-mASD`. This establishes the *station alias*, not the provenance or datum of every fallback row.

The legacy scraper uses 4009 for its primary EA reading request and 2102 for a government-page forecast/observed-telemetry fallback. Its abbreviated polls merge fresh readings with older cached S3 data, then write both as one snapshot; `level_source=flood-api` and `model_date` describe the wrapper, not each row's originating request. Legacy government-page rows are numeric-normalised by the scraper, so source precision cannot be reconstructed beyond what is actually retained. Exclude forecast samples from observed-history import.

Evidence sufficient to admit fallback rows must establish that the particular observed level series corresponds to the registered instantaneous stage measurement with compatible `mASD`/ASD semantics. Do not assume an unspecified metre value is in mASD or apply an unverified datum offset. Quarantine ambiguous rows with a reason.

### Candidate identity, provenance and precedence

Canonical key is *registered measurement ID + exact source-observed UTC instant*. Normalise a finite decimal and compatible parameter, unit and datum without inventing timestamps, zeroes, a 15-minute grid or precision. Keep native textual numeric evidence wherever present. Group by canonical key; equivalent values with compatible metadata are duplicates even if reported by different wrappers. Preserve compact evidence references/counts.

For otherwise vacant keys, apply this deterministic confidence order:

1. Official EA historical reading for the *exact registered measure*, with the measure reference in the original evidence.
2. Official alternative history whose series, parameter, unit, datum and semantics are independently proven equivalent.
3. Individually demonstrable legacy direct-source reading for that same measurement.
4. Verified equivalent government-page observed telemetry with individual source evidence.
5. **Verified-identity cached-only Mongo/S3 observations** lacking individual direct-fetch evidence, used only where stronger admissible evidence is absent.

Source medium, document creation time, snapshot label, the import execution time and the number of copied snapshots do **not** increase candidate priority. Where eligible candidates at the best available priority materially disagree with no authoritative revision evidence, quarantine rather than choose by arbitrary order. Lower-priority disagreements and all source conflicts are still included in the report. Where source evidence cannot establish the measurement identity or numeric compatibility, quarantine irrespective of precedence.

An existing RDP canonical reading always wins over any historical candidate. The dry-run report compares it but does not claim that a stronger external source permits replacement. Equivalent RDP content is already-canonical; differences are preserved-canonical conflicts. Any correction is separate reviewed work.

## Slice B: historical-import boundary

### Provenance and canonical protection

Provide a narrow, auditable historical-import evidence representation. Distinguish original observed time, known/unknown original fetch evidence, snapshot/source locator, import time and stable approved batch identity. Do not forge EA reference URLs, fabricate `FetchedAt`, set source update evidence from an import clock, or disable ordinary EA validation globally. Add an explicit typed validation path that keeps existing source and archive contracts intact; aim for minimal compatible read API changes and internally queryable audit detail.

Reuse the conditional S3 manifest insertion semantics (existing canonical identity = no value, revision or evidence update), not the ordinary collector correction path. The condition must hold at commit time, independently of the dry-run's RDP snapshot. A collector winning the race results in preserved occupancy/conflict; a historical row committed first remains subject to the normal **later collector** correction semantics, which this importer must not change.

If a hot row exists without committed archive coverage, classify it as inconsistent and hold the affected identity; import must not infer that an empty archive alone makes it safe to write over hot data. Do not equate archive corruption or missing expected objects with absent historical source data.

### Archive-first hot boundary and restart

Commit candidate vacancies under canonical monthly manifests, independently verify committed content and only then conditionally insert eligible hot rows. Do not invoke the recovery hot-insert method unchanged if it updates `LATEST`. RDP's 365-day rule is based on observed time at execution: older/equal-to-cutoff rows remain S3-only; newer rows may be represented in Dynamo with normal expiry eligibility. No import operation updates `LATEST`, `CURSOR` or `HEALTH` or changes the active source selection.

Execution is on-demand after reviewing a deterministic plan bound to source evidence hashes, measurement/range, target environment and intended maximum impact. Work should be bounded by existing archive constraints and checkpointed at sensible partition/batch boundaries. A checkpoint represents *verified* completed work; after an S3 commit but before acknowledgement, restart re-reads/validates the committed archive and safely finishes required hot work. The same approved inputs must replay idempotently; source-plan changes fail approval rather than quietly change candidate selection. Live collection occupancy changing after review is an expected conditional skip, separately reconciled in the outcome report.

Avoid a fictitious cross-S3/Dynamo transaction and do not try to roll back history by deleting canonical objects. Capture accepted, already present, conflicting, invalid, quarantined, inconsistent and unprocessed outcomes with source evidence, canonical archive checksums and resumable progress. Persist audit/checkpoint metadata separately from #81-B2 outage-recovery state.

### Existing limits and review gates

Follow current RDP archive bounds: no more than **1,024 rows per write/verify batch**, **4,096 canonical rows per measurement/month**, **16 committed segments** before compaction, **4 MiB stored / 16 MiB expanded per object**, **64 MiB aggregate read/verify budget** and **five conditional manifest commit attempts**. Exhaustion or oversize must fail explicitly, not discard observations. Preserve read API bounds (366-day request windows, max 5,000 API observations, 30-minute continuations) and the reviewed coverage inventory ceiling (128 entries). Source-inventory rate/page/time/cost budgets and execution windows should be deliberately bounded and recorded, but their exact implementation values may be selected by the coding agent from measured source behaviour. Do not impose outage-recovery's seven-day window on years of historical data.

## Coverage handoff

Produce proposed per-measurement evidence-backed intervals with `complete` only where source coverage has actually been demonstrated, or `not_collected`, `legacy_unrecoverable` and `source_outage` where supported. Leave unevidenced intervals `unknown`; absence of a quarter-hourly row, archive min/max/count or successful import is insufficient to infer completeness. Keep missing/unrecoverable *source* intervals distinct from malformed, missing or checksum-invalid *committed archive* objects (integrity errors). Reconcile and consolidate intervals as appropriate to the 128-entry review bound.

**Do not update `coverage.json` in an import run.** Produce a separate reviewed PR supported by dry-run/commit reports; preserving the existing public API envelope is preferred.

## Verification and release boundary

Slice A uses offline fixtures and mocks by default and can be merged without write capability. Reading real private Mongo/S3 requires separately approved read-only credentials/scope and must never occur implicitly on merge. Slice B is separately reviewed code with offline race, replay and integrity tests; optional tiny staging fixture is a separately approved action, not a multi-year staging copy.

Production execution requires a separate operator approval identifying target account/region/stage, Colwick measurement and windows, source snapshot identities, approved plan/digest, operator role and explicit read/write budget. No scheduled import, bootstrap/CloudFormation change, live EA provider run, production data write, gap acknowledgement, cursor resumption, alert notification, consumer cutover or legacy data deletion is authorised by this documentation PR.

