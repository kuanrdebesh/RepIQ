# Smart Exercise Replace

> **Status: Fully implemented.**
>
> **Entry point:** Logger exercise ⋮ menu → "Replace exercise" → opens `AddExercisePage` in replace mode.
>
> **Reason controls:** reason chips live inline in replace mode — sorting can be refined without a forced extra step.
>
> **Suggestions:** replace mode shows all ranked candidates in "Suggested" tab; "Browse All" gives the full exercise library with muscle/equipment dropdowns.
>
> **On selection:** exercise swaps in-place (same position, rest timer, note, superset group preserved). Sets reset with confirmation if any are already logged. `ReplacementEvent` stored.

---

## Problem

Beginners (and intermediate users) get stuck mid-session when:
- A machine is occupied or broken
- They don't have the right weights available
- An exercise is too difficult or causes pain today
- They're training at home instead of the gym

Smart Replace gives a confident third option: a ranked list of alternatives that preserve the intent of the original exercise and the balance of the session.

---

## UI Structure

### Tabs

| Tab | What it shows |
|-----|---------------|
| **Suggested** | Only exercises that passed all hard exclusions, scored and ranked by the algorithm, diversified by equipment |
| **Browse All** | Full exercise library, alphabetical, with optional Muscle and Equipment dropdowns |

### Sections within Suggested

1. **Last replaced with (up to 5)** — shown only if the user has prior replacement history for this exact exercise; collapsed by default if present
2. **Possible replacements** — all ranked candidates in order

### Reason chips (inline, Suggested tab)

| Chip | Normalised value | Effect |
|------|-----------------|--------|
| Best match | `best_match` | Default; no extra exclusions |
| Machine taken | `machine_taken` | Hard-excludes machine + smith_machine candidates |
| No equipment | `no_equipment` | Hard-excludes everything except bodyweight/cardio |
| Too difficult | `too_difficult` | Hard-excludes candidates harder than original (non-advanced users) |
| Pain / discomfort | `pain_discomfort` | Deprioritises harder/higher-stress options via difficultyFit |
| Just a change | `just_change` | Default scoring, adjusts match reason label only |

Default chip: **Best match** when opened from ⋮ menu; **Just a change** when opened from the swap icon.

### Equipment unavailable chip

A toggle chip above the Suggested results. When active, removes all exercises with the same equipment as the original from the Suggested list (e.g. replacing a barbell exercise — toggle hides all other barbell options).

---

## Scoring algorithm

### Hard exclusions (applied before scoring)

Candidate is excluded if any of the following are true:

1. Same base exercise ID as the original
2. Already present in the current session
3. Requires equipment not in the user's `EquipmentAccess` level
4. Reason is `machine_taken` → candidate is `machine` or `smith_machine`
5. Reason is `no_equipment` → candidate is not `bodyweight` or `cardio`
6. Reason is `too_difficult` → candidate difficulty rank > original difficulty rank (unless user is advanced)
7. **No shared muscle** — candidate's full muscle set `{primary ∪ secondary}` has zero overlap with original's full muscle set `{primary ∪ secondary}`

### Scoring dimensions (each normalised 0–1)

| Dimension | Weight | Notes |
|-----------|--------|-------|
| `movementMatch` | 30 | 1.0 = same pattern, 0.5 = same family, 0.0 = unrelated |
| `muscleMatch` | 24 | 1.0 = same primary + secondary overlap, 0.8 = same primary only, 0.5 = cand secondary hits orig primary, 0.0 = weak |
| `equipmentMatch` | 12 | 1.0 = same class, 0.6 = close family, 0.3 = both gym, 0.0 = gym vs bodyweight |
| `fatigueFit` | 10 | 1.0 = ≤2 completed sets on muscle, 0.5 = 3–5 sets, 0.0 = 6+ sets |
| `difficultyFit` | 10 | 1.0 = same level, 0.7 = one easier, 0.4 = one harder, 0.0 = two levels off |
| `unilateralFit` | 10 | 1.0 = same laterality, 0.0 = mismatch; inferred from name when `movementSide` not set |
| `angleMatch` | 8 | 1.0 = same angle, 0.5 = nearby (flat↔incline, flat↔decline, etc.), 0.0 = different |
| `roleMatch` | 6 | 1.0 = same compound/isolation role, 0.5 = mismatch |
| `trackingFit` | 5 | 1.0 = same measurement type, 0.5 = both weight-based, 0.0 = incompatible |
| `preferenceFit` | 4 | 1.0 = chosen 3+ times before, 0.5 = chosen 1–2 times, 0.0 = no history |

