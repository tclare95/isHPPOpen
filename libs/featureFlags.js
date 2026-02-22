/**
 * Legacy module retained temporarily to avoid import breakage.
 * Feature flags are no longer used by the application.
 */

const featureFlags = Object.freeze({});

/**
 * Get a feature flag value
 * @param {string} flagName - The name of the feature flag
 * @returns {boolean} The flag value, defaults to false if not found
 */
export function getFlag(flagName) {
  return Boolean(featureFlags[flagName]);
}

/**
 * Get all feature flags (for API endpoint)
 * @returns {Object} All feature flags
 */
export function getAllFlags() {
  return { ...featureFlags };
}

export default featureFlags;
