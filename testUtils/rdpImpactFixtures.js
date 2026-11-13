// A small rdp.river-tracer.impact/v1 body in the shape RDP's GET /v1/river/impact/{set} returns.
export const IMPACT_SET = "hpp-upstream-outfalls";
export const IMPACT_SET_VERSION = "bb422e98d78ee1bc5923c9e1d73c4d41708d3a343c7b31e44133ceeaa934c8d2";
export const IMPACT_NETWORK_VERSION = "838c7ed826b26ee16a11ba2b5be9dc4d286bca8cc0159c6f33d540bf04c0155c";
export const asset = (id) => `severn-trent:storm-overflow-activity:${id}`;

const outfall = (id, impact, lon, lat, extra = {}) => ({
  type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] },
  properties: {
    kind: "outfall", assetId: asset(id), impact, current: impact === "active" ? "active" : "not-active", recent: "none",
    relationship: "confirmed", routed: false, reasons: [], statusFetchedAt: "2026-11-13T11:58:00Z", statusStart: "2026-11-13T10:00:00Z",
    latestEvent: null, ...extra,
  },
});
const reach = (reachId, impact, contributors, coordinates) => ({
  type: "Feature", geometry: { type: "LineString", coordinates },
  properties: { kind: "impact-reach", reachId, impact, name: "River Trent", form: "inlandRiver",
    activeContributors: contributors.active ?? [], unresolvedContributors: contributors.unresolved ?? [], recentContributors: contributors.recent ?? [] },
});

export function impactBody({ hours = 48, setId = IMPACT_SET, version = IMPACT_SET_VERSION, networkVersion = IMPACT_NETWORK_VERSION } = {}) {
  const route = { completeness: "complete", termination: "Outlet", reachCount: 2, lengthM: 4200.5, reasons: [] };
  return {
    type: "FeatureCollection",
    riverTracer: {
      schema: "rdp.river-tracer.impact/v1", kind: "status-aware-downstream-impact", asOf: "2026-11-13T12:00:00Z", windowHours: hours,
      relationships: { setId, version, approval: "approved", location: "Holme Pierrepont (HPP), River Trent", scope: "catchment", catalogues: [] },
      network: { kind: "release", id: "orn-v2-gb", version: networkVersion, dataset: "OS Open Rivers Network v2", release: "2026-10" },
      attribution: "Contains OS data © Crown copyright. Outfalls: Severn Trent Water.", licence: "OGL v3",
      statusInput: { retrievedAt: "2026-11-13T12:00:00Z", partial: false, supplied: 3 },
      counts: { active: 1, unresolved: 0, recent: 1, unknown: 1, "no-reported-discharge": 0 },
      reachCount: 3,
      routes: { [asset("SVT00001")]: route, [asset("SVT00002")]: { ...route, completeness: "incomplete", reachCount: 1, lengthM: 900 } },
      unroutedDrawnOutfalls: [],
      activity: {},
      caveats: ["Connectivity only."],
      publication: { mode: "cached-on-demand", csoSet: "hpp-catchment", releaseToken: "838c7ed826b26ee1", refreshSeconds: 300,
        bucketStart: "2026-11-13T12:00:00Z", bucketEnd: "2026-11-13T12:05:00Z" },
    },
    features: [
      outfall("SVT00001", "active", -1.2, 52.9, { routed: true,
        latestEvent: { eventId: "cse_000000000000000000000001", startedAt: "2026-11-13T10:00:00Z", endedAt: null, endNoLaterThan: null, lifecycle: "ongoing", reconciliation: "resolved" } }),
      outfall("SVT00002", "recent", -1.3, 53.0, { routed: true, current: "not-active", recent: "recent",
        latestEvent: { eventId: "cse_000000000000000000000002", startedAt: "2026-11-13T05:00:00Z", endedAt: "2026-11-13T07:00:00Z", endNoLaterThan: null, lifecycle: "completed", reconciliation: "resolved" } }),
      outfall("SVT00003", "unknown", -1.4, 52.8, { current: "unknown", recent: "unknown", reasons: ["Freshness:stale"], statusFetchedAt: null }),
      reach("1", "active", { active: [asset("SVT00001")] }, [[-1.2, 52.9], [-1.1, 52.95]]),
      reach("2", "active", { active: [asset("SVT00001")], recent: [asset("SVT00002")] }, [[-1.1, 52.95], [-1.0, 53.0]]),
      reach("3", "recent", { recent: [asset("SVT00002")] }, [[-1.3, 53.0], [-1.1, 52.95]]),
    ],
  };
}

// The compact shape parseRiverImpact returns, for UI tests.
export const compactImpact = () => ({
  asOf: "2026-11-13T12:00:00Z", windowHours: 48,
  relationships: { setId: IMPACT_SET, version: IMPACT_SET_VERSION, approval: "approved", scope: "catchment" },
  network: { id: "orn-v2-gb", version: IMPACT_NETWORK_VERSION, dataset: "OS Open Rivers Network v2", release: "2026-10" },
  statusPartial: false, publication: { refreshSeconds: 300, bucketEnd: "2026-11-13T12:05:00Z" },
  counts: { active: 1, unresolved: 0, recent: 1, unknown: 1, "no-reported-discharge": 0 },
  unroutedDrawnOutfalls: [], attribution: "Contains OS data © Crown copyright.", licence: "OGL v3", caveats: ["Connectivity only."],
  outfalls: [
    { assetId: asset("SVT00001"), externalId: "SVT00001", impact: "active", relationship: "confirmed", coordinates: [-1.2, 52.9], routed: true, reasons: [],
      latestEvent: { eventId: "cse_000000000000000000000001", startedAt: "2026-11-13T10:00:00Z", endedAt: null, endNoLaterThan: null, lifecycle: "ongoing", reconciliation: "resolved" },
      statusFetchedAt: "2026-11-13T11:58:00Z", statusStart: "2026-11-13T10:00:00Z", route: { completeness: "complete", termination: "Outlet", reachCount: 2, lengthM: 4200.5 } },
    { assetId: asset("SVT00002"), externalId: "SVT00002", impact: "recent", relationship: "confirmed", coordinates: [-1.3, 53.0], routed: true, reasons: [],
      latestEvent: { eventId: "cse_000000000000000000000002", startedAt: "2026-11-13T05:00:00Z", endedAt: "2026-11-13T07:00:00Z", endNoLaterThan: null, lifecycle: "completed", reconciliation: "resolved" },
      statusFetchedAt: "2026-11-13T11:58:00Z", statusStart: null, route: { completeness: "incomplete", termination: "Outlet", reachCount: 1, lengthM: 900 } },
  ],
  reaches: { type: "FeatureCollection", features: [
    { type: "Feature", geometry: { type: "LineString", coordinates: [[-1.2, 52.9], [-1.1, 52.95]] },
      properties: { reachId: "1", impact: "active", name: "River Trent", contributors: { active: [asset("SVT00001")], unresolved: [], recent: [] } } },
    { type: "Feature", geometry: { type: "LineString", coordinates: [[-1.3, 53.0], [-1.1, 52.95]] },
      properties: { reachId: "3", impact: "recent", name: "River Trent", contributors: { active: [], unresolved: [], recent: [asset("SVT00002")] } } },
  ] },
});
