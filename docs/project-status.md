# RepIQ Project Status

## Current State

RepIQ has a working project foundation across the web app, API, engine, shared types, and planning docs. The product is still pre-V1, but the core workout-logger direction is now established and testable.

Detailed implemented logic now also has a dedicated reference in [algorithms.md](/Users/debeshkuanr/Documents/RepIQ/docs/algorithms.md).

## Foundation

- Monorepo structure is in place for `web`, `api`, `engine`, and shared packages
- Repo documentation exists for architecture and roadmap
- Core app direction is web-first, mobile-first, with a backend and engine from day one

## Engine And Logic

- Legacy analyzer logic has been reviewed and partially ported into the engine service
- Engine modules now cover coaching-oriented recommendation structure rather than raw instruction output
- Guided coaching contract includes:
  - recommendation
  - certainty
  - evidence
  - explanation
  - alternatives
- Hevy-style ingestion and fixture-based tests have been added

## API

- API scaffold is in place
- Web -> API -> engine session-complete flow is wired
- Shared types align the web and API contract with the engine response shape

## Web App

- Mobile-first logger UI exists and is actively being refined
- Home and Planner surfaces now exist as real app-level destinations rather than only logger-adjacent ideas
- App-level theme system exists with:
  - Light
  - Dark
  - System
- Styling is token-based, which keeps the door open for future curated theme packs

## Logger Flow

- Workout header includes:
  - back button
  - session name
  - settings icon
  - collapse / expand control
- The active workout timer now ticks live while the logger stays open
- Logger top stats strip currently emphasizes:
  - duration
  - total logged volume
  - set count
  - muscles entry
- Logger header now also shows a subtle exercise count under the session name
- Exercise logging includes:
  - optional sticky note per exercise
  - editable rest timer
  - workout-level between-exercises timer
  - compact set rows
  - weight / reps / RPE fields
  - explicit done checkbox
  - swipe actions
  - set-type selector
  - `rest-pause` set type
  - add set / remove set behavior
  - manual collapse / expand per exercise
  - collapse-all / expand-all control
  - drag-reorder from the exercise header, even while expanded
- logger footer actions:
  - `+ Exercise`
  - `Discard`
  - `Finish Workout`
- workout-level actions are grouped under the top settings flow
- A top in-workout guidance strip now exists with a first-pass shutter interaction
- Guidance still remains available in the bottom section as the stable fallback
- Guidance display is now user-configurable by workout preference:
  - top strip
  - inline
  - both
  - neither
- Inline guidance now behaves as a subtle inset section in the active exercise only and opens a centered modal when tapped
- Collapsed guidance now shows context plus preview:
  - current exercise name during the workout
  - workout label after completion
- Logger rewards now exist in V1:
  - set-level rewards are recomputed against history plus already-completed same-session sets
  - later same-session sets can replace earlier rewarded sets if they become the true best
  - set-level reward presentation is small medal + text inline
  - exercise-level reward sits in the exercise header
  - top strip shows only set and exercise reward counts
  - session-level rewards are reserved for completion / summary surfaces, not the logger top strip
- Reward summary now opens as a centered modal rather than a bottom sheet
- Finishing a workout with incomplete rows now uses a simpler centered confirmation:
  - `Go Back And Finish`
  - `Finish Anyway`
  - unfinished rows are ignored when finishing anyway
- Collapsed exercise cards now summarize:
  - logged set count
  - logged volume
  - reward summary
  - superset state
  - completed-state highlighting
- Collapsed exercise rows now follow a flatter list pattern rather than a full card treatment
- Active workout indication is now title-led:
  - blue exercise name
  - green status dot after the name
- Active exercise can now resolve to none when all exercises are complete by the current product rule

## Exercise Flows

- Exercise actions exist through a bottom sheet (⋮ menu)
- Sheet header shows:
  - Exercise name as a tappable link (navigates to exercise detail; back returns to sheet)
  - Movement pattern accent pill (e.g. "Squat") followed by primary muscle in bold + secondary muscles in muted text
