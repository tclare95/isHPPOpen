import { parseCSVToStability } from "../../../libs/csvParser";
import { sendRouteSuccess } from "../../../libs/api/httpApp";
import { fetchWithOperationalRevalidate } from "../../../libs/api/fetchWithRevalidate";
export { API_OPERATIONAL_REVALIDATE_SECONDS as revalidate } from "../../../libs/dataFreshness";

export async function GET() {
  try {
    const s3Url = process.env.S3_FORECAST_STABILITY_URL;
    if (!s3Url) return sendRouteSuccess({ stability_data: [] });

    const response = await fetchWithOperationalRevalidate(s3Url);
    if (!response.ok) return sendRouteSuccess({ stability_data: [] });

    const csvText = await response.text();
    const stabilityData = parseCSVToStability(csvText);
    return sendRouteSuccess({ stability_data: stabilityData });
  } catch {
    return sendRouteSuccess({ stability_data: [] });
  }
}
