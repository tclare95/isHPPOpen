import { mapApiError } from "../../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../../libs/api/httpApp";
import { getPublicWaterQualityAssessment, validateAssessmentHours } from "../../../../libs/services/waterQualityAssessmentService";

// The water-quality indication and, with `hours=24|120`, its hourly history (RDP_WQ_ASSESSMENT=rdp). In legacy mode the
// history is the Sewage Map density series from /api/waterquality/csodensity instead. An RDP outage is a 200 with an
// `unavailable` assessment, so the cache replaces the previous answer rather than keeping it as current.
export const dynamic = "force-dynamic";
// A cold 7-day whole-set walk takes about 70 s (shared with the 7-day event history cache).
export const maxDuration = 180;

export async function GET(request) {
  try {
    const hours = validateAssessmentHours(request?.nextUrl?.searchParams?.get("hours"));
    const assessment = await getPublicWaterQualityAssessment({ hours });
    const cache = assessment.current?.level === "unavailable" ? "public, s-maxage=60" : "public, s-maxage=300, stale-while-revalidate=300";
    return sendRouteSuccess(assessment, 200, { "Cache-Control": cache });
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message, undefined, { "Cache-Control": "no-store" });
  }
}
