import { mapApiError } from "../../../../libs/api/http";
import { requireRouteSession, sendRouteError, sendRouteSuccess } from "../../../../libs/api/httpApp";
import { getLatestLevelsSnapshot } from "../../../../libs/services/levelsService";
import { getLatestForecastSnapshot } from "../../../../libs/services/forecastService";
import { getHppStatusSnapshot } from "../../../../libs/services/hppStatusService";
import { getLatestWaterQualitySnapshot } from "../../../../libs/services/waterQualityService";
import { getTrentWeirsSnapshot } from "../../../../libs/services/trentWeirsService";

export const dynamic = "force-dynamic";

const checks = [
  ["levels", async () => (await getLatestLevelsSnapshot()).health],
  ["forecast", async () => (await getLatestForecastSnapshot()).health],
  ["hppStatus", async () => (await getHppStatusSnapshot()).data.health],
  ["waterQuality", async () => (await getLatestWaterQualitySnapshot())?.health],
  ["trentWeirs", async () => (await getTrentWeirsSnapshot()).health],
];

export async function GET() {
  try {
    await requireRouteSession();
    const results = await Promise.all(checks.map(async ([name, check]) => {
      const startedAt = performance.now();
      try {
        const health = await check();
        return { name, latencyMs: Math.round(performance.now() - startedAt), health };
      }
      catch { return { name, latencyMs: Math.round(performance.now() - startedAt), health: { source: name, state: "unavailable", generatedAt: null, fetchedAt: new Date().toISOString(), ageSeconds: null } }; }
    }));
    return sendRouteSuccess({ checkedAt: new Date().toISOString(), sources: results });
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message);
  }
}
