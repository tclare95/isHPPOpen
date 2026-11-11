# Design notes (non-normative)

Use the already deployed isHPPOpen server-only `libs/rdp` client pattern; define a **small** CSO mapping/read adapter rather than a new data platform. Route existing HPP `/api/waterquality` and per-CSO readers through the adapter **only if independently approved**. Prior to that, optional shadow/diagnostics should be non-authoritative and read-only.

RDP's existing endpoints: `GET /v1/cso/outfalls` (catalogue/selection/provenance), `GET /v1/cso/outfalls/status?ids=` (up to 20 canonical IDs; reported/effective state, provider timestamp, reasons), `GET /v1/cso/outfalls/{id}/events?from=&to=&limit=&cursor=` (max 366 days per request, pages, coverage), `GET /v1/cso/events/{eventId}`, `/revisions`, `GET /v1/cso/outfalls/{id}/health`. The caller must be the signed, production role authorised for these routes; verify actual deployed availability. Avoid a public generic CSO proxy and accidental per-marker N+1 request storms.

Compare RDP event status and corrected latest events against Mongo snapshots at common timestamps. A current status and a historical event are separate assertions. RDP freshness uses source time (Severn Trent's 30-min policy remains provisional); old web freshness uses Mongo collection timestamp. Do not collapse discrepancies into `false`.

For #121 optional views, prefer event chronology and interval coverage alongside the existing density chart/map, not an equivalent density claim. Official EA historical import is currently only built and dry-run planned; its proposed mappings require an operator decision. A 2025 file activation is not a 12/24-counted spill and a historical released event is not evidence of live monitoring coverage.

For #114 legacy density parity, inventory the exact 48-hour activity-filtered IDs and D8 selected raster cell: impact counts distinct **occupied source cells**, not monitors; denominator is upstream accumulated raster area. Prove time-aligned, missingness-aware historical parity before reusing old thresholds. A versioned new metric may be useful, but requires separate risk/history/alerts acceptance.

Avoid implementing provider polling, new RDP CSO writer, alarm sender or second risk history in isHPPOpen. Keep any legacy-to-RDP transition observable, independently reversible and without replaying alert transitions.

See [review matrix](../../../docs/WATER_QUALITY_CSO_RDP_PM_REVIEW.md) for evidence and individual ownership.