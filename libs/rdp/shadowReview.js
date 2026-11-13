// Pure summary of exported shadow log lines (#51 activation review). No I/O, no credentials:
// `scripts/rdp-shadow-review.mjs` feeds it `vercel logs --json` rows. Only the fixed public
// report JSON that the shadow paths already log is read.

export const TRENT_SERIES_KEYS = Object.freeze(["4009-level", "4126-level", "4007-level", "4067-level", "4074-level", "4007-flow"]);
export const BLOCKING_RDP_ERRORS = Object.freeze(["AUTHENTICATION_FAILED", "AUTHORIZATION_FAILED", "RESPONSE_CONTRACT_ERROR", "ARCHIVE_INTEGRITY"]);
export const REVIEW_MIN_HOURS = 48;
export const TYPICAL_LAG_LIMIT_SECONDS = 900;

const MARKERS = Object.freeze({
  trent: "RDP Trent shadow comparison ",
  levels: "RDP levels shadow comparison ",
  gauge: "RDP gauge alert shadow comparison ",
});

export function parseShadowMessage(message) {
  if (typeof message !== "string") return null;
  for (const [kind, marker] of Object.entries(MARKERS)) {
    const index = message.indexOf(marker);
    if (index === -1) continue;
    try {
      return { kind, report: JSON.parse(message.slice(index + marker.length)) };
    } catch {
      return { kind, report: null };
    }
  }
  return null;
}

const increment = (counter, key, by = 1) => { counter[key] = (counter[key] ?? 0) + by; };

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function newSeriesSummary() {
  return { comparisons: 0, statuses: {}, valueMismatches: 0, mismatchSamples: [], missingInRdp: 0, missingInLegacy: 0, legacyDuplicates: 0, rdpDuplicates: 0, rdpErrors: {}, lags: [], rdpStates: {}, legacyStates: {} };
}

function addSeries(summary, entry) {
  summary.comparisons++;
  increment(summary.statuses, entry.status);
  summary.valueMismatches += entry.valueMismatches ?? 0;
  if (summary.mismatchSamples.length < 3) summary.mismatchSamples.push(...(entry.mismatchSamples ?? []).slice(0, 3 - summary.mismatchSamples.length));
  summary.missingInRdp += entry.missingInRdp ?? 0;
  summary.missingInLegacy += entry.missingInLegacy ?? 0;
  summary.legacyDuplicates += entry.legacyDuplicates ?? 0;
  summary.rdpDuplicates += entry.rdpDuplicates ?? 0;
  if (entry.rdpError) increment(summary.rdpErrors, entry.rdpError);
  if (Number.isFinite(entry.latestLagSeconds)) summary.lags.push(entry.latestLagSeconds);
  if (entry.rdpState) increment(summary.rdpStates, entry.rdpState);
  if (entry.legacyState) increment(summary.legacyStates, entry.legacyState);
}

function finishSeries(summary) {
  const { lags, ...rest } = summary;
  return { ...rest, medianLagSeconds: median(lags), maxLagSeconds: lags.length ? Math.max(...lags) : null };
}

function window(times) {
  if (!times.length) return { first: null, last: null, hours: 0 };
  const first = Math.min(...times);
  const last = Math.max(...times);
  return { first: new Date(first).toISOString(), last: new Date(last).toISOString(), hours: Math.round((last - first) / 360000) / 10 };
}

