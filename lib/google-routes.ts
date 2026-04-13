import { prisma } from "@/lib/prisma";

type RoutePlace = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

type RouteTripDay = {
  id: string;
  tripId: string;
  dayNumber: number;
  miles: number;
  startPlace: RoutePlace;
  endPlace: RoutePlace;
  locations: Array<{
    sortOrder: number;
    place: RoutePlace;
  }>;
  stops: Array<{
    id: string;
    kind: "dinner" | "activity";
    latitude: number | null;
    longitude: number | null;
  }>;
};

type ActivityDistanceTripDay = {
  id: string;
  tripId: string;
  miles: number;
  dayNumber: number;
  startPlace: RoutePlace;
  endPlace: RoutePlace;
  locations: Array<{
    sortOrder: number;
    place: RoutePlace;
  }>;
  stops: Array<{
    id: string;
    kind: "dinner" | "activity";
    latitude: number | null;
    longitude: number | null;
  }>;
};

function getApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || null;
}

function parseDurationSeconds(duration: string | undefined) {
  if (!duration) {
    return null;
  }

  const match = duration.match(/^(\d+)(?:\.\d+)?s$/);
  return match ? Number(match[1]) : null;
}

function getDayStops(day: RouteTripDay) {
  const stops = day.locations.length
    ? day.locations
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((location) => location.place)
    : [day.endPlace];

  return stops.filter(
    (place, index, values) =>
      index === 0 ||
      place.id !== values[index - 1]?.id ||
      place.latitude !== values[index - 1]?.latitude ||
      place.longitude !== values[index - 1]?.longitude
  );
}

function pointsEqual(left: RoutePlace, right: RoutePlace) {
  return left.latitude === right.latitude && left.longitude === right.longitude;
}

function buildDayTitle(day: Pick<RouteTripDay, "startPlace" | "endPlace" | "locations">) {
  const locationNames = day.locations
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((location) => location.place.name.trim())
    .filter(Boolean);

  const normalizedNames = locationNames.length
    ? locationNames.filter((name, index, values) => index === 0 || name !== values[index - 1])
    : [day.startPlace.name, day.endPlace.name].filter(Boolean);

  if (!normalizedNames.length) {
    return `${day.startPlace.name} -> ${day.endPlace.name}`;
  }

  return normalizedNames.join(" -> ");
}

async function computeRoute(origin: RoutePlace, stops: RoutePlace[]) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return null;
  }

  const destination = stops.at(-1);
  if (!destination) {
    return {
      miles: 0,
      distanceMeters: 0,
      durationSeconds: 0,
      routePolyline: null
    };
  }

  const uniquePath = [origin, ...stops].filter(
    (place, index, values) =>
      index === 0 ||
      !pointsEqual(place, values[index - 1] as RoutePlace)
  );

  if (uniquePath.length < 2) {
    return {
      miles: 0,
      distanceMeters: 0,
      durationSeconds: 0,
      routePolyline: null
    };
  }

  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline"
    },
    body: JSON.stringify({
      origin: {
        location: {
          latLng: {
            latitude: origin.latitude,
            longitude: origin.longitude
          }
        }
      },
      destination: {
        location: {
          latLng: {
            latitude: destination.latitude,
            longitude: destination.longitude
          }
        }
      },
      intermediates: stops.slice(0, -1).map((stop) => ({
        location: {
          latLng: {
            latitude: stop.latitude,
            longitude: stop.longitude
          }
        }
      })),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE"
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Routes API request failed: ${response.status} ${body}`);
  }

  const payload = (await response.json()) as {
    routes?: Array<{
      distanceMeters?: number;
      duration?: string;
      polyline?: {
        encodedPolyline?: string;
      };
    }>;
  };

  const route = payload.routes?.[0];
  if (!route) {
    throw new Error("Google Routes API did not return a route.");
  }

  const distanceMeters = route.distanceMeters ?? 0;
  const durationSeconds = parseDurationSeconds(route.duration) ?? 0;

  return {
    miles: Math.round(distanceMeters / 1609.344),
    distanceMeters,
    durationSeconds,
    routePolyline: route.polyline?.encodedPolyline ?? null
  };
}

async function computePointToPointDistance(origin: RoutePlace, destination: RoutePlace) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return null;
  }

  if (pointsEqual(origin, destination)) {
    return {
      miles: 0,
      distanceMeters: 0
    };
  }

  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.distanceMeters"
    },
    body: JSON.stringify({
      origin: {
        location: {
          latLng: {
            latitude: origin.latitude,
            longitude: origin.longitude
          }
        }
      },
      destination: {
        location: {
          latLng: {
            latitude: destination.latitude,
            longitude: destination.longitude
          }
        }
      },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE"
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Routes API distance request failed: ${response.status} ${body}`);
  }

  const payload = (await response.json()) as {
    routes?: Array<{
      distanceMeters?: number;
    }>;
  };

  const route = payload.routes?.[0];
  if (!route) {
    throw new Error("Google Routes API did not return a point-to-point route.");
  }

  const distanceMeters = route.distanceMeters ?? 0;
  return {
    miles: Math.round(distanceMeters / 1609.344),
    distanceMeters
  };
}

function buildRoutePath(day: Pick<RouteTripDay, "startPlace" | "endPlace" | "locations">) {
  const orderedStops = getDayStops({
    ...day,
    id: "",
    tripId: "",
    dayNumber: 0,
    miles: 0,
    stops: []
  });

  const path = [day.startPlace, ...orderedStops].filter(
    (place, index, values) =>
      index === 0 ||
      !pointsEqual(place, values[index - 1] as RoutePlace)
  );

  if (path.length === 1 && !pointsEqual(path[0] as RoutePlace, day.endPlace)) {
    path.push(day.endPlace);
  }

  return path;
}

