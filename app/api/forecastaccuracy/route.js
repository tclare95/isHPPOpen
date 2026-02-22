import { parseCSVToAccuracy } from "../../../libs/csvParser";
import { HttpError, mapApiError } from "../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../libs/api/httpApp";
import { fetchWithOperationalRevalidate } from "../../../libs/api/fetchWithRevalidate";
export { API_OPERATIONAL_REVALIDATE_SECONDS as revalidate } from "../../../libs/dataFreshness";

export async function GET() {
  try {
    const s3Url = process.env.S3_FORECAST_ACCURACY_URL;
    if (!s3Url) throw new HttpError(500, "Forecast accuracy URL not configured");

    const response = await fetchWithOperationalRevalidate(s3Url);
    if (!response.ok) throw new HttpError(502, "Failed to fetch forecast accuracy data");

    const csvText = await response.text();
    const accuracyData = parseCSVToAccuracy(csvText);
    const evaluationTime = accuracyData[0]?.evaluation_time || null;

    return sendRouteSuccess({ accuracy_data: accuracyData, evaluation_time: evaluationTime });
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message);
  }
}
