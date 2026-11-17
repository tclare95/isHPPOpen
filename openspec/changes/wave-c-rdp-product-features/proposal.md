# Proposal: Wave C — useful RDP-powered features for isHPPOpen

## Why
RDP's historical observations, rainfall period totals, CSO event/status evidence and river-network relationships enable better explanations of conditions around Holme Pierrepont. isHPPOpen already has a level history explorer, high-water events, forecast, water-quality map, event history and River Tracer overlays. Extend those existing experiences instead of creating competing dashboards.

Wave C defines four independent **isHPPOpen user-facing capabilities**. It does not change RDP's producer contracts or own generic platform features.

## Product outcomes
1. **Compare historical high-water events:** a visitor can select two supported Colwick events and understand how their level curves, peaks, durations and uncertainty compare.
2. **Understand observed rainfall in river context:** a visitor can see relevant recent rainfall alongside observed river levels, correctly treated as interval totals with gaps and lag.
3. **Understand current conditions quickly:** a paddler sees a concise, trustworthy synthesis of HPP status, observed river level/trend, forecast and selected nearby gauges, with source freshness and clear routes into detail.
4. **Explore an individual storm overflow:** from the existing CSO map or history, a visitor can open a shareable, focused outfall view with its current evidence, reported events and downstream context.

## Scope and ownership
This specification covers isHPPOpen consumer behaviour only:
- Existing historical explorer and event pages
- Existing current river/Trent/forecast presentation
- Existing water-quality map, CSO history and River Tracer
- The site's authenticated, server-side RDP client and public-facing adapters

RDP owns measurement registration and units, rainfall interval conventions, historical evidence, CSO current state/events/coverage, outlet identity, river-network releases and routing. The independent Python predictor owns forecast generation; this change does not move or rerun inference.

## Existing specifications
Build on, rather than repeat:
- `historical-river-conditions` and `historical-river-events` for qualified historical event evidence.
- `hpp-river-explorer`, `rdp-cso-water-quality-consumer` and Wave A `cso-history-browsing` for the existing water-quality and routing experience.
- Wave A's site presentation/correctness and Wave B's administrative/alerting changes.
- Canonical RDP rainfall, observation, CSO and River Tracer specifications **in the RDP repository**.

## Non-goals
No new generic river explorer, new flood/safety warning, HPP status/2.2m rule change, new predictive travel-time or rainfall-to-level model, forecast retraining, RDP measure registration/selection/backfill, CSO collector or catalogue changes, new pollution-risk calibration, new alert types, public direct AWS/RDP credentials, or backend deployment.

Features can be delivered independently. Missing or unverified producer evidence must be shown as a limitation, not fabricated or silently supplemented from an unrelated source.
