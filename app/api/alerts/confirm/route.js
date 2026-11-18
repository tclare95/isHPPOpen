import { NextResponse } from "next/server";
import { mapApiError } from "../../../../libs/api/http";
import { createRequestLogger } from "../../../../libs/api/logger";
import { buildAlertsResultUrl } from "../../../../libs/services/alertMailerService";
import { confirmColwickAlertSubscription } from "../../../../libs/services/colwickAlertsService";

export const dynamic = "force-dynamic";

// Redirects to the Alerts Centre with a fixed result code, so only a real confirmation shows as active.
export async function GET(request) {
  const logger = createRequestLogger({ method: "GET" }, "api/alerts/confirm");

  try {
    const token = request.nextUrl.searchParams.get("token");
    const data = await confirmColwickAlertSubscription(token);
    logger.info("Confirmed alert subscription", { result: data.status });
    return NextResponse.redirect(buildAlertsResultUrl(data.status === "already_active" ? "already_active" : "confirmed"));
  } catch (error) {
    const { statusCode } = mapApiError(error);
    logger.error("Error in alerts confirm", error);
    return NextResponse.redirect(buildAlertsResultUrl(statusCode >= 400 && statusCode < 500 ? "confirm_invalid" : "confirm_error"));
  }
}
