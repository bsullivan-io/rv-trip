import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const AUTO_TRACK_MIN_MILES = 0.15;

type Coordinates = {
  latitude: number;
  longitude: number;
};

type ReverseGeocodeResult = {
  cityName: string | null;
  stateCode: string | null;
  stateName: string | null;
  timezone: string | null;
};

export function distanceMiles(a: Coordinates, b: Coordinates) {
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

function getApiKey() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  return apiKey;
}

export async function requireTrackerAdmin() {
  const session = await getAdminSession();
  if (!session) {
    throw new Error("Unauthorized.");
  }
  return session;
}

export async function reverseGeocodeLocation(latitude: number, longitude: number, recordedAt?: Date): Promise<ReverseGeocodeResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { cityName: null, stateCode: null, stateName: null, timezone: null };
  }

  const timestampSeconds = Math.floor((recordedAt ?? new Date()).getTime() / 1000);

  const [geocodeResponse, timezoneResponse] = await Promise.all([
    fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`),
    fetch(`https://maps.googleapis.com/maps/api/timezone/json?location=${latitude},${longitude}&timestamp=${timestampSeconds}&key=${apiKey}`)
  ]);

  let cityName: string | null = null;
  let stateCode: string | null = null;
  let stateName: string | null = null;
  let timezone: string | null = null;

  if (geocodeResponse.ok) {
    const payload = (await geocodeResponse.json()) as {
      results?: Array<{
        address_components?: Array<{
          long_name?: string;
          short_name?: string;
          types?: string[];
        }>;
      }>;
    };

    for (const result of payload.results ?? []) {
      for (const component of result.address_components ?? []) {
        if (
          !cityName &&
          (component.types?.includes("locality") ||
            component.types?.includes("postal_town") ||
            component.types?.includes("administrative_area_level_3") ||
            component.types?.includes("sublocality"))
        ) {
          cityName = component.long_name ?? null;
        }

        if (component.types?.includes("administrative_area_level_1")) {
          stateCode = component.short_name ?? null;
          stateName = component.long_name ?? null;
        }
      }
    }
  }

  if (timezoneResponse.ok) {
    const tzPayload = (await timezoneResponse.json()) as { timeZoneId?: string; status?: string };
    if (tzPayload.status === "OK" && tzPayload.timeZoneId) {
      timezone = tzPayload.timeZoneId;
    }
  }

  return { cityName, stateCode, stateName, timezone };
}

export async function resolveTrackerDayId(tripId: string, recordedAt: Date) {
  const recordedDay = new Date(Date.UTC(recordedAt.getUTCFullYear(), recordedAt.getUTCMonth(), recordedAt.getUTCDate(), 12, 0, 0));
  const day = await prisma.tripDay.findFirst({
    where: {
      tripId,
      date: {
        equals: recordedDay
      }
    },
    select: { id: true }
  });

  if (day) {
    return day.id;
  }

  const days = await prisma.tripDay.findMany({
    where: { tripId },
    select: {
      id: true,
      date: true
    }
  });

  const datedDays = days.filter((candidate): candidate is { id: string; date: Date } => Boolean(candidate.date));
  if (!datedDays.length) {
    return null;
  }

  datedDays.sort(
    (left, right) =>
      Math.abs(left.date.getTime() - recordedDay.getTime()) - Math.abs(right.date.getTime() - recordedDay.getTime())
  );

  return datedDays[0]?.id ?? null;
}

export function shouldPersistAutoPoint(
  lastPoint: { latitude: number; longitude: number },
  nextPoint: { latitude: number; longitude: number }
) {
  const movedMiles = distanceMiles(
    { latitude: lastPoint.latitude, longitude: lastPoint.longitude },
    { latitude: nextPoint.latitude, longitude: nextPoint.longitude }
  );
  return movedMiles >= AUTO_TRACK_MIN_MILES;
}

export async function persistTrackerPoint(input: {
  tripSlug: string;
  latitude: number;
  longitude: number;
  source: "auto" | "checkin";
  note?: string | null;
  author?: string | null;
  recordedAt?: Date;
}) {
  const trip = await prisma.trip.findUnique({
    where: { slug: input.tripSlug },
    select: {
      id: true,
      slug: true,
      trackPoints: {
        orderBy: { recordedAt: "desc" },
        take: 1,
        select: {
          latitude: true,
          longitude: true,
          recordedAt: true
        }
      }
    }
  });

  if (!trip) {
    throw new Error("Trip not found.");
  }

  const recordedAt = input.recordedAt ?? new Date();
  const lastPoint = trip.trackPoints[0] ?? null;

  if (input.source === "auto" && lastPoint) {
    if (
      !shouldPersistAutoPoint(lastPoint, {
        latitude: input.latitude,
        longitude: input.longitude
      })
    ) {
      return { stored: false as const, reason: "threshold" };
    }
  }

  const [tripDayId, location] = await Promise.all([
    resolveTrackerDayId(trip.id, recordedAt),
    reverseGeocodeLocation(input.latitude, input.longitude, recordedAt)
  ]);

  const point = await prisma.tripTrackPoint.create({
    data: {
      tripId: trip.id,
      tripDayId,
      latitude: input.latitude,
      longitude: input.longitude,
      recordedAt,
      source: input.source,
      note: input.note?.trim() || null,
      author: input.author?.trim() || null,
      cityName: location.cityName,
      stateCode: location.stateCode,
      stateName: location.stateName,
      timezone: location.timezone
    }
  });

  return { stored: true as const, point };
}

export function sumTrackedMiles(
  points: Array<{ latitude: number; longitude: number }>
) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distanceMiles(points[index - 1]!, points[index]!);
  }
  return Math.round(total);
}
