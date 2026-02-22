import { connectToDatabase } from "../../../libs/database";
import { mapApiError } from "../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../libs/api/httpApp";
import { createRequestLogger } from "../../../libs/api/logger";
export { API_OPERATIONAL_REVALIDATE_SECONDS as revalidate } from "../../../libs/dataFreshness";

export async function GET() {
  const logger = createRequestLogger({ method: "GET" }, "api/levels");
  try {
    const { db } = await connectToDatabase();
    const collection = db.collection("riverschemas");
    const data = await collection.find().sort({ _id: -1 }).limit(1).next();
    return sendRouteSuccess({
      level_data: data?.level_readings ?? [],
      forecast_data: data?.forecast_readings ?? [],
    });
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    logger.error("Error in levels", error);
    return sendRouteError(statusCode, message);
  }
}
