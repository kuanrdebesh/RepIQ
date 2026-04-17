/**
 * Demo seed data for RepIQ — 30 sessions across 45 days ending April 14 2026.
 * Wednesday is deliberately the most-active day (6 sessions) to validate the heatmap.
 * April sessions include workout and progress photos.
 */
import type { SavedWorkoutData } from "./types";

// ─── tiny helpers ────────────────────────────────────────────────────────────
const s = (weight: number, reps: number, rpe: number | null = null) =>
  ({ weight, reps, rpe, setType: "normal" });

type RawSet = ReturnType<typeof s>;

interface ExData {
  id: string;
  name: string;
  primaryMuscle: string;
  movementPattern: string;
  sets: RawSet[];
}

const ex = (
  id: string, name: string, primaryMuscle: string, movementPattern: string,
  sets: RawSet[],
): ExData => ({ id, name, primaryMuscle, movementPattern, sets });

function buildExSummary(e: ExData) {
  return {
    id: e.id,
    name: e.name,
    primaryMuscle: e.primaryMuscle,
    movementPattern: e.movementPattern,
    loggedSets: e.sets.length,
    loggedVolume: e.sets.reduce((sum, s) => sum + s.weight * s.reps, 0),
    sets: e.sets,
  };
}

const EMPTY_REWARD_SUMMARY = { set: 0, exercise: 0, session: 0, total: 0 };

function photo(
  seed: string,
  role: "progress" | "workout",
): SavedWorkoutData["images"][number] {
  return {
    id: `demo-${seed}`,
    kind: "image" as const,
    storage_key: `demo/${seed}.jpg`,
    original_name: `${seed}.jpg`,
    mime_type: "image/jpeg",
    byte_size: 180_000,
    upload_url: null,
    public_url: `https://picsum.photos/seed/${seed}/400/500`,
    photoRole: role,
  };
}

function workout(
  date: string,
  sessionName: string,
  note: string,
  exercises: ExData[],
  images: SavedWorkoutData["images"] = [],
  durationMins = 55,
): SavedWorkoutData {
  const summaries = exercises.map(buildExSummary);
  const totalSets = summaries.reduce((a, e) => a + e.loggedSets, 0);
  const totalVolume = summaries.reduce((a, e) => a + e.loggedVolume, 0);
  return {
    savedAt: `${date}T19:00:00.000Z`,
    date,
    sessionName,
    note,
    duration: `${String(Math.floor(durationMins / 60)).padStart(2, "0")}:${String(durationMins % 60).padStart(2, "0")}`,
    durationSeconds: durationMins * 60,
    totalVolume,
    totalSets,
    exerciseCount: exercises.length,
    loggedExerciseCount: exercises.length,
    ignoredIncompleteSets: 0,
    exercises: summaries,
    rewards: [],
    rewardSummary: EMPTY_REWARD_SUMMARY,
    takeawayTitle: "",
    takeawayBody: "",
    images,
    workoutSource: "quick" as const,
  };
}

// ─── exercise library shortcuts ───────────────────────────────────────────────
// Push
const benchPress    = (w1: number, w2: number, w3: number, w4?: number) => ex("bench-press",          "Bench Press",              "Chest",      "horizontal_push",  w4 ? [s(w1,8,7),s(w2,6,8),s(w3,5,9),s(w4,4,9.5)] : [s(w1,8,7),s(w2,6,8),s(w3,5,9)]);
const inclineDB     = (w: number)                => ex("incline-dumbbell-press", "Incline Dumbbell Press",   "Chest",      "horizontal_push",  [s(w,10,7),s(w,9,8),s(w,8,8.5)]);
const shoulderPress = (w: number)                => ex("shoulder-press",         "Shoulder Press",           "Shoulders",  "vertical_push",    [s(w,8,7),s(w,7,8.5),s(w,6,9)]);
const lateralRaise  = (w: number)                => ex("cable-lateral-raise",    "Cable Lateral Raise",      "Shoulders",  "isolation_push",   [s(w,15,7),s(w,14,8),s(w,13,8.5),s(w,12,9)]);
const ropePushdown  = (w: number)                => ex("rope-pushdown",          "Rope Pushdown",            "Triceps",    "isolation_push",   [s(w,12,7),s(w,11,8),s(w,10,8.5)]);
const chessDip      = ()                         => ex("chest-dip",              "Chest Dip",                "Chest",      "vertical_push",    [s(0,12,7),s(0,10,8),s(0,9,8.5)]);
const flatDB        = (w: number)                => ex("flat-dumbbell-press",    "Flat Dumbbell Press",      "Chest",      "horizontal_push",  [s(w,10,7),s(w,9,8),s(w,8,8.5)]);

