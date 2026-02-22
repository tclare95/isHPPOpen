import { connectToDatabase } from "../../../../../libs/database";
import { HttpError, mapApiError } from "../../../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../../../libs/api/httpApp";

export const dynamic = "force-dynamic";

export async function GET(_request, context) {
  try {
    const params = await context?.params;
    const id = params?.id;
    if (!id) throw new HttpError(400, "Missing id parameter");

    const { db } = await connectToDatabase();
    const csoDataCollection = db.collection("csoData");

    const csoData = await csoDataCollection
      .find({ "attributes.Id": id })
      .sort({ DateScraped: -1 })
      .limit(1)
      .next();

    if (!csoData) throw new HttpError(404, "CSO data not found");

    const { attributes, geometry } = csoData;
    return sendRouteSuccess({
      Id: attributes.Id,
      Status: attributes.Status,
      LatestEventStart: attributes.LatestEventStart,
      LatestEventEnd: attributes.LatestEventEnd,
      DateScraped: csoData.DateScraped,
      Coordinates: { x: geometry.x, y: geometry.y },
    });
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message);
  }
}
