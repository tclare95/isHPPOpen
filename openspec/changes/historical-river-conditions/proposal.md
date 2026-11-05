# Proposal: Historical river conditions and HPP threshold context

**Tracking:** [#104](https://github.com/tclare95/isHPPOpen/issues/104); historical evidence [#50](https://github.com/tclare95/isHPPOpen/issues/50). **Status:** proposed product capability; no implementation or release approval.

## Why

isHPPOpen is useful for current Colwick levels and forecasts but offers little navigable history. Its homepage includes **hard-coded** 2012–2026 historical HPP closure tables in `components/layout/frontpage/statusarea.js`. RDP can now serve canonical history from its 365-day hot store and permanent S3 archive, and its importer reports **350,688 production Colwick observations for 2016–2025** ([RDP #39](https://github.com/tclare95/river-data-platform/pull/39); operator record PR still awaiting merge as of 5 November). The website should turn this history into trustworthy, understandable river conditions rather than introducing an unrelated platform.

## Product outcome

A visitor can select a Colwick month or year, explore observed river levels, see how much **supported observed time** was at/above HPP's **2.2 m river-level rule**, and compare that period or today's level with historical seasons. Historical statistics are labelled as **level-derived conditions**, *not* verified operational HPP closures. The existing live HPP status, `openIndicator` transitions, alerts and course/event restrictions remain distinct.

The first release is intentionally **Colwick only** (`ea-colwick-level`, mASD/ASD). It can include:

- A historical level chart with month/year navigation, date-range selection and detail drill-down at native resolution.
- Monthly/yearly summaries of eligible observed level and time relative to the 2.2 m boundary, with available/unknown interval context.
- Seasonal context: median and percentile bands from sufficiently comparable historical years; simple "typical for this time of year" messaging where supported.
- Replacing the static homepage historical tables with measured, attributable statistics after reconciliation. Preserve the existing rolling 7/28/182/365-day *transition-based* reporting separately.

## Accuracy principles

- Treat missing, source-outage, partial/unverified or unreadable intervals as **unknown**, never zero level, open, or closed. Do not turn a sampling count or S3 integrity proof into a claim of continuous official coverage.
- Show the period, measurement, datum, quality/provenance caveats, and denominator for every percentage. Where evidence is insufficient, display partial/unknown or withhold comparisons.
- The imported qualified EA history may contain provider-edited values. It is **not** a reconstruction of exactly what a visitor saw at the time.
- Revisions can change a derived summary. Use refreshed evidence, without rewriting operational HPP event history or emitting historical notifications.

## Boundaries and dependencies

- **Owner/runtime:** product specification in `tclare95/isHPPOpen`, display and read-facing implementation in its Next.js app; `tclare95/river-data-platform` remains the observation source.
- **Read contract:** [#69](https://github.com/tclare95/isHPPOpen/issues/69) serves private AWS_IAM range reads with 366-day max windows, pagination and 30-minute cursors. The existing isHPPOpen server-only RDP client is reusable; browser credentials and a public RDP API are **not** required.
- **History:** [#50](https://github.com/tclare95/isHPPOpen/issues/50) supplies reviewed imports; `coverage.json` is currently empty on RDP main. Publication of formally approved coverage remains a separate reviewed step, not implied by this change. Production P6 API/federation were reported and verified in [#81](https://github.com/tclare95/isHPPOpen/issues/81) comments, but this specification does not switch a live website source.
- **HPP:** [#89](https://github.com/tclare95/isHPPOpen/issues/89) owns authoritative site state and transitions; this change computes retrospective river-level evidence only.
- **Related future work:** [historical event explorer #105](https://github.com/tclare95/isHPPOpen/issues/105), [RDP playground #77](https://github.com/tclare95/isHPPOpen/issues/77).

## Explicit non-goals

No historical alert replay, HPP operational event reconstruction, forecast retraining, new ingest provider, rainfall dependency, speculative return-period claims, mandated analytics database, multi-gauge backfill, public API, change to the 2.2 m HPP rule, source cutover, Vercel/AWS configuration, or production data mutation.

**This OpenSpec and its PR are documentation only.** Implementation, any additional read permissions, operational cutovers and deployments require separately reviewed work.
