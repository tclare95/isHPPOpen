// HPP water-quality assessment v1: recent upstream storm-overflow activity plus river conditions, from River Data
// Platform evidence. Pure: no I/O, no clock, no environment. The same functions build the current indication, its
// history, the alert decision and the tests. See docs/RDP-WATER-QUALITY-ASSESSMENT.md.
//
// It deliberately does not reproduce Sewage Map's `number_CSOs_per_km2` (D8 raster cells over a raster drainage area).
// Its numbers are counts of reviewed upstream outfalls, on a different scale: never compare, splice or convert them
// to legacy density values or legacy thresholds.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

// Every number here is a product decision, versioned together. Changing any of them is a new version (the alert
// evaluator re-enrols rules on a version change instead of notifying from the change itself).
export const ASSESSMENT_METHOD = Object.freeze({
  version: 'hpp-upstream-activity/v1',
  // Outfalls that spilled at any time in this trailing window still count: sewage takes time to travel down the
  // catchment, and Sewage Map's legacy layer used the same "now or in the last 48 hours" population.
  recentHours: 48,
  bands: Object.freeze({
    elevated: Object.freeze({ spillingNow: 3, recent: 15 }),
    high: Object.freeze({ spillingNow: 10, recent: 60 }),
  }),
  // Up to this share of outfalls without usable evidence may be absent from a "Lower" indication, which is then
  // marked partial. Beyond it, "Lower" cannot be shown: missing evidence is never read as no spill.
  maxUnknownShareForLower: 0.05,
  // The newest set read must be this recent to describe "now".
  maxEvidenceAgeMinutes: 30,
  // A collection gap that opened within this of the read is the next poll not having run yet (RDP coverage rule).
  collectionToleranceMinutes: 45,
  // River conditions at Colwick: the median level over the last 6 hours against the median over the same 6 hours a day
  // earlier. At low flow Colwick follows a regulated daily cycle of about 0.1-0.2 m, which a short-window rise (the
  // legacy 4-hour rule) mistakes for runoff; comparing the same time of day cancels it. Dry days in the 2026-11-16
  // sample stay within +/-0.035 m; the rise after the 15 November rain reached +0.16 m.
  runoff: Object.freeze({
    windowHours: 6,
    comparisonLagHours: 24,
    minimumReadings: 12,
    elevatedRiseMetres: 0.1,
    highRiseMetres: 0.3,
    // RDP level observations arrive about 20-35 minutes after the observed time.
    freshMinutes: 90,
  }),
  historyStepMinutes: 60,
});

export const ASSESSMENT_LEVELS = Object.freeze(['lower', 'elevated', 'high']);
export const LEVEL_LABELS = Object.freeze({ lower: 'Lower', elevated: 'Elevated', high: 'High indication', unavailable: 'Unavailable' });
const RANK = { unavailable: -1, lower: 0, elevated: 1, high: 2 };
export const levelRank = (level) => RANK[level] ?? -1;
const maxLevel = (a, b) => (levelRank(a) >= levelRank(b) ? a : b);

const time = (value) => {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};
const iso = (ms) => new Date(ms).toISOString();

/** Band for a pair of counts. */
export function activityLevel(spillingNow, recent, bands = ASSESSMENT_METHOD.bands) {
  if (spillingNow >= bands.high.spillingNow || recent >= bands.high.recent) return 'high';
  if (spillingNow >= bands.elevated.spillingNow || recent >= bands.elevated.recent) return 'elevated';
  return 'lower';
}

/**
 * One outfall's evidence at instant `at`, from a set-activity item (status + windowed events + coverage).
 * Returns `{ recent, spilling, reason }` where `recent`/`spilling` are 'yes' | 'no' | 'unknown'.
 * - Spilling and recent activity come only from provider-reported events (or, for the live point, a fresh
 *   spilling status). An event without a reported end counts as recent only when it certainly overlaps the window.
 * - "No" needs positive evidence: collection covering the whole window, no ambiguous or truncated events, and for
 *   the live point a fresh, online, non-contradictory status. Anything else is unknown, never "no".
 */
