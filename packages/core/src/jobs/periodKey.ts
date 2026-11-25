// The period a run belongs to, in the job's own time zone (design D3):
// `day` → 2026-10-21, `week` → the ISO week 2026-W43, `month` → 2026-10.
// Only the calendar date in that zone matters, so DST changes can't move a
// run into another period.
import type { JobPeriod } from './jobFile';

/** The calendar date `at` falls on in `timezone`. */
export function zonedDate(at: Date, timezone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** ISO 8601 week-numbering year and week of a calendar date. */
export function isoWeek(year: number, month: number, day: number): { year: number; week: number } {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  // The Thursday of this week decides its year.
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const weekYear = date.getUTCFullYear();
  const jan1 = Date.UTC(weekYear, 0, 1);
  const week = Math.ceil(((date.getTime() - jan1) / 86_400_000 + 1) / 7);
  return { year: weekYear, week };
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

export function periodKey(period: JobPeriod, timezone: string, at: Date = new Date()): string {
  const { year, month, day } = zonedDate(at, timezone);
  if (period === 'day') return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
  if (period === 'month') return `${pad(year, 4)}-${pad(month)}`;
  const w = isoWeek(year, month, day);
  return `${pad(w.year, 4)}-W${pad(w.week)}`;
}

/** The last calendar day (YYYY-MM-DD) of the period a key names: a day, an ISO week's Sunday, or a month's last day. */
export function periodEndDate(key: string): string | undefined {
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  const month = /^(\d{4})-(\d{2})$/.exec(key);
  if (month) {
    const last = new Date(Date.UTC(Number(month[1]), Number(month[2]), 0));
    return last.toISOString().slice(0, 10);
  }
  const week = /^(\d{4})-W(\d{2})$/.exec(key);
  if (week) {
    // ISO week 1 contains 4 January; weeks start on Monday.
    const jan4 = new Date(Date.UTC(Number(week[1]), 0, 4));
    const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86_400_000);
    const sunday = new Date(monday.getTime() + ((Number(week[2]) - 1) * 7 + 6) * 86_400_000);
    return sunday.toISOString().slice(0, 10);
  }
  return undefined;
}
