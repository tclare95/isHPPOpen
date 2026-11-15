// Synthetic RDP CSO payloads shaped by river-data-platform docs/openapi-cso.json (#72 PR 3).
export const ST = (id) => `severn-trent:storm-overflow-activity:${id}`;
export const CURSOR = "c".repeat(48);
export const NOW = new Date("2026-11-12T12:00:00Z");

export function asset(externalId, overrides = {}) {
  return {
    assetId: ST(externalId), provider: "severn-trent", sourceId: "storm-overflow-activity", externalId,
    company: "Severn Trent", latitude: 52.9, longitude: -1.2, receivingWatercourse: "River Trent", name: null,
    overflowType: null, selected: true, sets: ["hpp-upstream"], catalogueVersion: "v1", ...overrides,
  };
}

export function catalogue(assets, { nextCursor = null, total = assets.length } = {}) {
  return {
    data: assets,
    meta: { retrievedAt: "2026-11-12T11:59:00Z", total, impact: "none_implied", nextCursor,
      catalogues: [{ provider: "severn-trent", sourceId: "storm-overflow-activity", state: "Healthy", version: "v1" }] },
  };
}

export function status(externalId, overrides = {}) {
  return {
    assetId: ST(externalId), status: "available", reportedState: "not_spilling", effectiveState: "not_spilling",
    freshness: "fresh", statusStart: "2026-11-12T08:00:00+00:00", sourceUpdatedAt: "2026-11-12T11:50:00+00:00",
    sourceAgeSeconds: 600, fetchedAt: "2026-11-12T11:52:00+00:00", lastSuccessfulPollAt: "2026-11-12T11:52:00+00:00",
    lastAttemptAt: "2026-11-12T11:52:00+00:00", lastAttemptOutcome: "Succeeded", lastDurablePersistAt: "2026-11-12T11:52:00+00:00",
    reasons: [], errorCode: null, ...overrides,
  };
}

export function statusResponse(rows, partial = false) {
  return { data: rows, meta: { retrievedAt: "2026-11-12T11:59:00Z", partial } };
}

export function event(externalId, overrides = {}) {
  return {
    eventId: "cse_" + "a".repeat(24), assetId: ST(externalId), startedAt: "2026-11-12T06:00:00Z",
    endedAt: "2026-11-12T08:00:00Z", endNoLaterThan: null, lifecycle: "completed", boundaryProvenance: "provider_reported",
    revision: 1, reconciliation: "resolved", heldClaims: 0, tier: "hot", ...overrides,
  };
}

export const coverage = { status: "partial", collectedFrom: "2026-11-10T11:45:00Z", collectedTo: "2026-11-12T11:52:00Z",
  reportingCompleteness: "unverified", gaps: [] };

export function eventsResponse(externalId, events, { nextCursor = null, cover = coverage } = {}) {
  return {
    data: events,
    meta: { assetId: ST(externalId), from: "2026-11-10T11:45:00Z", to: "2026-11-12T12:00:00Z",
      requestAsOf: "2026-11-12T11:59:00Z", coverage: cover, pageIntegrity: "verified", archiveObjectsVerified: 0, nextCursor },
  };
}

export function healthResponse(externalId, overrides = {}) {
  return {
    data: { assetId: ST(externalId), selection: { state: "selected", sets: ["hpp-upstream"], inVerifiedCatalogue: true },
      catalogue: { state: "Healthy" }, collection: { coverageLast24h: coverage },
      events: { lastArchiveRun: { examined: 1, archived: 0, expiryAssigned: 0, conflicts: 0, blocked: 0, errorCode: null } }, ...overrides },
    meta: { retrievedAt: "2026-11-12T11:59:00Z" },
  };
}

// One page of `GET /v1/cso/sets/{set}/activity` (ADR-002 D3). `items` are [status, events | null] pairs.
export function setActivityItem(externalId, { status: statusOverrides = {}, events = [], cover = coverage, truncated = false } = {}) {
  return { status: status(externalId, statusOverrides), events: events === null ? null : { data: events, coverage: cover, truncated } };
}

