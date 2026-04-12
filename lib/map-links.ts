export function buildStopSearchUrl(name: string, placeName: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${placeName}`.trim())}`;
}

export function buildPlaceLookupUrl({
  name,
  regionLabel,
  latitude,
  longitude
}: {
  name: string;
  regionLabel?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  if (typeof latitude === "number" && typeof longitude === "number") {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${latitude},${longitude}`.trim())}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${regionLabel ?? ""}`.trim())}`;
}
