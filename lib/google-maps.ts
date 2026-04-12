import { slugify } from "@/lib/utils";

type Coordinates = {
  latitude: number;
  longitude: number;
};

export type ParsedGoogleMapsLink = {
  name: string;
  coordinates: Coordinates | null;
};

export function distanceMiles(a: Coordinates, b: Coordinates) {
  const earthRadiusMiles = 3958.8;
  const toRadians = (value: number) => value * (Math.PI / 180);
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const haversine =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(haversine));
}

function parseCoordinatePair(value: string | null) {
  if (!value) return null;
  const match = value.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;

  return {
    latitude: Number(match[1]),
    longitude: Number(match[2])
  };
}

export function parseGoogleMapsLink(rawUrl: string): ParsedGoogleMapsLink {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("Paste a valid Google Maps URL.");
  }

  const host = url.hostname.toLowerCase();
  if (!host.includes("google.") && host !== "maps.google.com") {
    throw new Error("Only direct Google Maps URLs are supported right now.");
  }

  const decoded = decodeURIComponent(rawUrl);
  const params = url.searchParams;

  const candidates = [
    parseCoordinatePair(params.get("query")),
    parseCoordinatePair(params.get("ll")),
    parseCoordinatePair(params.get("sll")),
    parseCoordinatePair(params.get("near"))
  ].filter(Boolean) as Coordinates[];

  const patterns = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /destination=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/
  ];

  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (match) {
      candidates.push({
        latitude: Number(match[1]),
        longitude: Number(match[2])
      });
    }
  }

  const name =
    params.get("q") ||
    params.get("query") ||
    decoded.split("/place/")[1]?.split("/")[0]?.replace(/\+/g, " ") ||
    decoded.split("/search/")[1]?.split("/")[0]?.replace(/\+/g, " ") ||
    "Added stop";

  return {
    name: name.trim(),
    coordinates: candidates[0] ?? null
  };
}

export function makeUniqueSlug(baseName: string, existingSlugs: Set<string>) {
  const baseSlug = slugify(baseName) || "added-stop";
  let candidate = baseSlug;
  let suffix = 2;

  while (existingSlugs.has(candidate)) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}
