import { sendRouteError } from "../../../../libs/api/httpApp";

export const dynamic = "force-dynamic";

/**
 * Feature flags are removed from the application.
 * Endpoint intentionally returns 404.
 */
export async function GET() {
  return sendRouteError(404, "Not Found");
}
