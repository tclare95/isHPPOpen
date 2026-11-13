import "server-only";
import { coalesce, getClient, withDeadline } from "../rdp/csoSource.js";
import { HPP_MEMBERSHIP } from "../rdp/csoMembership.js";
import { RdpError } from "../rdp/errors.js";
import { RIVER_IMPACT_WINDOWS } from "../rdp/riverImpact.js";

// Optional "Reported downstream spill impact" overlay for /waterquality. Off unless RDP_RIVER_IMPACT=on. Display only:
// it never feeds the indicator, the density chart, the calibrated thresholds or alerts.

// Only the reviewed HPP relationship set, pinned to the membership and network versions this site already reviewed,
// so the route is not a general RDP proxy and a re-published set needs review here first.
export const RIVER_IMPACT_SET = "hpp-upstream-outfalls";
export const RIVER_IMPACT_PINS = Object.freeze({
  relationshipVersion: HPP_MEMBERSHIP.version,
  networkVersion: HPP_MEMBERSHIP.network.version,
});
export const RIVER_IMPACT_DEFAULT_HOURS = 48;
// One RDP read is bounded by RDP's 25 s budget; allow one client retry inside this.
export const RIVER_IMPACT_DEADLINE_MS = 60000;

export function riverImpactEnabled(env = process.env) {
  return env.RDP_RIVER_IMPACT === "on";
}

export function validateRiverImpactHours(hours) {
  if (!RIVER_IMPACT_WINDOWS.includes(hours)) throw new RdpError("INVALID_QUERY");
  return hours;
}

export async function getRiverImpactOverlay(hours = RIVER_IMPACT_DEFAULT_HOURS, { env = process.env, client } = {}) {
  validateRiverImpactHours(hours);
  if (!riverImpactEnabled(env)) return { enabled: false };
  // Concurrent misses in one instance share one RDP read; the CDN shares the answer across visitors.
  const impact = await coalesce(`river-impact:${RIVER_IMPACT_SET}:${hours}`,
    () => withDeadline((client ?? getClient()).getRiverImpact(RIVER_IMPACT_SET, { hours }), RIVER_IMPACT_DEADLINE_MS));
  if (impact.relationships.version !== RIVER_IMPACT_PINS.relationshipVersion || impact.relationships.approval !== "approved" ||
      impact.network.version !== RIVER_IMPACT_PINS.networkVersion) {
    throw new RdpError("IMPACT_REVIEW_REQUIRED");
  }
  return { enabled: true, status: "available", set: RIVER_IMPACT_SET, impact };
}