// Pull
const pullUp        = (extra = 0)                => ex("pull-up",                "Pull-Up",                  "Lats",       "vertical_pull",    [s(extra,8,7),s(extra,7,8),s(extra,6,8.5)]);
const latPulldown   = (w: number)                => ex("lat-pulldown",           "Lat Pulldown",             "Lats",       "vertical_pull",    [s(w,10,7),s(w,9,8),s(w,8,8.5)]);
const seatedRow     = (w: number)                => ex("seated-cable-row",       "Seated Cable Row",         "Back",       "horizontal_pull",  [s(w,10,7),s(w,9,8),s(w,8,8.5)]);
const chestRow      = (w: number)                => ex("chest-supported-row",    "Chest-Supported Row",      "Back",       "horizontal_pull",  [s(w,12,7),s(w,11,8),s(w,10,8.5)]);
const ezCurl        = (w: number)                => ex("ez-bar-curl",            "EZ-Bar Curl",              "Biceps",     "isolation_pull",   [s(w,10,7),s(w,9,8),s(w,8,8.5)]);

// Legs
const squat         = (w: number)                => ex("barbell-squat",          "Barbell Squat",            "Quads",      "squat",            [s(w,6,7),s(w,5,8.5),s(w,4,9),s(w,3,9.5)]);
const legPress      = (w: number)                => ex("leg-press",              "Leg Press",                "Quads",      "squat",            [s(w,12,7),s(w,11,8),s(w,10,8.5)]);
const rdl           = (w: number)                => ex("romanian-deadlift",      "Romanian Deadlift",        "Hamstrings", "hip_hinge",        [s(w,10,7),s(w,9,8),s(w,8,8.5)]);
const hamCurl       = (w: number)                => ex("hamstring-curl",         "Hamstring Curl",           "Hamstrings", "isolation_legs",   [s(w,12,7),s(w,11,8),s(w,10,8.5)]);
const hipThrust     = (w: number)                => ex("barbell-hip-thrust",     "Barbell Hip Thrust",       "Glutes",     "hip_hinge",        [s(w,10,7),s(w,9,8),s(w,8,8.5)]);
const calfRaise     = (w: number)                => ex("standing-calf-raise",    "Standing Calf Raise",      "Calves",     "isolation_legs",   [s(w,15,7),s(w,14,8),s(w,12,8.5)]);

// Core / extra
const plankEx       = (secs = 60)               => ex("plank",                  "Plank",                    "Core",       "core_anterior",    [s(0,secs,null),s(0,secs,null),s(0,secs,null)]);
const hangingLR     = ()                         => ex("hanging-leg-raise",      "Hanging Leg Raise",        "Core",       "core_anterior",    [s(0,12,7),s(0,10,8),s(0,10,8.5)]);
const backExt       = (w: number)                => ex("back-extension",         "Back Extension",           "Lower Back", "hip_hinge",        [s(w,12,7),s(w,11,8),s(w,10,8.5)]);

