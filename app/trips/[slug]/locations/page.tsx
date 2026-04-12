import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { getTripBySlug } from "@/lib/data";
import { LocationsEditor } from "@/components/public/locations-editor";

export const dynamic = "force-dynamic";

type TripLocationsPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function TripLocationsPage({ params }: TripLocationsPageProps) {
  const { slug } = await params;
  const [trip, adminSession] = await Promise.all([getTripBySlug(slug), getAdminSession()]);

  if (!trip) {
    notFound();
  }

  const days = trip.days.map((day) => ({
    dayId: day.id,
    dayNumber: day.dayNumber,
    date: day.date?.toISOString() ?? null,
    title: day.title,
    locations: (day.locations.length
      ? day.locations
      : [{ id: `${day.id}-fallback`, note: null, place: day.endPlace }]
    ).map((location) => ({
      id: location.id,
      note: location.note,
      placeName: location.place.name
    }))
  }));

  return (
    <main className="locations-page">
      <section className="panel section-card stack">
        <div className="inline-actions">
          <Link href={`/trips/${trip.slug}`} className="button-secondary">
            Back to trip
          </Link>
        </div>
        <div>
          <p className="eyebrow">Locations</p>
          <h1>{trip.title}</h1>
          <p className="trip-summary">All itinerary locations grouped by day. {Boolean(adminSession) ? "Drag to reorder." : ""}</p>
        </div>

        <LocationsEditor slug={trip.slug} days={days} canEdit={Boolean(adminSession)} />
      </section>
    </main>
  );
}