- Supported actions rendered as a 2-column icon tile grid (white card, elevation shadow):
  - Replace exercise
  - Add note / Edit note
  - Superset / Unsuperset
  - Reorder
  - Remove (danger tile, red)
- View details and Muscles Worked removed from the menu — accessible from the exercise detail page and the Muscles › button respectively
- Exercise details exist as a separate screen with:
  - summary
  - history
  - how-to
  - muscle-engagement explanation
  - summary/history split cleaned up so history metrics and charts live only in `History`
- A dedicated `Muscles Worked` page now exists with:
  - overall workout muscle spread
  - selected exercise focus
  - V1 front/back body-map intensity view for workout and exercise focus
  - explicit navigation into exercise details
  - current V1 layout acknowledged as functional but intentionally due for later compaction

## Supersets

- Superset grouping flow exists
- Multiple exercises can be grouped together
- Exercises in a superset show a visible badge treatment
- Superset selector reflects existing grouped state

## Navigation

- Back no longer discards the workout
- Leaving the logger now uses a bottom sheet with:
  - `Stay Here`
  - `Come back later`
- Active workouts can be resumed later
- User cannot start another workout while one is active
- Active workout summary is shown in the leave/resume flow
- App launch now defaults to `Home` instead of dropping directly into the logger
- App-level navigation direction is now clearer:
  - `Home`
  - `Planner`
  - `Insights`
  - `Profile` via `Home`
- A dedicated navigation/connectivity source of truth now exists in [navigation-map.md](/Users/debeshkuanr/Documents/RepIQ/docs/navigation-map.md)

## Home And Planner

- `Home` now acts as the operational entry point:
  - quick session
  - resume active workout
  - planner entry
  - profile/settings access
- `Quick Session` now starts a fresh blank workout and uses a precise start timestamp so the timer begins at `0`
- `Workout Planner` now has real app-level structure:
  - `My Workouts`
  - `Library`
  - `Generate Session`
- Planner cards now support:
  - open/preview
  - edit
  - duplicate
  - share
  - delete where allowed
  - tag editing
- `My Workouts` supports:
  - draggable card reorder
  - count in the tab label
  - tag-based filtering
- `Library` now supports:
  - compact filter tray
  - template preview/start path
- `Generate Session` now opens a dedicated review/builder path before logger entry
- `Workout Builder` now exists as a real editable surface:
  - name
  - note
  - tags
  - drag-reorder exercises
  - per-exercise rest
  - per-set type editing
  - add/remove sets
  - add exercise
- Unsaved new-builder drafts now persist locally until they are saved or replaced
- Starting from a generated workout, plan, template, or quick session now routes through clearer source-specific behavior

## Logger Flow Refinements

- Saved workouts entered from `My Workouts` now start in collapsed mode
- Expanding a collapsed card can enter a focused mode:
  - focused card is centered
  - surrounding cards are dimmed/blurred
  - tapping outside exits focus mode
  - `Expand all` does not trigger focus mode
- The sticky bottom rest dock is now more session-oriented:
  - centered `-5 / time / +5` cluster
  - time tap pauses/resumes
  - minimize on the left
  - stop/dismiss on the right side
  - full dismiss can be restored from workout actions
- Bottom rest timer visibility is now a session-level action rather than a reusable workout default
- Logger guidance no longer appears when there are no exercises
- Missing previous-session values now stay blank rather than showing placeholder dashes
- Current-exercise carry-forward placeholders now appear as lighter grey hints in the next set instead of pre-filling hard values
- Workout duration now uses precise `startInstant` timing, which also fixes quick-session and plan-start timing drift

## Additional Screens

