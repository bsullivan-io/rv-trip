import { notFound } from "next/navigation";
import {
  addPlaceSearchAction,
  addStopFromGoogleMapsAction,
  deleteTripPhotoAction,
  deleteLocationInlineAction,
  deleteStopInlineAction,
  uploadTripPhotoAction,
  updateDayInlineAction,
  updateLocationInlineAction,
  updateStopInlineAction,
  updateTripInlineAction
} from "@/app/trips/[slug]/actions";
import { getAdminSession } from "@/lib/auth";
import { getTripBySlug } from "@/lib/data";
import { TripViewer } from "@/components/public/trip-viewer";

export const dynamic = "force-dynamic";

type TripPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    added?: string;
    day?: string;
    place?: string;
    error?: string;
    mode?: string;
  }>;
};

export default async function TripPage({ params, searchParams }: TripPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const [trip, adminSession] = await Promise.all([getTripBySlug(slug), getAdminSession()]);

  if (!trip) {
    notFound();
  }

  return (
    <TripViewer
      trip={{
        id: trip.id,
        slug: trip.slug,
        title: trip.title,
        summary: trip.summary,
        totalMiles: trip.totalMiles,
        routeOverview: trip.routeOverview,
        notes: trip.notes,
        startDate: trip.startDate?.toISOString() ?? null,
        endDate: trip.endDate?.toISOString() ?? null,
        hotDogPlaces: trip.hotDogPlaces.map((place) => ({
          id: place.id,
          name: place.name,
          address: place.address,
          latitude: place.latitude,
          longitude: place.longitude,
          dayNumber: place.tripDay.dayNumber
        })),
        days: trip.days.map((day) => ({
          id: day.id,
          dayNumber: day.dayNumber,
          date: day.date?.toISOString() ?? null,
          title: day.title,
          type: day.type,
          miles: day.miles,
          distanceMeters: day.distanceMeters,
          durationSeconds: day.durationSeconds,
          routePolyline: day.routePolyline,
          summary: day.summary,
          callout: day.callout,
          accommodationName: day.accommodationName,
          accommodationDescription: day.accommodationDescription,
          startPlace: day.startPlace,
          endPlace: day.endPlace,
          locations: day.locations.map((location) => ({
            id: location.id,
            sortOrder: location.sortOrder,
            note: location.note,
            place: location.place
          })),
          photos: day.photos.map((photo) => ({
            id: photo.id,
            filePath: photo.filePath,
            originalFilename: photo.originalFilename,
            mimeType: photo.mimeType,
            capturedAt: photo.capturedAt?.toISOString() ?? null
          })),
          stops: day.stops.map((stop) => ({
            id: stop.id,
            kind: stop.kind,
            name: stop.name,
            note: stop.note,
            sourceUrl: stop.sourceUrl,
            placeName: stop.place?.name ?? null,
            placeRegionLabel: stop.place?.regionLabel ?? null,
            latitude: stop.latitude ?? stop.place?.latitude ?? null,
            longitude: stop.longitude ?? stop.place?.longitude ?? null,
            detourMiles: stop.detourMiles
          }))
        }))
      }}
      flash={
        resolvedSearchParams.error
          ? { type: "error", message: resolvedSearchParams.error }
          : resolvedSearchParams.added && resolvedSearchParams.day
            ? {
                type: "success",
                message:
                  resolvedSearchParams.mode === "photo"
                    ? `Uploaded "${resolvedSearchParams.added}" and matched it to Day ${resolvedSearchParams.day}.`
                    :
                  resolvedSearchParams.mode === "location"
                    ? `Added location "${resolvedSearchParams.added}" to Day ${resolvedSearchParams.day}.`
                    : `Added "${resolvedSearchParams.added}" to Day ${resolvedSearchParams.day}${resolvedSearchParams.place ? ` near ${resolvedSearchParams.place}` : ""}.`
              }
            : null
      }
      initialSelectedDayNumber={resolvedSearchParams.day ? Number(resolvedSearchParams.day) : 0}
      loginUrl={`/admin/login?next=${encodeURIComponent(`/trips/${trip.slug}`)}`}
      addStopAction={addStopFromGoogleMapsAction}
      addPlaceSearchAction={addPlaceSearchAction}
      uploadTripPhotoAction={uploadTripPhotoAction}
      updateTripAction={updateTripInlineAction}
      updateDayAction={updateDayInlineAction}
      updateLocationAction={updateLocationInlineAction}
      updateStopAction={updateStopInlineAction}
      deleteLocationAction={deleteLocationInlineAction}
      deleteStopAction={deleteStopInlineAction}
      deletePhotoAction={deleteTripPhotoAction}
      canEdit={Boolean(adminSession)}
    />
  );
}
