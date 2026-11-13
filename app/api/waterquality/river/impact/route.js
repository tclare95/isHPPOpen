import { HttpError, mapApiError } from "../../../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../../../libs/api/httpApp";
import { RdpError } from "../../../../../libs/rdp/errors";
import { createRequestLogger } from "../../../../../libs/api/logger";
import { getRiverImpactOverlay, RIVER_IMPACT_DEFAULT_HOURS } from "../../../../../libs/services/riverImpactService";

// Optional "Reported downstream spill impact" overlay (RDP_RIVER_IMPACT). RDP recomputes it at most every 5 minutes;
// the CDN shares one answer across visitors for 2 minutes. Failures are never cached for long, and are never an empty layer.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request) {
  try {
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some((key) => key !== "hours" || query.getAll(key).length !== 1)) {
      throw new HttpError(400, "Choose hours=24, 48 or 168");
    }
    const hours = query.has("hours") ? Number(query.get("hours")) : RIVER_IMPACT_DEFAULT_HOURS;
    const data = await getRiverImpactOverlay(hours);
    return sendRouteSuccess(data, 200, {
      "Cache-Control": data.enabled ? "public, s-maxage=120, stale-while-revalidate=180" : "public, s-maxage=60",
    });
  } catch (error) {
    if (error instanceof RdpError) {
      if (error.code !== "INVALID_QUERY") createRequestLogger(request, "api/waterquality/river/impact")
        .warn("Downstream impact read failed", { code: error.code });
      return sendRouteError(error.code === "INVALID_QUERY" ? 400 : 503,
        error.code === "INVALID_QUERY" ? "Choose hours=24, 48 or 168" : "Downstream impact is temporarily unavailable",
        undefined, noStore);
    }
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message, undefined, noStore);
  }
}
