import type { CoachingSuggestion } from "@repiq/shared";
import type { ExerciseEvaluationRequest, ExerciseHistorySession, WorkoutMediaAsset } from "@repiq/shared";

export type FlowState = {
  status: "idle" | "loading" | "success" | "error";
  suggestion: CoachingSuggestion | null;
  message: string | null;
  engineSource: "live" | "fallback" | "unavailable" | null;
};

export type DraftSet = {
  id: string;
  setType: DraftSetType;
  weightInput: string;
  repsInput: string;
  rpeInput: string;
  done: boolean;
  failed: boolean;
};

export type ExerciseDraft = {
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
  performanceMetric?: PerformanceMetric;
  supportsExternalLoad?: boolean;
  implement?: ExerciseImplement;
  movementSide?: MovementSide;
  isCustom?: boolean;
  libraryStatus?: "active" | "archived";
  howTo: string[];
  videoLabel?: string;
  history: ExerciseHistorySession[];
  draftSets: DraftSet[];
};

export type DetailTab = "summary" | "history" | "howto";
export type ThemePreference = "light" | "dark" | "system";
export type DraftSetType = "warmup" | "normal" | "drop" | "restpause" | "failure";
export type AppView = "home" | "logger" | "finish" | "share" | "planner" | "plan-builder" | "report" | "insights" | "community" | "profile" | "history" | "history-detail" | "history-edit" | "glossary" | "more";

// ── Navigation Registry ───────────────────────────────────────────────────────
// Single source of truth for every page in the app.
//
// RULES:
//   1. Every entry in AppView MUST have a record here — TypeScript will error otherwise.
//   2. When you add a NEW view to AppView, add its record here immediately.
//   3. Keep entryFrom accurate so the graph can be audited at any time.
//
// navType:
//   "tab-root"   → navigateRoot() — clears the back stack (bottom nav items)
//   "drill-down" → navigate()     — pushes caller onto back stack
//   "modal"      → opened via custom logic (logger); back is handled separately

export type NavType = "tab-root" | "drill-down" | "modal";

export type NavMeta = {
  /** Human-readable label for breadcrumbs and debugging */
  label: string;
  /** Which views navigate TO this view (document all callers here) */
  entryFrom: AppView[];
  /** Fallback destination when back stack is empty — must match goBack() call sites */
  backFallback: AppView;
  /** How this view is opened */
  navType: NavType;
};

// TypeScript enforces completeness: add AppView → add registry entry or get a compile error.
export const NAV_REGISTRY: Record<AppView, NavMeta> = {
  home:            { label: "Home",           entryFrom: [],                                       backFallback: "home",          navType: "tab-root"   },
  logger:          { label: "Logger",         entryFrom: ["home", "planner", "history-edit"],       backFallback: "home",          navType: "modal"      },
  finish:          { label: "Finish Workout", entryFrom: ["logger"],                               backFallback: "home",          navType: "drill-down" },
  share:           { label: "Share",          entryFrom: ["finish", "report"],                     backFallback: "finish",        navType: "drill-down" },
  planner:         { label: "Planner",        entryFrom: [],                                       backFallback: "home",          navType: "tab-root"   },
  "plan-builder":  { label: "Plan Builder",   entryFrom: ["planner"],                              backFallback: "planner",       navType: "drill-down" },
  report:          { label: "Workout Report", entryFrom: ["finish", "history", "history-detail"],  backFallback: "history",       navType: "drill-down" },
  insights:        { label: "Insights",       entryFrom: [],                                       backFallback: "home",          navType: "tab-root"   },
  community:       { label: "Community",      entryFrom: [],                                       backFallback: "home",          navType: "tab-root"   },
  profile:         { label: "Profile",        entryFrom: ["home", "more"],                         backFallback: "home",          navType: "drill-down" },
  history:         { label: "History",        entryFrom: ["home", "more"],                         backFallback: "home",          navType: "drill-down" },
  "history-detail":{ label: "History Detail", entryFrom: ["history"],                              backFallback: "history",       navType: "drill-down" },
  "history-edit":  { label: "History Edit",   entryFrom: ["history-detail"],                       backFallback: "history-detail",navType: "drill-down" },
  glossary:        { label: "Glossary",       entryFrom: ["home", "planner", "more"],              backFallback: "home",          navType: "drill-down" },
  more:            { label: "More",           entryFrom: ["home"],                                 backFallback: "home",          navType: "drill-down" },
};

