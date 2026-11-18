# Current river conditions summary (Wave C / C3)

The homepage shows **"Conditions now and next 24 hours"** directly under the "Is HPP Open?" title
(`components/layout/frontpage/currentConditions.js`, logic in `libs/currentConditions.js`). It implements
[`current-river-conditions`](../openspec/changes/wave-c-rdp-product-features/specs/current-river-conditions/spec.md).
It replaces the old "The river level is …" headline and reading-age line; the chart, weir hints and water-quality
tile stay as they were.

## What it shows

| Part | Source (existing route, read with SWR every 15 minutes) | Rules |
| --- | --- | --- |
| HPP status | `/api/hppstatus`, plus today's events | The recorded `openIndicator` status, with an event closure first, exactly as the title. Unavailable/unknown are said so and never inferred from the level or forecast. |
| Colwick level now | `/api/levels` | Latest reading, its time and age, recent movement and its relation to the 2.2 m guide level. A fresh reading on the other side of 2.2 m from the recorded status is shown as a disagreement; the recorded status still stands. |
| Next 24 hours (model forecast) | `/api/s3forecast`, `/api/forecastaccuracy` | Direction over the coming 24 hours, the highest (or, when falling, lowest) predicted level and its indicative ~95% range (the same band as the chart, `libs/forecastConfidence.js`). A predicted crossing of 2.2 m is worded as a prediction, never an announced closure or reopening. |
| Nearby and upstream gauges | `/api/trentweirs` | Clifton Bridge, Shardlow, Church Wilne, Kegworth (levels) and Shardlow flow, one row each, in its own units. Levels are metres above each gauge's own datum and are never placed on a shared height scale or compared with Colwick's 2.2 m. |

Links go to `/trentweirs`, `/forecastinfo`, `/history`, `/trentweirs#rainfall` ("Recent rainfall", C2) and
`/waterquality`. No new API or RDP read was added; RDP stays server-side behind the existing routes.

## Freshness and honest degradation

- Every reading shows its observed time and age next to the value; at two hours or older (the homepage's existing
  notice threshold, allowing for EA publication lag) it is a "may be out of date" warning. The forecast shows when
  it was made and uses the existing one-hour forecast staleness notice.
- **Recent movement** compares the latest reading with the one closest to two hours earlier. It is "unknown" (never
  "steady") unless a reading lies within 20 minutes of the window start and no gap inside the window exceeds
  45 minutes. Changes under 2 cm (2 m³/s for flow) are "steady". The period ends at the latest reading.
- Each part loads and fails independently: loading shows no number, change or status; a failed source says it is
  unavailable while the others keep their evidence; saved Trent readings after a failed refresh keep their ages;
  a gauge missing from the payload is listed as "No recent reading", never filled from another gauge.

## Boundaries

No HPP status logic, alert rule, source authority or forecast generation changed. There is no composite score.
The `/trentweirs` comparison chart is unchanged; its gauge snapshots now note that levels are on separate datums.