// ─── Workout library (30 sessions) ───────────────────────────────────────────
// Wednesdays (6) — most active day
const W01 = workout("2026-03-04", "Push A", "Focused on chest lockout today", [benchPress(80,82.5,85), inclineDB(28), shoulderPress(50), lateralRaise(12), ropePushdown(32)]);
const W02 = workout("2026-03-11", "Pull A", "Great lat connection on pulldowns", [latPulldown(65), seatedRow(65), chestRow(24), ezCurl(34), pullUp()]);
const W03 = workout("2026-03-18", "Legs A", "Heavy squat day — new PR attempt", [squat(110), legPress(160), rdl(90), hamCurl(45), calfRaise(70)]);
const W04 = workout("2026-03-25", "Push B", "Chest dips felt strong", [benchPress(82.5,85,87.5), chessDip(), shoulderPress(52.5), lateralRaise(13), ropePushdown(34)]);
const W05 = workout("2026-04-01", "Pull B — Volume Day", "Best pull session in weeks. Hit every rep.", [latPulldown(67.5), seatedRow(67.5), chestRow(26), ezCurl(36), pullUp(5)],
  [photo("repiq-progress-apr1a", "progress"), photo("repiq-progress-apr1b", "progress"), photo("repiq-workout-apr1", "workout")], 62);
const W06 = workout("2026-04-08", "Legs B + Glutes", "Hip thrust PR 💪 Glutes on fire", [squat(115), hipThrust(120), rdl(92.5), hamCurl(47.5), calfRaise(72.5)],
  [photo("repiq-progress-apr8a", "progress"), photo("repiq-progress-apr8b", "progress"), photo("repiq-workout-apr8", "workout")], 68);

// Mondays (5)
const M01 = workout("2026-03-02", "Upper A", "Solid upper body session to kick off the week", [benchPress(78,80,82.5), latPulldown(62.5), shoulderPress(48), seatedRow(62.5), ezCurl(32)]);
const M02 = workout("2026-03-09", "Push A", "Shoulder felt tight, backed off OHP", [benchPress(80,82.5,82.5), inclineDB(26), shoulderPress(48), lateralRaise(12), ropePushdown(32)]);
const M03 = workout("2026-03-16", "Pull A", "Focused on mind-muscle with rows", [latPulldown(65), seatedRow(65), chestRow(24), ezCurl(34), pullUp()]);
const M04 = workout("2026-03-23", "Push B", "Felt fresh — hit all sets clean", [benchPress(82.5,85,85), flatDB(30), shoulderPress(50), lateralRaise(13), ropePushdown(34)]);
const M05 = workout("2026-04-06", "Upper A", "Solid upper session after the weekend", [benchPress(85,87.5,90), latPulldown(70), shoulderPress(55), seatedRow(70), ezCurl(38)],
  [photo("repiq-progress-apr6", "progress"), photo("repiq-workout-apr6", "workout")], 58);

// Fridays (5)
const F01 = workout("2026-03-06", "Legs A", "Squats moving well, hit depth every rep", [squat(105), legPress(155), rdl(87.5), hamCurl(42.5), calfRaise(67.5)]);
const F02 = workout("2026-03-13", "Full Body", "Quick full-body hit before weekend", [squat(100), benchPress(80,80,80), latPulldown(62.5), hipThrust(110), plankEx(60)], [], 50);
const F03 = workout("2026-03-20", "Push A", "Incline felt good today", [benchPress(82.5,85,85), inclineDB(28), shoulderPress(50), lateralRaise(13), ropePushdown(33)]);
const F04 = workout("2026-03-27", "Pull B", "Weighted pull-ups — 3 reps at +10 kg!", [latPulldown(67.5), seatedRow(67.5), chestRow(26), ezCurl(36), pullUp(10)]);
const F05 = workout("2026-04-10", "Push B — Heavy", "Bench at 92.5 kg — almost there!", [benchPress(90,92.5,92.5,87.5), chessDip(), shoulderPress(57.5), lateralRaise(14), ropePushdown(36)],
  [photo("repiq-progress-apr10", "progress"), photo("repiq-workout-apr10", "workout")], 65);

