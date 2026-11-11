# Proposal: adopt RDP CSO reads in the existing HPP water-quality consumer

## Why
RDP now owns first-party selected-outfall current status, event lifecycle, revisions, event history and collection coverage. isHPPOpen still reads legacy Node-written Mongo snapshots for current CSO map state and the Sewage Map-derived density series. We need a reversible consumer path without recreating the site or conflating the two migrations.

## Goal
Optional read-only RDP CSO status/event shadow, followed by independently approved normal-source switch for existing markers/detail/history. Historical event analyses may be added to the **existing** `/waterquality` experience. Membership and calibrated density replacement remain separate under #114, not a prerequisite for shadow reads.

## Ownership
- **RDP:** official provider identity/catalogue, selection, immutable evidence, status/freshness, events/revisions, archive, collection gaps, candidate upstream relationships and future reusable data contracts.
- **isHPPOpen:** validated HPP upstream set, public compatibility API adaptation, map/status interpretation, calibrated three-hour 48h-derived density/river rise, historic series interpretation, subscriptions and alert delivery.
- **Node:** legacy writer until controlled retirement under #68.

## Already implemented; not scope
`/waterquality` map, status filters, cards, chart, risk, alerts and RDP River Tracer overlay. Do not add a second HPP water-quality dashboard or RDP risk product.

## References
[PM source/capability review](../../../docs/WATER_QUALITY_CSO_RDP_PM_REVIEW.md), [consumer #120](https://github.com/tclare95/isHPPOpen/issues/120), [history #121](https://github.com/tclare95/isHPPOpen/issues/121), [membership/density #114](https://github.com/tclare95/isHPPOpen/issues/114), [retirement #68](https://github.com/tclare95/isHPPOpen/issues/68), [RDP CSO history/read API](https://github.com/tclare95/river-data-platform/blob/main/docs/CSO-HISTORY.md).

No implementation, production release, writer/source/alert switch or historical import is authorised by this OpenSpec.