- `Add Exercise` is now a separate page with a back button
- `Add Exercise` now supports:
  - alphabetical browsing by default
  - tabs for `All Exercises`, `By Muscle`, and `Types`
  - always-visible search
  - thin quick filters for `In workout` and `Selected`
  - numbered multi-select badges in order of selection
  - fixed bottom add-action bar when one or more exercises are selected
  - floating custom-exercise creation entry
  - `Types` groups with collapse / expand behavior
  - `By Muscle` groups with collapse / expand behavior
  - `Expand all / Collapse all` for grouped tabs
  - repeated sort tap to reverse direction
  - dedicated `i` action to open exercise details from the selector
- Custom exercise creation now supports:
  - 2-step guided flow
  - multi-select primary and secondary muscles
  - progress chips across the create flow
  - stronger secondary-muscle discoverability after primary selection
  - sticky bottom tray actions for create/edit
- Custom exercise management now exists from exercise details:
  - edit custom exercise
  - delete unused custom exercise
  - hide/archive custom exercise once history exists
  - archived custom exercises leave the library surface without losing the underlying record
- Search now tokenizes by words, ignores numbers/special characters, and matches terms in any order across exercise and muscle metadata
- A simple workout resume/selector shell exists to support leaving and returning to an active workout
- A dedicated post-finish workout screen now exists for workout naming, notes, reward review, save, and share handoff
- Finish screen media is intentionally limited for V1:
  - up to 3 images are allowed for progress/self-reference
  - finish-flow images now upload through the API media boundary
  - uploaded files target backend-managed local uploads for beta/dev
  - video code stays parked in the web app
  - video UI is deferred until RepIQ has a clear persistence model for social or long-term self-reference use
  - local uploads can later be swapped to cloud/object storage without changing the client contract
- Reward UX is intentionally planned around the post-finish workout screen first, with only subtle in-logger reward signals later if they prove helpful
- Reward UX direction is now clearer:
  - one set, one exercise, or one session can earn multiple rewards
  - logger rewards should stay as small, non-intrusive text with light icon support
  - top-strip summary should stay limited to in-logger reward levels that matter during the workout
  - finish flow should include a full reward section for the completed exercise/workout
  - shareable summaries should include reward counts in the main summary plus a reward-only card later
- Planner-linked surfaces now exist:
  - template preview
  - generated review
  - workout builder/edit
- A dedicated navigation/connectivity document now exists:
  - [navigation-map.md](/Users/debeshkuanr/Documents/RepIQ/docs/navigation-map.md)
- A dedicated psychological-data planning document now exists:
  - [psych-layer.md](/Users/debeshkuanr/Documents/RepIQ/docs/psych-layer.md)

## Navigation Layer

- Bottom navigation bar now implemented: Home / Planner / Insights tabs
- `BottomNav` component renders on Home, Planner, and Insights views
- `AppView` type expanded: `"home" | "logger" | "finish" | "share" | "planner" | "plan-builder" | "report" | "insights" | "profile" | "history-detail"`
- All `"selector"` references renamed to `"home"`
- New top-level pages added:
  - `WorkoutReportPage` — post-finish report showing hero stats, rewards, exercises; routes to share
  - `InsightsPage` — Reports + Analyzer tabs; tapping a report opens WorkoutReportPage
  - `ProfilePage` — Settings group with Preferences / Account / Import/Export rows
  - `WorkoutHistoryDetailPage` — opens from completed RepIQ session cards; shows hero stats, exercises performed, Edit Session + Share Summary dual-button row at bottom; reachable via `appView === "history-detail"`
- Home upgraded:
  - Profile avatar button (top-right) routes to Profile
  - Latest workout card shows most recent session or empty-state prompt
  - Quick Workout button disabled when active workout exists
- Finish Workout now routes to `report` view instead of `share`; share is accessible from report
- Profile page uses dedicated CSS classes (`profile-page`, `profile-header`, `profile-list`, `profile-row`) to avoid layout issues from shared `detail-page` grid stretching
- Profile page max-width fixed to 430px (matches all other page shells)
- CSS added for all new navigation components: `.bottom-nav`, `.bottom-nav-tab`, `.profile-*`, `.home-latest-*`, `.insights-*`, `.report-*`
- `selector-shell` padding updated to accommodate fixed bottom nav height

