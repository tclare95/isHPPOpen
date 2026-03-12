import { NextResponse } from "next/server";
import { mapApiError } from "../../../../libs/api/http";
import { createRequestLogger } from "../../../../libs/api/logger";
import { buildDashboardAlertStatusUrl } from "../../../../libs/services/alertMailerService";
import { confirmColwickAlertSubscription } from "../../../../libs/services/colwickAlertsService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const logger = createRequestLogger({ method: "GET" }, "api/alerts/confirm");

  try {
    const token = request.nextUrl.searchParams.get("token");
    const data = await confirmColwickAlertSubscription(token);
    logger.info("Confirmed Colwick alert subscription");
    return NextResponse.redirect(buildDashboardAlertStatusUrl("confirmed", data.message));
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    logger.error("Error in alerts confirm", error);

    if (statusCode >= 400 && statusCode < 500) {
      return NextResponse.redirect(buildDashboardAlertStatusUrl("error", message));
    }

    return NextResponse.redirect(buildDashboardAlertStatusUrl("error", "Unable to confirm alert right now."));
  }
}