export async function recomputeTripActivityDistances(tripId: string) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      days: {
        orderBy: { dayNumber: "asc" },
        include: {
          startPlace: true,
          endPlace: true,
          locations: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            include: {
              place: true
            }
          },
          stops: {
            orderBy: [{ kind: "asc" }, { sortOrder: "asc" }]
          }
        }
      }
    }
  });

  if (!trip) {
    throw new Error("Trip not found.");
  }

  const now = new Date();
  const pairDistanceCache = new Map<string, Awaited<ReturnType<typeof computePointToPointDistance>>>();

  async function getCachedDistance(origin: RoutePlace, destination: RoutePlace) {
    const forwardKey = `${origin.latitude},${origin.longitude}|${destination.latitude},${destination.longitude}`;
    const reverseKey = `${destination.latitude},${destination.longitude}|${origin.latitude},${origin.longitude}`;

    if (pairDistanceCache.has(forwardKey)) {
      return pairDistanceCache.get(forwardKey) ?? null;
    }

    if (pairDistanceCache.has(reverseKey)) {
      return pairDistanceCache.get(reverseKey) ?? null;
    }

    const computed = await computePointToPointDistance(origin, destination);
    pairDistanceCache.set(forwardKey, computed);
    pairDistanceCache.set(reverseKey, computed);
    return computed;
  }

  const fullTripPath: RoutePlace[] = [];
  let previousLastPlace: RoutePlace | null = null;

  for (const day of trip.days as ActivityDistanceTripDay[]) {
    const dayPath = buildRoutePath({
      startPlace: previousLastPlace ?? day.startPlace,
      endPlace: day.endPlace,
      locations: day.locations
    });

    for (const place of dayPath) {
      if (!fullTripPath.length || !pointsEqual(fullTripPath.at(-1) as RoutePlace, place)) {
        fullTripPath.push(place);
      }
    }

    previousLastPlace = dayPath.at(-1) ?? previousLastPlace;
  }

  for (const day of trip.days as ActivityDistanceTripDay[]) {
    for (const stop of day.stops) {
      if (stop.kind !== "activity" || stop.latitude == null || stop.longitude == null) {
        await prisma.dayStop.update({
          where: { id: stop.id },
          data: {
            detourDistanceMeters: null,
            detourMiles: null,
            distanceComputedAt: stop.kind === "activity" ? now : null
          }
        });
        continue;
      }

      const stopPlace = {
        id: stop.id,
        name: stop.id,
        latitude: stop.latitude,
        longitude: stop.longitude
      } satisfies RoutePlace;

      let bestDetour: Awaited<ReturnType<typeof computePointToPointDistance>> | null = null;

      for (let index = 0; index < fullTripPath.length - 1; index += 1) {
        const segmentOrigin = fullTripPath[index] as RoutePlace;
        const segmentDestination = fullTripPath[index + 1] as RoutePlace;

        const [baseSegment, legOut, legBack] = await Promise.all([
          getCachedDistance(segmentOrigin, segmentDestination),
          getCachedDistance(segmentOrigin, stopPlace),
          getCachedDistance(stopPlace, segmentDestination)
        ]);

        if (!baseSegment || !legOut || !legBack) {
          continue;
        }

        const detourDistanceMeters = Math.max(
          0,
          legOut.distanceMeters + legBack.distanceMeters - baseSegment.distanceMeters
        );

        const detour = {
          distanceMeters: detourDistanceMeters,
          miles: Math.round(detourDistanceMeters / 1609.344)
        };

        if (!bestDetour || detour.distanceMeters < bestDetour.distanceMeters) {
          bestDetour = detour;
        }
      }

      await prisma.dayStop.update({
        where: { id: stop.id },
        data: {
          detourDistanceMeters: bestDetour?.distanceMeters ?? null,
          detourMiles: bestDetour?.miles ?? null,
          distanceComputedAt: now
        }
      });
    }
  }
}

export async function recomputeTripRoutes(tripId: string) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      days: {
        orderBy: { dayNumber: "asc" },
        include: {
          startPlace: true,
          endPlace: true,
          locations: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            include: {
              place: true
            }
          },
          stops: {
            orderBy: [{ kind: "asc" }, { sortOrder: "asc" }]
          }
        }
      }
    }
  });

  if (!trip) {
    throw new Error("Trip not found.");
  }

  let previousLastPlace: RoutePlace | null = null;
  let totalMiles = 0;

  for (const day of trip.days as RouteTripDay[]) {
    const origin = previousLastPlace ?? day.startPlace;
    const stops = getDayStops(day);
    const computed = await computeRoute(origin, stops);

    if (computed) {
      await prisma.tripDay.update({
        where: { id: day.id },
        data: {
          title: buildDayTitle(day),
          miles: computed.miles,
          distanceMeters: computed.distanceMeters,
          durationSeconds: computed.durationSeconds,
          routePolyline: computed.routePolyline,
          routeComputedAt: new Date()
        }
      });
      totalMiles += computed.miles;
    } else {
      await prisma.tripDay.update({
        where: { id: day.id },
        data: {
          title: buildDayTitle(day)
        }
      });
      totalMiles += day.miles;
    }

    previousLastPlace = stops.at(-1) ?? day.endPlace;
  }

  await prisma.trip.update({
    where: { id: trip.id },
    data: {
      totalMiles
    }
  });

  await recomputeTripActivityDistances(tripId);
}
