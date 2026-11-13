import { mapApiError } from "../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../libs/api/httpApp";
import { getPublicWaterQualitySnapshot } from "../../../libs/services/waterQualityService";

export const revalidate = 900;
// RDP_CSO_MEMBERSHIP=rdp reads the whole-set activity walk (#114); a cold walk takes about 70 s. It is shared with the
// catchment section's cache and normally revalidates in the background.
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
