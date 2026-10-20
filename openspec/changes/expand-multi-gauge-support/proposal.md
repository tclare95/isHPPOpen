# Proposal: Multi-gauge catalogue parity and reusable onboarding (#52)

## Why
RDP's current code registers Colwick level and Shardlow level/flow, while the isHPPOpen Trent dashboard already uses **six** series across five stations: Colwick, Clifton Bridge, Shardlow level+flow, Church Wilne and Kegworth. A complete #51 web migration requires those missing three platform measurements. RDP must also stand alone: isHPPOpen is its sole initial consumer, but a **future RDP playground** and possibly an independently designed external API will be additional consumers.

## Accepted decisions (20 October 2026)
- First deliver **existing six-series parity**, then prove one additional supported EA gauge can be registered through configuration and tests, not station-specific business logic. No obligation to operate a seventh gauge continuously.
- RDP owns canonical source/station/measurement IDs, upstream exact measure reference, parameter, unit/datum, expected reporting interval, provenance, ingestion health and internal read API discovery.
- Separate **registered**, **selected for collection in an environment** and **published for internal catalogue/read access**. Registration must not automatically poll a gauge, publish data, display it on isHPPOpen or enable notifications.
- isHPPOpen owns its own **curated** Trent dashboard group/order/labels/comparisons and alert eligibility, with explicit aliases to canonical RDP IDs. Adding a measurement to RDP does not require an isHPPOpen release.
- Keep first implementation EA **15-minute level/flow** measurements and verified supported units/datum. Other providers, rainfall, broader arbitrary intervals and a generic gauge UI are future changes, not speculative implementation.
- Preserve version-controlled registry with CI/startup validation, **staging allowlist of 1–3 manually selected measurements**, disabled schedules by default and no stage/prod data sharing. Production collection of six needs its own production-activation authorisation.
- The [#69](https://github.com/tclare95/isHPPOpen/issues/69) AWS_IAM first-party catalogue/latest/history/health endpoints are the shared contract. Do not expose public/anonymous APIs or individual Lambdas in this change.

## Capabilities
### New
- `multi-gauge-catalogue`: full six-series registry parity, independent catalogue/collection/publication and repeatable supported-gauge onboarding.

## Dependencies and ownership
RDP registry, source and API implementation: `tclare95/river-data-platform`, after [#49](https://github.com/tclare95/isHPPOpen/issues/49) and [#65](https://github.com/tclare95/isHPPOpen/issues/65); read contract [#69](https://github.com/tclare95/isHPPOpen/issues/69). isHPPOpen presentation/aliases are coordinated with [#51](https://github.com/tclare95/isHPPOpen/issues/51), not duplicated. #52's six-measure baseline is a prerequisite to full Trent cutover.

## Non-goals
No RDP playground UI ([#77](https://github.com/tclare95/isHPPOpen/issues/77)), public developer API ([#78](https://github.com/tclare95/isHPPOpen/issues/78)), admin console, automated station discovery/poll-everything, new provider adapter, hydrological routing, forecast migration or new isHPPOpen chart redesign.

## Release and rollback
Documentation only; plan implementation as RDP registry/onboarding tests followed by an isHPPOpen configuration/adapter alignment PR (coordinate with #51). Source catalogue changes can be deployed inertly; **collection, production IAM and consumer cutover require separate approvals**, with ability to disable newly selected measurements without deleting existing canonical history.
