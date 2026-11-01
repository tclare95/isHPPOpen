# Proposal: CSO asset catalogue and explicit collection selection

## Why

The existing Node scraper obtains selected Severn Trent CSO status records, partly through IDs inherited from Sewage Map. The now-established [river-data-platform](https://github.com/tclare95/river-data-platform) .NET solution needs its own reusable provider catalogue and **explicit selection plan**, independent of isHPPOpen, the Node scraper, and assumptions about hydrological upstream impact.

A catalogue describes **what exists**; configured collection sets describe **what we choose to monitor**. Catalogue discovery must never automatically expand collection. Severn Trent is the first source; later providers can supply their own adapters without changing selection semantics.

## Accepted product decisions (8 October and 1 November 2026)

- Discover the **complete provider asset catalogue** independently of selection, status polling, publication and site assessment.
- Select only explicit provider outfall IDs from **version-controlled, named collection sets**, enabled per environment. The union is deduplicated, retaining traceable set membership. Newly discovered assets are not automatically polled.
- Keep unresolved configured IDs in place with diagnostic health; valid peers remain selectable. An unchanged ID can become resolvable again on a later verified catalogue refresh.
- A partial/invalid catalogue refresh cannot displace the last verified catalogue. **Ambiguous or incomplete authoritative identity information rejects the refresh; missing optional metadata is allowed** with appropriate unknown values and diagnostics.
- **Never silently remap an upstream asset ID** using location/name similarity. A changed provider ID remains unresolved until a reviewed identity mapping is accepted.
- Permit a **verified equivalent official public source** if Severn Trent changes/replaces the endpoint, with explicit review of identity continuity and preserved provenance; no automatic source switching.
- Sewage Map can supply a one-time **attributed, reviewed** initial ID list, but is not a runtime dependency. Neither proximity nor that imported list establishes upstream impact; no GIS inference or selection by polygon in v1.
- A disabled selection stops its unique assets from future polling without deleting historical records.

## Capabilities and ownership

- **CSO catalogue:** enumerate provider assets, preserve provider identity and provenance, expose verified catalogue version/freshness and safe diagnostics.
- **CSO selection:** validate reviewed named sets, resolve their environment-specific union into a deterministic plan and offer a dry-run change report.
- **Later, not this change:** [#72](https://github.com/tclare95/isHPPOpen/issues/72) implements selected status polling, source evidence, events, revisioned history and read APIs. Site-level assessment, alerts and public-web migration are separate.

Implementation belongs inside the existing modular [river-data-platform](https://github.com/tclare95/river-data-platform) solution; no new scaffold, Node integration or generic all-domain catalogue framework. Share established platform conventions without sharing gauge-specific observation records, cursors or retention.

## Implementation direction (non-normative)

The [design](design.md) records the accepted **small versioned private S3 snapshots, no initial DynamoDB catalogue**, stage/prod isolation, incremental comparison of complete snapshots, and bounded read-only provider discovery. These are engineering decisions, **not requirements for the consumer-facing product specification** in [cso-collection-selection](specs/cso-collection-selection/spec.md).

A daily catalogue refresh and eventual 15-minute selected status polling are **starting production planning assumptions**, not verified Severn Trent source guarantees or obligations to run continuous staging schedules. Verify the live public ArcGIS layer before pinning paging, status-code or rate-limit details.

## Small implementation slices (future PRs, not authorised by this document)

1. **PR 1:** source schema evidence, bounded catalogue adapter, version-controlled selection config, deterministic local dry-run and fixture tests. **No event polling, S3 writes or AWS deployment.**
2. **PR 2:** isolated versioned S3 catalogue snapshots, last-good activation, incremental diff and failure/staleness health. No CSO event ingestion.
3. **PR 3:** independent gated catalogue-refresh job and operational plan/health handoff for #72. No automatic activation of status polling.

Detailed tests and review gates are in [tasks](tasks.md).

## Non-goals and release boundary

No spill-event persistence, historical EDM import, public API changes, forecast publishing, upstream GIS engine, runtime Sewage Map dependency, event/alert migration, or legacy scraper retirement. Existing Node/Mongo/SQS/S3/web/public contracts remain authoritative until separate approved migrations ([#68](https://github.com/tclare95/isHPPOpen/issues/68)).

This refinement is **documentation only**. It performs no provider-data or AWS writes. Implementations, live provider probes, staging smoke, production IAM/deployment and schedule activation require their own scope and approvals. Reuse the low-footprint mostly idle staging policy of [#75](https://github.com/tclare95/isHPPOpen/issues/75), with only a few explicitly selected stage outfalls and no full history mirror.
