type Coordinates = {
  latitude: number;
  longitude: number;
};

type Candidate = Coordinates & {
  name: string;
};

type TrackerPointLike = Coordinates & {
  cityName?: string | null;
  stateCode?: string | null;
  stateName?: string | null;
};

function distanceMiles(a: Coordinates, b: Coordinates) {
  const earthRadiusMiles = 3958.8;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const haversine =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(haversine));
}

export function formatTrackerFallbackLabel(point: TrackerPointLike) {
  return [point.cityName, point.stateCode ?? point.stateName].filter(Boolean).join(", ") || point.stateName || "Tracked location";
}

export function resolveTrackerPointLabel(point: TrackerPointLike, candidates: Candidate[], maxDistanceMiles = 0.1) {
  let closest: { name: string; distance: number } | null = null;

  for (const candidate of candidates) {
    const distance = distanceMiles(point, candidate);
    if (!closest || distance < closest.distance) {
      closest = { name: candidate.name, distance };
    }
  }

  if (closest && closest.distance <= maxDistanceMiles) {
    return closest.name;
  }

  return formatTrackerFallbackLabel(point);
}
