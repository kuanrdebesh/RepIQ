# Smart Exercise Replace

> **Status: Engine fully rewritten (10-tuple lexicographic ranking). UI wired.**
>
> **Entry points:**
> 1. Logger exercise ⋮ menu → "Replace exercise" → opens `AddExercisePage` in replace mode; query cleared, replacement rank hints shown alongside each exercise in "Browse all" view.
> 2. Swap button (⇄ icon) in exercise card header (`exercise-swap-button`) — opens `AddExercisePage` directly with `just_change` reason pre-selected; no reason picker step.
>
> **On selection:** exercise swaps in-place (same position, rest timer preserved, superset group preserved). Sets reset. ReplacementEvent logged.
>
> **Scoring:** 10-tuple lexicographic ranking via `ReplacementRankTuple`. Scores are internal; never shown to users.

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

## Scoring algorithm — 10-tuple lexicographic ranking

The old additive `scoreReplacement()` function has been replaced with a new pure ranking engine.

### ReplacementRankTuple

```typescript
type ReplacementRankTuple = [
  movement,    // 0 — movement pattern match (highest priority)
  muscle,      // 1 — primary muscle match
  angle,       // 2 — angle match
  equipment,   // 3 — equipment match
  reason,      // 4 — reason-tier match (drives equipment/difficulty filter)
  difficulty,  // 5 — difficulty level match vs user profile
  tracking,    // 6 — tracking quality (has history = easier to progress)
  preference,  // 7 — user preference / past selection signals
  fatigue,     // 8 — session fatigue penalty (inverted)
  novelty,     // 9 — variety bonus (not recently logged)
]
```

Candidates are sorted lexicographically: the first differing position wins. Equal tuples are further resolved by `flattenRankTuple` (weighted positional scalar: `value × 10^(n-i)`).

### Tier functions

| Position | Function | Values |
|---|---|---|
| 0 | `computeMovementTier` | 2 = exact match, 1 = same family, 0 = different family |
| 1 | `computeMuscleTier` | 2 = exact primary, 1 = secondary overlaps primary, 0 = no match |
| 2 | `computeAngleTier` | 2 = exact angle, 1 = adjacent angle, 0 = opposite |
| 3 | `computeEquipmentTier` | 2 = same equipment, 1 = similar category, 0 = different |
| 4 | `computeReasonTier` | Varies by reason — see reason table below |
| 5 | `computeDifficultyTier` | 2 = matches user level, 1 = one tier off, 0 = two tiers off |
| 6 | `computeTrackingTier` | 2 = has prior sessions, 1 = new, 0 = none |
| 7 | `computePreferenceTier` | 2 = past pick, 1 = neutral, 0 = previously avoided |
| 8 | `computeFatigueTier` | 2 = fresh muscle, 1 = moderate, 0 = heavily worked |
| 9 | `computeNoveltyTier` | 2 = not in recent sessions, 1 = seen recently, 0 = done today |

### Hard exclusions (before scoring)

- Candidate `id === original.id` (same base exercise)
- Candidate already exists elsewhere in the session
- `reason === "machine_taken"` → all `machine` exerciseType candidates excluded
- `reason === "no_equipment"` → only `bodyweight_only` candidates allowed

### ReplacementReason (updated)

```typescript
type ReplacementReason =
  | "machine_taken"
  | "no_equipment"
  | "too_difficult"
  | "pain_discomfort"
  | "best_match"     // default for ⋮ menu "Replace exercise"
  | "just_change"    // used by swap button shortcut (⇄)
  | "preference";    // legacy alias — normalised to best_match via normalizeReplacementReason()
```

`normalizeReplacementReason("preference")` → `"best_match"` at the storage/logging boundary.

### getSmartReplacements signature (simplified)

```typescript
getSmartReplacements(
  original: ExerciseWithTaxonomy,
  reason: ReplacementReason,
  catalog: ExerciseWithTaxonomy[],
  sessionExercises: ExerciseWithTaxonomy[],
  userProfile: UserPsychProfile | null,
  loggedSets: Map<string, number>
): RankedReplacement[]
```

Removed from previous signature: `preferences`, `hiddenIds`, `recentIds` — all handled internally via `computePreferenceTier`, hard exclusions, and `computeNoveltyTier`.

---

**Final sort:** lexicographic on the 10-tuple, tie-broken by `flattenRankTuple`. Return top 5 (or fewer if hard exclusions reduce the pool).

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

