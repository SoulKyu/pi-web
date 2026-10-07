import type { QuietHours } from "./settings";

/** All times are the server's local clock: no timezone is configured anywhere. */
const minutesOf = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const nowMinutes = (now: Date): number => now.getHours() * 60 + now.getMinutes();

/** `from === to` is no window. A window with `from > to` crosses midnight. */
export function inQuietHours(quiet: QuietHours | undefined, now: Date): boolean {
  if (!quiet) return false;
  const from = minutesOf(quiet.from);
  const to = minutesOf(quiet.to);
  const current = nowMinutes(now);
  if (from === to) return false;
  return from < to ? current >= from && current < to : current >= from || current < to;
}

/** The next `to` boundary strictly after `now`: today when still ahead, else tomorrow. */
export function quietHoursEnd(quiet: QuietHours, now: Date): Date {
  const end = new Date(now);
  end.setHours(0, minutesOf(quiet.to), 0, 0);
  if (end.getTime() <= now.getTime()) end.setDate(end.getDate() + 1);
  return end;
}

/** `YYYY-MM-DD` (local) once today's `at` has passed, else null: the key of a daily fire. */
export function dailyBucket(at: string, now: Date): string | null {
  if (nowMinutes(now) < minutesOf(at)) return null;
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
