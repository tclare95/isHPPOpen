/**
 * Feature flags for controlled rollout of new features
 * 
 * Flags can be overridden via environment variables:
 * - FEATURE_USE_S3_FORECAST=true/false
 * - FEATURE_SHOW_FORECAST_CONFIDENCE=true/false
 */

const featureFlags = {
  // Use S3 forecast instead of EA forecast on main page
  USE_S3_FORECAST: process.env.FEATURE_USE_S3_FORECAST === 'true' || true,
  
  // Show confidence intervals on the forecast chart
  SHOW_FORECAST_CONFIDENCE: process.env.FEATURE_SHOW_FORECAST_CONFIDENCE === 'true' || true,
};

/**
 * Get a feature flag value
 * @param {string} flagName - The name of the feature flag
 * @returns {boolean} The flag value, defaults to false if not found
 */
export function getFlag(flagName) {
  return featureFlags[flagName] ?? false;
}

/**
 * Get all feature flags (for API endpoint)
 * @returns {Object} All feature flags
 */
export function getAllFlags() {
  return { ...featureFlags };
}

export default featureFlags;
