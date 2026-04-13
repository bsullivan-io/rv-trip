"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAnglesLeft, faExpand, faShareNodes, faXmark } from "@fortawesome/free-solid-svg-icons";
import { TripMap } from "@/components/public/trip-map";
import { TripStageTabs } from "@/components/public/trip-stage-tabs";
import { useEditMode } from "@/components/ui/edit-mode";
import { formatDateLabel, formatMonthLabel, formatShortDate } from "@/lib/dates";
import { buildPlaceLookupUrl, buildStopSearchUrl } from "@/lib/map-links";
import { deriveTripProgress } from "@/lib/trip-progress";
import { resolveTrackerPointLabel } from "@/lib/tracker-labels";
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

type TripMedia = {
  id: string;
  filePath: string;
  originalFilename: string;
  title: string | null;
  caption: string | null;
  mimeType: string | null;
  capturedAt: string | null;
};

type TripPhoto = TripMedia;

type TripPostMedia = TripMedia;

type TripPost = {
  id: string;
  title: string;
  body: string;
  author: string | null;
  createdAt: string;
  media: TripPostMedia[];
};

type TripTrackerPoint = {
  id: string;
  tripDayId: string | null;
  latitude: number;
  longitude: number;
  recordedAt: string;
  source: "auto" | "checkin";
  note: string | null;
  author: string | null;
  cityName: string | null;
  stateCode: string | null;
  stateName: string | null;
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
  posts: TripPost[];
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
    trackPoints: TripTrackerPoint[];
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
  initialViewMode: "map" | "calendar" | "locations" | "hotdogs";
  canEdit: boolean;
  loginUrl: string;
  addStopAction: (formData: FormData) => Promise<void>;
  addPlaceSearchAction: (formData: FormData) => Promise<void>;
  uploadTripPhotoAction: (formData: FormData) => Promise<void>;
  createPostAction: (formData: FormData) => Promise<void>;
  updatePostAction: (formData: FormData) => Promise<void>;
  deletePostAction: (formData: FormData) => Promise<void>;
  uploadPostMediaAction: (formData: FormData) => Promise<void>;
  updatePostMediaAction: (formData: FormData) => Promise<void>;
  deletePostMediaAction: (formData: FormData) => Promise<void>;
  updateTripAction: (formData: FormData) => Promise<void>;
  updateDayAction: (formData: FormData) => Promise<void>;
  updateLocationAction: (formData: FormData) => Promise<void>;
  updateStopAction: (formData: FormData) => Promise<void>;
  updatePhotoAction: (formData: FormData) => Promise<void>;
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

function formatTrackerTime(date: string | null) {
  if (!date) {
    return "Time unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(date));
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
  const allWeeks = buildCalendarWeeks(monthIso, days, events);
  const weeks = allWeeks;

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

function MediaUploadControl({
  inputName = "photo",
  hint = "Choose a photo or video to upload immediately.",
  multiple = false
}: {
  inputName?: string;
  hint?: string;
  multiple?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <div className="photo-upload-control">
      <input
        type="file"
        name={inputName}
        accept="image/*,video/*"
        required
        multiple={multiple}
        disabled={pending}
        onChange={(event) => {
          if (event.currentTarget.files?.length) {
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <span className="muted photo-upload-hint">{pending ? "Uploading..." : hint}</span>
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
  initialViewMode,
  canEdit,
  loginUrl,
  addStopAction,
  addPlaceSearchAction,
  uploadTripPhotoAction,
  createPostAction,
  updatePostAction,
  deletePostAction,
  uploadPostMediaAction,
  updatePostMediaAction,
  deletePostMediaAction,
  updateTripAction,
  updateDayAction,
  updateLocationAction,
  updateStopAction,
  updatePhotoAction,
  deleteLocationAction,
  deleteStopAction,
  deletePhotoAction
}: TripViewerProps) {
  const normalizedDays = useMemo(() => trip.days.map((day) => ({
    ...day,
    locations: day.locations.length ? day.locations : [{ id: `${day.id}-fallback-location`, sortOrder: 1, note: null, place: day.endPlace }]
  })), [trip.days]);
  const progress = deriveTripProgress(normalizedDays, initialSelectedDayNumber || null);
  const { isUnlocked, showHotDogs, setShowHotDogs, author, setAuthor } = useEditMode();
  const [selectedDayNumber, setSelectedDayNumber] = useState(progress.selectedDayNumber);
  const [viewMode, setViewMode] = useState<"map" | "calendar" | "locations" | "hotdogs" | "tracker">(initialViewMode);
  const [trackerCenter, setTrackerCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<TripMedia | null>(null);
  const mediaUrlSyncReady = useRef(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [phoneSidebarOpen, setPhoneSidebarOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState<"days" | "calendar">("days");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceSuggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<PlaceSuggestion | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [trackerPoints, setTrackerPoints] = useState(trip.trackPoints);
  const [checkInNote, setCheckInNote] = useState("");
  const [checkInPending, setCheckInPending] = useState(false);
  const [trackerFlash, setTrackerFlash] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const selectedDay = normalizedDays.find((day) => day.dayNumber === selectedDayNumber) ?? normalizedDays[0];
  const editable = canEdit && isUnlocked;
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
    if (!selectedMedia) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedMedia(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedMedia]);

  // Sync ?media= param with open/closed state (skip on initial render)
  useEffect(() => {
    if (!mediaUrlSyncReady.current) return;
    const params = new URLSearchParams(window.location.search);
    if (selectedMedia) {
      params.set("media", selectedMedia.id);
      history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    } else if (params.has("media")) {
      params.delete("media");
      const search = params.toString();
      history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
    }
  }, [selectedMedia]);

  // Auto-open modal from ?media= on mount
  useEffect(() => {
    mediaUrlSyncReady.current = true;
    const mediaId = new URLSearchParams(window.location.search).get("media");
    if (!mediaId) return;
    const allMedia = trip.days.flatMap((d) => [...d.photos, ...d.posts.flatMap((p) => p.media)]);
    const found = allMedia.find((m) => m.id === mediaId);
    if (found) setSelectedMedia(found);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function handleSharePhoto(photo: TripMedia) {
    const shareUrl = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({
          title: photo.title ?? photo.originalFilename,
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
      window.alert("Link copied to clipboard.");
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
  const selectedDayCheckIns = (() => {
    const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
    const candidates = trackerPoints
      .filter((point) => point.tripDayId === selectedDay.id && (point.source === "checkin" || Boolean(point.note)))
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    let lastAutoTime = -Infinity;
    return candidates
      .filter((point) => {
        if (point.source === "checkin") return true;
        const t = new Date(point.recordedAt).getTime();
        if (t - lastAutoTime >= FIFTEEN_MINUTES_MS) {
          lastAutoTime = t;
          return true;
        }
        return false;
      })
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  })();
  const trackerCandidates = [
    ...selectedDay.locations.map((location) => ({
      name: location.place.name,
      latitude: location.place.latitude,
      longitude: location.place.longitude
    })),
    ...selectedDay.stops
      .filter((stop) => stop.latitude != null && stop.longitude != null)
      .map((stop) => ({
        name: stop.name,
        latitude: stop.latitude as number,
        longitude: stop.longitude as number
      }))
  ];
  const selectDay = useCallback((dayNumber: number) => {
    setSelectedDayNumber(dayNumber);
    setPhoneSidebarOpen(false);
  }, []);

  async function handleManualCheckIn() {
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setTrackerFlash({
        type: "error",
        message: "Check-ins on iPhone/iPad require HTTPS when testing over your local network."
      });
      return;
    }

    if (!navigator.geolocation) {
      setTrackerFlash({ type: "error", message: "Geolocation is unavailable on this device." });
      return;
    }

    setCheckInPending(true);
    setTrackerFlash(null);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        });
      });

      const response = await fetch("/api/tracker", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tripSlug: trip.slug,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          source: "checkin",
          note: checkInNote.trim() || null,
          author: author || null
        })
      });

      const payload = (await response.json()) as {
        error?: string;
        point?: TripTrackerPoint;
      };

      if (!response.ok || !payload.point) {
        throw new Error(payload.error || "Could not save that check-in.");
      }

      const point = payload.point;
      setTrackerPoints((current) => [...current, point].sort((left, right) => right.recordedAt.localeCompare(left.recordedAt)));
      setCheckInNote("");
      setTrackerFlash({ type: "success", message: "Check-in saved." });
    } catch (error) {
      setTrackerFlash({ type: "error", message: error instanceof Error ? error.message : "Could not save that check-in." });
    } finally {
      setCheckInPending(false);
    }
  }

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
          <FontAwesomeIcon icon={faAnglesLeft} />
        </button>
        <section className="trip-header">
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
        <div className="sidebar-summary-link">
          <Link href={`/trips/${trip.slug}/summary`}>Trip Summary</Link>
        </div>
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
            <TripStageTabs
            slug={trip.slug}
            value={viewMode}
            onSelectLocal={(next) => {
              if (next !== "tracker") setTrackerCenter(null);
              setViewMode(next);
            }}
            onTabClick={(next) => {
              if (next === "tracker") {
                const latest = trackerPoints.reduce<TripTrackerPoint | null>(
                  (max, p) => (!max || p.recordedAt > max.recordedAt ? p : max),
                  null
                );
                setTrackerCenter(latest ? { lat: latest.latitude, lng: latest.longitude } : null);
              }
            }}
            showHotDogs={showHotDogs}
            className="trip-stage-tabs-wrap"
          />
            <div className="day-stepper day-stepper-toolbar">
              <button className="button-secondary phone-menu-btn" type="button" onClick={() => setPhoneSidebarOpen(true)}>
                Menu
              </button>
              <button className="button-secondary" type="button" disabled={!previousDay} onClick={() => previousDay && selectDay(previousDay.dayNumber)}>
                Previous Day
              </button>
              <button className="button-secondary" type="button" disabled={!nextDay} onClick={() => nextDay && selectDay(nextDay.dayNumber)}>
                Next Day
              </button>
            </div>
          </div>
          {editable ? <div className="toolbar-stack">
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
            {canEdit ? (
              <div className="toolbar-checkin-form">
                <input
                  type="text"
                  value={checkInNote}
                  onChange={(event) => setCheckInNote(event.target.value)}
                  placeholder="Check-in note (optional)"
                  className="toolbar-add-stop-url"
                />
                <button className="button-secondary" type="button" disabled={checkInPending} onClick={() => void handleManualCheckIn()}>
                  {checkInPending ? "Checking in..." : "Check In"}
                </button>
              </div>
            ) : null}
            <label className="toolbar-toggle">
              <input type="checkbox" checked={showHotDogs} onChange={(e) => setShowHotDogs(e.target.checked)} />
              Show Hot Dogs
            </label>
            <div className="toolbar-toggle">
              <label htmlFor="post-as-select">Post as</label>
              <select
                id="post-as-select"
                className="toolbar-author-select"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              >
                <option value="">— select —</option>
                <option value="Brian">Brian</option>
                <option value="Mark">Mark</option>
              </select>
            </div>
          </div> : null}
          {flash ? <p className={flash.type === "error" ? "form-error toolbar-flash" : "form-success toolbar-flash"}>{flash.message}</p> : null}
          {trackerFlash ? <p className={trackerFlash.type === "error" ? "form-error toolbar-flash" : "form-success toolbar-flash"}>{trackerFlash.message}</p> : null}

          {viewMode === "map" || viewMode === "tracker" ? (
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
                  hotDogPlaces={showHotDogs ? trip.hotDogPlaces : []}
                  trackPoints={trackerPoints}
                  centerOn={trackerCenter}
                  selectedDayNumber={selectedDay.dayNumber}
                  currentDayNumber={progress.currentDayNumber ?? selectedDay.dayNumber}
                  onSelectDay={selectDay}
                  canEdit={canEdit}
                />
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
            <FontAwesomeIcon icon={faExpand} />
          </button>
        ) : null}

        <div className="trip-detail">
          <article className="section-card">
            <p className="eyebrow">Day {selectedDay.dayNumber} · {formatDateLabel(selectedDay.date)}</p>
            <InlineEditableText canEdit={editable} label="day title" value={selectedDay.title} action={updateDayAction} hiddenFields={dayHidden} field="title" className="trip-heading-edit" />
            <div className="chip-row">
{selectedDay.miles ? <span className="chip">{selectedDay.miles} miles</span> : null}
              {selectedDay.durationSeconds ? <span className="chip">{formatDriveTime(selectedDay.durationSeconds)}</span> : null}
              <span className="chip">{selectedDay.locations.length} location{selectedDay.locations.length === 1 ? "" : "s"}</span>
            </div>
            {selectedDay.posts.length || editable ? (
              <div className="day-posts-primary">
                <div className="day-posts-primary-header">
                  <p className="eyebrow">Posts</p>
                </div>
                {editable ? (
                  <form action={createPostAction} className="tracker-inline-form tracker-post-create-form">
                    <input type="hidden" name="slug" value={trip.slug} />
                    <input type="hidden" name="dayId" value={selectedDay.id} />
                    <input type="hidden" name="selectedDayNumber" value={selectedDay.dayNumber} />
                    <input type="hidden" name="author" value={author} />
                    <input className="tracker-inline-input" name="title" placeholder="Post title" />
                    <textarea className="tracker-inline-input tracker-inline-textarea" name="body" rows={3} placeholder="Write the post..." />
                    <button className="button-secondary tracker-inline-save" type="submit">
                      Add post
                    </button>
                  </form>
                ) : null}
                {selectedDay.posts.length ? (
                  <div className="day-posts-primary-list">
                    {selectedDay.posts.map((post) => (
                      <article key={post.id} className="day-post-primary-card">
                        <div className="inline-item-header">
                          <InlineEditableText
                            canEdit={editable}
                            label="post title"
                            value={post.title}
                            action={updatePostAction}
                            hiddenFields={{ slug: trip.slug, postId: post.id, selectedDayNumber: selectedDay.dayNumber }}
                            field="title"
                            className="day-post-primary-title"
                          />
                          <div className="tracker-checkin-meta">
                            <span>{formatShortDate(post.createdAt)}</span>
                            <span>{formatTrackerTime(post.createdAt)}</span>
                          </div>
                          {post.author ? <span className="day-post-author">by {post.author}</span> : null}
                          {editable ? (
                            <InlineEditableText
                              canEdit={editable}
                              label="post author"
                              value={post.author ?? ""}
                              action={updatePostAction}
                              hiddenFields={{ slug: trip.slug, postId: post.id, selectedDayNumber: selectedDay.dayNumber }}
                              field="author"
                              className="day-post-author-edit"
                              placeholder="No author."
                            />
                          ) : null}
                          {editable ? (
                            <DeleteInlineButton
                              action={deletePostAction}
                              hiddenFields={{ slug: trip.slug, postId: post.id, selectedDayNumber: selectedDay.dayNumber }}
                              confirmMessage={`Delete post "${post.title}"?`}
                            />
                          ) : null}
                        </div>
                        <InlineEditableText
                          canEdit={editable}
                          label="post body"
                          value={post.body}
                          action={updatePostAction}
                          hiddenFields={{ slug: trip.slug, postId: post.id, selectedDayNumber: selectedDay.dayNumber }}
                          field="body"
                          multiline
                          className="day-post-primary-body"
                          placeholder="No post text."
                        />
                        {editable ? (
                          <form action={uploadPostMediaAction} className="photo-upload-form post-media-upload-form">
                            <input type="hidden" name="slug" value={trip.slug} />
                            <input type="hidden" name="postId" value={post.id} />
                            <input type="hidden" name="selectedDayNumber" value={selectedDay.dayNumber} />
                            <MediaUploadControl
                              inputName="media"
                              multiple
                              hint="Attach photos or videos to this post."
                            />
                          </form>
                        ) : null}
                        {post.media.length ? (
                          <div className="photo-grid post-media-grid">
                            {post.media.map((media) => {
                              const mediaTitle = media.title ?? `Day ${selectedDay.dayNumber} - ${selectedDay.endPlace.name}`;
                              return (
                                <figure key={media.id} className="photo-card">
                                  {editable ? (
                                    <div className="photo-card-actions">
                                      <DeleteInlineButton
                                        action={deletePostMediaAction}
                                        hiddenFields={{ slug: trip.slug, mediaId: media.id, selectedDayNumber: selectedDay.dayNumber }}
                                        confirmMessage={`Delete ${media.originalFilename}?`}
                                      />
                                    </div>
                                  ) : null}
                                  <button type="button" className="photo-card-button" onClick={() => setSelectedMedia(media)}>
                                    {isVideoMedia(media) ? (
                                      <video className="photo-card-media" src={media.filePath} muted playsInline preload="metadata" />
                                    ) : (
                                      <img className="photo-card-media" src={media.filePath} alt={media.originalFilename} />
                                    )}
                                  </button>
                                  <figcaption>
                                    <InlineEditableText
                                      canEdit={editable}
                                      label="media title"
                                      value={media.title}
                                      action={updatePostMediaAction}
                                      hiddenFields={{ slug: trip.slug, mediaId: media.id, selectedDayNumber: selectedDay.dayNumber }}
                                      field="title"
                                      className="day-stop-name"
                                      placeholder={mediaTitle}
                                    />
                                    <InlineEditableText
                                      canEdit={editable}
                                      label="media caption"
                                      value={media.caption}
                                      action={updatePostMediaAction}
                                      hiddenFields={{ slug: trip.slug, mediaId: media.id, selectedDayNumber: selectedDay.dayNumber }}
                                      field="caption"
                                      multiline
                                      className="muted"
                                      placeholder="Add a caption."
                                    />
                                  </figcaption>
                                </figure>
                              );
                            })}
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No posts for this day yet.</p>
                )}
              </div>
            ) : null}

            {selectedDay.accommodationName || editable || activities.length || dinners.length ? (
              <div className="day-stops-highlight">
                {selectedDay.accommodationName || editable ? (
                  <div className="day-stop-group">
                    <h3>Staying at</h3>
                    <ul className="day-stop-cards">
                      <li className="day-stop-card day-stop-card-accent">
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
                {selectedDayCheckIns.length ? (
                  <div className="day-stop-group">
                    <h3>Check-Ins</h3>
                    <ul className="day-stop-cards">
                      {selectedDayCheckIns.map((item) => (
                        <li key={item.id} className="day-stop-card">
                          {item.note && (item.note.toLowerCase().includes("hot dog") || item.note.toLowerCase().includes("hotdog"))
                            ? <img src="/hot_dog.png" alt="" aria-hidden className="tracker-checkin-hotdog-icon" />
                            : <img src="/rv.png" alt="" aria-hidden className="tracker-checkin-rv-icon" />}
                          <div className="tracker-checkin-meta">
                            <strong>{resolveTrackerPointLabel(item, trackerCandidates)}</strong>
                            <span>{formatTrackerTime(item.recordedAt)}</span>
                          </div>
                          {item.author ? <p className="day-post-author">by {item.author}</p> : null}
                          {item.note ? <p className="day-stop-note">{item.note}</p> : null}
                          <div className="day-stop-distance-row">
                            {item.stateName ? <span className="chip">{item.stateName}</span> : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>

          {selectedDay.photos.length || canEdit ? (
            <article className="section-card">
              <h3>Photos</h3>
              {canEdit ? (
                <form action={uploadTripPhotoAction} className="photo-upload-form">
                  <input type="hidden" name="tripId" value={trip.id} />
                  <input type="hidden" name="slug" value={trip.slug} />
                  <input type="hidden" name="selectedDayNumber" value={selectedDay.dayNumber} />
                  <MediaUploadControl />
                </form>
              ) : null}
              {selectedDay.photos.length ? (
                <div className="photo-grid">
                  {selectedDay.photos.map((photo) => {
                    const photoTitle = photo.title ?? `Day ${selectedDay.dayNumber} - ${selectedDay.endPlace.name}`;

                    return (
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
                      <button type="button" className="photo-card-button" onClick={() => setSelectedMedia(photo)}>
                        {isVideoMedia(photo) ? (
                          <video className="photo-card-media" src={photo.filePath} muted playsInline preload="metadata" />
                        ) : (
                          <img className="photo-card-media" src={photo.filePath} alt={photo.originalFilename} />
                        )}
                      </button>
                      <figcaption>
                        <InlineEditableText
                          canEdit={editable}
                          label="photo title"
                          value={photo.title}
                          action={updatePhotoAction}
                          hiddenFields={{ slug: trip.slug, photoId: photo.id, selectedDayNumber: selectedDay.dayNumber }}
                          field="title"
                          className="day-stop-name"
                          placeholder={photoTitle}
                        />
                        <InlineEditableText
                          canEdit={editable}
                          label="photo caption"
                          value={photo.caption}
                          action={updatePhotoAction}
                          hiddenFields={{ slug: trip.slug, photoId: photo.id, selectedDayNumber: selectedDay.dayNumber }}
                          field="caption"
                          multiline
                          className="muted"
                          placeholder="Add a caption."
                        />
                        {photo.capturedAt ? <span>{formatShortDate(photo.capturedAt)}</span> : null}
                      </figcaption>
                      </figure>
                    );
                  })}
                </div>
              ) : (
                <p className="muted">No photos uploaded for this day yet.</p>
              )}
            </article>
          ) : null}

          <article className="section-card">
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
          </article>
        </div>
      </section>
      {selectedMedia ? (
        <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label={selectedMedia.originalFilename}>
          <button className="photo-lightbox-backdrop" type="button" onClick={() => setSelectedMedia(null)} aria-label="Close photo viewer" />
          <div className="photo-lightbox-panel">
            <div className="photo-lightbox-toolbar">
              <div className="photo-lightbox-meta">
                <strong>{selectedMedia.title ?? `Day ${selectedDay.dayNumber} - ${selectedDay.endPlace.name}`}</strong>
                {selectedMedia.caption ? <span>{selectedMedia.caption}</span> : null}
                {selectedMedia.capturedAt ? <span>{formatShortDate(selectedMedia.capturedAt)}</span> : null}
              </div>
              <div className="inline-actions">
                <button className="button-secondary icon-button" type="button" onClick={() => handleSharePhoto(selectedMedia)} aria-label="Share photo" title="Share photo">
                  <FontAwesomeIcon icon={faShareNodes} />
                </button>
                <button className="button-secondary icon-button" type="button" onClick={() => setSelectedMedia(null)} aria-label="Close photo viewer" title="Close photo viewer">
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>
            </div>
            <div className="photo-lightbox-image-wrap">
              {isVideoMedia(selectedMedia) ? (
                <video className="photo-lightbox-image" src={selectedMedia.filePath} controls playsInline preload="metadata" />
              ) : (
                <img className="photo-lightbox-image" src={selectedMedia.filePath} alt={selectedMedia.originalFilename} />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
