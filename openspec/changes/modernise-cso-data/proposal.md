# Proposal: Modernise CSO ingestion, spill events and tiered history

## Why

The current Node scraper fetches Severn Trent ArcGIS CSO point-in-time records at roughly 15-minute intervals, appends repeated Mongo `csoData` documents, and archives older snapshots in S3. Those snapshots are not reliable event identities, and provider outages must not be interpreted as definite event endings. The new river data platform needs first-class **outfall state** and **spill event** domains.

This is the CSO domain module of a **unified backend** for multiple rivers, provider observations, CSOs, model-independent forecasts and site assessments. It does **not** force all data into a single table or move independent Python prediction execution into .NET. The agreed `river-data-platform` repository is the shared implementation target after foundation #64; the older `river-observations` proposal is superseded.

## Agreed decisions (8 October 2026)

1. Implement **Severn Trent first**, with a provider adapter seam; operational polling uses **explicit version-controlled selected outfalls** from the separate [#71](https://github.com/tclare95/isHPPOpen/issues/71) catalogue/selection change. Sewage Map is not a runtime dependency.
2. Preserve provider-reported snapshot status, source update timestamps and raw evidence separately from **current effective status**, monitoring freshness and **spill event** history.
3. Prefer valid provider-reported start and end timestamps over an inferred polling instant; capture a start/end reported entirely between polls. **Offline, stale, unknown and failed polls never imply a spill ended**.
4. Assign stable internal event IDs. Event times can be corrected without changing identity; immutable revisions and source provenance are preserved. Do not silently merge ambiguous matches or use event start timestamp alone as an immutable ID.
5. **Tiered event retention:** approximately two years of completed events queryable in DynamoDB, older events via private S3 direct GetObject and verified manifests. Open/unresolved events never expire. The cutoff is defined as **24 UTC calendar months after endedAt**, conditional on successful archive verification. Source-evidence/revision records must not be auto-deleted until a separately approved retention policy exists.
6. Extend the existing *internal* first-party IAM/SigV4 read API with CSO-specific read routes. Keep public Next.js APIs, HPP/CSO site assessments, email alerts, Mongo/S3 and existing Node Lambdas unchanged until separately approved cutovers.

## New capabilities

- `cso-state-and-events`: replay-safe CSO polling evidence, reported/current states, lifecycle, corrections and per-asset health.
- `cso-history-and-read-api`: verified archival, safe 24-month hot expiry, unified event retrieval across DynamoDB and S3, first-party IAM-protected CSO read endpoints.

## Ownership and dependencies

Implementation: new shared .NET river backend (planned `tclare95/river-data-platform`); canonical OpenSpec planning: `tclare95/isHPPOpen`. Tracking [#72](https://github.com/tclare95/isHPPOpen/issues/72). Depends on configured selection [#71](https://github.com/tclare95/isHPPOpen/issues/71), accepted read security [#69](https://github.com/tclare95/isHPPOpen/issues/69), and verified-archive patterns [#65](https://github.com/tclare95/isHPPOpen/issues/65). Existing gauge-only ADR-001 does **not** itself decide CSO retention; the CSO-specific policy is recorded here.

## Deliberate non-goals

No historic Severn Trent EDM import/old Mongo or Glacier restore; no 2024/2025 historical reconciliation; no geographic impact derivation or downstream water-quality risk algorithm; no public/third-party API, new web client, alert sending, HPP threshold logic, predictor migration, edit/admin UI, full national collection, or stopping/reconfiguring the legacy scraper. No production deployments/data migration authorised by documentation.

## Delivery boundary

One backend implementation may supply the new event store, collector and CSO read routes in staging, with tests for archive-first durability, source corrections, outages, read consistency and stage IAM. Source history migration and website/alert cutover are separately reviewed later.

## Small, on-demand integration stage

CSO integration tests reuse the lightweight stage of [#75](https://github.com/tclare95/isHPPOpen/issues/75) rather than mirroring production spill history. A few configured outfalls can be polled manually; event reconciliation, late correction and the **24 UTC calendar-month** hot/archive cutover are exercised using synthetic historical events and an injected clock in separate stage stores. Source evidence/revisions and archive-integrity semantics remain identical to the production contract. The permissioned cleanup of disposable stage test records is **not** a new automatic CSO event TTL or a deletion policy for canonical S3 history. No live staging poll cadence, historical data replication or production writes are prerequisites.
