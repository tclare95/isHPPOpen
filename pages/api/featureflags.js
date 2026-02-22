import { getAllFlags } from '../../libs/featureFlags';
import { getMethodHandler, mapApiError } from '../../libs/api/http';

/**
 * API endpoint to expose feature flags to the frontend
 * GET /api/featureflags - Returns all feature flags
 */
export default function handler(req, res) {
  const handlers = {
    GET: async () => {
      const flags = getAllFlags();
      res.status(200).json(flags);
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
    return res.status(statusCode).json({ message });
  }
}
