import { mapApiError } from "../../../../libs/api/http";
import { requireRouteAdmin, sendRouteError, sendRouteSuccess } from "../../../../libs/api/httpApp";

export const dynamic = "force-dynamic";

/**
 * Admin-only, read-only last-known state of the scheduled operational jobs (HPP evaluation, alert evaluation
 * and delivery, and the inputs they recorded). Bounded reads of existing records only; it never runs a job.
 * Live source checks stay in /api/admin/operational-health, whose contract is unchanged.
 */
export async function GET() {
  try {
    await requireRouteAdmin();
    // Loaded after the admin check so unauthorised calls never touch the database module.
    const { getOperationalOverview } = await import("../../../../libs/services/operationalOverviewService");
    return sendRouteSuccess(await getOperationalOverview(), 200, { "Cache-Control": "no-store" });
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message);
  }
}
