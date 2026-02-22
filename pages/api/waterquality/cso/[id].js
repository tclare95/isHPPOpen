import { connectToDatabase } from "../../../../libs/database";
import { getMethodHandler, mapApiError } from "../../../../libs/api/http";

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();
  const handlers = {
    GET: async () => {
      const { id } = req.query;
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
        return;
      }

      res.status(404).json({ message: "CSO data not found" });
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
    console.error(`[${timestamp}] Error in csoData:`, error);
    res.status(statusCode).json({ message });
  }
}