**Max raw score: 119 pts**

```
baseScore =
  30 * movementMatch +
  24 * muscleMatch +
  12 * equipmentMatch +
  10 * fatigueFit +
  10 * difficultyFit +
  10 * unilateralFit +
   8 * angleMatch +
   6 * roleMatch +
   5 * trackingFit +
   4 * preferenceFit
```

### Dimension detail

#### movementMatch
```
scoreMovementMatch(original, candidate):
  same movementPattern            → 1.0
  same movement family            → 0.5
  unrelated                       → 0.0
```

Movement families:
| Family | Patterns |
|--------|----------|
| push | `horizontal_push`, `vertical_push`, `isolation_push` |
| pull | `horizontal_pull`, `vertical_pull`, `isolation_pull` |
| legs | `squat`, `lunge`, `hip_hinge`, `isolation_legs` |
| core | `core_anterior`, `core_rotational` |
| carry | `carry` |
| cardio | everything else |

#### muscleMatch
```
scoreMuscleMatch(original, candidate):
  candPrimary overlaps origPrimary AND candSecondary overlaps origSecondary → 1.0
  candPrimary overlaps origPrimary only                                     → 0.8
  candSecondary overlaps origPrimary                                        → 0.5
  no overlap with origPrimary                                               → 0.0
```

#### equipmentMatch

Equipment classes: `barbell`, `dumbbell`, `cable`, `machine`, `bodyweight`, `kettlebell`, `resistance_band`, `landmine`, `smith_machine`, `trx`, `cardio`

Close families (score 0.6):
- `barbell` ↔ `smith_machine`
- `barbell` ↔ `dumbbell`
- `cable` ↔ `machine`
- `dumbbell` ↔ `kettlebell`

Both in gym set (`barbell`, `dumbbell`, `cable`, `machine`, `kettlebell`, `landmine`, `smith_machine`) but not a close family → 0.3

Gym vs bodyweight (or other) → 0.0

TRX is detected via `exercise.implement === "suspension_trainer"`, not `equipment` field.

#### unilateralFit
```
inferMovementSide(exercise):
  use exercise.movementSide if set
  else: check name for "single-arm", "single-leg", "one-arm", "one-leg", "unilateral"
  default: "bilateral"

scoreUnilateralBilateralFit:
  same laterality → 1.0
  mismatch        → 0.0  (hard penalty — bilateral prefers bilateral)
```

#### fatigueFit
Counts completed sets in the current session for exercises sharing any primary muscle with the candidate:
- ≤ 2 sets → 1.0
- 3–5 sets → 0.5
- 6+ sets  → 0.0

#### difficultyFit
```
diff = candidate_rank - original_rank  (beginner=1, intermediate=2, advanced=3)
  0  → 1.0   (same level)
 -1  → 0.7   (one easier)
 +1  → 0.4   (one harder)
other → 0.0
```

#### preferenceFit
Counts past `ReplacementEvent` entries where `originalExerciseId` matches and `replacementExerciseId` matches (both compared as base IDs, stripping timestamp suffixes):
- ≥ 3 prior uses → 1.0
- 1–2 prior uses → 0.5
- 0              → 0.0

### Post-sort diversity pass

After scoring and sorting, `diversifyByEquipment()` caps each equipment type at **2 representatives** before appending the rest. This ensures the top visible results span multiple equipment classes rather than being dominated by same-equipment variations.

```
diversifyByEquipment(sorted, maxPerEquipment = 2):
  walk sorted list in order
  if equipment type count < 2 → add to selected
  else → defer to overflow
  return [...selected, ...overflow]
```

---

## Equipment access levels

