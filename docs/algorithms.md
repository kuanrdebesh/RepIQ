# RepIQ Algorithms Reference

This document lists the algorithms that are actually implemented today across the web app, API, and engine. It is intentionally practical: the goal is to describe what the current code does, not what we might want later.

Update this file whenever an implemented decision rule, scoring rule, matching rule, or progression rule changes.

## Scope

Implemented algorithm surfaces currently exist in:

- `apps/web/src/App.tsx`
- `apps/api/src/index.ts`
- `apps/engine/app/*.py`

---

## 1. Logger Search And Selection Algorithms

### 1.1 Add Exercise Search Normalization

Implemented in:
- `apps/web/src/App.tsx`

Functions:
- `normalizeSearchText`
- `matchesSearchTokens`

Current behavior:

1. Convert the query to lowercase.
2. Remove special characters and numbers.
3. Collapse repeated whitespace.
4. Split the query into word tokens by spaces.
5. Build a normalized search haystack from:
   - exercise name
   - primary muscle
   - secondary muscles
   - goal
   - derived exercise type
6. Match succeeds only if every query token appears somewhere in the haystack.

Implications:

- order does not matter
- words do not have to be contiguous
- numbers and symbols are ignored
- matching is case-insensitive
- search is local/in-memory, not fuzzy or typo-tolerant

Example:

- query: `incline chest`
- matches:
  - `Incline Dumbbell Press`
  - `Upper Chest`
- also matches if typed as `chest incline`

### 1.2 Add Exercise Sorting

Implemented in:
- `apps/web/src/App.tsx`

Current sort modes:

- `alphabetical`
- `frequency`
- `library`

Behavior:

- each sort mode has a direction state:
  - `asc`
  - `desc`
- selecting a different sort mode resets direction:
  - `alphabetical` -> ascending by default
  - `library` -> ascending by default
  - `frequency` -> descending by default
- tapping the same sort mode again reverses the direction
- `alphabetical` sorts by exercise name in current direction
- `frequency` sorts by `history.length` in current direction, then alphabetical in current direction as tie-break
- `library` sorts by original library insertion order in current direction

`frequency` is currently still a proxy for “most logged,” not a full log-count calculation.

### 1.3 Add Exercise Grouping

Implemented in:
- `apps/web/src/App.tsx`

Current groupings:

- `All Exercises`: flat list
- `By Muscle`: grouped by `primaryMuscle`
- `Types`: grouped by derived exercise type

Type derivation currently uses simple rules:

- custom exercise id prefix -> `Added by me`
- explicit custom/body metadata can override keyword inference
- `bodyweight_weighted` -> `Weighted Bodyweight`
- run/bike/cycle/etc -> `Cardio`
- stretch/mobility/yoga -> `Stretching`
- push-up/pull-up/bodyweight keywords -> `Bodyweight`
- fallback -> `Weighted`

### 1.4 Add Exercise Group Expand/Collapse

Implemented in:
- `apps/web/src/App.tsx`

Algorithms:

- `toggleMuscleGroup`
- `toggleAllMuscleGroups`
- `toggleTypeGroup`
- `toggleAllTypeGroups`

Behavior:

- `By Muscle` and `Types` both support:
  - per-group expand/collapse
  - expand all / collapse all
- muscle groups initialize expanded from current available keys
- when filtered results change, expanded muscle groups are trimmed to still-valid keys

### 1.5 Multi-Select Order

Implemented in:
- `apps/web/src/App.tsx`

Behavior:

1. Selected exercise ids are stored in an ordered array.
2. Selection badge number = index in that array + 1.
3. Added exercises are inserted in the exact order selected.

This is not just “selected or not”; order is preserved intentionally.

### 1.6 Selector Details Access

Implemented in:
- `apps/web/src/App.tsx`

Behavior:

1. Template rows are split into two actions:
   - main row button -> select / unselect
   - dedicated `i` button -> open details
