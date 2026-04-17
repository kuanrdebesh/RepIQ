/**
 * Demo seed — 60 sessions over 90 days (Jan 18 – Apr 12 2026).
 * Images: from /seed/r-* (resources folder, served statically).
 * Rules:
 *  - Every session: 1–3 workout images from the pool
 *  - Every session: one image marked as progress pic (progressPicIndex, rotated to minimise repetition)
 *  - Every 1 in 2 sessions: a quote (quoteNote, noteType:"quote")
 *  - Every 2 in 3 sessions: a personal note (note field, empty string on the skipped third)
 */
import type { SavedWorkoutData } from "./types";

// ─── image pool (38 local files served from /seed/) ──────────────────────────
const POOL = [
  "r-anastase-maragos-4dlhin0ghOk-unsplash.jpg",
  "r-victor-freitas-WvDYdXDzkhs-unsplash.jpg",
  "r-pexels-totalshape-5769128.jpg",
  "r-pexels-mikegles-14623668.jpg",
  "r-edgar-chaparro-sHfo3WOgGTU-unsplash.jpg",
  "r-anastase-maragos-9dzWZQWZMdE-unsplash.jpg",
  "r-pexels-foadshariyati-29773898.jpg",
  "r-pexels-jonathanborba-36399982.jpg",
  "r-pexels-totalshape-5769129.jpg",
  "r-pexels-airamdphoto-13106581.jpg",
  "r-john-fornander-TAZoUmDqzXk-unsplash.jpg",
  "r-sven-mieke-optBC2FxCfc-unsplash.jpg",
  "r-pexels-imvitordiniz-27433189.jpg",
  "r-alexander-red-d3bYmnZ0ank-unsplash.jpg",
  "r-pexels-olly-3838389.jpg",
  "r-thomas-yohei-BAlBUJb-SXQ-unsplash.jpg",
  "r-pexels-ozanyavuzphoto-31216263.jpg",
  "r-alonso-reyes-0HlI76m4jxU-unsplash.jpg",
  "r-pexels-ketut-subiyanto-4854250.jpg",
  "r-scott-webb-U5kQvbQWoG0-unsplash.jpg",
  "r-pexels-wolfart-36389484.jpg",
  "r-bruno-nascimento-PHIgYUGQPvU-unsplash.jpg",
  "r-pexels-anastasia-shuraeva-4944979.jpg",
  "r-eduardo-cano-photo-co-AzX5iNFYBMY-unsplash.jpg",
  "r-pexels-aleksey-bystrov-276309422-14209250.jpg",
  "r-kike-vega-F2qh3yjz6Jk-unsplash.jpg",
  "r-pexels-salim-serdar-bali-2159840407-36327498.jpg",
  "r-daniel-apodaca-WdoQio6HPVA-unsplash.jpg",
  "r-pexels-wolrider-17626051.jpg",
  "r-total-shape-wXBK9JrM0iU-unsplash.jpg",
  "r-anupam-mahapatra-Vz0RbclzG_w-unsplash.jpg",
  "r-charles-gaudreault-xXofYCc3hqc-unsplash.jpg",
  "r-pexels-wolfart-36389484_(1).jpg",
  "r-sour-moha-_cUZkx0wTyM-unsplash.jpg",
  "r-pexels-zeal-creative-studios-58866141-34043597.jpg",
  "r-boxed-water-is-better-zQNDCje06VM-unsplash.jpg",
  "r-spencer-davis-0ShTs8iPY28-unsplash.jpg",
  "r-pexels-binyaminmellish-17840.jpg",
];

// Image count per session (60 values, pattern averaging ~2 per session)
// 1 = light/recovery session, 2 = regular, 3 = heavy/milestone
const IMG_COUNTS = [
  2,2,2,1,2,1, // J01–J06
  2,2,3,        // J07–J09
  2,2,2,1,2,   // J10–J14
  2,3,2,3,2,1, // J15–J20
  2,2,2,3,     // J21–J24
  2,2,2,3,2,1, // J25–J30
  // Mar–Apr
  2,2,2,2,2,1, // M01 W01 F01 Sa01 Th01 Su01
  2,2,2,2,     // M02 T01 W02 F02
  2,1,3,2,2,2, // M03 Sa02 W03 Th02 F03 Su02
  2,2,2,3,     // Sa03 M04 T02 W04
  2,3,3,2,3,3,3,3, // Th03 F04 W05 Su03 M05 T03 Th04 W06
  3,3,         // F05 Sa04
];

