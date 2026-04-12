"use client";

import { useCallback, useRef, useState } from "react";
import { formatShortDate } from "@/lib/dates";

type LocationItem = {
  id: string;
  note: string | null;
  placeName: string;
};

type DayGroup = {
  dayId: string;
  dayNumber: number;
  date: string | null;
  title: string;
  locations: LocationItem[];
};

type LocationsEditorProps = {
  slug: string;
  days: DayGroup[];
  canEdit: boolean;
};

export function LocationsEditor({ slug, days: initialDays, canEdit }: LocationsEditorProps) {
  const [days, setDays] = useState(initialDays);
  const dayDragRef = useRef<number | null>(null);
  const locDragRef = useRef<{ dayIndex: number; locIndex: number } | null>(null);

  const persistDayOrder = useCallback(
    async (reorderedDays: DayGroup[]) => {
      await fetch("/api/reorder-days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, dayIds: reorderedDays.map((d) => d.dayId) })
      });
    },
    [slug]
  );

  const persistLocationOrder = useCallback(
    async (dayIndex: number, reorderedDays: DayGroup[]) => {
      const day = reorderedDays[dayIndex];
      await fetch("/api/reorder-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, locationIds: day.locations.map((l) => l.id) })
      });
    },
    [slug]
  );

  // Day drag handlers
  const handleDayDragStart = useCallback((dayIndex: number) => {
    dayDragRef.current = dayIndex;
    locDragRef.current = null;
  }, []);

  const handleDayDragOver = useCallback((event: React.DragEvent, dayIndex: number) => {
    if (locDragRef.current) return; // location drag in progress
    event.preventDefault();
    const from = dayDragRef.current;
    if (from === null || from === dayIndex) return;

    setDays((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(dayIndex, 0, moved);
      dayDragRef.current = dayIndex;
      return next;
    });
  }, []);

  const handleDayDrop = useCallback(() => {
    if (locDragRef.current) return;
    dayDragRef.current = null;
    setDays((current) => {
      persistDayOrder(current);
      return current;
    });
  }, [persistDayOrder]);

  // Location drag handlers
  const handleLocDragStart = useCallback((dayIndex: number, locIndex: number, event: React.DragEvent) => {
    event.stopPropagation();
    locDragRef.current = { dayIndex, locIndex };
    dayDragRef.current = null;
  }, []);

  const handleLocDragOver = useCallback((event: React.DragEvent, dayIndex: number, locIndex: number) => {
    if (!locDragRef.current) return;
    event.preventDefault();
    event.stopPropagation();

    const from = locDragRef.current;
    if (from.dayIndex === dayIndex && from.locIndex === locIndex) return;

    setDays((prev) => {
      const next = prev.map((d) => ({ ...d, locations: [...d.locations] }));
      const [moved] = next[from.dayIndex].locations.splice(from.locIndex, 1);
      next[dayIndex].locations.splice(locIndex, 0, moved);
      locDragRef.current = { dayIndex, locIndex };
      return next;
    });
  }, []);

  const handleLocDrop = useCallback(
    (event: React.DragEvent) => {
      event.stopPropagation();
      if (!locDragRef.current) return;
      const { dayIndex } = locDragRef.current;
      locDragRef.current = null;
      setDays((current) => {
        persistLocationOrder(dayIndex, current);
        return current;
      });
    },
    [persistLocationOrder]
  );

  const handleDragEnd = useCallback(() => {
    dayDragRef.current = null;
    locDragRef.current = null;
  }, []);

  return (
    <div className="locations-list">
      {days.map((day, dayIndex) => (
        <section
          key={day.dayId}
          className={canEdit ? "location-day-group draggable-day" : "location-day-group"}
          draggable={canEdit}
          onDragStart={() => handleDayDragStart(dayIndex)}
          onDragOver={(e) => handleDayDragOver(e, dayIndex)}
          onDrop={handleDayDrop}
          onDragEnd={handleDragEnd}
        >
          <div className="location-day-header">
            {canEdit ? <span className="drag-handle day-drag-handle" aria-hidden>⠿</span> : null}
            <div>
              <h2>Day {dayIndex + 1}: {day.title}</h2>
              <p className="muted">{formatShortDate(day.date)}</p>
            </div>
          </div>

          <div className="location-day-items">
            {day.locations.map((location, locIndex) => (
              <article
                key={location.id}
                className={canEdit ? "location-row draggable-location" : "location-row"}
                draggable={canEdit}
                onDragStart={(e) => handleLocDragStart(dayIndex, locIndex, e)}
                onDragOver={(e) => handleLocDragOver(e, dayIndex, locIndex)}
                onDrop={handleLocDrop}
                onDragEnd={handleDragEnd}
              >
                {canEdit ? <span className="drag-handle" aria-hidden>⠿</span> : null}
                <div>
                  <h3>{location.placeName}</h3>
                  {location.note ? <p className="muted">{location.note}</p> : null}
                </div>
              </article>
            ))}
            {!day.locations.length ? <p className="muted">No locations for this day.</p> : null}
          </div>
        </section>
      ))}
    </div>
  );
}
