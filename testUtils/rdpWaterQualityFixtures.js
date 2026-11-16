// Builders for the HPP water-quality assessment tests: synthetic set reads, and one representative real capture.
import capture from './fixtures/rdpWaterQuality-2026-11-16.json';

export const PREFIX = 'severn-trent:storm-overflow-activity:';
export const assetId = (externalId) => `${PREFIX}${externalId}`;

const STATUS_BY_REASON = {
  offline: { status: 'available', reportedState: 'offline', effectiveState: 'unknown', freshness: 'fresh' },
  spilling: { status: 'available', reportedState: 'spilling', effectiveState: 'spilling', freshness: 'fresh' },
  stale: { status: 'available', reportedState: 'not_spilling', effectiveState: 'not_spilling', freshness: 'stale' },
  unavailable: { status: 'unavailable', reportedState: 'unknown', effectiveState: 'unknown', freshness: 'unknown' },
};
const QUIET = { status: 'available', reportedState: 'not_spilling', effectiveState: 'not_spilling', freshness: 'fresh' };

export function item(externalId, { state = null, events = [], gaps = [], coverageStatus = 'partial', truncated = false, noEvents = false } = {}) {
  return {
    page: 0,
    status: { assetId: assetId(externalId), ...(STATUS_BY_REASON[state] ?? QUIET) },
    events: noEvents ? null : {
      events: events.map((event, index) => ({ eventId: `cse_${String(index).padStart(24, '0')}`, reconciliation: 'resolved', revision: 1, heldClaims: 0, tier: 'hot',
        boundaryProvenance: event.endedAt ? 'provider_reported' : 'end_not_reported', endedAt: null, endNoLaterThan: null, ...event })),
      coverage: { status: coverageStatus, collectedFrom: null, collectedTo: null, reportingCompleteness: 'unverified', gaps: gaps.map(([from, to]) => ({ from, to, reason: 'not_collected' })) },
      truncated,
    },
  };
}

export function setRead(items, { from, retrievedAt }) {
  return { set: 'hpp-catchment', hours: 168, from, to: retrievedAt, retrievedAt, items, complete: true, total: items.length, received: items.length };
}

/** The real 2026-11-16 capture as a set read, its member IDs, level data and legacy density. */
export function realCapture() {
  const byOutfall = new Map();
  for (const [id, startedAt, endedAt, endNoLaterThan, lifecycle, boundaryProvenance, reconciliation] of capture.events) {
    const list = byOutfall.get(id) ?? [];
    list.push({ startedAt, endedAt, endNoLaterThan, lifecycle, boundaryProvenance, reconciliation });
    byOutfall.set(id, list);
  }
  const items = capture.outfalls.map((outfall) => item(outfall.id, {
    state: outfall.statusReason === 'offline' ? 'offline' : null,
    events: byOutfall.get(outfall.id) ?? [],
    gaps: outfall.gaps ?? capture.commonGaps,
    truncated: Boolean(outfall.truncated),
  }));
  return {
    read: setRead(items, capture.read),
    memberIds: capture.outfalls.map((outfall) => assetId(outfall.id)),
    levelData: capture.levels.map(([reading_date, reading_level]) => ({ reading_date, reading_level })),
    legacyDensity: capture.legacyDensity.map(([timestamp, numberCSOsPerKm2]) => ({ timestamp, numberCSOsPerKm2 })),
    retrievedAt: new Date(capture.read.retrievedAt),
  };
}
