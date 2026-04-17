import {
  DEFAULT_PSYCH_PROFILE,
} from "./types";
import type {
  SavedWorkoutData, UserPsychProfile, RepIQPlan, PostWorkoutPsych,
  DailyReadiness, SessionBehaviorSignals, WorkoutPlan, PlanBuilderMode,
  ThemePreference, ReplacementEvent, ExercisePreferenceMap,
  FinishedExerciseSummary, LoggerReward,
  DateRangePrefs, DateRangeMode, RollingChip, ToDateChip,
} from "./types";
import type { WorkoutMediaAsset } from "@repiq/shared";

export const replacementEventsStorageKey = "repiq-replacement-events";

export function getStoredReplacementEvents(): ReplacementEvent[] {
  try {
    const raw = window.localStorage.getItem(replacementEventsStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function persistReplacementEvent(event: ReplacementEvent): void {
  try {
    const existing = getStoredReplacementEvents();
    const updated = [event, ...existing].slice(0, 500);
    window.localStorage.setItem(replacementEventsStorageKey, JSON.stringify(updated));
  } catch {}
}

// ── Exercise replacement preferences ─────────────────────────────────────────
// When a user replaces exercise A with exercise B (same primary muscle), we
// remember that choice and surface B at the top of future replacement lists for A.
// Map: originalExerciseId → ranked list of preferred replacements (desc by count)

export const exercisePreferencesStorageKey = "repiq-exercise-preferences";

export function getStoredExercisePreferences(): ExercisePreferenceMap {
  try {
    const raw = window.localStorage.getItem(exercisePreferencesStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch { return {}; }
}

export function persistExercisePreference(originalId: string, preferredId: string): void {
  try {
    const map = getStoredExercisePreferences();
    const entries = map[originalId] ?? [];
    const existing = entries.find(e => e.preferredId === preferredId);
    if (existing) {
      existing.count += 1;
      existing.lastUsed = new Date().toISOString();
    } else {
      entries.push({ preferredId, count: 1, lastUsed: new Date().toISOString() });
    }
    // Keep top 10 preferences per exercise, sorted by count desc
    map[originalId] = entries.sort((a, b) => b.count - a.count).slice(0, 10);
    window.localStorage.setItem(exercisePreferencesStorageKey, JSON.stringify(map));
  } catch {}
}

// ── Hidden suggestions ────────────────────────────────────────────────────────
// Exercises the user has explicitly dismissed from Smart Replace suggestions.
// Stored globally — if a user doesn't want to see an exercise suggested, they
// don't want it anywhere in the list regardless of which exercise is being replaced.
export const hiddenSuggestionsStorageKey = "repiq-hidden-suggestions";

export function getStoredHiddenSuggestions(): Set<string> {
  try {
    const raw = window.localStorage.getItem(hiddenSuggestionsStorageKey);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch { return new Set(); }
}

export function persistHiddenSuggestion(exerciseId: string): void {
  try {
    const current = getStoredHiddenSuggestions();
    current.add(exerciseId);
    window.localStorage.setItem(hiddenSuggestionsStorageKey, JSON.stringify([...current]));
  } catch {}
}

export function removeHiddenSuggestion(exerciseId: string): void {
  try {
    const current = getStoredHiddenSuggestions();
    current.delete(exerciseId);
    window.localStorage.setItem(hiddenSuggestionsStorageKey, JSON.stringify([...current]));
  } catch {}
}

export const themeStorageKey = "repiq-theme-preference";
export const workoutSettingsStorageKey = "repiq-workout-settings";
export const customExercisesStorageKey = "repiq-custom-exercises";
export const savedWorkoutsStorageKey = "repiq-saved-workouts";
export const workoutPlansStorageKey = "repiq-workout-plans";
export const planBuilderDraftStorageKey = "repiq-plan-builder-draft";
// Psychological data layer (see docs/psych-layer.md)
export const psychProfileStorageKey     = "repiq-psych-profile";
export const postWorkoutPsychStorageKey  = "repiq-post-workout-psych";
export const dailyReadinessStorageKey   = "repiq-daily-readiness";
export const sessionBehaviorStorageKey  = "repiq-session-behavior";
export const derivedPsychStorageKey     = "repiq-derived-psych";
export const repiqPlanStorageKey            = "repiq-generated-plan";

export function getStoredSavedWorkouts(): SavedWorkoutData[] {
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

export function persistSavedWorkout(workout: SavedWorkoutData): void {
  try {
    const existing = getStoredSavedWorkouts();
    // newest first, keep last 200
    const updated = [workout, ...existing].slice(0, 200);
    window.localStorage.setItem(savedWorkoutsStorageKey, JSON.stringify(updated));
  } catch {
    // storage full or unavailable — ignore
  }
}

export function persistSavedWorkoutsList(workouts: SavedWorkoutData[]): void {
  try {
    window.localStorage.setItem(savedWorkoutsStorageKey, JSON.stringify(workouts));
  } catch {
    // storage full or unavailable — ignore
  }
}

// Overwrites a single saved workout entry matched by savedAt key.
// Used when editing a history workout — preserves the original slot, updates all fields.
export function overwriteSavedWorkout(originalSavedAt: string, updated: SavedWorkoutData): void {
  try {
    const existing = getStoredSavedWorkouts();
    const idx = existing.findIndex((w) => w.savedAt === originalSavedAt);
    if (idx !== -1) {
      existing[idx] = updated;
    } else {
      // Fallback: prepend if original not found (shouldn't happen)
      existing.unshift(updated);
    }
    window.localStorage.setItem(savedWorkoutsStorageKey, JSON.stringify(existing));
  } catch {
    // storage full or unavailable — ignore
  }
}


// ── Psychological data storage ───────────────────────────────────────────────

export function getStoredPsychProfile(): UserPsychProfile {
  try {
    const raw = window.localStorage.getItem(psychProfileStorageKey);
    if (!raw) return { ...DEFAULT_PSYCH_PROFILE };
    return { ...DEFAULT_PSYCH_PROFILE, ...JSON.parse(raw) };
  } catch { return { ...DEFAULT_PSYCH_PROFILE }; }
}

export function persistPsychProfile(profile: UserPsychProfile): void {
  try { window.localStorage.setItem(psychProfileStorageKey, JSON.stringify(profile)); } catch {}
}

export function getStoredRepIQPlan(): RepIQPlan | null {
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

export function persistRepIQPlan(plan: RepIQPlan): void {
  try { window.localStorage.setItem(repiqPlanStorageKey, JSON.stringify(plan)); } catch {}
}

export function getStoredPostWorkoutPsych(): PostWorkoutPsych[] {
  try {
    const raw = window.localStorage.getItem(postWorkoutPsychStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function persistPostWorkoutPsych(entry: PostWorkoutPsych): void {
  try {
    const existing = getStoredPostWorkoutPsych();
    // Upsert: replace existing entry for same sessionId if re-capturing
    const updated = [entry, ...existing.filter(e => e.sessionId !== entry.sessionId)].slice(0, 500);
    window.localStorage.setItem(postWorkoutPsychStorageKey, JSON.stringify(updated));
  } catch {}
}

export function getStoredDailyReadiness(): DailyReadiness[] {
  try {
    const raw = window.localStorage.getItem(dailyReadinessStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function persistDailyReadiness(entry: DailyReadiness): void {
  try {
    const existing = getStoredDailyReadiness();
    // Upsert by date
    const updated = [entry, ...existing.filter(e => e.date !== entry.date)].slice(0, 365);
    window.localStorage.setItem(dailyReadinessStorageKey, JSON.stringify(updated));
  } catch {}
}


export function getStoredSessionBehavior(): SessionBehaviorSignals[] {
  try {
    const raw = window.localStorage.getItem(sessionBehaviorStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function persistSessionBehavior(entry: SessionBehaviorSignals): void {
  try {
    const existing = getStoredSessionBehavior();
    const updated = [entry, ...existing.filter(e => e.sessionId !== entry.sessionId)].slice(0, 500);
    window.localStorage.setItem(sessionBehaviorStorageKey, JSON.stringify(updated));
  } catch {}
}


export const SAMPLE_WORKOUT_PLANS: WorkoutPlan[] = [
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

export const SAMPLE_PLAN_IDS = new Set(SAMPLE_WORKOUT_PLANS.map((p) => p.id));

export function getStoredWorkoutPlans(): WorkoutPlan[] {
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

export function persistWorkoutPlans(plans: WorkoutPlan[]): void {
  try {
    // Never persist sample plans — they are always shown dynamically when no user plans exist
    const userPlans = plans.filter((p) => !SAMPLE_PLAN_IDS.has(p.id));
    window.localStorage.setItem(workoutPlansStorageKey, JSON.stringify(userPlans));
  } catch {
    // storage full or unavailable — ignore
  }
}

export function getStoredPlanBuilderDraft():
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

export function persistPlanBuilderDraft(draft: WorkoutPlan | null, mode: PlanBuilderMode): void {
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


export function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  const stored = window.localStorage.getItem(themeStorageKey);
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "system";
}

// ── Analytics date range prefs ───────────────────────────────────────────────
const dateRangePrefsStorageKey = "repiq.dateRange.v1";

const DEFAULT_DATE_RANGE_PREFS: DateRangePrefs = {
  lastMode: "rolling",
  rollingChip: "30d",
  toDateChip: "mtd"
};

const ROLLING_CHIP_SET: Set<RollingChip> = new Set([
  "7d", "14d", "30d", "60d", "90d", "6m", "1y", "all"
]);
const TO_DATE_CHIP_SET: Set<ToDateChip> = new Set([
  "wtd", "mtd", "qtd", "ytd", "all"
]);

export function getStoredDateRangePrefs(): DateRangePrefs {
  if (typeof window === "undefined") return { ...DEFAULT_DATE_RANGE_PREFS };
  try {
    const raw = window.localStorage.getItem(dateRangePrefsStorageKey);
    if (!raw) return { ...DEFAULT_DATE_RANGE_PREFS };
    const parsed = JSON.parse(raw) as Partial<DateRangePrefs>;
    const lastMode: DateRangeMode =
      parsed.lastMode === "toDate" ? "toDate" : "rolling";
    const rollingChip: RollingChip =
      parsed.rollingChip && ROLLING_CHIP_SET.has(parsed.rollingChip)
        ? parsed.rollingChip
        : DEFAULT_DATE_RANGE_PREFS.rollingChip;
    const toDateChip: ToDateChip =
      parsed.toDateChip && TO_DATE_CHIP_SET.has(parsed.toDateChip)
        ? parsed.toDateChip
        : DEFAULT_DATE_RANGE_PREFS.toDateChip;
    return { lastMode, rollingChip, toDateChip };
  } catch {
    return { ...DEFAULT_DATE_RANGE_PREFS };
  }
}

export function persistDateRangePrefs(prefs: DateRangePrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(dateRangePrefsStorageKey, JSON.stringify(prefs));
  } catch {
    // quota or serialization — ignore
  }
}

// Note: getStoredWorkoutSettings and getStoredCustomExercises remain in App.tsx
// because they depend on App.tsx-local constants (defaultWorkoutSettings, seededCustomExercises, etc.)

// ── Seed: 60 workouts over 90 days ───────────────────────────────────────────
// Only seeds if no saved workouts exist in localStorage.

// Local seed images — pre-cropped 800×800 JPEG, served from /public/seed/
const GYM_URLS = [
  // ── Original seed images ──────────────────────────────────────────────
  "/seed/g01.jpg",  // kettlebell Turkish get-up
  "/seed/g02.jpg",  // dark deadlift grip
  "/seed/g03.jpg",  // B&W pull-ups
  "/seed/g04.jpg",  // heavy barbell squat
  "/seed/g05.jpg",  // battle ropes
  "/seed/g06.jpg",  // woman barbell squat
  "/seed/g07.jpg",  // cable chest fly
  "/seed/g08.jpg",  // deadlift setup
  "/seed/g09.jpg",  // dips on machine
  "/seed/g10.jpg",  // seated dumbbell press
  "/seed/g11.jpg",  // cable crossover
  "/seed/g12.jpg",  // bench press
  "/seed/g13.jpg",  // dark barbell deadlift alt angle
  "/seed/g14.jpg",  // group yoga/stretch class
  "/seed/g15.jpg",  // B&W cable triceps
  "/seed/g16.jpg",  // barbell on gym floor
  "/seed/g17.jpg",  // plate carry dark gym
  "/seed/g18.jpg",  // couple with dumbbells
  "/seed/g19.jpg",  // overhead barbell snatch
  "/seed/g20.jpg",  // woman CF gym
  "/seed/g21.jpg",  // trainer coaching
  "/seed/g22.jpg",  // dumbbell curl
  "/seed/g23.jpg",  // treadmill with window view
  "/seed/g24.jpg",  // barbell curl
  "/seed/g25.jpg",  // open-air CF gym
  "/seed/g26.jpg",  // cable pulldown
  "/seed/g27.jpg",  // lat pulldown back
  "/seed/g28.jpg",  // treadmill sprint
  // ── User-provided images (from resources/) ────────────────────────────
  "/seed/u01.jpg",  // alexander-red — gym
  "/seed/u02.jpg",  // alonso-reyes — gym
  "/seed/u03.jpg",  // anastase-maragos — calisthenics
  "/seed/u04.jpg",  // anastase-maragos — calisthenics alt
  "/seed/u05.jpg",  // anupam-mahapatra — gym/yoga
  "/seed/u06.jpg",  // boxed-water — outdoor fitness
  "/seed/u07.jpg",  // bruno-nascimento — running
  "/seed/u08.jpg",  // charles-gaudreault — gym
  "/seed/u09.jpg",  // daniel-apodaca — outdoor
  "/seed/u10.jpg",  // edgar-chaparro — gym/outdoor
  "/seed/u11.jpg",  // eduardo-cano — gym
  "/seed/u12.jpg",  // john-fornander — outdoor/gym
  "/seed/u13.jpg",  // kike-vega — running
  "/seed/u14.jpg",  // pexels-airamdphoto — gym
  "/seed/u15.jpg",  // pexels-aleksey-bystrov — gym
  "/seed/u16.jpg",  // pexels-anastasia-shuraeva — fitness
  "/seed/u17.jpg",  // pexels-binyaminmellish — gym
  "/seed/u18.jpg",  // pexels-foadshariyati — gym
  "/seed/u19.jpg",  // pexels-imvitordiniz — gym
  "/seed/u20.jpg",  // pexels-jonathanborba — gym
  "/seed/u21.jpg",  // pexels-ketut-subiyanto — fitness
  "/seed/u22.jpg",  // pexels-mikegles — gym
  "/seed/u23.jpg",  // pexels-olly — outdoor fitness
  "/seed/u24.jpg",  // pexels-ozanyavuzphoto — gym
  "/seed/u25.jpg",  // pexels-salim-serdar — gym
  "/seed/u26.jpg",  // pexels-totalshape — gym equipment
  "/seed/u27.jpg",  // pexels-totalshape — gym equipment alt
  "/seed/u28.jpg",  // pexels-wolfart — gym
  "/seed/u29.jpg",  // pexels-wolrider — gym
  "/seed/u30.jpg",  // pexels-zeal-creative — gym
  "/seed/u31.jpg",  // scott-webb — gym/outdoor
  "/seed/u32.jpg",  // sour-moha — gym
  "/seed/u33.jpg",  // spencer-davis — running
  "/seed/u34.jpg",  // sven-mieke — gym interior
  "/seed/u35.jpg",  // thomas-yohei — gym
  "/seed/u36.jpg",  // total-shape — weights
  "/seed/u37.jpg",  // victor-freitas — gym weights
];
const OUTDOOR_URLS = [
  "/seed/o01.jpg",  // street athlete tying shoes
  "/seed/o02.jpg",  // bridge lunges
  "/seed/o03.jpg",  // sunset yoga silhouette
  "/seed/o04.jpg",  // beach jump
  "/seed/o05.jpg",  // outdoor group fitness
  "/seed/o06.jpg",  // running shoes on stairs
];
const PROGRESS_URLS = [
  // Original 3
  "/seed/p01.jpg",  // abs reveal
  "/seed/p02.jpg",  // battle rope portrait
  "/seed/p03.jpg",  // recovery mat
  // User images — physique / portrait / body-composition style
  "/seed/u01.jpg",  // alexander-red
  "/seed/u03.jpg",  // anastase-maragos — calisthenics physique
  "/seed/u04.jpg",  // anastase-maragos — calisthenics alt
  "/seed/u05.jpg",  // anupam-mahapatra — yoga/body
  "/seed/u08.jpg",  // charles-gaudreault
  "/seed/u14.jpg",  // pexels-airamdphoto
  "/seed/u16.jpg",  // pexels-anastasia-shuraeva — fitness portrait
  "/seed/u17.jpg",  // pexels-binyaminmellish
  "/seed/u18.jpg",  // pexels-foadshariyati
  "/seed/u20.jpg",  // pexels-jonathanborba
  "/seed/u21.jpg",  // pexels-ketut-subiyanto
  "/seed/u22.jpg",  // pexels-mikegles
  "/seed/u24.jpg",  // pexels-ozanyavuzphoto
  "/seed/u26.jpg",  // pexels-totalshape
  "/seed/u27.jpg",  // pexels-totalshape alt
  "/seed/u28.jpg",  // pexels-wolfart
  "/seed/u29.jpg",  // pexels-wolrider
  "/seed/u32.jpg",  // sour-moha
  "/seed/u34.jpg",  // sven-mieke
  "/seed/u36.jpg",  // total-shape
  "/seed/u37.jpg",  // victor-freitas — gym weights portrait
];

// Counters cycle through pools so every session gets a different image
let _gymIdx = 0, _outIdx = 0, _progIdx = 0;
function makeSeedImage(pool: string[], idx: number, label: string, serial: number): WorkoutMediaAsset {
  const url = pool[idx % pool.length];
  return {
    id: `seed-${label}-${serial}`,
    kind: "image",
    storage_key: `seed/${label}/${serial}`,
    original_name: `${label}.jpg`,
    mime_type: "image/jpeg",
    byte_size: 180000,
    public_url: url,
  };
}

const GYM_IMG = () => makeSeedImage(GYM_URLS, _gymIdx, "gym", ++_gymIdx);
const OUTDOOR_IMG = () => makeSeedImage(OUTDOOR_URLS, _outIdx, "outdoor", ++_outIdx);
const PROGRESS_IMG = () => makeSeedImage(PROGRESS_URLS, _progIdx, "progress", ++_progIdx);

type SeedExerciseSpec = {
  id: string;
  name: string;
  primaryMuscle: string;
  sets: { weight: number; reps: number; rpe: number | null; setType: string }[];
};

function makeSeedExercise(spec: SeedExerciseSpec): FinishedExerciseSummary {
  const loggedSets = spec.sets.length;
  const loggedVolume = spec.sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
  return { id: spec.id, name: spec.name, primaryMuscle: spec.primaryMuscle, loggedSets, loggedVolume, sets: spec.sets };
}

const PUSH_EXERCISES: SeedExerciseSpec[] = [
  { id: "bench-press", name: "Bench Press", primaryMuscle: "Chest",
    sets: [{ weight: 80, reps: 8, rpe: 7, setType: "normal" }, { weight: 82.5, reps: 6, rpe: 8, setType: "normal" }, { weight: 85, reps: 5, rpe: 9, setType: "normal" }] },
  { id: "incline-dumbbell-press", name: "Incline Dumbbell Press", primaryMuscle: "Chest",
    sets: [{ weight: 28, reps: 10, rpe: 7, setType: "normal" }, { weight: 30, reps: 8, rpe: 8, setType: "normal" }, { weight: 30, reps: 7, rpe: 8, setType: "normal" }] },
  { id: "cable-chest-fly", name: "Cable Chest Fly", primaryMuscle: "Chest",
    sets: [{ weight: 15, reps: 12, rpe: 7, setType: "normal" }, { weight: 15, reps: 12, rpe: 7, setType: "normal" }, { weight: 17.5, reps: 10, rpe: 8, setType: "normal" }] },
  { id: "dumbbell-shoulder-press", name: "Dumbbell Shoulder Press", primaryMuscle: "Shoulders",
    sets: [{ weight: 22, reps: 10, rpe: 7, setType: "normal" }, { weight: 24, reps: 8, rpe: 8, setType: "normal" }, { weight: 24, reps: 7, rpe: 9, setType: "normal" }] },
  { id: "tricep-pushdown", name: "Tricep Pushdown", primaryMuscle: "Triceps",
    sets: [{ weight: 32.5, reps: 12, rpe: 7, setType: "normal" }, { weight: 35, reps: 10, rpe: 8, setType: "normal" }, { weight: 35, reps: 9, rpe: 8, setType: "normal" }] },
  { id: "dips", name: "Dips", primaryMuscle: "Triceps",
    sets: [{ weight: 0, reps: 12, rpe: 7, setType: "normal" }, { weight: 0, reps: 10, rpe: 8, setType: "normal" }, { weight: 0, reps: 9, rpe: 9, setType: "normal" }] },
];

const PULL_EXERCISES: SeedExerciseSpec[] = [
  { id: "barbell-bent-over-row", name: "Barbell Bent Over Row", primaryMuscle: "Back",
    sets: [{ weight: 70, reps: 8, rpe: 7, setType: "normal" }, { weight: 75, reps: 7, rpe: 8, setType: "normal" }, { weight: 75, reps: 6, rpe: 8, setType: "normal" }] },
  { id: "lat-pulldown", name: "Lat Pulldown", primaryMuscle: "Lats",
    sets: [{ weight: 65, reps: 10, rpe: 7, setType: "normal" }, { weight: 70, reps: 9, rpe: 8, setType: "normal" }, { weight: 72.5, reps: 8, rpe: 8, setType: "normal" }, { weight: 72.5, reps: 7, rpe: 9, setType: "normal" }] },
  { id: "cable-curl", name: "Cable Curl", primaryMuscle: "Biceps",
    sets: [{ weight: 20, reps: 12, rpe: 7, setType: "normal" }, { weight: 22.5, reps: 10, rpe: 8, setType: "normal" }, { weight: 22.5, reps: 9, rpe: 8, setType: "normal" }] },
  { id: "face-pull", name: "Face Pull", primaryMuscle: "Rear Delts",
    sets: [{ weight: 25, reps: 15, rpe: 6, setType: "normal" }, { weight: 27.5, reps: 12, rpe: 7, setType: "normal" }, { weight: 27.5, reps: 12, rpe: 7, setType: "normal" }] },
  { id: "dumbbell-row", name: "Dumbbell Row", primaryMuscle: "Back",
    sets: [{ weight: 36, reps: 10, rpe: 7, setType: "normal" }, { weight: 38, reps: 8, rpe: 8, setType: "normal" }, { weight: 40, reps: 7, rpe: 9, setType: "normal" }] },
  { id: "rear-delt-raise", name: "Rear Delt Raise", primaryMuscle: "Rear Delts",
    sets: [{ weight: 10, reps: 15, rpe: 6, setType: "normal" }, { weight: 12, reps: 12, rpe: 7, setType: "normal" }, { weight: 12, reps: 10, rpe: 8, setType: "normal" }] },
];

const LEG_EXERCISES: SeedExerciseSpec[] = [
  { id: "back-squat", name: "Back Squat", primaryMuscle: "Quads",
    sets: [{ weight: 100, reps: 8, rpe: 7, setType: "normal" }, { weight: 107.5, reps: 6, rpe: 8, setType: "normal" }, { weight: 110, reps: 5, rpe: 9, setType: "normal" }, { weight: 110, reps: 4, rpe: 9, setType: "normal" }] },
  { id: "romanian-deadlift", name: "Romanian Deadlift", primaryMuscle: "Hamstrings",
    sets: [{ weight: 85, reps: 10, rpe: 7, setType: "normal" }, { weight: 90, reps: 8, rpe: 8, setType: "normal" }, { weight: 92.5, reps: 7, rpe: 8, setType: "normal" }] },
  { id: "leg-press", name: "Leg Press", primaryMuscle: "Quads",
    sets: [{ weight: 140, reps: 12, rpe: 7, setType: "normal" }, { weight: 150, reps: 10, rpe: 8, setType: "normal" }, { weight: 155, reps: 8, rpe: 8, setType: "normal" }, { weight: 155, reps: 8, rpe: 9, setType: "normal" }] },
  { id: "hamstring-curl", name: "Hamstring Curl", primaryMuscle: "Hamstrings",
    sets: [{ weight: 42.5, reps: 12, rpe: 7, setType: "normal" }, { weight: 45, reps: 10, rpe: 8, setType: "normal" }, { weight: 45, reps: 9, rpe: 8, setType: "normal" }] },
  { id: "leg-extension", name: "Leg Extension", primaryMuscle: "Quads",
    sets: [{ weight: 50, reps: 12, rpe: 7, setType: "normal" }, { weight: 55, reps: 10, rpe: 8, setType: "normal" }, { weight: 55, reps: 9, rpe: 8, setType: "normal" }] },
  { id: "goblet-squat", name: "Goblet Squat", primaryMuscle: "Quads",
    sets: [{ weight: 28, reps: 12, rpe: 6, setType: "normal" }, { weight: 32, reps: 10, rpe: 7, setType: "normal" }, { weight: 32, reps: 10, rpe: 7, setType: "normal" }] },
];

const FULLBODY_EXERCISES: SeedExerciseSpec[] = [
  { id: "deadlift", name: "Deadlift", primaryMuscle: "Back",
    sets: [{ weight: 120, reps: 5, rpe: 8, setType: "normal" }, { weight: 125, reps: 4, rpe: 9, setType: "normal" }, { weight: 130, reps: 3, rpe: 9, setType: "normal" }] },
  { id: "push-up", name: "Push-up", primaryMuscle: "Chest",
    sets: [{ weight: 0, reps: 20, rpe: 6, setType: "normal" }, { weight: 0, reps: 18, rpe: 7, setType: "normal" }, { weight: 0, reps: 15, rpe: 8, setType: "normal" }] },
  { id: "pull-up", name: "Pull-up", primaryMuscle: "Lats",
    sets: [{ weight: 0, reps: 10, rpe: 7, setType: "normal" }, { weight: 0, reps: 8, rpe: 8, setType: "normal" }, { weight: 0, reps: 7, rpe: 9, setType: "normal" }] },
  { id: "dumbbell-thruster", name: "Dumbbell Thruster", primaryMuscle: "Shoulders",
    sets: [{ weight: 18, reps: 12, rpe: 8, setType: "normal" }, { weight: 20, reps: 10, rpe: 8, setType: "normal" }, { weight: 20, reps: 8, rpe: 9, setType: "normal" }] },
  { id: "plank", name: "Plank", primaryMuscle: "Core",
    sets: [{ weight: 0, reps: 60, rpe: 6, setType: "normal" }, { weight: 0, reps: 60, rpe: 7, setType: "normal" }, { weight: 0, reps: 45, rpe: 8, setType: "normal" }] },
  { id: "kettlebell-swing", name: "Kettlebell Swing", primaryMuscle: "Glutes",
    sets: [{ weight: 24, reps: 15, rpe: 7, setType: "normal" }, { weight: 24, reps: 15, rpe: 7, setType: "normal" }, { weight: 28, reps: 12, rpe: 8, setType: "normal" }] },
];

const CARDIO_EXERCISES: SeedExerciseSpec[] = [
  { id: "rowing-machine", name: "Rowing Machine", primaryMuscle: "Back",
    sets: [{ weight: 0, reps: 500, rpe: 7, setType: "normal" }, { weight: 0, reps: 500, rpe: 7, setType: "normal" }, { weight: 0, reps: 500, rpe: 8, setType: "normal" }] },
  { id: "assault-bike", name: "Assault Bike", primaryMuscle: "Cardio",
    sets: [{ weight: 0, reps: 10, rpe: 8, setType: "normal" }, { weight: 0, reps: 10, rpe: 9, setType: "normal" }, { weight: 0, reps: 8, rpe: 9, setType: "normal" }] },
  { id: "cycling", name: "Cycling", primaryMuscle: "Quads",
    sets: [{ weight: 0, reps: 20, rpe: 6, setType: "normal" }, { weight: 0, reps: 20, rpe: 6, setType: "normal" }] },
  { id: "hiit-cardio", name: "HIIT Cardio", primaryMuscle: "Cardio",
    sets: [{ weight: 0, reps: 4, rpe: 9, setType: "normal" }, { weight: 0, reps: 4, rpe: 9, setType: "normal" }, { weight: 0, reps: 4, rpe: 8, setType: "normal" }, { weight: 0, reps: 3, rpe: 8, setType: "normal" }] },
  { id: "jump-rope", name: "Jump Rope", primaryMuscle: "Calves",
    sets: [{ weight: 0, reps: 100, rpe: 7, setType: "normal" }, { weight: 0, reps: 100, rpe: 7, setType: "normal" }, { weight: 0, reps: 80, rpe: 8, setType: "normal" }] },
];

type SessionType = "push" | "pull" | "legs" | "full_body" | "cardio";

type ImagePattern = "gym" | "gym2" | "gym_progress" | "gym2_progress" | "outdoor" | "outdoor2" | "gym_outdoor";

type SeedSessionConfig = {
  type: SessionType;
  name: string;
  exerciseCount: number;
  duration: string;
  durationSeconds: number;
  takeawayTitle: string;
  takeawayBody: string;
  noteType: "personal" | "quote" | null;
  personalNote?: string;
  quoteNote?: string;
  shareAsQuote?: boolean;
  imagePattern: ImagePattern;
  rewards?: LoggerReward[];
};

// 10 rotating configs — 7 quotes (70% ≈ 2/3), 3 personal notes, all have images
const SESSION_CONFIGS: SeedSessionConfig[] = [
  {
    type: "push", name: "Push Day", exerciseCount: 5, duration: "52 min", durationSeconds: 3120,
    takeawayTitle: "Strong Push Session", takeawayBody: "Hit all chest and shoulder targets.",
    noteType: "quote", quoteNote: "The iron never lies. Hit a PR on bench today.", shareAsQuote: true,
    imagePattern: "gym2",
    rewards: [
      { id: "r1a", exerciseId: null, setId: null, category: "pr", level: "session", shortLabel: "PR Broken!", detail: "You set a new session volume record on Push Day." },
      { id: "r1b", exerciseId: "bench-press", setId: null, category: "pr", level: "exercise", shortLabel: "New Max", detail: "New 1RM on Bench Press." },
      { id: "r1c", exerciseId: "bench-press", setId: "s1", category: "pr", level: "set", shortLabel: "Rep PR", detail: "Most reps ever at this weight." },
    ],
  },
  {
    type: "pull", name: "Pull Day", exerciseCount: 4, duration: "48 min", durationSeconds: 2880,
    takeawayTitle: "Back Focused", takeawayBody: "Great lat activation throughout.",
    noteType: "quote", quoteNote: "Consistency over intensity — every rep counts.", shareAsQuote: false,
    imagePattern: "gym_outdoor",
    rewards: [
      { id: "r2a", exerciseId: null, setId: null, category: "progress", level: "session", shortLabel: "Consistency Streak", detail: "3rd Pull Day in a row — keep it up!" },
    ],
  },
  {
    type: "legs", name: "Leg Day A", exerciseCount: 5, duration: "58 min", durationSeconds: 3480,
    takeawayTitle: "Leg Day Done", takeawayBody: "Quads and hamstrings fully loaded.",
    noteType: "personal", personalNote: "Legs were shaking by the end. Worth it.",
    imagePattern: "gym2_progress",
    rewards: [
      { id: "r3a", exerciseId: "squat", setId: null, category: "volume", level: "exercise", shortLabel: "Volume PR", detail: "Highest total squat volume this block." },
      { id: "r3b", exerciseId: "squat", setId: "s2", category: "pr", level: "set", shortLabel: "Heavy Single", detail: "Heaviest single rep ever recorded." },
    ],
  },
  {
    type: "full_body", name: "Full Body", exerciseCount: 5, duration: "55 min", durationSeconds: 3300,
    takeawayTitle: "Full Activation", takeawayBody: "Covered every major movement.",
    noteType: "quote", quoteNote: "Best session this week. Mind-muscle connection was on point.", shareAsQuote: true,
    imagePattern: "outdoor2",
    rewards: [
      { id: "r4a", exerciseId: null, setId: null, category: "volume", level: "session", shortLabel: "Volume Record", detail: "Highest total session volume ever." },
      { id: "r4b", exerciseId: "deadlift", setId: null, category: "pr", level: "exercise", shortLabel: "New Max", detail: "New deadlift 1RM." },
      { id: "r4c", exerciseId: "pull-up", setId: "s3", category: "pr", level: "set", shortLabel: "Rep PR", detail: "Most pull-up reps in a single set." },
    ],
  },
  {
    type: "cardio", name: "HIIT Session", exerciseCount: 3, duration: "35 min", durationSeconds: 2100,
    takeawayTitle: "Cardio Done", takeawayBody: "Heart rate peaked in every interval.",
    noteType: "quote", quoteNote: "Gasping is just your lungs growing.", shareAsQuote: true,
    imagePattern: "outdoor",
    rewards: [],
  },
  {
    type: "push", name: "Push Day B", exerciseCount: 5, duration: "50 min", durationSeconds: 3000,
    takeawayTitle: "Solid Push", takeawayBody: "Incline work felt powerful.",
    noteType: "personal", personalNote: "Felt recovered and dialled in. Volume was up 10% this block.",
    imagePattern: "gym2",
    rewards: [
      { id: "r6a", exerciseId: null, setId: null, category: "progress", level: "session", shortLabel: "Personal Best", detail: "Best push session score this cycle." },
      { id: "r6b", exerciseId: "incline-press", setId: null, category: "volume", level: "exercise", shortLabel: "Volume PR", detail: "Most incline press volume in a single session." },
    ],
  },
  {
    type: "pull", name: "Pull Day B", exerciseCount: 5, duration: "54 min", durationSeconds: 3240,
    takeawayTitle: "Back & Bi Day", takeawayBody: "Rows hit hard, biceps pumped.",
    noteType: "quote", quoteNote: "The grind today builds the results tomorrow.", shareAsQuote: true,
    imagePattern: "gym",
    rewards: [
      { id: "r7a", exerciseId: "barbell-row", setId: null, category: "pr", level: "exercise", shortLabel: "New Max", detail: "New row 1RM." },
      { id: "r7b", exerciseId: "barbell-row", setId: "s4", category: "pr", level: "set", shortLabel: "Rep PR", detail: "Most reps at this row weight." },
      { id: "r7c", exerciseId: "bicep-curl", setId: "s5", category: "pr", level: "set", shortLabel: "Heavy Single", detail: "Heaviest curl ever." },
    ],
  },
  {
    type: "legs", name: "Leg Day B", exerciseCount: 6, duration: "62 min", durationSeconds: 3720,
    takeawayTitle: "Heavy Legs", takeawayBody: "Squats at top of game today.",
    noteType: "personal", personalNote: "New squat PR at 112.5 kg. Day made.",
    imagePattern: "gym2_progress",
    rewards: [
      { id: "r8a", exerciseId: null, setId: null, category: "pr", level: "session", shortLabel: "PR Broken!", detail: "New all-time squat PR this session." },
      { id: "r8b", exerciseId: "squat", setId: null, category: "pr", level: "exercise", shortLabel: "New Max", detail: "1RM at 112.5 kg." },
      { id: "r8c", exerciseId: "leg-press", setId: "s6", category: "volume", level: "set", shortLabel: "Rep PR", detail: "Most leg press reps at this weight." },
      { id: "r8d", exerciseId: "romanian-deadlift", setId: null, category: "volume", level: "exercise", shortLabel: "Volume PR", detail: "Highest RDL volume this block." },
    ],
  },
  {
    type: "full_body", name: "Full Body B", exerciseCount: 4, duration: "45 min", durationSeconds: 2700,
    takeawayTitle: "Compound Focus", takeawayBody: "Deadlift and pull-up combo felt great.",
    noteType: "quote", quoteNote: "Progress is built one session at a time.", shareAsQuote: false,
    imagePattern: "outdoor2",
    rewards: [
      { id: "r9a", exerciseId: null, setId: null, category: "progress", level: "session", shortLabel: "Consistency Streak", detail: "5 sessions completed this week." },
    ],
  },
  {
    type: "cardio", name: "Morning Cardio", exerciseCount: 3, duration: "30 min", durationSeconds: 1800,
    takeawayTitle: "Aerobic Base", takeawayBody: "Steady pace, good zone 2 work.",
    noteType: "quote", quoteNote: "6am. No excuses. Just work.", shareAsQuote: true,
    imagePattern: "outdoor",
    rewards: [],
  },
];

function pickExercises(type: SessionType, count: number): FinishedExerciseSummary[] {
  const pool = type === "push" ? PUSH_EXERCISES
    : type === "pull" ? PULL_EXERCISES
    : type === "legs" ? LEG_EXERCISES
    : type === "full_body" ? FULLBODY_EXERCISES
    : CARDIO_EXERCISES;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, pool.length)).map(makeSeedExercise);
}

function makeImages(pattern: ImagePattern): { images: WorkoutMediaAsset[]; progressPicIndex?: number } {
  switch (pattern) {
    case "gym":         return { images: [GYM_IMG()] };
    case "gym2":        return { images: [GYM_IMG(), GYM_IMG()] };
    case "gym_outdoor": return { images: [GYM_IMG(), OUTDOOR_IMG()] };
    case "outdoor":     return { images: [OUTDOOR_IMG()] };
    case "outdoor2":    return { images: [OUTDOOR_IMG(), OUTDOOR_IMG()] };
    case "gym_progress": {
      const prog = PROGRESS_IMG();
      return { images: [prog, GYM_IMG()], progressPicIndex: 0 };
    }
    case "gym2_progress": {
      const prog = PROGRESS_IMG();
      return { images: [prog, GYM_IMG(), GYM_IMG()], progressPicIndex: 0 };
    }
    default: return { images: [GYM_IMG()] };
  }
}

const SEED_VERSION = "v12"; // bump to force reseed
const seedVersionKey = "repiq-seed-version";

export function seedWorkoutHistory(): void {
  if (typeof window === "undefined") return;
  // Reseed whenever seed version changes; safe for demo/dev
  if (window.localStorage.getItem(seedVersionKey) === SEED_VERSION) return;

  const now = new Date();
  // Deterministically pick exactly 60 unique day offsets from the past 90 days.
  // Shuffle all 90 candidates and take the first 60 — guarantees exact count
  // while still producing a realistic spread.
  const allDays = Array.from({ length: 90 }, (_, i) => i + 1);
  for (let i = allDays.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allDays[i], allDays[j]] = [allDays[j], allDays[i]];
  }
  // Sort newest-first (smallest offset = closest to today)
  const dayOffsets = allDays.slice(0, 60).sort((a, b) => a - b);

  const workouts: SavedWorkoutData[] = dayOffsets.map((dayOffset, index) => {
    const config = SESSION_CONFIGS[index % SESSION_CONFIGS.length];
    const sessionDate = new Date(now);
    sessionDate.setDate(now.getDate() - dayOffset);
    // Add a realistic time offset: 6am-8pm
    const hour = 6 + Math.floor(Math.random() * 14);
    const minute = Math.floor(Math.random() * 60);
    sessionDate.setHours(hour, minute, 0, 0);
    const isoDate = sessionDate.toISOString();

    const exercises = pickExercises(config.type, config.exerciseCount);
    const totalVolume = exercises.reduce((sum, e) => sum + e.loggedVolume, 0);
    const totalSets = exercises.reduce((sum, e) => sum + e.loggedSets, 0);
    const { images, progressPicIndex } = makeImages(config.imagePattern);

    const base: SavedWorkoutData = {
      savedAt: isoDate,
      sessionName: config.name,
      note: "",
      date: isoDate,
      duration: config.duration,
      durationSeconds: config.durationSeconds,
      totalVolume,
      totalSets,
      exerciseCount: exercises.length,
      loggedExerciseCount: exercises.length,
      ignoredIncompleteSets: 0,
      exercises,
      rewards: config.rewards ?? [],
      rewardSummary: (() => {
        const rws = config.rewards ?? [];
        const s = rws.filter(r => r.level === "set").length;
        const e = rws.filter(r => r.level === "exercise").length;
        const sess = rws.filter(r => r.level === "session").length;
        return { set: s, exercise: e, session: sess, total: rws.length };
      })(),
      takeawayTitle: config.takeawayTitle,
      takeawayBody: config.takeawayBody,
      images,
      workoutSource: "quick",
    };

    if (progressPicIndex !== undefined) base.progressPicIndex = progressPicIndex;
    if (config.noteType === "personal" && config.personalNote) {
      base.noteType = "personal";
      base.personalNote = config.personalNote;
    } else if (config.noteType === "quote" && config.quoteNote) {
      base.noteType = "quote";
      base.quoteNote = config.quoteNote;
      base.shareAsQuote = config.shareAsQuote ?? false;
    }

    return base;
  });

  // Store newest-first (already sorted dayOffsets descending = index 0 is most recent)
  try {
    window.localStorage.setItem(savedWorkoutsStorageKey, JSON.stringify(workouts));
    window.localStorage.setItem(seedVersionKey, SEED_VERSION);
  } catch {
    // storage full or unavailable — ignore
  }
}

