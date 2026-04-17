# Architecture Decision

## Why not local-only?

RepIQ's trust loop depends on persistent history:

- logged sessions across weeks
- rule-based suggestions tied to prior performance
- return-from-break detection
- reward records and milestone tracking
- paywall timing after Session 3

A local-only prototype would be useful for UI exploration, but not for the product's core value. That is why this repo starts with a real backend boundary and a real schema boundary.

## Chosen structure

- Web first, not native first
- Supabase for auth and Postgres
- Node API for product workflows and integration points
- Python engine service for auditable training logic
- Shared domain package for app and API contracts

## Mobile-Ready Direction

- the current web app should behave like the first client, not the only client
- a future mobile app should be able to reuse:
  - API contracts
  - engine contracts
  - workout/session domain rules
  - media constraints
- client-specific behavior should stay at the edge:
  - browser file picking
  - native media picking
  - notifications
  - local device storage

## Media Boundary

- finish-workout images are a real product need for progress/self-reference
- media should not be persisted as temporary browser blob URLs long-term
- RepIQ should use a backend-managed media contract even before cloud storage exists
- near-term beta path:
  - frontend requests media constraints and an upload slot from the API
  - API owns the storage target
  - local uploads folder can sit behind the API first
- later production path:
  - keep the same contract
  - swap storage target from local uploads to cloud/object storage

## Architectural Modifications Applied

- shared media schemas now live in `packages/shared`
- API now exposes a media boundary via:
  - `GET /v1/media/config`
  - `POST /v1/media/prepare`
- this keeps the repo ready for:
  - beta web users with backend-managed uploads
  - a later mobile client using the same media handshake

## First vertical slice

1. User profile created
2. Program request stored
3. Session loaded from program
4. Sets logged and saved
5. Engine computes next suggestion
6. Suggestion shown on session complete

If this loop does not feel trustworthy, nothing else matters yet.

## Plan Generation Architecture

### V1 — Rules Engine (no AI)

- Plan generation is a pure function: `UserPsychProfile → PlanStructure`
- Input: goal, experience level, days/week, session length, split preference, equipment, returning-after-break flag
- Output: structured plan (split type, mesocycle length, weeks array, exercise slots per day)
- Lives in the Python engine service — deterministic, testable, zero external cost
- No API calls; runs synchronously or as a fast async task

### V2 — Hybrid (rules skeleton + AI exercise selection)

- Rules engine still produces the skeleton (split, days, volume landmarks)
- Claude Haiku fills exercise slots per day given full user profile context
- AI prompt receives: plan skeleton + UserPsychProfile + exercise catalog subset (filtered by movement pattern + equipment)
- Response must be validated against catalog before storage (exercise name match, set/rep bounds check)
- Falls back to rules-only if AI call fails — transparent to user
- This is a paid feature — gated at the API layer, not the client layer
- Do not add the AI integration path to the engine until V2 is scoped and payment layer is in place

## Captured Follow-On Design Notes

These are not first-slice blockers, but they are part of the intended product direction and should stay visible in planning.

## Navigation Reference

- app-level page connectivity, entry points, and bottom-nav visibility now live in `docs/navigation-map.md`
- this should be treated as the source of truth for:
  - which pages are top-level destinations
  - which flows are focused/full-screen task flows
  - how users move between planner, logger, finish, insights, and profile

## App Shell Direction

- the app is now being shaped around:
  - `Home`
  - `Planner`
  - `Insights`
- `Profile` remains app-level, but is intentionally reached from `Home` instead of consuming a bottom-nav slot
- `Logger`, `Workout Builder`, `Add Exercise`, `Finish Workout`, and report/detail flows are treated as focused task flows and should hide global navigation

## Local State And Persistence Boundaries

- active workout state remains client-owned for now
- planner state is now split into:
  - reusable saved plans/templates
  - generated review/builder state
  - unsaved builder draft persistence in local storage until saved or discarded
- workout elapsed time should be derived from a precise `startInstant`, not only hour/minute strings, so fresh sessions and resumed sessions behave consistently
- session-only UI controls should remain separate from workout defaults:
  - example: bottom rest timer visibility belongs to the active session/action sheet, not to reusable workout settings

## Psychological Data Layer Boundary

- psych/mood/readiness data is now documented and partially stubbed as a separate client data layer
- the reference lives in `docs/psych-layer.md`
- this layer is intentionally separate from workout-save payloads:
  - linked by session id
  - nullable by default
  - privacy-sensitive
  - ready for later sync/encryption work
