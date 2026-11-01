# Proposal: Reconstruct and protect historical gauge observations (#50)

## Why

Legacy Colwick history is scattered across overlapping Mongo `riverschemas.level_readings[]` documents and timestamped `levels/year=.../month=.../` S3 snapshots. Neither is a per-observation canonical archive. RDP now has production-oriented archive-first storage, an authenticated historical reader (#69) and an operator outage-recovery path (#81-B2), but it does not reconstruct that legacy history. Historical coverage must be represented honestly before consumers rely on it.

## Product decisions (20 and 31 October 2026)

- Recover **all reasonably available** readings, with explicit source/access limits and pragmatic stopping criteria. Do not invent samples to produce a continuous 15-minute series.
- **Colwick first** for any approved import. Inventory available official history for the other five registered EA series; importing them requires a later explicit scope approval, not automatic expansion.
- Inventory legacy Mongo and timestamped S3 snapshots read-only, plus supported official EA history where accessible. S3 versions may be examined when readily available and useful for gaps; exhaustive archaeology and offline restores are not prerequisites.
- **Allow cached-only legacy observations as lower-confidence gap-fill** when their *measurement* identity, parameter, unit and datum can be verified. Record uncertainty about the individual reading's original source.
- EA publishes Colwick station `4009` with RLOI identifier `2102`; this resolves the station alias, **not** the provenance, measurement semantics or datum of each government-page fallback observation. Do not infer that a `model_date` or `level_source=flood-api` snapshot label proves individual direct EA fetching.
- Deduplicate by the registered `measurementId + observedAt UTC`, retaining native values and source evidence. Use deterministic source precedence; quarantine material unresolved conflicts and identity ambiguities.
- **Automatic import may only fill an unoccupied canonical identity.** Existing committed RDP observations and their evidence must never be revised, refreshed, replaced or deleted by this importer, even if live collection wins a concurrent race. Corrections are separate, explicitly authorised work.
- Preserve truthful, internally auditable historical-import provenance without widening the public read API unnecessarily. Import time is not original source fetch time.
- Preserve the existing permanent S3 archive and rolling 365-day Dynamo hot boundary. Older data may be archive-only; importing must not change live collection cursor, health or latest semantics.
- Produce **coverage and gap evidence for a separate reviewed `coverage.json` PR**. A completed import does not prove continuous source coverage or automatically mark intervals `complete`. Unknown/unrecoverable history differs from corrupt or missing committed archive.

## Scope and implementation ownership

Capability: `historical-observation-backfill` — inspect accessible history, normalise and review candidates, conditionally import approved vacant readings, and report provenance, conflicts and coverage.

- **Slice A:** bounded source inventory, measurement reconciliation, normalisation and deterministic **dry-run only**; no RDP canonical writes.
- **Slice B:** reviewed, on-demand, archive-verified insert-if-absent import with restart/reconciliation, optional hot insertion for eligible readings and an auditable outcome report.

The OpenSpec is owned in `tclare95/isHPPOpen`; future implementation belongs in `tclare95/river-data-platform`. Reuse RDP's existing conditional archive primitives where safe, but **keep historical importing separate from #81-B2 outage recovery** and its collector cursor/acknowledgement workflow. See `design.md` for technical boundaries and `tasks.md` for implementation tasks and exact acceptance tests.

Coordinate canonical identities with #52, archive/read contracts with #65/#69, production approval with #75/#81, and consumer verification with #51. Full multi-year import is not a prerequisite for #51 once the required recent display window is independently verified.

## Exclusions and approvals

No new storage tier, general source framework, scrape/deploy changes to the legacy Node system, correction of existing RDP canonical readings, CSO/forecast/HPP migration, automatic coverage publication, staging history replica, reader cutover or legacy deletion.

**This change is documentation only.** Code merges and future deployments must never trigger migration. Source inventory requiring private production reads needs its own approved read-only access; executing an import needs separately approved target, measurement, time range, evidence/plan, role and write scope. No production data access, import, deployment, AWS configuration change or notification is authorised by this proposal.