2. Detail resolution checks:
   - current workout exercises
   - custom library exercises
   - available exercise templates
3. This allows library inspection without breaking ordered selection.

### 1.7 Custom Exercise Create/Edit Flow

Implemented in:
- `apps/web/src/App.tsx`

Behavior:

1. The create flow is split into 2 steps:
   - step 1: name, image, primary muscles, secondary muscles
   - step 2: type, measurement, movement side
2. Progress chips at the top act as a lightweight section guide.
3. After the first primary muscle is chosen:
   - the secondary-muscle selector auto-opens
   - the form highlights that secondary can be added next
4. The same form is reused for edit mode by preloading the existing custom exercise draft.

### 1.8 Custom Exercise Naming And Library Management

Implemented in:
- `apps/web/src/App.tsx`

Functions:
- `ensureUniqueExerciseName`
- `createCustomExercise`
- `updateCustomExercise`
- `archiveCustomExercise`
- `deleteCustomExercise`
- `importCustomExercises`

Behavior:

1. Direct create/edit:
   - if the requested name already exists, the UI prompts the user to:
     - rename it
     - or save as the suggested suffixed name
2. Suggested duplicate suffixes follow:
   - `_1`
   - `_2`
   - `_3`
   - and so on
3. Edit mode excludes the exercise’s current own name from duplicate matching.
4. Delete/archive rule:
   - if custom exercise has no history -> full delete from library
   - if custom exercise has history -> archive/hide from library instead
5. Archived custom exercises are filtered out of the selector, but remain stored.
6. Import path reuses the same unique-name helper automatically, so imported duplicates are suffixed without changing the naming convention.

### 1.9 Planner Tag Filtering

Implemented in:
- `apps/web/src/App.tsx`

Function/component:
- `PlanTagPicker`

Behavior:

1. Build the unique tag set from saved plans plus currently selected tags.
2. Order visible chips as:
   - selected tags first
   - remaining tags alphabetically
3. If search text exists:
   - filter the visible chip list only
4. If the typed text is not an existing tag:
   - expose `+ New <name>`
5. `My Workouts` list filtering uses inclusive matching:
   - if no tag filter exists -> show all plans
   - else show plans whose `userTags` contain at least one selected tag

---

## 2. Exercise History Algorithms

### 2.1 Template History Seeding

Implemented in:
- `apps/web/src/App.tsx`

Function:
- `createTemplateExercise`

Behavior:

- if `historySets.length >= 3`, use it directly
- if history is shorter than 3:
  - derive an extra older session from the earliest known session
  - reduce weight by about 10%
  - reduce reps by 1, but not below 1
  - reduce RPE by 0.5, but not below 5

This was created to keep logger history cards useful even for short seed data.

### 2.2 Central History Normalization

Implemented in:
- `apps/web/src/App.tsx`

Functions:
- `shiftIsoDateByDays`
- `createDerivedHistorySession`
- `normalizeExerciseHistory`

Behavior:

1. Clone the existing history defensively.
2. If there are 0 sessions or already 3+ sessions:
   - return cloned history as-is.
3. If there are 1-2 sessions:
   - repeatedly derive an earlier session from the current earliest session
   - move the date back by 7 days
   - reduce weight by 10%
   - reduce reps by 1, minimum 1
   - reduce RPE by 0.5, minimum 5
4. Return a normalized 3-session history.

This normalization is applied in:

- `cloneExerciseTemplate`
- `cloneExerciseDraft`

Result:

- logger history cards consistently have up to 3 sessions when history exists and can be derived

### 2.3 Logger History Rendering

Implemented in:
- `apps/web/src/App.tsx`

Behavior:

- exercise history is reversed
- only the latest 3 sessions are shown

So the UI rule is:

- “last 3 sessions if available”

### 2.4 Custom Exercise History Sync On Workout Save

Implemented in:
- `apps/web/src/App.tsx`

Behavior:

1. On workout save, scan the current workout exercises.
2. For each exercise, try to match it back to a custom library template by:
   - exact template id
   - or cloned workout id prefix `${template.id}-...`
3. Build completed sets from the final draft rows using the exercise measurement mode.
4. If a custom exercise has at least one completed set:
   - append a new history session to the custom library record
5. Persist the updated custom library back to local storage.

Implication:

- custom exercises can later be archived instead of deleted once they have real usage history

---

## 3. Set Resolution And Carry-Forward Algorithms

### 3.1 Previous Reference Set Matching

Implemented in:
- `apps/web/src/App.tsx`

Functions:
- `normalizeSetType`
- `getSetTypeOccurrence`
- `getPreviousReferenceSet`

Behavior:

1. Determine the current draft row’s normalized set type.
2. Count which occurrence of that type this row is in the current draft list.
3. In the previous session, filter historical sets to the same normalized type.
4. Return the matching occurrence.

This means:

- warmup rows look back to warmup rows
- normal rows look back to normal rows
- set matching is not just by row index

### 3.2 Input Sanitization

Implemented in:
- `apps/web/src/App.tsx`

Functions:
- `sanitizeDecimalInput`
- `sanitizeIntegerInput`

Behavior:

- weight keeps digits plus one decimal point
- reps keeps only digits

### 3.3 Numeric Resolution With Fallback

Implemented in:
- `apps/web/src/App.tsx`

Function:
- `parseNumberInput`

Behavior:

- parse the current input
- if invalid/blank, optionally fall back to provided value
- otherwise return `null`

This is used by:

- set completion
- session completion

### 3.4 Completed Set Construction

Implemented in:
- `apps/web/src/App.tsx`

Function:
- `buildCompletedSets`

Behavior:

For each draft set:

1. Ignore the row unless `done === true`.
2. Find the matching previous reference set.
3. Resolve weight, reps, and RPE using:
   - current input
   - or carry-forward defaults if enabled
4. If weight or reps are still missing:
   - append an issue
   - do not emit that set
5. Otherwise emit a normalized `WorkoutSet`.

Output:

- `resolvedSets`
- `issues`

This is one of the most important algorithms in the app because it determines what becomes real logged data.

### 3.5 Single-Row Resolution

Implemented in:
- `apps/web/src/App.tsx`

Function:
- `resolveDraftSet`

Same idea as `buildCompletedSets`, but only for one row.

Used in reward recomputation.

### 3.6 Current-Exercise Carry-Forward Placeholders

Implemented in:
- `apps/web/src/App.tsx`

Function:
- `getCurrentExerciseCarrySource`

Behavior:

1. Look backward only within the current exercise.
2. Find the nearest earlier set that has entered or completed values.
3. Use those values as placeholders for the next set.
4. Do not hard-fill them into the next inputs immediately.

This keeps the next row visually blank while still suggesting the likely working values from the same exercise flow.

---

## 4. Completion, Active Exercise, And Timer Algorithms

### 4.1 Exercise Completion Rule

Implemented in:
- `apps/web/src/App.tsx`

Function:
- `isExerciseComplete`

Current product rule:

- an exercise is complete when its last draft set is marked done

This is intentionally different from:

- “all sets are done”

That distinction drives:

- active exercise
- between-exercise timer handoff
- end-of-workout logic

### 4.2 Started / In-Progress Rules

Implemented in:
- `apps/web/src/App.tsx`

Functions:
- `isExerciseStarted`
- `isExerciseInProgress`

Behavior:

- started = any set is done
- in progress = started and not complete by last-set rule

### 4.3 Active Exercise Default Resolver

Implemented in:
- `apps/web/src/App.tsx`

Functions:
- `getFirstIncompleteExerciseId`
- `getFirstNotStartedExerciseId`
- `getDefaultActiveExerciseId`

Current rule:

1. Find the first exercise whose last set is not done.
2. If none exists:
   - return `null`