function makeImage(filename: string, sessionIdx: number, imgIdx: number): SavedWorkoutData["images"][number] {
  return {
    id: `demo-${sessionIdx}-${imgIdx}`,
    kind: "image" as const,
    storage_key: `seed/${filename}`,
    original_name: filename,
    mime_type: "image/jpeg",
    byte_size: 210_000,
    upload_url: null,
    public_url: `/seed/${filename}`,
  };
}

function makeImages(sessionIdx: number): { images: SavedWorkoutData["images"]; progressPicIndex: number } {
  const n = IMG_COUNTS[sessionIdx] ?? 2;
  const startPoolIdx = IMG_COUNTS.slice(0, sessionIdx).reduce((a, b) => a + b, 0);
  const images = Array.from({ length: n }, (_, i) => {
    const fname = POOL[(startPoolIdx + i) % POOL.length];
    return makeImage(fname, sessionIdx, i);
  });
  // Rotate progress pic index across sessions to spread which image is marked progress
  const progressPicIndex = n === 1 ? 0 : sessionIdx % n;
  return { images, progressPicIndex };
}

// ─── quotes (30, assigned to even-indexed sessions) ──────────────────────────
const QUOTES = [
  "Every rep is a decision.",
  "Showed up when I didn't want to. That's the whole game.",
  "Strength isn't built in a day — but today counted.",
  "Consistency over intensity.",
  "The weight doesn't care how you feel. Neither does progress.",
  "Earned it.",
  "Small wins compound.",
  "Hard sessions build easy ones.",
  "The only bad workout is the one you skipped.",
  "Trust the process.",
  "Lift until it's light.",
  "Another one done. That's all it takes.",
  "Every session is a deposit.",
  "You don't have to feel like it. You just have to show up.",
  "The discomfort is the point.",
  "Progress doesn't wait for perfect conditions.",
  "One more rep. One more week. One more month.",
  "The work is quiet. So is the growth.",
  "Fatigue is temporary. The adaptation is permanent.",
  "Today I chose discipline.",
  "Strong enough to rest when it matters.",
  "The bar doesn't care about excuses.",
  "Repetition is the mother of skill.",
  "Steady hands build heavy lifts.",
  "If it was easy, everyone would do it.",
  "Another day, another step forward.",
  "Sweat is just fat crying.",
  "The gym doesn't lie.",
  "Built session by session.",
  "Chase progress, not perfection.",
];

// ─── personal notes (40, assigned when sessionIdx % 3 !== 2) ─────────────────
const NOTES = [
  "Felt strong today — bench moving really well this week.",
  "Shoulder was a bit tight, scaled back OHP slightly. Still a solid session.",
  "Legs completely fried after this one. Walked out slow.",
  "Great focus on mind-muscle. Lats actually felt connected on pulldowns.",
  "Energy was low coming in, but the warm-up fixed everything.",
  "Kept rest periods short. Volume felt high, but manageable.",
  "New squat depth PR — hit parallel on every rep. Feeling it.",
  "Rough start — bar felt heavy. Pushed through and finished strong.",
  "Grip was giving out on the last set of rows. Need straps next time.",
  "Hip thrust loaded heavier than ever. Glutes talking the next day.",
  "Good session. Nothing broke. Showed up, did the work, left.",
  "Incline DB felt really stable today. Chest got a great stretch.",
  "EZ-bar curl up 2.5 kg — small win but I'll take it.",
  "Didn't sleep great, but effort was there. Decent output considering.",
  "Weighted pull-ups for the first time. Humbling but exciting.",
  "Core was more fatigued than expected midway through. Note for next time.",
  "Best session this month. Everything clicked — form, weight, energy.",
  "Quick session before a long day. Got the essentials in.",
  "Tried reducing rest to 60 seconds. Volume held, pump was crazy.",
  "Bench finally cracked the milestone I've been chasing for weeks.",
  "Calf raises at the end — those never get easier. Good.",
  "Felt like I had more in the tank after the last set. That's a good sign.",
  "Morning session for once. Slower start, but felt fresh by the end.",
  "Focused on form over weight today. Slower reps, better connection.",
  "Squat depth was cleaner than usual. Something clicked in the setup.",
  "Rained all day. The gym was quiet. One of those good sessions.",
  "Lateral raises at the end — side delts finally looking fuller.",
  "Kept the playlist off for once. Just me and the bar. Liked it.",
  "Post-travel session. Body needed the reset. Felt better after.",
  "Overhead press plateau might finally be breaking. Two solid reps more.",
  "Hamstring curl PR today. Legs growing for sure.",
  "Ran 10 minutes on the treadmill as a warm-up. Heart rate high but felt good.",
  "Gym was packed. Had to adapt a couple of exercises. Still got it done.",
  "RDL form check today — hips back, neutral spine. Hamstrings screaming.",
  "Took 90-second rest periods. Recovery felt better between sets.",
  "Partner spotted me on the last set of bench. Squeezed out 2 extra reps.",
  "Hip flexors were tight going into squats. Added extra mobility work beforehand.",
  "Cardio finisher — 5 min stairmaster. Didn't want to, but did it anyway.",
  "First time trying cable lateral raises. Way better isolation than dumbbells.",
  "Finished the session feeling like I could've done more. Good place to be.",
];