## RepIQ Plan — History And Session Detail

- Completed RepIQ sessions now appear in a collapsible "Completed · N sessions" section at the bottom of the PlannerHomePage RepIQ tab
- Each completed session card shows a `✓ Done` badge and `›` chevron; always tappable
- Tapping a completed session opens `WorkoutHistoryDetailPage`:
  - gradient hero with session name, date, duration/sets/exercises/volume stats
  - "Exercises Performed" card listing each exercise with logged set count and volume
  - "Edit Session" (secondary) + "Share Summary" (primary) action buttons at the bottom — always shown for any completed session regardless of logged data
  - Share routes to `WorkoutReportPage`; Edit re-opens logger with timer pre-seeded
- If the session has a saved workout (`repiqSourceKey` match): real data shown
- If no saved workout found (plan-day fallback): synthetic `SavedWorkoutData` built from plan exercises; still navigable with "not logged" placeholders
- "Save to My Workouts" option appears on session cards when a real saved workout exists

## Edit From History — Timer And Data

- `durationSeconds: number` added to `FinishWorkoutDraft` and persisted in `SavedWorkoutData`; records elapsed seconds at save time
- `editHistoryWorkout()` pre-seeds the timer: `startInstant = Date.now() - elapsed * 1000`
- Fallback: if `durationSeconds === 0` (older sessions), the `"H:MM:SS"` / `"MM:SS"` formatted `duration` string is parsed to seconds
- Final saved time automatically accumulates original + editing duration because `buildFinishWorkoutDraft` computes elapsed from `startInstant → now`
- Edit-save currently appends a new entry; **pending**: overwrite original `repiqSourceKey` entry so Share Summary always reflects the latest edit (deferred to Workout History sprint)

## RepIQ Plan — UX Refinements

- `needsReview` banner now has a "Dismiss" button alongside "Regenerate remaining sessions"; clears the flag without regenerating
- Planner mode dropdown (RepIQ Plan / Custom Workout Planner) closes on outside click (mousedown listener on `plannerModeDropdownRef`)
- PlanCard three-dot menu closes on outside click (mousedown listener on `menuRef`)
- Plan detail page: Edit and Delete are now compact icon-only buttons (pencil / outlined trash) sitting to the right of the Start Workout button in the same `plan-detail-actions-top` row — no separate manage row
- Delete icon button uses red outline/stroke; no fill texture; turns to `rgba(239,68,68,0.06)` background on active press
- Finish modal: combined blank-set and incomplete-set warnings into one modal (`finishConfirmOpen`); removed separate `emptyValuesWarnOpen` state

## Onboarding (Phase 1 — Complete)

- First-launch gate: `onboardingComplete = psychProfile.onboardingCompletedAt !== null` in App; onboarding shown before any other view
- `OnboardingPage` — 5-step flow, all data saved to `UserPsychProfile` in localStorage key `repiq-psych-profile`
  - Step 1 — Welcome: name input, gender chips; full-page gradient (light: blue→teal, dark: navy→teal); frosted dark-scrim glass card for form; step dots + theme toggle visible
  - Step 2 — Body: height/weight inputs, body fat bracket chips, metric/imperial toggle (persists to `unitSystem`)
  - Step 3 — Experience: experience level chips (never/beginner/intermediate/advanced/veteran); returning-after-break toggle + break duration stepper
  - Step 4 — Schedule: days/week stepper, session length chips, best time chips, workout style chips
  - Step 5 — Mindset: pre-workout feeling chips, success vision textarea
  - Steps 2–5: white background (`var(--paper)`), standard progress header with dots + step count + theme toggle
  - Gradient on step 1: `[data-step="1"]` targets ob-page directly; all child elements (dots, labels, inputs, chips, CTA) styled white-on-gradient; dark mode uses deep navy→teal gradient

