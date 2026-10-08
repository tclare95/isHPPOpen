# Design: Configurable measurement ingestion

## Current state and reuse

- `ishppopenScraper` (Node.js 22 / SAM in eu-west-1) fetches Colwick using `FLOOD_STATION_ID`, saves repeated `riverschemas` documents and S3 `levels/latest.json`; it also collects CSO, water-quality and HPP domain events. These paths must remain live during this work.
- The web's `libs/trentWeirsConfig.js` already lists Colwick, Clifton Bridge, Shardlow level and flow, Church Wilne and Kegworth; `trentWeirsService.js` fetches EA data when requested. This display-oriented config is not currently an authoritative ingestion registry.
- `riverscraper` (.NET + DynamoDB) contains per-station incremental fetching and retention, but its `StationId+Timestamp` key would collide for multiple measures. `reservoir-levels` supplies adapter/registry and per-source failure-isolation precedents, not a directly reusable gauge schema.

## Decisions

1. **One collector-owned, version-controlled config.** Add a compact reviewed data file (JSON/YAML as suitable for the scraper) listing source identifier, station identifier, unique external measure identifier, parameter, unit, expected update interval, enabled state and optional human label. Validate it in CI/startup; do not require an admin interface or duplicate it as a second authoritative list in the web repo.
2. **Explicit identities.** Stable keys are provider/source + external measurement identity, with station as a related entity. Observation uniqueness is measurement key + observed UTC timestamp (plus necessary correction/version policy). Never use station+timestamp alone. Preserve source-reported datum/quality and distinguish `observedAt` and `ingestedAt`.
3. **Boundary between adapters and orchestration.** An EA adapter fetches/normalises one requested measurement; an ingestion coordinator handles enabled registry entries, retries, incremental watermark, bounded overlap/backfill, health, dedup and persistence through an interface. Implement a typed/validated normalised payload and fixture-driven tests rather than generalising with arbitrary user-defined URLs.
4. **Storage choice is deferred.** Interface/schema design and fixture tests can proceed, but production persistence backend is gated on the documented decision in `evaluate-data-storage`. A chosen store's implementation belongs in this feature; historical backfill and consumer migration belong to [#50](https://github.com/tclare95/isHPPOpen/issues/50) and [#51](https://github.com/tclare95/isHPPOpen/issues/51).
5. **Safe rollout.** Implement the new collector alongside existing scheduled work with shadow-only verification at first; no automatic rewiring of `levels/latest.json`, Mongo HPP/CSO models, alerts or forecast inputs. Review source API limits/concurrency and do not fan out unbounded HTTP calls.
6. **Health and recovery.** Record independent per-measurement outcomes and lag based on source observation times; advance a watermark only after persistence; expose bounded diagnostics. Provider timeouts, rate limits, missing measurements and replayed data must be tested.

## Deliberate exclusions

No web-facing gauge configuration UI, other-provider adapter implementation, archival migration, legacy HPP domain refactor or predictor input migration. Externally visible station comparison screens and extra production gauge selections belong to [#52](https://github.com/tclare95/isHPPOpen/issues/52).

## Verification and deployment

Config parser/registry tests, EA sample response fixtures for level/flow, overlapping and corrected readings, error isolation, watermark replay and shadow parity checks. Backend CI and applicable SAM validation/build must pass. A manual AWS deployment with separate approval is required for any production activation; documentation PRs do not authorize it.