3. If the first incomplete exercise has already started:
   - make that active
4. Otherwise:
   - use the first not-started incomplete exercise
   - else the first incomplete exercise

Effect:

- active follows the first unresolved exercise in list order
- once everything is complete by the last-set rule, there is no active exercise

### 4.4 User-Driven Active Override

Implemented in:
- `apps/web/src/App.tsx`

Functions:
- `setInteractedExerciseActive`
- `setPreStartExerciseActive`

Behavior:

- before workout start:
  - interaction, including expand/collapse, can choose the active exercise
- after a workout has an in-progress exercise:
  - casual interaction elsewhere should not steal active focus
- completing a set in another exercise can move active focus there

### 4.5 Marking A Set Done

Implemented in:
- `apps/web/src/App.tsx`

Function:
- `markSetDone`

Current algorithm:

1. Resolve carry-forward values if inputs are blank.
2. Write those resolved values into the row.
3. Mark the set as done.
4. Check whether the clicked row is the actual last set row in that exercise.

Branch A: non-last set completed

- active stays on this exercise
- user-active override stays on this exercise
- normal rest timer starts for this exercise

Branch B: actual last set row completed

- this counts as an exercise-boundary completion event
- clear user-active override
- find first exercise in the list whose last set is not done
- if found:
  - make it active
  - start `Between exercises` timer
- if not found:
  - no active exercise
  - no timer

Important detail:

- only clicking the actual last set row counts as the exercise boundary
- completing some earlier row later does not trigger between-exercise logic

### 4.6 Marking A Set Undone

Implemented in:
- `apps/web/src/App.tsx`

Function:
- `markSetUndone`

Behavior:

- mark row undone
- make that exercise user-active
- uncollapse that exercise
- stop rest timer for that exercise

### 4.7 Rest Timer Start / Pause / Stop

Implemented in:
- `apps/web/src/App.tsx`

Functions:
- `startRestTimer`
- `stopRestTimer`
- `togglePauseRestTimer`
- `adjustActiveRestTimer`

Timer model:

- `exerciseId`
- `endAt`
- `pausedRemainingSeconds`
- `totalSeconds`
- `kind = "exercise" | "transition"`

Behavior:

- exercise timer uses the exercise’s own rest timer
- transition timer uses workout setting `transitionRestSeconds`
- pausing preserves remaining seconds
- `+5` / `-5` changes both remaining time and total time basis

### 4.8 Sticky Bottom Timer Dock

Implemented in:
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`

Behavior:

- shown only while a timer is active and remaining seconds > 0
- full-width dock
- top progress bar = remaining / total seconds
- can minimize into a timer FAB
- minimized FAB shows live countdown

Labels:

- `Rest timer`
- `Rest paused`
- `Between exercises`
- `Between exercises paused`

### 4.9 Precise Session Clock Start

Implemented in:
- `apps/web/src/App.tsx`

Functions:
- `openQuickSession`
- `startPlanWorkout`
- `formatElapsedDuration`

Behavior:

1. Fresh sessions capture `startInstant = now.toISOString()`.
2. Human-readable date/time fields are still stored for editing and display.
3. Live elapsed duration prefers `startInstant` over reconstructing from `date + startTime`.

This prevents fresh sessions from appearing to start 10–50 seconds into the current minute.

### 4.10 Focused Expanded Card Mode

Implemented in:
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`

State:
- `focusedExpandedExerciseId`

Behavior:

1. Trigger only when a collapsed exercise card is expanded directly.
2. Do not trigger on `Expand all`.
3. Track focused card state separately from collapse state.
4. If the focused card collapses or disappears:
   - clear focus mode
5. Scroll the focused card toward the center of the logger.
6. Dim/blur neighboring cards.
7. Outside tap clears the focused state and restores the normal logger view.

### 4.11 Session-Level Bottom Dock Visibility