// ─── exercise helpers ─────────────────────────────────────────────────────────
const s = (weight: number, reps: number, rpe: number | null = null) =>
  ({ weight, reps, rpe, setType: "normal" });

type RawSet = ReturnType<typeof s>;
interface ExData { id: string; name: string; primaryMuscle: string; movementPattern: string; sets: RawSet[]; }

const ex = (id: string, name: string, pm: string, mp: string, sets: RawSet[]): ExData =>
  ({ id, name, primaryMuscle: pm, movementPattern: mp, sets });

function buildExSummary(e: ExData) {
  return {
    id: e.id, name: e.name, primaryMuscle: e.primaryMuscle, movementPattern: e.movementPattern,
    loggedSets: e.sets.length,
    loggedVolume: e.sets.reduce((sum, s) => sum + s.weight * s.reps, 0),
    sets: e.sets,
  };
}

const EMPTY_REWARD_SUMMARY = { set: 0, exercise: 0, session: 0, total: 0 };

// ─── reward generation ────────────────────────────────────────────────────────
type RewardLevel    = "set" | "exercise" | "session";
type RewardCategory = "pr" | "volume" | "progress";

const SET_LABELS: [RewardCategory, string, string][] = [
  ["pr",       "Set PR",         "New personal record on this set"],
  ["volume",   "+1 rep",         "One extra rep vs last time"],
  ["progress", "Clean form",     "Best technique you've had on this lift"],
  ["pr",       "Weight PR",      "Heaviest set you've ever done here"],
  ["volume",   "Rep PR",         "Most reps at this weight"],
];

const EXERCISE_LABELS: [RewardCategory, string, string][] = [
  ["pr",       "Exercise PR",    "Top set was a personal best"],
  ["volume",   "Volume up",      "Most total volume on this exercise"],
  ["progress", "Consistency",    "Hit every planned set"],
  ["pr",       "Strength PR",    "New max weight for this movement"],
  ["volume",   "Best session",   "Highest volume ever for this exercise"],
];

const SESSION_LABELS: [RewardCategory, string, string][] = [
  ["pr",       "Session PR",     "Highest total volume in a single session"],
  ["volume",   "Volume week",    "Best volume week so far"],
  ["progress", "Full session",   "Completed every planned set and exercise"],
  ["pr",       "Weekly best",    "Strongest session of the week"],
  ["volume",   "Output up",      "Total output above your recent average"],
];

