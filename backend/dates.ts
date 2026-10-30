// Days are YYYY-MM-DD in the instance's time zone (TZ).
import { config } from "./config";

export const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Today in TZ, as YYYY-MM-DD. */
export function today(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: config.timeZone(), year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}
