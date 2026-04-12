import { searchTextPlaces } from "@/lib/google-places";
import { prisma } from "@/lib/prisma";

type Coord = {
  latitude: number;
  longitude: number;
};

function distanceMiles(left: Coord, right: Coord) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(right.latitude - left.latitude);
  const dLon = toRadians(right.longitude - left.longitude);
  const lat1 = toRadians(left.latitude);
  const lat2 = toRadians(right.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function prefetchHotDogPlacesForTrip(tripId: string) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      days: {
        orderBy: { dayNumber: "asc" },
        include: {
          endPlace: true,
          locations: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            include: {
              place: true
            }
          }
        }
      }
    }
  });

  if (!trip) {
    throw new Error("Trip not found.");
  }

  const anchors = trip.days.flatMap((day) => {
    const places = day.locations.length ? day.locations.map((location) => location.place) : [day.endPlace];
    return places.map((place) => ({
      latitude: place.latitude,
      longitude: place.longitude
    }));
  });

  const uniqueAnchors = anchors.filter(
    (anchor, index, values) =>
      values.findIndex((candidate) => candidate.latitude === anchor.latitude && candidate.longitude === anchor.longitude) === index
  );

  const resultSets = await Promise.all(
    uniqueAnchors.map((anchor) =>
      searchTextPlaces({
        query: "hot dog restaurant",
        latitude: anchor.latitude,
        longitude: anchor.longitude,
        radiusMeters: 50000,
        maxResultCount: 8
      })
    )
  );

  const hotDogPlaces = new Map<
    string,
    {
      googlePlaceId: string;
      name: string;
      address: string | null;
      latitude: number;
      longitude: number;
    }
  >();

  for (const places of resultSets) {
    for (const place of places) {
      if (!hotDogPlaces.has(place.placeId)) {
        hotDogPlaces.set(place.placeId, {
          googlePlaceId: place.placeId,
          name: place.name,
          address: place.address,
          latitude: place.latitude,
          longitude: place.longitude
        });
      }
    }
  }

  await prisma.hotDogPlace.deleteMany({
    where: { tripId }
  });

  for (const place of hotDogPlaces.values()) {
    const nearestDay = trip.days
      .map((day) => {
        const dayPlaces = day.locations.length ? day.locations.map((location) => location.place) : [day.endPlace];
        return {
          day,
          distance: Math.min(
            ...dayPlaces.map((candidate) =>
              distanceMiles(place, {
                latitude: candidate.latitude,
                longitude: candidate.longitude
              })
            )
          )
        };
      })
      .sort((left, right) => left.distance - right.distance)[0]?.day;

    if (!nearestDay) {
      continue;
    }

    await prisma.hotDogPlace.create({
      data: {
        tripId,
        tripDayId: nearestDay.id,
        googlePlaceId: place.googlePlaceId,
        name: place.name,
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude
      }
    });
  }
}
