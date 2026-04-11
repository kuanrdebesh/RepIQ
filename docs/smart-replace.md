# Smart Exercise Replace

> **Status: Fully implemented. No dedicated UI.**
>
> **Entry point:** Logger exercise ⋮ menu → "Replace exercise" → opens AddExercisePage pre-filtered to the same primary muscle, in replace mode.
>
> **On selection:** exercise swaps in-place (same position, rest timer preserved, superset group preserved). Sets reset. ReplacementEvent logged.
>
> **Scoring engine + smartReplaceCatalog:** implemented and dormant. Reserved for V2 inline suggestion ("Haven't logged this one — try X?").
>
> **What was deliberately removed:** SmartReplaceSheet (ranked suggestion list). Reason: any single irrelevant suggestion in a ranked list destroys trust in the entire feature. The AddExercisePage pre-filter makes no algorithmic promise — users perceive it as the exercise library filtered to the right muscle, sorted by relevance. No promise = no trust to break.

---

## Problem

Beginners (and intermediate users) get stuck mid-session when:
- A machine is occupied or broken
- They don't have the right weights available
- An exercise is too difficult or causes pain today
- They're training at home instead of the gym

The current options are: skip it, guess, or give up on the session. Smart Replace gives a confident third option: a ranked list of alternatives that preserve the intent of the original exercise and the balance of the session.

---

## What "smart" means

A naive replacement just finds exercises with the same primary muscle. Smart replacement does four things:

1. **Muscle match** — same primary muscle, similar secondary involvement
2. **Movement match** — same movement pattern (push stays push, hinge stays hinge)
3. **Equipment filter** — only suggests exercises the user can actually do right now
4. **Session balance** — aware of what's already been done; won't pile on an already-fatigued muscle group

The user should be able to trust the first suggestion without reading the explanation. The explanation is there to build confidence, not justify a questionable choice.

---

## Data model additions required

The existing `ExerciseDraft` type needs three new structural fields. Together they fully describe any exercise variant without ambiguity.

### The two-layer principle

Users see and log **named exercises** ("Incline Dumbbell Press"). The analytics engine reads **structural metadata** (`horizontal_push · incline · dumbbell`). Both needs are served by the same exercise record — the name is the label, the metadata is the intelligence.

Naming convention: `[Angle if not flat] [Equipment] [Base movement]`

```
Bench Press              → flat    · barbell    · horizontal_push
Incline Dumbbell Press   → incline · dumbbell   · horizontal_push
Push-up                  → flat    · bodyweight · horizontal_push
Overhead Press           → —       · barbell    · vertical_push
Romanian Deadlift        → —       · barbell    · hip_hinge
Bulgarian Split Squat    → —       · bodyweight · lunge
```

### New fields

```typescript
type MovementPattern =
  | "horizontal_push"   // Bench press, push-up, dumbbell press
  | "vertical_push"     // Overhead press, Arnold press, pike push-up
  | "horizontal_pull"   // Row (barbell, dumbbell, cable, machine)
  | "vertical_pull"     // Lat pulldown, pull-up, chin-up
  | "hip_hinge"         // Deadlift, RDL, good morning, hip thrust
  | "squat"             // Back squat, front squat, goblet squat, leg press
  | "lunge"             // Forward/reverse/lateral lunge, split squat, step-up
  | "carry"             // Farmer carry, suitcase carry
  | "core_anterior"     // Plank, ab crunch, leg raise, hollow hold
  | "core_rotational"   // Russian twist, woodchop, cable rotation
  | "isolation_push"    // Tricep pushdown, chest fly, lateral raise
  | "isolation_pull"    // Bicep curl, face pull, rear delt fly
  | "isolation_legs"    // Leg extension, leg curl, calf raise
  | "cardio";           // Jump rope, sled push, rowing machine
```

This field needs to be added to every exercise in `exerciseLibrary` and in the `CustomExercise` creation form (with a sensible default based on `exerciseType`).

