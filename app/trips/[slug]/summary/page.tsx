import Link from "next/link";
import { notFound } from "next/navigation";
import { getTripBySlug } from "@/lib/data";
import { formatFullDateLabel } from "@/lib/dates";

export const dynamic = "force-dynamic";

type TripSummaryPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function formatDriveTime(durationSeconds: number | null) {
  if (!durationSeconds) {
    return null;
  }

  const totalMinutes = Math.round(durationSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours && minutes) {
    return `${hours}h ${minutes}m`;
  }
  if (hours) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

function formatDetourMiles(miles: number | null | undefined) {
  if (miles == null) {
    return "Detour unavailable";
  }

  return miles === 0 ? "On route" : `${miles} mi detour`;
}

export default async function TripSummaryPage({ params }: TripSummaryPageProps) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);

  if (!trip) {
    notFound();
  }

  const days = trip.days.map((day) => ({
    id: day.id,
    dayNumber: day.dayNumber,
    date: day.date?.toISOString() ?? null,
    startPlaceName: day.startPlace.name,
    endPlaceName: day.endPlace.name,
    accommodationName: day.accommodationName,
    miles: day.miles,
    durationSeconds: day.durationSeconds,
    locations: (day.locations.length ? day.locations : [{ id: `${day.id}-fallback`, place: day.endPlace }]).map((location) => location.place.name),
    activities: day.stops
      .filter((stop) => stop.kind === "activity")
      .map((stop) => ({
        name: stop.name,
        detourMiles: stop.detourMiles
      }))
  }));

  return (
    <main className="trip-summary-page">
      <section className="panel section-card stack">
        <div className="inline-actions">
          <Link href={`/trips/${trip.slug}/details`} className="button-secondary">
            Back to trip
          </Link>
        </div>

        <div>
          <p className="eyebrow">Trip Summary</p>
          <h1>{trip.title}</h1>
        </div>

        <div className="trip-summary-list">
          {days.map((day) => (
            <article key={day.id} className="trip-summary-card">
              <h2>
                Day {day.dayNumber} - {formatFullDateLabel(day.date)} - {day.startPlaceName} -&gt; {day.endPlaceName}
              </h2>

              <p className="trip-summary-stay">
                <strong>Staying at:</strong> {day.accommodationName ?? day.endPlaceName}
              </p>

              <div className="trip-summary-meta">
                {day.miles || day.durationSeconds ? (
                  <>
                    {day.miles ? <span>{day.miles} miles</span> : null}
                    {formatDriveTime(day.durationSeconds) ? <span>{formatDriveTime(day.durationSeconds)}</span> : null}
                  </>
                ) : (
                  <span>Staying put</span>
                )}
              </div>

              <div className="trip-summary-sections">
                <section>
                  <h3>Locations</h3>
                  {day.locations.length ? (
                    <ul>
                      {day.locations.map((location) => (
                        <li key={`${day.id}-${location}`}>{location}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No locations listed.</p>
                  )}
                </section>

                <section>
                  <h3>Activities</h3>
                  {day.activities.length ? (
                    <ul>
                      {day.activities.map((activity) => (
                        <li key={`${day.id}-${activity.name}`}>
                          <span>{activity.name}</span>
                          <span className="trip-summary-activity-distance">{formatDetourMiles(activity.detourMiles)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No activities listed.</p>
                  )}
                </section>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