// rows: [{ id?, timestamp, deploymentId?, message }]; duplicate ids (overlapping exports) count once.
export function summariseShadowRows(rows) {
  const seen = new Set();
  const display = { trent: { times: [], unparsed: 0, deployments: {}, series: {} }, levels: { times: [], unparsed: 0, deployments: {}, series: {} } };
  const gauge = { times: [], unparsed: 0, deployments: {}, runs: 0, rdpRead: {}, agreed: 0, disagreed: 0, pendingDisagreed: 0, gauges: {} };

  for (const row of rows) {
    if (row?.id) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
    }
    const parsed = parseShadowMessage(row?.message);
    if (!parsed) continue;
    const target = parsed.kind === "gauge" ? gauge : display[parsed.kind];
    if (!parsed.report) { target.unparsed++; continue; }
    if (Number.isFinite(row.timestamp)) target.times.push(row.timestamp);
    if (row.deploymentId) increment(target.deployments, row.deploymentId);

    if (parsed.kind === "gauge") {
      const report = parsed.report;
      gauge.runs++;
      increment(gauge.rdpRead, report.rdpRead ?? "unknown");
      gauge.agreed += report.decisions?.agreed ?? 0;
      gauge.disagreed += report.decisions?.disagreed ?? 0;
      gauge.pendingDisagreed += report.decisions?.pendingDisagreed ?? 0;
      for (const [key, entry] of Object.entries(report.gauges ?? {})) {
        const summary = gauge.gauges[key] ??= { runs: 0, valueMismatches: 0, legacyOnly: 0, rdpOnly: 0, nonZeroLag: 0, legacy: {}, rdp: {}, legacyErrors: {}, rdpErrors: {}, rdpAgeMinutes: [] };
        summary.runs++;
        summary.valueMismatches += entry.comparison?.valueMismatches ?? 0;
        summary.legacyOnly += entry.comparison?.legacyOnly ?? 0;
        summary.rdpOnly += entry.comparison?.rdpOnly ?? 0;
        if (![0, null, undefined].includes(entry.comparison?.newestLagSeconds)) summary.nonZeroLag++;
        increment(summary.legacy, entry.legacy?.status ?? "unknown");
        increment(summary.rdp, entry.rdp?.status ?? "unknown");
        if (entry.legacy?.error) increment(summary.legacyErrors, entry.legacy.error);
        if (entry.rdp?.error) increment(summary.rdpErrors, entry.rdp.error);
        if (Number.isFinite(entry.rdp?.ageSeconds)) summary.rdpAgeMinutes.push(Math.floor(entry.rdp.ageSeconds / 60));
      }
      continue;
    }

    const entries = Array.isArray(parsed.report.series) ? parsed.report.series : parsed.report.series ? [parsed.report.series] : [];
    for (const entry of entries) addSeries(target.series[entry.key] ??= newSeriesSummary(), entry);
  }

  const finishDisplay = ({ times, series, ...rest }) => ({
    ...rest, comparisons: Object.values(series).reduce((max, entry) => Math.max(max, entry.comparisons), 0), window: window(times),
    series: Object.fromEntries(Object.entries(series).map(([key, value]) => [key, finishSeries(value)])),
  });
  const { times: gaugeTimes, gauges, ...gaugeRest } = gauge;

  return {
    trent: finishDisplay(display.trent),
    levels: finishDisplay(display.levels),
    gauge: {
      ...gaugeRest, window: window(gaugeTimes),
      gauges: Object.fromEntries(Object.entries(gauges).map(([key, { rdpAgeMinutes, ...value }]) => [key, { ...value, medianRdpAgeMinutes: median(rdpAgeMinutes) }])),
    },
  };
}

// The documented 48h display gate (RDP-TRENT-51B.md / RDP-LEVELS-51C.md). `gaps` and `duplicate_instants`
// are listed for classification, not failed automatically; everything else that fails is a blocker.
export function evaluateDisplayGate(display, expectedKeys) {
  const blockers = [];
  const notes = [];
  if (display.window.hours < REVIEW_MIN_HOURS) blockers.push(`only ${display.window.hours}h of shadow comparisons (need ${REVIEW_MIN_HOURS}h)`);
  for (const key of expectedKeys) {
    const series = display.series[key];
    if (!series) { blockers.push(`${key}: no comparisons`); continue; }
    if (series.valueMismatches > 0) blockers.push(`${key}: ${series.valueMismatches} value mismatches`);
    for (const code of BLOCKING_RDP_ERRORS) if (series.rdpErrors[code]) blockers.push(`${key}: ${series.rdpErrors[code]} × ${code}`);
    const errorRuns = Object.values(series.rdpErrors).reduce((sum, count) => sum + count, 0);
    if (errorRuns * 2 > series.comparisons) blockers.push(`${key}: RDP unavailable in ${errorRuns}/${series.comparisons} comparisons`);
    if (series.medianLagSeconds !== null && series.medianLagSeconds > TYPICAL_LAG_LIMIT_SECONDS) blockers.push(`${key}: median lag ${series.medianLagSeconds}s`);
    if (series.missingInRdp || series.missingInLegacy) notes.push(`${key}: classify gaps (missingInRdp ${series.missingInRdp}, missingInLegacy ${series.missingInLegacy})`);
    if (series.legacyDuplicates) notes.push(`${key}: legacy repeated instants ${series.legacyDuplicates} (scraper spelling merge, not an RDP fault)`);
    if (series.rdpDuplicates) blockers.push(`${key}: RDP repeated instants ${series.rdpDuplicates}`);
  }
  return { pass: blockers.length === 0, blockers, notes };
}

