import { mapApiError } from "../../../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../../../libs/api/httpApp";
import { getPublicCsoEventHistory } from "../../../../../libs/services/waterQualityService";

// Recorded CSO events for the HPP upstream outfalls (#121). `window` is 24h (default), 7d or 30d.
// Shared CDN caching keeps visitors from each causing RDP reads; failures are cached only briefly.
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const windowKey = request.nextUrl.searchParams.get("window") ?? "24h";
    const history = await getPublicCsoEventHistory(windowKey);
    const cache = history.enabled && history.state === "available" && history.evidence.outfalls.failed === 0
      ? "public, s-maxage=300, stale-while-revalidate=600" : "public, s-maxage=60";
    return sendRouteSuccess(history, 200, { "Cache-Control": cache });
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message, undefined, { "Cache-Control": "no-store" });
  }
}
