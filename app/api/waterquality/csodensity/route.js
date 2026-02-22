import { connectToDatabase } from "../../../../libs/database";
import { mapApiError } from "../../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../../libs/api/httpApp";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const hoursParam = request?.nextUrl?.searchParams?.get("hours");
    const parsedHours = Number(hoursParam);
    const hours = Number.isFinite(parsedHours) && parsedHours > 0 ? parsedHours : 120;

    const { db } = await connectToDatabase();
    const collection = db.collection("waterQuality");

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

    const timeSeriesData = await collection
      .find({ scrape_timestamp: { $gte: startTime, $lte: endTime } })
      .sort({ scrape_timestamp: 1 })
      .toArray();

    const result = timeSeriesData
      .map((data) => {
        const rowTimestamp = data?.scrape_timestamp;
        const numberCSOsPerKm2 = Number(data?.water_quality?.number_CSOs_per_km2);
        if (!rowTimestamp || !Number.isFinite(numberCSOsPerKm2)) return null;
        return { timestamp: rowTimestamp, numberCSOsPerKm2 };
      })
      .filter(Boolean);

    return sendRouteSuccess(result);
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message);
  }
}
