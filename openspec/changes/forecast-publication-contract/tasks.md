# Forecast publication contract — acceptance work

All work is **unstarted** and does not authorise a publisher implementation or a runtime switch.

- [ ] 1. Record representative existing government forecast JSON, levels snapshots, predictor CSV headers/rows and independent consumer/API expectations using safe fixtures.
- [ ] 2. Prove source/kind, issue time versus target/observation times, UTC/units/datum, provenance and stale/empty/malformed-source semantics without mixing ML and government forecasts.
- [ ] 3. Verify the unchanged predictor forecast, accuracy, history, summary, stability and model-health contracts and their web/alert consumers.
- [ ] 4. Define future compatibility-publisher acceptance: exact `levels/latest.json` key and fields, dated history behaviour, `level_source` fallback attribution, 480-reading depth where supplied, independent forecast availability and website `/api/levels` parity.
- [ ] 5. Prove non-authoritative shadow output, single-writer handoff, operator-observable publication freshness, no public-key race and independently reviewable rollback.
- [ ] 6. Track a **separate** future compatibility-publisher implementation/cutover issue after the contract is reviewed. No deployed jobs, S3 objects, settings or forecasts are modified under this specification.

**Non-goals:** new prediction algorithm, moving Python into .NET, promoting a model, changing the predictor's input sources, or public RDP API rollout.