Implemented in:
- `apps/web/src/App.tsx`

State:
- `showBottomRestDock`

Behavior:

1. Fresh sessions default to showing the bottom dock.
2. Dismiss action can fully hide the dock for the current session.
3. `Workout Actions` can restore the dock.
4. The preference does not persist as a reusable workout default.

---

## 5. Reward Algorithms

### 5.1 One-Rep Max Estimation

Implemented in:
- `apps/web/src/App.tsx`
- `apps/engine/app/metrics.py`

Function:
- `estimateOneRm` in web
- `epley` in engine

Formula:

- `weight * (1 + reps / 30)`
- single rep returns weight directly

### 5.2 Set-Level Reward Detection

Implemented in:
- `apps/web/src/App.tsx`

Function:
- `buildSetRewards`

Benchmarks used:

- max historical weight
- max historical estimated 1RM
- max reps at the same weight

Possible rewards:

- `Max Wt`
- `1RM PR`
- `Rep PR`

Important behavior:

- same-session completed sets are included in the benchmark pool
- later same-session sets can replace earlier rewarded sets
- matching an earlier same-session best does not re-award it

### 5.3 Exercise-Level Reward Detection

Implemented in:
- `apps/web/src/App.tsx`

Function:
- `buildExerciseRewards`

Current exercise-level reward:

- `Best Vol`

Rule:

- current exercise total volume must exceed the best historical exercise volume

### 5.4 Reward Recompute Pass

Implemented in:
- `apps/web/src/App.tsx`

Function:
- `recomputeLoggerRewards`

Algorithm:

1. Iterate exercise by exercise.
2. Build benchmark history from prior sessions.
3. Walk draft sets in order.
4. Resolve each completed set.
5. Recompute set-level rewards against:
   - historical sets
   - already-completed same-session sets
6. Add resolved set to the benchmark pool.
7. If exercise is complete and has meaningful completed sets:
   - compute exercise-level rewards
8. Return full reward list.

This is why rewards can move from an earlier row to a later one inside the same workout.

### 5.5 Reward Summaries

Implemented in:
- `apps/web/src/App.tsx`

Current levels:

- set
- exercise
- session placeholder in model, but not logger-top-strip driven

Top strip currently summarizes:

- set rewards count
- exercise rewards count

---

## 6. Muscle Mapping Algorithms

### 6.1 Simple Muscle Spread

Implemented in:
- `apps/web/src/App.tsx`

Function:
- `buildMuscleSpread`

Behavior:

- primary muscle gets stronger weighting
- secondary muscles get lower weighting
- returns a simple aggregated spread map

### 6.2 Body-Region Scoring

Implemented in:
- `apps/web/src/App.tsx`

Function:
- `buildMuscleRegionScores`

Behavior:

- map exercises to front/back body regions
- apply weighted contribution:
  - higher for primary
  - lower for secondary
- accumulate region scores for body map intensity

### 6.3 Tone Selection

Implemented in:
- `apps/web/src/App.tsx`

Function:
- `getMuscleTone`

Behavior:

- convert a region’s score vs global max score into a tone bucket
- used for body-map visual intensity

---

## 7. Superset And Reordering Algorithms

### 7.1 Superset Group Normalization

Implemented in:
- `apps/web/src/App.tsx`

Function:
- `normalizeSupersetGroups`

Rule:

- if a superset group has fewer than 2 exercises, clear that group id

This prevents orphaned superset state.

### 7.2 Reorder By Id

Implemented in:
- `apps/web/src/App.tsx`

Function:
- `moveExerciseByIds`

Algorithm:

1. Find source index.
2. Find target index.
3. Remove source item.
4. Insert before target item.

Used by:

- reorder sheet drag/drop
- direct logger drag/drop on expanded headers

### 7.3 Planner Workout Reorder

Implemented in:
- `apps/web/src/App.tsx`

Behavior:

