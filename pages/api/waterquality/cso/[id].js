import { connectToDatabase } from "../../../../libs/database";

export default async function handler(req, res) {
  const { id } = req.query;
  const timestamp = new Date().toISOString();

  if (req.method === "GET") {
    try {
      const { db } = await connectToDatabase();
      const csoDataCollection = await db.collection("csoData");

      const csoData = await csoDataCollection
        .find({ "attributes.Id": id })
        .sort({ DateScraped: -1 })
        .limit(1)
        .next();

      if (csoData) {
        const { attributes, geometry } = csoData;
        const response = {
          Id: attributes.Id,
          Status: attributes.Status,
          LatestEventStart: attributes.LatestEventStart,
          LatestEventEnd: attributes.LatestEventEnd,
          DateScraped: csoData.DateScraped,
          Coordinates: {
            x: geometry.x,
            y: geometry.y,
          },
        };

        console.log(`${timestamp} CSO DATA FOR ID ${id} CALLED`);
        res.status(200).json(response);
      } else {
        res.status(404).json({ message: "CSO data not found" });
      }
    } catch (error) {
      console.error(`[${timestamp}] Error in csoData:`, error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  } else {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
