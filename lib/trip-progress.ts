import { parseUtcDateKey } from "@/lib/trip-stays";

type ProgressDay = {
  dayNumber: number;
  date: string | null;
};

export type TripProgress = {
  state: "upcoming" | "active" | "complete";
  selectedDayNumber: number;
  countdownDays: number;
  label: string;
  currentDayNumber: number | null;
};

function todayDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-${`${now.getDate()}`.padStart(2, "0")}`;
}

function diffDays(left: string, right: string) {
  const leftDate = parseUtcDateKey(left);
  const rightDate = parseUtcDateKey(right);
  return Math.round((leftDate.getTime() - rightDate.getTime()) / 86400000);
}

export function deriveTripProgress(days: ProgressDay[], explicitDayNumber?: number | null): TripProgress {
  const datedDays = days.filter((day): day is ProgressDay & { date: string } => Boolean(day.date));
  const today = todayDateKey();
  const firstDay = datedDays[0];
  const lastDay = datedDays.at(-1);

  if (!datedDays.length || !firstDay || !lastDay) {
    return {
      state: "complete",
      selectedDayNumber: explicitDayNumber ?? days[0]?.dayNumber ?? 1,
      countdownDays: 0,
      label: "Trip date range unavailable",
      currentDayNumber: null
    };
  }

  if (explicitDayNumber) {
    const currentTripDay = datedDays.find((day) => day.date === today)?.dayNumber ?? null;
    return {
      state:
        today < firstDay.date ? "upcoming" : today > lastDay.date ? "complete" : "active",
      selectedDayNumber: explicitDayNumber,
      countdownDays: today < firstDay.date ? diffDays(firstDay.date, today) : 0,
      label:
        today < firstDay.date
          ? `Trip starts in ${diffDays(firstDay.date, today)} day${diffDays(firstDay.date, today) === 1 ? "" : "s"}`
          : today > lastDay.date
            ? "Trip completed"
            : `Day ${currentTripDay ?? explicitDayNumber} of ${datedDays.length}`,
      currentDayNumber: currentTripDay
    };
  }

  if (today < firstDay.date) {
    const countdownDays = diffDays(firstDay.date, today);
    return {
      state: "upcoming",
      selectedDayNumber: firstDay.dayNumber,
      countdownDays,
      label: `Trip starts in ${countdownDays} day${countdownDays === 1 ? "" : "s"}`,
      currentDayNumber: null
    };
  }

  if (today > lastDay.date) {
    return {
      state: "complete",
      selectedDayNumber: lastDay.dayNumber,
      countdownDays: 0,
      label: "Trip completed",
      currentDayNumber: lastDay.dayNumber
    };
  }

  const currentDay = datedDays.find((day) => day.date === today) ?? firstDay;
  return {
    state: "active",
    selectedDayNumber: currentDay.dayNumber,
    countdownDays: 0,
    label: `Day ${currentDay.dayNumber} of ${datedDays.length}`,
    currentDayNumber: currentDay.dayNumber
  };
}
