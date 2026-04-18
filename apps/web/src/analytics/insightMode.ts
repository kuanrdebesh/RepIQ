// Insight mode resolver.
//
// Two axes determine what the Summary tab shows and how it reads:
//   1. Data maturity — how many sessions RepIQ has observed (L0–L3).
//      Gates WHAT can be shown: plateau detection, trend arrows, etc.
//      need enough data to avoid noise.
//   2. Tone — self-reported experience level from onboarding/preferences.
//      Gates HOW insights are written: beginner-friendly vs terse/technical.
//
// Plus one dynamic state that can override the Today card regardless of level:
//   - normal      — routine visit
//   - re-entry    — last session was > 7 days ago; surface re-entry guidance
//   - maintenance — L3 user whose numbers have been stable for 3+ months;
//                   soften the tone away from optimisation toward confirmation
//
// Pure function — reads profile + workouts, returns a mode. UI components
// render a variant of each card by reading this mode, never by re-deriving
// thresholds at the component layer.

import type {
  ExperienceLevel,
  SavedWorkoutData,
  UserPsychProfile
} from "../types";

export type DataMaturity = "L0" | "L1" | "L2" | "L3";
export type InsightTone = "beginner" | "intermediate" | "advanced";
export type DynamicState = "normal" | "re-entry" | "maintenance";

export type InsightMode = {
  maturity: DataMaturity;
  tone: InsightTone;
  state: DynamicState;
  sessionCount: number;
  lastGapDays: number;
};

const MATURITY_THRESHOLDS = {
  L1: 1,   // first session logged
  L2: 5,   // enough for coverage + early trend hints
  L3: 20   // enough for plateau + goal alignment signals
} as const;

const RE_ENTRY_GAP_DAYS = 7;

/** Collapse the 5-value ExperienceLevel union into the 3 tones used by copy. */
function toInsightTone(level: ExperienceLevel | null): InsightTone {
  switch (level) {
    case "never":
    case "beginner":
      return "beginner";
    case "advanced":
    case "veteran":
      return "advanced";
    case "intermediate":
    case null:
    default:
      return "intermediate";
  }
}

function computeMaturity(sessionCount: number): DataMaturity {
  if (sessionCount < MATURITY_THRESHOLDS.L1) return "L0";
  if (sessionCount < MATURITY_THRESHOLDS.L2) return "L1";
  if (sessionCount < MATURITY_THRESHOLDS.L3) return "L2";
  return "L3";
}

/** Days between today and the most recent workout. Returns 999 if never trained. */
function computeLastGapDays(workouts: SavedWorkoutData[], todayISO: string): number {
  if (workouts.length === 0) return 999;
  const todayMs = Date.parse(todayISO.slice(0, 10));
  let mostRecent = 0;
  for (const w of workouts) {
    const ms = Date.parse((w.savedAt ?? "").slice(0, 10));
    if (!Number.isNaN(ms) && ms > mostRecent) mostRecent = ms;
  }
  if (mostRecent === 0) return 999;
  const diffDays = Math.floor((todayMs - mostRecent) / 86400000);
  return Math.max(0, diffDays);
}

/**
 * Maintenance detector: L3 user with stable output for 3+ months.
 * Placeholder heuristic — refine once we agree on stability signals.
 * Today: if the last 12 weeks have had consistent session counts
 * (weekly variance < ~25%) and no PRs or regressions flagged, we're
 * in maintenance. For now we return false; caller can opt in later.
 */
function isStableMaintenance(_workouts: SavedWorkoutData[]): boolean {
  // TODO: implement once we wire maintenance-mode cards.
  return false;
}

/** Resolve the active insight mode for the Summary tab. */
export function resolveInsightMode(
  profile: UserPsychProfile,
  workouts: SavedWorkoutData[],
  todayISO: string
): InsightMode {
  const sessionCount = workouts.length;
  const maturity = computeMaturity(sessionCount);
  const tone = toInsightTone(profile.experienceLevel);
  const lastGapDays = computeLastGapDays(workouts, todayISO);

  let state: DynamicState = "normal";
  if (sessionCount > 0 && lastGapDays > RE_ENTRY_GAP_DAYS) {
    state = "re-entry";
  } else if (maturity === "L3" && isStableMaintenance(workouts)) {
    state = "maintenance";
  }

  return { maturity, tone, state, sessionCount, lastGapDays };
}

/** Gap tier helper — exposes the re-entry severity the Today card reads from. */
export type GapTier = "none" | "short" | "medium" | "long";

export function gapTier(days: number): GapTier {
  if (days <= 3) return "none";
  if (days <= 7) return "short";
  if (days <= 30) return "medium";
  return "long";
}
