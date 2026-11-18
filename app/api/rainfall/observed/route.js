import { mapApiError } from "../../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../../libs/api/httpApp";
import { createRequestLogger } from "../../../../libs/api/logger";
import { getObservedRainfallContext, RAINFALL_REVALIDATE_SECONDS } from "../../../../libs/services/observedRainfallService";

// Observed rainfall context for /trentweirs#rainfall. Curated, display-only, no query parameters: the gauges, range
// and windows are fixed server-side, so this is not a general RDP proxy. A fully available answer is shared by the
// CDN for one 15-minute freshness bucket; any unavailable gauge is cached only briefly so recovery shows quickly.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  try {
    if (new URL(request.url).search) return sendRouteError(400, "This endpoint takes no query parameters");
    const data = await getObservedRainfallContext();
    if (data.status !== "available") {
      createRequestLogger(request, "api/rainfall/observed").warn("Observed rainfall partly unavailable", {
        status: data.status, reasons: [...new Set(data.gauges.map((gauge) => gauge.unavailableReason).filter(Boolean))],
      });
    }
    return sendRouteSuccess(data, 200, {
      "Cache-Control": data.status === "available"
        ? `public, s-maxage=${RAINFALL_REVALIDATE_SECONDS}, stale-while-revalidate=300`
        : "public, s-maxage=60",
    });
  } catch (error) {
    createRequestLogger(request, "api/rainfall/observed").error("Observed rainfall failed", { code: error?.code ?? error?.name ?? "UNKNOWN" });
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message, undefined, { "Cache-Control": "private, no-store" });
  }
}