function makeRewards(
  idx: number,
  exercises: ExData[],
): { rewards: SavedWorkoutData["rewards"]; rewardSummary: SavedWorkoutData["rewardSummary"] } {
  // 2 out of every 3 sessions get rewards (skip index where idx % 3 === 1)
  if (idx % 3 === 1) return { rewards: [], rewardSummary: EMPTY_REWARD_SUMMARY };

  // Deterministic "random" based on session index
  const rng = (offset = 0) => ((idx * 7 + offset * 13) % 97) / 97;

  const rewards: SavedWorkoutData["rewards"] = [];
  let setCount = 0, exerciseCount = 0, sessionCount = 0;

  // Decide total reward count: 1–10
  const total = 1 + Math.floor(rng(0) * 10);

  // Distribute: roughly 40% set, 40% exercise, 20% session — clamp to total
  const nSet     = Math.min(Math.round(total * 0.4), exercises.length * 2);
  const nSession = Math.min(Math.round(total * 0.2), 1);
  const nEx      = Math.max(0, total - nSet - nSession);

  // Set-level rewards
  for (let i = 0; i < nSet; i++) {
    const ex = exercises[i % exercises.length];
    const [cat, label, detail] = SET_LABELS[(idx + i) % SET_LABELS.length];
    rewards.push({ id: `demo-r-${idx}-s${i}`, exerciseId: ex.id, setId: `set-${i}`, category: cat, level: "set", shortLabel: label, detail });
    setCount++;
  }

  // Exercise-level rewards
  for (let i = 0; i < nEx; i++) {
    const ex = exercises[i % exercises.length];
    const [cat, label, detail] = EXERCISE_LABELS[(idx + i) % EXERCISE_LABELS.length];
    rewards.push({ id: `demo-r-${idx}-e${i}`, exerciseId: ex.id, setId: null, category: cat, level: "exercise", shortLabel: label, detail });
    exerciseCount++;
  }

  // Session-level reward
  for (let i = 0; i < nSession; i++) {
    const [cat, label, detail] = SESSION_LABELS[(idx + i) % SESSION_LABELS.length];
    rewards.push({ id: `demo-r-${idx}-ss${i}`, exerciseId: null, setId: null, category: cat, level: "session", shortLabel: label, detail });
    sessionCount++;
  }

  const rewardSummary = { set: setCount, exercise: exerciseCount, session: sessionCount, total: rewards.length };
  return { rewards, rewardSummary };
}

const benchPress    = (w1: number, w2: number, w3: number, w4?: number) => ex("bench-press",          "Bench Press",              "Chest",      "horizontal_push",  w4 ? [s(w1,8,7),s(w2,6,8),s(w3,5,9),s(w4,4,9.5)] : [s(w1,8,7),s(w2,6,8),s(w3,5,9)]);
const inclineDB     = (w: number) => ex("incline-dumbbell-press", "Incline Dumbbell Press",   "Chest",      "horizontal_push",  [s(w,10,7),s(w,9,8),s(w,8,8.5)]);
const shoulderPress = (w: number) => ex("shoulder-press",         "Shoulder Press",           "Shoulders",  "vertical_push",    [s(w,8,7),s(w,7,8.5),s(w,6,9)]);
const lateralRaise  = (w: number) => ex("cable-lateral-raise",    "Cable Lateral Raise",      "Shoulders",  "isolation_push",   [s(w,15,7),s(w,14,8),s(w,13,8.5),s(w,12,9)]);
const ropePushdown  = (w: number) => ex("rope-pushdown",          "Rope Pushdown",            "Triceps",    "isolation_push",   [s(w,12,7),s(w,11,8),s(w,10,8.5)]);
const chessDip      = ()          => ex("chest-dip",              "Chest Dip",                "Chest",      "vertical_push",    [s(0,12,7),s(0,10,8),s(0,9,8.5)]);
const flatDB        = (w: number) => ex("flat-dumbbell-press",    "Flat Dumbbell Press",      "Chest",      "horizontal_push",  [s(w,10,7),s(w,9,8),s(w,8,8.5)]);
const pullUp        = (extra = 0) => ex("pull-up",                "Pull-Up",                  "Lats",       "vertical_pull",    [s(extra,8,7),s(extra,7,8),s(extra,6,8.5)]);
const latPulldown   = (w: number) => ex("lat-pulldown",           "Lat Pulldown",             "Lats",       "vertical_pull",    [s(w,10,7),s(w,9,8),s(w,8,8.5)]);
const seatedRow     = (w: number) => ex("seated-cable-row",       "Seated Cable Row",         "Back",       "horizontal_pull",  [s(w,10,7),s(w,9,8),s(w,8,8.5)]);
const chestRow      = (w: number) => ex("chest-supported-row",    "Chest-Supported Row",      "Back",       "horizontal_pull",  [s(w,12,7),s(w,11,8),s(w,10,8.5)]);
const ezCurl        = (w: number) => ex("ez-bar-curl",            "EZ-Bar Curl",              "Biceps",     "isolation_pull",   [s(w,10,7),s(w,9,8),s(w,8,8.5)]);
const squat         = (w: number) => ex("barbell-squat",          "Barbell Squat",            "Quads",      "squat",            [s(w,6,7),s(w,5,8.5),s(w,4,9),s(w,3,9.5)]);
const legPress      = (w: number) => ex("leg-press",              "Leg Press",                "Quads",      "squat",            [s(w,12,7),s(w,11,8),s(w,10,8.5)]);
const rdl           = (w: number) => ex("romanian-deadlift",      "Romanian Deadlift",        "Hamstrings", "hip_hinge",        [s(w,10,7),s(w,9,8),s(w,8,8.5)]);
const hamCurl       = (w: number) => ex("hamstring-curl",         "Hamstring Curl",           "Hamstrings", "isolation_legs",   [s(w,12,7),s(w,11,8),s(w,10,8.5)]);
const hipThrust     = (w: number) => ex("barbell-hip-thrust",     "Barbell Hip Thrust",       "Glutes",     "hip_hinge",        [s(w,10,7),s(w,9,8),s(w,8,8.5)]);
const calfRaise     = (w: number) => ex("standing-calf-raise",    "Standing Calf Raise",      "Calves",     "isolation_legs",   [s(w,15,7),s(w,14,8),s(w,12,8.5)]);
const plankEx       = (secs = 60) => ex("plank",                  "Plank",                    "Core",       "core_anterior",    [s(0,secs,null),s(0,secs,null),s(0,secs,null)]);
const hangingLR     = ()          => ex("hanging-leg-raise",      "Hanging Leg Raise",        "Core",       "core_anterior",    [s(0,12,7),s(0,10,8),s(0,10,8.5)]);
const backExt       = (w: number) => ex("back-extension",         "Back Extension",           "Lower Back", "hip_hinge",        [s(w,12,7),s(w,11,8),s(w,10,8.5)]);

