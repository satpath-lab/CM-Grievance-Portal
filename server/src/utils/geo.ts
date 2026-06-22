/**
 * Geo utilities.
 *
 * Primary use: false-closure detection. When a field officer marks a
 * grievance "Resolved", the app captures the officer's current browser
 * geolocation at upload time and compares it against the original
 * complaint's reported coordinates. A large mismatch (e.g. a "resolved"
 * photo taken several kilometres away) is flagged for audit instead of
 * being silently accepted — this directly targets the documented MCD311
 * pattern of officers attaching photos "from some other place" as fake
 * proof of resolution.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_METERS = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two coordinates, in meters. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Default mismatch threshold: 150 meters.
 * Wider than GPS noise (typically 5-50m) but tight enough to catch
 * "wrong location entirely" fraud, which in observed reports is
 * off by hundreds of meters to kilometers, not tens of meters.
 */
export const PHOTO_MISMATCH_THRESHOLD_METERS = 150;

export interface PhotoVerificationResult {
  distanceMeters: number;
  mismatched: boolean;
  threshold: number;
}

export function verifyResolutionPhotoLocation(
  complaintLocation: LatLng,
  resolutionPhotoLocation: LatLng,
  thresholdMeters: number = PHOTO_MISMATCH_THRESHOLD_METERS
): PhotoVerificationResult {
  const distanceMeters = Math.round(
    haversineMeters(complaintLocation, resolutionPhotoLocation)
  );
  return {
    distanceMeters,
    mismatched: distanceMeters > thresholdMeters,
    threshold: thresholdMeters,
  };
}

/** Find all grievances within a radius (meters) of a point — used for CM "visit mode". */
export function isWithinRadius(
  center: LatLng,
  point: LatLng,
  radiusMeters: number
): boolean {
  return haversineMeters(center, point) <= radiusMeters;
}
