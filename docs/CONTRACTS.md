# Cross-repository data contracts

This document inventories the boundaries between independently released components. It is a **contract index**, not a replacement for the producer source code or deployment guides. Confirm exact column/field schemas against producer and consumer code before changing them.

| Producer | Contract | Consumer | Expectations |
| --- | --- | --- | --- |
| RDP (`eu-west-1`, independent stage/prod release) | Signed first-party `/v1/measurements*` catalogue/latest/observations/health; source identity, units, datum, observed timestamps, gaps and provenance | Server-only isHPPOpen client and #51 adapters | Verify published/collected distinction, availability/freshness, continuity, pagination and authorised caller. Existing site APIs and fallback/alert rules remain separately owned. |
| Scraper (`eu-west-1`, 15-minute schedule) | MongoDB river/status/water-quality and CSO collections | Web services | Collection names, station identities, semantics and null/fallback behaviour must remain compatible. |
| Scraper | Public S3 `levels/latest.json` via `S3_LEVELS_URL`, plus dated history | Web levels service | Preserve JSON shape, units, station IDs, timestamps, and freshness/fallback behaviour. |
| Predictor (`eu-west-2`, hourly schedule) | S3 `forecasts/colwick_forecast.csv` via `S3_FORECAST_URL` | Web forecast APIs and alert evaluation | CSV headers and types, metres, UTC timestamps, 15-minute target spacing and 72-hour horizon. |
| Predictor | S3 forecast accuracy, stability, history and model-health CSV objects | Web forecast/health views | Preserve declared keys, column semantics and missing-data behaviour. |
| Model training/promotion | S3 `models/xgb_colwick_horizon.pkl` | Predictor Lambda | Compatible serialized model and feature schema; model promotion is distinct from deploying code. |

## Source-of-truth references
- [System architecture and release coordination](SYSTEM.md)
- [RDP consumer integration and ownership](RDP-INTEGRATION.md)
- [RDP first-party read contract](https://github.com/tclare95/river-data-platform/blob/main/docs/READ-API.md) and [OpenAPI](https://github.com/tclare95/river-data-platform/blob/main/docs/openapi.json)
- [Web API and health behaviour](ARCHITECTURE.md)
- [Scraper runtime contract](https://github.com/tclare95/ishppopenScraper/blob/main/AGENTS.md)
- [Predictor production output examples](https://github.com/tclare95/trent-predictor/blob/main/deploy/README.md)
- Component-specific `DEPLOYMENT.md` for release instructions.

## Rules for changes
1. Document changes to fields, API schemas, S3 keys, Mongo collections, cadence, station identifiers, units, timezone interpretation or null semantics in the **owning producer spec/contract**, and link consumer specs/PRs. Existing accepted suite OpenSpecs remain authoritative until explicitly migrated.
2. Prefer additive producer changes, then compatible consumer changes, then removal of obsolete fields only after all consumers have changed. Treat alerts and historical readers as consumers too.
3. Verify contract samples at the boundary; test missing/stale inputs and timestamps. Do not infer data health only from HTTP success. Keep the web operational-health metadata (`source`, `generatedAt`, `fetchedAt`, `ageSeconds`, `state`) consistent.
4. Roll out and roll back independently. Backward-incompatible changes need an explicit compatibility window and coordinated release plan.
5. Do not put secret values, production database exports or model artifacts into specs or fixtures.

## Schema detail to establish as features evolve
The precise field/column schema for each shared Mongo/S3 payload should be written down or represented by checked-in fixtures/contract tests when touched next. This inventory does **not** assert unverified complete schemas.
