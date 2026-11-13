// Synthetic `rdp.river-tracer.upstream-relationships/v1` sets, shaped like river-data-platform
// docs/evidence/river-tracer-64/hpp-upstream-relationships.json. Counts are always internally consistent unless a test
// deliberately breaks them.
import { ST } from "./rdpCsoFixtures";

export const SET_VERSION = "bb422e98d78ee1bc5923c9e1d73c4d41708d3a343c7b31e44133ceeaa934c8d2";
export const NETWORK_VERSION = "838c7ed826b26ee16a11ba2b5be9dc4d286bca8cc0159c6f33d540bf04c0155c";
export const CATALOGUE_VERSION = "9962b46480831b1939812c7f40372b9e8596a67a137b4e266d369703077432f2";

export const svt = (count, start = 0) => Array.from({ length: count }, (_, i) => `SVT${String(start + i).padStart(5, "0")}`);

function relationship(externalId, category, index) {
  const row = {
    assetId: ST(externalId), providerId: "severn-trent", externalId, category, basis: "two-method-agreement/v1",
    evidence: category === "catchment-only" ? "catchment-only-unlinked" : "network-and-catchment",
    reason: { confirmed: "BothMethodsNameAgrees", candidate: "BothMethodsNameUnconfirmed", "catchment-only": "CatchmentOnlyUnlinked" }[category] ?? "Reviewed",
    longitude: -1.1 - index / 1000, latitude: 52.9 + index / 1000, receivingWatercourse: category === "confirmed" ? "RIVER TRENT" : "TRIB OF RIVER DERWENT",
    link: { status: category === "catchment-only" ? "unresolved" : "candidate", reason: "SingleReachMatch", nameAgreement: "agrees", candidates: 1 },
  };
  if (category !== "catchment-only") row.route = { basinId: "80", sampleId: String(1000 + index), snapOffsetM: 10, path: `/v1/river/releases/838c7ed826b26ee1/basins/80/samples/${1000 + index}/downstream` };
  return row;
}

export function relationshipSet({ confirmed = svt(3), candidate = [], catchmentOnly = [], ambiguous = [], excludedCount = 5, approval = "approved",
  version = SET_VERSION, networkVersion = NETWORK_VERSION, catalogueVersion = CATALOGUE_VERSION, setId = "hpp-upstream-outfalls" } = {}) {
  const relationships = [
    ...confirmed.map((id) => ["confirmed", id]), ...candidate.map((id) => ["candidate", id]),
    ...catchmentOnly.map((id) => ["catchment-only", id]), ...ambiguous.map((id) => ["ambiguous", id]),
  ].map(([category, id], index) => relationship(id, category, index)).sort((a, b) => a.assetId.localeCompare(b.assetId));
  const scope = (name, categories) => ({ name, categories, count: relationships.filter((row) => categories.includes(row.category)).length,
    distinctLocations: relationships.filter((row) => categories.includes(row.category)).length, use: name });
  return {
    schema: "rdp.river-tracer.upstream-relationships/v1",
    version,
    setId,
    location: { name: "Holme Pierrepont (HPP), River Trent", longitude: -1.0948, latitude: 52.9449, networkId: "orn-v2-gb-basin-80", reachId: "23210" },
    catchment: { id: "catchment-227995", areaKm2: 7481.6925 },
    network: { kind: "release", id: "orn-v2-gb", version: networkVersion, token: networkVersion.slice(0, 16), attribution: "© OpenRiversNetwork (ORN) 2023" },
    catalogues: [{ providerId: "severn-trent", sourceId: "storm-overflow-activity", sourceUrl: "https://example.invalid", version: catalogueVersion,
      verifiedAt: "2026-11-03T11:31:01+00:00", assets: relationships.length + excludedCount, attribution: "Severn Trent Water", licence: "CC BY 4.0" }],
    review: { reviewId: setId, policy: "two-method-agreement/v1", approval, preparedAt: "2026-11-11T00:00:00+00:00",
      ...(approval === "approved" ? { approvedBy: "Repository owner", approvedAt: "2026-11-11T00:00:00+00:00" } : {}), decisions: 0 },
    membership: { basis: "confirmed", approval, count: confirmed.length, assetIds: confirmed.map(ST).sort(), statement: "static" },
    scopes: [scope("confirmed", ["confirmed"]), scope("network", ["confirmed", "candidate"]), scope("catchment", ["confirmed", "candidate", "catchment-only"])],
    coverage: {
      catalogueAssets: relationships.length + excludedCount, withCoordinates: relationships.length + excludedCount, withoutCoordinates: 0,
      categories: { ambiguous: ambiguous.length, candidate: candidate.length, "catchment-only": catchmentOnly.length, confirmed: confirmed.length,
        excluded: excludedCount, unlocatable: 0 },
      listed: relationships.length,
    },
    relationships,
    legacyComparisons: [],
    caveats: ["Static geography"],
  };
}
