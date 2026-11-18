import { HttpError, mapApiError } from "../../../../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../../../../libs/api/httpApp";
import { getPublicCsoOutfallDetail } from "../../../../../../libs/services/waterQualityService";

// One storm overflow in focus (Wave C / C4): identity, membership, current status, recorded events and route availability
// for ONE outfall in the HPP membership. `id` is the canonical RDP asset ID (or, for old links, the provider ID); optional
// `window` is 48h (default), 7d or 30d for the recorded events. A complete answer is shared through the CDN; a degraded one
// is cached briefly so a recovering source is picked up quickly.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function decodeId(value) {
  if (typeof value !== "string") return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function complete(detail) {
  const sectionOk = (section) => !section.enabled || section.state === "available";
  return detail.identity.state !== "unavailable" && sectionOk(detail.status) && sectionOk(detail.history);
}

export async function GET(request, context) {
  try {
    const query = request.nextUrl.searchParams;
    if ([...query.keys()].some((key) => key !== "window" || query.getAll(key).length !== 1)) {
      throw new HttpError(400, "Only one optional window=48h, 7d or 30d is supported");
    }
    const params = await context?.params;
    const detail = await getPublicCsoOutfallDetail(decodeId(params?.id), { windowKey: query.get("window") ?? undefined });
    return sendRouteSuccess(detail, 200, {
      "Cache-Control": complete(detail) ? "public, s-maxage=120, stale-while-revalidate=180" : "public, s-maxage=60",
    });
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message, undefined, { "Cache-Control": statusCode === 404 ? "public, s-maxage=60" : "no-store" });
  }
}
