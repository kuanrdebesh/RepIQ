import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  coachingSuggestionSchema,
  type CoachingSuggestion,
  type ExerciseEvaluationRequest,
  type ExerciseHistorySession,
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
  secondaryMuscles: string[];
  howTo: string[];
  videoLabel?: string;
  history: ExerciseHistorySession[];
  draftSets: DraftSet[];
};

type DetailTab = "summary" | "history" | "howto";
type ThemePreference = "light" | "dark" | "system";
type DraftSetType = "warmup" | "normal" | "drop" | "restpause" | "failure";
type AppView = "selector" | "logger";

type WorkoutSettings = {
  defaultRestSeconds: string;
  transitionRestSeconds: string;
  carryForwardDefaults: boolean;
  showRpe: boolean;
  guidanceTopStrip: boolean;
  guidanceInline: boolean;
};

type WorkoutMeta = {
  date: string;
  startTime: string;
  startedMinutesAgo: string;
  sessionName: string;
};

type RewardCategory = "pr" | "volume" | "progress";
type RewardLevel = "set" | "exercise" | "session";
type AddExerciseMode = "browse" | "create";

type LoggerReward = {
  id: string;
  exerciseId: string | null;
  setId: string | null;
  category: RewardCategory;
  level: RewardLevel;
  shortLabel: string;
  detail: string;
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

const commonPrimaryMuscles = [
  "Chest",
  "Upper Chest",
  "Lats",
  "Upper Back",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Front Delts",
  "Side Delts",
  "Rear Delts",
  "Triceps",
  "Biceps",
  "Lower Back",
  "Calves"
];

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

function createTemplateExercise({
  id,
  name,
  restTimer,
  goal = "hypertrophy",
  imageSrc = genericExerciseImage,
  primaryMuscle,
  secondaryMuscles,
  howTo,
  videoLabel,
  historySets
}: {
  id: string;
  name: string;
  restTimer: string;
  goal?: ExerciseEvaluationRequest["goal"];
  imageSrc?: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  howTo: string[];
  videoLabel?: string;
  historySets: WorkoutSet[][];
}): ExerciseDraft {
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
    primaryMuscle,
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
    ]
  };
}

