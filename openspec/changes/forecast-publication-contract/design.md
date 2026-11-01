# Design notes: Forecast publication and legacy compatibility

The capability specifications define externally observable behaviour. These notes explain boundaries and later cutover options, not a prescribed technology or migration plan.

## Current producers and consumers

| Producer | Existing surface | Consumers |
| --- | --- | --- |
| Node scraper, 15-minute schedule | Government-page `forecast_readings` combined with `level_readings` in public `levels/latest.json`, dated `levels/` S3 and Mongo `riverschemas` | `/api/levels.forecast_data`, public S3 readers; historical source evidence |
| Python predictor, hourly schedule | `forecasts/colwick_forecast.csv`, `forecasts/history/...`, accuracy/history/summary, stability and model health CSVs | `/api/s3forecast`, accuracy/stability views, forecast alerts; predictor self-evaluation |

The government-page fallback for **observed** levels is not the same thing as the government **future** forecast. The former is used when EA flood-monitoring observations fail. Keep `level_source` attribution when replacing a compatibility publisher. The forecast issue time must not be inferred from a future target point.

## Confirmed design boundaries

- **No Python engine changes now**. Existing CSV keys, documented headers, cadence and model promotion remain the source-of-truth for predictor consumers.
- **No new RDP forecast table/API mandate now**. A model/provider-neutral contract can be used at a future adapter boundary if there is a demonstrated need.
- A **separate legacy compatibility publisher** is planned; it can consume RDP observations, a verified official government forecast source and preserve the old combined JSON. Which repository hosts the publisher, how the forecast-page extraction is performed, and its scheduling/storage implementation belong to its own later spec/design.
- External compatibility is stricter for the public S3 object `levels/latest.json` than for private internal services. The existing bucket policy grants public reads only for this exact key, not the entire dated history or RDP stores; do not expand public S3 access accidentally.

## Later safe publication handoff

1. Inventory actual JSON/CSV fixtures, URL-based consumers, shape, time/units/datum, freshness and errors. Check whether any external clients depend on historic keys and object generation cadence.
2. Shadow the separate compatibility publisher to a non-public isolated destination. Compare field shape, ordering, clock semantics, fallback source attribution and failure cases.
3. Arrange one authoritative writer per public key and a separately approved source switch. Preserve or pin appropriate source version/identity across handoff; account for the existing 900-second website cache and old fallbacks.
4. Prove reversible publication and continued predictor independence; only later consider disabling the Node publisher or main schedule after all its other responsibilities have migrated.

A future forecast API/storage adapter may be useful but is **not** a prerequisite for retiring the Node scraper. The independent predictor input migration [#53](https://github.com/tclare95/isHPPOpen/issues/53) requires more hydrological measurements than the currently collected RDP production selection and is out of scope.
