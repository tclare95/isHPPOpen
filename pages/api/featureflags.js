import { sendApiError } from '../../libs/api/http';

/**
 * Feature flags are removed from the application.
 * Endpoint intentionally returns 404.
 */
export default function handler(req, res) {
  return sendApiError(res, 404, 'Not Found');
}
