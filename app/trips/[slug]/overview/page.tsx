import Link from "next/link";
import { notFound } from "next/navigation";
import {
  deleteTripPostAction,
  deleteTripPostMediaAction,
  deleteTrackerPointAction,
  deleteTripPhotoAction,
  updateTripPostAction,
  updateTripPostMediaAction,
  updateTrackerPointAction,
  updateTripPhotoAction,
  uploadTripPostMediaAction
} from "@/app/trips/[slug]/actions";
import { TrackerMap } from "@/components/public/tracker-map";
import { OverviewMediaLightbox } from "@/components/public/overview-media-lightbox";
import { EditModeGate } from "@/components/ui/edit-mode";
import { getAdminSession } from "@/lib/auth";
import { formatFullDateLabel, formatShortDate } from "@/lib/dates";
import { getTripTrackerBySlug } from "@/lib/data";
import { resolveTrackerPointLabel } from "@/lib/tracker-labels";
import { sumTrackedMiles } from "@/lib/tracker";

export const dynamic = "force-dynamic";

type TrackerPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function formatPointTimestamp(value: Date, timezone?: string | null) {
  const tz = timezone ?? undefined;
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz
  }).format(value);

  if (!tz) return formatted;

  const tzLabel = new Intl.DateTimeFormat("en-US", {
    timeZoneName: "short",
    timeZone: tz
  }).formatToParts(value).find((p) => p.type === "timeZoneName")?.value ?? "";

  return tzLabel ? `${formatted} ${tzLabel}` : formatted;
}

function isVideoMedia(mimeType: string | null | undefined) {
  return mimeType?.startsWith("video/") ?? false;
}

