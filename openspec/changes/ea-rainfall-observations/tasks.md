# Acceptance slices: EA observed rainfall (#54)

## Slice 1: bounded foundation (no collection activation)
- [x] Inventory the six predictor Hydrology measure notations and distinguish station-name/GUID inference from verified metadata.
- [x] Document EA Hydrology 15-minute total semantics, quality fields, Flood Monitoring source differences and remaining live source/timestamp/lag uncertainties.
- [ ] Land an independent, fixture-tested rainfall model and source adapter: exact supported identities, UTC source time labels + 900-second period, mm totals, nullable missing readings, quality/completeness/qcode, source and first-fetch evidence, bounds/ambiguity rejection.
- [ ] Verify regression safety: no edits to current measurement registry, collection DI, Lambda, persistence/read API, template, IAM or forecast code; full repository .NET and Python guard suites green before merge.

## Slice 2: provider verification and period-aware storage/read design (separate approval)
- [ ] Fetch six official station and measure metadata records read-only and reconcile names, IDs, source continuity, exact period timestamp convention, quality and archive coverage.
- [ ] Measure repeated normal/rain/flood publication age and direct-Flood Monitoring candidate parity (only on verified same identity); record absence of usable incident-fresh rainfall where appropriate.
- [ ] Define archive/read revision and as-known-at requirements without claiming `requestAsOf` is historical. Show unknown gaps and incomplete windows in read fixtures, with backward-compatible level/flow handling.

## Slice 3: controlled source activation and #53 consumer shadow (separate approval)
- [ ] Register approved rainfall identities with API-managed or explicitly reviewed per-stage configuration; default uncollected/unpublished.
- [ ] Permit bounded staging tests only after independent approval. Agree selection/budget/monitoring, retention and correction policy before any production opt-in.
- [ ] Compare feature-eligible rainfall 1/3/6/12/24-hour windows, coverage and source ages to direct EA under #53 with no forecast output, source switch or retraining.

**Not authorised by this OpenSpec:** AWS deployment/writes, production collection, model training/inference changes, source replacement, forecast publisher change or endpoint public exposure.