const selectorCategorySamples: ExerciseDraft[] = [
  createTemplateExercise({
    id: "barbell-squat",
    name: "Barbell Squat",
    restTimer: "01:45",
    imageSrc: benchPressImage,
    primaryMuscle: "Quads",
    secondaryMuscles: ["Glutes", "Lower Back"],
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

const seededCustomExercises: ExerciseDraft[] = [
  createTemplateExercise({
    id: "custom-landmine-press",
    name: "Landmine Press",
    restTimer: "01:00",
    imageSrc: genericExerciseImage,
    primaryMuscle: "Shoulders",
    secondaryMuscles: ["Upper Chest", "Triceps"],
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

const exerciseLibrary: ExerciseDraft[] = [
  {
    id: "bench-press",
    name: "Bench Press",
    note: "",
    restTimer: "01:30",
    goal: "hypertrophy",
    imageSrc: benchPressImage,
    primaryMuscle: "Chest",
    secondaryMuscles: ["Front Delts", "Triceps"],
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

const exerciseTemplates: ExerciseDraft[] = [
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
  ...selectorCategorySamples
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
  guidanceTopStrip: true,
  guidanceInline: false
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
  date: new Date().toISOString().slice(0, 10),
  startTime: formatTimeFromDate(new Date(Date.now() - 35 * 60 * 1000)),
  startedMinutesAgo: "35",
  sessionName: "Upper Push"
};

function formatSessionDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short"
  });
}

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
          : defaultWorkoutSettings.guidanceInline
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

function formatPreviousSet(set?: WorkoutSet) {
  if (!set) {
    return "-";
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
    date: start.toISOString().slice(0, 10),
    startTime: formatTimeFromDate(start)
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

function formatElapsedDuration(date: string, time: string) {
  const start = buildDateTime(date, time);
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
  return {
    ...exercise,
    ...overrides,
    stickyNoteEnabled: overrides?.stickyNoteEnabled ?? exercise.stickyNoteEnabled ?? false,
    secondaryMuscles: [...exercise.secondaryMuscles],
    howTo: [...exercise.howTo],
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
  lastSession: ExerciseHistorySession
) {
  const draftType = draftSets[index]?.setType;
  const targetOccurrence = getSetTypeOccurrence(draftSets, index);
  const matchingSets = lastSession.sets.filter(
    (set) => normalizeSetType(set.set_type) === draftType
  );

  return matchingSets[targetOccurrence - 1];
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
  lastSession: ExerciseHistorySession,
  carryForwardDefaults: boolean
) {
  const resolvedSets: WorkoutSet[] = [];
  const issues: string[] = [];

  draftSets.forEach((draftSet, index) => {
    if (!draftSet.done) {
      return;
    }

    const previousSet = getPreviousReferenceSet(draftSets, index, lastSession);
    const weight = parseNumberInput(
      draftSet.weightInput,
      carryForwardDefaults ? previousSet?.weight : null
    );
    const reps = parseNumberInput(
      draftSet.repsInput,
      carryForwardDefaults ? previousSet?.reps : null
    );
    const rpe = parseNumberInput(
      draftSet.rpeInput,
      carryForwardDefaults ? previousSet?.rpe ?? null : null
    );

    if (weight === null || reps === null) {
      issues.push(`Set ${getDisplaySetLabel(draftSets, index)} needs weight and reps.`);
      return;
    }

    resolvedSets.push({
      weight,
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
  lastSession: ExerciseHistorySession,
  carryForwardDefaults: boolean
) {
  const draftSet = draftSets[index];
  const previousSet = getPreviousReferenceSet(draftSets, index, lastSession);
  const weight = parseNumberInput(
    draftSet.weightInput,
    carryForwardDefaults ? previousSet?.weight : null
  );
  const reps = parseNumberInput(
    draftSet.repsInput,
    carryForwardDefaults ? previousSet?.reps : null
  );
  const rpe = parseNumberInput(
    draftSet.rpeInput,
    carryForwardDefaults ? previousSet?.rpe ?? null : null
  );

  if (weight === null || reps === null) {
    return null;
  }

  return {
    weight,
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
        carryForwardDefaults
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

function ExerciseDetailPage({
  exercise,
  activeTab,
  initialScrollTarget,
  onTabChange,
  onBack
}: {
  exercise: ExerciseDraft;
  activeTab: DetailTab;
  initialScrollTarget: "top" | "bottom";
  onTabChange: (tab: DetailTab) => void;
  onBack: () => void;
}) {
  const bottomRef = useRef<HTMLElement | null>(null);
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
        <span className="detail-topbar-spacer" aria-hidden="true" />
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
          <div className="detail-copy">
            <h2>{exercise.name}</h2>
            <p>Primary: {exercise.primaryMuscle}</p>
            <p>Secondary: {exercise.secondaryMuscles.join(", ")}</p>
          </div>

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
                  {session.sets.map((set) => formatPreviousSet(set)).join(" • ")}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === "howto" && (
        <section className="detail-section">
          <div className="detail-hero">
            <img src={exercise.imageSrc} alt={exercise.name} className="detail-image" />
          </div>
          <ol className="instruction-list">
            {exercise.howTo.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {exercise.videoLabel && (
            <a href="#" className="video-link" onClick={(event) => event.preventDefault()}>
              {exercise.videoLabel}
            </a>
          )}
        </section>
      )}

      {activeTab === "summary" && (
        <section ref={bottomRef} className="coach-shell detail-coach">
          <p className="label">What We Can Do Better</p>
          <p className="detail-note">
            This separate page should eventually own movement education, progress charts, PRs,
            alternatives, and technique media so the logger stays fast and uncluttered.
          </p>
        </section>
      )}
    </main>
  );
}

function AddExercisePage({
  templates,
  existingExerciseNames,
  onBack,
  onAddSelected,
  onCreateCustom
}: {
  templates: ExerciseDraft[];
  existingExerciseNames: string[];
  onBack: () => void;
  onAddSelected: (templateIds: string[]) => void;
  onCreateCustom: (draft: {
    name: string;
    primaryMuscle: string;
    secondaryMuscles: string[];
    restTimer: string;
    howTo: string[];
  }) => void;
}) {
  const [mode, setMode] = useState<AddExerciseMode>("browse");
  const [browseTab, setBrowseTab] = useState<"all" | "muscle" | "type">("all");
  const [expandedMuscleKeys, setExpandedMuscleKeys] = useState<string[] | null>(null);
  const [expandedTypeKeys, setExpandedTypeKeys] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<"alphabetical" | "frequency">("alphabetical");
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [showInWorkoutOnly, setShowInWorkoutOnly] = useState(false);
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPrimaryMuscle, setCustomPrimaryMuscle] = useState("");
  const [customSecondaryMuscles, setCustomSecondaryMuscles] = useState("");
  const [customRestTimer, setCustomRestTimer] = useState("01:00");
  const [customHowTo, setCustomHowTo] = useState("");
  const resultsRef = useRef<HTMLDivElement | null>(null);

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

    const name = exercise.name.toLowerCase();
    if (/(run|bike|cycle|walk|elliptical|rower|stair)/.test(name)) {
      return "Cardio";
    }
    if (/(stretch|mobility|yoga)/.test(name)) {
      return "Stretching";
    }
    if (/(push-up|pull-up|chin-up|dip|plank|crunch|sit-up|bodyweight)/.test(name)) {
      return "Bodyweight";
    }
    return "Weighted";
  };

  const filteredTemplates = useMemo(() => {
    const searched = templates.filter((template) => {
      return matchesSearchTokens(query, [
        template.name,
        template.primaryMuscle,
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
      if (sortMode === "frequency") {
        const frequencyDelta = right.history.length - left.history.length;
        if (frequencyDelta !== 0) {
          return frequencyDelta;
        }
      }

      return left.name.localeCompare(right.name);
    });

    return sorted;
  }, [existingExerciseNames, query, selectedTemplateIds, showInWorkoutOnly, showSelectedOnly, sortMode, templates]);

  const groupedByMuscle = useMemo(() => {
    return filteredTemplates.reduce<Record<string, ExerciseDraft[]>>((groups, template) => {
      const key = template.primaryMuscle;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(template);
      return groups;
    }, {});
  }, [filteredTemplates]);

  const muscleGroupKeys = useMemo(
    () => Object.keys(groupedByMuscle).sort((left, right) => left.localeCompare(right)),
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

  useEffect(() => {
    setExpandedMuscleKeys((current) => {
      if (current === null) {
        return [...muscleGroupKeys];
      }

      return current.filter((key) => muscleGroupKeys.includes(key));
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

  const canCreateCustom =
    customName.trim().length > 1 && customPrimaryMuscle.trim().length > 1;

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
      <button
        key={template.id}
        type="button"
        className={`template-card ${selectionIndex >= 0 ? "is-selected" : ""}`}
        title={template.name}
        onClick={() => toggleTemplateSelection(template.id)}
      >
        <img src={template.imageSrc} alt={template.name} className="template-thumb" />
        <div className="template-card-copy">
          <div className="template-card-top">
            <strong>{template.name}</strong>
            <div className="template-card-statuses">
              {alreadyInWorkout && <span className="session-status-pill">In workout</span>}
              {selectionIndex >= 0 && (
                <span className="template-select-badge" aria-label={`Selected ${selectionIndex + 1}`}>
                  ✓ {selectionIndex + 1}
                </span>
              )}
            </div>
          </div>
          <p className="template-card-meta">
            <strong>{template.primaryMuscle}</strong>
            {template.secondaryMuscles.length > 0 ? (
              <>
                {" · "}
                <span>{template.secondaryMuscles.join(", ")}</span>
              </>
            ) : null}
          </p>
        </div>
      </button>
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
          <h1>{mode === "create" ? "Create Exercise" : "Add Exercise"}</h1>
        </div>
        <div className="detail-topbar-actions">
          {mode === "browse" ? (
            <div className="detail-topbar-action-group">
              <button
                className="icon-button add-exercise-header-icon"
                type="button"
                aria-label="Sort and filter"
                title="Sort and filter"
                onClick={() => setFilterOpen(true)}
              >
                ≡
              </button>
            </div>
          ) : (
            <span className="detail-topbar-spacer" aria-hidden="true" />
          )}
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
                      <span className="label">{selectedTemplateIds.length} SELECTED</span>
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
                    <p>Try a broader search or use the + button below to create a custom exercise.</p>
                  </article>
                ) : (
                  <>
                    {browseTab === "all" && (
                      <div className="template-list">{filteredTemplates.map(renderTemplateCard)}</div>
                    )}

                    {browseTab === "muscle" && (
                      <div className="template-group-list">
                        {muscleGroupKeys.map((muscle) => (
                            <section key={muscle} className="template-group-section">
                              <button
                                type="button"
                                className={`template-group-heading template-group-heading-button ${
                                  (expandedMuscleKeys ?? muscleGroupKeys).includes(muscle) ? "is-expanded" : ""
                                }`}
                                onClick={() => toggleMuscleGroup(muscle)}
                              >
                                <strong>{muscle}</strong>
                                <span>{groupedByMuscle[muscle].length}</span>
                                <span className="template-group-chevron" aria-hidden="true">
                                  {(expandedMuscleKeys ?? muscleGroupKeys).includes(muscle) ? "⌃" : "⌄"}
                                </span>
                              </button>
                              {(expandedMuscleKeys ?? muscleGroupKeys).includes(muscle) && (
                                <div className="template-list">
                                  {groupedByMuscle[muscle].map(renderTemplateCard)}
                                </div>
                              )}
                            </section>
                          ))}
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
                    Add Exercise{selectedTemplateIds.length > 1 ? "s" : ""} ({selectedTemplateIds.length})
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
              onClick={() => setMode("create")}
            >
              +
            </button>
          </>
        ) : (
          <div className="custom-exercise-form">
            <p className="settings-note">
              Create a custom exercise once, then reuse it from the library later.
            </p>

            <label className="settings-row">
              <span>Exercise name</span>
              <input
                type="text"
                value={customName}
                placeholder="e.g. Machine Chest Press"
                onChange={(event) => setCustomName(event.target.value)}
              />
            </label>

            <label className="settings-row">
              <span>Primary muscle</span>
              <input
                type="text"
                list="primary-muscle-options"
                value={customPrimaryMuscle}
                placeholder="Choose or type"
                onChange={(event) => setCustomPrimaryMuscle(event.target.value)}
              />
            </label>
            <datalist id="primary-muscle-options">
              {commonPrimaryMuscles.map((muscle) => (
                <option key={muscle} value={muscle} />
              ))}
            </datalist>

            <label className="settings-row">
              <span>Secondary muscles</span>
              <input
                type="text"
                value={customSecondaryMuscles}
                placeholder="Comma separated, e.g. Triceps, Front Delts"
                onChange={(event) => setCustomSecondaryMuscles(event.target.value)}
              />
            </label>

            <label className="settings-row">
              <span>Default rest timer</span>
              <input
                type="text"
                inputMode="numeric"
                value={customRestTimer}
                onChange={(event) =>
                  setCustomRestTimer(formatMinutesSecondsInput(event.target.value))
                }
              />
            </label>

            <label className="settings-stack-row">
              <span>How to perform</span>
              <textarea
                className="notes-textarea"
                rows={5}
                value={customHowTo}
                placeholder={"One cue per line\nSet up position\nControl the lowering phase\nDrive through the target muscle"}
                onChange={(event) => setCustomHowTo(event.target.value)}
              />
            </label>

            <div className="sheet-actions">
              <button className="secondary-button" type="button" onClick={() => setMode("browse")}>
                Back to Library
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={!canCreateCustom}
                onClick={() =>
                  onCreateCustom({
                    name: customName.trim(),
                    primaryMuscle: customPrimaryMuscle.trim(),
                    secondaryMuscles: customSecondaryMuscles
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
                    restTimer: customRestTimer,
                    howTo: customHowTo
                      .split("\n")
                      .map((step) => step.trim())
                      .filter(Boolean)
                  })
                }
              >
                Create and Add
              </button>
            </div>
          </div>
        )}
      </section>

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
                onClick={() => {
                  setSortMode("alphabetical");
                  setFilterOpen(false);
                }}
              >
                Alphabetical {sortMode === "alphabetical" ? "✓" : ""}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSortMode("frequency");
                  setFilterOpen(false);
                }}
              >
                Most Logged {sortMode === "frequency" ? "✓" : ""}
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

export function App() {
  const [appView, setAppView] = useState<AppView>("logger");
  const [hasActiveWorkout, setHasActiveWorkout] = useState(true);
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [themePreference, setThemePreference] = useState<ThemePreference>(getStoredThemePreference);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(getSystemTheme);
  const [exercises, setExercises] = useState<ExerciseDraft[]>(initialWorkoutExercises);
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(initialWorkoutExercises[0].id);
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
  const [guidanceCollapsed, setGuidanceCollapsed] = useState(false);
  const [timingOpen, setTimingOpen] = useState(false);
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const [supersetSheetExerciseId, setSupersetSheetExerciseId] = useState<string | null>(null);
  const [supersetSelectionIds, setSupersetSelectionIds] = useState<string[]>([]);
  const [exerciseRestDefaults, setExerciseRestDefaults] = useState<ExerciseRestDefaults>({});
  const [customExercises, setCustomExercises] = useState<ExerciseDraft[]>(getStoredCustomExercises);
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
  const [inlineGuidanceOpen, setInlineGuidanceOpen] = useState(false);
  const [showTopGuidance, setShowTopGuidance] = useState(false);
  const [topGuidanceExpanded, setTopGuidanceExpanded] = useState(false);
  const [topGuidancePullDistance, setTopGuidancePullDistance] = useState(0);
  const [activeRestTimer, setActiveRestTimer] = useState<ActiveRestTimer>(null);
  const [restDockMinimized, setRestDockMinimized] = useState(false);
  const [loggerRewards, setLoggerRewards] = useState<LoggerReward[]>([]);
  const [rewardSheetOpen, setRewardSheetOpen] = useState(false);
  const titleHoldTimer = useRef<number | null>(null);
  const titleHoldTriggered = useRef(false);
  const pullStartY = useRef<number | null>(null);
  const pullPointerId = useRef<number | null>(null);
  const pullGestureActive = useRef(false);
  const guidancePullStartY = useRef<number | null>(null);
  const guidancePullActive = useRef(false);
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
      : null) ?? exercises[0];
  const activeExerciseIndex = resolvedActiveExerciseId
    ? exercises.findIndex((exercise) => exercise.id === resolvedActiveExerciseId)
    : -1;
  const detailsExercise =
    exercises.find((exercise) => exercise.id === detailsExerciseId) ?? null;
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
  const hasStartedExercise = exercises.some((exercise) => isExerciseStarted(exercise));
  const showTopGuidanceSurface =
    settings.guidanceTopStrip && showTopGuidance && !allExercisesComplete;

  const activeRestSeconds =
    activeRestTimer
      ? activeRestTimer.pausedRemainingSeconds ??
        Math.max(0, Math.ceil(((activeRestTimer.endAt ?? 0) - clockTick) / 1000))
      : 0;
  const stickyRestProgressPercent =
    activeRestTimer && activeRestTimer.totalSeconds > 0
      ? Math.max(0, Math.min(100, (activeRestSeconds / activeRestTimer.totalSeconds) * 100))
      : 0;
  const stickyRestLabel =
    activeRestTimer?.kind === "transition"
      ? activeRestTimer?.pausedRemainingSeconds !== null
        ? "Between exercises paused"
        : "Between exercises"
      : activeRestTimer?.pausedRemainingSeconds !== null
        ? "Rest paused"
        : "Rest timer";
  const showStickyRestDock =
    activeRestTimer !== null && activeRestSeconds > 0;

  const workoutSummary = useMemo(() => {
    return exercises.reduce(
      (summary, exercise) => {
        const lastSession = exercise.history[exercise.history.length - 1];
        const completed = buildCompletedSets(
          exercise.draftSets,
          lastSession,
          settings.carryForwardDefaults
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

  const availableExerciseTemplates = useMemo(
    () => [...exerciseTemplates, ...customExercises],
    [customExercises]
  );

  const derivedDuration = useMemo(
    () => formatElapsedDuration(workoutMeta.date, workoutMeta.startTime),
    [clockTick, workoutMeta.date, workoutMeta.startTime, workoutMeta.startedMinutesAgo]
  );

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
    if (typeof window === "undefined" || !settings.guidanceTopStrip) {
      setShowTopGuidance(false);
      setTopGuidanceExpanded(false);
      setTopGuidancePullDistance(0);
      return undefined;
    }

    const updateTopGuidanceVisibility = () => {
      const topSectionBottom = topSectionRef.current?.getBoundingClientRect().bottom ?? 0;
      setShowTopGuidance(topSectionBottom < 0);
    };

    updateTopGuidanceVisibility();
    window.addEventListener("scroll", updateTopGuidanceVisibility, { passive: true });
    window.addEventListener("resize", updateTopGuidanceVisibility);

    return () => {
      window.removeEventListener("scroll", updateTopGuidanceVisibility);
      window.removeEventListener("resize", updateTopGuidanceVisibility);
    };
  }, [hasGuidance, settings.guidanceTopStrip]);

  useEffect(() => {
    if (!showTopGuidance) {
      setTopGuidanceExpanded(false);
      setTopGuidancePullDistance(0);
    }
  }, [showTopGuidance]);

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
    setMenuExerciseId(null);
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

      return [...current, exerciseId];
    });
    setMenuExerciseId(null);
  }

  function toggleCollapseAllExercises() {
    const allCollapsed = collapsedExerciseIds.length === exercises.length && guidanceCollapsed;
    setCollapsedExerciseIds(allCollapsed ? [] : exercises.map((exercise) => exercise.id));
    setGuidanceCollapsed(!allCollapsed);
    setMenuExerciseId(null);
  }

  function openMusclesPage(exerciseId: string) {
    setMusclesPageMode("exercise");
    setMusclesExerciseId(exerciseId);
    setMenuExerciseId(null);
  }

  function openWorkoutMusclesPage() {
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
      weightInput: String(previousSet.weight),
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

    const previousSet = getPreviousReferenceSet(
      exercise.draftSets,
      setIndex,
      exercise.history[exercise.history.length - 1]
    );
    const draftSet = exercise.draftSets[setIndex];
    const resolvedWeightInput =
      settings.carryForwardDefaults &&
      previousSet &&
      draftSet.weightInput.trim().length === 0
        ? String(previousSet.weight)
        : draftSet.weightInput;
    const resolvedRepsInput =
      settings.carryForwardDefaults &&
      previousSet &&
      draftSet.repsInput.trim().length === 0
        ? String(previousSet.reps)
        : draftSet.repsInput;
    const resolvedRpeInput =
      settings.carryForwardDefaults &&
      previousSet &&
      draftSet.rpeInput.trim().length === 0
        ? typeof previousSet.rpe === "number" && Number.isFinite(previousSet.rpe)
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
    setAppView("selector");
    setWorkoutMenuOpen(false);
    setDiscardConfirmOpen(false);
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
    setSupersetSheetExerciseId(null);
    setSupersetSelectionIds([]);
    setSetTypePickerRowId(null);
    setPullDownDistance(0);
    setAppView("selector");
  }

  function openActiveWorkout() {
    if (!hasActiveWorkout) {
      resetWorkout();
      setHasActiveWorkout(true);
    }
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

  function createCustomExercise(draft: {
    name: string;
    primaryMuscle: string;
    secondaryMuscles: string[];
    restTimer: string;
    howTo: string[];
  }) {
    const normalizedName = draft.name.trim();
    if (!normalizedName) {
      return;
    }

    const customIdBase = normalizedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const customId = `custom-${customIdBase || "exercise"}-${Date.now()}`;
    const restSeconds = Math.max(1, parseMinutesSecondsToSeconds(draft.restTimer));
    const normalizedTemplate: ExerciseDraft = {
      id: customId,
      name: normalizedName,
      note: "",
      stickyNoteEnabled: false,
      restTimer: formatRestTimer(String(restSeconds)),
      goal: "hypertrophy",
      imageSrc: genericExerciseImage,
      primaryMuscle: draft.primaryMuscle.trim(),
      secondaryMuscles: draft.secondaryMuscles,
      howTo:
        draft.howTo.length > 0
          ? draft.howTo
          : [
              "Set up with a controlled starting position before the first rep.",
              "Move through the target muscle with a steady tempo.",
              "Finish the range with control and keep tension on the working muscle."
            ],
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

    const nextExercise = cloneExerciseTemplate(
      normalizedTemplate,
      String(restSeconds),
      `${Date.now()}`
    );
    setExercises((current) => [...current, nextExercise]);
    setUserActiveExerciseId(nextExercise.id);
    setActiveExerciseId(nextExercise.id);
    setCollapsedExerciseIds((current) => current.filter((id) => id !== nextExercise.id));
    setAddExerciseOpen(false);
    setWorkoutMenuOpen(false);
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
        return current;
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
    setTimingOpen(false);
    setLeavePromptOpen(false);
    setSupersetSheetExerciseId(null);
    setSupersetSelectionIds([]);
    setRestTimerEditorExerciseId(null);
    setRestTimerEditorValue("");
    setSaveRestTimerToDefault(false);
    setSetTypePickerRowId(null);
    setRevealedDeleteRowId(null);
    setPullDownDistance(0);
    updateSwipeState(createInitialSwipeState());
    setWorkoutMeta(defaultWorkoutMeta);
    setState(defaultState);
    setShowTopGuidance(false);
    setActiveRestTimer(null);
    setLoggerRewards([]);
    setRewardSheetOpen(false);
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
      settings.carryForwardDefaults
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

  async function finishWorkout() {
    if (incompleteSetCount > 0) {
      setFinishConfirmOpen(true);
      return;
    }

    await performFinishWorkout();
  }

  async function finishWorkoutAnyway() {
    setFinishConfirmOpen(false);
    await performFinishWorkout();
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
        />
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
      </div>
    );
  }

  if (addExerciseOpen) {
    return (
      <div data-theme={resolvedTheme}>
        <AddExercisePage
          templates={availableExerciseTemplates}
          existingExerciseNames={exercises.map((exercise) => exercise.name)}
          onBack={() => setAddExerciseOpen(false)}
          onAddSelected={addExercisesFromTemplates}
          onCreateCustom={createCustomExercise}
        />
      </div>
    );
  }

  if (appView === "selector") {
    return (
      <main className="shell selector-shell" data-theme={resolvedTheme}>
        <section className="app-shell selector-page">
          <header className="selector-header">
            <div>
              <p className="label">Workouts</p>
              <h1>Choose your session</h1>
            </div>
          </header>

          {hasActiveWorkout ? (
            <section className="selector-stack">
              <article className="session-card session-card-active">
                <div className="session-card-top">
                  <div>
                    <p className="label">Active Workout</p>
                    <h2 title={workoutMeta.sessionName}>{workoutMeta.sessionName}</h2>
                  </div>
                  <span className="session-status-pill">In progress</span>
                </div>
                <p className="session-subtitle">
                  {formatSessionDate(workoutMeta.date)} · {derivedDuration} elapsed
                </p>
                <section className="session-summary">
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
                  <button className="secondary-button" type="button" onClick={discardWorkout}>
                    Discard workout
                  </button>
                  <button className="primary-button" type="button" onClick={openActiveWorkout}>
                    Resume workout
                  </button>
                </div>
              </article>

              <article className="session-card session-card-muted">
                <p className="label">Next Rule</p>
                <p className="settings-note">
                  You can&apos;t start another workout until this one is finished or discarded.
                </p>
              </article>
            </section>
          ) : (
            <section className="selector-stack">
              <article className="session-card">
                <div className="session-card-top">
                  <div>
                    <p className="label">No Active Workout</p>
                    <h2>Ready to log</h2>
                  </div>
                </div>
                <p className="settings-note">
                  The full workout plan selector comes next. For now, reopen the sample session to
                  keep testing the logger flow.
                </p>
                <div className="sheet-actions">
                  <button className="primary-button" type="button" onClick={openActiveWorkout}>
                    Open sample workout
                  </button>
                </div>
              </article>
            </section>
          )}
        </section>
      </main>
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
          <section
            className={`guidance-top-helper ${topGuidanceExpanded ? "is-expanded" : ""}`}
            style={{ transform: `translateY(${topGuidancePullDistance}px)` }}
            onPointerDown={beginGuidancePull}
            onPointerMove={moveGuidancePull}
            onPointerUp={endGuidancePull}
            onPointerCancel={endGuidancePull}
          >
            <div className="guidance-top-helper-handle" aria-hidden="true" />
            <button
              className="guidance-top-helper-dismiss"
              type="button"
              aria-label="Disable top helper"
              onClick={() => {
                setSettings((current) => ({
                  ...current,
                  guidanceTopStrip: false
                }));
                setShowTopGuidance(false);
              }}
            >
              ×
            </button>
            <div className="guidance-top-helper-copy">
              <p className="label">Workout Guidance</p>
              <strong>{guidanceTip}</strong>
              <p className="guidance-top-helper-detail">{guidanceWhy}</p>
            </div>
          </section>
        )}

        <div ref={topSectionRef}>
          <header className="topbar">
            <div className="topbar-start">
              <button
                className="back-nav-button"
                type="button"
                onClick={() => setLeavePromptOpen(true)}
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

        <section className="exercise-stack">
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
          {exercises.map((exercise, exerciseIndex) => {
            const lastSession = exercise.history[exercise.history.length - 1];
            const isCollapsed = collapsedExerciseIds.includes(exercise.id);
            const completedExerciseSets = buildCompletedSets(
              exercise.draftSets,
              lastSession,
              settings.carryForwardDefaults
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

            return (
              <article
                key={exercise.id}
                className={`exercise-card ${
                  exercise.id === resolvedActiveExerciseId ? "is-active" : ""
                } ${isComplete ? "is-complete" : ""} ${
                  isComplete && isCollapsed ? "is-complete-collapsed" : ""
                } ${exercise.supersetGroupId ? "has-superset" : ""} ${
                  isCollapsed ? "is-collapsed" : ""
                } ${reorderDragId === exercise.id ? "is-dragging" : ""
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

                {settings.guidanceInline &&
                  !allExercisesComplete &&
                  !isCollapsed &&
                  exerciseIndex === activeExerciseIndex && (
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
                  )}

                <div className={`set-grid-header ${settings.showRpe ? "has-rpe" : "no-rpe"}`}>
                  <span>Set</span>
                  <span>Previous</span>
                  <span>Kg</span>
                  <span>Reps</span>
                  {settings.showRpe && <span>RPE</span>}
                  <span>Done</span>
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
                            {formatPreviousSet(previousSet)}
                          </button>
                          <input
                            className="cell-input"
                            type="text"
                            inputMode="decimal"
                            placeholder={
                              settings.carryForwardDefaults && previousSet
                                ? String(previousSet.weight)
                                : ""
                            }
                            value={draftSet.weightInput}
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
                              settings.carryForwardDefaults && previousSet
                                ? String(previousSet.reps)
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
                                settings.carryForwardDefaults &&
                                previousSet &&
                                typeof previousSet.rpe === "number"
                                  ? String(previousSet.rpe)
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
                            {session.sets.map((set) => formatPreviousSet(set)).join(" • ")}
                          </p>
                        </article>
                      ))}
                  </div>
                </details>
              </article>
            );
          })}
        </section>

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
                    className={`guidance-mode-button ${settings.guidanceTopStrip ? "is-active" : ""}`}
                    type="button"
                    onClick={() => {
                      setSettings((current) => ({
                        ...current,
                        guidanceTopStrip: !current.guidanceTopStrip
                      }));
                      setShowTopGuidance((current) => {
                        if (current) {
                          return false;
                        }
                        return current;
                      });
                    }}
                  >
                    Top Strip
                  </button>
                  <button
                    className={`guidance-mode-button ${settings.guidanceInline ? "is-active" : ""}`}
                    type="button"
                    onClick={() =>
                      setSettings((current) => ({
                        ...current,
                        guidanceInline: !current.guidanceInline
                      }))
                    }
                  >
                    Inline
                  </button>
                </div>
              </div>
            )}

          </section>

        <div className="logger-end-actions">
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
          <button className="primary-button logger-finish-button" type="button" onClick={() => void finishWorkout()}>
            Finish Workout
          </button>
        </div>

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
              <div className="sticky-rest-dock-copy">
                <strong>{stickyRestLabel}</strong>
              </div>
              <div className="sticky-rest-dock-controls">
                <button
                  className="sticky-rest-adjust-button"
                  type="button"
                  onClick={() => adjustActiveRestTimer(-5)}
                  aria-label="Reduce rest timer by 5 seconds"
                >
                  -5
                </button>
                <span className="sticky-rest-dock-time">{formatRemainingSeconds(activeRestSeconds)}</span>
                <button
                  className="sticky-rest-adjust-button"
                  type="button"
                  onClick={() => adjustActiveRestTimer(5)}
                  aria-label="Increase rest timer by 5 seconds"
                >
                  +5
                </button>
                <button
                  className="rest-timer-icon-button"
                  type="button"
                  aria-label={
                    activeRestTimer?.pausedRemainingSeconds !== null
                      ? "Resume rest timer"
                      : "Pause rest timer"
                  }
                  onClick={() => togglePauseRestTimer(activeRestExercise.id)}
                >
                  {activeRestTimer?.pausedRemainingSeconds !== null ? "▶" : "⏸"}
                </button>
                <button
                  className="rest-timer-icon-button rest-timer-stop-button"
                  type="button"
                  aria-label="Skip rest timer"
                  onClick={() => stopRestTimer(activeRestExercise.id)}
                >
                  <span className="rest-timer-stop-glyph" aria-hidden="true">■</span>
                </button>
                <button
                  className="sticky-rest-dock-minimize"
                  type="button"
                  aria-label="Minimize active rest timer"
                  onClick={() => setRestDockMinimized(true)}
                >
                  <span className="sticky-rest-dock-minimize-glyph" aria-hidden="true" />
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

        {finishConfirmOpen && (
          <section className="sheet-overlay leave-center-overlay" onClick={() => setFinishConfirmOpen(false)}>
            <div className="leave-center-card" onClick={(event) => event.stopPropagation()}>
              <div className="sheet-head">
                <div>
                  <p className="label">Finish Workout</p>
                  <h3>Some sets are still incomplete</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setFinishConfirmOpen(false)}>
                  ×
                </button>
              </div>
              <p className="settings-note">
                You still have {incompleteSetCount} incomplete {incompleteSetCount === 1 ? "set" : "sets"} in this
                workout. You can go back and finish them, or finish the workout anyway and ignore the unfinished rows.
              </p>
              <div className="logger-end-actions finish-confirm-actions">
                <div className="logger-end-actions-row finish-confirm-actions-row">
                  <button
                    className="secondary-button logger-action-button logger-add-button"
                    type="button"
                    onClick={() => setFinishConfirmOpen(false)}
                  >
                    Go Back And Finish
                  </button>
                </div>
                <button className="primary-button logger-finish-button" type="button" onClick={() => void finishWorkoutAnyway()}>
                  Finish Anyway
                </button>
              </div>
            </div>
          </section>
        )}

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

        {workoutMenuOpen && (
          <section
            className="sheet-overlay bottom-sheet-overlay"
            onClick={() => setWorkoutMenuOpen(false)}
          >
            <div
              className="sheet-card action-sheet"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sheet-handle" />
              <div className="sheet-head">
                <div>
                  <p className="label">Alter</p>
                  <h3>Workout actions</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setWorkoutMenuOpen(false)}>
                  ×
                </button>
              </div>

              <div className="action-sheet-list">
                <button
                  type="button"
                  onClick={() => {
                    setAddExerciseOpen(true);
                    setWorkoutMenuOpen(false);
                  }}
                >
                  Add exercise
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReorderOpen(true);
                    setWorkoutMenuOpen(false);
                  }}
                >
                  Reorder exercises
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen(true);
                    setWorkoutMenuOpen(false);
                  }}
                >
                  Workout settings
                </button>
                <button type="button" onClick={clearUncheckedSets}>
                  Clear unchecked rows
                </button>
                <button type="button" onClick={resetWorkout}>
                  Reset workout
                </button>
                <button type="button" onClick={requestDiscardWorkout}>
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
              <div className="sheet-head">
                <div>
                  <p className="label">Exercise Actions</p>
                  <h3>{activeMenuExercise.name}</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setMenuExerciseId(null)}>
                  ×
                </button>
              </div>

              <div className="action-sheet-list">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openDetails(activeMenuExercise.id);
                    setMenuExerciseId(null);
                  }}
                >
                  View details
                </button>
                {activeMenuExercise.stickyNoteEnabled ? (
                  <>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openNoteEditor(activeMenuExercise.id);
                      }}
                    >
                      Edit sticky note
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        hideStickyNote(activeMenuExercise.id);
                      }}
                    >
                      Hide sticky note
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      enableStickyNote(activeMenuExercise.id);
                    }}
                  >
                    Enable sticky note
                  </button>
                )}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openMusclesPage(activeMenuExercise.id);
                  }}
                >
                  Muscles worked
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    replaceExercise(activeMenuExercise.id);
                  }}
                >
                  Replace exercise
                </button>
                {activeMenuExercise.supersetGroupId ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeFromSuperset(activeMenuExercise.id);
                    }}
                  >
                    Remove from Superset
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openSupersetSheet(activeMenuExercise.id);
                    }}
                  >
                    Add to Superset
                  </button>
                )}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setInteractedExerciseActive(activeMenuExercise.id);
                    setReorderOpen(true);
                    setMenuExerciseId(null);
                  }}
                >
                  Reorder
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeExercise(activeMenuExercise.id);
                  }}
                >
                  Remove exercise
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

        {inlineGuidanceOpen && (
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
                <button className="icon-button" type="button" onClick={() => setInlineGuidanceOpen(false)}>
                  ×
                </button>
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
            </div>
          </section>
        )}

        {settingsOpen && (
          <section className="sheet-overlay" onClick={() => setSettingsOpen(false)}>
            <div className="sheet-card" onClick={(event) => event.stopPropagation()}>
              <div className="sheet-head">
                <div>
                  <p className="label">Workout Settings</p>
                  <h3>Session-level preferences</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setSettingsOpen(false)}>
                  ×
                </button>
              </div>

              <label className="settings-row">
                <span>Default rest timer for new exercises</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={settings.defaultRestSeconds}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      defaultRestSeconds: sanitizeIntegerInput(event.target.value)
                    }))
                  }
                />
              </label>

              <label className="settings-row">
                <span>Between exercises</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={settings.transitionRestSeconds}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      transitionRestSeconds: sanitizeIntegerInput(event.target.value)
                    }))
                  }
                />
              </label>

              <label className="toggle-row">
                <span>Carry forward previous values</span>
                <input
                  type="checkbox"
                  checked={settings.carryForwardDefaults}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      carryForwardDefaults: event.target.checked
                    }))
                  }
                />
              </label>

              <label className="toggle-row">
                <span>Show RPE column</span>
                <input
                  type="checkbox"
                  checked={settings.showRpe}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      showRpe: event.target.checked
                    }))
                  }
                />
              </label>

              <div className="settings-block">
                <p className="settings-section-title">Guidance Defaults</p>

                <label className="toggle-row">
                  <span>Show top strip guidance</span>
                  <input
                    type="checkbox"
                    checked={settings.guidanceTopStrip}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        guidanceTopStrip: event.target.checked
                      }))
                    }
                  />
                </label>

                <label className="toggle-row">
                  <span>Show inline guidance</span>
                  <input
                    type="checkbox"
                    checked={settings.guidanceInline}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        guidanceInline: event.target.checked
                      }))
                    }
                  />
                </label>

                <p className="settings-note">
                  New workout sessions start with these guidance defaults. You can still turn the
                  top strip and inline guidance on or off from the bottom guidance section while
                  logging.
                </p>
              </div>

              <div className="settings-block">
                <p className="settings-section-title">Appearance</p>
                <div className="theme-choice-group" role="radiogroup" aria-label="Theme preference">
                  {(["light", "dark", "system"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`theme-choice ${
                        themePreference === option ? "is-active" : ""
                      }`}
                      onClick={() => setThemePreference(option)}
                      aria-pressed={themePreference === option}
                    >
                      {option[0].toUpperCase() + option.slice(1)}
                    </button>
                  ))}
                </div>
                <p className="settings-note">
                  This is an app-wide theme setting. Current appearance: {resolvedTheme}.
                </p>
              </div>

              <p className="settings-note">
                New exercises will use the default rest timer. Existing exercises keep their own timer
                for now. The between-exercises timer is used after the final set of an exercise when
                the workout moves on to the next one.
              </p>
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
                        startedMinutesAgo
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