export default async function TripTrackerPage({ params }: TrackerPageProps) {
  const { slug } = await params;
  const [trip, adminSession] = await Promise.all([getTripTrackerBySlug(slug), getAdminSession()]);

  if (!trip) {
    notFound();
  }

  const dayCandidates = new Map(
    trip.days.map((day) => [
      day.id,
      [
        ...day.locations.map((location) => ({
          name: location.place.name,
          latitude: location.place.latitude,
          longitude: location.place.longitude
        })),
        ...day.stops
          .filter((stop) => stop.latitude != null || stop.place?.latitude != null)
          .map((stop) => ({
            name: stop.name,
            latitude: (stop.latitude ?? stop.place?.latitude)!,
            longitude: (stop.longitude ?? stop.place?.longitude)!
          }))
      ]
    ])
  );
  const points = trip.trackPoints.map((point) => ({
    id: point.id,
    latitude: point.latitude,
    longitude: point.longitude,
    recordedAt: point.recordedAt.toISOString(),
    source: point.source,
    label: resolveTrackerPointLabel(point, point.tripDay ? dayCandidates.get(point.tripDay.id) ?? [] : []),
    note: point.note,
    cityName: point.cityName,
    stateName: point.stateName,
    dayNumber: point.tripDay?.dayNumber ?? null
  }));
  const statesVisited = new Set(trip.trackPoints.map((point) => point.stateCode).filter(Boolean));
  const totalMiles = sumTrackedMiles(trip.trackPoints);
  const totalCheckIns = trip.trackPoints.filter((point) => point.source === "checkin").length;
  const trackedDays = new Set(
    trip.trackPoints.map((point) => point.tripDayId ?? point.recordedAt.toISOString().slice(0, 10))
  );
  const averageMilesPerDay = trackedDays.size ? Math.round(totalMiles / trackedDays.size) : 0;
  const latestCheckIn = [...trip.trackPoints]
    .filter((point) => point.source === "checkin")
    .sort((left, right) => right.recordedAt.getTime() - left.recordedAt.getTime())[0] ?? null;
  const currentLocationLabel = latestCheckIn
    ? [latestCheckIn.cityName, latestCheckIn.stateCode ?? latestCheckIn.stateName].filter(Boolean).join(", ")
    : "Unknown";
  const media = trip.days.flatMap((day) =>
    day.photos.map((photo) => ({
      id: photo.id,
      filePath: photo.filePath,
      originalFilename: photo.originalFilename,
      title: photo.title,
      caption: photo.caption,
      mimeType: photo.mimeType,
      capturedAt: photo.capturedAt?.toISOString() ?? null,
      dayNumber: day.dayNumber
    }))
  );
  const allMedia = [
    ...media,
    ...trip.days.flatMap((day) =>
      day.posts.flatMap((post) =>
        post.media.map((item) => ({
          id: item.id,
          filePath: item.filePath,
          originalFilename: item.originalFilename,
          title: item.title,
          caption: item.caption,
          mimeType: item.mimeType,
          capturedAt: item.capturedAt?.toISOString() ?? null
        }))
      )
    )
  ];
  const sortedPoints = [...trip.trackPoints].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

  function inferTimezone(near: Date): string | null {
    if (!sortedPoints.length) return null;
    let closest = sortedPoints[0]!;
    let minDiff = Math.abs(closest.recordedAt.getTime() - near.getTime());
    for (const p of sortedPoints) {
      const diff = Math.abs(p.recordedAt.getTime() - near.getTime());
      if (diff < minDiff) { minDiff = diff; closest = p; }
    }
    return closest.timezone ?? null;
  }

  const feed = [
    ...trip.trackPoints.map((point) => ({
      id: point.id,
      type: "point" as const,
      timestamp: point.recordedAt,
      timezone: point.timezone ?? null,
      day: point.tripDay
        ? trip.days.find((day) => day.id === point.tripDay?.id) ?? null
        : null,
      point
    })),
    ...trip.days.flatMap((day) =>
      day.posts.map((post) => ({
        id: post.id,
        type: "post" as const,
        timestamp: post.createdAt,
        timezone: inferTimezone(post.createdAt),
        day,
        post
      }))
    )
  ].sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());

  return (
    <main className="trip-summary-shell">
      <section className="trip-summary-panel tracker-page-panel">
        <EditModeGate
          enabled={Boolean(adminSession)}
          fallback={null}
        >
          <div className="trip-summary-toolbar">
            <Link className="button-secondary" href={`/trips/${trip.slug}/details`}>
              Back to Trip
            </Link>
          </div>
        </EditModeGate>

        <header className="tracker-page-header">
          <h1>{trip.title}</h1>
          <p className="trip-summary-range tracker-page-range">
            {trip.startDate ? formatShortDate(trip.startDate) : "Date not set"} to {trip.endDate ? formatShortDate(trip.endDate) : "Date not set"}
          </p>
          <p className="eyebrow tracker-page-subheading">Trip Overview</p>
        </header>

        <section className="section-card tracker-map-card">
          <TrackerMap points={points} />
        </section>

        <section className="tracker-dashboard-stats">
          <article className="tracker-stat-card">
            <strong>{statesVisited.size}</strong>
            <span>States Visited</span>
          </article>
          <article className="tracker-stat-card">
            <strong>{totalMiles}</strong>
            <span>Miles Traveled</span>
          </article>
          <article className="tracker-stat-card">
            <strong>{totalCheckIns}</strong>
            <span>Check Ins</span>
          </article>
          <article className="tracker-stat-card">
            <strong>{averageMilesPerDay}</strong>
            <span>Average Miles Per Day</span>
          </article>
          <article className="tracker-stat-card tracker-stat-card-location">
            <strong>{currentLocationLabel}</strong>
            <span>Current Location</span>
          </article>
        </section>

        <section className="section-card tracker-media-section">
          <div className="trip-calendar-header">
            <div>
              <p className="eyebrow">Trip Media</p>
            </div>
            <span className="chip">{media.length} items</span>
          </div>
          {media.length ? (
            <div className="tracker-media-grid">
              {media.map((item) => {
                const mediaTitle =
                  item.title ?? `Day ${item.dayNumber} - ${trip.days.find((day) => day.dayNumber === item.dayNumber)?.endPlace.name ?? "Trip stop"}`;

                return (
                  <figure key={item.id} className="tracker-media-card">
                  <button type="button" data-lightbox-id={item.id} className="tracker-media-button">
                    {item.mimeType?.startsWith("video/") ? (
                      <video className="tracker-media" src={item.filePath} playsInline preload="metadata" />
                    ) : (
                      <img className="tracker-media" src={item.filePath} alt={item.originalFilename} />
                    )}
                  </button>
                  <figcaption>
                    <EditModeGate
                      enabled={Boolean(adminSession)}
                      fallback={
                        <>
                          <strong>{mediaTitle}</strong>
                          {item.caption ? <p className="tracker-media-caption">{item.caption}</p> : null}
                          <span>Day {item.dayNumber}</span>
                        </>
                      }
                    >
                        <form action={updateTripPhotoAction} className="tracker-inline-form">
                          <input type="hidden" name="slug" value={trip.slug} />
                          <input type="hidden" name="photoId" value={item.id} />
                          <input type="hidden" name="returnTo" value="overview" />
                          <input type="hidden" name="field" value="title" />
                          <input
                            className="tracker-inline-input"
                            name="value"
                            defaultValue={mediaTitle}
                            placeholder="Title"
                          />
                          <button className="button-secondary tracker-inline-save" type="submit">
                            Save
                          </button>
                        </form>
                        <form action={updateTripPhotoAction} className="tracker-inline-form tracker-inline-form-caption">
                          <input type="hidden" name="slug" value={trip.slug} />
                          <input type="hidden" name="photoId" value={item.id} />
                          <input type="hidden" name="returnTo" value="overview" />
                          <input type="hidden" name="field" value="caption" />
                          <textarea
                            className="tracker-inline-input tracker-inline-textarea"
                            name="value"
                            defaultValue={item.caption ?? ""}
                            placeholder="Caption"
                            rows={2}
                          />
                          <button className="button-secondary tracker-inline-save" type="submit">
                            Save
                          </button>
                        </form>
                        <div className="tracker-media-meta-row">
                          <span>Day {item.dayNumber}</span>
                          <form action={deleteTripPhotoAction}>
                            <input type="hidden" name="slug" value={trip.slug} />
                            <input type="hidden" name="photoId" value={item.id} />
                            <input type="hidden" name="returnTo" value="overview" />
                            <button className="tracker-delete-button" type="submit" aria-label={`Delete ${item.originalFilename}`}>
                              [x] Delete
                            </button>
                          </form>
                        </div>
                    </EditModeGate>
                  </figcaption>
                  </figure>
                );
              })}
            </div>
          ) : (
            <p className="muted">No photos or videos uploaded for this trip yet.</p>
          )}
        </section>

        <section className="tracker-timeline">
          <article className="section-card tracker-day-card">
            <div className="trip-calendar-header">
              <div>
                <p className="eyebrow">Feed</p>
              </div>
              <span className="chip">{feed.length} entries</span>
            </div>
            <ul className="day-stop-cards tracker-point-list">
              {feed.map((entry) => {
                if (entry.type === "point") {
                  const trackerCandidates = entry.day ? dayCandidates.get(entry.day.id) ?? [] : [];
                  const point = entry.point;

                  return (
                    <li key={`point-${point.id}`} className="day-stop-card tracker-point-item">
                      {point.source === "checkin" && (() => {
                        const resolvedLabel = resolveTrackerPointLabel(point, trackerCandidates);
                        const textToCheck = [point.note, resolvedLabel].filter(Boolean).join(" ").toLowerCase();
                        const isHotDog = textToCheck.includes("hot dog") || textToCheck.includes("hotdog");
                        return <img src={isHotDog ? "/hot_dog.png" : "/rv.png"} alt="" aria-hidden className={isHotDog ? "tracker-checkin-hotdog-icon" : "tracker-checkin-rv-icon"} />;
                      })()}
                      <div className="tracker-point-header">
                        <div className="tracker-point-header-main">
                          <strong>{resolveTrackerPointLabel(point, trackerCandidates)}</strong>
                          <span>{formatPointTimestamp(point.recordedAt, entry.timezone)}</span>
                        </div>
                        <EditModeGate enabled={Boolean(adminSession)} fallback={null}>
                          <form action={deleteTrackerPointAction}>
                            <input type="hidden" name="slug" value={trip.slug} />
                            <input type="hidden" name="pointId" value={point.id} />
                            <button className="tracker-delete-button" type="submit" aria-label="Delete tracker point">
                              [x] Delete
                            </button>
                          </form>
                        </EditModeGate>
                      </div>
                      <p className="tracker-point-meta">
                        {entry.day ? `Day ${entry.day.dayNumber}` : "Unassigned"} · {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}
                      </p>
                      {point.author ? <p className="day-post-author">by {point.author}</p> : null}
                      <EditModeGate
                        enabled={Boolean(adminSession)}
                        fallback={point.note ? <p className="tracker-point-note">{point.note}</p> : null}
                      >
                        <form action={updateTrackerPointAction} className="tracker-inline-form tracker-inline-form-caption">
                          <input type="hidden" name="slug" value={trip.slug} />
                          <input type="hidden" name="pointId" value={point.id} />
                          <input type="hidden" name="field" value="note" />
                          <textarea
                            className="tracker-inline-input tracker-inline-textarea"
                            name="value"
                            defaultValue={point.note ?? ""}
                            placeholder="Check-in text"
                            rows={2}
                          />
                          <button className="button-secondary tracker-inline-save" type="submit">
                            Save
                          </button>
                        </form>
                        <form action={updateTrackerPointAction} className="tracker-inline-form">
                          <input type="hidden" name="slug" value={trip.slug} />
                          <input type="hidden" name="pointId" value={point.id} />
                          <input type="hidden" name="field" value="author" />
                          <input
                            className="tracker-inline-input"
                            name="value"
                            defaultValue={point.author ?? ""}
                            placeholder="Author (Brian / Mark)"
                          />
                          <button className="button-secondary tracker-inline-save" type="submit">
                            Save
                          </button>
                        </form>
                      </EditModeGate>
                    </li>
                  );
                }

                const post = entry.post;
                const day = entry.day;

                return (
                  <li key={`post-${post.id}`} className="day-stop-card tracker-point-item tracker-post-item">
                    <div className="day-post-primary-card">
                    <div className="inline-item-header">
                      <p className="day-post-primary-title">{post.title}</p>
                      <p className="tracker-checkin-meta">
                        <span>{formatPointTimestamp(post.createdAt, entry.timezone)}</span>
                      </p>
                      <EditModeGate enabled={Boolean(adminSession)} fallback={null}>
                        <form action={deleteTripPostAction}>
                          <input type="hidden" name="slug" value={trip.slug} />
                          <input type="hidden" name="postId" value={post.id} />
                          <input type="hidden" name="returnTo" value="overview" />
                          <button className="tracker-delete-button" type="submit" aria-label="Delete post">
                            [x] Delete
                          </button>
                        </form>
                      </EditModeGate>
                    </div>
                    <p className="tracker-point-meta">
                      {day ? `Day ${day.dayNumber}` : ""}
                      {post.author ? ` · by ${post.author}` : ""}
                    </p>
                    <EditModeGate
                      enabled={Boolean(adminSession)}
                      fallback={<p className="day-post-primary-body">{post.body}</p>}
                    >
                        <form action={updateTripPostAction} className="tracker-inline-form">
                          <input type="hidden" name="slug" value={trip.slug} />
                          <input type="hidden" name="postId" value={post.id} />
                          <input type="hidden" name="returnTo" value="overview" />
                          <input type="hidden" name="field" value="title" />
                          <input className="tracker-inline-input" name="value" defaultValue={post.title} />
                          <button className="button-secondary tracker-inline-save" type="submit">
                            Save
                          </button>
                        </form>
                        <form action={updateTripPostAction} className="tracker-inline-form tracker-inline-form-caption">
                          <input type="hidden" name="slug" value={trip.slug} />
                          <input type="hidden" name="postId" value={post.id} />
                          <input type="hidden" name="returnTo" value="overview" />
                          <input type="hidden" name="field" value="body" />
                          <textarea className="tracker-inline-input tracker-inline-textarea" name="value" defaultValue={post.body} rows={3} />
                          <button className="button-secondary tracker-inline-save" type="submit">
                            Save
                          </button>
                        </form>
                        <form action={updateTripPostAction} className="tracker-inline-form">
                          <input type="hidden" name="slug" value={trip.slug} />
                          <input type="hidden" name="postId" value={post.id} />
                          <input type="hidden" name="returnTo" value="overview" />
                          <input type="hidden" name="field" value="author" />
                          <input className="tracker-inline-input" name="value" defaultValue={post.author ?? ""} placeholder="Author (Brian / Mark)" />
                          <button className="button-secondary tracker-inline-save" type="submit">
                            Save
                          </button>
                        </form>
                        <form action={uploadTripPostMediaAction} className="tracker-inline-form tracker-post-media-upload">
                          <input type="hidden" name="slug" value={trip.slug} />
                          <input type="hidden" name="postId" value={post.id} />
                          <input type="hidden" name="returnTo" value="overview" />
                          <input type="file" name="media" accept="image/*,video/*" multiple />
                          <button className="button-secondary tracker-inline-save" type="submit">
                            Upload media
                          </button>
                        </form>
                    </EditModeGate>
                    {post.media.length ? (
                      <div className="tracker-post-media-grid">
                        {post.media.map((item) => {
                          const mediaTitle = item.title ?? `Day ${day?.dayNumber ?? "?"} - ${day?.endPlace.name ?? "Trip stop"}`;

                          return (
                            <figure key={item.id} className="tracker-media-card tracker-post-media-card">
                              <button type="button" data-lightbox-id={item.id} className="tracker-media-button">
                                {isVideoMedia(item.mimeType) ? (
                                  <video className="tracker-media" src={item.filePath} playsInline preload="metadata" />
                                ) : (
                                  <img className="tracker-media" src={item.filePath} alt={item.originalFilename} />
                                )}
                              </button>
                              <figcaption>
                                <EditModeGate
                                  enabled={Boolean(adminSession)}
                                  fallback={
                                    <>
                                      <strong>{mediaTitle}</strong>
                                      {item.caption ? <p className="tracker-media-caption">{item.caption}</p> : null}
                                    </>
                                  }
                                >
                                    <form action={updateTripPostMediaAction} className="tracker-inline-form">
                                      <input type="hidden" name="slug" value={trip.slug} />
                                      <input type="hidden" name="mediaId" value={item.id} />
                                      <input type="hidden" name="returnTo" value="overview" />
                                      <input type="hidden" name="field" value="title" />
                                      <input className="tracker-inline-input" name="value" defaultValue={mediaTitle} placeholder="Title" />
                                      <button className="button-secondary tracker-inline-save" type="submit">
                                        Save
                                      </button>
                                    </form>
                                    <form action={updateTripPostMediaAction} className="tracker-inline-form tracker-inline-form-caption">
                                      <input type="hidden" name="slug" value={trip.slug} />
                                      <input type="hidden" name="mediaId" value={item.id} />
                                      <input type="hidden" name="returnTo" value="overview" />
                                      <input type="hidden" name="field" value="caption" />
                                      <textarea className="tracker-inline-input tracker-inline-textarea" name="value" defaultValue={item.caption ?? ""} rows={2} placeholder="Caption" />
                                      <button className="button-secondary tracker-inline-save" type="submit">
                                        Save
                                      </button>
                                    </form>
                                    <form action={deleteTripPostMediaAction}>
                                      <input type="hidden" name="slug" value={trip.slug} />
                                      <input type="hidden" name="mediaId" value={item.id} />
                                      <input type="hidden" name="returnTo" value="overview" />
                                      <button className="tracker-delete-button" type="submit" aria-label={`Delete ${item.originalFilename}`}>
                                        [x] Delete
                                      </button>
                                    </form>
                                </EditModeGate>
                              </figcaption>
                            </figure>
                          );
                        })}
                      </div>
                    ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </article>
        </section>
      </section>
      <OverviewMediaLightbox allMedia={allMedia} />
    </main>
  );
}
