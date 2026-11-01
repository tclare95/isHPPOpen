# Proposal: Independent HPP site status and transition events

**Tracking:** [#89](https://github.com/tclare95/isHPPOpen/issues/89), umbrella [#68](https://github.com/tclare95/isHPPOpen/issues/68). **Stage:** product specification; not approved for implementation or deployment.

## Why

The Node scraper currently applies the Colwick 2.2 m HPP threshold and appends changes to Mongo `openIndicator`. The web application derives HPP status, rolling closure durations and alerts from those sparse transitions. RDP's EA collector stores observations, but does **not** replace this site-specific business decision or historical event writer. Turning off the scraper would silently stop the event series.

## Agreed boundaries (1 November 2026)

- A **separately operated HPP service** consumes verified Colwick gauge observations from RDP and owns HPP threshold decisions and transition events. It is **not** a module/writer within RDP. The separate service's repository and technical deployment form are implementation design, not product requirements.
- Preserve the current threshold: **level below 2.2 m = open; at or above 2.2 m = closed**. A future rule change must be explicitly versioned and must not retrospectively rewrite historical decisions.
- When current evidence is stale, missing, conflicting or unverified, retain the last-known state but **do not infer a new transition** from fallback values. Expose uncertainty honestly.
- Preserve existing `openIndicator` history, carried-in status for 7/28/182/365-day closure windows, public `/api/hppstatus`, existing HPP alerts and delivery state. Follow [#63](https://github.com/tclare95/isHPPOpen/issues/63) for the existing rolling-year boundary bug rather than treating it as successful parity.

## Capabilities

- `hpp-site-status`: evidence-qualified current/last-known HPP state and threshold rule.
- `hpp-transition-history`: durable, auditable transitions with correct historical continuity and read behaviour.

## Non-goals

No new gauge collector, rewriting RDP, duplicating EA polling, new HPP admin UI, generic rules engine, retroactive recalculation of historical events, subscriber delivery changes, migration of Mongo/S3, Node schedule disablement or source activation. Initial scope is HPP only; multi-site generalisation needs a use case and separate decision.

## Compatibility and dependencies

The first HPP service requires approved, reliable RDP Colwick read access with matching identity, unit and datum (RDP [#69](https://github.com/tclare95/isHPPOpen/issues/69) and production read release gate). It does not require all six gauges, the full [#50](https://github.com/tclare95/isHPPOpen/issues/50) historical backfill or completed CSO work.

The existing [#51](https://github.com/tclare95/isHPPOpen/issues/51) gauge consumer migration **does not** transfer HPP ownership. [#47](https://github.com/tclare95/isHPPOpen/issues/47) alert reliability is a distinct prerequisite for any alert source cutover. Keep the Node writer and Mongo/web consumers authoritative through read-only shadow comparison, then approve a separate handoff.

See [design](design.md) and [tasks](tasks.md) for non-product decisions and acceptance evidence.
