import { notFound } from "next/navigation";
import {
  addPlaceSearchAction,
  addStopFromGoogleMapsAction,
  createTripPostAction,
  deleteTripPostAction,
  deleteTripPostMediaAction,
  deleteTripPhotoAction,
  deleteLocationInlineAction,
  deleteStopInlineAction,
  updateTripPostAction,
  updateTripPostMediaAction,
  uploadTripPhotoAction,
  uploadTripPostMediaAction,
  updateDayInlineAction,
  updateLocationInlineAction,
  updateTripPhotoAction,
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
    view?: string;
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
        trackPoints: trip.trackPoints.map((point) => ({
          id: point.id,
          tripDayId: point.tripDayId,
          latitude: point.latitude,
          longitude: point.longitude,
          recordedAt: point.recordedAt.toISOString(),
          source: point.source,
          note: point.note,
          author: point.author ?? null,
          cityName: point.cityName,
          stateCode: point.stateCode,
          stateName: point.stateName
        })),
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
            title: photo.title,
            caption: photo.caption,
            mimeType: photo.mimeType,
            capturedAt: photo.capturedAt?.toISOString() ?? null
          })),
          posts: day.posts.map((post) => ({
            id: post.id,
            title: post.title,
            body: post.body,
            author: post.author ?? null,
            createdAt: post.createdAt.toISOString(),
            media: post.media.map((media) => ({
              id: media.id,
              filePath: media.filePath,
              originalFilename: media.originalFilename,
              title: media.title,
              caption: media.caption,
              mimeType: media.mimeType,
              capturedAt: media.capturedAt?.toISOString() ?? null
            }))
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
                    : resolvedSearchParams.mode === "post"
                      ? `Posted "${resolvedSearchParams.added}" on Day ${resolvedSearchParams.day}.`
                    :
                  resolvedSearchParams.mode === "location"
                    ? `Added location "${resolvedSearchParams.added}" to Day ${resolvedSearchParams.day}.`
                    : `Added "${resolvedSearchParams.added}" to Day ${resolvedSearchParams.day}${resolvedSearchParams.place ? ` near ${resolvedSearchParams.place}` : ""}.`
              }
            : null
      }
      initialSelectedDayNumber={resolvedSearchParams.day ? Number(resolvedSearchParams.day) : 0}
      initialViewMode={
        resolvedSearchParams.view === "calendar" ||
        resolvedSearchParams.view === "locations" ||
        resolvedSearchParams.view === "hotdogs"
          ? resolvedSearchParams.view
          : "map"
      }
      loginUrl={`/admin/login?next=${encodeURIComponent(`/trips/${trip.slug}`)}`}
      addStopAction={addStopFromGoogleMapsAction}
      addPlaceSearchAction={addPlaceSearchAction}
      uploadTripPhotoAction={uploadTripPhotoAction}
      createPostAction={createTripPostAction}
      updatePostAction={updateTripPostAction}
      deletePostAction={deleteTripPostAction}
      uploadPostMediaAction={uploadTripPostMediaAction}
      updatePostMediaAction={updateTripPostMediaAction}
      deletePostMediaAction={deleteTripPostMediaAction}
      updateTripAction={updateTripInlineAction}
      updateDayAction={updateDayInlineAction}
      updateLocationAction={updateLocationInlineAction}
      updateStopAction={updateStopInlineAction}
      updatePhotoAction={updateTripPhotoAction}
      deleteLocationAction={deleteLocationInlineAction}
      deleteStopAction={deleteStopInlineAction}
      deletePhotoAction={deleteTripPhotoAction}
      canEdit={Boolean(adminSession)}
    />
  );
}
