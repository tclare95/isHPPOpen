import { mapApiError } from "../../../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../../../libs/api/httpApp";
import { getPublicCsoCatchmentMonitoring } from "../../../../../libs/services/waterQualityService";

// Whole-catchment CSO monitoring for one reviewed RDP collection set (#114). `set` defaults to hpp-catchment.
// A complete read is shared through the CDN; partial, unavailable or disabled answers are cached briefly so a
// recovering RDP is picked up quickly without every visitor causing a whole-set walk.
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET(request) {
  try {
    const setKey = request.nextUrl.searchParams.get("set") ?? undefined;
    const monitoring = await getPublicCsoCatchmentMonitoring(setKey);
    const cache = monitoring.enabled && monitoring.state === "available"
      ? "public, s-maxage=300, stale-while-revalidate=600" : "public, s-maxage=60";
    return sendRouteSuccess(monitoring, 200, { "Cache-Control": cache });
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message, undefined, { "Cache-Control": "no-store" });
  }
}
