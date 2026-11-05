> **Historical copy — moved to RDP.** This file's maintained version is [RDP `ea-rainfall-observations`](https://github.com/tclare95/river-data-platform/blob/main/openspec/changes/ea-rainfall-observations/proposal.md). The old content is retained for the linked isHPPOpen issues, PRs and acceptance history; **do not use it as a second editable specification**. Migration: [RDP #50](https://github.com/tclare95/river-data-platform/issues/50). No deployment or activation is implied.

# Proposal: EA observed rainfall in River Data Platform (#54)

## Why
The deployed Trent predictor consumes six **observed** EA Hydrology 15-minute rainfall series as context. RDP currently collects only EA Flood Monitoring **instantaneous level/flow** and cannot represent rainfall period totals without losing essential semantics. [Predictor-source investigation #53](https://github.com/tclare95/isHPPOpen/issues/53) calls for a comparable, provenance-aware RDP input before any shadow evaluation or source switch.

## Product outcome
RDP can register and safely serve a supported **observed rainfall accumulation** as a distinct measurement kind, preserving its provider identity, **15-minute period**, original timestamp convention, depth in millimetres, qualifications, missingness, source, availability evidence and later corrections. Consumers can request time-bounded history and distinguish complete rainfall accumulation windows from unknown periods. The platform does **not** calculate, train or execute forecasts.

Start with the six source identities already used by `trent-predictor`: Ashford Hall, Sutton Bonington, Stone, Lea Marston, Wanlip and Ashbourne. First confirm the exact Hydrology station/measure metadata and sampling timestamp convention, identify any separate Flood Monitoring equivalents rather than assuming identity, and measure publication/collector lag before choosing a live source.

## Delivery and approval
1. **Foundation only now:** a small fixture-tested rainfall value/provider adapter and a candidate identity list. Keep it disconnected from the current registry, collector, stores, read API and deployed Lambda until metadata/interval and persistence contract acceptance. No external provider traffic from tests or hosts.
2. **Later, independently reviewed:** verify six-source metadata and real observations/quality/coverage; introduce period-aware archive/read revision and observed-availability semantics; elect a bounded collection set with independent stage/production approval.
3. **After evidence, separately approved:** compare as-known-at rainfall inputs with current direct EA behaviour in predictor shadow mode under #53. Keep forecast outputs, model, training, hourly schedule and yr.no future rainfall independent.

## Non-goals
No generic meteorology or forecasting framework, automatic source switch, model retraining, runtime collection of every rainfall gauge, inferred zeroes for missing intervals, destructive data correction, shared rainfall/level meaning, public administration, infrastructure or AWS deployments. This change does not grant new IAM rights, activate rainfall collection, change the level/flow selection, or authorise production data writes.

Product requirements: [capability spec](specs/observed-rainfall/spec.md). Findings/uncertainties and candidate implementation: [design](design.md).