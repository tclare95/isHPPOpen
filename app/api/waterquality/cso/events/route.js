import { mapApiError } from "../../../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../../../libs/api/httpApp";
import { getPublicCsoEventHistory } from "../../../../../libs/services/waterQualityService";

// Recorded CSO events for the HPP upstream outfalls (#121). `window` is 24h (default), 48h (the page's default), 7d or 30d; optional `outfall`
// narrows the list to one member. Shared CDN caching keeps visitors from each causing RDP reads; failures are cached
// only briefly. With RDP_CSO_MEMBERSHIP=rdp the 24h/48h/7d views read one whole-set read (#114).
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET(request) {
  try {
    const windowKey = request.nextUrl.searchParams.get("window") ?? "24h";
    const outfall = request.nextUrl.searchParams.get("outfall") || undefined;
    const history = await getPublicCsoEventHistory(windowKey, { outfall });
    const cache = history.enabled && history.state === "available" && history.evidence.outfalls.failed === 0
      ? "public, s-maxage=300, stale-while-revalidate=300" : "public, s-maxage=60";
    return sendRouteSuccess(history, 200, { "Cache-Control": cache });
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message, undefined, { "Cache-Control": "no-store" });
  }
}
