import { authOptions } from "./auth/[...nextauth]";
import { getBanners, upsertBanner } from "../../libs/services/siteBannerService";
import {
  getMethodHandler,
  mapApiError,
  parseJsonObjectBody,
  requireSession,
  sendApiError,
  sendApiSuccess,
} from "../../libs/api/http";
import { createRequestLogger } from "../../libs/api/logger";

export default async function handler(req, res) {
  const logger = createRequestLogger(req, "sitebanner");

  const handlers = {
    GET: async () => {
      const data = await getBanners();
      sendApiSuccess(res, data);
    },
    POST: async () => {
      await requireSession(req, res, authOptions);
      const payload = parseJsonObjectBody(req.body);
      const result = await upsertBanner(payload);
      sendApiSuccess(res, {
        message: "Banner updated",
        modifiedCount: result.modifiedCount,
        upsertedCount: result.upsertedCount,
      });
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
    logger.error("Error in sitebanner", error);
    sendApiError(res, statusCode, message);
  }
}
