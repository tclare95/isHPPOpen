import { NextResponse } from "next/server";
import { mapApiError } from "../../../../libs/api/http";
import { createRequestLogger } from "../../../../libs/api/logger";
import { buildDashboardAlertStatusUrl } from "../../../../libs/services/alertMailerService";
import { unsubscribeColwickAlertSubscription } from "../../../../libs/services/colwickAlertsService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const logger = createRequestLogger({ method: "GET" }, "api/alerts/unsubscribe");

  try {
    const token = request.nextUrl.searchParams.get("token");
    const data = await unsubscribeColwickAlertSubscription(token);
    logger.info("Unsubscribed Colwick alert subscription");
    return NextResponse.redirect(buildDashboardAlertStatusUrl("unsubscribed", data.message));
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    logger.error("Error in alerts unsubscribe", error);

    if (statusCode >= 400 && statusCode < 500) {
      return NextResponse.redirect(buildDashboardAlertStatusUrl("error", message));
    }

    return NextResponse.redirect(buildDashboardAlertStatusUrl("error", "Unable to unsubscribe alert right now."));
  }
}