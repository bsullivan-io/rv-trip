import Link from "next/link";
import { DayStopKind, TripDayType } from "@prisma/client";
import { notFound } from "next/navigation";
import { formatDateLabel, toDateInputValue } from "@/lib/dates";
import { getAdminTrip, getPlaces } from "@/lib/data";
import {
  createDayAction,
  createPlaceAction,
  createStopAction,
  deleteDayAction,
  deletePlaceAction,
  deleteStopAction,
  reimportSeedTripAction,
  updateDayAction,
  updatePlaceAction,
  updateStopAction,
  updateTripAction
} from "@/app/admin/(protected)/trips/[tripId]/actions";

type AdminTripPageProps = {
  params: Promise<{
    tripId: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function AdminTripPage({ params }: AdminTripPageProps) {
  const { tripId } = await params;
  const [trip, places] = await Promise.all([getAdminTrip(tripId), getPlaces()]);

  if (!trip) {
    notFound();
  }

  return (
    <section className="stack">
      <div className="inline-actions">
        <Link href={`/trips/${trip.slug}/details`} className="button-secondary">
          Open public trip
        </Link>
        <form action={reimportSeedTripAction}>
          <input type="hidden" name="tripId" value={trip.id} />
          <button className="button-secondary" type="submit">
            Re-import seed markdown
          </button>
        </form>
      </div>

      <section className="panel section-card">
        <p className="eyebrow">Trip Metadata</p>
        <form action={updateTripAction} className="stack">
          <input type="hidden" name="tripId" value={trip.id} />
          <div className="field-grid two">
            <div className="field">
              <label htmlFor="title">Title</label>
              <input id="title" name="title" defaultValue={trip.title} required />
            </div>
            <div className="field">
              <label htmlFor="slug">Slug</label>
              <input id="slug" name="slug" defaultValue={trip.slug} required />
            </div>
          </div>
          <div className="field">
            <label htmlFor="summary">Summary</label>
            <textarea id="summary" name="summary" rows={3} defaultValue={trip.summary} required />
          </div>
          <div className="field-grid two">
            <div className="field">
              <label htmlFor="startingLocation">Starting location</label>
              <input id="startingLocation" name="startingLocation" defaultValue={trip.startingLocation} required />
            </div>
            <div className="field">
              <label htmlFor="endingLocation">Ending location</label>
              <input id="endingLocation" name="endingLocation" defaultValue={trip.endingLocation} required />
            </div>
          </div>
          <div className="field-grid two">
            <div className="field">
              <label htmlFor="startDate">Start date</label>
              <input id="startDate" name="startDate" type="date" defaultValue={toDateInputValue(trip.startDate)} required />
            </div>
            <div className="field">
              <label htmlFor="endDate">End date</label>
              <input id="endDate" name="endDate" type="date" defaultValue={toDateInputValue(trip.endDate)} required />
            </div>
          </div>
          <div className="field">
            <label htmlFor="routeOverview">Route overview</label>
            <textarea id="routeOverview" name="routeOverview" rows={3} defaultValue={trip.routeOverview} required />
          </div>
          <div className="field">
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" rows={4} defaultValue={trip.notes} />
          </div>
          <div className="field-grid two">
            <div className="field">
              <label htmlFor="bookingPhone">Booking phone</label>
              <input id="bookingPhone" name="bookingPhone" defaultValue={trip.bookingPhone ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="totalMiles">Total miles</label>
              <input id="totalMiles" name="totalMiles" type="number" min="0" defaultValue={trip.totalMiles ?? ""} />
            </div>
          </div>
          <button className="button" type="submit">
            Save trip
          </button>
        </form>
      </section>

      <section className="panel section-card stack">
        <div>
          <p className="eyebrow">Places</p>
          <p className="muted">Update shared coordinates used by route days and map markers.</p>
        </div>

        <form action={createPlaceAction} className="stack section-card">
          <input type="hidden" name="tripId" value={trip.id} />
          <h3>Add place</h3>
          <div className="field-grid two">
            <div className="field">
              <label htmlFor="new-place-name">Name</label>
              <input id="new-place-name" name="name" required />
            </div>
            <div className="field">
              <label htmlFor="new-place-region">Region label</label>
              <input id="new-place-region" name="regionLabel" />
            </div>
          </div>
          <div className="field-grid two">
            <div className="field">
              <label htmlFor="new-place-lat">Latitude</label>
              <input id="new-place-lat" name="latitude" type="number" step="0.000001" required />
            </div>
            <div className="field">
              <label htmlFor="new-place-lng">Longitude</label>
              <input id="new-place-lng" name="longitude" type="number" step="0.000001" required />
            </div>
          </div>
          <button className="button" type="submit">
            Add place
          </button>
        </form>

        <div className="stack">
          {places.map((place) => (
            <form key={place.id} action={updatePlaceAction} className="section-card stack">
              <input type="hidden" name="tripId" value={trip.id} />
              <input type="hidden" name="placeId" value={place.id} />
              <div className="field-grid two">
                <div className="field">
                  <label>Name</label>
                  <input name="name" defaultValue={place.name} required />
                </div>
                <div className="field">
                  <label>Region label</label>
                  <input name="regionLabel" defaultValue={place.regionLabel ?? ""} />
                </div>
              </div>
              <div className="field-grid two">
                <div className="field">
                  <label>Latitude</label>
                  <input name="latitude" type="number" step="0.000001" defaultValue={place.latitude} required />
                </div>
                <div className="field">
                  <label>Longitude</label>
                  <input name="longitude" type="number" step="0.000001" defaultValue={place.longitude} required />
                </div>
              </div>
              <div className="inline-actions">
                <button className="button" type="submit">
                  Save place
                </button>
              </div>
            </form>
          ))}
        </div>

        <form action={deletePlaceAction} className="section-card stack">
          <input type="hidden" name="tripId" value={trip.id} />
          <h3>Delete unused place</h3>
          <div className="field">
            <label htmlFor="delete-place">Place</label>
            <select id="delete-place" name="placeId" required defaultValue="">
              <option value="" disabled>
                Select a place
              </option>
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>
          </div>
          <button className="button-danger" type="submit">
            Delete place
          </button>
        </form>
      </section>

      <section className="panel section-card stack">
        <div>
          <p className="eyebrow">Days</p>
          <p className="muted">Edit day order, route endpoints, copy, and stop content. Changing numeric order will be normalized into a contiguous sequence.</p>
        </div>

        <form action={createDayAction} className="section-card stack">
          <input type="hidden" name="tripId" value={trip.id} />
          <h3>Add day</h3>
          <div className="field-grid three">
            <div className="field">
              <label htmlFor="new-day-title">Title</label>
              <input id="new-day-title" name="title" required />
            </div>
            <div className="field">
              <label htmlFor="new-day-date">Date</label>
              <input id="new-day-date" name="date" type="date" required />
            </div>
            <div className="field">
              <label htmlFor="new-day-type">Type</label>
              <select id="new-day-type" name="type" defaultValue={TripDayType.travel}>
                <option value={TripDayType.travel}>Travel</option>
                <option value={TripDayType.basecamp}>Basecamp</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="new-day-miles">Miles</label>
              <input id="new-day-miles" name="miles" type="number" min="0" defaultValue={0} />
            </div>
          </div>
          <div className="field-grid two">
            <div className="field">
              <label htmlFor="new-day-start">Start place</label>
              <select id="new-day-start" name="startPlaceId" required defaultValue="">
                <option value="" disabled>
                  Select start place
                </option>
                {places.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="new-day-end">End place</label>
              <select id="new-day-end" name="endPlaceId" required defaultValue="">
                <option value="" disabled>
                  Select end place
                </option>
                {places.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="new-day-summary">Summary</label>
            <textarea id="new-day-summary" name="summary" rows={3} required />
          </div>
          <div className="field">
            <label htmlFor="new-day-callout">Callout</label>
            <textarea id="new-day-callout" name="callout" rows={2} required />
          </div>
          <div className="field-grid two">
            <div className="field">
              <label htmlFor="new-day-accommodation-name">Accommodation name</label>
              <input id="new-day-accommodation-name" name="accommodationName" />
            </div>
            <div className="field">
              <label htmlFor="new-day-accommodation-description">Accommodation description</label>
              <input id="new-day-accommodation-description" name="accommodationDescription" />
            </div>
          </div>
          <button className="button" type="submit">
            Add day
          </button>
        </form>

        {trip.days.map((day) => (
          <section key={day.id} className="section-card stack">
            <form action={updateDayAction} className="stack">
              <input type="hidden" name="tripId" value={trip.id} />
              <input type="hidden" name="dayId" value={day.id} />
              <div className="inline-actions">
                <h3 style={{ margin: 0 }}>Day {day.dayNumber}</h3>
                <span className="chip">{day.type}</span>
                <span className="chip">{formatDateLabel(day.date)}</span>
              </div>

              <div className="field-grid three">
                <div className="field">
                  <label>Order</label>
                  <input name="dayNumber" type="number" min="1" defaultValue={day.dayNumber} required />
                </div>
                <div className="field">
                  <label>Date</label>
                  <input name="date" type="date" defaultValue={toDateInputValue(day.date)} required />
                </div>
                <div className="field">
                  <label>Type</label>
                  <select name="type" defaultValue={day.type}>
                    <option value={TripDayType.travel}>Travel</option>
                    <option value={TripDayType.basecamp}>Basecamp</option>
                  </select>
                </div>
                <div className="field">
                  <label>Miles</label>
                  <input name="miles" type="number" min="0" defaultValue={day.miles} required />
                </div>
              </div>

              <div className="field">
                <label>Title</label>
                <input name="title" defaultValue={day.title} required />
              </div>

              <div className="field-grid two">
                <div className="field">
                  <label>Start place</label>
                  <select name="startPlaceId" defaultValue={day.startPlaceId}>
                    {places.map((place) => (
                      <option key={place.id} value={place.id}>
                        {place.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>End place</label>
                  <select name="endPlaceId" defaultValue={day.endPlaceId}>
                    {places.map((place) => (
                      <option key={place.id} value={place.id}>
                        {place.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="field">
                <label>Summary</label>
                <textarea name="summary" rows={3} defaultValue={day.summary} required />
              </div>
              <div className="field">
                <label>Callout</label>
                <textarea name="callout" rows={2} defaultValue={day.callout} required />
              </div>

              <div className="field-grid two">
                <div className="field">
                  <label>Accommodation name</label>
                  <input name="accommodationName" defaultValue={day.accommodationName ?? ""} />
                </div>
                <div className="field">
                  <label>Accommodation description</label>
                  <input name="accommodationDescription" defaultValue={day.accommodationDescription ?? ""} />
                </div>
              </div>

              <div className="inline-actions">
                <button className="button" type="submit">
                  Save day
                </button>
              </div>
            </form>

            <form action={deleteDayAction}>
              <input type="hidden" name="tripId" value={trip.id} />
              <input type="hidden" name="dayId" value={day.id} />
              <button className="button-danger" type="submit">
                Delete day
              </button>
            </form>

            <div className="stack">
              <h4>Stops</h4>

              <form action={createStopAction} className="section-card stack">
                <input type="hidden" name="tripId" value={trip.id} />
                <input type="hidden" name="tripDayId" value={day.id} />
                <div className="field-grid three">
                  <div className="field">
                    <label>Kind</label>
                    <select name="kind" defaultValue={DayStopKind.activity}>
                      <option value={DayStopKind.activity}>Activity</option>
                      <option value={DayStopKind.dinner}>Dinner</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Name</label>
                    <input name="name" required />
                  </div>
                  <div className="field">
                    <label>Linked place</label>
                    <select name="placeId" defaultValue="">
                      <option value="">No linked place</option>
                      {places.map((place) => (
                        <option key={place.id} value={place.id}>
                          {place.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Note</label>
                  <textarea name="note" rows={2} required />
                </div>
                <div className="field">
                  <label>Source URL</label>
                  <input name="sourceUrl" type="url" />
                </div>
                <button className="button" type="submit">
                  Add stop
                </button>
              </form>

              {day.stops.map((stop) => (
                <div key={stop.id} className="section-card">
                  <form action={updateStopAction} className="stack">
                    <input type="hidden" name="tripId" value={trip.id} />
                    <input type="hidden" name="tripDayId" value={day.id} />
                    <input type="hidden" name="stopId" value={stop.id} />
                    <div className="field-grid three">
                      <div className="field">
                        <label>Kind</label>
                        <select name="kind" defaultValue={stop.kind}>
                          <option value={DayStopKind.activity}>Activity</option>
                          <option value={DayStopKind.dinner}>Dinner</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Order</label>
                        <input name="sortOrder" type="number" min="1" defaultValue={stop.sortOrder} required />
                      </div>
                      <div className="field">
                        <label>Linked place</label>
                        <select name="placeId" defaultValue={stop.placeId ?? ""}>
                          <option value="">No linked place</option>
                          {places.map((place) => (
                            <option key={place.id} value={place.id}>
                              {place.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="field">
                      <label>Name</label>
                      <input name="name" defaultValue={stop.name} required />
                    </div>
                    <div className="field">
                      <label>Note</label>
                      <textarea name="note" rows={2} defaultValue={stop.note} required />
                    </div>
                    <div className="field">
                      <label>Source URL</label>
                      <input name="sourceUrl" type="url" defaultValue={stop.sourceUrl ?? ""} />
                    </div>
                    <div className="inline-actions">
                      <button className="button" type="submit">
                        Save stop
                      </button>
                    </div>
                  </form>

                  <form action={deleteStopAction} className="inline-actions" style={{ marginTop: 12 }}>
                    <input type="hidden" name="tripId" value={trip.id} />
                    <input type="hidden" name="tripDayId" value={day.id} />
                    <input type="hidden" name="stopId" value={stop.id} />
                    <input type="hidden" name="kind" value={stop.kind} />
                    <button className="button-danger" type="submit">
                      Delete stop
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </section>
        ))}
      </section>
    </section>
  );
}
