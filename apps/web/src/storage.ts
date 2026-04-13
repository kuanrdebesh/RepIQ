import {
  DEFAULT_PSYCH_PROFILE,
} from "./types";
import type {
  SavedWorkoutData, UserPsychProfile, RepIQPlan, PostWorkoutPsych,
  DailyReadiness, SessionBehaviorSignals, WorkoutPlan, PlanBuilderMode,
  ThemePreference, ReplacementEvent, ExercisePreferenceMap
} from "./types";

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

// Note: getStoredWorkoutSettings and getStoredCustomExercises remain in App.tsx
// because they depend on App.tsx-local constants (defaultWorkoutSettings, seededCustomExercises, etc.)