// Saturdays (4)
const Sa01 = workout("2026-03-07", "Legs + Core", "Saturday grind — quads fried", [squat(107.5), legPress(157.5), hipThrust(112.5), hamCurl(43), plankEx(60)]);
const Sa02 = workout("2026-03-21", "Full Body", "Light full-body, active recovery vibes", [squat(90), benchPress(75,75,75), latPulldown(60), hipThrust(100), backExt(10)], [], 48);
const Sa03 = workout("2026-03-28", "Legs A", "Focused on glute-ham connection", [rdl(90), hamCurl(45), hipThrust(115), legPress(160), calfRaise(70)]);
const Sa04 = workout("2026-04-11", "Full Body Peak", "End of the week strength test — all PRs hit", [squat(117.5), benchPress(90,92.5,95), latPulldown(72.5), hipThrust(122.5), plankEx(75)],
  [photo("repiq-progress-apr11a", "progress"), photo("repiq-progress-apr11b", "progress"), photo("repiq-workout-apr11", "workout")], 72);

// Thursdays (4)
const Th01 = workout("2026-03-05", "Pull A", "Cable rows heavy — good pump", [latPulldown(62.5), seatedRow(62.5), chestRow(22), ezCurl(32), pullUp()]);
const Th02 = workout("2026-03-19", "Upper B", "Upper hypertrophy — lots of volume", [flatDB(28), latPulldown(65), shoulderPress(50), chestRow(24), ezCurl(34), lateralRaise(12)]);
const Th03 = workout("2026-03-26", "Pull + Core", "Long session but worth it", [latPulldown(67.5), seatedRow(65), chestRow(24), ezCurl(36), hangingLR()]);
const Th04 = workout("2026-04-09", "Legs + Core", "Squats and deadlifts on same day 😤", [squat(112.5), rdl(95), hamCurl(48), calfRaise(72.5), plankEx(60)],
  [photo("repiq-progress-apr9", "progress"), photo("repiq-workout-apr9", "workout")], 70);

// Tuesdays (3)
const T01 = workout("2026-03-10", "Push + Core", "Chest and abs — classic combo", [benchPress(80,82.5,82.5), inclineDB(26), shoulderPress(48), ropePushdown(32), hangingLR()]);
const T02 = workout("2026-03-24", "Upper B", "Moderate session, kept rest short", [flatDB(28), latPulldown(65), shoulderPress(50), seatedRow(65), ezCurl(34)]);
const T03 = workout("2026-04-07", "Push A — Intensity", "Supersets today — crazy pump", [benchPress(87.5,90,90), inclineDB(30), shoulderPress(55), lateralRaise(14), ropePushdown(35)],
  [photo("repiq-progress-apr7", "progress"), photo("repiq-workout-apr7", "workout")], 52);

// Sundays (3)
const Su01 = workout("2026-03-08", "Active Recovery", "Light full-body + stretching", [legPress(120), latPulldown(55), backExt(8), plankEx(45)], [], 40);
const Su02 = workout("2026-03-22", "Full Body", "Energised Sunday session!", [squat(100), benchPress(78,80,80), latPulldown(62.5), rdl(85), plankEx(60)], [], 55);
const Su03 = workout("2026-04-05", "Pull + Core", "Great mind-muscle on rows today", [latPulldown(67.5), seatedRow(67.5), chestRow(26), ezCurl(36), hangingLR()],
  [photo("repiq-progress-apr5", "progress"), photo("repiq-workout-apr5", "workout")], 50);

export const DEMO_WORKOUTS: SavedWorkoutData[] = [
  // Sorted oldest → newest so History shows them newest-first after sort
  W01, M01, F01, Sa01, Th01, Su01, M02, T01, W02, F02,
  M03, Sa02, W03, Th02, F03, Su02, Sa03, M04, T02, W04,
  Th03, F04, W05, Su03, M05, T03, Th04, W06, F05, Sa04,
];

export function seedDemoWorkouts(
  existing: SavedWorkoutData[],
): SavedWorkoutData[] {
  // Always replace workouts on demo dates so photo / data updates are applied.
  // Non-demo dates (user's own sessions) are preserved unchanged.
  const demoDateSet = new Set(DEMO_WORKOUTS.map((w) => w.date));
  const nonDemo = existing.filter((w) => !demoDateSet.has(w.date));
  return [...nonDemo, ...DEMO_WORKOUTS].sort((a, b) =>
    a.savedAt.localeCompare(b.savedAt),
  );
}
