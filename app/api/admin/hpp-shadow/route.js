import { mapApiError } from "../../../../libs/api/http";
import { requireRouteSession, sendRouteError, sendRouteSuccess } from "../../../../libs/api/httpApp";
import { acceptanceToCsv } from "../../../../libs/hpp/hppAcceptance";
import { getHppShadowReport } from "../../../../libs/services/hppShadowCronService";

export const dynamic = "force-dynamic";

/**
 * Authenticated, read-only HPP shadow evidence (#89): health, continuity,
 * legacy comparison and the runbook acceptance summary. `?format=csv`
 * downloads the acceptance timeline (checks, pairs, holds, closure days).
 */
export async function GET(request) {
  try {
    await requireRouteSession();
    const report = await getHppShadowReport();
    const format = request?.nextUrl?.searchParams?.get("format");
    if (format === "csv" && report.acceptance) {
      return new Response(acceptanceToCsv(report.acceptance), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="hpp-shadow-acceptance-${report.generatedAt.slice(0, 10)}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return sendRouteSuccess(report);
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message);
  }
}
