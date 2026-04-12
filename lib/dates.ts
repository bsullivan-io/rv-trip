const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC"
});

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC"
});

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC"
});

const FULL_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC"
});

export function makeUtcDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
}

export function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function toDateInputValue(date: Date | string | null | undefined) {
  if (!date) return "";
  const value = typeof date === "string" ? new Date(date) : date;
  const year = value.getUTCFullYear();
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${value.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateInput(value: FormDataEntryValue | null, field: string) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    throw new Error(`${field} is required.`);
  }

  const [year, month, day] = raw.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error(`${field} must be a valid date.`);
  }

  return makeUtcDate(year, month - 1, day);
}

export function formatDateLabel(date: Date | string | null | undefined) {
  if (!date) return "Date not set";
  const value = typeof date === "string" ? new Date(date) : date;
  return DATE_FORMATTER.format(value);
}

export function formatShortDate(date: Date | string | null | undefined) {
  if (!date) return "Date not set";
  const value = typeof date === "string" ? new Date(date) : date;
  return SHORT_DATE_FORMATTER.format(value);
}

export function formatMonthLabel(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  return MONTH_FORMATTER.format(value);
}

export function formatFullDateLabel(date: Date | string | null | undefined) {
  if (!date) return "Date not set";
  const value = typeof date === "string" ? new Date(date) : date;
  return FULL_DATE_FORMATTER.format(value);
}