export function setActivityResponse(items, { set = "hpp-catchment", total = items.length, nextCursor = null, partial = false, hours = 48,
  retrievedAt = "2026-11-12T11:59:00Z", from = "2026-11-10T11:59:00Z", to = retrievedAt } = {}) {
  return {
    data: items,
    meta: { set, provider: "severn-trent", sourceId: "storm-overflow-activity", windowHours: hours, from, to, retrievedAt, total, partial, nextCursor },
  };
}

// `GET /v1/cso/sets/{set}/summary` built from the same activity items and catalogue assets, with RDP's rules: an outfall
// is quiet exactly when read, fresh, reported and effective not_spilling, with no event and no truncation; quiet outfalls
// sharing a source time and coverage are one group; coordinates are counted to 5 decimal places.
export function setSummaryResponse(items, assets = [], { set = "hpp-catchment", hours = 48, partial = false, catalogueState = "available",
  attribution = null, retrievedAt = "2026-11-12T11:59:00Z", from = "2026-11-10T11:59:00Z", to = retrievedAt } = {}) {
  const byId = new Map(assets.map((a) => [a.assetId, a]));
  const place = (a) => (Number.isFinite(a?.latitude) && Number.isFinite(a?.longitude) ? `${a.latitude.toFixed(5)},${a.longitude.toFixed(5)}` : null);
  const places = new Map();
  for (const item of items) {
    const key = catalogueState === "available" ? place(byId.get(item.status.assetId)) : null;
    if (key) places.set(key, (places.get(key) ?? 0) + 1);
  }
  const isQuiet = ({ status: s, events: e }) => s.status === "available" && s.freshness === "fresh" && s.reportedState === "not_spilling"
    && s.effectiveState === "not_spilling" && e && e.data.length === 0 && !e.truncated;
  const rows = items.filter((item) => !isQuiet(item)).map((item) => {
    const a = catalogueState === "available" ? byId.get(item.status.assetId) : null;
    const key = place(a);
    return { ...item, catalogue: a ? { name: a.name, receivingWatercourse: a.receivingWatercourse, latitude: a.latitude, longitude: a.longitude,
      othersAtSameCoordinates: key ? places.get(key) - 1 : null } : null };
  });
  const groups = new Map();
  for (const item of items.filter(isQuiet)) {
    const key = `${item.status.sourceUpdatedAt}|${JSON.stringify(item.events.coverage)}`;
    const group = groups.get(key) ?? { sourceUpdatedAt: item.status.sourceUpdatedAt, sourceAgeSeconds: item.status.sourceAgeSeconds,
      fetchedAt: item.status.fetchedAt, freshness: "fresh", coverage: item.events.coverage, outfalls: 0, externalIds: [] };
    group.outfalls += 1;
    group.externalIds.push(item.status.assetId.slice(item.status.assetId.lastIndexOf(":") + 1));
    groups.set(key, group);
  }
  const shared = [...places.values()].filter((count) => count > 1);
  const located = [...places.values()].reduce((sum, count) => sum + count, 0);
  return {
    data: {
      counts: {}, events: {}, coverage: {}, sourceAge: {},
      coordinates: { rule: "identical published catalogue coordinates rounded to 5 decimal places", distinct: places.size,
        withoutCoordinates: items.length - located, sharedCoordinates: shared.length, outfallsAtSharedCoordinates: shared.reduce((s, c) => s + c, 0) },
      outfalls: rows,
      quiet: [...groups.values()],
    },
    meta: {
      set, provider: "severn-trent", sourceId: "storm-overflow-activity", windowHours: hours, from, to, retrievedAt, total: items.length, partial,
      catalogue: { state: catalogueState, version: catalogueState === "available" ? "v1" : null, attribution,
        members: catalogueState === "available" ? items.filter((item) => byId.has(item.status.assetId)).length : 0 },
      refresh: { mode: "cached-on-demand", bucketStart: "2026-11-12T11:55:00Z", bucketEnd: "2026-11-12T12:00:00Z" },
    },
  };
}