// ── Psychological Data Layer ──────────────────────────────────────────────────
// V1: types and storage stubs defined now so data is captured from day one.
// V2: intelligence (skip prediction, deload triggers, motivation style) ships later.
// See docs/psych-layer.md for the full design specification.

export type MotivationalWhy =
  | "inconsistent"        // "I've been inconsistent and want to fix that"
  | "plateau"             // "I've hit a plateau and need structure"
  | "look_feel_stronger"  // "I want to look and feel stronger"
  | "fresh_start"         // "I'm starting fresh"
  | "feel_good";          // "I just want to feel good"

export type TrainingGoal =
  | "muscle_strength" | "fat_loss" | "endurance" | "general_fitness"  // legacy
  | "build_muscle" | "get_stronger" | "improve_fitness" | "athletic_performance" | "stay_active"; // onboarding

export type ExperienceLevel = "never" | "beginner" | "intermediate" | "advanced" | "veteran";
export type EquipmentAccess =
  | "bodyweight"      // No equipment — bodyweight exercises only
  | "dumbbell_pair"   // A pair of dumbbells (fixed or adjustable)
  | "home_setup"      // Home gym: full dumbbell rack + barbell with plates
  | "basic_gym"       // Commercial gym: barbells, dumbbells, some machines/cables
  | "full_gym";       // Full gym: all equipment, cable stations, full machine selection
export type ScheduleCommitment = 2 | 3 | 4 | 5 | 6;

// 1–5 scales for mood and energy capture
export type MoodRating = 1 | 2 | 3 | 4 | 5;
export type EnergyRating = 1 | 2 | 3 | 4 | 5;
// Standard Borg RPE — session-level perceived exertion (distinct from per-set RPE in logger)
export type RPERating = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
// 3-point scale for daily readiness (sleep/stress/energy)
export type ThreePointScale = 1 | 2 | 3;

export type TimeOfDay = "early_morning" | "morning" | "afternoon" | "evening" | "night";
// 04–07 / 07–11 / 11–17 / 17–21 / 21–04

export type SessionSource = "plan" | "template" | "generated" | "goal_planner" | "quick" | "resume";

export type Trend = "improving" | "stable" | "declining";

export type MotivationStyle =
  | "accountability"  // streak-driven; hurt by skips
  | "achievement"     // PR-driven; volume milestones
  | "social"          // responds to community activity
  | "intrinsic"       // self-directed; data-rich; low notification preference
  | "irregular";      // long gaps; emotional re-starts

