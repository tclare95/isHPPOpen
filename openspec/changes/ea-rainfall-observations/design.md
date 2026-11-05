# Evidence and candidate design: EA rainfall (#54)

This is **evidence and implementation guidance, not a product mandate**. The [capability spec](specs/observed-rainfall/spec.md) owns required behaviour. No external EA requests were successfully executed during this review, so station-level metadata, coverage and measured lag remain **unverified**.

## Actual predictor input identity inventory (5 November 2026)
From `trent-predictor/deploy/lambda_handler.py`: each series uses `https://environment.data.gov.uk/hydrology/id/measures/{GUID}-rainfall-t-900-mm-qualified/readings.json` with `mineq-date`, `max-date` and `_limit`. The GUID is the *candidate Hydrology station identifier inferred from the measure notation*, not a separately verified station endpoint. Names are predictor labels, not verified EA station-label matches.

| Predictor feature | Station label in predictor | Candidate Hydrology station ID / measure prefix | Qualified measure suffix |
| --- | --- | --- | --- |
| `ashford_rain` | Ashford Hall | `97367d32-d221-4ed7-9c81-003c0e3d4730` | `-rainfall-t-900-mm-qualified` |
| `sutton_bonington_rain` | Sutton Bonington | `e56a9e4b-b8c7-4202-b557-942b0b3022bd` | same |
| `stone_rain` | Stone | `e97f1ed0-360f-43a5-8384-c46fd6ffd7ce` | same |
| `lea_marston_rain` | Lea Marston | `fab81083-5b8a-4382-bff5-934c1ad7ac7a` | same |
| `wanlip_rain` | Wanlip | `d2c8e9d4-7072-42fe-9803-2d908c9132f6` | same |
| `ashbourne_rain` | Ashbourne | `1c1b8275-5faf-4052-9805-58166bff52e4` | same |

The first three occur with the others in deployed Lambda `MEASURES`; the latter three are also named in `fetch_new_rain_gauges.py`. `02_build_base_table.py` reads all six historical columns from S3, resamples to 15 min and interpolates small gaps. Deployed inference resamples all observations to 15 min and `ffill().bfill()` before rolling rainfall sums at 1, 3, 6, 12 and 24 hours; this can hide missing rain and use later values when reconstructing prior issuance. These are *consumer risks*, not an instruction to change the model in this work. Future yr.no rainfall is a different product and source.

## Source and semantics evidence
- [EA Hydrology reference](https://environment.data.gov.uk/hydrology/doc/reference): 15-minute rainfall has `valueType=total`, `unitName=mm`; qualified readings can have `quality` (`Good`, `Estimated`, `Suspect`, `Unchecked`, `Missing`), `completeness` and `qcode`. `Missing` can omit `value`. The service offers long-term history and requires bounded, respectful requests. UTC-qualified filters are supported.
- [EA Flood Monitoring rainfall reference](https://environment.data.gov.uk/flood-monitoring/doc/rainfall): different near-real-time rainfall catalogue with 15-minute totals and limited recent history. Its gauge identifiers are **not established aliases** of these six Hydrology GUIDs. A separate metadata comparison is required before any substitution.
- [EA rainfall dataset](https://www.data.gov.uk/dataset/e70328b3-1a75-458e-8402-9ab3ce15aae1/real-time-rainfall-data): nominal 15-minute period data may be transmitted once/twice daily or more often during rainfall/flooding, are recorded in GMT, and may change on quality review. Never assume a 15-minute publication lag or apply BST shifts to UTC timestamps.
- The official documentation identifies readings by a time label but the material reviewed does **not explicitly establish whether the exact six series label the period start or end**. Preserve the label and period width; hold derived period boundaries/operational roll-ups pending direct provider confirmation.

**Evidence not yet obtainable:** six live measure/station metadata responses, exact Flood Monitoring aliases and coverage start/end, actual row examples with flags/time offsets, sampled latest publication lag under normal/rain events, quality correction cadence and provider first-published timestamps. The current `Hydrology` APIs may reflect qualified data later than original release; measuring age at retrieval alone does not prove true publication lag. Run safe *read-only* hourly samples with stable UTC request/retrieval times in a separately authorised investigation, logging each source's newest reading and response timestamp, then compare direct FM candidates for the same gauges only after identity verification. No operational-inference readiness claim until evidence exists.

## RDP compatibility and first slice
RDP's `MeasurementRegistry.Validate` only supports `level`/`flow` with Flood Monitoring station aliases; `EaObservationSource` calls only `/flood-monitoring`. `Observation` and `ObservationDto` expose one `ObservedAt` timestamp without an accumulation interval; the archive/hot-store retain winning revisions but the current history API does not implement historical **as-known-at**. `requestAsOf` anchors a read request snapshot, not availability at an earlier forecast issuance.

**Proposed first bounded implementation:** independent candidate rainfall identities, a 900-second total reading value with original timestamp label and unresolved boundary convention, and an HTTP Hydrology adapter exercised via local JSON fixtures. Do not wire it to DI, the collector registry, Lambda, archive, history routes, IAM or stage/production selection; all those require separate reviewed work once identity, timestamp and revision semantics are proven. A fixture `Missing` row remains a nullable total, not zero. Duplicate conflicting time labels fail closed. A local fetch first-known time is evidence of *this retrieval*, not proof of when the EA originally published a historical value.

## Minimum later onboarding gates
1. Resolve each six station metadata lookup and verify GUID/notation, label, unit, total/period, open/active state, quality and usable historical coverage. Check whether Flood Monitoring offers an official equivalent and measure actual freshness, without name/coordinate guesswork.
2. Confirm period labelling with provider documentation or direct clarification; agree RDP period-aware archive, read API and correction/availability contract and explicit unknown-gap behaviour before allowing consumers to derive rolling rainfall sums.
3. Use [#101 API-managed measurements](../api-managed-measurements/proposal.md) to register reviewed identities **uncollected and unpublished**; opt in a small staging subset within source/collector budgets, then expand to the six existing predictor sources if evidence supports it. Production collection remains its own approved gate. No automatic poll-all/discovery or cursor reset.
4. Under [#53](../investigate-predictor-rdp-observations/proposal.md), shadow compare weather/observed inputs and direct EA with source, lag, gaps, first-known evidence and high-water behaviour. Separately approve any source switch or change to model data treatment.