1. Track the dragged workout id.
2. On drop, resolve source and target indices by id.
3. Remove the source item.
4. Insert it at the target position.
5. Save the reordered plan list.

Current rule:

- planner drag-reorder is only meaningful in the unfiltered `My Workouts` ordering context

---

## 8. Swipe Algorithms

### 8.1 Swipe State Machine

Implemented in:
- `apps/web/src/App.tsx`

Functions:
- `createInitialSwipeState`
- `beginSwipe`
- `moveSwipe`
- `endSwipe`
- `resetSwipeState`

Rules:

- axis starts as `undecided`
- if vertical motion dominates, abort swipe
- if horizontal motion dominates and passes threshold:
  - enter horizontal drag
- thresholds clamp translation
- left threshold -> mark done
- right threshold -> reveal delete

This is why normal taps should not become sticky horizontal drags.

---

## 9. Finish-Workout Algorithms

### 9.1 Incomplete Set Count

Implemented in:
- `apps/web/src/App.tsx`

Memo:
- `incompleteSetCount`

Rule:

- count every draft row where `done === false`

### 9.2 Finish Confirmation Decision

Implemented in:
- `apps/web/src/App.tsx`

Functions:
- `finishWorkout`
- `finishWorkoutAnyway`

Current behavior:

- if incomplete set count > 0:
  - open centered confirmation
- options:
  - `Go Back And Finish`
  - `Finish Anyway`

Current product choice:

- `Finish Anyway` ignores unfinished rows
- the previous “Reset incomplete sets” path was removed because it was not trustworthy enough for the current flow

### 9.3 Finished Payload Construction

Implemented in:
- `apps/web/src/App.tsx`

Function:
- `performFinishWorkout`

Algorithm:

1. Use `buildCompletedSets` on the active exercise.
2. If no resolved sets exist:
   - return error state
3. If any issues exist:
   - return error state
4. Build payload from:
   - historical sessions
   - current resolved session
5. POST to API completion endpoint.
6. On failure:
   - use fallback behavior if available

Note:

- this is still exercise-level completion logic, not yet the final post-workout save flow

### 9.4 Unsaved Workout-Builder Draft Persistence

Implemented in:
- `apps/web/src/App.tsx`

Functions:
- `getStoredPlanBuilderDraft`
- `persistPlanBuilderDraft`

Behavior:

1. Persist `{ draft, mode }` in local storage when a new-builder draft changes.
2. Rehydrate that draft on app load.
3. Reuse it when the user returns to create flow.
4. Clear it when the workout is saved.

Current rule:

- edit mode is excluded so in-progress template editing does not silently overwrite saved-plan truth

---

## 10. API Algorithms

### 10.1 Session Complete Request Handling

Implemented in:
- `apps/api/src/index.ts`

Function:
- `requestEngineSuggestion`

Flow:

1. Validate request against shared schema.
2. Forward payload to engine `/v1/evaluate`.
3. Parse engine response against shared coaching schema.
4. If engine is unavailable:
   - return error with fallback suggestion

This is not a training algorithm by itself, but it is the implemented orchestration algorithm for the session-complete flow.

---

## 11. Engine Metrics Algorithms

Implemented in:
- `apps/engine/app/metrics.py`

### 11.1 Working Set Filter

Function:
- `is_working_set`

Rule:

- weight > 0
- reps > 0
- set type in `{"", "normal"}`

### 11.2 Failed Set Filter

Function:
- `is_failed_set`

Rule:

- explicit failed flag
- or set type == `failure`

### 11.3 Session Metrics

Functions:

- `session_avg_rpe`
- `session_max_1rm`
- `session_volume`
- `session_working_sets`
- `failed_set_ratio`
- `session_max_weight`
- `average_reps_in_sessions`

Notes:

- average RPE requires at least 2 valid non-failed RPE values
- failed ratio uses all valid non-zero sets as denominator

---

## 12. Engine Goal Algorithms