- `PostOnboardingPage` — shown once after onboarding completes, before home screen
  - Gradient hero with personalised greeting (uses `profile.name`)
  - Returning-after-break banner (if `isReturningAfterBreak` true)
  - Profile summary cards grid: goal (with emoji), level, days/week, session length, best time
  - Vision quote block (if `successVision` filled)
  - What's-next checklist pointing to Home / Planner / Insights
  - "Let's Go →" CTA sets `showPostOnboarding = false` in App

- `DevLandingPage` — internal navigator, shown when URL contains `?dev`
  - Buttons to navigate directly to any `AppView` (Home, Planner, Insights, Profile, Report, Plan Builder)
  - Preview `PostOnboardingPage` without re-running onboarding
  - Reset onboarding (clears `onboardingCompletedAt`, drops back to step 1)
  - Theme toggle in header
  - Hint to remove `?dev` from URL to exit

## Exercise Library Updates

- exerciseType fixes on inline `exerciseTemplates` entries:
  - Lat Pulldown, Hamstring Curl → `machine`
  - Romanian Deadlift → `barbell`
  - Shoulder Press → `free_weights_accessories`
  - Back Extension → `bodyweight_only` (was bodyweight_weighted)
  - Weighted Back Extension added as `bodyweight_weighted`
- ~40 new exercises added across Chest, Arms, Back, Shoulders, Legs, Core, Cardio categories via `_userExercises` block (total catalog ~136 exercises with full taxonomy)
- Custom exercises show amber "MINE" pill badge (`custom-exercise-badge` CSS class)

## Taxonomy Schema v2 Migration (IN PROGRESS)

- **Type scaffolding complete** (TypeScript 0 errors):
  - `CustomExerciseType`: Added v2 values (`bodyweight`, `dumbbell`, `cable`, `resistance_band`); kept legacy values for backward compat
  - `MovementPattern`: Added `mobility` (stretching, foam rolling)
  - `ExerciseAngle`: Added `upright`, `supine`
  - New types: `PerformanceMetric` (`reps | time | distance_or_time | mixed`), `ExerciseImplement` (suspension_trainer, sled, medicine_ball, jump_rope, plate, battle_ropes, yoke)
  - `ExerciseDraft`: Added 3 optional fields (`performanceMetric`, `supportsExternalLoad`, `implement`)
  - `catalog.ts` `makeExercise()`: now accepts new fields as trailing optional params
  - `App.tsx` `getEquipmentAccessibility()`: handles both v2 and legacy type values during transition
- **Awaiting:** 435-exercise taxonomy CSV (v2 schema) — will replace 352-exercise library and unlock library workout templates (7 categories)

## Add Exercise — By Muscle Tab

- 10 canonical primary muscle groups: Chest, Back, Shoulders, Core, Biceps, Triceps, Quads, Hamstrings, Glutes, Calves
- `CANONICAL_MUSCLE_ORDER`, `MUSCLE_TO_CANONICAL`, `getCanonicalMuscle()` mapping
- Secondary drill-down (`showSecondaryDrilldown`) enabled by default
- `groupedByMuscle`: exercises bucketed by canonical group
- `groupedByMuscleWithSecondary`: sub-map by actual primaryMuscle + same-canonical secondaryMuscle overlaps (exercises can appear in multiple sub-groups)

## Home Redesign (Phase 1 — Complete)

