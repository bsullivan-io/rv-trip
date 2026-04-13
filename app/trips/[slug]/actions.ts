"use server";

import { DayStopKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { initialBatchActivitiesState, type BatchActivitiesState } from "@/lib/batch-activities";
import { requireAdmin } from "@/lib/auth";
import { getPlaceDetails, searchTextPlaces } from "@/lib/google-places";
import { recomputeTripActivityDistances, recomputeTripRoutes } from "@/lib/google-routes";
import { distanceMiles, makeUniqueSlug, parseGoogleMapsLink } from "@/lib/google-maps";
import { deleteUploadedPhoto, extractPhotoMetadata, matchPhotoToDay, saveUploadedMedia, saveUploadedPhoto } from "@/lib/photo-import";
import { prisma } from "@/lib/prisma";
import { slugify, toOptionalString, toRequiredString } from "@/lib/utils";

function buildTripRedirect(slug: string, params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/trips/${slug}${search.toString() ? `?${search.toString()}` : ""}`;
}

function buildTrackerRedirect(slug: string, params: Record<string, string> = {}) {
  const search = new URLSearchParams(params);
  return `/trips/${slug}/overview${search.toString() ? `?${search.toString()}` : ""}`;
}

function buildDayMediaTitle(dayNumber: number, locationName: string) {
  return `Day ${dayNumber} - ${locationName}`;
}

async function revalidateTrip(slug: string) {
  revalidatePath(`/trips/${slug}`);
  revalidatePath(`/trips/${slug}/locations`);
  revalidatePath(`/trips/${slug}/summary`);
  revalidatePath(`/trips/${slug}/overview`);
  revalidatePath(`/trips/${slug}/batch-activities`);
  revalidatePath("/");
}

async function loadTripForAssignment(tripId: string) {
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
          }
        }
      }
    }
  });

  if (!trip || !trip.days.length) {
    throw new Error("That trip could not be loaded.");
  }

  return trip;
}

async function resolveTargetDay(tripId: string, selectedDayNumber: number, latitude: number, longitude: number) {
  const trip = await loadTripForAssignment(tripId);
  return resolveTargetDayFromTrip(trip, selectedDayNumber, latitude, longitude)?.day ?? null;
}

function resolveTargetDayFromTrip(
  trip: Awaited<ReturnType<typeof loadTripForAssignment>>,
  selectedDayNumber: number,
  latitude: number,
  longitude: number
) {
  const rankedDays = trip.days
    .map((day) => {
      const candidatePlaces = day.locations.length ? day.locations.map((location) => location.place) : [day.endPlace];

      return {
        day,
        distance: Math.min(
          ...candidatePlaces.map((place) =>
            distanceMiles(
              { latitude, longitude },
              {
                latitude: place.latitude,
                longitude: place.longitude
              }
            )
          )
        ),
        tieBreaker: day.dayNumber === selectedDayNumber ? 0 : 1
      };
    })
    .sort((left, right) => left.distance - right.distance || left.tieBreaker - right.tieBreaker);

  return rankedDays[0] ?? null;
}

function getTripAnchorPlaces(trip: Awaited<ReturnType<typeof loadTripForAssignment>>) {
  return trip.days
    .flatMap((day) => (day.locations.length ? day.locations.map((location) => location.place) : [day.endPlace]))
    .filter(
      (place, index, values) =>
        values.findIndex(
          (candidate) =>
            candidate.id === place.id ||
            (candidate.latitude === place.latitude && candidate.longitude === place.longitude)
        ) === index
    );
}

async function resolveBatchActivityCandidate(trip: Awaited<ReturnType<typeof loadTripForAssignment>>, line: string) {
  const anchors = getTripAnchorPlaces(trip);
  const candidates = new Map<
    string,
    {
      placeId: string;
      name: string;
      address: string | null;
      latitude: number;
      longitude: number;
    }
  >();

  for (const anchor of anchors) {
    const matches = await searchTextPlaces({
      query: line,
      latitude: anchor.latitude,
      longitude: anchor.longitude,
      radiusMeters: 50000,
      maxResultCount: 3
    });

    for (const match of matches) {
      candidates.set(match.placeId, match);
    }

    if (candidates.size >= 5) {
      break;
    }
  }

  const rankedCandidates = [...candidates.values()]
    .map((candidate) => {
      const rankedDay = resolveTargetDayFromTrip(trip, 0, candidate.latitude, candidate.longitude);
      return rankedDay
        ? {
            candidate,
            targetDay: rankedDay.day,
            distance: rankedDay.distance
          }
        : null;
    })
    .filter(
      (
        value
      ): value is {
        candidate: {
          placeId: string;
          name: string;
          address: string | null;
          latitude: number;
          longitude: number;
        };
        targetDay: Awaited<ReturnType<typeof loadTripForAssignment>>["days"][number];
        distance: number;
      } => Boolean(value)
    )
    .sort((left, right) => left.distance - right.distance);

  return rankedCandidates[0] ?? null;
}

async function resolveOrCreatePlace(name: string, latitude: number, longitude: number, googlePlaceId?: string | null) {
  const allPlaces = await prisma.place.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      googlePlaceId: true,
      latitude: true,
      longitude: true
    }
  });

  const placeByGoogleId = googlePlaceId
    ? allPlaces.find((place) => place.googlePlaceId === googlePlaceId) ?? null
    : null;
  const placeByName =
    allPlaces.find((place) => place.name.toLowerCase() === name.toLowerCase()) ?? null;
  const placeByCoordinates =
    allPlaces.find(
      (place) =>
        distanceMiles(
          { latitude, longitude },
          {
            latitude: place.latitude,
            longitude: place.longitude
          }
        ) <= 0.5
    ) ?? null;

  let matchedPlace = placeByGoogleId ?? placeByName ?? placeByCoordinates ?? null;

  if (!matchedPlace) {
    matchedPlace = await prisma.place.create({
      data: {
        name,
        slug: makeUniqueSlug(name, new Set(allPlaces.map((place) => place.slug))),
        regionLabel: null,
        googlePlaceId: googlePlaceId ?? null,
        latitude,
        longitude
      }
    });
  } else if (placeByGoogleId && matchedPlace.id !== placeByGoogleId.id) {
    matchedPlace = placeByGoogleId;
  } else if (googlePlaceId && matchedPlace.googlePlaceId !== googlePlaceId) {
    matchedPlace = await prisma.place.update({
      where: { id: matchedPlace.id },
      data: {
        googlePlaceId,
        latitude,
        longitude
      }
    });
  } else if (
    matchedPlace.name !== name ||
    matchedPlace.latitude !== latitude ||
    matchedPlace.longitude !== longitude
  ) {
    matchedPlace = await prisma.place.update({
      where: { id: matchedPlace.id },
      data: {
        name,
        latitude,
        longitude
      }
    });
  }

  return matchedPlace;
}

async function addEntryToTripDay({
  tripId,
  slug,
  selectedDayNumber,
  name,
  latitude,
  longitude,
  kindValue,
  noteOverride,
  sourceUrl,
  googlePlaceId
}: {
  tripId: string;
  slug: string;
  selectedDayNumber: number;
  name: string;
  latitude: number;
  longitude: number;
  kindValue: string;
  noteOverride: string | null;
  sourceUrl?: string | null;
  googlePlaceId?: string | null;
}) {
  const kind = kindValue === "dinner" ? DayStopKind.dinner : DayStopKind.activity;
  const matchedPlace = await resolveOrCreatePlace(name, latitude, longitude, googlePlaceId);
  const targetDay = await resolveTargetDay(tripId, selectedDayNumber, latitude, longitude);

  if (!targetDay) {
    throw new Error("No matching day was found for that location.");
  }

  if (kindValue === "location") {
    const duplicateLocation = await prisma.dayLocation.findFirst({
      where: {
        tripDayId: targetDay.id,
        placeId: matchedPlace.id
      }
    });

    if (duplicateLocation) {
      throw new Error(`"${matchedPlace.name}" is already listed on Day ${targetDay.dayNumber}.`);
    }

    const lastLocation = await prisma.dayLocation.findFirst({
      where: { tripDayId: targetDay.id },
      orderBy: { sortOrder: "desc" }
    });

    await prisma.dayLocation.create({
      data: {
        tripDayId: targetDay.id,
        placeId: matchedPlace.id,
        sortOrder: (lastLocation?.sortOrder ?? 0) + 1,
        note: noteOverride
      }
    });

    await recomputeTripRoutes(tripId);
    await revalidateTrip(slug);
    redirect(
      buildTripRedirect(slug, {
        added: matchedPlace.name,
        day: String(targetDay.dayNumber),
        place: matchedPlace.name,
        mode: "location"
      })
    );
  }

  const duplicateStop = await prisma.dayStop.findFirst({
    where: {
      tripDayId: targetDay.id,
      kind,
      name
    }
  });

  if (duplicateStop) {
    throw new Error(`"${name}" is already listed on Day ${targetDay.dayNumber}.`);
  }

  const lastStop = await prisma.dayStop.findFirst({
    where: {
      tripDayId: targetDay.id,
      kind
    },
    orderBy: { sortOrder: "desc" }
  });

  await prisma.dayStop.create({
    data: {
      tripDayId: targetDay.id,
      kind,
      sortOrder: (lastStop?.sortOrder ?? 0) + 1,
      name,
      note: noteOverride ?? `Added near ${targetDay.locations.at(-1)?.place.name ?? targetDay.endPlace.name}.`,
      sourceUrl: sourceUrl ?? null,
      latitude: matchedPlace.latitude,
      longitude: matchedPlace.longitude,
      placeId: matchedPlace.id
    }
  });

  if (kind === DayStopKind.activity) {
    await recomputeTripActivityDistances(tripId);
  }
  await revalidateTrip(slug);
  redirect(
    buildTripRedirect(slug, {
      added: name,
      day: String(targetDay.dayNumber),
      place: matchedPlace.name,
      mode: kindValue
    })
  );
}

export async function addStopFromGoogleMapsAction(formData: FormData) {
  const tripId = toRequiredString(formData.get("tripId"), "Trip ID");
  const slug = toRequiredString(formData.get("slug"), "Trip slug");
  const mapUrl = toRequiredString(formData.get("mapUrl"), "Google Maps URL");
  const selectedDayNumber = Number(formData.get("selectedDayNumber") ?? 0) || 0;
  const kindValue = String(formData.get("kind") ?? "location");
  const noteOverride = toOptionalString(formData.get("note"));

  try {
    const parsed = parseGoogleMapsLink(mapUrl);

    if (!parsed.coordinates) {
      throw new Error("That Google Maps link does not include enough location data to place it on the itinerary.");
    }

    await addEntryToTripDay({
      tripId,
      slug,
      selectedDayNumber,
      name: parsed.name,
      latitude: parsed.coordinates.latitude,
      longitude: parsed.coordinates.longitude,
      kindValue,
      noteOverride,
      sourceUrl: mapUrl
    });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirect(buildTripRedirect(slug, { error: error instanceof Error ? error.message : "Could not add that Google Maps link." }));
  }
}

export async function addPlaceSearchAction(formData: FormData) {
  const tripId = toRequiredString(formData.get("tripId"), "Trip ID");
  const slug = toRequiredString(formData.get("slug"), "Trip slug");
  const placeId = toRequiredString(formData.get("placeId"), "Place ID");
  const selectedDayNumber = Number(formData.get("selectedDayNumber") ?? 0) || 0;
  const kindValue = String(formData.get("kind") ?? "location");
  const noteOverride = toOptionalString(formData.get("note"));

  try {
    const details = await getPlaceDetails(placeId);

    await addEntryToTripDay({
      tripId,
      slug,
      selectedDayNumber,
      name: details.name,
      latitude: details.latitude,
      longitude: details.longitude,
      kindValue,
      noteOverride,
      googlePlaceId: details.placeId
    });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirect(buildTripRedirect(slug, { error: error instanceof Error ? error.message : "Could not add that place." }));
  }
}

export async function uploadTripPhotoAction(formData: FormData) {
  await requireAdmin();

  const tripId = toRequiredString(formData.get("tripId"), "Trip ID");
  const slug = toRequiredString(formData.get("slug"), "Trip slug");
  const selectedDayNumber = Number(formData.get("selectedDayNumber") ?? 0) || 0;
  const file = formData.get("photo");

  if (!(file instanceof File) || !file.size) {
    redirect(buildTripRedirect(slug, { error: "Select a photo to upload." }));
  }

  try {
    const { buffer, relativePath } = await saveUploadedPhoto(file);
    const metadata = await extractPhotoMetadata(buffer);
    const trip = await loadTripForAssignment(tripId);
    const matchedDay = matchPhotoToDay(
      trip.days.map((day) => ({
        id: day.id,
        dayNumber: day.dayNumber,
        date: day.date?.toISOString() ?? null,
        locations: day.locations,
        endPlace: {
          name: day.endPlace.name,
          latitude: day.endPlace.latitude,
          longitude: day.endPlace.longitude
        }
      })),
      metadata,
      selectedDayNumber
    );

    await prisma.tripPhoto.create({
      data: {
        tripDayId: matchedDay.id,
        filePath: relativePath,
        originalFilename: file.name,
        title: `Day ${matchedDay.dayNumber} - ${matchedDay.endPlace.name}`,
        caption: null,
        mimeType: file.type || null,
        capturedAt: metadata.capturedAt,
        latitude: metadata.latitude,
        longitude: metadata.longitude
      }
    });

    await revalidateTrip(slug);
    redirect(
      buildTripRedirect(slug, {
        added: file.name,
        day: String(matchedDay.dayNumber),
        mode: "photo"
      })
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirect(buildTripRedirect(slug, { error: error instanceof Error ? error.message : "Could not upload that photo." }));
  }
}

export async function updateTripInlineAction(formData: FormData) {
  await requireAdmin();

  const tripId = toRequiredString(formData.get("tripId"), "Trip ID");
  const slug = toRequiredString(formData.get("slug"), "Trip slug");
  const field = toRequiredString(formData.get("field"), "Field");
  const value = String(formData.get("value") ?? "").trim();

  if (!["title", "summary", "routeOverview", "notes"].includes(field)) {
    throw new Error("Unsupported trip field.");
  }

  await prisma.trip.update({
    where: { id: tripId },
    data: { [field]: value }
  });

  await revalidateTrip(slug);
  redirect(buildTripRedirect(slug, { day: String(formData.get("selectedDayNumber") ?? "") }));
}

export async function updateDayInlineAction(formData: FormData) {
  await requireAdmin();

  const slug = toRequiredString(formData.get("slug"), "Trip slug");
  const dayId = toRequiredString(formData.get("dayId"), "Day ID");
  const selectedDayNumber = toRequiredString(formData.get("selectedDayNumber"), "Selected day");
  const field = toRequiredString(formData.get("field"), "Field");
  const value = toOptionalString(formData.get("value"));

  if (!["title", "summary", "callout", "accommodationName", "accommodationDescription"].includes(field)) {
    throw new Error("Unsupported day field.");
  }

  await prisma.tripDay.update({
    where: { id: dayId },
    data: { [field]: value }
  });

  await revalidateTrip(slug);
  redirect(buildTripRedirect(slug, { day: selectedDayNumber }));
}

export async function updateLocationInlineAction(formData: FormData) {
  await requireAdmin();

  const slug = toRequiredString(formData.get("slug"), "Trip slug");
  const locationId = toRequiredString(formData.get("locationId"), "Location ID");
  const placeId = toRequiredString(formData.get("placeId"), "Place ID");
  const selectedDayNumber = toRequiredString(formData.get("selectedDayNumber"), "Selected day");
  const field = toRequiredString(formData.get("field"), "Field");
  const value = String(formData.get("value") ?? "").trim();

  const location = await prisma.dayLocation.findUnique({
    where: { id: locationId },
    include: {
      tripDay: {
        include: {
          locations: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              placeId: true
            }
          },
          trip: {
            select: {
              days: {
                orderBy: { dayNumber: "asc" },
                select: {
                  id: true,
                  dayNumber: true,
                  startPlaceId: true,
                  endPlaceId: true
                }
              }
            }
          }
        }
      },
      place: {
        select: {
          id: true,
          name: true,
          latitude: true,
          longitude: true
        }
      }
    }
  });

  if (!location) {
    throw new Error("That location could not be found.");
  }

  await prisma.$transaction(async (tx) => {
    if (field === "name") {
      let resolvedPlace:
        | {
            placeId: string;
            name: string;
            address: string | null;
            latitude: number;
            longitude: number;
          }
        | undefined;

      try {
        const matches = await searchTextPlaces({
          query: value,
          latitude: location.place.latitude,
          longitude: location.place.longitude,
          radiusMeters: 50000,
          maxResultCount: 1
        });
        resolvedPlace = matches[0];
      } catch {
        resolvedPlace = undefined;
      }

      await tx.place.update({
        where: { id: placeId },
        data: {
          name: value,
          slug: slugify(value),
          googlePlaceId: resolvedPlace?.placeId,
          regionLabel: resolvedPlace?.address ?? undefined,
          latitude: resolvedPlace?.latitude,
          longitude: resolvedPlace?.longitude
        }
      });

      const orderedLocations = location.tripDay.locations;
      const lastLocation = orderedLocations.at(-1);
      const firstLocation = orderedLocations[0];
      const tripDays = location.tripDay.trip.days;
      const currentDay = tripDays.find((day) => day.id === location.tripDayId);
      const nextDay = currentDay ? tripDays.find((day) => day.dayNumber === currentDay.dayNumber + 1) : null;
      const previousDay = currentDay ? tripDays.find((day) => day.dayNumber === currentDay.dayNumber - 1) : null;

      if (currentDay && lastLocation?.id === locationId && currentDay.endPlaceId !== placeId) {
        const oldEndPlaceId = currentDay.endPlaceId;

        await tx.tripDay.update({
          where: { id: currentDay.id },
          data: {
            endPlaceId: placeId
          }
        });

        if (nextDay?.startPlaceId === oldEndPlaceId) {
          await tx.tripDay.update({
            where: { id: nextDay.id },
            data: {
              startPlaceId: placeId
            }
          });
        }
      }

      if (currentDay && firstLocation?.id === locationId && currentDay.startPlaceId === location.place.id) {
        await tx.tripDay.update({
          where: { id: currentDay.id },
          data: {
            startPlaceId: placeId
          }
        });

        if (previousDay?.endPlaceId === location.place.id) {
          await tx.tripDay.update({
            where: { id: previousDay.id },
            data: {
              endPlaceId: placeId
            }
          });
        }
      }

      return;
    }

    if (field === "note") {
      await tx.dayLocation.update({
        where: { id: locationId },
        data: {
          note: value || null
        }
      });
      return;
    }

    throw new Error("Unsupported location field.");
  });

  if (field === "name") {
    await recomputeTripRoutes(location.tripDay.tripId);
  }

  await revalidateTrip(slug);
  redirect(buildTripRedirect(slug, { day: selectedDayNumber }));
}

export async function deleteLocationInlineAction(formData: FormData) {
  await requireAdmin();

  const slug = toRequiredString(formData.get("slug"), "Trip slug");
  const locationId = toRequiredString(formData.get("locationId"), "Location ID");
  const selectedDayNumber = toRequiredString(formData.get("selectedDayNumber"), "Selected day");

  await prisma.dayLocation.delete({
    where: { id: locationId }
  });

  await recomputeTripRoutes(
    toRequiredString(
      formData.get("tripId"),
      "Trip ID"
    )
  );
  await revalidateTrip(slug);
  redirect(buildTripRedirect(slug, { day: selectedDayNumber }));
}

export async function updateStopInlineAction(formData: FormData) {
  await requireAdmin();

  const slug = toRequiredString(formData.get("slug"), "Trip slug");
  const stopId = toRequiredString(formData.get("stopId"), "Stop ID");
  const selectedDayNumber = toRequiredString(formData.get("selectedDayNumber"), "Selected day");
  const field = toRequiredString(formData.get("field"), "Field");
  const value = String(formData.get("value") ?? "").trim();

  if (!["name", "note"].includes(field)) {
    throw new Error("Unsupported stop field.");
  }

  const stop = await prisma.dayStop.findUnique({
    where: { id: stopId },
    include: {
      tripDay: {
        include: {
          startPlace: true,
          endPlace: true
        }
      }
    }
  });

  if (!stop) {
    throw new Error("That stop could not be found.");
  }

  let updateData: {
    name?: string;
    note?: string;
    latitude?: number;
    longitude?: number;
    placeId?: string;
  } = { [field]: value };

  if (field === "name" && stop.kind === DayStopKind.activity) {
    try {
      const anchors = [
        stop.latitude != null && stop.longitude != null ? { latitude: stop.latitude, longitude: stop.longitude } : null,
        { latitude: stop.tripDay.startPlace.latitude, longitude: stop.tripDay.startPlace.longitude },
        { latitude: stop.tripDay.endPlace.latitude, longitude: stop.tripDay.endPlace.longitude }
      ].filter(Boolean) as Array<{ latitude: number; longitude: number }>;

      for (const anchor of anchors) {
        const matches = await searchTextPlaces({
          query: value,
          latitude: anchor.latitude,
          longitude: anchor.longitude,
          radiusMeters: 50000,
          maxResultCount: 1
        });

        if (matches[0]) {
          const resolved = matches[0];
          const place = await resolveOrCreatePlace(resolved.name, resolved.latitude, resolved.longitude, resolved.placeId);
          updateData = {
            name: resolved.name,
            latitude: place.latitude,
            longitude: place.longitude,
            placeId: place.id
          };
          break;
        }
      }
    } catch {
      // Preserve the existing text-only edit behavior if Google lookup fails.
    }
  }

  await prisma.dayStop.update({
    where: { id: stopId },
    data: updateData
  });

  if (stop.kind === DayStopKind.activity) {
    await recomputeTripActivityDistances(stop.tripDay.tripId);
  }
  await revalidateTrip(slug);
  redirect(buildTripRedirect(slug, { day: selectedDayNumber }));
}

export async function deleteStopInlineAction(formData: FormData) {
  await requireAdmin();

  const slug = toRequiredString(formData.get("slug"), "Trip slug");
  const stopId = toRequiredString(formData.get("stopId"), "Stop ID");
  const selectedDayNumber = toRequiredString(formData.get("selectedDayNumber"), "Selected day");

  const stop = await prisma.dayStop.findUnique({
    where: { id: stopId },
    include: {
      tripDay: {
        select: {
          tripId: true
        }
      }
    }
  });

  if (!stop) {
    throw new Error("That stop could not be found.");
  }

  await prisma.dayStop.delete({
    where: { id: stopId }
  });

  if (stop.kind === DayStopKind.activity) {
    await recomputeTripActivityDistances(stop.tripDay.tripId);
  }
  await revalidateTrip(slug);
  redirect(buildTripRedirect(slug, { day: selectedDayNumber }));
}

export async function deleteTripPhotoAction(formData: FormData) {
  await requireAdmin();

  const slug = toRequiredString(formData.get("slug"), "Trip slug");
  const photoId = toRequiredString(formData.get("photoId"), "Photo ID");
  const selectedDayNumber = String(formData.get("selectedDayNumber") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "").trim();

  const photo = await prisma.tripPhoto.findUnique({
    where: { id: photoId },
    select: {
      filePath: true
    }
  });

  if (!photo) {
    redirect(buildTripRedirect(slug, { error: "That photo could not be found." }));
  }

  await prisma.tripPhoto.delete({
    where: { id: photoId }
  });

  await deleteUploadedPhoto(photo.filePath);
  await revalidateTrip(slug);
  if (returnTo === "overview") {
    redirect(buildTrackerRedirect(slug));
  }
  redirect(buildTripRedirect(slug, selectedDayNumber ? { day: selectedDayNumber } : {}));
}

export async function updateTripPhotoAction(formData: FormData) {
  await requireAdmin();

  const slug = toRequiredString(formData.get("slug"), "Trip slug");
  const photoId = toRequiredString(formData.get("photoId"), "Photo ID");
  const field = toRequiredString(formData.get("field"), "Field");
  const value = toOptionalString(formData.get("value"));
  const returnTo = String(formData.get("returnTo") ?? "").trim();
  const selectedDayNumber = String(formData.get("selectedDayNumber") ?? "").trim();

  if (!["title", "caption"].includes(field)) {
    throw new Error("Unsupported photo field.");
  }

  await prisma.tripPhoto.update({
    where: { id: photoId },
    data: {
      [field]: value
    }
  });

  await revalidateTrip(slug);
  if (returnTo === "overview") {
    redirect(buildTrackerRedirect(slug));
  }
  redirect(buildTripRedirect(slug, selectedDayNumber ? { day: selectedDayNumber } : {}));
}

export async function updateTrackerPointAction(formData: FormData) {
  await requireAdmin();

  const slug = toRequiredString(formData.get("slug"), "Trip slug");
  const pointId = toRequiredString(formData.get("pointId"), "Tracker point ID");
  const field = toRequiredString(formData.get("field"), "Field");
  const value = toOptionalString(formData.get("value"));

  if (field !== "note") {
    throw new Error("Unsupported tracker point field.");
  }

  await prisma.tripTrackPoint.update({
    where: { id: pointId },
    data: {
      note: value
    }
  });

  await revalidateTrip(slug);
  redirect(buildTrackerRedirect(slug));
}

export async function deleteTrackerPointAction(formData: FormData) {
  await requireAdmin();

  const slug = toRequiredString(formData.get("slug"), "Trip slug");
  const pointId = toRequiredString(formData.get("pointId"), "Tracker point ID");

  await prisma.tripTrackPoint.delete({
    where: { id: pointId }
  });

  await revalidateTrip(slug);
  redirect(buildTrackerRedirect(slug));
}

export async function createTripPostAction(formData: FormData) {
  await requireAdmin();

  const slug = toRequiredString(formData.get("slug"), "Trip slug");
  const dayId = toRequiredString(formData.get("dayId"), "Day ID");
  const selectedDayNumber = String(formData.get("selectedDayNumber") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "").trim();

  if (!title || !body) {
    redirect(buildTripRedirect(slug, { error: "Posts need a title and body.", day: selectedDayNumber }));
  }

  await prisma.tripPost.create({
    data: {
      tripDayId: dayId,
      title,
      body
    }
  });

  await revalidateTrip(slug);
  if (returnTo === "overview") {
    redirect(buildTrackerRedirect(slug));
  }
  redirect(buildTripRedirect(slug, { day: selectedDayNumber, added: title, mode: "post" }));
}

export async function updateTripPostAction(formData: FormData) {
  await requireAdmin();

  const slug = toRequiredString(formData.get("slug"), "Trip slug");
  const postId = toRequiredString(formData.get("postId"), "Post ID");
  const field = toRequiredString(formData.get("field"), "Field");
  const value = String(formData.get("value") ?? "").trim();
  const selectedDayNumber = String(formData.get("selectedDayNumber") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "").trim();

  if (!["title", "body"].includes(field)) {
    throw new Error("Unsupported post field.");
  }

  await prisma.tripPost.update({
    where: { id: postId },
    data: {
      [field]: value
    }
  });

  await revalidateTrip(slug);
  if (returnTo === "overview") {
    redirect(buildTrackerRedirect(slug));
  }
  redirect(buildTripRedirect(slug, selectedDayNumber ? { day: selectedDayNumber } : {}));
}

export async function deleteTripPostAction(formData: FormData) {
  await requireAdmin();

  const slug = toRequiredString(formData.get("slug"), "Trip slug");
  const postId = toRequiredString(formData.get("postId"), "Post ID");
  const selectedDayNumber = String(formData.get("selectedDayNumber") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "").trim();

  const post = await prisma.tripPost.findUnique({
    where: { id: postId },
    include: {
      media: {
        select: {
          filePath: true
        }
      }
    }
  });

  if (!post) {
    redirect(buildTripRedirect(slug, { error: "That post could not be found.", day: selectedDayNumber }));
  }

  await prisma.tripPost.delete({
    where: { id: postId }
  });

  await Promise.all(post.media.map((media) => deleteUploadedPhoto(media.filePath)));
  await revalidateTrip(slug);
  if (returnTo === "overview") {
    redirect(buildTrackerRedirect(slug));
  }
  redirect(buildTripRedirect(slug, selectedDayNumber ? { day: selectedDayNumber } : {}));
}

export async function uploadTripPostMediaAction(formData: FormData) {
  await requireAdmin();

  const slug = toRequiredString(formData.get("slug"), "Trip slug");
  const postId = toRequiredString(formData.get("postId"), "Post ID");
  const selectedDayNumber = String(formData.get("selectedDayNumber") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "").trim();
  const files = formData.getAll("media").filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (!files.length) {
    redirect(buildTripRedirect(slug, { error: "Select media to upload.", day: selectedDayNumber }));
  }

  const post = await prisma.tripPost.findUnique({
    where: { id: postId },
    include: {
      tripDay: {
        include: {
          endPlace: true
        }
      }
    }
  });

  if (!post) {
    redirect(buildTripRedirect(slug, { error: "That post could not be found.", day: selectedDayNumber }));
  }

  for (const file of files) {
    const { buffer, relativePath } = await saveUploadedMedia(file, "trip-post-media");
    const metadata = await extractPhotoMetadata(buffer);

    await prisma.tripPostMedia.create({
      data: {
        tripPostId: post.id,
        filePath: relativePath,
        originalFilename: file.name,
        title: buildDayMediaTitle(post.tripDay.dayNumber, post.tripDay.endPlace.name),
        caption: null,
        mimeType: file.type || null,
        capturedAt: metadata.capturedAt,
        latitude: metadata.latitude,
        longitude: metadata.longitude
      }
    });
  }

  await revalidateTrip(slug);
  if (returnTo === "overview") {
    redirect(buildTrackerRedirect(slug));
  }
  redirect(buildTripRedirect(slug, selectedDayNumber ? { day: selectedDayNumber } : {}));
}

export async function updateTripPostMediaAction(formData: FormData) {
  await requireAdmin();

  const slug = toRequiredString(formData.get("slug"), "Trip slug");
  const mediaId = toRequiredString(formData.get("mediaId"), "Post media ID");
  const field = toRequiredString(formData.get("field"), "Field");
  const value = toOptionalString(formData.get("value"));
  const selectedDayNumber = String(formData.get("selectedDayNumber") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "").trim();

  if (!["title", "caption"].includes(field)) {
    throw new Error("Unsupported post media field.");
  }

  await prisma.tripPostMedia.update({
    where: { id: mediaId },
    data: {
      [field]: value
    }
  });

  await revalidateTrip(slug);
  if (returnTo === "overview") {
    redirect(buildTrackerRedirect(slug));
  }
  redirect(buildTripRedirect(slug, selectedDayNumber ? { day: selectedDayNumber } : {}));
}

export async function deleteTripPostMediaAction(formData: FormData) {
  await requireAdmin();

  const slug = toRequiredString(formData.get("slug"), "Trip slug");
  const mediaId = toRequiredString(formData.get("mediaId"), "Post media ID");
  const selectedDayNumber = String(formData.get("selectedDayNumber") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "").trim();

  const media = await prisma.tripPostMedia.findUnique({
    where: { id: mediaId },
    select: {
      filePath: true
    }
  });

  if (!media) {
    redirect(buildTripRedirect(slug, { error: "That media item could not be found.", day: selectedDayNumber }));
  }

  await prisma.tripPostMedia.delete({
    where: { id: mediaId }
  });

  await deleteUploadedPhoto(media.filePath);
  await revalidateTrip(slug);
  if (returnTo === "overview") {
    redirect(buildTrackerRedirect(slug));
  }
  redirect(buildTripRedirect(slug, selectedDayNumber ? { day: selectedDayNumber } : {}));
}

export async function batchAddActivitiesAction(_: BatchActivitiesState, formData: FormData): Promise<BatchActivitiesState> {
  await requireAdmin();

  const tripId = toRequiredString(formData.get("tripId"), "Trip ID");
  const slug = toRequiredString(formData.get("slug"), "Trip slug");
  const rawInput = String(formData.get("activities") ?? "");
  const lines = [...new Set(rawInput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];

  if (!lines.length) {
    return {
      ...initialBatchActivitiesState,
      submitted: true,
      error: "Enter at least one activity, one per line."
    };
  }

  const trip = await loadTripForAssignment(tripId);
  const results: BatchActivitiesState["results"] = [];
  let addedActivity = false;

  for (const line of lines) {
    try {
      const resolved = await resolveBatchActivityCandidate(trip, line);

      if (!resolved) {
        results.push({
          line,
          status: "failed",
          message: "Could not resolve this activity near the route."
        });
        continue;
      }

      const matchedPlace = await resolveOrCreatePlace(
        resolved.candidate.name,
        resolved.candidate.latitude,
        resolved.candidate.longitude,
        resolved.candidate.placeId
      );

      const duplicateStop = await prisma.dayStop.findFirst({
        where: {
          tripDayId: resolved.targetDay.id,
          kind: DayStopKind.activity,
          name: resolved.candidate.name
        }
      });

      if (duplicateStop) {
        results.push({
          line,
          status: "duplicate",
          dayNumber: resolved.targetDay.dayNumber,
          placeName: matchedPlace.name,
          message: "Already listed on this day."
        });
        continue;
      }

      const lastStop = await prisma.dayStop.findFirst({
        where: {
          tripDayId: resolved.targetDay.id,
          kind: DayStopKind.activity
        },
        orderBy: { sortOrder: "desc" }
      });

      await prisma.dayStop.create({
        data: {
          tripDayId: resolved.targetDay.id,
          kind: DayStopKind.activity,
          sortOrder: (lastStop?.sortOrder ?? 0) + 1,
          name: resolved.candidate.name,
          note: `Added near ${resolved.targetDay.locations.at(-1)?.place.name ?? resolved.targetDay.endPlace.name}.`,
          latitude: matchedPlace.latitude,
          longitude: matchedPlace.longitude,
          placeId: matchedPlace.id
        }
      });
      addedActivity = true;

      results.push({
        line,
        status: "added",
        dayNumber: resolved.targetDay.dayNumber,
        placeName: matchedPlace.name,
        message: "Added successfully."
      });
    } catch (error) {
      results.push({
        line,
        status: "failed",
        message: error instanceof Error ? error.message : "Could not add this activity."
      });
    }
  }

  if (addedActivity) {
    await recomputeTripActivityDistances(tripId);
  }
  await revalidateTrip(slug);

  return {
    submitted: true,
    summary: {
      added: results.filter((result) => result.status === "added").length,
      duplicate: results.filter((result) => result.status === "duplicate").length,
      failed: results.filter((result) => result.status === "failed").length
    },
    results
  };
}