### Entry point 1 — ⋮ menu "Replace exercise"
Logger → exercise card ⋮ menu → **"Replace exercise"** → opens `AddExercisePage` in replace mode.
- `reason` defaults to `best_match`
- Query resets to `""` (empty, not preFilterMuscle) so users see the full catalog with ranked hints
- `smartReplacementMeta` prop passed to `AddExercisePage`; each exercise row shows a rank tier hint chip when in replace mode
- Selection swaps exercise in-place

### Entry point 2 — Swap button (⇄)
Exercise card header now contains an `exercise-swap-button` (⇄ SVG icon, class `exercise-title-actions`).
- Tapping it opens `AddExercisePage` directly with `reason = "just_change"` pre-selected
- No reason picker step — the shortcut skips straight to the browse + pick flow
- CSS: `opacity: 0.55` at rest, `1.0` on hover

### Browse view with smartReplacementMeta
When `AddExercisePage` is in replace mode, each exercise row in "Browse all" shows a replacement rank hint:
- Derived from the 10-tuple for that candidate vs the original exercise
- Shows as a small labeled chip (e.g. "Same pattern", "Same muscle", "Bodyweight alt")
- Chips are informational only — the user still freely selects any exercise

### Contextual hint (planned, not yet built)
If a session has been running for 5+ minutes and an exercise has 0 logged sets while others have progress, a subtle **"Having trouble with this one? →"** hint may appear below the exercise header. Tapping it opens the same flow.

### On swap
- The original exercise is replaced in-place in the session (same position in the list)
- Any sets already logged for the original exercise are cleared with a brief confirmation: *"Clear N sets and replace with [Name]?"* — if sets exist, always confirm. If 0 sets logged, swap silently.
- The replacement reason is logged as a `ReplacementEvent`
- The rest timer carries over from the original exercise

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
  rankTuple: ReplacementRankTuple; // full tuple stored for algorithm tuning
}

type ReplacementReason =
  | "machine_taken"
  | "no_equipment"
  | "too_difficult"
  | "pain_discomfort"
  | "best_match"    // default for ⋮ menu replace
  | "just_change"   // swap button shortcut
  | "preference";   // legacy alias; normalised to best_match before storage
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
- [x] Add `ReplacementRankTuple` type
- [x] Add `best_match` and `just_change` to `ReplacementReason`; add `normalizeReplacementReason()`
- [ ] Populate `movementPattern`, `angle`, `equipment`, `difficultyLevel` on all exercises in `exerciseLibrary`
- [ ] Add `movementPattern` selector to custom exercise creation form

### Logic
- [x] ~~`scoreReplacement()`~~ **replaced** by 10-tuple engine
- [x] `ReplacementRankTuple` — 10-position lexicographic rank type
- [x] `computeMovementTier` / `computeMuscleTier` / `computeAngleTier` / `computeEquipmentTier` / `computeReasonTier` / `computeDifficultyTier` / `computeTrackingTier` / `computePreferenceTier` / `computeFatigueTier` / `computeNoveltyTier`
- [x] `flattenRankTuple()` — weighted positional scalar (`value × 10^(n-i)`) for scalar comparison and sorting
- [x] `getSmartReplacements(original, reason, catalog, sessionExercises, userProfile, loggedSets)` — 6 args; returns top 5
- [x] `getMovementFamily()` — groups patterns into push/pull/legs/core/carry/cardio
- [x] `getEquipmentAccessibility()` — maps exerciseType to needed equipment
- [x] `groupSetsByMovementPattern()` — aggregates session volume for Insights
- [x] `persistReplacementEvent()` / `getStoredReplacementEvents()`

### UI
- [x] Wire "Replace exercise" in ⋮ menu → opens AddExercisePage in replace mode
- [x] Replace mode in AddExercisePage (`replaceMode` prop, `replaceExerciseWithTemplate` function)
- [x] Query resets to `""` in replace mode (not preFilterMuscle)
- [x] `smartReplacementMeta` prop → rank hint chips shown per exercise in browse view
- [x] `exercise-swap-button` (⇄ SVG) in `exercise-title-actions` — opens replace with `just_change` reason
- [~] Swap is silent when 0 sets logged; confirmation shown when sets exist
- [ ] Contextual hint on zero-progress exercises after 5 min

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