- **Streak badge** — fire emoji + consecutive-day count (`computeStreak()`); only renders when streak ≥ 1
- **Week streak badge** — calendar icon + consecutive quality-weeks count (`computeWeekStreak()`); quality = 2+ sessions or 1 session with 3+ muscle groups
- **PR banner** — trophy emoji + exercise name + weight/reps; sourced from last 30 days; only shown when PR exists
- **This Week card** — 7-day dot grid (M–Su, today highlighted) + session count, set count, volume; computed by `getThisWeekStats()`
- **Last Workout card** — clickable card → WorkoutReportPage; only shown when last session ≤ 14 days ago; shows name, duration, sets, volume
- **Training Trend card** — 3-week rolling zone view (W-2, W-1, W0); zones: Progress (≥5% vol growth), Maintenance (stable), Plateau (≥10% drop), Missed (0 vol); computed by `computeTrainingTrend()`; taps → Insights Analyzer
- **Muscle Coverage nudge** — lists overdue canonical muscles (due = ≥75% of cycle elapsed); computed by `computeMuscleCoverage()`; only shown when ≥1 muscle is overdue and user has history; taps → Insights Analyzer
- **NextSessionCard (context-aware primary CTA)** — 4 states:
  1. Active RepIQ plan with next session: "NEXT UP" eyebrow, session name, focus, exercise count, duration, optional needsReview notice
  2. Active plan but all sessions complete: "Plan Complete" state
  3. Has history but no plan: "READY TO TRAIN?" with Quick Workout + Generate Session
  4. Brand new user: "LET'S GET STARTED" with Start First Workout + Generate Session
- `computeGoalProgress()` function implemented (100-pt scoring: consistency 40, volume trend 20, muscle coverage 20, streak 20) — calculated but not yet displayed on Home
- **GlossaryPage** — term definitions for streak, training trend, etc.; accessible via info icons on Home

## Psych Capture (Phase 2 — Mostly Complete)

- **PsychCaptureCard** — shown on WorkoutReportPage after every workout finish
  - Mood after: 5 emoji chips 😫→😄 (`MoodRating` 1–5)
  - Energy left: 5 emoji chips 🪫→💪 (`EnergyRating` 1–5)
  - Session RPE: 10 numbered chips 1–10 (`RPERating`)
  - Respects consent flags from `UserPsychProfile` (`capturePostWorkoutMood`, `capturePostWorkoutEnergy`, `captureSessionRPE`)
  - Shows "✓ Feeling logged" checkmark if already captured for this session
  - Persists to `PostWorkoutPsych` via `persistPostWorkoutPsych()`
- **ReadinessCheckSheet** — contextual prompt on Home asking "How's your energy?" with 5 emoji chips; "Skip for now" + "Don't ask again" options; shown as overlay + bottom sheet
- ❌ Persistent Daily Readiness Card on Home — not yet built
- ❌ Consent toggles in Profile → Preferences — not yet built (types defined, UI missing)

## Psychological Data Layer

- Psychological/readiness architecture is now documented and partially stubbed in the web app
- The psych layer is intentionally separate from normal workout-save payloads
- Planned stores currently cover:
  - user psych profile
  - post-workout mood / energy / session RPE
  - daily readiness
  - passive session behavior signals
- Current status:
  - schema and storage direction documented
  - capture UI and intelligence surfaces not yet built
- `SessionBehaviorSignals` passive capture wired into `finalizeFinishedWorkoutSave` — fires automatically on every completed session with zero user friction
- Session behavior captures: day of week, time of day, actual vs planned duration, set completion rate, session source (plan/template/generated/quick/resume), plan ID
- Today's `DailyReadiness` entry is linked to the session ID on completion if one was captured that day
- `buildSessionBehaviorSignals()` helper derives all fields from existing session state — no new user-facing UI required

## UX Direction Locked In

- Trust-first, readable, non-hyped interface
- Calm light theme with restrained accent color
- Dark mode should feel calm and legible, not neon
- Contextual exercise actions are better as bottom sheets than small popovers
- Logger should stay dense and fast
- Collapsed logger rows should feel like a readable list, not a second layer of mini cards
- Deeper exercise intelligence belongs outside the main logging surface
- In-workout guidance should be accessible near the top, dismissible, and restorable later without conflicting with the pull-down `Alter` interaction
- Non-logger pages should prefer white page surfaces with separators over heavy stacked card treatment
- Rewards should feel motivating and earned, not noisy or childish
- The main reward moment should happen after workout completion, not interrupt set-by-set logging
- Inline rewards can still appear during logging, but only as quiet progress confirmations
- Session-level rewards should not crowd the logger top strip
- Any colored reward or highlight treatment should lean toward gradient / slightly shiny emphasis rather than flat loud color blocks
- Sticky rest timing should feel like a dock, not a floating card:
  - full-width bottom tray
  - minimize to a FAB-style timer icon
  - progress indication
  - quick time adjustments