// ─── workout builder ──────────────────────────────────────────────────────────
let _sessionCounter = 0;

function workout(
  date: string,
  sessionName: string,
  baseNote: string,
  exercises: ExData[],
  durationMins = 55,
): SavedWorkoutData {
  const idx = _sessionCounter++;
  const summaries = exercises.map(buildExSummary);
  const totalSets = summaries.reduce((a, e) => a + e.loggedSets, 0);
  const totalVolume = summaries.reduce((a, e) => a + e.loggedVolume, 0);
  const { images, progressPicIndex } = makeImages(idx);

  // Quote: every even-indexed session
  const quoteIdx = Math.floor(idx / 2);
  const quoteNote = idx % 2 === 0 ? QUOTES[quoteIdx % QUOTES.length] : undefined;
  const noteType = quoteNote ? ("quote" as const) : ("personal" as const);

  // Personal note: 2 out of every 3 sessions (skip every 3rd)
  const note = idx % 3 !== 2 ? NOTES[Math.floor(idx * 2 / 3) % NOTES.length] : "";

  const { rewards, rewardSummary } = makeRewards(idx, exercises);

  return {
    savedAt: `${date}T19:00:00.000Z`,
    date,
    sessionName,
    note,
    quoteNote,
    noteType,
    duration: `${String(Math.floor(durationMins / 60)).padStart(2, "0")}:${String(durationMins % 60).padStart(2, "0")}`,
    durationSeconds: durationMins * 60,
    totalVolume,
    totalSets,
    exerciseCount: exercises.length,
    loggedExerciseCount: exercises.length,
    ignoredIncompleteSets: 0,
    exercises: summaries,
    rewards,
    rewardSummary,
    takeawayTitle: "",
    takeawayBody: "",
    images,
    progressPicIndex,
    workoutSource: "quick" as const,
  };
}

