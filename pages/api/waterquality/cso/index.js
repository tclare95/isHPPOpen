import { connectToDatabase } from "../../../../libs/database";

// GET /api/waterquality/cso?ids=1,2,3
// Returns: { csoData: { "1": { Id, Status, LatestEventStart, LatestEventEnd, DateScraped, Coordinates }, ... } }
export default async function handler(req, res) {
  const timestamp = new Date().toISOString();

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { ids } = req.query;
  if (!ids) {
    return res.status(400).json({ message: "Missing ids query parameter" });
  }

  // Normalize ids (comma separated) -> array of strings trimmed
  const idArray = Array.isArray(ids)
    ? ids
    : ids.split(",").map((s) => s.trim()).filter(Boolean);

  if (idArray.length === 0) {
    return res.status(400).json({ message: "No valid ids provided" });
  }

  try {
    const { db } = await connectToDatabase();
    const csoDataCollection = await db.collection("csoData");
    // Optional and safe: ensure an index to support this query pattern efficiently
    // Note: createIndex is idempotent; it will be a no-op if the index already exists
    try {
      await csoDataCollection.createIndex(
        { "attributes.Id": 1, DateScraped: -1 },
        { name: "id_date_desc" }
      );
    } catch (e) {
      // index creation failure shouldn't break the request
      console.warn("Failed to ensure index id_date_desc:", e?.message || e);
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
    return res.status(200).json({ csoData: response });
  } catch (error) {
    console.error(`[${timestamp}] Error in bulk csoData:`, error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