- current status:
  - schemas and storage helpers are being prepared
  - capture UI and downstream coaching/report usage are still future work

### Inactivity Check-In

- Only relevant when a workout is active
- Trigger after a long period of no meaningful input, starting with an hourly check cadence
- Support both in-app reminder UI and optional system notification
- Deduplicate alerts so the user never sees multiple concurrent inactivity prompts of the same kind

### User Theme Packs

- Theme preference is app-level, not per-screen
- Extend the token-based theme system with curated presets rather than arbitrary freeform colors first
- Each preset should define background, surface, text, accent/button, and highlight tones together
- Apply changes live without restart wherever possible

## Equipment Access Model

Equipment access is split into two independent axes:

**Tier** (`EquipmentAccess` — pick one): `bodyweight` → `dumbbell_pair` → `home_setup` → `basic_gym` → `full_gym`. Each tier is a superset of the one below. Kettlebell is included from `dumbbell_pair` upward.

**Standalone add-ons** (`additionalEquipment: string[]` on `UserPsychProfile` — opt-in, independent of tier):
- `resistance_band` — bands are not implied by any gym tier
- `suspension_trainer` — TRX; detected on exercises via `implement` field
- `cardio` — cardio machines (rower, treadmill, bike, ski erg etc.)

Scoring and generation build the allowed-equipment set as: `tierTypes ∪ additionalEquipment`. This replaces the current code which incorrectly bundles `resistance_band` and `freestyle_cardio` into the tier table. Refactor is tied to the CSV import sprint.

## Exercise Taxonomy Architecture

- Each exercise in the library carries three structural metadata fields in addition to existing muscle data:
  - `movementPattern: MovementPattern` — 14 patterns (horizontal_push, vertical_pull, hip_hinge, squat, etc.)
  - `angle: ExerciseAngle` — flat / incline / decline / overhead / neutral / prone / none
  - `equipment: ExerciseEquipment` — barbell / dumbbell / cable / machine / bodyweight / kettlebell / band / landmine / smith_machine
  - `difficultyLevel: ExerciseDifficulty` — beginner / intermediate / advanced
- The `ExerciseWithTaxonomy` type alias wraps `ExerciseDraft` with optional taxonomy fields for backwards compatibility
- Naming convention: `[Angle if not flat] [Equipment] [Base movement]` — e.g. "Incline Dumbbell Press"
- Analytics and Smart Replace always operate on structural metadata, never on exercise names
- The `groupSetsByMovementPattern()` helper aggregates session volume by pattern family for Insights use

## Smart Replace Architecture

- Scoring is a pure function: `rankCandidate(original, candidate, sessionExercises, reason, availableEquipment, userLevel, replacementHistory) → RankedReplacement | null`
- 10 weighted dimensions (max 119 pts): movementMatch(30) + muscleMatch(24) + equipmentMatch(12) + fatigueFit(10) + difficultyFit(10) + unilateralFit(10) + angleMatch(8) + roleMatch(6) + trackingFit(5) + preferenceFit(4)
- Hard exclusions applied before scoring: same exercise, already in session, unavailable equipment (tier + add-ons), reason-specific filters, zero shared muscles between full muscle sets
- `diversifyByEquipment()` — post-sort pass capping each equipment type at 2 reps before appending overflow; ensures ranked results span multiple equipment classes
- `inferMovementSide()` — reads `movementSide` field if set; otherwise checks exercise name for "single-arm", "single-leg", "one-arm", "one-leg", "unilateral" tokens
- `getBaseExerciseId()` — strips timestamp suffix (e.g. `bench-press-1748...-1` → `bench-press`); used for history matching and session-duplicate checks
- `getSmartReplacements()` returns the full ranked + diversified list; UI filters to Suggested or Browse All depending on active tab
- `ReplacementEvent` is logged per swap to `repiq-replacement-events` for V2 pattern learning
- The scoring engine has no external dependencies — it runs entirely client-side against the exercise catalog
- V2 will extend this with server-side personalisation using replacement history and psych profile

## Community Data Boundary (Future)

- Community features require backend: groups, members, leaderboard scores, activity feed, friend relationships
- All community data is user-scoped and server-owned — nothing is derived from localStorage
- Psych data, progress photos, and training data are never automatically shared with community features
- Explicit share actions per item are required — no implicit visibility
- Leaderboard scores are derived server-side from session data — not from client-reported numbers
