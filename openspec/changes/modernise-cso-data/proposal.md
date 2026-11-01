# Proposal: CSO source evidence, reliable spill events and verified history (#72)

## Why

The legacy Node scraper fetches Severn Trent storm overflow snapshots and appends Mongo `csoData` rows. Its weekly archive stores old snapshots, not canonical spill identities or revisions. A monitor reporting offline or disappearing from polling is not evidence that a discharge ended. RDP needs its own CSO domain with auditable source evidence, honest current state and an event timeline that survives corrections and retries.

**Implementation target:** `tclare95/river-data-platform`. **Product specification:** the two normative `specs/` documents below; [design.md](design.md) is non-normative engineering guidance and [tasks.md](tasks.md) is the phased verification plan.

## Product outcomes

1. Collect **only** verified, explicitly selected Severn Trent outfalls supplied by [#71](../cso-asset-catalogue-and-selection/proposal.md). Catalogue discovery must not enable polling. Changed or unresolved upstream identities are held, not guessed.
2. Preserve immutable provider evidence and per-run outcome independently of current monitor state and distinct spill events. A successful request does not by itself prove source freshness; unchanged reports do not create duplicate events.
3. Show the **last reported** state with its source time and an independent **freshness/effective** state. Offline, stale, unknown, failed polling, disabled selection and missing reports never imply either a confirmed no-spill or a spill-event end.
4. Use valid source-reported event boundaries, including a complete start/end claim first discovered after both occurred. Do not promise reconstruction of discharges absent from all source reports. Keep uncertain, contradictory and inferred intervals visibly uncertain.
5. Give events stable internal IDs, preserve source linkage and immutable material revisions, prevent duplicate reports/replays from duplicating events, and hold ambiguous matching for reconciliation rather than merging or inventing boundaries. Corrections to completed or archived events revise the **same identity**, never silently form new discharges.
6. Keep **24 UTC calendar months from verified event end** queryable in CSO-specific hot DynamoDB storage. Open/unresolved events are never TTL-eligible. Only verified, directly readable private S3 archive history can allow completed events to expire from hot storage; retain raw evidence and previous revisions without automatic deletion until separate governance approval.
7. Provide a bounded, authenticated, first-party CSO read API with current status, events and revisions, source/collection health and explicit coverage/integrity semantics. Do not change existing public web APIs or legacy CSO consumers.

## Dependencies and boundaries

- [#71](../cso-asset-catalogue-and-selection/proposal.md) owns verified provider catalogue identities, reviewed mapping, versioned named selection sets, last-good S3 snapshots and selection-plan handoff. #72 owns **only** selected-asset status/event polling, evidence, reconciliation, CSO event retention and CSO reads. Catalogue being stale must be visible; no unverified asset becomes eligible automatically.
- [#69](../observation-read-api/proposal.md) provides the implemented HTTP API Gateway / AWS_IAM / Vercel OIDC+SigV4 conventions, not a general-purpose river observation table.
- [#65](../archive-observation-history/proposal.md) provides tested S3 integrity and archive-first recovery principles, **not** gauge observation keys, read model or 365-day retention.
- [#75](../lightweight-integration-deployment/proposal.md) and [#81](../production-observation-deployment/proposal.md) govern stage/prod isolation, manual release approval and disabled-by-default source activation. Their EA observation flags/schedules do not activate CSO collection.
- [#68](../../../../docs/LEGACY_SCRAPER_RETIREMENT.md) and later consumer migration govern site assessment parity, public compatibility, alerting and eventual scraper retirement.

## Deliberate non-goals

No scraper/Mongo/archive modification or deletion; no live collector activation, AWS apply, production migration, historic EDM import or Glacier restore; no all-provider polling, GIS-based upstream inference, Sewage Map runtime dependency, browser-accessible raw CSO API, alerts, HPP/site risk computation changes, forecast execution or admin reconciliation UI. No extra generic event framework or new independently deployed API handler by default.

## Delivery

Four independently reviewable stages: **(1) evidence/current state; (2) event identity and corrections; (3) archive and six IAM reads; (4) bounded, separately authorised stage verification**. Implemented and accepted RDP behaviour, not merely merged docs, is required before closing #72. Fixture tests must cover competing retries, late completed-event corrections, S3/Dynamo partial failure and cross-tier event queries. Stage remains small, with no continuous collection or two-year replica. Documentation or its merge authorises **none** of these runtime changes.