export function outfallEvidenceAt(item, at, { readFrom, readAt, live = false, method = ASSESSMENT_METHOD } = {}) {
  if (!item) return { recent: 'unknown', spilling: 'unknown', reason: 'not_read' };
  const windowStart = at - method.recentHours * HOUR_MS;
  const status = item.status ?? null;
  const liveSpilling = live && status?.status === 'available' && status.freshness === 'fresh'
    && status.effectiveState === 'spilling' && status.reportedState === 'spilling';

  let recent = 'no';
  let spilling = liveSpilling ? 'yes' : 'no';
  if (liveSpilling) recent = 'yes';
  const events = item.events?.events;
  if (!Array.isArray(events)) {
    return liveSpilling ? { recent, spilling, reason: 'spilling' } : { recent: 'unknown', spilling: 'unknown', reason: 'events_unavailable' };
  }

  for (const event of events) {
    const start = time(event.startedAt);
    if (start === null || start > at) continue;
    const reportedEnd = event.lifecycle === 'completed' && event.boundaryProvenance === 'provider_reported' ? time(event.endedAt) : null;
    if (event.lifecycle === 'ongoing') {
      recent = 'yes';
      spilling = 'yes';
    } else if (reportedEnd !== null) {
      if (reportedEnd > windowStart) recent = 'yes';
      if (reportedEnd > at && spilling !== 'yes') spilling = 'yes';
    } else {
      // End not reported: it ended no later than `endNoLaterThan` (or is unresolved now).
      const latestEnd = time(event.endNoLaterThan) ?? Number.POSITIVE_INFINITY;
      if (start >= windowStart) recent = 'yes';
      else if (latestEnd > windowStart && recent !== 'yes') recent = 'unknown';
      if (latestEnd > at && spilling === 'no') spilling = 'unknown';
    }
  }
  if (recent === 'yes') return { recent, spilling, reason: spilling === 'yes' ? 'spilling' : 'recent_spill' };
  if (recent === 'unknown') return { recent, spilling, reason: 'event_end_unknown' };

  // No recorded spill in the window: prove it was watched throughout.
  if (item.events.truncated) return { recent: 'unknown', spilling: 'unknown', reason: 'events_truncated' };
  if (live) {
    if (!status || status.status !== 'available') return { recent: 'unknown', spilling: 'unknown', reason: status?.status ?? 'status_not_read' };
    if (status.reportedState === 'offline') return { recent: 'unknown', spilling: 'unknown', reason: 'offline' };
    if (status.freshness !== 'fresh') return { recent: 'unknown', spilling: 'unknown', reason: 'stale' };
    if (status.effectiveState !== 'not_spilling' || status.reportedState !== 'not_spilling') return { recent: 'unknown', spilling: 'unknown', reason: 'contradictory' };
  }
  const coverage = item.events.coverage;
  if (!coverage || coverage.status === 'unknown') return { recent: 'unknown', spilling: 'unknown', reason: 'coverage_unknown' };
  const from = time(readFrom);
  if (from === null || from > windowStart) return { recent: 'unknown', spilling: 'unknown', reason: 'outside_read_window' };
  const pendingSince = (readAt ?? at) - method.collectionToleranceMinutes * MINUTE_MS;
  const uncovered = (coverage.gaps ?? []).some((gap) => {
    const gapFrom = time(gap.from);
    const gapTo = time(gap.to);
    if (gapFrom === null || gapTo === null) return true;
    if (gapFrom >= pendingSince) return false; // the next poll has not run yet
    return gapFrom < at && gapTo > windowStart;
  });
  if (uncovered) return { recent: 'unknown', spilling: 'unknown', reason: 'not_collected' };
  return { recent: 'no', spilling, reason: spilling === 'unknown' ? 'event_end_unknown' : 'no_recent_spill' };
}

/**
 * The upstream-activity factor at `at` over the reviewed membership. `items` maps canonical asset ID to the set
 * read's item. Counts are bounds: `min` is recorded evidence, `max` adds every outfall whose evidence is unknown.
 */
