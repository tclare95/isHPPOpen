import { connectToDatabase } from "../../../libs/database";

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();
  const { startDate, endDate } = req.query;

  // Default to the last 3 months if no date range is provided.
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate
    ? new Date(startDate)
    : new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);

  if (req.method === "GET") {
    try {
      const { db } = await connectToDatabase();
      const csoDataCollection = await db.collection("csoData");

      const csoData = await csoDataCollection.aggregate([
        {
          $match: {
            DateScraped: { $gte: start, $lte: end },
          },
        },
        {
          // Normalize both LatestEventStart and LatestEventEnd to the minute.
          $project: {
            Id: "$attributes.Id",
            LatestEventStart: {
              $dateTrunc: {
                date: "$attributes.LatestEventStart",
                unit: "minute"
              }
            },
            LatestEventEnd: {
              $cond: [
                { $ifNull: ["$attributes.LatestEventEnd", false] },
                {
                  $dateTrunc: {
                    date: "$attributes.LatestEventEnd",
                    unit: "minute"
                  }
                },
                null
              ]
            },
            Status: "$attributes.Status",
            DateScraped: 1
          },
        },
        {
          // Sort so that the most recent document for each event comes first.
          $sort: { DateScraped: -1 },
        },
        {
          // Group by unique event fields.
          $group: {
            _id: {
              Id: "$Id",
              LatestEventStart: "$LatestEventStart",
              LatestEventEnd: "$LatestEventEnd",
            },
            rep: { $first: "$$ROOT" }
          },
        },
        {
          // Compute the active time per unique event (once only).
          $project: {
            Id: "$_id.Id",
            eventActiveTime: {
                $cond: [
                  { $eq: [ "$rep.Status", 1 ] },
                  // For active events, use the scrape time instead of $$NOW.
                  { $subtract: [ "$rep.DateScraped", "$_id.LatestEventStart" ] },
                  {
                    $cond: [
                      { $ifNull: [ "$_id.LatestEventEnd", false ] },
                      { $subtract: [ "$_id.LatestEventEnd", "$_id.LatestEventStart" ] },
                      0
                    ]
                  }
                ]
              }
          },
        },
        {
          // Sum event active times for each CSO Id.
          $group: {
            _id: "$Id",
            totalActiveTime: { $sum: "$eventActiveTime" }
          }
        },
        {
          $sort: { totalActiveTime: -1 }
        }
      ]).toArray();

      // Convert milliseconds to hours.
      const worstOffenders = csoData.map((cso) => ({
        Id: cso._id,
        TotalActiveTime: (cso.totalActiveTime / (1000 * 60 * 60)).toFixed(3)
      }));

      console.log(`${timestamp} WORST OFFENDERS CALLED`);
      res.status(200).json({ worstOffenders });
    } catch (error) {
      console.error(`[${timestamp}] Error in worstoffenders:`, error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  } else {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}