## Timer And Completion Rules

- Exercise completion is currently determined by the last set being marked done
- When a non-last set is completed:
  - the same exercise remains the timer target
  - normal rest timer starts
- When the actual last set row is completed:
  - that counts as the exercise-boundary completion event
  - active exercise moves to the first exercise in the list whose last set is still not done
  - `Between exercises` timer starts
- If no exercise remains incomplete by that rule:
  - no timer runs
  - no active exercise highlight is required
- Going back later and completing a non-last set should still trigger normal rest timing again

## Seed And Testing State

- Default logger seed now starts with 5 exercises instead of 8
- Logger exercise history is normalized back to 3 sessions when history exists but seeded data is shorter

## Captured Follow-On Features

These are documented and should not be forgotten:

- Inactivity check-in for active workouts after long no-input periods
- Deduplicated inactivity notifications/prompts
- Curated user-selectable theme packs in settings
- Reward design and testing:
  - post-finish reward section as the first full reward surface
  - record / PR / consistency / milestone treatment
  - support multiple rewards at set, exercise, and session level
  - later, only subtle in-logger micro rewards if they improve motivation without becoming a nuisance
  - top-strip reward counts should be expandable into details if they stay visually clean
- Full anatomical muscle-map upgrade:
  - richer vector illustration
  - more precise front/back muscle regions
  - smoother gradients / intensity legend
  - clearer comparison between overall workout and selected exercise

## Smart Replace

- Smart exercise replacement is fully implemented through the shared `AddExercisePage` replace mode
- Core types: `MovementPattern` (14 patterns), `ExerciseAngle`, `ExerciseEquipment`, `ExerciseDifficulty`, `ReplacementReason`, `ReplacementEvent`
- Engine functions (`App.tsx`):
  - `rankCandidate()` — all hard exclusions + 10-dimension weighted base score (max 119 pts)
  - `getSmartReplacements()` — scores all candidates, sorts by score, then applies `diversifyByEquipment()`
  - `diversifyByEquipment()` — post-sort pass capping each equipment type at 2 representatives before appending overflow (prevents same-equipment domination)
  - `inferMovementSide()` — infers bilateral/unilateral from `movementSide` field or exercise name tokens
  - `scoreEquipmentMatch()` — same/close-family/gym-tier/zero; close families: barbell↔dumbbell, barbell↔smith, cable↔machine, dumbbell↔kettlebell
  - `getMovementFamily()` — push / pull / legs / core / carry / cardio
  - `getBaseExerciseId()` — strips timestamp suffix from session exercise IDs for history matching
  - `persistReplacementEvent()` / `getStoredReplacementEvents()` — localStorage key `repiq-replacement-events`
- Scoring dimensions (weight): movementMatch(30) + muscleMatch(24) + equipmentMatch(12) + fatigueFit(10) + difficultyFit(10) + unilateralFit(10) + angleMatch(8) + roleMatch(6) + trackingFit(5) + preferenceFit(4)
- Hard exclusions: same exercise, already in session, unavailable equipment, reason-specific (machine_taken/no_equipment/too_difficult), **zero shared muscles** between candidate's full muscle set and original's full muscle set
- UI — **Suggested tab**: only ranked candidates, search-filtered, with Equipment unavailable chip to toggle out same-equipment exercises
- UI — **Browse All tab**: full exercise library, alphabetical, with muscle + equipment dropdowns
- UI — **Last replaced with** section: up to 5 prior replacements for this exact exercise (from `ReplacementEvent` history), shown above Possible replacements
- UI — Reason chips (Best match / Machine taken / No equipment / Too difficult / Pain-discomfort / Just a change) rerank Suggested; default: Best match (⋮ menu) or Just a change (swap icon)
- Swaps: in-place (preserves position, rest timer, note, superset); silent if 0 sets logged, confirmation required if sets exist
- Full spec in `docs/smart-replace.md`