Implemented in:
- `apps/engine/app/goals.py`

### 12.1 Goal Definitions

Current goals:

- Strength
- Hypertrophy
- Endurance / Fitness
- Powerbuilding

Each definition contains:

- rep range
- target sets
- load increment
- consistency threshold
- progression notes

### 12.2 Frequency Recommendation

Function:
- `get_frequency_recommendation`

Algorithm:

1. Start from goal-specific baseline min/max/ideal sessions.
2. Adjust for age.
3. Adjust for experience.
4. Adjust for recovery speed.
5. Adjust for life stress.
6. Clamp final values to safe bounds.
7. Return:
   - min sessions
   - max sessions
   - ideal sessions
   - explanation reasons

This is a heuristic rule engine, not a learned model.

---

## 13. Exercise Lookup Algorithms

Implemented in:
- `apps/engine/app/exercise_lookup.py`

### 13.1 Exercise Catalog Lookup

Function:
- `lookup_exercise`

Algorithm:

1. Try exact lowercase lookup.
2. Strip common equipment/modifier prefixes and retry.
3. Clean variant suffixes like:
   - parentheses
   - ` - `
   - ` w/`
   - ` with `
4. Retry cleaned version.

### 13.2 Muscle Group Classification

Function:
- `get_muscle_group`

Algorithm order:

1. special-case exceptions
2. catalog lookup
3. rule list:
   - all required fragments present
   - all excluded fragments absent
4. fallback to `Other`

### 13.3 Movement Type Classification

Function:
- `get_movement_type`

Algorithm:

- rule-based keyword classification into movement buckets like:
  - compound quad
  - compound hinge
  - vertical pull
  - horizontal pull
  - incline push
  - shoulder isolation
  - bicep isolation
  - tricep isolation
  - core isolation

### 13.4 Exercise-Specific Rep Range Override

Function:
- `get_exercise_rep_range`

Algorithm:

1. Start from the user’s goal definition.
2. Check special exercise-type keyword groups:
   - explosive / power
   - high-rep specific
   - small isolation
3. If matched:
   - override rep range
   - sometimes reduce load increment
   - rewrite progression/below-range/within-range notes
4. Else:
   - use goal default

This is how an isolation raise can get a different rep-range recommendation than a compound press under the same goal.

---

## 14. Engine Overload And Suggestion Algorithms

Implemented in:
- `apps/engine/app/overload.py`

### 14.1 Rep-Range Checks

Functions:

- `reps_in_range`
- `reps_at_top_of_range`

Behavior:

- average normal working-set reps within session are compared to goal range

### 14.2 Plateau Detection

Function:
- `detect_plateaus`

Algorithm:

For each session from index 3 onward:

1. Take the previous 3 sessions.
2. Compute estimated 1RM for each.
3. Compute:
   - average 1RM
   - 1RM range
4. If range < 1.5% of average:
   - mark plateau event
5. Deduplicate by date.

### 14.3 Main Suggestion Evaluation

Function:
- `evaluate_recent_sessions`

This is the main coaching algorithm currently implemented.

High-level decision tree:

1. If fewer than 3 sessions:
   - `BUILDING`
   - reason `INSUFFICIENT_HISTORY`

2. Compute on the latest 3 sessions:
   - estimated 1RMs
   - set counts
   - failure ratio
   - average RPE
   - average reps
   - planned sets
   - in-range count
   - top-of-range count

3. Decision branches:

- high failure ratio (`>= 0.5`) -> `DELOAD`
- all recent average reps above rep range -> `INCREASE_LOAD`
- all recent average reps below rep range -> `INCREASE_REPS`
- 1RM stalled + reps in range + frequent top-of-range -> `PLATEAU_OPTIONS`
- top-of-range consistency without stall -> `INCREASE_LOAD`
- mostly in range -> `INCREASE_REPS`
- current sets below planned target -> `INCREASE_SETS`
- otherwise -> `NO_CHANGE`

