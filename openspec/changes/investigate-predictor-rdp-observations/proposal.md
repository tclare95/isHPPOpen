# Proposal: Investigate canonical RDP observations for trent-predictor (#53)

**Status:** investigation/documentation only. **Tracking:** [isHPPOpen #53](https://github.com/tclare95/isHPPOpen/issues/53). No consumer migration has been approved.

## Why

The independently deployed Python predictor runs hourly, currently preferring the EA Flood Monitoring API for four live river levels, falling back to EA Hydrology for those levels and using Hydrology for six observed rainfall series. It also fetches *future* rainfall forecasts from yr.no. RDP can already publish canonical observations through an authenticated, history-capable read API, but its production collection selection has only Colwick level and Shardlow level/flow; rainfall is not yet supported by its measurement registry. Simply redirecting HTTP requests would risk missing features and slower incident predictions.

## Product goal

Determine whether RDP can become the **normal observation source** for existing predictor inference **without reducing freshness, feature correctness or coverage**, especially during high-water incidents. Permit direct official EA observations as an explicit, attributed runtime fallback if evidence demonstrates the need. Keep existing model, schedule, outputs, training and release ownership unchanged. Investigation should recommend **go / conditional go / no go**, with documented evidence and prerequisites.

## Scope

- Map all predictor observation features to verified canonical measurement identities, units/datum, sample semantics and recorded history; distinguish observed rain from independently sourced future yr.no forecasts.
- Assess the existing RDP catalogue, latest/history/health contracts, coverage and revision/provenance limitations, production selection, collection cadence, security and cross-region access.
- Compare the operational source age/availability of RDP with direct EA at actual forecast runs, including difficult high-water and source-outage conditions.
- Specify safe source precedence, missing/stale handling and historical time-order correctness for a **later** independently approved adapter/consumer switch.
- Record a distinct **future** model-independent forecast publication/query boundary in RDP; reuse the [forecast-publication-contract #90](../forecast-publication-contract/proposal.md) rather than duplicating its product specification.

## Non-goals and approvals

No retraining, feature-engineering redesign, production data-source switch, Python/AWS/RDP infrastructure or IAM change, collection expansion, model release, source schedule change, forecast publication, historical rewrite, web/alert contract change or legacy scraper retirement. Any future live observations comparison requires a separately approved read-only scope; this documentation PR performs none. Implementation belongs chiefly in `trent-predictor`; any missing RDP measurement/read/IAM capability needs separately scoped approval.
