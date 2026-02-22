import { authOptions } from "./auth/[...nextauth]";
import { getBanners, upsertBanner } from "../../libs/services/siteBannerService";
import { getMethodHandler, mapApiError, requireSession } from "../../libs/api/http";

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();

  const handlers = {
    GET: async () => {
      const data = await getBanners();
      res.status(200).json(data);
    },
    POST: async () => {
      await requireSession(req, res, authOptions);
      const result = await upsertBanner(req.body);
      res.status(200).json(result);
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
    console.error(`[${timestamp}] [${req.method}] Error in sitebanner:`, error);
    res.status(statusCode).json({ message });
  }
}
