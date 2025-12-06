import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { getBanners, upsertBanner } from "../../libs/services/siteBannerService";

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();
  try {
    const { method, body } = req;
    const session = await getServerSession(req, res, authOptions);

    switch (method) {
      case "GET": {
        try {
          const data = await getBanners();
          res.status(200).json(data);
        } catch (error) {
          console.error(`[${timestamp}] [${req.method}] Error in sitebanner:`, error);
          res.status(500).json({ message: "Internal Server Error" });
        }
        break;
      }
      case "POST": {
        if (!session) {
          console.error(`[${timestamp}] [${req.method}] Unauthorized POST request`);
          return res.status(403).json({ message: "Unauthorized" });
        }
        try {
          const result = await upsertBanner(body);
          res.status(200).json(result);
        } catch (error) {
          console.error(`[${timestamp}] [${req.method}] Error in sitebanner:`, error);
          res.status(400).json({ message: error.message });
        }
        break;
      }
      default:
        res.setHeader("Allow", ["GET", "POST"]);
        res.status(405).end(`Method ${method} Not Allowed`);
    }
  } catch (error) {
    console.error(`[${timestamp}] [${req.method}] Error in sitebanner:`, error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