// ─── sessions — Jan 18 to Mar 1 (indices 0–29) ───────────────────────────────
const J01 = workout("2026-01-18", "Full Body — Back to it",   "First session after the New Year slump. Felt rusty but good to be back.", [squat(90),  benchPress(67.5,67.5,70), latPulldown(52.5), rdl(75), plankEx(45)], 50);
const J02 = workout("2026-01-19", "Push A",                   "Getting back into chest work. Kept it conservative.", [benchPress(70,70,72.5), inclineDB(22), shoulderPress(42), lateralRaise(10), ropePushdown(28)]);
const J03 = workout("2026-01-21", "Pull A",                   "Rows and pulldowns — good back pump.", [latPulldown(52.5), seatedRow(55), chestRow(18), ezCurl(28), pullUp()], 52);
const J04 = workout("2026-01-22", "Core + Arms",              "", [hangingLR(), ezCurl(28), ropePushdown(28), plankEx(45), backExt(6)], 38);
const J05 = workout("2026-01-23", "Legs A",                   "Squats back to feeling normal. Depth was good.", [squat(95), legPress(140), rdl(80), hamCurl(38), calfRaise(60)], 58);
const J06 = workout("2026-01-24", "Active Recovery",          "", [legPress(110), latPulldown(47.5), backExt(5), plankEx(45)], 35);
const J07 = workout("2026-01-26", "Push B",                   "Chest dips strong. OHP still catching up.", [benchPress(72.5,72.5,75), chessDip(), shoulderPress(44), lateralRaise(10), ropePushdown(29)]);
const J08 = workout("2026-01-28", "Pull B",                   "EZ-bar curls up 2.5 kg vs last week.", [latPulldown(55), seatedRow(57.5), chestRow(20), ezCurl(30), pullUp()], 54);
const J09 = workout("2026-01-30", "Upper A",                  "Solid upper session. Back on track.", [benchPress(72.5,75,75), latPulldown(55), shoulderPress(44), seatedRow(57.5), ezCurl(30)], 56);
const J10 = workout("2026-02-02", "Push A",                   "Bench hit 75 for 8 — felt smooth.", [benchPress(75,75,77.5), inclineDB(24), shoulderPress(46), lateralRaise(11), ropePushdown(30)]);
const J11 = workout("2026-02-03", "Legs A",                   "Squat depth improving. Knees tracking well.", [squat(97.5), legPress(145), rdl(82.5), hamCurl(40), calfRaise(62.5)], 60);
const J12 = workout("2026-02-04", "Pull A",                   "Pulldowns up 5 kg vs January. Lats responding.", [latPulldown(57.5), seatedRow(60), chestRow(22), ezCurl(30), pullUp()], 53);
const J13 = workout("2026-02-05", "Core Focus",               "", [hangingLR(), plankEx(60), backExt(8), calfRaise(60), ezCurl(28)], 40);
const J14 = workout("2026-02-06", "Full Body",                "Late Friday. Got the essentials in.", [squat(95), benchPress(75,75,75), latPulldown(57.5), hipThrust(100), plankEx(60)], 52);
const J15 = workout("2026-02-09", "Push A",                   "Strong chest session. Incline felt great.", [benchPress(75,77.5,77.5), inclineDB(24), shoulderPress(46), lateralRaise(11), ropePushdown(30)]);
const J16 = workout("2026-02-10", "Push B — Volume",          "Extra set on bench. Volume is climbing.", [benchPress(75,77.5,80), chessDip(), flatDB(26), lateralRaise(11), ropePushdown(31)], 58);
const J17 = workout("2026-02-11", "Pull A",                   "PR on seated row. 60 kg × 10, clean reps.", [latPulldown(60), seatedRow(62.5), chestRow(22), ezCurl(32), pullUp()]);
const J18 = workout("2026-02-12", "Legs — Heavy",             "Squats feeling powerful again. Hit 100 for 6.", [squat(100), legPress(150), rdl(85), hamCurl(42), calfRaise(65)], 62);
const J19 = workout("2026-02-13", "Upper B",                  "Hypertrophy focus — short rest, more volume.", [flatDB(26), latPulldown(60), shoulderPress(48), chestRow(22), ezCurl(32), lateralRaise(11)], 60);
const J20 = workout("2026-02-14", "Active Recovery",          "", [legPress(115), latPulldown(50), backExt(8), plankEx(60)], 38);
const J21 = workout("2026-02-16", "Push B",                   "Bench at 77.5 felt light. Moving up next week.", [benchPress(77.5,77.5,80), chessDip(), shoulderPress(48), lateralRaise(12), ropePushdown(32)]);
const J22 = workout("2026-02-18", "Pull B",                   "Weighted pull-ups first time — 5 kg extra.", [latPulldown(62.5), seatedRow(62.5), chestRow(24), ezCurl(34), pullUp(5)], 56);
const J23 = workout("2026-02-19", "Legs — Glute Focus",       "Hip thrust moved to 110. Glutes getting stronger.", [squat(100), hipThrust(110), rdl(87.5), hamCurl(42), calfRaise(67.5)], 60);
const J24 = workout("2026-02-20", "Push A",                   "Shoulder press 50 kg for 7 reps. Good sign.", [benchPress(77.5,80,80), inclineDB(26), shoulderPress(50), lateralRaise(12), ropePushdown(32)], 55);
const J25 = workout("2026-02-23", "Upper A",                  "Bench at 78 kg — nearly at the 80 target.", [benchPress(78,80,80), latPulldown(62.5), shoulderPress(50), seatedRow(62.5), ezCurl(34)]);
const J26 = workout("2026-02-25", "Pull A",                   "Best pull session this month. Lats felt wide.", [latPulldown(62.5), seatedRow(65), chestRow(24), ezCurl(34), pullUp(5)], 55);
const J27 = workout("2026-02-26", "Legs — Heavy",             "Squat 105 kg. Felt strong. PR incoming.", [squat(105), legPress(155), rdl(87.5), hamCurl(43), calfRaise(67.5)], 62);
const J28 = workout("2026-02-27", "Push B",                   "Bench finally hit 80 × 8. Big milestone.", [benchPress(80,80,82.5), chessDip(), shoulderPress(50), lateralRaise(12), ropePushdown(33)], 58);
const J29 = workout("2026-02-28", "Full Body",                "Solid close to February. Volume across the board.", [squat(100), benchPress(78,80,80), latPulldown(62.5), rdl(85), plankEx(60)], 55);
const J30 = workout("2026-03-01", "Active Recovery",          "", [legPress(120), latPulldown(55), backExt(8), plankEx(45)], 38);

