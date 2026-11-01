# Implementation and acceptance tasks: CSO asset catalogue / selection (#71)

This is a **future implementation checklist**, not work completed by this documentation refinement. All implementation boxes intentionally remain unchecked. The normative product behaviours are in [spec](specs/cso-collection-selection/spec.md); [design](design.md) contains current RDP-specific engineering guidance. Work belongs in `tclare95/river-data-platform` after a reviewed PR, not in the legacy Node scraper.

## PR 1 — Prove discovery and selection; no collection or storage

- [ ] Record a **bounded read-only** Severn Trent ArcGIS source-check plan and run it only when expressly approved. Capture layer/field/domain metadata, `Id` versus `OBJECTID`, count and verified full paging/ID enumeration, source errors, `maxRecordCount`, coded status evidence and remaining unknowns (rate limit, identity lifetime, refresh lag); commit trimmed attributed fixtures, not unbounded payloads.
- [ ] Add a small CSO-specific provider discovery adapter using existing .NET DI, HTTP client, clock and cancellation conventions. Validate complete enumeration and authoritative IDs; tolerate missing optional metadata; treat HTTP-200 embedded ArcGIS errors, incomplete pages and identity conflicts as failures. No generic provider framework.
- [ ] Add a versioned, strictly validated configuration with named provider-specific outfall sets and **explicit environment selection**. Duplicate across sets is permitted; duplicate within a set is rejected. An empty environment selection is allowed. No Sewage Map runtime request, GIS inference or auto-add on discovery.
- [ ] Add a pure deterministic selection planner and local dry-run showing version/digest, selected/resolved/unresolved IDs, set membership and added/removed/unchanged diff. Keep unresolved IDs configured and visible; valid peers remain eligible. No verified catalogue => fail closed.
- [ ] Fixture-test multi-page completeness, duplicates/conflicting identities, missing optional metadata, malformed/HTTP-200 errors, stale last-good fixture input, unexpected source replacement, `OBJECTID` change, changed external ID held unresolved, same external ID reappearing, disabled sets, overlapping sets, intentional empty set and stage/prod divergence.
- [ ] Demonstrate PR 1 makes **no selected status or spill-event requests, no S3/Dynamo writes, no template/IAM/schedule changes, no legacy writes or changes**. Run existing offline RDP build/test/format checks; provide a compact example plan for two overlapping named sets.

**Acceptance:** complete source catalogue can be discovered/tested and explicit stage selection deterministically planned without initiating or persisting any spill event. A live public-source probe (if approved) remains read-only, bounded and independent of AWS.

## PR 2 — Versioned last-verified S3 catalogue, incremental reconciliation

- [ ] Store validated immutable versioned catalogue snapshots in private **stage/prod-isolated S3 Standard**, with verifiable content and last-good activation. **No DynamoDB catalogue** and no reuse of gauge observation archive entity/retention semantics.
- [ ] Compare complete validated snapshots to report added/removed/changed provider assets; changed identifiers never trigger geographic/name-based auto-mapping. Keep unverified candidates from replacing the last-good version.
- [ ] Keep last refresh attempt/failure and stale information visible, including unresolved selections and safe optional-metadata diagnostics, without corrupting last verified catalogue.
- [ ] Fake-S3 and fixture-test interrupted snapshot/promotion, invalid/incomplete refresh, unchanged snapshot, provider failure isolation and subsequent verified recovery. Do not rely on live AWS credentials or production fixtures in CI.
- [ ] Review S3 access paths/retention/versioning and expected modest request/storage costs; add any future IAM changes only behind a separate approved deployment scope.

**Acceptance:** a failed refresh cannot erase verified identities or silently change the effective selection; valid new outfalls appear in the catalogue but are never selected without reviewed configuration.

## PR 3 — Independent gated refresh operation and #72 handoff

- [ ] Add a separately gated catalogue refresh entrypoint/job with bounded provider work and safe structured health; it must not require observation storage, run EA collection or trigger CSO status polling.
- [ ] Make daily refresh an **initial, evidence-dependent** production default; staging remains manual/on-demand and off by default. Maintain independent stage/prod selection, IAM and schedule gates.
- [ ] Expose the deterministic plan and refresh health to the future #72 CSO poller without implementing its event/state persistence or requiring a new SQS queue.
- [ ] Test timeout, retry/429, cancellation, missing verified catalogue, stale fallback and intentionally disabled refresh/poll scheduling. Review release manifest, config hash and IAM boundaries before any separately approved stage integration.

**Acceptance:** refresh and planning are independently operable while the EA observation collector and all existing legacy consumers remain unchanged. No automatic AWS apply or production collection activation.

## Explicitly deferred to separate work

- [ ] [#72](https://github.com/tclare95/isHPPOpen/issues/72): selected per-outfall status queries, provider status/event semantics, source claims, event revisions, S3 evidence and hot/archive storage, health and read API.
- [ ] [#68](https://github.com/tclare95/isHPPOpen/issues/68): migration/shadow checks, HPP/water-quality assessment, public contracts and eventual Node/SQS/Mongo/S3 writer retirement.
- [ ] Actual approved staging provider smoke, any AWS changes, schedule enablement and production deployment. See [#75](https://github.com/tclare95/isHPPOpen/issues/75) and RDP manual release runbooks; this issue/doc PR does **not** authorise them.
