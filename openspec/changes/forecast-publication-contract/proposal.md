# Proposal: Forecast publication and compatibility contract

**Tracking:** [#90](https://github.com/tclare95/isHPPOpen/issues/90), umbrella [#68](https://github.com/tclare95/isHPPOpen/issues/68). **Stage:** documentation/contract only, not implementation authorisation.

## Why

The legacy Node scraper fetches a government gauge-page forecast and publishes it **alongside** observed levels into `levels/latest.json`, dated `levels/` snapshots and Mongo `riverschemas`. Independently, `trent-predictor` runs hourly and publishes a 72-hour ML forecast, forecast-history, accuracy, stability and model-health CSVs. The website serves both kinds for different uses and uses the ML forecast for alerts.

Retiring the Node scraper must not silently remove the government forecast or break public JSON contracts. Equally, this is not a reason to rewrite the Python engine or force all forecasts through RDP today.

## Agreed boundaries (1 November 2026)

- **Contract-first** specification for independently authored government/source forecasts and ML/model forecasts; a provider/model-neutral description does not imply a new shared database or API now.
- Leave the Python predictor, model promotion, its hourly schedule, existing S3 objects and all current readers unchanged.
- Plan a **separate legacy compatibility publisher** for public `levels/latest.json` and dated snapshots when the Node writer is eventually retired. Publication and producer ownership change only under later approved work.
- Preserve existing `/api/levels.forecast_data`, `/api/s3forecast`, forecast accuracy/stability/health and alert contracts; distinguish the government's feed from the predictor's published prediction.
- Incomplete or stale input must be visibly incomplete/stale, not fabricated as current. Keep forecast issue time distinct from future target time and observation time.

## Capabilities

- `forecast-publication`: identities, timing/provenance/freshness and consumers of independently generated forecast runs.
- `legacy-forecast-compatibility`: continuing external government forecast and combined public river-snapshot contract through a future single-writer handoff.

## Non-goals

No new forecast inference, model retraining, ML input switch to RDP, immediate new RDP forecast storage/API, parser rewrite, AWS/S3 write, source setting change, private forecast publication, public access expansion or Node schedule disablement. Predictor input expansion [#53](https://github.com/tclare95/isHPPOpen/issues/53) and public/developer RDP API [#78](https://github.com/tclare95/isHPPOpen/issues/78) remain separate ideas.

## Dependencies

RDP observations and [#51](https://github.com/tclare95/isHPPOpen/issues/51) can independently replace the observed level portion of `/api/levels`, while `forecast_data` stays legacy. The later snapshot publisher must integrate an approved observed source plus independently sourced government-page forecast, preserving public key and payload. Existing forecast CSV formats remain producer-owned.

See [design](design.md) and [tasks](tasks.md) for rollout boundaries and acceptance evidence.
