import "server-only";
import { createRequestLogger } from "../api/logger";
import { buildOperationalHealth } from "../operationalHealth";
import { getLatestLevelsSnapshot } from "../services/levelsService";
import { ASSESSMENT_METHOD, buildAssessment } from "../waterQualityAssessment";
import { CATCHMENT_READ_DEADLINE_MS, readSetActivity } from "./csoCatchment.js";
import { HPP_MEMBERSHIP, MEMBERSHIP_DEADLINE_MS, readHppMembership } from "./csoMembership.js";
import { errorCode, withDeadline } from "./csoSource.js";
import { providerLabel } from "./csoHistory.js";
import { RdpError } from "./errors.js";

// RDP-backed HPP water-quality assessment (`RDP_WQ_ASSESSMENT=rdp`). Reads only what the page already reads: the pinned
// reviewed upstream relationship set, one cached 7-day activity read of its collection set (shared with the 7-day event
// history) and the configured level series. No Mongo, no Sewage Map, no new RDP route, no stored copy: the history is
// recomputed from RDP's event evidence, so there is no second writer to retire later.

export const ASSESSMENT_SOURCE = "river-data-platform-wq-assessment";
// The longest set window RDP serves. History reaches back `READ_HOURS - recentHours` (120 h, the page's 5-day chart).
export const ASSESSMENT_READ_HOURS = 168;
export const ASSESSMENT_HISTORY_HOURS = Object.freeze([0, 24, 120]);
const LEVELS_DEADLINE_MS = 10000;

export const ASSESSMENT_EXPLANATION = Object.freeze({
  means: "How much reviewed upstream storm-overflow activity was recorded recently, and whether the river is rising, at Holme Pierrepont.",
  doesNotMean: "It is not a measurement of bacteria, sewage volume or water quality at HPP, it is not a safe/unsafe verdict, and it cannot see pollution from sources other than the monitored storm overflows.",
});

function attribution(set, levels) {
  const providers = (set?.catalogues ?? []).map(({ providerId, attribution: text, licence }) =>
    ({ role: "storm_overflows", provider: providerLabel(providerId), attribution: text ?? null, licence: licence ?? null, via: "River Data Platform" }));
  return [
    ...(providers.length ? providers : [{ role: "storm_overflows", provider: "Severn Trent Water", attribution: null, licence: null, via: "River Data Platform" }]),
    { role: "upstream_membership", provider: "River Data Platform", attribution: set ? `${set.setId} ${set.version.slice(0, 16)}` : HPP_MEMBERSHIP.relationshipSet,
      licence: null, via: "River Data Platform River Tracer (OpenRiversNetwork)" },
    { role: "river_levels", provider: "Environment Agency", attribution: "Environment Agency real-time flood-monitoring data", licence: "Open Government Licence v3.0",
      via: levels?.health?.source ?? null },
  ];
}

function publicMethod() {
  const { version, recentHours, bands, maxUnknownShareForLower, runoff } = ASSESSMENT_METHOD;
  return { version, recentHours, bands, maxUnknownShareForLower, runoff };
}

async function readLevels(logger) {
  try {
    return await withDeadline(getLatestLevelsSnapshot(), LEVELS_DEADLINE_MS);
  } catch (error) {
    logger.warn(`Levels unavailable for the water-quality assessment ${JSON.stringify({ code: errorCode(error) })}`);
    return null;
  }
}

/**
 * The current assessment and `hours` of hourly history. Never rejects for an RDP failure: the assessment is reported
 * `unavailable` (no fallback to the Sewage Map density, which is a different scale).
 */
export async function getRdpWaterQualityAssessment({ hours = 0, now = new Date(), deadlineMs = CATCHMENT_READ_DEADLINE_MS } = {}) {
  const logger = createRequestLogger({ method: "GET" }, "rdp/wq-assessment");
  const levelsRead = readLevels(logger);
  let set = null;
  let read = null;
  let failure = null;
  try {
    set = await withDeadline(readHppMembership(), MEMBERSHIP_DEADLINE_MS);
    read = await withDeadline(readSetActivity(HPP_MEMBERSHIP.activitySet, ASSESSMENT_READ_HOURS), deadlineMs);
    if (!set.catalogues.some((entry) => entry.providerId === read.provider && entry.sourceId === read.sourceId)) throw new RdpError("RESPONSE_CONTRACT_ERROR");
  } catch (error) {
    failure = errorCode(error);
    read = null;
    logger.warn(`RDP evidence unavailable for the water-quality assessment ${JSON.stringify({ code: failure })}`);
  }
  const levels = await levelsRead;
  const memberIds = set ? set.members.filter((member) => member.category === HPP_MEMBERSHIP.primaryScope).map((member) => member.assetId) : [];
  const { current, history } = buildAssessment({ memberIds, read, levelData: levels?.level_data ?? [], now, hours });
  if (failure) current.factors.cso = { ...current.factors.cso, unavailableReason: "rdp_unavailable", errorCode: failure };

  return {
    source: "rdp",
    version: ASSESSMENT_METHOD.version,
    current,
    history,
    method: publicMethod(),
    explanation: ASSESSMENT_EXPLANATION,
    evidence: {
      membership: set ? { relationshipSet: set.setId, version: set.version, scope: HPP_MEMBERSHIP.primaryScope, members: memberIds.length } : null,
      read: read ? { set: read.set, source: read.source ?? "walk", from: read.from, to: read.to, retrievedAt: read.retrievedAt, complete: read.complete,
        total: read.total, received: read.received } : null,
      errorCode: failure,
      reportingCompleteness: "unverified",
    },
    health: buildOperationalHealth({ source: ASSESSMENT_SOURCE, generatedAt: read?.retrievedAt ?? null, fetchedAt: now, unavailable: Boolean(failure) }),
    sources: attribution(set, levels),
  };
}
