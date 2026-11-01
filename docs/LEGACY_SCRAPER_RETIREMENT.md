# Legacy Node scraper retirement — writer/consumer map

**Umbrella:** [isHPPOpen #68](https://github.com/tclare95/isHPPOpen/issues/68). **Review:** 1 November 2026, from repository code and recorded release evidence, not a live AWS/Mongo/S3 inventory. This file is a migration dependency record, **not** implementation or release approval.

## Accepted domain decisions

1. HPP threshold/status and transitions belong to an **independent HPP service** consuming RDP verified Colwick observations, not an RDP HPP writer. Hold last-known HPP status on stale/unverified input without creating transitions.
2. RDP owns CSO provider evidence and explicit site membership/assessment evidence. The website initially retains calibrated site water-quality risk and presentation.
3. Forecast contract first. Keep `trent-predictor`'s independent hourly Python/CSV outputs; plan a later separate public snapshot compatibility publisher.

## Source/trigger inventory

| Trigger | Current duty | Read/query | Write/publish | Consumer |
| --- | --- | --- | --- | --- |
| Node main SAM `rate(15 minutes)` | Colwick observation/fallback | EA Flood Monitoring station 4009; government page 2102; last-known S3/Mongo | `riverschemas`, public `levels/latest.json`, dated `levels/` snapshots | Website `/api/levels`, potential public S3 clients, historical evidence |
| Same Node invocation | HPP threshold | Latest selected level (including legacy fallback); 2.2 m boundary | Change-only Mongo `openIndicator` | `/api/hppstatus` and HPP alerts |
| Same Node invocation | Government forecast | Embedded government page telemetry | In the same river Mongo and S3 objects | `/api/levels.forecast_data` |
| Same Node invocation | Site/selection summary | Sewage Map-derived CloudFront downstream-impact GeoJSON, nearest NWSC point | Mongo `waterQuality` + SQS work batches; inline CSO fallback | Site density/history, map, risk/alerts, CSO worker |
| SQS batches (up to 10) | CSO point-status fetch | Severn Trent ArcGIS `FeatureServer/0/query`, keyed by Id | Mongo `csoData` snapshots | Website CSO status/map/detail APIs |
| Node `rate(7 days)` | Old-CSO history/archive | Mongo `csoData` older than 3 months | S3 `cso-archive/year=YYYY/month=MM/cso-batch-*.jsonl`, followed by Mongo delete | Historical recovery/retention, not current online API |
| Python predictor `rate(1 hour)` | Independent 72 h ML forecast | Four EA level series; six EA rainfall measures; six MET Norway forecast locations; model S3; old forecast S3 | `forecasts/colwick_forecast.csv`, `history/`, accuracy/history/summary, stability, model-health CSV; optional SNS model-health alert | ML forecast pages, forecast alerts, accuracy/stability views, internal forecasting quality |
| Vercel `*/15 * * * *` | Alert evaluation | Gauge, HPP, water-quality and predictor services | Web-owned subscription/delivery/run/state Mongo, email | Subscribers |
| RDP production `rate(15 minutes)` | Verified EA observations (now running) | Explicit three-measure EA selection | Archive-first private S3 + Dynamo/latest/cursor/health | Future `#51` readers; it does **not** replace any HPP/CSO/forecast writer |

Scraper source locations: [SAM schedule](https://github.com/tclare95/ishppopenScraper/blob/main/is-hpp-open-scraper/template.yaml), [main](https://github.com/tclare95/ishppopenScraper/blob/main/is-hpp-open-scraper/is-hpp-open/app.mjs), [CSO worker](https://github.com/tclare95/ishppopenScraper/blob/main/is-hpp-open-scraper/is-hpp-open/csoWorker.mjs), [archiver](https://github.com/tclare95/ishppopenScraper/blob/main/is-hpp-open-scraper/is-hpp-open/csoArchival.mjs). Predictor: [Lambda](https://github.com/tclare95/trent-predictor/blob/main/deploy/lambda_handler.py). Website: [service layer](https://github.com/tclare95/isHPPOpen/tree/main/libs/services). RDP: [modules](https://github.com/tclare95/river-data-platform/blob/main/docs/MODULES.md).

## Cutover dependency matrix

| Legacy duty to retire | Minimum independent readiness | Tracking |
| --- | --- | --- |
| Colwick `riverschemas` level writer | Verified RDP recent history + compatible site/web reader; preserve needed historic evidence; no remaining required direct Mongo writer/consumer | [#51](https://github.com/tclare95/isHPPOpen/issues/51), [#50](https://github.com/tclare95/isHPPOpen/issues/50) |
| `openIndicator` writer | Independent HPP service, verified 2.2 m/datum/identity, carried-in complete transition state, freshness hold, safe HPP reader/alert parity | [#89](https://github.com/tclare95/isHPPOpen/issues/89), [#63](https://github.com/tclare95/isHPPOpen/issues/63), [#47](https://github.com/tclare95/isHPPOpen/issues/47) |
| Mongo `waterQuality` | Explicit site membership and evidence projection, density history continuity, website risk/alert parity; no runtime dependence on Sewage Map | future `water-quality-site-assessments`, after [#71](https://github.com/tclare95/isHPPOpen/issues/71)/[#72](https://github.com/tclare95/isHPPOpen/issues/72) |
| SQS enqueue + `csoData` worker | #71 validated selection, #72 source/event history, complete matching polling and consumption, queue/DLQ reconciliation and no competing writes | #71/#72, [scraper #10](https://github.com/tclare95/ishppopenScraper/issues/10) |
| Weekly `csoData` archiver | Archive restorability/integrity evidence, historical access/retention, source delete reconciliation and explicit retirement approval | [scraper #11](https://github.com/tclare95/ishppopenScraper/issues/11), #72 |
| Government forecast and public `levels/` publisher | Contract fixtures, verified government feed, separate single-writer compatibility publisher, exact S3 URLs/JSON keys and website `forecast_data` parity | [#90](https://github.com/tclare95/isHPPOpen/issues/90); later `legacy-river-snapshot-publication` |
| Node main schedule | All mixed duties migrated and verified, rollback paths confirmed; **last** switch | [#68](https://github.com/tclare95/isHPPOpen/issues/68) |

**Not scraper duties:** independent hourly predictor; Vercel email alerts; direct-EA Trent dashboard and Trent Lock submission queries; website editorial events/banner writes. They still have downstream source dependencies, but need not move to retire the Node scheduler.

## Recommended sequence and explicit approval gates

1. Preserve representative source fixtures, historical `openIndicator`, existing public JSON/CSV and provider provenance; inventory external S3 readers as far as possible.
2. Complete existing RDP production read-API activation approval and #51 gauge-reader shadow/cutover; keep HPP/CSO/forecast legacy authority.
3. Build/verify an independent HPP service with **non-authoritative** shadow evaluation, then separately approve historical state handoff and web/HPP alert source switch.
4. Implement #71/#72 CSO provider/catalogue/state/history. Review site membership evidence and website risk compatibility; shadow/activate CSO/site readers separately.
5. Verify a separate legacy snapshot publisher on an isolated non-public key, preserving government forecast and public observations/JSON, then transfer the **single** live writer.
6. Reconcile SQS/DLQ and archiver integrity, retain historical assets, then separately approve stopping each remaining Node writer and **last** the shared schedule. Never run two competing authoritative writers or replay notifications on rollback.

## Known hazards and scope limits

- Node HPP transitions are recorded at processing time and can derive from S3/Mongo fallback. The successor must not treat old fallback as fresh or silently reinterpret historical timestamps.
- Existing HPP rolling-year calculations omit the prior carried-in transition: [#63](https://github.com/tclare95/isHPPOpen/issues/63); this is a correctness prerequisite, not proof of parity.
- Node CSO worker's partial-batch response is not enabled in its SQS event-source mapping: [scraper #10](https://github.com/tclare95/ishppopenScraper/issues/10).
- Node CSO archiver verifies HEAD count metadata rather than bytes/IDs/restore and may attempt cleanup after source deletion: [scraper #11](https://github.com/tclare95/ishppopenScraper/issues/11). Do not treat all legacy S3 history as proven available.
- RDP collects only three of six registered web dashboard measurement series in the latest production evidence. Predictor independently requires four levels and six rainfall series, and its future RDP-input migration is a **separate** backlog item [#53](https://github.com/tclare95/isHPPOpen/issues/53).
- Latest confirmed RDP production evidence is recorded on [#81](https://github.com/tclare95/isHPPOpen/issues/81) after 82 scheduled slots. That evidence does not assert the RDP production read API, web migration or domain cutovers are live.
- Exact deployed AWS configuration, historical Mongo record counts, public S3 consumer identities and live queue/DLQ depths were **not** read during this documentation-only review.

**No code implementation, deployments, source switches, live AWS/Mongo/S3 writes, schedule disablement or historical migration are authorised.**
