# Proposal: CSO asset catalogue and explicit collection selection

## Goal
Make CSO monitoring in the planned shared .NET river-data backend independent of Sewage Map **at runtime**, while retaining the current HPP ID list as a permitted one-time, reviewed, attributed configuration import.

The backend is intended to support observations, CSO status/events, independent model forecasts and site assessments over time. This change establishes a CSO provider/catalogue/selection seam, **not** a new geographic network engine. First supported provider: Severn Trent. The agreed new `river-data-platform` repository is the planned shared implementation home (to be created under foundation #64); the former `river-observations` name is historical only. No second scaffold.

## Confirmed decisions (8 October 2026)
- A provider-owned asset catalogue is discovered independently from operational polling and from site-level upstream/downstream interpretations.
- Selection is authoritative **version-controlled config**: explicit outfall IDs in named enabled collection sets. Geographic/catchment selection and admin UI deferred.
- Enabled sets resolve as a deduplicated union. New catalogue assets never automatically enter the polling selection.
- Unresolved IDs **remain** in config and appear in health; other valid IDs keep collecting. When a missing configured ID becomes valid again, it resumes automatically.
- Failed/incomplete catalogue refresh retains the last verified snapshot, marked stale. Disabling/removing selection never deletes history.
- Sewage Map is an optional *one-time import/evidence source* only; no runtime upstream GIS assumption or third-party dependency.

## Capabilities
- `cso-asset-catalogue`: provider-specific full-list discovery, stable identity and metadata revision.
- `cso-collection-selection`: validated named sets, dry-run resolved plans, explicit selection health and run provenance.

## Dependencies and ownership
Implementation in the new unified .NET backend, tracking [#71](https://github.com/tclare95/isHPPOpen/issues/71); ingestion and spill-event storage are a **separate** [#72](https://github.com/tclare95/isHPPOpen/issues/72). Existing Node scraper/SQS/Mongo/S3/web remain authoritative until separate migration.

## Non-goals
No collection event persistence, event revisions, history imports, automatic selection by polygon/receiving watercourse, upstream routing, private source credential or production AWS deployment. Existing gauge OpenSpecs and ADR-001 remain unchanged.

## Release
Documentation only. Agent implementation requires CI fixture verification and optionally separately approved isolated staging deployment; no automatic production polling, data deletion or legacy switch-off.
