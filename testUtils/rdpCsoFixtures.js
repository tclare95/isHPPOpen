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
