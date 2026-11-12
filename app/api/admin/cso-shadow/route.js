import { mapApiError } from "../../../../libs/api/http";
import { requireRouteSession, sendRouteError, sendRouteSuccess } from "../../../../libs/api/httpApp";

export const dynamic = "force-dynamic";

/**
 * Authenticated, read-only RDP CSO comparison (#120): identity mismatches, status disagreements,
 * source lag, unknowns and read failures. Works in every RDP_CSO_SOURCE mode and changes nothing.
 */
export async function GET() {
  try {
    await requireRouteSession();
    // Loaded after the session check so unauthenticated calls never construct the RDP client.
    const { getCsoShadowReport } = await import("../../../../libs/rdp/csoSource");
    return sendRouteSuccess(await getCsoShadowReport());
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message);
  }
}
