// Pure summaries of RDP observed rainfall period totals for the /trentweirs#rainfall view. No I/O.
//
// Rules (RDP #54 read contract, isHPPOpen Wave C C2):
// - Each row is a 15-minute period total in mm at a provider *label*, never an instantaneous rate.
// - An absent or ineligible label is unknown, never zero. A total is stated only when every expected label in the
//   window is reported and eligible; otherwise the eligible sum is a lower bound ("at least") with a missing count.
// - Physical start/end times are stated only where RDP verified the label convention for every label in the window.

export const RAINFALL_PERIOD_MS = 15 * 60 * 1000;
const HOUR_MS = 3600000;

export function alignToPeriod(ms) {
  return Math.floor(ms / RAINFALL_PERIOD_MS) * RAINFALL_PERIOD_MS;
}

// Sums in thousandths of a millimetre so 0.1/0.2/0.01 mm steps do not accumulate floating-point drift.
export function sumMm(values) {
  return values.reduce((sum, value) => sum + Math.round(value * 1000), 0) / 1000;
}

function iso(ms) {
  return new Date(ms).toISOString();
}

// Counts over the expected 15-minute label grid [fromMs, toMs), comparable with RDP's `meta.window`.
export function countGrid(intervals, fromMs, toMs) {
  const inRange = intervals.filter((row) => row.labelMs >= fromMs && row.labelMs < toMs);
  const expected = Math.max(0, Math.ceil((toMs - fromMs) / RAINFALL_PERIOD_MS));
  const eligible = inRange.filter((row) => row.eligible).length;
  return { expected, reported: inRange.length, eligible, absent: expected - inRange.length, ineligible: inRange.length - eligible };
}

// Merged runs of absent or ineligible labels between two inclusive labels.
export function findGaps(intervals, firstLabelMs, lastLabelMs) {
  const byLabel = new Map(intervals.map((row) => [row.labelMs, row]));
  const gaps = [];
  for (let label = firstLabelMs; label <= lastLabelMs; label += RAINFALL_PERIOD_MS) {
    const row = byLabel.get(label);
    const reason = !row ? "absent" : row.eligible ? null : "ineligible";
    const previous = gaps.at(-1);
    if (!reason) continue;
    if (previous && previous.reason === reason && previous.toMs === label - RAINFALL_PERIOD_MS) {
      previous.toMs = label;
      previous.intervals += 1;
    } else {
      gaps.push({ fromMs: label, toMs: label, intervals: 1, reason });
    }
  }
  return gaps.map(({ fromMs, toMs, intervals: count, reason }) => ({ fromLabel: iso(fromMs), toLabel: iso(toMs), intervals: count, reason }));
}

// One accumulation window: `hours` of labels ending at (and including) `endLabelMs`.
export function summariseWindow(intervals, endLabelMs, hours) {
  const firstLabelMs = endLabelMs - hours * HOUR_MS + RAINFALL_PERIOD_MS;
  const counts = countGrid(intervals, firstLabelMs, endLabelMs + RAINFALL_PERIOD_MS);
  const rows = intervals.filter((row) => row.labelMs >= firstLabelMs && row.labelMs <= endLabelMs);
  const status = counts.reported === 0 ? "empty" : counts.eligible === counts.expected ? "complete" : "incomplete";
  const reportedMm = status === "empty" ? null : sumMm(rows.filter((row) => row.eligible).map((row) => row.totalMm));
  const conventions = new Set(rows.map((row) => row.labelConvention));
  const convention = conventions.size === 0 ? null : conventions.size > 1 ? "mixed" : [...conventions][0];
  const verified = status === "complete" && (convention === "period_end" || convention === "period_start");
  return {
    hours,
    firstLabel: iso(firstLabelMs),
    lastLabel: iso(endLabelMs),
    expected: counts.expected,
    reported: counts.reported,
    missing: counts.expected - counts.eligible,
    ineligible: counts.ineligible,
    status,
    // Only a complete window has a total. Otherwise `reportedMm` is a lower bound over the reported intervals.
    totalMm: status === "complete" ? reportedMm : null,
    reportedMm,
    labelConvention: convention,
    periodStart: verified ? rows[0].periodStart : null,
    periodEnd: verified ? rows.at(-1).periodEnd : null,
  };
}

/**
 * Summarises one gauge's validated intervals over the read range [fromMs, toMs).
 * Windows end at the newest reported label (EA telemetry normally arrives 30-70 minutes late in batches), so the
 * not-yet-delivered tail is reported as `pending` rather than counted as missing. When the newest label is older
 * than `maxAnchorLagMs` (or nothing was reported), windows end at the newest expected label instead, and the
 * undelivered labels count as missing.
 */
export function summariseGauge(intervals, { fromMs, toMs, windowHours, maxAnchorLagMs }) {
  const lastExpectedMs = toMs - RAINFALL_PERIOD_MS;
  const newestMs = intervals.length ? intervals.at(-1).labelMs : null;
  const anchoredOnLatest = newestMs !== null && lastExpectedMs - newestMs <= maxAnchorLagMs;
  const anchorMs = anchoredOnLatest ? newestMs : lastExpectedMs;
  return {
    latestReportedLabel: newestMs === null ? null : iso(newestMs),
    windowsEndAt: iso(anchorMs),
    windowsEndAtLatestReport: anchoredOnLatest,
    pending: anchoredOnLatest ? (lastExpectedMs - anchorMs) / RAINFALL_PERIOD_MS : 0,
    windows: windowHours.map((hours) => summariseWindow(intervals, anchorMs, hours)),
    gaps: findGaps(intervals, fromMs, anchorMs),
    revised: intervals.filter((row) => row.revision > 1).length,
    intervals: intervals.map((row) => ({
      label: row.label,
      labelConvention: row.labelConvention,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      totalMm: row.totalMm,
      eligible: row.eligible,
      revised: row.revision > 1,
    })),
  };
}
