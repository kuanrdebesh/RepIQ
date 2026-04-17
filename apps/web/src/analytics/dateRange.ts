// Date range resolution engine.
//
// Canonical reference: docs/analytics-plan-updated_v1.md §8
// Edge-case behavior: docs/analytics-insight-model.md §9
//
// Pure functions — no side effects, no storage reads. UI layer owns state,
// storage owns persistence, this module owns the math.

import type {
  DateRangeChip,
  DateRangeMode,
  ResolvedDateRange,
  RollingChip,
  ToDateChip
} from "../types";

const ROLLING_DAYS: Record<Exclude<RollingChip, "all">, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "60d": 60,
  "90d": 90,
  "6m": 182,
  "1y": 365
};

const ROLLING_LABEL: Record<RollingChip, string> = {
  "7d": "Last 7 days",
  "14d": "Last 14 days",
  "30d": "Last 30 days",
  "60d": "Last 60 days",
  "90d": "Last 90 days",
  "6m": "Last 6 months",
  "1y": "Last year",
  all: "All time"
};

const TO_DATE_LABEL: Record<ToDateChip, string> = {
  wtd: "Week to date",
  mtd: "Month to date",
  qtd: "Quarter to date",
  ytd: "Year to date",
  all: "All time"
};

/** Parse a YYYY-MM-DD string into a UTC-normalized Date at midnight. */
function parseISODate(iso: string): Date {
  // Accept either YYYY-MM-DD or a full ISO; normalize to date-only UTC
  const s = iso.length > 10 ? iso.slice(0, 10) : iso;
  const [y, m, d] = s.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

/** Inclusive day count between two YYYY-MM-DD strings. */
function daysBetween(a: string, b: string): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime();
  return Math.round(ms / 86400000) + 1;
}

/** Most recent Monday on or before the given date. ISO week starts Monday. */
function startOfWeekMonday(d: Date): Date {
  const day = d.getUTCDay(); // 0 = Sun, 1 = Mon
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function startOfQuarter(d: Date): Date {
  const qStartMonth = Math.floor(d.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(d.getUTCFullYear(), qStartMonth, 1));
}

function startOfYear(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

function addMonths(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));
}

function addYears(d: Date, years: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Resolve a (mode, chip) selection against a reference "today" into an
 * inclusive date range plus — when fair — a prior comparison window.
 *
 * Comparison rules:
 * - Rolling: previous equal-length window immediately before the current one.
 * - To-date: previous period up to the same elapsed offset (e.g., MTD on
 *   April 17 compares Apr 1–17 vs Mar 1–17).
 * - "all" chip: no comparison.
 * - Period-to-date with < 3 elapsed days: no comparison (noisy edge).
 */
export function resolveDateRange(
  mode: DateRangeMode,
  chip: DateRangeChip,
  todayISO: string
): ResolvedDateRange {
  const today = parseISODate(todayISO);
  const end = toISO(today);

  if (mode === "rolling") {
    const rollingChip = chip as RollingChip;
    if (rollingChip === "all") {
      return {
        mode,
        chip: rollingChip,
        start: "1970-01-01",
        end,
        label: ROLLING_LABEL[rollingChip]
      };
    }
    const days = ROLLING_DAYS[rollingChip];
    const start = toISO(addDays(today, -(days - 1)));
    const comparisonEnd = toISO(addDays(today, -days));
    const comparisonStart = toISO(addDays(today, -(2 * days - 1)));
    return {
      mode,
      chip: rollingChip,
      start,
      end,
      comparisonStart,
      comparisonEnd,
      label: ROLLING_LABEL[rollingChip],
      comparisonLabel: `Previous ${rollingChip}`
    };
  }

  // mode === "toDate"
  const toDateChip = chip as ToDateChip;
  if (toDateChip === "all") {
    return {
      mode,
      chip: toDateChip,
      start: "1970-01-01",
      end,
      label: TO_DATE_LABEL[toDateChip]
    };
  }

  let periodStart: Date;
  let previousPeriodStart: Date;
  switch (toDateChip) {
    case "wtd":
      periodStart = startOfWeekMonday(today);
      previousPeriodStart = addDays(periodStart, -7);
      break;
    case "mtd":
      periodStart = startOfMonth(today);
      previousPeriodStart = addMonths(periodStart, -1);
      break;
    case "qtd":
      periodStart = startOfQuarter(today);
      previousPeriodStart = addMonths(periodStart, -3);
      break;
    case "ytd":
      periodStart = startOfYear(today);
      previousPeriodStart = addYears(periodStart, -1);
      break;
  }

  const start = toISO(periodStart);
  const elapsedDays = daysBetween(start, end); // inclusive

  // Edge rule: too-thin comparison window is worse than none.
  const hasFairComparison = elapsedDays >= 3;

  const comparisonStart = toISO(previousPeriodStart);
  const comparisonEnd = toISO(addDays(previousPeriodStart, elapsedDays - 1));

  return {
    mode,
    chip: toDateChip,
    start,
    end,
    ...(hasFairComparison
      ? {
          comparisonStart,
          comparisonEnd,
          comparisonLabel: previousPeriodLabel(toDateChip)
        }
      : {}),
    label: TO_DATE_LABEL[toDateChip]
  };
}

function previousPeriodLabel(chip: ToDateChip): string {
  switch (chip) {
    case "wtd":
      return "Previous week to same point";
    case "mtd":
      return "Previous month to same point";
    case "qtd":
      return "Previous quarter to same point";
    case "ytd":
      return "Previous year to same point";
    case "all":
      return "";
  }
}

/** Chip lists for UI rendering, in display order. */
export const ROLLING_CHIPS: RollingChip[] = [
  "7d",
  "14d",
  "30d",
  "60d",
  "90d",
  "6m",
  "1y",
  "all"
];

export const TO_DATE_CHIPS: ToDateChip[] = ["wtd", "mtd", "qtd", "ytd", "all"];

export function chipLabel(chip: DateRangeChip): string {
  if (chip in ROLLING_LABEL) {
    // short form for pills
    const shortForm: Record<RollingChip, string> = {
      "7d": "7d",
      "14d": "14d",
      "30d": "30d",
      "60d": "60d",
      "90d": "90d",
      "6m": "6m",
      "1y": "1y",
      all: "All"
    };
    if (chip in shortForm) return shortForm[chip as RollingChip];
  }
  const short: Record<ToDateChip, string> = {
    wtd: "WTD",
    mtd: "MTD",
    qtd: "QTD",
    ytd: "YTD",
    all: "All"
  };
  return short[chip as ToDateChip];
}

/** Filter helper: does a workout's savedAt fall inside the resolved range? */
export function isWithinRange(savedAtISO: string, range: ResolvedDateRange): boolean {
  const d = savedAtISO.slice(0, 10);
  return d >= range.start && d <= range.end;
}

/** Filter helper: does a workout fall in the comparison window (if any)? */
export function isWithinComparison(savedAtISO: string, range: ResolvedDateRange): boolean {
  if (!range.comparisonStart || !range.comparisonEnd) return false;
  const d = savedAtISO.slice(0, 10);
  return d >= range.comparisonStart && d <= range.comparisonEnd;
}
