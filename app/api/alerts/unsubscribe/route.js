import { NextResponse } from "next/server";
import { mapApiError } from "../../../../libs/api/http";
import { createRequestLogger } from "../../../../libs/api/logger";
import { buildAlertsResultUrl } from "../../../../libs/services/alertMailerService";
import { unsubscribeColwickAlertSubscription } from "../../../../libs/services/colwickAlertsService";

export const dynamic = "force-dynamic";

// Redirects to the Alerts Centre with a fixed result code; no subscription details are put in the URL.
export async function GET(request) {
  const logger = createRequestLogger({ method: "GET" }, "api/alerts/unsubscribe");

  try {
    const token = request.nextUrl.searchParams.get("token");
    await unsubscribeColwickAlertSubscription(token);
    logger.info("Unsubscribed alert subscription");
    return NextResponse.redirect(buildAlertsResultUrl("unsubscribed"));
  } catch (error) {
    const { statusCode } = mapApiError(error);
    logger.error("Error in alerts unsubscribe", error);
    return NextResponse.redirect(buildAlertsResultUrl(statusCode >= 400 && statusCode < 500 ? "unsubscribe_invalid" : "unsubscribe_error"));
  }
}
