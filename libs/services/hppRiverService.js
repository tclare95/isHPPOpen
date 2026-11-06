import "server-only";
import { createRdpClient } from "../rdp/client.js";
import { RdpError } from "../rdp/errors.js";
import { parseRiverLocation, parseRiverTrace } from "../rdp/river.js";
import fixture from "../rdp/fixtures/hpp-river.json";

// A mapped Trent vertex near HPP, independently checked offline; not the CSO map centre or legacy info point.
// Re-review this evidence before accepting any other release/reach/sample (docs/HPP-RIVER-TRACER.md).
export const HPP_RIVER_ANCHOR = Object.freeze({
  id: "hpp-trent", name: "Holme Pierrepont — River Trent", longitude: -1.094674, latitude: 52.944867,
  releaseVersion: "838c7ed826b26ee16a11ba2b5be9dc4d286bca8cc0159c6f33d540bf04c0155c",
  networkVersion: "3d3ceee25d1282f8854865d9d52b5917c5dc49a70b7477a7779ba02088e39075",
  basinId: "80", reachId: "23210", sampleId: "227995",
});

// Local fixtures never replace live reads on Vercel. Redistribution confirmed by the owner on 6 Nov 2026.
export function hppRiverFixturesEnabled(env = process.env) {
  return env.NODE_ENV === "development" && !env.VERCEL_ENV && env.HPP_RIVER_FIXTURES === "1";
}

export function validateHppRiverQuery(direction, geometry) {
  if (!["upstream", "downstream"].includes(direction) || !["reaches", "none"].includes(geometry)) {
    throw new RdpError("INVALID_QUERY");
  }
}

function fixtureClient() {
  return {
    async locateRiver() { return parseRiverLocation(fixture.locate); },
    async getRiverTrace(location, direction, geometry) {
      const body = structuredClone(fixture[direction]);
      if (geometry === "none") body.riverTracer.geometry = "omitted";
      return parseRiverTrace(body, location, direction, geometry);
    },
  };
}

// Fixed-site consumer of the ordinary RDP API; no HPP logic belongs in the producer.
export async function getHppRiverContext(direction, geometry = "reaches", { fixtures = false, client } = {}) {
  validateHppRiverQuery(direction, geometry);
  client ??= fixtures ? fixtureClient() : createRdpClient();
  const anchor = HPP_RIVER_ANCHOR;
  for (let attempt = 0; attempt < 2; attempt++) {
    const location = await client.locateRiver(anchor);
    const base = { anchor, direction, source: fixtures ? "fixture" : "river-data-platform", location };
    if (location.match.status !== "Matched") return { ...base, status: location.match.status, trace: null };
    if (location.release.version !== anchor.releaseVersion || location.match.reachId !== anchor.reachId ||
        location.match.reachName !== "River Trent" || location.basinId !== anchor.basinId ||
        location.sample?.sampleId !== anchor.sampleId || location.sample.snapOffsetM > 100) {
      throw new RdpError("ANCHOR_REVIEW_REQUIRED");
    }
    let mode = geometry;
    let fallback = null;
    try {
      let trace;
      try { trace = await client.getRiverTrace(location, direction, mode); }
      catch (error) {
        if (!(error instanceof RdpError) || error.code !== "RESULT_TOO_LARGE" || mode === "none") throw error;
        mode = "none";
        fallback = "geometry-too-large";
        trace = await client.getRiverTrace(location, direction, mode);
      }
      if (trace.riverTracer.network.version !== anchor.networkVersion) throw new RdpError("ANCHOR_REVIEW_REQUIRED");
      return { ...base, status: "available", geometry: mode, fallback, trace };
    } catch (error) {
      if (attempt === 0 && error instanceof RdpError && error.code === "RELEASE_NOT_AVAILABLE") continue;
      throw error;
    }
  }
}
