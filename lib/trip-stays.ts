type TripStayLocation = {
  id: string;
  sortOrder: number;
  place: {
    id: string;
    name: string;
  };
};

type TripStayDay = {
  dayNumber: number;
  date: string | null;
  locations: TripStayLocation[];
};

export type StayEvent = {
  id: string;
  placeId: string;
  placeName: string;
  startDate: string;
  endExclusiveDate: string;
  startDayNumber: number;
  endDayNumber: number;
  coveredDays: Array<{
    date: string;
    dayNumber: number;
  }>;
};

export function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function parseUtcDateKey(dateKey: string) {
  if (dateKey.includes("T")) {
    const parsed = new Date(dateKey);
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 12, 0, 0));
  }

  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function toDateKey(value: Date | string) {
  const date = typeof value === "string" ? parseUtcDateKey(value) : value;
  return date.toISOString().slice(0, 10);
}

export function compareDateKeys(left: string, right: string) {
  return left.localeCompare(right);
}

export function deriveStayEvents(days: TripStayDay[]) {
  const datedDays = days.filter((day): day is TripStayDay & { date: string } => Boolean(day.date));
  const events: StayEvent[] = [];

  for (let index = 0; index < datedDays.length; index += 1) {
    const day = datedDays[index];

    for (const location of day.locations) {
      const previousDay = datedDays[index - 1];
      const seenOnPreviousDay = previousDay?.locations.some((candidate) => candidate.place.id === location.place.id);
      if (seenOnPreviousDay) {
        continue;
      }

      let coverageIndex = index;
      while (
        coverageIndex + 1 < datedDays.length &&
        datedDays[coverageIndex + 1].locations.some((candidate) => candidate.place.id === location.place.id)
      ) {
        coverageIndex += 1;
      }

      const coveredDays = datedDays
        .slice(index, coverageIndex + 1)
        .filter((coveredDay) => coveredDay.locations.some((candidate) => candidate.place.id === location.place.id))
        .map((coveredDay) => ({
          date: coveredDay.date,
          dayNumber: coveredDay.dayNumber
        }));

      events.push({
        id: `${location.place.id}-${day.dayNumber}`,
        placeId: location.place.id,
        placeName: location.place.name,
        startDate: day.date,
        endExclusiveDate: toDateKey(addUtcDays(parseUtcDateKey(datedDays[coverageIndex].date), 1)),
        startDayNumber: day.dayNumber,
        endDayNumber: datedDays[coverageIndex].dayNumber,
        coveredDays
      });
    }
  }

  return events;
}