// ── UserPsychProfile — stored as singleton, captured at onboarding ────────────
export interface UserPsychProfile {
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
  dateOfBirth: string | null;   // ISO date "YYYY-MM-DD" — age is always derived, never stored directly
  bodyFatBracket: string | null;
  // ── Schedule preferences ──
  daysPerWeekPref: number | null;
  cycleDays: number | null;    // null = 7 (weekly); set if user follows N-day rotating cycle
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
export interface PostWorkoutPsych {
  schemaVersion: 1;
  sessionId: string;        // = SavedWorkoutData.savedAt
  capturedAt: string;       // ISO timestamp
  postMood: MoodRating | null;
  postEnergy: EnergyRating | null;
  sessionRPE: RPERating | null;
  psychNote: string | null; // optional reflection, max 280 chars
}

// ── DailyReadiness — captured once per day, right before a workout ────────────
export interface DailyReadiness {
  schemaVersion: 1;
  date: string;             // YYYY-MM-DD
  capturedAt: string;       // ISO timestamp
  overallReadiness: MoodRating | null;    // 1–5 consolidated "how are you feeling" score
  sleepQuality: ThreePointScale | null;   // reserved for future granular capture
  stressLevel: ThreePointScale | null;
  energyLevel: ThreePointScale | null;
  followedBySessionId: string | null;     // populated post-session
  skippedPlannedSession: boolean;         // had a plan, didn't start
}

// ── SessionBehaviorSignals — auto-captured at finalizeFinishedWorkoutSave ──────
export interface SessionBehaviorSignals {
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
export interface DerivedPsychProfile {
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
export type SplitType = "full_body" | "upper_lower" | "ppl" | "body_part" | "push_pull" | "push_pull_legs" | "arnold" | "arnold_ul" | "ppl_arnold" | "ppl_fb" | "arnold_fb" | "phul" | "ppl_ul" | "custom";

export interface RepIQPlanExercise {
  exerciseId: string;
  sets: number;        // working sets only
  warmupSets?: number; // warm-up sets (lighter load, not counted toward volume)
  reps: string;
  restSeconds: number;
}

// Movement patterns that benefit from warm-up sets (compound / multi-joint)
export const COMPOUND_PATTERNS: Set<MovementPattern> = new Set([
  "horizontal_push", "vertical_push", "horizontal_pull", "vertical_pull",
  "hip_hinge", "squat", "lunge",
]);

export interface RepIQPlanDay {
  sessionLabel: string;
  focus: string;
  exercises: RepIQPlanExercise[];
  completedAt: string | null;
}

export interface RepIQPlanWeek {
  weekNumber: number;
  isCompleted: boolean;
  days: RepIQPlanDay[];
}

export interface RepIQPlan {
  schemaVersion: 1;
  id: string;
  generatedAt: string;
  startDate: string;
  planName: string;
  goal: TrainingGoal;
  secondaryGoal: TrainingGoal | null;
  experienceLevel: ExperienceLevel;
  daysPerWeek: number;
  cycleDays: number | null;        // null = weekly (7); set for rotating cycles — each plan "week" = one cycle
  sessionLengthMin: number;
  splitType: SplitType;
  mesocycleLengthWeeks: number;    // calendar weeks of the mesocycle (used to derive total cycles)
  totalCycles: number;             // actual number of cycles generated: round((mesoWeeks × 7) / cycleDays)
  currentWeekIndex: number;
  weeks: RepIQPlanWeek[];
  status?: "active" | "paused";
  pausedAt?: string | null;           // ISO timestamp when paused; null when active
  pauseEndDate?: string | null;       // ISO date when user plans to resume (user-specified)
  pauseDaysMax?: number | null;       // user-configurable max pause days (system ceiling: 45)
  totalPauseDaysUsed?: number;        // cumulative pause days across all pauses this plan
  needsReview?: boolean;            // set when extra volume was logged outside the plan
  extraVolumeCount?: number;        // how many cross-plan workouts triggered the flag
  extraVolumeWorkoutIds?: string[]; // savedAt IDs of those workouts (for delete cleanup)
  lastRegeneratedAt?: string;       // ISO timestamp of last full or partial regeneration
  customSplitArrangement?: { label: string; muscles: string[] }[] | null;
}

export const DEFAULT_PSYCH_PROFILE: UserPsychProfile = {
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
  dateOfBirth: null,
  bodyFatBracket: null,
  daysPerWeekPref: null,
  cycleDays: null,
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

export function deriveTimeOfDay(isoTimestamp: string): TimeOfDay {
  const hour = new Date(isoTimestamp).getHours();
  if (hour >= 4 && hour < 7) return "early_morning";
  if (hour >= 7 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

export function buildSessionBehaviorSignals(
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

export type PlannedExercise = {
  exerciseId: string;
  setCount: number;
  setTypes?: DraftSetType[];
  restTimer: string;
  note?: string;
};

export type WorkoutPlan = {
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

export type PlanBuilderMode = "create" | "edit" | "generate";
export type PlanSessionSource = "saved" | "library" | "generated" | "quick";

export type ActivePlanSession = {
  source: PlanSessionSource;
  planId: string | null;
  originalPlan: WorkoutPlan | null;
} | { source: "repiq"; planId: null; originalPlan: null; weekIdx: number; dayIdx: number } | null;

export type WorkoutSettings = {
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

export type WorkoutMeta = {
  date: string;
  startTime: string;
  startedMinutesAgo: string;
  sessionName: string;
  startInstant?: string;
};

export type RewardCategory = "pr" | "volume" | "progress";
export type RewardLevel = "set" | "exercise" | "session";
export type AddExerciseMode = "browse" | "create";
export type CreateExerciseStep = 1 | 2;
export type CustomExerciseType =
  // V2 schema
  | "bodyweight"
  | "dumbbell"
  | "cable"
  | "resistance_band"
  | "barbell"
  | "machine"
  | "freestyle_cardio"
  // Legacy (backward compat)
  | "bodyweight_only"
  | "bodyweight_weighted"
  | "free_weights_accessories";
export type MeasurementType = "timed" | "reps_volume" | "weight_timed";
export type PerformanceMetric = "reps" | "time" | "distance_or_time" | "mixed";
export type ExerciseImplement =
  | "suspension_trainer"
  | "sled"
  | "medicine_ball"
  | "jump_rope"
  | "plate"
  | "battle_ropes"
  | "yoke"
  | "wrist_roller";
export type MovementSide = "unilateral" | "bilateral";

// ── Smart Replace — see docs/smart-replace.md ─────────────────────────────────
export type MovementPattern =
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
  | "mobility"           // Stretches, mobility drills
  | "cardio";            // Jump rope, sled, rowing machine

export type ExerciseDifficulty = "beginner" | "intermediate" | "advanced";

// Exercise angle — describes the bench/body position for the movement
export type ExerciseAngle =
  | "flat"        // Standard horizontal (bench press, bent-over row)
  | "incline"     // Angled upward (incline press, incline curl)
  | "decline"     // Angled downward (decline press)
  | "overhead"    // Vertical pressing plane
  | "neutral"     // Neutral grip / neutral stance variant
  | "prone"       // Face-down (reverse fly, prone leg curl)
  | "none";       // Not applicable (squat, deadlift, carry)

// Equipment — more granular than exerciseType, used for matching and filtering
export type ExerciseEquipment =
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

export type ReplacementReason =
  | "best_match"
  | "machine_taken"
  | "no_equipment"
  | "too_difficult"
  | "pain_discomfort"
  | "preference"
  | "just_change";

export interface ReplacementEvent {
  schemaVersion: 1;
  sessionId: string;               // = SavedWorkoutData.savedAt
  replacedAt: string;              // ISO timestamp
  originalExerciseId: string;
  replacementExerciseId: string;
  reason: ReplacementReason;
  setsAlreadyLogged: number;
  matchScore: number;
}

// Type alias for extended exercise draft with taxonomy fields
export type ExerciseWithTaxonomy = ExerciseDraft & {
  movementPattern?: MovementPattern;
  angle?: ExerciseAngle;
  equipment?: ExerciseEquipment;
  difficultyLevel?: ExerciseDifficulty;
};

// ── Exercise Preferences (Smart Replace history) ──────────────────────────────
export interface ExercisePreferenceEntry {
  preferredId: string;
  count: number;         // how many times this replacement was chosen
  lastUsed: string;      // ISO timestamp
}

// Map: originalExerciseId → ranked list of preferred replacements (desc by count)
export type ExercisePreferenceMap = Record<string, ExercisePreferenceEntry[]>;

// ── Custom Exercise Creation ──────────────────────────────────────────────────
export type CustomExerciseInput = {
  name: string;
  imageSrc?: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  exerciseType: CustomExerciseType;
  measurementType: MeasurementType;
  movementSide: MovementSide;
  movementPattern?: MovementPattern;
};

// ── Logger Rewards ────────────────────────────────────────────────────────────
export type LoggerReward = {
  id: string;
  exerciseId: string | null;
  setId: string | null;
  category: RewardCategory;
  level: RewardLevel;
  shortLabel: string;
  detail: string;
};

export type RewardSummary = {
  set: number;
  exercise: number;
  session: number;
  total: number;
};

// ── Workout Finish / Save ─────────────────────────────────────────────────────
export type FinishedExerciseSummary = {
  id: string;
  name: string;
  primaryMuscle: string;
  loggedSets: number;
  loggedVolume: number;
  sets?: { weight: number; reps: number; rpe: number | null; setType: string }[];
};

export type FinishWorkoutDraft = {
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
  progressPicIndex?: number; // index of the progress picture
  personalNote?: string; // personal note for future reference
  quoteNote?: string; // session highlight text
  noteType?: "personal" | "quote"; // which type of note is active
  shareAsQuote?: boolean; // true = dark card (white text, quoted), false = light card
};

export type SavedWorkoutData = FinishWorkoutDraft & {
  savedAt: string; // ISO string
  repiqSourceKey?: string; // "weekIdx-dayIdx" if completed as part of a RepIQ plan session
  workoutSource?: "repiq" | "saved" | "library" | "generated" | "quick" | "history";
  /** Set to true when a workout has been edited via HistoryEditPage.
   *  The dev seed buttons use this to skip re-seeding user-modified workouts. */
  userEdited?: boolean;
};

export type ExerciseRestDefaults = Record<string, string>;

// ── Logger UI State ───────────────────────────────────────────────────────────
export type SwipeState = {
  rowId: string | null;
  startX: number;
  startY: number;
  deltaX: number;
  axis: "undecided" | "horizontal" | "vertical";
  dragging: boolean;
};

export function createInitialSwipeState(): SwipeState {
  return {
    rowId: null,
    startX: 0,
    startY: 0,
    deltaX: 0,
    axis: "undecided",
    dragging: false,
  };
}

export type ActiveRestTimer = {
  exerciseId: string;
  endAt: number | null;
  pausedRemainingSeconds: number | null;
  totalSeconds: number;
  kind: "exercise" | "transition";
} | null;

// ── Muscle Regions (body map) ─────────────────────────────────────────────────
export type MuscleRegion =
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
