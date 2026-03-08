import { parseCSVToStability } from "../../../libs/csvParser";
import { HttpError, mapApiError } from "../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../libs/api/httpApp";
import { fetchWithOperationalRevalidate } from "../../../libs/api/fetchWithRevalidate";
import { createRequestLogger } from "../../../libs/api/logger";

export const revalidate = 900;

export async function GET() {
  const logger = createRequestLogger({ method: "GET" }, "api/forecaststability");

  try {
    const s3Url = process.env.S3_FORECAST_STABILITY_URL;
    if (!s3Url) {
      logger.error("S3_FORECAST_STABILITY_URL is not configured");
      throw new HttpError(500, "Forecast stability source is not configured");
    }

    const response = await fetchWithOperationalRevalidate(s3Url);
    if (!response.ok) {
      logger.error("Forecast stability upstream request failed", {
        status: response.status,
        url: s3Url,
      });
      throw new HttpError(502, "Unable to fetch forecast stability data");
    }

    const csvText = await response.text();
    const trimmedCsvText = csvText.trim();

    if (!trimmedCsvText) {
      logger.warn("Forecast stability upstream returned an empty payload", { url: s3Url });
      return sendRouteSuccess({ stability_data: [] });
    }

    const stabilityData = parseCSVToStability(csvText);

    if (trimmedCsvText.split("\n").length > 1 && stabilityData.length === 0) {
      logger.error("Forecast stability payload could not be parsed", { url: s3Url });
      throw new HttpError(502, "Invalid forecast stability payload");
    }

    return sendRouteSuccess({ stability_data: stabilityData });
  } catch (error) {
    const { statusCode, message } = mapApiError(error);

    if (statusCode >= 500) {
      logger.error("Forecast stability request failed", error);
    }

    return sendRouteError(statusCode, message);
  }
}
