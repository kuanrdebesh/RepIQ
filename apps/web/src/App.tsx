import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type ReactNode } from "react";
import {
  coachingSuggestionSchema,
  mediaConfigSchema,
  mediaPrepareUploadResponseSchema,
  workoutMediaAssetSchema,
  type CoachingSuggestion,
  type ExerciseEvaluationRequest,
  type ExerciseHistorySession,
  type WorkoutMediaAsset,
  type WorkoutSet
} from "@repiq/shared";
import benchPressImage from "./assets/bench-press.svg";
import inclineDumbbellPressImage from "./assets/incline-dumbbell-press.svg";

type FlowState = {
  status: "idle" | "loading" | "success" | "error";
  suggestion: CoachingSuggestion | null;
  message: string | null;
  engineSource: "live" | "fallback" | "unavailable" | null;
};

type DraftSet = {
  id: string;
  setType: DraftSetType;
  weightInput: string;
  repsInput: string;
  rpeInput: string;
  done: boolean;
  failed: boolean;
};

type ExerciseDraft = {
  id: string;
  name: string;
  note: string;
  stickyNoteEnabled?: boolean;
  restTimer: string;
  supersetGroupId?: string | null;
  goal: ExerciseEvaluationRequest["goal"];
  imageSrc: string;
  primaryMuscle: string;
  primaryMuscles?: string[];
  secondaryMuscles: string[];
  exerciseType?: CustomExerciseType;
  measurementType?: MeasurementType;
  movementSide?: MovementSide;
  isCustom?: boolean;
  libraryStatus?: "active" | "archived";
  howTo: string[];
  videoLabel?: string;
  history: ExerciseHistorySession[];
  draftSets: DraftSet[];
};

type DetailTab = "summary" | "history" | "howto";
type ThemePreference = "light" | "dark" | "system";
type DraftSetType = "warmup" | "normal" | "drop" | "restpause" | "failure";
type AppView = "home" | "logger" | "finish" | "share" | "planner" | "plan-builder" | "report" | "insights" | "profile" | "history-detail";

// ── Psychological Data Layer ──────────────────────────────────────────────────
// V1: types and storage stubs defined now so data is captured from day one.
// V2: intelligence (skip prediction, deload triggers, motivation style) ships later.
// See docs/psych-layer.md for the full design specification.

type MotivationalWhy =
  | "inconsistent"        // "I've been inconsistent and want to fix that"
  | "plateau"             // "I've hit a plateau and need structure"
  | "look_feel_stronger"  // "I want to look and feel stronger"
  | "fresh_start"         // "I'm starting fresh"
  | "feel_good";          // "I just want to feel good"

type TrainingGoal =
  | "muscle_strength" | "fat_loss" | "endurance" | "general_fitness"  // legacy
  | "build_muscle" | "get_stronger" | "improve_fitness" | "athletic_performance" | "stay_active"; // onboarding

type ExperienceLevel = "never" | "beginner" | "intermediate" | "advanced" | "veteran";
type EquipmentAccess = "full_gym" | "home_gym" | "bodyweight";
type ScheduleCommitment = 2 | 3 | 4 | 5 | 6;

// 1–5 scales for mood and energy capture
type MoodRating = 1 | 2 | 3 | 4 | 5;
type EnergyRating = 1 | 2 | 3 | 4 | 5;
// Standard Borg RPE — session-level perceived exertion (distinct from per-set RPE in logger)
type RPERating = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
// 3-point scale for daily readiness (sleep/stress/energy)
type ThreePointScale = 1 | 2 | 3;

type TimeOfDay = "early_morning" | "morning" | "afternoon" | "evening" | "night";
// 04–07 / 07–11 / 11–17 / 17–21 / 21–04

type SessionSource = "plan" | "template" | "generated" | "goal_planner" | "quick" | "resume";

type Trend = "improving" | "stable" | "declining";

type MotivationStyle =
  | "accountability"  // streak-driven; hurt by skips
  | "achievement"     // PR-driven; volume milestones
  | "social"          // responds to community activity
  | "intrinsic"       // self-directed; data-rich; low notification preference
  | "irregular";      // long gaps; emotional re-starts

// ── UserPsychProfile — stored as singleton, captured at onboarding ────────────
interface UserPsychProfile {
  schemaVersion: 1;
  motivationalWhy: MotivationalWhy | null;
  primaryGoal: TrainingGoal | null;
  secondaryGoal: TrainingGoal | null;
  experienceLevel: ExperienceLevel | null;
  equipmentAccess: EquipmentAccess | null;
  scheduleCommitment: ScheduleCommitment | null;
  onboardingCompletedAt: string | null;   // ISO timestamp
  // ── Personal info collected at onboarding ──
  name: string | null;
  gender: "male" | "female" | "other" | null;
  unitSystem: "metric" | "imperial";
  heightCm: number | null;
  weightKg: number | null;
  age: number | null;
  bodyFatBracket: string | null;
  // ── Schedule preferences ──
  daysPerWeekPref: number | null;
  sessionLengthPref: number | null;
  bestTimePref: string | null;
  workoutStylePref: string | null;
  planLengthWeeksPref: number | null; // mesocycle length preference (default 12)
  // ── Mindset / psych ──
  preWorkoutFeeling: string | null;
  isReturningAfterBreak: boolean;
  breakMonths: number | null;
  successVision: string | null;
  biggestObstacles: string[];
  lastGoalCheckAt: string | null;          // ISO timestamp — 90-day re-check prompt
  // Consent flags — each capture dimension can be individually disabled
  capturePostWorkoutMood: boolean;
  capturePostWorkoutEnergy: boolean;
  captureSessionRPE: boolean;
  captureDailyReadiness: boolean;
  capturePassiveBehavior: boolean;
}

// ── PostWorkoutPsych — one per completed session, optional capture ─────────────
interface PostWorkoutPsych {
  schemaVersion: 1;
  sessionId: string;        // = SavedWorkoutData.savedAt
  capturedAt: string;       // ISO timestamp
  postMood: MoodRating | null;
  postEnergy: EnergyRating | null;
  sessionRPE: RPERating | null;
  psychNote: string | null; // optional reflection, max 280 chars
}

// ── DailyReadiness — one per calendar day, optional Home card capture ──────────
interface DailyReadiness {
  schemaVersion: 1;
  date: string;             // YYYY-MM-DD
  capturedAt: string;       // ISO timestamp
  sleepQuality: ThreePointScale | null;   // 1=poor 2=ok 3=great
  stressLevel: ThreePointScale | null;    // 1=low 2=medium 3=high
  energyLevel: ThreePointScale | null;    // 1=low 2=medium 3=high
  followedBySessionId: string | null;     // populated post-session
  skippedPlannedSession: boolean;         // had a plan, didn't start
}

// ── SessionBehaviorSignals — auto-captured at finalizeFinishedWorkoutSave ──────
interface SessionBehaviorSignals {
  schemaVersion: 1;
  sessionId: string;                           // = SavedWorkoutData.savedAt
  date: string;                                // YYYY-MM-DD
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;      // 0 = Sunday
  timeOfDay: TimeOfDay;
  startedAt: string;                           // ISO timestamp
  actualDurationMinutes: number;
  plannedDurationMinutes: number | null;
  plannedExerciseCount: number | null;
  actualExerciseCount: number;
  plannedSetCount: number | null;
  completedSetCount: number;
  setCompletionRate: number | null;            // 0–1, null if no plan
  sessionSource: SessionSource;
  planId: string | null;
  restTimerUseCount: number;
  midSessionExercisesAdded: number;
}

// ── DerivedPsychProfile — V2 computed, schema reserved in V1 ──────────────────
// Written by analytics, never by user action. Cached result of pattern analysis.
interface DerivedPsychProfile {
  schemaVersion: 1;
  computedAt: string;
  confidenceScore: number;                     // 0–1; don't surface insights below ~0.4
  motivationStyle: MotivationStyle | null;
  bestTrainingDays: (0 | 1 | 2 | 3 | 4 | 5 | 6)[];
  skipRiskDays: (0 | 1 | 2 | 3 | 4 | 5 | 6)[];
  bestTimeOfDay: TimeOfDay | null;
  avgSessionsPerWeek: number | null;
  avgReadinessScore: number | null;
  avgPostMood: number | null;
  avgPostEnergy: number | null;
  avgSessionRPE: number | null;
  avgSetCompletionRate: number | null;
  moodTrend: Trend | null;
  energyTrend: Trend | null;
  consistencyTrend: Trend | null;
  volumeTrend: Trend | null;
  deloadRecommended: boolean;
  deloadReason: string | null;
  statedGoal: TrainingGoal | null;
  behaviourAlignedWithGoal: boolean | null;
  goalDriftDetectedAt: string | null;
}

// ── RepIQ Generated Plan — V1 rules-based, V2 will add AI layer ───────────────
type SplitType = "full_body" | "upper_lower" | "ppl" | "body_part";

interface RepIQPlanExercise {
  exerciseId: string;
  sets: number;
  reps: string;
  restSeconds: number;
}

interface RepIQPlanDay {
  sessionLabel: string;
  focus: string;
  exercises: RepIQPlanExercise[];
  completedAt: string | null;
}

interface RepIQPlanWeek {
  weekNumber: number;
  isCompleted: boolean;
  days: RepIQPlanDay[];
}

interface RepIQPlan {
  schemaVersion: 1;
  id: string;
  generatedAt: string;
  startDate: string;
  planName: string;
  goal: TrainingGoal;
  secondaryGoal: TrainingGoal | null;
  experienceLevel: ExperienceLevel;
  daysPerWeek: number;
  sessionLengthMin: number;
  splitType: SplitType;
  mesocycleLengthWeeks: number;
  currentWeekIndex: number;
  weeks: RepIQPlanWeek[];
  status?: "active" | "paused";
  needsReview?: boolean;            // set when extra volume was logged outside the plan
  extraVolumeCount?: number;        // how many cross-plan workouts triggered the flag
  extraVolumeWorkoutIds?: string[]; // savedAt IDs of those workouts (for delete cleanup)
  lastRegeneratedAt?: string;       // ISO timestamp of last full or partial regeneration
}

const DEFAULT_PSYCH_PROFILE: UserPsychProfile = {
  schemaVersion: 1,
  motivationalWhy: null,
  primaryGoal: null,
  secondaryGoal: null,
  experienceLevel: null,
  equipmentAccess: null,
  scheduleCommitment: null,
  onboardingCompletedAt: null,
  name: null,
  gender: null,
  unitSystem: "metric",
  heightCm: null,
  weightKg: null,
  age: null,
  bodyFatBracket: null,
  daysPerWeekPref: null,
  sessionLengthPref: null,
  bestTimePref: null,
  workoutStylePref: null,
  planLengthWeeksPref: null,
  preWorkoutFeeling: null,
  isReturningAfterBreak: false,
  breakMonths: null,
  successVision: null,
  biggestObstacles: [],
  lastGoalCheckAt: null,
  capturePostWorkoutMood: true,
  capturePostWorkoutEnergy: true,
  captureSessionRPE: true,
  captureDailyReadiness: true,
  capturePassiveBehavior: true,
};

function deriveTimeOfDay(isoTimestamp: string): TimeOfDay {
  const hour = new Date(isoTimestamp).getHours();
  if (hour >= 4 && hour < 7) return "early_morning";
  if (hour >= 7 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

function buildSessionBehaviorSignals(
  savedAt: string,
  session: {
    date: string;
    startInstant?: string;
    duration: string;
    exerciseCount: number;
    totalSets: number;
  },
  plan: { id: string; exercises: { setCount: number }[] } | null,
  source: SessionSource,
  restTimerUseCount: number,
  midSessionExercisesAdded: number,
): SessionBehaviorSignals {
  const startedAt = session.startInstant ?? savedAt;
  const startDate = new Date(startedAt);
  const durationMatch = session.duration.match(/(\d+)h?\s*(\d+)?m?/);
  const actualMinutes = durationMatch
    ? (parseInt(durationMatch[1] ?? "0") * (session.duration.includes("h") ? 60 : 1)) +
      parseInt(durationMatch[2] ?? "0")
    : 0;

  const plannedSetCount = plan
    ? plan.exercises.reduce((s, e) => s + e.setCount, 0)
    : null;

  return {
    schemaVersion: 1,
    sessionId: savedAt,
    date: session.date.slice(0, 10),
    dayOfWeek: startDate.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    timeOfDay: deriveTimeOfDay(startedAt),
    startedAt,
    actualDurationMinutes: actualMinutes,
    plannedDurationMinutes: null,   // TODO: wire plan estimated duration when available
    plannedExerciseCount: plan ? plan.exercises.length : null,
    actualExerciseCount: session.exerciseCount,
    plannedSetCount,
    completedSetCount: session.totalSets,
    setCompletionRate: plannedSetCount ? session.totalSets / plannedSetCount : null,
    sessionSource: source,
    planId: plan?.id ?? null,
    restTimerUseCount,
    midSessionExercisesAdded,
  };
}

type PlannedExercise = {
  exerciseId: string;
  setCount: number;
  setTypes?: DraftSetType[];
  restTimer: string;
  note?: string;
};

type WorkoutPlan = {
  id: string;
  name: string;
  tag?: string;
  userTags?: string[];
  note?: string;
  exercises: PlannedExercise[];
  createdAt: string;
  updatedAt: string;
  // Template metadata (populated only on WORKOUT_PLAN_TEMPLATES entries)
  level?: "Beginner" | "Intermediate" | "Advanced";
  equipment?: "Full Gym" | "Dumbbells" | "Bodyweight";
  goal?: "Hypertrophy" | "Strength" | "Endurance";
  muscleGroups?: string[];
  duration?: number;
  category?: string;
};

type PlanBuilderMode = "create" | "edit" | "generate";
type PlanSessionSource = "saved" | "library" | "generated" | "quick";

type ActivePlanSession = {
  source: PlanSessionSource;
  planId: string | null;
  originalPlan: WorkoutPlan | null;
} | { source: "repiq"; planId: null; originalPlan: null; weekIdx: number; dayIdx: number } | null;

type WorkoutSettings = {
  defaultRestSeconds: string;
  transitionRestSeconds: string;
  carryForwardDefaults: boolean;
  showRpe: boolean;
  guidanceTopStrip: boolean;
  guidanceInline: boolean;
  preferredGoal: string | null;
  preferredLevel: string | null;
  preferredEquipment: string | null;
};

type WorkoutMeta = {
  date: string;
  startTime: string;
  startedMinutesAgo: string;
  sessionName: string;
  startInstant?: string;
};

type RewardCategory = "pr" | "volume" | "progress";
type RewardLevel = "set" | "exercise" | "session";
type AddExerciseMode = "browse" | "create";
type CreateExerciseStep = 1 | 2;
type CustomExerciseType =
  | "bodyweight_only"
  | "bodyweight_weighted"
  | "free_weights_accessories"
  | "barbell"
  | "machine"
  | "freestyle_cardio";
type MeasurementType = "timed" | "reps_volume" | "weight_timed";
type MovementSide = "unilateral" | "bilateral";

// ── Smart Replace — see docs/smart-replace.md ─────────────────────────────────
type MovementPattern =
  | "horizontal_push"    // Bench press, push-up, dumbbell press
  | "vertical_push"      // Overhead press, Arnold press, pike push-up
  | "horizontal_pull"    // Row (barbell, dumbbell, cable, machine)
  | "vertical_pull"      // Lat pulldown, pull-up, chin-up
  | "hip_hinge"          // Deadlift, RDL, good morning, hip thrust
  | "squat"              // Back squat, front squat, goblet squat, leg press
  | "lunge"              // Lunge, split squat, step-up, Bulgarian
  | "carry"              // Farmer carry, suitcase carry
  | "core_anterior"      // Plank, crunch, leg raise, hollow hold
  | "core_rotational"    // Russian twist, woodchop, cable rotation
  | "isolation_push"     // Tricep pushdown, chest fly, lateral raise
  | "isolation_pull"     // Bicep curl, face pull, rear delt fly
  | "isolation_legs"     // Leg extension, leg curl, calf raise
  | "cardio";            // Jump rope, sled, rowing machine

type ExerciseDifficulty = "beginner" | "intermediate" | "advanced";

// Exercise angle — describes the bench/body position for the movement
type ExerciseAngle =
  | "flat"        // Standard horizontal (bench press, bent-over row)
  | "incline"     // Angled upward (incline press, incline curl)
  | "decline"     // Angled downward (decline press)
  | "overhead"    // Vertical pressing plane
  | "neutral"     // Neutral grip / neutral stance variant
  | "prone"       // Face-down (reverse fly, prone leg curl)
  | "none";       // Not applicable (squat, deadlift, carry)

// Equipment — more granular than exerciseType, used for matching and filtering
type ExerciseEquipment =
  | "barbell"
  | "dumbbell"
  | "cable"
  | "machine"
  | "bodyweight"
  | "kettlebell"
  | "resistance_band"
  | "landmine"
  | "smith_machine"
  | "none";       // Bodyweight / no equipment needed

type ReplacementReason =
  | "machine_taken"
  | "no_equipment"
  | "too_difficult"
  | "pain_discomfort"
  | "preference";

interface ReplacementEvent {
  schemaVersion: 1;
  sessionId: string;               // = SavedWorkoutData.savedAt
  replacedAt: string;              // ISO timestamp
  originalExerciseId: string;
  replacementExerciseId: string;
  reason: ReplacementReason;
  setsAlreadyLogged: number;
  matchScore: number;
}

const replacementEventsStorageKey = "repiq-replacement-events";

function getStoredReplacementEvents(): ReplacementEvent[] {
  try {
    const raw = window.localStorage.getItem(replacementEventsStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function persistReplacementEvent(event: ReplacementEvent): void {
  try {
    const existing = getStoredReplacementEvents();
    const updated = [event, ...existing].slice(0, 500);
    window.localStorage.setItem(replacementEventsStorageKey, JSON.stringify(updated));
  } catch {}
}

// Movement family — used for partial-match scoring
function getMovementFamily(pattern: MovementPattern): string {
  if (["horizontal_push", "vertical_push", "isolation_push"].includes(pattern)) return "push";
  if (["horizontal_pull", "vertical_pull", "isolation_pull"].includes(pattern)) return "pull";
  if (["squat", "lunge", "hip_hinge", "isolation_legs"].includes(pattern)) return "legs";
  if (["core_anterior", "core_rotational"].includes(pattern)) return "core";
  if (pattern === "carry") return "carry";
  return "cardio";
}

// Equipment accessibility — maps exerciseType to what the user needs available
function getEquipmentAccessibility(type: CustomExerciseType): CustomExerciseType[] {
  switch (type) {
    case "bodyweight_only":          return ["bodyweight_only"];
    case "bodyweight_weighted":      return ["bodyweight_only", "bodyweight_weighted"];
    case "free_weights_accessories": return ["bodyweight_only", "bodyweight_weighted", "free_weights_accessories"];
    case "barbell":                  return ["barbell"];
    case "machine":                  return ["machine"];
    case "freestyle_cardio":         return ["freestyle_cardio"];
  }
}

// Type alias for extended exercise draft with taxonomy fields
type ExerciseWithTaxonomy = ExerciseDraft & {
  movementPattern?: MovementPattern;
  angle?: ExerciseAngle;
  equipment?: ExerciseEquipment;
  difficultyLevel?: ExerciseDifficulty;
};

// Core scoring function — returns 0–100
// Priority: same pattern + same angle + different equipment (best swap)
//           same pattern + different angle + same equipment
//           same pattern + different everything (still valid)
//           same movement family (broader fallback)
function scoreReplacement(
  original: ExerciseWithTaxonomy,
  candidate: ExerciseWithTaxonomy,
  sessionExercises: ExerciseDraft[],
  reason: ReplacementReason,
  availableEquipment: CustomExerciseType[],
  userLevel: ExperienceLevel | null,
): number {
  // Hard exclusions
  if (candidate.id === original.id) return -1;
  if (sessionExercises.some(e => e.id === candidate.id)) return -1;

  // Equipment filter
  const needed = getEquipmentAccessibility(candidate.exerciseType ?? "bodyweight_only");
  const canDo = needed.some(e => availableEquipment.includes(e));
  if (!canDo) return -1;

  // Difficulty filter when reason is too_difficult
  if (reason === "too_difficult" && userLevel !== "advanced") {
    if ((candidate.difficultyLevel ?? "intermediate") === "advanced") return -1;
  }

  let score = 0;

  // ── Movement pattern + angle match (0–50) ─────────────────────────────────
  // Most important: preserves session intent and balance
  const origPattern = original.movementPattern;
  const candPattern = candidate.movementPattern;
  if (origPattern && candPattern) {
    if (candPattern === origPattern) {
      score += 30;
      // Bonus for same angle (same stimulus, just different equipment)
      if (original.angle && candidate.angle && candidate.angle === original.angle) {
        score += 20;  // e.g. Incline Barbell → Incline Dumbbell Press ✦
      } else if (original.angle && candidate.angle && candidate.angle !== original.angle) {
        score += 8;   // e.g. Incline Barbell → Flat Barbell Press
      }
    } else if (getMovementFamily(candPattern) === getMovementFamily(origPattern)) {
      score += 15;    // Same family (e.g. push), different pattern
    }
  }

  // ── Muscle match (0–40) ────────────────────────────────────────────────────
  const origPrimary = original.primaryMuscle.toLowerCase();
  const candPrimary = candidate.primaryMuscle.toLowerCase();
  if (candPrimary === origPrimary) score += 30;
  else if (candidate.secondaryMuscles.some(m => m.toLowerCase() === origPrimary)) score += 12;

  const origSecondary = original.secondaryMuscles.map(m => m.toLowerCase());
  const candSecondary = candidate.secondaryMuscles.map(m => m.toLowerCase());
  const secondaryOverlap = candSecondary.filter(m => origSecondary.includes(m)).length;
  score += Math.min(secondaryOverlap * 5, 15);

  // ── Equipment accessibility bonus ──────────────────────────────────────────
  // Same equipment type as original = user knows how to use it
  if (original.equipment && candidate.equipment && candidate.equipment === original.equipment) {
    score += 5;
  }
  // Bodyweight is always accessible — slight boost
  if (candidate.exerciseType === "bodyweight_only") score += 3;

  // ── Session fatigue penalty ────────────────────────────────────────────────
  const setsOnSameMuscle = sessionExercises
    .filter(e => e.primaryMuscle.toLowerCase() === candPrimary)
    .reduce((sum, e) => sum + e.draftSets.length, 0);
  if (setsOnSameMuscle >= 6) score -= 25;
  else if (setsOnSameMuscle >= 3) score -= 10;

  return Math.max(score, 0);
}

// Main replacement function — returns up to 5 ranked suggestions
function getSmartReplacements(
  original: ExerciseWithTaxonomy,
  sessionExercises: ExerciseDraft[],
  reason: ReplacementReason,
  availableEquipment: CustomExerciseType[],
  allExercises: ExerciseWithTaxonomy[],
  userLevel: ExperienceLevel | null,
): Array<{ exercise: ExerciseWithTaxonomy; score: number; matchReason: string }> {
  return allExercises
    .map(candidate => {
      const score = scoreReplacement(original, candidate, sessionExercises, reason, availableEquipment, userLevel);
      // Generate a human-readable match reason for the UI chip
      let matchReason = "";
      if (score >= 0) {
        if (candidate.movementPattern === original.movementPattern && candidate.angle === original.angle) {
          matchReason = "Same movement, different equipment";
        } else if (candidate.movementPattern === original.movementPattern) {
          matchReason = "Same pattern, different angle";
        } else if (candidate.primaryMuscle === original.primaryMuscle) {
          matchReason = `Targets ${original.primaryMuscle}`;
        } else if (getMovementFamily(candidate.movementPattern ?? "cardio") === getMovementFamily(original.movementPattern ?? "cardio")) {
          matchReason = "Same movement family";
        } else {
          matchReason = "Similar muscle group";
        }
        if (candidate.exerciseType === "bodyweight_only") matchReason += " · No equipment";
      }
      return { exercise: candidate, score, matchReason };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
}

// Insights helper — roll up session volume by movement pattern
// Used by Insights → Analyzer to show "Horizontal Push: 18 sets this week"
function groupSetsByMovementPattern(
  exercises: ExerciseDraft[],
): Record<string, { sets: number; exercises: string[] }> {
  const result: Record<string, { sets: number; exercises: string[] }> = {};
  for (const ex of exercises) {
    const pattern = (ex as ExerciseWithTaxonomy).movementPattern;
    const family = pattern ? getMovementFamily(pattern) : "unknown";
    if (!result[family]) result[family] = { sets: 0, exercises: [] };
    result[family].sets += ex.draftSets.length;
    if (!result[family].exercises.includes(ex.name)) result[family].exercises.push(ex.name);
  }
  return result;
}
type CustomExerciseInput = {
  name: string;
  imageSrc?: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  exerciseType: CustomExerciseType;
  measurementType: MeasurementType;
  movementSide: MovementSide;
  movementPattern?: MovementPattern;
};

type LoggerReward = {
  id: string;
  exerciseId: string | null;
  setId: string | null;
  category: RewardCategory;
  level: RewardLevel;
  shortLabel: string;
  detail: string;
};

type RewardSummary = {
  set: number;
  exercise: number;
  session: number;
  total: number;
};

type FinishedExerciseSummary = {
  id: string;
  name: string;
  primaryMuscle: string;
  loggedSets: number;
  loggedVolume: number;
  sets?: { weight: number; reps: number; rpe: number | null; setType: string }[];
};

type FinishWorkoutDraft = {
  sessionName: string;
  note: string;
  date: string;
  duration: string;
  durationSeconds: number; // elapsed seconds — used to pre-seed timer on edit-from-history
  totalVolume: number;
  totalSets: number;
  exerciseCount: number;
  loggedExerciseCount: number;
  ignoredIncompleteSets: number;
  exercises: FinishedExerciseSummary[];
  rewards: LoggerReward[];
  rewardSummary: RewardSummary;
  takeawayTitle: string;
  takeawayBody: string;
  images: WorkoutMediaAsset[];
};

type SavedWorkoutData = FinishWorkoutDraft & {
  savedAt: string; // ISO string
  repiqSourceKey?: string; // "weekIdx-dayIdx" if completed as part of a RepIQ plan session
};

type ExerciseRestDefaults = Record<string, string>;

type SwipeState = {
  rowId: string | null;
  startX: number;
  startY: number;
  deltaX: number;
  axis: "undecided" | "horizontal" | "vertical";
  dragging: boolean;
};

function createInitialSwipeState(): SwipeState {
  return {
    rowId: null,
    startX: 0,
    startY: 0,
    deltaX: 0,
    axis: "undecided",
    dragging: false
  };
}

type ActiveRestTimer = {
  exerciseId: string;
  endAt: number | null;
  pausedRemainingSeconds: number | null;
  totalSeconds: number;
  kind: "exercise" | "transition";
} | null;

type MuscleRegion =
  | "chest"
  | "frontDelts"
  | "sideDelts"
  | "rearDelts"
  | "biceps"
  | "triceps"
  | "upperBack"
  | "lats"
  | "lowerBack"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "adductors"
  | "calves";

const apiBaseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://127.0.0.1:4000";

const themeStorageKey = "repiq-theme-preference";
const workoutSettingsStorageKey = "repiq-workout-settings";
const customExercisesStorageKey = "repiq-custom-exercises";
const savedWorkoutsStorageKey = "repiq-saved-workouts";
const workoutPlansStorageKey = "repiq-workout-plans";
const planBuilderDraftStorageKey = "repiq-plan-builder-draft";
// Psychological data layer (see docs/psych-layer.md)
const psychProfileStorageKey     = "repiq-psych-profile";
const postWorkoutPsychStorageKey  = "repiq-post-workout-psych";
const dailyReadinessStorageKey   = "repiq-daily-readiness";
const sessionBehaviorStorageKey  = "repiq-session-behavior";
const derivedPsychStorageKey     = "repiq-derived-psych";
const repiqPlanStorageKey            = "repiq-generated-plan";

const setTypeOptions: Array<{
  value: DraftSetType;
  symbol: string;
  label: string;
}> = [
  { value: "warmup", symbol: "W", label: "Warm-up" },
  { value: "normal", symbol: "#", label: "Working set" },
  { value: "drop", symbol: "D", label: "Drop set" },
  { value: "restpause", symbol: "RP", label: "Rest-pause" },
  { value: "failure", symbol: "F", label: "Failure set" }
];

const supersetPalette = ["#0ea5e9", "#f97316", "#8b5cf6", "#10b981", "#e11d48", "#eab308"];
const muscleMapPalette = ["#dbeafe", "#93c5fd", "#4a97cf"];
const muscleContributionMap: Record<string, Partial<Record<MuscleRegion, number>>> = {
  Chest: { chest: 1 },
  "Upper Chest": { chest: 1 },
  "Front Delts": { frontDelts: 1 },
  "Side Delts": { sideDelts: 1 },
  "Rear Delts": { rearDelts: 1 },
  Shoulders: { frontDelts: 0.45, sideDelts: 1, rearDelts: 0.45 },
  Triceps: { triceps: 1 },
  Biceps: { biceps: 1 },
  Lats: { lats: 1 },
  "Upper Back": { upperBack: 1 },
  "Lower Back": { lowerBack: 1 },
  Quads: { quads: 1 },
  Hamstrings: { hamstrings: 1 },
  Glutes: { glutes: 1 },
  Adductors: { adductors: 1 },
  Calves: { calves: 1 },
  "Upper Traps": { upperBack: 0.8, rearDelts: 0.2 }
};

const certaintyTone: Record<CoachingSuggestion["certainty"], string> = {
  low: "tone-low",
  medium: "tone-medium",
  high: "tone-high"
};

const rewardLevelIcon: Record<RewardLevel, string> = {
  set: "🏅",
  exercise: "🎖",
  session: "🏆"
};

function summarizeRewards(rewards: LoggerReward[]): RewardSummary {
  return rewards.reduce(
    (summary, reward) => {
      summary[reward.level] += 1;
      summary.total += 1;
      return summary;
    },
    { set: 0, exercise: 0, session: 0, total: 0 }
  );
}

const genericExerciseImage = `data:image/svg+xml;utf8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" fill="none">
    <rect x="3" y="3" width="82" height="82" rx="20" fill="#F7FAFC"/>
    <circle cx="44" cy="23" r="7" fill="#8A9BB2"/>
    <path d="M30 66L39 44L33 31" stroke="#61728B" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M58 66L49 44L55 31" stroke="#61728B" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M36 35H52" stroke="#24324A" stroke-width="8" stroke-linecap="round"/>
    <path d="M25 28H63" stroke="#4A97CF" stroke-width="6" stroke-linecap="round"/>
    <path d="M44 30V50" stroke="#F48C3A" stroke-width="7" stroke-linecap="round"/>
  </svg>
`)}`;

const primaryMuscleOptions = [
  "Chest",
  "Biceps",
  "Triceps",
  "Back",
  "Middle Back",
  "Traps",
  "Front Shoulders",
  "Side Delts",
  "Rear Delts",
  "Quads",
  "Hamstrings",
  "Hip Flexors",
  "Glutes",
  "Calves",
  "Abs / Core",
  "Obliques",
  "Forearms",
  "Lower Back",
  "Abductors"
];

const primaryMuscleGroups: Array<{ label: string; muscles: string[] }> = [
  { label: "Chest & Push", muscles: ["Chest", "Front Shoulders", "Side Delts", "Triceps"] },
  { label: "Back & Pull", muscles: ["Back", "Middle Back", "Traps", "Rear Delts", "Biceps", "Forearms"] },
  { label: "Legs", muscles: ["Quads", "Hamstrings", "Glutes", "Hip Flexors", "Calves", "Abductors"] },
  { label: "Core", muscles: ["Abs / Core", "Obliques", "Lower Back"] }
];

const secondaryMuscleGroups: Array<{ label: string; muscles: string[] }> = [
  { label: "Chest & Shoulders", muscles: ["Chest", "Upper Chest", "Front Delts", "Front Shoulders", "Side Delts", "Rear Delts"] },
  { label: "Back", muscles: ["Back", "Lats", "Middle Back", "Upper Back", "Lower Back", "Traps"] },
  { label: "Arms", muscles: ["Biceps", "Triceps", "Forearms"] },
  { label: "Legs", muscles: ["Quads", "Hamstrings", "Glutes", "Calves", "Adductors", "Abductors"] },
  { label: "Core", muscles: ["Abs / Core", "Obliques"] }
];

const secondaryMuscleLibrary = [
  "Chest",
  "Upper Chest",
  "Back",
  "Lats",
  "Middle Back",
  "Upper Back",
  "Lower Back",
  "Biceps",
  "Triceps",
  "Forearms",
  "Front Delts",
  "Front Shoulders",
  "Side Delts",
  "Rear Delts",
  "Traps",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Abs / Core",
  "Abs",
  "Core",
  "Obliques",
  "Adductors",
  "Abductors"
];

const customExerciseTypeOptions: Array<{
  value: CustomExerciseType;
  label: string;
}> = [
  { value: "bodyweight_only", label: "Bodyweight only" },
  { value: "bodyweight_weighted", label: "Weighted bodyweight" },
  {
    value: "free_weights_accessories",
    label: "Dumbbells / kettlebells / accessories"
  },
  { value: "barbell", label: "Barbell" },
  { value: "machine", label: "Machine" },
  { value: "freestyle_cardio", label: "Freestyle / cardio" }
];

const customMeasurementOptions: Array<{
  value: MeasurementType;
  label: string;
}> = [
  { value: "timed", label: "Timed" },
  { value: "reps_volume", label: "Reps and volume" },
  { value: "weight_timed", label: "Weight + timed" }
];

const customMovementSideOptions: Array<{
  value: MovementSide;
  label: string;
}> = [
  { value: "unilateral", label: "Unilateral" },
  { value: "bilateral", label: "Bilateral" }
];

const exerciseTypeDescriptions: Record<string, string> = {
  bodyweight_only: "No equipment needed — push-ups, pull-ups, dips",
  bodyweight_weighted: "Bodyweight base + optional load — weighted pull-ups",
  free_weights_accessories: "Dumbbells, kettlebells, cables, bands",
  barbell: "Barbell movements — bench, squat, deadlift",
  machine: "Pin-loaded or plate-loaded machines",
  freestyle_cardio: "Timed effort — runs, rows, bike intervals"
};

const measurementDescriptions: Record<string, string> = {
  timed: "Log time and optional distance — plank, run, bike interval",
  reps_volume: "Log reps and weight per set — bench press, curl, squat",
  weight_timed: "Log weight held and duration — weighted wall sit, weighted plank"
};

const movementSideDescriptions: Record<string, string> = {
  bilateral: "Both sides move together — bench press, squat",
  unilateral: "One side at a time — dumbbell curl, single-leg press"
};

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesSearchTokens(query: string, values: string[]) {
  const queryTokens = normalizeSearchText(query).split(" ").filter(Boolean);
  if (queryTokens.length === 0) {
    return true;
  }

  const haystack = normalizeSearchText(values.join(" "));
  return queryTokens.every((token) => haystack.includes(token));
}

function ensureUniqueExerciseName(name: string, existingNames: string[]) {
  const normalizedExisting = new Set(existingNames.map((entry) => entry.trim().toLowerCase()));
  const requestedName = name.trim();
  if (!normalizedExisting.has(requestedName.toLowerCase())) {
    return requestedName;
  }

  const baseName = requestedName.replace(/_\d+$/, "").trim();
  let nextVersion = 1;

  existingNames.forEach((entry) => {
    const trimmed = entry.trim();
    const match = trimmed.match(new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:_(\\d+))?$`, "i"));
    if (!match) {
      return;
    }

    const suffix = match[1] ? Number(match[1]) : 0;
    nextVersion = Math.max(nextVersion, suffix + 1);
  });

  return `${baseName}_${nextVersion}`;
}

function inferExerciseType(exercise: Pick<ExerciseDraft, "id" | "name" | "exerciseType">): CustomExerciseType {
  if (exercise.exerciseType) {
    return exercise.exerciseType;
  }

  const name = exercise.name.toLowerCase();
  if (/(run|bike|cycle|walk|elliptical|rower|stair|cardio)/.test(name)) {
    return "freestyle_cardio";
  }
  if (/(stretch|mobility|yoga)/.test(name)) {
    return "bodyweight_only";
  }
  if (/(barbell|ez bar|trap bar|smith)/.test(name)) {
    return "barbell";
  }
  if (/(machine|leg press|selectorized|hack squat)/.test(name)) {
    return "machine";
  }
  if (/(dumbbell|kettlebell|landmine|medicine ball|rope|cable|band)/.test(name)) {
    return "free_weights_accessories";
  }
  if (/(push-up|pull-up|chin-up|dip|plank|crunch|sit-up|bodyweight)/.test(name)) {
    return "bodyweight_only";
  }
  return "bodyweight_weighted";
}

function getExerciseTypeLabel(exerciseType: CustomExerciseType) {
  return customExerciseTypeOptions.find((option) => option.value === exerciseType)?.label ?? "Weighted";
}

function createTemplateExercise({
  id,
  name,
  restTimer,
  goal = "hypertrophy",
  imageSrc = genericExerciseImage,
  exerciseType,
  measurementType,
  movementSide,
  primaryMuscle,
  secondaryMuscles,
  howTo,
  videoLabel,
  historySets,
  movementPattern,
  angle,
  equipment,
  difficultyLevel,
}: {
  id: string;
  name: string;
  restTimer: string;
  goal?: ExerciseEvaluationRequest["goal"];
  imageSrc?: string;
  exerciseType?: CustomExerciseType;
  measurementType?: MeasurementType;
  movementSide?: MovementSide;
  primaryMuscle: string;
  secondaryMuscles: string[];
  howTo: string[];
  videoLabel?: string;
  historySets: WorkoutSet[][];
  movementPattern?: MovementPattern;
  angle?: ExerciseAngle;
  equipment?: ExerciseEquipment;
  difficultyLevel?: ExerciseDifficulty;
}): ExerciseWithTaxonomy {
  const normalizedHistorySets =
    historySets.length >= 3
      ? historySets
      : [
          historySets[0],
          historySets[0].map((set) => ({
            ...set,
            weight: Number((set.weight * 0.9).toFixed(1)),
            reps: Math.max(1, set.reps - 1),
            rpe: typeof set.rpe === "number" ? Math.max(5, set.rpe - 0.5) : set.rpe
          })),
          ...historySets.slice(1)
        ];

  return {
    id,
    name,
    note: "",
    stickyNoteEnabled: false,
    restTimer,
    goal,
    imageSrc,
    exerciseType,
    measurementType,
    movementSide,
    primaryMuscle,
    primaryMuscles: [primaryMuscle],
    secondaryMuscles,
    howTo,
    videoLabel,
    history: normalizedHistorySets.map((sets, index) => ({
      date: `2026-01-${["05", "12", "19"][index] ?? "19"}`,
      exercise: name,
      session_key: `${id}-${index + 1}`,
      sets
    })),
    draftSets: [
      { id: `${id}-w`, setType: "warmup", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: `${id}-1`, setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: `${id}-2`, setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: `${id}-3`, setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false }
    ],
    movementPattern,
    angle,
    equipment,
    difficultyLevel,
  };
}

const selectorCategorySamples: ExerciseWithTaxonomy[] = [
  createTemplateExercise({
    id: "barbell-squat",
    name: "Barbell Squat",
    restTimer: "01:45",
    imageSrc: benchPressImage,
    primaryMuscle: "Quads",
    secondaryMuscles: ["Glutes", "Lower Back"],
    movementPattern: "squat", angle: "none", equipment: "barbell", difficultyLevel: "advanced",
    howTo: [
      "Set the bar across the upper back and brace before unracking.",
      "Sit down between the hips while keeping the mid-foot pressure even.",
      "Drive up through the floor and keep the chest stacked over the hips."
    ],
    videoLabel: "Barbell Squat Guide",
    historySets: [
      [
        { weight: 20, reps: 8, set_type: "warmup", rpe: 6, failed: false },
        { weight: 70, reps: 10, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 70, reps: 10, set_type: "normal", rpe: 8, failed: false },
        { weight: 70, reps: 9, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 20, reps: 8, set_type: "warmup", rpe: 6, failed: false },
        { weight: 75, reps: 8, set_type: "normal", rpe: 8, failed: false },
        { weight: 75, reps: 8, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 75, reps: 7, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "ez-bar-curl",
    name: "EZ Bar Curl",
    restTimer: "00:45",
    imageSrc: genericExerciseImage,
    primaryMuscle: "Biceps",
    secondaryMuscles: ["Front Delts"],
    movementPattern: "isolation_pull", angle: "none", equipment: "barbell", difficultyLevel: "beginner",
    howTo: [
      "Start tall with elbows slightly in front of the torso.",
      "Curl the bar without swinging the shoulders forward.",
      "Lower under control until the elbows are nearly straight."
    ],
    videoLabel: "EZ Bar Curl Guide",
    historySets: [
      [
        { weight: 10, reps: 10, set_type: "warmup", rpe: 6, failed: false },
        { weight: 25, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 25, reps: 11, set_type: "normal", rpe: 8, failed: false },
        { weight: 25, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 10, reps: 10, set_type: "warmup", rpe: 6, failed: false },
        { weight: 27.5, reps: 10, set_type: "normal", rpe: 8, failed: false },
        { weight: 27.5, reps: 10, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 27.5, reps: 9, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "rope-pushdown",
    name: "Rope Pushdown",
    restTimer: "00:45",
    imageSrc: genericExerciseImage,
    primaryMuscle: "Triceps",
    secondaryMuscles: ["Front Delts"],
    movementPattern: "isolation_push", angle: "none", equipment: "cable", difficultyLevel: "beginner",
    howTo: [
      "Lock the elbows near the ribs before starting the pushdown.",
      "Spread the rope slightly at the bottom without shrugging.",
      "Control the return until the triceps are fully stretched."
    ],
    videoLabel: "Rope Pushdown Guide",
    historySets: [
      [
        { weight: 10, reps: 12, set_type: "warmup", rpe: 6, failed: false },
        { weight: 20, reps: 15, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 20, reps: 14, set_type: "normal", rpe: 8, failed: false },
        { weight: 20, reps: 13, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 10, reps: 12, set_type: "warmup", rpe: 6, failed: false },
        { weight: 22.5, reps: 12, set_type: "normal", rpe: 8, failed: false },
        { weight: 22.5, reps: 12, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 22.5, reps: 11, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "push-up",
    name: "Push-Up",
    restTimer: "00:45",
    imageSrc: genericExerciseImage,
    primaryMuscle: "Chest",
    secondaryMuscles: ["Front Delts", "Triceps"],
    movementPattern: "horizontal_push", angle: "flat", equipment: "bodyweight", difficultyLevel: "beginner",
    howTo: [
      "Set a long straight plank before the first rep.",
      "Lower as one unit until the chest nearly touches the floor.",
      "Press away while keeping the ribs and hips locked together."
    ],
    videoLabel: "Push-Up Guide",
    historySets: [
      [
        { weight: 0, reps: 8, set_type: "warmup", rpe: 6, failed: false },
        { weight: 0, reps: 15, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 0, reps: 13, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 12, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 0, reps: 8, set_type: "warmup", rpe: 6, failed: false },
        { weight: 0, reps: 18, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 16, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 0, reps: 14, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "pull-up",
    name: "Pull-Up",
    restTimer: "01:15",
    imageSrc: genericExerciseImage,
    primaryMuscle: "Lats",
    secondaryMuscles: ["Upper Back", "Biceps"],
    movementPattern: "vertical_pull", angle: "overhead", equipment: "bodyweight", difficultyLevel: "intermediate",
    howTo: [
      "Start from a dead hang with the ribs down.",
      "Drive elbows toward the hips instead of pulling with the neck.",
      "Lower all the way to full extension under control."
    ],
    videoLabel: "Pull-Up Guide",
    historySets: [
      [
        { weight: 0, reps: 5, set_type: "warmup", rpe: 6, failed: false },
        { weight: 0, reps: 8, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 0, reps: 7, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 6, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 0, reps: 5, set_type: "warmup", rpe: 6, failed: false },
        { weight: 0, reps: 9, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 8, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 0, reps: 7, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "treadmill-run",
    name: "Treadmill Run",
    restTimer: "00:30",
    goal: "strength",
    imageSrc: genericExerciseImage,
    primaryMuscle: "Quads",
    secondaryMuscles: ["Calves", "Glutes"],
    movementPattern: "cardio", angle: "none", equipment: "none", difficultyLevel: "beginner",
    howTo: [
      "Set the pace before stepping fully into the run.",
      "Keep the torso stacked and let the arms swing naturally.",
      "Ease the pace down gradually before stepping off."
    ],
    videoLabel: "Treadmill Run Tips",
    historySets: [
      [
        { weight: 0, reps: 10, set_type: "warmup", rpe: 6, failed: false },
        { weight: 0, reps: 20, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 0, reps: 20, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 15, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 0, reps: 10, set_type: "warmup", rpe: 6, failed: false },
        { weight: 0, reps: 25, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 20, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 0, reps: 15, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "stationary-bike",
    name: "Stationary Bike",
    restTimer: "00:30",
    goal: "strength",
    imageSrc: genericExerciseImage,
    primaryMuscle: "Quads",
    secondaryMuscles: ["Glutes", "Calves"],
    movementPattern: "cardio", angle: "none", equipment: "none", difficultyLevel: "beginner",
    howTo: [
      "Set the saddle height so the knee stays slightly bent at the bottom.",
      "Keep the cadence smooth and avoid rocking the hips.",
      "Let the resistance challenge the legs without losing posture."
    ],
    videoLabel: "Stationary Bike Setup",
    historySets: [
      [
        { weight: 0, reps: 8, set_type: "warmup", rpe: 6, failed: false },
        { weight: 0, reps: 15, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 0, reps: 15, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 12, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 0, reps: 8, set_type: "warmup", rpe: 6, failed: false },
        { weight: 0, reps: 18, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 15, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 0, reps: 12, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "hip-flexor-stretch",
    name: "Hip Flexor Stretch",
    restTimer: "00:30",
    imageSrc: genericExerciseImage,
    primaryMuscle: "Quads",
    secondaryMuscles: ["Glutes"],
    movementPattern: "cardio", angle: "none", equipment: "bodyweight", difficultyLevel: "beginner",
    howTo: [
      "Set a half-kneeling stance and tuck the pelvis under slightly.",
      "Shift forward until the front of the hip opens up.",
      "Breathe slowly and keep the ribcage stacked over the hips."
    ],
    videoLabel: "Hip Flexor Stretch Guide",
    historySets: [
      [
        { weight: 0, reps: 1, set_type: "warmup", rpe: 3, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false }
      ],
      [
        { weight: 0, reps: 1, set_type: "warmup", rpe: 3, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "chest-stretch",
    name: "Chest Stretch",
    restTimer: "00:30",
    imageSrc: genericExerciseImage,
    primaryMuscle: "Chest",
    secondaryMuscles: ["Front Delts"],
    movementPattern: "cardio", angle: "none", equipment: "bodyweight", difficultyLevel: "beginner",
    howTo: [
      "Place the forearm on the wall slightly below shoulder height.",
      "Turn the torso away gently until the chest opens.",
      "Keep the shoulder relaxed instead of forcing the stretch."
    ],
    videoLabel: "Chest Stretch Guide",
    historySets: [
      [
        { weight: 0, reps: 1, set_type: "warmup", rpe: 3, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false }
      ],
      [
        { weight: 0, reps: 1, set_type: "warmup", rpe: 3, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false }
      ]
    ]
  })
];

const expandedExerciseSamples: ExerciseWithTaxonomy[] = [
  createTemplateExercise({
    id: "weighted-pull-up",
    name: "Weighted Pull-Up",
    restTimer: "01:30",
    exerciseType: "bodyweight_weighted",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Back",
    secondaryMuscles: ["Biceps", "Middle Back", "Forearms"],
    movementPattern: "vertical_pull", angle: "overhead", equipment: "bodyweight", difficultyLevel: "intermediate",
    howTo: [
      "Let the load hang still before starting the first rep.",
      "Pull the elbows down toward the hips instead of craning the neck.",
      "Lower to full extension without swinging."
    ],
    videoLabel: "Weighted Pull-Up Guide",
    historySets: [
      [
        { weight: 5, reps: 6, set_type: "warmup", rpe: 6, failed: false },
        { weight: 10, reps: 8, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 10, reps: 7, set_type: "normal", rpe: 8, failed: false },
        { weight: 10, reps: 6, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 5, reps: 6, set_type: "warmup", rpe: 6, failed: false },
        { weight: 12.5, reps: 6, set_type: "normal", rpe: 8, failed: false },
        { weight: 12.5, reps: 6, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 12.5, reps: 5, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "chest-dip",
    name: "Chest Dip",
    restTimer: "01:00",
    exerciseType: "bodyweight_only",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Chest",
    secondaryMuscles: ["Triceps", "Front Shoulders"],
    movementPattern: "vertical_push", angle: "decline", equipment: "bodyweight", difficultyLevel: "intermediate",
    howTo: [
      "Lean slightly forward before starting the descent.",
      "Lower until the chest opens without shrugging the shoulders.",
      "Press back up while keeping tension through the chest."
    ],
    videoLabel: "Chest Dip Guide",
    historySets: [
      [
        { weight: 0, reps: 6, set_type: "warmup", rpe: 6, failed: false },
        { weight: 0, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 0, reps: 11, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 0, reps: 6, set_type: "warmup", rpe: 6, failed: false },
        { weight: 0, reps: 14, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 12, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 0, reps: 10, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "weighted-chest-dip",
    name: "Weighted Chest Dip",
    restTimer: "01:15",
    exerciseType: "bodyweight_weighted",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Chest",
    secondaryMuscles: ["Triceps", "Front Shoulders"],
    movementPattern: "vertical_push", angle: "decline", equipment: "bodyweight", difficultyLevel: "advanced",
    howTo: [
      "Let the load settle before lowering into the dip.",
      "Keep a slight forward lean so the chest stays the main driver.",
      "Press up without rushing the turnaround."
    ],
    videoLabel: "Weighted Chest Dip Guide",
    historySets: [
      [
        { weight: 5, reps: 5, set_type: "warmup", rpe: 6, failed: false },
        { weight: 10, reps: 10, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 10, reps: 9, set_type: "normal", rpe: 8, failed: false },
        { weight: 10, reps: 8, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 5, reps: 5, set_type: "warmup", rpe: 6, failed: false },
        { weight: 12.5, reps: 8, set_type: "normal", rpe: 8, failed: false },
        { weight: 12.5, reps: 8, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 12.5, reps: 7, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "plank",
    name: "Plank",
    restTimer: "00:30",
    exerciseType: "bodyweight_only",
    measurementType: "timed",
    movementSide: "bilateral",
    primaryMuscle: "Abs / Core",
    secondaryMuscles: ["Obliques", "Glutes"],
    movementPattern: "core_anterior", angle: "none", equipment: "bodyweight", difficultyLevel: "beginner",
    howTo: [
      "Brace the abs before lifting into position.",
      "Keep the ribs and hips stacked instead of sagging through the lower back.",
      "Breathe behind the brace while holding the line."
    ],
    videoLabel: "Plank Guide",
    historySets: [
      [
        { weight: 0, reps: 30, set_type: "warmup", rpe: 4, failed: false },
        { weight: 0, reps: 45, set_type: "normal", rpe: 6, failed: false },
        { weight: 0, reps: 45, set_type: "normal", rpe: 6.5, failed: false },
        { weight: 0, reps: 40, set_type: "normal", rpe: 7, failed: false }
      ],
      [
        { weight: 0, reps: 30, set_type: "warmup", rpe: 4, failed: false },
        { weight: 0, reps: 50, set_type: "normal", rpe: 6.5, failed: false },
        { weight: 0, reps: 45, set_type: "normal", rpe: 7, failed: false },
        { weight: 0, reps: 45, set_type: "normal", rpe: 7.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "weighted-plank",
    name: "Weighted Plank",
    restTimer: "00:45",
    exerciseType: "bodyweight_weighted",
    measurementType: "weight_timed",
    movementSide: "bilateral",
    primaryMuscle: "Abs / Core",
    secondaryMuscles: ["Obliques", "Glutes"],
    movementPattern: "core_anterior", angle: "none", equipment: "bodyweight", difficultyLevel: "intermediate",
    howTo: [
      "Set the plate securely before lifting into the hold.",
      "Brace first so the torso stays locked from ribs to hips.",
      "Hold cleanly instead of letting the lower back take over."
    ],
    videoLabel: "Weighted Plank Guide",
    historySets: [
      [
        { weight: 10, reps: 30, set_type: "warmup", rpe: 5, failed: false },
        { weight: 20, reps: 40, set_type: "normal", rpe: 7, failed: false },
        { weight: 20, reps: 35, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 20, reps: 30, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 10, reps: 30, set_type: "warmup", rpe: 5, failed: false },
        { weight: 25, reps: 35, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 25, reps: 35, set_type: "normal", rpe: 8, failed: false },
        { weight: 25, reps: 30, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "weighted-push-up",
    name: "Weighted Push-Up",
    restTimer: "01:00",
    exerciseType: "bodyweight_weighted",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Chest",
    secondaryMuscles: ["Triceps", "Front Shoulders"],
    movementPattern: "horizontal_push", angle: "flat", equipment: "bodyweight", difficultyLevel: "intermediate",
    howTo: [
      "Set the load securely before taking the plank position.",
      "Lower as one unit until the chest nearly reaches the floor.",
      "Drive away while keeping the core tight."
    ],
    videoLabel: "Weighted Push-Up Guide",
    historySets: [
      [
        { weight: 5, reps: 8, set_type: "warmup", rpe: 6, failed: false },
        { weight: 10, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 10, reps: 10, set_type: "normal", rpe: 8, failed: false },
        { weight: 10, reps: 9, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 5, reps: 8, set_type: "warmup", rpe: 6, failed: false },
        { weight: 15, reps: 10, set_type: "normal", rpe: 8, failed: false },
        { weight: 15, reps: 9, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 15, reps: 8, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "wall-sit",
    name: "Wall Sit",
    restTimer: "00:30",
    exerciseType: "bodyweight_only",
    measurementType: "timed",
    movementSide: "bilateral",
    primaryMuscle: "Quads",
    secondaryMuscles: ["Glutes", "Abs / Core"],
    movementPattern: "isolation_legs", angle: "none", equipment: "bodyweight", difficultyLevel: "beginner",
    howTo: [
      "Set the knees close to ninety degrees before starting the hold.",
      "Keep the full foot planted and the lower back supported by the wall.",
      "Hold steady instead of bouncing through the position."
    ],
    videoLabel: "Wall Sit Guide",
    historySets: [
      [
        { weight: 0, reps: 30, set_type: "warmup", rpe: 4, failed: false },
        { weight: 0, reps: 45, set_type: "normal", rpe: 6, failed: false },
        { weight: 0, reps: 45, set_type: "normal", rpe: 6.5, failed: false },
        { weight: 0, reps: 40, set_type: "normal", rpe: 7, failed: false }
      ],
      [
        { weight: 0, reps: 30, set_type: "warmup", rpe: 4, failed: false },
        { weight: 0, reps: 60, set_type: "normal", rpe: 6.5, failed: false },
        { weight: 0, reps: 50, set_type: "normal", rpe: 7, failed: false },
        { weight: 0, reps: 45, set_type: "normal", rpe: 7.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "weighted-wall-sit",
    name: "Weighted Wall Sit",
    restTimer: "00:45",
    exerciseType: "bodyweight_weighted",
    measurementType: "weight_timed",
    movementSide: "bilateral",
    primaryMuscle: "Quads",
    secondaryMuscles: ["Glutes", "Abs / Core"],
    movementPattern: "isolation_legs", angle: "none", equipment: "bodyweight", difficultyLevel: "intermediate",
    howTo: [
      "Set the load securely before settling into the sit.",
      "Hold the knee angle steady rather than drifting upward.",
      "Keep the core braced through the whole hold."
    ],
    videoLabel: "Weighted Wall Sit Guide",
    historySets: [
      [
        { weight: 10, reps: 30, set_type: "warmup", rpe: 5, failed: false },
        { weight: 20, reps: 40, set_type: "normal", rpe: 7, failed: false },
        { weight: 20, reps: 35, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 20, reps: 30, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 10, reps: 30, set_type: "warmup", rpe: 5, failed: false },
        { weight: 25, reps: 35, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 25, reps: 35, set_type: "normal", rpe: 8, failed: false },
        { weight: 25, reps: 30, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "cable-hip-abduction",
    name: "Cable Hip Abduction",
    restTimer: "00:45",
    exerciseType: "free_weights_accessories",
    measurementType: "reps_volume",
    movementSide: "unilateral",
    primaryMuscle: "Abductors",
    secondaryMuscles: ["Glutes"],
    movementPattern: "isolation_legs", angle: "none", equipment: "cable", difficultyLevel: "beginner",
    howTo: [
      "Brace against the stack before moving the working leg out.",
      "Lead from the hip instead of swinging the foot.",
      "Return slowly so the glute med stays loaded."
    ],
    videoLabel: "Cable Hip Abduction Guide",
    historySets: [
      [
        { weight: 5, reps: 12, set_type: "warmup", rpe: 5, failed: false },
        { weight: 10, reps: 15, set_type: "normal", rpe: 7, failed: false },
        { weight: 10, reps: 14, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 10, reps: 12, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 5, reps: 12, set_type: "warmup", rpe: 5, failed: false },
        { weight: 12.5, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 12.5, reps: 12, set_type: "normal", rpe: 8, failed: false },
        { weight: 12.5, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "standing-calf-raise",
    name: "Standing Calf Raise",
    restTimer: "00:45",
    exerciseType: "machine",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Calves",
    secondaryMuscles: ["Glutes"],
    movementPattern: "isolation_legs", angle: "none", equipment: "machine", difficultyLevel: "beginner",
    howTo: [
      "Let the heels drop into a full stretch at the bottom.",
      "Drive up through the big toe and hold the top briefly.",
      "Lower slowly instead of bouncing."
    ],
    videoLabel: "Standing Calf Raise Guide",
    historySets: [
      [
        { weight: 20, reps: 12, set_type: "warmup", rpe: 5, failed: false },
        { weight: 40, reps: 18, set_type: "normal", rpe: 7, failed: false },
        { weight: 40, reps: 16, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 40, reps: 15, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 20, reps: 12, set_type: "warmup", rpe: 5, failed: false },
        { weight: 50, reps: 15, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 50, reps: 15, set_type: "normal", rpe: 8, failed: false },
        { weight: 50, reps: 14, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "wrist-curl",
    name: "Wrist Curl",
    restTimer: "00:45",
    exerciseType: "free_weights_accessories",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Forearms",
    secondaryMuscles: ["Biceps"],
    movementPattern: "isolation_pull", angle: "none", equipment: "dumbbell", difficultyLevel: "beginner",
    howTo: [
      "Let the wrist extend first to find the full range.",
      "Curl through the forearm without lifting the whole arm.",
      "Lower under control instead of dropping the weight."
    ],
    videoLabel: "Wrist Curl Guide",
    historySets: [
      [
        { weight: 5, reps: 15, set_type: "warmup", rpe: 5, failed: false },
        { weight: 10, reps: 18, set_type: "normal", rpe: 7, failed: false },
        { weight: 10, reps: 16, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 10, reps: 15, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 5, reps: 15, set_type: "warmup", rpe: 5, failed: false },
        { weight: 12.5, reps: 15, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 12.5, reps: 15, set_type: "normal", rpe: 8, failed: false },
        { weight: 12.5, reps: 14, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "chest-supported-row",
    name: "Chest Supported Row",
    restTimer: "01:00",
    exerciseType: "free_weights_accessories",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Middle Back",
    secondaryMuscles: ["Back", "Rear Delts", "Biceps"],
    movementPattern: "horizontal_pull", angle: "prone", equipment: "dumbbell", difficultyLevel: "beginner",
    howTo: [
      "Set the chest firmly against the bench before pulling.",
      "Drive the elbows back without shrugging the shoulders.",
      "Control the stretch through the upper back on the way down."
    ],
    videoLabel: "Chest Supported Row Guide",
    historySets: [
      [
        { weight: 12.5, reps: 10, set_type: "warmup", rpe: 5, failed: false },
        { weight: 22.5, reps: 12, set_type: "normal", rpe: 7, failed: false },
        { weight: 22.5, reps: 11, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 22.5, reps: 10, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 12.5, reps: 10, set_type: "warmup", rpe: 5, failed: false },
        { weight: 25, reps: 10, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 25, reps: 10, set_type: "normal", rpe: 8, failed: false },
        { weight: 25, reps: 9, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "back-extension",
    name: "Back Extension",
    restTimer: "00:45",
    exerciseType: "bodyweight_only",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Lower Back",
    secondaryMuscles: ["Glutes", "Hamstrings"],
    movementPattern: "hip_hinge", angle: "prone", equipment: "bodyweight", difficultyLevel: "beginner",
    howTo: [
      "Brace before hinging over the pad.",
      "Lift by extending through the hips and lower back together.",
      "Stop at a straight line instead of overextending."
    ],
    videoLabel: "Back Extension Guide",
    historySets: [
      [
        { weight: 0, reps: 10, set_type: "warmup", rpe: 5, failed: false },
        { weight: 0, reps: 15, set_type: "normal", rpe: 7, failed: false },
        { weight: 0, reps: 14, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 0, reps: 12, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 0, reps: 10, set_type: "warmup", rpe: 5, failed: false },
        { weight: 0, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 0, reps: 12, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "weighted-back-extension",
    name: "Weighted Back Extension",
    restTimer: "01:00",
    exerciseType: "bodyweight_weighted",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Lower Back",
    secondaryMuscles: ["Glutes", "Hamstrings"],
    movementPattern: "hip_hinge", angle: "prone", equipment: "bodyweight", difficultyLevel: "intermediate",
    howTo: [
      "Hold a plate or dumbbell against the chest before setting up on the pad.",
      "Brace the core and hinge down slowly under control.",
      "Extend through the hips and lower back to a straight line — avoid hyperextending."
    ],
    videoLabel: "Weighted Back Extension Guide",
    historySets: [
      [
        { weight: 0, reps: 10, set_type: "warmup", rpe: 5, failed: false },
        { weight: 10, reps: 12, set_type: "normal", rpe: 7, failed: false },
        { weight: 10, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 10, reps: 10, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 0, reps: 10, set_type: "warmup", rpe: 5, failed: false },
        { weight: 15, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 15, reps: 11, set_type: "normal", rpe: 8, failed: false },
        { weight: 15, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "dumbbell-shrug",
    name: "Dumbbell Shrug",
    restTimer: "00:45",
    exerciseType: "free_weights_accessories",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Traps",
    secondaryMuscles: ["Forearms"],
    movementPattern: "isolation_pull", angle: "none", equipment: "dumbbell", difficultyLevel: "beginner",
    howTo: [
      "Stand tall and let the shoulders settle before each rep.",
      "Lift the shoulders straight up without rolling them.",
      "Pause briefly at the top before lowering."
    ],
    videoLabel: "Dumbbell Shrug Guide",
    historySets: [
      [
        { weight: 12.5, reps: 12, set_type: "warmup", rpe: 5, failed: false },
        { weight: 22.5, reps: 15, set_type: "normal", rpe: 7, failed: false },
        { weight: 22.5, reps: 14, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 22.5, reps: 12, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 12.5, reps: 12, set_type: "warmup", rpe: 5, failed: false },
        { weight: 25, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 25, reps: 12, set_type: "normal", rpe: 8, failed: false },
        { weight: 25, reps: 11, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "barbell-hip-thrust",
    name: "Barbell Hip Thrust",
    restTimer: "01:15",
    exerciseType: "barbell",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Glutes",
    secondaryMuscles: ["Hamstrings", "Abs / Core"],
    movementPattern: "hip_hinge", angle: "none", equipment: "barbell", difficultyLevel: "intermediate",
    howTo: [
      "Set the bench against the shoulder blades before unracking the bar.",
      "Drive through the heels and squeeze the glutes hard at the top.",
      "Lower under control without losing the ribcage position."
    ],
    videoLabel: "Barbell Hip Thrust Guide",
    historySets: [
      [
        { weight: 30, reps: 10, set_type: "warmup", rpe: 5, failed: false },
        { weight: 80, reps: 12, set_type: "normal", rpe: 7, failed: false },
        { weight: 80, reps: 11, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 80, reps: 10, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 30, reps: 10, set_type: "warmup", rpe: 5, failed: false },
        { weight: 90, reps: 10, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 90, reps: 10, set_type: "normal", rpe: 8, failed: false },
        { weight: 90, reps: 9, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "hanging-leg-raise",
    name: "Hanging Leg Raise",
    restTimer: "00:45",
    exerciseType: "bodyweight_only",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Abs / Core",
    secondaryMuscles: ["Obliques", "Hip Flexors"],
    movementPattern: "core_anterior", angle: "none", equipment: "bodyweight", difficultyLevel: "intermediate",
    howTo: [
      "Set the ribs down before lifting the legs.",
      "Raise with the abs instead of swinging the torso.",
      "Lower slowly to keep tension through the midline."
    ],
    videoLabel: "Hanging Leg Raise Guide",
    historySets: [
      [
        { weight: 0, reps: 8, set_type: "warmup", rpe: 5, failed: false },
        { weight: 0, reps: 15, set_type: "normal", rpe: 7, failed: false },
        { weight: 0, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 0, reps: 10, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 0, reps: 8, set_type: "warmup", rpe: 5, failed: false },
        { weight: 0, reps: 18, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 0, reps: 14, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 12, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "cable-wood-chop",
    name: "Cable Wood Chop",
    restTimer: "00:45",
    exerciseType: "free_weights_accessories",
    measurementType: "reps_volume",
    movementSide: "unilateral",
    primaryMuscle: "Obliques",
    secondaryMuscles: ["Abs / Core", "Glutes"],
    movementPattern: "core_rotational", angle: "none", equipment: "cable", difficultyLevel: "intermediate",
    howTo: [
      "Brace before rotating away from the stack.",
      "Turn through the torso, not just the arms.",
      "Finish under control and resist the pull back."
    ],
    videoLabel: "Cable Wood Chop Guide",
    historySets: [
      [
        { weight: 5, reps: 10, set_type: "warmup", rpe: 5, failed: false },
        { weight: 12.5, reps: 15, set_type: "normal", rpe: 7, failed: false },
        { weight: 12.5, reps: 14, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 12.5, reps: 12, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 5, reps: 10, set_type: "warmup", rpe: 5, failed: false },
        { weight: 15, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 15, reps: 12, set_type: "normal", rpe: 8, failed: false },
        { weight: 15, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "reverse-pec-deck",
    name: "Reverse Pec Deck",
    restTimer: "00:45",
    exerciseType: "machine",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Rear Delts",
    secondaryMuscles: ["Middle Back", "Traps"],
    movementPattern: "isolation_pull", angle: "prone", equipment: "machine", difficultyLevel: "beginner",
    howTo: [
      "Set the handles so the shoulders stay slightly below the ears.",
      "Sweep out and back without arching the lower back.",
      "Control the return so the rear delts stay loaded."
    ],
    videoLabel: "Reverse Pec Deck Guide",
    historySets: [
      [
        { weight: 10, reps: 12, set_type: "warmup", rpe: 5, failed: false },
        { weight: 25, reps: 15, set_type: "normal", rpe: 7, failed: false },
        { weight: 25, reps: 14, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 25, reps: 12, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 10, reps: 12, set_type: "warmup", rpe: 5, failed: false },
        { weight: 30, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 30, reps: 12, set_type: "normal", rpe: 8, failed: false },
        { weight: 30, reps: 11, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "dumbbell-front-raise",
    name: "Dumbbell Front Raise",
    restTimer: "00:45",
    exerciseType: "free_weights_accessories",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Front Shoulders",
    secondaryMuscles: ["Upper Chest", "Side Delts"],
    movementPattern: "isolation_push", angle: "flat", equipment: "dumbbell", difficultyLevel: "beginner",
    howTo: [
      "Lift with a soft elbow and a quiet torso.",
      "Raise only to shoulder height so the front delts stay loaded.",
      "Lower slowly without swinging."
    ],
    videoLabel: "Dumbbell Front Raise Guide",
    historySets: [
      [
        { weight: 5, reps: 12, set_type: "warmup", rpe: 5, failed: false },
        { weight: 10, reps: 15, set_type: "normal", rpe: 7, failed: false },
        { weight: 10, reps: 14, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 10, reps: 12, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 5, reps: 12, set_type: "warmup", rpe: 5, failed: false },
        { weight: 12.5, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 12.5, reps: 12, set_type: "normal", rpe: 8, failed: false },
        { weight: 12.5, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  })
];

const seededCustomExercises: ExerciseWithTaxonomy[] = [
  createTemplateExercise({
    id: "custom-landmine-press",
    name: "Landmine Press",
    restTimer: "01:00",
    imageSrc: genericExerciseImage,
    primaryMuscle: "Shoulders",
    secondaryMuscles: ["Upper Chest", "Triceps"],
    movementPattern: "vertical_push", angle: "overhead", equipment: "landmine", difficultyLevel: "intermediate",
    howTo: [
      "Set the bar in the landmine and start with the elbow slightly in front.",
      "Press up and forward without over-arching the lower back.",
      "Lower under control to the shoulder line."
    ],
    videoLabel: "Landmine Press Guide",
    historySets: [
      [
        { weight: 10, reps: 10, set_type: "warmup", rpe: 6, failed: false },
        { weight: 20, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 20, reps: 11, set_type: "normal", rpe: 8, failed: false },
        { weight: 20, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 10, reps: 10, set_type: "warmup", rpe: 6, failed: false },
        { weight: 22.5, reps: 10, set_type: "normal", rpe: 8, failed: false },
        { weight: 22.5, reps: 10, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 22.5, reps: 9, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "custom-cossack-squat",
    name: "Cossack Squat",
    restTimer: "00:45",
    imageSrc: genericExerciseImage,
    primaryMuscle: "Adductors",
    secondaryMuscles: ["Glutes", "Quads"],
    movementPattern: "lunge", angle: "none", equipment: "bodyweight", difficultyLevel: "intermediate",
    howTo: [
      "Shift into one hip while keeping the other leg long.",
      "Sit as deep as mobility allows without rounding the trunk.",
      "Push through the bent leg to return to center."
    ],
    videoLabel: "Cossack Squat Guide",
    historySets: [
      [
        { weight: 0, reps: 6, set_type: "warmup", rpe: 5, failed: false },
        { weight: 0, reps: 10, set_type: "normal", rpe: 7, failed: false },
        { weight: 0, reps: 10, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 0, reps: 8, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 0, reps: 6, set_type: "warmup", rpe: 5, failed: false },
        { weight: 0, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 0, reps: 10, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  })
];

const exerciseLibrary: ExerciseWithTaxonomy[] = [
  {
    id: "bench-press",
    name: "Bench Press",
    note: "",
    restTimer: "01:30",
    goal: "hypertrophy",
    imageSrc: benchPressImage,
    primaryMuscle: "Chest",
    secondaryMuscles: ["Front Delts", "Triceps"],
    movementPattern: "horizontal_push",
    angle: "flat",
    equipment: "barbell",
    difficultyLevel: "intermediate",
    exerciseType: "barbell",
    howTo: [
      "Set your eyes under the bar and plant your feet before unracking.",
      "Lower the bar to your mid-chest with controlled elbows.",
      "Press back up while keeping the upper back tight against the bench."
    ],
    videoLabel: "Bench Press Form Video",
    history: [
      {
        date: "2026-01-05",
        exercise: "Bench Press",
        session_key: "bench-week-1",
        sets: [
          { weight: 60, reps: 10, set_type: "warmup", rpe: 6.5, failed: false },
          { weight: 80, reps: 10, set_type: "normal", rpe: 7.5, failed: false },
          { weight: 80, reps: 10, set_type: "normal", rpe: 7.5, failed: false },
          { weight: 80, reps: 10, set_type: "normal", rpe: 8, failed: false }
        ]
      },
      {
        date: "2026-01-12",
        exercise: "Bench Press",
        session_key: "bench-week-2",
        sets: [
          { weight: 60, reps: 10, set_type: "warmup", rpe: 6.5, failed: false },
          { weight: 80, reps: 11, set_type: "normal", rpe: 8, failed: false },
          { weight: 80, reps: 11, set_type: "normal", rpe: 8, failed: false },
          { weight: 80, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
        ]
      },
      {
        date: "2026-01-19",
        exercise: "Bench Press",
        session_key: "bench-week-3",
        sets: [
          { weight: 60, reps: 10, set_type: "warmup", rpe: 6.5, failed: false },
          { weight: 80, reps: 12, set_type: "normal", rpe: 8, failed: false },
          { weight: 80, reps: 12, set_type: "normal", rpe: 8, failed: false },
          { weight: 80, reps: 11, set_type: "normal", rpe: 8.5, failed: false }
        ]
      }
    ],
    draftSets: [
      { id: "bench-w", setType: "warmup", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "bench-1", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "bench-2", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "bench-3", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false }
    ]
  },
  {
    id: "incline-dumbbell-press",
    name: "Incline Dumbbell Press",
    note: "",
    restTimer: "01:00",
    goal: "hypertrophy",
    imageSrc: inclineDumbbellPressImage,
    primaryMuscle: "Upper Chest",
    secondaryMuscles: ["Front Delts", "Triceps"],
    movementPattern: "horizontal_push",
    angle: "incline",
    equipment: "dumbbell",
    difficultyLevel: "beginner",
    exerciseType: "free_weights_accessories",
    howTo: [
      "Set the bench incline before picking the dumbbells up into position.",
      "Lower the bells with elbows slightly tucked and wrists stacked.",
      "Drive upward in an arc that keeps tension through the upper chest."
    ],
    videoLabel: "Incline Dumbbell Press Guide",
    history: [
      {
        date: "2026-01-05",
        exercise: "Incline Dumbbell Press",
        session_key: "incline-week-1",
        sets: [
          { weight: 20, reps: 12, set_type: "warmup", rpe: 6, failed: false },
          { weight: 30, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
          { weight: 30, reps: 11, set_type: "normal", rpe: 8, failed: false },
          { weight: 30, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
        ]
      },
      {
        date: "2026-01-12",
        exercise: "Incline Dumbbell Press",
        session_key: "incline-week-2",
        sets: [
          { weight: 20, reps: 12, set_type: "warmup", rpe: 6, failed: false },
          { weight: 32.5, reps: 10, set_type: "normal", rpe: 8, failed: false },
          { weight: 32.5, reps: 10, set_type: "normal", rpe: 8.5, failed: false },
          { weight: 32.5, reps: 9, set_type: "normal", rpe: 9, failed: false }
        ]
      },
      {
        date: "2026-01-19",
        exercise: "Incline Dumbbell Press",
        session_key: "incline-week-3",
        sets: [
          { weight: 20, reps: 12, set_type: "warmup", rpe: 6, failed: false },
          { weight: 32.5, reps: 11, set_type: "normal", rpe: 8, failed: false },
          { weight: 32.5, reps: 10, set_type: "normal", rpe: 8.5, failed: false },
          { weight: 32.5, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
        ]
      }
    ],
    draftSets: [
      { id: "incline-w", setType: "warmup", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "incline-1", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "incline-2", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "incline-3", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false }
    ]
  }
];

const exerciseTemplates: ExerciseWithTaxonomy[] = [
  ...exerciseLibrary,
  {
    id: "lat-pulldown",
    name: "Lat Pulldown",
    note: "",
    restTimer: "01:00",
    goal: "hypertrophy",
    imageSrc: inclineDumbbellPressImage,
    primaryMuscle: "Lats",
    secondaryMuscles: ["Upper Back", "Biceps"],
    exerciseType: "machine" as const,
    movementPattern: "vertical_pull" as const,
    angle: "overhead" as const,
    equipment: "cable" as const,
    difficultyLevel: "beginner" as const,
    howTo: [
      "Set the thigh pad so you stay locked into the seat.",
      "Drive elbows down toward your ribs without swinging your torso.",
      "Control the upward stretch before starting the next rep."
    ],
    videoLabel: "Lat Pulldown Technique Guide",
    history: [
      {
        date: "2026-01-12",
        exercise: "Lat Pulldown",
        session_key: "lat-pulldown-1",
        sets: [
          { weight: 25, reps: 10, set_type: "warmup", rpe: 6, failed: false },
          { weight: 50, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
          { weight: 50, reps: 11, set_type: "normal", rpe: 8, failed: false },
          { weight: 50, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
        ]
      },
      {
        date: "2026-01-19",
        exercise: "Lat Pulldown",
        session_key: "lat-pulldown-2",
        sets: [
          { weight: 25, reps: 10, set_type: "warmup", rpe: 6, failed: false },
          { weight: 55, reps: 11, set_type: "normal", rpe: 8, failed: false },
          { weight: 55, reps: 10, set_type: "normal", rpe: 8.5, failed: false },
          { weight: 55, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
        ]
      }
    ],
    draftSets: [
      { id: "lat-w", setType: "warmup", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "lat-1", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "lat-2", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "lat-3", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false }
    ]
  },
  {
    id: "seated-cable-row",
    name: "Seated Cable Row",
    note: "",
    restTimer: "01:00",
    goal: "hypertrophy",
    imageSrc: benchPressImage,
    primaryMuscle: "Upper Back",
    secondaryMuscles: ["Lats", "Biceps", "Rear Delts"],
    movementPattern: "horizontal_pull" as const,
    angle: "flat" as const,
    equipment: "cable" as const,
    difficultyLevel: "beginner" as const,
    howTo: [
      "Brace your feet and sit tall before starting the pull.",
      "Drive elbows back while keeping the chest lifted.",
      "Let the shoulder blades protract under control on the return."
    ],
    videoLabel: "Seated Cable Row Guide",
    history: [
      {
        date: "2026-01-12",
        exercise: "Seated Cable Row",
        session_key: "row-1",
        sets: [
          { weight: 20, reps: 10, set_type: "warmup", rpe: 6, failed: false },
          { weight: 60, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
          { weight: 60, reps: 12, set_type: "normal", rpe: 8, failed: false },
          { weight: 60, reps: 11, set_type: "normal", rpe: 8.5, failed: false }
        ]
      },
      {
        date: "2026-01-19",
        exercise: "Seated Cable Row",
        session_key: "row-2",
        sets: [
          { weight: 20, reps: 10, set_type: "warmup", rpe: 6, failed: false },
          { weight: 60, reps: 12, set_type: "normal", rpe: 8, failed: false },
          { weight: 60, reps: 12, set_type: "normal", rpe: 8, failed: false },
          { weight: 60, reps: 12, set_type: "normal", rpe: 8.5, failed: false }
        ]
      }
    ],
    draftSets: [
      { id: "row-w", setType: "warmup", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "row-1", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "row-2", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "row-3", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false }
    ]
  },
  {
    id: "shoulder-press",
    name: "Shoulder Press",
    note: "",
    restTimer: "01:00",
    goal: "hypertrophy",
    imageSrc: inclineDumbbellPressImage,
    primaryMuscle: "Shoulders",
    secondaryMuscles: ["Triceps", "Upper Chest"],
    exerciseType: "free_weights_accessories" as const,
    movementPattern: "vertical_push" as const,
    angle: "overhead" as const,
    equipment: "dumbbell" as const,
    difficultyLevel: "intermediate" as const,
    howTo: [
      "Stack wrists over elbows before pressing overhead.",
      "Keep the ribcage down instead of leaning back.",
      "Finish with the biceps near the ears without shrugging."
    ],
    videoLabel: "Shoulder Press Guide",
    history: [
      {
        date: "2026-01-12",
        exercise: "Shoulder Press",
        session_key: "shoulder-press-1",
        sets: [
          { weight: 12.5, reps: 10, set_type: "warmup", rpe: 6, failed: false },
          { weight: 22.5, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
          { weight: 22.5, reps: 11, set_type: "normal", rpe: 8, failed: false },
          { weight: 22.5, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
        ]
      },
      {
        date: "2026-01-19",
        exercise: "Shoulder Press",
        session_key: "shoulder-press-2",
        sets: [
          { weight: 12.5, reps: 10, set_type: "warmup", rpe: 6, failed: false },
          { weight: 25, reps: 10, set_type: "normal", rpe: 8, failed: false },
          { weight: 25, reps: 10, set_type: "normal", rpe: 8.5, failed: false },
          { weight: 25, reps: 9, set_type: "normal", rpe: 9, failed: false }
        ]
      }
    ],
    draftSets: [
      { id: "sp-w", setType: "warmup", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "sp-1", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "sp-2", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "sp-3", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false }
    ]
  },
  {
    id: "leg-press",
    name: "Leg Press",
    note: "",
    restTimer: "01:30",
    goal: "hypertrophy",
    imageSrc: benchPressImage,
    primaryMuscle: "Quads",
    secondaryMuscles: ["Glutes", "Adductors"],
    movementPattern: "squat" as const,
    angle: "none" as const,
    equipment: "machine" as const,
    difficultyLevel: "beginner" as const,
    howTo: [
      "Plant the full foot on the platform before unlocking.",
      "Lower until the knees and hips are deeply bent without the hips lifting.",
      "Drive through mid-foot and keep the knees tracking over the toes."
    ],
    videoLabel: "Leg Press Setup",
    history: [
      {
        date: "2026-01-12",
        exercise: "Leg Press",
        session_key: "leg-press-1",
        sets: [
          { weight: 80, reps: 12, set_type: "warmup", rpe: 6, failed: false },
          { weight: 160, reps: 15, set_type: "normal", rpe: 7.5, failed: false },
          { weight: 160, reps: 14, set_type: "normal", rpe: 8, failed: false },
          { weight: 160, reps: 13, set_type: "normal", rpe: 8.5, failed: false }
        ]
      },
      {
        date: "2026-01-19",
        exercise: "Leg Press",
        session_key: "leg-press-2",
        sets: [
          { weight: 80, reps: 12, set_type: "warmup", rpe: 6, failed: false },
          { weight: 180, reps: 12, set_type: "normal", rpe: 8, failed: false },
          { weight: 180, reps: 12, set_type: "normal", rpe: 8.5, failed: false },
          { weight: 180, reps: 11, set_type: "normal", rpe: 9, failed: false }
        ]
      }
    ],
    draftSets: [
      { id: "lp-w", setType: "warmup", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "lp-1", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "lp-2", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "lp-3", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false }
    ]
  },
  {
    id: "romanian-deadlift",
    name: "Romanian Deadlift",
    note: "",
    restTimer: "01:30",
    goal: "hypertrophy",
    imageSrc: benchPressImage,
    primaryMuscle: "Hamstrings",
    secondaryMuscles: ["Glutes", "Lower Back"],
    exerciseType: "barbell" as const,
    movementPattern: "hip_hinge" as const,
    angle: "none" as const,
    equipment: "barbell" as const,
    difficultyLevel: "intermediate" as const,
    howTo: [
      "Unlock the knees and push the hips back before the bar drifts forward.",
      "Keep the lats tight so the weight stays close to the legs.",
      "Stand tall by driving the hips through, not by leaning back."
    ],
    videoLabel: "Romanian Deadlift Guide",
    history: [
      {
        date: "2026-01-12",
        exercise: "Romanian Deadlift",
        session_key: "rdl-1",
        sets: [
          { weight: 40, reps: 10, set_type: "warmup", rpe: 6, failed: false },
          { weight: 80, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
          { weight: 80, reps: 12, set_type: "normal", rpe: 8, failed: false },
          { weight: 80, reps: 11, set_type: "normal", rpe: 8.5, failed: false }
        ]
      },
      {
        date: "2026-01-19",
        exercise: "Romanian Deadlift",
        session_key: "rdl-2",
        sets: [
          { weight: 40, reps: 10, set_type: "warmup", rpe: 6, failed: false },
          { weight: 90, reps: 10, set_type: "normal", rpe: 8, failed: false },
          { weight: 90, reps: 10, set_type: "normal", rpe: 8.5, failed: false },
          { weight: 90, reps: 9, set_type: "normal", rpe: 9, failed: false }
        ]
      }
    ],
    draftSets: [
      { id: "rdl-w", setType: "warmup", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "rdl-1", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "rdl-2", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "rdl-3", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false }
    ]
  },
  {
    id: "cable-lateral-raise",
    name: "Cable Lateral Raise",
    note: "",
    restTimer: "00:45",
    goal: "hypertrophy",
    imageSrc: inclineDumbbellPressImage,
    primaryMuscle: "Side Delts",
    secondaryMuscles: ["Upper Traps"],
    movementPattern: "isolation_push" as const,
    angle: "none" as const,
    equipment: "cable" as const,
    difficultyLevel: "beginner" as const,
    howTo: [
      "Start slightly in front of the cable stack with a soft elbow.",
      "Raise out and slightly forward until the hand reaches shoulder height.",
      "Lower under control without letting the stack crash."
    ],
    videoLabel: "Cable Lateral Raise Guide",
    history: [
      {
        date: "2026-01-12",
        exercise: "Cable Lateral Raise",
        session_key: "clr-1",
        sets: [
          { weight: 5, reps: 12, set_type: "warmup", rpe: 6, failed: false },
          { weight: 10, reps: 15, set_type: "normal", rpe: 7.5, failed: false },
          { weight: 10, reps: 14, set_type: "normal", rpe: 8, failed: false },
          { weight: 10, reps: 13, set_type: "normal", rpe: 8.5, failed: false }
        ]
      },
      {
        date: "2026-01-19",
        exercise: "Cable Lateral Raise",
        session_key: "clr-2",
        sets: [
          { weight: 5, reps: 12, set_type: "warmup", rpe: 6, failed: false },
          { weight: 12.5, reps: 12, set_type: "normal", rpe: 8, failed: false },
          { weight: 12.5, reps: 12, set_type: "normal", rpe: 8.5, failed: false },
          { weight: 12.5, reps: 11, set_type: "normal", rpe: 9, failed: false }
        ]
      }
    ],
    draftSets: [
      { id: "clr-w", setType: "warmup", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "clr-1", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "clr-2", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "clr-3", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false }
    ]
  },
  {
    id: "hamstring-curl",
    name: "Hamstring Curl",
    note: "",
    restTimer: "00:45",
    goal: "hypertrophy",
    imageSrc: benchPressImage,
    primaryMuscle: "Hamstrings",
    secondaryMuscles: ["Calves"],
    exerciseType: "machine" as const,
    movementPattern: "isolation_legs" as const,
    angle: "prone" as const,
    equipment: "machine" as const,
    difficultyLevel: "beginner" as const,
    howTo: [
      "Set the machine so the pad sits just above the heels.",
      "Curl smoothly without lifting the hips off the bench.",
      "Control the lowering phase all the way back to full stretch."
    ],
    videoLabel: "Hamstring Curl Guide",
    history: [
      {
        date: "2026-01-12",
        exercise: "Hamstring Curl",
        session_key: "hc-1",
        sets: [
          { weight: 20, reps: 12, set_type: "warmup", rpe: 6, failed: false },
          { weight: 35, reps: 15, set_type: "normal", rpe: 7.5, failed: false },
          { weight: 35, reps: 14, set_type: "normal", rpe: 8, failed: false },
          { weight: 35, reps: 13, set_type: "normal", rpe: 8.5, failed: false }
        ]
      },
      {
        date: "2026-01-19",
        exercise: "Hamstring Curl",
        session_key: "hc-2",
        sets: [
          { weight: 20, reps: 12, set_type: "warmup", rpe: 6, failed: false },
          { weight: 40, reps: 12, set_type: "normal", rpe: 8, failed: false },
          { weight: 40, reps: 12, set_type: "normal", rpe: 8.5, failed: false },
          { weight: 40, reps: 11, set_type: "normal", rpe: 9, failed: false }
        ]
      }
    ],
    draftSets: [
      { id: "hc-w", setType: "warmup", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "hc-1", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "hc-2", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "hc-3", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false }
    ]
  },
  ...selectorCategorySamples,
  ...expandedExerciseSamples
];

// ── Smart Replace catalog ─────────────────────────────────────────────────────
// Full taxonomy-tagged exercise pool used for Smart Replace scoring.
// Separate from exerciseTemplates so the selector remains unchanged.
function makeExercise(
  id: string,
  name: string,
  primaryMuscle: string,
  secondaryMuscles: string[],
  movementPattern: MovementPattern,
  angle: ExerciseAngle,
  equipment: ExerciseEquipment,
  difficultyLevel: ExerciseDifficulty,
  exerciseType: CustomExerciseType,
  restTimer: string,
  howTo: string[],
): ExerciseWithTaxonomy {
  const img = (equipment === "dumbbell" || equipment === "cable" || equipment === "none" || equipment === "bodyweight")
    ? inclineDumbbellPressImage
    : benchPressImage;
  return {
    id,
    name,
    note: "",
    restTimer,
    goal: "hypertrophy",
    imageSrc: img,
    primaryMuscle,
    secondaryMuscles,
    howTo,
    history: [],
    draftSets: [
      { id: `${id}-1`, setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: `${id}-2`, setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: `${id}-3`, setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false }
    ],
    movementPattern,
    angle,
    equipment,
    difficultyLevel,
    exerciseType
  };
}

const smartReplaceCatalog: ExerciseWithTaxonomy[] = [
  // ── Horizontal Push ──────────────────────────────────────────────────────────
  makeExercise("bench-press", "Bench Press", "Chest", ["Front Delts", "Triceps"], "horizontal_push", "flat", "barbell", "intermediate", "barbell", "01:30", ["Plant your feet, set your upper back tight before unracking.", "Lower the bar to mid-chest with controlled elbows.", "Press up keeping the upper back pinned."]),
  makeExercise("dumbbell-bench-press", "Dumbbell Bench Press", "Chest", ["Front Delts", "Triceps"], "horizontal_push", "flat", "dumbbell", "beginner", "free_weights_accessories", "01:30", ["Kick the dumbbells up with a tight upper back.", "Lower with stacked wrists, elbows slightly tucked.", "Press together and up."]),
  makeExercise("machine-chest-press", "Machine Chest Press", "Chest", ["Front Delts", "Triceps"], "horizontal_push", "flat", "machine", "beginner", "machine", "01:00", ["Adjust seat so handles align with lower chest.", "Press without shrugging or losing rib position.", "Control the return."]),
  makeExercise("cable-chest-press", "Cable Chest Press", "Chest", ["Front Delts", "Triceps"], "horizontal_push", "flat", "cable", "beginner", "machine", "01:00", ["Set cable at chest height, step forward for tension.", "Press forward and slightly together.", "Control the return to stretch the chest."]),
  makeExercise("push-up", "Push-Up", "Chest", ["Front Delts", "Triceps", "Core"], "horizontal_push", "flat", "bodyweight", "beginner", "bodyweight_only", "00:45", ["Set a long straight plank before the first rep.", "Lower as one unit until the chest nearly touches the floor.", "Press away keeping ribs and hips locked."]),
  makeExercise("incline-barbell-press", "Incline Barbell Press", "Upper Chest", ["Front Delts", "Triceps"], "horizontal_push", "incline", "barbell", "intermediate", "barbell", "01:30", ["Set bench to 30-45 degrees, grip slightly narrower than flat.", "Lower to upper chest with controlled elbows.", "Press up and slightly back."]),
  makeExercise("incline-dumbbell-press", "Incline Dumbbell Press", "Upper Chest", ["Front Delts", "Triceps"], "horizontal_push", "incline", "dumbbell", "beginner", "free_weights_accessories", "01:00", ["Set the bench incline before picking the dumbbells up.", "Lower with elbows slightly tucked and wrists stacked.", "Drive upward in an arc through the upper chest."]),
  makeExercise("incline-machine-press", "Incline Machine Press", "Upper Chest", ["Front Delts", "Triceps"], "horizontal_push", "incline", "machine", "beginner", "machine", "01:00", ["Set incline angle on the machine, adjust seat height.", "Press without shrugging or lifting off the pad.", "Control the return."]),
  makeExercise("incline-cable-press", "Incline Cable Press", "Upper Chest", ["Front Delts", "Triceps"], "horizontal_push", "incline", "cable", "beginner", "machine", "01:00", ["Set cables low, lean forward at incline angle.", "Press up and slightly together.", "Control the return for a full chest stretch."]),
  makeExercise("decline-barbell-press", "Decline Barbell Press", "Lower Chest", ["Front Delts", "Triceps"], "horizontal_push", "decline", "barbell", "intermediate", "barbell", "01:30", ["Secure your feet before unracking.", "Lower to lower chest with elbows flared slightly.", "Press up through the lower chest."]),
  makeExercise("decline-dumbbell-press", "Decline Dumbbell Press", "Lower Chest", ["Front Delts", "Triceps"], "horizontal_push", "decline", "dumbbell", "intermediate", "free_weights_accessories", "01:00", ["Set the decline, kick dumbbells up carefully.", "Lower with elbows tucked at 45 degrees.", "Press up through the lower chest."]),

  // ── Vertical Push ────────────────────────────────────────────────────────────
  makeExercise("overhead-barbell-press", "Overhead Barbell Press", "Shoulders", ["Triceps", "Upper Traps"], "vertical_push", "overhead", "barbell", "intermediate", "barbell", "01:30", ["Grip just outside shoulder width, bar resting on upper chest.", "Press straight up while keeping ribs down.", "Lock out at the top without excessive lean."]),
  makeExercise("dumbbell-shoulder-press", "Dumbbell Shoulder Press", "Shoulders", ["Triceps", "Front Delts"], "vertical_push", "overhead", "dumbbell", "beginner", "free_weights_accessories", "01:00", ["Stack wrists over elbows before pressing overhead.", "Keep the ribcage down instead of leaning back.", "Finish with biceps near the ears without shrugging."]),
  makeExercise("machine-shoulder-press", "Machine Shoulder Press", "Shoulders", ["Triceps"], "vertical_push", "overhead", "machine", "beginner", "machine", "01:00", ["Adjust seat so handles start at shoulder height.", "Press overhead without losing back contact with the pad.", "Control the return."]),
  makeExercise("arnold-press", "Arnold Press", "Shoulders", ["Triceps", "Front Delts"], "vertical_push", "overhead", "dumbbell", "intermediate", "free_weights_accessories", "01:00", ["Start with palms facing you at chin height.", "Rotate palms out as you press overhead.", "Reverse the rotation on the way down."]),
  makeExercise("landmine-press", "Landmine Press", "Shoulders", ["Chest", "Triceps"], "vertical_push", "overhead", "landmine", "beginner", "barbell", "01:00", ["Set the bar in the landmine, start with elbow in front.", "Press up and forward without over-arching.", "Lower under control to the shoulder line."]),
  makeExercise("pike-push-up", "Pike Push-Up", "Shoulders", ["Triceps", "Upper Chest"], "vertical_push", "overhead", "bodyweight", "beginner", "bodyweight_only", "00:45", ["Form an inverted V with hips high.", "Lower your head toward the floor between your hands.", "Press back up through the shoulders."]),

  // ── Horizontal Pull ──────────────────────────────────────────────────────────
  makeExercise("barbell-bent-over-row", "Barbell Bent-Over Row", "Upper Back", ["Lats", "Biceps", "Rear Delts"], "horizontal_pull", "flat", "barbell", "intermediate", "barbell", "01:30", ["Hinge to about 45 degrees, brace hard.", "Drive elbows back while keeping the chest up.", "Lower under control with shoulder blades protracting."]),
  makeExercise("dumbbell-row", "Dumbbell Row", "Upper Back", ["Lats", "Biceps"], "horizontal_pull", "flat", "dumbbell", "beginner", "free_weights_accessories", "01:00", ["Place knee and hand on bench for support.", "Drive elbow back toward your hip.", "Lower slowly to full stretch."]),
  makeExercise("seated-cable-row", "Seated Cable Row", "Upper Back", ["Lats", "Biceps", "Rear Delts"], "horizontal_pull", "flat", "cable", "beginner", "machine", "01:00", ["Brace feet, sit tall before starting the pull.", "Drive elbows back keeping chest lifted.", "Let shoulder blades protract under control on return."]),
  makeExercise("machine-row", "Machine Row", "Upper Back", ["Lats", "Biceps"], "horizontal_pull", "flat", "machine", "beginner", "machine", "01:00", ["Adjust chest pad so you can fully extend arms.", "Drive elbows back and squeeze the upper back.", "Control the return to full stretch."]),
  makeExercise("chest-supported-dumbbell-row", "Chest-Supported Dumbbell Row", "Upper Back", ["Lats", "Rear Delts"], "horizontal_pull", "prone", "dumbbell", "beginner", "free_weights_accessories", "01:00", ["Set chest firmly against the incline bench.", "Drive elbows back without shrugging.", "Control the stretch on the way down."]),
  makeExercise("chest-supported-machine-row", "Chest-Supported Machine Row", "Upper Back", ["Lats", "Rear Delts"], "horizontal_pull", "prone", "machine", "beginner", "machine", "01:00", ["Pin your chest firmly to the pad.", "Pull handles to your sides, squeezing shoulder blades.", "Control the return to full stretch."]),
  makeExercise("pendlay-row", "Pendlay Row", "Upper Back", ["Lats", "Biceps"], "horizontal_pull", "flat", "barbell", "advanced", "barbell", "01:30", ["Start each rep from the floor, fully horizontal torso.", "Explode the bar to the lower chest.", "Lower back to the floor under control."]),
  makeExercise("inverted-row", "Inverted Row", "Upper Back", ["Biceps", "Rear Delts"], "horizontal_pull", "flat", "bodyweight", "beginner", "bodyweight_only", "00:45", ["Set bar at hip height, hang with straight body.", "Pull chest to bar keeping hips up.", "Lower slowly to full arm extension."]),

  // ── Vertical Pull ────────────────────────────────────────────────────────────
  makeExercise("lat-pulldown", "Lat Pulldown", "Lats", ["Upper Back", "Biceps"], "vertical_pull", "overhead", "cable", "beginner", "machine", "01:00", ["Set the thigh pad so you stay locked into the seat.", "Drive elbows down toward your ribs without swinging.", "Control the upward stretch before starting the next rep."]),
  makeExercise("close-grip-lat-pulldown", "Close-Grip Lat Pulldown", "Lats", ["Biceps", "Upper Back"], "vertical_pull", "overhead", "cable", "beginner", "machine", "01:00", ["Use a close neutral grip, sit tall.", "Drive elbows straight down emphasizing the lats.", "Control the return to full stretch."]),
  makeExercise("neutral-grip-pulldown", "Neutral-Grip Pulldown", "Lats", ["Biceps", "Upper Back"], "vertical_pull", "overhead", "cable", "beginner", "machine", "01:00", ["Grip the V-bar with neutral palms facing each other.", "Pull to upper chest while leaning back slightly.", "Control the return."]),
  makeExercise("machine-pulldown", "Machine Pulldown", "Lats", ["Upper Back", "Biceps"], "vertical_pull", "overhead", "machine", "beginner", "machine", "01:00", ["Adjust knee pad, grip handles overhead.", "Pull down toward chest driving elbows to sides.", "Return slowly."]),
  makeExercise("pull-up", "Pull-Up", "Lats", ["Upper Back", "Biceps"], "vertical_pull", "overhead", "bodyweight", "intermediate", "bodyweight_only", "01:15", ["Start from a dead hang with ribs down.", "Drive elbows toward the hips instead of pulling with neck.", "Lower all the way to full extension."]),
  makeExercise("chin-up", "Chin-Up", "Lats", ["Biceps", "Upper Back"], "vertical_pull", "overhead", "bodyweight", "intermediate", "bodyweight_only", "01:15", ["Underhand grip shoulder width apart.", "Pull chest to bar while keeping elbows close.", "Lower slowly to full arm extension."]),
  makeExercise("assisted-pull-up", "Assisted Pull-Up", "Lats", ["Upper Back", "Biceps"], "vertical_pull", "overhead", "machine", "beginner", "machine", "01:00", ["Set the assistance weight to support your bodyweight.", "Pull up until chin clears the bar.", "Lower slowly for full range of motion."]),

  // ── Hip Hinge ────────────────────────────────────────────────────────────────
  makeExercise("conventional-deadlift", "Conventional Deadlift", "Hamstrings", ["Glutes", "Lower Back", "Traps"], "hip_hinge", "none", "barbell", "advanced", "barbell", "02:00", ["Hinge to the bar, brace hard before pulling.", "Drive the floor away while keeping the bar close.", "Lock out hips and knees at the top."]),
  makeExercise("romanian-deadlift", "Romanian Deadlift", "Hamstrings", ["Glutes", "Lower Back"], "hip_hinge", "none", "barbell", "intermediate", "barbell", "01:30", ["Unlock the knees and push hips back before the bar drifts.", "Keep the lats tight so the weight stays close.", "Stand tall by driving hips through, not leaning back."]),
  makeExercise("dumbbell-romanian-deadlift", "Dumbbell Romanian Deadlift", "Hamstrings", ["Glutes", "Lower Back"], "hip_hinge", "none", "dumbbell", "beginner", "free_weights_accessories", "01:00", ["Hold dumbbells at thighs, soft knees.", "Push hips back, lower dumbbells along legs.", "Drive hips forward to stand."]),
  makeExercise("sumo-deadlift", "Sumo Deadlift", "Hamstrings", ["Glutes", "Inner Thigh", "Traps"], "hip_hinge", "none", "barbell", "advanced", "barbell", "02:00", ["Set a wide stance with toes turned out.", "Grip inside the legs, brace hard before pulling.", "Push the floor apart as you drive hips forward."]),
  makeExercise("single-leg-romanian-deadlift", "Single-Leg Romanian Deadlift", "Hamstrings", ["Glutes", "Core"], "hip_hinge", "none", "dumbbell", "intermediate", "free_weights_accessories", "01:00", ["Hold a dumbbell in the opposite hand from working leg.", "Hinge at the hip, let the back leg lift for counterbalance.", "Return to standing with control."]),
  makeExercise("good-morning", "Good Morning", "Hamstrings", ["Lower Back", "Glutes"], "hip_hinge", "none", "barbell", "intermediate", "barbell", "01:00", ["Bar rests on upper back, feet shoulder width.", "Hinge at the hips with a slight knee bend.", "Return by driving hips forward."]),
  makeExercise("barbell-hip-thrust", "Barbell Hip Thrust", "Glutes", ["Hamstrings"], "hip_hinge", "none", "barbell", "intermediate", "barbell", "01:15", ["Set the bench against the shoulder blades before the bar.", "Drive through heels and squeeze glutes hard at the top.", "Lower under control without losing ribcage position."]),
  makeExercise("machine-hip-thrust", "Machine Hip Thrust", "Glutes", ["Hamstrings"], "hip_hinge", "none", "machine", "beginner", "machine", "01:00", ["Adjust pad height so it sits across the hips.", "Drive hips up squeezing glutes at the top.", "Control the return."]),
  makeExercise("dumbbell-hip-thrust", "Dumbbell Hip Thrust", "Glutes", ["Hamstrings"], "hip_hinge", "none", "dumbbell", "beginner", "free_weights_accessories", "01:00", ["Place upper back on bench, dumbbell across hips.", "Drive hips up squeezing glutes fully.", "Lower with control."]),
  makeExercise("cable-pull-through", "Cable Pull-Through", "Glutes", ["Hamstrings"], "hip_hinge", "none", "cable", "beginner", "machine", "01:00", ["Set cable low, grip between legs facing away.", "Hinge at the hips letting the cable pull back.", "Drive hips forward to stand."]),

  // ── Squat ────────────────────────────────────────────────────────────────────
  makeExercise("back-squat", "Back Squat", "Quads", ["Glutes", "Hamstrings", "Core"], "squat", "none", "barbell", "advanced", "barbell", "02:00", ["Set the bar across the upper back, brace before unracking.", "Sit down between the hips, keeping mid-foot pressure even.", "Drive up through the floor keeping chest over hips."]),
  makeExercise("front-squat", "Front Squat", "Quads", ["Glutes", "Core"], "squat", "none", "barbell", "advanced", "barbell", "02:00", ["Rest bar on fingertips or crossed arms at shoulders.", "Keep torso upright as you descend.", "Drive up maintaining the upright position."]),
  makeExercise("goblet-squat", "Goblet Squat", "Quads", ["Glutes", "Core"], "squat", "none", "dumbbell", "beginner", "free_weights_accessories", "01:00", ["Hold a dumbbell vertically at chest height.", "Squat deep keeping elbows inside the knees.", "Drive up through the floor."]),
  makeExercise("leg-press", "Leg Press", "Quads", ["Glutes", "Hamstrings"], "squat", "none", "machine", "beginner", "machine", "01:30", ["Plant the full foot on the platform before unlocking.", "Lower until knees and hips are deeply bent.", "Drive through mid-foot keeping knees tracking over toes."]),
  makeExercise("hack-squat", "Hack Squat", "Quads", ["Glutes"], "squat", "none", "machine", "intermediate", "machine", "01:30", ["Set shoulder pads, feet shoulder width on platform.", "Lower under control to full depth.", "Drive up through the heels."]),
  makeExercise("smith-machine-squat", "Smith Machine Squat", "Quads", ["Glutes", "Hamstrings"], "squat", "none", "smith_machine", "beginner", "machine", "01:30", ["Position feet slightly forward of bar.", "Squat to parallel or below.", "Drive up through the heels."]),
  makeExercise("bodyweight-squat", "Bodyweight Squat", "Quads", ["Glutes"], "squat", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Stand with feet shoulder width, arms forward.", "Squat until thighs are at least parallel.", "Drive up through the heels."]),
  makeExercise("sissy-squat", "Sissy Squat", "Quads", [], "squat", "none", "bodyweight", "intermediate", "bodyweight_only", "01:00", ["Hold something for balance if needed.", "Lean back slightly as you lower on your toes.", "Drive through the quads to stand."]),

  // ── Lunge ────────────────────────────────────────────────────────────────────
  makeExercise("dumbbell-forward-lunge", "Dumbbell Forward Lunge", "Quads", ["Glutes", "Hamstrings"], "lunge", "none", "dumbbell", "beginner", "free_weights_accessories", "01:00", ["Step forward with control, dumbbells at sides.", "Lower back knee toward the floor.", "Push back to start through the front heel."]),
  makeExercise("dumbbell-reverse-lunge", "Dumbbell Reverse Lunge", "Quads", ["Glutes", "Hamstrings"], "lunge", "none", "dumbbell", "beginner", "free_weights_accessories", "01:00", ["Step back keeping the torso upright.", "Lower back knee toward the floor.", "Drive through the front heel to return."]),
  makeExercise("barbell-lunge", "Barbell Lunge", "Quads", ["Glutes", "Hamstrings"], "lunge", "none", "barbell", "intermediate", "barbell", "01:30", ["Set the bar across the upper back.", "Step forward, lower with control.", "Drive through the front heel to return."]),
  makeExercise("walking-lunge", "Walking Lunge", "Quads", ["Glutes", "Hamstrings"], "lunge", "none", "dumbbell", "beginner", "free_weights_accessories", "01:00", ["Carry dumbbells at sides.", "Step forward lowering the back knee.", "Drive through front heel and step forward continuously."]),
  makeExercise("bulgarian-split-squat", "Bulgarian Split Squat", "Quads", ["Glutes", "Hamstrings"], "lunge", "none", "dumbbell", "intermediate", "free_weights_accessories", "01:30", ["Rear foot elevated on a bench, dumbbells at sides.", "Lower the back knee toward the floor.", "Drive up through the front heel."]),
  makeExercise("step-up", "Step-Up", "Quads", ["Glutes"], "lunge", "none", "dumbbell", "beginner", "free_weights_accessories", "01:00", ["Hold dumbbells, face a box or bench.", "Step up through the heel, bring the other foot up.", "Step back down with control."]),
  makeExercise("bodyweight-lunge", "Bodyweight Lunge", "Quads", ["Glutes"], "lunge", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Hands on hips or clasped in front.", "Step forward, lower with control.", "Push back through the front heel."]),

  // ── Isolation Push ───────────────────────────────────────────────────────────
  makeExercise("dumbbell-lateral-raise", "Dumbbell Lateral Raise", "Shoulders", ["Traps"], "isolation_push", "none", "dumbbell", "beginner", "free_weights_accessories", "00:45", ["Soft elbow, slight forward lean.", "Raise out and slightly forward to shoulder height.", "Lower under control without letting shoulders creep up."]),
  makeExercise("cable-lateral-raise", "Cable Lateral Raise", "Shoulders", ["Traps"], "isolation_push", "none", "cable", "beginner", "machine", "00:45", ["Stand sideways to the cable, grab low attachment.", "Raise out to shoulder height with soft elbow.", "Lower slowly without letting the stack crash."]),
  makeExercise("machine-lateral-raise", "Machine Lateral Raise", "Shoulders", [], "isolation_push", "none", "machine", "beginner", "machine", "00:45", ["Adjust the seat so arms start below shoulder height.", "Raise out with control.", "Lower slowly."]),
  makeExercise("dumbbell-front-raise", "Dumbbell Front Raise", "Front Delts", ["Shoulders"], "isolation_push", "none", "dumbbell", "beginner", "free_weights_accessories", "00:45", ["Lift with soft elbow and a quiet torso.", "Raise only to shoulder height.", "Lower slowly without swinging."]),
  makeExercise("dumbbell-chest-fly", "Dumbbell Chest Fly", "Chest", ["Front Delts"], "isolation_push", "flat", "dumbbell", "beginner", "free_weights_accessories", "00:45", ["Slight bend in elbows throughout.", "Open arms wide feeling the chest stretch.", "Bring dumbbells together squeezing the chest."]),
  makeExercise("cable-chest-fly", "Cable Chest Fly", "Chest", ["Front Delts"], "isolation_push", "flat", "cable", "beginner", "machine", "00:45", ["Set cables high, lean forward slightly.", "Bring handles together in a sweeping arc.", "Control the return feeling the stretch."]),
  makeExercise("pec-deck", "Pec Deck", "Chest", ["Front Delts"], "isolation_push", "flat", "machine", "beginner", "machine", "00:45", ["Set handles at chest height.", "Bring pads together with a controlled squeeze.", "Control the return to full stretch."]),
  makeExercise("incline-dumbbell-fly", "Incline Dumbbell Fly", "Upper Chest", ["Front Delts"], "isolation_push", "incline", "dumbbell", "beginner", "free_weights_accessories", "00:45", ["Set bench to 30 degrees, soft elbow bend.", "Open arms feeling the upper chest stretch.", "Bring dumbbells together squeezing upper chest."]),
  makeExercise("tricep-pushdown", "Tricep Pushdown", "Triceps", [], "isolation_push", "none", "cable", "beginner", "machine", "00:45", ["Lock elbows near the ribs before starting.", "Push down until elbows are fully extended.", "Control the return without letting elbows flare."]),
  makeExercise("overhead-tricep-extension", "Overhead Tricep Extension", "Triceps", [], "isolation_push", "none", "cable", "beginner", "machine", "00:45", ["Set cable low or use a dumbbell overhead.", "Keep elbows pointing up, extend through the triceps.", "Control the return feeling the stretch."]),
  makeExercise("dumbbell-skull-crusher", "Dumbbell Skull Crusher", "Triceps", [], "isolation_push", "flat", "dumbbell", "intermediate", "free_weights_accessories", "01:00", ["Lie flat, dumbbells above face with locked elbows.", "Lower by bending only the elbows.", "Press back up through the triceps."]),
  makeExercise("close-grip-bench-press", "Close-Grip Bench Press", "Triceps", ["Chest", "Front Delts"], "isolation_push", "flat", "barbell", "intermediate", "barbell", "01:00", ["Grip shoulder width or slightly inside.", "Lower bar to lower chest with elbows tucked.", "Press up through the triceps."]),
  makeExercise("diamond-push-up", "Diamond Push-Up", "Triceps", ["Chest"], "isolation_push", "flat", "bodyweight", "intermediate", "bodyweight_only", "00:45", ["Form diamond shape with thumbs and forefingers.", "Keep elbows close to the body throughout.", "Press away focusing on tricep contraction."]),

  // ── Isolation Pull ───────────────────────────────────────────────────────────
  makeExercise("barbell-curl", "Barbell Curl", "Biceps", ["Forearms"], "isolation_pull", "none", "barbell", "beginner", "barbell", "00:45", ["Stand tall with elbows slightly in front.", "Curl without swinging the shoulders.", "Lower under control to full extension."]),
  makeExercise("dumbbell-curl", "Dumbbell Curl", "Biceps", ["Forearms"], "isolation_pull", "none", "dumbbell", "beginner", "free_weights_accessories", "00:45", ["Alternate or both arms, elbows stable at sides.", "Curl and supinate at the top.", "Lower slowly."]),
  makeExercise("cable-curl", "Cable Curl", "Biceps", ["Forearms"], "isolation_pull", "none", "cable", "beginner", "machine", "00:45", ["Set cable low, constant tension throughout.", "Curl to full contraction keeping elbows still.", "Lower under control."]),
  makeExercise("hammer-curl", "Hammer Curl", "Biceps", ["Forearms"], "isolation_pull", "none", "dumbbell", "beginner", "free_weights_accessories", "00:45", ["Neutral grip, thumbs up throughout.", "Curl without rotating the forearm.", "Lower slowly."]),
  makeExercise("incline-dumbbell-curl", "Incline Dumbbell Curl", "Biceps", ["Forearms"], "isolation_pull", "incline", "dumbbell", "intermediate", "free_weights_accessories", "00:45", ["Recline on incline bench, arms hanging back.", "Curl from fully stretched position.", "Lower slowly to full stretch."]),
  makeExercise("concentration-curl", "Concentration Curl", "Biceps", [], "isolation_pull", "none", "dumbbell", "beginner", "free_weights_accessories", "00:45", ["Sit, brace elbow against inner thigh.", "Curl slowly focusing on full contraction.", "Lower under control."]),
  makeExercise("machine-curl", "Machine Curl", "Biceps", ["Forearms"], "isolation_pull", "none", "machine", "beginner", "machine", "00:45", ["Adjust arm pad, full range of motion.", "Curl with control.", "Lower slowly."]),
  makeExercise("face-pull", "Face Pull", "Rear Delts", ["Traps", "Upper Back"], "isolation_pull", "none", "cable", "beginner", "machine", "00:45", ["Set cable at face height, rope attachment.", "Pull to face keeping elbows high.", "Control the return."]),
  makeExercise("dumbbell-rear-delt-fly", "Dumbbell Rear Delt Fly", "Rear Delts", ["Traps", "Upper Back"], "isolation_pull", "prone", "dumbbell", "beginner", "free_weights_accessories", "00:45", ["Hinge forward or lie prone on incline bench.", "Raise arms out keeping slight elbow bend.", "Control the return."]),
  makeExercise("machine-rear-delt-fly", "Machine Rear Delt Fly", "Rear Delts", ["Upper Back"], "isolation_pull", "prone", "machine", "beginner", "machine", "00:45", ["Face the pec deck in reverse.", "Sweep arms back squeezing rear delts.", "Control the return."]),
  makeExercise("barbell-shrug", "Barbell Shrug", "Traps", [], "isolation_pull", "none", "barbell", "beginner", "barbell", "00:45", ["Hold bar at thighs, stand tall.", "Shrug straight up without rolling shoulders.", "Pause briefly at the top."]),
  makeExercise("dumbbell-shrug", "Dumbbell Shrug", "Traps", ["Forearms"], "isolation_pull", "none", "dumbbell", "beginner", "free_weights_accessories", "00:45", ["Stand tall, dumbbells at sides.", "Shrug straight up without rolling.", "Pause briefly at the top before lowering."]),

  // ── Isolation Legs ───────────────────────────────────────────────────────────
  makeExercise("leg-extension", "Leg Extension", "Quads", [], "isolation_legs", "none", "machine", "beginner", "machine", "00:45", ["Set pad just above the ankle.", "Extend fully, pause at the top.", "Lower slowly."]),
  makeExercise("seated-leg-curl", "Seated Leg Curl", "Hamstrings", [], "isolation_legs", "none", "machine", "beginner", "machine", "00:45", ["Adjust pad above the ankles.", "Curl through full range squeezing at the bottom.", "Return slowly."]),
  makeExercise("lying-leg-curl", "Lying Leg Curl", "Hamstrings", [], "isolation_legs", "prone", "machine", "beginner", "machine", "00:45", ["Lie face down, pad above ankles.", "Curl without lifting hips off the bench.", "Lower slowly to full stretch."]),
  makeExercise("standing-calf-raise", "Standing Calf Raise", "Calves", [], "isolation_legs", "none", "machine", "beginner", "machine", "00:45", ["Let heels drop to full stretch at the bottom.", "Drive up through the big toe and hold briefly.", "Lower slowly without bouncing."]),
  makeExercise("seated-calf-raise", "Seated Calf Raise", "Calves", [], "isolation_legs", "none", "machine", "beginner", "machine", "00:45", ["Pad rests above the knees.", "Lower heels to full stretch.", "Drive up and squeeze at the top."]),
  makeExercise("hip-abduction-machine", "Hip Abduction Machine", "Glutes", ["Inner Thigh"], "isolation_legs", "none", "machine", "beginner", "machine", "00:45", ["Sit with pads on the outside of knees.", "Push legs apart against resistance.", "Control the return."]),
  makeExercise("hip-adduction-machine", "Hip Adduction Machine", "Inner Thigh", ["Glutes"], "isolation_legs", "none", "machine", "beginner", "machine", "00:45", ["Sit with pads on the inside of knees.", "Squeeze legs together against resistance.", "Control the return."]),

  // ── Core ─────────────────────────────────────────────────────────────────────
  makeExercise("plank", "Plank", "Core", [], "core_anterior", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Brace abs before lifting into position.", "Keep ribs and hips stacked, no sagging.", "Breathe behind the brace while holding."]),
  makeExercise("ab-crunch", "Ab Crunch", "Core", [], "core_anterior", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Feet flat, hands behind ears.", "Curl the rib cage toward the pelvis.", "Lower under control."]),
  makeExercise("hanging-leg-raise", "Hanging Leg Raise", "Core", ["Hip Flexors"], "core_anterior", "none", "bodyweight", "intermediate", "bodyweight_only", "00:45", ["Set ribs down before lifting legs.", "Raise with abs not by swinging.", "Lower slowly to keep tension through midline."]),
  makeExercise("cable-crunch", "Cable Crunch", "Core", [], "core_anterior", "none", "cable", "beginner", "machine", "00:45", ["Kneel, rope at forehead, hips back.", "Crunch down pulling rib cage to hips.", "Control the return."]),
  makeExercise("ab-wheel-rollout", "Ab Wheel Rollout", "Core", ["Shoulders", "Lats"], "core_anterior", "none", "none", "advanced", "bodyweight_only", "00:45", ["Start on knees, ab wheel in front.", "Roll out as far as you can with a braced core.", "Pull back with abs, not arms."]),
  makeExercise("hollow-hold", "Hollow Hold", "Core", [], "core_anterior", "none", "bodyweight", "intermediate", "bodyweight_only", "00:30", ["Lie flat, press lower back into floor.", "Lift legs and shoulders together.", "Hold the banana shape breathing steadily."]),
  makeExercise("russian-twist", "Russian Twist", "Core", [], "core_rotational", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Sit with knees bent, lean back slightly.", "Rotate side to side through the torso.", "Keep the lower back from rounding."]),
  makeExercise("woodchop", "Woodchop", "Core", ["Shoulders"], "core_rotational", "none", "cable", "beginner", "machine", "00:45", ["Brace before rotating away from the stack.", "Turn through the torso not just the arms.", "Finish under control and resist the pull back."]),
  makeExercise("side-plank", "Side Plank", "Core", ["Glutes"], "core_anterior", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Stack feet or stagger them for balance.", "Keep hips lifted and stacked.", "Hold steady without the hips sagging."]),
  makeExercise("dead-bug", "Dead Bug", "Core", [], "core_anterior", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Lie on back, arms and knees at 90 degrees.", "Extend opposite arm and leg while pressing lower back down.", "Return and repeat on the other side."]),
];

const replacementTemplates: Array<
  Pick<
    ExerciseDraft,
    "name" | "imageSrc" | "primaryMuscle" | "secondaryMuscles" | "howTo"
  > & { id: string }
> = [
  {
    id: "machine-chest-press",
    name: "Machine Chest Press",
    imageSrc: benchPressImage,
    primaryMuscle: "Chest",
    secondaryMuscles: ["Front Delts", "Triceps"],
    howTo: [
      "Adjust the seat so handles start around chest height.",
      "Keep the ribcage stable and press without shrugging.",
      "Control the return until the handles nearly touch the stack."
    ]
  },
  {
    id: "flat-dumbbell-press",
    name: "Flat Dumbbell Press",
    imageSrc: inclineDumbbellPressImage,
    primaryMuscle: "Chest",
    secondaryMuscles: ["Front Delts", "Triceps"],
    howTo: [
      "Kick the dumbbells up with a tight upper back position.",
      "Lower with stacked wrists and elbows below the bells.",
      "Press together and up while keeping the shoulder blades set."
    ]
  }
];

// ── Exercise library enrichment ───────────────────────────────────────────────
// Spreads smartReplaceCatalog + Hevy/FitBod-sourced exercises into
// exerciseTemplates so they appear in the Add Exercise page.
// Deduplication is by ID — exercises already in exerciseTemplates are skipped.
{
  const _additionalExercises: ExerciseWithTaxonomy[] = [

    // ── CHEST ─────────────────────────────────────────────────────────────────
    makeExercise("smith-machine-bench-press", "Smith Machine Bench Press", "Chest", ["Front Delts", "Triceps"], "horizontal_push", "flat", "smith_machine", "beginner", "machine", "01:30", ["Set safety stops, position bar over lower chest.", "Lower under control with the smith guiding the path.", "Press up to full extension without locking aggressively."]),
    makeExercise("smith-machine-incline-press", "Smith Machine Incline Press", "Upper Chest", ["Front Delts", "Triceps"], "horizontal_push", "incline", "smith_machine", "beginner", "machine", "01:30", ["Set bench to 30-45 degrees inside the smith.", "Lower to upper chest under control.", "Press up focusing tension on the upper pec."]),
    makeExercise("decline-machine-press", "Decline Machine Press", "Lower Chest", ["Triceps", "Front Delts"], "horizontal_push", "decline", "machine", "beginner", "machine", "01:00", ["Adjust seat so handles align with lower chest.", "Press without shrugging or losing lower back contact.", "Control the return to full stretch."]),
    makeExercise("incline-cable-fly", "Incline Cable Fly", "Upper Chest", ["Front Delts"], "isolation_push", "incline", "cable", "beginner", "machine", "00:45", ["Set cables low, sit on incline bench.", "Arc the handles upward and together toward upper chest.", "Control the return to feel the full stretch."]),
    makeExercise("decline-dumbbell-fly", "Decline Dumbbell Fly", "Lower Chest", ["Front Delts"], "isolation_push", "decline", "dumbbell", "beginner", "free_weights_accessories", "00:45", ["Set slight elbow bend, arms open wide on decline.", "Squeeze the lower chest as you bring the dumbbells together.", "Lower slowly to full stretch."]),
    makeExercise("cable-crossover", "Cable Crossover", "Chest", ["Front Delts"], "isolation_push", "flat", "cable", "beginner", "machine", "00:45", ["Set cables high, step forward with a slight forward lean.", "Sweep hands together and slightly down in an arc.", "Control the return feeling the full chest stretch."]),
    makeExercise("push-up-decline", "Decline Push-Up", "Lower Chest", ["Triceps", "Front Delts"], "horizontal_push", "decline", "bodyweight", "intermediate", "bodyweight_only", "00:45", ["Place feet elevated on a bench behind you.", "Lower as one unit keeping the core braced.", "Press away through the lower chest."]),
    makeExercise("push-up-incline", "Incline Push-Up", "Upper Chest", ["Front Delts", "Triceps"], "horizontal_push", "incline", "bodyweight", "beginner", "bodyweight_only", "00:45", ["Place hands on an elevated surface like a bench.", "Lower chest toward the surface keeping the body in a plank.", "Press back up through the upper chest."]),
    makeExercise("svend-press", "Svend Press", "Chest", ["Front Delts"], "isolation_push", "flat", "none", "beginner", "free_weights_accessories", "00:45", ["Press two plates together with palms flat.", "Extend arms away from chest while squeezing the plates.", "Return slowly maintaining the squeeze."]),
    makeExercise("reverse-grip-bench-press", "Reverse Grip Bench Press", "Upper Chest", ["Triceps", "Front Delts"], "horizontal_push", "flat", "barbell", "advanced", "barbell", "01:30", ["Grip the bar underhand slightly outside shoulder width.", "Lower to mid-chest keeping elbows closer to body.", "Press up driving through the upper chest."]),

    // ── BACK ──────────────────────────────────────────────────────────────────
    makeExercise("barbell-row-underhand", "Barbell Row (Underhand)", "Upper Back", ["Biceps", "Lats"], "horizontal_pull", "flat", "barbell", "intermediate", "barbell", "01:30", ["Hinge to about 45 degrees, underhand grip outside hips.", "Drive elbows back leading with the biceps.", "Lower under control to full extension."]),
    makeExercise("wide-grip-pull-up", "Wide-Grip Pull-Up", "Lats", ["Upper Back", "Rear Delts"], "vertical_pull", "overhead", "bodyweight", "intermediate", "bodyweight_only", "01:15", ["Grip wider than shoulder width, dead hang start.", "Pull until chin clears the bar driving elbows down and back.", "Lower slowly to full extension."]),
    makeExercise("weighted-chin-up", "Weighted Chin-Up", "Lats", ["Biceps", "Upper Back"], "vertical_pull", "overhead", "bodyweight", "advanced", "bodyweight_weighted", "01:30", ["Attach weight via belt or hold between feet.", "Underhand grip, pull chest to bar.", "Lower slowly under control."]),
    makeExercise("single-arm-lat-pulldown", "Single-Arm Lat Pulldown", "Lats", ["Biceps"], "vertical_pull", "overhead", "cable", "beginner", "machine", "00:45", ["Grip a single handle with one hand, sit tall.", "Pull down to shoulder level driving the elbow toward the hip.", "Return slowly and feel the full lat stretch."]),
    makeExercise("meadows-row", "Meadows Row", "Upper Back", ["Lats", "Rear Delts", "Biceps"], "horizontal_pull", "flat", "barbell", "advanced", "barbell", "01:00", ["Stagger stance perpendicular to the bar, grip the far end.", "Row the bar to your hip in a high arc.", "Lower under control to full stretch."]),
    makeExercise("cable-shrug", "Cable Shrug", "Traps", [], "isolation_pull", "none", "cable", "beginner", "machine", "00:45", ["Set cable low or at waist height, grab straight bar.", "Shrug straight up without rolling the shoulders.", "Pause briefly at the top before lowering."]),
    makeExercise("dumbbell-deadlift", "Dumbbell Deadlift", "Hamstrings", ["Glutes", "Lower Back", "Traps"], "hip_hinge", "none", "dumbbell", "beginner", "free_weights_accessories", "01:00", ["Hold dumbbells at thighs, soft knees, brace.", "Push hips back and lower dumbbells along legs.", "Drive hips forward and squeeze glutes at the top."]),
    makeExercise("trap-bar-deadlift", "Trap Bar Deadlift", "Hamstrings", ["Glutes", "Traps", "Quads"], "hip_hinge", "none", "barbell", "intermediate", "barbell", "01:30", ["Stand inside the hex bar, grip the handles.", "Brace hard and drive the floor away.", "Lock out hips and knees at the top."]),
    makeExercise("deficit-deadlift", "Deficit Deadlift", "Hamstrings", ["Glutes", "Lower Back"], "hip_hinge", "none", "barbell", "advanced", "barbell", "02:00", ["Stand on a plate or platform to increase range of motion.", "Brace hard, keep bar close through the longer pull.", "Lock out at the top."]),
    makeExercise("stiff-leg-deadlift", "Stiff-Leg Deadlift", "Hamstrings", ["Lower Back", "Glutes"], "hip_hinge", "none", "barbell", "intermediate", "barbell", "01:30", ["Keep legs nearly straight — only a soft unlock.", "Hinge at the hips lowering bar along the legs.", "Drive hips forward to stand without using knee drive."]),
    makeExercise("landmine-row", "Landmine Row", "Upper Back", ["Lats", "Biceps"], "horizontal_pull", "flat", "landmine", "beginner", "barbell", "01:00", ["Stagger stance, hinge slightly forward.", "Row the loaded end toward your hip.", "Lower with control to full stretch."]),
    makeExercise("dumbbell-sumo-deadlift", "Dumbbell Sumo Deadlift", "Hamstrings", ["Glutes", "Inner Thigh"], "hip_hinge", "none", "dumbbell", "beginner", "free_weights_accessories", "01:00", ["Stand wide with toes turned out, dumbbell between legs.", "Brace and pull up by driving hips forward.", "Squeeze glutes at the top."]),

    // ── SHOULDERS ─────────────────────────────────────────────────────────────
    makeExercise("push-press", "Push Press", "Shoulders", ["Triceps", "Traps", "Quads"], "vertical_push", "overhead", "barbell", "intermediate", "barbell", "01:30", ["Slight knee dip to load the legs.", "Drive the bar overhead using leg momentum.", "Lock out overhead controlling the descent."]),
    makeExercise("smith-machine-overhead-press", "Smith Machine Overhead Press", "Shoulders", ["Triceps"], "vertical_push", "overhead", "smith_machine", "beginner", "machine", "01:00", ["Set bench upright inside the smith, bar at upper chest.", "Press overhead without excessive lean.", "Lower under control to start."]),
    makeExercise("z-press", "Z-Press", "Shoulders", ["Core", "Triceps"], "vertical_push", "overhead", "barbell", "advanced", "barbell", "01:30", ["Sit on the floor with legs extended, bar on shoulders.", "Press overhead keeping the torso strictly upright.", "Lower under control requiring full shoulder mobility."]),
    makeExercise("dumbbell-upright-row", "Dumbbell Upright Row", "Traps", ["Side Delts", "Biceps"], "isolation_pull", "none", "dumbbell", "intermediate", "free_weights_accessories", "00:45", ["Hold dumbbells in front of thighs.", "Pull upward leading with the elbows.", "Lower slowly keeping control."]),
    makeExercise("barbell-front-raise", "Barbell Front Raise", "Front Delts", ["Upper Chest"], "isolation_push", "none", "barbell", "beginner", "barbell", "00:45", ["Grip bar at shoulder width, arms extended.", "Raise to shoulder height with a soft elbow.", "Lower slowly under control."]),
    makeExercise("plate-front-raise", "Plate Front Raise", "Front Delts", ["Upper Chest"], "isolation_push", "none", "none", "beginner", "free_weights_accessories", "00:45", ["Hold a plate with both hands at hip level.", "Raise to shoulder height with straight arms.", "Lower slowly without swinging."]),
    makeExercise("cable-rear-delt-fly", "Cable Rear Delt Fly", "Rear Delts", ["Traps", "Upper Back"], "isolation_pull", "prone", "cable", "beginner", "machine", "00:45", ["Cross the cables at face height, grab opposite handles.", "Open arms wide squeezing the rear delts.", "Control the return without letting cables pull you forward."]),
    makeExercise("landmine-lateral-raise", "Landmine Lateral Raise", "Side Delts", ["Traps"], "isolation_push", "none", "landmine", "intermediate", "barbell", "00:45", ["Stand beside the landmine, hold the loaded end.", "Raise laterally to shoulder height keeping elbow soft.", "Lower under control."]),
    makeExercise("cable-external-rotation", "Cable External Rotation", "Rotator Cuff", ["Rear Delts"], "isolation_pull", "none", "cable", "beginner", "machine", "00:45", ["Set cable at elbow height, arm at 90 degrees.", "Rotate the forearm outward keeping the elbow fixed.", "Return slowly."]),

    // ── BICEPS ────────────────────────────────────────────────────────────────
    makeExercise("zottman-curl", "Zottman Curl", "Biceps", ["Forearms", "Brachialis"], "isolation_pull", "none", "dumbbell", "intermediate", "free_weights_accessories", "00:45", ["Curl with a supinated grip up to full contraction.", "Rotate to a pronated grip at the top.", "Lower with palms facing down for forearm work."]),
    makeExercise("bayesian-curl", "Bayesian Curl", "Biceps", ["Forearms"], "isolation_pull", "incline", "cable", "intermediate", "machine", "00:45", ["Set cable low behind you, arm extended back.", "Curl from a fully stretched position through the full arc.", "Lower back to full stretch."]),
    makeExercise("drag-curl", "Drag Curl", "Biceps", [], "isolation_pull", "none", "barbell", "intermediate", "barbell", "00:45", ["Instead of arcing forward, drag the bar up the body.", "Keep elbows moving back as you curl.", "Lower along the same path."]),
    makeExercise("reverse-curl", "Reverse Curl", "Forearms", ["Biceps", "Brachialis"], "isolation_pull", "none", "barbell", "beginner", "barbell", "00:45", ["Grip overhand at shoulder width.", "Curl to full contraction without swinging.", "Lower under control to full extension."]),
    makeExercise("cross-body-hammer-curl", "Cross-Body Hammer Curl", "Biceps", ["Brachialis", "Forearms"], "isolation_pull", "none", "dumbbell", "beginner", "free_weights_accessories", "00:45", ["Hold dumbbell at side with a neutral grip.", "Curl across the body toward the opposite shoulder.", "Lower slowly and alternate."]),
    makeExercise("cable-hammer-curl", "Cable Hammer Curl", "Biceps", ["Brachialis", "Forearms"], "isolation_pull", "none", "cable", "beginner", "machine", "00:45", ["Attach a rope, stand facing the cable.", "Curl with neutral grip, thumbs up throughout.", "Lower slowly keeping elbows fixed."]),
    makeExercise("seated-dumbbell-curl", "Seated Dumbbell Curl", "Biceps", ["Forearms"], "isolation_pull", "none", "dumbbell", "beginner", "free_weights_accessories", "00:45", ["Sit upright on a bench, dumbbells at sides.", "Curl and supinate at the top of the movement.", "Lower under control without swinging."]),
    makeExercise("spider-curl", "Spider Curl", "Biceps", ["Forearms"], "isolation_pull", "incline", "dumbbell", "beginner", "free_weights_accessories", "00:45", ["Lie chest-down on an incline bench, arms hanging freely.", "Curl both dumbbells keeping elbows still.", "Lower slowly to full stretch."]),
    makeExercise("preacher-curl", "Preacher Curl", "Biceps", ["Forearms"], "isolation_pull", "incline", "barbell", "beginner", "free_weights_accessories", "00:45", ["Lock upper arms flat on the pad before starting.", "Curl slowly to full contraction without swinging.", "Lower under control to full extension."]),

    // ── TRICEPS ───────────────────────────────────────────────────────────────
    makeExercise("barbell-skull-crusher", "Barbell Skull Crusher", "Triceps", ["Front Delts"], "isolation_push", "flat", "barbell", "intermediate", "barbell", "01:00", ["Lie flat, grip shoulder-width on a straight bar.", "Lower by bending only at the elbows toward the forehead.", "Press back through the triceps keeping elbows pinned."]),
    makeExercise("dumbbell-tricep-kickback", "Dumbbell Tricep Kickback", "Triceps", [], "isolation_push", "none", "dumbbell", "beginner", "free_weights_accessories", "00:45", ["Hinge forward with upper arm parallel to the floor.", "Extend the elbow fully pressing the dumbbell back.", "Return slowly keeping the upper arm completely still."]),
    makeExercise("cable-tricep-kickback", "Cable Tricep Kickback", "Triceps", [], "isolation_push", "none", "cable", "beginner", "machine", "00:45", ["Hinge forward, upper arm parallel to the floor.", "Extend the elbow fully pressing back.", "Return slowly keeping the upper arm still."]),
    makeExercise("lying-tricep-extension", "Lying Tricep Extension", "Triceps", [], "isolation_push", "flat", "barbell", "beginner", "barbell", "00:45", ["Lie flat, arms extended over face with barbell.", "Lower by bending at the elbows toward the forehead.", "Press back to full extension through the triceps."]),
    makeExercise("single-arm-tricep-extension", "Single-Arm Overhead Tricep Extension", "Triceps", [], "isolation_push", "none", "dumbbell", "beginner", "free_weights_accessories", "00:45", ["Hold dumbbell behind the head with one arm, elbow pointing up.", "Extend the arm fully pressing overhead.", "Lower under control to full stretch."]),
    makeExercise("tricep-dip", "Tricep Dip", "Triceps", ["Chest", "Shoulders"], "vertical_push", "decline", "bodyweight", "intermediate", "bodyweight_only", "01:00", ["Keep the torso upright to bias the triceps.", "Lower until the elbows reach 90 degrees.", "Press back up through the triceps."]),
    makeExercise("jm-press", "JM Press", "Triceps", ["Chest"], "isolation_push", "flat", "barbell", "advanced", "barbell", "01:00", ["Half skull crusher, half close-grip press.", "Lower bar to throat with elbows flared at 45 degrees.", "Press back up through the triceps."]),
    makeExercise("tate-press", "Tate Press", "Triceps", [], "isolation_push", "flat", "dumbbell", "intermediate", "free_weights_accessories", "00:45", ["Lie flat, dumbbells above chest pointing outward.", "Tip the dumbbells toward the chest bending only the elbows.", "Extend back up squeezing the triceps."]),
    makeExercise("ring-dip", "Ring Dip", "Triceps", ["Chest", "Shoulders"], "vertical_push", "decline", "bodyweight", "advanced", "bodyweight_only", "01:30", ["Support on rings with arms locked out.", "Lower under control stabilizing the rings.", "Press back up to lockout."]),

    // ── QUADS / LEGS ──────────────────────────────────────────────────────────
    makeExercise("pistol-squat", "Pistol Squat", "Quads", ["Glutes", "Core"], "squat", "none", "bodyweight", "advanced", "bodyweight_only", "01:00", ["Extend one leg forward, arms out for balance.", "Sit down on one leg to full depth.", "Drive through the heel to stand."]),
    makeExercise("barbell-hack-squat", "Barbell Hack Squat", "Quads", ["Glutes"], "squat", "none", "barbell", "advanced", "barbell", "01:30", ["Hold bar behind the legs at arm's length.", "Squat down keeping torso upright.", "Drive up through the heels."]),
    makeExercise("zercher-squat", "Zercher Squat", "Quads", ["Glutes", "Core", "Upper Back"], "squat", "none", "barbell", "advanced", "barbell", "01:30", ["Cradle bar in the crook of the elbows.", "Keep the torso upright as you descend to full depth.", "Drive up through the floor."]),
    makeExercise("pause-squat", "Pause Squat", "Quads", ["Glutes", "Core"], "squat", "none", "barbell", "advanced", "barbell", "02:00", ["Squat to the bottom position and hold for 2-3 seconds.", "Stay braced through the pause — do not relax.", "Drive up explosively after the pause."]),
    makeExercise("overhead-squat", "Overhead Squat", "Quads", ["Shoulders", "Core", "Glutes"], "squat", "overhead", "barbell", "advanced", "barbell", "02:00", ["Hold bar locked out overhead with a wide grip.", "Descend keeping the bar stacked over mid-foot.", "Drive up maintaining the overhead position."]),
    makeExercise("safety-bar-squat", "Safety Bar Squat", "Quads", ["Glutes", "Upper Back"], "squat", "none", "barbell", "intermediate", "barbell", "01:30", ["The cambered bar rests on the traps, handles at the front.", "Descend keeping the torso more upright than a back squat.", "Drive up through the floor."]),
    makeExercise("belt-squat", "Belt Squat", "Quads", ["Glutes"], "squat", "none", "machine", "intermediate", "machine", "01:30", ["Load hangs from a belt around the hips — no spinal load.", "Squat freely with hands free to assist balance.", "Drive up through the heels."]),
    makeExercise("sumo-squat", "Sumo Squat", "Quads", ["Glutes", "Inner Thigh"], "squat", "none", "dumbbell", "beginner", "free_weights_accessories", "01:00", ["Wide stance, toes turned out, hold dumbbell between legs.", "Sit down keeping knees tracking toes.", "Drive up through the heels."]),
    makeExercise("landmine-squat", "Landmine Squat", "Quads", ["Glutes", "Core"], "squat", "none", "landmine", "beginner", "barbell", "01:00", ["Hold loaded end at chest height with both hands.", "Squat freely — landmine acts as a counterbalance.", "Drive up to standing."]),
    makeExercise("wall-ball", "Wall Ball", "Quads", ["Shoulders", "Glutes", "Core"], "squat", "overhead", "none", "intermediate", "free_weights_accessories", "01:00", ["Hold medicine ball at chest, face the wall.", "Squat and drive upward throwing the ball to a target.", "Catch it and go directly into the next rep."]),
    makeExercise("thruster", "Thruster", "Quads", ["Shoulders", "Glutes", "Core"], "squat", "overhead", "barbell", "advanced", "barbell", "01:30", ["Hold bar in the front rack position.", "Squat to depth and drive up explosively.", "Use the momentum to press the bar overhead in one motion."]),
    makeExercise("burpee", "Burpee", "Quads", ["Shoulders", "Core", "Chest"], "squat", "none", "bodyweight", "intermediate", "bodyweight_only", "01:00", ["Squat down and jump feet back to plank.", "Perform a push-up, jump feet forward.", "Explode up and clap overhead."]),

    // ── HAMSTRINGS / GLUTES ───────────────────────────────────────────────────
    makeExercise("nordic-curl", "Nordic Curl", "Hamstrings", ["Glutes", "Lower Back"], "hip_hinge", "none", "bodyweight", "advanced", "bodyweight_only", "01:30", ["Anchor feet securely, kneel tall with arms crossed.", "Lower your body under control as far as possible.", "Catch yourself and use your hands to reset."]),
    makeExercise("glute-bridge", "Glute Bridge", "Glutes", ["Hamstrings", "Core"], "hip_hinge", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Lie on your back, feet flat near your glutes.", "Drive through heels and squeeze fully at the top.", "Lower slowly with control."]),
    makeExercise("single-leg-glute-bridge", "Single-Leg Glute Bridge", "Glutes", ["Hamstrings", "Core"], "hip_hinge", "none", "bodyweight", "intermediate", "bodyweight_only", "00:45", ["Lie on your back, one leg extended, one foot flat.", "Drive through the planted heel squeezing the glute.", "Lower slowly and repeat before switching."]),
    makeExercise("banded-hip-thrust", "Banded Hip Thrust", "Glutes", ["Hamstrings"], "hip_hinge", "none", "resistance_band", "beginner", "free_weights_accessories", "01:00", ["Loop band across hips, upper back on bench.", "Drive through heels squeezing glutes at the top.", "Lower slowly — band adds resistance in both directions."]),
    makeExercise("frog-pump", "Frog Pump", "Glutes", ["Inner Thigh"], "hip_hinge", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Lie on back, soles of feet together and pulled toward glutes.", "Drive hips up squeezing the glutes fully.", "Lower slowly and repeat."]),
    makeExercise("glute-kickback-machine", "Glute Kickback Machine", "Glutes", ["Hamstrings"], "hip_hinge", "none", "machine", "beginner", "machine", "00:45", ["Position the pad behind the knee, grip handles.", "Kick leg back until the hip is fully extended.", "Return slowly under control."]),
    makeExercise("standing-leg-curl", "Standing Leg Curl", "Hamstrings", ["Calves"], "isolation_legs", "none", "machine", "beginner", "machine", "00:45", ["Stand with pad behind ankle, grip handles for support.", "Curl the heel toward the glute.", "Lower slowly to full extension."]),
    makeExercise("b-stance-rdl", "B-Stance Romanian Deadlift", "Hamstrings", ["Glutes"], "hip_hinge", "none", "dumbbell", "intermediate", "free_weights_accessories", "01:00", ["Lead leg carries most weight, back leg lightly touches the floor.", "Hinge at the hips lowering dumbbells.", "Drive through the lead heel to stand."]),
    makeExercise("reverse-hyperextension", "Reverse Hyperextension", "Glutes", ["Hamstrings", "Lower Back"], "hip_hinge", "prone", "machine", "intermediate", "machine", "00:45", ["Lie face down on the bench with hips at the edge.", "Raise both legs until they are parallel to the floor.", "Lower slowly without swinging."]),
    makeExercise("glute-kickback-cable", "Cable Glute Kickback", "Glutes", ["Hamstrings"], "hip_hinge", "none", "cable", "beginner", "machine", "00:45", ["Attach ankle cuff, face the cable tower.", "Kick the leg back squeezing the glute fully.", "Lower slowly and switch sides."]),

    // ── CALVES ────────────────────────────────────────────────────────────────
    makeExercise("single-leg-calf-raise", "Single-Leg Calf Raise", "Calves", [], "isolation_legs", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Stand on one foot on an elevated surface, hold for balance.", "Lower the heel below the step for full stretch.", "Drive up on the big toe and hold briefly."]),
    makeExercise("donkey-calf-raise", "Donkey Calf Raise", "Calves", [], "isolation_legs", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Hinge forward with hands on a surface.", "Let heels drop low for a full stretch.", "Drive up through the balls of the feet."]),
    makeExercise("leg-press-calf-raise", "Leg Press Calf Raise", "Calves", [], "isolation_legs", "none", "machine", "beginner", "machine", "00:30", ["Set only the balls of the feet on the bottom of the platform.", "Lower the carriage to fully stretch the calves.", "Drive up through the forefoot and hold briefly."]),
    makeExercise("tibia-raise", "Tibia Raise", "Calves", [], "isolation_legs", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Stand with heels against a wall or elevated.", "Raise the toes upward as high as possible.", "Lower slowly to full plantarflexion."]),
    makeExercise("seated-dumbbell-calf-raise", "Seated Dumbbell Calf Raise", "Calves", [], "isolation_legs", "none", "dumbbell", "beginner", "free_weights_accessories", "00:30", ["Sit on a bench with dumbbells balanced on knees.", "Lower heels to a full stretch.", "Drive up through the forefoot squeezing at the top."]),

    // ── CORE ──────────────────────────────────────────────────────────────────
    makeExercise("floor-leg-raise", "Floor Leg Raise", "Abs / Core", ["Hip Flexors"], "core_anterior", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Lie flat, lower back pressed into the floor.", "Raise legs together to vertical without lifting the lower back.", "Lower slowly without touching the floor."]),
    makeExercise("flutter-kicks", "Flutter Kicks", "Abs / Core", ["Hip Flexors"], "core_anterior", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Lie flat, legs elevated a few inches off the floor.", "Alternate kicking up and down in small controlled arcs.", "Keep the lower back pressed down throughout."]),
    makeExercise("scissor-kicks", "Scissor Kicks", "Abs / Core", ["Hip Flexors"], "core_anterior", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Lie flat with legs raised, criss-cross them side to side.", "Keep the movement controlled and the lower back flat.", "Hold the top position briefly on each cross."]),
    makeExercise("sit-up", "Sit-Up", "Abs / Core", ["Hip Flexors"], "core_anterior", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Lie on back, knees bent, hands behind ears.", "Curl the torso all the way up to the knees.", "Lower slowly under control."]),
    makeExercise("decline-crunch", "Decline Crunch", "Abs / Core", [], "core_anterior", "decline", "bodyweight", "intermediate", "bodyweight_only", "00:30", ["Anchor feet on a decline bench, hands behind head.", "Curl the rib cage toward the pelvis.", "Lower under control."]),
    makeExercise("machine-crunch", "Machine Crunch", "Abs / Core", [], "core_anterior", "none", "machine", "beginner", "machine", "00:30", ["Grip the handles, feet under the pad.", "Crunch down pulling the ribcage toward the hips.", "Control the return to full extension."]),
    makeExercise("l-sit", "L-Sit", "Abs / Core", ["Triceps", "Hip Flexors"], "core_anterior", "none", "bodyweight", "advanced", "bodyweight_only", "00:45", ["Support on parallel bars or floor with arms locked out.", "Raise legs to parallel with the floor.", "Hold the position breathing steadily."]),
    makeExercise("bird-dog", "Bird Dog", "Abs / Core", ["Glutes", "Lower Back"], "core_anterior", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["On hands and knees, brace the core.", "Extend opposite arm and leg simultaneously.", "Return and repeat on the other side."]),
    makeExercise("ghd-sit-up", "GHD Sit-Up", "Abs / Core", ["Hip Flexors"], "core_anterior", "none", "machine", "advanced", "machine", "01:00", ["Sit on the GHD with hips at the pad edge.", "Lower back freely until parallel to the floor.", "Pull back up using the abs and hip flexors."]),
    makeExercise("landmine-rotation", "Landmine Rotation", "Obliques", ["Core", "Shoulders"], "core_rotational", "none", "landmine", "beginner", "barbell", "00:45", ["Hold the loaded end with both hands, arms extended.", "Rotate the bar in an arc from side to side.", "Keep hips stable and rotate through the thoracic spine."]),
    makeExercise("copenhagen-plank", "Copenhagen Plank", "Core", ["Inner Thigh", "Glutes"], "core_anterior", "none", "bodyweight", "advanced", "bodyweight_only", "00:45", ["Side plank with top foot on a bench.", "Lift the bottom leg to meet the bench.", "Hold the top position or add reps."]),
    makeExercise("bicycle-crunch", "Bicycle Crunch", "Abs / Core", ["Obliques"], "core_rotational", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Lie flat, hands behind head.", "Bring opposite elbow to opposite knee in a cycling motion.", "Keep the lower back from arching."]),
    makeExercise("mountain-climber", "Mountain Climber", "Abs / Core", ["Shoulders", "Hip Flexors"], "core_anterior", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Hold a push-up position with a braced core.", "Drive knees toward the chest alternately.", "Keep the hips level throughout."]),
    makeExercise("dragon-flag", "Dragon Flag", "Abs / Core", ["Lats"], "core_anterior", "none", "bodyweight", "advanced", "bodyweight_only", "01:00", ["Grip a fixed point behind the head.", "Lift the body to vertical as one unit.", "Lower as slowly as possible."]),
    makeExercise("toes-to-bar", "Toes-to-Bar", "Abs / Core", ["Hip Flexors", "Lats"], "core_anterior", "none", "bodyweight", "advanced", "bodyweight_only", "01:00", ["Dead hang from the bar with ribs down.", "Raise toes to the bar keeping legs straight.", "Lower slowly under control."]),
    makeExercise("v-up", "V-Up", "Abs / Core", ["Hip Flexors"], "core_anterior", "none", "bodyweight", "intermediate", "bodyweight_only", "00:30", ["Lie flat, arms overhead.", "Simultaneously raise legs and torso reaching hands to feet.", "Lower under control."]),
    makeExercise("pallof-press", "Pallof Press", "Abs / Core", ["Obliques"], "core_rotational", "none", "cable", "beginner", "machine", "00:45", ["Stand sideways to the cable, cable at chest height.", "Press straight out and hold briefly.", "Return without letting the cable rotate you."]),

    // ── OLYMPIC / POWER ───────────────────────────────────────────────────────
    makeExercise("power-clean", "Power Clean", "Hamstrings", ["Glutes", "Traps", "Shoulders"], "hip_hinge", "none", "barbell", "advanced", "barbell", "02:00", ["Start with bar over mid-foot, brace hard.", "Drive legs and hips explosively to get the bar moving.", "Catch in a partial squat as the bar reaches the shoulders."]),
    makeExercise("hang-power-clean", "Hang Power Clean", "Hamstrings", ["Glutes", "Traps", "Shoulders"], "hip_hinge", "none", "barbell", "advanced", "barbell", "02:00", ["Start with bar at hang position above the knees.", "Explosively extend the hips and shrug.", "Catch in a partial squat at the shoulders."]),
    makeExercise("clean-and-jerk", "Clean and Jerk", "Hamstrings", ["Shoulders", "Glutes", "Traps"], "hip_hinge", "overhead", "barbell", "advanced", "barbell", "02:00", ["Clean the bar to the shoulders in one pull.", "Dip and drive the bar overhead with a split or squat.", "Lock out and stand to complete the lift."]),
    makeExercise("snatch-barbell", "Snatch", "Hamstrings", ["Shoulders", "Glutes", "Core"], "hip_hinge", "overhead", "barbell", "advanced", "barbell", "02:00", ["Wide grip, bar over mid-foot.", "Pull explosively and get under the bar with arms locked.", "Stand up from the catch position."]),
    makeExercise("muscle-up", "Muscle-Up", "Lats", ["Chest", "Triceps", "Shoulders"], "vertical_pull", "overhead", "bodyweight", "advanced", "bodyweight_only", "01:30", ["Dead hang with a false grip.", "Pull explosively and transition over the bar at the top.", "Press out to lockout as in a dip."]),
    makeExercise("battle-ropes", "Battle Ropes", "Shoulders", ["Core", "Back"], "cardio", "none", "none", "intermediate", "machine", "01:00", ["Stand in an athletic stance gripping one end of each rope.", "Alternate or simultaneous waves with power.", "Keep the core braced throughout."]),
    makeExercise("turkish-get-up", "Turkish Get-Up", "Shoulders", ["Core", "Glutes", "Hips"], "carry", "none", "kettlebell", "advanced", "free_weights_accessories", "01:30", ["Start lying down, weight pressed straight overhead.", "Navigate through each position keeping the weight locked out.", "Reverse the sequence back to the floor."]),
    makeExercise("bear-crawl", "Bear Crawl", "Shoulders", ["Core", "Quads", "Hip Flexors"], "cardio", "none", "bodyweight", "intermediate", "bodyweight_only", "01:00", ["On hands and feet with knees hovering an inch off the floor.", "Move opposite hand and foot simultaneously.", "Keep the hips low and core braced throughout."]),
    makeExercise("ski-erg", "Ski Erg", "Back", ["Core", "Shoulders", "Lats"], "cardio", "none", "machine", "intermediate", "machine", "00:30", ["Grip handles overhead, stand tall.", "Pull down and back driving handles to hips.", "Return to overhead under control and repeat."]),

    // ── KETTLEBELL ────────────────────────────────────────────────────────────
    makeExercise("kettlebell-swing", "Kettlebell Swing", "Glutes", ["Hamstrings", "Core", "Shoulders"], "hip_hinge", "none", "kettlebell", "intermediate", "free_weights_accessories", "01:00", ["Hike the bell back between legs with a snap.", "Drive the hips forward explosively.", "Let the bell float to chest height — power comes from hips not arms."]),
    makeExercise("kettlebell-snatch", "Kettlebell Snatch", "Glutes", ["Shoulders", "Core", "Hamstrings"], "hip_hinge", "overhead", "kettlebell", "advanced", "free_weights_accessories", "01:30", ["Swing the bell up and punch through at the top.", "Receive with the arm locked overhead.", "Lower under control to the swing position."]),
    makeExercise("kettlebell-clean-and-press", "Kettlebell Clean and Press", "Shoulders", ["Glutes", "Core", "Triceps"], "vertical_push", "overhead", "kettlebell", "advanced", "free_weights_accessories", "01:30", ["Clean the bell to the rack position in one motion.", "Press overhead to full lockout.", "Lower and return to the clean position."]),
    makeExercise("kettlebell-deadlift", "Kettlebell Deadlift", "Hamstrings", ["Glutes", "Lower Back"], "hip_hinge", "none", "kettlebell", "beginner", "free_weights_accessories", "01:00", ["Straddle the kettlebell, hinge and grip the handle.", "Brace and stand driving through the heels.", "Lower back to the floor with control."]),
    makeExercise("kettlebell-row", "Kettlebell Row", "Upper Back", ["Biceps", "Rear Delts"], "horizontal_pull", "flat", "kettlebell", "beginner", "free_weights_accessories", "01:00", ["Hinge forward supporting with one hand, KB in the other.", "Row to the hip driving the elbow back.", "Lower slowly to full stretch."]),
    makeExercise("kettlebell-press", "Kettlebell Press", "Shoulders", ["Triceps"], "vertical_push", "overhead", "kettlebell", "intermediate", "free_weights_accessories", "01:00", ["Clean the bell to the rack position.", "Press overhead to lockout.", "Lower back to rack under control."]),
    makeExercise("kettlebell-goblet-squat", "Kettlebell Goblet Squat", "Quads", ["Glutes", "Core"], "squat", "none", "kettlebell", "beginner", "free_weights_accessories", "01:00", ["Hold the horns of the bell at chest height.", "Squat deep keeping elbows inside the knees.", "Drive up through the floor."]),
    makeExercise("kettlebell-figure-8", "Kettlebell Figure-8", "Core", ["Shoulders", "Glutes"], "core_rotational", "none", "kettlebell", "intermediate", "free_weights_accessories", "01:00", ["Straddle the bell in an athletic hinge.", "Pass the bell in a figure-8 pattern between and around the legs.", "Keep the torso stable while the hips rotate."]),
    makeExercise("kettlebell-windmill", "Kettlebell Windmill", "Core", ["Shoulders", "Glutes", "Hips"], "carry", "none", "kettlebell", "advanced", "free_weights_accessories", "01:00", ["Press the bell overhead and lock the arm.", "Hinge to one side, rotating the floor hand toward the foot.", "Return to standing with the bell locked out."]),

    // ── CARRY ─────────────────────────────────────────────────────────────────
    makeExercise("farmers-carry", "Farmer's Carry", "Forearms", ["Traps", "Core", "Glutes"], "carry", "none", "dumbbell", "beginner", "free_weights_accessories", "01:00", ["Pick up heavy dumbbells with a tight core and packed shoulders.", "Walk steady keeping the torso upright.", "Set down with control at the end of the run."]),
    makeExercise("suitcase-carry", "Suitcase Carry", "Core", ["Traps", "Glutes"], "carry", "none", "dumbbell", "intermediate", "free_weights_accessories", "01:00", ["Hold a heavy dumbbell in one hand at your side.", "Walk without tilting the torso to the loaded side.", "Complete the run then switch hands."]),
    makeExercise("overhead-carry", "Overhead Carry", "Shoulders", ["Traps", "Core"], "carry", "none", "dumbbell", "intermediate", "free_weights_accessories", "01:00", ["Press the dumbbell overhead and lock the arm.", "Walk steadily without letting the shoulder collapse.", "Keep the core braced throughout."]),
    makeExercise("yoke-carry", "Yoke Carry", "Traps", ["Glutes", "Core", "Quads"], "carry", "none", "none", "advanced", "machine", "01:00", ["Load the yoke and step underneath it.", "Walk with short powerful steps keeping a braced trunk.", "Set it down with control."]),

    // ── FOREARMS ──────────────────────────────────────────────────────────────
    makeExercise("wrist-extension", "Wrist Extension", "Forearms", [], "isolation_pull", "none", "dumbbell", "beginner", "free_weights_accessories", "00:30", ["Rest forearms on a bench, palms facing down.", "Extend the wrists upward against the weight.", "Lower slowly under control."]),
    makeExercise("wrist-roller", "Wrist Roller", "Forearms", [], "isolation_pull", "none", "none", "beginner", "free_weights_accessories", "00:30", ["Hold the roller at arm's length with palms down.", "Roll the weight up by alternating wrist flexion and extension.", "Reverse the direction to lower."]),
    makeExercise("plate-pinch", "Plate Pinch", "Forearms", ["Traps"], "carry", "none", "none", "beginner", "free_weights_accessories", "01:00", ["Pinch a plate between thumb and fingers at the side.", "Hold without letting the plate slip.", "Switch hands after each set."]),

    // ── CARDIO / CONDITIONING ─────────────────────────────────────────────────
    makeExercise("rowing-machine", "Rowing Machine", "Back", ["Hamstrings", "Core", "Shoulders"], "cardio", "none", "machine", "beginner", "machine", "00:30", ["Drive through the legs first, then lean back, then pull arms.", "Return in the opposite order — arms, body, legs.", "Keep a steady rhythm and a braced core."]),
    makeExercise("jump-rope", "Jump Rope", "Calves", ["Shoulders", "Core"], "cardio", "none", "none", "beginner", "bodyweight_only", "00:30", ["Keep elbows close to the body, wrists doing the turning.", "Land lightly on the balls of your feet.", "Keep a consistent rhythm."]),
    makeExercise("double-under", "Double Under", "Calves", ["Shoulders", "Core"], "cardio", "none", "none", "intermediate", "bodyweight_only", "00:30", ["Jump higher than a single under to allow two rope passes.", "Keep the wrist rotation fast and tight.", "Land softly absorbing through the ankles and knees."]),
    makeExercise("elliptical", "Elliptical", "Quads", ["Glutes", "Calves"], "cardio", "none", "machine", "beginner", "machine", "00:30", ["Set resistance before stepping on.", "Drive through the full foot and engage the arms.", "Maintain upright posture throughout."]),
    makeExercise("assault-bike", "Assault Bike", "Quads", ["Shoulders", "Core"], "cardio", "none", "machine", "intermediate", "machine", "00:30", ["Push and pull the handles equally.", "Drive through the full pedal stroke.", "Set a pace you can sustain through the interval."]),
    makeExercise("stair-climber", "Stair Climber", "Glutes", ["Quads", "Calves"], "cardio", "none", "machine", "beginner", "machine", "00:30", ["Set a steady pace before letting go of the rails.", "Push through the full step keeping the torso upright.", "Avoid leaning heavily on the handrails."]),
    makeExercise("sled-push", "Sled Push", "Quads", ["Glutes", "Core"], "cardio", "none", "none", "intermediate", "bodyweight_only", "01:00", ["Lean forward from the ankles maintaining a rigid core.", "Drive through the legs with short powerful steps.", "Keep the arms straight into the sled."]),
    makeExercise("sled-pull", "Sled Pull", "Hamstrings", ["Glutes", "Back"], "cardio", "none", "none", "intermediate", "bodyweight_only", "01:00", ["Face away from the sled with the rope over the shoulder.", "Drive forward with power steps pulling the sled.", "Keep the core braced and the torso upright."]),
    makeExercise("box-step-up", "Box Step-Up", "Quads", ["Glutes"], "lunge", "none", "dumbbell", "beginner", "free_weights_accessories", "01:00", ["Hold dumbbells at sides, step onto the box with one foot.", "Drive through the heel to lift the full body.", "Step back down under control and switch."]),
    makeExercise("jump-box", "Depth Jump", "Quads", ["Glutes", "Calves"], "squat", "none", "bodyweight", "advanced", "bodyweight_only", "01:30", ["Step off a box, land softly and immediately rebound up.", "Minimize ground contact time.", "Land softly again after the jump."]),
  ];

  const _etIds = new Set(exerciseTemplates.map((e) => e.id));
  exerciseTemplates.push(
    ...smartReplaceCatalog.filter((e) => !_etIds.has(e.id)),
    ..._additionalExercises.filter((e) => !_etIds.has(e.id))
  );
}

// ── Exercise library — final top-up (gap-closing exercises) ──────────────────
{
  const _finalExercises: ExerciseWithTaxonomy[] = [
    // Chest
    makeExercise("deficit-push-up", "Deficit Push-Up", "Chest", ["Triceps", "Front Delts"], "horizontal_push", "flat", "bodyweight", "intermediate", "bodyweight_only", "00:45", ["Place hands on raised surfaces to increase range of motion.", "Lower chest past the level of the hands.", "Press away feeling the greater stretch."]),
    makeExercise("archer-push-up", "Archer Push-Up", "Chest", ["Triceps", "Shoulders"], "horizontal_push", "flat", "bodyweight", "advanced", "bodyweight_only", "00:45", ["Wide push-up position, shift weight to one arm.", "Lower toward the bent arm while the other stays nearly straight.", "Press back to center and repeat on the other side."]),
    makeExercise("pin-press", "Pin Press", "Chest", ["Triceps", "Front Delts"], "horizontal_push", "flat", "barbell", "advanced", "barbell", "01:30", ["Set safety pins at the sticking point of your bench press.", "Start each rep from the dead stop on the pins.", "Drive through the sticking point to lockout."]),

    // Back / Pull
    makeExercise("wide-grip-cable-row", "Wide-Grip Cable Row", "Upper Back", ["Rear Delts", "Lats"], "horizontal_pull", "flat", "cable", "beginner", "machine", "01:00", ["Attach a wide bar, sit tall with a slight lean.", "Drive elbows wide and back squeezing the upper back.", "Let the shoulder blades protract under control."]),
    makeExercise("close-grip-cable-row", "Close-Grip Cable Row", "Lats", ["Upper Back", "Biceps"], "horizontal_pull", "flat", "cable", "beginner", "machine", "01:00", ["Use a V-bar or narrow handle.", "Pull to the lower abdomen driving elbows close to the body.", "Control the return to full stretch."]),
    makeExercise("reverse-grip-lat-pulldown", "Reverse Grip Lat Pulldown", "Lats", ["Biceps", "Upper Back"], "vertical_pull", "overhead", "cable", "beginner", "machine", "01:00", ["Underhand grip slightly inside shoulder width.", "Pull to upper chest keeping elbows close.", "Control the return."]),
    makeExercise("single-arm-cable-row", "Single-Arm Cable Row", "Upper Back", ["Lats", "Biceps"], "horizontal_pull", "flat", "cable", "beginner", "machine", "00:45", ["Sit side-on or face-on with one hand on the handle.", "Row to the hip rotating slightly through the torso.", "Control the return."]),
    makeExercise("dead-hang", "Dead Hang", "Lats", ["Forearms", "Shoulders"], "vertical_pull", "overhead", "bodyweight", "beginner", "bodyweight_only", "01:00", ["Grip the bar with both hands, fully relax the body.", "Let the shoulders decompress fully.", "Breathe and hold for the target duration."]),
    makeExercise("jefferson-curl", "Jefferson Curl", "Hamstrings", ["Lower Back", "Glutes"], "hip_hinge", "none", "dumbbell", "intermediate", "free_weights_accessories", "01:00", ["Stand on a box, hold weight at arms length.", "Curl the spine down vertebra by vertebra.", "Uncurl slowly back to standing — a mobility deadlift."]),
    makeExercise("glute-ham-raise", "Glute-Ham Raise", "Hamstrings", ["Glutes", "Lower Back"], "hip_hinge", "none", "bodyweight", "advanced", "machine", "01:30", ["Lock feet into the GHD, start horizontal.", "Curl body up using the hamstrings.", "Lower with control."]),
    makeExercise("single-leg-leg-press", "Single-Leg Leg Press", "Quads", ["Glutes", "Hamstrings"], "squat", "none", "machine", "intermediate", "machine", "01:00", ["Place one foot in the center of the platform.", "Lower under control without the knee caving.", "Drive through the heel to full extension."]),

    // Legs — missing patterns
    makeExercise("lateral-lunge", "Lateral Lunge", "Quads", ["Glutes", "Inner Thigh"], "lunge", "none", "bodyweight", "beginner", "bodyweight_only", "00:45", ["Stand feet together, step wide to one side.", "Sit into the bent leg while keeping the other straight.", "Push through the bent heel to return."]),
    makeExercise("curtsy-lunge", "Curtsy Lunge", "Glutes", ["Quads", "Inner Thigh"], "lunge", "none", "dumbbell", "beginner", "free_weights_accessories", "00:45", ["Step one foot behind and across the other.", "Lower into a curtsy keeping the front knee over the toe.", "Drive through the front heel to return."]),
    makeExercise("cossack-squat", "Cossack Squat", "Adductors", ["Glutes", "Quads"], "lunge", "none", "bodyweight", "intermediate", "bodyweight_only", "00:45", ["Shift into one hip while keeping the other leg long.", "Sit as deep as mobility allows without rounding the trunk.", "Push through the bent leg to return to center."]),
    makeExercise("box-squat", "Box Squat", "Quads", ["Glutes", "Hamstrings"], "squat", "none", "barbell", "intermediate", "barbell", "01:30", ["Squat to a box set at parallel or below.", "Sit on the box briefly without relaxing the core.", "Drive up explosively through the heels."]),
    makeExercise("jump-lunge", "Jump Lunge", "Quads", ["Glutes", "Calves"], "lunge", "none", "bodyweight", "intermediate", "bodyweight_only", "01:00", ["Start in a lunge position.", "Explosively jump switching legs in mid-air.", "Land softly and immediately into the next rep."]),
    makeExercise("reverse-nordic-curl", "Reverse Nordic Curl", "Quads", ["Hip Flexors"], "squat", "none", "bodyweight", "advanced", "bodyweight_only", "01:30", ["Kneel with feet anchored, body upright.", "Lean backward as far as control allows.", "Pull back to upright using the quads."]),
    makeExercise("banded-lateral-walk", "Banded Lateral Walk", "Glutes", ["Abductors"], "isolation_legs", "none", "resistance_band", "beginner", "free_weights_accessories", "00:30", ["Loop band around ankles or above knees.", "Step sideways maintaining tension on the band.", "Keep a soft knee bend and upright torso throughout."]),
    makeExercise("banded-clamshell", "Banded Clamshell", "Glutes", ["Abductors"], "isolation_legs", "none", "resistance_band", "beginner", "free_weights_accessories", "00:30", ["Lie on your side with band above the knees.", "Open the top knee while keeping feet together.", "Return slowly without letting the hips rock."]),
    makeExercise("cable-hip-flexor", "Cable Hip Flexor Raise", "Hip Flexors", ["Abs / Core"], "isolation_legs", "none", "cable", "beginner", "machine", "00:30", ["Attach ankle cuff to low cable, face away.", "Raise the knee to hip height in a controlled arc.", "Lower slowly and repeat."]),

    // Core — final additions
    makeExercise("hollow-body-rock", "Hollow Body Rock", "Abs / Core", [], "core_anterior", "none", "bodyweight", "intermediate", "bodyweight_only", "00:30", ["Compress into the hollow body position.", "Rock forward and back like a rocking chair.", "Maintain the compressed position throughout."]),
    makeExercise("captain-chair-knee-raise", "Captain's Chair Knee Raise", "Abs / Core", ["Hip Flexors"], "core_anterior", "none", "bodyweight", "beginner", "bodyweight_only", "00:45", ["Brace on the captain's chair with forearms on pads.", "Raise knees to hip height keeping the back against the pad.", "Lower slowly under control."]),
    makeExercise("windshield-wiper", "Windshield Wiper", "Obliques", ["Abs / Core"], "core_rotational", "none", "bodyweight", "advanced", "bodyweight_only", "00:45", ["Hang from a bar, raise legs to vertical.", "Rotate legs side to side in a controlled arc.", "Control the rotation — do not swing."]),

    // Olympic / Power
    makeExercise("hang-clean", "Hang Clean", "Hamstrings", ["Traps", "Shoulders", "Glutes"], "hip_hinge", "none", "barbell", "advanced", "barbell", "02:00", ["Start with bar at the hang above knees.", "Extend the hips explosively and shrug.", "Receive in a front squat or power position at the shoulders."]),
    makeExercise("clean-pull", "Clean Pull", "Hamstrings", ["Traps", "Glutes"], "hip_hinge", "none", "barbell", "advanced", "barbell", "02:00", ["Pull the bar as in a clean but don't receive it.", "Finish with triple extension — ankles, knees, hips.", "Lower under control to the floor."]),
    makeExercise("sumo-deadlift-high-pull", "Sumo Deadlift High Pull", "Hamstrings", ["Traps", "Shoulders", "Glutes"], "hip_hinge", "none", "barbell", "advanced", "barbell", "01:30", ["Sumo stance, grip inside the legs.", "Pull the bar and lead the elbows high finishing at chin level.", "Lower under control."]),
    makeExercise("med-ball-slam", "Med Ball Slam", "Core", ["Shoulders", "Back"], "core_rotational", "none", "none", "intermediate", "free_weights_accessories", "01:00", ["Hold the ball overhead fully extended.", "Slam it into the ground with maximum force.", "Pick it up and repeat without hesitation."]),
    makeExercise("box-jump-weighted", "Weighted Box Jump", "Quads", ["Glutes", "Calves"], "squat", "none", "dumbbell", "advanced", "free_weights_accessories", "01:30", ["Hold light dumbbells, stand arm's length from the box.", "Swing arms and explode up.", "Land softly and step back down."]),

    // Weighted bodyweight variations
    makeExercise("weighted-dip", "Weighted Dip", "Chest", ["Triceps", "Front Delts"], "vertical_push", "decline", "bodyweight", "advanced", "bodyweight_weighted", "01:30", ["Attach weight via belt and hang still before starting.", "Lower with slight forward lean for chest emphasis.", "Press back up to full lockout."]),
    makeExercise("kipping-pull-up", "Kipping Pull-Up", "Lats", ["Shoulders", "Core"], "vertical_pull", "overhead", "bodyweight", "intermediate", "bodyweight_only", "01:00", ["Use a controlled hip drive to generate momentum.", "Pull as the hips swing forward.", "Cycle smoothly between reps."]),
    makeExercise("assisted-tricep-dip", "Assisted Tricep Dip", "Triceps", ["Chest"], "vertical_push", "decline", "bodyweight", "beginner", "machine", "00:45", ["Set the assistance weight, grip the handles.", "Lower until elbows hit 90 degrees.", "Press back to full extension."]),
    makeExercise("machine-preacher-curl", "Machine Preacher Curl", "Biceps", ["Forearms"], "isolation_pull", "incline", "machine", "beginner", "machine", "00:45", ["Adjust pad height, grip the handles.", "Curl through full range without swinging.", "Lower slowly to full extension."]),
    makeExercise("cable-preacher-curl", "Cable Preacher Curl", "Biceps", ["Forearms"], "isolation_pull", "incline", "cable", "beginner", "machine", "00:45", ["Set low cable, brace arm on the angled pad.", "Curl to full contraction under constant tension.", "Lower slowly."]),
    makeExercise("banded-pull-through", "Banded Pull-Through", "Glutes", ["Hamstrings"], "hip_hinge", "none", "resistance_band", "beginner", "free_weights_accessories", "00:45", ["Stand facing away from anchor, band between legs.", "Hinge forward letting the band pull through.", "Drive hips forward to stand squeezing the glutes."]),
    makeExercise("landmine-hip-thrust", "Landmine Hip Thrust", "Glutes", ["Hamstrings"], "hip_hinge", "none", "landmine", "beginner", "barbell", "01:00", ["Sit with upper back on bench, bar end over hips.", "Drive through heels squeezing glutes at the top.", "Lower slowly."]),
    makeExercise("single-arm-dumbbell-press", "Single-Arm Dumbbell Press", "Chest", ["Triceps", "Core"], "horizontal_push", "flat", "dumbbell", "intermediate", "free_weights_accessories", "01:00", ["Lie flat with one dumbbell, non-working arm to the side.", "Press the dumbbell up keeping the torso stable.", "Lower under control."]),
  ];

  const _topUpIds = new Set(exerciseTemplates.map((e) => e.id));
  exerciseTemplates.push(..._finalExercises.filter((e) => !_topUpIds.has(e.id)));
}

// ── Strong-app gap-fill ───────────────────────────────────────────────────────
{
  const _strongExercises: ExerciseWithTaxonomy[] = [
    // ── Core ─────────────────────────────────────────────────────────────────
    makeExercise("reverse-crunch", "Reverse Crunch", "Abs / Core", ["Hip Flexors"], "core_anterior", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Lie flat, knees bent at 90 degrees.", "Curl the hips up and toward the chest using the lower abs.", "Lower slowly without letting the lower back arch."]),
    makeExercise("hanging-knee-raise", "Hanging Knee Raise", "Abs / Core", ["Hip Flexors"], "core_anterior", "none", "bodyweight", "beginner", "bodyweight_only", "00:45", ["Dead hang from a pull-up bar with ribs down.", "Drive knees toward the chest without swinging.", "Lower slowly under control."]),
    makeExercise("oblique-crunch", "Oblique Crunch", "Obliques", ["Abs / Core"], "core_rotational", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Lie on your side, knees bent, hand behind head.", "Crunch the top elbow toward the top hip.", "Lower under control and repeat."]),
    makeExercise("jackknife-sit-up", "Jackknife Sit-Up", "Abs / Core", ["Hip Flexors"], "core_anterior", "none", "bodyweight", "intermediate", "bodyweight_only", "00:30", ["Lie flat, arms overhead, legs straight.", "Simultaneously raise arms and legs meeting in the middle.", "Lower both back to the floor under control."]),
    makeExercise("decline-sit-up", "Decline Sit-Up", "Abs / Core", ["Hip Flexors"], "core_anterior", "decline", "bodyweight", "intermediate", "bodyweight_only", "00:30", ["Anchor feet on decline bench, hands behind ears.", "Curl all the way up to vertical.", "Lower under control to flat."]),
    makeExercise("superman", "Superman", "Lower Back", ["Glutes", "Hamstrings"], "hip_hinge", "prone", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Lie face down, arms extended overhead.", "Raise arms and legs simultaneously squeezing the glutes.", "Hold briefly and lower."]),
    makeExercise("hip-circle", "Hip Circle", "Hip Flexors", ["Glutes", "Abs / Core"], "isolation_legs", "none", "none", "beginner", "bodyweight_only", "00:30", ["Stand upright, hands on hips.", "Rotate the hips in a large circle keeping the torso still.", "Complete full circles each direction."]),

    // ── Triceps ───────────────────────────────────────────────────────────────
    makeExercise("ez-bar-skull-crusher", "EZ Bar Skull Crusher", "Triceps", [], "isolation_push", "flat", "barbell", "intermediate", "free_weights_accessories", "01:00", ["Lie flat, EZ bar over face with a close grip.", "Lower by bending only at the elbows toward the forehead.", "Press back through the triceps keeping elbows pinned."]),
    makeExercise("reverse-grip-pushdown", "Reverse Grip Tricep Pushdown", "Triceps", [], "isolation_push", "none", "cable", "beginner", "machine", "00:45", ["Underhand grip on the straight bar at the cable.", "Lock elbows at the sides and push down to full extension.", "Return slowly keeping elbows fixed."]),
    makeExercise("one-arm-cable-pushdown", "One-Arm Cable Pushdown", "Triceps", [], "isolation_push", "none", "cable", "beginner", "machine", "00:45", ["Single handle on a high cable, elbow at the side.", "Push down to full extension and squeeze.", "Return slowly."]),
    makeExercise("v-bar-pushdown", "V-Bar Pushdown", "Triceps", [], "isolation_push", "none", "cable", "beginner", "machine", "00:45", ["Attach V-bar to high cable, grip with neutral hands.", "Lock elbows at sides and press to full extension.", "Control the return without letting elbows flare."]),
    makeExercise("overhead-ez-bar-extension", "Overhead EZ Bar Tricep Extension", "Triceps", [], "isolation_push", "none", "barbell", "beginner", "free_weights_accessories", "00:45", ["Hold EZ bar overhead with a close grip, elbows pointing up.", "Lower behind the head bending only at the elbows.", "Extend back to lockout."]),
    makeExercise("incline-tricep-extension", "Incline Tricep Extension", "Triceps", [], "isolation_push", "incline", "dumbbell", "beginner", "free_weights_accessories", "00:45", ["Lie on an incline bench, dumbbells over face.", "Lower by bending only the elbows.", "Press back up through the triceps."]),

    // ── Biceps ────────────────────────────────────────────────────────────────
    makeExercise("barbell-21s", "Barbell 21s", "Biceps", ["Forearms"], "isolation_pull", "none", "barbell", "intermediate", "barbell", "00:45", ["7 reps lower half (bottom to 90°), 7 reps upper half (90° to top), 7 full reps.", "Keep elbows pinned throughout all 21 reps.", "Use a lighter weight than a standard curl."]),
    makeExercise("single-leg-curl", "Single-Leg Curl", "Hamstrings", [], "isolation_legs", "prone", "machine", "beginner", "machine", "00:45", ["Set pad above the ankle of one leg.", "Curl the heel toward the glute without letting the hip rise.", "Lower slowly to full extension."]),

    // ── Shoulders ─────────────────────────────────────────────────────────────
    makeExercise("cuban-press", "Cuban Press", "Shoulders", ["Rotator Cuff", "Traps"], "isolation_push", "overhead", "dumbbell", "intermediate", "free_weights_accessories", "00:45", ["Upright row to 90°, then externally rotate forearms to vertical.", "Press overhead from the rotated position.", "Reverse the sequence on the way down."]),
    makeExercise("bradford-press", "Bradford Press", "Shoulders", ["Traps", "Triceps"], "vertical_push", "overhead", "barbell", "intermediate", "barbell", "01:00", ["Start with bar at upper chest.", "Press just over the top of the head and lower behind the neck.", "Alternate front and back without stopping at lockout."]),

    // ── Chest ─────────────────────────────────────────────────────────────────
    makeExercise("low-to-high-cable-fly", "Low-to-High Cable Fly", "Upper Chest", ["Front Delts"], "isolation_push", "incline", "cable", "beginner", "machine", "00:45", ["Set cables low, lean slightly forward.", "Arc handles upward and together toward upper chest.", "Control the return with a full stretch."]),
    makeExercise("high-to-low-cable-fly", "High-to-Low Cable Fly", "Lower Chest", ["Front Delts"], "isolation_push", "decline", "cable", "beginner", "machine", "00:45", ["Set cables high, lean slightly forward.", "Arc handles downward and together toward lower chest.", "Control the return to full stretch."]),
    makeExercise("dumbbell-squeeze-press", "Dumbbell Squeeze Press", "Chest", ["Triceps"], "isolation_push", "flat", "dumbbell", "beginner", "free_weights_accessories", "00:45", ["Hold dumbbells pressed together over the chest.", "Maintain inward pressure throughout the entire rep.", "Press and lower keeping the dumbbells in contact."]),

    // ── Back / Hips ───────────────────────────────────────────────────────────
    makeExercise("banded-deadlift", "Banded Deadlift", "Hamstrings", ["Glutes", "Lower Back", "Traps"], "hip_hinge", "none", "resistance_band", "intermediate", "free_weights_accessories", "01:30", ["Stand on bands with feet hip-width, grip at sides.", "Brace and stand — resistance increases as you rise.", "Lower under control against the band tension."]),
    makeExercise("seated-good-morning", "Seated Good Morning", "Hamstrings", ["Lower Back", "Glutes"], "hip_hinge", "none", "barbell", "intermediate", "barbell", "01:00", ["Sit on a bench, bar across upper back.", "Hinge forward at the hips keeping the back neutral.", "Drive back to upright using the hamstrings."]),
    makeExercise("cable-leg-curl", "Cable Leg Curl", "Hamstrings", [], "isolation_legs", "none", "cable", "beginner", "machine", "00:45", ["Attach ankle cuff to a low cable, lie face down or stand.", "Curl the heel toward the glute through full range.", "Lower slowly under control."]),

    // ── Quads / Legs ──────────────────────────────────────────────────────────
    makeExercise("split-squat", "Split Squat", "Quads", ["Glutes", "Hamstrings"], "lunge", "none", "bodyweight", "beginner", "bodyweight_only", "00:45", ["Take a long stride forward, both feet flat.", "Lower the back knee toward the floor in a static split.", "Drive through the front heel to return."]),
    makeExercise("pendulum-squat", "Pendulum Squat", "Quads", ["Glutes"], "squat", "none", "machine", "intermediate", "machine", "01:30", ["Load the machine, lean back against the pad.", "Lower into a deep squat with an upright torso.", "Drive up through the heels."]),
    makeExercise("high-knees", "High Knees", "Quads", ["Hip Flexors", "Calves"], "cardio", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Run in place driving knees up to hip height.", "Pump arms in opposition to the legs.", "Keep a fast rhythm and stay on the balls of the feet."]),
  ];

  const _strongIds = new Set(exerciseTemplates.map((e) => e.id));
  exerciseTemplates.push(..._strongExercises.filter((e) => !_strongIds.has(e.id)));
}

// ── User-requested exercise additions ─────────────────────────────────────────
{
  const _userExercises: ExerciseWithTaxonomy[] = [
    // ── Chest ──────────────────────────────────────────────────────────────────
    makeExercise("bear-walk", "Bear Walk", "Chest", ["Shoulders", "Core", "Triceps"], "horizontal_push", "flat", "bodyweight", "beginner", "bodyweight_only", "00:45", ["Start on all fours with knees hovering an inch off the floor.", "Walk forward by moving opposite hand and foot simultaneously.", "Keep hips level and core braced throughout."]),
    makeExercise("butterfly-machine", "Butterfly Machine", "Chest", ["Front Delts"], "isolation_push", "flat", "machine", "beginner", "machine", "00:45", ["Adjust the seat so arms open at chest height.", "Squeeze the pads together through the full arc.", "Return with control — don't let the stack crash."]),
    makeExercise("dumbbell-pullover-chest", "Dumbbell Pullover (Chest)", "Chest", ["Lats", "Triceps"], "horizontal_push", "flat", "dumbbell", "intermediate", "free_weights_accessories", "01:00", ["Lie perpendicular on a bench, hips below bench level.", "Lower the dumbbell behind your head with a slight elbow bend.", "Pull back over the chest by squeezing the pecs — not the lats."]),
    makeExercise("pause-bench-press", "Pause Bench Press", "Chest", ["Front Delts", "Triceps"], "horizontal_push", "flat", "barbell", "intermediate", "barbell", "02:00", ["Lower the bar to mid-chest and hold for 2–3 seconds with full muscle tension.", "No bounce — eliminate all stretch reflex before pressing.", "Drive up explosively once the pause is complete."]),
    // ── Arms ───────────────────────────────────────────────────────────────────
    makeExercise("axe-hold", "Axe Hold", "Forearms", ["Shoulders", "Biceps"], "carry", "flat", "dumbbell", "beginner", "free_weights_accessories", "00:30", ["Hold a dumbbell at arm's length in front of you at shoulder height.", "Keep the wrist neutral and the shoulder packed.", "Hold for the target duration without letting the elbow bend or dip."]),
    makeExercise("deadhang", "Deadhang", "Forearms", ["Lats", "Shoulders"], "vertical_pull", "overhead", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Grip the bar slightly wider than shoulder width.", "Let the body hang completely — no engagement in the shoulder girdle.", "Breathe steadily and hold for the target time."]),
    makeExercise("australian-pull-up", "Australian Pull-Up", "Upper Back", ["Biceps", "Rear Delts"], "horizontal_pull", "flat", "bodyweight", "beginner", "bodyweight_only", "01:00", ["Set a bar at hip height, hang underneath with straight body.", "Pull your chest to the bar driving elbows back.", "Lower slowly to full arm extension keeping the body rigid."]),
    makeExercise("drag-pushdown", "Drag Pushdown", "Triceps", ["Lats"], "isolation_push", "none", "cable", "intermediate", "free_weights_accessories", "00:45", ["Grip a straight bar at a high cable, pin elbows at the sides.", "Drag the bar down the body — elbows travel back as they extend.", "Squeeze the triceps at the bottom before returning."]),
    makeExercise("kong-curl", "Kong Curl", "Biceps", ["Forearms", "Brachialis"], "isolation_pull", "flat", "dumbbell", "beginner", "free_weights_accessories", "00:45", ["Hold dumbbells supinated, curl both arms simultaneously.", "Lean the torso very slightly forward as you curl.", "Squeeze at the top and lower under full control."]),
    // ── Back ───────────────────────────────────────────────────────────────────
    makeExercise("rack-deadlift", "Rack Deadlift", "Lower Back", ["Glutes", "Hamstrings", "Traps"], "hip_hinge", "none", "barbell", "intermediate", "barbell", "02:00", ["Set the safety pins at knee or mid-shin height.", "Brace hard before every rep — treat each pull as a max effort.", "Lock out with hips and knees simultaneously, don't hyperextend."]),
    makeExercise("kroc-row", "Kroc Row", "Lats", ["Upper Back", "Biceps", "Rear Delts"], "horizontal_pull", "flat", "dumbbell", "advanced", "free_weights_accessories", "01:30", ["Brace on a bench, heavy dumbbell in one hand.", "Row explosively to the hip allowing slight torso rotation.", "Lower under control and repeat for high reps."]),
    makeExercise("high-row-cable", "High Row (Cable)", "Upper Back", ["Rear Delts", "Biceps", "Rhomboids"], "horizontal_pull", "flat", "cable", "beginner", "free_weights_accessories", "01:00", ["Set the cable above head height with a rope or wide handle.", "Pull to the upper chest driving elbows wide and back.", "Control the return letting the shoulder blades protract fully."]),
    makeExercise("reverse-cable-flye", "Reverse Cable Flye", "Rear Delts", ["Rhomboids", "Traps"], "horizontal_pull", "flat", "cable", "beginner", "free_weights_accessories", "00:45", ["Cross cables at chest height, grab opposite handles.", "Open arms wide in a reverse fly arc squeezing the rear delts.", "Control the return without letting the cables yank you forward."]),
    makeExercise("dumbbell-pullover-back", "Dumbbell Pullover (Back)", "Lats", ["Chest", "Serratus", "Triceps"], "vertical_pull", "flat", "dumbbell", "intermediate", "free_weights_accessories", "01:00", ["Lie perpendicular on a bench, hips dropped for a full stretch.", "Lower the dumbbell behind the head pulling from the lats.", "Think elbows toward hips to bias the lats over the chest."]),
    makeExercise("straight-arm-lat-pulldown-cable", "Straight Arm Lat Pulldown (Cable)", "Lats", ["Core", "Rear Delts"], "vertical_pull", "overhead", "cable", "intermediate", "free_weights_accessories", "01:00", ["Set a high cable, grip a straight bar with arms extended.", "Pull down in an arc keeping arms straight throughout.", "Squeeze the lats at the bottom before returning with control."]),
    makeExercise("straight-arm-lat-pulldown-rope", "Straight Arm Lat Pulldown (Rope)", "Lats", ["Core", "Rear Delts"], "vertical_pull", "overhead", "cable", "intermediate", "free_weights_accessories", "01:00", ["Set a high cable with a rope, split the ends at the bottom.", "Pull down and slightly back keeping arms straight.", "Control the return to feel the full lat stretch at the top."]),
    // ── Shoulders ──────────────────────────────────────────────────────────────
    makeExercise("rear-delt-raise", "Rear Delt Raise", "Rear Delts", ["Upper Back", "Rhomboids"], "isolation_pull", "prone", "dumbbell", "beginner", "free_weights_accessories", "00:45", ["Hinge forward until torso is near parallel, or lie prone on incline.", "Raise arms out to the sides with a soft elbow bend.", "Control the lowering — don't let momentum take over."]),
    makeExercise("dumbbell-scaption", "Dumbbell Scaption", "Shoulders", ["Rotator Cuff", "Serratus"], "isolation_push", "incline", "dumbbell", "beginner", "free_weights_accessories", "00:45", ["Stand tall, thumbs pointing up and arms at 30–45 degrees from the front plane.", "Raise to shoulder height in the scapular plane — not directly in front.", "Lower slowly maintaining the 30-degree angle throughout."]),
    makeExercise("wall-angels", "Wall Angels", "Shoulders", ["Rotator Cuff", "Upper Back", "Thoracic Spine"], "isolation_push", "flat", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Stand flat against a wall — head, upper back and lower back all in contact.", "Slide arms up and down the wall like a snow angel motion.", "Maintain full wall contact throughout — don't let the lower back arch off."]),
    makeExercise("handstand", "Handstand", "Shoulders", ["Triceps", "Core", "Upper Back"], "vertical_push", "overhead", "bodyweight", "advanced", "bodyweight_only", "00:30", ["Kick up against a wall for support, hands shoulder-width.", "Stack wrists, shoulders, hips and heels in one vertical line.", "Spread the fingers and press actively through the floor to stabilise."]),
    makeExercise("seated-dumbbell-lateral-raise", "Seated Dumbbell Lateral Raise", "Side Delts", ["Traps"], "isolation_push", "none", "dumbbell", "beginner", "free_weights_accessories", "00:45", ["Sit upright at the edge of a bench, dumbbells at sides.", "Raise laterally to shoulder height with a soft elbow — no momentum from legs.", "Lower slowly keeping shoulder blades neutral."]),
    // ── Legs ───────────────────────────────────────────────────────────────────
    makeExercise("barbell-walking-lunge", "Barbell Walking Lunge", "Quads", ["Glutes", "Hamstrings", "Core"], "lunge", "none", "barbell", "intermediate", "barbell", "01:30", ["Place the bar across the upper back, brace core before stepping.", "Step forward, lower the back knee toward the floor.", "Drive through the front heel and step the back foot forward — do not stop between reps."]),
    makeExercise("wall-squat", "Wall Squat", "Quads", ["Glutes", "Hamstrings"], "squat", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Stand with back flat against a wall, feet 12–18 inches out.", "Slide down until thighs are parallel to the floor.", "Hold with arms crossed or extended, breathing normally."]),
    makeExercise("dumbbell-thruster", "Dumbbell Thruster", "Quads", ["Shoulders", "Glutes", "Triceps"], "squat", "overhead", "dumbbell", "intermediate", "free_weights_accessories", "01:00", ["Hold dumbbells at shoulder height, squat to parallel.", "Drive up explosively and press overhead in one fluid motion.", "Lock out overhead before bringing the dumbbells back to shoulders."]),
    makeExercise("hamstring-kicks", "Hamstring Kicks", "Hamstrings", ["Glutes", "Hip Flexors"], "hip_hinge", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Stand on one leg or use a wall for balance.", "Kick the heel toward the glute in a controlled arc.", "Pause briefly at the top and lower with control."]),
    makeExercise("leg-swings-front-back", "Leg Swings (Front-Back)", "Hip Flexors", ["Hamstrings", "Glutes"], "hip_hinge", "none", "bodyweight", "beginner", "bodyweight_only", "00:20", ["Hold a wall or post for balance on one leg.", "Swing the free leg forward and back through its natural range.", "Gradually increase amplitude over each rep — keep the torso still."]),
    // ── Abs / Core ─────────────────────────────────────────────────────────────
    makeExercise("weighted-crunch", "Weighted Crunch", "Abs", ["Obliques"], "core_anterior", "none", "dumbbell", "intermediate", "bodyweight_weighted", "00:30", ["Hold a weight plate or dumbbell against the chest or behind the head.", "Curl the rib cage toward the pelvis, not the head toward the knees.", "Lower under full control to avoid momentum."]),
    makeExercise("dumbbell-side-bend", "Dumbbell Side Bend", "Obliques", ["Core", "Quadratus Lumborum"], "core_rotational", "none", "dumbbell", "beginner", "free_weights_accessories", "00:30", ["Hold a dumbbell in one hand, stand tall.", "Bend laterally toward the dumbbell side, then return upright.", "Avoid leaning forward or back — movement is purely lateral."]),
    makeExercise("plank-shoulder-taps", "Plank Shoulder Taps", "Core", ["Shoulders", "Obliques"], "core_anterior", "none", "bodyweight", "beginner", "bodyweight_only", "00:30", ["Set a high plank position, feet slightly wider for stability.", "Tap one shoulder with the opposite hand, then alternate.", "Resist rotation — keep hips level and square throughout."]),
    // ── Cardio ─────────────────────────────────────────────────────────────────
    makeExercise("zone-2-running", "Zone 2 Running", "Cardio", ["Quads", "Calves", "Glutes"], "cardio", "none", "none", "beginner", "freestyle_cardio", "00:00", ["Keep heart rate in zone 2 (60–70% max HR) — conversational pace.", "Maintain a natural midfoot strike and relaxed arm swing.", "Log duration and distance rather than pace — consistency is the goal."]),
    makeExercise("swimming", "Swimming", "Cardio", ["Lats", "Shoulders", "Core", "Legs"], "cardio", "none", "none", "beginner", "freestyle_cardio", "00:00", ["Choose a stroke and maintain controlled breathing rhythm.", "Focus on long, efficient pulls and a steady kick.", "Log laps and duration to track aerobic improvement."]),
    makeExercise("cycling", "Cycling", "Cardio", ["Quads", "Glutes", "Calves"], "cardio", "none", "none", "beginner", "freestyle_cardio", "00:00", ["Set seat height so the knee has a slight bend at the bottom of the pedal stroke.", "Maintain a cadence of 70–100 rpm for aerobic training.", "Log duration, distance, or average power."]),
    makeExercise("jumping-jacks", "Jumping Jacks", "Cardio", ["Shoulders", "Legs", "Calves"], "cardio", "none", "bodyweight", "beginner", "bodyweight_only", "00:20", ["Start standing, jump feet out while raising arms overhead.", "Jump back to starting position and repeat rhythmically.", "Land softly on the balls of the feet to absorb impact."]),
    makeExercise("recumbent-bike", "Recumbent Bike", "Cardio", ["Quads", "Hamstrings", "Glutes"], "cardio", "none", "machine", "beginner", "machine", "00:00", ["Adjust the seat so the knee has a slight bend at full extension.", "Push through the full pedal stroke — don't just push the top.", "Log duration and distance; adjust resistance to target heart rate zone."]),
    makeExercise("box-jump", "Box Jump", "Quads", ["Glutes", "Calves", "Hamstrings"], "squat", "none", "bodyweight", "intermediate", "bodyweight_only", "01:00", ["Stand an arm's length from the box, feet hip width.", "Swing arms back, dip briefly and explode upward.", "Land softly with knees tracking the toes, then step back down."]),
    makeExercise("outdoor-run", "Outdoor Run", "Cardio", ["Quads", "Calves", "Glutes", "Hamstrings"], "cardio", "none", "none", "beginner", "freestyle_cardio", "00:00", ["Start at an easy pace and warm up for the first few minutes.", "Maintain relaxed shoulders and natural arm swing.", "Log distance, duration, or pace depending on the session goal."]),
    makeExercise("hiit-cardio", "HIIT Cardio", "Cardio", ["Full Body"], "cardio", "none", "none", "intermediate", "freestyle_cardio", "00:00", ["Alternate between max-effort intervals and active recovery.", "Work intervals: 20–40 s all-out; rest intervals: 20–60 s easy.", "Log total rounds and total duration."]),
  ];
  const _userIds = new Set(exerciseTemplates.map((e) => e.id));
  exerciseTemplates.push(..._userExercises.filter((e) => !_userIds.has(e.id)));
}

const defaultState: FlowState = {
  status: "idle",
  suggestion: null,
  message: null,
  engineSource: null
};

const fallbackGuidanceTip =
  "Complete a few quality working sets first, then let RepIQ suggest the next best move.";
const fallbackGuidanceWhy =
  "RepIQ becomes more useful once it can compare today's logged work against your recent pattern. As soon as you complete enough sets, it can guide whether to hold, add reps, add load, or stay conservative based on your actual performance trend.";

const sessionDate = "2026-01-26";
const defaultWorkoutSettings: WorkoutSettings = {
  defaultRestSeconds: "90",
  transitionRestSeconds: "60",
  carryForwardDefaults: true,
  showRpe: true,
  guidanceTopStrip: false,
  guidanceInline: true,
  preferredGoal: null,
  preferredLevel: null,
  preferredEquipment: null,
};
const initialWorkoutExercises: ExerciseDraft[] = [
  exerciseLibrary[0],
  exerciseLibrary[1],
  cloneExerciseTemplate(
    exerciseTemplates.find((exercise) => exercise.id === "lat-pulldown")!,
    defaultWorkoutSettings.defaultRestSeconds,
    "seed-1"
  ),
  cloneExerciseTemplate(
    exerciseTemplates.find((exercise) => exercise.id === "seated-cable-row")!,
    defaultWorkoutSettings.defaultRestSeconds,
    "seed-2"
  ),
  cloneExerciseTemplate(
    exerciseTemplates.find((exercise) => exercise.id === "shoulder-press")!,
    defaultWorkoutSettings.defaultRestSeconds,
    "seed-3"
  )
];
const defaultWorkoutMeta: WorkoutMeta = {
  date: formatDateInputValue(new Date()),
  startTime: formatTimeFromDate(new Date()),
  startedMinutesAgo: "0",
  sessionName: "Upper Push",
  startInstant: new Date().toISOString()
};

function generateWorkoutName(exercises: ExerciseDraft[]): string {
  const hour = new Date().getHours();
  const timePrefix =
    hour < 11 ? "Morning" : hour < 14 ? "Midday" : hour < 17 ? "Afternoon" : hour < 20 ? "Evening" : "Night";

  const pushMuscles = new Set(["Chest", "Upper Chest", "Shoulders", "Triceps"]);
  const pullMuscles = new Set(["Lats", "Upper Back", "Rear Delts", "Biceps", "Traps"]);
  const legMuscles = new Set(["Quads", "Hamstrings", "Glutes", "Calves", "Adductors", "Hip Flexors"]);
  const coreMuscles = new Set(["Core", "Abs", "Obliques"]);

  const muscles = exercises.map((e) => e.primaryMuscle);

  const hasPush = muscles.some((m) => pushMuscles.has(m));
  const hasPull = muscles.some((m) => pullMuscles.has(m));
  const hasLegs = muscles.some((m) => legMuscles.has(m));
  const hasCore = muscles.some((m) => coreMuscles.has(m));

  let label: string;
  if (hasPush && hasPull && hasLegs) label = "Full Body";
  else if (hasPush && hasPull) label = "Upper Body";
  else if ((hasPush || hasPull) && hasLegs) label = "Full Body";
  else if (hasPush) label = "Upper Push";
  else if (hasPull) label = "Upper Pull";
  else if (hasLegs) label = "Legs";
  else if (hasCore) label = "Core";
  else label = "Workout";

  return `${timePrefix} ${label}`;
}

function formatSessionDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short"
  });
}

function getStoredSavedWorkouts(): SavedWorkoutData[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(savedWorkoutsStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedWorkout(workout: SavedWorkoutData): void {
  try {
    const existing = getStoredSavedWorkouts();
    // newest first, keep last 200
    const updated = [workout, ...existing].slice(0, 200);
    window.localStorage.setItem(savedWorkoutsStorageKey, JSON.stringify(updated));
  } catch {
    // storage full or unavailable — ignore
  }
}

function persistSavedWorkoutsList(workouts: SavedWorkoutData[]): void {
  try {
    window.localStorage.setItem(savedWorkoutsStorageKey, JSON.stringify(workouts));
  } catch {
    // storage full or unavailable — ignore
  }
}

// ── Psychological data storage ───────────────────────────────────────────────

function getStoredPsychProfile(): UserPsychProfile {
  try {
    const raw = window.localStorage.getItem(psychProfileStorageKey);
    if (!raw) return { ...DEFAULT_PSYCH_PROFILE };
    return { ...DEFAULT_PSYCH_PROFILE, ...JSON.parse(raw) };
  } catch { return { ...DEFAULT_PSYCH_PROFILE }; }
}

function persistPsychProfile(profile: UserPsychProfile): void {
  try { window.localStorage.setItem(psychProfileStorageKey, JSON.stringify(profile)); } catch {}
}

function getStoredRepIQPlan(): RepIQPlan | null {
  try {
    const raw = window.localStorage.getItem(repiqPlanStorageKey);
    if (!raw) return null;
    const plan = JSON.parse(raw) as RepIQPlan;
    // Migrate: ensure all days have completedAt field (added in schema v2)
    const migrated: RepIQPlan = {
      ...plan,
      weeks: plan.weeks.map((week) => ({
        ...week,
        days: week.days.map((day) => ({
          ...day,
          completedAt: day.completedAt ?? null,
        })),
      })),
    };
    return migrated;
  } catch { return null; }
}

function persistRepIQPlan(plan: RepIQPlan): void {
  try { window.localStorage.setItem(repiqPlanStorageKey, JSON.stringify(plan)); } catch {}
}

function getStoredPostWorkoutPsych(): PostWorkoutPsych[] {
  try {
    const raw = window.localStorage.getItem(postWorkoutPsychStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function persistPostWorkoutPsych(entry: PostWorkoutPsych): void {
  try {
    const existing = getStoredPostWorkoutPsych();
    // Upsert: replace existing entry for same sessionId if re-capturing
    const updated = [entry, ...existing.filter(e => e.sessionId !== entry.sessionId)].slice(0, 500);
    window.localStorage.setItem(postWorkoutPsychStorageKey, JSON.stringify(updated));
  } catch {}
}

function getStoredDailyReadiness(): DailyReadiness[] {
  try {
    const raw = window.localStorage.getItem(dailyReadinessStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function persistDailyReadiness(entry: DailyReadiness): void {
  try {
    const existing = getStoredDailyReadiness();
    // Upsert by date
    const updated = [entry, ...existing.filter(e => e.date !== entry.date)].slice(0, 365);
    window.localStorage.setItem(dailyReadinessStorageKey, JSON.stringify(updated));
  } catch {}
}

function getTodayReadiness(): DailyReadiness | null {
  const today = new Date().toISOString().slice(0, 10);
  return getStoredDailyReadiness().find(e => e.date === today) ?? null;
}

function getStoredSessionBehavior(): SessionBehaviorSignals[] {
  try {
    const raw = window.localStorage.getItem(sessionBehaviorStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function persistSessionBehavior(entry: SessionBehaviorSignals): void {
  try {
    const existing = getStoredSessionBehavior();
    const updated = [entry, ...existing.filter(e => e.sessionId !== entry.sessionId)].slice(0, 500);
    window.localStorage.setItem(sessionBehaviorStorageKey, JSON.stringify(updated));
  } catch {}
}

// ── Workout plans storage ────────────────────────────────────────────────────

const SAMPLE_WORKOUT_PLANS: WorkoutPlan[] = [
  {
    id: "sample-push",
    name: "Push Day A",
    tag: "Push",
    userTags: ["PPL", "Heavy"],
    note: "Chest, shoulders and triceps — heavy day",
    exercises: [
      { exerciseId: "bench-press", setCount: 4, restTimer: "120" },
      { exerciseId: "incline-dumbbell-press", setCount: 3, restTimer: "90" },
      { exerciseId: "shoulder-press", setCount: 3, restTimer: "90" },
      { exerciseId: "cable-lateral-raise", setCount: 3, restTimer: "60" },
      { exerciseId: "rope-pushdown", setCount: 3, restTimer: "60" }
    ],
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 7 * 86400000).toISOString()
  },
  {
    id: "sample-pull",
    name: "Pull Day A",
    tag: "Pull",
    userTags: ["PPL"],
    note: "Back and biceps",
    exercises: [
      { exerciseId: "lat-pulldown", setCount: 4, restTimer: "120" },
      { exerciseId: "seated-cable-row", setCount: 3, restTimer: "90" },
      { exerciseId: "ez-bar-curl", setCount: 3, restTimer: "60" }
    ],
    createdAt: new Date(Date.now() - 6 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 6 * 86400000).toISOString()
  },
  {
    id: "sample-legs",
    name: "Legs",
    tag: "Legs",
    userTags: ["PPL"],
    note: "Quads, hamstrings and glutes",
    exercises: [
      { exerciseId: "barbell-squat", setCount: 4, restTimer: "180" },
      { exerciseId: "romanian-deadlift", setCount: 3, restTimer: "120" },
      { exerciseId: "leg-press", setCount: 3, restTimer: "120" },
      { exerciseId: "hamstring-curl", setCount: 3, restTimer: "90" }
    ],
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 86400000).toISOString()
  },
  {
    id: "sample-upper",
    name: "Upper Body",
    tag: "Upper",
    userTags: ["Maintenance"],
    note: "Balanced push/pull for maintenance days",
    exercises: [
      { exerciseId: "bench-press", setCount: 3, restTimer: "90" },
      { exerciseId: "lat-pulldown", setCount: 3, restTimer: "90" },
      { exerciseId: "shoulder-press", setCount: 3, restTimer: "90" }
    ],
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 86400000).toISOString()
  }
];

const SAMPLE_PLAN_IDS = new Set(SAMPLE_WORKOUT_PLANS.map((p) => p.id));

function getStoredWorkoutPlans(): WorkoutPlan[] {
  if (typeof window === "undefined") return SAMPLE_WORKOUT_PLANS;
  try {
    const raw = window.localStorage.getItem(workoutPlansStorageKey);
    if (!raw) return SAMPLE_WORKOUT_PLANS;
    const parsed = JSON.parse(raw);
    // Strip any sample plans that may have been accidentally mixed into stored data
    const userPlans = Array.isArray(parsed) ? parsed.filter((p: WorkoutPlan) => !SAMPLE_PLAN_IDS.has(p.id)) : [];
    return userPlans.length > 0 ? userPlans : SAMPLE_WORKOUT_PLANS;
  } catch {
    return SAMPLE_WORKOUT_PLANS;
  }
}

function persistWorkoutPlans(plans: WorkoutPlan[]): void {
  try {
    // Never persist sample plans — they are always shown dynamically when no user plans exist
    const userPlans = plans.filter((p) => !SAMPLE_PLAN_IDS.has(p.id));
    window.localStorage.setItem(workoutPlansStorageKey, JSON.stringify(userPlans));
  } catch {
    // storage full or unavailable — ignore
  }
}

function getStoredPlanBuilderDraft():
  | {
      draft: WorkoutPlan;
      mode: PlanBuilderMode;
    }
  | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(planBuilderDraftStorageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { draft?: WorkoutPlan; mode?: PlanBuilderMode };
    if (!parsed?.draft) {
      return null;
    }
    return {
      draft: parsed.draft,
      mode: parsed.mode ?? "create"
    };
  } catch {
    return null;
  }
}

function persistPlanBuilderDraft(draft: WorkoutPlan | null, mode: PlanBuilderMode): void {
  try {
    if (!draft) {
      window.localStorage.removeItem(planBuilderDraftStorageKey);
      return;
    }
    window.localStorage.setItem(planBuilderDraftStorageKey, JSON.stringify({ draft, mode }));
  } catch {
    // storage full or unavailable — ignore
  }
}

// ── Hardcoded starter templates ──────────────────────────────────────────────

const WORKOUT_PLAN_TEMPLATES: WorkoutPlan[] = [
  // ── PPL ──
  {
    id: "template-push",
    name: "Push Day",
    tag: "Push",
    note: "Chest, shoulders and triceps",
    category: "PPL", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Chest", "Shoulders", "Triceps"], duration: 45,
    exercises: [
      { exerciseId: "bench-press", setCount: 4, restTimer: "02:00" },
      { exerciseId: "incline-dumbbell-press", setCount: 3, restTimer: "01:45" },
      { exerciseId: "shoulder-press", setCount: 3, restTimer: "01:45" },
      { exerciseId: "cable-lateral-raise", setCount: 3, restTimer: "01:00" },
      { exerciseId: "rope-pushdown", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-pull",
    name: "Pull Day",
    tag: "Pull",
    note: "Back and biceps",
    category: "PPL", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Back", "Biceps"], duration: 40,
    exercises: [
      { exerciseId: "lat-pulldown", setCount: 4, restTimer: "02:00" },
      { exerciseId: "seated-cable-row", setCount: 3, restTimer: "01:45" },
      { exerciseId: "chest-supported-row", setCount: 3, restTimer: "01:45" },
      { exerciseId: "ez-bar-curl", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-legs",
    name: "Leg Day",
    tag: "Legs",
    note: "Quads, hamstrings and glutes",
    category: "PPL", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Legs"], duration: 50,
    exercises: [
      { exerciseId: "barbell-squat", setCount: 4, restTimer: "02:30" },
      { exerciseId: "romanian-deadlift", setCount: 3, restTimer: "02:00" },
      { exerciseId: "leg-press", setCount: 3, restTimer: "02:00" },
      { exerciseId: "hamstring-curl", setCount: 3, restTimer: "01:30" },
      { exerciseId: "standing-calf-raise", setCount: 4, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  // ── Upper / Lower ──
  {
    id: "template-upper-a",
    name: "Upper Body A",
    tag: "Upper",
    note: "Chest, back and shoulders — press-focused",
    category: "Upper/Lower", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Chest", "Back", "Shoulders"], duration: 50,
    exercises: [
      { exerciseId: "bench-press", setCount: 4, restTimer: "02:00" },
      { exerciseId: "weighted-pull-up", setCount: 3, restTimer: "02:00" },
      { exerciseId: "shoulder-press", setCount: 3, restTimer: "01:45" },
      { exerciseId: "seated-cable-row", setCount: 3, restTimer: "01:30" },
      { exerciseId: "cable-lateral-raise", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-upper-b",
    name: "Upper Body B",
    tag: "Upper",
    note: "Back, chest and arms — row-focused",
    category: "Upper/Lower", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Back", "Chest", "Arms"], duration: 55,
    exercises: [
      { exerciseId: "lat-pulldown", setCount: 4, restTimer: "02:00" },
      { exerciseId: "bench-press", setCount: 3, restTimer: "02:00" },
      { exerciseId: "chest-supported-row", setCount: 3, restTimer: "01:45" },
      { exerciseId: "incline-dumbbell-press", setCount: 3, restTimer: "01:45" },
      { exerciseId: "ez-bar-curl", setCount: 3, restTimer: "01:00" },
      { exerciseId: "rope-pushdown", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-lower-a",
    name: "Lower Body A",
    tag: "Lower",
    note: "Quad-dominant — squat pattern",
    category: "Upper/Lower", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Legs", "Core"], duration: 50,
    exercises: [
      { exerciseId: "barbell-squat", setCount: 4, restTimer: "02:30" },
      { exerciseId: "leg-press", setCount: 3, restTimer: "02:00" },
      { exerciseId: "hamstring-curl", setCount: 3, restTimer: "01:30" },
      { exerciseId: "standing-calf-raise", setCount: 4, restTimer: "01:00" },
      { exerciseId: "plank", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-lower-b",
    name: "Lower Body B",
    tag: "Lower",
    note: "Hip-dominant — hinge and glute pattern",
    category: "Upper/Lower", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Legs", "Glutes"], duration: 50,
    exercises: [
      { exerciseId: "romanian-deadlift", setCount: 4, restTimer: "02:00" },
      { exerciseId: "barbell-hip-thrust", setCount: 4, restTimer: "02:00" },
      { exerciseId: "hamstring-curl", setCount: 3, restTimer: "01:30" },
      { exerciseId: "cable-hip-abduction", setCount: 3, restTimer: "01:00" },
      { exerciseId: "standing-calf-raise", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  // ── Full Body ──
  {
    id: "template-full-body-a",
    name: "Full Body A",
    tag: "Full Body",
    note: "Compound movements covering all major groups",
    category: "Full Body", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Full Body"], duration: 45,
    exercises: [
      { exerciseId: "barbell-squat", setCount: 3, restTimer: "02:30" },
      { exerciseId: "bench-press", setCount: 3, restTimer: "02:00" },
      { exerciseId: "lat-pulldown", setCount: 3, restTimer: "02:00" },
      { exerciseId: "shoulder-press", setCount: 3, restTimer: "01:45" },
      { exerciseId: "plank", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-full-body-b",
    name: "Full Body B",
    tag: "Full Body",
    note: "Deadlift + press + row pattern",
    category: "Full Body", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Full Body"], duration: 45,
    exercises: [
      { exerciseId: "romanian-deadlift", setCount: 3, restTimer: "02:00" },
      { exerciseId: "bench-press", setCount: 3, restTimer: "02:00" },
      { exerciseId: "seated-cable-row", setCount: 3, restTimer: "01:45" },
      { exerciseId: "shoulder-press", setCount: 3, restTimer: "01:45" },
      { exerciseId: "hanging-leg-raise", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-full-body-c",
    name: "Full Body C",
    tag: "Full Body",
    note: "Squat + pull-up + incline pattern",
    category: "Full Body", level: "Intermediate", equipment: "Full Gym", goal: "Strength",
    muscleGroups: ["Full Body"], duration: 50,
    exercises: [
      { exerciseId: "barbell-squat", setCount: 3, restTimer: "02:30" },
      { exerciseId: "weighted-pull-up", setCount: 3, restTimer: "02:00" },
      { exerciseId: "incline-dumbbell-press", setCount: 3, restTimer: "02:00" },
      { exerciseId: "cable-lateral-raise", setCount: 3, restTimer: "01:00" },
      { exerciseId: "back-extension", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  // ── Specialisation ──
  {
    id: "template-chest-tris",
    name: "Chest & Triceps",
    tag: "Chest",
    note: "Volume day for chest and tricep detail",
    category: "Specialisation", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Chest", "Triceps"], duration: 45,
    exercises: [
      { exerciseId: "bench-press", setCount: 4, restTimer: "02:00" },
      { exerciseId: "incline-dumbbell-press", setCount: 4, restTimer: "01:45" },
      { exerciseId: "chest-dip", setCount: 3, restTimer: "01:30" },
      { exerciseId: "rope-pushdown", setCount: 4, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-back-bis",
    name: "Back & Biceps",
    tag: "Back",
    note: "Lats, rhomboids and bicep curls",
    category: "Specialisation", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Back", "Biceps"], duration: 50,
    exercises: [
      { exerciseId: "lat-pulldown", setCount: 4, restTimer: "02:00" },
      { exerciseId: "seated-cable-row", setCount: 4, restTimer: "01:45" },
      { exerciseId: "chest-supported-row", setCount: 3, restTimer: "01:45" },
      { exerciseId: "weighted-pull-up", setCount: 3, restTimer: "02:00" },
      { exerciseId: "ez-bar-curl", setCount: 4, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-shoulders",
    name: "Shoulder Day",
    tag: "Shoulders",
    note: "Press, lateral raise and rear delt work",
    category: "Specialisation", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Shoulders"], duration: 40,
    exercises: [
      { exerciseId: "shoulder-press", setCount: 4, restTimer: "02:00" },
      { exerciseId: "cable-lateral-raise", setCount: 4, restTimer: "01:00" },
      { exerciseId: "reverse-pec-deck", setCount: 3, restTimer: "01:00" },
      { exerciseId: "dumbbell-front-raise", setCount: 3, restTimer: "01:00" },
      { exerciseId: "dumbbell-shrug", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-glutes-hams",
    name: "Glutes & Hamstrings",
    tag: "Glutes",
    note: "Hip thrust, hinge and isolation work",
    category: "Specialisation", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Glutes", "Legs"], duration: 45,
    exercises: [
      { exerciseId: "barbell-hip-thrust", setCount: 4, restTimer: "02:00" },
      { exerciseId: "romanian-deadlift", setCount: 4, restTimer: "02:00" },
      { exerciseId: "hamstring-curl", setCount: 3, restTimer: "01:30" },
      { exerciseId: "cable-hip-abduction", setCount: 3, restTimer: "01:00" },
      { exerciseId: "back-extension", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  // ── Powerlifting ──
  {
    id: "template-pl-squat",
    name: "Squat Day",
    tag: "Powerlifting",
    note: "Competition squat with accessory work",
    category: "Powerlifting", level: "Advanced", equipment: "Full Gym", goal: "Strength",
    muscleGroups: ["Legs", "Core"], duration: 60,
    exercises: [
      { exerciseId: "barbell-squat", setCount: 5, restTimer: "03:00" },
      { exerciseId: "leg-press", setCount: 4, restTimer: "02:00" },
      { exerciseId: "hamstring-curl", setCount: 3, restTimer: "01:30" },
      { exerciseId: "back-extension", setCount: 3, restTimer: "01:00" },
      { exerciseId: "plank", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-pl-bench",
    name: "Bench Day",
    tag: "Powerlifting",
    note: "Competition bench with pressing accessories",
    category: "Powerlifting", level: "Advanced", equipment: "Full Gym", goal: "Strength",
    muscleGroups: ["Chest", "Triceps", "Shoulders"], duration: 55,
    exercises: [
      { exerciseId: "bench-press", setCount: 5, restTimer: "03:00" },
      { exerciseId: "incline-dumbbell-press", setCount: 4, restTimer: "02:00" },
      { exerciseId: "chest-dip", setCount: 3, restTimer: "01:30" },
      { exerciseId: "rope-pushdown", setCount: 4, restTimer: "01:00" },
      { exerciseId: "dumbbell-front-raise", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-pl-deadlift",
    name: "Deadlift Day",
    tag: "Powerlifting",
    note: "Hinge pattern with upper back and trap work",
    category: "Powerlifting", level: "Advanced", equipment: "Full Gym", goal: "Strength",
    muscleGroups: ["Back", "Legs"], duration: 55,
    exercises: [
      { exerciseId: "romanian-deadlift", setCount: 5, restTimer: "03:00" },
      { exerciseId: "seated-cable-row", setCount: 4, restTimer: "02:00" },
      { exerciseId: "dumbbell-shrug", setCount: 3, restTimer: "01:00" },
      { exerciseId: "back-extension", setCount: 3, restTimer: "01:00" },
      { exerciseId: "standing-calf-raise", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  // ── Minimal Equipment ──
  {
    id: "template-dumbbell-fb",
    name: "Dumbbell Full Body",
    tag: "Dumbbells",
    note: "Full body with dumbbells only",
    category: "Minimal", level: "Intermediate", equipment: "Dumbbells", goal: "Hypertrophy",
    muscleGroups: ["Full Body"], duration: 40,
    exercises: [
      { exerciseId: "incline-dumbbell-press", setCount: 3, restTimer: "01:45" },
      { exerciseId: "romanian-deadlift", setCount: 3, restTimer: "02:00" },
      { exerciseId: "dumbbell-front-raise", setCount: 3, restTimer: "01:00" },
      { exerciseId: "dumbbell-shrug", setCount: 3, restTimer: "01:00" },
      { exerciseId: "standing-calf-raise", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-bodyweight",
    name: "Bodyweight",
    tag: "Bodyweight",
    note: "No equipment needed",
    category: "Minimal", level: "Beginner", equipment: "Bodyweight", goal: "Endurance",
    muscleGroups: ["Full Body"], duration: 30,
    exercises: [
      { exerciseId: "push-up", setCount: 4, restTimer: "01:00" },
      { exerciseId: "pull-up", setCount: 4, restTimer: "01:30" },
      { exerciseId: "wall-sit", setCount: 3, restTimer: "01:00" },
      { exerciseId: "plank", setCount: 3, restTimer: "01:00" },
      { exerciseId: "hanging-leg-raise", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  // ── Beginner ──
  {
    id: "template-beginner-a",
    name: "Beginner Full Body A",
    tag: "Beginner",
    note: "Simple compound movements — day 1",
    category: "Beginner", level: "Beginner", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Full Body"], duration: 40,
    exercises: [
      { exerciseId: "barbell-squat", setCount: 3, restTimer: "02:00" },
      { exerciseId: "bench-press", setCount: 3, restTimer: "02:00" },
      { exerciseId: "lat-pulldown", setCount: 3, restTimer: "01:30" },
      { exerciseId: "shoulder-press", setCount: 3, restTimer: "01:30" },
      { exerciseId: "plank", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-beginner-b",
    name: "Beginner Full Body B",
    tag: "Beginner",
    note: "Machine-friendly — day 2",
    category: "Beginner", level: "Beginner", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Full Body"], duration: 40,
    exercises: [
      { exerciseId: "leg-press", setCount: 3, restTimer: "02:00" },
      { exerciseId: "chest-dip", setCount: 3, restTimer: "01:30" },
      { exerciseId: "seated-cable-row", setCount: 3, restTimer: "01:30" },
      { exerciseId: "cable-lateral-raise", setCount: 3, restTimer: "01:00" },
      { exerciseId: "back-extension", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-beginner-c",
    name: "Beginner Full Body C",
    tag: "Beginner",
    note: "Bodyweight + free weights — day 3",
    category: "Beginner", level: "Beginner", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Full Body"], duration: 40,
    exercises: [
      { exerciseId: "romanian-deadlift", setCount: 3, restTimer: "02:00" },
      { exerciseId: "push-up", setCount: 3, restTimer: "01:00" },
      { exerciseId: "pull-up", setCount: 3, restTimer: "01:30" },
      { exerciseId: "shoulder-press", setCount: 3, restTimer: "01:30" },
      { exerciseId: "standing-calf-raise", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  }
];

function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  const stored = window.localStorage.getItem(themeStorageKey);
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "system";
}

function getStoredWorkoutSettings(): WorkoutSettings {
  if (typeof window === "undefined") {
    return defaultWorkoutSettings;
  }

  try {
    const raw = window.localStorage.getItem(workoutSettingsStorageKey);
    if (!raw) {
      return defaultWorkoutSettings;
    }

    const parsed = JSON.parse(raw) as Partial<WorkoutSettings>;
    return {
      defaultRestSeconds:
        typeof parsed.defaultRestSeconds === "string"
          ? sanitizeIntegerInput(parsed.defaultRestSeconds)
          : defaultWorkoutSettings.defaultRestSeconds,
      transitionRestSeconds:
        typeof parsed.transitionRestSeconds === "string"
          ? sanitizeIntegerInput(parsed.transitionRestSeconds)
          : defaultWorkoutSettings.transitionRestSeconds,
      carryForwardDefaults:
        typeof parsed.carryForwardDefaults === "boolean"
          ? parsed.carryForwardDefaults
          : defaultWorkoutSettings.carryForwardDefaults,
      showRpe:
        typeof parsed.showRpe === "boolean" ? parsed.showRpe : defaultWorkoutSettings.showRpe,
      guidanceTopStrip:
        typeof parsed.guidanceTopStrip === "boolean"
          ? parsed.guidanceTopStrip
          : defaultWorkoutSettings.guidanceTopStrip,
      guidanceInline:
        typeof parsed.guidanceInline === "boolean"
          ? parsed.guidanceInline
          : defaultWorkoutSettings.guidanceInline,
      preferredGoal: typeof parsed.preferredGoal === "string" ? parsed.preferredGoal : null,
      preferredLevel: typeof parsed.preferredLevel === "string" ? parsed.preferredLevel : null,
      preferredEquipment: typeof parsed.preferredEquipment === "string" ? parsed.preferredEquipment : null,
    };
  } catch {
    return defaultWorkoutSettings;
  }
}

function getStoredCustomExercises(): ExerciseDraft[] {
  if (typeof window === "undefined") {
    return seededCustomExercises.map((exercise) => cloneExerciseDraft(exercise));
  }

  try {
    const raw = window.localStorage.getItem(customExercisesStorageKey);
    if (!raw) {
      return seededCustomExercises.map((exercise) => cloneExerciseDraft(exercise));
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return seededCustomExercises.map((exercise) => cloneExerciseDraft(exercise));
    }

    if (parsed.length === 0) {
      return seededCustomExercises.map((exercise) => cloneExerciseDraft(exercise));
    }

    return parsed
      .filter(
        (exercise): exercise is ExerciseDraft =>
          Boolean(exercise) &&
          typeof exercise.id === "string" &&
          typeof exercise.name === "string" &&
          typeof exercise.restTimer === "string" &&
          typeof exercise.primaryMuscle === "string" &&
          Array.isArray(exercise.secondaryMuscles) &&
          Array.isArray(exercise.howTo) &&
          Array.isArray(exercise.history) &&
          Array.isArray(exercise.draftSets)
      )
      .map((exercise) =>
        cloneExerciseDraft(exercise, {
          isCustom: true,
          libraryStatus: exercise.libraryStatus === "archived" ? "archived" : "active",
          imageSrc:
            typeof exercise.imageSrc === "string" && exercise.imageSrc.length > 0
              ? exercise.imageSrc
              : genericExerciseImage
        })
      );
  } catch {
    return seededCustomExercises.map((exercise) => cloneExerciseDraft(exercise));
  }
}

function getSystemTheme(): Exclude<ThemePreference, "system"> {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getExerciseMeasurementType(exercise: ExerciseDraft): MeasurementType {
  if (exercise.measurementType) {
    return exercise.measurementType;
  }

  const name = exercise.name.toLowerCase();
  if (/(run|bike|cycle|walk|elliptical|rower|stair|stretch|mobility|yoga|plank|hold)/.test(name)) {
    return "timed";
  }

  const exerciseType = inferExerciseType(exercise);
  if (exerciseType === "freestyle_cardio") {
    return "timed";
  }

  return "reps_volume";
}

function getPrimaryMuscles(exercise: Pick<ExerciseDraft, "primaryMuscle" | "primaryMuscles">) {
  return exercise.primaryMuscles && exercise.primaryMuscles.length > 0
    ? exercise.primaryMuscles
    : [exercise.primaryMuscle];
}

function formatPrimaryMuscles(exercise: Pick<ExerciseDraft, "primaryMuscle" | "primaryMuscles">) {
  return getPrimaryMuscles(exercise).join(", ");
}

function usesWeightInputForMeasurement(measurementType: MeasurementType) {
  return measurementType !== "timed";
}

function usesTimedMetric(measurementType: MeasurementType) {
  return measurementType === "timed" || measurementType === "weight_timed";
}

function getMeasurementColumnLabels(measurementType: MeasurementType) {
  return {
    first: usesWeightInputForMeasurement(measurementType) ? "Kg" : "—",
    second: usesTimedMetric(measurementType) ? "Time" : "Reps"
  };
}

function formatMeasurementValue(value: number, measurementType: MeasurementType) {
  if (usesTimedMetric(measurementType)) {
    return `${value}s`;
  }

  return String(value);
}

function formatPreviousSet(set: WorkoutSet | undefined, measurementType: MeasurementType = "reps_volume") {
  if (!set) {
    return "";
  }

  if (measurementType === "timed") {
    return formatMeasurementValue(set.reps, measurementType);
  }

  if (measurementType === "weight_timed") {
    return `${set.weight}kg x ${formatMeasurementValue(set.reps, measurementType)}`;
  }

  return `${set.weight}kg x ${set.reps}`;
}

function getSupersetAccent(groupId?: string | null) {
  if (!groupId) {
    return null;
  }

  const total = Array.from(groupId).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return supersetPalette[total % supersetPalette.length];
}

function formatRestTimer(secondsInput: string) {
  const totalSeconds = Math.max(0, Number(secondsInput || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${padTimeSegment(minutes % 60)}:${padTimeSegment(seconds)}`;
  }

  return `${padTimeSegment(minutes)}:${padTimeSegment(seconds)}`;
}

function padTimeSegment(value: number) {
  return String(value).padStart(2, "0");
}

function formatTimeFromDate(date: Date) {
  return `${padTimeSegment(date.getHours())}:${padTimeSegment(date.getMinutes())}`;
}

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = padTimeSegment(date.getMonth() + 1);
  const day = padTimeSegment(date.getDate());
  return `${year}-${month}-${day}`;
}

function buildDateTime(date: string, time: string) {
  if (!date || !time) {
    return null;
  }

  const parsed = new Date(`${date}T${time}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getMinutesAgoFromDateTime(date: string, time: string) {
  const start = buildDateTime(date, time);
  if (!start) {
    return "";
  }

  const diffMs = Date.now() - start.getTime();
  return String(Math.max(0, Math.round(diffMs / 60000)));
}

function getDateAndTimeFromMinutesAgo(minutesAgoInput: string) {
  const minutesAgo = Number(minutesAgoInput || 0);
  const start = new Date(Date.now() - Math.max(0, minutesAgo) * 60000);

  return {
    date: formatDateInputValue(start),
    startTime: formatTimeFromDate(start),
    startInstant: start.toISOString()
  };
}

function formatMinutesSecondsInput(value: string) {
  const digits = value.replace(/[^\d]/g, "").slice(-4);

  if (!digits) {
    return "";
  }

  if (digits.length <= 2) {
    return `00:${digits.padStart(2, "0")}`;
  }

  const minutes = digits.slice(0, -2).padStart(2, "0");
  const seconds = digits.slice(-2);
  return `${minutes}:${seconds}`;
}

function formatElapsedDuration(date: string, time: string, startInstant?: string) {
  const instantStart =
    typeof startInstant === "string" && startInstant
      ? new Date(startInstant)
      : null;
  const start =
    instantStart && !Number.isNaN(instantStart.getTime())
      ? instantStart
      : buildDateTime(date, time);
  if (!start) {
    return "00:00";
  }

  const elapsedSeconds = Math.max(0, Math.round((Date.now() - start.getTime()) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  if (hours > 0) {
    return `${hours}:${padTimeSegment(minutes)}:${padTimeSegment(seconds)}`;
  }

  return `${minutes}:${padTimeSegment(seconds)}`;
}

function parseMinutesSecondsToSeconds(value: string) {
  const [minutesText, secondsText] = value.split(":");
  const minutes = Number(minutesText);
  const seconds = Number(secondsText);

  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return 0;
  }

  return Math.max(0, minutes * 60 + seconds);
}

function formatRemainingSeconds(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${padTimeSegment(minutes)}:${padTimeSegment(seconds)}`;
}

function shiftIsoDateByDays(date: string, deltaDays: number) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  parsed.setDate(parsed.getDate() + deltaDays);
  return parsed.toISOString().slice(0, 10);
}

function createDerivedHistorySession(
  session: ExerciseHistorySession,
  exerciseName: string,
  sessionKey: string,
  date: string
): ExerciseHistorySession {
  return {
    ...session,
    date,
    exercise: exerciseName,
    session_key: sessionKey,
    sets: session.sets.map((set) => ({
      ...set,
      weight: Number((set.weight * 0.9).toFixed(1)),
      reps: Math.max(1, set.reps - 1),
      rpe: typeof set.rpe === "number" ? Math.max(5, set.rpe - 0.5) : set.rpe
    }))
  };
}

function normalizeExerciseHistory(
  history: ExerciseHistorySession[],
  exerciseName: string,
  historyKeyBase: string
) {
  const clonedHistory: ExerciseHistorySession[] = history.map((session) => ({
    ...session,
    exercise: exerciseName,
    sets: session.sets.map((set) => ({ ...set }))
  }));

  if (clonedHistory.length === 0 || clonedHistory.length >= 3) {
    return clonedHistory;
  }

  while (clonedHistory.length < 3) {
    const earliestSession = clonedHistory[0];
    clonedHistory.unshift(
      createDerivedHistorySession(
        earliestSession,
        exerciseName,
        `${historyKeyBase}-history-${clonedHistory.length + 1}`,
        shiftIsoDateByDays(earliestSession.date, -7)
      )
    );
  }

  return clonedHistory;
}

function cloneExerciseTemplate(template: ExerciseDraft, restSeconds: string, suffix: string): ExerciseDraft {
  return {
    ...template,
    id: `${template.id}-${suffix}`,
    note: "",
    stickyNoteEnabled: template.stickyNoteEnabled ?? false,
    restTimer: formatRestTimer(restSeconds),
    supersetGroupId: null,
    primaryMuscles: template.primaryMuscles ? [...template.primaryMuscles] : [template.primaryMuscle],
    secondaryMuscles: [...template.secondaryMuscles],
    howTo: [...template.howTo],
    history: normalizeExerciseHistory(template.history, template.name, template.id),
    draftSets: template.draftSets.map((set, index) => ({
      ...set,
      id: `${template.id}-${suffix}-set-${index + 1}`,
      weightInput: "",
      repsInput: "",
      rpeInput: "",
      done: false,
      failed: false
    }))
  };
}

function cloneExerciseDraft(
  exercise: ExerciseDraft,
  overrides?: Partial<ExerciseDraft>
): ExerciseDraft {
  const resolvedPrimaryMuscles = overrides?.primaryMuscles ?? exercise.primaryMuscles ?? [exercise.primaryMuscle];
  return {
    ...exercise,
    ...overrides,
    stickyNoteEnabled: overrides?.stickyNoteEnabled ?? exercise.stickyNoteEnabled ?? false,
    primaryMuscles: [...resolvedPrimaryMuscles],
    secondaryMuscles: [...(overrides?.secondaryMuscles ?? exercise.secondaryMuscles)],
    howTo: [...(overrides?.howTo ?? exercise.howTo)],
    history: normalizeExerciseHistory(
      exercise.history,
      overrides?.name ?? exercise.name,
      overrides?.id ?? exercise.id
    ),
    draftSets: exercise.draftSets.map((set) => ({ ...set }))
  };
}

function buildInitialWorkoutExercises(restDefaults: ExerciseRestDefaults) {
  return initialWorkoutExercises.map((exercise) =>
    cloneExerciseDraft(exercise, {
      restTimer: restDefaults[exercise.name] ?? exercise.restTimer
    })
  );
}

function sanitizeDecimalInput(value: string) {
  const stripped = value.replace(/[^\d.]/g, "");
  const [head, ...rest] = stripped.split(".");
  return rest.length > 0 ? `${head}.${rest.join("")}` : head;
}

function sanitizeIntegerInput(value: string) {
  return value.replace(/[^\d]/g, "");
}

function parseNumberInput(input: string, fallback?: number | null) {
  if (input.trim() === "") {
    return fallback ?? null;
  }
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : fallback ?? null;
}

function normalizeSetType(value?: string): DraftSetType {
  return setTypeOptions.some((option) => option.value === value)
    ? (value as DraftSetType)
    : "normal";
}

function getSetTypeOccurrence(draftSets: DraftSet[], index: number) {
  const currentType = draftSets[index]?.setType;
  return draftSets.slice(0, index + 1).filter((set) => set.setType === currentType).length;
}

function getDisplaySetLabel(draftSets: DraftSet[], index: number) {
  const setType = draftSets[index]?.setType;
  if (setType === "normal") {
    return String(
      draftSets.slice(0, index + 1).filter((set) => set.setType === "normal").length
    );
  }

  return setTypeOptions.find((option) => option.value === setType)?.symbol ?? "W";
}

function getPreviousReferenceSet(
  draftSets: DraftSet[],
  index: number,
  lastSession: ExerciseHistorySession | undefined
) {
  if (!lastSession) return undefined;
  const draftType = draftSets[index]?.setType;
  const targetOccurrence = getSetTypeOccurrence(draftSets, index);
  const matchingSets = lastSession.sets.filter(
    (set) => normalizeSetType(set.set_type) === draftType
  );

  return matchingSets[targetOccurrence - 1];
}

function getCurrentExerciseCarrySource(
  draftSets: DraftSet[],
  index: number
): DraftSet | null {
  for (let currentIndex = index - 1; currentIndex >= 0; currentIndex -= 1) {
    const candidate = draftSets[currentIndex];
    if (
      candidate.weightInput.trim().length > 0 ||
      candidate.repsInput.trim().length > 0 ||
      candidate.rpeInput.trim().length > 0 ||
      candidate.done
    ) {
      return candidate;
    }
  }

  return null;
}

function normalizeSupersetGroups(exercises: ExerciseDraft[]) {
  const counts = new Map<string, number>();

  exercises.forEach((exercise) => {
    if (exercise.supersetGroupId) {
      counts.set(
        exercise.supersetGroupId,
        (counts.get(exercise.supersetGroupId) ?? 0) + 1
      );
    }
  });

  return exercises.map((exercise) =>
    exercise.supersetGroupId && (counts.get(exercise.supersetGroupId) ?? 0) < 2
      ? { ...exercise, supersetGroupId: null }
      : exercise
  );
}

function buildCompletedSets(
  draftSets: DraftSet[],
  lastSession: ExerciseHistorySession | undefined,
  carryForwardDefaults: boolean,
  measurementType: MeasurementType = "reps_volume"
) {
  const resolvedSets: WorkoutSet[] = [];
  const issues: string[] = [];

  draftSets.forEach((draftSet, index) => {
    if (!draftSet.done) {
      return;
    }

    const previousSet = getPreviousReferenceSet(draftSets, index, lastSession);
    const weight = usesWeightInputForMeasurement(measurementType)
      ? parseNumberInput(
          draftSet.weightInput,
          carryForwardDefaults ? previousSet?.weight : null
        )
      : 0;
    const reps = parseNumberInput(
      draftSet.repsInput,
      carryForwardDefaults ? previousSet?.reps : null
    );
    const rpe = parseNumberInput(
      draftSet.rpeInput,
      carryForwardDefaults ? previousSet?.rpe ?? null : null
    );

    if (reps === null || (usesWeightInputForMeasurement(measurementType) && weight === null)) {
      issues.push(
        `Set ${getDisplaySetLabel(draftSets, index)} needs ${
          usesWeightInputForMeasurement(measurementType)
            ? usesTimedMetric(measurementType)
              ? "weight and time."
              : "weight and reps."
            : "time."
        }`
      );
      return;
    }

    resolvedSets.push({
      weight: weight ?? 0,
      reps: Math.round(reps),
      set_type: draftSet.setType,
      rpe,
      failed: draftSet.failed
    });
  });

  return { resolvedSets, issues };
}

function isExerciseComplete(exercise: ExerciseDraft) {
  return exercise.draftSets.length > 0 && exercise.draftSets[exercise.draftSets.length - 1]?.done === true;
}

function isExerciseStarted(exercise: ExerciseDraft) {
  return exercise.draftSets.some((set) => set.done);
}

function isExerciseInProgress(exercise: ExerciseDraft) {
  return isExerciseStarted(exercise) && !isExerciseComplete(exercise);
}

function isInteractiveSwipeTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("input, button, label, summary"));
}

function estimateOneRm(set?: WorkoutSet) {
  if (!set) {
    return 0;
  }
  return Math.round(set.weight * (1 + set.reps / 30));
}

function resolveDraftSet(
  draftSets: DraftSet[],
  index: number,
  lastSession: ExerciseHistorySession | undefined,
  carryForwardDefaults: boolean,
  measurementType: MeasurementType = "reps_volume"
) {
  const draftSet = draftSets[index];
  const previousSet = getPreviousReferenceSet(draftSets, index, lastSession);
  const weight = usesWeightInputForMeasurement(measurementType)
    ? parseNumberInput(
        draftSet.weightInput,
        carryForwardDefaults ? previousSet?.weight : null
      )
    : 0;
  const reps = parseNumberInput(
    draftSet.repsInput,
    carryForwardDefaults ? previousSet?.reps : null
  );
  const rpe = parseNumberInput(
    draftSet.rpeInput,
    carryForwardDefaults ? previousSet?.rpe ?? null : null
  );

  if (reps === null || (usesWeightInputForMeasurement(measurementType) && weight === null)) {
    return null;
  }

  return {
    weight: weight ?? 0,
    reps: Math.round(reps),
    set_type: draftSet.setType,
    rpe,
    failed: draftSet.failed
  } satisfies WorkoutSet;
}

function sumSessionVolume(sets: WorkoutSet[]) {
  return sets.reduce((total, set) => total + set.weight * set.reps, 0);
}

function buildSetRewards(
  exercise: ExerciseDraft,
  draftSet: DraftSet,
  resolvedSet: WorkoutSet,
  benchmarkSets: WorkoutSet[]
): LoggerReward[] {
  if (benchmarkSets.length === 0) {
    return [];
  }

  const rewards: LoggerReward[] = [];
  const maxHistoricalWeight = Math.max(...benchmarkSets.map((set) => set.weight), 0);
  const maxHistoricalOneRm = Math.max(...benchmarkSets.map((set) => estimateOneRm(set)), 0);
  const maxSameWeightReps = Math.max(
    0,
    ...benchmarkSets
      .filter((set) => set.weight === resolvedSet.weight)
      .map((set) => set.reps)
  );

  if (resolvedSet.weight > maxHistoricalWeight) {
    rewards.push({
      id: `${exercise.id}:${draftSet.id}:max-weight:${resolvedSet.weight}`,
      exerciseId: exercise.id,
      setId: draftSet.id,
      category: "pr",
      level: "set",
      shortLabel: "Max Wt",
      detail: `${exercise.name}: ${resolvedSet.weight} kg is your new heaviest completed set.`
    });
  }

  if (resolvedSet.reps > maxSameWeightReps && maxSameWeightReps > 0) {
    rewards.push({
      id: `${exercise.id}:${draftSet.id}:rep-pr:${resolvedSet.weight}:${resolvedSet.reps}`,
      exerciseId: exercise.id,
      setId: draftSet.id,
      category: "pr",
      level: "set",
      shortLabel: "Rep PR",
      detail: `${exercise.name}: ${resolvedSet.weight} kg x ${resolvedSet.reps} beats your best rep count at this load.`
    });
  }

  const estimatedOneRm = estimateOneRm(resolvedSet);
  if (estimatedOneRm > maxHistoricalOneRm) {
    rewards.push({
      id: `${exercise.id}:${draftSet.id}:one-rm:${estimatedOneRm}`,
      exerciseId: exercise.id,
      setId: draftSet.id,
      category: "pr",
      level: "set",
      shortLabel: "1RM PR",
      detail: `${exercise.name}: estimated 1RM is now ${estimatedOneRm} kg.`
    });
  }

  return rewards;
}

function buildExerciseRewards(
  exercise: ExerciseDraft,
  completedSets: WorkoutSet[]
): LoggerReward[] {
  if (completedSets.length === 0) {
    return [];
  }

  const currentVolume = sumSessionVolume(completedSets);
  const maxHistoricalVolume = Math.max(
    ...exercise.history.map((session) => sumSessionVolume(session.sets)),
    0
  );

  if (currentVolume > maxHistoricalVolume) {
    return [
      {
        id: `${exercise.id}:best-volume:${currentVolume}`,
        exerciseId: exercise.id,
        setId: null,
        category: "volume",
        level: "exercise",
        shortLabel: "Best Vol",
        detail: `${exercise.name}: ${currentVolume.toFixed(0)} kg is your best logged volume for this exercise.`
      }
    ];
  }

  return [];
}

function recomputeLoggerRewards(
  exercises: ExerciseDraft[],
  carryForwardDefaults: boolean
): LoggerReward[] {
  const latestRewards = new Map<string, LoggerReward>();

  exercises.forEach((exercise) => {
    const lastSession = exercise.history[exercise.history.length - 1];
    const historicalSets = exercise.history.flatMap((session) => session.sets);
    const completedSetsInWorkout: WorkoutSet[] = [];

    exercise.draftSets.forEach((draftSet, index) => {
      if (!draftSet.done) {
        return;
      }

      const resolvedSet = resolveDraftSet(
        exercise.draftSets,
        index,
        lastSession,
        carryForwardDefaults,
        getExerciseMeasurementType(exercise)
      );

      if (!resolvedSet) {
        return;
      }

      const setRewards = buildSetRewards(
        exercise,
        draftSet,
        resolvedSet,
        [...historicalSets, ...completedSetsInWorkout]
      );

      setRewards.forEach((reward) => {
        latestRewards.set(
          `${exercise.id}:${reward.level}:${reward.shortLabel}`,
          reward
        );
      });

      completedSetsInWorkout.push(resolvedSet);
    });

    const isExerciseComplete =
      exercise.draftSets.length > 0 && exercise.draftSets.every((draftSet) => draftSet.done);

    if (!isExerciseComplete || completedSetsInWorkout.length === 0) {
      return;
    }

    buildExerciseRewards(exercise, completedSetsInWorkout).forEach((reward) => {
      latestRewards.set(`${exercise.id}:${reward.level}:${reward.shortLabel}`, reward);
    });
  });

  return Array.from(latestRewards.values());
}

function buildSparkline(values: number[], width = 260, height = 92) {
  if (values.length === 0) {
    return "";
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * (height - 16) - 8;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function buildMuscleSpread(exercises: ExerciseDraft[]) {
  const counts = new Map<string, number>();

  exercises.forEach((exercise) => {
    counts.set(exercise.primaryMuscle, (counts.get(exercise.primaryMuscle) ?? 0) + 2);
    exercise.secondaryMuscles.forEach((muscle) => {
      counts.set(muscle, (counts.get(muscle) ?? 0) + 1);
    });
  });

  return [...counts.entries()]
    .map(([muscle, score]) => ({ muscle, score }))
    .sort((left, right) => right.score - left.score || left.muscle.localeCompare(right.muscle));
}

function buildMuscleRegionScores(exercises: ExerciseDraft[]) {
  const scores = new Map<MuscleRegion, number>();

  const applyContribution = (muscleName: string, weight: number) => {
    const mapping = muscleContributionMap[muscleName];
    if (!mapping) {
      return;
    }

    Object.entries(mapping).forEach(([region, regionWeight]) => {
      if (!regionWeight) {
        return;
      }
      const key = region as MuscleRegion;
      scores.set(key, (scores.get(key) ?? 0) + regionWeight * weight);
    });
  };

  exercises.forEach((exercise) => {
    applyContribution(exercise.primaryMuscle, 3);
    exercise.secondaryMuscles.forEach((muscle) => applyContribution(muscle, 1.5));
  });

  return scores;
}

function getMuscleTone(score: number, maxScore: number) {
  if (score <= 0 || maxScore <= 0) {
    return "var(--surface-alt)";
  }

  const ratio = score / maxScore;
  if (ratio >= 0.72) {
    return muscleMapPalette[2];
  }
  if (ratio >= 0.38) {
    return muscleMapPalette[1];
  }
  return muscleMapPalette[0];
}

type ExerciseInsight = {
  headline: string;
  detail: string;
  tone: "positive" | "neutral" | "warning";
};

function buildExerciseInsight(
  weightTrend: number[],
  volumeTrend: number[],
  oneRmTrend: number[]
): ExerciseInsight | null {
  const n = weightTrend.length;
  if (n < 2) return null;

  const lastWeight = weightTrend[n - 1];
  const maxWeight = Math.max(...weightTrend);
  const previousMaxWeight = Math.max(...weightTrend.slice(0, -1));
  const lastVolume = volumeTrend[n - 1];
  const avgVolume = volumeTrend.reduce((a, b) => a + b, 0) / n;
  const lastOneRm = oneRmTrend[n - 1];
  const previousMaxOneRm = Math.max(...oneRmTrend.slice(0, -1));

  // 1RM hit all-time best last session
  if (lastOneRm > 0 && lastOneRm > previousMaxOneRm && n >= 3) {
    return {
      headline: "Estimated 1RM at all-time best",
      detail: `Your best working set puts your 1RM at ${lastOneRm.toFixed(0)} kg — the highest recorded here.`,
      tone: "positive"
    };
  }

  // Weight hit new high last session
  if (lastWeight > 0 && lastWeight > previousMaxWeight && n >= 2) {
    return {
      headline: "New weight high last session",
      detail: `You moved ${lastWeight} kg — the heaviest logged for this exercise.`,
      tone: "positive"
    };
  }

  if (n >= 3) {
    const recent = weightTrend.slice(-3);
    const nonZero = recent.filter((w) => w > 0);

    // Weight climbing 3 sessions in a row
    if (nonZero.length === 3 && recent[2] > recent[1] && recent[1] >= recent[0]) {
      const gain = recent[2] - recent[0];
      return {
        headline: "Weight climbing consistently",
        detail: `Up ${gain.toFixed(1)} kg across your last 3 sessions — keep the overload going.`,
        tone: "positive"
      };
    }

    // Weight falling 3 sessions in a row
    if (nonZero.length === 3 && recent[2] < recent[1] && recent[1] <= recent[0]) {
      const drop = recent[0] - recent[2];
      return {
        headline: "Weight has been dropping",
        detail: `Down ${drop.toFixed(1)} kg over your last 3 sessions — a recovery week or form check may help.`,
        tone: "warning"
      };
    }

    // Weight flat (within 2.5 kg) for 3 sessions
    if (nonZero.length === 3 && Math.max(...nonZero) - Math.min(...nonZero) <= 2.5 && lastWeight > 0) {
      return {
        headline: "Weight has been steady",
        detail: `Holding around ${lastWeight} kg for 3 sessions — try adding a rep or a small load increase.`,
        tone: "neutral"
      };
    }
  }

  // Last session volume notably below average
  if (n >= 3 && lastVolume > 0 && avgVolume > 0 && lastVolume < avgVolume * 0.78) {
    return {
      headline: "Volume was lower last session",
      detail: `Last session: ${lastVolume.toFixed(0)} kg total — below your usual average of ${avgVolume.toFixed(0)} kg.`,
      tone: "warning"
    };
  }

  // Default: where they stand
  if (lastWeight > 0) {
    return {
      headline: "Keep building",
      detail: `Your heaviest logged is ${maxWeight} kg. Log consistently to unlock trend insights.`,
      tone: "neutral"
    };
  }

  return null;
}

function buildMuscleEngagementCopy(exercise: ExerciseDraft) {
  const secondary = exercise.secondaryMuscles.join(", ");

  return [
    `${exercise.name} mainly loads your ${exercise.primaryMuscle.toLowerCase()} while your ${secondary.toLowerCase()} support the movement and help you stay in a strong position.`,
    `The main training effect should come from feeling the ${exercise.primaryMuscle.toLowerCase()} do most of the work instead of letting stronger compensations take over.`,
    `If the setup and path are right, the ${exercise.primaryMuscle.toLowerCase()} should stay under tension while the secondary muscles assist with stability, control, and finish.`
  ];
}

function BodyMapPair({
  title,
  subtitle,
  scores
}: {
  title: string;
  subtitle: string;
  scores: Map<MuscleRegion, number>;
}) {
  const maxScore = Math.max(...scores.values(), 0);

  return (
    <article className="body-map-panel">
      <div className="body-map-copy">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <div className="body-map-figures">
        <svg viewBox="0 0 120 220" className="body-map-svg" aria-label={`${title} front view`}>
          <circle cx="60" cy="18" r="12" fill="var(--surface)" stroke="var(--line)" />
          <rect x="46" y="32" width="28" height="28" rx="12" fill="var(--surface)" />
          <rect x="38" y="52" width="44" height="26" rx="12" fill={getMuscleTone(scores.get("chest") ?? 0, maxScore)} />
          <ellipse cx="36" cy="48" rx="10" ry="12" fill={getMuscleTone(scores.get("frontDelts") ?? 0, maxScore)} />
          <ellipse cx="84" cy="48" rx="10" ry="12" fill={getMuscleTone(scores.get("frontDelts") ?? 0, maxScore)} />
          <ellipse cx="32" cy="66" rx="8" ry="12" fill={getMuscleTone(scores.get("biceps") ?? 0, maxScore)} />
          <ellipse cx="88" cy="66" rx="8" ry="12" fill={getMuscleTone(scores.get("biceps") ?? 0, maxScore)} />
          <rect x="46" y="78" width="28" height="32" rx="12" fill="var(--surface)" />
          <rect x="44" y="110" width="12" height="52" rx="10" fill={getMuscleTone(scores.get("quads") ?? 0, maxScore)} />
          <rect x="64" y="110" width="12" height="52" rx="10" fill={getMuscleTone(scores.get("quads") ?? 0, maxScore)} />
          <path d="M60 108 L68 146 L60 166 L52 146 Z" fill={getMuscleTone(scores.get("adductors") ?? 0, maxScore)} />
          <rect x="44" y="164" width="10" height="34" rx="8" fill={getMuscleTone(scores.get("calves") ?? 0, maxScore)} />
          <rect x="66" y="164" width="10" height="34" rx="8" fill={getMuscleTone(scores.get("calves") ?? 0, maxScore)} />
        </svg>

        <svg viewBox="0 0 120 220" className="body-map-svg" aria-label={`${title} back view`}>
          <circle cx="60" cy="18" r="12" fill="var(--surface)" stroke="var(--line)" />
          <rect x="46" y="32" width="28" height="28" rx="12" fill="var(--surface)" />
          <ellipse cx="36" cy="48" rx="10" ry="12" fill={getMuscleTone(scores.get("rearDelts") ?? 0, maxScore)} />
          <ellipse cx="84" cy="48" rx="10" ry="12" fill={getMuscleTone(scores.get("rearDelts") ?? 0, maxScore)} />
          <ellipse cx="30" cy="66" rx="8" ry="12" fill={getMuscleTone(scores.get("triceps") ?? 0, maxScore)} />
          <ellipse cx="90" cy="66" rx="8" ry="12" fill={getMuscleTone(scores.get("triceps") ?? 0, maxScore)} />
          <rect x="42" y="52" width="36" height="26" rx="12" fill={getMuscleTone(scores.get("upperBack") ?? 0, maxScore)} />
          <path d="M42 70 C34 80 34 100 44 110 L52 110 L52 74 Z" fill={getMuscleTone(scores.get("lats") ?? 0, maxScore)} />
          <path d="M78 70 C86 80 86 100 76 110 L68 110 L68 74 Z" fill={getMuscleTone(scores.get("lats") ?? 0, maxScore)} />
          <rect x="48" y="82" width="24" height="22" rx="10" fill={getMuscleTone(scores.get("lowerBack") ?? 0, maxScore)} />
          <ellipse cx="52" cy="118" rx="10" ry="12" fill={getMuscleTone(scores.get("glutes") ?? 0, maxScore)} />
          <ellipse cx="68" cy="118" rx="10" ry="12" fill={getMuscleTone(scores.get("glutes") ?? 0, maxScore)} />
          <rect x="44" y="128" width="12" height="42" rx="10" fill={getMuscleTone(scores.get("hamstrings") ?? 0, maxScore)} />
          <rect x="64" y="128" width="12" height="42" rx="10" fill={getMuscleTone(scores.get("hamstrings") ?? 0, maxScore)} />
          <rect x="44" y="172" width="10" height="30" rx="8" fill={getMuscleTone(scores.get("calves") ?? 0, maxScore)} />
          <rect x="66" y="172" width="10" height="30" rx="8" fill={getMuscleTone(scores.get("calves") ?? 0, maxScore)} />
        </svg>
      </div>
    </article>
  );
}

// ── Active workout tray ───────────────────────────────────────────────────────

function ActiveWorkoutTray({
  sessionName,
  duration,
  onResume,
  onDiscardRequest
}: {
  sessionName: string;
  duration: string;
  onResume: () => void;
  onDiscardRequest: () => void;
}) {
  return (
    <div className="active-tray">
      <div className="active-tray-bar">
        <div className="active-tray-info">
          <span className="active-tray-dot" aria-hidden="true" />
          <div className="active-tray-text">
            <span className="active-tray-name">{sessionName}</span>
            <span className="active-tray-timer">{duration}</span>
          </div>
        </div>
        <div className="active-tray-actions">
          <button
            className="active-tray-ghost-btn"
            type="button"
            aria-label="Discard workout"
            onClick={onDiscardRequest}
          >
            Discard
          </button>
          <button
            className="active-tray-resume-btn"
            type="button"
            aria-label="Resume workout"
            onClick={onResume}
          >
            Resume
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Planner ───────────────────────────────────────────────────────────────────

const PLAN_TAG_OPTIONS = ["Push", "Pull", "Legs", "Upper", "Lower", "Full Body", "Home", "Machines"];
function planMusclePreview(plan: WorkoutPlan, library: ExerciseDraft[]): string {
  const muscles = new Set<string>();
  for (const pe of plan.exercises.slice(0, 5)) {
    const ex = library.find((e) => e.id === pe.exerciseId);
    if (ex) muscles.add(ex.primaryMuscle);
  }
  return [...muscles].slice(0, 3).join(" · ");
}

function getExistingUserTags(plans: WorkoutPlan[]): string[] {
  // Most recently updated plans first, latest-added tags first within each plan
  const sorted = [...plans].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const plan of sorted) {
    for (const tag of [...(plan.userTags ?? [])].reverse()) {
      if (tag && !seen.has(tag)) { seen.add(tag); result.push(tag); }
    }
  }
  return result;
}

function buildBlankWorkoutPlan(): WorkoutPlan {
  const now = new Date().toISOString();
  return {
    id: `plan-${Date.now()}`,
    name: "",
    tag: "",
    userTags: [],
    note: "",
    exercises: [],
    createdAt: now,
    updatedAt: now
  };
}

function normalizePlanForComparison(plan: WorkoutPlan) {
  return {
    name: plan.name.trim(),
    tag: plan.tag?.trim() ?? "",
    userTags: [...(plan.userTags ?? [])].sort(),
    note: plan.note?.trim() ?? "",
    exercises: plan.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      setCount: exercise.setCount,
      restTimer: exercise.restTimer,
      note: exercise.note?.trim() ?? ""
    }))
  };
}

function PlanCard({
  plan,
  isTemplate,
  library,
  draggable,
  position,
  onOpen,
  onEdit,
  onDuplicate,
  onShare,
  onEditTags,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop
}: {
  plan: WorkoutPlan;
  isTemplate: boolean;
  library: ExerciseDraft[];
  draggable?: boolean;
  position?: number;
  onOpen?: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onShare?: () => void;
  onEditTags?: () => void;
  onDelete?: () => void;
  onDragStart?: () => void;
  onDragOver?: (event: React.DragEvent<HTMLElement>) => void;
  onDrop?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);
  const musclePreview = planMusclePreview(plan, library);
  const tags = [...(plan.userTags ?? [])].reverse(); // latest first
  const statsRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(tags.length);
  const tagKey = tags.join("\0");

  useLayoutEffect(() => {
    const el = statsRef.current;
    if (!el || tags.length === 0) { setVisibleCount(0); return; }

    const GAP = 6;
    const MORE_PILL_W = 58; // approximate "+N more" width incl. gap
    const availWidth = el.offsetWidth;

    const tagEls = Array.from(el.querySelectorAll<HTMLElement>("[data-tag]"));
    let used = 0, count = 0;
    for (let i = 0; i < tagEls.length; i++) {
      const w = tagEls[i].offsetWidth + (i > 0 ? GAP : 0);
      const willHaveMore = i < tagEls.length - 1;
      if (used + w + (willHaveMore ? MORE_PILL_W : 0) <= availWidth) {
        used += w;
        count++;
      } else break;
    }
    setVisibleCount(count);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagKey]);

  const hiddenCount = tags.length - visibleCount;

  return (
    <article
      className={`plan-card plan-card--tappable${draggable ? " is-draggable" : ""}`}
      draggable={draggable}
      onClick={onOpen}
      onDragStart={draggable ? onDragStart : undefined}
      onDragOver={draggable ? onDragOver : undefined}
      onDrop={draggable ? onDrop : undefined}
    >
      <div className="plan-card-top">
        <div className="plan-card-meta">
          <h3 className="plan-card-name">{plan.name}</h3>
          {plan.note && <p className="plan-card-note">{plan.note}</p>}
        </div>
        {!isTemplate && (
          <div className="plan-card-actions" ref={menuRef} onClick={(e) => e.stopPropagation()}>
            <button
              className="plan-card-menu-btn"
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Plan options"
            >
              ⋮
            </button>
            {menuOpen && (
              <div className="plan-card-menu" onClick={() => setMenuOpen(false)}>
                <button type="button" onClick={onShare}>Share</button>
                <button type="button" onClick={onEdit}>Edit</button>
                <button type="button" onClick={onEditTags}>Edit Tags</button>
                <button type="button" onClick={onDuplicate}>Duplicate</button>
                {onDelete && (
                  <button type="button" className="is-danger" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}>Delete</button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {tags.length > 0 && (
        <div className="plan-card-stats" ref={statsRef}>
          {tags.map((t, i) => (
            <span
              key={t}
              data-tag
              className="plan-tag-inline"
              style={i >= visibleCount ? { display: "none" } : undefined}
            >
              {t}
            </span>
          ))}
          {hiddenCount > 0 && (
            <span className="plan-tags-more">+{hiddenCount} more</span>
          )}
        </div>
      )}
      <p className="plan-card-excount">
        {plan.exercises.length} {plan.exercises.length === 1 ? "exercise" : "exercises"}
      </p>
      {musclePreview && <p className="plan-card-muscles-line">{musclePreview}</p>}
      {position !== undefined && (
        <span className="plan-card-position" aria-hidden="true">{position}</span>
      )}
    </article>
  );
}

function buildPlanContext(plan: RepIQPlan, profile: UserPsychProfile | null): string {
  const days = plan.daysPerWeek;
  const split = plan.splitType;
  const goal = plan.goal;
  const why = profile?.motivationalWhy ?? null;
  const exp = plan.experienceLevel;

  // Sentence 1 — opening hook tied to why the user is here
  const whySentence: Record<string, string> = {
    inconsistent:      `You told us consistency has been your challenge — so this plan is designed to be simple enough to show up for, ${days} times a week.`,
    plateau:           `You said you've hit a plateau and need structure — this plan gives you that, with ${days} sessions a week and progressive overload built in week over week.`,
    look_feel_stronger:`You're here to look and feel stronger — so we structured ${days} sessions a week with the volume and intensity that drives visible, lasting change.`,
    fresh_start:       `You're starting fresh — this plan gives you a clean, repeatable structure: ${days} focused sessions a week, nothing more than you need.`,
    feel_good:         `You want to feel good and stay consistent — this plan keeps it sustainable: ${days} sessions a week, leaving room to recover and come back strong.`,
  };
  const opening = why && whySentence[why]
    ? whySentence[why]
    : `${days} sessions a week, each designed to move you toward ${
        goal === "build_muscle" ? "building muscle" :
        goal === "get_stronger" ? "getting stronger" :
        goal === "improve_fitness" ? "better overall fitness" :
        goal === "athletic_performance" ? "athletic performance" :
        "your goals"
      }.`;

  // Sentence 2 — why this split for this person
  const splitSentence: Record<string, string> = {
    full_body:   `Every session hits all major muscle groups — so even if you miss a day, nothing gets left behind.`,
    upper_lower: `Upper and lower body alternate each session, so each muscle group gets trained twice a week with proper recovery in between.`,
    ppl:         `Push, Pull, and Legs each get their own day — enough dedicated volume per muscle group to drive real progression.`,
    body_part:   `Each session focuses on one muscle group, maximising the stimulus and giving it a full week to recover before you hit it again.`,
  };
  const splitLine = splitSentence[split] ?? "";

  // Sentence 3 — experience-honest note, no labels
  const expSentence =
    (exp === "never" || exp === "beginner")
      ? `The rep ranges and set counts are calibrated for where you are right now — enough to drive adaptation without burning you out early.`
      : exp === "intermediate"
      ? `Sets, reps, and rest are tuned for your training age — enough stimulus to keep driving progress without unnecessary junk volume.`
      : `Volume and intensity are set for a trained athlete — structured to challenge you and keep the adaptation signal strong.`;

  return [opening, splitLine, expSentence].filter(Boolean).join(" ");
}

function PlannerHomePage({
  plans,
  library,
  existingTags,
  activeView,
  onViewChange,
  hasActiveWorkout,
  onBack,
  onStartEmpty,
  onCreateNew,
  onGeneratePlan,
  onStartPlan,
  onEditPlan,
  onDuplicatePlan,
  onSharePlan,
  onEditTags,
  onReorderPlans,
  onDeletePlan,
  onUseTemplate,
  onResumeWorkout,
  resolvedTheme,
  onToggleTheme,
  defaultGoal,
  defaultLevel,
  defaultEquipment,
  repiqPlan,
  initialPlannerMode,
  onStartRepIQSession,
  onRegeneratePlan,
  onRegenerateRemaining,
  onSaveSessionToLibrary,
  psychProfile,
  onToggleRepIQStatus,
  onDismissReview,
  savedWorkouts,
  onOpenHistoryWorkout,
  onSaveHistoryWorkout,
}: {
  plans: WorkoutPlan[];
  library: ExerciseDraft[];
  existingTags: string[];
  activeView: "mine" | "library" | "generate";
  onViewChange: (view: "mine" | "library" | "generate") => void;
  hasActiveWorkout: boolean;
  onBack: () => void;
  onStartEmpty: () => void;
  onCreateNew: () => void;
  onGeneratePlan: (plan: WorkoutPlan) => void;
  onStartPlan: (plan: WorkoutPlan) => void;
  onEditPlan: (plan: WorkoutPlan) => void;
  onDuplicatePlan: (plan: WorkoutPlan) => void;
  onSharePlan: (plan: WorkoutPlan) => void;
  onEditTags: (plan: WorkoutPlan) => void;
  resolvedTheme: string;
  onToggleTheme: () => void;
  defaultGoal: string | null;
  defaultLevel: string | null;
  defaultEquipment: string | null;
  onReorderPlans: (sourceId: string, targetId: string) => void;
  onDeletePlan: (planId: string) => void;
  onUseTemplate: (template: WorkoutPlan) => void;
  onResumeWorkout: () => void;
  repiqPlan?: RepIQPlan | null;
  initialPlannerMode?: "repiq" | "custom";
  onStartRepIQSession?: (weekIdx: number, dayIdx: number) => void;
  onRegeneratePlan?: (prefs: { goal: string; experience: string; daysPerWeek: number; sessionLength: number; planLengthWeeks: number; splitPref: string | null }) => void;
  onRegenerateRemaining?: () => void;
  onSaveSessionToLibrary?: (day: RepIQPlanDay, sessionLabel: string) => void;
  psychProfile?: UserPsychProfile | null;
  onToggleRepIQStatus?: () => void;
  onDismissReview?: () => void;
  savedWorkouts?: SavedWorkoutData[];
  onOpenHistoryWorkout?: (workout: SavedWorkoutData | null, weekIdx: number, dayIdx: number, label: string, sessionNum: number) => void;
  onSaveHistoryWorkout?: (workout: SavedWorkoutData) => void;
}) {
  // Generate state
  const [genGoal, setGenGoal] = useState("Hypertrophy");
  const [genMuscles, setGenMuscles] = useState<string[]>([]);
  const [genDuration, setGenDuration] = useState("45 min");
  const [genError, setGenError] = useState<string | null>(null);
  const [dragPlanId, setDragPlanId] = useState<string | null>(null);
  const [activeTagFilter, setActiveTagFilter] = useState<string[]>([]);
  const [tagFilterSearch, setTagFilterSearch] = useState("");
  const lastBrowseViewRef = useRef<"mine" | "library">("mine");
  const [detailPlan, setDetailPlan] = useState<WorkoutPlan | null>(null);
  const [detailIsTemplate, setDetailIsTemplate] = useState(false);
  const [libCategory, setLibCategory] = useState<string | null>(null);
  const [libLevel, setLibLevel] = useState<string | null>(defaultLevel);
  const [libGoal, setLibGoal] = useState<string | null>(defaultGoal);
  const [libEquipment, setLibEquipment] = useState<string | null>(defaultEquipment);
  const [plannerMode, setPlannerMode] = useState<"repiq" | "custom">(initialPlannerMode ?? "repiq");
  const [plannerModeOpen, setPlannerModeOpen] = useState(false);
  const plannerModeDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!plannerModeOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (plannerModeDropdownRef.current && !plannerModeDropdownRef.current.contains(e.target as Node)) {
        setPlannerModeOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [plannerModeOpen]);
  const [showPrefsOverlay, setShowPrefsOverlay] = useState(false);
  const [prefGoal, setPrefGoal] = useState<string>(repiqPlan?.goal ?? "build_muscle");
  const [prefExp, setPrefExp] = useState<string>(repiqPlan?.experienceLevel ?? "beginner");
  const [prefDays, setPrefDays] = useState<number>(repiqPlan?.daysPerWeek ?? 3);
  const [prefLength, setPrefLength] = useState<number>(repiqPlan?.sessionLengthMin ?? 45);
  const [prefWeeks, setPrefWeeks] = useState<number>(repiqPlan?.mesocycleLengthWeeks ?? 12);
  const [prefSplit, setPrefSplit] = useState<string | null>(null);
  const [sessionMenuIdx, setSessionMenuIdx] = useState<string | null>(null);
  const [editingSessionKey, setEditingSessionKey] = useState<string | null>(null);
  const [editingSessionName, setEditingSessionName] = useState("");
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [toggledSessionKeys, setToggledSessionKeys] = useState<Set<string>>(new Set());
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState(false);
  const [libFilterOpen, setLibFilterOpen] = useState(false);
  const [libFilterFocus, setLibFilterFocus] = useState<string | null>(null);
  const [libDraftCategory, setLibDraftCategory] = useState<string | null>(null);
  const [libDraftLevel, setLibDraftLevel] = useState<string | null>(null);
  const [libDraftGoal, setLibDraftGoal] = useState<string | null>(null);
  const [libDraftEquipment, setLibDraftEquipment] = useState<string | null>(null);
  const draftVisibleCount = useMemo(() => WORKOUT_PLAN_TEMPLATES.filter((t) => {
    if (libDraftCategory !== null && t.category !== libDraftCategory) return false;
    if (libDraftLevel !== null && t.level !== libDraftLevel) return false;
    if (libDraftGoal !== null && t.goal !== libDraftGoal) return false;
    if (libDraftEquipment !== null && t.equipment !== libDraftEquipment) return false;
    return true;
  }).length, [libDraftCategory, libDraftLevel, libDraftGoal, libDraftEquipment]);
  const visibleTemplates = useMemo(() => {
    return WORKOUT_PLAN_TEMPLATES.filter((t) => {
      if (libCategory !== null && t.category !== libCategory) return false;
      if (libLevel !== null && t.level !== libLevel) return false;
      if (libGoal !== null && t.goal !== libGoal) return false;
      if (libEquipment !== null && t.equipment !== libEquipment) return false;
      return true;
    });
  }, [libCategory, libLevel, libGoal, libEquipment]);

  useEffect(() => {
    if (activeView !== "generate") {
      lastBrowseViewRef.current = activeView;
    }
  }, [activeView]);

  function toggleMuscle(m: string) {
    setGenMuscles((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  }

  function handleGenerate() {
    const muscleKeywords: Record<string, string[]> = {
      Chest: ["chest", "pec"],
      Back: ["back", "lat", "row", "rhomboid", "trap"],
      Shoulders: ["shoulder", "delt"],
      Arms: ["bicep", "tricep", "arm", "forearm"],
      Legs: ["quad", "hamstring", "glute", "calf", "leg", "hip"],
      Core: ["core", "ab", "oblique"],
    };
    const goalConfig: Record<string, { setCount: number; restTimer: string }> = {
      Strength: { setCount: 5, restTimer: "180" },
      Hypertrophy: { setCount: 3, restTimer: "90" },
      Endurance: { setCount: 3, restTimer: "45" },
      "Fat loss": { setCount: 4, restTimer: "60" },
    };
    const durationCount: Record<string, number> = {
      "30 min": 4, "45 min": 5, "60 min": 6, "75+ min": 8,
    };
    const config = goalConfig[genGoal] ?? { setCount: 3, restTimer: "90" };
    const count = durationCount[genDuration] ?? 5;
    const keywords = genMuscles.flatMap((m) => muscleKeywords[m] ?? [m.toLowerCase()]);

    let candidates = [...library];
    if (keywords.length > 0) {
      candidates = candidates.filter((ex) =>
        keywords.some(
          (kw) =>
            ex.primaryMuscle.toLowerCase().includes(kw) ||
            ex.primaryMuscles?.some((pm) => pm.toLowerCase().includes(kw)) ||
            ex.secondaryMuscles.some((sm) => sm.toLowerCase().includes(kw))
        )
      );
      candidates.sort((a, b) => {
        const score = (ex: ExerciseDraft) =>
          keywords.filter(
            (kw) =>
              ex.primaryMuscle.toLowerCase().includes(kw) ||
              ex.primaryMuscles?.some((pm) => pm.toLowerCase().includes(kw))
          ).length;
        return score(b) - score(a);
      });
    }

    const selected = candidates.slice(0, count);
    if (selected.length === 0) {
      setGenError("No exercises found for your selections. Try removing some filters.");
      return;
    }
    setGenError(null);
    const plan: WorkoutPlan = {
      id: `gen-${Date.now()}`,
      name: genMuscles.length > 0
        ? `${genGoal} · ${genMuscles.slice(0, 2).join(" & ")}`
        : `${genGoal} Workout`,
      tag: genGoal,
      note: genMuscles.length > 0 ? `${genMuscles.join(", ")} · ${genDuration}` : genDuration,
      exercises: selected.map((ex) => ({
        exerciseId: ex.id,
        setCount: config.setCount,
        restTimer: config.restTimer,
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onGeneratePlan(plan);
  }

  const trayClass = hasActiveWorkout ? " has-tray" : "";

  if (activeView === "generate") {
    return (
      <main className={`planner-page${trayClass}`}>
        <header className="planner-topbar">
          <button
            className="back-nav-button"
            type="button"
            onClick={() => onViewChange(lastBrowseViewRef.current)}
            aria-label="Back"
          >
            ←
          </button>
          <div className="planner-topbar-copy">
            <h1>Generate Session</h1>
            <p className="planner-topbar-sub">Drafts a single workout from your goals</p>
          </div>
          <button type="button" className="theme-toggle-btn" onClick={onToggleTheme} aria-label="Toggle theme">
            {resolvedTheme === "dark" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
          </button>
        </header>
        <section className="planner-section planner-generate-section">
          <div className="generate-fields">
            <div className="generate-field">
              <label className="generate-field-label">Goal</label>
              <div className="generate-field-chips">
                {["Strength", "Hypertrophy", "Endurance", "Fat loss"].map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`generate-chip${genGoal === g ? " is-selected" : ""}`}
                    onClick={() => setGenGoal(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div className="generate-field">
              <label className="generate-field-label">Target muscles <span className="generate-field-hint">(optional)</span></label>
              <div className="generate-field-chips">
                {["Chest", "Back", "Shoulders", "Arms", "Legs", "Core"].map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`generate-chip${genMuscles.includes(m) ? " is-selected" : ""}`}
                    onClick={() => toggleMuscle(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="generate-field">
              <label className="generate-field-label">Duration</label>
              <div className="generate-field-chips">
                {["30 min", "45 min", "60 min", "75+ min"].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`generate-chip${genDuration === d ? " is-selected" : ""}`}
                    onClick={() => setGenDuration(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {genError && <p className="generate-error">{genError}</p>}
          <p className="planner-generate-note">
            Current generator uses goal, target muscles, and session constraints. Profile-based optimization comes next.
          </p>
        </section>
        <div className={`planner-bottom-actions${hasActiveWorkout ? " has-tray" : ""}`}>
          {hasActiveWorkout ? (
            <button className="primary-button generate-cta-btn" type="button" disabled>
              Generate Session
            </button>
          ) : (
            <button className="primary-button generate-cta-btn" type="button" onClick={handleGenerate}>
              Generate Session
            </button>
          )}
        </div>
      </main>
    );
  }

  if (detailPlan) {
    const detailMusclePreview = planMusclePreview(detailPlan, library);
    return (
      <main className={`planner-page${trayClass}`}>
        <header className="planner-topbar">
          <button className="back-nav-button" type="button" onClick={() => setDetailPlan(null)} aria-label="Back">
            ←
          </button>
          <div className="planner-topbar-copy">
            <h1>{detailPlan.name}</h1>
          </div>
          <button type="button" className="theme-toggle-btn" onClick={onToggleTheme} aria-label="Toggle theme">
            {resolvedTheme === "dark" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
          </button>
        </header>

        <div className="plan-detail-actions-top">
          {hasActiveWorkout ? (
            <>
              <p className="plan-detail-active-notice">A workout is already in progress. Finish or discard it to start this one.</p>
              {detailIsTemplate && (
                <button
                  className="primary-button plan-detail-action-btn"
                  type="button"
                  onClick={() => { onUseTemplate(detailPlan); setDetailPlan(null); }}
                >
                  Save to My Workouts
                </button>
              )}
            </>
          ) : (
            <>
              {detailIsTemplate && (
                <button
                  className="secondary-button plan-detail-action-btn"
                  type="button"
                  onClick={() => { onUseTemplate(detailPlan); setDetailPlan(null); }}
                >
                  Save to My Workouts
                </button>
              )}
              <button
                className="primary-button plan-detail-action-btn"
                type="button"
                onClick={() => { onStartPlan(detailPlan); setDetailPlan(null); }}
              >
                Start Workout
              </button>
              {!detailIsTemplate && (
                <>
                  <button
                    type="button"
                    className="plan-detail-icon-btn"
                    title="Edit workout"
                    onClick={() => { setDetailPlan(null); onEditPlan(detailPlan); }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  {!SAMPLE_PLAN_IDS.has(detailPlan.id) && (
                    <button
                      type="button"
                      className="plan-detail-icon-btn plan-detail-icon-btn--danger"
                      title="Delete workout"
                      onClick={() => { setDetailPlan(null); setDeletingPlanId(detailPlan.id); }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <section className="plan-detail-section">
          {detailPlan.note && <p className="plan-detail-note">{detailPlan.note}</p>}
          {((detailPlan.userTags?.length ?? 0) > 0 || detailPlan.tag) && (
            <div className="plan-detail-tags">
              {detailPlan.tag && <span className="plan-tag-inline">{detailPlan.tag}</span>}
              {detailPlan.userTags?.map((t) => <span key={t} className="plan-tag-inline">{t}</span>)}
            </div>
          )}
          {detailMusclePreview && (
            <p className="plan-detail-muscles">{detailMusclePreview}</p>
          )}
          <div className="plan-detail-exercises">
            {detailPlan.exercises.map((pe, i) => {
              const ex = library.find((e) => e.id === pe.exerciseId);
              const setLabel = pe.setTypes
                ? pe.setTypes.map((t) => ({ warmup: "W", normal: "●", drop: "D", restpause: "RP", failure: "F" }[t] ?? "●")).join(" ")
                : `${pe.setCount} sets`;
              return (
                <div key={pe.exerciseId + i} className="plan-detail-exercise-row">
                  <span className="plan-detail-ex-num">{i + 1}</span>
                  <div className="plan-detail-ex-info">
                    <p className="plan-detail-ex-name">{ex?.name ?? "Unknown exercise"}</p>
                    <span className="plan-detail-ex-meta">{setLabel} · {pe.restTimer.includes(":") ? pe.restTimer : `${pe.restTimer}s`} rest</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    );
  }

  // Filter overlay helpers — defined outside JSX to avoid IIFE parse issues
  type FilterDef = { label: string; options: string[]; draftValue: string | null; realSet: (v: string | null) => void; draftSet: (v: string | null) => void };
  const filterAllDefs: FilterDef[] = [
    { label: "Type",      options: ["PPL", "Upper/Lower", "Full Body", "Specialisation", "Powerlifting", "Minimal", "Beginner"], draftValue: libDraftCategory, realSet: setLibCategory,    draftSet: setLibDraftCategory },
    { label: "Level",     options: ["Beginner", "Intermediate", "Advanced"],                                                     draftValue: libDraftLevel,    realSet: setLibLevel,       draftSet: setLibDraftLevel },
    { label: "Goal",      options: ["Hypertrophy", "Strength", "Endurance"],                                                     draftValue: libDraftGoal,     realSet: setLibGoal,        draftSet: setLibDraftGoal },
    { label: "Equipment", options: ["Full Gym", "Dumbbells", "Bodyweight"],                                                      draftValue: libDraftEquipment,realSet: setLibEquipment,   draftSet: setLibDraftEquipment },
  ];
  const filterVisibleDefs = libFilterFocus ? filterAllDefs.filter((f) => f.label === libFilterFocus) : filterAllDefs;
  const applyFiltersAndClose = () => {
    setLibCategory(libDraftCategory);
    setLibLevel(libDraftLevel);
    setLibGoal(libDraftGoal);
    setLibEquipment(libDraftEquipment);
    setLibFilterOpen(false);
  };

  return (
    <main className={`planner-page${trayClass}`}>
      <header className="planner-topbar">
        <button className="back-nav-button" type="button" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div className="planner-topbar-copy">
          {repiqPlan ? (
            <div className="planner-mode-dropdown-wrap" ref={plannerModeDropdownRef}>
              <button
                className="planner-mode-dropdown-btn"
                type="button"
                onClick={() => setPlannerModeOpen((v) => !v)}
              >
                <span className="planner-mode-dropdown-label">
                  {plannerMode === "repiq" ? "✦ RepIQ Plan" : "Custom Workout Planner"}
                </span>
                <svg
                  className={`planner-mode-chevron${plannerModeOpen ? " is-open" : ""}`}
                  width="12" height="12" viewBox="0 0 12 12"
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                >
                  <polyline points="2,4 6,8 10,4"/>
                </svg>
              </button>
              {plannerModeOpen && (
                <div className="planner-mode-dropdown-menu">
                  {(["repiq", "custom"] as const).map((m) => (
                    <button
                      key={m}
                      className={`planner-mode-option${plannerMode === m ? " is-active" : ""}`}
                      type="button"
                      onClick={() => { setPlannerMode(m); setPlannerModeOpen(false); }}
                    >
                      {m === "repiq" ? "✦ RepIQ Plan" : "Custom Workout Planner"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <h1>Workout Planner</h1>
          )}
        </div>
        <button type="button" className="theme-toggle-btn" onClick={onToggleTheme} aria-label="Toggle theme">
          {resolvedTheme === "dark" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
        </button>
      </header>

      {repiqPlan && plannerMode === "repiq" && (() => {
        // Minimum 1 full week unlocked; each completed session unlocks 1 more beyond that
        const totalCompleted = repiqPlan.weeks.reduce(
          (acc, week) => acc + week.days.filter((d) => d.completedAt).length, 0
        );
        const sessionsPerWeek = repiqPlan.weeks[0]?.days.length ?? repiqPlan.daysPerWeek;
        const totalUnlocked = sessionsPerWeek + totalCompleted;
        // Build flat sessions list
        let sessionNum = 0;
        const allSessions = repiqPlan.weeks.flatMap((week, wi) =>
          week.days.map((day, di) => {
            sessionNum++;
            const globalIdx = sessionNum - 1; // 0-indexed
            return {
              key: `${wi}-${di}`,
              weekIdx: wi,
              dayIdx: di,
              sessionNum,
              label: day.sessionLabel,
              focus: day.focus,
              exercises: day.exercises,
              isCompleted: !!day.completedAt,
              isCurrent: wi === repiqPlan.currentWeekIndex && !week.isCompleted,
              isLocked: globalIdx >= totalUnlocked,
            };
          })
        );

        const completedSessions = allSessions.filter(s => s.isCompleted);
        const activeSessions = allSessions.filter(s => !s.isCompleted && !s.isLocked);
        const lockedSessions = allSessions.filter(s => s.isLocked);

        return (
          <div className="planner-repiq-section">
            {/* Header */}
            <div className="repiq-plan-header">
              <div>
                <h2 className="repiq-plan-title">{repiqPlan.planName}</h2>
                <div className="repiq-plan-meta-row">
                  <span>{SPLIT_LABEL[repiqPlan.splitType]}</span>
                  <span className="repiq-meta-dot">·</span>
                  <span>{repiqPlan.daysPerWeek} days/week</span>
                  <span className="repiq-meta-dot">·</span>
                  <span>{repiqPlan.mesocycleLengthWeeks} weeks</span>
                </div>
              </div>
              <div className="repiq-plan-header-btns">
                {onToggleRepIQStatus && (
                  <button
                    type="button"
                    className={`repiq-status-btn${repiqPlan.status === "paused" ? " is-paused" : ""}`}
                    onClick={onToggleRepIQStatus}
                  >
                    {repiqPlan.status === "paused" ? "▶ Resume" : "⏸ Pause"}
                  </button>
                )}
                {onRegeneratePlan && (
                  <button
                    type="button"
                    className="repiq-regenerate-btn"
                    onClick={() => {
                      setPrefGoal(repiqPlan.goal);
                      setPrefExp(repiqPlan.experienceLevel);
                      setPrefDays(repiqPlan.daysPerWeek);
                      setPrefLength(repiqPlan.sessionLengthMin);
                      setPrefSplit(null);
                      setShowPrefsOverlay(true);
                    }}
                  >
                    ✦ Adjust Preferences
                  </button>
                )}
              </div>
            </div>

            {/* Paused notice */}
            {repiqPlan.status === "paused" && (
              <div className="repiq-paused-banner">
                <span>⏸ Plan paused</span>
                <span className="repiq-paused-sub">Sessions won't count toward plan progress. Resume when you're ready.</span>
              </div>
            )}

            {/* Needs-review notice */}
            {repiqPlan.needsReview && (
              <div className="repiq-needs-review-banner">
                <div className="repiq-needs-review-body">
                  <p className="repiq-needs-review-title">Your remaining sessions may need a refresh</p>
                  <p className="repiq-needs-review-sub">
                    You logged {repiqPlan.extraVolumeCount ?? 1} session{(repiqPlan.extraVolumeCount ?? 1) !== 1 ? "s" : ""} outside this plan. RepIQ can regenerate your remaining sessions to account for the extra volume and avoid overlap.
                  </p>
                </div>
                <div className="repiq-needs-review-actions">
                  {onRegenerateRemaining && (
                    <button
                      type="button"
                      className="repiq-needs-review-regen-btn"
                      onClick={onRegenerateRemaining}
                    >
                      Regenerate remaining sessions
                    </button>
                  )}
                  {onDismissReview && (
                    <button
                      type="button"
                      className="repiq-needs-review-dismiss-btn"
                      onClick={onDismissReview}
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Plan context — why this plan was chosen */}
            <div className="repiq-plan-context">
              <p className="repiq-plan-context-text">{buildPlanContext(repiqPlan, psychProfile ?? null)}</p>
            </div>

            {/* Active / upcoming sessions */}
            <div className="repiq-sessions-list">
              {activeSessions.map((s, idx) => {
                const isNext = idx === 0;
                const isMenuOpen = sessionMenuIdx === s.key;
                const isEditing = editingSessionKey === s.key;
                // Next card: expanded by default; others: collapsed by default
                const isToggled = toggledSessionKeys.has(s.key);
                const isExpanded = isNext ? !isToggled : isToggled;
                const toggleExpand = () => setToggledSessionKeys(prev => {
                  const next = new Set(prev);
                  if (next.has(s.key)) next.delete(s.key); else next.add(s.key);
                  return next;
                });
                return (
                  <div key={s.key} className={`repiq-session-card${isNext ? " is-next" : ""}`}>
                    {/* Row 1: session number + badges + actions */}
                    <div className="repiq-session-header">
                      <div className="repiq-session-meta">
                        <span className="repiq-session-num">Session {s.sessionNum}</span>
                        {isNext && <span className="repiq-session-badge">Next</span>}
                      </div>
                      <div className="repiq-session-header-right">
                        {onStartRepIQSession && (
                          <button
                            type="button"
                            className={`repiq-session-start-pill${isNext ? " is-next" : ""}${repiqPlan.status === "paused" ? " is-paused-disabled" : ""}`}
                            onClick={(e) => { e.stopPropagation(); if (repiqPlan.status !== "paused") onStartRepIQSession(s.weekIdx, s.dayIdx); }}
                            disabled={repiqPlan.status === "paused"}
                            title={repiqPlan.status === "paused" ? "Resume plan to start sessions" : undefined}
                          >
                            Start
                          </button>
                        )}
                        <div className="repiq-session-menu-wrap">
                          <button
                            type="button"
                            className="repiq-session-menu-btn"
                            onClick={() => setSessionMenuIdx(isMenuOpen ? null : s.key)}
                            aria-label="Session options"
                          >⋯</button>
                          {isMenuOpen && (
                            <div className="repiq-session-menu">
                              <button type="button" onClick={() => {
                                setEditingSessionName(s.label);
                                setEditingSessionKey(s.key);
                                setSessionMenuIdx(null);
                              }}>Rename session</button>
                              {onSaveSessionToLibrary && (
                                <button type="button" onClick={() => {
                                  const week = repiqPlan.weeks[s.weekIdx];
                                  onSaveSessionToLibrary(week.days[s.dayIdx], s.label);
                                  setSessionMenuIdx(null);
                                  setSavedToast(true);
                                  setTimeout(() => setSavedToast(false), 2500);
                                }}>Save to My Workouts</button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Row 2: session name */}
                    {isEditing ? (
                      <div className="repiq-session-rename-row">
                        <input
                          className="repiq-session-rename-input"
                          value={editingSessionName}
                          onChange={e => setEditingSessionName(e.target.value)}
                          autoFocus
                        />
                        <button type="button" className="repiq-session-rename-save" onClick={() => setEditingSessionKey(null)}>Save</button>
                        <button type="button" className="repiq-session-rename-cancel" onClick={() => setEditingSessionKey(null)}>✕</button>
                      </div>
                    ) : (
                      <p className="repiq-session-name">{s.label}</p>
                    )}
                    {/* Row 3: muscles/focus */}
                    {s.focus && <p className="repiq-session-focus">{s.focus}</p>}
                    {/* Expandable exercise list */}
                    <button type="button" className="repiq-session-expand-toggle" onClick={toggleExpand}>
                      {isExpanded ? "Hide exercises ›" : `${s.exercises.length} exercises ›`}
                    </button>
                    {isExpanded && (
                      <ul className="repiq-ex-list">
                        {s.exercises.map((e) => {
                          const exName = library.find((ex) => ex.id === e.exerciseId)?.name ?? e.exerciseId;
                          return (
                            <li key={e.exerciseId} className="repiq-ex-item">
                              {exName} <span className="repiq-ex-sets">{e.sets}×{e.reps}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}

              {/* Locked upcoming sessions — 1 cycle preview, capped so total visible ≤ 8 */}
              {(() => {
                const lockedToShow = Math.min(sessionsPerWeek, Math.max(0, 8 - sessionsPerWeek));
                const hiddenCount = lockedSessions.length - lockedToShow;
                return (
                  <>
                    {lockedSessions.slice(0, lockedToShow).map((s) => (
                      <div key={s.key} className="repiq-session-card is-locked">
                        <div className="repiq-session-header">
                          <div className="repiq-session-meta">
                            <span className="repiq-session-num">Session {s.sessionNum}</span>
                          </div>
                          <span className="repiq-session-lock">🔒</span>
                        </div>
                        <p className="repiq-session-name">{s.label}</p>
                        {s.focus && <p className="repiq-session-focus">{s.focus}</p>}
                      </div>
                    ))}
                    {hiddenCount > 0 && (
                      <p className="repiq-more-locked">🔒 And {hiddenCount} more locked session{hiddenCount !== 1 ? "s" : ""} — unlock by completing each week</p>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Completed sessions — last 2 weeks shown inline */}
            {completedSessions.length > 0 && (() => {
              const twoWeeksCount = 2 * (repiqPlan.weeks[0]?.days.length ?? repiqPlan.daysPerWeek);
              const recentCompleted = completedSessions.slice(-twoWeeksCount);
              const olderCount = completedSessions.length - recentCompleted.length;
              return (
                <div className="repiq-completed-section">
                  <button
                    type="button"
                    className="repiq-completed-toggle"
                    onClick={() => setCompletedExpanded(v => !v)}
                  >
                    <span>Completed · {completedSessions.length} sessions</span>
                    <span className={`repiq-completed-chevron${completedExpanded ? " is-open" : ""}`}>›</span>
                  </button>
                  {completedExpanded && (
                    <div className="repiq-sessions-list">
                      {olderCount > 0 && (
                        <p className="repiq-history-see-all">
                          {olderCount} earlier session{olderCount !== 1 ? "s" : ""} — see full history in <strong>Workout History</strong>
                        </p>
                      )}
                      {recentCompleted.map((s) => {
                        const historyMatch = savedWorkouts?.find(w => w.repiqSourceKey === s.key) ?? null;
                        return (
                          <div
                            key={s.key}
                            className="repiq-session-card is-done"
                            style={{ cursor: "pointer" }}
                            onClick={() => onOpenHistoryWorkout?.(historyMatch, s.weekIdx, s.dayIdx, s.label, s.sessionNum)}
                          >
                            <div className="repiq-session-header">
                              <div className="repiq-session-meta">
                                <span className="repiq-session-num">Session {s.sessionNum}</span>
                                {s.focus && <span className="repiq-session-focus">{s.focus}</span>}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span className="repiq-week-badge is-done">✓ Done</span>
                                <span className="repiq-session-chevron">›</span>
                              </div>
                            </div>
                            <p className="repiq-session-name">{s.label}</p>
                            {historyMatch && onSaveHistoryWorkout && (
                              <button
                                type="button"
                                className="repiq-history-save-btn"
                                onClick={(e) => { e.stopPropagation(); onSaveHistoryWorkout(historyMatch); }}
                              >
                                Save to My Workouts
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Preferences overlay */}
            {showPrefsOverlay && (
              <div className="repiq-prefs-overlay" onClick={() => setShowPrefsOverlay(false)}>
                <div className="repiq-prefs-sheet" onClick={e => e.stopPropagation()}>
                  <div className="repiq-prefs-header">
                    <h3 className="repiq-prefs-title">Adjust Plan Preferences</h3>
                    <button type="button" className="repiq-prefs-close" onClick={() => setShowPrefsOverlay(false)}>✕</button>
                  </div>

                  <div className="repiq-prefs-body">
                    {/* Goal */}
                    <div className="ob-field">
                      <label className="ob-field-label">Primary Goal</label>
                      <div className="ob-chip-grid">
                        {([
                          { value: "build_muscle", label: "💪 Build Muscle" },
                          { value: "get_stronger", label: "🏋️ Get Stronger" },
                          { value: "improve_fitness", label: "🏃 Improve Fitness" },
                          { value: "fat_loss", label: "🔥 Fat Loss" },
                          { value: "athletic_performance", label: "⚡ Performance" },
                          { value: "stay_active", label: "🌿 Stay Active" },
                        ] as { value: string; label: string }[]).map(o => (
                          <button
                            key={o.value}
                            type="button"
                            className={`ob-chip${prefGoal === o.value ? " is-active" : ""}`}
                            onClick={() => setPrefGoal(o.value)}
                          >
                            <span className="ob-chip-check" style={{ visibility: prefGoal === o.value ? "visible" : "hidden" }}>✓</span>
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Experience */}
                    <div className="ob-field">
                      <label className="ob-field-label">Experience Level</label>
                      <div className="ob-chip-grid">
                        {([
                          { value: "never", label: "🌱 New to training" },
                          { value: "beginner", label: "🚶 Getting started" },
                          { value: "intermediate", label: "🏃 Building foundations" },
                          { value: "advanced", label: "💪 Experienced" },
                          { value: "veteran", label: "🦅 Veteran" },
                        ] as { value: string; label: string }[]).map(o => (
                          <button
                            key={o.value}
                            type="button"
                            className={`ob-chip${prefExp === o.value ? " is-active" : ""}`}
                            onClick={() => setPrefExp(o.value)}
                          >
                            <span className="ob-chip-check" style={{ visibility: prefExp === o.value ? "visible" : "hidden" }}>✓</span>
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Days per week */}
                    <div className="ob-field">
                      <label className="ob-field-label">Days per week</label>
                      <div className="ob-chip-row">
                        {[1, 2, 3, 4, 5, 6, 7].map(d => (
                          <button
                            key={d}
                            type="button"
                            className={`ob-chip${prefDays === d ? " is-active" : ""}`}
                            onClick={() => setPrefDays(d)}
                          >
                            <span className="ob-chip-check" style={{ visibility: prefDays === d ? "visible" : "hidden" }}>✓</span>
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Session length */}
                    <div className="ob-field">
                      <label className="ob-field-label">Session length</label>
                      <div className="ob-chip-row">
                        {([30, 45, 60, 75, 90] as number[]).map(l => (
                          <button
                            key={l}
                            type="button"
                            className={`ob-chip${prefLength === l ? " is-active" : ""}`}
                            onClick={() => setPrefLength(l)}
                          >
                            <span className="ob-chip-check" style={{ visibility: prefLength === l ? "visible" : "hidden" }}>✓</span>
                            {l} min
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Plan length */}
                    <div className="ob-field">
                      <label className="ob-field-label">Plan Length</label>
                      <div className="ob-chip-row">
                        {([4, 6, 8, 10, 12, 16] as number[]).map(w => (
                          <button
                            key={w}
                            type="button"
                            className={`ob-chip${prefWeeks === w ? " is-active" : ""}`}
                            onClick={() => setPrefWeeks(w)}
                          >
                            <span className="ob-chip-check" style={{ visibility: prefWeeks === w ? "visible" : "hidden" }}>✓</span>
                            {w}w
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="repiq-prefs-footer">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => {
                        onRegeneratePlan?.({ goal: prefGoal, experience: prefExp, daysPerWeek: prefDays, sessionLength: prefLength, planLengthWeeks: prefWeeks, splitPref: prefSplit });
                        setShowPrefsOverlay(false);
                      }}
                    >
                      Regenerate Plan
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}
      <div style={repiqPlan && plannerMode === "repiq" ? { display: "none" } : undefined}>
      <section className="planner-actions-strip">
        <div className="planner-top-actions-row">
          <button
            className="planner-top-action planner-top-action-generate"
            type="button"
            onClick={() => onViewChange("generate")}
          >
            Generate Session
          </button>
          <button
            className="planner-top-action planner-top-action-quick"
            type="button"
            onClick={onStartEmpty}
            disabled={hasActiveWorkout}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true" style={{flexShrink:0, filter:"drop-shadow(0 0 3px rgba(251,113,20,0.55))"}}>
              <defs>
                <linearGradient id="planner-flame" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#facc15"/>
                  <stop offset="50%" stopColor="#f97316"/>
                  <stop offset="100%" stopColor="#ef4444"/>
                </linearGradient>
              </defs>
              <path d="M7.5 1L2 7.5h4.5L5 12l6.5-7H7L7.5 1z" fill="url(#planner-flame)"/>
            </svg>
            Quick
          </button>
        </div>
      </section>

      <div className="planner-tabs" role="tablist" aria-label="Workout planner sections">
        <div className="planner-tabs-track">
          <button
            type="button"
            className={activeView === "mine" ? "is-active" : ""}
            aria-selected={activeView === "mine"}
            onClick={() => onViewChange("mine")}
          >
            My Workouts{plans.length > 0 ? ` (${plans.length})` : ""}
          </button>
          <button
            type="button"
            className={activeView === "library" ? "is-active" : ""}
            aria-selected={activeView === "library"}
            onClick={() => onViewChange("library")}
          >
            Library
          </button>
        </div>
      </div>

      <section className="planner-section">
        {activeView === "mine" ? (
          <>
            {existingTags.length > 0 && (
              <div className="plan-tag-filter">
                <input
                  className="plan-tag-search"
                  placeholder="Filter by tag…"
                  value={tagFilterSearch}
                  onChange={(e) => setTagFilterSearch(e.target.value)}
                />
                <div className="plan-tag-chip-row">
                  {(() => {
                    const trimmed = tagFilterSearch.trim().toLowerCase();
                    // Active filters first, then rest alphabetically
                    const ordered = [
                      ...activeTagFilter.filter((t) => existingTags.includes(t)),
                      ...existingTags.filter((t) => !activeTagFilter.includes(t))
                    ];
                    return (trimmed ? ordered.filter((t) => t.toLowerCase().includes(trimmed)) : ordered).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={`generate-chip${activeTagFilter.includes(tag) ? " is-selected" : ""}`}
                        onClick={() =>
                          setActiveTagFilter((prev) =>
                            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                          )
                        }
                      >
                        {tag}
                      </button>
                    ));
                  })()}
                </div>
              </div>
            )}
            {(() => {
              const visiblePlans = activeTagFilter.length > 0
                ? plans.filter((p) => activeTagFilter.some((t) => p.userTags?.includes(t)))
                : plans;
              return visiblePlans.length === 0 ? (
                <div className="planner-empty">
                  <p className="planner-empty-title">
                    {plans.length === 0 ? "No routines yet" : "No workouts match the selected tags"}
                  </p>
                  <p className="planner-empty-sub">
                    {plans.length === 0
                      ? "Create your first workout template, or use Generate Workout to draft one for you."
                      : "Try selecting different tags or clear the filter."}
                  </p>
                </div>
              ) : (
                <div className="plan-list">
                  <p className="planner-list-count">{visiblePlans.length} {visiblePlans.length === 1 ? "workout" : "workouts"}</p>
                  {visiblePlans.map((plan, idx) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      isTemplate={false}
                      library={library}
                      position={idx + 1}
                      draggable={activeTagFilter.length === 0}
                      onOpen={() => { setDetailPlan(plan); setDetailIsTemplate(false); }}
                      onDragStart={() => setDragPlanId(plan.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (dragPlanId) onReorderPlans(dragPlanId, plan.id);
                        setDragPlanId(null);
                      }}
                      onEdit={() => onEditPlan(plan)}
                      onShare={() => void onSharePlan(plan)}
                      onEditTags={() => onEditTags(plan)}
                      onDuplicate={() => onDuplicatePlan(plan)}
                      onDelete={SAMPLE_PLAN_IDS.has(plan.id) ? undefined : () => setDeletingPlanId(plan.id)}
                    />
                  ))}
                </div>
              );
            })()}
          </>
        ) : (
          <>
            {/* Filter tray — compact summary + open button */}
            <div className="lib-filter-tray">
              <button
                type="button"
                className="lib-filter-open-btn"
                onClick={() => {
                  setLibDraftCategory(libCategory);
                  setLibDraftLevel(libLevel);
                  setLibDraftGoal(libGoal);
                  setLibDraftEquipment(libEquipment);
                  setLibFilterFocus(null);
                  setLibFilterOpen(true);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M1 3h12M3 7h8M5 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Filters
              </button>
              <div className="lib-filter-tray-pills">
                {([
                  { label: "Type", value: libCategory, clear: () => setLibCategory(null) },
                  { label: "Level", value: libLevel, clear: () => setLibLevel(null) },
                  { label: "Goal", value: libGoal, clear: () => setLibGoal(null) },
                  { label: "Equipment", value: libEquipment, clear: () => setLibEquipment(null) },
                ] as { label: string; value: string | null; clear: () => void }[])
                  .sort((a, b) => (a.value ? -1 : b.value ? 1 : 0))
                  .map(({ label, value, clear }) => (
                  <button
                    key={label}
                    type="button"
                    className={`lib-filter-pill${value ? " is-active" : ""}`}
                    onClick={() => {
                      setLibDraftCategory(libCategory);
                      setLibDraftLevel(libLevel);
                      setLibDraftGoal(libGoal);
                      setLibDraftEquipment(libEquipment);
                      setLibFilterFocus(label);
                      setLibFilterOpen(true);
                    }}
                  >
                    <span className="lib-filter-pill-key">{label}</span>
                    <span className="lib-filter-pill-sep">:</span>
                    <span className="lib-filter-pill-val">{value ?? "none"}</span>
                    {value && (
                      <span
                        className="lib-filter-pill-clear"
                        role="button"
                        aria-label={`Clear ${label} filter`}
                        onClick={(e) => { e.stopPropagation(); clear(); }}
                      >×</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <p className="planner-section-hint">
              {visibleTemplates.length} {visibleTemplates.length === 1 ? "template" : "templates"} — tap to preview and start.
            </p>
            {visibleTemplates.length === 0 ? (
              <div className="planner-empty">
                <p className="planner-empty-title">No templates match</p>
                <p className="planner-empty-sub">Try adjusting the filters above.</p>
              </div>
            ) : (
              <div className="plan-template-grid">
                {visibleTemplates.map((template) => (
                  <PlanCard
                    key={template.id}
                    plan={template}
                    isTemplate={true}
                    library={library}
                    onOpen={() => { setDetailPlan(template); setDetailIsTemplate(true); }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <button
        className={`planner-fab${hasActiveWorkout ? " has-tray" : ""}`}
        type="button"
        onClick={onCreateNew}
        aria-label="Create workout"
      >
        +
      </button>

      {/* Filter overlay */}
      {libFilterOpen && (
        <div className="lib-filter-overlay" onClick={libFilterFocus ? () => setLibFilterOpen(false) : applyFiltersAndClose}>
          <div className="lib-filter-sheet" onClick={(e) => e.stopPropagation()}>
            <header className="lib-filter-sheet-header">
              <h2 className="lib-filter-sheet-title">{libFilterFocus ?? "Filters"}</h2>
              <button type="button" className="lib-filter-sheet-close" onClick={libFilterFocus ? () => setLibFilterOpen(false) : applyFiltersAndClose}>×</button>
            </header>
            <div className="lib-filter-sheet-body">
              {filterVisibleDefs.map(({ label, options, draftValue, realSet, draftSet }) => (
                <div key={label} className="lib-filter-sheet-section">
                  {!libFilterFocus && <p className="lib-filter-sheet-section-label">{label}</p>}
                  <div className="lib-filter-sheet-chips">
                    {options.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        className={`generate-chip${draftValue === opt ? " is-selected" : ""}`}
                        onClick={() => {
                          const newVal = draftValue === opt ? null : opt;
                          if (libFilterFocus) {
                            realSet(newVal);
                            setLibFilterOpen(false);
                          } else {
                            draftSet(newVal);
                          }
                        }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {!libFilterFocus && (
              <div className="lib-filter-sheet-footer">
                <button
                  type="button"
                  className="lib-filter-clear-btn"
                  onClick={() => { setLibDraftCategory(null); setLibDraftLevel(null); setLibDraftGoal(null); setLibDraftEquipment(null); }}
                >
                  Clear all
                </button>
                <button type="button" className="primary-button lib-filter-apply-btn" onClick={applyFiltersAndClose}>
                  Show {draftVisibleCount} {draftVisibleCount === 1 ? "template" : "templates"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
      {savedToast && (
        <div className="repiq-saved-toast">Saved to My Workouts</div>
      )}
      {deletingPlanId && (() => {
        const plan = plans.find((p) => p.id === deletingPlanId);
        return (
          <div className="plan-delete-confirm-overlay" onClick={() => setDeletingPlanId(null)}>
            <div className="plan-delete-confirm-sheet" onClick={(e) => e.stopPropagation()}>
              <p className="plan-delete-confirm-title">Delete "{plan?.name}"?</p>
              <p className="plan-delete-confirm-body">This workout will be permanently removed. You can&apos;t undo this.</p>
              <div className="plan-delete-confirm-actions">
                <button type="button" className="secondary-button" onClick={() => setDeletingPlanId(null)}>Cancel</button>
                <button type="button" className="danger-button" onClick={() => { const id = deletingPlanId; setDeletingPlanId(null); onDeletePlan(id); }}>Delete</button>
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}

function PlanTagPicker({
  value,
  existingTags,
  createLabel,
  onChange,
  searchValue,
  onSearchChange,
}: {
  value: string[];
  existingTags: string[];
  createLabel?: string;
  onChange: (tags: string[]) => void;
  searchValue?: string;
  onSearchChange?: (s: string) => void;
}) {
  const [internalSearch, setInternalSearch] = useState("");
  const search = searchValue ?? internalSearch;
  const setSearch = onSearchChange ?? setInternalSearch;
  const trimmed = search.trim();

  const allTags = [...new Set([...existingTags, ...value])].sort((a, b) => a.localeCompare(b));
  // Selected tags shown first, then unselected alphabetically
  const ordered = [...value.filter((t) => allTags.includes(t)), ...allTags.filter((t) => !value.includes(t))];
  const filtered = trimmed ? ordered.filter((t) => t.toLowerCase().includes(trimmed.toLowerCase())) : ordered;
  const canCreate = trimmed.length > 0 && !allTags.some((t) => t.toLowerCase() === trimmed.toLowerCase());

  function toggle(tag: string) {
    onChange(value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag]);
  }

  function createAndAdd() {
    if (!trimmed) return;
    onChange([...value, trimmed]);
    setSearch("");
  }

  return (
    <div className="plan-tag-picker">
      <input
        className="plan-tag-search"
        placeholder="Search or create a tag…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && canCreate) { e.preventDefault(); createAndAdd(); } }}
      />
      <div className="plan-tag-chip-row">
        {filtered.map((tag) => (
          <button
            key={tag}
            type="button"
            className={`generate-chip${value.includes(tag) ? " is-selected" : ""}`}
            onClick={() => toggle(tag)}
          >
            {tag}
          </button>
        ))}
        {canCreate && (
          <button type="button" className="generate-chip plan-tag-create-chip" onClick={createAndAdd}>
            {createLabel ?? "+ New"} {trimmed}
          </button>
        )}
        {filtered.length === 0 && !canCreate && (
          <span className="plan-tag-empty">Type a name to create your first tag.</span>
        )}
      </div>
    </div>
  );
}

function PlanBuilderPage({
  draft,
  mode,
  library,
  existingTags,
  onBack,
  onChange,
  onAddExercise,
  onSavePlan,
  onDeletePlan,
  onOpenExerciseDetails,
  resolvedTheme,
  onToggleTheme,
}: {
  draft: WorkoutPlan;
  mode: PlanBuilderMode;
  library: ExerciseDraft[];
  existingTags: string[];
  onBack: () => void;
  onChange: (plan: WorkoutPlan) => void;
  onAddExercise: () => void;
  onSavePlan: (plan: WorkoutPlan) => void;
  onDeletePlan?: () => void;
  onOpenExerciseDetails: (exerciseId: string) => void;
  resolvedTheme: string;
  onToggleTheme: () => void;
}) {
  const [dragExerciseId, setDragExerciseId] = useState<string | null>(null);
  const resolvedTitle =
    mode === "generate" ? "Review Workout" : mode === "edit" ? "Edit Workout" : "New Workout";
  const canSave = draft.exercises.length > 0;

  const resolvedExercises = draft.exercises
    .map((planned) => {
      const exercise = library.find((entry) => entry.id === planned.exerciseId);
      return exercise ? { planned, exercise } : null;
    })
    .filter((entry): entry is { planned: PlannedExercise; exercise: ExerciseDraft } => entry !== null);

  function updateDraft(patch: Partial<WorkoutPlan>) {
    onChange({
      ...draft,
      ...patch,
      updatedAt: new Date().toISOString()
    });
  }

  function moveExercise(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const sourceIndex = draft.exercises.findIndex((e) => e.exerciseId === sourceId);
    const targetIndex = draft.exercises.findIndex((e) => e.exerciseId === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;
    const reordered = [...draft.exercises];
    const [item] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, item);
    updateDraft({ exercises: reordered });
  }

  function removeExercise(exerciseId: string) {
    updateDraft({ exercises: draft.exercises.filter((pe) => pe.exerciseId !== exerciseId) });
  }

  function updatePlannedExercise(exerciseId: string, patch: Partial<PlannedExercise>) {
    updateDraft({
      exercises: draft.exercises.map((pe) =>
        pe.exerciseId === exerciseId ? { ...pe, ...patch } : pe
      )
    });
  }

  function getEffectiveSetTypes(pe: PlannedExercise): DraftSetType[] {
    if (pe.setTypes && pe.setTypes.length === pe.setCount) return pe.setTypes;
    return Array.from({ length: pe.setCount }, () => "normal" as DraftSetType);
  }

  function addSet(exerciseId: string) {
    const pe = draft.exercises.find((e) => e.exerciseId === exerciseId);
    if (!pe) return;
    const types = getEffectiveSetTypes(pe);
    updatePlannedExercise(exerciseId, { setCount: pe.setCount + 1, setTypes: [...types, "normal"] });
  }

  function removeSet(exerciseId: string, index: number) {
    const pe = draft.exercises.find((e) => e.exerciseId === exerciseId);
    if (!pe || pe.setCount <= 1) return;
    const types = getEffectiveSetTypes(pe).filter((_, i) => i !== index);
    updatePlannedExercise(exerciseId, { setCount: pe.setCount - 1, setTypes: types });
  }

  function cycleSetType(exerciseId: string, index: number) {
    const pe = draft.exercises.find((e) => e.exerciseId === exerciseId);
    if (!pe) return;
    const order: DraftSetType[] = ["normal", "warmup", "drop", "restpause", "failure"];
    const types = getEffectiveSetTypes(pe);
    const current = types[index] ?? "normal";
    types[index] = order[(order.indexOf(current) + 1) % order.length];
    updatePlannedExercise(exerciseId, { setTypes: [...types] });
  }

  function builderSetLabel(types: DraftSetType[], index: number): string {
    const type = types[index] ?? "normal";
    if (type === "normal") {
      return String(types.slice(0, index + 1).filter((t) => t === "normal").length);
    }
    return setTypeOptions.find((o) => o.value === type)?.symbol ?? "#";
  }

  return (
    <main className="planner-page is-builder">
      <header className="planner-topbar">
        <button className="back-nav-button" type="button" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div className="planner-topbar-copy">
          <h1>{resolvedTitle}</h1>
        </div>
        <button type="button" className="theme-toggle-btn" onClick={onToggleTheme} aria-label="Toggle theme">
          {resolvedTheme === "dark" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
        </button>
      </header>

      <div className="plan-detail-actions-top">
        <button
          className="primary-button plan-detail-action-btn"
          type="button"
          disabled={!canSave}
          onClick={() => onSavePlan(draft)}
        >
          {mode === "edit" ? "Save Changes" : "Save Workout"}
        </button>
        {mode === "edit" && onDeletePlan && (
          <button
            type="button"
            className="danger-button plan-detail-manage-btn"
            onClick={onDeletePlan}
          >
            Delete
          </button>
        )}
      </div>

      <section className="planner-section planner-builder-section">
        <div className="builder-form">
          <div className="builder-form-field">
            <label className="builder-form-label" htmlFor="plan-name">Name</label>
            <input
              id="plan-name"
              className="builder-form-input"
              value={draft.name}
              onChange={(event) => updateDraft({ name: event.target.value })}
              placeholder="e.g. Upper Push, Leg Day…"
            />
          </div>

          <div className="builder-form-field">
            <label className="builder-form-label" htmlFor="plan-note">Note <span className="builder-form-optional">optional</span></label>
            <input
              id="plan-note"
              className="builder-form-input"
              value={draft.note ?? ""}
              onChange={(event) => updateDraft({ note: event.target.value })}
              placeholder="Focus, equipment, intent…"
            />
          </div>

          <div className="builder-form-field">
            <label className="builder-form-label">Tags <span className="builder-form-optional">optional</span></label>
            <PlanTagPicker
              value={draft.userTags ?? []}
              existingTags={existingTags}
              createLabel="+ New"
              onChange={(userTags) => updateDraft({ userTags })}
            />
          </div>
        </div>

        <div className="planner-builder-summary">
          <p className="planner-routine-count">
            {draft.exercises.length} {draft.exercises.length === 1 ? "exercise" : "exercises"}
          </p>
        </div>

        {resolvedExercises.length === 0 ? (
          <div className="planner-builder-stub">
            <p className="planner-empty-title">No exercises yet</p>
            <p className="planner-empty-sub">Add exercises below to build your workout.</p>
          </div>
        ) : (
          <div className="plan-list">
            {resolvedExercises.map(({ planned, exercise }) => {
              const setTypes = getEffectiveSetTypes(planned);
              return (
                <article
                  key={planned.exerciseId}
                  className="builder-exercise-card"
                  draggable={true}
                  onDragStart={() => setDragExerciseId(planned.exerciseId)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragExerciseId) moveExercise(dragExerciseId, planned.exerciseId);
                    setDragExerciseId(null);
                  }}
                >
                  <div className="builder-ex-header">
                    <div className="builder-ex-title-area">
                      <span className="builder-ex-drag" aria-hidden="true">⋮⋮</span>
                      <div className="builder-ex-copy">
                        <button
                          type="button"
                          className="builder-ex-name"
                          onClick={() => onOpenExerciseDetails(exercise.id)}
                        >
                          {exercise.name}
                        </button>
                        <p className="builder-ex-muscle">{exercise.primaryMuscles?.join(", ") || exercise.primaryMuscle}</p>
                      </div>
                    </div>
                    <button className="builder-remove-btn" type="button" onClick={() => removeExercise(planned.exerciseId)} aria-label="Remove exercise">×</button>
                  </div>

                  <div className="builder-ex-rest-row">
                    <span className="builder-ex-rest-label">Rest</span>
                    <input
                      className="builder-ex-rest-input"
                      type="text"
                      inputMode="numeric"
                      value={planned.restTimer}
                      onChange={(e) => updatePlannedExercise(planned.exerciseId, { restTimer: e.target.value.replace(/\D/g, "") })}
                      aria-label="Rest seconds"
                    />
                    <span className="builder-ex-rest-unit">sec</span>
                  </div>

                  <div className="builder-set-list">
                    <div className="builder-set-header">
                      <span>SET</span>
                      <span>TYPE</span>
                    </div>
                    {setTypes.map((type, i) => (
                      <div key={i} className="builder-set-row">
                        <button
                          type="button"
                          className={`builder-set-label builder-set-label--${type}`}
                          onClick={() => cycleSetType(planned.exerciseId, i)}
                          title="Tap to change set type"
                        >
                          {builderSetLabel(setTypes, i)}
                        </button>
                        <span className="builder-set-type-name">{setTypeOptions.find((o) => o.value === type)?.label ?? "Working set"}</span>
                        <button type="button" className="builder-set-remove" onClick={() => removeSet(planned.exerciseId, i)} aria-label="Remove set">−</button>
                      </div>
                    ))}
                  </div>

                  <button type="button" className="builder-add-set-btn" onClick={() => addSet(planned.exerciseId)}>+ Add Set</button>
                </article>
              );
            })}
          </div>
        )}

        <button
          className="secondary-button builder-add-exercise-btn"
          type="button"
          onClick={onAddExercise}
        >
          + Add Exercise
        </button>
      </section>

    </main>
  );
}

function ExerciseDetailPage({
  exercise,
  activeTab,
  initialScrollTarget,
  onTabChange,
  onBack,
  customActions,
  resolvedTheme,
  onToggleTheme,
  onBrowseExercises,
}: {
  exercise: ExerciseDraft;
  activeTab: DetailTab;
  initialScrollTarget: "top" | "bottom";
  onTabChange: (tab: DetailTab) => void;
  onBack: () => void;
  customActions?: {
    deleteMode: "delete" | "archive";
    onEdit: () => void;
    onDeleteOrArchive: () => void;
  } | null;
  resolvedTheme?: string;
  onToggleTheme?: () => void;
  onBrowseExercises?: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [manageConfirmOpen, setManageConfirmOpen] = useState(false);
  const measurementType = getExerciseMeasurementType(exercise);
  const recentHistory = [...exercise.history].reverse();
  const engagementCopy = buildMuscleEngagementCopy(exercise);
  const lastSession = recentHistory[0];
  const bestWorkingSet = [...(lastSession?.sets ?? [])]
    .filter((set) => set.set_type === "normal")
    .sort((a, b) => b.weight - a.weight)[0];
  const weightTrend = exercise.history.map(
    (session) =>
      [...session.sets].filter((set) => set.set_type === "normal").sort((a, b) => b.weight - a.weight)[0]?.weight ?? 0
  );
  const volumeTrend = exercise.history.map((session) =>
    session.sets.reduce((total, set) => total + set.weight * set.reps, 0)
  );
  const oneRmTrend = exercise.history.map((session) =>
    estimateOneRm(
      [...session.sets]
        .filter((set) => set.set_type === "normal")
        .sort((a, b) => estimateOneRm(b) - estimateOneRm(a))[0]
    )
  );
  const hasHistory = recentHistory.length > 0;
  const exerciseInsight = buildExerciseInsight(weightTrend, volumeTrend, oneRmTrend);

  useEffect(() => {
    if (initialScrollTarget !== "bottom") {
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    window.requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end"
      });
    });
  }, [exercise.id, initialScrollTarget]);

  return (
    <main className="detail-page">
      <header className="detail-topbar">
        <button className="back-nav-button detail-back-button" type="button" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div className="detail-topbar-copy">
          <h1>{exercise.name}</h1>
          <p>{exercise.primaryMuscle}</p>
        </div>
        {customActions ? (
          <div className="detail-topbar-manage">
            <button className="detail-manage-button" type="button" onClick={customActions.onEdit}>
              Edit
            </button>
            <button
              className="detail-manage-button is-danger"
              type="button"
              onClick={() => setManageConfirmOpen(true)}
            >
              {customActions.deleteMode === "archive" ? "Hide" : "Delete"}
            </button>
          </div>
        ) : resolvedTheme && onToggleTheme ? (
          <button type="button" className="theme-toggle-btn" onClick={onToggleTheme} aria-label="Toggle theme">
            {resolvedTheme === "dark" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
          </button>
        ) : (
          <span className="detail-topbar-spacer" aria-hidden="true" />
        )}
      </header>

      <nav className="detail-tabs">
        <button
          className={activeTab === "summary" ? "is-active" : ""}
          type="button"
          onClick={() => onTabChange("summary")}
        >
          Summary
        </button>
        <button
          className={activeTab === "history" ? "is-active" : ""}
          type="button"
          onClick={() => onTabChange("history")}
        >
          History
        </button>
        <button
          className={activeTab === "howto" ? "is-active" : ""}
          type="button"
          onClick={() => onTabChange("howto")}
        >
          How To
        </button>
      </nav>

      {activeTab === "summary" && (
        <section className="detail-section">
          <div className="detail-hero">
            <img src={exercise.imageSrc} alt={exercise.name} className="detail-image" />
          </div>

          <div className="detail-muscles-card">
            <div className="detail-muscles-row">
              <span className="detail-muscles-label">Primary</span>
              <div className="detail-muscle-chips">
                {(exercise.primaryMuscles ?? [exercise.primaryMuscle]).map((m) => (
                  <span key={m} className="detail-muscle-chip is-primary">{m}</span>
                ))}
              </div>
            </div>
            {exercise.secondaryMuscles.length > 0 && (
              <div className="detail-muscles-row">
                <span className="detail-muscles-label">Secondary</span>
                <div className="detail-muscle-chips">
                  {exercise.secondaryMuscles.map((m) => (
                    <span key={m} className="detail-muscle-chip">{m}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="detail-meta-pills">
            <span className="detail-meta-pill">{getExerciseTypeLabel(inferExerciseType(exercise))}</span>
            <span className="detail-meta-pill">{measurementType === "timed" ? "Timed" : measurementType === "weight_timed" ? "Weight + timed" : "Reps & volume"}</span>
            {exercise.movementSide && (
              <span className="detail-meta-pill">{exercise.movementSide === "unilateral" ? "Unilateral" : "Bilateral"}</span>
            )}
            {(exercise as ExerciseWithTaxonomy).movementPattern && (
              <span className="detail-meta-pill detail-meta-pill--pattern">
                {((exercise as ExerciseWithTaxonomy).movementPattern ?? "").replace(/_/g, " ")}
              </span>
            )}
          </div>

          {onBrowseExercises && (
            <button type="button" className="detail-browse-link" onClick={onBrowseExercises}>
              Browse all exercises →
            </button>
          )}

          <div className="chart-card">
            <div className="chart-copy">
              <h3>Muscles Engaged</h3>
              <span>How this movement should feel when it is working well</span>
            </div>
            <div className="detail-explanation-list">
              {engagementCopy.map((paragraph) => (
                <p key={paragraph} className="detail-explanation-copy">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeTab === "history" && (
        <section className="detail-section">
          {hasHistory ? (
            <>
              <div className="detail-metrics">
                <article className="detail-metric">
                  <span>Heaviest Weight</span>
                  <strong>{Math.max(...weightTrend)}kg</strong>
                </article>
                <article className="detail-metric">
                  <span>Best 1RM</span>
                  <strong>{Math.max(...oneRmTrend)}kg</strong>
                </article>
                <article className="detail-metric">
                  <span>Last Volume</span>
                  <strong>{volumeTrend.at(-1)?.toFixed(0)}kg</strong>
                </article>
              </div>

              <div className="chart-card">
                <div className="chart-copy">
                  <h3>Highest Weight</h3>
                  <span>Recent sessions</span>
                </div>
                <svg viewBox="0 0 260 92" className="trend-chart" aria-hidden="true">
                  <path d={buildSparkline(weightTrend)} />
                </svg>
              </div>

              <div className="chart-card">
                <div className="chart-copy">
                  <h3>One Rep Max</h3>
                  <span>Estimated from best working set</span>
                </div>
                <svg viewBox="0 0 260 92" className="trend-chart" aria-hidden="true">
                  <path d={buildSparkline(oneRmTrend)} />
                </svg>
              </div>

              <div className="chart-card">
                <div className="chart-copy">
                  <h3>Volume History</h3>
                  <span>Session volume trend</span>
                </div>
                <svg viewBox="0 0 260 92" className="trend-chart" aria-hidden="true">
                  <path d={buildSparkline(volumeTrend)} />
                </svg>
              </div>

              {exerciseInsight && (
                <div className={`exercise-insight-card tone-${exerciseInsight.tone}`}>
                  <div className="exercise-insight-header">
                    <span className="exercise-insight-label">Performance insight</span>
                    <span className="exercise-insight-badge">Based on your history</span>
                  </div>
                  <p className="exercise-insight-headline">{exerciseInsight.headline}</p>
                  <p className="exercise-insight-detail">{exerciseInsight.detail}</p>
                </div>
              )}

              <div className="history-list">
                {recentHistory.map((session) => (
                  <article key={session.session_key ?? session.date} className="history-card">
                    <div className="history-top">
                      <strong>{formatSessionDate(session.date)}</strong>
                      <span>
                        {session.sets.reduce((total, set) => total + set.weight * set.reps, 0).toFixed(0)} kg
                      </span>
                    </div>
                    <p className="history-detail">
                      {session.sets.map((set) => formatPreviousSet(set, measurementType)).join(" • ")}
                    </p>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <article className="empty-state-card detail-empty-state">
              <strong>No history yet</strong>
              <p>
                Log this exercise in a workout first, and RepIQ will start showing trends, volume, and performance insights here.
              </p>
            </article>
          )}
        </section>
      )}

      {activeTab === "howto" && (
        <section className="detail-section">
          <div className="detail-hero">
            <img src={exercise.imageSrc} alt={exercise.name} className="detail-image" />
          </div>
          <div className="howto-steps">
            {exercise.howTo.map((step, index) => (
              <div key={step} className="howto-step">
                <span className="howto-step-num">{index + 1}</span>
                <p className="howto-step-text">{step}</p>
              </div>
            ))}
          </div>
          {exercise.videoLabel && (
            <a href="#" className="video-link" onClick={(event) => event.preventDefault()}>
              {exercise.videoLabel}
            </a>
          )}
        </section>
      )}

      {activeTab === "summary" && <div ref={bottomRef} />}

      {customActions && manageConfirmOpen && (
        <section className="sheet-overlay leave-center-overlay" onClick={() => setManageConfirmOpen(false)}>
          <div className="leave-center-card" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-head">
              <div>
                <p className="label">
                  {customActions.deleteMode === "archive" ? "Hide Custom Exercise" : "Delete Custom Exercise"}
                </p>
                <h3>{exercise.name}</h3>
              </div>
              <button className="icon-button" type="button" onClick={() => setManageConfirmOpen(false)}>
                ×
              </button>
            </div>
            <p className="settings-note">
              {customActions.deleteMode === "archive"
                ? "This exercise already has history, so RepIQ will hide it from the library instead of deleting it."
                : "This custom exercise will be removed from your library."}
            </p>
            <div className="custom-manage-confirm-actions">
              <div className="custom-manage-confirm-row">
                <button
                  className="secondary-button custom-manage-confirm-secondary"
                  type="button"
                  onClick={() => setManageConfirmOpen(false)}
                >
                  Cancel
                </button>
              </div>
              <button
                className="primary-button custom-manage-confirm-button"
                type="button"
                onClick={() => {
                  setManageConfirmOpen(false);
                  customActions.onDeleteOrArchive();
                }}
              >
                {customActions.deleteMode === "archive" ? "Hide from Library" : "Delete Exercise"}
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

const MEDIA_MAX_PHOTOS = 3;
const MEDIA_MAX_VIDEO_MB = 100;
const MEDIA_MAX_PHOTO_MB = 10;
const MEDIA_MAX_VIDEO_SECONDS = 30;

function formatTrimTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const CROP_OUTPUT_PX = 600;
const THEME_BG = "#f4f5f7";

// ──────────────────────────────────────────────
// SHARE CARDS
// ──────────────────────────────────────────────

function RepIQWatermark() {
  return (
    <div className="share-card-watermark" aria-hidden="true">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.3)" />
        <path d="M9 7v10l9-5-9-5z" fill="white" />
      </svg>
      <span>RepIQ</span>
    </div>
  );
}

function SummaryShareCard({ draft }: { draft: FinishWorkoutDraft }) {
  return (
    <div className="share-card share-card-summary">
      <span className="share-card-eyebrow">Workout Complete</span>
      <h2 className="share-card-title">{draft.sessionName || "Today's Workout"}</h2>
      <p className="share-card-subtitle">{formatSessionDate(draft.date)}</p>
      <div className="share-card-stats-grid">
        <div className="share-card-stat">
          <strong>{draft.duration}</strong>
          <span>Duration</span>
        </div>
        <div className="share-card-stat">
          <strong>{draft.totalVolume.toFixed(0)}<em>kg</em></strong>
          <span>Volume</span>
        </div>
        <div className="share-card-stat">
          <strong>{draft.totalSets}</strong>
          <span>Sets</span>
        </div>
        <div className="share-card-stat">
          <strong>{draft.loggedExerciseCount}</strong>
          <span>Exercises</span>
        </div>
      </div>
      <RepIQWatermark />
    </div>
  );
}

function RewardsShareCard({ draft }: { draft: FinishWorkoutDraft }) {
  const displayed = draft.rewards.slice(0, 4);
  const overflow = draft.rewards.length - displayed.length;
  return (
    <div className="share-card share-card-rewards">
      <span className="share-card-eyebrow">Achievements</span>
      <h2 className="share-card-title">
        {draft.rewardSummary.total === 1 ? "1 Reward Earned" : `${draft.rewardSummary.total} Rewards Earned`}
      </h2>
      <div className="share-card-reward-chips">
        {draft.rewardSummary.session > 0 && (
          <span className="share-card-reward-chip share-card-reward-chip-session">{rewardLevelIcon.session} {draft.rewardSummary.session} session</span>
        )}
        {draft.rewardSummary.exercise > 0 && (
          <span className="share-card-reward-chip share-card-reward-chip-exercise">{rewardLevelIcon.exercise} {draft.rewardSummary.exercise} exercise</span>
        )}
        {draft.rewardSummary.set > 0 && (
          <span className="share-card-reward-chip share-card-reward-chip-set">{rewardLevelIcon.set} {draft.rewardSummary.set} set</span>
        )}
      </div>
      <div className="share-card-reward-list">
        {displayed.map((r) => (
          <div key={r.id} className="share-card-reward-row">
            <span className="share-card-reward-icon">{rewardLevelIcon[r.level]}</span>
            <div className="share-card-reward-text">
              <strong>{r.shortLabel}</strong>
              <p>{r.detail}</p>
            </div>
          </div>
        ))}
        {overflow > 0 && <p className="share-card-reward-overflow">+{overflow} more</p>}
      </div>
      <RepIQWatermark />
    </div>
  );
}

function MusclesShareCard({ draft }: { draft: FinishWorkoutDraft }) {
  const muscleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    draft.exercises.forEach((ex) => {
      if (ex.primaryMuscle) counts[ex.primaryMuscle] = (counts[ex.primaryMuscle] || 0) + ex.loggedSets;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [draft.exercises]);
  const maxCount = muscleCounts[0]?.[1] ?? 1;

  return (
    <div className="share-card share-card-muscles">
      <span className="share-card-eyebrow">Muscles Worked</span>
      <h2 className="share-card-title">
        {muscleCounts.length} muscle {muscleCounts.length === 1 ? "group" : "groups"}
      </h2>
      <div className="share-card-muscle-list">
        {muscleCounts.map(([muscle, sets]) => (
          <div key={muscle} className="share-card-muscle-row">
            <span className="share-card-muscle-name">{muscle}</span>
            <div className="share-card-muscle-bar-track">
              <div
                className="share-card-muscle-bar-fill"
                style={{ width: `${(sets / maxCount) * 100}%` }}
              />
            </div>
            <span className="share-card-muscle-sets">{sets}s</span>
          </div>
        ))}
      </div>
      <RepIQWatermark />
    </div>
  );
}

function ExercisesShareCard({ draft }: { draft: FinishWorkoutDraft }) {
  const maxVol = Math.max(...draft.exercises.map((e) => e.loggedVolume), 1);
  const displayed = draft.exercises.slice(0, 6);
  const overflow = draft.exercises.length - displayed.length;

  return (
    <div className="share-card share-card-exercises">
      <span className="share-card-eyebrow">Exercises</span>
      <h2 className="share-card-title">{draft.exercises.length} logged</h2>
      <div className="share-card-exercise-list">
        {displayed.map((ex) => (
          <div key={ex.id} className="share-card-exercise-row">
            <div className="share-card-exercise-meta">
              <span className="share-card-exercise-name">{ex.name}</span>
              <span className="share-card-exercise-detail">
                {ex.loggedSets} {ex.loggedSets === 1 ? "set" : "sets"} · {ex.loggedVolume.toFixed(0)} kg
              </span>
            </div>
            <div className="share-card-exercise-bar-track">
              <div
                className="share-card-exercise-bar-fill"
                style={{ width: `${(ex.loggedVolume / maxVol) * 100}%` }}
              />
            </div>
          </div>
        ))}
        {overflow > 0 && <p className="share-card-exercise-overflow">+{overflow} more exercises</p>}
      </div>
      <RepIQWatermark />
    </div>
  );
}

function AchievementsShareCard({ draft }: { draft: FinishWorkoutDraft }) {
  return (
    <div className="share-card share-card-achievements">
      <span className="share-card-eyebrow">✨ What I Achieved</span>
      <h2 className="share-card-achieve-title">{draft.takeawayTitle}</h2>
      <p className="share-card-achieve-body">{draft.takeawayBody}</p>
      <div className="share-card-achieve-stats">
        <div className="share-card-achieve-stat">
          <strong>{draft.totalVolume.toFixed(0)}</strong>
          <span>kg lifted</span>
        </div>
        <div className="share-card-achieve-stat">
          <strong>{draft.totalSets}</strong>
          <span>sets done</span>
        </div>
        <div className="share-card-achieve-stat">
          <strong>{draft.loggedExerciseCount}</strong>
          <span>exercises</span>
        </div>
        {draft.rewardSummary.total > 0 && (
          <div className="share-card-achieve-stat">
            <strong>{draft.rewardSummary.total}</strong>
            <span>rewards</span>
          </div>
        )}
      </div>
      <RepIQWatermark />
    </div>
  );
}

const weightComparisons = [
  { label: "bowling balls", kg: 7.26 },
  { label: "golden retrievers", kg: 30 },
  { label: "mountain bikes", kg: 14 },
  { label: "office chairs", kg: 20 },
  { label: "car tyres", kg: 12 },
  { label: "suitcases", kg: 25 },
  { label: "watermelons", kg: 9 },
  { label: "bags of cement", kg: 50 },
  { label: "microwave ovens", kg: 13 },
  { label: "small cars", kg: 1200 },
  { label: "grand pianos", kg: 450 },
  { label: "horses", kg: 500 },
  { label: "polar bears", kg: 450 },
];

function getBestComparison(totalKg: number) {
  let best = weightComparisons[0];
  let bestCount = 0;
  for (const c of weightComparisons) {
    const count = totalKg / c.kg;
    if (count >= 1 && (bestCount === 0 || Math.abs(count - 5) < Math.abs(bestCount - 5))) {
      best = c;
      bestCount = count;
    }
  }
  return { label: best.label, count: Math.round(totalKg / best.kg) };
}

function FunWeightCard({ draft }: { draft: FinishWorkoutDraft }) {
  const { label, count } = getBestComparison(draft.totalVolume);
  return (
    <div className="share-card share-card-funweight">
      <span className="share-card-eyebrow">💪 Did You Know?</span>
      <h2 className="share-card-title">You lifted</h2>
      <div className="share-card-funweight-big">
        <strong>{draft.totalVolume.toFixed(0)}<em>kg</em></strong>
      </div>
      <p className="share-card-funweight-compare">
        That's like lifting <strong>{count} {label}</strong>!
      </p>
      <p className="share-card-funweight-sub">across {draft.totalSets} sets in {draft.duration}</p>
      <RepIQWatermark />
    </div>
  );
}

function ShareCardsStrip({ draft }: { draft: FinishWorkoutDraft }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const cards = useMemo<string[]>(() => {
    const list: string[] = ["summary"];
    if (draft.rewardSummary.total > 0) list.push("rewards");
    if (draft.exercises.some((e) => e.primaryMuscle) && draft.exercises.length > 0) list.push("muscles");
    if (draft.exercises.length > 0) list.push("exercises");
    if (draft.totalVolume > 10) list.push("funweight");
    list.push("achievements");
    return list;
  }, [draft]);

  function handleScroll() {
    if (!scrollRef.current) return;
    const sl = scrollRef.current.scrollLeft;
    const cw = scrollRef.current.offsetWidth;
    setActiveIndex(Math.round(sl / cw));
  }

  function goToCard(index: number) {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ left: index * scrollRef.current.offsetWidth, behavior: "smooth" });
  }

  async function handleShare(cardType: string) {
    const title = `${draft.sessionName} — ${cardType}`;
    const text = `Check out my workout: ${draft.sessionName} on ${formatSessionDate(draft.date)} — ${draft.totalVolume.toFixed(0)}kg across ${draft.totalSets} sets.`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text });
      } catch {
        // user dismissed
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        alert("Copied to clipboard!");
      } catch {
        // clipboard not available
      }
    }
  }

  return (
    <section className="finish-workout-card share-cards-section">
      <div className="share-cards-header">
        <p className="label">Share</p>
        {cards.length > 1 && <span className="share-cards-hint">{activeIndex + 1} / {cards.length}</span>}
      </div>
      <div ref={scrollRef} className="share-cards-scroll" onScroll={handleScroll}>
        {cards.map((cardType) => (
          <div key={cardType} className="share-card-slide">
            {cardType === "summary" && <SummaryShareCard draft={draft} />}
            {cardType === "rewards" && <RewardsShareCard draft={draft} />}
            {cardType === "muscles" && <MusclesShareCard draft={draft} />}
            {cardType === "exercises" && <ExercisesShareCard draft={draft} />}
            {cardType === "funweight" && <FunWeightCard draft={draft} />}
            {cardType === "achievements" && <AchievementsShareCard draft={draft} />}
            <button type="button" className="share-card-action-btn" onClick={() => handleShare(cardType)}>↗ Share</button>
          </div>
        ))}
      </div>
      {cards.length > 1 && (
        <div className="share-cards-dots" aria-hidden="true">
          {cards.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`share-cards-dot${i === activeIndex ? " is-active" : ""}`}
              onClick={() => goToCard(i)}
              aria-label={`Go to card ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PostSaveShareScreen({
  data,
  onDone,
  resolvedTheme,
  onToggleTheme,
}: {
  data: SavedWorkoutData;
  onDone: () => void;
  resolvedTheme?: string;
  onToggleTheme?: () => void;
}) {
  return (
    <main className="detail-page post-save-screen">
      <div className="post-save-hero">
        <div className="post-save-topbar">
          <span className="post-save-eyebrow">Saved!</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {resolvedTheme && onToggleTheme && (
              <button type="button" className="theme-toggle-btn theme-toggle-btn--ghost" onClick={onToggleTheme} aria-label="Toggle theme">
                {resolvedTheme === "dark" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
              </button>
            )}
            <button type="button" className="post-save-done-btn" onClick={onDone}>Done</button>
          </div>
        </div>
        <h1 className="post-save-title">{data.sessionName}</h1>
        <p className="post-save-subtitle">{formatSessionDate(data.date)}</p>
      </div>
      <section className="detail-section post-save-section">
        <ShareCardsStrip draft={data} />
      </section>
    </main>
  );
}

type CropMode = "crop" | "fit-width" | "fit-height";
type CropFill = "blank" | "blur" | "fill";

function CropTool({
  imageUrl,
  onCrop,
  onCancel
}: {
  imageUrl: string;
  onCrop: (croppedUrl: string) => void;
  onCancel: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [containerSize, setContainerSize] = useState(0);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [confirming, setConfirming] = useState(false);
  const [mode, setMode] = useState<CropMode>("crop");
  const [fill, setFill] = useState<CropFill>("blank");
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  function clampOffset(x: number, y: number, s: number, cSize: number, nw: number, nh: number) {
    return {
      x: Math.min(0, Math.max(cSize - nw * s, x)),
      y: Math.min(0, Math.max(cSize - nh * s, y))
    };
  }

  function handleImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    const cSize = containerRef.current?.offsetWidth ?? 300;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const s = Math.max(cSize / nw, cSize / nh);
    setNaturalSize({ w: nw, h: nh });
    setContainerSize(cSize);
    setScale(s);
    setOffset({ x: (cSize - nw * s) / 2, y: (cSize - nh * s) / 2 });
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (mode !== "crop") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.sx;
    const dy = e.clientY - dragRef.current.sy;
    setOffset(clampOffset(dragRef.current.ox + dx, dragRef.current.oy + dy, scale, containerSize, naturalSize.w, naturalSize.h));
  }

  function handlePointerUp() { dragRef.current = null; }

  // Fit mode image display dimensions (within the square container)
  const fitStyle = useMemo((): React.CSSProperties => {
    if (containerSize === 0 || naturalSize.w === 0) return { position: "absolute" };
    if (mode === "fit-width") {
      const w = containerSize;
      const h = (naturalSize.h / naturalSize.w) * containerSize;
      return { position: "absolute", left: 0, top: (containerSize - h) / 2, width: w, height: h };
    }
    // fit-height
    const h = containerSize;
    const w = (naturalSize.w / naturalSize.h) * containerSize;
    return { position: "absolute", left: (containerSize - w) / 2, top: 0, width: w, height: h };
  }, [mode, containerSize, naturalSize]);

  const frameBg = mode === "crop" || fill !== "blank" ? "transparent" : "rgba(255,255,255,0.07)";

  async function handleConfirm() {
    if (confirming || containerSize === 0) return;
    setConfirming(true);
    const O = CROP_OUTPUT_PX;
    const canvas = document.createElement("canvas");
    canvas.width = O; canvas.height = O;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setConfirming(false); return; }

    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = imageUrl; });

    const drawFit = (drawW: number, drawH: number) => {
      const x = (O - drawW) / 2;
      const y = (O - drawH) / 2;
      ctx.drawImage(img, x, y, drawW, drawH);
    };

    let mimeType: string = "image/jpeg";
    let quality: number | undefined = 0.92;

    const fitW = mode === "fit-width" ? O : (img.naturalWidth / img.naturalHeight) * O;
    const fitH = mode === "fit-width" ? (img.naturalHeight / img.naturalWidth) * O : O;

    if (mode === "crop") {
      ctx.drawImage(img, -offset.x / scale, -offset.y / scale, containerSize / scale, containerSize / scale, 0, 0, O, O);
      mimeType = "image/jpeg";
      quality = 0.92;
    } else if (fill === "blank") {
      // Transparent PNG — empty space is truly transparent, adapts to any display context
      drawFit(fitW, fitH);
      mimeType = "image/png";
    } else if (fill === "blur" || fill === "fill") {
      // Draw cover-scaled background first
      const bgScale = Math.max(O / img.naturalWidth, O / img.naturalHeight);
      const bgW = img.naturalWidth * bgScale;
      const bgH = img.naturalHeight * bgScale;
      const bgX = (O - bgW) / 2;
      const bgY = (O - bgH) / 2;
      if (fill === "blur") {
        const bgCanvas = document.createElement("canvas");
        bgCanvas.width = O; bgCanvas.height = O;
        const bgCtx = bgCanvas.getContext("2d")!;
        bgCtx.filter = "blur(22px) saturate(1.2) brightness(0.82)";
        bgCtx.drawImage(img, bgX, bgY, bgW, bgH);
        ctx.drawImage(bgCanvas, 0, 0);
      } else {
        ctx.drawImage(img, bgX, bgY, bgW, bgH);
      }
      drawFit(fitW, fitH);
      mimeType = "image/jpeg";
      quality = 0.92;
    }

    canvas.toBlob((blob) => {
      setConfirming(false);
      if (blob) onCrop(URL.createObjectURL(blob));
    }, mimeType, quality);
  }

  return (
    <div className="crop-overlay">
      <div className="crop-topbar">
        <button type="button" className="crop-cancel-btn" onClick={onCancel}>Cancel</button>
        <span className="crop-title">Adjust Photo</span>
        <button type="button" className="crop-done-btn" onClick={handleConfirm} disabled={confirming}>
          {confirming ? "…" : "Done"}
        </button>
      </div>

      <div className="crop-stage">
        <div
          ref={containerRef}
          className="crop-frame"
          style={{ background: frameBg, cursor: mode === "crop" ? undefined : "default" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Blur / fill background layer (fit modes only) */}
          {mode !== "crop" && (fill === "blur" || fill === "fill") && naturalSize.w > 0 && (
            <img
              src={imageUrl}
              style={{
                position: "absolute",
                inset: "-12%",
                width: "124%",
                height: "124%",
                objectFit: "cover",
                filter: fill === "blur" ? "blur(18px) saturate(1.2) brightness(0.82)" : "none",
                pointerEvents: "none",
                userSelect: "none"
              }}
              draggable={false}
              alt=""
            />
          )}
          {/* Main image */}
          <img
            src={imageUrl}
            onLoad={handleImageLoad}
            style={mode === "crop" ? {
              position: "absolute",
              left: offset.x, top: offset.y,
              width: naturalSize.w * scale, height: naturalSize.h * scale,
              opacity: naturalSize.w > 0 ? 1 : 0,
              userSelect: "none", touchAction: "none", pointerEvents: "none"
            } : { ...fitStyle, opacity: naturalSize.w > 0 ? 1 : 0, userSelect: "none", pointerEvents: "none" }}
            draggable={false}
            alt=""
          />
          {mode === "crop" && <div className="crop-frame-grid" aria-hidden="true" />}
          <div className="crop-frame-corners" aria-hidden="true" />
        </div>
      </div>

      {mode === "crop" && <p className="crop-hint">Drag to reposition · 1:1</p>}

      <div className="crop-mode-bar">
        {(["crop", "fit-width", "fit-height"] as CropMode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={`crop-mode-btn${mode === m ? " is-active" : ""}`}
            onClick={() => setMode(m)}
          >
            {m === "crop" ? "Crop" : m === "fit-width" ? "Fit Width" : "Fit Height"}
          </button>
        ))}
      </div>

      {mode !== "crop" && (
        <div className="crop-fill-bar">
          <span className="crop-fill-label">Fill</span>
          {(["blank", "blur", "fill"] as CropFill[]).map((f) => (
            <button
              key={f}
              type="button"
              className={`crop-fill-btn${fill === f ? " is-active" : ""}`}
              onClick={() => setFill(f)}
            >
              {f === "blank" ? "Blank" : f === "blur" ? "Blur" : "Fill"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FinishWorkoutPage({
  draft,
  onTitleChange,
  onNoteChange,
  onBack,
  onSave,
  resolvedTheme,
  onToggleTheme,
}: {
  draft: FinishWorkoutDraft;
  onTitleChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onBack: () => void;
  onSave: (images: WorkoutMediaAsset[]) => Promise<void>;
  resolvedTheme?: string;
  onToggleTheme?: () => void;
}) {
  // V1 decision: keep photo support visible for progress/self-reference.
  // Video stays parked behind a disabled flag until we design its real
  // persistence model for social/feed use cases.
  const finishPhotosEnabled = true;
  const finishVideoEnabled = false;
  const [exercisesExpanded, setExercisesExpanded] = useState(false);
  const [rewardsExpanded, setRewardsExpanded] = useState(false);
  // Each photo stores the original src (for re-editing) and the adjusted display URL
  const [photos, setPhotos] = useState<{ name: string; src: string; display: string }[]>([]);
  const [pendingCrop, setPendingCrop] = useState<{ name: string; src: string; index: number | null } | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoConfirmed, setVideoConfirmed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trimTrackRef = useRef<HTMLDivElement | null>(null);
  const trimDragRef = useRef<{
    type: "start" | "end" | "range";
    startX: number;
    startTrimStart: number;
    startTrimEnd: number;
    duration: number;
  } | null>(null);
  const playIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      photos.forEach((p) => { URL.revokeObjectURL(p.src); URL.revokeObjectURL(p.display); });
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, []);

  useEffect(() => {
    return () => { if (playIntervalRef.current !== null) clearInterval(playIntervalRef.current); };
  }, []);

  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    setMediaError(null);
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (photos.length >= MEDIA_MAX_PHOTOS) {
      setMediaError(`Maximum ${MEDIA_MAX_PHOTOS} photos allowed.`);
      return;
    }
    if (file.size > MEDIA_MAX_PHOTO_MB * 1024 * 1024) {
      setMediaError(`Photo must be under ${MEDIA_MAX_PHOTO_MB} MB.`);
      return;
    }
    setPendingCrop({ name: file.name, src: URL.createObjectURL(file), index: null });
  }

  function openPhotoEdit(index: number) {
    setPendingCrop({ name: photos[index].name, src: photos[index].src, index });
  }

  function handleCropDone(outputUrl: string) {
    if (!pendingCrop) return;
    if (pendingCrop.index === null) {
      // New photo
      setPhotos((prev) => [...prev, { name: pendingCrop.name, src: pendingCrop.src, display: outputUrl }]);
    } else {
      // Re-edit: replace display URL only, keep original src
      setPhotos((prev) => {
        const next = [...prev];
        URL.revokeObjectURL(next[pendingCrop.index!].display);
        next[pendingCrop.index!] = { ...next[pendingCrop.index!], display: outputUrl };
        return next;
      });
    }
    setPendingCrop(null);
  }

  function handleCropCancel() {
    // If new photo (not re-edit), revoke the src we created
    if (pendingCrop?.index === null) URL.revokeObjectURL(pendingCrop.src);
    setPendingCrop(null);
  }

  function removePhoto(index: number) {
    const p = photos[index];
    URL.revokeObjectURL(p.src);
    URL.revokeObjectURL(p.display);
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setMediaError(null);
  }

  function handleVideoChange(event: React.ChangeEvent<HTMLInputElement>) {
    setMediaError(null);
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MEDIA_MAX_VIDEO_MB * 1024 * 1024) {
      setMediaError(`Video must be under ${MEDIA_MAX_VIDEO_MB} MB.`);
      event.target.value = "";
      return;
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideo(file);
    setVideoUrl(url);
    setTrimStart(0);
    setTrimEnd(0);
    setVideoDuration(0);
    event.target.value = "";
  }

  function handleVideoMetadata() {
    if (!videoRef.current) return;
    const dur = videoRef.current.duration;
    setVideoDuration(dur);
    setTrimEnd(Math.min(dur, MEDIA_MAX_VIDEO_SECONDS));
  }

  function removeVideo() {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    stopPlayback();
    setVideo(null);
    setVideoUrl(null);
    setVideoDuration(0);
    setTrimStart(0);
    setTrimEnd(0);
    setVideoConfirmed(false);
    setMediaError(null);
  }

  function stopPlayback() {
    if (playIntervalRef.current !== null) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
    if (videoRef.current) videoRef.current.pause();
    setIsPlaying(false);
  }

  function togglePlay() {
    const vid = videoRef.current;
    if (!vid || videoDuration === 0) return;
    if (isPlaying) {
      stopPlayback();
      return;
    }
    vid.currentTime = trimStart;
    vid.play().catch(() => {});
    setIsPlaying(true);
    playIntervalRef.current = window.setInterval(() => {
      if (!videoRef.current) return;
      if (videoRef.current.currentTime >= trimEnd) {
        videoRef.current.pause();
        videoRef.current.currentTime = trimStart;
        setIsPlaying(false);
        if (playIntervalRef.current !== null) clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    }, 100);
  }

  function confirmVideoTrim() {
    stopPlayback();
    setVideoConfirmed(true);
  }

  function reopenVideoTrim() {
    setVideoConfirmed(false);
  }

  function startTrimDrag(type: "start" | "end" | "range", e: React.PointerEvent) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    trimDragRef.current = {
      type,
      startX: e.clientX,
      startTrimStart: trimStart,
      startTrimEnd: trimEnd,
      duration: videoDuration
    };
  }

  function handleTrimPointerMove(e: React.PointerEvent) {
    if (isPlaying) stopPlayback();
    const drag = trimDragRef.current;
    if (!drag || !trimTrackRef.current) return;
    const trackW = trimTrackRef.current.offsetWidth;
    const dSec = ((e.clientX - drag.startX) / trackW) * drag.duration;
    const len = drag.startTrimEnd - drag.startTrimStart;

    if (drag.type === "range") {
      let s = drag.startTrimStart + dSec;
      let en = drag.startTrimEnd + dSec;
      if (s < 0) { s = 0; en = len; }
      if (en > drag.duration) { en = drag.duration; s = drag.duration - len; }
      setTrimStart(s);
      setTrimEnd(en);
    } else if (drag.type === "start") {
      // Floor: can't go below 0, and can't make range exceed 30s (start can't go more than 30s before end)
      const minStart = Math.max(0, drag.startTrimEnd - MEDIA_MAX_VIDEO_SECONDS);
      const s = Math.max(minStart, Math.min(drag.startTrimStart + dSec, drag.startTrimEnd - 1));
      setTrimStart(s);
    } else {
      const maxEnd = Math.min(drag.duration, drag.startTrimStart + MEDIA_MAX_VIDEO_SECONDS);
      const en = Math.max(drag.startTrimStart + 1, Math.min(drag.startTrimEnd + dSec, maxEnd));
      setTrimEnd(en);
    }
  }

  function stopTrimDrag() {
    trimDragRef.current = null;
  }

  const trimLength = trimEnd - trimStart;
  const needsTrim = videoDuration > MEDIA_MAX_VIDEO_SECONDS;

  async function uploadPhotoAssets(): Promise<WorkoutMediaAsset[]> {
    if (!finishPhotosEnabled || photos.length === 0) {
      return [];
    }

    const mediaConfigResponse = await fetch(`${apiBaseUrl}/v1/media/config`);
    if (!mediaConfigResponse.ok) {
      throw new Error("RepIQ could not load media settings.");
    }

    const mediaConfigJson = await mediaConfigResponse.json();
    const mediaConfig = mediaConfigSchema.parse(mediaConfigJson.constraints);

    if (!mediaConfig.image_enabled) {
      throw new Error("Image uploads are currently disabled.");
    }

    if (photos.length > mediaConfig.max_images_per_workout) {
      throw new Error(`You can upload up to ${mediaConfig.max_images_per_workout} images.`);
    }

    const uploadedAssets: WorkoutMediaAsset[] = [];

    for (const [index, photo] of photos.entries()) {
      const blobResponse = await fetch(photo.display);
      const blob = await blobResponse.blob();

      const prepareResponse = await fetch(`${apiBaseUrl}/v1/media/prepare`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "image",
          file_name: photo.name || `workout-photo-${index + 1}.jpg`,
          mime_type: blob.type || "image/jpeg",
          byte_size: blob.size,
          workout_id: draft.sessionName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "workout"
        })
      });

      if (!prepareResponse.ok) {
        throw new Error("RepIQ could not prepare an image upload.");
      }

      const preparedJson = await prepareResponse.json();
      const prepared = mediaPrepareUploadResponseSchema.parse(preparedJson);

      if (!prepared.asset.upload_url) {
        throw new Error("RepIQ did not return a valid upload target.");
      }

      const uploadResponse = await fetch(`${apiBaseUrl}${prepared.asset.upload_url}`, {
        method: "POST",
        headers: {
          "content-type": prepared.asset.mime_type
        },
        body: blob
      });

      if (!uploadResponse.ok) {
        throw new Error("RepIQ could not save one of the selected images.");
      }

      const uploadJson = await uploadResponse.json();
      uploadedAssets.push(workoutMediaAssetSchema.parse(uploadJson.asset));
    }

    return uploadedAssets;
  }

  async function handleSaveClick() {
    if (isSaving) return;
    setMediaError(null);
    setIsSaving(true);
    try {
      const uploadedImages = await uploadPhotoAssets();
      await onSave(uploadedImages);
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "RepIQ could not save this workout.");
      setIsSaving(false);
    }
  }

  return (
    <main className="detail-page finish-workout-page">
      <div className="finish-hero">
        <div className="finish-hero-topbar">
          <button
            className="finish-hero-back"
            type="button"
            onClick={onBack}
            aria-label="Back to logger"
          >
            ←
          </button>
          <span className="finish-hero-eyebrow">Workout Complete</span>
          {resolvedTheme && onToggleTheme ? (
            <button type="button" className="theme-toggle-btn theme-toggle-btn--ghost" onClick={onToggleTheme} aria-label="Toggle theme">
              {resolvedTheme === "dark" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
            </button>
          ) : (
            <span style={{ width: 32 }} aria-hidden="true" />
          )}
        </div>
        <h1 className="finish-hero-title">{draft.sessionName || "Today's Workout"}</h1>
        <p className="finish-hero-date">{formatSessionDate(draft.date)}</p>
        <div className="finish-hero-stats">
          <div className="finish-hero-stat">
            <strong>{draft.duration}</strong>
            <span>Duration</span>
          </div>
          <div className="finish-hero-stat">
            <strong>{draft.totalVolume.toFixed(0)} kg</strong>
            <span>Volume</span>
          </div>
          <div className="finish-hero-stat">
            <strong>{draft.totalSets}</strong>
            <span>Sets</span>
          </div>
          <div className="finish-hero-stat">
            <strong>{draft.loggedExerciseCount}</strong>
            <span>Exercises</span>
          </div>
        </div>
      </div>

      <section className="detail-section finish-workout-section">
        {draft.rewardSummary.total > 0 && (
          <section className="finish-workout-card finish-rewards-card">
            <button
              type="button"
              className="finish-rewards-toggle"
              onClick={() => setRewardsExpanded((v) => !v)}
              aria-expanded={rewardsExpanded}
            >
              <div className="finish-rewards-toggle-left">
                <p className="label" style={{ margin: 0 }}>Rewards</p>
                <div className="reward-sheet-summary finish-workout-reward-summary">
                  {draft.rewardSummary.exercise > 0 && (
                    <span className="reward-summary-chip reward-summary-chip-exercise">
                      {rewardLevelIcon.exercise} {draft.rewardSummary.exercise}
                    </span>
                  )}
                  {draft.rewardSummary.set > 0 && (
                    <span className="reward-summary-chip reward-summary-chip-set">
                      {rewardLevelIcon.set} {draft.rewardSummary.set}
                    </span>
                  )}
                  {draft.rewardSummary.session > 0 && (
                    <span className="reward-summary-chip reward-summary-chip-session">
                      {rewardLevelIcon.session} {draft.rewardSummary.session}
                    </span>
                  )}
                </div>
              </div>
              <span className={`finish-rewards-chevron${rewardsExpanded ? " is-open" : ""}`} aria-hidden="true">›</span>
            </button>
            {rewardsExpanded && (
              <div className="reward-sheet-list finish-workout-reward-list">
                {draft.rewards.map((reward) => (
                  <article key={reward.id} className="reward-sheet-item">
                    <div className={`reward-sheet-icon reward-sheet-icon-${reward.level}`} aria-hidden="true">
                      {rewardLevelIcon[reward.level]}
                    </div>
                    <div>
                      <strong>{reward.shortLabel}</strong>
                      <p>{reward.detail}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="finish-workout-card finish-takeaway-card">
          <p className="label">RepIQ Takeaway</p>
          <h3 className="finish-workout-takeaway-title">{draft.takeawayTitle}</h3>
          <p className="settings-note finish-workout-takeaway-body">{draft.takeawayBody}</p>
        </section>

        <section className="finish-workout-card">
          <p className="label">Save Details</p>
          <label className="finish-title-row">
            <span className="finish-title-label">Workout title</span>
            <input
              className="finish-title-input"
              type="text"
              value={draft.sessionName}
              onChange={(event) => onTitleChange(event.target.value)}
            />
          </label>
          {(finishPhotosEnabled || finishVideoEnabled) && (
            <div className="finish-media-strip">
              <div className="finish-media-btns">
                {finishPhotosEnabled && (
                  <button
                    type="button"
                    className={`finish-media-add-btn${photos.length >= MEDIA_MAX_PHOTOS ? " is-maxed" : ""}`}
                    onClick={() => photos.length < MEDIA_MAX_PHOTOS && photoInputRef.current?.click()}
                    aria-disabled={photos.length >= MEDIA_MAX_PHOTOS}
                  >
                    📷 Photo
                    <span className="finish-media-count">{photos.length}/{MEDIA_MAX_PHOTOS}</span>
                  </button>
                )}
                {finishVideoEnabled && (
                  <button
                    type="button"
                    className={`finish-media-add-btn${video ? " is-maxed" : ""}`}
                    onClick={() => !video && videoInputRef.current?.click()}
                    aria-disabled={!!video}
                  >
                    🎬 Video
                    <span className="finish-media-count">{video ? "1/1" : "0/1"}</span>
                  </button>
                )}
              </div>
              {finishPhotosEnabled && (
                <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={handlePhotoChange} />
              )}
              {finishVideoEnabled && (
                <input ref={videoInputRef} type="file" accept="video/*" hidden onChange={handleVideoChange} />
              )}

              {mediaError && <p className="finish-media-error">{mediaError}</p>}

              {finishPhotosEnabled && photos.length > 0 && (
                <div className="finish-media-previews">
                  {photos.map((photo, index) => (
                    <div key={index} className="finish-media-thumb" onClick={() => openPhotoEdit(index)} role="button" aria-label="Edit photo">
                      <img src={photo.display} alt="" />
                      <div className="finish-media-edit-badge" aria-hidden="true">✎</div>
                      <button type="button" className="finish-media-remove" onClick={(e) => { e.stopPropagation(); removePhoto(index); }} aria-label="Remove photo">×</button>
                    </div>
                  ))}
                </div>
              )}

              {finishVideoEnabled && video && videoUrl && (
                <div className="finish-video-trimmer">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    className="finish-video-preview"
                    onLoadedMetadata={handleVideoMetadata}
                    controls={false}
                    muted
                    playsInline
                  />
                  {videoConfirmed ? (
                    <div className="finish-video-confirmed-row">
                      <div className="finish-video-confirmed-info">
                        <span className="finish-video-confirmed-icon">🎬</span>
                        <div>
                          <span className="finish-video-confirmed-name">{video.name}</span>
                          <span className="finish-video-confirmed-range">
                            {formatTrimTime(trimStart)}–{formatTrimTime(trimEnd)} ({formatTrimTime(trimLength)})
                          </span>
                        </div>
                      </div>
                      <div className="finish-video-confirmed-actions">
                        <button type="button" className="finish-video-edit-btn" onClick={reopenVideoTrim}>✎ Edit</button>
                        <button type="button" className="finish-video-remove" onClick={removeVideo}>✕</button>
                      </div>
                    </div>
                  ) : (
                    videoDuration > 0 && (
                      <>
                        <div className="finish-video-header">
                          <span className="finish-video-name">{video.name}</span>
                          <button type="button" className="finish-video-remove" onClick={removeVideo}>Remove</button>
                        </div>
                        {needsTrim && (
                          <p className="finish-trim-notice">Video is {formatTrimTime(videoDuration)} — trim to 30s max</p>
                        )}
                        <div className="finish-trim-wrapper">
                          <div
                            ref={trimTrackRef}
                            className="finish-trim-track"
                            onPointerMove={handleTrimPointerMove}
                            onPointerUp={stopTrimDrag}
                            onPointerCancel={stopTrimDrag}
                          >
                            <div
                              className="finish-trim-fill"
                              style={{
                                left: `${(trimStart / videoDuration) * 100}%`,
                                width: `${((trimEnd - trimStart) / videoDuration) * 100}%`
                              }}
                              onPointerDown={(e) => startTrimDrag("range", e)}
                            />
                            <div
                              className="finish-trim-handle"
                              style={{ left: `${(trimStart / videoDuration) * 100}%` }}
                              onPointerDown={(e) => { e.stopPropagation(); startTrimDrag("start", e); }}
                            />
                            <div
                              className="finish-trim-handle"
                              style={{ left: `${(trimEnd / videoDuration) * 100}%` }}
                              onPointerDown={(e) => { e.stopPropagation(); startTrimDrag("end", e); }}
                            />
                          </div>
                          <div className="finish-trim-labels">
                            <span>{formatTrimTime(trimStart)}</span>
                            <span className="finish-trim-length">{formatTrimTime(trimLength)} selected</span>
                            <span>{formatTrimTime(trimEnd)}</span>
                          </div>
                        </div>
                        <div className="finish-trim-actions">
                          <button
                            type="button"
                            className={`finish-trim-play-btn${isPlaying ? " is-playing" : ""}`}
                            onClick={togglePlay}
                            aria-label={isPlaying ? "Pause preview" : "Play trim preview"}
                          >
                            {isPlaying ? "⏸" : "▶"}
                          </button>
                          <button
                            type="button"
                            className="finish-trim-confirm-fab"
                            onClick={confirmVideoTrim}
                            aria-label="Confirm trim and add to tray"
                          >
                            ✓
                          </button>
                        </div>
                      </>
                    )
                  )}
                </div>
              )}
            </div>
          )}
          <textarea
            className="notes-textarea finish-workout-notes"
            placeholder="Add a note about this workout"
            value={draft.note}
            onChange={(event) => onNoteChange(event.target.value)}
          />
          <p className="settings-note">
            {formatSessionDate(draft.date)} • {draft.loggedExerciseCount} logged{" "}
            {draft.loggedExerciseCount === 1 ? "exercise" : "exercises"}
          </p>
        </section>

        <section className="finish-workout-card">
          <button
            type="button"
            className="finish-exercises-toggle"
            onClick={() => setExercisesExpanded((e) => !e)}
          >
            <p className="label">Logged Exercises</p>
            <span className="finish-exercises-toggle-meta">
              {draft.loggedExerciseCount}{" "}
              {draft.loggedExerciseCount === 1 ? "exercise" : "exercises"}
              <span className="finish-exercises-chevron">{exercisesExpanded ? "⌄" : "›"}</span>
            </span>
          </button>
          {exercisesExpanded && (
            <div className="finish-workout-exercise-list">
              {draft.exercises.length === 0 ? (
                <p className="settings-note">No completed exercise data is ready to save yet.</p>
              ) : (
                draft.exercises.map((exercise) => (
                  <article key={exercise.id} className="finish-workout-exercise-item">
                    <div>
                      <strong>{exercise.name}</strong>
                      <p>
                        {exercise.loggedSets} logged {exercise.loggedSets === 1 ? "set" : "sets"}
                      </p>
                    </div>
                    <span>{exercise.loggedVolume.toFixed(0)} kg</span>
                  </article>
                ))
              )}
            </div>
          )}
        </section>

        {draft.ignoredIncompleteSets > 0 && (
          <section className="finish-workout-card finish-workout-note-card">
            <p className="label">Incomplete Rows</p>
            <p className="settings-note finish-workout-note-text">
              {draft.ignoredIncompleteSets} unfinished{" "}
              {draft.ignoredIncompleteSets === 1 ? "set was" : "sets were"} not included in this saved workout.
            </p>
          </section>
        )}

        <div className="finish-workout-actions">
          <button className="primary-button logger-finish-button" type="button" onClick={() => void handleSaveClick()} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Workout"}
          </button>
          <button className="finish-back-link" type="button" onClick={onBack}>
            ← Back to Logger
          </button>
        </div>
      </section>

      {finishPhotosEnabled && pendingCrop && (
        <CropTool
          imageUrl={pendingCrop.src}
          onCrop={handleCropDone}
          onCancel={handleCropCancel}
        />
      )}
    </main>
  );
}

// ── Canonical primary-muscle groups ──────────────────────────────────────────
const CANONICAL_MUSCLE_ORDER = [
  "Chest", "Back", "Shoulders", "Core",
  "Biceps", "Triceps", "Quads", "Hamstrings", "Glutes", "Calves", "Other",
] as const;

type CanonicalMuscle = typeof CANONICAL_MUSCLE_ORDER[number];

const MUSCLE_TO_CANONICAL: Record<string, CanonicalMuscle> = {
  // Chest
  "Chest": "Chest", "Upper Chest": "Chest", "Lower Chest": "Chest",
  // Back
  "Back": "Back", "Lats": "Back", "Upper Back": "Back",
  "Lower Back": "Back", "Middle Back": "Back", "Traps": "Back",
  // Shoulders
  "Shoulders": "Shoulders", "Shoulder": "Shoulders",
  "Front Delts": "Shoulders", "Front Shoulders": "Shoulders",
  "Side Delts": "Shoulders", "Rear Delts": "Shoulders",
  "Rotator Cuff": "Shoulders",
  // Core
  "Core": "Core", "Abs": "Core", "Abs / Core": "Core",
  "Obliques": "Core", "Hip Flexors": "Core",
  // Biceps
  "Biceps": "Biceps", "Forearms": "Biceps", "Brachialis": "Biceps",
  // Triceps
  "Triceps": "Triceps",
  // Quads
  "Quads": "Quads", "Quadriceps": "Quads",
  // Hamstrings
  "Hamstrings": "Hamstrings", "Hamstring": "Hamstrings",
  // Glutes
  "Glutes": "Glutes", "Glutes / Hips": "Glutes",
  "Adductors": "Glutes", "Abductors": "Glutes", "Inner Thigh": "Glutes",
  // Calves
  "Calves": "Calves", "Calves / Shins": "Calves",
};

function getCanonicalMuscle(primaryMuscle: string): CanonicalMuscle {
  return MUSCLE_TO_CANONICAL[primaryMuscle] ?? "Other";
}

// ── RepIQ Plan — rules engine (V1) ───────────────────────────────────────────
const PLAN_GOAL_LABEL: Record<string, string> = {
  build_muscle: "Muscle Building", get_stronger: "Strength",
  improve_fitness: "Fitness", athletic_performance: "Performance",
  stay_active: "Active Lifestyle", muscle_strength: "Muscle & Strength",
  fat_loss: "Fat Loss", endurance: "Endurance", general_fitness: "General Fitness",
};

const SPLIT_LABEL: Record<SplitType, string> = {
  full_body:   "Full Body",
  upper_lower: "Upper / Lower",
  ppl:         "Push · Pull · Legs",
  body_part:   "Body Part Split",
};

function pickSplitType(
  days: number,
  exp: ExperienceLevel,
  stylePref?: string | null,
): SplitType {
  if (days <= 2) return "full_body";
  if (days === 3) return (exp === "beginner" || exp === "never") ? "full_body" : "ppl";
  if (days === 4) return "upper_lower";
  if (days <= 6) return (exp === "beginner") ? "ppl" : "body_part";
  return "body_part"; // 7 days
}

function getMesocycleLength(exp: ExperienceLevel): 4 | 6 | 8 {
  if (exp === "never" || exp === "beginner") return 4;
  if (exp === "intermediate") return 6;
  return 8;
}

function getPlanSetRepScheme(goal: TrainingGoal): { sets: number; reps: string; restSeconds: number } {
  switch (goal) {
    case "get_stronger":          return { sets: 4, reps: "3–5",  restSeconds: 180 };
    case "build_muscle":
    case "muscle_strength":       return { sets: 3, reps: "8–12", restSeconds: 90 };
    case "fat_loss":
    case "improve_fitness":
    case "general_fitness":       return { sets: 3, reps: "12–15",restSeconds: 60 };
    case "endurance":             return { sets: 2, reps: "15–20",restSeconds: 45 };
    case "athletic_performance":  return { sets: 4, reps: "5–8",  restSeconds: 120 };
    default:                      return { sets: 3, reps: "10–12",restSeconds: 90 };
  }
}

type PlanExerciseSlot = { patterns: MovementPattern[]; primaryMuscle?: string };
type PlanDayTemplate = { label: string; focus: string; slots: PlanExerciseSlot[] };

function buildDayTemplates(split: SplitType, days: number): PlanDayTemplate[] {
  const fullBody: PlanDayTemplate = {
    label: "Full Body", focus: "Full Body",
    slots: [
      { patterns: ["squat", "hip_hinge"],            primaryMuscle: "Quads" },
      { patterns: ["horizontal_push"],                primaryMuscle: "Chest" },
      { patterns: ["vertical_pull","horizontal_pull"],primaryMuscle: "Back" },
      { patterns: ["vertical_push"],                  primaryMuscle: "Shoulders" },
      { patterns: ["isolation_pull"],                 primaryMuscle: "Biceps" },
      { patterns: ["isolation_push"],                 primaryMuscle: "Triceps" },
    ],
  };
  const push: PlanDayTemplate = {
    label: "Push", focus: "Chest · Shoulders · Triceps",
    slots: [
      { patterns: ["horizontal_push"], primaryMuscle: "Chest" },
      { patterns: ["vertical_push"],   primaryMuscle: "Shoulders" },
      { patterns: ["horizontal_push"], primaryMuscle: "Chest" },
      { patterns: ["isolation_push"],  primaryMuscle: "Triceps" },
      { patterns: ["isolation_push"],  primaryMuscle: "Triceps" },
    ],
  };
  const pull: PlanDayTemplate = {
    label: "Pull", focus: "Back · Biceps",
    slots: [
      { patterns: ["vertical_pull"],   primaryMuscle: "Lats" },
      { patterns: ["horizontal_pull"], primaryMuscle: "Upper Back" },
      { patterns: ["vertical_pull"],   primaryMuscle: "Lats" },
      { patterns: ["isolation_pull"],  primaryMuscle: "Biceps" },
      { patterns: ["isolation_pull"],  primaryMuscle: "Biceps" },
    ],
  };
  const legs: PlanDayTemplate = {
    label: "Legs", focus: "Quads · Hamstrings · Glutes",
    slots: [
      { patterns: ["squat"],          primaryMuscle: "Quads" },
      { patterns: ["hip_hinge"],      primaryMuscle: "Hamstrings" },
      { patterns: ["squat"],          primaryMuscle: "Quads" },
      { patterns: ["hip_hinge"],      primaryMuscle: "Glutes" },
      { patterns: ["isolation_legs"] },
    ],
  };
  const upper: PlanDayTemplate = {
    label: "Upper", focus: "Upper Body",
    slots: [
      { patterns: ["horizontal_push"], primaryMuscle: "Chest" },
      { patterns: ["vertical_pull"],   primaryMuscle: "Back" },
      { patterns: ["vertical_push"],   primaryMuscle: "Shoulders" },
      { patterns: ["horizontal_pull"], primaryMuscle: "Upper Back" },
      { patterns: ["isolation_pull"],  primaryMuscle: "Biceps" },
      { patterns: ["isolation_push"],  primaryMuscle: "Triceps" },
    ],
  };
  const lower: PlanDayTemplate = {
    label: "Lower", focus: "Lower Body",
    slots: [
      { patterns: ["squat"],          primaryMuscle: "Quads" },
      { patterns: ["hip_hinge"],      primaryMuscle: "Hamstrings" },
      { patterns: ["squat"],          primaryMuscle: "Quads" },
      { patterns: ["hip_hinge"],      primaryMuscle: "Glutes" },
      { patterns: ["isolation_legs"] },
    ],
  };

  if (split === "full_body") {
    return Array(days).fill(null).map((_, i) => ({ ...fullBody, label: `Day ${i + 1}` }));
  }
  if (split === "upper_lower") {
    const pattern = [upper, lower, upper, lower, upper, lower];
    return pattern.slice(0, days);
  }
  if (split === "ppl") {
    const pattern = [push, pull, legs, push, pull, legs];
    return pattern.slice(0, days);
  }
  // body_part: chest/back/shoulders/arms/legs
  const bodyPart: PlanDayTemplate[] = [
    { label: "Chest", focus: "Chest · Triceps", slots: [
      { patterns: ["horizontal_push"], primaryMuscle: "Chest" },
      { patterns: ["horizontal_push"], primaryMuscle: "Upper Chest" },
      { patterns: ["isolation_push"],  primaryMuscle: "Triceps" },
      { patterns: ["isolation_push"] },
    ]},
    { label: "Back", focus: "Back · Biceps", slots: [
      { patterns: ["vertical_pull"],   primaryMuscle: "Lats" },
      { patterns: ["horizontal_pull"], primaryMuscle: "Upper Back" },
      { patterns: ["vertical_pull"],   primaryMuscle: "Lats" },
      { patterns: ["isolation_pull"],  primaryMuscle: "Biceps" },
    ]},
    { label: "Shoulders", focus: "Shoulders · Traps", slots: [
      { patterns: ["vertical_push"],   primaryMuscle: "Shoulders" },
      { patterns: ["vertical_push"] },
      { patterns: ["isolation_push"] },
      { patterns: ["isolation_pull"] },
    ]},
    { label: "Arms", focus: "Biceps · Triceps", slots: [
      { patterns: ["isolation_pull"],  primaryMuscle: "Biceps" },
      { patterns: ["isolation_push"],  primaryMuscle: "Triceps" },
      { patterns: ["isolation_pull"] },
      { patterns: ["isolation_push"] },
    ]},
    { label: "Legs", focus: "Quads · Hamstrings · Glutes", slots: [
      { patterns: ["squat"],     primaryMuscle: "Quads" },
      { patterns: ["hip_hinge"], primaryMuscle: "Hamstrings" },
      { patterns: ["squat"] },
      { patterns: ["hip_hinge"], primaryMuscle: "Glutes" },
    ]},
  ];
  return bodyPart.slice(0, days);
}

function pickPlanExercise(
  catalog: typeof smartReplaceCatalog,
  slot: PlanExerciseSlot,
  exp: ExperienceLevel,
  used: Set<string>,
): string | null {
  const allowedDifficulty: Record<ExperienceLevel, ExerciseDifficulty[]> = {
    never:        ["beginner"],
    beginner:     ["beginner", "intermediate"],
    intermediate: ["beginner", "intermediate", "advanced"],
    advanced:     ["intermediate", "advanced"],
    veteran:      ["intermediate", "advanced"],
  };
  const allowed = allowedDifficulty[exp] ?? ["beginner", "intermediate"];

  let candidates = catalog.filter((ex) =>
    slot.patterns.some((p) => ex.movementPattern === p) &&
    (ex.difficultyLevel == null || allowed.includes(ex.difficultyLevel as ExerciseDifficulty)) &&
    !used.has(ex.id)
  );

  if (slot.primaryMuscle) {
    const preferred = candidates.filter((ex) => ex.primaryMuscle === slot.primaryMuscle);
    if (preferred.length > 0) candidates = preferred;
  }

  if (candidates.length === 0) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  used.add(pick.id);
  return pick.id;
}

function generateRepIQPlan(profile: UserPsychProfile): RepIQPlan {
  const goal: TrainingGoal = profile.primaryGoal ?? "improve_fitness";
  const exp: ExperienceLevel = profile.experienceLevel ?? "beginner";
  const days = profile.daysPerWeekPref ?? 3;
  const sessionLen = profile.sessionLengthPref ?? 45;

  const splitType = pickSplitType(days, exp, profile.workoutStylePref);
  const mesoWeeks = profile.planLengthWeeksPref ?? 12;
  const scheme = getPlanSetRepScheme(goal);
  const dayTemplates = buildDayTemplates(splitType, days);

  const used = new Set<string>();
  const weeks: RepIQPlanWeek[] = Array(mesoWeeks).fill(null).map((_, weekIdx) => ({
    weekNumber: weekIdx + 1,
    isCompleted: false,
    days: dayTemplates.map((tmpl) => ({
      sessionLabel: tmpl.label,
      focus: tmpl.focus,
      completedAt: null,
      exercises: tmpl.slots
        .map((slot) => {
          const exerciseId = pickPlanExercise(smartReplaceCatalog, slot, exp, used);
          if (!exerciseId) return null;
          return {
            exerciseId,
            sets: scheme.sets,
            reps: scheme.reps,
            restSeconds: scheme.restSeconds,
          } satisfies RepIQPlanExercise;
        })
        .filter((e): e is RepIQPlanExercise => e !== null),
    })),
  }));

  const splitNames: Record<SplitType, string> = {
    full_body:   "Full Body",
    upper_lower: "Upper / Lower",
    ppl:         "Push · Pull · Legs",
    body_part:   "Body Part",
  };
  const goalLabel = PLAN_GOAL_LABEL[goal] ?? "Training";
  const planName = `${goalLabel} — ${splitNames[splitType]}`;

  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: `plan-${Date.now()}`,
    generatedAt: now,
    startDate: now.slice(0, 10),
    lastRegeneratedAt: now,
    planName,
    goal,
    secondaryGoal: profile.secondaryGoal ?? null,
    experienceLevel: exp,
    daysPerWeek: days,
    sessionLengthMin: sessionLen,
    splitType,
    mesocycleLengthWeeks: mesoWeeks,
    currentWeekIndex: 0,
    weeks,
  };
}

// ── Volume compensation — called after RepIQ session completes ───────────────
function computeVolumeCompensation(
  plan: RepIQPlan,
  completedWeekIdx: number,
  completedDayIdx: number,
  sessionExercises: ExerciseDraft[],
  exerciseTemplates: ExerciseDraft[]
): RepIQPlan {
  const planDay = plan.weeks[completedWeekIdx]?.days[completedDayIdx];
  if (!planDay) return plan;

  // Compute deficit per primary muscle — cap individual exercise deficit at +2 sets
  const muscleDeficits = new Map<string, number>();
  for (const pe of planDay.exercises) {
    const loggedEx = sessionExercises.find((e) => e.id === pe.exerciseId);
    const actualDone = loggedEx ? loggedEx.draftSets.filter((s) => s.done).length : 0;
    const deficit = pe.sets - actualDone;
    if (deficit > 0) {
      const template = exerciseTemplates.find((e) => e.id === pe.exerciseId);
      if (template?.primaryMuscle) {
        const existing = muscleDeficits.get(template.primaryMuscle) ?? 0;
        muscleDeficits.set(template.primaryMuscle, existing + Math.min(deficit, 2));
      }
    }
  }
  if (muscleDeficits.size === 0) return plan;

  // Apply deficit to the first future session targeting each deficient muscle (once per muscle)
  const remaining = new Map(muscleDeficits);
  const updatedWeeks = plan.weeks.map((week, wi) => ({
    ...week,
    days: week.days.map((day, di) => {
      if (wi < completedWeekIdx) return day;
      if (wi === completedWeekIdx && di <= completedDayIdx) return day;
      if (day.completedAt) return day;
      let changed = false;
      const updatedExercises = day.exercises.map((pe) => {
        const template = exerciseTemplates.find((e) => e.id === pe.exerciseId);
        if (!template?.primaryMuscle) return pe;
        const deficit = remaining.get(template.primaryMuscle);
        if (!deficit || deficit <= 0) return pe;
        remaining.set(template.primaryMuscle, 0);
        changed = true;
        return { ...pe, sets: pe.sets + deficit };
      });
      return changed ? { ...day, exercises: updatedExercises } : day;
    }),
  }));
  return { ...plan, weeks: updatedWeeks };
}

// ── Plan Reveal — shown after onboarding completes ────────────────────────────
function PlanRevealPage({
  plan,
  profile,
  resolvedTheme,
  onStart,
  onBuildOwn,
}: {
  plan: RepIQPlan;
  profile: UserPsychProfile;
  resolvedTheme: string;
  onStart: () => void;
  onBuildOwn: () => void;
}) {
  const firstName = profile.name?.split(" ")[0] ?? null;
  const week1 = plan.weeks[0];

  return (
    <div data-theme={resolvedTheme} className="pr-shell">
      <div className="pr-hero">
        <div className="pr-badge">✦ RepIQ Plan</div>
        <h1 className="pr-title">
          {firstName ? `${firstName}, your\nplan is ready.` : "Your plan\nis ready."}
        </h1>
        <p className="pr-sub">
          Built around your goal, schedule, and experience. Adjust any session as you train.
        </p>
        <div className="pr-meta-row">
          <span className="pr-meta-chip">{PLAN_GOAL_LABEL[plan.goal] ?? plan.goal}</span>
          <span className="pr-meta-chip">{SPLIT_LABEL[plan.splitType]}</span>
          <span className="pr-meta-chip">{plan.daysPerWeek}×/week</span>
          <span className="pr-meta-chip">{plan.mesocycleLengthWeeks} weeks</span>
        </div>
      </div>

      <div className="pr-body">
        {profile.isReturningAfterBreak && (
          <div className="pr-return-banner">
            <span>🔄</span>
            <p>We'll ease you back in — week 1 starts lighter to protect your joints.</p>
          </div>
        )}

        {week1 && (
          <div className="pr-week1-section">
            <p className="pr-section-label">Week 1 — your first sessions</p>
            <div className="pr-day-list">
              {week1.days.map((day, i) => (
                <div key={i} className="pr-day-row">
                  <span className="pr-day-num">S{i + 1}</span>
                  <div className="pr-day-info">
                    <p className="pr-day-name">{day.sessionLabel}</p>
                    <p className="pr-day-focus">{day.focus}</p>
                  </div>
                  <span className="pr-day-sets">{day.exercises.length} exercises</span>
                </div>
              ))}
            </div>
            {plan.mesocycleLengthWeeks > 1 && (
              <p className="pr-unlock-note">
                Weeks 2–{plan.mesocycleLengthWeeks} unlock as you finish each week.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="pr-footer">
        <button type="button" className="pr-cta-primary" onClick={onStart}>
          Let's go →
        </button>
        <button type="button" className="pr-cta-secondary" onClick={onBuildOwn}>
          Build my own plan instead
        </button>
      </div>
    </div>
  );
}

// ── Internal dev navigation page (URL param: ?dev) ───────────────────────────
function DevLandingPage({
  resolvedTheme,
  onToggleTheme,
  onGoTo,
  onResetOnboarding,
  onShowPostOnboarding,
  onSeedHistoryData,
  onClearHistoryData,
}: {
  resolvedTheme: string;
  onToggleTheme: () => void;
  onGoTo: (view: AppView) => void;
  onResetOnboarding: () => void;
  onShowPostOnboarding: () => void;
  onSeedHistoryData: () => void;
  onClearHistoryData: () => void;
}) {
  const views: { view: AppView; label: string; emoji: string }[] = [
    { view: "home",         label: "Home",          emoji: "🏠" },
    { view: "planner",      label: "Planner",        emoji: "📋" },
    { view: "insights",     label: "Insights",       emoji: "📊" },
    { view: "profile",      label: "Profile",        emoji: "👤" },
    { view: "report",       label: "Workout Report", emoji: "📄" },
    { view: "plan-builder", label: "Plan Builder",   emoji: "🏗️" },
  ];

  return (
    <div data-theme={resolvedTheme} className="dev-shell">
      <header className="dev-header">
        <div className="dev-badge">DEV</div>
        <h1 className="dev-title">Internal Navigator</h1>
        <button type="button" className="dev-theme-btn" onClick={onToggleTheme} aria-label="Toggle theme">
          {resolvedTheme === "dark"
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          }
        </button>
      </header>

      <div className="dev-body">
        <section className="dev-section">
          <p className="dev-section-title">App Views</p>
          <div className="dev-grid">
            {views.map(({ view, label, emoji }) => (
              <button key={view} type="button" className="dev-btn" onClick={() => onGoTo(view)}>
                <span className="dev-btn-icon">{emoji}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="dev-section">
          <p className="dev-section-title">Onboarding</p>
          <div className="dev-grid">
            <button type="button" className="dev-btn dev-btn-accent" onClick={onShowPostOnboarding}>
              <span className="dev-btn-icon">🎉</span>
              <span>Post-Onboarding Screen</span>
            </button>
            <button type="button" className="dev-btn dev-btn-warn" onClick={onResetOnboarding}>
              <span className="dev-btn-icon">🔄</span>
              <span>Reset &amp; Re-run Onboarding</span>
            </button>
          </div>
        </section>

        <section className="dev-section">
          <p className="dev-section-title">Test Data</p>
          <div className="dev-grid">
            <button type="button" className="dev-btn dev-btn-accent" onClick={onSeedHistoryData}>
              <span className="dev-btn-icon">🌱</span>
              <span>Seed History Workout</span>
            </button>
            <button type="button" className="dev-btn dev-btn-warn" onClick={onClearHistoryData}>
              <span className="dev-btn-icon">🗑️</span>
              <span>Clear History + Plan</span>
            </button>
          </div>
        </section>

        <p className="dev-hint">Remove <code>?dev</code> from the URL to exit this page.</p>
      </div>
    </div>
  );
}

// ── Onboarding flow (first-launch, 5 steps) ───────────────────────────────────
function OnboardingPage({
  onComplete,
  resolvedTheme,
  onToggleTheme,
}: {
  onComplete: (profile: Partial<UserPsychProfile>) => void;
  resolvedTheme: string;
  onToggleTheme: () => void;
}) {
  const TOTAL = 5;
  const STEP_LABELS = ["You", "Body", "Goal", "Experience", "Mindset"];

  const [step, setStep] = useState(1);

  // Step 1 — You
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other" | null>(null);

  // Step 2 — Body
  const [unitSystem, setUnitSystem] = useState<"metric" | "imperial">("metric");
  const [heightCm, setHeightCm] = useState(170);
  const [heightFt, setHeightFt] = useState(5);
  const [heightIn, setHeightIn] = useState(8);
  const [weightKg, setWeightKg] = useState(75);
  const [weightLbs, setWeightLbs] = useState(165);
  const [age, setAge] = useState(25);
  const [bodyFatBracket, setBodyFatBracket] = useState<string | null>(null);

  // Step 3 — Goal
  const [goal, setGoal] = useState<TrainingGoal | null>(null);
  const [secondaryGoal, setSecondaryGoal] = useState<TrainingGoal | null>(null);
  const [biggestObstacles, setBiggestObstacles] = useState<string[]>([]);

  // Step 4 — Experience & Plan
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);
  const [isReturning, setIsReturning] = useState(false);
  const [breakMonths, setBreakMonths] = useState(3);
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [sessionLength, setSessionLength] = useState<number>(60);
  const [bestTime, setBestTime] = useState<string | null>(null);

  // Step 5 — Mindset
  const [preWorkoutFeeling, setPreWorkoutFeeling] = useState<string | null>(null);
  const [workoutStyle, setWorkoutStyle] = useState<string | null>(null);
  const [successVision, setSuccessVision] = useState<string | null>(null);
  const [optionalOpen, setOptionalOpen] = useState(false);
  const optionalSectionRef = useRef<HTMLDivElement | null>(null);

  const [maxStep, setMaxStep] = useState(1);

  const canAdvance =
    step === 1 ? true :
    step === 3 ? goal !== null :
    step === 4 ? experience !== null :
    true;

  function advance() {
    if (step < TOTAL) {
      const next = step + 1;
      setMaxStep((m) => Math.max(m, next));
      setStep(next);
      return;
    }
    const finalHeightCm = unitSystem === "metric" ? heightCm : Math.round(heightFt * 30.48 + heightIn * 2.54);
    const finalWeightKg = unitSystem === "metric" ? weightKg : Math.round(weightLbs * 0.4536);
    onComplete({
      name: name.trim() || null,
      gender,
      unitSystem,
      heightCm: finalHeightCm,
      weightKg: finalWeightKg,
      age,
      bodyFatBracket,
      primaryGoal: goal,
      secondaryGoal,
      biggestObstacles,
      experienceLevel: experience,
      scheduleCommitment: (Math.max(2, Math.min(6, daysPerWeek))) as ScheduleCommitment,
      daysPerWeekPref: daysPerWeek,
      sessionLengthPref: sessionLength,
      bestTimePref: bestTime,
      workoutStylePref: workoutStyle,
      preWorkoutFeeling,
      isReturningAfterBreak: isReturning,
      breakMonths: isReturning ? breakMonths : null,
      successVision,
    });
  }

  const bfBrackets = (gender === "female")
    ? [
        { id: "very_lean_f", label: "Very Lean", range: "< 18%", desc: "Highly defined", color: "#3b82f6" },
        { id: "athletic_f", label: "Athletic", range: "18–22%", desc: "Lean & toned", color: "#22c55e" },
        { id: "fit_f", label: "Fit", range: "23–27%", desc: "Healthy shape", color: "#06b6d4" },
        { id: "average_f", label: "Average", range: "28–33%", desc: "Typical range", color: "#eab308" },
        { id: "higher_f", label: "Higher", range: "34%+", desc: "Room to go", color: "#f97316" },
      ]
    : [
        { id: "very_lean_m", label: "Very Lean", range: "< 10%", desc: "Abs clearly visible", color: "#3b82f6" },
        { id: "athletic_m", label: "Athletic", range: "10–15%", desc: "Lean & defined", color: "#22c55e" },
        { id: "fit_m", label: "Fit", range: "16–20%", desc: "Good shape", color: "#06b6d4" },
        { id: "average_m", label: "Average", range: "21–25%", desc: "Typical range", color: "#eab308" },
        { id: "higher_m", label: "Higher", range: "26%+", desc: "Room to go", color: "#f97316" },
      ];

  const trustMessages: Record<number, { icon: string; headline: string; body: string }> = {
    2: { icon: "📏", headline: "Your body is the baseline", body: "These numbers help RepIQ set realistic starting loads and track what genuinely changes — not just the scale." },
    3: { icon: "🎯", headline: "Goals without a plan are just wishes", body: "Knowing where you want to go — and what stands in your way — lets RepIQ build a path that fits your reality." },
    4: { icon: "📈", headline: "Where you've been shapes what's next", body: "Your history and schedule are the two biggest predictors of consistency. We take both seriously." },
    5: { icon: "🧠", headline: "Training is 80% mental", body: "These questions help RepIQ read your patterns — so when motivation dips, the app already knows how to adapt." },
  };

  function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
      <button type="button" className={`ob-chip ${active ? "is-active" : ""}`} onClick={onClick}>
        <span className="ob-chip-check" style={{ visibility: active ? "visible" : "hidden" }}>✓</span>
        {label}
      </button>
    );
  }

  function Stepper({ value, onChange, min, max, unit }: { value: number; onChange: (v: number) => void; min: number; max: number; unit?: string }) {
    return (
      <div className="ob-stepper">
        <button type="button" className="ob-stepper-btn" onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <div className="ob-stepper-val">
          <span className="ob-stepper-num">{value}</span>
          {unit && <span className="ob-stepper-unit">{unit}</span>}
        </div>
        <button type="button" className="ob-stepper-btn" onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </div>
    );
  }

  function UnitToggle({ value, onChange }: { value: "metric" | "imperial"; onChange: (v: "metric" | "imperial") => void }) {
    return (
      <div className="ob-unit-toggle">
        <button type="button" className={`ob-unit-btn ${value === "metric" ? "is-active" : ""}`} onClick={() => onChange("metric")}>Metric</button>
        <button type="button" className={`ob-unit-btn ${value === "imperial" ? "is-active" : ""}`} onClick={() => onChange("imperial")}>Imperial</button>
      </div>
    );
  }

  const stepContent: Record<number, ReactNode> = {
    1: (
      <div className="ob-step ob-step-welcome" key="step-1">
        <div className="ob-welcome-hero">
          <div className="ob-welcome-wordmark">RepIQ</div>
          <h1 className="ob-welcome-title">Built around you,<br />from day one.</h1>
          <p className="ob-welcome-sub">5 quick steps and RepIQ knows exactly how to train you.</p>
        </div>
        <div className="ob-welcome-card">
          <div className="ob-fields">
            <div className="ob-field">
              <label className="ob-field-label">What should we call you?</label>
              <input
                className="ob-text-input"
                type="text"
                placeholder="Your name or nickname"
                value={name}
                maxLength={32}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="ob-field">
              <label className="ob-field-label">I identify as</label>
              <div className="ob-chip-row">
                <Chip label="Male" active={gender === "male"} onClick={() => setGender("male")} />
                <Chip label="Female" active={gender === "female"} onClick={() => setGender("female")} />
                <Chip label="Prefer not to say" active={gender === "other"} onClick={() => setGender("other")} />
              </div>
            </div>
          </div>
        </div>
      </div>
    ),

    2: (
      <div className="ob-step" key="step-2">
        <div className="ob-trust-card">
          <span className="ob-trust-icon">{trustMessages[2].icon}</span>
          <div>
            <strong className="ob-trust-headline">{trustMessages[2].headline}</strong>
            <p className="ob-trust-body">{trustMessages[2].body}</p>
          </div>
        </div>
        <div className="ob-fields">
          <div className="ob-field ob-field-unit-row">
            <label className="ob-field-label">Units</label>
            <UnitToggle value={unitSystem} onChange={setUnitSystem} />
          </div>
          <div className="ob-field">
            <label className="ob-field-label">Height</label>
            {unitSystem === "metric" ? (
              <Stepper value={heightCm} onChange={setHeightCm} min={120} max={230} unit="cm" />
            ) : (
              <div className="ob-imperial-height">
                <Stepper value={heightFt} onChange={setHeightFt} min={3} max={7} unit="ft" />
                <Stepper value={heightIn} onChange={setHeightIn} min={0} max={11} unit="in" />
              </div>
            )}
          </div>
          <div className="ob-field">
            <label className="ob-field-label">Weight</label>
            {unitSystem === "metric" ? (
              <Stepper value={weightKg} onChange={setWeightKg} min={30} max={250} unit="kg" />
            ) : (
              <Stepper value={weightLbs} onChange={setWeightLbs} min={66} max={550} unit="lbs" />
            )}
          </div>
          <div className="ob-field">
            <label className="ob-field-label">Age</label>
            <Stepper value={age} onChange={setAge} min={13} max={90} unit="yrs" />
          </div>
          <div className="ob-field">
            <label className="ob-field-label">Body composition <span className="ob-optional">(best guess)</span></label>
            <div className="ob-bf-grid">
              {bfBrackets.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`ob-bf-card ${bodyFatBracket === b.id ? "is-active" : ""}`}
                  onClick={() => setBodyFatBracket(bodyFatBracket === b.id ? null : b.id)}
                  style={{ "--bf-color": b.color } as React.CSSProperties}
                >
                  <div className="ob-bf-dot" />
                  <span className="ob-bf-label">{b.label}</span>
                  <span className="ob-bf-range">{b.range}</span>
                  <span className="ob-bf-desc">{b.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),

    3: (
      <div className="ob-step" key="step-3">
        <div className="ob-fields">
          <div className="ob-field">
            <label className="ob-field-label">Primary training goal <span className="ob-required">*</span></label>
            <p className="ob-field-hint">A clear goal helps RepIQ prioritise your program — pick the one that matters most right now.</p>
            <div className="ob-chip-grid">
              {([
                { value: "build_muscle", label: "💪 Build Muscle" },
                { value: "fat_loss", label: "🔥 Lose Fat" },
                { value: "get_stronger", label: "🏋️ Get Stronger" },
                { value: "improve_fitness", label: "🏃 Improve Fitness" },
                { value: "athletic_performance", label: "⚡ Athletic Performance" },
                { value: "stay_active", label: "🌿 Stay Active" },
              ] as { value: TrainingGoal; label: string }[]).map((g) => (
                <Chip key={g.value} label={g.label} active={goal === g.value} onClick={() => {
                  setGoal(g.value);
                  if (secondaryGoal === g.value) setSecondaryGoal(null);
                }} />
              ))}
            </div>
          </div>

          {goal && (
            <div className="ob-field">
              <label className="ob-field-label">Secondary goal <span className="ob-optional">(optional)</span></label>
              <div className="ob-chip-grid">
                {([
                  { value: "build_muscle", label: "💪 Build Muscle" },
                  { value: "fat_loss", label: "🔥 Lose Fat" },
                  { value: "get_stronger", label: "🏋️ Get Stronger" },
                  { value: "improve_fitness", label: "🏃 Improve Fitness" },
                  { value: "athletic_performance", label: "⚡ Athletic Performance" },
                  { value: "stay_active", label: "🌿 Stay Active" },
                ] as { value: TrainingGoal; label: string }[])
                  .filter((g) => g.value !== goal)
                  .map((g) => (
                    <Chip key={g.value} label={g.label} active={secondaryGoal === g.value} onClick={() => setSecondaryGoal(secondaryGoal === g.value ? null : g.value)} />
                  ))}
              </div>
            </div>
          )}

        </div>
      </div>
    ),

    4: (
      <div className="ob-step" key="step-4">
        <div className="ob-trust-card">
          <span className="ob-trust-icon">{trustMessages[4].icon}</span>
          <div>
            <strong className="ob-trust-headline">{trustMessages[4].headline}</strong>
            <p className="ob-trust-body">{trustMessages[4].body}</p>
          </div>
        </div>
        <div className="ob-fields">
          <div className="ob-field">
            <label className="ob-field-label">Training background <span className="ob-required">*</span></label>
            <div className="ob-exp-list">
              {([
                { value: "never", label: "New to training", desc: "I haven't trained before" },
                { value: "beginner", label: "Getting started", desc: "Training for less than a year" },
                { value: "intermediate", label: "Building foundations", desc: "1–3 years of consistent training" },
                { value: "advanced", label: "Experienced", desc: "3–5 years, I know my way around" },
                { value: "veteran", label: "Veteran", desc: "5+ years — I've seen it all" },
              ] as { value: ExperienceLevel; label: string; desc: string }[]).map((e) => (
                <button
                  key={e.value}
                  type="button"
                  className={`ob-exp-row ${experience === e.value ? "is-active" : ""}`}
                  onClick={() => setExperience(e.value)}
                >
                  <div className="ob-exp-row-dot" />
                  <div className="ob-exp-row-text">
                    <strong>{e.label}</strong>
                    <span>{e.desc}</span>
                  </div>
                  {experience === e.value && <span className="ob-exp-check">✓</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="ob-field ob-returning-field">
            <label className="ob-checkbox-row">
              <input
                type="checkbox"
                className="ob-checkbox"
                checked={isReturning}
                onChange={(e) => setIsReturning(e.target.checked)}
              />
              <span className="ob-checkbox-label">I'm returning after a break</span>
            </label>
            {isReturning && (
              <div className="ob-break-stepper">
                <span className="ob-break-label">Break duration</span>
                <Stepper value={breakMonths} onChange={setBreakMonths} min={1} max={60} unit={breakMonths === 1 ? "month" : "months"} />
              </div>
            )}
          </div>
          <div className="ob-field">
            <label className="ob-field-label">Days per week</label>
            <div className="ob-days-strip">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`ob-day-btn ${daysPerWeek === d ? "is-active" : ""}`}
                  onClick={() => setDaysPerWeek(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="ob-field">
            <label className="ob-field-label">Session length</label>
            <div className="ob-chip-row">
              {[30, 45, 60, 75, 90].map((m) => (
                <Chip key={m} label={m === 90 ? "90+ min" : `${m} min`} active={sessionLength === m} onClick={() => setSessionLength(m)} />
              ))}
            </div>
          </div>
          <div className="ob-field">
            <label className="ob-field-label">Best time to train <span className="ob-optional">(optional)</span></label>
            <div className="ob-chip-row">
              {[
                { value: "morning", label: "🌅 Morning" },
                { value: "afternoon", label: "☀️ Afternoon" },
                { value: "evening", label: "🌆 Evening" },
                { value: "varies", label: "🔀 Varies" },
              ].map((t) => (
                <Chip key={t.value} label={t.label} active={bestTime === t.value} onClick={() => setBestTime(bestTime === t.value ? null : t.value)} />
              ))}
            </div>
          </div>
        </div>
      </div>
    ),

    5: (
      <div className="ob-step" key="step-5">
        <div className="ob-fields">
          {/* Mandatory — Biggest challenge */}
          <div className="ob-field">
            <label className="ob-field-label">Biggest challenge right now <span className="ob-optional">(pick all that apply)</span></label>
            <div className="ob-chip-grid">
              {[
                { value: "time",        label: "⏱ Not enough time" },
                { value: "motivation",  label: "😴 Staying motivated" },
                { value: "knowledge",   label: "📚 Not sure what to do" },
                { value: "injury",      label: "🩹 Recovery / injury" },
                { value: "consistency", label: "🔁 Staying consistent" },
              ].map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  active={biggestObstacles.includes(o.value)}
                  onClick={() => {
                    setBiggestObstacles((prev) =>
                      prev.includes(o.value) ? prev.filter((x) => x !== o.value) : [...prev, o.value]
                    );
                    if (!optionalOpen) {
                      setOptionalOpen(true);
                      setTimeout(() => optionalSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
                    }
                  }}
                />
              ))}
            </div>
          </div>

          {/* Optional section toggle / expanded */}
          {!optionalOpen ? (
            <button
              type="button"
              className="ob-optional-toggle"
              onClick={() => {
                setOptionalOpen(true);
                setTimeout(() => optionalSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
              }}
            >
              <span className="ob-optional-toggle-label">Optional · 3 more questions</span>
              <span className="ob-optional-toggle-arrow">›</span>
            </button>
          ) : (
            <div ref={optionalSectionRef} className="ob-optional-section">
              {/* Pre-workout feeling */}
              <div className="ob-field ob-field-revealed">
                <label className="ob-field-label">Before a workout, you usually feel <span className="ob-optional">(optional)</span></label>
                <div className="ob-chip-grid">
                  {[
                    { value: "energised", label: "⚡ Energised & ready" },
                    { value: "neutral",   label: "😐 Neutral" },
                    { value: "reluctant", label: "😤 Reluctant, but I go" },
                    { value: "tired",     label: "😴 Usually tired" },
                  ].map((f) => (
                    <Chip key={f.value} label={f.label} active={preWorkoutFeeling === f.value} onClick={() =>
                      setPreWorkoutFeeling(preWorkoutFeeling === f.value ? null : f.value)
                    } />
                  ))}
                </div>
              </div>

              {/* Workout style */}
              <div className="ob-field ob-field-revealed">
                <label className="ob-field-label">Preferred workout style <span className="ob-optional">(optional)</span></label>
                <div className="ob-chip-grid">
                  {[
                    { value: "full_body",   label: "🔄 Full Body" },
                    { value: "upper_lower", label: "↕️ Upper / Lower" },
                    { value: "ppl",         label: "🔀 Push · Pull · Legs" },
                    { value: "body_part",   label: "🎯 Body Part Split" },
                    { value: "any",         label: "🤷 No preference" },
                  ].map((s) => (
                    <Chip key={s.value} label={s.label} active={workoutStyle === s.value} onClick={() =>
                      setWorkoutStyle(workoutStyle === s.value ? null : s.value)
                    } />
                  ))}
                </div>
              </div>

              {/* Success vision */}
              <div className="ob-field ob-field-revealed">
                <label className="ob-field-label">In 3 months, success means <span className="ob-optional">(optional)</span></label>
                <div className="ob-chip-grid">
                  {[
                    { value: "look_different", label: "🪞 I look noticeably different" },
                    { value: "stronger",       label: "💪 I'm significantly stronger" },
                    { value: "consistent",     label: "📅 I've trained consistently" },
                    { value: "healthier",      label: "❤️ I feel healthier overall" },
                    { value: "habit",          label: "🔥 I've built a real habit" },
                  ].map((v) => (
                    <Chip key={v.value} label={v.label} active={successVision === v.value} onClick={() =>
                      setSuccessVision(successVision === v.value ? null : v.value)
                    } />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    ),
  };

  const ThemeBtn = () => (
    <button type="button" className="ob-theme-btn" onClick={onToggleTheme} aria-label="Toggle theme">
      {resolvedTheme === "dark"
        ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      }
    </button>
  );

  return (
    <div className="ob-page" data-step={step}>
      <header className={`ob-header ${step === 1 ? "ob-header-splash" : ""}`}>
        <div className="ob-progress">
          <div className="ob-step-row">
            {STEP_LABELS.map((lbl, i) => {
              const n = i + 1;
              const done = n < step;
              const active = n === step;
              return (
                <Fragment key={n}>
                  {n <= maxStep || (n === step + 1 && canAdvance) ? (
                    <button
                      type="button"
                      className={`ob-dot is-clickable${done ? " is-done" : active ? " is-active" : " is-visited"}`}
                      onClick={() => {
                        if (n > maxStep) setMaxStep(n);
                        setStep(n);
                      }}
                      aria-label={done ? `Go back to ${lbl}` : lbl}
                    >{done ? "✓" : n}</button>
                  ) : (
                    <div className="ob-dot">{n}</div>
                  )}
                  {i < TOTAL - 1 && <div className={`ob-connector ${n < step ? "is-filled" : ""}`} />}
                </Fragment>
              );
            })}
          </div>
          <div className="ob-label-row">
            {STEP_LABELS.map((lbl, i) => (
              <span key={i} className={`ob-step-lbl ${i + 1 === step ? "is-active" : ""}`}>{lbl}</span>
            ))}
          </div>
          <div className="ob-progress-foot">
            <p className="ob-step-count">Step {step} of {TOTAL}</p>
            <ThemeBtn />
          </div>
        </div>
      </header>

      <div className="ob-body">
        {stepContent[step]}
      </div>

      <div className="ob-footer">
        {step > 1 && (
          <button type="button" className="ob-back" onClick={() => setStep((s) => s - 1)}>← Back</button>
        )}
        <button
          type="button"
          className={`ob-cta ${!canAdvance ? "is-disabled" : ""}`}
          onClick={canAdvance ? advance : undefined}
          disabled={!canAdvance}
        >
          {step === TOTAL ? "I'm Ready →" : step === 1 ? "Get Started →" : "Continue →"}
        </button>
      </div>
    </div>
  );
}

function AddExercisePage({
  templates,
  existingExerciseNames,
  onBack,
  onAddSelected,
  onCreateCustom,
  onOpenDetails,
  editorExercise,
  onUpdateCustom,
  resolvedTheme,
  onToggleTheme,
  preFilterMuscle,
  replaceMode,
}: {
  templates: ExerciseDraft[];
  existingExerciseNames: string[];
  onBack: () => void;
  onAddSelected: (templateIds: string[]) => void;
  onCreateCustom: (draft: CustomExerciseInput) => string | null;
  onOpenDetails: (exerciseId: string) => void;
  editorExercise?: ExerciseDraft | null;
  onUpdateCustom?: (exerciseId: string, draft: CustomExerciseInput) => string | null;
  resolvedTheme?: string;
  onToggleTheme?: () => void;
  preFilterMuscle?: string;
  replaceMode?: boolean;
}) {
  const isEditingCustomExercise = Boolean(editorExercise);
  const [mode, setMode] = useState<AddExerciseMode>(editorExercise ? "create" : "browse");
  const [createStep, setCreateStep] = useState<CreateExerciseStep>(1);
  const [browseTab, setBrowseTab] = useState<"all" | "muscle" | "type">("all");
  const [expandedMuscleKeys, setExpandedMuscleKeys] = useState<string[] | null>(null);
  const [expandedTypeKeys, setExpandedTypeKeys] = useState<string[]>([]);
  const [showSecondaryDrilldown, setShowSecondaryDrilldown] = useState(true);
  const [expandedSecondaryKeys, setExpandedSecondaryKeys] = useState<string[] | null>(null);
  const [sortMode, setSortMode] = useState<"alphabetical" | "frequency" | "library">("alphabetical");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState(preFilterMuscle ?? "");
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [showInWorkoutOnly, setShowInWorkoutOnly] = useState(false);
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [customName, setCustomName] = useState(editorExercise?.name ?? "");
  const [customImageSrc, setCustomImageSrc] = useState(editorExercise?.imageSrc ?? "");
  const [customPrimaryMuscles, setCustomPrimaryMuscles] = useState<string[]>(
    editorExercise?.primaryMuscles ?? (editorExercise ? [editorExercise.primaryMuscle] : [])
  );
  const [customSecondaryMuscles, setCustomSecondaryMuscles] = useState<string[]>(
    editorExercise?.secondaryMuscles ?? []
  );
  const [customExerciseType, setCustomExerciseType] = useState<CustomExerciseType | null>(
    editorExercise?.exerciseType ?? (editorExercise ? inferExerciseType(editorExercise) : null)
  );
  const [customMeasurementType, setCustomMeasurementType] = useState<MeasurementType | null>(
    editorExercise ? getExerciseMeasurementType(editorExercise) : null
  );
  const [customMovementSide, setCustomMovementSide] = useState<MovementSide | null>(
    editorExercise?.movementSide ?? null
  );
  const [customMovementPattern, setCustomMovementPattern] = useState<MovementPattern | null>(
    (editorExercise as ExerciseWithTaxonomy)?.movementPattern ?? null
  );
  const [duplicateNamePrompt, setDuplicateNamePrompt] = useState<{
    requestedName: string;
    suggestedName: string;
  } | null>(null);
  const [primarySelectorOpen, setPrimarySelectorOpen] = useState(false);
  const [secondarySelectorOpen, setSecondarySelectorOpen] = useState(false);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const previousPrimaryCountRef = useRef(customPrimaryMuscles.length);

  useEffect(() => {
    if (!editorExercise) {
      return;
    }

    setMode("create");
    setCreateStep(1);
    setCustomName(editorExercise.name);
    setCustomImageSrc(editorExercise.imageSrc);
    setCustomPrimaryMuscles(editorExercise.primaryMuscles ?? [editorExercise.primaryMuscle]);
    setCustomSecondaryMuscles(editorExercise.secondaryMuscles);
    setCustomExerciseType(editorExercise.exerciseType ?? inferExerciseType(editorExercise));
    setCustomMeasurementType(getExerciseMeasurementType(editorExercise));
    setCustomMovementSide(editorExercise.movementSide ?? null);
    setCustomMovementPattern((editorExercise as ExerciseWithTaxonomy).movementPattern ?? null);
    setDuplicateNamePrompt(null);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [editorExercise]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    window.requestAnimationFrame(() => {
      resultsRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [mode]);

  const getExerciseType = (exercise: ExerciseDraft) => {
    if (exercise.id.startsWith("custom-")) {
      return "Added by me";
    }

    const inferredType = inferExerciseType(exercise);
    if (inferredType === "bodyweight_weighted") {
      return "Weighted Bodyweight";
    }
    if (inferredType === "freestyle_cardio") {
      return "Cardio";
    }
    if (/(stretch|mobility|yoga)/.test(exercise.name.toLowerCase())) {
      return "Stretching";
    }
    if (inferredType === "bodyweight_only") {
      return "Bodyweight";
    }
    return "Weighted";
  };

  const templateOrder = useMemo(() => {
    const order = new Map<string, number>();
    templates.forEach((template, index) => {
      order.set(template.id, index);
    });
    return order;
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    const searched = templates.filter((template) => {
      return matchesSearchTokens(query, [
        template.name,
        ...getPrimaryMuscles(template),
        template.secondaryMuscles.join(" "),
        template.goal,
        getExerciseType(template)
      ]);
    });

    const narrowed = searched.filter((template) => {
      const alreadyInWorkout = existingExerciseNames.includes(template.name);
      const isSelected = selectedTemplateIds.includes(template.id);

      if (showInWorkoutOnly && !alreadyInWorkout) {
        return false;
      }

      if (showSelectedOnly && !isSelected) {
        return false;
      }

      return true;
    });

    const sorted = [...narrowed].sort((left, right) => {
      if (sortMode === "library") {
        const orderDelta = (templateOrder.get(left.id) ?? 0) - (templateOrder.get(right.id) ?? 0);
        return sortDirection === "asc" ? orderDelta : -orderDelta;
      }

      if (sortMode === "frequency") {
        const frequencyDelta =
          sortDirection === "asc"
            ? left.history.length - right.history.length
            : right.history.length - left.history.length;
        if (frequencyDelta !== 0) {
          return frequencyDelta;
        }
      }

      const nameDelta = left.name.localeCompare(right.name);
      return sortDirection === "asc" ? nameDelta : -nameDelta;
    });

    return sorted;
  }, [existingExerciseNames, query, selectedTemplateIds, showInWorkoutOnly, showSelectedOnly, sortDirection, sortMode, templateOrder, templates]);

  function selectSortMode(nextMode: "alphabetical" | "frequency" | "library") {
    if (nextMode === sortMode) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortMode(nextMode);
      setSortDirection(nextMode === "frequency" ? "desc" : "asc");
    }
    setFilterOpen(false);
  }

  const groupedByMuscle = useMemo(() => {
    return filteredTemplates.reduce<Record<string, ExerciseDraft[]>>((groups, template) => {
      const key = getCanonicalMuscle(getPrimaryMuscles(template)[0]);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(template);
      return groups;
    }, {});
  }, [filteredTemplates]);

  const muscleGroupKeys = useMemo(
    () => CANONICAL_MUSCLE_ORDER.filter((g) => Boolean(groupedByMuscle[g])),
    [groupedByMuscle]
  );

  const groupedByType = useMemo(() => {
    return filteredTemplates.reduce<Record<string, ExerciseDraft[]>>((groups, template) => {
      const key = getExerciseType(template);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(template);
      return groups;
    }, {});
  }, [filteredTemplates]);

  const typeGroupKeys = useMemo(
    () => Object.keys(groupedByType).sort((left, right) => left.localeCompare(right)),
    [groupedByType]
  );

  // Secondary-muscle drill-down
  // Sub-groups = actual primaryMuscle value (e.g. "Upper Chest", "Lats") +
  //              any secondaryMuscles that map to the SAME canonical group (overlap allowed)
  const groupedByMuscleWithSecondary = useMemo(() => {
    if (!showSecondaryDrilldown) return {} as Record<string, Record<string, ExerciseDraft[]>>;
    const result: Record<string, Record<string, ExerciseDraft[]>> = {};
    muscleGroupKeys.forEach((canonical) => {
      const exercises = groupedByMuscle[canonical] ?? [];
      const subMap: Record<string, ExerciseDraft[]> = {};
      exercises.forEach((ex) => {
        // Always bucket by the exercise's own primaryMuscle label
        const ownPrimary = getPrimaryMuscles(ex)[0];
        if (!subMap[ownPrimary]) subMap[ownPrimary] = [];
        subMap[ownPrimary].push(ex);
        // Also bucket by any secondary that maps to this same canonical group (creates overlap)
        (ex.secondaryMuscles ?? []).forEach((sec) => {
          if (getCanonicalMuscle(sec) === canonical && sec !== ownPrimary) {
            if (!subMap[sec]) subMap[sec] = [];
            subMap[sec].push(ex);
          }
        });
      });
      result[canonical] = subMap;
    });
    return result;
  }, [showSecondaryDrilldown, groupedByMuscle, muscleGroupKeys]);

  const allSecondaryKeys = useMemo(() => {
    const keys: string[] = [];
    muscleGroupKeys.forEach((pk) => {
      const secMap = groupedByMuscleWithSecondary[pk] ?? {};
      Object.keys(secMap).sort((a, b) => a.localeCompare(b)).forEach((sk) => keys.push(`${pk}::${sk}`));
    });
    return keys;
  }, [groupedByMuscleWithSecondary, muscleGroupKeys]);

  useEffect(() => {
    setExpandedMuscleKeys((current) => {
      if (current === null) {
        return [...muscleGroupKeys];
      }

      return current.filter((key) => (muscleGroupKeys as string[]).includes(key));
    });
  }, [muscleGroupKeys]);

  function toggleMuscleGroup(muscle: string) {
    setExpandedMuscleKeys((current) => {
      const resolved = current ?? muscleGroupKeys;
      return resolved.includes(muscle)
        ? resolved.filter((entry) => entry !== muscle)
        : [...resolved, muscle];
    });
  }

  function toggleAllMuscleGroups() {
    setExpandedMuscleKeys((current) => {
      const resolved = current ?? muscleGroupKeys;
      return resolved.length === muscleGroupKeys.length ? [] : [...muscleGroupKeys];
    });
  }

  function toggleTypeGroup(type: string) {
    setExpandedTypeKeys((current) =>
      current.includes(type) ? current.filter((entry) => entry !== type) : [...current, type]
    );
  }

  function toggleAllTypeGroups() {
    setExpandedTypeKeys((current) =>
      current.length === typeGroupKeys.length ? [] : [...typeGroupKeys]
    );
  }

  function toggleSecondaryDrilldown() {
    setShowSecondaryDrilldown((prev) => {
      if (!prev) setExpandedSecondaryKeys(null); // reset to all expanded when turning on
      return !prev;
    });
  }

  function toggleSecondaryGroup(key: string) {
    setExpandedSecondaryKeys((current) => {
      const resolved = current ?? allSecondaryKeys;
      return resolved.includes(key)
        ? resolved.filter((k) => k !== key)
        : [...resolved, key];
    });
  }

  const canCreateCustom =
    customName.trim().length > 1 &&
    customPrimaryMuscles.length > 0 &&
    customExerciseType !== null &&
    customMeasurementType !== null &&
    customMovementSide !== null;
  const canContinueToStepTwo =
    customName.trim().length > 1 && customPrimaryMuscles.length > 0;

  const hasSearchQuery = query.trim().length > 0;
  const existingTemplateNames = useMemo(() => templates.map((template) => template.name), [templates]);

  function openCreateMode(prefilledName?: string) {
    if (isEditingCustomExercise) {
      return;
    }
    setMode("create");
    setCreateStep(1);
    setCustomName(prefilledName?.trim() ?? "");
    setCustomImageSrc("");
    setCustomPrimaryMuscles([]);
    setCustomSecondaryMuscles([]);
    setCustomExerciseType(null);
    setCustomMeasurementType(null);
    setCustomMovementSide(null);
  }

  function togglePrimaryMuscle(muscle: string) {
    setCustomPrimaryMuscles((current) =>
      current.includes(muscle)
        ? current.filter((entry) => entry !== muscle)
        : [...current, muscle]
    );
  }

  function toggleSecondaryMuscle(muscle: string) {
    setCustomSecondaryMuscles((current) =>
      current.includes(muscle)
        ? current.filter((entry) => entry !== muscle)
        : [...current, muscle]
    );
  }

  function continueToCreateStepTwo() {
    if (!canContinueToStepTwo) {
      return;
    }

    setCreateStep(2);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
      resultsRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
  }

  function submitCustomExercise(nameOverride?: string) {
    const finalName = (nameOverride ?? customName).trim();
    if (!finalName || !customExerciseType || !customMeasurementType || !customMovementSide) {
      return;
    }

    const exerciseInput: CustomExerciseInput = {
      name: finalName,
      imageSrc: customImageSrc || undefined,
      primaryMuscles: customPrimaryMuscles,
      secondaryMuscles: customSecondaryMuscles,
      exerciseType: customExerciseType,
      measurementType: customMeasurementType,
      movementSide: customMovementSide,
      movementPattern: customMovementPattern ?? undefined
    };

    const createdId =
      isEditingCustomExercise && editorExercise && onUpdateCustom
        ? onUpdateCustom(editorExercise.id, exerciseInput)
        : onCreateCustom(exerciseInput);

    if (createdId) {
      setDuplicateNamePrompt(null);
      if (isEditingCustomExercise) {
        onBack();
      } else {
        setMode("browse");
        setCreateStep(1);
      }
    }
  }

  function handleCreateCustomSubmit() {
    const requestedName = customName.trim();
    if (!requestedName) {
      return;
    }

    const comparableTemplateNames = isEditingCustomExercise && editorExercise
      ? existingTemplateNames.filter(
          (name) => name.trim().toLowerCase() !== editorExercise.name.trim().toLowerCase()
        )
      : existingTemplateNames;

    const hasExactDuplicate = comparableTemplateNames.some(
      (name) => name.trim().toLowerCase() === requestedName.toLowerCase()
    );

    if (hasExactDuplicate) {
      setDuplicateNamePrompt({
        requestedName,
        suggestedName: ensureUniqueExerciseName(requestedName, comparableTemplateNames)
      });
      return;
    }

    submitCustomExercise();
  }

  useEffect(() => {
    if (customPrimaryMuscles.length === 0) {
      return;
    }

    setCustomSecondaryMuscles((current) =>
      current.filter((muscle) => !customPrimaryMuscles.includes(muscle))
    );
  }, [customPrimaryMuscles]);

  const secondaryMuscleOptions = useMemo(
    () => secondaryMuscleLibrary.filter((muscle) => !customPrimaryMuscles.includes(muscle)),
    [customPrimaryMuscles]
  );

  useEffect(() => {
    if (!customExerciseType) {
      return;
    }

    if (customExerciseType === "freestyle_cardio") {
      setCustomMeasurementType("timed");
      return;
    }

    setCustomMeasurementType((current) => current ?? "reps_volume");
  }, [customExerciseType]);

  useEffect(() => {
    const previousCount = previousPrimaryCountRef.current;
    if (previousCount === 0 && customPrimaryMuscles.length > 0) {
      setSecondarySelectorOpen(true);
    }
    previousPrimaryCountRef.current = customPrimaryMuscles.length;
  }, [customPrimaryMuscles.length]);

  function handleCustomImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCustomImageSrc(reader.result);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  const toggleTemplateSelection = (templateId: string) => {
    setSelectedTemplateIds((current) =>
      current.includes(templateId)
        ? current.filter((id) => id !== templateId)
        : [...current, templateId]
    );
  };

  const clearSearch = () => {
    setQuery("");
    window.requestAnimationFrame(() => {
      resultsRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const renderTemplateCard = (template: ExerciseDraft) => {
    const alreadyInWorkout = existingExerciseNames.includes(template.name);
    const selectionIndex = selectedTemplateIds.indexOf(template.id);

    return (
      <article
        key={template.id}
        className={`template-card ${selectionIndex >= 0 ? "is-selected" : ""}`}
      >
        <button
          type="button"
          className="template-card-main"
          title={template.name}
          onClick={() => toggleTemplateSelection(template.id)}
        >
          <img src={template.imageSrc} alt={template.name} className="template-thumb" />
          <div className="template-card-copy">
            <div className="template-card-top">
              <strong>{template.name}</strong>
              <div className="template-card-statuses">
                {template.id.startsWith("custom-") && (
                  <span className="custom-exercise-badge" aria-label="Custom exercise">Mine</span>
                )}
                {alreadyInWorkout && <span className="session-status-pill">In workout</span>}
                {selectionIndex >= 0 && (
                  <span className="template-select-badge" aria-label={`Selected ${selectionIndex + 1}`}>
                    ✓ {selectionIndex + 1}
                  </span>
                )}
              </div>
            </div>
            <p className="template-card-meta">
              <strong>{formatPrimaryMuscles(template)}</strong>
              {template.secondaryMuscles.length > 0 ? (
                <>
                  {" · "}
                  <span>{template.secondaryMuscles.join(", ")}</span>
                </>
              ) : null}
            </p>
          </div>
        </button>
        <button
          type="button"
          className="template-card-info-button"
          aria-label={`View details for ${template.name}`}
          title={`View details for ${template.name}`}
          onClick={() => onOpenDetails(template.id)}
        >
          i
        </button>
      </article>
    );
  };

  return (
    <main className="detail-page add-exercise-page">
      <header className="detail-topbar">
        <button
          className="back-nav-button detail-back-button"
          type="button"
          onClick={() => {
            if (mode === "create") {
              if (createStep === 2) {
                setCreateStep(1);
                return;
              }
              if (isEditingCustomExercise) {
                onBack();
                return;
              }
              setMode("browse");
              return;
            }
            onBack();
          }}
          aria-label="Back"
        >
          ←
        </button>
        <div className="detail-topbar-copy">
          <p className="label">{mode === "create" ? "Custom Exercise" : "Exercise Selector"}</p>
          <h1>
            {mode === "create"
              ? isEditingCustomExercise
                ? "Edit Exercise"
                : "Create Exercise"
              : "Add Exercise"}
          </h1>
        </div>
        <div className="detail-topbar-actions">
          <div className="detail-topbar-action-group">
            {resolvedTheme && onToggleTheme && (
              <button type="button" className="theme-toggle-btn" onClick={onToggleTheme} aria-label="Toggle theme">
                {resolvedTheme === "dark" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
              </button>
            )}
            {mode === "browse" && (
              <button
                className="icon-button add-exercise-header-icon"
                type="button"
                aria-label="Sort and filter"
                title="Sort and filter"
                onClick={() => setFilterOpen(true)}
              >
                ≡
              </button>
            )}
          </div>
        </div>
      </header>

      <section className={`detail-section ${mode === "browse" ? "add-exercise-section" : ""}`}>
        {mode === "browse" ? (
          <>
            <div className="add-exercise-browse">
              <div className="add-exercise-toolbar">
                <div className="add-exercise-tab-strip">
                  <button
                    type="button"
                    className={`theme-choice add-exercise-tab ${browseTab === "all" ? "is-active" : ""}`}
                    onClick={() => setBrowseTab("all")}
                  >
                    All Exercises
                  </button>
                  <button
                    type="button"
                    className={`theme-choice add-exercise-tab ${browseTab === "muscle" ? "is-active" : ""}`}
                    onClick={() => setBrowseTab("muscle")}
                  >
                    By Muscle
                  </button>
                  <button
                    type="button"
                    className={`theme-choice add-exercise-tab ${browseTab === "type" ? "is-active" : ""}`}
                    onClick={() => setBrowseTab("type")}
                  >
                    Types
                  </button>
                </div>

                <div className="search-shell">
                  <div className="search-shell-head">
                    <div className="search-shell-head-left">
                      <span className="selected-count-label">{selectedTemplateIds.length} <span className="selected-count-word">selected</span></span>
                      <div className="quick-filter-row" aria-label="Quick exercise filters">
                        <button
                          type="button"
                          className={`quick-filter-chip ${showInWorkoutOnly ? "is-active" : ""}`}
                          onClick={() => setShowInWorkoutOnly((current) => !current)}
                        >
                          <span>In workout</span>
                        </button>
                        <button
                          type="button"
                          className={`quick-filter-chip ${showSelectedOnly ? "is-active" : ""}`}
                          onClick={() => setShowSelectedOnly((current) => !current)}
                        >
                          <span>Selected</span>
                        </button>
                      </div>
                    </div>
                    <div className="search-shell-head-right">
                      {(browseTab === "type" || browseTab === "muscle") && (
                        <button
                          type="button"
                          className="template-group-toolbar-button"
                          onClick={
                            browseTab === "type" ? toggleAllTypeGroups : toggleAllMuscleGroups
                          }
                        >
                          {browseTab === "type"
                            ? expandedTypeKeys.length === typeGroupKeys.length
                              ? "Collapse all"
                              : "Expand all"
                            : (expandedMuscleKeys ?? muscleGroupKeys).length === muscleGroupKeys.length
                              ? "Collapse all"
                              : "Expand all"}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="search-input-shell">
                    <input
                      className="search-input"
                      type="text"
                      aria-label="Search exercises"
                      placeholder="Search by exercise or muscle"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                    {query.trim().length > 0 && (
                      <button
                        className="search-clear-button"
                        type="button"
                        aria-label="Clear search"
                        onClick={clearSearch}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div ref={resultsRef} className="template-results">
                {filteredTemplates.length === 0 ? (
                  <article className="empty-state-card">
                    <strong>No matching exercise yet</strong>
                    <p>
                      Try a broader search or create this as your own exercise instead.
                    </p>
                    {hasSearchQuery && (
                      <button
                        type="button"
                        className="empty-state-create-button"
                        onClick={() => openCreateMode(query)}
                      >
                        Create &quot;{query.trim()}&quot;
                      </button>
                    )}
                  </article>
                ) : (
                  <>
                    {browseTab === "all" && (
                      <div className="template-list">{filteredTemplates.map(renderTemplateCard)}</div>
                    )}

                    {browseTab === "muscle" && (
                      <div className="template-group-list">
                        {/* ── Secondary-muscle drill-down toggle ── */}
                        <div className="muscle-drilldown-strip">
                          <span className="muscle-drilldown-label">
                            {showSecondaryDrilldown ? "Primary + sub-muscles" : "Primary muscle only"}
                          </span>
                          <button
                            type="button"
                            className={`muscle-drilldown-btn ${showSecondaryDrilldown ? "is-active" : ""}`}
                            onClick={toggleSecondaryDrilldown}
                          >
                            {showSecondaryDrilldown ? "Sub-muscles: On" : "Sub-muscles: Off"}
                          </button>
                        </div>

                        {muscleGroupKeys.map((muscle) => {
                          const isPrimaryExpanded = (expandedMuscleKeys ?? muscleGroupKeys).includes(muscle);
                          const secMap = groupedByMuscleWithSecondary[muscle] ?? {};
                          const secKeys = Object.keys(secMap).sort((a, b) => a.localeCompare(b));
                          return (
                            <section key={muscle} className="template-group-section">
                              <button
                                type="button"
                                className={`template-group-heading template-group-heading-button ${isPrimaryExpanded ? "is-expanded" : ""}`}
                                onClick={() => toggleMuscleGroup(muscle)}
                              >
                                <strong>{muscle}</strong>
                                <span>{groupedByMuscle[muscle].length}</span>
                                <span className="template-group-chevron" aria-hidden="true">
                                  {isPrimaryExpanded ? "⌃" : "⌄"}
                                </span>
                              </button>

                              {isPrimaryExpanded && (
                                showSecondaryDrilldown ? (
                                  // ── Nested secondary sub-groups ──
                                  <div className="secondary-muscle-groups">
                                    {secKeys.map((secondary) => {
                                      const secKey = `${muscle}::${secondary}`;
                                      const isSecExpanded = (expandedSecondaryKeys ?? allSecondaryKeys).includes(secKey);
                                      const secExercises = secMap[secondary];
                                      return (
                                        <div key={secondary} className="secondary-muscle-section">
                                          <button
                                            type="button"
                                            className={`secondary-muscle-heading ${isSecExpanded ? "is-expanded" : ""}`}
                                            onClick={() => toggleSecondaryGroup(secKey)}
                                          >
                                            <span className="secondary-muscle-name">{secondary}</span>
                                            <span className="secondary-muscle-count">{secExercises.length}</span>
                                            <span className="template-group-chevron" aria-hidden="true">
                                              {isSecExpanded ? "⌃" : "⌄"}
                                            </span>
                                          </button>
                                          {isSecExpanded && (
                                            <div className="template-list secondary-muscle-list">
                                              {secExercises.map(renderTemplateCard)}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  // ── Default flat list ──
                                  <div className="template-list">
                                    {groupedByMuscle[muscle].map(renderTemplateCard)}
                                  </div>
                                )
                              )}
                            </section>
                          );
                        })}
                      </div>
                    )}

                    {browseTab === "type" && (
                      <div className="template-group-list">
                        {typeGroupKeys.map((type) => (
                          <section key={type} className="template-group-section">
                            <button
                              type="button"
                              className={`template-group-heading template-group-heading-button ${
                                expandedTypeKeys.includes(type) ? "is-expanded" : ""
                              }`}
                              onClick={() => toggleTypeGroup(type)}
                            >
                              <strong>{type}</strong>
                              <span>{groupedByType[type].length}</span>
                              <span className="template-group-chevron" aria-hidden="true">
                                {expandedTypeKeys.includes(type) ? "⌃" : "⌄"}
                              </span>
                            </button>
                            {expandedTypeKeys.includes(type) && (
                              <div className="template-list">
                                {groupedByType[type].map(renderTemplateCard)}
                              </div>
                            )}
                          </section>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {selectedTemplateIds.length > 0 && (
                <div className="add-exercise-sticky-actions">
                  <button
                    className="primary-button add-exercise-sticky-submit"
                    type="button"
                    onClick={() => onAddSelected(selectedTemplateIds)}
                  >
                    {replaceMode
                      ? "Replace with this exercise"
                      : `Add Exercise${selectedTemplateIds.length > 1 ? "s" : ""} (${selectedTemplateIds.length})`}
                  </button>
                </div>
              )}
            </div>

              <button
                className={`icon-button add-exercise-create-fab ${
                  selectedTemplateIds.length > 0 ? "is-raised" : ""
                } ${filterOpen ? "is-hidden" : ""}`}
                type="button"
                aria-label="Create custom exercise"
                title="Create custom exercise"
                onClick={() => openCreateMode(query)}
              >
                +
              </button>
          </>
        ) : (
          <div className="custom-exercise-form">
            {/* ── Step stepper ── */}
            <div className="create-stepper">
              <div className={`create-stepper-step${createStep === 1 ? " is-active" : " is-done"}`}>
                <div className="create-stepper-dot">{createStep > 1 ? "✓" : "1"}</div>
                <span className="create-stepper-label">Basics</span>
              </div>
              <div className={`create-stepper-line${createStep > 1 ? " is-done" : ""}`} />
              <div className={`create-stepper-step${createStep === 2 ? " is-active" : createStep > 2 ? " is-done" : ""}`}>
                <div className="create-stepper-dot">2</div>
                <span className="create-stepper-label">Logging</span>
              </div>
            </div>

            <div className="custom-form-intro">
              <h2 className="custom-form-title">
                {isEditingCustomExercise
                  ? createStep === 1 ? "Edit basics" : "Edit logging"
                  : createStep === 1 ? "Name & muscles" : "How RepIQ logs it"}
              </h2>
              <p className="custom-form-copy">
                {createStep === 1
                  ? "Set the exercise name, target muscles, and an optional photo."
                  : "These choices tell RepIQ how to track and interpret this exercise in the logger."}
              </p>
            </div>

            {createStep === 1 ? (
              <>
                {/* Name + Image card */}
                <div className="create-form-card">
                  <label className="custom-form-field">
                    <span className="custom-form-label">Exercise name</span>
                    <input
                      className="custom-form-input"
                      type="text"
                      value={customName}
                      placeholder="e.g. Machine Chest Press"
                      onChange={(event) => setCustomName(event.target.value)}
                      autoFocus={!isEditingCustomExercise}
                    />
                  </label>

                  <div className="custom-form-field">
                    <div className="custom-form-label-row">
                      <span className="custom-form-label">Photo</span>
                      <span className="custom-form-label-optional">Optional</span>
                    </div>
                    <label htmlFor="custom-exercise-image" className={`custom-image-zone${customImageSrc ? " has-image" : ""}`}>
                      {customImageSrc ? (
                        <img src={customImageSrc} alt="Exercise preview" />
                      ) : (
                        <div className="custom-image-zone-empty">
                          <span className="custom-image-zone-icon" aria-hidden="true">📷</span>
                          <span>Tap to add photo</span>
                        </div>
                      )}
                      <input
                        id="custom-exercise-image"
                        className="custom-image-input"
                        type="file"
                        accept="image/*"
                        onChange={handleCustomImageChange}
                      />
                    </label>
                    {customImageSrc && (
                      <button
                        type="button"
                        className="custom-image-remove-link"
                        onClick={() => setCustomImageSrc("")}
                      >
                        Remove photo
                      </button>
                    )}
                  </div>
                </div>

                {/* Primary muscles card — grouped by region */}
                <div className="create-form-card">
                  <div className="custom-form-label-row">
                    <span className="custom-form-label">Primary muscles</span>
                    {customPrimaryMuscles.length > 0 && (
                      <span className="custom-form-label-count">{customPrimaryMuscles.length} selected</span>
                    )}
                  </div>
                  {primaryMuscleGroups.map((group) => (
                    <div key={group.label} className="muscle-group">
                      <span className="muscle-group-label">{group.label}</span>
                      <div className="custom-option-grid custom-option-grid-muscles">
                        {group.muscles.map((muscle) => (
                          <button
                            key={muscle}
                            type="button"
                            className={`custom-choice-button${customPrimaryMuscles.includes(muscle) ? " is-active" : ""}`}
                            onClick={() => togglePrimaryMuscle(muscle)}
                          >
                            {muscle}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Secondary muscles card */}
                {customPrimaryMuscles.length > 0 && (
                  <div className="create-form-card">
                    <div className="custom-form-label-row">
                      <span className="custom-form-label">Secondary muscles</span>
                      <span className="custom-form-label-optional">
                        {customSecondaryMuscles.length > 0 ? `${customSecondaryMuscles.length} selected` : "Optional"}
                      </span>
                    </div>
                    <p className="custom-form-copy" style={{ marginTop: -4 }}>
                      Muscles meaningfully involved but not the primary focus.
                    </p>
                    {secondaryMuscleGroups.map((group) => {
                      const available = group.muscles.filter((m) => secondaryMuscleOptions.includes(m));
                      if (available.length === 0) return null;
                      return (
                        <div key={group.label} className="muscle-group">
                          <span className="muscle-group-label">{group.label}</span>
                          <div className="custom-option-grid custom-option-grid-muscles">
                            {available.map((muscle) => (
                              <button
                                key={muscle}
                                type="button"
                                className={`custom-choice-button${customSecondaryMuscles.includes(muscle) ? " is-active" : ""}`}
                                onClick={() => toggleSecondaryMuscle(muscle)}
                              >
                                {muscle}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Exercise type card */}
                <div className="create-form-card">
                  <span className="custom-form-label">Equipment / type</span>
                  <div className="custom-option-grid custom-option-grid-described">
                    {customExerciseTypeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`custom-choice-button custom-choice-button-described${customExerciseType === option.value ? " is-active" : ""}`}
                        onClick={() => setCustomExerciseType(option.value)}
                      >
                        <span className="custom-choice-label">{option.label}</span>
                        <span className="custom-choice-desc">{exerciseTypeDescriptions[option.value]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Measurement card — always shown so user can override */}
                <div className="create-form-card">
                  <span className="custom-form-label">What to track per set</span>
                  <div className="custom-option-grid custom-option-grid-described">
                    {customMeasurementOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`custom-choice-button custom-choice-button-described${customMeasurementType === option.value ? " is-active" : ""}`}
                        onClick={() => setCustomMeasurementType(option.value)}
                      >
                        <span className="custom-choice-label">{option.label}</span>
                        <span className="custom-choice-desc">{measurementDescriptions[option.value]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Movement side card */}
                <div className="create-form-card">
                  <span className="custom-form-label">Movement side</span>
                  <div className="custom-option-grid custom-option-grid-described">
                    {customMovementSideOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`custom-choice-button custom-choice-button-described${customMovementSide === option.value ? " is-active" : ""}`}
                        onClick={() => setCustomMovementSide(option.value)}
                      >
                        <span className="custom-choice-label">{option.label}</span>
                        <span className="custom-choice-desc">{movementSideDescriptions[option.value]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Movement pattern card — for Smart Replace intelligence */}
                <div className="create-form-card">
                  <div className="custom-form-label-row">
                    <span className="custom-form-label">Movement pattern</span>
                    <span className="custom-form-label-optional">Optional</span>
                  </div>
                  <p className="custom-form-copy" style={{ marginTop: -4 }}>
                    Helps RepIQ suggest smarter replacements when this exercise is swapped mid-session.
                  </p>
                  <div className="custom-option-grid custom-option-grid-pattern">
                    {(
                      [
                        { value: "horizontal_push", label: "Horizontal Push", desc: "Bench, push-up, chest press" },
                        { value: "vertical_push", label: "Vertical Push", desc: "Overhead press, shoulder press" },
                        { value: "horizontal_pull", label: "Horizontal Pull", desc: "Row, seated row" },
                        { value: "vertical_pull", label: "Vertical Pull", desc: "Lat pulldown, pull-up" },
                        { value: "hip_hinge", label: "Hip Hinge", desc: "Deadlift, RDL, hip thrust" },
                        { value: "squat", label: "Squat", desc: "Back squat, leg press, goblet" },
                        { value: "lunge", label: "Lunge", desc: "Lunge, split squat, step-up" },
                        { value: "isolation_push", label: "Isolation Push", desc: "Fly, lateral raise, triceps" },
                        { value: "isolation_pull", label: "Isolation Pull", desc: "Curl, face pull, rear delt" },
                        { value: "isolation_legs", label: "Isolation Legs", desc: "Leg extension, leg curl, calf" },
                        { value: "core_anterior", label: "Core", desc: "Plank, crunch, leg raise" },
                        { value: "core_rotational", label: "Core Rotation", desc: "Russian twist, woodchop" },
                        { value: "carry", label: "Carry", desc: "Farmer carry, suitcase" },
                        { value: "cardio", label: "Cardio", desc: "Running, cycling, rowing" },
                      ] as Array<{ value: MovementPattern; label: string; desc: string }>
                    ).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`custom-choice-button custom-choice-button-described${customMovementPattern === option.value ? " is-active" : ""}`}
                        onClick={() => setCustomMovementPattern(prev => prev === option.value ? null : option.value)}
                      >
                        <span className="custom-choice-label">{option.label}</span>
                        <span className="custom-choice-desc">{option.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="sheet-actions custom-form-actions">
              {!canContinueToStepTwo && createStep === 1 && (
                <p className="custom-form-continue-hint">
                  {customName.trim().length <= 1
                    ? "Add a name to continue"
                    : "Select at least one primary muscle"}
                </p>
              )}
              {createStep === 1 ? (
                <>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      if (isEditingCustomExercise) {
                        onBack();
                        return;
                      }
                      setMode("browse");
                    }}
                  >
                    {isEditingCustomExercise ? "Cancel" : "Back to Library"}
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={!canContinueToStepTwo}
                    onClick={continueToCreateStepTwo}
                  >
                    Continue
                  </button>
                </>
              ) : (
                <>
                  <button className="secondary-button" type="button" onClick={() => setCreateStep(1)}>
                    Back
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={!canCreateCustom}
                    onClick={handleCreateCustomSubmit}
                  >
                    {isEditingCustomExercise ? "Save Changes" : "Save Exercise"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {duplicateNamePrompt && (
        <section
          className="sheet-overlay leave-center-overlay"
          onClick={() => setDuplicateNamePrompt(null)}
        >
          <div className="leave-center-card" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-head">
              <div>
                <p className="label">Exercise Name Exists</p>
                <h3>{duplicateNamePrompt.requestedName} is already in the library</h3>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setDuplicateNamePrompt(null)}
              >
                ×
              </button>
            </div>
            <p className="settings-note">
              You can rename it yourself, or save it as{" "}
              <strong>{duplicateNamePrompt.suggestedName}</strong>.
            </p>
            <div className="finish-confirm-actions">
              <div className="finish-confirm-actions-row">
                <button
                  className="logger-action-button"
                  type="button"
                  onClick={() => setDuplicateNamePrompt(null)}
                >
                  Rename It
                </button>
              </div>
              <button
                className="primary-button logger-finish-button"
                type="button"
                onClick={() => submitCustomExercise(duplicateNamePrompt.suggestedName)}
              >
                Save As {duplicateNamePrompt.suggestedName}
              </button>
            </div>
          </div>
        </section>
      )}

      {filterOpen && (
        <section className="sheet-overlay bottom-sheet-overlay" onClick={() => setFilterOpen(false)}>
          <div className="sheet-card action-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-head">
              <div>
                <p className="label">Sort Exercises</p>
                <h3>Choose order</h3>
              </div>
              <button className="icon-button" type="button" onClick={() => setFilterOpen(false)}>
                ×
              </button>
            </div>

            <div className="action-sheet-list">
              <button
                type="button"
                onClick={() => selectSortMode("library")}
              >
                Library order {sortMode === "library" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
              </button>
              <button
                type="button"
                onClick={() => selectSortMode("alphabetical")}
              >
                Alphabetical {sortMode === "alphabetical" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
              </button>
              <button
                type="button"
                onClick={() => selectSortMode("frequency")}
              >
                Most Logged {sortMode === "frequency" ? (sortDirection === "desc" ? "↓" : "↑") : ""}
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function MusclesWorkedPage({
  exercises,
  selectedExercise,
  initialMode,
  onOpenDetails,
  onBack
}: {
  exercises: ExerciseDraft[];
  selectedExercise: ExerciseDraft;
  initialMode: "overall" | "exercise";
  onOpenDetails: (exerciseId: string) => void;
  onBack: () => void;
}) {
  const [focusedExerciseId, setFocusedExerciseId] = useState(selectedExercise.id);
  const [viewMode, setViewMode] = useState<"overall" | "exercise">(initialMode);
  const focusCardRef = useRef<HTMLDivElement | null>(null);
  const muscleSpread = buildMuscleSpread(exercises);
  const maxScore = muscleSpread[0]?.score ?? 1;
  const focusedExercise =
    exercises.find((exercise) => exercise.id === focusedExerciseId) ?? selectedExercise;
  const overallBodyMapScores = useMemo(() => buildMuscleRegionScores(exercises), [exercises]);
  const focusedBodyMapScores = useMemo(
    () => buildMuscleRegionScores([focusedExercise]),
    [focusedExercise]
  );

  useEffect(() => {
    setFocusedExerciseId(selectedExercise.id);
  }, [selectedExercise.id]);

  useEffect(() => {
    setViewMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (viewMode !== "exercise") {
      return;
    }

    if (!focusCardRef.current) {
      return;
    }

    window.requestAnimationFrame(() => {
      focusCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }, [focusedExerciseId]);

  return (
    <main className="detail-page muscles-page">
      <header className="detail-topbar">
        <button className="back-nav-button detail-back-button" type="button" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div className="detail-topbar-copy">
          <p className="label">Muscles Worked</p>
          <h1>{viewMode === "overall" ? "Overall Workout" : focusedExercise.name}</h1>
        </div>
        <span className="detail-topbar-spacer" aria-hidden="true" />
      </header>

      <section className="detail-section">
        <div className="chart-card">
          <div className="chart-copy">
            <h3>Visual Muscle Map</h3>
            <span>Intensity is based on workout contribution points</span>
          </div>

          <div className="body-map-grid">
            <BodyMapPair
              title="Overall Workout"
              subtitle="Primary muscles score higher than secondary support muscles"
              scores={overallBodyMapScores}
            />
            {viewMode === "exercise" && (
              <BodyMapPair
                title={focusedExercise.name}
                subtitle="Current selected exercise focus"
                scores={focusedBodyMapScores}
              />
            )}
          </div>
        </div>

        <details className="muscle-spread-details">
          <summary>
            <span>Overall Workout Spread</span>
            <span className="muscle-spread-summary-copy">Point-based breakdown</span>
          </summary>

          <div className="chart-card muscle-spread-card">
            <div className="chart-copy">
              <h3>Overall Workout Spread</h3>
              <span>Based on all exercises in the current workout</span>
            </div>

            <div className="muscle-spread-list">
              {muscleSpread.map((entry) => (
                <div key={entry.muscle} className="muscle-spread-row">
                  <div className="muscle-spread-copy">
                    <strong>{entry.muscle}</strong>
                    <span>{entry.score} points</span>
                  </div>
                  <div className="muscle-spread-track">
                    <span
                      className="muscle-spread-fill"
                      style={{ width: `${(entry.score / maxScore) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </details>

        {viewMode === "exercise" && (
          <div ref={focusCardRef} className="detail-hero muscles-focus-card">
            <img
              src={focusedExercise.imageSrc}
              alt={focusedExercise.name}
              className="detail-image"
            />
            <div className="detail-copy">
              <p className="label">Selected Exercise</p>
              <h2>{focusedExercise.name}</h2>
              <div className="muscle-chip-row">
                <span className="muscle-chip muscle-chip-primary">
                  Primary: {focusedExercise.primaryMuscle}
                </span>
                {focusedExercise.secondaryMuscles.map((muscle) => (
                  <span key={muscle} className="muscle-chip">
                    {muscle}
                  </span>
                ))}
              </div>
              <div className="muscles-focus-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => onOpenDetails(focusedExercise.id)}
                >
                  View Exercise Details
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="chart-card">
          <div className="chart-copy">
            <h3>Exercise To Muscle Map</h3>
            <span>
              {viewMode === "overall"
                ? "Choose an exercise to inspect its specific muscle focus"
                : "See how this movement fits the full workout"}
            </span>
          </div>

          <div className="exercise-muscle-map">
            {exercises.map((exercise) => (
              <button
                key={exercise.id}
                type="button"
                className={`exercise-muscle-card ${
                  viewMode === "exercise" && exercise.id === focusedExercise.id ? "is-selected" : ""
                }`}
                onClick={() => {
                  setFocusedExerciseId(exercise.id);
                  setViewMode("exercise");
                }}
              >
                <div className="exercise-muscle-top">
                  <strong>{exercise.name}</strong>
                  {viewMode === "exercise" && exercise.id === focusedExercise.id && (
                    <span className="session-status-pill">Selected</span>
                  )}
                </div>
                <p className="exercise-muscle-line">Primary: {exercise.primaryMuscle}</p>
                <p className="exercise-muscle-line">
                  Secondary: {exercise.secondaryMuscles.join(", ")}
                </p>
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

// ── Bottom Navigation Bar ─────────────────────────────────────────────────────
function BottomNav({ activeView, onNavigate }: { activeView: AppView; onNavigate: (view: "home" | "planner" | "insights") => void }) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <button className={`bottom-nav-tab${activeView === "home" ? " is-active" : ""}`} type="button" onClick={() => onNavigate("home")} aria-label="Home">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span>Home</span>
      </button>
      <button className={`bottom-nav-tab${activeView === "planner" ? " is-active" : ""}`} type="button" onClick={() => onNavigate("planner")} aria-label="Planner">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
        </svg>
        <span>Planner</span>
      </button>
      <button className={`bottom-nav-tab${activeView === "insights" ? " is-active" : ""}`} type="button" onClick={() => onNavigate("insights")} aria-label="Insights">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
        <span>Insights</span>
      </button>
    </nav>
  );
}

// ── Muscle Heatmap ────────────────────────────────────────────────────────────

type MuscleStatus = "fresh" | "fading" | "due" | "none";

const HEATMAP_MUSCLES = [
  "Chest", "Back", "Shoulders", "Core",
  "Biceps", "Triceps", "Quads", "Hamstrings", "Glutes", "Calves",
] as const;

function computeMuscleCoverage(workouts: SavedWorkoutData[]): Record<string, MuscleStatus> {
  const today = new Date();
  const todayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const lastTrained: Record<string, number> = {};
  for (const workout of workouts) {
    const ds = (workout.date ?? workout.savedAt).slice(0, 10);
    const [y, mo, d] = ds.split("-").map(Number);
    const wMs = Date.UTC(y, mo - 1, d);
    for (const ex of workout.exercises) {
      const canonical = getCanonicalMuscle(ex.primaryMuscle);
      if (canonical && canonical !== "Other" && (!lastTrained[canonical] || wMs > lastTrained[canonical])) {
        lastTrained[canonical] = wMs;
      }
    }
  }
  const result: Record<string, MuscleStatus> = {};
  for (const muscle of HEATMAP_MUSCLES) {
    const last = lastTrained[muscle];
    if (!last) { result[muscle] = "none"; continue; }
    const days = Math.round((todayMs - last) / 86400000);
    result[muscle] = days <= 2 ? "fresh" : days <= 5 ? "fading" : "due";
  }
  return result;
}

function sessionToMuscleCoverage(exercises: FinishedExerciseSummary[]): Record<string, MuscleStatus> {
  const trained = new Set(
    exercises.map((ex) => getCanonicalMuscle(ex.primaryMuscle)).filter((m) => m !== "Other")
  );
  const result: Record<string, MuscleStatus> = {};
  for (const m of HEATMAP_MUSCLES) result[m] = trained.has(m) ? "fresh" : "none";
  return result;
}

function MuscleHeatmapSVG({
  coverage,
  mode = "history",
}: {
  coverage: Record<string, MuscleStatus>;
  mode?: "history" | "session";
}) {
  function fillColor(muscle: string): string {
    const s = coverage[muscle] ?? "none";
    if (mode === "session") return s === "fresh" ? "var(--accent)" : "var(--line)";
    if (s === "fresh") return "#3b82f6";
    if (s === "fading") return "#93c5fd";
    return "var(--line)";
  }
  function fillOpacity(muscle: string): number {
    const s = coverage[muscle] ?? "none";
    if (mode === "session") return s === "fresh" ? 0.88 : 0.22;
    if (s === "fresh") return 0.88;
    if (s === "fading") return 0.7;
    return 0.28;
  }
  const g = (muscle: string) => ({ fill: fillColor(muscle), fillOpacity: fillOpacity(muscle) });
  const bf = "var(--surface)";
  const bs = "var(--line)";

  return (
    <svg viewBox="0 0 220 195" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", display: "block" }} aria-label="Muscle coverage map">
      {/* ── Labels ── */}
      <text x="55" y="8" textAnchor="middle" fontSize="6" fill="var(--muted)" fontWeight="700" letterSpacing="0.1em">FRONT</text>
      <text x="165" y="8" textAnchor="middle" fontSize="6" fill="var(--muted)" fontWeight="700" letterSpacing="0.1em">BACK</text>
      <line x1="110" y1="4" x2="110" y2="191" stroke="var(--line)" strokeWidth="0.6" strokeDasharray="3,3" />

      {/* ══ FRONT SILHOUETTE (cx=55) ══ */}
      <ellipse cx="55" cy="21" rx="11" ry="12" fill={bf} stroke={bs} strokeWidth="0.8" />
      <rect x="51" y="32" width="8" height="6" rx="3" fill={bf} stroke={bs} strokeWidth="0.8" />
      <path d="M36,37 C29,42 25,62 27,80 L29,88 L81,88 L83,80 C85,62 81,42 74,37 Z" fill={bf} stroke={bs} strokeWidth="0.8" />
      <rect x="35" y="85" width="40" height="15" rx="7" fill={bf} stroke={bs} strokeWidth="0.8" />
      <rect x="18" y="37" width="13" height="32" rx="6" fill={bf} stroke={bs} strokeWidth="0.8" transform="rotate(-6,24,53)" />
      <rect x="79" y="37" width="13" height="32" rx="6" fill={bf} stroke={bs} strokeWidth="0.8" transform="rotate(6,86,53)" />
      <rect x="15" y="67" width="11" height="25" rx="5" fill={bf} stroke={bs} strokeWidth="0.8" transform="rotate(-3,20,79)" />
      <rect x="84" y="67" width="11" height="25" rx="5" fill={bf} stroke={bs} strokeWidth="0.8" transform="rotate(3,89,79)" />
      <rect x="36" y="98" width="17" height="37" rx="8" fill={bf} stroke={bs} strokeWidth="0.8" />
      <rect x="57" y="98" width="17" height="37" rx="8" fill={bf} stroke={bs} strokeWidth="0.8" />
      <rect x="37" y="132" width="15" height="36" rx="7" fill={bf} stroke={bs} strokeWidth="0.8" />
      <rect x="58" y="132" width="15" height="36" rx="7" fill={bf} stroke={bs} strokeWidth="0.8" />

      {/* ── Front muscle regions ── */}
      <ellipse cx="36" cy="43" rx="10" ry="7" {...g("Shoulders")} />
      <ellipse cx="74" cy="43" rx="10" ry="7" {...g("Shoulders")} />
      <ellipse cx="55" cy="57" rx="18" ry="12" {...g("Chest")} />
      <ellipse cx="22" cy="54" rx="5.5" ry="11" {...g("Biceps")} transform="rotate(-6,22,54)" />
      <ellipse cx="88" cy="54" rx="5.5" ry="11" {...g("Biceps")} transform="rotate(6,88,54)" />
      <ellipse cx="55" cy="76" rx="13" ry="11" {...g("Core")} />
      <ellipse cx="44" cy="112" rx="9" ry="17" {...g("Quads")} />
      <ellipse cx="66" cy="112" rx="9" ry="17" {...g("Quads")} />
      <ellipse cx="43" cy="148" rx="6.5" ry="13" {...g("Calves")} />
      <ellipse cx="67" cy="148" rx="6.5" ry="13" {...g("Calves")} />

      {/* ══ BACK SILHOUETTE (cx=165) ══ */}
      <ellipse cx="165" cy="21" rx="11" ry="12" fill={bf} stroke={bs} strokeWidth="0.8" />
      <rect x="161" y="32" width="8" height="6" rx="3" fill={bf} stroke={bs} strokeWidth="0.8" />
      <path d="M146,37 C139,42 135,62 137,80 L139,88 L191,88 L193,80 C195,62 191,42 184,37 Z" fill={bf} stroke={bs} strokeWidth="0.8" />
      <rect x="145" y="85" width="40" height="15" rx="7" fill={bf} stroke={bs} strokeWidth="0.8" />
      <rect x="128" y="37" width="13" height="32" rx="6" fill={bf} stroke={bs} strokeWidth="0.8" transform="rotate(6,134,53)" />
      <rect x="189" y="37" width="13" height="32" rx="6" fill={bf} stroke={bs} strokeWidth="0.8" transform="rotate(-6,196,53)" />
      <rect x="125" y="67" width="11" height="25" rx="5" fill={bf} stroke={bs} strokeWidth="0.8" transform="rotate(3,130,79)" />
      <rect x="194" y="67" width="11" height="25" rx="5" fill={bf} stroke={bs} strokeWidth="0.8" transform="rotate(-3,199,79)" />
      <rect x="146" y="98" width="17" height="37" rx="8" fill={bf} stroke={bs} strokeWidth="0.8" />
      <rect x="167" y="98" width="17" height="37" rx="8" fill={bf} stroke={bs} strokeWidth="0.8" />
      <rect x="147" y="132" width="15" height="36" rx="7" fill={bf} stroke={bs} strokeWidth="0.8" />
      <rect x="168" y="132" width="15" height="36" rx="7" fill={bf} stroke={bs} strokeWidth="0.8" />

      {/* ── Back muscle regions ── */}
      <ellipse cx="146" cy="43" rx="10" ry="7" {...g("Shoulders")} />
      <ellipse cx="184" cy="43" rx="10" ry="7" {...g("Shoulders")} />
      <ellipse cx="165" cy="57" rx="22" ry="17" {...g("Back")} />
      <ellipse cx="132" cy="54" rx="5.5" ry="11" {...g("Triceps")} transform="rotate(6,132,54)" />
      <ellipse cx="198" cy="54" rx="5.5" ry="11" {...g("Triceps")} transform="rotate(-6,198,54)" />
      <ellipse cx="165" cy="90" rx="20" ry="11" {...g("Glutes")} />
      <ellipse cx="154" cy="113" rx="9" ry="17" {...g("Hamstrings")} />
      <ellipse cx="176" cy="113" rx="9" ry="17" {...g("Hamstrings")} />
      <ellipse cx="153" cy="149" rx="6.5" ry="14" {...g("Calves")} />
      <ellipse cx="177" cy="149" rx="6.5" ry="14" {...g("Calves")} />
    </svg>
  );
}

function MuscleCoverageCard({
  coverage,
  mode,
}: {
  coverage: Record<string, MuscleStatus>;
  mode: "history" | "session";
}) {
  const trainNext = HEATMAP_MUSCLES.filter((m) =>
    coverage[m] === "due" || coverage[m] === "none"
  );

  return (
    <div className="muscle-coverage-card">
      <div className="muscle-coverage-header">
        <p className="muscle-coverage-title">
          {mode === "session" ? "Muscles Trained" : "Muscle Coverage"}
        </p>
        {mode === "history" && (
          <div className="muscle-coverage-legend">
            <span className="muscle-legend-dot" style={{ background: "#3b82f6" }} />
            <span className="muscle-legend-label">Recent</span>
            <span className="muscle-legend-dot" style={{ background: "#93c5fd" }} />
            <span className="muscle-legend-label">Fading</span>
            <span className="muscle-legend-dot" style={{ background: "var(--line)", opacity: 0.5 }} />
            <span className="muscle-legend-label">Rest</span>
          </div>
        )}
      </div>
      <MuscleHeatmapSVG coverage={coverage} mode={mode} />
      {mode === "history" && trainNext.length > 0 && (
        <div className="muscle-train-next">
          <p className="muscle-train-next-label">Train next</p>
          <div className="muscle-train-next-chips">
            {trainNext.map((m) => (
              <span key={m} className="muscle-train-next-chip">{m}</span>
            ))}
          </div>
        </div>
      )}
      {mode === "session" && (
        <div className="muscle-train-next">
          <div className="muscle-train-next-chips">
            {HEATMAP_MUSCLES.filter((m) => coverage[m] === "fresh").map((m) => (
              <span key={m} className="muscle-train-next-chip muscle-chip-trained">{m}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Workout Report Page ───────────────────────────────────────────────────────
function WorkoutReportPage({
  data,
  onBack,
  onShare,
  resolvedTheme,
  onToggleTheme,
}: {
  data: SavedWorkoutData;
  onBack: () => void;
  onShare: () => void;
  resolvedTheme?: string;
  onToggleTheme?: () => void;
}) {
  const rewardLevelIcon: Record<LoggerReward["level"], string> = { session: "🏆", exercise: "⭐", set: "✓" };

  return (
    <main className="detail-page finish-workout-page" data-theme={resolvedTheme}>
      <div className="finish-hero">
        <div className="finish-hero-topbar">
          <button className="finish-hero-back" type="button" onClick={onBack} aria-label="Back">←</button>
          <div style={{ flex: 1, textAlign: "center" }}>
            <p className="finish-hero-eyebrow label" style={{ color: "rgba(255,255,255,0.7)", margin: 0 }}>Workout Report</p>
          </div>
          {resolvedTheme && onToggleTheme ? (
            <button type="button" className="theme-toggle-btn theme-toggle-btn--ghost" onClick={onToggleTheme} aria-label="Toggle theme">
              {resolvedTheme === "dark"
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
            </button>
          ) : <span style={{ width: 38 }} />}
        </div>
        <h1 className="finish-hero-title">{data.sessionName}</h1>
        <p className="finish-hero-date">{new Date(data.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</p>
        <div className="finish-hero-stats">
          <div className="finish-hero-stat"><span className="finish-hero-stat-label">Duration</span><strong className="finish-hero-stat-value">{data.duration}</strong></div>
          <div className="finish-hero-stat"><span className="finish-hero-stat-label">Sets</span><strong className="finish-hero-stat-value">{data.totalSets}</strong></div>
          <div className="finish-hero-stat"><span className="finish-hero-stat-label">Exercises</span><strong className="finish-hero-stat-value">{data.exerciseCount}</strong></div>
          {data.totalVolume > 0 && <div className="finish-hero-stat"><span className="finish-hero-stat-label">Volume</span><strong className="finish-hero-stat-value">{data.totalVolume.toFixed(0)} kg</strong></div>}
        </div>
      </div>

      <div className="finish-workout-body">
        <MuscleCoverageCard coverage={sessionToMuscleCoverage(data.exercises)} mode="session" />

        {data.rewards.length > 0 && (
          <section className="finish-workout-card">
            <p className="label" style={{ marginBottom: 8 }}>Rewards</p>
            <div className="reward-sheet-summary finish-workout-reward-summary">
              {data.rewardSummary.session > 0 && <span className="reward-summary-chip reward-summary-chip-session">{rewardLevelIcon.session} {data.rewardSummary.session}</span>}
              {data.rewardSummary.exercise > 0 && <span className="reward-summary-chip reward-summary-chip-exercise">{rewardLevelIcon.exercise} {data.rewardSummary.exercise}</span>}
              {data.rewardSummary.set > 0 && <span className="reward-summary-chip reward-summary-chip-set">{rewardLevelIcon.set} {data.rewardSummary.set}</span>}
            </div>
            <div className="reward-sheet-list finish-workout-reward-list" style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 10, marginTop: 8 }}>
              {data.rewards.map((r) => (
                <article key={r.id} className="reward-sheet-item">
                  <div className={`reward-sheet-icon reward-sheet-icon-${r.level}`}>{rewardLevelIcon[r.level]}</div>
                  <div><strong>{r.shortLabel}</strong><p>{r.detail}</p></div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="finish-workout-card">
          <p className="label" style={{ marginBottom: 8 }}>Exercises</p>
          {data.exercises.map((ex) => (
            <div key={ex.id} className="finish-exercise-row">
              <span className="finish-exercise-name">{ex.name}</span>
              <span className={`finish-exercise-sets${ex.loggedSets === 0 ? " is-unlogged" : ""}`}>
                {ex.loggedSets === 0 ? "not logged" : `${ex.loggedSets} sets`}
              </span>
            </div>
          ))}
        </section>

        {data.note && (
          <section className="finish-workout-card">
            <p className="label" style={{ marginBottom: 6 }}>Note</p>
            <p className="settings-note" style={{ margin: 0 }}>{data.note}</p>
          </section>
        )}

        <button className="primary-button finish-save-btn" type="button" onClick={onShare}>
          Share Summary
        </button>
      </div>
    </main>
  );
}

// ── Workout History Detail Page ───────────────────────────────────────────────
function WorkoutHistoryDetailPage({
  workout,
  onBack,
  onEdit,
  onShare,
  resolvedTheme,
  onToggleTheme,
}: {
  workout: SavedWorkoutData;
  onBack: () => void;
  onEdit?: () => void;
  onShare?: () => void;
  resolvedTheme?: string;
  onToggleTheme?: () => void;
}) {
  const isRepIQ = !!workout.repiqSourceKey;
  const [expandedExId, setExpandedExId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());

  function toggleExercise(id: string) {
    setExpandedExId(prev => {
      const next = prev === id ? null : id;
      if (next) {
        requestAnimationFrame(() => {
          rowRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      }
      return next;
    });
  }

  const SET_TYPE_LABEL: Record<string, string> = {
    warmup: "W", dropset: "D", "rest-pause": "RP", failure: "F", normal: "",
  };

  return (
    <main className="detail-page finish-workout-page" data-theme={resolvedTheme}>
      <div className="finish-hero">
        <div className="finish-hero-topbar">
          <button className="finish-hero-back" type="button" onClick={onBack} aria-label="Back">←</button>
          <div style={{ flex: 1, textAlign: "center" }}>
            <p className="finish-hero-eyebrow label" style={{ color: "rgba(255,255,255,0.7)", margin: 0 }}>
              {isRepIQ ? "RepIQ Session" : "Workout"}
            </p>
          </div>
          {resolvedTheme && onToggleTheme ? (
            <button type="button" className="theme-toggle-btn theme-toggle-btn--ghost" onClick={onToggleTheme} aria-label="Toggle theme">
              {resolvedTheme === "dark"
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
            </button>
          ) : <span style={{ width: 38 }} />}
        </div>
        <h1 className="finish-hero-title">{workout.sessionName}</h1>
        <p className="finish-hero-date">{new Date(workout.date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</p>
        <div className="finish-hero-stats">
          <div className="finish-hero-stat"><span className="finish-hero-stat-label">Duration</span><strong className="finish-hero-stat-value">{workout.duration}</strong></div>
          <div className="finish-hero-stat"><span className="finish-hero-stat-label">Sets</span><strong className="finish-hero-stat-value">{workout.totalSets}</strong></div>
          <div className="finish-hero-stat"><span className="finish-hero-stat-label">Exercises</span><strong className="finish-hero-stat-value">{workout.exerciseCount}</strong></div>
          {workout.totalVolume > 0 && <div className="finish-hero-stat"><span className="finish-hero-stat-label">Volume</span><strong className="finish-hero-stat-value">{workout.totalVolume.toFixed(0)} kg</strong></div>}
        </div>
      </div>

      <div className="finish-workout-body">
        <section className="finish-workout-card">
          <p className="label" style={{ marginBottom: 8 }}>Exercises Performed</p>
          {workout.exercises.map((ex) => {
            const isExpanded = expandedExId === ex.id;
            return (
              <div
                key={ex.id}
                ref={(el) => { if (el) rowRefs.current.set(ex.id, el); else rowRefs.current.delete(ex.id); }}
              >
                <button
                  type="button"
                  className={`finish-exercise-row hd-ex-row${isExpanded ? " is-expanded" : ""}`}
                  onClick={() => toggleExercise(ex.id)}
                  aria-expanded={isExpanded}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span className="finish-exercise-name">{ex.name}</span>
                    <span className="finish-exercise-muscle" style={{ fontSize: "0.76rem", color: "var(--muted)", display: "block", marginTop: 1 }}>{ex.primaryMuscle}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <div style={{ textAlign: "right" }}>
                      <span className={`finish-exercise-sets${ex.loggedSets === 0 ? " is-unlogged" : ""}`}>
                        {ex.loggedSets === 0 ? "not logged" : `${ex.loggedSets} sets`}
                      </span>
                      {ex.loggedVolume > 0 && (
                        <span style={{ fontSize: "0.76rem", color: "var(--muted)", display: "block", marginTop: 1 }}>{ex.loggedVolume.toFixed(0)} kg</span>
                      )}
                    </div>
                    <svg className={`hd-chevron${isExpanded ? " is-open" : ""}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                </button>
                {isExpanded && ex.sets && ex.sets.length > 0 && (
                  <div className="hd-sets-detail">
                    <div className="hd-sets-header">
                      <span>SET</span><span>KG</span><span>REPS</span><span>RPE</span>
                    </div>
                    {ex.sets.map((s, i) => {
                      const typeLabel = SET_TYPE_LABEL[s.setType] ?? s.setType;
                      return (
                        <div key={i} className="hd-set-row">
                          <span className="hd-set-num">{i + 1}{typeLabel ? <em>{typeLabel}</em> : null}</span>
                          <span>{s.weight > 0 ? s.weight : "—"}</span>
                          <span>{s.reps > 0 ? s.reps : "—"}</span>
                          <span>{s.rpe != null ? s.rpe : "—"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {workout.note && (
          <section className="finish-workout-card">
            <p className="label" style={{ marginBottom: 6 }}>Note</p>
            <p className="settings-note" style={{ margin: 0 }}>{workout.note}</p>
          </section>
        )}

        {(onEdit || onShare) && (
          <div className="history-detail-actions">
            {onEdit && (
              <button className="secondary-button history-detail-action-btn" type="button" onClick={onEdit}>
                Edit Session
              </button>
            )}
            {onShare && (
              <button className="primary-button history-detail-action-btn" type="button" onClick={onShare}>
                Share Summary
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

// ── Insights Page ─────────────────────────────────────────────────────────────
function InsightsPage({
  savedWorkouts,
  onOpenReport,
  onRedoWorkout,
  onSaveToMyWorkouts,
  onDeleteWorkout,
  resolvedTheme,
  onToggleTheme,
}: {
  savedWorkouts: SavedWorkoutData[];
  onOpenReport: (workout: SavedWorkoutData) => void;
  onRedoWorkout?: (workout: SavedWorkoutData) => void;
  onSaveToMyWorkouts?: (workout: SavedWorkoutData) => void;
  onDeleteWorkout?: (savedAt: string) => void;
  resolvedTheme?: string;
  onToggleTheme?: () => void;
}) {
  const [tab, setTab] = useState<"analyzer" | "reports">("reports");
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  function handleSave(w: SavedWorkoutData) {
    onSaveToMyWorkouts?.(w);
    setSavedToast(w.savedAt);
    setTimeout(() => setSavedToast(null), 2200);
  }

  return (
    <main className="shell selector-shell" data-theme={resolvedTheme}>
      <section className="app-shell selector-page">
        <header className="selector-header">
          <div>
            <p className="label">REPIQ</p>
            <h1>Insights</h1>
          </div>
          {resolvedTheme && onToggleTheme && (
            <button type="button" className="theme-toggle-btn" onClick={onToggleTheme} aria-label="Toggle theme">
              {resolvedTheme === "dark"
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
            </button>
          )}
        </header>

        <div className="planner-tabs" role="tablist" aria-label="Insights sections">
          <div className="planner-tabs-track">
            <button type="button" className={tab === "reports" ? "is-active" : ""} aria-selected={tab === "reports"} onClick={() => setTab("reports")}>Reports</button>
            <button type="button" className={tab === "analyzer" ? "is-active" : ""} aria-selected={tab === "analyzer"} onClick={() => setTab("analyzer")}>Analyzer</button>
          </div>
        </div>

        {tab === "reports" ? (
          <section className="planner-section">
            {savedWorkouts.length === 0 ? (
              <div className="planner-builder-stub">
                <p className="planner-empty-title">No workouts logged yet</p>
                <p className="planner-empty-sub">Complete a workout to see your reports here.</p>
              </div>
            ) : (
              <div className="plan-list">
                {savedWorkouts.map((w) => {
                  const isRepIQ = !!w.repiqSourceKey;
                  const alreadySaved = savedToast === w.savedAt;
                  return (
                    <article key={w.savedAt} className="report-card">
                      <div className="report-card-header" onClick={() => onOpenReport(w)}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                            <p className="report-card-meta">{new Date(w.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</p>
                            {isRepIQ && <span className="report-card-repiq-badge">RepIQ Plan</span>}
                          </div>
                          <p className="report-card-name">{w.sessionName}</p>
                          <p className="report-card-stats">{w.duration} · {w.totalSets} sets · {w.exerciseCount} exercises</p>
                        </div>
                        <span className="report-card-chevron">›</span>
                      </div>
                      <div className="report-card-actions">
                        {!isRepIQ && onRedoWorkout && (
                          <button
                            type="button"
                            className="report-card-action-btn"
                            onClick={() => onRedoWorkout(w)}
                          >
                            Redo
                          </button>
                        )}
                        <button
                          type="button"
                          className="report-card-action-btn"
                          onClick={() => handleSave(w)}
                          disabled={alreadySaved}
                        >
                          {alreadySaved ? "Saved ✓" : "Save to My Workouts"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
          <section className="planner-section">
            <div className="planner-builder-stub">
              <p className="planner-empty-title">Analyzer coming soon</p>
              <p className="planner-empty-sub">Trends, plateaus, and volume tracking will appear here.</p>
            </div>
          </section>
        )}
        {deleteConfirmId && (() => {
          const w = savedWorkouts.find(x => x.savedAt === deleteConfirmId);
          return (
            <div className="plan-delete-confirm-overlay" onClick={() => setDeleteConfirmId(null)}>
              <div className="plan-delete-confirm-sheet" onClick={e => e.stopPropagation()}>
                <p className="plan-delete-confirm-title">Delete "{w?.sessionName}"?</p>
                <p className="plan-delete-confirm-body">This will be permanently removed from your history. You can&apos;t undo this.</p>
                <div className="plan-delete-confirm-actions">
                  <button type="button" className="secondary-button" onClick={() => setDeleteConfirmId(null)}>Cancel</button>
                  <button type="button" className="danger-button" onClick={() => { const id = deleteConfirmId; setDeleteConfirmId(null); onDeleteWorkout?.(id); }}>Delete</button>
                </div>
              </div>
            </div>
          );
        })()}
      </section>
    </main>
  );
}

// ── Profile Page ──────────────────────────────────────────────────────────────
function ProfilePage({
  onBack,
  resolvedTheme,
  onToggleTheme,
}: {
  onBack: () => void;
  resolvedTheme?: string;
  onToggleTheme?: () => void;
}) {
  return (
    <main className="profile-page" data-theme={resolvedTheme}>
      <header className="profile-header">
        <button className="back-nav-button detail-back-button" type="button" onClick={onBack} aria-label="Back">←</button>
        <span className="profile-header-title">Profile</span>
        {resolvedTheme && onToggleTheme ? (
          <button type="button" className="theme-toggle-btn" onClick={onToggleTheme} aria-label="Toggle theme">
            {resolvedTheme === "dark"
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
          </button>
        ) : <span style={{ width: 38 }} aria-hidden="true" />}
      </header>

      <div className="profile-section">
        <p className="profile-section-label">Settings</p>
        <div className="profile-list">
          {[
            { label: "Preferences", sub: "Theme, units, display" },
            { label: "Account", sub: "Manage your account" },
            { label: "Import / Export", sub: "Backup and restore data" },
          ].map(({ label, sub }) => (
            <button key={label} type="button" className="profile-row">
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: "0.92rem" }}>{label}</p>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--muted)" }}>{sub}</p>
              </div>
              <span className="profile-row-chevron">›</span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}

// ── Home page helpers ─────────────────────────────────────────────────────────

function computeStreak(workouts: SavedWorkoutData[]): number {
  if (workouts.length === 0) return 0;
  const today = new Date();
  const msPerDay = 86400000;
  const todayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const dateMsSet = new Set(
    workouts.map((w) => {
      const ds = (w.date ?? w.savedAt).slice(0, 10);
      const [y, mo, d] = ds.split("-").map(Number);
      return Date.UTC(y, mo - 1, d);
    })
  );
  const startMs = dateMsSet.has(todayMs)
    ? todayMs
    : dateMsSet.has(todayMs - msPerDay)
      ? todayMs - msPerDay
      : null;
  if (startMs === null) return 0;
  let streak = 0;
  let cur = startMs;
  while (dateMsSet.has(cur)) { streak++; cur -= msPerDay; }
  return streak;
}

function getThisWeekStats(workouts: SavedWorkoutData[]): {
  sessions: number; sets: number; volume: number; activeDayNumbers: number[];
} {
  const today = new Date();
  const dow = today.getDay(); // 0=Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const mondayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + mondayOffset);
  const sundayMs = mondayMs + 6 * 86400000;
  const msPerDay = 86400000;
  const thisWeek = workouts.filter((w) => {
    const ds = (w.date ?? w.savedAt).slice(0, 10);
    const [y, mo, d] = ds.split("-").map(Number);
    const wMs = Date.UTC(y, mo - 1, d);
    return wMs >= mondayMs && wMs <= sundayMs;
  });
  const seenDays = new Set<number>();
  for (const w of thisWeek) {
    const ds = (w.date ?? w.savedAt).slice(0, 10);
    const [y, mo, d] = ds.split("-").map(Number);
    seenDays.add(Math.floor((Date.UTC(y, mo - 1, d) - mondayMs) / msPerDay));
  }
  return {
    sessions: thisWeek.length,
    sets: thisWeek.reduce((s, w) => s + (w.totalSets ?? 0), 0),
    volume: thisWeek.reduce((s, w) => s + (w.totalVolume ?? 0), 0),
    activeDayNumbers: [...seenDays],
  };
}

function getRelativeDate(dateStr: string): string {
  const today = new Date();
  const todayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, mo, d] = dateStr.slice(0, 10).split("-").map(Number);
  const diff = Math.round((todayMs - Date.UTC(y, mo - 1, d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  if (diff < 14) return "Last week";
  return `${Math.round(diff / 7)} weeks ago`;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function App() {
  const storedPlanBuilderState = getStoredPlanBuilderDraft();
  const [appView, setAppView] = useState<AppView>("home");
  const [hasActiveWorkout, setHasActiveWorkout] = useState(false);
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [themePreference, setThemePreference] = useState<ThemePreference>(getStoredThemePreference);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(getSystemTheme);
  const [exercises, setExercises] = useState<ExerciseDraft[]>([]);
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);
  const [userActiveExerciseId, setUserActiveExerciseId] = useState<string | null>(null);
  const [detailsExerciseId, setDetailsExerciseId] = useState<string | null>(null);
  const [detailsScrollTarget, setDetailsScrollTarget] = useState<"top" | "bottom">("top");
  const [musclesExerciseId, setMusclesExerciseId] = useState<string | null>(null);
  const [musclesPageMode, setMusclesPageMode] = useState<"overall" | "exercise">("exercise");
  const [detailsTab, setDetailsTab] = useState<DetailTab>("summary");
  const [menuExerciseId, setMenuExerciseId] = useState<string | null>(null);
  const [workoutMenuOpen, setWorkoutMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [reorderDragId, setReorderDragId] = useState<string | null>(null);
  const [collapsedExerciseIds, setCollapsedExerciseIds] = useState<string[]>([]);
  const [focusedExpandedExerciseId, setFocusedExpandedExerciseId] = useState<string | null>(null);
  const [guidanceCollapsed, setGuidanceCollapsed] = useState(false);
  const [timingOpen, setTimingOpen] = useState(false);
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const [finishWorkoutDraft, setFinishWorkoutDraft] = useState<FinishWorkoutDraft | null>(null);
  const [savedWorkoutData, setSavedWorkoutData] = useState<SavedWorkoutData | null>(null);
  const [workoutPlans, setWorkoutPlans] = useState<WorkoutPlan[]>(getStoredWorkoutPlans);
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  const [planBuilderDraft, setPlanBuilderDraft] = useState<WorkoutPlan | null>(
    storedPlanBuilderState?.draft ?? null
  );
  const [planBuilderMode, setPlanBuilderMode] = useState<PlanBuilderMode>(
    storedPlanBuilderState?.mode ?? "create"
  );
  const [plannerView, setPlannerView] = useState<"mine" | "library" | "generate">("mine");
  const [activePlanSession, setActivePlanSession] = useState<ActivePlanSession>(null);
  const [discardReturnView, setDiscardReturnView] = useState<"home" | "planner">("home");
  const [reportWorkout, setReportWorkout] = useState<SavedWorkoutData | null>(null);
  const [historyDetailWorkout, setHistoryDetailWorkout] = useState<SavedWorkoutData | null>(null);
  const [historyDetailReturnView, setHistoryDetailReturnView] = useState<AppView>("planner");
  const [historyDetailPlanContext, setHistoryDetailPlanContext] = useState<{ weekIdx: number; dayIdx: number; label: string; sessionNum: number } | null>(null);
  const [savedWorkoutsList, setSavedWorkoutsList] = useState<SavedWorkoutData[]>(getStoredSavedWorkouts);
  const [templateApplyPromptImages, setTemplateApplyPromptImages] = useState<WorkoutMediaAsset[] | null>(null);
  const [tagPlanId, setTagPlanId] = useState<string | null>(null);
  const [tagPlanDraft, setTagPlanDraft] = useState<string[]>([]);
  const [tagPlanSearch, setTagPlanSearch] = useState("");
  const [builderAddExerciseOpen, setBuilderAddExerciseOpen] = useState(false);
  const [trayDiscardOpen, setTrayDiscardOpen] = useState(false);
  const [supersetSheetExerciseId, setSupersetSheetExerciseId] = useState<string | null>(null);
  const [smartReplaceExerciseId, setSmartReplaceExerciseId] = useState<string | null>(null);
  const [supersetSelectionIds, setSupersetSelectionIds] = useState<string[]>([]);
  const [exerciseRestDefaults, setExerciseRestDefaults] = useState<ExerciseRestDefaults>({});
  const [customExercises, setCustomExercises] = useState<ExerciseDraft[]>(getStoredCustomExercises);
  const [editingCustomExerciseId, setEditingCustomExerciseId] = useState<string | null>(null);
  const [noteEditorExerciseId, setNoteEditorExerciseId] = useState<string | null>(null);
  const [noteEditorValue, setNoteEditorValue] = useState("");
  const [restTimerEditorExerciseId, setRestTimerEditorExerciseId] = useState<string | null>(null);
  const [restTimerEditorValue, setRestTimerEditorValue] = useState("");
  const [saveRestTimerToDefault, setSaveRestTimerToDefault] = useState(false);
  const [settings, setSettings] = useState<WorkoutSettings>(getStoredWorkoutSettings);
  const [workoutMeta, setWorkoutMeta] = useState<WorkoutMeta>(defaultWorkoutMeta);
  const [setTypePickerRowId, setSetTypePickerRowId] = useState<string | null>(null);
  const [swipeState, setSwipeState] = useState<SwipeState>(createInitialSwipeState);
  const swipeStateRef = useRef<SwipeState>(createInitialSwipeState());
  const [revealedDeleteRowId, setRevealedDeleteRowId] = useState<string | null>(null);
  const [state, setState] = useState<FlowState>(defaultState);
  const [psychProfile, setPsychProfile] = useState<UserPsychProfile>(getStoredPsychProfile);
  const onboardingComplete = psychProfile.onboardingCompletedAt !== null;
  const [showPostOnboarding, setShowPostOnboarding] = useState(false);
  const [repiqPlan, setRepiqPlan] = useState<RepIQPlan | null>(getStoredRepIQPlan);
  const [repiqUpdatePrompt, setRepiqUpdatePrompt] = useState<{ weekIdx: number; dayIdx: number; completedExerciseIds: string[] } | null>(null);
  // tracks which repiq session is currently being logged, so we can tag the saved workout
  const [activeRepIQSessionKey, setActiveRepIQSessionKey] = useState<string | null>(null);
  // no cross-plan modal — plan is flagged silently and user is prompted contextually
  const DEV_MODE = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("dev");
  const [showDevPage, setShowDevPage] = useState(DEV_MODE);
  const [devBypassGate, setDevBypassGate] = useState(false);
  const [plannerInitialMode, setPlannerInitialMode] = useState<"repiq" | "custom">("repiq");
  const [inlineGuidanceOpen, setInlineGuidanceOpen] = useState(false);
  // Session-level guidance toggles — initialized from settings at session start, never written back to settings
  const [sessionGuidanceInline, setSessionGuidanceInline] = useState(() => settings.guidanceInline);
  const [sessionGuidanceTopStrip, setSessionGuidanceTopStrip] = useState(() => settings.guidanceTopStrip);
  const [showTopGuidance, setShowTopGuidance] = useState(false);
  const [topGuidanceExpanded, setTopGuidanceExpanded] = useState(false);
  const [topGuidancePullDistance, setTopGuidancePullDistance] = useState(0);
  const [activeRestTimer, setActiveRestTimer] = useState<ActiveRestTimer>(null);
  const [restDockMinimized, setRestDockMinimized] = useState(false);
  const [showBottomRestDock, setShowBottomRestDock] = useState(true);
  const [loggerRewards, setLoggerRewards] = useState<LoggerReward[]>([]);
  const [rewardSheetOpen, setRewardSheetOpen] = useState(false);
  const titleHoldTimer = useRef<number | null>(null);
  const titleHoldTriggered = useRef(false);
  const pullStartY = useRef<number | null>(null);
  const pullPointerId = useRef<number | null>(null);
  const pullGestureActive = useRef(false);
  const guidancePullStartY = useRef<number | null>(null);
  const guidancePullActive = useRef(false);
  const topStripClosedRef = useRef(false);
  const [pullDownDistance, setPullDownDistance] = useState(0);
  const topSectionRef = useRef<HTMLDivElement | null>(null);

  function updateSwipeState(nextState: SwipeState | ((current: SwipeState) => SwipeState)) {
    const resolvedState =
      typeof nextState === "function" ? nextState(swipeStateRef.current) : nextState;
    swipeStateRef.current = resolvedState;
    setSwipeState(resolvedState);
  }

  const allExercisesComplete = getFirstIncompleteExerciseId(exercises) === null;
  const resolvedActiveExerciseId =
    allExercisesComplete ? null : activeExerciseId ?? getDefaultActiveExerciseId(exercises);
  const activeExercise =
    (resolvedActiveExerciseId
      ? exercises.find((exercise) => exercise.id === resolvedActiveExerciseId)
      : null) ?? exercises[0] ?? null;
  const activeExerciseIndex = resolvedActiveExerciseId
    ? exercises.findIndex((exercise) => exercise.id === resolvedActiveExerciseId)
    : -1;
  const resolvedFocusedExpandedExerciseId =
    focusedExpandedExerciseId &&
    exercises.some(
      (exercise) =>
        exercise.id === focusedExpandedExerciseId && !collapsedExerciseIds.includes(exercise.id)
    )
      ? focusedExpandedExerciseId
      : null;
  const activeCustomExercises = useMemo(
    () => customExercises.filter((exercise) => exercise.libraryStatus !== "archived"),
    [customExercises]
  );
  const existingUserTags = useMemo(() => getExistingUserTags(workoutPlans), [workoutPlans]);
  const availableExerciseTemplates = useMemo(
    () => [...exerciseTemplates, ...activeCustomExercises],
    [activeCustomExercises]
  );
  const editingCustomExercise =
    customExercises.find((exercise) => exercise.id === editingCustomExerciseId) ?? null;
  const detailsCustomExercise =
    customExercises.find((exercise) => exercise.id === detailsExerciseId) ?? null;
  const detailsExercise =
    exercises.find((exercise) => exercise.id === detailsExerciseId) ??
    customExercises.find((exercise) => exercise.id === detailsExerciseId) ??
    availableExerciseTemplates.find((exercise) => exercise.id === detailsExerciseId) ??
    null;
  const musclesExercise =
    exercises.find((exercise) => exercise.id === musclesExerciseId) ?? null;
  const supersetSheetExercise =
    exercises.find((exercise) => exercise.id === supersetSheetExerciseId) ?? null;
  const restTimerEditorExercise =
    exercises.find((exercise) => exercise.id === restTimerEditorExerciseId) ?? null;
  const activeMenuExercise =
    exercises.find((exercise) => exercise.id === menuExerciseId) ?? null;
  const activeRestExercise =
    activeRestTimer ? exercises.find((exercise) => exercise.id === activeRestTimer.exerciseId) ?? null : null;
  const resolvedTheme = themePreference === "system" ? systemTheme : themePreference;
  const hasGuidance = state.status !== "idle" || state.suggestion || state.message;
  const guidanceTip =
    state.status === "loading"
      ? "Reviewing your latest logged sets before suggesting the next move."
      : state.suggestion?.what ?? fallbackGuidanceTip;
  const guidanceWhy =
    state.status === "loading"
      ? "RepIQ is checking your completed sets against recent sessions so the next prompt reflects your actual workout pattern, not just the plan on paper."
      : state.suggestion?.why ?? state.message ?? fallbackGuidanceWhy;
  const hasExercises = exercises.length > 0;
  const hasStartedExercise = exercises.some((exercise) => isExerciseStarted(exercise));
  const showTopGuidanceSurface =
    hasExercises && sessionGuidanceTopStrip && showTopGuidance && !allExercisesComplete;

  const activeRestSeconds =
    activeRestTimer
      ? activeRestTimer.pausedRemainingSeconds ??
        Math.max(0, Math.ceil(((activeRestTimer.endAt ?? 0) - clockTick) / 1000))
      : 0;
  const stickyRestProgressPercent =
    activeRestTimer && activeRestTimer.totalSeconds > 0
      ? Math.max(0, Math.min(100, (activeRestSeconds / activeRestTimer.totalSeconds) * 100))
      : 0;
  const showStickyRestDock =
    showBottomRestDock && activeRestTimer !== null && activeRestSeconds > 0;

  const workoutSummary = useMemo(() => {
    return exercises.reduce(
      (summary, exercise) => {
        const lastSession = exercise.history[exercise.history.length - 1];
        const completed = buildCompletedSets(
          exercise.draftSets,
          lastSession,
          settings.carryForwardDefaults,
          getExerciseMeasurementType(exercise)
        ).resolvedSets;
        return {
          sets: summary.sets + completed.length,
          volume:
            summary.volume +
            completed.reduce((total, set) => total + set.weight * set.reps, 0)
        };
      },
      { sets: 0, volume: 0 }
    );
  }, [exercises, settings.carryForwardDefaults]);

  const incompleteSetCount = useMemo(
    () =>
      exercises.reduce(
        (count, exercise) => count + exercise.draftSets.filter((set) => !set.done).length,
        0
      ),
    [exercises]
  );

  const completedSetCount = useMemo(
    () =>
      exercises.reduce(
        (count, exercise) => count + exercise.draftSets.filter((set) => set.done).length,
        0
      ),
    [exercises]
  );

  const rewardSummary = useMemo(() => {
    return loggerRewards.reduce(
      (summary, reward) => {
        summary.total += 1;
        summary[reward.level] += 1;
        return summary;
      },
      { total: 0, set: 0, exercise: 0, session: 0 }
    );
  }, [loggerRewards]);

  const derivedDuration = useMemo(
    () => formatElapsedDuration(workoutMeta.date, workoutMeta.startTime, workoutMeta.startInstant),
    [clockTick, workoutMeta.date, workoutMeta.startTime, workoutMeta.startedMinutesAgo, workoutMeta.startInstant]
  );

  useEffect(() => {
    if (planBuilderDraft && planBuilderMode !== "edit") {
      persistPlanBuilderDraft(planBuilderDraft, planBuilderMode);
      return;
    }
    persistPlanBuilderDraft(null, "create");
  }, [planBuilderDraft, planBuilderMode]);

  useEffect(() => {
    if (!resolvedFocusedExpandedExerciseId) {
      return;
    }

    window.requestAnimationFrame(() => {
      const card = document.querySelector<HTMLElement>(
        `[data-exercise-card-id="${resolvedFocusedExpandedExerciseId}"]`
      );
      card?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    });
  }, [resolvedFocusedExpandedExerciseId]);

  function buildPlanFromCurrentExercises(basePlan?: WorkoutPlan | null): WorkoutPlan {
    const now = new Date().toISOString();
    return {
      id: basePlan?.id ?? `plan-${Date.now()}`,
      name: workoutMeta.sessionName.trim() || basePlan?.name || generateWorkoutName(exercises),
      tag: basePlan?.tag ?? "",
      userTags: basePlan?.userTags ?? [],
      note: basePlan?.note ?? "",
      exercises: exercises.map((exercise) => ({
        exerciseId:
          availableExerciseTemplates.find(
            (template) => exercise.id === template.id || exercise.id.startsWith(`${template.id}-`)
          )?.id ?? exercise.id,
        setCount: exercise.draftSets.length,
        restTimer: exercise.restTimer,
        note: exercise.note.trim() || undefined
      })),
      createdAt: basePlan?.createdAt ?? now,
      updatedAt: now
    };
  }

  function activeWorkoutHasTemplateChanges() {
    if (activePlanSession?.source !== "saved" || !activePlanSession.originalPlan) {
      return false;
    }
    const currentPlan = buildPlanFromCurrentExercises(activePlanSession.originalPlan);
    return JSON.stringify(normalizePlanForComparison(currentPlan)) !== JSON.stringify(normalizePlanForComparison(activePlanSession.originalPlan));
  }

  function finalizeFinishedWorkoutSave(images: WorkoutMediaAsset[], applyTemplateChanges: boolean) {
    if (!finishWorkoutDraft) return;

    if (applyTemplateChanges && activePlanSession?.source === "saved" && activePlanSession.originalPlan) {
      const updatedPlan = buildPlanFromCurrentExercises(activePlanSession.originalPlan);
      savePlan(updatedPlan);
    }

    const completedCustomSessions = exercises.flatMap((exercise) => {
      const matchingTemplate = customExercises.find(
        (template) => exercise.id === template.id || exercise.id.startsWith(`${template.id}-`)
      );
      if (!matchingTemplate) {
        return [];
      }

      const lastSession = exercise.history[exercise.history.length - 1];
      const completedSets = buildCompletedSets(
        exercise.draftSets,
        lastSession,
        settings.carryForwardDefaults,
        getExerciseMeasurementType(exercise)
      ).resolvedSets;

      if (completedSets.length === 0) {
        return [];
      }

      return [
        {
          templateId: matchingTemplate.id,
          session: {
            date: workoutMeta.date,
            exercise: matchingTemplate.name,
            session_key: `${matchingTemplate.id}-${Date.now()}-${exercise.id}`,
            sets: completedSets
          } satisfies ExerciseHistorySession
        }
      ];
    });

    if (completedCustomSessions.length > 0) {
      setCustomExercises((current) =>
        current.map((exercise) => {
          const matchingSessions = completedCustomSessions.filter(
            (entry) => entry.templateId === exercise.id
          );
          if (matchingSessions.length === 0) {
            return exercise;
          }

          return cloneExerciseDraft(exercise, {
            history: [...exercise.history, ...matchingSessions.map((entry) => entry.session)]
          });
        })
      );
    }

    const saved: SavedWorkoutData = {
      ...finishWorkoutDraft,
      images,
      savedAt: new Date().toISOString(),
      ...(activeRepIQSessionKey ? { repiqSourceKey: activeRepIQSessionKey } : {}),
    };
    persistSavedWorkout(saved);

    // ── Passive psych capture (zero user friction) ──────────────────────────
    // Automatically record behavioral signals for every completed session.
    // This seeds the V2 psychological intelligence layer from day one.
    const psychProfile = getStoredPsychProfile();
    if (psychProfile.capturePassiveBehavior) {
      const source: SessionSource = activePlanSession
        ? activePlanSession.source === "saved" ? "plan"
          : activePlanSession.source === "library" ? "template"
          : "generated"
        : "quick";
      const signals = buildSessionBehaviorSignals(
        saved.savedAt,
        {
          date: saved.date,
          startInstant: workoutMeta.startInstant,
          duration: saved.duration,
          exerciseCount: saved.exerciseCount,
          totalSets: saved.totalSets,
        },
        activePlanSession?.originalPlan
          ? { id: activePlanSession.originalPlan.id, exercises: activePlanSession.originalPlan.exercises }
          : null,
        source,
        0,   // TODO: wire restTimerUseCount from logger state
        0,   // TODO: wire midSessionExercisesAdded from logger state
      );
      persistSessionBehavior(signals);
      // Link today's readiness entry to this session if one was captured
      const todayReadiness = getTodayReadiness();
      if (todayReadiness && !todayReadiness.followedBySessionId) {
        persistDailyReadiness({ ...todayReadiness, followedBySessionId: saved.savedAt });
      }
    }
    // ── End passive psych capture ───────────────────────────────────────────

    setSavedWorkoutData(saved);
    setReportWorkout(saved);
    setSavedWorkoutsList(getStoredSavedWorkouts());
    setTemplateApplyPromptImages(null);
    // ── RepIQ plan day completion ──────────────────────────────────────────────
    const snapshotSession = activePlanSession;
    setActivePlanSession(null);
    resetWorkout();
    setHasActiveWorkout(false);
    if (snapshotSession?.source === "repiq" && repiqPlan) {
      const { weekIdx, dayIdx } = snapshotSession;
      const completedAt = new Date().toISOString();
      const updatedWeeks = repiqPlan.weeks.map((week, wi) => {
        if (wi !== weekIdx) return week;
        const updatedDays = week.days.map((day, di) => {
          if (di !== dayIdx) return day;
          return { ...day, completedAt };
        });
        const weekDone = updatedDays.every((d) => d.completedAt !== null);
        return { ...week, days: updatedDays, isCompleted: weekDone };
      });
      // Advance currentWeekIndex if current week just completed
      const currentWeekCompleted = updatedWeeks[repiqPlan.currentWeekIndex]?.isCompleted;
      const newCurrentWeekIndex = currentWeekCompleted
        ? Math.min(repiqPlan.currentWeekIndex + 1, repiqPlan.weeks.length - 1)
        : repiqPlan.currentWeekIndex;
      // Volume compensation: add deficit sets to next sessions targeting same muscles
      const compensatedPlan = computeVolumeCompensation(
        { ...repiqPlan, weeks: updatedWeeks, currentWeekIndex: newCurrentWeekIndex },
        weekIdx,
        dayIdx,
        exercises,
        availableExerciseTemplates
      );
      persistRepIQPlan(compensatedPlan);
      setRepiqPlan(compensatedPlan);
      // Check if today's exercises differ from plan
      const planDay = repiqPlan.weeks[weekIdx]?.days[dayIdx];
      const planExIds = new Set(planDay?.exercises.map((e) => e.exerciseId) ?? []);
      const actualExIds = exercises.map((e) => e.id);
      const hasDiff = actualExIds.some((id) => !planExIds.has(id)) || planExIds.size !== actualExIds.length;
      if (hasDiff) {
        setRepiqUpdatePrompt({ weekIdx, dayIdx, completedExerciseIds: actualExIds });
      }
    } else if (!activeRepIQSessionKey && repiqPlan && repiqPlan.status !== "paused") {
      // Non-plan workout completed while RepIQ plan is active.
      // Only flag if it occurred after the last plan regeneration (i.e., not already accounted for).
      const lastRegen = repiqPlan.lastRegeneratedAt ?? repiqPlan.generatedAt;
      if (saved.savedAt > lastRegen) {
        const updatedPlan: RepIQPlan = {
          ...repiqPlan,
          needsReview: true,
          extraVolumeCount: (repiqPlan.extraVolumeCount ?? 0) + 1,
          extraVolumeWorkoutIds: [...(repiqPlan.extraVolumeWorkoutIds ?? []), saved.savedAt],
        };
        persistRepIQPlan(updatedPlan);
        setRepiqPlan(updatedPlan);
      }
    }
    setActiveRepIQSessionKey(null);
    setAppView("report");
  }

  function buildFinishWorkoutDraft(ignoredIncompleteSets: number): FinishWorkoutDraft {
    const exerciseSummaries = exercises
      .map((exercise) => {
        const lastSession = exercise.history[exercise.history.length - 1];
        const completedSets = buildCompletedSets(
          exercise.draftSets,
          lastSession,
          settings.carryForwardDefaults,
          getExerciseMeasurementType(exercise)
        ).resolvedSets;

        return {
          id: exercise.id,
          name: exercise.name,
          primaryMuscle: exercise.primaryMuscle,
          loggedSets: completedSets.length,
          loggedVolume: sumSessionVolume(completedSets),
          sets: completedSets.map(s => ({ weight: s.weight, reps: s.reps, rpe: s.rpe ?? null, setType: s.set_type })),
        };
      })
      ;

    const rewardSnapshot = [...loggerRewards];
    const rewardSnapshotSummary = summarizeRewards(rewardSnapshot);

    let takeawayTitle = "Workout ready to save";
    let takeawayBody =
      "RepIQ has captured this workout review. Save it now, and richer report generation can build on top of this clean log.";

    if (rewardSnapshotSummary.total > 0) {
      takeawayTitle =
        rewardSnapshotSummary.total === 1
          ? "One clear progress signal"
          : `${rewardSnapshotSummary.total} progress wins spotted`;
      takeawayBody =
        rewardSnapshotSummary.exercise > 0
          ? `You earned ${rewardSnapshotSummary.exercise} exercise-level and ${rewardSnapshotSummary.set} set-level rewards in this workout.`
          : `You earned ${rewardSnapshotSummary.set} set-level ${rewardSnapshotSummary.set === 1 ? "reward" : "rewards"} in this workout.`;
    } else if (exerciseSummaries.length > 0) {
      takeawayTitle = "Clean workout log";
      takeawayBody = `${exerciseSummaries.length} ${
        exerciseSummaries.length === 1 ? "exercise was" : "exercises were"
      } logged with ${workoutSummary.sets} completed ${
        workoutSummary.sets === 1 ? "set" : "sets"
      } ready to save.`;
    }

    const elapsedSeconds = workoutMeta.startInstant
      ? Math.floor((Date.now() - Date.parse(workoutMeta.startInstant)) / 1000)
      : 0;

    return {
      sessionName: workoutMeta.sessionName.trim() || generateWorkoutName(exercises),
      note: "",
      date: workoutMeta.date,
      duration: derivedDuration,
      durationSeconds: elapsedSeconds,
      totalVolume: workoutSummary.volume,
      totalSets: workoutSummary.sets,
      exerciseCount: exercises.length,
      loggedExerciseCount: exerciseSummaries.length,
      ignoredIncompleteSets,
      exercises: exerciseSummaries,
      rewards: rewardSnapshot,
      rewardSummary: rewardSnapshotSummary,
      takeawayTitle,
      takeawayBody,
      images: []
    };
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = (event?: MediaQueryListEvent) => {
      setSystemTheme(event?.matches ?? mediaQuery.matches ? "dark" : "light");
    };

    updateTheme();
    mediaQuery.addEventListener("change", updateTheme);

    return () => mediaQuery.removeEventListener("change", updateTheme);
  }, []);

  useEffect(() => {
    setLoggerRewards(recomputeLoggerRewards(exercises, settings.carryForwardDefaults));
  }, [exercises, settings.carryForwardDefaults]);

  useEffect(() => {
    if (!hasActiveWorkout) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setClockTick(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [hasActiveWorkout]);

  useEffect(() => {
    if (activeRestTimer && activeRestTimer.pausedRemainingSeconds === null && activeRestSeconds <= 0) {
      setActiveRestTimer(null);
    }
  }, [activeRestSeconds, activeRestTimer]);

  useEffect(() => {
    setRestDockMinimized(false);
  }, [activeRestTimer?.exerciseId]);

  useEffect(() => {
    if (!showStickyRestDock) {
      setRestDockMinimized(false);
    }
  }, [showStickyRestDock]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
    window.localStorage.setItem(themeStorageKey, themePreference);
  }, [resolvedTheme, themePreference]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(workoutSettingsStorageKey, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(customExercisesStorageKey, JSON.stringify(customExercises));
  }, [customExercises]);

  useEffect(() => {
    if (typeof document === "undefined" || !setTypePickerRowId) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof HTMLElement &&
        !event.target.closest("[data-set-type-picker]") &&
        !event.target.closest("[data-set-type-trigger]")
      ) {
        setSetTypePickerRowId(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [setTypePickerRowId]);

  useEffect(() => {
    if (!pullGestureActive.current) {
      return undefined;
    }

    return () => {
      pullGestureActive.current = false;
      pullStartY.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !sessionGuidanceTopStrip) {
      setShowTopGuidance(false);
      setTopGuidanceExpanded(false);
      setTopGuidancePullDistance(0);
      return undefined;
    }

    const updateTopGuidanceVisibility = () => {
      const topSectionBottom = topSectionRef.current?.getBoundingClientRect().bottom ?? 0;
      if (topSectionBottom >= 0) {
        // Scrolled back up past the top section — reset explicit-close flag
        topStripClosedRef.current = false;
      }
      if (!topStripClosedRef.current) {
        setShowTopGuidance(topSectionBottom < 0);
      }
    };

    updateTopGuidanceVisibility();
    window.addEventListener("scroll", updateTopGuidanceVisibility, { passive: true });
    window.addEventListener("resize", updateTopGuidanceVisibility);

    return () => {
      window.removeEventListener("scroll", updateTopGuidanceVisibility);
      window.removeEventListener("resize", updateTopGuidanceVisibility);
    };
  }, [hasGuidance, sessionGuidanceTopStrip]);

  useEffect(() => {
    if (!showTopGuidance) {
      setTopGuidanceExpanded(false);
      setTopGuidancePullDistance(0);
    }
  }, [showTopGuidance]);

  useEffect(() => {
    if (!showTopGuidanceSurface) return;
    function handleOutsideClick(e: MouseEvent) {
      const strip = document.querySelector(".guidance-top-helper");
      if (strip && !strip.contains(e.target as Node)) {
        topStripClosedRef.current = true;
        setTopGuidanceExpanded(false);
        setShowTopGuidance(false);
      }
    }
    document.addEventListener("click", handleOutsideClick, { capture: true });
    return () => document.removeEventListener("click", handleOutsideClick, { capture: true });
  }, [showTopGuidanceSurface]);

  useEffect(() => {
    const validUserActiveExerciseId =
      userActiveExerciseId &&
      exercises.some(
        (exercise) => exercise.id === userActiveExerciseId && !isExerciseComplete(exercise)
      )
        ? userActiveExerciseId
        : null;

    if (!validUserActiveExerciseId && userActiveExerciseId) {
      setUserActiveExerciseId(null);
    }

    const nextActiveExerciseId =
      validUserActiveExerciseId ?? getDefaultActiveExerciseId(exercises);

    if (nextActiveExerciseId !== activeExerciseId) {
      setActiveExerciseId(nextActiveExerciseId);
    }
  }, [activeExerciseId, exercises, userActiveExerciseId]);

  function openDetails(
    exerciseId: string,
    tab: DetailTab = "summary",
    scrollTarget: "top" | "bottom" = "top"
  ) {
    setDetailsExerciseId(exerciseId);
    setDetailsTab(tab);
    setDetailsScrollTarget(scrollTarget);
  }

  function getFirstNotStartedExerciseId(exerciseList: ExerciseDraft[]) {
    return exerciseList.find((exercise) => !isExerciseComplete(exercise) && !isExerciseStarted(exercise))?.id ?? null;
  }

  function getDefaultActiveExerciseId(exerciseList: ExerciseDraft[]) {
    const firstIncompleteExerciseId = getFirstIncompleteExerciseId(exerciseList);

    if (!firstIncompleteExerciseId) {
      return null;
    }

    const firstIncompleteExercise = exerciseList.find(
      (exercise) => exercise.id === firstIncompleteExerciseId
    );

    if (firstIncompleteExercise && isExerciseStarted(firstIncompleteExercise)) {
      return firstIncompleteExerciseId;
    }

    return getFirstNotStartedExerciseId(exerciseList) ?? firstIncompleteExerciseId;
  }

  function getFirstIncompleteExerciseId(exerciseList: ExerciseDraft[]) {
    return exerciseList.find((exercise) => !isExerciseComplete(exercise))?.id ?? null;
  }

  function getNextActiveExerciseIdFromProgress(
    exerciseList: ExerciseDraft[],
    fallbackExerciseId?: string
  ) {
    return (
      getFirstIncompleteExerciseId(exerciseList) ??
      fallbackExerciseId ??
      exerciseList[0]?.id ??
      null
    );
  }

  function getNextIncompleteExerciseIdAfter(
    exerciseList: ExerciseDraft[],
    exerciseId: string
  ) {
    const currentIndex = exerciseList.findIndex((exercise) => exercise.id === exerciseId);
    if (currentIndex === -1) {
      return null;
    }

    for (let index = currentIndex + 1; index < exerciseList.length; index += 1) {
      if (!isExerciseComplete(exerciseList[index])) {
        return exerciseList[index].id;
      }
    }

    return null;
  }

  function setInteractedExerciseActive(exerciseId: string) {
    const exercise = exercises.find((entry) => entry.id === exerciseId);
    if (!exercise || isExerciseComplete(exercise)) {
      return;
    }
    const hasInProgressExercise = exercises.some((entry) => isExerciseInProgress(entry));
    if (hasInProgressExercise && activeExerciseId !== exerciseId) {
      return;
    }
    setUserActiveExerciseId(exerciseId);
    if (activeExerciseId !== exerciseId) {
      setActiveExerciseId(exerciseId);
    }
    setCollapsedExerciseIds((current) => current.filter((id) => id !== exerciseId));
  }

  function setPreStartExerciseActive(exerciseId: string) {
    const exercise = exercises.find((entry) => entry.id === exerciseId);
    if (!exercise || isExerciseComplete(exercise)) {
      return;
    }
    setUserActiveExerciseId(exerciseId);
    if (activeExerciseId !== exerciseId) {
      setActiveExerciseId(exerciseId);
    }
  }

  function toggleExerciseCollapse(exerciseId: string) {
    setCollapsedExerciseIds((current) => {
      const isCollapsed = current.includes(exerciseId);

      if (isCollapsed) {
        return current.filter((id) => id !== exerciseId);
      }

      if (exerciseId === activeExerciseId) {
        const nextActiveExercise = exercises.find(
          (exercise) => exercise.id !== exerciseId && !current.includes(exercise.id)
        );

        if (nextActiveExercise) {
          setActiveExerciseId(nextActiveExercise.id);
        }
      }

      if (resolvedFocusedExpandedExerciseId === exerciseId) {
        setFocusedExpandedExerciseId(null);
      }

      return [...current, exerciseId];
    });
    setMenuExerciseId(null);
  }

  function toggleCollapseAllExercises() {
    const allCollapsed = collapsedExerciseIds.length === exercises.length && guidanceCollapsed;
    setCollapsedExerciseIds(allCollapsed ? [] : exercises.map((exercise) => exercise.id));
    setFocusedExpandedExerciseId(null);
    setGuidanceCollapsed(!allCollapsed);
    setMenuExerciseId(null);
  }

  function openMusclesPage(exerciseId: string) {
    setMusclesPageMode("exercise");
    setMusclesExerciseId(exerciseId);
    setMenuExerciseId(null);
  }

  function openWorkoutMusclesPage() {
    if (!activeExercise) {
      return;
    }
    setMusclesPageMode("overall");
    setMusclesExerciseId(activeExercise.id);
    setMenuExerciseId(null);
  }

  function beginTitleHold(exerciseId: string) {
    if (titleHoldTimer.current) {
      window.clearTimeout(titleHoldTimer.current);
    }

    titleHoldTriggered.current = false;
    titleHoldTimer.current = window.setTimeout(() => {
      titleHoldTriggered.current = true;
      setInteractedExerciseActive(exerciseId);
      setReorderOpen(true);
      setWorkoutMenuOpen(false);
      setMenuExerciseId(null);
    }, 420);
  }

  function endTitleHold() {
    if (titleHoldTimer.current) {
      window.clearTimeout(titleHoldTimer.current);
      titleHoldTimer.current = null;
    }
  }

  function updateDraftSet(
    exerciseId: string,
    setIndex: number,
    field: "weightInput" | "repsInput" | "rpeInput" | "done" | "failed",
    value: string | boolean
  ) {
    if (field !== "done" || value !== false) {
      setInteractedExerciseActive(exerciseId);
    }
    setExercises((current) =>
      current.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }

        return {
          ...exercise,
          draftSets: exercise.draftSets.map((set, index) => {
            if (index !== setIndex) {
              return set;
            }
            if (field === "weightInput" && typeof value === "string") {
              return { ...set, weightInput: sanitizeDecimalInput(value) };
            }
            if (field === "repsInput" && typeof value === "string") {
              return { ...set, repsInput: sanitizeIntegerInput(value) };
            }
            if (field === "rpeInput" && typeof value === "string") {
              return { ...set, rpeInput: sanitizeDecimalInput(value) };
            }
            return { ...set, [field]: value };
          })
        };
      })
    );
  }

  function applyResolvedValuesToDraftSet(
    exerciseId: string,
    setIndex: number,
    values: { weightInput?: string; repsInput?: string; rpeInput?: string }
  ) {
    setExercises((current) =>
      current.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }

        return {
          ...exercise,
          draftSets: exercise.draftSets.map((set, index) =>
            index === setIndex
              ? {
                  ...set,
                  weightInput: values.weightInput ?? set.weightInput,
                  repsInput: values.repsInput ?? set.repsInput,
                  rpeInput: values.rpeInput ?? set.rpeInput
                }
              : set
          )
        };
      })
    );
  }

  function applyPreviousValuesToDraftSet(exerciseId: string, setIndex: number) {
    const exercise = exercises.find((entry) => entry.id === exerciseId);
    if (!exercise) {
      return;
    }
    const measurementType = getExerciseMeasurementType(exercise);

    const previousSet = getPreviousReferenceSet(
      exercise.draftSets,
      setIndex,
      exercise.history[exercise.history.length - 1]
    );

    if (!previousSet) {
      return;
    }

    setInteractedExerciseActive(exerciseId);

    applyResolvedValuesToDraftSet(exerciseId, setIndex, {
      weightInput: usesWeightInputForMeasurement(measurementType)
        ? String(previousSet.weight)
        : "",
      repsInput: String(previousSet.reps),
      rpeInput:
        typeof previousSet.rpe === "number" && Number.isFinite(previousSet.rpe)
          ? String(previousSet.rpe)
          : ""
    });
  }

  function markSetDone(exerciseId: string, setIndex: number) {
    const exercise = exercises.find((entry) => entry.id === exerciseId);
    if (!exercise) {
      return;
    }
    const measurementType = getExerciseMeasurementType(exercise);
    const carrySource = getCurrentExerciseCarrySource(exercise.draftSets, setIndex);

    const previousSet = getPreviousReferenceSet(
      exercise.draftSets,
      setIndex,
      exercise.history[exercise.history.length - 1]
    );
    const draftSet = exercise.draftSets[setIndex];
    const resolvedWeightInput = usesWeightInputForMeasurement(measurementType)
      ? settings.carryForwardDefaults &&
        draftSet.weightInput.trim().length === 0
          ? carrySource?.weightInput?.trim().length
            ? carrySource.weightInput
            : previousSet
              ? String(previousSet.weight)
              : ""
          : draftSet.weightInput
      : "";
    const resolvedRepsInput =
      settings.carryForwardDefaults &&
      draftSet.repsInput.trim().length === 0
        ? carrySource?.repsInput?.trim().length
          ? carrySource.repsInput
          : previousSet
            ? String(previousSet.reps)
            : ""
        : draftSet.repsInput;
    const resolvedRpeInput =
      settings.carryForwardDefaults &&
      draftSet.rpeInput.trim().length === 0
        ? carrySource?.rpeInput?.trim().length
          ? carrySource.rpeInput
          : typeof previousSet?.rpe === "number" && Number.isFinite(previousSet.rpe)
            ? String(previousSet.rpe)
            : ""
        : draftSet.rpeInput;

    const nextExercises = exercises.map((currentExercise) => {
      if (currentExercise.id !== exerciseId) {
        return currentExercise;
      }

      return {
        ...currentExercise,
        draftSets: currentExercise.draftSets.map((set, index) =>
          index === setIndex
            ? {
                ...set,
                weightInput: resolvedWeightInput,
                repsInput: resolvedRepsInput,
                rpeInput: resolvedRpeInput,
                done: true
              }
            : set
        )
      };
    });

    setExercises(nextExercises);

    const didCompleteExerciseBoundary = setIndex === exercise.draftSets.length - 1;
    const nextActiveExerciseId = didCompleteExerciseBoundary
      ? getFirstIncompleteExerciseId(nextExercises)
      : exerciseId;

    if (nextActiveExerciseId) {
      setActiveExerciseId(nextActiveExerciseId);
      setCollapsedExerciseIds((current) =>
        current.filter((id) => id !== nextActiveExerciseId)
      );
    }

    if (!didCompleteExerciseBoundary) {
      setUserActiveExerciseId(exerciseId);
      startRestTimer(nextActiveExerciseId ?? exerciseId, undefined, "exercise");
      return;
    }

    setUserActiveExerciseId(null);

    if (nextActiveExerciseId) {
      startRestTimer(nextActiveExerciseId, settings.transitionRestSeconds, "transition");
      return;
    }

    stopRestTimer();
  }

  function markSetUndone(exerciseId: string, setIndex: number) {
    const nextExercises = exercises.map((exercise) => {
      if (exercise.id !== exerciseId) {
        return exercise;
      }

      return {
        ...exercise,
        draftSets: exercise.draftSets.map((set, index) =>
          index === setIndex ? { ...set, done: false } : set
        )
      };
    });

    setExercises(nextExercises);
    setUserActiveExerciseId(exerciseId);
    setCollapsedExerciseIds((current) => current.filter((id) => id !== exerciseId));
    stopRestTimer(exerciseId);
  }

  function updateExerciseNote(exerciseId: string, note: string) {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, note } : exercise
      )
    );
  }

  function setExerciseStickyNoteEnabled(exerciseId: string, enabled: boolean) {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, stickyNoteEnabled: enabled } : exercise
      )
    );
  }

  function openNoteEditor(exerciseId: string) {
    const exercise = exercises.find((entry) => entry.id === exerciseId);
    if (!exercise) {
      return;
    }

    setNoteEditorExerciseId(exerciseId);
    setNoteEditorValue(exercise.note);
    setMenuExerciseId(null);
  }

  function enableStickyNote(exerciseId: string) {
    setExerciseStickyNoteEnabled(exerciseId, true);
    setMenuExerciseId(null);
  }

  function hideStickyNote(exerciseId: string) {
    setExerciseStickyNoteEnabled(exerciseId, false);
    if (noteEditorExerciseId === exerciseId) {
      closeNoteEditor();
    }
    setMenuExerciseId(null);
  }

  function closeNoteEditor() {
    setNoteEditorExerciseId(null);
    setNoteEditorValue("");
  }

  function saveNoteEditor() {
    if (!noteEditorExerciseId) {
      return;
    }

    updateExerciseNote(noteEditorExerciseId, noteEditorValue.trim());
    closeNoteEditor();
  }

  function updateExerciseRestTimer(exerciseId: string, restTimer: string) {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId
          ? { ...exercise, restTimer: formatMinutesSecondsInput(restTimer) }
          : exercise
      )
    );
  }

  function openRestTimerEditor(exerciseId: string) {
    const exercise = exercises.find((entry) => entry.id === exerciseId);
    if (!exercise) {
      return;
    }
    setRestTimerEditorExerciseId(exerciseId);
    setRestTimerEditorValue(exercise.restTimer);
    setSaveRestTimerToDefault(false);
  }

  function closeRestTimerEditor() {
    setRestTimerEditorExerciseId(null);
    setRestTimerEditorValue("");
    setSaveRestTimerToDefault(false);
  }

  function saveRestTimerEditor() {
    if (!restTimerEditorExercise) {
      return;
    }

    const formatted = formatMinutesSecondsInput(restTimerEditorValue);
    updateExerciseRestTimer(restTimerEditorExercise.id, formatted);
    stopRestTimer(restTimerEditorExercise.id);

    if (saveRestTimerToDefault) {
      setExerciseRestDefaults((current) => ({
        ...current,
        [restTimerEditorExercise.name]: formatted
      }));
    }

    closeRestTimerEditor();
  }

  function startRestTimer(
    exerciseId: string,
    overrideRestSeconds?: string,
    kind: "exercise" | "transition" = "exercise"
  ) {
    const exercise = exercises.find((entry) => entry.id === exerciseId);
    if (!exercise) {
      return;
    }

    const restSeconds = parseMinutesSecondsToSeconds(
      overrideRestSeconds ? formatRestTimer(overrideRestSeconds) : exercise.restTimer
    );
    if (restSeconds <= 0) {
      setActiveRestTimer(null);
      return;
    }

    const now = Date.now();
    setClockTick(now);
    setActiveRestTimer({
      exerciseId,
      endAt: now + restSeconds * 1000,
      pausedRemainingSeconds: null,
      totalSeconds: restSeconds,
      kind
    });
  }

  function stopRestTimer(exerciseId?: string) {
    setActiveRestTimer((current) => {
      if (!current) {
        return current;
      }
      if (exerciseId && current.exerciseId !== exerciseId) {
        return current;
      }
      return null;
    });
  }

  function togglePauseRestTimer(exerciseId: string) {
    setActiveRestTimer((current) => {
      if (!current || current.exerciseId !== exerciseId) {
        return current;
      }

      if (current.pausedRemainingSeconds !== null) {
        const now = Date.now();
        setClockTick(now);
        return {
          exerciseId,
          endAt: now + current.pausedRemainingSeconds * 1000,
          pausedRemainingSeconds: null,
          totalSeconds: current.totalSeconds,
          kind: current.kind
        };
      }

      const remainingSeconds = Math.max(
        0,
        Math.ceil(((current.endAt ?? Date.now()) - Date.now()) / 1000)
      );

      return {
        exerciseId,
        endAt: null,
        pausedRemainingSeconds: remainingSeconds,
        totalSeconds: current.totalSeconds,
        kind: current.kind
      };
    });
  }

  function adjustActiveRestTimer(deltaSeconds: number) {
    setActiveRestTimer((current) => {
      if (!current) {
        return current;
      }

      const currentSeconds =
        current.pausedRemainingSeconds ??
        Math.max(0, Math.ceil(((current.endAt ?? Date.now()) - Date.now()) / 1000));
      const nextSeconds = Math.max(1, currentSeconds + deltaSeconds);
      const nextTotalSeconds = Math.max(1, current.totalSeconds + deltaSeconds);

      if (current.pausedRemainingSeconds !== null) {
        return {
          ...current,
          pausedRemainingSeconds: nextSeconds,
          totalSeconds: Math.max(nextSeconds, nextTotalSeconds)
        };
      }

      const now = Date.now();
      setClockTick(now);
      return {
        ...current,
        endAt: now + nextSeconds * 1000,
        totalSeconds: Math.max(nextSeconds, nextTotalSeconds)
      };
    });
  }

  function discardWorkout() {
    resetWorkout();
    setHasActiveWorkout(false);
    setActivePlanSession(null);
    setAppView(discardReturnView);
    setWorkoutMenuOpen(false);
    setDiscardConfirmOpen(false);
    setTrayDiscardOpen(false);
  }

  function requestDiscardWorkout() {
    setWorkoutMenuOpen(false);
    setDiscardConfirmOpen(true);
  }

  function returnToWorkoutSelector() {
    setMenuExerciseId(null);
    setWorkoutMenuOpen(false);
    setSettingsOpen(false);
    setAddExerciseOpen(false);
    setReorderOpen(false);
    setTimingOpen(false);
    setLeavePromptOpen(false);
    setFinishConfirmOpen(false);
    setFinishConfirmOpen(false);
    setFinishWorkoutDraft(null);
    setSupersetSheetExerciseId(null);
    setSupersetSelectionIds([]);
    setSmartReplaceExerciseId(null);
    setSetTypePickerRowId(null);
    setPullDownDistance(0);
    // Go back to where the session was started from
    setAppView(discardReturnView);
  }

  function openActiveWorkout() {
    if (!hasActiveWorkout) {
      openQuickSession();
      return;
    }
    setAppView("logger");
  }

  function openQuickSession(returnView: "home" | "planner" = "home") {
    setDiscardReturnView(returnView);
    resetWorkout();
    setExercises([]);
    setActiveExerciseId(null);
    const now = new Date();
    const hour = now.getHours();
    const timeLabel = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
    setWorkoutMeta({
      date: formatDateInputValue(now),
      startTime: formatTimeFromDate(now),
      startedMinutesAgo: "0",
      sessionName: `${timeLabel} Workout`,
      startInstant: now.toISOString()
    });
    setShowBottomRestDock(true);
    setHasActiveWorkout(true);
    setActivePlanSession({ source: "quick", planId: null, originalPlan: null });
    setActiveRepIQSessionKey(null);
    setAppView("logger");
  }

  function updateSetType(exerciseId: string, setIndex: number, setType: DraftSetType) {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              draftSets: exercise.draftSets.map((set, index) =>
                index === setIndex ? { ...set, setType } : set
              )
            }
          : exercise
      )
    );
    setSetTypePickerRowId(null);
  }

  function openSupersetSheet(exerciseId: string) {
    const currentExercise = exercises.find((exercise) => exercise.id === exerciseId);
    const selectedIds = currentExercise?.supersetGroupId
      ? exercises
          .filter(
            (exercise) =>
              exercise.supersetGroupId === currentExercise.supersetGroupId &&
              exercise.id !== exerciseId
          )
          .map((exercise) => exercise.id)
      : [];

    setSupersetSheetExerciseId(exerciseId);
    setSupersetSelectionIds(selectedIds);
    setMenuExerciseId(null);
  }

  function saveSupersetSelection() {
    if (!supersetSheetExerciseId) {
      return;
    }

    const selection = Array.from(new Set(supersetSelectionIds)).filter(
      (exerciseId) => exerciseId !== supersetSheetExerciseId
    );
    const groupedIds = new Set([supersetSheetExerciseId, ...selection]);
    const sourceExercise = exercises.find((exercise) => exercise.id === supersetSheetExerciseId);
    const reusedGroupId =
      sourceExercise?.supersetGroupId ??
      exercises.find((exercise) => selection.includes(exercise.id))?.supersetGroupId ??
      null;
    const nextGroupId =
      groupedIds.size > 1 ? reusedGroupId ?? `superset-${Date.now()}` : null;

    setExercises((current) =>
      normalizeSupersetGroups(
        current.map((exercise) =>
          groupedIds.has(exercise.id)
            ? { ...exercise, supersetGroupId: nextGroupId }
            : exercise
        )
      )
    );
    setSupersetSheetExerciseId(null);
    setSupersetSelectionIds([]);
    setMenuExerciseId(null);
  }

  function removeFromSuperset(exerciseId: string) {
    setExercises((current) =>
      normalizeSupersetGroups(
        current.map((exercise) =>
          exercise.id === exerciseId
            ? { ...exercise, supersetGroupId: null }
            : exercise
        )
      )
    );
    setSupersetSheetExerciseId(null);
    setSupersetSelectionIds([]);
    setMenuExerciseId(null);
  }

  function addSet(exerciseId: string) {
    setInteractedExerciseActive(exerciseId);
    setExercises((current) =>
      current.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }
        return {
          ...exercise,
          draftSets: [
            ...exercise.draftSets,
            {
              id: `${exercise.id}-${exercise.draftSets.length + 1}`,
              setType: "normal",
              weightInput: "",
              repsInput: "",
              rpeInput: "",
              done: false,
              failed: false
            }
          ]
        };
      })
    );
  }

  function replaceExerciseWithTemplate(originalId: string, templateId: string, reason: ReplacementReason = "preference", matchScore = 0) {
    const template = availableExerciseTemplates.find(e => e.id === templateId);
    if (!template) return;
    const suffix = `${Date.now()}-1`;
    const nextExercise = cloneExerciseTemplate(template, settings.defaultRestSeconds, suffix);
    const configuredRestTimer = exerciseRestDefaults[template.name];
    if (configuredRestTimer) nextExercise.restTimer = configuredRestTimer;
    const setsAlreadyLogged = exercises.find(e => e.id === originalId)?.draftSets.filter(s => s.done).length ?? 0;
    setExercises(current =>
      current.map(ex => {
        if (ex.id !== originalId) return ex;
        return { ...nextExercise, id: ex.id, note: ex.note, supersetGroupId: ex.supersetGroupId };
      })
    );
    const event: ReplacementEvent = {
      schemaVersion: 1,
      sessionId: workoutMeta.startInstant ?? new Date().toISOString(),
      replacedAt: new Date().toISOString(),
      originalExerciseId: originalId,
      replacementExerciseId: templateId,
      reason,
      setsAlreadyLogged,
      matchScore,
    };
    persistReplacementEvent(event);
    setSmartReplaceExerciseId(null);
    setAddExerciseOpen(false);
  }

  function addExercisesFromTemplates(templateIds: string[]) {
    if (templateIds.length === 0) {
      return;
    }

    const nextExercises = templateIds
      .map((templateId, index) => {
        const template = availableExerciseTemplates.find((entry) => entry.id === templateId);
        if (!template) {
          return null;
        }

        const suffix = `${Date.now()}-${index + 1}`;
        const nextExercise = cloneExerciseTemplate(
          template,
          settings.defaultRestSeconds,
          suffix
        );

        const configuredRestTimer = exerciseRestDefaults[template.name];
        if (configuredRestTimer) {
          nextExercise.restTimer = configuredRestTimer;
        }

        return nextExercise;
      })
      .filter((exercise): exercise is ExerciseDraft => exercise !== null);

    if (nextExercises.length === 0) {
      return;
    }

    setExercises((current) => [...current, ...nextExercises]);
    setUserActiveExerciseId(nextExercises[0].id);
    setActiveExerciseId(nextExercises[0].id);
    setCollapsedExerciseIds((current) =>
      current.filter((id) => !nextExercises.some((exercise) => exercise.id === id))
    );
    setAddExerciseOpen(false);
    setWorkoutMenuOpen(false);
  }

  function buildDefaultHowTo(measurementType: MeasurementType) {
    return measurementType === "timed"
      ? [
          "Set up in a stable position before the timer starts.",
          "Keep each rep controlled so the full interval stays clean.",
          "Stop the set when technique drops instead of chasing extra time."
        ]
      : [
          "Set up with a controlled starting position before the first rep.",
          "Move through the target muscle with a steady tempo.",
          "Finish the range with control and keep tension on the working muscle."
        ];
  }

  function createCustomExercise(draft: CustomExerciseInput) {
    const requestedName = draft.name.trim();
    if (!requestedName) {
      return null;
    }
    const normalizedName = ensureUniqueExerciseName(
      requestedName,
      availableExerciseTemplates.map((exercise) => exercise.name)
    );

    const customIdBase = normalizedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const customId = `custom-${customIdBase || "exercise"}-${Date.now()}`;
    const normalizedPrimaryMuscles = draft.primaryMuscles
      .map((muscle) => muscle.trim())
      .filter(Boolean);
    if (normalizedPrimaryMuscles.length === 0) {
      return null;
    }
    const normalizedSecondaryMuscles = draft.secondaryMuscles.filter(
      (muscle) => !normalizedPrimaryMuscles.includes(muscle)
    );
    const restSeconds = Math.max(1, Number(settings.defaultRestSeconds) || 60);
    const defaultHowTo = buildDefaultHowTo(draft.measurementType);
    const normalizedTemplate: ExerciseDraft = {
      id: customId,
      name: normalizedName,
      note: "",
      stickyNoteEnabled: false,
      restTimer: formatRestTimer(String(restSeconds)),
      goal: "hypertrophy",
      imageSrc: draft.imageSrc || genericExerciseImage,
      primaryMuscle: normalizedPrimaryMuscles[0],
      primaryMuscles: normalizedPrimaryMuscles,
      secondaryMuscles: normalizedSecondaryMuscles,
      exerciseType: draft.exerciseType,
      measurementType: draft.measurementType,
      movementSide: draft.movementSide,
      isCustom: true,
      libraryStatus: "active",
      howTo: defaultHowTo,
      history: [],
      draftSets: [
        {
          id: `${customId}-set-1`,
          setType: "warmup",
          weightInput: "",
          repsInput: "",
          rpeInput: "",
          done: false,
          failed: false
        },
        {
          id: `${customId}-set-2`,
          setType: "normal",
          weightInput: "",
          repsInput: "",
          rpeInput: "",
          done: false,
          failed: false
        },
        {
          id: `${customId}-set-3`,
          setType: "normal",
          weightInput: "",
          repsInput: "",
          rpeInput: "",
          done: false,
          failed: false
        },
        {
          id: `${customId}-set-4`,
          setType: "normal",
          weightInput: "",
          repsInput: "",
          rpeInput: "",
          done: false,
          failed: false
        }
      ]
    };

    setCustomExercises((current) => [...current, normalizedTemplate]);
    setExerciseRestDefaults((current) => ({
      ...current,
      [normalizedTemplate.name]: normalizedTemplate.restTimer
    }));
    return normalizedTemplate.id;
  }

  function updateCustomExercise(exerciseId: string, draft: CustomExerciseInput) {
    const existing = customExercises.find((exercise) => exercise.id === exerciseId);
    const requestedName = draft.name.trim();
    if (!existing || !requestedName) {
      return null;
    }

    const normalizedPrimaryMuscles = draft.primaryMuscles
      .map((muscle) => muscle.trim())
      .filter(Boolean);
    if (normalizedPrimaryMuscles.length === 0) {
      return null;
    }

    const normalizedSecondaryMuscles = draft.secondaryMuscles.filter(
      (muscle) => !normalizedPrimaryMuscles.includes(muscle)
    );
    const normalizedName = ensureUniqueExerciseName(
      requestedName,
      availableExerciseTemplates
        .filter((exercise) => exercise.id !== exerciseId)
        .map((exercise) => exercise.name)
    );

    setCustomExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId
          ? cloneExerciseDraft(exercise, {
              name: normalizedName,
              imageSrc: draft.imageSrc || genericExerciseImage,
              primaryMuscle: normalizedPrimaryMuscles[0],
              primaryMuscles: normalizedPrimaryMuscles,
              secondaryMuscles: normalizedSecondaryMuscles,
              exerciseType: draft.exerciseType,
              measurementType: draft.measurementType,
              movementSide: draft.movementSide,
              isCustom: true,
              libraryStatus: "active",
              howTo: exercise.howTo.length > 0 ? exercise.howTo : buildDefaultHowTo(draft.measurementType)
            })
          : exercise
      )
    );
    setExerciseRestDefaults((current) => {
      const next = { ...current };
      const resolvedRestTimer = next[existing.name] ?? existing.restTimer;
      if (existing.name !== normalizedName) {
        delete next[existing.name];
      }
      next[normalizedName] = resolvedRestTimer;
      return next;
    });

    return exerciseId;
  }

  function archiveCustomExercise(exerciseId: string) {
    setCustomExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId
          ? cloneExerciseDraft(exercise, { libraryStatus: "archived", isCustom: true })
          : exercise
      )
    );
    setEditingCustomExerciseId((current) => (current === exerciseId ? null : current));
    setDetailsExerciseId((current) => (current === exerciseId ? null : current));
  }

  function deleteCustomExercise(exerciseId: string) {
    const customExercise = customExercises.find((exercise) => exercise.id === exerciseId);
    setCustomExercises((current) => current.filter((exercise) => exercise.id !== exerciseId));
    if (customExercise) {
      setExerciseRestDefaults((current) => {
        if (!(customExercise.name in current)) {
          return current;
        }
        const next = { ...current };
        delete next[customExercise.name];
        return next;
      });
    }
    setEditingCustomExerciseId((current) => (current === exerciseId ? null : current));
    setDetailsExerciseId((current) => (current === exerciseId ? null : current));
  }

  function importCustomExercises(importedExercises: CustomExerciseInput[]) {
    if (importedExercises.length === 0) {
      return [];
    }

    const existingNames = availableExerciseTemplates.map((exercise) => exercise.name);
    const createdIds: string[] = [];

    importedExercises.forEach((draft) => {
      const uniqueName = ensureUniqueExerciseName(draft.name.trim(), existingNames);
      if (uniqueName.trim().length === 0) {
        return;
      }
      existingNames.push(uniqueName);
      const createdId = createCustomExercise({
        ...draft,
        name: uniqueName
      });
      if (createdId) {
        createdIds.push(createdId);
      }
    });

    return createdIds;
  }

  function moveExerciseByIds(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      return;
    }

    setExercises((current) => {
      const sourceIndex = current.findIndex((exercise) => exercise.id === sourceId);
      const targetIndex = current.findIndex((exercise) => exercise.id === targetId);

      if (sourceIndex === -1 || targetIndex === -1) {
        return current;
      }

      const reordered = [...current];
      const [item] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, item);
      return reordered;
    });
  }

  function removeSet(exerciseId: string, setId: string) {
    setExercises((current) =>
      current.map((exercise) => {
        if (exercise.id !== exerciseId || exercise.draftSets.length <= 1) {
          return exercise;
        }
        return {
          ...exercise,
          draftSets: exercise.draftSets.filter((set) => set.id !== setId)
        };
      })
    );
    setRevealedDeleteRowId(null);
  }

  function clearUncheckedSets() {
    setExercises((current) =>
      current.map((exercise) => ({
        ...exercise,
        draftSets: exercise.draftSets.map((set) =>
          set.done
            ? set
            : {
                ...set,
                weightInput: "",
                repsInput: "",
                rpeInput: "",
                failed: false
              }
        )
      }))
    );
    setWorkoutMenuOpen(false);
  }

  function moveExercise(exerciseId: string, direction: -1 | 1) {
    setExercises((current) => {
      const index = current.findIndex((exercise) => exercise.id === exerciseId);
      const nextIndex = index + direction;
      if (index === -1 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const reordered = [...current];
      const [item] = reordered.splice(index, 1);
      reordered.splice(nextIndex, 0, item);
      return reordered;
    });
    setMenuExerciseId(null);
  }

  function replaceExercise(exerciseId: string) {
    setExercises((current) =>
      current.map((exercise, index) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }
        const template = replacementTemplates[index % replacementTemplates.length];
        return {
          ...exercise,
          id: `${exercise.id}-replaced`,
          name: template.name,
          restTimer: exerciseRestDefaults[template.name] ?? exercise.restTimer,
          imageSrc: template.imageSrc,
          primaryMuscle: template.primaryMuscle,
          secondaryMuscles: template.secondaryMuscles,
          howTo: template.howTo
        };
      })
    );
    setMenuExerciseId(null);
  }

  function removeExercise(exerciseId: string) {
    setExercises((current) => {
      const remaining = normalizeSupersetGroups(
        current.filter((exercise) => exercise.id !== exerciseId)
      );
      if (remaining.length === 0) {
        setActiveExerciseId(null);
        return remaining;
      }
      if (activeExerciseId === exerciseId) {
        const nextActiveExerciseId = getDefaultActiveExerciseId(remaining);
        if (nextActiveExerciseId) {
          setActiveExerciseId(nextActiveExerciseId);
        }
      }
      return remaining;
    });
    if (userActiveExerciseId === exerciseId) {
      setUserActiveExerciseId(null);
    }
    if (supersetSheetExerciseId === exerciseId) {
      setSupersetSheetExerciseId(null);
      setSupersetSelectionIds([]);
    }
    setCollapsedExerciseIds((current) => current.filter((id) => id !== exerciseId));
    setMenuExerciseId(null);
  }

  function resetWorkout() {
    const nextExercises = buildInitialWorkoutExercises(exerciseRestDefaults);
    setExercises(nextExercises);
    setUserActiveExerciseId(null);
    setActiveExerciseId(nextExercises[0].id);
    setDetailsExerciseId(null);
    setMusclesExerciseId(null);
    setMenuExerciseId(null);
    setWorkoutMenuOpen(false);
    setSettingsOpen(false);
    setAddExerciseOpen(false);
    setReorderOpen(false);
    setReorderDragId(null);
    setCollapsedExerciseIds([]);
    setGuidanceCollapsed(false);
    setFocusedExpandedExerciseId(null);
    setTimingOpen(false);
    setLeavePromptOpen(false);
    setSupersetSheetExerciseId(null);
    setSupersetSelectionIds([]);
    setSmartReplaceExerciseId(null);
    setRestTimerEditorExerciseId(null);
    setRestTimerEditorValue("");
    setSaveRestTimerToDefault(false);
    setSetTypePickerRowId(null);
    setRevealedDeleteRowId(null);
    setShowBottomRestDock(true);
    setPullDownDistance(0);
    updateSwipeState(createInitialSwipeState());
    setWorkoutMeta(defaultWorkoutMeta);
    setState(defaultState);
    setShowTopGuidance(false);
    setActiveRestTimer(null);
    setLoggerRewards([]);
    setRewardSheetOpen(false);
    setTemplateApplyPromptImages(null);
  }

  function beginPullToAdd(event: React.PointerEvent<HTMLElement>) {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("input, button, label, summary, details")
    ) {
      return;
    }

    if (window.scrollY > 8) {
      return;
    }

    pullStartY.current = event.clientY;
    pullPointerId.current = event.pointerId;
    pullGestureActive.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function movePullToAdd(event: React.PointerEvent<HTMLElement>) {
    if (!pullGestureActive.current || pullStartY.current === null) {
      return;
    }

    const distance = Math.max(0, Math.min(88, event.clientY - pullStartY.current));
    setPullDownDistance(distance);
  }

  function endPullToAdd() {
    if (!pullGestureActive.current) {
      return;
    }

    if (pullDownDistance > 58) {
      setWorkoutMenuOpen(true);
    }

    pullGestureActive.current = false;
    pullStartY.current = null;
    pullPointerId.current = null;
    setPullDownDistance(0);
  }

  function beginGuidancePull(event: React.PointerEvent<HTMLElement>) {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("button")
    ) {
      return;
    }

    guidancePullStartY.current = event.clientY;
    guidancePullActive.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveGuidancePull(event: React.PointerEvent<HTMLElement>) {
    if (!guidancePullActive.current || guidancePullStartY.current === null) {
      return;
    }

    const rawDelta = event.clientY - guidancePullStartY.current;
    const delta = topGuidanceExpanded
      ? Math.max(-72, Math.min(18, rawDelta))
      : Math.max(-12, Math.min(72, rawDelta));

    setTopGuidancePullDistance(delta);
  }

  function endGuidancePull() {
    if (!guidancePullActive.current) {
      return;
    }

    if (!topGuidanceExpanded && topGuidancePullDistance > 34) {
      setTopGuidanceExpanded(true);
    } else if (topGuidanceExpanded && topGuidancePullDistance < -34) {
      setTopGuidanceExpanded(false);
    }

    guidancePullActive.current = false;
    guidancePullStartY.current = null;
    setTopGuidancePullDistance(0);
  }

  function beginSwipe(rowId: string, event: React.PointerEvent<HTMLDivElement>) {
    if (isInteractiveSwipeTarget(event.target)) {
      return;
    }

    updateSwipeState({
      rowId,
      startX: event.clientX,
      startY: event.clientY,
      deltaX: 0,
      axis: "undecided",
      dragging: false
    });
  }

  function resetSwipeState() {
    updateSwipeState(createInitialSwipeState());
  }

  function moveSwipe(rowId: string, event: React.PointerEvent<HTMLDivElement>) {
    const currentSwipeState = swipeStateRef.current;

    if (currentSwipeState.rowId !== rowId) {
      return;
    }

    const deltaX = event.clientX - currentSwipeState.startX;
    const deltaY = event.clientY - currentSwipeState.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (currentSwipeState.axis === "undecided") {
      if (absX < 10 && absY < 10) {
        return;
      }

      if (absY > absX * 1.1) {
        updateSwipeState((current) => ({
          ...current,
          axis: "vertical",
          deltaX: 0,
          dragging: false
        }));
        return;
      }

      if (absX > absY * 1.2 && absX > 14) {
        const clamped = Math.max(-84, Math.min(112, deltaX));
        if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) {
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }
        updateSwipeState((current) => ({
          ...current,
          axis: "horizontal",
          deltaX: clamped,
          dragging: true
        }));
      }
      return;
    }

    if (currentSwipeState.axis !== "horizontal") {
      return;
    }

    const clamped = Math.max(-84, Math.min(112, deltaX));
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    updateSwipeState((current) => ({
      ...current,
      deltaX: clamped,
      dragging: Math.abs(clamped) > 14
    }));
  }

  function endSwipe(
    exerciseId: string,
    setIndex: number,
    rowId: string,
    event: React.PointerEvent<HTMLDivElement>
  ) {
    const currentSwipeState = swipeStateRef.current;

    if (currentSwipeState.rowId !== rowId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!currentSwipeState.dragging) {
      resetSwipeState();
      return;
    }

    if (currentSwipeState.deltaX < -56) {
      markSetDone(exerciseId, setIndex);
      setRevealedDeleteRowId(null);
    } else if (currentSwipeState.deltaX > 64) {
      setRevealedDeleteRowId(rowId);
    } else {
      setRevealedDeleteRowId(null);
    }

    resetSwipeState();
  }

  async function performFinishWorkout() {
    const lastSession = activeExercise.history[activeExercise.history.length - 1];
    const { resolvedSets, issues } = buildCompletedSets(
      activeExercise.draftSets,
      lastSession,
      settings.carryForwardDefaults,
      getExerciseMeasurementType(activeExercise)
    );

    if (resolvedSets.length === 0) {
      setState({
        status: "error",
        suggestion: null,
        message: "Mark at least one set as done before finishing the workout.",
        engineSource: null
      });
      return;
    }

    if (issues.length > 0) {
      setState({
        status: "error",
        suggestion: null,
        message: issues[0],
        engineSource: null
      });
      return;
    }

    const payload: ExerciseEvaluationRequest = {
      goal: activeExercise.goal,
      exercise_name: activeExercise.name,
      sessions: [
        ...activeExercise.history,
        {
          date: sessionDate,
          exercise: activeExercise.name,
          session_key: `${activeExercise.id}-current`,
          sets: resolvedSets
        }
      ]
    };

    setState({
      status: "loading",
      suggestion: null,
      message: null,
      engineSource: null
    });

    try {
      const response = await fetch(`${apiBaseUrl}/v1/sessions/${activeExercise.id}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });

      const body = await response.json();

      if (!response.ok) {
        setState({
          status: "error",
          suggestion: body.fallbackSuggestion
            ? coachingSuggestionSchema.parse(body.fallbackSuggestion)
            : null,
          message: body.message ?? "The coaching engine is not reachable yet.",
          engineSource: body.fallbackSuggestion ? "fallback" : "unavailable"
        });
        return;
      }

      setState({
        status: "success",
        suggestion: coachingSuggestionSchema.parse(body.suggestion),
        message: null,
        engineSource: body.engineSource === "live" ? "live" : "fallback"
      });
    } catch (error) {
      setState({
        status: "error",
        suggestion: null,
        message:
          error instanceof Error ? error.message : "The API could not be reached.",
        engineSource: "unavailable"
      });
    }
  }

  function openFinishWorkoutPage(ignoredIncompleteSets: number) {
    setFinishConfirmOpen(false);
    setFinishConfirmOpen(false);
    setWorkoutMenuOpen(false);
    setRewardSheetOpen(false);
    setInlineGuidanceOpen(false);
    setTopGuidanceExpanded(false);
    stopRestTimer();
    setFinishWorkoutDraft(buildFinishWorkoutDraft(ignoredIncompleteSets));
    setAppView("finish");
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }

  async function finishWorkout() {
    if (completedSetCount === 0) {
      return; // button is disabled — guard in case of direct call
    }
    const hasIssues = incompleteSetCount > 0 || exercises.some(ex =>
      ex.draftSets.some(s => s.done && s.repsInput.trim() === "")
    );
    if (hasIssues) {
      setFinishConfirmOpen(true);
      return;
    }
    openFinishWorkoutPage(0);
  }

  function finishWorkoutAnyway() {
    openFinishWorkoutPage(incompleteSetCount);
  }

  // ── Workout plan management ────────────────────────────────────────────────

  function savePlan(plan: WorkoutPlan) {
    setWorkoutPlans((current) => {
      // Strip sample plans from current state before building the user list
      const userPlans = current.filter((p) => !SAMPLE_PLAN_IDS.has(p.id));
      const exists = userPlans.some((p) => p.id === plan.id);
      const updated = exists
        ? userPlans.map((p) => (p.id === plan.id ? { ...plan, updatedAt: new Date().toISOString() } : p))
        : [plan, ...userPlans];
      persistWorkoutPlans(updated);
      // Show updated user plans; if empty fall back to sample plans
      return updated.length > 0 ? updated : SAMPLE_WORKOUT_PLANS;
    });
  }

  function reorderPlans(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      return;
    }
    setWorkoutPlans((current) => {
      const sourceIndex = current.findIndex((plan) => plan.id === sourceId);
      const targetIndex = current.findIndex((plan) => plan.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1) {
        return current;
      }
      const reordered = [...current];
      const [plan] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, plan);
      persistWorkoutPlans(reordered);
      return reordered;
    });
  }

  function deletePlan(planId: string) {
    setWorkoutPlans((current) => {
      const updated = current.filter((p) => p.id !== planId && !SAMPLE_PLAN_IDS.has(p.id));
      persistWorkoutPlans(updated);
      // If all user plans are gone, show sample plans again
      return updated.length > 0 ? updated : SAMPLE_WORKOUT_PLANS;
    });
  }

  function duplicatePlan(plan: WorkoutPlan) {
    const copy: WorkoutPlan = {
      ...plan,
      id: `plan-${Date.now()}`,
      name: `${plan.name} (copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    savePlan(copy);
  }

  async function sharePlan(plan: WorkoutPlan) {
    const body = [
      `${plan.name}`,
      plan.userTags && plan.userTags.length > 0 ? `Tags: ${plan.userTags.join(", ")}` : null,
      plan.note ? plan.note : null,
      `${plan.exercises.length} ${plan.exercises.length === 1 ? "exercise" : "exercises"}`
    ].filter(Boolean).join("\n");

    try {
      if (navigator.share) {
        await navigator.share({ title: plan.name, text: body });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(body);
      }
    } catch {
      // ignore cancelled shares
    }
  }

  function setPlanTags(planId: string, tags: string[]) {
    setWorkoutPlans((current) => {
      const updated = current.map((plan) =>
        plan.id === planId
          ? { ...plan, userTags: tags, updatedAt: new Date().toISOString() }
          : plan
      );
      persistWorkoutPlans(updated);
      return updated;
    });
  }

  function useTemplate(template: WorkoutPlan) {
    const copy: WorkoutPlan = {
      ...template,
      id: `plan-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    savePlan(copy);
    setPlannerView("mine");
  }

  function startPlanWorkout(plan: WorkoutPlan, source: PlanSessionSource = "saved") {
    // Build exercises from plan, hydrating from the library
    const planExercises: ExerciseDraft[] = plan.exercises.flatMap((pe) => {
      const template = availableExerciseTemplates.find((e) => e.id === pe.exerciseId);
      if (!template) return [];
      const sets: DraftSet[] = [];
      for (let i = 0; i < pe.setCount; i++) {
        sets.push({
          id: `${pe.exerciseId}-${i}`,
          setType: pe.setTypes?.[i] ?? "normal",
          weightInput: "",
          repsInput: "",
          rpeInput: "",
          done: false,
          failed: false
        });
      }
      return [{
        ...template,
        restTimer: pe.restTimer,
        note: pe.note ?? "",
        draftSets: sets
      }];
    });

    if (planExercises.length === 0) return;

    setExercises(planExercises);
    setCollapsedExerciseIds(source === "saved" ? planExercises.map((exercise) => exercise.id) : []);
    setGuidanceCollapsed(source === "saved");
    setFocusedExpandedExerciseId(null);
    const now = new Date();
    setWorkoutMeta({
      date: formatDateInputValue(now),
      startTime: formatTimeFromDate(now),
      startedMinutesAgo: "0",
      sessionName: plan.name,
      startInstant: now.toISOString()
    });
    setShowBottomRestDock(true);
    setActivePlanSession({
      source,
      planId: source === "saved" ? plan.id : null,
      originalPlan: source === "saved" ? plan : null
    });
    setActiveRepIQSessionKey(null);
    setDiscardReturnView("planner");
    setHasActiveWorkout(true);
    setAppView("logger");
  }

  function redoWorkout(workout: SavedWorkoutData) {
    const redoExercises: ExerciseDraft[] = workout.exercises.flatMap((summary) => {
      const template = availableExerciseTemplates.find((e) => e.id === summary.id);
      if (!template) return [];
      const setCount = Math.max(summary.loggedSets, 1);
      const sets: DraftSet[] = Array.from({ length: setCount }, (_, i) => ({
        id: `${summary.id}-redo-${i}`,
        setType: "normal" as const,
        weightInput: "",
        repsInput: "",
        rpeInput: "",
        done: false,
        failed: false,
      }));
      return [{ ...template, note: "", draftSets: sets }];
    });

    if (redoExercises.length === 0) return;
    setExercises(redoExercises);
    setCollapsedExerciseIds([]);
    setGuidanceCollapsed(false);
    setFocusedExpandedExerciseId(null);
    const now = new Date();
    setWorkoutMeta({
      date: formatDateInputValue(now),
      startTime: formatTimeFromDate(now),
      startedMinutesAgo: "0",
      sessionName: workout.sessionName,
      startInstant: now.toISOString(),
    });
    setShowBottomRestDock(true);
    setActivePlanSession(null);
    setActiveRepIQSessionKey(null);
    setDiscardReturnView("home");
    setHasActiveWorkout(true);
    setAppView("logger");
  }

  function editHistoryWorkout(workout: SavedWorkoutData) {
    // Re-loads the logger with the same exercises as the original session.
    // Timer is pre-seeded from durationSeconds so elapsed time starts where the session left off.
    const sourceKey = workout.repiqSourceKey;
    let sourceExercises: ExerciseDraft[] = [];
    // Helper: build DraftSets pre-filled from stored set data when available
    const makeDraftSets = (
      exerciseId: string,
      count: number,
      storedSets?: { weight: number; reps: number; rpe: number | null; setType: string }[]
    ): DraftSet[] =>
      Array.from({ length: count }, (_, i) => {
        const s = storedSets?.[i];
        const preFilled = !!(s && s.weight > 0 && s.reps > 0);
        return {
          id: `${exerciseId}-edit-${i}`,
          setType: (s?.setType ?? "normal") as DraftSet["setType"],
          weightInput: preFilled ? String(s!.weight) : "",
          repsInput: preFilled ? String(s!.reps) : "",
          rpeInput: s?.rpe != null ? String(s.rpe) : "",
          done: preFilled,
          failed: false,
        };
      });

    if (sourceKey && repiqPlan) {
      // repiqSourceKey format: "wi-di" (e.g. "0-2")
      const match = sourceKey.match(/^(\d+)-(\d+)$/);
      if (match) {
        const wi = parseInt(match[1], 10);
        const di = parseInt(match[2], 10);
        const day = repiqPlan.weeks[wi]?.days[di];
        if (day) {
          sourceExercises = day.exercises.flatMap((pe) => {
            const template = availableExerciseTemplates.find((e) => e.id === pe.exerciseId);
            if (!template) return [];
            const savedSummary = workout.exercises.find((ex) => ex.id === pe.exerciseId);
            const draftSets = makeDraftSets(
              pe.exerciseId,
              savedSummary?.loggedSets ?? pe.sets,
              savedSummary?.sets
            );
            return [{ ...template, note: "", draftSets }];
          });
        }
      }
    }
    // Fall back to summary exercise list if plan day not found
    if (sourceExercises.length === 0) {
      sourceExercises = workout.exercises.flatMap((summary) => {
        const template = availableExerciseTemplates.find((e) => e.id === summary.id);
        if (!template) return [];
        const draftSets = makeDraftSets(
          summary.id,
          Math.max(summary.loggedSets, 1),
          summary.sets
        );
        return [{ ...template, note: "", draftSets }];
      });
    }
    if (sourceExercises.length === 0) return;
    setExercises(sourceExercises);
    setCollapsedExerciseIds([]);
    setGuidanceCollapsed(false);
    setFocusedExpandedExerciseId(null);
    // Pre-seed timer from the workout's stored duration.
    // durationSeconds may be 0 for older sessions — parse the formatted duration string as fallback.
    let elapsed = workout.durationSeconds ?? 0; // durationSeconds is in FinishWorkoutDraft
    if (elapsed === 0 && workout.duration && workout.duration !== "—") {
      const parts = workout.duration.split(":").map(Number);
      if (parts.length === 3 && parts.every(Number.isFinite)) {
        elapsed = parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2 && parts.every(Number.isFinite)) {
        elapsed = parts[0] * 60 + parts[1];
      }
    }
    const fakeStart = new Date(Date.now() - elapsed * 1000);
    setWorkoutMeta({
      date: formatDateInputValue(fakeStart),
      startTime: formatTimeFromDate(fakeStart),
      startedMinutesAgo: String(Math.floor(elapsed / 60)),
      sessionName: workout.sessionName,
      startInstant: fakeStart.toISOString(),
    });
    setShowBottomRestDock(true);
    setActivePlanSession(null);
    setActiveRepIQSessionKey(null);
    setDiscardReturnView("planner");
    setHasActiveWorkout(true);
    setAppView("logger");
  }

  function saveHistoryWorkoutToMyWorkouts(workout: SavedWorkoutData) {
    const now = new Date().toISOString();
    const plan: WorkoutPlan = {
      id: `plan-${Date.now()}`,
      name: workout.sessionName,
      exercises: workout.exercises.flatMap((summary) => {
        const template = availableExerciseTemplates.find((e) => e.id === summary.id);
        if (!template) return [];
        return [{
          exerciseId: summary.id,
          setCount: Math.max(summary.loggedSets, 1),
          restTimer: `${settings.defaultRestSeconds ?? "90"}s`,
        }];
      }),
      createdAt: now,
      updatedAt: now,
    };
    const updated = [plan, ...workoutPlans];
    setWorkoutPlans(updated);
    persistWorkoutPlans(updated);
  }

  function regenerateRemainingRepIQSessions() {
    if (!repiqPlan) return;
    const exp = repiqPlan.experienceLevel;
    const dayTemplates = buildDayTemplates(repiqPlan.splitType, repiqPlan.daysPerWeek);
    const scheme = getPlanSetRepScheme(repiqPlan.goal);
    // Collect exercise IDs already used in completed sessions (avoid repeating them)
    const used = new Set<string>();
    repiqPlan.weeks.forEach(week =>
      week.days.forEach(day => {
        if (day.completedAt) day.exercises.forEach(e => used.add(e.exerciseId));
      })
    );
    const updatedWeeks = repiqPlan.weeks.map((week) => ({
      ...week,
      days: week.days.map((day, di) => {
        if (day.completedAt) return day; // keep completed sessions as-is
        const tmpl = dayTemplates[di % dayTemplates.length];
        return {
          ...day,
          exercises: tmpl.slots
            .map(slot => {
              const exerciseId = pickPlanExercise(smartReplaceCatalog, slot, exp, used);
              if (!exerciseId) return null;
              return { exerciseId, sets: scheme.sets, reps: scheme.reps, restSeconds: scheme.restSeconds } satisfies RepIQPlanExercise;
            })
            .filter((e): e is RepIQPlanExercise => e !== null),
        };
      }),
    }));
    const updated: RepIQPlan = {
      ...repiqPlan,
      weeks: updatedWeeks,
      needsReview: false,
      extraVolumeCount: 0,
      extraVolumeWorkoutIds: [],
      lastRegeneratedAt: new Date().toISOString(),
    };
    persistRepIQPlan(updated);
    setRepiqPlan(updated);
  }

  function deleteHistoryWorkout(savedAt: string) {
    const updated = savedWorkoutsList.filter(w => w.savedAt !== savedAt);
    setSavedWorkoutsList(updated);
    persistSavedWorkoutsList(updated);
    if (!repiqPlan || repiqPlan.status === "paused") return;
    const lastRegen = repiqPlan.lastRegeneratedAt ?? repiqPlan.generatedAt;
    if (repiqPlan.extraVolumeWorkoutIds?.includes(savedAt)) {
      // Was a tracked extra-volume workout — decrement count
      const remainingIds = repiqPlan.extraVolumeWorkoutIds.filter(id => id !== savedAt);
      const updatedPlan: RepIQPlan = {
        ...repiqPlan,
        extraVolumeWorkoutIds: remainingIds,
        extraVolumeCount: remainingIds.length,
        needsReview: remainingIds.length > 0,
      };
      persistRepIQPlan(updatedPlan);
      setRepiqPlan(updatedPlan);
    } else if (savedAt > lastRegen) {
      // Volume decreased after last regeneration — plan may need adjustment
      const updatedPlan: RepIQPlan = {
        ...repiqPlan,
        needsReview: true,
      };
      persistRepIQPlan(updatedPlan);
      setRepiqPlan(updatedPlan);
    }
  }

  function getNextRepIQSession(plan: RepIQPlan): { weekIdx: number; dayIdx: number } | null {
    for (let wi = plan.currentWeekIndex; wi < plan.weeks.length; wi++) {
      const week = plan.weeks[wi];
      if (week.isCompleted) continue;
      for (let di = 0; di < week.days.length; di++) {
        if (!week.days[di].completedAt) return { weekIdx: wi, dayIdx: di };
      }
    }
    return null;
  }

  function startRepIQSession(weekIdx: number, dayIdx: number) {
    if (!repiqPlan) return;
    const day = repiqPlan.weeks[weekIdx]?.days[dayIdx];
    if (!day) return;
    resetWorkout();
    const planExercises: ExerciseDraft[] = day.exercises.flatMap((pe) => {
      const template = availableExerciseTemplates.find((e) => e.id === pe.exerciseId);
      if (!template) return [];
      const sets: DraftSet[] = Array.from({ length: pe.sets }, (_, i) => ({
        id: `${pe.exerciseId}-${i}-${Date.now()}`,
        setType: "normal" as DraftSetType,
        weightInput: "",
        repsInput: String(pe.reps),
        rpeInput: "",
        done: false,
        failed: false,
      }));
      return [{ ...template, restTimer: String(pe.restSeconds), note: "", draftSets: sets }];
    });
    setExercises(planExercises);
    setCollapsedExerciseIds([]);
    setGuidanceCollapsed(false);
    setFocusedExpandedExerciseId(null);
    const now = new Date();
    setWorkoutMeta({
      date: formatDateInputValue(now),
      startTime: formatTimeFromDate(now),
      startedMinutesAgo: "0",
      sessionName: day.sessionLabel,
      startInstant: now.toISOString(),
    });
    setShowBottomRestDock(true);
    setActivePlanSession({ source: "repiq", planId: null, originalPlan: null, weekIdx, dayIdx });
    setActiveRepIQSessionKey(`${weekIdx}-${dayIdx}`);
    setDiscardReturnView("planner");
    setHasActiveWorkout(true);
    setAppView("logger");
  }

  function propagateRepIQChanges(weekIdx: number, dayIdx: number, completedExerciseIds: string[]) {
    if (!repiqPlan) return;
    const usedIds = new Set<string>(completedExerciseIds);
    // Add all previously completed exercise IDs too
    repiqPlan.weeks.forEach((week, wi) => {
      week.days.forEach((day, di) => {
        if (day.completedAt && !(wi === weekIdx && di === dayIdx)) {
          day.exercises.forEach((e) => usedIds.add(e.exerciseId));
        }
      });
    });
    const scheme = getPlanSetRepScheme(repiqPlan.goal as TrainingGoal);
    const exp = repiqPlan.experienceLevel as ExperienceLevel;
    const dayTemplates = buildDayTemplates(repiqPlan.splitType, repiqPlan.daysPerWeek);
    const updatedWeeks = repiqPlan.weeks.map((week, wi) => {
      if (wi <= weekIdx) return week;
      return {
        ...week,
        days: week.days.map((day, di) => {
          const tmpl = dayTemplates[di % dayTemplates.length];
          const newExercises = tmpl.slots
            .map((slot) => {
              const id = pickPlanExercise(smartReplaceCatalog, slot, exp, usedIds);
              if (!id) return null;
              usedIds.add(id);
              return { exerciseId: id, sets: scheme.sets, reps: scheme.reps, restSeconds: scheme.restSeconds } satisfies RepIQPlanExercise;
            })
            .filter((e): e is RepIQPlanExercise => e !== null);
          return { ...day, exercises: newExercises };
        }),
      };
    });
    const updatedPlan = { ...repiqPlan, weeks: updatedWeeks };
    persistRepIQPlan(updatedPlan);
    setRepiqPlan(updatedPlan);
  }

  function regenerateRepIQPlan(prefs: { goal: string; experience: string; daysPerWeek: number; sessionLength: number; planLengthWeeks: number; splitPref: string | null }) {
    const updatedProfile: UserPsychProfile = {
      ...psychProfile,
      primaryGoal: prefs.goal as TrainingGoal,
      experienceLevel: prefs.experience as ExperienceLevel,
      daysPerWeekPref: prefs.daysPerWeek,
      sessionLengthPref: prefs.sessionLength,
      planLengthWeeksPref: prefs.planLengthWeeks,
      workoutStylePref: prefs.splitPref,
    };
    persistPsychProfile(updatedProfile);
    setPsychProfile(updatedProfile);
    const plan = generateRepIQPlan(updatedProfile);
    persistRepIQPlan(plan);
    setRepiqPlan(plan);
  }

  async function saveFinishedWorkout(images: WorkoutMediaAsset[]) {
    if (!finishWorkoutDraft) return;
    if (activeWorkoutHasTemplateChanges()) {
      setTemplateApplyPromptImages(images);
      return;
    }
    finalizeFinishedWorkoutSave(images, false);
  }

  // ── Dev landing page ─────────────────────────────────────────────────────────
  if (showDevPage) {
    return (
      <DevLandingPage
        resolvedTheme={resolvedTheme}
        onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
        onGoTo={(view) => { setAppView(view); setShowDevPage(false); setDevBypassGate(true); }}
        onShowPostOnboarding={() => { setShowPostOnboarding(true); setShowDevPage(false); }}
        onResetOnboarding={() => {
          const reset: UserPsychProfile = { ...psychProfile, onboardingCompletedAt: null };
          persistPsychProfile(reset);
          setPsychProfile(reset);
          setShowDevPage(false);
        }}
        onSeedHistoryData={() => {
          const completedAt = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
          const seedPlan: RepIQPlan = {
            schemaVersion: 1,
            id: "dev-seed-plan",
            generatedAt: completedAt,
            startDate: completedAt.slice(0, 10),
            planName: "Push / Pull / Legs",
            goal: "build_muscle",
            secondaryGoal: null,
            experienceLevel: "intermediate",
            daysPerWeek: 3,
            sessionLengthMin: 60,
            splitType: "ppl",
            mesocycleLengthWeeks: 8,
            currentWeekIndex: 0,
            status: "active",
            weeks: Array.from({ length: 8 }, (_, wi) => ({
              weekNumber: wi + 1,
              isCompleted: false,
              days: [
                {
                  sessionLabel: `Upper Push ${String.fromCharCode(65 + wi)}`,
                  focus: "Chest / Shoulders / Triceps",
                  completedAt: wi === 0 ? completedAt : null,
                  exercises: [
                    { exerciseId: "bench-press",            sets: 4, reps: "6–8",   restSeconds: 120 },
                    { exerciseId: "incline-dumbbell-press", sets: 3, reps: "8–10",  restSeconds: 90  },
                    { exerciseId: "shoulder-press",         sets: 3, reps: "8–10",  restSeconds: 90  },
                    { exerciseId: "cable-lateral-raise",    sets: 3, reps: "12–15", restSeconds: 60  },
                    { exerciseId: "rope-pushdown",          sets: 3, reps: "10–12", restSeconds: 60  },
                  ],
                },
                {
                  sessionLabel: `Lower ${String.fromCharCode(65 + wi)}`,
                  focus: "Quads / Hamstrings / Glutes",
                  completedAt: null,
                  exercises: [
                    { exerciseId: "barbell-squat", sets: 4, reps: "6–8",   restSeconds: 180 },
                    { exerciseId: "leg-press",     sets: 3, reps: "10–12", restSeconds: 120 },
                    { exerciseId: "romanian-deadlift", sets: 3, reps: "8–10", restSeconds: 120 },
                  ],
                },
                {
                  sessionLabel: `Pull ${String.fromCharCode(65 + wi)}`,
                  focus: "Back / Biceps",
                  completedAt: null,
                  exercises: [
                    { exerciseId: "weighted-pull-up", sets: 4, reps: "6–8",   restSeconds: 120 },
                    { exerciseId: "chest-supported-row", sets: 3, reps: "8–10", restSeconds: 90  },
                    { exerciseId: "lat-pulldown",     sets: 3, reps: "10–12", restSeconds: 90  },
                    { exerciseId: "ez-bar-curl",      sets: 3, reps: "10–12", restSeconds: 60  },
                  ],
                },
              ],
            })),
          };
          const seedWorkout: SavedWorkoutData = {
            sessionName: "Upper Push A",
            note: "Felt strong today. Hit a small PR on bench.",
            date: completedAt.slice(0, 10),
            duration: "1:02:14",
            durationSeconds: 3734,
            totalVolume: 6840,
            totalSets: 16,
            exerciseCount: 5,
            loggedExerciseCount: 5,
            ignoredIncompleteSets: 0,
            exercises: [
              { id: "bench-press",            name: "Bench Press",           primaryMuscle: "Chest",     loggedSets: 4, loggedVolume: 2520, sets: [{ weight: 80, reps: 8, rpe: 7, setType: "normal" }, { weight: 80, reps: 8, rpe: 7.5, setType: "normal" }, { weight: 80, reps: 7, rpe: 8, setType: "normal" }, { weight: 77.5, reps: 7, rpe: 8.5, setType: "normal" }] },
              { id: "incline-dumbbell-press", name: "Incline Dumbbell Press", primaryMuscle: "Chest",     loggedSets: 3, loggedVolume: 1260, sets: [{ weight: 32.5, reps: 10, rpe: 7, setType: "normal" }, { weight: 32.5, reps: 10, rpe: 7.5, setType: "normal" }, { weight: 32.5, reps: 9, rpe: 8, setType: "normal" }] },
              { id: "shoulder-press",         name: "Shoulder Press",         primaryMuscle: "Shoulders", loggedSets: 3, loggedVolume: 1260, sets: [{ weight: 40, reps: 10, rpe: 7, setType: "normal" }, { weight: 40, reps: 10, rpe: 7.5, setType: "normal" }, { weight: 40, reps: 9, rpe: 8, setType: "normal" }] },
              { id: "cable-lateral-raise",    name: "Cable Lateral Raise",    primaryMuscle: "Shoulders", loggedSets: 3, loggedVolume: 600,  sets: [{ weight: 10, reps: 15, rpe: 7, setType: "normal" }, { weight: 10, reps: 14, rpe: 7.5, setType: "normal" }, { weight: 10, reps: 13, rpe: 8, setType: "normal" }] },
              { id: "rope-pushdown",          name: "Rope Pushdown",          primaryMuscle: "Triceps",   loggedSets: 3, loggedVolume: 1200, sets: [{ weight: 32.5, reps: 12, rpe: 7, setType: "normal" }, { weight: 32.5, reps: 11, rpe: 7.5, setType: "normal" }, { weight: 30, reps: 12, rpe: 8, setType: "normal" }] },
            ],
            rewards: [],
            rewardSummary: { set: 0, exercise: 0, session: 0, total: 0 },
            takeawayTitle: "Solid push session!",
            takeawayBody: "16 sets across 5 exercises. Volume up from last week.",
            images: [],
            savedAt: completedAt,
            repiqSourceKey: "0-0",
          };
          persistRepIQPlan(seedPlan);
          persistSavedWorkout(seedWorkout);
          setRepiqPlan(seedPlan);
          setSavedWorkoutsList(getStoredSavedWorkouts());
          setAppView("planner");
          setShowDevPage(false);
        }}
        onClearHistoryData={() => {
          window.localStorage.removeItem(repiqPlanStorageKey);
          window.localStorage.removeItem(savedWorkoutsStorageKey);
          setRepiqPlan(null);
          setSavedWorkoutsList([]);
        }}
      />
    );
  }

  // ── Onboarding gate ──────────────────────────────────────────────────────────
  if (!onboardingComplete && !devBypassGate) {
    return (
      <div data-theme={resolvedTheme} className="ob-shell">
        <OnboardingPage
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
          onComplete={(profileData) => {
            const updated: UserPsychProfile = {
              ...psychProfile,
              ...profileData,
              onboardingCompletedAt: new Date().toISOString(),
            };
            persistPsychProfile(updated);
            setPsychProfile(updated);
            const plan = generateRepIQPlan(updated);
            persistRepIQPlan(plan);
            setRepiqPlan(plan);
            setShowPostOnboarding(true);
          }}
        />
      </div>
    );
  }

  // ── Post-onboarding plan reveal ──────────────────────────────────────────────
  if (showPostOnboarding && repiqPlan) {
    return (
      <PlanRevealPage
        plan={repiqPlan}
        profile={psychProfile}
        resolvedTheme={resolvedTheme}
        onStart={() => { setShowPostOnboarding(false); setAppView("planner"); }}
        onBuildOwn={() => { setShowPostOnboarding(false); setAppView("planner"); }}
      />
    );
  }

  if (editingCustomExercise) {
    return (
      <div data-theme={resolvedTheme}>
        <AddExercisePage
          templates={availableExerciseTemplates}
          existingExerciseNames={exercises.map((exercise) => exercise.name)}
          onBack={() => setEditingCustomExerciseId(null)}
          onAddSelected={addExercisesFromTemplates}
          onCreateCustom={createCustomExercise}
          onOpenDetails={(exerciseId) => openDetails(exerciseId)}
          editorExercise={editingCustomExercise}
          onUpdateCustom={updateCustomExercise}
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
        />
        <BottomNav activeView={appView} onNavigate={(view) => { setEditingCustomExerciseId(null); setAppView(view); }} />
      </div>
    );
  }

  if (detailsExercise) {
    return (
      <div data-theme={resolvedTheme}>
        <ExerciseDetailPage
          exercise={detailsExercise}
          activeTab={detailsTab}
          initialScrollTarget={detailsScrollTarget}
          onTabChange={setDetailsTab}
          onBack={() => setDetailsExerciseId(null)}
          onBrowseExercises={() => { setDetailsExerciseId(null); setAddExerciseOpen(true); }}
          customActions={
            detailsCustomExercise
              ? {
                  deleteMode: detailsCustomExercise.history.length > 0 ? "archive" : "delete",
                  onEdit: () => setEditingCustomExerciseId(detailsCustomExercise.id),
                  onDeleteOrArchive: () => {
                    if (detailsCustomExercise.history.length > 0) {
                      archiveCustomExercise(detailsCustomExercise.id);
                      return;
                    }
                    deleteCustomExercise(detailsCustomExercise.id);
                  }
                }
              : null
          }
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
        />
        <BottomNav activeView={appView} onNavigate={(view) => { setDetailsExerciseId(null); setAppView(view); }} />
      </div>
    );
  }

  if (musclesExercise) {
    return (
      <div data-theme={resolvedTheme}>
        <MusclesWorkedPage
          exercises={exercises}
          selectedExercise={musclesExercise}
          initialMode={musclesPageMode}
          onOpenDetails={(exerciseId) => {
            openDetails(exerciseId);
          }}
          onBack={() => setMusclesExerciseId(null)}
        />
        <BottomNav activeView={appView} onNavigate={(view) => { setMusclesExerciseId(null); setAppView(view); }} />
      </div>
    );
  }

  if (addExerciseOpen) {
    const replaceTarget = smartReplaceExerciseId
      ? exercises.find(e => e.id === smartReplaceExerciseId)
      : null;
    return (
      <div data-theme={resolvedTheme}>
        <AddExercisePage
          templates={availableExerciseTemplates}
          existingExerciseNames={exercises.map((exercise) => exercise.name)}
          onBack={() => { setAddExerciseOpen(false); setSmartReplaceExerciseId(null); }}
          onAddSelected={(templateIds) => {
            if (replaceTarget && templateIds[0]) {
              replaceExerciseWithTemplate(replaceTarget.id, templateIds[0]);
            } else {
              addExercisesFromTemplates(templateIds);
            }
          }}
          onCreateCustom={createCustomExercise}
          onOpenDetails={(exerciseId) => openDetails(exerciseId)}
          onUpdateCustom={updateCustomExercise}
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
          preFilterMuscle={replaceTarget?.primaryMuscle}
          replaceMode={Boolean(replaceTarget)}
        />
        <BottomNav activeView={appView} onNavigate={(view) => { setAddExerciseOpen(false); setSmartReplaceExerciseId(null); setAppView(view); }} />
      </div>
    );
  }

  if (appView === "report" && reportWorkout) {
    return (
      <div data-theme={resolvedTheme}>
        <WorkoutReportPage
          data={reportWorkout}
          onBack={() => setAppView("home")}
          onShare={() => setAppView("share")}
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
        />
        <BottomNav activeView={appView} onNavigate={(view) => setAppView(view)} />
        {/* ── RepIQ plan update prompt ─────────────────────────────────────── */}
        {repiqUpdatePrompt && (
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 600, display: "flex", alignItems: "flex-end" }}
            onClick={() => setRepiqUpdatePrompt(null)}
          >
            <div
              style={{ width: "100%", maxWidth: 430, margin: "0 auto", background: "var(--paper)", borderRadius: "20px 20px 0 0", padding: "20px 20px 32px" }}
              onClick={(e) => e.stopPropagation()}
              data-theme={resolvedTheme}
            >
              <p style={{ fontSize: "1rem", fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>Update your plan?</p>
              <p style={{ fontSize: "0.85rem", color: "var(--subtle-text)", marginBottom: 20 }}>
                You changed exercises in today&apos;s session. RepIQ can update your remaining sessions to avoid overlap and keep things fresh.
              </p>
              <button
                type="button"
                className="primary-button"
                style={{ width: "100%", marginBottom: 10 }}
                onClick={() => {
                  propagateRepIQChanges(repiqUpdatePrompt.weekIdx, repiqUpdatePrompt.dayIdx, repiqUpdatePrompt.completedExerciseIds);
                  setRepiqUpdatePrompt(null);
                }}
              >
                Yes, update future sessions
              </button>
              <button
                type="button"
                className="secondary-button"
                style={{ width: "100%" }}
                onClick={() => setRepiqUpdatePrompt(null)}
              >
                Keep original plan
              </button>
            </div>
          </div>
        )}
        {/* cross-plan prompt removed — plan is flagged silently; review notice shown inline on home and planner */}
      </div>
    );
  }

  if (appView === "history-detail" && (historyDetailWorkout || historyDetailPlanContext)) {
    // Build a plan-only fallback when no saved workout exists
    const planDay = historyDetailPlanContext && repiqPlan
      ? repiqPlan.weeks[historyDetailPlanContext.weekIdx]?.days[historyDetailPlanContext.dayIdx]
      : null;
    const effectiveWorkout: SavedWorkoutData | null = historyDetailWorkout ?? (planDay && historyDetailPlanContext ? {
      sessionName: historyDetailPlanContext.label,
      note: "",
      date: planDay.completedAt ?? new Date().toISOString(),
      duration: "—",
      durationSeconds: 0,
      totalVolume: 0,
      totalSets: 0,
      exerciseCount: planDay.exercises.length,
      loggedExerciseCount: 0,
      ignoredIncompleteSets: 0,
      exercises: planDay.exercises.map(pe => ({
        id: pe.exerciseId,
        name: availableExerciseTemplates.find(t => t.id === pe.exerciseId)?.name ?? pe.exerciseId,
        primaryMuscle: availableExerciseTemplates.find(t => t.id === pe.exerciseId)?.primaryMuscle ?? "",
        loggedSets: 0,
        loggedVolume: 0,
      })),
      rewards: [],
      rewardSummary: { total: 0, session: 0, exercise: 0, set: 0 },
      takeawayTitle: "",
      takeawayBody: "",
      images: [],
      savedAt: planDay.completedAt ?? new Date().toISOString(),
      repiqSourceKey: `${historyDetailPlanContext.weekIdx}-${historyDetailPlanContext.dayIdx}`,
    } : null);
    if (!effectiveWorkout) { setAppView(historyDetailReturnView); return null; }
    const canEdit = !!(effectiveWorkout.repiqSourceKey);
    return (
      <div data-theme={resolvedTheme}>
        <WorkoutHistoryDetailPage
          workout={effectiveWorkout}
          onBack={() => setAppView(historyDetailReturnView)}
          onEdit={canEdit ? () => editHistoryWorkout(effectiveWorkout) : undefined}
          onShare={canEdit ? () => { setReportWorkout(effectiveWorkout); setAppView("share"); } : undefined}
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
        />
      </div>
    );
  }

  if (appView === "insights") {
    return (
      <div data-theme={resolvedTheme}>
        <InsightsPage
          savedWorkouts={savedWorkoutsList}
          onOpenReport={(workout) => { setReportWorkout(workout); setAppView("report"); }}
          onRedoWorkout={redoWorkout}
          onSaveToMyWorkouts={saveHistoryWorkoutToMyWorkouts}
          onDeleteWorkout={deleteHistoryWorkout}
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
        />
        <BottomNav activeView={appView} onNavigate={(view) => setAppView(view)} />
      </div>
    );
  }

  if (appView === "profile") {
    return (
      <div data-theme={resolvedTheme}>
        <ProfilePage
          onBack={() => setAppView("home")}
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
        />
        <BottomNav activeView={appView} onNavigate={(view) => setAppView(view)} />
      </div>
    );
  }

  if (appView === "share" && (savedWorkoutData || reportWorkout)) {
    const shareData = savedWorkoutData ?? reportWorkout!;
    return (
      <div data-theme={resolvedTheme}>
        <PostSaveShareScreen
          data={shareData}
          onDone={() => { setSavedWorkoutData(null); setAppView("report"); }}
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
        />
        <BottomNav activeView={appView} onNavigate={(view) => setAppView(view)} />
      </div>
    );
  }

  if (appView === "finish" && finishWorkoutDraft) {
    return (
      <div data-theme={resolvedTheme}>
        <FinishWorkoutPage
          draft={finishWorkoutDraft}
          onTitleChange={(value) =>
            setFinishWorkoutDraft((current) =>
              current
                ? {
                    ...current,
                    sessionName: value
                  }
                : current
            )
          }
          onNoteChange={(value) =>
            setFinishWorkoutDraft((current) =>
              current
                ? {
                    ...current,
                    note: value
                  }
                : current
            )
          }
          onBack={() => setAppView("logger")}
          onSave={saveFinishedWorkout}
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
        />
        <BottomNav activeView={appView} onNavigate={(view) => setAppView(view)} />
        {templateApplyPromptImages && (
          <section className="sheet-overlay leave-center-overlay" onClick={() => setTemplateApplyPromptImages(null)}>
            <div className="leave-center-card" onClick={(event) => event.stopPropagation()}>
              <div className="sheet-head">
                <div>
                  <p className="label">Update Template</p>
                  <h3>Save changes to your template?</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setTemplateApplyPromptImages(null)}>×</button>
              </div>
              <p className="settings-note">
                You changed the exercises or order during this session. Update your saved template to match, or keep the original.
              </p>
              <div className="sheet-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => finalizeFinishedWorkoutSave(templateApplyPromptImages, false)}
                >
                  Don&apos;t Apply
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => finalizeFinishedWorkoutSave(templateApplyPromptImages, true)}
                >
                  Apply to Original
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    );
  }

  if (appView === "planner") {
    return (
      <div data-theme={resolvedTheme}>
        <PlannerHomePage
          plans={workoutPlans}
          library={availableExerciseTemplates}
          existingTags={existingUserTags}
          activeView={plannerView}
          onViewChange={setPlannerView}
          hasActiveWorkout={hasActiveWorkout}
          onBack={() => setAppView("home")}
          onStartEmpty={() => openQuickSession("planner")}
          onCreateNew={() => {
            setEditingPlan(null);
            if (planBuilderDraft && planBuilderMode !== "edit") {
              setPlanBuilderMode(planBuilderMode);
              setPlanBuilderDraft(planBuilderDraft);
            } else {
              setPlanBuilderMode("create");
              setPlanBuilderDraft(buildBlankWorkoutPlan());
            }
            setAppView("plan-builder");
          }}
          onGeneratePlan={(plan) => {
            setEditingPlan(null);
            setPlanBuilderMode("generate");
            setPlanBuilderDraft(plan);
            setAppView("plan-builder");
          }}
          onStartPlan={(plan) => startPlanWorkout(plan, workoutPlans.some((entry) => entry.id === plan.id) ? "saved" : "library")}
          onEditPlan={(plan) => {
            setEditingPlan(plan);
            setPlanBuilderMode("edit");
            setPlanBuilderDraft(plan);
            setAppView("plan-builder");
          }}
          onDuplicatePlan={duplicatePlan}
          onSharePlan={sharePlan}
          onEditTags={(plan) => {
            setTagPlanId(plan.id);
            setTagPlanDraft(plan.userTags ?? []);
            setTagPlanSearch("");
          }}
          onReorderPlans={reorderPlans}
          onDeletePlan={deletePlan}
          onUseTemplate={useTemplate}
          onResumeWorkout={openActiveWorkout}
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
          defaultGoal={settings.preferredGoal}
          defaultLevel={settings.preferredLevel}
          defaultEquipment={settings.preferredEquipment}
          repiqPlan={repiqPlan}
          initialPlannerMode={plannerInitialMode}
          onStartRepIQSession={startRepIQSession}
          onRegeneratePlan={regenerateRepIQPlan}
          onRegenerateRemaining={regenerateRemainingRepIQSessions}
          onSaveSessionToLibrary={(day, label) => {
            const plan: WorkoutPlan = {
              id: `plan-${Date.now()}`,
              name: label,
              exercises: day.exercises.map((e) => ({
                exerciseId: e.exerciseId,
                setCount: e.sets,
                restTimer: String(e.restSeconds),
              })),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            savePlan(plan);
            setPlannerView("mine");
          }}
          psychProfile={psychProfile}
          onToggleRepIQStatus={() => {
            if (!repiqPlan) return;
            const updated = { ...repiqPlan, status: repiqPlan.status === "paused" ? "active" as const : "paused" as const };
            persistRepIQPlan(updated);
            setRepiqPlan(updated);
          }}
          onDismissReview={() => {
            if (!repiqPlan) return;
            const updated = { ...repiqPlan, needsReview: false };
            persistRepIQPlan(updated);
            setRepiqPlan(updated);
          }}
          savedWorkouts={savedWorkoutsList}
          onOpenHistoryWorkout={(workout, weekIdx, dayIdx, label, sessionNum) => {
            setHistoryDetailWorkout(workout);
            setHistoryDetailPlanContext(repiqPlan ? { weekIdx, dayIdx, label, sessionNum } : null);
            setHistoryDetailReturnView("planner");
            setAppView("history-detail");
          }}
          onSaveHistoryWorkout={saveHistoryWorkoutToMyWorkouts}
        />
        <BottomNav activeView={appView} onNavigate={(view) => setAppView(view)} />

        {hasActiveWorkout && (
          <ActiveWorkoutTray
            sessionName={workoutMeta.sessionName}
            duration={derivedDuration}
            onResume={openActiveWorkout}
            onDiscardRequest={() => {
              setDiscardReturnView("planner");
              setTrayDiscardOpen(true);
            }}
          />
        )}
        {trayDiscardOpen && (
          <section className="sheet-overlay leave-center-overlay" onClick={() => setTrayDiscardOpen(false)}>
            <div className="leave-center-card" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-head">
                <div>
                  <p className="label">Discard Workout</p>
                  <h3>{workoutMeta.sessionName}</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setTrayDiscardOpen(false)}>×</button>
              </div>
              <section className="session-summary session-summary-compact">
                <p className="label">Session so far</p>
                <div className="session-summary-grid">
                  <article className="session-summary-item">
                    <span>Elapsed</span>
                    <strong>{derivedDuration}</strong>
                  </article>
                  <article className="session-summary-item">
                    <span>Completed</span>
                    <strong>{workoutSummary.sets} sets</strong>
                  </article>
                  <article className="session-summary-item">
                    <span>Volume</span>
                    <strong>{workoutSummary.volume.toFixed(0)} kg</strong>
                  </article>
                  <article className="session-summary-item">
                    <span>Incomplete</span>
                    <strong>{incompleteSetCount} sets</strong>
                  </article>
                </div>
              </section>
              <div className="sheet-actions">
                <button className="secondary-button" type="button" onClick={() => setTrayDiscardOpen(false)}>
                  Keep Going
                </button>
                <button className="primary-button is-danger-btn" type="button" onClick={() => { setTrayDiscardOpen(false); discardWorkout(); }}>
                  Discard
                </button>
              </div>
            </div>
          </section>
        )}
        {tagPlanId && (
          <section className="sheet-overlay leave-center-overlay" onClick={() => setTagPlanId(null)}>
            <div className="leave-center-card" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-head">
                <div>
                  <p className="label">Tags</p>
                  <h3>Edit workout tags</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setTagPlanId(null)}>×</button>
              </div>
              <PlanTagPicker
                value={tagPlanDraft}
                existingTags={existingUserTags}
                createLabel="+ New"
                onChange={setTagPlanDraft}
                searchValue={tagPlanSearch}
                onSearchChange={setTagPlanSearch}
              />
              <div className="sheet-actions" style={{ marginTop: "16px" }}>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => {
                    const pending = tagPlanSearch.trim();
                    const allTags = [...new Set([...existingUserTags, ...tagPlanDraft])];
                    const canAdd = pending.length > 0 && !allTags.some(t => t.toLowerCase() === pending.toLowerCase());
                    const finalTags = canAdd ? [...tagPlanDraft, pending] : tagPlanDraft;
                    setPlanTags(tagPlanId, finalTags);
                    setTagPlanSearch("");
                    setTagPlanId(null);
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    );
  }

  if (appView === "plan-builder" && planBuilderDraft) {
    if (builderAddExerciseOpen) {
      const addedIds = new Set(planBuilderDraft.exercises.map((pe) => pe.exerciseId));
      return (
        <div data-theme={resolvedTheme}>
          <AddExercisePage
            templates={availableExerciseTemplates}
            existingExerciseNames={planBuilderDraft.exercises
              .map((pe) => availableExerciseTemplates.find((t) => t.id === pe.exerciseId)?.name ?? "")
              .filter(Boolean)}
            onBack={() => setBuilderAddExerciseOpen(false)}
            onAddSelected={(templateIds) => {
              const newExercises = templateIds
                .filter((id) => !addedIds.has(id))
                .map((id) => ({ exerciseId: id, setCount: 3, setTypes: ["normal", "normal", "normal"] as DraftSetType[], restTimer: "90" }));
              setPlanBuilderDraft((draft) =>
                draft
                  ? { ...draft, exercises: [...draft.exercises, ...newExercises], updatedAt: new Date().toISOString() }
                  : draft
              );
              setBuilderAddExerciseOpen(false);
            }}
            onCreateCustom={(input) => {
              const id = createCustomExercise(input);
              return id;
            }}
            onOpenDetails={(exerciseId) => openDetails(exerciseId)}
            resolvedTheme={resolvedTheme}
            onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
          />
          <BottomNav activeView={appView} onNavigate={(view) => { setBuilderAddExerciseOpen(false); setAppView(view); }} />
          {hasActiveWorkout && (
            <ActiveWorkoutTray
              sessionName={workoutMeta.sessionName}
              duration={derivedDuration}
              onResume={openActiveWorkout}
              onDiscardRequest={() => { setDiscardReturnView("planner"); setTrayDiscardOpen(true); }}
            />
          )}
        </div>
      );
    }

    return (
      <div data-theme={resolvedTheme}>
        <PlanBuilderPage
          draft={planBuilderDraft}
          mode={planBuilderMode}
          library={availableExerciseTemplates}
          existingTags={existingUserTags}
          onBack={() => { setPlannerInitialMode("custom"); setAppView("planner"); }}
          onChange={setPlanBuilderDraft}
          onAddExercise={() => setBuilderAddExerciseOpen(true)}
          onOpenExerciseDetails={(exerciseId) => openDetails(exerciseId)}
          onDeletePlan={planBuilderMode === "edit" && editingPlan ? () => {
            deletePlan(editingPlan.id);
            setEditingPlan(null);
            setPlanBuilderDraft(null);
            setPlanBuilderMode("create");
            setPlannerInitialMode("custom");
            setAppView("planner");
          } : undefined}
          onSavePlan={(plan) => {
            savePlan(plan);
            setEditingPlan(planBuilderMode === "edit" ? plan : null);
            setPlanBuilderDraft(null);
            setPlanBuilderMode("create");
            setPlannerView("mine");
            setPlannerInitialMode("custom");
            setAppView("planner");
          }}
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
        />
        <BottomNav activeView={appView} onNavigate={(view) => setAppView(view)} />
        {hasActiveWorkout && (
          <ActiveWorkoutTray
            sessionName={workoutMeta.sessionName}
            duration={derivedDuration}
            onResume={openActiveWorkout}
            onDiscardRequest={() => { setDiscardReturnView("planner"); setTrayDiscardOpen(true); }}
          />
        )}
      </div>
    );
  }

  if (appView === "home") {
    const latestWorkout = savedWorkoutsList[0] ?? null;
    const streak = computeStreak(savedWorkoutsList);
    const weekStats = getThisWeekStats(savedWorkoutsList);
    const firstName = psychProfile.name?.split(" ")[0] ?? null;
    const greeting = getGreeting();
    const topPR = latestWorkout?.rewards.find((r) => r.category === "pr") ?? null;
    const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
    const muscleCoverage = computeMuscleCoverage(savedWorkoutsList);
    // Which day-of-week slot is "today" (0=Mon, 6=Sun)
    const todayDayNum = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })();

    return (
      <main className={`shell selector-shell${hasActiveWorkout ? " has-tray" : ""}`} data-theme={resolvedTheme}>
        <section className="app-shell selector-page">

          {/* ── Header ── */}
          <header className="home-header">
            <div className="home-header-left">
              <h1 className="home-greeting">
                {firstName ? `${greeting}, ${firstName}` : greeting}
              </h1>
              {streak > 0 && (
                <div className="home-streak-badge">
                  <span className="home-streak-fire">🔥</span>
                  <span className="home-streak-count">{streak}</span>
                  <span className="home-streak-label">{streak === 1 ? "day" : "days"}</span>
                </div>
              )}
            </div>
            <div className="home-header-actions">
              <button
                type="button"
                className="profile-avatar-btn"
                onClick={() => setAppView("profile")}
                aria-label="Open profile"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </button>
              <button
                type="button"
                className="theme-toggle-btn"
                aria-label={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                onClick={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
              >
                {resolvedTheme === "dark" ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="5"/>
                    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                )}
              </button>
            </div>
          </header>

          <section className="selector-stack">

            {/* ── PR highlight ── shows only when latest workout had a PR */}
            {topPR && (
              <div className="home-pr-banner">
                <span className="home-pr-icon">🏆</span>
                <span className="home-pr-text">{topPR.detail}</span>
              </div>
            )}

            {/* ── Primary CTA: context-aware ── */}
            {repiqPlan ? (() => {
              const nextSession = getNextRepIQSession(repiqPlan);
              if (!nextSession) return <p className="home-plan-done-note">All sessions complete — great work!</p>;
              const nextDay = repiqPlan.weeks[nextSession.weekIdx]?.days[nextSession.dayIdx];
              return (
                <div className="home-start-section">
                  <div className="home-next-preview">
                    <p className="home-next-label">Next up</p>
                    <p className="home-next-name">{nextDay?.sessionLabel ?? "Next Session"}</p>
                    <p className="home-next-meta">{nextDay?.exercises.length ?? 0} exercises · Week {nextSession.weekIdx + 1}</p>
                  </div>
                  <button
                    className="primary-button home-start-primary"
                    type="button"
                    disabled={hasActiveWorkout}
                    onClick={() => startRepIQSession(nextSession.weekIdx, nextSession.dayIdx)}
                  >
                    Start Next Workout
                  </button>
                </div>
              );
            })() : (
              <div className="home-start-section">
                <button
                  className="primary-button home-start-primary"
                  type="button"
                  disabled={hasActiveWorkout}
                  onClick={() => openQuickSession("home")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 6, verticalAlign: "middle" }}>
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                  {savedWorkoutsList.length === 0 ? "Start Your First Workout" : "Start Quick Workout"}
                </button>
              </div>
            )}

            {/* ── This week snapshot ── */}
            <article className="home-week-card">
              <p className="home-week-title">This Week</p>
              <div className="home-week-dots">
                {DAY_LABELS.map((label, i) => (
                  <div key={i} className={`home-week-dot-col${i === todayDayNum ? " is-today" : ""}`}>
                    <div className={`home-week-dot${weekStats.activeDayNumbers.includes(i) ? " is-done" : ""}`} />
                    <span className="home-week-day-label">{label}</span>
                  </div>
                ))}
              </div>
              {weekStats.sessions > 0 ? (
                <p className="home-week-meta">
                  {weekStats.sessions} {weekStats.sessions === 1 ? "session" : "sessions"}
                  {weekStats.sets > 0 ? ` · ${weekStats.sets} sets` : ""}
                  {weekStats.volume > 0 ? ` · ${Math.round(weekStats.volume).toLocaleString()} kg` : ""}
                </p>
              ) : (
                <p className="home-week-meta home-week-meta-empty">No workouts yet this week</p>
              )}
            </article>

            {/* ── Muscle coverage card ── */}
            <MuscleCoverageCard coverage={muscleCoverage} mode="history" />

            {/* ── Latest workout card (enhanced) ── */}
            {latestWorkout ? (
              <article
                className="session-card home-latest-card"
                onClick={() => { setReportWorkout(latestWorkout); setAppView("report"); }}
                style={{ cursor: "pointer" }}
              >
                <div className="home-latest-info">
                  <p className="home-latest-label">
                    Last Workout · {getRelativeDate(latestWorkout.date ?? latestWorkout.savedAt)}
                  </p>
                  <h2 className="home-latest-name">{latestWorkout.sessionName}</h2>
                  <p className="home-latest-meta">
                    {latestWorkout.duration}
                    {latestWorkout.totalSets > 0 ? ` · ${latestWorkout.totalSets} sets` : ""}
                    {latestWorkout.totalVolume > 0 ? ` · ${Math.round(latestWorkout.totalVolume).toLocaleString()} kg` : ""}
                  </p>
                </div>
                <span className="home-latest-chevron" aria-hidden="true">›</span>
              </article>
            ) : (
              <article className="session-card home-latest-card home-latest-empty">
                <div className="home-latest-info">
                  <p className="home-latest-label">Last Workout</p>
                  <h2 className="home-latest-name" style={{ color: "var(--muted)" }}>No workouts yet</h2>
                  <p className="home-latest-meta">Complete a workout to see your stats here.</p>
                </div>
              </article>
            )}

            {/* ── Plan card ── */}
            {repiqPlan && (
              <article className="session-card home-plan-card">
                <div className="session-card-top">
                  <div>
                    <p className="label">Your Plan</p>
                    <h2 className="home-plan-name">{repiqPlan.planName}</h2>
                  </div>
                </div>
                <p className="home-plan-meta">{SPLIT_LABEL[repiqPlan.splitType]} · {repiqPlan.daysPerWeek} days/week · {repiqPlan.mesocycleLengthWeeks} weeks</p>
                {repiqPlan.needsReview && (
                  <div className="repiq-needs-review-notice">
                    <span className="repiq-needs-review-text">
                      {repiqPlan.extraVolumeCount ?? 1} extra session{(repiqPlan.extraVolumeCount ?? 1) !== 1 ? "s" : ""} logged outside your plan — your remaining sessions may need a refresh.
                    </span>
                    <button
                      type="button"
                      className="repiq-needs-review-btn"
                      onClick={() => { setPlannerInitialMode("repiq"); setAppView("planner"); }}
                    >
                      Review →
                    </button>
                  </div>
                )}
                <div className="home-plan-actions">
                  <button className="secondary-button" type="button" onClick={() => { setPlannerInitialMode("repiq"); setAppView("planner"); }}>Explore Plan</button>
                  <button className="secondary-button" type="button" onClick={() => { setPlannerInitialMode("custom"); setAppView("planner"); }}>Custom</button>
                </div>
              </article>
            )}

            {/* ── No plan: planner entry ── */}
            {!repiqPlan && (
              <article className="session-card">
                <div className="session-card-top">
                  <div>
                    <p className="label">Workout Planner</p>
                    <h2>Build a plan</h2>
                  </div>
                </div>
                <p className="settings-note">
                  Structure your training with a personalised programme.
                </p>
                <div className="session-card-actions">
                  <button className="secondary-button" type="button" onClick={() => { setPlannerView("library"); setAppView("planner"); }}>
                    Browse library
                  </button>
                  <button className="primary-button" type="button" onClick={() => {
                    setPlanBuilderDraft({ id: crypto.randomUUID(), name: "", exercises: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
                    setPlanBuilderMode("create");
                    setAppView("plan-builder");
                  }}>
                    Custom
                  </button>
                </div>
              </article>
            )}

          </section>
        </section>

        {/* Quick Workout FAB — only shown when a plan is active (CTA handles no-plan case) */}
        {repiqPlan && (
          <button
            className="home-quick-fab"
            type="button"
            disabled={hasActiveWorkout}
            onClick={() => openQuickSession("home")}
            aria-label="Quick workout"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            <span>Quick Workout</span>
          </button>
        )}

        <BottomNav activeView={appView} onNavigate={(view) => setAppView(view)} />

        {hasActiveWorkout && (
          <ActiveWorkoutTray
            sessionName={workoutMeta.sessionName}
            duration={derivedDuration}
            onResume={openActiveWorkout}
            onDiscardRequest={() => {
              setDiscardReturnView("home");
              setTrayDiscardOpen(true);
            }}
          />
        )}
        {trayDiscardOpen && (
          <section className="sheet-overlay leave-center-overlay" onClick={() => setTrayDiscardOpen(false)}>
            <div className="leave-center-card" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-head">
                <div>
                  <p className="label">Discard Workout</p>
                  <h3>{workoutMeta.sessionName}</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setTrayDiscardOpen(false)}>×</button>
              </div>
              <section className="session-summary session-summary-compact">
                <p className="label">Session so far</p>
                <div className="session-summary-grid">
                  <article className="session-summary-item">
                    <span>Elapsed</span>
                    <strong>{derivedDuration}</strong>
                  </article>
                  <article className="session-summary-item">
                    <span>Completed</span>
                    <strong>{workoutSummary.sets} sets</strong>
                  </article>
                  <article className="session-summary-item">
                    <span>Volume</span>
                    <strong>{workoutSummary.volume.toFixed(0)} kg</strong>
                  </article>
                  <article className="session-summary-item">
                    <span>Incomplete</span>
                    <strong>{incompleteSetCount} sets</strong>
                  </article>
                </div>
              </section>
              <div className="sheet-actions">
                <button className="secondary-button" type="button" onClick={() => setTrayDiscardOpen(false)}>
                  Keep Going
                </button>
                <button className="primary-button is-danger-btn" type="button" onClick={() => { setTrayDiscardOpen(false); discardWorkout(); }}>
                  Discard
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    );
  }

  if (settingsOpen) {
    return (
      <>
      <main className="detail-page workout-settings-page" data-theme={resolvedTheme}>
        <header className="detail-topbar">
          <button className="back-nav-button detail-back-button" type="button" onClick={() => setSettingsOpen(false)} aria-label="Back">←</button>
          <div className="detail-topbar-copy">
            <p className="label">Workout</p>
            <h1>Settings</h1>
          </div>
          <button type="button" className="theme-toggle-btn" onClick={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
            {resolvedTheme === "dark" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
          </button>
        </header>

        <div className="workout-settings-body">
          <div className="settings-block">
            <p className="settings-section-title">Session Settings</p>
            <label className="settings-row">
              <span>Default rest timer for new exercises</span>
              <input type="text" inputMode="numeric" value={settings.defaultRestSeconds}
                onChange={(e) => setSettings((c) => ({ ...c, defaultRestSeconds: sanitizeIntegerInput(e.target.value) }))} />
            </label>
            <label className="settings-row">
              <span>Between exercises</span>
              <input type="text" inputMode="numeric" value={settings.transitionRestSeconds}
                onChange={(e) => setSettings((c) => ({ ...c, transitionRestSeconds: sanitizeIntegerInput(e.target.value) }))} />
            </label>
            <label className="toggle-row">
              <span>Carry forward previous values</span>
              <input type="checkbox" checked={settings.carryForwardDefaults}
                onChange={(e) => setSettings((c) => ({ ...c, carryForwardDefaults: e.target.checked }))} />
            </label>
            <label className="toggle-row">
              <span>Show RPE column</span>
              <input type="checkbox" checked={settings.showRpe}
                onChange={(e) => setSettings((c) => ({ ...c, showRpe: e.target.checked }))} />
            </label>
            <p className="settings-note">New exercises use the default rest timer. Existing exercises keep their own timer. The between-exercises timer fires after the final set when moving to the next exercise.</p>
          </div>

          <div className="settings-block">
            <p className="settings-section-title">Guidance Defaults</p>
            <label className="toggle-row">
              <span>Start session with top strip guidance</span>
              <input type="checkbox" checked={settings.guidanceTopStrip}
                onChange={(e) => setSettings((c) => ({ ...c, guidanceTopStrip: e.target.checked }))} />
            </label>
            <label className="toggle-row">
              <span>Start session with inline tips</span>
              <input type="checkbox" checked={settings.guidanceInline}
                onChange={(e) => setSettings((c) => ({ ...c, guidanceInline: e.target.checked }))} />
            </label>
            <p className="settings-note">These defaults apply when a new session starts. Changes during a session only affect the current session.</p>
          </div>

          <div className="settings-block">
            <p className="settings-section-title">Library Defaults</p>
            <p className="settings-note" style={{ marginBottom: 10 }}>Pre-applied filters when you open the Library tab.</p>
            {([
              { label: "Goal", key: "preferredGoal" as const, options: ["Hypertrophy", "Strength", "Endurance"] },
              { label: "Level", key: "preferredLevel" as const, options: ["Beginner", "Intermediate", "Advanced"] },
              { label: "Equipment", key: "preferredEquipment" as const, options: ["Full Gym", "Dumbbells", "Bodyweight"] },
            ]).map(({ label, key, options }) => (
              <div key={key} className="settings-pref-row">
                <span className="settings-pref-label">{label}</span>
                <div className="settings-pref-chips">
                  {options.map((opt) => (
                    <button key={opt} type="button"
                      className={`generate-chip generate-chip--sm${settings[key] === opt ? " is-selected" : ""}`}
                      onClick={() => setSettings((c) => ({ ...c, [key]: c[key] === opt ? null : opt }))}
                    >{opt}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
      <BottomNav activeView={appView} onNavigate={(view) => { setSettingsOpen(false); setAppView(view); }} />
      </>
    );
  }

  return (
    <main
      className={`shell ${showStickyRestDock ? "has-active-rest-dock" : ""} ${
        showStickyRestDock && restDockMinimized ? "has-minimized-rest-dock" : ""
      }`}
      data-theme={resolvedTheme}
    >
      <section className="app-shell">
        {showTopGuidanceSurface && (
          <div className="guidance-top-helper-backdrop" />
        )}
        {showTopGuidanceSurface && (
          <section
            className={`guidance-top-helper ${topGuidanceExpanded ? "is-expanded" : ""}`}
            style={{ transform: `translateY(${topGuidancePullDistance}px)` }}
            onPointerDown={beginGuidancePull}
            onPointerMove={moveGuidancePull}
            onPointerUp={endGuidancePull}
            onPointerCancel={endGuidancePull}
          >
            <div className="guidance-top-helper-handle" aria-hidden="true" />
            <div className="guidance-top-helper-copy">
              <p className="label">Workout Guidance</p>
              <strong>{guidanceTip}</strong>
              <p className="guidance-top-helper-detail">{guidanceWhy}</p>
            </div>
            <button
              className="guidance-top-helper-dismiss"
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setSessionGuidanceTopStrip(false);
                setShowTopGuidance(false);
              }}
            >
              Dismiss
            </button>
          </section>
        )}

        <div ref={topSectionRef}>
          <header className="topbar">
            <div className="topbar-start">
              <button
                className="back-nav-button"
                type="button"
                onClick={returnToWorkoutSelector}
                aria-label="Back"
              >
                ←
              </button>
              <div className="topbar-session-copy">
                <p className="session-name" title={workoutMeta.sessionName}>
                  {workoutMeta.sessionName}
                </p>
                <p className="session-name-meta">
                  {exercises.length} {exercises.length === 1 ? "exercise" : "exercises"}
                </p>
              </div>
            </div>
            <div className="topbar-actions">
              <button type="button" className="theme-toggle-btn" onClick={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
                {resolvedTheme === "dark" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
              </button>
              <button
                className="icon-button topbar-settings-button"
                type="button"
                aria-label="Workout settings and actions"
                title="Alter"
                onClick={() => setWorkoutMenuOpen((current) => !current)}
              >
                <span className="topbar-settings-glyph" aria-hidden="true">⚙</span>
              </button>
              <button
                className="icon-button topbar-collapse-toggle"
                type="button"
                aria-label={
                  collapsedExerciseIds.length === exercises.length && guidanceCollapsed
                    ? "Expand all"
                    : "Collapse all"
                }
                title={
                  collapsedExerciseIds.length === exercises.length && guidanceCollapsed
                    ? "Expand all"
                    : "Collapse all"
                }
                onClick={toggleCollapseAllExercises}
              >
                <span className="stack-toggle-icon" aria-hidden="true">
                  <span className="stack-toggle-corner" />
                  <span
                    className={`stack-toggle-card ${
                      collapsedExerciseIds.length === exercises.length && guidanceCollapsed ? "is-expand" : "is-collapse"
                    }`}
                  >
                    <span className="stack-toggle-card-line" />
                  </span>
                </span>
              </button>
            </div>
          </header>

          <div className="stats-strip">
            <div className="stat-item">
              <span className="stat-label">Duration</span>
              <button
                className="stat-value-button"
                type="button"
                onClick={() => setTimingOpen(true)}
              >
                {derivedDuration}
              </button>
            </div>
            <div className="stat-item stat-item-volume">
              <span className="stat-label">Volume</span>
              <span className="stat-value">{workoutSummary.volume.toFixed(0)} kg</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Sets</span>
              <span className="stat-value">{workoutSummary.sets}</span>
            </div>
            <button
              className={`stat-rewards-button ${rewardSummary.total > 0 ? "has-rewards" : ""}`}
              type="button"
              aria-label="View workout rewards"
              disabled={rewardSummary.set + rewardSummary.exercise === 0}
              onClick={() => setRewardSheetOpen(true)}
            >
              <div className="stat-reward-podium" aria-hidden="true">
                {rewardSummary.exercise > 0 && (
                  <span className="stat-reward-token stat-reward-token-exercise">
                    <span>{rewardLevelIcon.exercise}</span>
                    <strong>{rewardSummary.exercise}</strong>
                  </span>
                )}
                {rewardSummary.set > 0 && (
                  <span className="stat-reward-token stat-reward-token-set">
                    <span>{rewardLevelIcon.set}</span>
                    <strong>{rewardSummary.set}</strong>
                  </span>
                )}
              </div>
            </button>
            <button
              className="stat-muscles-button"
              type="button"
              aria-label="View muscles worked"
              onClick={openWorkoutMusclesPage}
            >
              Muscles ›
            </button>
          </div>
        </div>

        <section className={`exercise-stack ${resolvedFocusedExpandedExerciseId ? "has-focused-card" : ""}`}>
          {resolvedFocusedExpandedExerciseId && (
            <button
              className="logger-focus-backdrop"
              type="button"
              aria-label="Exit focused exercise view"
              onClick={() => setFocusedExpandedExerciseId(null)}
            />
          )}
          <div
            className={`pull-to-add ${pullDownDistance > 0 ? "is-visible" : ""} ${
              pullDownDistance > 58 ? "is-ready" : ""
            }`}
            style={{ height: `${pullDownDistance}px` }}
            onPointerDown={beginPullToAdd}
            onPointerMove={movePullToAdd}
            onPointerUp={endPullToAdd}
            onPointerCancel={endPullToAdd}
          >
            <span>{pullDownDistance > 58 ? "Release for workout actions" : "Pull for workout actions"}</span>
          </div>
          {exercises.length === 0 && (
            <div className="logger-empty-state">
              <p className="logger-empty-title">No exercises yet</p>
              <p className="logger-empty-sub">Add your first exercise to get started.</p>
              <div className="logger-empty-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => setAddExerciseOpen(true)}
                >
                  + Add Exercise
                </button>
                <button
                  className="logger-empty-discard-btn"
                  type="button"
                  onClick={requestDiscardWorkout}
                >
                  Discard
                </button>
              </div>
            </div>
          )}
          {exercises.map((exercise, exerciseIndex) => {
            const lastSession = exercise.history[exercise.history.length - 1];
            const measurementType = getExerciseMeasurementType(exercise);
            const measurementLabels = getMeasurementColumnLabels(measurementType);
            const hasWeightInput = usesWeightInputForMeasurement(measurementType);
            const isCollapsed = collapsedExerciseIds.includes(exercise.id);
            const completedExerciseSets = buildCompletedSets(
              exercise.draftSets,
              lastSession,
              settings.carryForwardDefaults,
              measurementType
            ).resolvedSets;
            const isComplete = exercise.draftSets.length > 0 && exercise.draftSets.every((set) => set.done);
            const loggedSetCount = completedExerciseSets.length;
            const loggedVolume = sumSessionVolume(completedExerciseSets);
            const setRewardCount = loggerRewards.filter(
              (reward) => reward.exerciseId === exercise.id && reward.level === "set"
            ).length;
            const exerciseRewards = loggerRewards.filter(
              (reward) => reward.exerciseId === exercise.id && reward.level === "exercise"
            );
            const focusedExerciseIndex = resolvedFocusedExpandedExerciseId
              ? exercises.findIndex((entry) => entry.id === resolvedFocusedExpandedExerciseId)
              : -1;

            return (
              <article
                key={exercise.id}
                data-exercise-card-id={exercise.id}
                className={`exercise-card ${
                  exercise.id === resolvedActiveExerciseId ? "is-active" : ""
                } ${isComplete ? "is-complete" : ""} ${
                  isComplete && isCollapsed ? "is-complete-collapsed" : ""
                } ${exercise.supersetGroupId ? "has-superset" : ""} ${
                  isCollapsed ? "is-collapsed" : ""
                } ${reorderDragId === exercise.id ? "is-dragging" : ""
                } ${resolvedFocusedExpandedExerciseId === exercise.id ? "is-focused" : ""
                } ${
                  resolvedFocusedExpandedExerciseId &&
                  resolvedFocusedExpandedExerciseId !== exercise.id
                    ? "is-defocused"
                    : ""
                } ${
                  resolvedFocusedExpandedExerciseId &&
                  focusedExerciseIndex !== -1 &&
                  exerciseIndex < focusedExerciseIndex
                    ? "is-before-focus"
                    : ""
                } ${
                  resolvedFocusedExpandedExerciseId &&
                  focusedExerciseIndex !== -1 &&
                  exerciseIndex > focusedExerciseIndex
                    ? "is-after-focus"
                    : ""
                }`}
                style={
                  exercise.supersetGroupId
                    ? ({
                        "--superset-accent": getSupersetAccent(exercise.supersetGroupId) ?? undefined
                      } as CSSProperties)
                    : undefined
                }
                onDragOver={(event) => {
                  if (!reorderDragId || reorderDragId === exercise.id) {
                    return;
                  }
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  if (!reorderDragId || reorderDragId === exercise.id) {
                    return;
                  }
                  event.preventDefault();
                  moveExerciseByIds(reorderDragId, exercise.id);
                  setReorderDragId(null);
                }}
                onClick={() => {
                  if (isCollapsed) {
                    setFocusedExpandedExerciseId(exercise.id);
                    if (!hasStartedExercise) {
                      setPreStartExerciseActive(exercise.id);
                    }
                    toggleExerciseCollapse(exercise.id);
                  } else {
                    setInteractedExerciseActive(exercise.id);
                  }
                  setMenuExerciseId(null);
                }}
                >
                <div
                  className="exercise-title-row"
                  draggable
                  onDragStart={(event) => {
                    setReorderDragId(exercise.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", exercise.id);
                  }}
                  onDragEnd={() => setReorderDragId(null)}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (isCollapsed) {
                      setFocusedExpandedExerciseId(exercise.id);
                    }
                    if (!hasStartedExercise) {
                      setPreStartExerciseActive(exercise.id);
                    }
                    toggleExerciseCollapse(exercise.id);
                  }}
                >
                  <button
                    className="exercise-header-toggle"
                    type="button"
                    aria-label={isCollapsed ? `Expand ${exercise.name}` : `Collapse ${exercise.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (isCollapsed) {
                        setFocusedExpandedExerciseId(exercise.id);
                      }
                      if (!hasStartedExercise) {
                        setPreStartExerciseActive(exercise.id);
                      }
                        toggleExerciseCollapse(exercise.id);
                      }}
                  >
                    <img src={exercise.imageSrc} alt="" className="exercise-thumb" aria-hidden="true" />
                  </button>
                  <div className="exercise-title-copy">
                    <div className="exercise-title-heading">
                      <button
                        className={`exercise-link ${exercise.id === resolvedActiveExerciseId ? "is-active" : ""}`}
                        type="button"
                        title={exercise.name}
                        style={exercise.id === resolvedActiveExerciseId ? { color: "var(--accent)" } : undefined}
                        onPointerDown={() => beginTitleHold(exercise.id)}
                        onPointerUp={endTitleHold}
                        onPointerCancel={endTitleHold}
                        onPointerLeave={endTitleHold}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (titleHoldTriggered.current) {
                            titleHoldTriggered.current = false;
                            return;
                          }
                          openDetails(exercise.id);
                        }}
                      >
                        {exercise.name}
                      </button>
                      {exercise.id === resolvedActiveExerciseId && (
                        <span className="exercise-active-indicator" aria-hidden="true" />
                      )}
                    </div>
                  </div>
                  {(exerciseRewards.length > 0 || (isCollapsed && setRewardCount > 0)) && (
                    <button
                      className="exercise-reward-trigger"
                      type="button"
                      aria-label="View exercise reward summary"
                      title={
                        isCollapsed
                          ? [
                              setRewardCount > 0 ? `${setRewardCount} set rewards` : null,
                              exerciseRewards.length > 0
                                ? exerciseRewards.map((reward) => reward.shortLabel).join(", ")
                                : null
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : exerciseRewards.map((reward) => reward.shortLabel).join(", ")
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        setRewardSheetOpen(true);
                      }}
                    >
                      {isCollapsed ? (
                        <>
                          {exerciseRewards.length > 0 && (
                            <span className="reward-inline reward-inline-exercise">
                              <span className="reward-inline-icon" aria-hidden="true">
                                {rewardLevelIcon.exercise}
                              </span>
                              <span>{exerciseRewards.length}</span>
                            </span>
                          )}
                          {setRewardCount > 0 && (
                            <span className="reward-inline reward-inline-set">
                              <span className="reward-inline-icon" aria-hidden="true">
                                {rewardLevelIcon.set}
                              </span>
                              <span>{setRewardCount}</span>
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="reward-inline reward-inline-exercise">
                          <span className="reward-inline-icon" aria-hidden="true">
                            {rewardLevelIcon.exercise}
                          </span>
                          <span>{exerciseRewards.length}</span>
                        </span>
                      )}
                    </button>
                  )}
                  {isCollapsed && exercise.supersetGroupId && (
                    <span
                      className="superset-badge superset-badge-inline"
                      style={
                        {
                          "--superset-accent":
                            getSupersetAccent(exercise.supersetGroupId) ?? undefined
                        } as CSSProperties
                      }
                    >
                      Superset
                    </span>
                  )}
                  <div className="exercise-title-actions">
                    <button
                      className="icon-button exercise-collapse-button"
                      type="button"
                      aria-label={isCollapsed ? "Expand exercise" : "Collapse exercise"}
                      aria-expanded={!isCollapsed}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (isCollapsed) {
                          setFocusedExpandedExerciseId(exercise.id);
                        }
                        if (!hasStartedExercise) {
                          setPreStartExerciseActive(exercise.id);
                        }
                        toggleExerciseCollapse(exercise.id);
                      }}
                    >
                      {isCollapsed ? "⌄" : "⌃"}
                    </button>
                    <button
                      className="icon-button exercise-menu-button"
                      type="button"
                      aria-label="Exercise options"
                      onClick={(event) => {
                        event.stopPropagation();
                        setMenuExerciseId((current) =>
                          current === exercise.id ? null : exercise.id
                        );
                      }}
                    >
                      ⋮
                    </button>
                  </div>
                </div>

                {isCollapsed && (
                  <p className="exercise-collapsed-meta">
                    {loggedSetCount} set{loggedSetCount === 1 ? "" : "s"} logged ·{" "}
                    {loggedVolume > 0 ? (
                      <strong className="exercise-collapsed-volume">
                        {loggedVolume.toFixed(0)} kg volume
                      </strong>
                    ) : (
                      <span>{loggedVolume.toFixed(0)} kg volume</span>
                    )}
                  </p>
                )}

                {exercise.stickyNoteEnabled && (
                  <button
                    className={`exercise-sticky-note ${
                      exercise.note.trim().length > 0 ? "has-note" : "is-empty"
                    }`}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openNoteEditor(exercise.id);
                    }}
                  >
                    <span className="exercise-sticky-label">Sticky note</span>
                    <span className="exercise-sticky-text">
                      {exercise.note.trim().length > 0 ? exercise.note : "Add a quick reference note"}
                    </span>
                  </button>
                )}

                <div className="rest-timer-row" onClick={(event) => event.stopPropagation()}>
                  <div className="rest-timer-main">
                    <span className="rest-timer-icon" aria-hidden="true">◷</span>
                    <span className="rest-timer-label">Rest Timer:</span>
                    <span className="rest-timer-controls">
                      {activeRestTimer?.exerciseId === exercise.id ? (
                        <>
                          <span className="rest-timer-countdown">
                            {formatRemainingSeconds(activeRestSeconds)}
                          </span>
                          <button
                            className="rest-timer-icon-button"
                            type="button"
                            aria-label={
                              activeRestTimer.pausedRemainingSeconds !== null
                                ? "Resume rest timer"
                                : "Pause rest timer"
                            }
                            onClick={() => togglePauseRestTimer(exercise.id)}
                          >
                            {activeRestTimer.pausedRemainingSeconds !== null ? "▶" : "⏸"}
                          </button>
                          <button
                            className="rest-timer-icon-button rest-timer-stop-button"
                            type="button"
                            aria-label="Stop rest timer"
                            onClick={() => stopRestTimer(exercise.id)}
                          >
                            <span className="rest-timer-stop-glyph" aria-hidden="true">■</span>
                          </button>
                        </>
                      ) : (
                        <button
                          className="rest-timer-trigger"
                          type="button"
                          aria-label={`Edit ${exercise.name} rest timer`}
                          onClick={() => openRestTimerEditor(exercise.id)}
                        >
                          {exercise.restTimer}
                        </button>
                      )}
                    </span>
                  </div>
                  {exercise.supersetGroupId && (
                    <span
                      className="superset-badge"
                      style={
                        {
                          "--superset-accent":
                            getSupersetAccent(exercise.supersetGroupId) ?? undefined
                        } as CSSProperties
                      }
                    >
                      Superset
                    </span>
                  )}
                </div>

                {sessionGuidanceInline &&
                  !allExercisesComplete &&
                  !isCollapsed &&
                  exerciseIndex === activeExerciseIndex && (
                    <div className="exercise-guidance-inline-wrap">
                      <button
                        className="exercise-guidance-inline"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setInlineGuidanceOpen(true);
                        }}
                      >
                        <span className="exercise-guidance-inline-label">Next Tip</span>
                        <span className="exercise-guidance-inline-text">{guidanceTip}</span>
                        <span className="exercise-guidance-inline-arrow" aria-hidden="true">›</span>
                      </button>
                      <button
                        className="exercise-guidance-inline-dismiss"
                        type="button"
                        aria-label="Disable inline tips"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSessionGuidanceInline(false);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )}

                <div className={`set-grid-header ${settings.showRpe ? "has-rpe" : "no-rpe"}`}>
                  <span>Set</span>
                  <span>Previous</span>
                  <span>{measurementLabels.first}</span>
                  <span>{measurementLabels.second}</span>
                  {settings.showRpe && <span>RPE</span>}
                  <label className="done-cell done-cell-header" title="Mark all sets done" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={exercise.draftSets.length > 0 && exercise.draftSets.every(s => s.done)}
                      onChange={() => {
                        const allDone = exercise.draftSets.every(s => s.done);
                        if (!allDone) {
                          const targetId = exercise.id;
                          setExercises(prev => prev.map(ex => {
                            if (ex.id !== targetId) return ex;
                            const lastSession = ex.history[ex.history.length - 1];
                            return {
                              ...ex,
                              draftSets: ex.draftSets.map((set, i) => {
                                if (set.done) return set;
                                const measurementType = getExerciseMeasurementType(ex);
                                const carrySource = getCurrentExerciseCarrySource(ex.draftSets, i);
                                const previousSet = getPreviousReferenceSet(ex.draftSets, i, lastSession);
                                const resolvedWeight = usesWeightInputForMeasurement(measurementType)
                                  ? settings.carryForwardDefaults && set.weightInput.trim() === ""
                                    ? carrySource?.weightInput?.trim().length ? carrySource.weightInput
                                      : previousSet ? String(previousSet.weight) : ""
                                    : set.weightInput
                                  : "";
                                const resolvedReps = settings.carryForwardDefaults && set.repsInput.trim() === ""
                                  ? carrySource?.repsInput?.trim().length ? carrySource.repsInput
                                    : previousSet ? String(previousSet.reps) : ""
                                  : set.repsInput;
                                const resolvedRpe = settings.carryForwardDefaults && set.rpeInput.trim() === ""
                                  ? carrySource?.rpeInput?.trim().length ? carrySource.rpeInput
                                    : typeof previousSet?.rpe === "number" && Number.isFinite(previousSet.rpe)
                                      ? String(previousSet.rpe) : ""
                                  : set.rpeInput;
                                return { ...set, done: true, weightInput: resolvedWeight, repsInput: resolvedReps, rpeInput: resolvedRpe };
                              })
                            };
                          }));
                        } else {
                          setExercises(prev => prev.map(ex =>
                            ex.id === exercise.id
                              ? { ...ex, draftSets: ex.draftSets.map(s => ({ ...s, done: false })) }
                              : ex
                          ));
                        }
                      }}
                    />
                  </label>
                </div>

                <div className="set-list">
                  {exercise.draftSets.map((draftSet, index) => {
                    const previousSet = getPreviousReferenceSet(
                      exercise.draftSets,
                      index,
                      lastSession
                    );
                    const setLabel = getDisplaySetLabel(exercise.draftSets, index);
                    const rowId = `${exercise.id}:${draftSet.id}`;
                    const isSetTypePickerOpen = setTypePickerRowId === rowId;
                    const isDraggingRow = swipeState.rowId === rowId && swipeState.dragging;
                    const isDeleteRevealed = revealedDeleteRowId === rowId;
                    const swipeDirection =
                      isDraggingRow && swipeState.deltaX > 0
                        ? "right"
                        : isDraggingRow && swipeState.deltaX < 0
                          ? "left"
                          : null;
                    const translateX =
                      swipeState.rowId === rowId
                        ? swipeState.dragging
                          ? Math.max(-68, Math.min(92, swipeState.deltaX))
                          : 0
                        : isDeleteRevealed
                          ? 92
                          : 0;
                    const setRewards = loggerRewards.filter(
                      (reward) =>
                        reward.exerciseId === exercise.id &&
                        reward.setId === draftSet.id &&
                        reward.level === "set"
                    );

                    return (
                      <div
                        key={draftSet.id}
                        className={`set-row-shell ${
                          isDraggingRow || isDeleteRevealed ? "is-swipe-visible" : ""
                        } ${isSetTypePickerOpen ? "has-type-picker" : ""} ${
                          isSetTypePickerOpen ? "is-picker-open" : ""
                        } ${swipeDirection === "left" ? "show-done-action" : ""} ${
                          swipeDirection === "right" || isDeleteRevealed
                            ? "show-delete-action"
                            : ""
                        }`}
                      >
                        <div className="swipe-action swipe-action-delete">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeSet(exercise.id, draftSet.id);
                            }}
                          >
                            Delete Set
                          </button>
                        </div>
                        <div className="swipe-action swipe-action-done">
                          <span>Done</span>
                        </div>
                        <div
                          className={`set-row ${settings.showRpe ? "has-rpe" : "no-rpe"} ${
                            draftSet.done ? "is-done" : ""
                          }`}
                          style={{ transform: `translateX(${translateX}px)` }}
                          onPointerDown={(event) => beginSwipe(rowId, event)}
                          onPointerMove={(event) => moveSwipe(rowId, event)}
                          onPointerUp={(event) => endSwipe(exercise.id, index, rowId, event)}
                          onPointerCancel={(event) => {
                            if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
                              event.currentTarget.releasePointerCapture(event.pointerId);
                            }
                            resetSwipeState();
                          }}
                          onLostPointerCapture={() => resetSwipeState()}
                        >
                          <button
                            type="button"
                            data-set-type-trigger
                            className={`set-type-button set-type ${
                              draftSet.setType
                            }`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSetTypePickerRowId((current) =>
                                current === rowId ? null : rowId
                              );
                            }}
                          >
                            {setLabel}
                          </button>
                          <button
                            type="button"
                            className={`previous-cell ${
                              previousSet ? "previous-cell-button" : "previous-cell-empty"
                            }`}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (previousSet) {
                                applyPreviousValuesToDraftSet(exercise.id, index);
                              }
                            }}
                            disabled={!previousSet}
                            title={previousSet ? "Use previous values" : undefined}
                          >
                            {formatPreviousSet(previousSet, measurementType)}
                          </button>
                          <input
                            className={`cell-input ${!hasWeightInput ? "cell-input-disabled" : ""}`}
                            type="text"
                            inputMode="decimal"
                            placeholder={
                              hasWeightInput && settings.carryForwardDefaults
                                ? getCurrentExerciseCarrySource(exercise.draftSets, index)?.weightInput || ""
                                : ""
                            }
                            value={hasWeightInput ? draftSet.weightInput : ""}
                            disabled={!hasWeightInput}
                            readOnly={!hasWeightInput}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) =>
                              updateDraftSet(exercise.id, index, "weightInput", event.target.value)
                            }
                          />
                          <input
                            className="cell-input"
                            type="text"
                            inputMode="numeric"
                            placeholder={
                              settings.carryForwardDefaults
                                ? getCurrentExerciseCarrySource(exercise.draftSets, index)?.repsInput || ""
                                : ""
                            }
                            value={draftSet.repsInput}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) =>
                              updateDraftSet(exercise.id, index, "repsInput", event.target.value)
                            }
                          />
                          {settings.showRpe && (
                            <input
                              className="cell-input cell-input-rpe"
                              type="text"
                              inputMode="decimal"
                              placeholder={
                                settings.carryForwardDefaults
                                  ? getCurrentExerciseCarrySource(exercise.draftSets, index)?.rpeInput || "RPE"
                                  : "RPE"
                              }
                              value={draftSet.rpeInput}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                updateDraftSet(exercise.id, index, "rpeInput", event.target.value)
                              }
                            />
                          )}
                          <label className="done-cell" onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={draftSet.done}
                              onChange={(event) => {
                                if (event.target.checked) {
                                  markSetDone(exercise.id, index);
                                  return;
                                }
                                markSetUndone(exercise.id, index);
                              }}
                            />
                          </label>
                        </div>

                        {isSetTypePickerOpen && (
                          <div className="set-type-picker" data-set-type-picker>
                            {setTypeOptions.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={`set-type-option ${
                                  draftSet.setType === option.value ? "is-active" : ""
                                }`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  updateSetType(exercise.id, index, option.value);
                                }}
                              >
                                <span
                                  className={`set-type-option-symbol ${option.value}`}
                                >
                                  {option.symbol}
                                </span>
                                <span className="set-type-option-label">{option.label}</span>
                              </button>
                            ))}
                            <button
                              type="button"
                              className="set-type-option set-type-option-delete"
                              onClick={(event) => {
                                event.stopPropagation();
                                removeSet(exercise.id, draftSet.id);
                                setSetTypePickerRowId(null);
                              }}
                            >
                              <span className="set-type-option-symbol failure">x</span>
                              <span className="set-type-option-label">Delete set</span>
                            </button>
                          </div>
                        )}

                        {setRewards.length > 0 && (
                          <button
                            className="reward-inline-row reward-inline-row-set reward-inline-trigger"
                            type="button"
                            aria-label={`${setRewards.length} set rewards`}
                            title={setRewards.map((reward) => reward.shortLabel).join(", ")}
                            onClick={(event) => {
                              event.stopPropagation();
                              setRewardSheetOpen(true);
                            }}
                          >
                            {setRewards.map((reward) => (
                              <span key={reward.id} className="reward-inline reward-inline-set">
                                <span className="reward-inline-icon" aria-hidden="true">
                                  {rewardLevelIcon.set}
                                </span>
                                <span className="reward-inline-text">{reward.shortLabel}</span>
                              </span>
                            ))}
                          </button>
                        )}

                      </div>
                    );
                  })}
                </div>

                <button
                  className="add-set-button"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    addSet(exercise.id);
                  }}
                >
                  + Add Set
                </button>

                    <details className="history-details" onClick={(event) => event.stopPropagation()}>
                  <summary>History</summary>
                  <div className="history-list">
                    {[...exercise.history]
                      .reverse()
                      .slice(0, 3)
                      .map((session) => (
                        <article key={session.session_key ?? session.date} className="history-card">
                          <div className="history-top">
                            <strong>{formatSessionDate(session.date)}</strong>
                            <span>
                              {session.sets
                                .reduce((total, set) => total + set.weight * set.reps, 0)
                                .toFixed(0)}{" "}
                              kg
                            </span>
                          </div>
                          <p className="history-detail">
                            {session.sets
                              .map((set) => formatPreviousSet(set, measurementType))
                              .join(" • ")}
                          </p>
                        </article>
                      ))}
                  </div>
                </details>
              </article>
            );
          })}
        </section>

        {hasExercises && activeExercise && (
          <section className={`coach-shell ${guidanceCollapsed ? "is-collapsed" : ""}`}>
            <header className="coach-header">
              <div className="coach-header-text">
                <p className="label">{allExercisesComplete ? "Overall Guidance" : "Next Guidance"}</p>
                {!guidanceCollapsed && (
                  <h2>{allExercisesComplete ? "Workout" : activeExercise.name}</h2>
                )}
              </div>
              {guidanceCollapsed && (
                <div className="coach-collapsed-preview">
                  <strong className="coach-collapsed-title">
                    {allExercisesComplete ? "Workout" : activeExercise.name}
                  </strong>
                  <p className="coach-collapsed-tip">{guidanceTip}</p>
                </div>
              )}
              {!guidanceCollapsed && (state.status === "loading" || state.status === "success" || state.engineSource) && (
                <div className="status-group">
                  {(state.status === "loading" || state.status === "success") && (
                    <span className={`status-pill status-${state.status}`}>
                      {state.status === "loading" && "Checking"}
                      {state.status === "success" && "Ready"}
                    </span>
                  )}
                  {state.engineSource && (
                    <span className="status-pill status-source">
                      {state.engineSource === "live" ? "Engine live" : "Fallback only"}
                    </span>
                  )}
                </div>
              )}
              <button
                className="coach-collapse-toggle"
                type="button"
                aria-label={guidanceCollapsed ? "Expand guidance" : "Collapse guidance"}
                onClick={() => setGuidanceCollapsed((c) => !c)}
              >
                {guidanceCollapsed ? "⌄" : "⌃"}
              </button>
            </header>

            {!guidanceCollapsed && (
              <>
                {!hasGuidance && (
                  <div className="idle-card">
                    <strong>{guidanceTip}</strong>
                    <p>{guidanceWhy}</p>
                  </div>
                )}

                {state.status === "loading" && (
                  <div className="loading-card">
                    <div className="loading-bar" />
                    <p>Analysing your last sets…</p>
                  </div>
                )}

                {state.message && (
                  <div className={`notice ${state.status === "error" ? "notice-error" : ""}`}>
                    {state.message}
                  </div>
                )}

                {state.suggestion && (
                  <article className={`coach-card ${certaintyTone[state.suggestion.certainty]}`}>
                    <p className="label">
                      Tip
                      <span className={`certainty-badge certainty-badge-${state.suggestion.certainty}`}>
                        {state.suggestion.certainty}
                      </span>
                    </p>
                    <h3 className="coach-tip">{guidanceTip}</h3>
                    <p className="coach-why">{guidanceWhy}</p>
                  </article>
                )}
              </>
            )}

            {!guidanceCollapsed && (
              <div className="coach-footer">
                <span className="coach-footer-label">Show in</span>
                <div className="guidance-mode-row">
                  <button
                    className={`guidance-mode-button ${sessionGuidanceTopStrip ? "is-active" : ""}`}
                    type="button"
                    onClick={() => {
                      setSessionGuidanceTopStrip((prev) => !prev);
                      setShowTopGuidance(false);
                    }}
                  >
                    Top Strip
                  </button>
                  <button
                    className={`guidance-mode-button ${sessionGuidanceInline ? "is-active" : ""}`}
                    type="button"
                    onClick={() => setSessionGuidanceInline((prev) => !prev)}
                  >
                    Inline
                  </button>
                </div>
              </div>
            )}

          </section>
        )}

        {exercises.length > 0 && <div className="logger-end-actions">
          <div className="logger-end-actions-row">
            <button
              className="secondary-button logger-action-button logger-add-button"
              type="button"
              onClick={() => setAddExerciseOpen(true)}
            >
              + Exercise
            </button>
            <button
              className="secondary-button logger-action-button logger-discard-button"
              type="button"
              onClick={requestDiscardWorkout}
            >
              Discard
            </button>
          </div>
          <button
            className="primary-button logger-finish-button"
            type="button"
            onClick={() => void finishWorkout()}
            disabled={completedSetCount === 0}
            title={completedSetCount === 0 ? "Complete at least one set to finish" : undefined}
          >
            Finish Workout
          </button>
          {completedSetCount === 0 && (
            <p className="finish-blocked-hint">Complete at least 1 set to finish</p>
          )}
        </div>}

        {showStickyRestDock && activeRestExercise && (
          restDockMinimized ? (
            <button
              className="sticky-rest-dock-minimized"
              type="button"
              onClick={() => setRestDockMinimized(false)}
              aria-label={`Expand active rest timer for ${activeRestExercise.name}`}
            >
              <span className="sticky-rest-dock-minimized-icon" aria-hidden="true">◷</span>
              <span className="sticky-rest-dock-minimized-time">{formatRemainingSeconds(activeRestSeconds)}</span>
            </button>
          ) : (
            <section className="sticky-rest-dock" aria-label="Active rest timer">
              <div className="sticky-rest-dock-progress" aria-hidden="true">
                <span
                  className="sticky-rest-dock-progress-fill"
                  style={{ width: `${stickyRestProgressPercent}%` }}
                />
              </div>
              <div className="sticky-rest-dock-controls">
                <div className="sticky-rest-dock-left">
                  <button
                    className="rest-timer-icon-button sticky-rest-dismiss-button"
                    type="button"
                    aria-label="Hide bottom rest timer"
                    onClick={() => setShowBottomRestDock(false)}
                  >
                    ×
                  </button>
                  <button
                    className="rest-timer-icon-button rest-timer-stop-button"
                    type="button"
                    aria-label="Stop rest timer"
                    onClick={() => stopRestTimer(activeRestExercise.id)}
                  >
                    <span className="rest-timer-stop-glyph" aria-hidden="true">■</span>
                  </button>
                </div>
                <div className="sticky-rest-dock-center">
                  <button
                    className="sticky-rest-adjust-button"
                    type="button"
                    onClick={() => adjustActiveRestTimer(-5)}
                    aria-label="Reduce rest timer by 5 seconds"
                  >
                    -5
                  </button>
                  <button
                    className={`sticky-rest-dock-time${activeRestTimer?.pausedRemainingSeconds !== null ? " is-paused" : ""}`}
                    type="button"
                    onClick={() => togglePauseRestTimer(activeRestExercise.id)}
                    aria-label={
                      activeRestTimer?.pausedRemainingSeconds !== null
                        ? "Resume rest timer"
                        : "Pause rest timer"
                    }
                  >
                    {formatRemainingSeconds(activeRestSeconds)}
                  </button>
                  <button
                    className="sticky-rest-adjust-button"
                    type="button"
                    onClick={() => adjustActiveRestTimer(5)}
                    aria-label="Increase rest timer by 5 seconds"
                  >
                    +5
                  </button>
                </div>
                <button
                  className="sticky-rest-dock-minimize"
                  type="button"
                  aria-label="Minimize active rest timer"
                  onClick={() => setRestDockMinimized(true)}
                >
                  <span className="sticky-rest-dock-minimize-glyph" aria-hidden="true">›</span>
                </button>
              </div>
            </section>
          )
        )}

        {leavePromptOpen && (
          <section className="sheet-overlay leave-center-overlay" onClick={() => setLeavePromptOpen(false)}>
            <div className="leave-center-card" onClick={(event) => event.stopPropagation()}>
              <div className="sheet-head">
                <div>
                  <p className="label">Leave Workout</p>
                  <h3>{workoutMeta.sessionName}</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setLeavePromptOpen(false)}>
                  ×
                </button>
              </div>
              <p className="settings-note">
                Your workout stays active. You can resume it later, but you won&apos;t be able to start
                another one until this is finished or discarded.
              </p>
              <section className="session-summary session-summary-compact">
                <p className="label">Workout Summary</p>
                <div className="session-summary-grid">
                  <article className="session-summary-item">
                    <span>Elapsed</span>
                    <strong>{derivedDuration}</strong>
                  </article>
                  <article className="session-summary-item">
                    <span>Logged</span>
                    <strong>{workoutSummary.sets} sets</strong>
                  </article>
                  <article className="session-summary-item">
                    <span>Volume</span>
                    <strong>{workoutSummary.volume.toFixed(0)} kg</strong>
                  </article>
                  <article className="session-summary-item">
                    <span>Exercises</span>
                    <strong>{exercises.length}</strong>
                  </article>
                </div>
              </section>
              <div className="sheet-actions">
                <button className="secondary-button" type="button" onClick={() => setLeavePromptOpen(false)}>
                  Stay Here
                </button>
                <button className="primary-button" type="button" onClick={returnToWorkoutSelector}>
                  Come back later
                </button>
              </div>
            </div>
          </section>
        )}

        {finishConfirmOpen && (() => {
          const emptyExercises = exercises.filter(ex =>
            ex.draftSets.some(s => s.done && s.repsInput.trim() === "")
          );
          const hasIncomplete = incompleteSetCount > 0;
          const hasEmpty = emptyExercises.length > 0;
          const allEmpty = exercises
            .filter(ex => ex.draftSets.some(s => s.done))
            .every(ex => ex.draftSets.every(s => !s.done || s.repsInput.trim() === ""));
          const canFinishAnyway = !allEmpty;
          return (
            <section className="sheet-overlay leave-center-overlay" onClick={() => setFinishConfirmOpen(false)}>
              <div className="leave-center-card" onClick={(event) => event.stopPropagation()}>
                <div className="sheet-head">
                  <div>
                    <p className="label">Finish Workout</p>
                    <h3>A few things to check</h3>
                  </div>
                  <button className="icon-button" type="button" onClick={() => setFinishConfirmOpen(false)}>×</button>
                </div>
                {hasIncomplete && (
                  <p className="settings-note" style={{ marginBottom: hasEmpty ? 6 : undefined }}>
                    <strong>{incompleteSetCount} {incompleteSetCount === 1 ? "set is" : "sets are"} still incomplete.</strong> You can go back and finish them, or finish anyway and they'll be skipped.
                  </p>
                )}
                {hasEmpty && (
                  <>
                    <p className="settings-note" style={{ marginBottom: 4 }}>
                      {allEmpty
                        ? "None of your completed sets have weight or reps entered."
                        : `${emptyExercises.length === 1 ? "1 exercise has" : `${emptyExercises.length} exercises have`} sets marked done but no values:`}
                    </p>
                    {!allEmpty && (
                      <ul style={{ margin: "0 0 10px", paddingLeft: "20px", fontSize: "0.88rem", color: "var(--ink)" }}>
                        {emptyExercises.map(ex => <li key={ex.id}>{ex.name}</li>)}
                      </ul>
                    )}
                  </>
                )}
                <div className="logger-end-actions finish-confirm-actions">
                  <div className="logger-end-actions-row finish-confirm-actions-row">
                    <button
                      className="secondary-button logger-action-button logger-add-button"
                      type="button"
                      onClick={() => setFinishConfirmOpen(false)}
                    >
                      Go Back
                    </button>
                  </div>
                  {canFinishAnyway && (
                    <button className="primary-button logger-finish-button" type="button" onClick={() => void finishWorkoutAnyway()}>
                      Finish Anyway
                    </button>
                  )}
                </div>
              </div>
            </section>
          );
        })()}

        {discardConfirmOpen && (
          <section className="sheet-overlay bottom-sheet-overlay" onClick={() => setDiscardConfirmOpen(false)}>
            <div className="sheet-card action-sheet" onClick={(event) => event.stopPropagation()}>
              <div className="sheet-handle" />
              <div className="sheet-head">
                <div>
                  <p className="label">Discard Workout</p>
                  <h3>{workoutMeta.sessionName}</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setDiscardConfirmOpen(false)}>
                  ×
                </button>
              </div>
              <p className="settings-note">
                This will remove the current workout in progress. You can&apos;t undo this action.
              </p>
              <div className="sheet-actions">
                <button className="secondary-button" type="button" onClick={() => setDiscardConfirmOpen(false)}>
                  Cancel
                </button>
                <button className="secondary-button logger-discard-button" type="button" onClick={discardWorkout}>
                  Discard workout
                </button>
              </div>
            </div>
          </section>
        )}


        {activeMenuExercise && (
          <section
            className="sheet-overlay bottom-sheet-overlay"
            onClick={() => setMenuExerciseId(null)}
          >
            <div
              className="sheet-card action-sheet"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sheet-handle" />
              <div className="ex-action-header">
                <div className="ex-action-header-body">
                  <button
                    type="button"
                    className="ex-action-heading-link"
                    onClick={() => openDetails(activeMenuExercise.id)}
                  >
                    {activeMenuExercise.name}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                  <div className="ex-action-meta">
                    {(activeMenuExercise as ExerciseWithTaxonomy).movementPattern && (
                      <span className="ex-action-pattern">{((activeMenuExercise as ExerciseWithTaxonomy).movementPattern ?? "").replace(/_/g, " ")}</span>
                    )}
                    <span className="ex-action-muscle">
                      <strong>{activeMenuExercise.primaryMuscle}</strong>
                      {activeMenuExercise.secondaryMuscles && activeMenuExercise.secondaryMuscles.length > 0 && (
                        <span className="ex-action-secondary-muscles"> · {activeMenuExercise.secondaryMuscles.slice(0, 2).join(", ")}</span>
                      )}
                    </span>
                  </div>
                </div>
                <button className="icon-button" type="button" onClick={() => setMenuExerciseId(null)}>
                  ×
                </button>
              </div>

              <div className="ex-action-grid">
                <button
                  type="button"
                  className="ex-action-tile"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSmartReplaceExerciseId(activeMenuExercise.id);
                    setAddExerciseOpen(true);
                    setMenuExerciseId(null);
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                  Replace
                </button>
                {activeMenuExercise.stickyNoteEnabled ? (
                  <button
                    type="button"
                    className="ex-action-tile"
                    onClick={(event) => {
                      event.stopPropagation();
                      openNoteEditor(activeMenuExercise.id);
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    Edit note
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ex-action-tile"
                    onClick={(event) => {
                      event.stopPropagation();
                      enableStickyNote(activeMenuExercise.id);
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                    Add note
                  </button>
                )}
                {activeMenuExercise.supersetGroupId ? (
                  <button
                    type="button"
                    className="ex-action-tile"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeFromSuperset(activeMenuExercise.id);
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>
                    Unsuperset
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ex-action-tile"
                    onClick={(event) => {
                      event.stopPropagation();
                      openSupersetSheet(activeMenuExercise.id);
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>
                    Superset
                  </button>
                )}
                <button
                  type="button"
                  className="ex-action-tile"
                  onClick={(event) => {
                    event.stopPropagation();
                    setInteractedExerciseActive(activeMenuExercise.id);
                    setReorderOpen(true);
                    setMenuExerciseId(null);
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                  Reorder
                </button>
                <button
                  type="button"
                  className="ex-action-tile ex-action-tile--danger"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeExercise(activeMenuExercise.id);
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  Remove
                </button>
              </div>
            </div>
          </section>
        )}

        {rewardSheetOpen && (
          <section
            className="sheet-overlay reward-center-overlay"
            onClick={() => setRewardSheetOpen(false)}
          >
            <div
              className="reward-center-card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sheet-head">
                <div>
                  <p className="label">Workout Rewards</p>
                  <h3>{rewardSummary.total} progress wins</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setRewardSheetOpen(false)}>
                  ×
                </button>
              </div>

              <div className="reward-sheet-summary">
                {rewardSummary.session > 0 && (
                  <span className="reward-summary-chip reward-summary-chip-session">
                    {rewardLevelIcon.session} {rewardSummary.session}
                  </span>
                )}
                {rewardSummary.exercise > 0 && (
                  <span className="reward-summary-chip reward-summary-chip-exercise">
                    {rewardLevelIcon.exercise} {rewardSummary.exercise}
                  </span>
                )}
                {rewardSummary.set > 0 && (
                  <span className="reward-summary-chip reward-summary-chip-set">
                    {rewardLevelIcon.set} {rewardSummary.set}
                  </span>
                )}
              </div>

              <div className="reward-sheet-list">
                {loggerRewards.length === 0 ? (
                  <p className="settings-note">Complete meaningful sets to start earning progress rewards.</p>
                ) : (
                  loggerRewards.map((reward) => (
                    <article key={reward.id} className="reward-sheet-item">
                      <div className={`reward-sheet-icon reward-sheet-icon-${reward.level}`} aria-hidden="true">
                        {rewardLevelIcon[reward.level]}
                      </div>
                      <div>
                        <strong>{reward.shortLabel}</strong>
                        <p>{reward.detail}</p>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          </section>
        )}

        {inlineGuidanceOpen && activeExercise && (
          <section
            className="sheet-overlay guidance-center-overlay"
            onClick={() => setInlineGuidanceOpen(false)}
          >
            <div
              className="guidance-center-card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sheet-head">
                <div>
                  <p className="label">{allExercisesComplete ? "Overall Guidance" : "Next Guidance"}</p>
                  <h3>{allExercisesComplete ? "Workout" : activeExercise.name}</h3>
                </div>
              </div>
              <article className={`coach-card ${state.suggestion ? certaintyTone[state.suggestion.certainty] : ""}`}>
                {state.suggestion && (
                  <p className="label">
                    <span className={`certainty-badge certainty-badge-${state.suggestion.certainty}`}>
                      {state.suggestion.certainty}
                    </span>
                  </p>
                )}
                <h3 className="coach-tip">{guidanceTip}</h3>
                <p className="coach-why">{guidanceWhy}</p>
              </article>
              <button
                className="guidance-modal-dismiss"
                type="button"
                onClick={() => {
                  setSessionGuidanceInline(false);
                  setInlineGuidanceOpen(false);
                }}
              >
                Dismiss tip
              </button>
            </div>
          </section>
        )}


        {noteEditorExerciseId && (
          <section className="sheet-overlay" onClick={closeNoteEditor}>
            <div className="sheet-card" onClick={(event) => event.stopPropagation()}>
              <div className="sheet-head">
                <div>
                  <p className="label">Exercise Sticky Note</p>
                  <h3>
                    {exercises.find((exercise) => exercise.id === noteEditorExerciseId)?.name ??
                      "Exercise"}
                  </h3>
                </div>
                <button className="icon-button" type="button" onClick={closeNoteEditor}>
                  ×
                </button>
              </div>

              <label className="settings-stack-row">
                <span>Quick note</span>
                <textarea
                  className="notes-textarea"
                  rows={6}
                  value={noteEditorValue}
                  placeholder="Save a quick setup cue, seat setting, grip width, or anything you want to remember for this exercise."
                  onChange={(event) => setNoteEditorValue(event.target.value)}
                />
              </label>

              <p className="settings-note">
                This stays attached to the exercise in the current workout and can be referred to later.
              </p>

              <div className="sheet-actions">
                <button className="secondary-button" type="button" onClick={closeNoteEditor}>
                  Cancel
                </button>
                <button className="primary-button" type="button" onClick={saveNoteEditor}>
                  Save Note
                </button>
              </div>
            </div>
          </section>
        )}

        {restTimerEditorExercise && (
          <section className="sheet-overlay" onClick={closeRestTimerEditor}>
            <div className="sheet-card" onClick={(event) => event.stopPropagation()}>
              <div className="sheet-head">
                <div>
                  <p className="label">Exercise Rest Timer</p>
                  <h3>{restTimerEditorExercise.name}</h3>
                </div>
                <button className="icon-button" type="button" onClick={closeRestTimerEditor}>
                  ×
                </button>
              </div>

              <label className="settings-row">
                <span>Rest timer</span>
                <input
                  className="timing-input"
                  type="text"
                  inputMode="numeric"
                  value={restTimerEditorValue}
                  onChange={(event) =>
                    setRestTimerEditorValue(formatMinutesSecondsInput(event.target.value))
                  }
                />
              </label>

              <label className="toggle-row">
                <span>Save to exercise setting</span>
                <input
                  type="checkbox"
                  checked={saveRestTimerToDefault}
                  onChange={(event) => setSaveRestTimerToDefault(event.target.checked)}
                />
              </label>

              <p className="settings-note">
                This updates the current workout. Saving to exercise setting also uses this rest timer
                the next time this exercise appears in this app session.
              </p>

              <div className="sheet-actions">
                <button className="secondary-button" type="button" onClick={closeRestTimerEditor}>
                  Cancel
                </button>
                <button className="primary-button" type="button" onClick={saveRestTimerEditor}>
                  Save
                </button>
              </div>
            </div>
          </section>
        )}

        {supersetSheetExercise && (
          <section
            className="sheet-overlay"
            onClick={() => {
              setSupersetSheetExerciseId(null);
              setSupersetSelectionIds([]);
            }}
          >
            <div className="sheet-card" onClick={(event) => event.stopPropagation()}>
              <div className="sheet-head">
                <div>
                  <p className="label">Add to Superset</p>
                  <h3>{supersetSheetExercise.name}</h3>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => {
                    setSupersetSheetExerciseId(null);
                    setSupersetSelectionIds([]);
                  }}
                >
                  ×
                </button>
              </div>

              <div className="superset-list">
                {exercises
                  .filter((exercise) => exercise.id !== supersetSheetExercise.id)
                  .map((exercise) => {
                    const isSelected = supersetSelectionIds.includes(exercise.id);
                    const optionAccent = getSupersetAccent(exercise.supersetGroupId);
                    const isAlreadyGrouped =
                      exercise.supersetGroupId &&
                      exercise.supersetGroupId === supersetSheetExercise.supersetGroupId;

                    return (
                      <button
                        key={exercise.id}
                        type="button"
                        className={`superset-option ${isSelected ? "is-selected" : ""} ${
                          exercise.supersetGroupId ? "has-group" : ""
                        }`}
                        title={exercise.name}
                        style={
                          exercise.supersetGroupId
                            ? ({
                                "--superset-accent": optionAccent ?? undefined
                              } as CSSProperties)
                            : undefined
                        }
                        onClick={() =>
                          setSupersetSelectionIds((current) =>
                            current.includes(exercise.id)
                              ? current.filter((id) => id !== exercise.id)
                              : [...current, exercise.id]
                          )
                        }
                      >
                        <span>{exercise.name}</span>
                        <span className="superset-option-meta">
                          {isSelected
                            ? "Selected"
                            : isAlreadyGrouped
                              ? "Already in this superset"
                              : exercise.supersetGroupId
                                ? "In another superset"
                                : "Standalone"}
                        </span>
                      </button>
                    );
                  })}
              </div>

              <div className="sheet-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setSupersetSheetExerciseId(null);
                    setSupersetSelectionIds([]);
                  }}
                >
                  Cancel
                </button>
                <button className="primary-button" type="button" onClick={saveSupersetSelection}>
                  Save Superset
                </button>
              </div>
            </div>
          </section>
        )}

        {reorderOpen && (
          <section className="sheet-overlay" onClick={() => setReorderOpen(false)}>
            <div className="sheet-card" onClick={(event) => event.stopPropagation()}>
              <div className="sheet-head">
                <div>
                  <p className="label">Reorder Exercises</p>
                  <h3>Press, hold, and move</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setReorderOpen(false)}>
                  ×
                </button>
              </div>

              <div className="reorder-list">
                {exercises.map((exercise) => (
                  <div
                    key={exercise.id}
                    className={`reorder-item ${reorderDragId === exercise.id ? "is-dragging" : ""}`}
                    draggable
                    onDragStart={() => setReorderDragId(exercise.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (reorderDragId) {
                        moveExerciseByIds(reorderDragId, exercise.id);
                      }
                      setReorderDragId(null);
                    }}
                    onDragEnd={() => setReorderDragId(null)}
                  >
                    <span className="reorder-handle">≡</span>
                    <span className="reorder-name">{exercise.name}</span>
                    <button type="button" onClick={() => removeExercise(exercise.id)}>
                      -
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {workoutMenuOpen && (
          <section className="sheet-overlay bottom-sheet-overlay" onClick={() => setWorkoutMenuOpen(false)}>
            <div className="sheet-card action-sheet" onClick={(event) => event.stopPropagation()}>
              <div className="sheet-handle" />
              <div className="sheet-head">
                <div>
                  <p className="label">Workout Actions</p>
                  <h3>{workoutMeta.sessionName}</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setWorkoutMenuOpen(false)}>
                  ×
                </button>
              </div>
              <div className="workout-menu-action-list">
                <button
                  type="button"
                  onClick={() => { setAddExerciseOpen(true); setWorkoutMenuOpen(false); }}
                >
                  <span>Add exercise</span>
                  <span className="workout-menu-chevron">›</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setReorderOpen(true); setWorkoutMenuOpen(false); }}
                >
                  <span>Reorder exercises</span>
                  <span className="workout-menu-chevron">›</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setSettingsOpen(true); setWorkoutMenuOpen(false); }}
                >
                  <span>Workout settings</span>
                  <span className="workout-menu-chevron">›</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setShowBottomRestDock((v) => !v); setWorkoutMenuOpen(false); }}
                >
                  <span>{showBottomRestDock ? "Hide bottom rest timer" : "Show bottom rest timer"}</span>
                  <span className="workout-menu-check">{showBottomRestDock ? "✓" : ""}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExercises(prev => prev.map(ex => {
                      const allDone = ex.draftSets.every(s => s.done);
                      if (allDone) return ex;
                      const lastSession = ex.history[ex.history.length - 1];
                      return {
                        ...ex,
                        draftSets: ex.draftSets.map((set, i) => {
                          if (set.done) return set;
                          const measurementType = getExerciseMeasurementType(ex);
                          const carrySource = getCurrentExerciseCarrySource(ex.draftSets, i);
                          const previousSet = getPreviousReferenceSet(ex.draftSets, i, lastSession);
                          const resolvedWeight = usesWeightInputForMeasurement(measurementType)
                            ? settings.carryForwardDefaults && set.weightInput.trim() === ""
                              ? carrySource?.weightInput?.trim().length ? carrySource.weightInput
                                : previousSet ? String(previousSet.weight) : ""
                              : set.weightInput
                            : "";
                          const resolvedReps = settings.carryForwardDefaults && set.repsInput.trim() === ""
                            ? carrySource?.repsInput?.trim().length ? carrySource.repsInput
                              : previousSet ? String(previousSet.reps) : ""
                            : set.repsInput;
                          const resolvedRpe = settings.carryForwardDefaults && set.rpeInput.trim() === ""
                            ? carrySource?.rpeInput?.trim().length ? carrySource.rpeInput
                              : typeof previousSet?.rpe === "number" && Number.isFinite(previousSet.rpe)
                                ? String(previousSet.rpe) : ""
                            : set.rpeInput;
                          return { ...set, done: true, weightInput: resolvedWeight, repsInput: resolvedReps, rpeInput: resolvedRpe };
                        })
                      };
                    }));
                    setWorkoutMenuOpen(false);
                  }}
                >
                  <span>Mark all sets done</span>
                  <span className="workout-menu-chevron">›</span>
                </button>
                <button
                  type="button"
                  onClick={() => { clearUncheckedSets(); setWorkoutMenuOpen(false); }}
                >
                  <span>Clear unchecked rows</span>
                  <span className="workout-menu-chevron">›</span>
                </button>
                <button
                  type="button"
                  onClick={() => { resetWorkout(); setWorkoutMenuOpen(false); }}
                >
                  <span>Reset workout</span>
                  <span className="workout-menu-chevron">›</span>
                </button>
                <button
                  type="button"
                  className="is-danger"
                  onClick={() => requestDiscardWorkout()}
                >
                  <span>Discard workout</span>
                  <span className="workout-menu-chevron">›</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {timingOpen && (
          <section className="sheet-overlay" onClick={() => setTimingOpen(false)}>
            <div className="sheet-card" onClick={(event) => event.stopPropagation()}>
              <div className="sheet-head">
                <div>
                  <p className="label">Timing</p>
                  <h3>Adjust active workout timing</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setTimingOpen(false)}>
                  ×
                </button>
              </div>

              <label className="settings-row timing-row">
                <span>Started at</span>
                <input
                  className="timing-input"
                  type="time"
                  value={workoutMeta.startTime}
                  onChange={(event) =>
                    setWorkoutMeta((current) => ({
                      ...current,
                      startTime: event.target.value,
                      startInstant:
                        buildDateTime(current.date, event.target.value)?.toISOString() ??
                        current.startInstant,
                      startedMinutesAgo: getMinutesAgoFromDateTime(
                        current.date,
                        event.target.value
                      )
                    }))
                  }
                />
              </label>

              <label className="settings-row timing-row">
                <span>Started x mins ago</span>
                <input
                  className="timing-input"
                  type="text"
                  inputMode="numeric"
                  value={workoutMeta.startedMinutesAgo}
                  onChange={(event) =>
                    setWorkoutMeta((current) => {
                      const startedMinutesAgo = sanitizeIntegerInput(event.target.value);
                      const nextStart = getDateAndTimeFromMinutesAgo(startedMinutesAgo);

                      return {
                        ...current,
                        date: nextStart.date,
                        startTime: nextStart.startTime,
                        startedMinutesAgo,
                        startInstant: nextStart.startInstant
                      };
                    })
                  }
                />
              </label>

              <label className="settings-row timing-row">
                <span>Duration</span>
                <strong className="settings-value">{derivedDuration}</strong>
              </label>

              <p className="settings-note">
                For an active workout, timing correction stays lightweight. Full date, time, and
                duration editing should happen only when editing an older saved workout.
              </p>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