// Readiness facts for an authoritative gauge-alert switch; shadow agreement alone is not enough
// when neither source is ever fresh enough to evaluate.
export function evaluateGaugeShadow(gauge) {
  const blockers = [];
  const notes = [];
  if (gauge.window.hours < REVIEW_MIN_HOURS) blockers.push(`only ${gauge.window.hours}h of alert shadow runs (need ${REVIEW_MIN_HOURS}h)`);
  if (gauge.disagreed || gauge.pendingDisagreed) blockers.push(`${gauge.disagreed} disagreed / ${gauge.pendingDisagreed} pending-disagreed decisions`);
  for (const [key, entry] of Object.entries(gauge.gauges)) {
    if (entry.valueMismatches) blockers.push(`${key}: ${entry.valueMismatches} value mismatches`);
    const rdpFresh = entry.rdp.fresh ?? 0;
    if (rdpFresh * 2 < entry.runs) blockers.push(`${key}: RDP fresh in only ${rdpFresh}/${entry.runs} runs (median age ${entry.medianRdpAgeMinutes} min); live rules would mostly be skipped`);
    const legacyErrors = Object.values(entry.legacyErrors).reduce((sum, count) => sum + count, 0);
    if (legacyErrors) notes.push(`${key}: legacy alert-safe read failed in ${legacyErrors}/${entry.runs} runs ${JSON.stringify(entry.legacyErrors)}`);
  }
  return { pass: blockers.length === 0, blockers, notes };
}

// Exact-timestamp comparison of RDP history rows ([epochSeconds, value, …]) with EA items.
export function compareObservedWithEa(rdpRows, eaItems) {
  const rdp = new Map(rdpRows.map(([seconds, value]) => [seconds * 1000, value]));
  const ea = new Map(eaItems.map((item) => [Date.parse(item.dateTime), Number(item.value)]));
  if (!rdp.size || !ea.size) return { status: !rdp.size ? "rdp_missing" : "ea_missing", matched: 0 };
  const start = Math.max(Math.min(...rdp.keys()), Math.min(...ea.keys()));
  const end = Math.min(Math.max(...rdp.keys()), Math.max(...ea.keys()));
  const report = { matched: 0, valueMismatches: 0, mismatchSamples: [], missingInRdp: [], missingInEa: [], from: new Date(start).toISOString(), to: new Date(end).toISOString() };
  for (const [time, value] of ea) {
    if (time < start || time > end) continue;
    if (!rdp.has(time)) { report.missingInRdp.push(new Date(time).toISOString()); continue; }
    report.matched++;
    if (Math.abs(rdp.get(time) - value) > 1e-9) {
      report.valueMismatches++;
      if (report.mismatchSamples.length < 3) report.mismatchSamples.push({ dateTime: new Date(time).toISOString(), rdp: rdp.get(time), ea: value });
    }
  }
  for (const time of rdp.keys()) if (time >= start && time <= end && !ea.has(time)) report.missingInEa.push(new Date(time).toISOString());
  report.status = report.valueMismatches ? "value_mismatch" : report.missingInRdp.length || report.missingInEa.length ? "gaps" : "match";
  return { ...report, missingInRdp: report.missingInRdp.slice(0, 10), missingInEa: report.missingInEa.slice(0, 10), missingInRdpCount: report.missingInRdp.length, missingInEaCount: report.missingInEa.length };
}