## Exercise Taxonomy

- Two-layer taxonomy established: named exercises (user-facing) + structural metadata (analytics/matching)
- Naming convention: `[Angle if not flat] [Equipment] [Base movement]`
- Every exercise in the library will carry: `movementPattern`, `angle`, `equipment`, `difficultyLevel`
- The taxonomy enables:
  - Smart Replace precision: same pattern + same angle + different equipment = best swap
  - Insights aggregation: "Horizontal Push — 18 sets this week" across all press variants
  - Progression tracking across equivalent variants (alternating Barbell/Dumbbell Bench = continuous progress)
  - Progressive overload suggestions: "Ready to try Barbell Bench after 6 weeks of Dumbbell Press?"
- Full taxonomy and `~100` exercise library coverage documented in `docs/smart-replace.md`
- `ExerciseWithTaxonomy` type alias wraps `ExerciseDraft` with optional taxonomy fields for backwards compatibility

## Build Order (Agreed)

### Phase 0 — Backend + Auth (unlocks everything)
- Signup / Login / Logout
- Session tokens, user record
- Sync localStorage → server on first login
- Decision needed: Supabase recommended

### Phase 1 — Onboarding + Home ✅ COMPLETE
- 5-step onboarding flow → PostOnboardingPage reveal ✅
- Home redesign: streak, week-streak, PR banner, week snapshot, last workout card, Training Trend card, Muscle Coverage nudge, context-aware NextSessionCard ✅
- Schedule recommendations pre-filled from profile in onboarding step 5 ✅

### Phase 2 — Psych capture UI ✅ MOSTLY COMPLETE
- Post-workout mood + energy chips + RPE after Report screen ✅ (`PsychCaptureCard` on WorkoutReportPage)
- Daily readiness prompt on Home ✅ (`ReadinessCheckSheet` — shown contextually)
- ❌ Daily Readiness Card on Home (persistent card showing today's readiness score) — not yet built
- ❌ Consent toggles in Profile → Preferences — not yet built

### Phase 2.5 — Insights Analyzer ← NEXT
- Visualize the analytics already computed: Training Trend, Muscle Coverage, Goal Progress
- Surface `computeTrainingTrend()`, `computeMuscleCoverage()`, `computeGoalProgress()` in Analyzer tab (currently "coming soon")
- Volume per movement pattern, week-over-week comparison
- Mood/energy overlays on trend chart (data now being collected)

### Phase 3 — Progress Photos
- Photo capture prompt at Finish Workout
- Insights → Progress tab (timeline + compare)

### Phase 4 — Community
- Groups, friends, leaderboard (friends/group scope first)
- Surface from Home card + Profile initially (not bottom nav yet)

### Phase 5 — V2 Psychological Intelligence
- Skip prediction, deload recommendations
- Motivation-style personalised copy
- Analyzer mood/readiness overlays (builds on Phase 2.5 Analyzer)

### Phase 6 — Payments
- Post-Phase 3 (after users have proven intent to stay)
- Paywall at onboarding end or feature gate

### Immediate next session
- Insights Analyzer tab: surface existing analytics functions into real UI (trends, muscle coverage, goal progress)

## Planned Logger Enhancement

- Add a top sticky guidance strip or expandable coaching tray for in-workout recommendations
- Keep it compact by default and dismissible per session
- Allow the user to re-open guidance later from the bottom of the logger
- Do not overload the same pull-down gesture used for `Alter`

## Meaningful Milestone Reached

The project has moved beyond scaffolding. RepIQ now has a real, testable workout logger foundation with engine-backed coaching architecture and a growing app shell around it.