**Equipment accessibility from existing `exerciseType`:**

| exerciseType | Equipment required | Can replace with |
|---|---|---|
| `"bodyweight_only"` | None | Any bodyweight exercise |
| `"bodyweight_weighted"` | Vest / belt (optional) | Bodyweight + weighted bodyweight |
| `"free_weights_accessories"` | Dumbbells / kettlebells | DB, KB, bodyweight |
| `"barbell"` | Barbell + rack/bench | Barbell, DB (fallback), bodyweight (last resort) |
| `"machine"` | Gym machine | Machine, cable, DB/KB equivalent, bodyweight |
| `"freestyle_cardio"` | Cardio machine | Other cardio, bodyweight cardio |

---

## Scoring algorithm

For a given exercise being replaced, score every candidate in the library:

```
baseScore = 0

// Muscle match (most important)
if candidate.primaryMuscle === original.primaryMuscle           → +40
if candidate.primaryMuscles overlaps original.primaryMuscles    → +20 per match (max +40)
if candidate.secondaryMuscles overlaps original.primaryMuscle   → +15
if candidate.secondaryMuscles overlaps original.secondaryMuscles → +5 per match (max +20)

// Movement pattern match (preserves session balance)
if candidate.movementPattern === original.movementPattern       → +30
if movementFamily(candidate) === movementFamily(original)       → +15
// movementFamily: push / pull / legs / core / carry / cardio

// Equipment — hard filter first, then soft scoring
if candidate requires equipment user cannot access              → EXCLUDE
if candidate.exerciseType === "bodyweight_only"                 → +5 (always accessible)
if candidate.exerciseType === userPreferredEquipment            → +10

// Session context — penalise if muscle already heavily worked
if candidate.primaryMuscle already has 3+ logged sets in session → -25
if candidate is identical to an exercise already in session     → EXCLUDE

// Difficulty / level
if candidate.experienceLevel matches userPsychProfile.experienceLevel → +10
// (requires experienceLevel on exercises — see below)

// Avoid same exercise
if candidate.id === original.id                                 → EXCLUDE
```

**Final sort:** descending by score. Return top 5.

---

## Movement family groupings

Used for partial movement match scoring:

| Family | Patterns included |
|---|---|
| Push | `horizontal_push`, `vertical_push`, `isolation_push` |
| Pull | `horizontal_pull`, `vertical_pull`, `isolation_pull` |
| Legs | `squat`, `lunge`, `hip_hinge`, `isolation_legs` |
| Core | `core_anterior`, `core_rotational` |
| Carry | `carry` |
| Cardio | `cardio` |

---

## Session context inputs

The replace function needs to know what's already in the session:

```typescript
interface SessionContext {
  // Exercises already in the session (including logged sets)
  sessionExercises: Array<{
    exerciseId: string;
    primaryMuscle: string;
    secondaryMuscles: string[];
    movementPattern: MovementPattern;
    completedSetCount: number;
  }>;

  // User's equipment context (from psychProfile or manual override)
  availableEquipment: CustomExerciseType[];

  // User's experience level
  experienceLevel: ExperienceLevel | null;
}
```

---

## UI flow

### Entry point
Logger → exercise card ⋮ menu → **"Replace exercise"**
(Entry point already exists. Currently: no-op or placeholder. To be wired.)

Also surfaced contextually: if a session has been running for 5+ minutes and an exercise has 0 logged sets while others have progress, a subtle **"Having trouble with this one? →"** hint appears below the exercise header. Tapping it opens the same flow.

### Bottom sheet — Smart Replace

```
┌──────────────────────────────────────────┐
│  Replace: Leg Press                       │
│  ─────────────────────────────────────── │
│  WHY ARE YOU REPLACING IT?               │
│  ○ Machine is taken                       │
│  ○ No equipment available                 │
│  ○ Too difficult today                    │
│  ○ Pain / discomfort                      │
│  ○ Just want a change                     │
│                                           │
│  [Show suggestions →]                     │
└──────────────────────────────────────────┘
```