// ─── sessions — Mar 2 to Apr 12 (indices 30–59) ──────────────────────────────
const M01 = workout("2026-03-02", "Upper A",                  "Solid upper session to kick the week off.", [benchPress(78,80,82.5), latPulldown(62.5), shoulderPress(48), seatedRow(62.5), ezCurl(32)]);
const W01 = workout("2026-03-04", "Push A",                   "Focused on chest lockout. Every rep deliberate.", [benchPress(80,82.5,85), inclineDB(28), shoulderPress(50), lateralRaise(12), ropePushdown(32)]);
const F01 = workout("2026-03-06", "Legs A",                   "Squats moving well. Hit depth on every rep.", [squat(105), legPress(155), rdl(87.5), hamCurl(42.5), calfRaise(67.5)]);
const Sa01 = workout("2026-03-07", "Legs + Core",             "Saturday grind — quads absolutely fried.", [squat(107.5), legPress(157.5), hipThrust(112.5), hamCurl(43), plankEx(60)]);
const Th01 = workout("2026-03-05", "Pull A",                  "Cable rows heavy — best back pump in a while.", [latPulldown(62.5), seatedRow(62.5), chestRow(22), ezCurl(32), pullUp()]);
const Su01 = workout("2026-03-08", "Active Recovery",         "", [legPress(120), latPulldown(55), backExt(8), plankEx(45)], 40);
const M02 = workout("2026-03-09", "Push A",                   "Shoulder felt tight, scaled OHP slightly.", [benchPress(80,82.5,82.5), inclineDB(26), shoulderPress(48), lateralRaise(12), ropePushdown(32)]);
const T01 = workout("2026-03-10", "Push + Core",              "Chest and abs — classic combo.", [benchPress(80,82.5,82.5), inclineDB(26), shoulderPress(48), ropePushdown(32), hangingLR()]);
const W02 = workout("2026-03-11", "Pull A",                   "Great lat connection on pulldowns.", [latPulldown(65), seatedRow(65), chestRow(24), ezCurl(34), pullUp()]);
const F02 = workout("2026-03-13", "Full Body",                "Quick full-body before the weekend.", [squat(100), benchPress(80,80,80), latPulldown(62.5), hipThrust(110), plankEx(60)], 50);
const M03 = workout("2026-03-16", "Pull A",                   "Focused on mind-muscle with rows.", [latPulldown(65), seatedRow(65), chestRow(24), ezCurl(34), pullUp()]);
const Sa02 = workout("2026-03-21", "Full Body",               "", [squat(90), benchPress(75,75,75), latPulldown(60), hipThrust(100), backExt(10)], 48);
const W03 = workout("2026-03-18", "Legs A",                   "Heavy squat day — new PR attempt. Got close.", [squat(110), legPress(160), rdl(90), hamCurl(45), calfRaise(70)]);
const Th02 = workout("2026-03-19", "Upper B",                 "Upper hypertrophy block — lots of volume.", [flatDB(28), latPulldown(65), shoulderPress(50), chestRow(24), ezCurl(34), lateralRaise(12)]);
const F03 = workout("2026-03-20", "Push A",                   "Incline felt really good today.", [benchPress(82.5,85,85), inclineDB(28), shoulderPress(50), lateralRaise(13), ropePushdown(33)]);
const Su02 = workout("2026-03-22", "Full Body",               "Energised Sunday session. Good vibes throughout.", [squat(100), benchPress(78,80,80), latPulldown(62.5), rdl(85), plankEx(60)], 55);
const Sa03 = workout("2026-03-28", "Legs A",                  "Focused on glute-ham connection.", [rdl(90), hamCurl(45), hipThrust(115), legPress(160), calfRaise(70)]);
const M04 = workout("2026-03-23", "Push B",                   "Felt fresh — hit all sets clean.", [benchPress(82.5,85,85), flatDB(30), shoulderPress(50), lateralRaise(13), ropePushdown(34)]);
const T02 = workout("2026-03-24", "Upper B",                  "Moderate session, kept rest short.", [flatDB(28), latPulldown(65), shoulderPress(50), seatedRow(65), ezCurl(34)]);
const W04 = workout("2026-03-25", "Push B",                   "Chest dips felt stronger than ever.", [benchPress(82.5,85,87.5), chessDip(), shoulderPress(52.5), lateralRaise(13), ropePushdown(34)]);
const Th03 = workout("2026-03-26", "Pull + Core",             "Long session but absolutely worth it.", [latPulldown(67.5), seatedRow(65), chestRow(24), ezCurl(36), hangingLR()]);
const F04 = workout("2026-03-27", "Pull B",                   "Weighted pull-ups — 3 reps at +10 kg!", [latPulldown(67.5), seatedRow(67.5), chestRow(26), ezCurl(36), pullUp(10)]);
const W05 = workout("2026-04-01", "Pull B — Volume Day",      "Best pull session in weeks. Hit every rep.", [latPulldown(67.5), seatedRow(67.5), chestRow(26), ezCurl(36), pullUp(5)], 62);
const Su03 = workout("2026-04-05", "Pull + Core",             "Great mind-muscle connection on rows.", [latPulldown(67.5), seatedRow(67.5), chestRow(26), ezCurl(36), hangingLR()], 50);
const M05 = workout("2026-04-06", "Upper A",                  "Solid upper session after the long weekend.", [benchPress(85,87.5,90), latPulldown(70), shoulderPress(55), seatedRow(70), ezCurl(38)], 58);
const T03 = workout("2026-04-07", "Push A — Intensity",       "Supersets today — crazy pump by the end.", [benchPress(87.5,90,90), inclineDB(30), shoulderPress(55), lateralRaise(14), ropePushdown(35)], 52);
const Th04 = workout("2026-04-09", "Legs + Core",             "Squats and deadlifts same day — brutal.", [squat(112.5), rdl(95), hamCurl(48), calfRaise(72.5), plankEx(60)], 70);
const W06 = workout("2026-04-08", "Legs B + Glutes",          "Hip thrust PR. Glutes absolutely on fire.", [squat(115), hipThrust(120), rdl(92.5), hamCurl(47.5), calfRaise(72.5)], 68);
const F05 = workout("2026-04-10", "Push B — Heavy",           "Bench at 92.5 kg — so close to 95.", [benchPress(90,92.5,92.5,87.5), chessDip(), shoulderPress(57.5), lateralRaise(14), ropePushdown(36)], 65);
const Sa04 = workout("2026-04-11", "Full Body Peak",          "End of week strength test — all PRs hit.", [squat(117.5), benchPress(90,92.5,95), latPulldown(72.5), hipThrust(122.5), plankEx(75)], 72);

export const DEMO_WORKOUTS: SavedWorkoutData[] = [
  J01,J02,J03,J04,J05,J06,J07,J08,J09,J10,
  J11,J12,J13,J14,J15,J16,J17,J18,J19,J20,
  J21,J22,J23,J24,J25,J26,J27,J28,J29,J30,
  M01,Th01,W01,F01,Sa01,Su01,
  M02,T01,W02,F02,
  M03,Sa02,W03,Th02,F03,Su02,
  Sa03,M04,T02,W04,
  Th03,F04,W05,Su03,M05,T03,Th04,W06,F05,Sa04,
].sort((a, b) => a.savedAt.localeCompare(b.savedAt));

export function seedDemoWorkouts(existing: SavedWorkoutData[]): SavedWorkoutData[] {
  const demoDateSet = new Set(DEMO_WORKOUTS.map((w) => w.date));
  const nonDemo = existing.filter((w) => !demoDateSet.has(w.date));
  return [...nonDemo, ...DEMO_WORKOUTS].sort((a, b) => a.savedAt.localeCompare(b.savedAt));
}
