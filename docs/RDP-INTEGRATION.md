# isHPPOpen's relationship with River Data Platform

**Purpose:** consumer-facing integration guide. RDP is an independent environmental-data product; isHPPOpen is a site-specific application which progressively **consumes** reusable RDP capabilities. This document explains ownership and source-migration rules. It does not assert that every planned RDP module is live or that all consumer source switches have happened.

For the complementary platform view see [RDP ecosystem and documentation ownership](https://github.com/tclare95/river-data-platform/blob/main/docs/ECOSYSTEM.md) and [RDP product vision](https://github.com/tclare95/river-data-platform/blob/main/docs/PRODUCT_VISION.md).

**Repository visibility:** RDP is currently private; readers without repository access may not be able to open the linked platform documents. This guide states the consumer-facing boundaries independently.

## Ownership: site product versus data platform

The first [HPP River Tracer consumer slice](HPP-RIVER-TRACER.md) reuses the existing
RDP API and server-side signed client. Its narrow isHPPOpen endpoint serves optional
river layers and summaries in `/waterquality`; the owner confirmed licensing and
authorised live publication on 6 November 2026. Local fixtures remain isolated
from Vercel. No RDP endpoint or producer change is added.

| Concern | Owner | isHPPOpen's role |
| --- | --- | --- |
| River observations, provider identities, collection health and verified history | [RDP](https://github.com/tclare95/river-data-platform) | Read supported published series, adapt to existing site-specific API contracts, handle freshness/fallback under reviewed policies. |
| CSO provider catalogue, status evidence, spill events | RDP (#71/#72) | Select relevant evidence for HPP and present a **calibrated site-specific indication**, not a provider-wide canonical risk classification. |
| River network, point matching, upstream/downstream routing and GeoJSON impact layers | Planned [RDP River Tracer #47](https://github.com/tclare95/river-data-platform/issues/47) | Later compare and replace the legacy Sewage Map-derived HPP relationships, with explicit review. |
| Generic forecast publication | Planned RDP (#90) | Consume approved forecasts for site charts/alerts; preserve existing government/ML contracts until changed. |
| HPP opening status and transitions | Separately operated HPP service (planned, #89) | Display site status and preserve event/alert compatibility. No HPP transitions should be created from stale/unverified level observations. |
| Site-specific alerts, web UX, banners, historical views, water-quality calibration | isHPPOpen | Own user-visible rules and lifecycle until independently migrated. |
| Python model training and predictions | [trent-predictor](https://github.com/tclare95/trent-predictor) | Consume current published results; any future RDP forecast publishing is a separate path. |
| Legacy Node scraper/Mongo/S3 publications | [ishppopenScraper](https://github.com/tclare95/ishppopenScraper) | Continue consuming required outputs until each compatibility contract and replacement are verified. |

**RDP becoming a standalone product does not remove isHPPOpen.** Both can evolve independently. A future RDP explorer/playgrounds application is a separate consumer; no such web repository is assumed to exist yet.

## Current read integration boundary

```text
RDP canonical observations (Dynamo/S3) ──> RDP first-party read API
                                                   │ AWS_IAM / SigV4
                                                   │
                         isHPPOpen trusted Next.js server-side client
                                                   │
                         site-specific services / API compatibility adapters
                                                   │
                                   browser views and existing alerts
```

- RDP owns the authenticated source contract: [read API and availability semantics](https://github.com/tclare95/river-data-platform/blob/main/docs/READ-API.md), [OpenAPI](https://github.com/tclare95/river-data-platform/blob/main/docs/openapi.json).
- isHPPOpen's `libs/rdp` server-only client obtains Vercel OIDC federation and scoped STS credentials; it signs requests to the RDP read API. **Never send role credentials, signed upstream request details, internal API envelopes or private storage references to the browser.**
- Published measurement identity is not evidence that data was ever collected. A healthy API response does not imply a fresh observation or complete historical coverage. Preserve source timestamps, gaps, revisions, units and the distinction between missing and stale.
- A public isHPPOpen route may serve a **curated site-specific response**; this is not the general-purpose external developer API. Public access to RDP itself is separate [#78](https://github.com/tclare95/isHPPOpen/issues/78) planning.

### Independent observed-data source modes

Existing adapter work permits `legacy`, `shadow` and `rdp` modes, chosen **independently** for:

| Consumer | Setting / evidence | Boundary |
| --- | --- | --- |
| Trent gauge display | `RDP_TRENT_SOURCE`, [#51-B](RDP-TRENT-51B.md) | Bounded RDP histories adapted to existing station order/unit/shape; display may use validated legacy fallback under its documented policy. |
| Colwick observed levels | `RDP_LEVELS_SOURCE`, [#51-C](RDP-LEVELS-51C.md) | Migrates observed `level_data`, not the government's `forecast_data` in the old public snapshot. |
| Live gauge alerts | `RDP_GAUGE_ALERTS_SOURCE`, [#51-D](RDP-GAUGE-ALERTS-51D.md) | Alert-safe freshness, continuity and delivery handling. In RDP mode **do not automatically fall back** to legacy measurements for alerts. |
| Current CSO status/events on `/waterquality` | `RDP_CSO_SOURCE`, [#120](RDP-CSO-120.md) | Legacy membership kept; RDP supplies identity, status and recent event ends. Alerts, density and `waterQualityIndicator.js` stay legacy in every mode. Production caller granted all seven `/v1/cso/*` routes (verified 2026-11-12). |
| Recorded CSO event history on `/waterquality` | `RDP_CSO_HISTORY`, [#121](RDP-CSO-HISTORY-121.md) | Descriptive event list, coverage and revisions only; no effect on risk, density or alerts. Default off. |
| RDP transport / authentication | [#51-A](RDP-CLIENT-51A.md) | First-party reads and credentials remain server-side, errors sanitized, separate stage/production caller identity. |
| Historical conditions exploration | [historical conditions](HISTORICAL_RIVER_CONDITIONS.md) | UI and derived statistics are isHPPOpen features; history and provenance originate in the canonical source. |

`legacy` leaves the consumer on the prior feed. `shadow` compares RDP without making it authoritative. `rdp` selects the RDP path subject to each adapter's verified acceptance/failure rules. **Actual deployed values, acceptance evidence and release state must be checked separately**; implementation and merged documentation do not imply a production cutover. Source modes may differ across displays and alerts.

The existing [#51 consumer OpenSpec](../openspec/changes/unify-gauge-consumers/proposal.md) and [legacy retirement map](LEGACY_SCRAPER_RETIREMENT.md) govern source migrations and remaining scraper duties.

## River Tracer and replacement of Sewage Map

See the [Sewage Map compatibility inventory](SEWAGE-MAP-COMPATIBILITY.md) for exact legacy fields, consumers, reviewed-artifact requirements and the unresolved density gate before runtime-source removal.

Today the legacy scraper requests Sewage Map's **information-point GeoJSON** for downstream impact, picks a nearby HPP point, and extracts `properties.CSOs` as the HPP CSO IDs. That is an external relationship lookup, separate from Severn Trent's authoritative status source.

The [canonical RDP River Tracer OpenSpec](https://github.com/tclare95/river-data-platform/blob/main/openspec/changes/river-network-routing/proposal.md) (original [isHPPOpen proposal](../openspec/changes/river-network-routing/proposal.md) retained as a historical copy) includes both:
1. **Geometric output:** RDP-derived per-outfall downstream river LineString/MultiLineString and combined **map-ready GeoJSON FeatureCollections** of river sections potentially downstream of fresh reported active and explicit recent-completed CSO events.
2. **Relationship/info output:** upstream CSO IDs for a mapped river location, with attributed matching/coverage evidence and defensible counts.

The first enables a Sewage Map-style visualisation in RDP's own standalone map; the second can eventually replace isHPPOpen's HPP dependence on Sewage Map's information layer.

**Near-term HPP consumer:** [HPP River Explorer #114](../openspec/changes/hpp-river-explorer/proposal.md) proposes a HPP-anchored upstream/downstream map and named-river/catchment summaries using the River Tracer locate/upstream/downstream routes. This is a public isHPPOpen **view** of a scoped server-side IAM-protected RDP read, not a browser-anonymous RDP API and not a CSO source cutover. The current three River Tracer endpoints do not supply reviewed outfall relationships or active/recent CSO-impact overlays. Production caller access and public network-data redistribution licensing require independent verification.

**Sewage Map replacement planning:** [HPP River Explorer #114](../openspec/changes/hpp-river-explorer/proposal.md) also includes an independently gated consumer migration of HPP's `CSO_IDs` and count/density source away from Sewage Map's information point. A reviewed, RDP-generated static HPP membership is an acceptable first migration even if a reusable upstream-outfalls API is not yet available. The map itself does **not** switch the CSO source; legacy density calibration, historical charts, alerts, provider status and explicit #71 polling selection need separate compatibility evidence.

**Migration is not automatic.** HPP must compare canonical outfall IDs and network confidence against the legacy selection, resolve mismatches, review risk/calibration effects and approve a controlled cutover. A reviewed static membership artifact may remove runtime Sewage Map dependency before RDP's future upstream-outfall information read API is released. RDP discovery/mapping cannot silently change #71's explicit selected polling set. A downstream river corridor is **potential connectivity, not proof of water pollution or safe/unsafe conditions**.

## Cross-repository change and documentation rules

| Change | Canonical location | Consumer action |
| --- | --- | --- |
| Generic RDP data, CSO, spatial, forecast or platform API behaviour | [RDP product/OpenSpec home](https://github.com/tclare95/river-data-platform/tree/main/openspec) **for all canonical platform changes**, including observation history, CSO, rainfall, forecast publication and River Tracer; old suite copies are historical only. | Link the platform issue/spec, validate adapter/compatibility, adjust isHPPOpen only when needed. |
| HPP-specific risk, open/closed decisions, alerts, curated UI or read-mode migration | [isHPPOpen OpenSpec](../openspec/README.md), website docs and issue/PR. | Coordinate with the RDP contract without transferring site ownership. |
| Interface changes consumed by both | The owning **producer's tested contract** plus consumer-specific tests and rollout notes. | Prefer additive compatible change → shadow/parity → independently approved switch → later retirement. |
| Deployment / release | Each repository's runbooks and independent release gates. | No implicit AWS, Vercel, collection selection, source flip, scheduled job or credential change from a docs/spec merge. |

Historic suite-wide specifications are retained as noncanonical references to original acceptance history. **All RDP platform capabilities use RDP's maintained OpenSpec copies**; this repository continues to own site-specific consumer integrations, risk/alert presentation and source switches. For planning and repository guidance see [RDP documentation index](https://github.com/tclare95/river-data-platform/blob/main/docs/DOCUMENTATION.md), [this repository's OpenSpec README](../openspec/README.md) and [integration contract index](CONTRACTS.md).

## Where to look next

- isHPPOpen current behaviour: [architecture](ARCHITECTURE.md), [suite and deployments](SYSTEM.md), [contracts](CONTRACTS.md).
- RDP actual platform behaviour and release gates: [read API](https://github.com/tclare95/river-data-platform/blob/main/docs/READ-API.md), [production operations](https://github.com/tclare95/river-data-platform/blob/main/docs/PRODUCTION.md).
- App adapters and migration evidence: [#51-A](RDP-CLIENT-51A.md), [#51-B](RDP-TRENT-51B.md), [#51-C](RDP-LEVELS-51C.md), [#51-D](RDP-GAUGE-ALERTS-51D.md).
- Historical planning: [RDP direction](RIVER_DATA_PLATFORM_DIRECTION.md) is an **October architecture decision record**, not the latest standalone product plan.

## CSO consumer migration review (11 November 2026)

The producer now has six authenticated CSO read routes, event revisions, verified history and gap/coverage semantics. The production configuration selects four HPP Severn Trent outfalls and three Wessex Water test outfalls; a live read/health check remains necessary. The website's CSO status and time-varying density still depend on legacy Node/SQS/Mongo/Sewage Map. **The existing River Tracer overlay is delivered; do not replan it.**

See the [capability, dependency and migration review](WATER_QUALITY_CSO_RDP_PM_REVIEW.md) and the [consumer OpenSpec](../openspec/changes/rdp-cso-water-quality-consumer/proposal.md). The sequence is read-only shadow [#120](https://github.com/tclare95/isHPPOpen/issues/120), optional evidence-aware history [#121](https://github.com/tclare95/isHPPOpen/issues/121), independently gated membership/density [#114](https://github.com/tclare95/isHPPOpen/issues/114), and writer retirement [#68](https://github.com/tclare95/isHPPOpen/issues/68). Stage configuration or merged RDP code is not by itself evidence of a completed consumer cutover.
