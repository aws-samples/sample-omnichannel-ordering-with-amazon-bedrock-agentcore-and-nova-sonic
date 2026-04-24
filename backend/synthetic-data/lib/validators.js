/**
 * Input validation utilities for synthetic data generation.
 */

/**
 * Validate and parse coordinate input.
 * Accepts: "lat, long" or "lat,long"
 * @param {string} input - User input string
 * @returns {{ isValid: boolean, coords: [number, number]|null, error: string }}
 */
function validateCoordinates(input) {
  const trimmed = input.trim();
  const match = trimmed.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);

  if (match) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);

    if (lat < -90 || lat > 90) {
      return { isValid: false, coords: null, error: `Latitude must be between -90 and 90 (got ${lat})` };
    }
    if (lon < -180 || lon > 180) {
      return { isValid: false, coords: null, error: `Longitude must be between -180 and 180 (got ${lon})` };
    }
    return { isValid: true, coords: [lat, lon], error: '' };
  }

  return { isValid: false, coords: null, error: 'Invalid format. Use: latitude, longitude (e.g., 33.4127, -96.5837)' };
}

/**
 * Validate business name input.
 * @param {string} name
 * @returns {{ isValid: boolean, error: string }}
 */
function validateBusinessName(name) {
  const trimmed = (name || '').trim();
  if (trimmed.length < 2) return { isValid: false, error: 'Business name must be at least 2 characters' };
  if (trimmed.length > 100) return { isValid: false, error: 'Business name must be less than 100 characters' };
  return { isValid: true, error: '' };
}

/**
 * Generate a clean location ID from place ID and business name.
 * @param {string} placeId
 * @param {string} businessName
 * @returns {string}
 */
function sanitizeLocationId(placeId, businessName) {
  const suffix = placeId.length >= 8 ? placeId.slice(-8) : placeId;
  let cleanName = businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (cleanName.length > 30) cleanName = cleanName.slice(0, 30).replace(/-$/, '');
  return `loc-${cleanName}-${suffix}`;
}

module.exports = { validateCoordinates, validateBusinessName, sanitizeLocationId };