| Access level | Available equipment classes |
|---|---|
| `bodyweight` | bodyweight, cardio |
| `dumbbell_pair` | bodyweight, dumbbell, cardio |
| `home_setup` | bodyweight, dumbbell, barbell, resistance_band, trx, cardio |
| `basic_gym` / `full_gym` | bodyweight, dumbbell, barbell, cable, machine, resistance_band, trx, kettlebell, landmine, smith_machine, cardio |

---

## Replacement history & learned preference

### ReplacementEvent

```typescript
interface ReplacementEvent {
  schemaVersion: 1;
  sessionId: string;              // = SavedWorkoutData.savedAt
  replacedAt: string;             // ISO timestamp
  originalExerciseId: string;     // base ID (no timestamp suffix)
  replacementExerciseId: string;  // base ID
  reason: ReplacementReason;
  setsAlreadyLogged: number;
  matchScore: number;
}
```

Storage key: `"repiq-replacement-events"` — array, keep last 500.

### ID normalisation

Session exercise IDs may carry timestamp suffixes (e.g. `bench-press-1748123456789-1`). The engine strips these via:

```ts
getBaseExerciseId(id) → id.replace(/-\d{8,}-\d+$/, "")
```

All history lookups and session-duplicate checks use base IDs.

### Last replaced with section

On entering replace mode, the engine reads the replacement history filtered to `originalExerciseId === replaceTargetBaseId`, deduplicates, sorts by `replacedAt` descending, and returns up to 5 unique replacement IDs. These are resolved to exercise templates and shown in the "Last replaced with" section above the main suggestions.

---

## On-swap execution

1. Replace exercise in-place — position, rest timer, note, superset group preserved
2. If logged sets > 0 → show confirmation before clearing sets
3. If 0 logged sets → swap silently
4. Store `ReplacementEvent` with base IDs, reason, score, and timestamp

---

## Implementation checklist

### Data model
- [x] `MovementPattern`, `ExerciseAngle`, `ExerciseEquipment`, `ExerciseDifficulty` types
- [x] `ExerciseWithTaxonomy` — full taxonomy fields on every exercise
- [x] `ReplacementEvent` type + `repiq-replacement-events` localStorage key
- [x] `getStoredReplacementEvents()` / `persistReplacementEvent()`
- [x] `PerformanceMetric`, `ExerciseImplement` types (v2 schema)

### Engine (`App.tsx`)
- [x] `getMovementFamily()` — push / pull / legs / core / carry / cardio
- [x] `getReplacementEquipmentClass()` — maps exercise to equipment class (TRX via implement)
- [x] `getBaseExerciseId()` — strips timestamp suffix
- [x] `scoreMovementMatch()`, `scoreMuscleMatch()`, `scoreFatigueFit()`, `scoreDifficultyFit()`
- [x] `scoreAngleMatch()`, `scoreRoleMatch()`, `scoreTrackingFit()`, `scorePreferenceFit()`
- [x] `inferMovementSide()` — infers laterality from name when `movementSide` unset
- [x] `scoreUnilateralBilateralFit()` — bilateral prefers bilateral, 0 on mismatch
- [x] `scoreEquipmentMatch()` — same/close family/gym tier/zero
- [x] `rankCandidate()` — all hard exclusions + weighted base score
- [x] `diversifyByEquipment()` — post-sort cap of 2 per equipment type
- [x] `getSmartReplacements()` — main entry point

### UI (`AddExercisePage`)
- [x] Suggested / Browse All toggle
- [x] Reason chips inline (Best match, Machine taken, No equipment, Too difficult, Pain / discomfort, Just a change)
- [x] Equipment unavailable chip (filters same-equipment from Suggested)
- [x] Last replaced with section (collapsed if present; hidden if no history)
- [x] Suggested tab: candidates only, ranked; Browse All tab: full library, alphabetical
- [x] Swap: silent if 0 sets, confirmation if sets exist
- [x] `ReplacementEvent` logged on swap

---

## Design principles

- No overconfident labels — avoid "Best replacement", "Perfect swap", "Smart match"
- Allowed: "Same movement, same angle", "Possible replacements", "Last replaced with"
- No numeric scores shown to the user
- `diversifyByEquipment` ensures variety without forcing it — the same-equipment deferred candidates are still reachable by scrolling
- Browse All makes no algorithmic promise — full library, user navigates freely
