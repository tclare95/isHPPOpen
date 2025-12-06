import { getAllFlags } from '../../libs/featureFlags';

/**
 * API endpoint to expose feature flags to the frontend
 * GET /api/featureflags - Returns all feature flags
 */
export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const flags = getAllFlags();
  return res.status(200).json(flags);
}
