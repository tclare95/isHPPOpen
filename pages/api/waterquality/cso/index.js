import { connectToDatabase } from "../../../../libs/database";

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();

  if (req.method === "GET" || req.method === "POST") {
    try {
      let ids = [];

      if (req.method === "GET") {
        if (Array.isArray(req.query.ids)) {
          ids = req.query.ids;
        } else if (typeof req.query.ids === "string") {
          ids = req.query.ids.split(",");
        }
      } else if (req.method === "POST") {
        ids = req.body.ids || [];
      }

      ids = ids.filter(Boolean).map((id) => id.toString().trim());

      if (ids.length === 0) {
        return res.status(400).json({ message: "No CSO ids provided" });
      }

      const { db } = await connectToDatabase();
      const csoDataCollection = await db.collection("csoData");

      const docs = await csoDataCollection
        .aggregate(
          [
            { $match: { "attributes.Id": { $in: ids } } },
            { $sort: { "attributes.Id": 1, DateScraped: -1 } },
            {
              $group: {
                _id: "$attributes.Id",
                doc: { $first: "$$ROOT" },
              },
            },
          ],
          { allowDiskUse: true }
        )
        .toArray();

      const results = {};
      for (const { _id, doc } of docs) {
        const { attributes, geometry } = doc;
        results[_id] = {
          Id: attributes.Id,
          Status: attributes.Status,
          LatestEventStart: attributes.LatestEventStart,
          LatestEventEnd: attributes.LatestEventEnd,
          DateScraped: doc.DateScraped,
          Coordinates: {
            x: geometry.x,
            y: geometry.y,
          },
        };
      }

      console.log(`${timestamp} CSO DATA FOR IDS ${ids.join(",")} CALLED`);
      res.status(200).json(results);
    } catch (error) {
      console.error(`[${timestamp}] Error in csoData:`, error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
