import { connectToDatabase } from "../../../../libs/database";
import {
  HttpError,
  getMethodHandler,
  mapApiError,
  sendApiError,
  sendApiSuccess,
} from "../../../../libs/api/http";

// GET /api/waterquality/cso?ids=1,2,3
// Returns: { csoData: { "1": { Id, Status, LatestEventStart, LatestEventEnd, DateScraped, Coordinates }, ... } }
export default async function handler(req, res) {
  const timestamp = new Date().toISOString();
  const handlers = {
    GET: async () => {
      const { ids } = req.query;
      if (!ids) {
        throw new HttpError(400, "Missing ids query parameter");
      }

      // Normalize ids (comma separated) -> array of strings trimmed
      const idArray = Array.isArray(ids)
        ? ids
        : ids.split(",").map((s) => s.trim()).filter(Boolean);

      if (idArray.length === 0) {
        throw new HttpError(400, "No valid ids provided");
      }

      const { db } = await connectToDatabase();
      const csoDataCollection = await db.collection("csoData");
      // Optional and safe: ensure an index to support this query pattern efficiently.
      // Do not force a name here, because production may already have the same key pattern
      // under a different index name.
      try {
        await csoDataCollection.createIndex({ "attributes.Id": 1, DateScraped: -1 });
      } catch (e) {
        // Index creation failure shouldn't break the request.
        // Ignore expected conflicts where an equivalent index already exists
        // with a different name/options in the database.
        const message = e?.message || "";
        const isExpectedConflict =
          e?.codeName === "IndexOptionsConflict" ||
          message.includes("Index already exists with a different name");

        if (!isExpectedConflict) {
          console.warn("Failed to ensure CSO index:", e?.message || e);
        }
      }

      // Aggregation to get latest (by DateScraped) document per attributes.Id WITHOUT global $sort
      // 1) Group to compute the max DateScraped per Id (no sort required)
      // 2) Lookup back the matching document (Id + max DateScraped)
      const pipeline = [
        { $match: { "attributes.Id": { $in: idArray } } },
        { $group: { _id: "$attributes.Id", maxDate: { $max: "$DateScraped" } } },
        {
          $lookup: {
            from: "csoData",
            let: { id: "$_id", d: "$maxDate" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$attributes.Id", "$$id"] },
                      { $eq: ["$DateScraped", "$$d"] },
                    ],
                  },
                },
              },
              { $limit: 1 },
            ],
            as: "doc",
          },
        },
        { $unwind: "$doc" },
      ];

      // Enable disk use just in case intermediate stages need it
      const aggCursor = csoDataCollection.aggregate(pipeline, { allowDiskUse: true });
      const results = await aggCursor.toArray();

      // Build response object keyed by Id mirroring single-item endpoint format
      const response = {};
      for (const r of results) {
        const { attributes, geometry, DateScraped } = r.doc;
        response[attributes.Id] = {
          Id: attributes.Id,
          Status: attributes.Status,
          LatestEventStart: attributes.LatestEventStart,
          LatestEventEnd: attributes.LatestEventEnd,
          DateScraped: DateScraped,
          Coordinates: geometry
            ? { x: geometry.x, y: geometry.y }
            : undefined,
        };
      }

      console.log(`${timestamp} BULK CSO DATA CALLED FOR IDS [${idArray.join(",")}]: returned ${Object.keys(response).length}`);
      sendApiSuccess(res, { csoData: response });
    },
  };

  try {
    const methodHandler = getMethodHandler(req, res, handlers);
    if (!methodHandler) {
      return;
    }

    await methodHandler();
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    console.error(`[${timestamp}] Error in bulk csoData:`, error);
    return sendApiError(res, statusCode, message);
  }
}