export function assessUpstreamActivity({ memberIds, items, at, readFrom, readAt, live = false, method = ASSESSMENT_METHOD }) {
  const total = memberIds.length;
  const base = { factor: 'upstream_cso', observedAt: Number.isFinite(at) ? iso(at) : null, members: total };
  if (!total || !Number.isFinite(at)) {
    return { ...base, level: 'unavailable', reason: 'Upstream storm-overflow evidence is unavailable.', unavailableReason: 'no_evidence' };
  }
  const recent = { min: 0, max: 0 };
  const spillingNow = { min: 0, max: 0 };
  const unknownReasons = {};
  let unknown = 0;
  for (const id of memberIds) {
    const evidence = outfallEvidenceAt(items.get(id), at, { readFrom, readAt, live, method });
    if (evidence.recent === 'yes') recent.min += 1;
    if (evidence.recent !== 'no') recent.max += 1;
    if (evidence.spilling === 'yes') spillingNow.min += 1;
    if (evidence.spilling !== 'no') spillingNow.max += 1;
    if (evidence.recent === 'unknown') {
      unknown += 1;
      unknownReasons[evidence.reason] = (unknownReasons[evidence.reason] ?? 0) + 1;
    }
  }
  const unknownShare = unknown / total;
  const lowest = activityLevel(spillingNow.min, recent.min, method.bands);
  const highest = activityLevel(spillingNow.max, recent.max, method.bands);
  const counts = { recent, spillingNow, unknown, unknownShare: Math.round(unknownShare * 1000) / 1000, unknownReasons };

  let level = lowest;
  let atLeast = false;
  if (lowest !== highest) {
    if (lowest === 'lower' && unknownShare > method.maxUnknownShareForLower) {
      return {
        ...base, ...counts, level: 'unavailable', possibleLevels: [lowest, highest], unavailableReason: 'insufficient_evidence',
        reason: `Too many upstream outfalls (${unknown} of ${total}) have no usable recent evidence to rule out higher activity.`,
      };
    }
    atLeast = lowest !== 'lower';
  }
  const partial = unknown > 0;
  const lead = `${recent.min} of ${total} reviewed upstream storm overflows spilled in the last ${method.recentHours} hours; ${spillingNow.min} ${spillingNow.min === 1 ? 'was' : 'were'} spilling at the time.`;
  const tail = partial ? ` ${unknown} had no usable evidence, so activity may be higher.` : '';
  return { ...base, ...counts, level, atLeast, partial, possibleLevels: [lowest, highest], reason: `${lead}${tail}` };
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** The river-conditions factor at `at`, from readings at or before `at` only. */
export function assessRiverConditions(levelData = [], at, method = ASSESSMENT_METHOD) {
  const rule = method.runoff;
  const base = { factor: 'river_rise' };
  const readings = levelData.map((row) => ({ at: time(row?.reading_date), value: Number(row?.reading_level) }))
    .filter((row) => row.at !== null && Number.isFinite(row.value) && row.at <= at);
  const newest = readings.reduce((latest, row) => (!latest || row.at > latest.at ? row : latest), null);
  if (!newest || at - newest.at > rule.freshMinutes * MINUTE_MS) {
    return { ...base, level: 'unavailable', riseMetres: null, observedAt: newest ? iso(newest.at) : null, reason: 'Recent river-level data is unavailable.' };
  }
  const span = rule.windowHours * HOUR_MS;
  const lag = rule.comparisonLagHours * HOUR_MS;
  const inWindow = (end) => readings.filter((row) => row.at > end - span && row.at <= end).map((row) => row.value);
  const recent = inWindow(newest.at);
  const earlier = inWindow(newest.at - lag);
  if (recent.length < rule.minimumReadings || earlier.length < rule.minimumReadings) {
    return { ...base, level: 'unavailable', riseMetres: null, observedAt: iso(newest.at), reason: `Not enough river-level readings to compare with ${rule.comparisonLagHours} hours earlier.` };
  }
  const riseMetres = Math.round((median(recent) - median(earlier)) * 1000) / 1000;
  const level = riseMetres + 1e-9 >= rule.highRiseMetres ? 'high' : riseMetres + 1e-9 >= rule.elevatedRiseMetres ? 'elevated' : 'lower';
  const reason = level === 'lower'
    ? `The river is ${riseMetres >= 0 ? 'not much higher than' : 'lower than'} at the same time yesterday (${riseMetres >= 0 ? '+' : ''}${riseMetres.toFixed(2)} m).`
    : `The river is ${riseMetres.toFixed(2)} m higher than at the same time yesterday, which can mean additional runoff.`;
  return { ...base, level, riseMetres, observedAt: iso(newest.at), reason };
}

/**
 * Overall indication. Upstream activity is required for "Lower": river conditions can raise an indication but never
 * stand in for missing overflow evidence.
 */
export function combineAssessment(cso, runoff) {
  const reasons = [cso.reason, runoff.reason];
  let level;
  let atLeast = Boolean(cso.atLeast);
  let partial = Boolean(cso.partial) || runoff.level === 'unavailable';
  if (cso.level === 'unavailable') {
    level = levelRank(runoff.level) >= levelRank('elevated') ? runoff.level : 'unavailable';
    atLeast = level !== 'unavailable';
    partial = level !== 'unavailable';
  } else {
    level = runoff.level === 'unavailable' ? cso.level : maxLevel(cso.level, runoff.level);
    if (levelRank(runoff.level) > levelRank(cso.level)) atLeast = false;
  }
  return { level, label: LEVEL_LABELS[level], atLeast: level === 'unavailable' ? false : atLeast, partial: level === 'unavailable' ? false : partial, reasons };
}

/** Index a set read's items by canonical asset ID. */
export function indexItems(read) {
  return new Map((read?.items ?? []).map((item) => [item.status?.assetId, item]));
}

/**
 * The current indication and its hourly history from one set read and the level series. `hours` of history are
 * returned only where the read window covers the whole trailing activity window; earlier points are not invented.
 */
export function buildAssessment({ memberIds, read, levelData = [], now, hours = 0, method = ASSESSMENT_METHOD }) {
  const readAt = time(read?.retrievedAt);
  const readFrom = read?.from ?? null;
  const items = indexItems(read);
  const nowMs = now.getTime();
  const evidenceFresh = readAt !== null && nowMs - readAt <= method.maxEvidenceAgeMinutes * MINUTE_MS && readAt <= nowMs + 5 * MINUTE_MS;

  const at = evidenceFresh ? readAt : nowMs;
  const cso = evidenceFresh
    ? assessUpstreamActivity({ memberIds, items, at, readFrom, readAt, live: true, method })
    : { factor: 'upstream_cso', level: 'unavailable', members: memberIds.length, observedAt: readAt !== null ? iso(readAt) : null,
      unavailableReason: readAt === null ? 'no_evidence' : 'stale_evidence', reason: 'Recent upstream storm-overflow evidence is unavailable.' };
  const runoff = assessRiverConditions(levelData, nowMs, method);
  const current = { version: method.version, observedAt: iso(at), ...combineAssessment(cso, runoff), factors: { cso, runoff } };

  const points = [];
  if (hours > 0 && readAt !== null && readFrom) {
    const step = method.historyStepMinutes * MINUTE_MS;
    const earliest = Math.max(nowMs - hours * HOUR_MS, time(readFrom) + method.recentHours * HOUR_MS);
    for (let point = Math.floor(readAt / step) * step; point >= earliest; point -= step) {
      if (point === readAt) continue;
      const pointCso = assessUpstreamActivity({ memberIds, items, at: point, readFrom, readAt, live: false, method });
      const pointRunoff = assessRiverConditions(levelData, point, method);
      points.push(historyPoint(point, pointCso, pointRunoff));
    }
    points.reverse();
    if (evidenceFresh) points.push(historyPoint(readAt, cso, runoff));
  }
  return { current, history: { stepMinutes: method.historyStepMinutes, hours, points } };
}

function historyPoint(at, cso, runoff) {
  const combined = combineAssessment(cso, runoff);
  return {
    at: iso(at),
    level: combined.level,
    atLeast: combined.atLeast,
    partial: combined.partial,
    csoLevel: cso.level,
    recent: cso.recent ?? null,
    spillingNow: cso.spillingNow ?? null,
    unknown: cso.unknown ?? null,
    runoffLevel: runoff.level,
    riseMetres: runoff.riseMetres ?? null,
  };
}

/**
 * The alert view of the upstream-activity factor, which is what water-quality ("CSO risk") rules have always used.
 * `lowest` is what the evidence proves; `highest` is what it cannot rule out.
 */
export function alertRisk(cso) {
  if (!cso || cso.level === 'unavailable') return null;
  const toRisk = { lower: 'green', elevated: 'amber', high: 'red' };
  const [lowest, highest] = cso.possibleLevels ?? [cso.level, cso.level];
  return { lowest: toRisk[lowest], highest: toRisk[highest], at: cso.observedAt };
}