The "why" question:
- Drives the equipment filter ("machine is taken" → exclude machines; "no equipment" → bodyweight only)
- Seeds the psych data layer (pain/difficulty signals are valuable behavioral data)
- Takes 1 tap, no typing

### Suggestions sheet

```
┌──────────────────────────────────────────┐
│  ← Replacing: Leg Press                  │
│  ─────────────────────────────────────── │
│                                           │
│  ✦ BEST MATCH                            │
│  ┌────────────────────────────────────┐  │
│  │ Goblet Squat                       │  │
│  │ Quads · Dumbbell · Same pattern    │  │
│  │                    [Swap →]        │  │
│  └────────────────────────────────────┘  │
│                                           │
│  Bulgarian Split Squat                   │
│  Quads · Bodyweight · Unilateral         │
│                          [Swap →]        │
│  ─────────────────────────────────────── │
│  Dumbbell Lunge                          │
│  Quads · Dumbbells · Similar pattern     │
│                          [Swap →]        │
│  ─────────────────────────────────────── │
│  Bodyweight Squat                        │
│  Quads · No equipment needed             │
│                          [Swap →]        │
│  ─────────────────────────────────────── │
│                                           │
│  [Browse all exercises →]                │
└──────────────────────────────────────────┘
```

Design rules:
- Maximum 5 suggestions. If there are fewer than 3 good matches (score < 30), show a "no great matches" state and fall back to "Browse all."
- The top suggestion gets a ✦ badge and slightly elevated card treatment — the user should feel confident tapping it without reading.
- Each card shows: name, primary muscle, equipment needed, a 1-line reason ("Same pattern", "Targets same muscle", "Bodyweight alternative")
- No numeric scores shown to the user. Ever.
- "Browse all exercises →" opens the full Add Exercise sheet, pre-filtered to the same primary muscle.

### On swap

- The original exercise is replaced in-place in the session (same position in the list)
- Any sets already logged for the original exercise are cleared with a brief confirmation: *"Clear 0 sets and replace with Goblet Squat?"* — if sets exist, always confirm. If 0 sets logged, swap silently.
- The replacement reason is logged as a `ReplacementEvent` (see data model below)
- The rest timer carries over from the original exercise

---

## Data model — ReplacementEvent

Log every replacement for V2 intelligence (what gets replaced most often, on which days, for which reasons):

```typescript
interface ReplacementEvent {
  schemaVersion: 1;
  sessionId: string;              // = SavedWorkoutData.savedAt
  replacedAt: string;             // ISO timestamp
  originalExerciseId: string;
  replacementExerciseId: string;
  reason: ReplacementReason;
  setsAlreadyLogged: number;      // how far into the exercise before replacing
  matchScore: number;             // score of chosen replacement (for algorithm tuning)
}

type ReplacementReason =
  | "machine_taken"
  | "no_equipment"
  | "too_difficult"
  | "pain_discomfort"
  | "preference";
```

Storage key: `"repiq-replacement-events"` — array, keep last 500.

**V2 uses for this data:**
- If a user replaces the same exercise 3+ times for the same reason → proactively suggest the alternative upfront when the exercise appears in future sessions
- If `"machine_taken"` is common on certain days/times → suggest pre-emptive alternatives on plan load ("This gym tends to be busy at this time — here's an alternative ready if you need it")
- Replacement patterns inform `UserPsychProfile.equipmentAccess` recalibration over time

---

## Exercise difficulty level

Smart Replace should filter by user experience level when the reason is `"too_difficult"`. This requires adding a `difficultyLevel` field to exercises:

```typescript
type ExerciseDifficulty = "beginner" | "intermediate" | "advanced";
```

