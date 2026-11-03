import { mapApiError } from "../../../../libs/api/http";
import { requireRouteSession, sendRouteError, sendRouteSuccess } from "../../../../libs/api/httpApp";
import { getHppShadowReport } from "../../../../libs/services/hppShadowCronService";

export const dynamic = "force-dynamic";

/** Authenticated, read-only HPP shadow evidence (#89): health, continuity and legacy comparison. */
export async function GET() {
  try {
    await requireRouteSession();
    return sendRouteSuccess(await getHppShadowReport());
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message);
  }
}
