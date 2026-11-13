import { randomUUID } from "node:crypto";
import { mapApiError } from "../../../../../libs/api/http";
import { assertCronAuthorized } from "../../../../../libs/api/cronAuth";
import { sendRouteError, sendRouteSuccess } from "../../../../../libs/api/httpApp";
import { createRequestLogger } from "../../../../../libs/api/logger";
import { runHppShadowCron } from "../../../../../libs/services/hppShadowCronService";

export const dynamic = "force-dynamic";
// Must stay below the 5-minute run lease (LEASE_MS) and the writer fence (APP_FENCE_MS).
export const maxDuration = 60;

export async function GET(request) {
  const logger = createRequestLogger({ method: "GET" }, "api/internal/hpp/run");

  try {
    assertCronAuthorized(request);
    const data = await runHppShadowCron({ runId: randomUUID() });
    logger.info("Ran HPP evaluation", data);
    return sendRouteSuccess(data);
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    logger.error("Error in HPP run", error);
    return sendRouteError(statusCode, message);
  }
}
