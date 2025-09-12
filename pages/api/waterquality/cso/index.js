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

    // Aggregation to get latest (by DateScraped) document per attributes.Id
    const pipeline = [
      { $match: { "attributes.Id": { $in: idArray } } },
      { $sort: { DateScraped: -1 } },
      {
        $group: {
          _id: "$attributes.Id",
          doc: { $first: "$$ROOT" },
        },
      },
    ];

    const aggCursor = csoDataCollection.aggregate(pipeline);
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
