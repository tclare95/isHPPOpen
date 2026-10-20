# Proposal: Reconstruct and backfill historical gauge observations (#50)

## Why
The legacy `ishppopenScraper` wrote overlapping Colwick `riverschemas.level_readings[]` documents and timestamped `levels/year=.../month=.../` S3 JSON snapshots, not a canonical per-reading history. New RDP collection/archive code (#49/#65, merged in RDP PRs #2/#3) does not recover that older source evidence. #69 needs honest coverage metadata; #51 needs verified recent windows before switching readers.

## Accepted decisions (20 October 2026)
- Recover **all reasonably available** historical gauge observations with a pragmatic effort limit; do not insist on perfect uninterrupted history.
- Read-only inventory of legacy Mongo and S3 snapshots plus bounded, supported official EA historical data where accessible. Include easily accessible S3 versions only when they materially recover gaps; no indefinite manual archaeology/Glacier restore requirement.
- Normalise to canonical `measurementId + observedAt UTC`. The snapshot `model_date` is evidence of snapshot creation, **not** the observed reading time or a new source revision.
- The original scraper may merge cached readings into a nominal `flood-api` snapshot; `level_source` alone does not prove individual reading provenance. The government gauge-page fallback uses station 2102 while Colwick ingestion uses EA station 4009: verify actual measurement, unit/datum and equivalence before accepting any such record.
- Automatic backfill is **insert-only for vacant canonical measurement/timestamp identities**. Existing committed RDP observations MUST never be overwritten automatically, even where a historical EA candidate appears stronger. Conflicts require separately reviewed explicit correction authorisation.
- Preserve candidate provenance and conflict evidence; never interpolate, invent zeroes or claim one reading every 15 minutes.
- Reuse RDP archive-first integrity and its 365-day Dynamo hot / indefinite S3 Standard history. No production writes, deletions or AWS operations are authorised by this proposal.

## Capabilities
### New
- `historical-observation-backfill`: inspect, reconstruct, dry-run, import and reconcile source observations with protected canonical state and explicit coverage.

## Dependencies and ownership
Canonical planning: `tclare95/isHPPOpen`; future executable implementation: `tclare95/river-data-platform`. Depends on [#49](https://github.com/tclare95/isHPPOpen/issues/49) / [#65](https://github.com/tclare95/isHPPOpen/issues/65) storage contracts; coordinates coverage with [#69](https://github.com/tclare95/isHPPOpen/issues/69) and measurement identities with [#52](https://github.com/tclare95/isHPPOpen/issues/52). A complete multi-year backfill is **not** a hard prerequisite to [#51](https://github.com/tclare95/isHPPOpen/issues/51) if its current display windows already have verified history.

## Out of scope
No new canonical archive, general source-provider framework, Node scraper changes, HPP transitions, CSO/forecast/water-quality migration, arbitrary rewrite of existing corrections, storage re-evaluation or staging history replica.

## Release and rollback
Documentation only. Implementation should be split into (A) source inventory/normalisation/dry-run and (B) protected importer/reconciliation. A later production run requires **separate explicit scope, role, source-access and write approval** after reviewing a dry-run plan; merge/deploy does not trigger it. The legacy stores remain intact. Stop/resume of an import must be safe; any correction to existing RDP data uses a distinct reviewed workflow rather than rollback by deletion.
