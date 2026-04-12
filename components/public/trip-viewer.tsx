"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faLock, faLockOpen, faShareNodes, faXmark } from "@fortawesome/free-solid-svg-icons";
import { TripMap } from "@/components/public/trip-map";
import { formatDateLabel, formatMonthLabel, formatShortDate } from "@/lib/dates";
import { buildPlaceLookupUrl, buildStopSearchUrl } from "@/lib/map-links";
import { deriveTripProgress } from "@/lib/trip-progress";
import { addUtcDays, compareDateKeys, deriveStayEvents, parseUtcDateKey, toDateKey, type StayEvent } from "@/lib/trip-stays";

type Place = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

type DayLocation = {
  id: string;
  sortOrder: number;
  note: string | null;
  place: Place;
};

type TripPhoto = {
  id: string;
  filePath: string;
  originalFilename: string;
  mimeType: string | null;
  capturedAt: string | null;
};

type TripDay = {
  id: string;
  dayNumber: number;
  date: string | null;
  title: string;
  type: "travel" | "basecamp";
  miles: number;
  distanceMeters: number | null;
  durationSeconds: number | null;
  routePolyline: string | null;
  summary: string;
  callout: string;
  accommodationName: string | null;
  accommodationDescription: string | null;
  startPlace: Place;
  endPlace: Place;
  locations: DayLocation[];
  photos: TripPhoto[];
  stops: Array<{
    id: string;
    kind: "dinner" | "activity";
    name: string;
    note: string;
    sourceUrl?: string | null;
    placeName?: string | null;
    placeRegionLabel?: string | null;
    latitude: number | null;
    longitude: number | null;
    detourMiles?: number | null;
  }>;
};

type PlaceSuggestion = {
  placeId: string;
  text: string;
  secondaryText: string | null;
};

type TripViewerProps = {
  trip: {
    id: string;
    slug: string;
    title: string;
    summary: string;
    totalMiles: number | null;
    routeOverview: string;
    notes: string;
    startDate: string | null;
    endDate: string | null;
    hotDogPlaces: Array<{
      id: string;
      name: string;
      address: string | null;
      latitude: number;
      longitude: number;
      dayNumber: number;
    }>;
    days: TripDay[];
  };
  flash: {
    type: "success" | "error";
    message: string;
  } | null;
  initialSelectedDayNumber: number;
  canEdit: boolean;
  loginUrl: string;
  addStopAction: (formData: FormData) => Promise<void>;
  addPlaceSearchAction: (formData: FormData) => Promise<void>;
  uploadTripPhotoAction: (formData: FormData) => Promise<void>;
  updateTripAction: (formData: FormData) => Promise<void>;
  updateDayAction: (formData: FormData) => Promise<void>;
  updateLocationAction: (formData: FormData) => Promise<void>;
  updateStopAction: (formData: FormData) => Promise<void>;
  deleteLocationAction: (formData: FormData) => Promise<void>;
  deleteStopAction: (formData: FormData) => Promise<void>;
  deletePhotoAction: (formData: FormData) => Promise<void>;
};

type CalendarCell = {
  date: Date;
  dateKey: string;
  isCurrentMonth: boolean;
  tripDay?: TripDay;
};

type CalendarSegment = {
  event: StayEvent;
  startCol: number;
  endCol: number;
  lane: number;
  isStartSegment: boolean;
};

type CalendarWeek = {
  weekStart: Date;
  cells: CalendarCell[];
  segments: CalendarSegment[];
  laneCount: number;
};

function getCalendarEventColors(placeName: string) {
  let hash = 0;
  for (let index = 0; index < placeName.length; index += 1) {
    hash = (hash * 31 + placeName.charCodeAt(index)) % 360;
  }

  const hue = hash % 360;
  return {
    background: `hsl(${hue} 52% 40%)`,
    border: `hsl(${hue} 58% 30%)`,
    text: "#ffffff"
  };
}

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

function formatDistanceLabel(miles: number | null | undefined) {
  if (miles == null) {
    return "Unavailable";
  }
  return `${miles} mi`;
}

function isVideoMedia(photo: TripPhoto) {
  return photo.mimeType?.startsWith("video/") ?? false;
}

function buildCalendarWeeks(monthIso: string, days: TripDay[], events: StayEvent[]) {
  const monthDate = new Date(monthIso);
  const monthStart = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1, 12, 0, 0));
  const gridStart = new Date(monthStart);
  gridStart.setUTCDate(monthStart.getUTCDate() - monthStart.getUTCDay());
  const datedDays = days.filter((day): day is TripDay & { date: string } => Boolean(day.date));
  const weeks: CalendarWeek[] = [];

  for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
    const weekStart = addUtcDays(gridStart, weekIndex * 7);
    const weekEndExclusive = addUtcDays(weekStart, 7);
    const cells = Array.from({ length: 7 }, (_, columnIndex) => {
      const cellDate = addUtcDays(weekStart, columnIndex);
      const dateKey = toDateKey(cellDate);
      return {
        date: cellDate,
        dateKey,
        isCurrentMonth: cellDate.getUTCMonth() === monthStart.getUTCMonth(),
        tripDay: datedDays.find((day) => day.date === dateKey)
      };
    });

    const rawSegments = events
      .filter(
        (event) =>
          compareDateKeys(event.startDate, toDateKey(weekEndExclusive)) < 0 &&
          compareDateKeys(event.endExclusiveDate, toDateKey(weekStart)) > 0
      )
      .map((event) => {
        const segmentStartKey = compareDateKeys(event.startDate, toDateKey(weekStart)) < 0 ? toDateKey(weekStart) : event.startDate;
        const segmentEndKey =
          compareDateKeys(event.endExclusiveDate, toDateKey(weekEndExclusive)) > 0
            ? toDateKey(weekEndExclusive)
            : event.endExclusiveDate;

        return {
          event,
          startCol: Math.max(0, Math.round((parseUtcDateKey(segmentStartKey).getTime() - weekStart.getTime()) / 86400000)),
          endCol: Math.min(7, Math.round((parseUtcDateKey(segmentEndKey).getTime() - weekStart.getTime()) / 86400000)),
          isStartSegment: event.startDate === segmentStartKey
        };
      })
      .sort(
        (left, right) =>
          left.startCol - right.startCol ||
          (right.endCol - right.startCol) - (left.endCol - left.startCol) ||
          left.event.placeName.localeCompare(right.event.placeName)
      );

    const laneEnds: number[] = [];
    const segments = rawSegments.map((segment) => {
      let lane = laneEnds.findIndex((endCol) => endCol <= segment.startCol);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(segment.endCol);
      } else {
        laneEnds[lane] = segment.endCol;
      }

      return { ...segment, lane };
    });

    weeks.push({ weekStart, cells, segments, laneCount: Math.max(1, laneEnds.length) });
  }

  return weeks;
}

