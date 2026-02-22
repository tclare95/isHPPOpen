import { connectToDatabase } from "../../../../libs/database";
import { sendRouteError, sendRouteSuccess } from "../../../../libs/api/httpApp";
import { mapApiError } from "../../../../libs/api/http";
import { createRequestLogger } from "../../../../libs/api/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const logger = createRequestLogger({ method: "GET" }, "app/api/v2/levels");

  try {
    const { db } = await connectToDatabase();
    const collection = db.collection("riverschemas");
    const cursor = collection.find().sort({ _id: -1 }).limit(1);
    const data = await cursor.next();

    logger.info("Levels called");

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