Add to `ExerciseDraft` as optional: `difficultyLevel?: ExerciseDifficulty`

Default for exercises without this field: `"intermediate"`.

When reason = `"too_difficult"`:
- If user is beginner → filter to `beginner` and `intermediate` exercises only
- If user is intermediate → filter to `beginner` and `intermediate`
- If user is advanced → no filter (they know what they're doing, just need an alternative)

---

## Implementation checklist

### Data model changes
- [x] Add `MovementPattern` type to App.tsx
- [x] Add `ExerciseAngle` type to App.tsx
- [x] Add `ExerciseEquipment` type to App.tsx
- [x] Add `ExerciseDifficulty` type to App.tsx
- [x] Add `ExerciseWithTaxonomy` alias to App.tsx
- [x] Add `ReplacementEvent` type and `repiq-replacement-events` storage key + helpers
- [ ] Populate `movementPattern`, `angle`, `equipment`, `difficultyLevel` on all exercises in `exerciseLibrary` ← **next session**
- [ ] Add `movementPattern` selector to custom exercise creation form

### Logic
- [x] `scoreReplacement()` — three-tier scoring: pattern+angle → muscle → family
- [x] `getSmartReplacements()` — returns top 5 with `matchReason` string
- [x] `getMovementFamily()` — groups patterns into push/pull/legs/core/carry/cardio
- [x] `getEquipmentAccessibility()` — maps exerciseType to needed equipment
- [x] `groupSetsByMovementPattern()` — aggregates session volume for Insights
- [x] `persistReplacementEvent()` / `getStoredReplacementEvents()`

### UI
- [x] Wire "Replace exercise" in ⋮ menu → opens AddExercisePage in replace mode, pre-filtered to primary muscle
- [x] Replace mode in AddExercisePage (preFilterMuscle prop, replaceMode prop, replaceExerciseWithTemplate function)
- [~] Swap is silent (sets are reset without confirmation — acceptable for V1)
- [ ] Contextual hint on zero-progress exercises after 5 min
- [x] Built-in: AddExercisePage IS the replace UI

---

## Planned Exercise Library (~100 exercises)

The full library needed for Smart Replace to work well. Each row needs all taxonomy fields populated. Groups are by movement family.

### Horizontal Push
| Exercise | Angle | Equipment | Difficulty | Primary Muscle |
|---|---|---|---|---|
| Bench Press | flat | barbell | intermediate | Chest |
| Dumbbell Bench Press | flat | dumbbell | beginner | Chest |
| Machine Chest Press | flat | machine | beginner | Chest |
| Cable Chest Press | flat | cable | beginner | Chest |
| Push-up | flat | bodyweight | beginner | Chest |
| Incline Barbell Press | incline | barbell | intermediate | Upper Chest |
| Incline Dumbbell Press | incline | dumbbell | beginner | Upper Chest |
| Incline Machine Press | incline | machine | beginner | Upper Chest |
| Incline Cable Press | incline | cable | beginner | Upper Chest |
| Decline Barbell Press | decline | barbell | intermediate | Lower Chest |
| Decline Dumbbell Press | decline | dumbbell | intermediate | Lower Chest |

### Vertical Push
| Exercise | Angle | Equipment | Difficulty | Primary Muscle |
|---|---|---|---|---|
| Overhead Barbell Press | overhead | barbell | intermediate | Shoulders |
| Dumbbell Shoulder Press | overhead | dumbbell | beginner | Shoulders |
| Machine Shoulder Press | overhead | machine | beginner | Shoulders |
| Arnold Press | overhead | dumbbell | intermediate | Shoulders |
| Landmine Press | overhead | landmine | beginner | Shoulders |

### Horizontal Pull
| Exercise | Angle | Equipment | Difficulty | Primary Muscle |
|---|---|---|---|---|
| Barbell Bent-Over Row | flat | barbell | intermediate | Upper Back |
| Dumbbell Row | flat | dumbbell | beginner | Upper Back |
| Cable Seated Row | flat | cable | beginner | Upper Back |
| Machine Row | flat | machine | beginner | Upper Back |
| Chest-Supported Dumbbell Row | prone | dumbbell | beginner | Upper Back |
| Chest-Supported Machine Row | prone | machine | beginner | Upper Back |
| TRX Row | flat | bodyweight | beginner | Upper Back |
| Pendlay Row | flat | barbell | advanced | Upper Back |

### Vertical Pull
| Exercise | Angle | Equipment | Difficulty | Primary Muscle |
|---|---|---|---|---|
| Lat Pulldown | overhead | cable | beginner | Lats |
| Close-Grip Lat Pulldown | overhead | cable | beginner | Lats |
| Neutral-Grip Pulldown | overhead | cable | beginner | Lats |
| Machine Pulldown | overhead | machine | beginner | Lats |
| Pull-up | overhead | bodyweight | intermediate | Lats |
| Chin-up | overhead | bodyweight | intermediate | Lats |
| Assisted Pull-up | overhead | machine | beginner | Lats |

### Hip Hinge
| Exercise | Angle | Equipment | Difficulty | Primary Muscle |
|---|---|---|---|---|
| Conventional Deadlift | none | barbell | advanced | Hamstrings |
| Romanian Deadlift | none | barbell | intermediate | Hamstrings |
| Dumbbell Romanian Deadlift | none | dumbbell | beginner | Hamstrings |
| Sumo Deadlift | none | barbell | advanced | Hamstrings |
| Single-Leg Romanian Deadlift | none | dumbbell | intermediate | Hamstrings |
| Good Morning | none | barbell | intermediate | Hamstrings |
| Barbell Hip Thrust | none | barbell | intermediate | Glutes |
| Machine Hip Thrust | none | machine | beginner | Glutes |
| Dumbbell Hip Thrust | none | dumbbell | beginner | Glutes |
| Cable Pull-Through | none | cable | beginner | Glutes |

### Squat
| Exercise | Angle | Equipment | Difficulty | Primary Muscle |
|---|---|---|---|---|
| Back Squat | none | barbell | advanced | Quads |
| Front Squat | none | barbell | advanced | Quads |
| Goblet Squat | none | dumbbell | beginner | Quads |
| Leg Press | none | machine | beginner | Quads |
| Hack Squat | none | machine | intermediate | Quads |
| Smith Machine Squat | none | smith_machine | beginner | Quads |
| Bodyweight Squat | none | bodyweight | beginner | Quads |
| Sissy Squat | none | bodyweight | intermediate | Quads |

### Lunge
| Exercise | Angle | Equipment | Difficulty | Primary Muscle |
|---|---|---|---|---|
| Dumbbell Forward Lunge | none | dumbbell | beginner | Quads |
| Dumbbell Reverse Lunge | none | dumbbell | beginner | Quads |
| Barbell Lunge | none | barbell | intermediate | Quads |
| Walking Lunge | none | dumbbell | beginner | Quads |
| Bulgarian Split Squat | none | dumbbell | intermediate | Quads |
| Step-Up | none | dumbbell | beginner | Quads |
| Bodyweight Lunge | none | bodyweight | beginner | Quads |

### Isolation — Push
| Exercise | Angle | Equipment | Difficulty | Primary Muscle |
|---|---|---|---|---|
| Dumbbell Lateral Raise | none | dumbbell | beginner | Shoulders |
| Cable Lateral Raise | none | cable | beginner | Shoulders |
| Machine Lateral Raise | none | machine | beginner | Shoulders |
| Dumbbell Front Raise | none | dumbbell | beginner | Front Delts |
| Dumbbell Chest Fly | flat | dumbbell | beginner | Chest |
| Cable Chest Fly | flat | cable | beginner | Chest |
| Pec Deck | flat | machine | beginner | Chest |
| Incline Dumbbell Fly | incline | dumbbell | beginner | Upper Chest |
| Tricep Pushdown | none | cable | beginner | Triceps |
| Overhead Tricep Extension | none | cable | beginner | Triceps |
| Dumbbell Skull Crusher | flat | dumbbell | intermediate | Triceps |
| Close-Grip Bench Press | flat | barbell | intermediate | Triceps |
| Diamond Push-up | flat | bodyweight | intermediate | Triceps |

### Isolation — Pull
| Exercise | Angle | Equipment | Difficulty | Primary Muscle |
|---|---|---|---|---|
| Barbell Curl | none | barbell | beginner | Biceps |
| Dumbbell Curl | none | dumbbell | beginner | Biceps |
| Cable Curl | none | cable | beginner | Biceps |
| Hammer Curl | none | dumbbell | beginner | Biceps |
| Incline Dumbbell Curl | incline | dumbbell | intermediate | Biceps |
| Concentration Curl | none | dumbbell | beginner | Biceps |
| Machine Curl | none | machine | beginner | Biceps |
| Face Pull | none | cable | beginner | Rear Delts |
| Dumbbell Rear Delt Fly | prone | dumbbell | beginner | Rear Delts |
| Machine Rear Delt Fly | prone | machine | beginner | Rear Delts |
| Barbell Shrug | none | barbell | beginner | Traps |
| Dumbbell Shrug | none | dumbbell | beginner | Traps |

### Isolation — Legs
| Exercise | Angle | Equipment | Difficulty | Primary Muscle |
|---|---|---|---|---|
| Leg Extension | none | machine | beginner | Quads |
| Seated Leg Curl | none | machine | beginner | Hamstrings |
| Lying Leg Curl | prone | machine | beginner | Hamstrings |
| Standing Calf Raise | none | machine | beginner | Calves |
| Seated Calf Raise | none | machine | beginner | Calves |
| Hip Abduction Machine | none | machine | beginner | Glutes |
| Hip Adduction Machine | none | machine | beginner | Inner Thigh |

### Core
| Exercise | Angle | Equipment | Difficulty | Primary Muscle |
|---|---|---|---|---|
| Plank | none | bodyweight | beginner | Core |
| Ab Crunch | none | bodyweight | beginner | Core |
| Hanging Leg Raise | none | bodyweight | intermediate | Core |
| Cable Crunch | none | cable | beginner | Core |
| Ab Wheel Rollout | none | none | advanced | Core |
| Hollow Hold | none | bodyweight | intermediate | Core |
| Russian Twist | none | bodyweight | beginner | Core |
| Woodchop | none | cable | beginner | Core |
| Side Plank | none | bodyweight | beginner | Core |
| Dead Bug | none | bodyweight | beginner | Core |

---

## What makes this genuinely useful for beginners

The feature only works if the suggestions are trustworthy. A beginner who taps "Goblet Squat" instead of "Leg Press" and then wonders if it's the right choice has been failed by the product.

Trust comes from:
1. **The reason picker** — it changes the suggestions. "Machine is taken" gives you the dumbbell version. "Too difficult" gives you the easier version. The user feels heard.
2. **The one-line reason** — "Same quads focus, just dumbbells" is enough. It tells them the substitution is intentional, not random.
3. **Confidence in the top pick** — the ✦ badge and elevated treatment signals *this is the one*. Most beginners will tap it without reading the others. That's the right outcome.
4. **Session balance preserved** — the user doesn't need to know about push/pull ratios. They just need to finish their session feeling like it was complete.

---

## Design principle learned

Ranked suggestions make an explicit promise. One wrong entry breaks trust in everything.

A pre-filtered library makes no promise — the user perceives it as "relevant exercises" and navigates freely. No algorithmic claim = no failure mode.

**V2 rule:** surface at most one inline suggestion with high confidence (based on replacement history + session patterns). Never a ranked list.
