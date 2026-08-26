export function randomItem<T>(items: readonly T[]): T {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) {
    throw new Error("randomItem called with an empty array");
  }
  return item;
}

/** Returns a new Date offset by `days` (may be negative) from `from`, at local midnight. */
export function addDays(from: Date, days: number): Date {
  const result = new Date(from);
  result.setDate(result.getDate() + days);
  return result;
}

/** Returns a new Date with the same calendar day as `date` but at the given hour/minute. */
export function atTime(date: Date, hours: number, minutes: number): Date {
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

/** Builds a Date carrying only a time-of-day component, for DoctorSchedule/ScheduleException @db.Time fields. */
export function timeOfDay(hours: number, minutes: number): Date {
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0));
}