Each branch also builds:

- label
- what
- why
- certainty band
- evidence list
- coaching note
- optional rep-range context
- optional alternative options

### 14.4 Suggestion History

Function:
- `build_suggestion_history`

Algorithm:

- evaluate the same suggestion function on progressively larger prefixes of the session list

This creates:

- what RepIQ would have said after each session in sequence

---

## 15. Engine Badge Algorithms

Implemented in:
- `apps/engine/app/badges.py`

Function:
- `evaluate_badges`

Current badges are rule-based boolean checks:

- `Locked In`
  - 8+ consecutive active weeks
- `Built the Habit`
  - 12+ weeks with 2+ sessions
- `Century`
  - 100+ workout days
- `Iron Streak`
  - 4+ sessions per week for 3 consecutive weeks
- `Moving Up`
  - 5+ exercises with 5%+ 1RM improvement
- `Strong Foundation`
  - main compound lift improved by 10%+
- `Broke Through`
  - exercise plateaued, then resumed progression
- `Volume Builder`
  - 3+ muscle groups above minimum effective volume estimate
- `Came Back`
  - meaningful 15-22 day break followed by return
- `Long Game`
  - 6+ months of history

---

## 16. Engine Training Pattern Algorithm

Implemented in:
- `apps/engine/app/patterns.py`

Function:
- `build_training_pattern`

Requirements:

- at least 8 total session dates

Algorithm:

1. Sort unique dates.
2. Compute day gaps between consecutive dates.
3. Bucket gaps into:
   - 1 week
   - 2 weeks
   - 3+ weeks
4. Compute active weekly streaks from ISO week continuity.
5. Compute:
   - average streak
   - max streak
   - average significant gap
   - gap trend
   - consistency percentage
6. Detect likely planned deload pattern from repeated gap regularity.
7. Classify into pattern labels such as:
   - steady and consistent
   - generally consistent with occasional misses
   - consistency declining over time
   - on/off cycling
   - fragmented
   - structured with planned breaks

This produces a structured training-pattern explanation, not just a numeric score.

---

## 17. Ingest Algorithm

Implemented in:
- `apps/engine/app/ingest.py`

Functions:

- `parse_csv`
- `_parse_date`
- `normalize_hevy_rows`

Algorithm:

1. Normalize newline format.
2. Parse CSV rows.
3. Detect likely weight field.
4. Infer pounds vs kilograms:
   - if the column says lbs and median valid weight is > 50, convert to kg
5. Normalize date to `YYYY-MM-DD`.
6. Group rows into session buckets by:
   - date
   - exercise name
   - workout title
7. Convert rows into `SetEntry`
8. Drop sessions without valid weighted sets
9. Return sessions grouped by exercise, sorted by date

---

## 18. History Analysis Aggregation

Implemented in:
- `apps/engine/app/analyzer.py`

Function:
- `analyze_history`

Algorithm:

1. Resolve goal definition.
2. Resolve frequency recommendation from user context.
3. For each exercise:
   - sort sessions by date
   - backfill missing exercise name if needed
   - compute latest 1RM and latest weight
   - compute next suggestion
   - compute suggestion history
   - compute plateau events
4. Collect all session dates across all exercises.
5. Sort exercise analyses alphabetically.
6. Build:
   - training pattern
   - badge awards
   - frequency recommendation
   - exercise analyses

This is the engine’s highest-level implemented aggregation algorithm today.

---

## 19. What Is Not Yet Algorithmically Mature

These areas exist in product/UI but are not yet complete end-to-end algorithms:

- full workout completion/save flow
- session-level reward generation in logger and completion pages
- plan generation and custom workout programming
- backend persistence for most web-only state
- learned personalization or probabilistic coaching models
- true typo-tolerant or semantic exercise search

For now, RepIQ is driven by a strong set of explicit heuristics, deterministic rules, and session-state algorithms rather than machine-learned personalization.
