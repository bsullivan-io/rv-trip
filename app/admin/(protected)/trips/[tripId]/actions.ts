"use server";

import { DayStopKind, TripDayType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { addUtcDays, parseDateInput } from "@/lib/dates";
import { recomputeTripRoutes } from "@/lib/google-routes";
import { importSeedTrip } from "@/lib/markdown-import";
import { prisma } from "@/lib/prisma";
import { slugify, toInt, toOptionalString, toRequiredString } from "@/lib/utils";
import { requireAdmin } from "@/lib/auth";

async function revalidateTrip(tripId: string) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { slug: true }
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/trips/${tripId}`);

  if (trip) {
    revalidatePath(`/trips/${trip.slug}`);
    revalidatePath("/");
  }
}

async function normalizeDayNumbers(tripId: string) {
  const days = await prisma.tripDay.findMany({
    where: { tripId },
    orderBy: [{ dayNumber: "asc" }, { createdAt: "asc" }]
  });

  await prisma.$transaction(
    days.map((day, index) =>
      prisma.tripDay.update({
        where: { id: day.id },
        data: { dayNumber: index + 1 }
      })
    )
  );
}

async function normalizeStopOrder(tripDayId: string, kind: DayStopKind) {
  const stops = await prisma.dayStop.findMany({
    where: { tripDayId, kind },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });

  await prisma.$transaction(
    stops.map((stop, index) =>
      prisma.dayStop.update({
        where: { id: stop.id },
        data: { sortOrder: index + 1 }
      })
    )
  );
}

export async function updateTripAction(formData: FormData) {
  await requireAdmin();

  const tripId = toRequiredString(formData.get("tripId"), "Trip ID");

  await prisma.trip.update({
    where: { id: tripId },
    data: {
      title: toRequiredString(formData.get("title"), "Title"),
      slug: slugify(toRequiredString(formData.get("slug"), "Slug")),
      summary: toRequiredString(formData.get("summary"), "Summary"),
      startingLocation: toRequiredString(formData.get("startingLocation"), "Starting location"),
      endingLocation: toRequiredString(formData.get("endingLocation"), "Ending location"),
      startDate: parseDateInput(formData.get("startDate"), "Start date"),
      endDate: parseDateInput(formData.get("endDate"), "End date"),
      routeOverview: toRequiredString(formData.get("routeOverview"), "Route overview"),
      notes: String(formData.get("notes") ?? "").trim(),
      bookingPhone: toOptionalString(formData.get("bookingPhone")),
      totalMiles: toInt(formData.get("totalMiles")) || null
    }
  });

  await revalidateTrip(tripId);
}

export async function createPlaceAction(formData: FormData) {
  await requireAdmin();

  const tripId = toRequiredString(formData.get("tripId"), "Trip ID");
  const name = toRequiredString(formData.get("name"), "Place name");

  await prisma.place.create({
    data: {
      name,
      slug: slugify(name),
      regionLabel: toOptionalString(formData.get("regionLabel")),
      latitude: Number(formData.get("latitude") ?? 0),
      longitude: Number(formData.get("longitude") ?? 0)
    }
  });

  await revalidateTrip(tripId);
}

export async function updatePlaceAction(formData: FormData) {
  await requireAdmin();

  const tripId = toRequiredString(formData.get("tripId"), "Trip ID");
  const placeId = toRequiredString(formData.get("placeId"), "Place ID");
  const name = toRequiredString(formData.get("name"), "Place name");

  await prisma.place.update({
    where: { id: placeId },
    data: {
      name,
      slug: slugify(name),
      regionLabel: toOptionalString(formData.get("regionLabel")),
      latitude: Number(formData.get("latitude") ?? 0),
      longitude: Number(formData.get("longitude") ?? 0)
    }
  });

  await recomputeTripRoutes(tripId);
  await revalidateTrip(tripId);
}

export async function deletePlaceAction(formData: FormData) {
  await requireAdmin();

  const tripId = toRequiredString(formData.get("tripId"), "Trip ID");
  const placeId = toRequiredString(formData.get("placeId"), "Place ID");

  const [startCount, endCount, locationCount, stopCount] = await Promise.all([
    prisma.tripDay.count({ where: { startPlaceId: placeId } }),
    prisma.tripDay.count({ where: { endPlaceId: placeId } }),
    prisma.dayLocation.count({ where: { placeId } }),
    prisma.dayStop.count({ where: { placeId } })
  ]);

  if (startCount || endCount || locationCount || stopCount) {
    throw new Error("Cannot delete a place that is still referenced by a day, location, or stop.");
  }

  await prisma.place.delete({
    where: { id: placeId }
  });

  await revalidateTrip(tripId);
}

export async function createDayAction(formData: FormData) {
  await requireAdmin();

  const tripId = toRequiredString(formData.get("tripId"), "Trip ID");
  const startPlaceId = toRequiredString(formData.get("startPlaceId"), "Start place");
  const endPlaceId = toRequiredString(formData.get("endPlaceId"), "End place");
  const lastDay = await prisma.tripDay.findFirst({
    where: { tripId },
    orderBy: { dayNumber: "desc" }
  });
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { startDate: true }
  });
  const nextDayNumber = (lastDay?.dayNumber ?? 0) + 1;
  const fallbackDate = trip?.startDate ? addUtcDays(trip.startDate, nextDayNumber - 1) : new Date();

  const createdDay = await prisma.tripDay.create({
    data: {
      tripId,
      dayNumber: nextDayNumber,
      date: String(formData.get("date") ?? "").trim() ? parseDateInput(formData.get("date"), "Date") : fallbackDate,
      title: toRequiredString(formData.get("title"), "Title"),
      type: String(formData.get("type") ?? "travel") === "basecamp" ? TripDayType.basecamp : TripDayType.travel,
      miles: toInt(formData.get("miles")),
      summary: toRequiredString(formData.get("summary"), "Summary"),
      callout: toRequiredString(formData.get("callout"), "Callout"),
      accommodationName: toOptionalString(formData.get("accommodationName")),
      accommodationDescription: toOptionalString(formData.get("accommodationDescription")),
      startPlaceId,
      endPlaceId
    }
  });

  await prisma.dayLocation.create({
    data: {
      tripDayId: createdDay.id,
      placeId: endPlaceId,
      sortOrder: 1
    }
  });

  await normalizeDayNumbers(tripId);
  await recomputeTripRoutes(tripId);
  await revalidateTrip(tripId);
}

export async function updateDayAction(formData: FormData) {
  await requireAdmin();

  const tripId = toRequiredString(formData.get("tripId"), "Trip ID");
  const dayId = toRequiredString(formData.get("dayId"), "Day ID");

  const endPlaceId = toRequiredString(formData.get("endPlaceId"), "End place");

  await prisma.tripDay.update({
    where: { id: dayId },
    data: {
      dayNumber: Math.max(1, toInt(formData.get("dayNumber"), 1)),
      date: parseDateInput(formData.get("date"), "Date"),
      title: toRequiredString(formData.get("title"), "Title"),
      type: String(formData.get("type") ?? "travel") === "basecamp" ? TripDayType.basecamp : TripDayType.travel,
      miles: toInt(formData.get("miles")),
      summary: toRequiredString(formData.get("summary"), "Summary"),
      callout: toRequiredString(formData.get("callout"), "Callout"),
      accommodationName: toOptionalString(formData.get("accommodationName")),
      accommodationDescription: toOptionalString(formData.get("accommodationDescription")),
      startPlaceId: toRequiredString(formData.get("startPlaceId"), "Start place"),
      endPlaceId
    }
  });

  const dayLocationCount = await prisma.dayLocation.count({
    where: { tripDayId: dayId }
  });

  if (!dayLocationCount) {
    await prisma.dayLocation.create({
      data: {
        tripDayId: dayId,
        placeId: endPlaceId,
        sortOrder: 1
      }
    });
  }

  await normalizeDayNumbers(tripId);
  await recomputeTripRoutes(tripId);
  await revalidateTrip(tripId);
}

export async function deleteDayAction(formData: FormData) {
  await requireAdmin();

  const tripId = toRequiredString(formData.get("tripId"), "Trip ID");
  const dayId = toRequiredString(formData.get("dayId"), "Day ID");

  await prisma.tripDay.delete({
    where: { id: dayId }
  });

  await normalizeDayNumbers(tripId);
  await recomputeTripRoutes(tripId);
  await revalidateTrip(tripId);
}

export async function createStopAction(formData: FormData) {
  await requireAdmin();

  const tripId = toRequiredString(formData.get("tripId"), "Trip ID");
  const tripDayId = toRequiredString(formData.get("tripDayId"), "Day ID");
  const kindValue = String(formData.get("kind") ?? "activity");
  const kind = kindValue === "dinner" ? DayStopKind.dinner : DayStopKind.activity;
  const lastStop = await prisma.dayStop.findFirst({
    where: { tripDayId, kind },
    orderBy: { sortOrder: "desc" }
  });

  await prisma.dayStop.create({
    data: {
      tripDayId,
      kind,
      sortOrder: (lastStop?.sortOrder ?? 0) + 1,
      name: toRequiredString(formData.get("name"), "Stop name"),
      note: toRequiredString(formData.get("note"), "Stop note"),
      sourceUrl: toOptionalString(formData.get("sourceUrl")),
      placeId: toOptionalString(formData.get("placeId"))
    }
  });

  await normalizeStopOrder(tripDayId, kind);
  await revalidateTrip(tripId);
}

export async function updateStopAction(formData: FormData) {
  await requireAdmin();

  const tripId = toRequiredString(formData.get("tripId"), "Trip ID");
  const stopId = toRequiredString(formData.get("stopId"), "Stop ID");
  const tripDayId = toRequiredString(formData.get("tripDayId"), "Day ID");
  const kindValue = String(formData.get("kind") ?? "activity");
  const kind = kindValue === "dinner" ? DayStopKind.dinner : DayStopKind.activity;
  const existing = await prisma.dayStop.findUnique({
    where: { id: stopId },
    select: { kind: true }
  });

  await prisma.dayStop.update({
    where: { id: stopId },
    data: {
      kind,
      sortOrder: Math.max(1, toInt(formData.get("sortOrder"), 1)),
      name: toRequiredString(formData.get("name"), "Stop name"),
      note: toRequiredString(formData.get("note"), "Stop note"),
      sourceUrl: toOptionalString(formData.get("sourceUrl")),
      placeId: toOptionalString(formData.get("placeId"))
    }
  });

  if (existing?.kind && existing.kind !== kind) {
    await normalizeStopOrder(tripDayId, existing.kind);
  }
  await normalizeStopOrder(tripDayId, kind);
  await revalidateTrip(tripId);
}

export async function deleteStopAction(formData: FormData) {
  await requireAdmin();

  const tripId = toRequiredString(formData.get("tripId"), "Trip ID");
  const stopId = toRequiredString(formData.get("stopId"), "Stop ID");
  const tripDayId = toRequiredString(formData.get("tripDayId"), "Day ID");
  const kindValue = String(formData.get("kind") ?? "activity");
  const kind = kindValue === "dinner" ? DayStopKind.dinner : DayStopKind.activity;

  await prisma.dayStop.delete({
    where: { id: stopId }
  });

  await normalizeStopOrder(tripDayId, kind);
  await revalidateTrip(tripId);
}

export async function reimportSeedTripAction(formData: FormData) {
  await requireAdmin();
  const tripId = toRequiredString(formData.get("tripId"), "Trip ID");
  await importSeedTrip();
  await revalidateTrip(tripId);
}
