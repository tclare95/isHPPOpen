import { getMethodHandler, mapApiError, sendApiError, sendApiSuccess } from "../../libs/api/http";
import { createRequestLogger } from "../../libs/api/logger";
import { getHppStatusSnapshot } from "../../libs/services/hppStatusService";

export default async function handler(req, res) {
  const logger = createRequestLogger(req, "hppstatus");
  const handlers = {
    GET: async () => {
      const { data, context } = await getHppStatusSnapshot();

      if (context.isEmpty) {
        logger.warn("No records found in hppstatus");
        sendApiSuccess(res, data);
        return;
      }

      if (!context.hasClosureRecord) {
        logger.warn("No closure records found in hppstatus");
        sendApiSuccess(res, data);
        return;
      }

      logger.info("HPP status calculated");
      sendApiSuccess(res, data);
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
    logger.error("Error in hppstatus", error);
    sendApiError(res, statusCode, message);
  }
}
