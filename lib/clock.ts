// Single source of "now" for every time-dependent rule (token expiry, lockout,
// idle timeouts) so tests can freeze time with vi.setSystemTime().
export function now(): Date {
  return new Date();
}

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function addMs(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}

/** The app's business time zone (every house is in Bangladesh). */
export const APP_TIME_ZONE = "Asia/Dhaka";

/** Today's calendar date in Asia/Dhaka as "YYYY-MM-DD" (en-CA formats ISO-style). */
export function todayIsoInDhaka(at: Date = now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}
