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
          ids = req.query.ids.split(",").map(id => id.trim());
        }
      } else if (req.method === "POST") {
        ids = req.body.ids || [];
      }

      if (!ids || ids.length === 0) {
        return res.status(400).json({ message: "No CSO ids provided" });
      }

      const { db } = await connectToDatabase();
      const csoDataCollection = await db.collection("csoData");

      const cursor = await csoDataCollection
        .find({ "attributes.Id": { $in: ids } })
        .sort({ DateScraped: -1 });

      const docs = await cursor.toArray();

      const results = {};
      for (const doc of docs) {
        const id = doc.attributes.Id;
        if (!results[id]) {
          const { attributes, geometry } = doc;
          results[id] = {
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