function resolveEventDayNumber(event: StayEvent, clickedDateKey: string) {
  const matchingDay = [...event.coveredDays]
    .reverse()
    .find((coveredDay) => compareDateKeys(coveredDay.date, clickedDateKey) <= 0);

  return matchingDay?.dayNumber ?? event.startDayNumber;
}

function CalendarView({
  monthIso,
  days,
  events,
  selectedDayNumber,
  onSelectDay,
  onShiftMonth,
  canGoPrev,
  canGoNext,
  showMonthNavigation,
  variant
}: {
  monthIso: string;
  days: TripDay[];
  events: StayEvent[];
  selectedDayNumber: number;
  onSelectDay: (dayNumber: number) => void;
  onShiftMonth: (offset: number) => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  showMonthNavigation: boolean;
  variant: "compact" | "full";
}) {
  const weeks = buildCalendarWeeks(monthIso, days, events);

  return (
    <section className={variant === "full" ? "trip-calendar trip-calendar-full" : "trip-calendar"}>
      <div className="trip-calendar-header">
        <div>
          <p className="eyebrow">Calendar</p>
          <h2>{formatMonthLabel(monthIso)}</h2>
        </div>
        {showMonthNavigation ? (
          <div className="inline-actions">
            <button className="button-secondary" type="button" disabled={!canGoPrev} onClick={() => onShiftMonth(-1)}>
              Prev
            </button>
            <button className="button-secondary" type="button" disabled={!canGoNext} onClick={() => onShiftMonth(1)}>
              Next
            </button>
          </div>
        ) : null}
      </div>

      <div className="calendar-weekdays">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className={variant === "full" ? "calendar-weeks full" : "calendar-weeks"}>
        {weeks.map((week) => (
          <div key={week.weekStart.toISOString()} className="calendar-week" style={{ "--calendar-lanes": week.laneCount } as CSSProperties}>
            <div className="calendar-grid">
              {week.cells.map((cell) => {
                const isSelected = cell.tripDay?.dayNumber === selectedDayNumber;
                return (
                  <button
                    key={cell.date.toISOString()}
                    type="button"
                    className={[
                      "calendar-cell",
                      cell.isCurrentMonth ? "" : "outside",
                      cell.tripDay ? "has-trip" : "",
                      isSelected ? "selected" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => cell.tripDay && onSelectDay(cell.tripDay.dayNumber)}
                    disabled={!cell.tripDay}
                  >
                    <span className="calendar-date-number">{cell.date.getUTCDate()}</span>
                    {cell.tripDay ? <span className="calendar-day-label">Day {cell.tripDay.dayNumber}</span> : null}
                  </button>
                );
              })}
            </div>

            <div className="calendar-segments">
              {week.segments.map((segment) => {
                const width = ((segment.endCol - segment.startCol) / 7) * 100;
                const left = (segment.startCol / 7) * 100;
                return (
                  <button
                    key={`${segment.event.id}-${week.weekStart.toISOString()}-${segment.lane}`}
                    type="button"
                    className={[
                      "calendar-event",
                      variant === "full" ? "full" : "",
                      segment.isStartSegment ? "is-start" : "is-continue",
                      segment.event.coveredDays.some((day) => day.dayNumber === selectedDayNumber) ? "selected" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={
                      {
                        left: `${left}%`,
                        width: `${width}%`,
                        top: `calc(${segment.lane} * var(--calendar-event-height))`,
                        "--calendar-event-bg": getCalendarEventColors(segment.event.placeName).background,
                        "--calendar-event-border": getCalendarEventColors(segment.event.placeName).border,
                        "--calendar-event-fg": getCalendarEventColors(segment.event.placeName).text
                      } as CSSProperties
                    }
                    onClick={() => onSelectDay(resolveEventDayNumber(segment.event, week.cells[segment.startCol].dateKey))}
                    title={`${segment.event.placeName}: ${formatShortDate(segment.event.startDate)} to ${formatShortDate(
                      addUtcDays(parseUtcDateKey(segment.event.endExclusiveDate), -1)
                    )}`}
                  >
                    <span className="calendar-event-label">{segment.isStartSegment ? segment.event.placeName : "Continued"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function InlineEditableText({
  canEdit,
  label,
  value,
  action,
  hiddenFields,
  field,
  multiline = false,
  className,
  placeholder,
  display
}: {
  canEdit: boolean;
  label: string;
  value: string | null;
  action: (formData: FormData) => Promise<void>;
  hiddenFields: Record<string, string | number>;
  field: string;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  display?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const text = value ?? "";
  const renderedDisplay = (display ?? text) || placeholder;

  if (!canEdit) {
    return <div className={className}>{renderedDisplay}</div>;
  }

  if (!editing) {
    return (
      <button type="button" className={`inline-edit-trigger ${className ?? ""}`.trim()} onClick={() => setEditing(true)}>
        <span className="inline-edit-content">{renderedDisplay}</span>
        <span className="inline-edit-tag">Edit {label}</span>
      </button>
    );
  }

  return (
    <form action={action} className="inline-edit-form">
      {Object.entries(hiddenFields).map(([name, hiddenValue]) => (
        <input key={name} type="hidden" name={name} value={String(hiddenValue)} />
      ))}
      <input type="hidden" name="field" value={field} />
      {multiline ? <textarea name="value" defaultValue={text} rows={3} autoFocus /> : <input name="value" defaultValue={text} autoFocus />}
      <div className="inline-edit-actions">
        <button className="button-secondary" type="submit">
          Save
        </button>
        <button className="button-secondary" type="button" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function DeleteInlineButton({
  action,
  hiddenFields,
  confirmMessage
}: {
  action: (formData: FormData) => Promise<void>;
  hiddenFields: Record<string, string | number>;
  confirmMessage: string;
}) {
  return (
    <form
      action={action}
      className="inline-delete-form"
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {Object.entries(hiddenFields).map(([name, hiddenValue]) => (
        <input key={name} type="hidden" name={name} value={String(hiddenValue)} />
      ))}
      <button className="inline-delete-button" type="submit" aria-label="Remove item" title="Remove item">
        [x]
      </button>
    </form>
  );
}

function PhotoUploadControl() {
  const { pending } = useFormStatus();

  return (
    <div className="photo-upload-control">
      <input
        type="file"
        name="photo"
        accept="image/*,video/*"
        capture="environment"
        required
        disabled={pending}
        onChange={(event) => {
          if (event.currentTarget.files?.length) {
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <span className="muted photo-upload-hint">{pending ? "Uploading..." : "Choose a photo or video to upload immediately."}</span>
    </div>
  );
}

function LocationList({
  locations,
  tripId,
  slug,
  editable,
  selectedDayNumber,
  updateLocationAction,
  deleteLocationAction
}: {
  locations: DayLocation[];
  tripId: string;
  slug: string;
  editable: boolean;
  selectedDayNumber: number;
  updateLocationAction: (formData: FormData) => Promise<void>;
  deleteLocationAction: (formData: FormData) => Promise<void>;
}) {
  const locationContext = locations.at(-1)?.place.name ?? "";

  return (
    <ul className="detail-list location-list">
      {locations.map((location) => (
        <li key={location.id} className="inline-list-item">
          <div className="drag-content">
            <div className="inline-item-header">
              <InlineEditableText
                canEdit={editable && !location.id.endsWith("fallback-location")}
                label="location name"
                value={location.place.name}
                action={updateLocationAction}
                hiddenFields={{ slug, locationId: location.id, placeId: location.place.id, selectedDayNumber }}
                field="name"
                className="inline-edit-link"
                display={
                  <span>
                    <a href={buildStopSearchUrl(location.place.name, location.place.name)} target="_blank" rel="noreferrer">
                      {location.place.name}
                    </a>
                  </span>
                }
              />
              {editable && !location.id.endsWith("fallback-location") ? (
                <DeleteInlineButton
                  action={deleteLocationAction}
                  hiddenFields={{ tripId, slug, locationId: location.id, selectedDayNumber }}
                  confirmMessage={`Remove ${location.place.name} from this day?`}
                />
              ) : null}
            </div>
            <InlineEditableText
              canEdit={editable && !location.id.endsWith("fallback-location")}
              label="location note"
              value={location.note}
              action={updateLocationAction}
              hiddenFields={{ slug, locationId: location.id, placeId: location.place.id, selectedDayNumber }}
              field="note"
              multiline
              className="muted"
              placeholder="No day-specific note."
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TripViewer({
  trip,
  flash,
  initialSelectedDayNumber,
  canEdit,
  loginUrl,
  addStopAction,
  addPlaceSearchAction,
  uploadTripPhotoAction,
  updateTripAction,
  updateDayAction,
  updateLocationAction,
  updateStopAction,
  deleteLocationAction,
  deleteStopAction,
  deletePhotoAction
}: TripViewerProps) {
  const normalizedDays = trip.days.map((day) => ({
    ...day,
    locations: day.locations.length ? day.locations : [{ id: `${day.id}-fallback-location`, sortOrder: 1, note: null, place: day.endPlace }]
  }));
  const progress = deriveTripProgress(normalizedDays, initialSelectedDayNumber || null);
  const [selectedDayNumber, setSelectedDayNumber] = useState(progress.selectedDayNumber);
  const [viewMode, setViewMode] = useState<"map" | "calendar" | "locations" | "hotdogs">("map");
  const [mapExpanded, setMapExpanded] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<TripPhoto | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [phoneSidebarOpen, setPhoneSidebarOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState<"days" | "calendar">("days");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceSuggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<PlaceSuggestion | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const selectedDay = normalizedDays.find((day) => day.dayNumber === selectedDayNumber) ?? normalizedDays[0];
  const editable = canEdit && editMode;
  const stayEvents = deriveStayEvents(
    normalizedDays.map((day) => ({
      dayNumber: day.dayNumber,
      date: day.date,
      locations: day.locations
    }))
  );
  const initialCalendarDate = selectedDay?.date ?? trip.startDate ?? new Date().toISOString();
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const initial = new Date(initialCalendarDate);
    return new Date(Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth(), 1, 12, 0, 0)).toISOString();
  });

  const selectedDayIndex = normalizedDays.findIndex((day) => day.dayNumber === selectedDay.dayNumber);
  const previousDay = selectedDayIndex > 0 ? normalizedDays[selectedDayIndex - 1] : null;
  const nextDay = selectedDayIndex >= 0 && selectedDayIndex < normalizedDays.length - 1 ? normalizedDays[selectedDayIndex + 1] : null;

  useEffect(() => {
    if (!mapExpanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMapExpanded(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mapExpanded]);

  useEffect(() => {
    if (!selectedPhoto) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedPhoto(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedPhoto]);

  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.includes("://")) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(`/api/place-search?q=${encodeURIComponent(searchQuery.trim())}`);
        const payload = (await response.json()) as {
          suggestions?: PlaceSuggestion[];
          error?: string;
        };

        setSearchResults(payload.suggestions ?? []);
        setSearchError(payload.error ?? null);
      } catch {
        setSearchError("Search is unavailable right now.");
        setSearchResults([]);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    if (selectedSuggestion && selectedSuggestion.text !== searchQuery) {
      setSelectedSuggestion(null);
    }
  }, [searchQuery, selectedSuggestion]);

  function shiftCalendarMonth(offset: number) {
    const current = new Date(calendarMonth);
    const next = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + offset, 1, 12, 0, 0));
    setCalendarMonth(next.toISOString());
  }

  useEffect(() => {
    if (!selectedDay.date) {
      return;
    }

    const next = new Date(selectedDay.date);
    const monthIso = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), 1, 12, 0, 0)).toISOString();
    setCalendarMonth(monthIso);
  }, [selectedDay.date]);

  async function handleSearchSubmit(formData: FormData) {
    const query = searchQuery.trim();

    if (!query) {
      setSearchError("Enter a place name or paste a Google Maps link.");
      return;
    }

    setSearchError(null);

    if (query.includes("://")) {
      formData.set("mapUrl", query);
      await addStopAction(formData);
      return;
    }

    if (!selectedSuggestion) {
      setSearchError("Choose a search result before adding it.");
      return;
    }

    formData.set("placeId", selectedSuggestion.placeId);
    await addPlaceSearchAction(formData);
  }

  async function handleSharePhoto(photo: TripPhoto) {
    const shareUrl = new URL(photo.filePath, window.location.origin).toString();
    const mimeType = photo.mimeType || (isVideoMedia(photo) ? "video/mp4" : "image/jpeg");

    if (navigator.share) {
      try {
        const response = await fetch(shareUrl);
        if (response.ok) {
          const blob = await response.blob();
          const file = new File([blob], photo.originalFilename, {
            type: blob.type || mimeType
          });

          if (!("canShare" in navigator) || navigator.canShare?.({ files: [file] })) {
            await navigator.share({
              title: photo.originalFilename,
              text: `Trip photo from Day ${selectedDay.dayNumber}`,
              files: [file]
            });
            return;
          }
        }

        await navigator.share({
          title: photo.originalFilename,
          text: `Trip photo from Day ${selectedDay.dayNumber}`,
          url: shareUrl
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      window.alert("Photo link copied to clipboard.");
    } catch {
      window.open(shareUrl, "_blank", "noopener,noreferrer");
    }
  }

  if (!selectedDay) {
    return <main className="empty-state">No days were found for this trip.</main>;
  }

  const locationContext = selectedDay.locations.at(-1)?.place.name ?? selectedDay.endPlace.name;
  const dinners = selectedDay.stops.filter((stop) => stop.kind === "dinner");
  const activities = selectedDay.stops.filter((stop) => stop.kind === "activity");
  const monthDate = new Date(calendarMonth);
  const monthStart = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1, 12, 0, 0));
  const tripStartMonth =
    trip.startDate && new Date(trip.startDate).getUTCFullYear() * 12 + new Date(trip.startDate).getUTCMonth();
  const tripEndMonth =
    trip.endDate && new Date(trip.endDate).getUTCFullYear() * 12 + new Date(trip.endDate).getUTCMonth();
  const currentMonthIndex = monthStart.getUTCFullYear() * 12 + monthStart.getUTCMonth();
  const canGoPrev = typeof tripStartMonth === "number" ? tripStartMonth < currentMonthIndex : false;
  const canGoNext = typeof tripEndMonth === "number" ? tripEndMonth > currentMonthIndex : false;
  const showCalendarNavigation = typeof tripStartMonth === "number" && typeof tripEndMonth === "number" ? tripStartMonth !== tripEndMonth : true;
  const tripHidden = {
    tripId: trip.id,
    slug: trip.slug,
    selectedDayNumber: selectedDay.dayNumber
  };
  const dayHidden = {
    dayId: selectedDay.id,
    slug: trip.slug,
    selectedDayNumber: selectedDay.dayNumber
  };
  const hotDogsByDay = normalizedDays.map((day) => ({
    dayNumber: day.dayNumber,
    date: day.date,
    title: day.title,
    places: trip.hotDogPlaces.filter((place) => place.dayNumber === day.dayNumber)
  }));
  const totalActivities = normalizedDays.reduce((count, day) => count + day.stops.filter((stop) => stop.kind === "activity").length, 0);
  const selectDay = (dayNumber: number) => {
    setSelectedDayNumber(dayNumber);
    setPhoneSidebarOpen(false);
  };

  return (
    <main
      className={
        [
          "trip-layout",
          sidebarCollapsed ? "sidebar-collapsed" : "",
          phoneSidebarOpen ? "phone-sidebar-open" : ""
        ]
          .filter(Boolean)
          .join(" ")
      }
    >
      {phoneSidebarOpen ? (
        <button
          type="button"
          className="trip-sidebar-backdrop mobile-only"
          aria-label="Close summary drawer"
          onClick={() => setPhoneSidebarOpen(false)}
        />
      ) : null}
      <aside className={sidebarCollapsed ? "panel trip-sidebar collapsed" : phoneSidebarOpen ? "panel trip-sidebar mobile-open" : "panel trip-sidebar"}>
        <button
          className="sidebar-handle"
          type="button"
          onClick={() => setSidebarCollapsed(true)}
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
        >
          <FontAwesomeIcon icon={faChevronLeft} />
        </button>
        <section className="trip-header">
          <p className="eyebrow">Trip Overview</p>
          <div className="trip-status-banner">
            <strong>{progress.label}</strong>
            {progress.state === "active" && selectedDay.dayNumber !== progress.currentDayNumber ? (
              <span>Today is Day {progress.currentDayNumber}.</span>
            ) : progress.state === "upcoming" && trip.startDate ? (
              <span>Starts {formatShortDate(trip.startDate)}.</span>
            ) : null}
          </div>
          <InlineEditableText canEdit={editable} label="title" value={trip.title} action={updateTripAction} hiddenFields={tripHidden} field="title" className="trip-heading-edit" />
          <InlineEditableText
            canEdit={editable}
            label="summary"
            value={trip.summary}
            action={updateTripAction}
            hiddenFields={tripHidden}
            field="summary"
            multiline
            className="trip-summary"
          />
          <div className="chip-row">
            {trip.totalMiles ? <span className="chip">{trip.totalMiles} miles</span> : null}
            <span className="chip">{trip.days.length} days</span>
            <span className="chip">{totalActivities} activities</span>
            {trip.startDate && trip.endDate ? <span className="chip">{formatShortDate(trip.startDate)} to {formatShortDate(trip.endDate)}</span> : null}
            <Link className="chip chip-link" href={`/trips/${trip.slug}/summary`}>
              Trip Summary
            </Link>
            {canEdit ? (
              <Link className="chip chip-link" href={`/trips/${trip.slug}/batch-activities`}>
                Batch Add Activities
              </Link>
            ) : null}
          </div>
        </section>

        <div className="sidebar-mode-toggle">
          <button className={sidebarView === "days" ? "button" : "button-secondary"} type="button" onClick={() => setSidebarView("days")}>
            Days
          </button>
          <button className={sidebarView === "calendar" ? "button" : "button-secondary"} type="button" onClick={() => setSidebarView("calendar")}>
            Calendar
          </button>
          <button className="button-secondary mobile-only" type="button" onClick={() => setPhoneSidebarOpen(false)}>
            Close
          </button>
        </div>

        {sidebarView === "calendar" ? (
          <CalendarView
            monthIso={calendarMonth}
            days={normalizedDays}
            events={stayEvents}
            selectedDayNumber={selectedDay.dayNumber}
            onSelectDay={selectDay}
            onShiftMonth={shiftCalendarMonth}
            canGoPrev={canGoPrev}
            canGoNext={canGoNext}
            showMonthNavigation={showCalendarNavigation}
            variant="compact"
          />
        ) : (
          <section className="trip-day-list">
            {normalizedDays.map((day) => (
              <button key={day.id} className={day.dayNumber === selectedDay.dayNumber ? "day-card active" : "day-card"} onClick={() => selectDay(day.dayNumber)}>
                <strong>
                  Day {day.dayNumber}: {day.title}
                </strong>
                <span>{formatShortDate(day.date)}</span>
                <span>
                  {day.miles ? `${day.miles} miles` : "Stay put"}
                  {day.durationSeconds ? ` · ${formatDriveTime(day.durationSeconds)}` : ""}
                  {" · "}
                  {day.locations.map((location) => location.place.name).join(" · ")}
                </span>
              </button>
            ))}
          </section>
        )}
      </aside>

      <section
        className={
          viewMode === "calendar"
            ? "panel trip-main calendar-mode"
            : viewMode === "locations" || viewMode === "hotdogs"
              ? "panel trip-main directory-mode"
              : "panel trip-main"
        }
      >
        <div className="phone-summary-trigger mobile-only">
          <button className="button-secondary" type="button" onClick={() => setPhoneSidebarOpen(true)}>
            Trip Overview
          </button>
          <span className="phone-summary-day-label">Day {selectedDay.dayNumber}</span>
        </div>
        <div
          className={
            viewMode === "calendar"
              ? "trip-map-wrap calendar-mode"
              : viewMode === "locations" || viewMode === "hotdogs"
                ? "trip-map-wrap directory-mode"
                : "trip-map-wrap"
          }
        >
          <div className="trip-stage-toolbar">
            <div className="inline-actions trip-stage-controls desktop-only">
              <button className={viewMode === "map" ? "button" : "button-secondary"} type="button" onClick={() => setViewMode("map")}>
                Map
              </button>
              <button className={viewMode === "calendar" ? "button" : "button-secondary"} type="button" onClick={() => setViewMode("calendar")}>
                Calendar
              </button>
              <button className={viewMode === "locations" ? "button" : "button-secondary"} type="button" onClick={() => setViewMode("locations")}>
                Locations
              </button>
              <button className={viewMode === "hotdogs" ? "button hotdog-view-button" : "button-secondary hotdog-view-button"} type="button" onClick={() => setViewMode("hotdogs")}>
                <img src="/hot_dog.png" alt="" aria-hidden className="hotdog-toolbar-icon" />
                <span>Hot Dogs</span>
              </button>
            </div>
            <div className="phone-stage-selector mobile-only">
              <select
                aria-label="View mode"
                className="toolbar-add-stop-kind"
                value={viewMode}
                onChange={(event) => setViewMode(event.target.value as typeof viewMode)}
              >
                <option value="map">Map</option>
                <option value="calendar">Calendar</option>
                <option value="locations">Locations</option>
                <option value="hotdogs">Hot Dogs</option>
              </select>
            </div>
            <div className="day-stepper day-stepper-toolbar">
              {canEdit ? (
                <button
                  className={editMode ? "button icon-button" : "button-secondary icon-button"}
                  type="button"
                  onClick={() => setEditMode((value) => !value)}
                  title={editMode ? "Lock editing" : "Unlock editing"}
                  aria-label={editMode ? "Lock editing" : "Unlock editing"}
                >
                  <FontAwesomeIcon icon={editMode ? faLockOpen : faLock} />
                </button>
              ) : null}
              <button className="button-secondary" type="button" disabled={!previousDay} onClick={() => previousDay && selectDay(previousDay.dayNumber)}>
                Previous Day
              </button>
              <button className="button-secondary" type="button" disabled={!nextDay} onClick={() => nextDay && selectDay(nextDay.dayNumber)}>
                Next Day
              </button>
            </div>
          </div>
          <div className="toolbar-stack">
            <form action={handleSearchSubmit} className="toolbar-add-stop place-search-form">
              <input type="hidden" name="tripId" value={trip.id} />
              <input type="hidden" name="slug" value={trip.slug} />
              <input type="hidden" name="selectedDayNumber" value={selectedDay.dayNumber} />
              <input type="hidden" name="mapUrl" value="" />
              <input type="hidden" name="placeId" value={selectedSuggestion?.placeId ?? ""} />
              <input
                name="search"
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search..."
                className="toolbar-add-stop-url"
                autoComplete="off"
              />
              <select name="kind" defaultValue="activity" className="toolbar-add-stop-kind" aria-label="Entry type">
                <option value="location">Location</option>
                <option value="activity">Activity</option>
                <option value="dinner">Dinner</option>
              </select>
              <input type="hidden" name="note" value="" />
              <button className="button" type="submit">
                Add
              </button>
              {searchResults.length ? (
                <div className="search-suggestions">
                  {searchResults.map((suggestion) => (
                    <button
                      key={suggestion.placeId}
                      type="button"
                      className={selectedSuggestion?.placeId === suggestion.placeId ? "search-suggestion active" : "search-suggestion"}
                      onClick={() => {
                        setSelectedSuggestion(suggestion);
                        setSearchQuery(suggestion.text);
                        setSearchResults([]);
                      }}
                    >
                      <strong>{suggestion.text}</strong>
                      {suggestion.secondaryText ? <span>{suggestion.secondaryText}</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
              {searchError ? <p className="form-error toolbar-inline-error">{searchError}</p> : null}
            </form>
          </div>
          {flash ? <p className={flash.type === "error" ? "form-error toolbar-flash" : "form-success toolbar-flash"}>{flash.message}</p> : null}

          {viewMode === "map" ? (
            <div className={mapExpanded ? "map-container map-expanded" : "map-container"}>
              {mapExpanded ? <div className="map-overlay-backdrop" onClick={() => setMapExpanded(false)} /> : null}
              <div className="map-container-inner">
                <button
                  type="button"
                  className="map-expand-button"
                  onClick={() => setMapExpanded((v) => !v)}
                  title={mapExpanded ? "Collapse map" : "Expand map"}
                  aria-label={mapExpanded ? "Collapse map" : "Expand map"}
                >
                  {mapExpanded ? "✕" : "⤢"}
                </button>
                <TripMap
                  key={mapExpanded ? "expanded" : "inline"}
                  days={normalizedDays}
                  hotDogPlaces={trip.hotDogPlaces}
                  selectedDayNumber={selectedDay.dayNumber}
                  currentDayNumber={progress.currentDayNumber ?? selectedDay.dayNumber}
                  onSelectDay={selectDay}
                />
                <div className="trip-legend">
                  <span>
                    <i className="line" /> selected route
                  </span>
                  <span>
                    <i className="dot current" /> current day
                  </span>
                  <span>
                    <i className="dot activity" /> activity
                  </span>
                  <span>
                    <i className="dot live" /> your location
                  </span>
                </div>
                {mapExpanded ? (
                  <div className="map-expanded-nav">
                    <div className="day-stepper">
                      <button className="button-secondary" type="button" disabled={!previousDay} onClick={() => previousDay && selectDay(previousDay.dayNumber)}>
                        Previous Day
                      </button>
                      <span className="map-expanded-day-label">Day {selectedDay.dayNumber}: {selectedDay.title}</span>
                      <button className="button-secondary" type="button" disabled={!nextDay} onClick={() => nextDay && selectDay(nextDay.dayNumber)}>
                        Next Day
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : viewMode === "calendar" ? (
            <CalendarView
              monthIso={calendarMonth}
              days={normalizedDays}
              events={stayEvents}
              selectedDayNumber={selectedDay.dayNumber}
              onSelectDay={selectDay}
              onShiftMonth={shiftCalendarMonth}
              canGoPrev={canGoPrev}
              canGoNext={canGoNext}
              showMonthNavigation={showCalendarNavigation}
              variant="full"
            />
          ) : viewMode === "locations" ? (
            <section className="section-card stage-directory">
              <div className="trip-calendar-header">
                <div>
                  <p className="eyebrow">Locations</p>
                  <h2>All itinerary locations</h2>
                </div>
                <Link className="button-secondary" href={`/trips/${trip.slug}/locations`}>
                  Open full list
                </Link>
              </div>
              <div className="directory-groups">
                {normalizedDays.map((day) => (
                  <article key={day.id} className={day.dayNumber === selectedDay.dayNumber ? "directory-card selected" : "directory-card"}>
                    <button type="button" className="directory-card-header" onClick={() => selectDay(day.dayNumber)}>
                      <strong>Day {day.dayNumber}</strong>
                      <span>{formatShortDate(day.date)}</span>
                    </button>
                    <ul className="directory-list">
                      {day.locations.map((location) => (
                        <li key={location.id}>
                          <a href={buildStopSearchUrl(location.place.name, location.place.name)} target="_blank" rel="noreferrer">
                            {location.place.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <section className="section-card stage-directory">
              <div className="trip-calendar-header">
                <div>
                  <p className="eyebrow">Hot Dogs</p>
                  <h2>Hot dog spots along the route</h2>
                </div>
                <span className="chip">{trip.hotDogPlaces.length} stops</span>
              </div>
              <div className="directory-groups hotdog-groups">
                {hotDogsByDay.filter((group) => group.places.length).map((group) => (
                  <article key={group.dayNumber} className={group.dayNumber === selectedDay.dayNumber ? "directory-card selected" : "directory-card"}>
                    <button type="button" className="directory-card-header" onClick={() => selectDay(group.dayNumber)}>
                      <strong>Day {group.dayNumber}</strong>
                      <span>{formatShortDate(group.date)}</span>
                    </button>
                    <p className="directory-card-title">{group.title}</p>
                    <ul className="directory-list hotdog-list">
                      {group.places.map((place) => (
                        <li key={place.id}>
                          <img src="/hot_dog.png" alt="" aria-hidden className="hotdog-inline-icon" />
                          <div>
                            <strong>{place.name}</strong>
                            {place.address ? <span>{place.address}</span> : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>

        {sidebarCollapsed ? (
          <button
            className="sidebar-handle sidebar-handle-restore"
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        ) : null}

        <div className="trip-detail">
          <article className="section-card">
            <p className="eyebrow">Day {selectedDay.dayNumber} · {formatDateLabel(selectedDay.date)}</p>
            <InlineEditableText canEdit={editable} label="day title" value={selectedDay.title} action={updateDayAction} hiddenFields={dayHidden} field="title" className="trip-heading-edit" />
            <div className="chip-row">
              <span className="chip">{selectedDay.type === "travel" ? "Travel day" : "Basecamp day"}</span>
              <span className="chip">{selectedDay.miles ? `${selectedDay.miles} miles` : "No long-haul mileage"}</span>
              {selectedDay.durationSeconds ? <span className="chip">{formatDriveTime(selectedDay.durationSeconds)}</span> : null}
              <span className="chip">{selectedDay.locations.length} location{selectedDay.locations.length === 1 ? "" : "s"}</span>
            </div>
            <InlineEditableText
              canEdit={editable}
              label="day summary"
              value={selectedDay.summary}
              action={updateDayAction}
              hiddenFields={dayHidden}
              field="summary"
              multiline
              className="trip-summary"
            />
            <InlineEditableText
              canEdit={editable}
              label="callout"
              value={selectedDay.callout}
              action={updateDayAction}
              hiddenFields={dayHidden}
              field="callout"
              multiline
              className="trip-callout"
            />

            {selectedDay.accommodationName || editable || activities.length || dinners.length ? (
              <div className="day-stops-highlight">
                {selectedDay.accommodationName || editable ? (
                  <div className="day-stop-group">
                    <h3>Staying at</h3>
                    <ul className="day-stop-cards">
                      <li className="day-stop-card">
                        <InlineEditableText
                          canEdit={editable}
                          label="accommodation name"
                          value={selectedDay.accommodationName}
                          action={updateDayAction}
                          hiddenFields={dayHidden}
                          field="accommodationName"
                          className="day-stop-name"
                          placeholder="No campground was specified for this day."
                          display={
                            selectedDay.accommodationName ? (
                              <a href={buildStopSearchUrl(selectedDay.accommodationName, locationContext)} target="_blank" rel="noreferrer">
                                {selectedDay.accommodationName}
                              </a>
                            ) : undefined
                          }
                        />
                        {selectedDay.accommodationName ? (
                          <InlineEditableText
                            canEdit={editable}
                            label="accommodation description"
                            value={selectedDay.accommodationDescription}
                            action={updateDayAction}
                            hiddenFields={dayHidden}
                            field="accommodationDescription"
                            multiline
                            className="day-stop-note"
                            placeholder="No campground details."
                          />
                        ) : null}
                      </li>
                    </ul>
                  </div>
                ) : null}
                {activities.length ? (
                  <div className="day-stop-group">
                    <h3>Activities</h3>
                    <ul className="day-stop-cards">
                      {activities.map((item) => (
                        <li key={item.id} className="day-stop-card">
                          <div className="inline-item-header">
                            <InlineEditableText
                              canEdit={editable}
                              label="activity name"
                              value={item.name}
                              action={updateStopAction}
                              hiddenFields={{ slug: trip.slug, stopId: item.id, selectedDayNumber: selectedDay.dayNumber }}
                              field="name"
                              className="day-stop-name"
                              display={
                                <a
                                  href={
                                    item.sourceUrl ||
                                    buildPlaceLookupUrl({
                                      name: item.placeName || item.name,
                                      regionLabel: item.placeRegionLabel,
                                      latitude: item.latitude,
                                      longitude: item.longitude
                                    })
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {item.name}
                                </a>
                              }
                            />
                            {editable ? (
                              <DeleteInlineButton
                                action={deleteStopAction}
                                hiddenFields={{ slug: trip.slug, stopId: item.id, selectedDayNumber: selectedDay.dayNumber }}
                                confirmMessage={`Remove activity ${item.name}?`}
                              />
                            ) : null}
                          </div>
                          <InlineEditableText
                            canEdit={editable}
                            label="activity note"
                            value={item.note}
                            action={updateStopAction}
                            hiddenFields={{ slug: trip.slug, stopId: item.id, selectedDayNumber: selectedDay.dayNumber }}
                            field="note"
                            multiline
                            className="day-stop-note"
                            placeholder="No note."
                          />
                          <div className="day-stop-distance-row">
                            <span className="chip">Detour: {formatDistanceLabel(item.detourMiles)}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {dinners.length ? (
                  <div className="day-stop-group">
                    <h3>Dinner</h3>
                    <ul className="day-stop-cards">
                      {dinners.map((item) => (
                        <li key={item.id} className="day-stop-card">
                          <InlineEditableText
                            canEdit={editable}
                            label="dinner name"
                            value={item.name}
                            action={updateStopAction}
                            hiddenFields={{ slug: trip.slug, stopId: item.id, selectedDayNumber: selectedDay.dayNumber }}
                            field="name"
                            className="day-stop-name"
                            display={
                              <a
                                href={
                                  item.sourceUrl ||
                                  buildPlaceLookupUrl({
                                    name: item.placeName || item.name,
                                    regionLabel: item.placeRegionLabel,
                                    latitude: item.latitude,
                                    longitude: item.longitude
                                  })
                                }
                                target="_blank"
                                rel="noreferrer"
                              >
                                {item.name}
                              </a>
                            }
                          />
                          <InlineEditableText
                            canEdit={editable}
                            label="dinner note"
                            value={item.note}
                            action={updateStopAction}
                            hiddenFields={{ slug: trip.slug, stopId: item.id, selectedDayNumber: selectedDay.dayNumber }}
                            field="note"
                            multiline
                            className="day-stop-note"
                            placeholder="No note."
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>

          <article className="section-card stack">
            <div>
              <h3>Locations</h3>
              <LocationList
                locations={selectedDay.locations}
                tripId={trip.id}
                slug={trip.slug}
                editable={editable}
                selectedDayNumber={selectedDay.dayNumber}
                updateLocationAction={updateLocationAction}
                deleteLocationAction={deleteLocationAction}
              />
            </div>

            <div>
              <h3>Photos</h3>
              {canEdit ? (
                <form action={uploadTripPhotoAction} className="photo-upload-form">
                  <input type="hidden" name="tripId" value={trip.id} />
                  <input type="hidden" name="slug" value={trip.slug} />
                  <input type="hidden" name="selectedDayNumber" value={selectedDay.dayNumber} />
                  <PhotoUploadControl />
                </form>
              ) : null}
              {selectedDay.photos.length ? (
                <div className="photo-grid">
                  {selectedDay.photos.map((photo) => (
                    <figure key={photo.id} className="photo-card">
                      {editable ? (
                        <div className="photo-card-actions">
                          <DeleteInlineButton
                            action={deletePhotoAction}
                            hiddenFields={{ slug: trip.slug, photoId: photo.id, selectedDayNumber: selectedDay.dayNumber }}
                            confirmMessage={`Delete photo ${photo.originalFilename}?`}
                          />
                        </div>
                      ) : null}
                      <button type="button" className="photo-card-button" onClick={() => setSelectedPhoto(photo)}>
                        {isVideoMedia(photo) ? (
                          <video className="photo-card-media" src={photo.filePath} muted playsInline preload="metadata" />
                        ) : (
                          <img className="photo-card-media" src={photo.filePath} alt={photo.originalFilename} />
                        )}
                      </button>
                      <figcaption>
                        <strong>{photo.originalFilename}</strong>
                        {photo.capturedAt ? <span>{formatShortDate(photo.capturedAt)}</span> : null}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <p className="muted">No photos uploaded for this day yet.</p>
              )}
            </div>
          </article>
        </div>
      </section>
      {selectedPhoto ? (
        <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label={selectedPhoto.originalFilename}>
          <button className="photo-lightbox-backdrop" type="button" onClick={() => setSelectedPhoto(null)} aria-label="Close photo viewer" />
          <div className="photo-lightbox-panel">
            <div className="photo-lightbox-toolbar">
              <div className="photo-lightbox-meta">
                <strong>{selectedPhoto.originalFilename}</strong>
                {selectedPhoto.capturedAt ? <span>{formatShortDate(selectedPhoto.capturedAt)}</span> : null}
              </div>
              <div className="inline-actions">
                <button className="button-secondary icon-button" type="button" onClick={() => handleSharePhoto(selectedPhoto)} aria-label="Share photo" title="Share photo">
                  <FontAwesomeIcon icon={faShareNodes} />
                </button>
                <a className="button-secondary" href={selectedPhoto.filePath} download={selectedPhoto.originalFilename}>
                  Download
                </a>
                <button className="button-secondary icon-button" type="button" onClick={() => setSelectedPhoto(null)} aria-label="Close photo viewer" title="Close photo viewer">
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>
            </div>
            <div className="photo-lightbox-image-wrap">
              {isVideoMedia(selectedPhoto) ? (
                <video className="photo-lightbox-image" src={selectedPhoto.filePath} controls playsInline preload="metadata" />
              ) : (
                <img className="photo-lightbox-image" src={selectedPhoto.filePath} alt={selectedPhoto.originalFilename} />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
