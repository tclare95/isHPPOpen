import { mapApiError } from "../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../libs/api/httpApp";
import { getPublicWaterQualitySnapshot } from "../../../libs/services/waterQualityService";

// Five minutes, RDP's own summary bucket: current spill status (cards and map) is never held for a whole collection cycle.
export const revalidate = 300;
// RDP_CSO_MEMBERSHIP=rdp reads the whole set (one summary request, or the fallback walk of about 70 s). It is shared with
// the catchment section's cache and normally revalidates in the background.
export const maxDuration = 180;

export async function GET() {
  try {
    const waterQualityData = await getPublicWaterQualitySnapshot();
    return sendRouteSuccess({ waterQualityData });
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message);
  }
}
