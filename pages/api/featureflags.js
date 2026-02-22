import { getAllFlags } from '../../libs/featureFlags';
import { getMethodHandler, mapApiError, sendApiError, sendApiSuccess } from '../../libs/api/http';

/**
 * API endpoint to expose feature flags to the frontend
 * GET /api/featureflags - Returns all feature flags
 */
export default function handler(req, res) {
  const handlers = {
    GET: async () => {
      const flags = getAllFlags();
      sendApiSuccess(res, flags);
    },
  };

  try {
    const methodHandler = getMethodHandler(req, res, handlers);
    if (!methodHandler) {
      return;
    }

    return methodHandler();
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendApiError(res, statusCode, message);
  }
}
