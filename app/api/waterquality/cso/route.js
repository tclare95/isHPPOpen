import { connectToDatabase } from "../../../../libs/database";
import { HttpError, mapApiError } from "../../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../../libs/api/httpApp";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const ids = request.nextUrl.searchParams.get("ids");
    if (!ids) throw new HttpError(400, "Missing ids query parameter");

    const idArray = ids.split(",").map((s) => s.trim()).filter(Boolean);
    if (idArray.length === 0) throw new HttpError(400, "No valid ids provided");

    const { db } = await connectToDatabase();
    const csoDataCollection = db.collection("csoData");

    const pipeline = [
      { $match: { "attributes.Id": { $in: idArray } } },
      { $group: { _id: "$attributes.Id", maxDate: { $max: "$DateScraped" } } },
      {
        $lookup: {
          from: "csoData",
          let: { id: "$_id", d: "$maxDate" },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ["$attributes.Id", "$$id"] }, { $eq: ["$DateScraped", "$$d"] }] } } },
            { $limit: 1 },
          ],
          as: "doc",
        },
      },
      { $unwind: "$doc" },
    ];

    const results = await csoDataCollection.aggregate(pipeline, { allowDiskUse: true }).toArray();

    const response = {};
    for (const row of results) {
      const { attributes, geometry, DateScraped } = row.doc;
      response[attributes.Id] = {
        Id: attributes.Id,
        Status: attributes.Status,
        LatestEventStart: attributes.LatestEventStart,
        LatestEventEnd: attributes.LatestEventEnd,
        DateScraped,
        Coordinates: geometry ? { x: geometry.x, y: geometry.y } : undefined,
      };
    }

    return sendRouteSuccess({ csoData: response });
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message);
  }
}
