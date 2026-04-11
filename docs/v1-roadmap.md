# RepIQ V1 Roadmap

## Phase 1

- Workspace and schema foundation
- Exercise ontology import strategy
- API contracts for programs, sessions, sets, and suggestions
- Engine boundary and reason code vocabulary

## Phase 2

- Onboarding and profile capture
- Program generation request/response flow
- Editable program structure
- Session logger with autosave, history, notes, and exercise settings

## Phase 3

- Overload engine integration
- Plateau detection
- Session-complete recommendation surface
- Home-first app shell instead of logger-first default entry
- Planner foundation:
  - `My Workouts`
  - `Library`
  - `Generate Session`
  - template preview and review/builder path
- Workout builder foundation:
  - create/edit/save
  - drag-reorder exercises
  - plan tags
  - add/remove sets
  - per-exercise rest editing
- Unsaved workout-builder draft persistence
- In-workout top guidance strip / expandable coaching tray
- Post-finish workout save screen for workout title, notes, reward review, and summary/share handoff
- Finish-flow media is limited in V1:
  - allow up to 3 images for progress/self-reference
  - route image persistence through the API media boundary into backend-managed local uploads
  - keep video implementation parked in code
  - re-enable video once durable media persistence/social direction is defined
  - later swap local uploads to cloud/object storage without changing the client contract
- Reward detection and records table
- Reward UX design on the post-finish workout screen:
  - PR / record moments
  - consistency and milestone signals
  - groundwork for shareable reward summaries later
  - support multiple rewards at set, exercise, and session level
  - keep logger-time rewards as small text with light icon support, not intrusive banners
  - allow top-strip reward counts by type only if the strip stays uncluttered
  - show a fuller reward section on the completion flow
- Live workout timer in logger header
- Expanded set-type support including `rest-pause`
- Workout-level between-exercises timer behavior
- Manual collapse / expand for exercise sections in long workouts
- Collapse-all / expand-all control for long workouts
- Active-exercise logic and visual state:
  - active workout follows meaningful in-progress interaction rather than casual card browsing
  - active exercise title carries the primary emphasis
  - collapsed logger rows now use a flatter list pattern
- V1 `Muscles Worked` page with:
  - overall workout spread
  - selected exercise focus
  - simple front/back vector intensity map
  - navigation into exercise details
- Logger reward V1:
  - set-level rewards shown inline as medal + short text
  - exercise-level rewards shown in exercise header
  - top strip limited to set/exercise reward counts
  - reward recompute logic based on workout history plus already-completed same-session work
  - session-level rewards reserved for post-finish surfaces
- `Add Exercise` optimization:
  - browse tabs for `All Exercises`, `By Muscle`, and `Types`
  - quick filters for `In workout` and `Selected`
  - ordered multi-select
  - fixed bottom add-action bar
  - direct custom-exercise creation entry
  - grouped expand / collapse for both `By Muscle` and `Types`
  - token-based search that matches words in any order
  - stable toolbar positioning while grouped controls change state
  - explicit selector detail access via info action
  - repeated sort selection reverses direction
  - custom exercise create/edit flow with guided 2-step structure
  - library-side custom exercise edit/delete/archive management
- Sticky bottom rest dock:
  - full-width timer tray
  - minimize to compact timer FAB
  - between-exercise timer handling
  - quick `-5 / +5` timer adjustments
  - session-level show/hide from workout actions
- Finish-with-incomplete confirmation:
  - go back and finish
  - finish anyway and ignore unfinished rows
- Logger active-flow cleanup:
  - no stale active exercise once all exercises are complete by the current last-set rule
  - expanded-card drag reorder in the logger itself
  - focused expanded-card mode with outside-tap exit
  - precise duration clock based on exact start timestamp
- Navigation/source-of-truth docs:
  - page connectivity and bottom-nav rules in `navigation-map.md`
  - psych-data capture/storage direction in `psych-layer.md`
- Bottom navigation bar (Home / Planner / Insights) implemented with active state
- New app-level views: WorkoutReportPage, InsightsPage, ProfilePage
- Home upgraded with profile avatar, latest workout card, contextual Quick Workout state
- Post-finish flow routes through Report before Share
- Psychological data layer types and storage helpers stubbed in App.tsx:
  - UserPsychProfile, PostWorkoutPsych, DailyReadiness, SessionBehaviorSignals, DerivedPsychProfile
  - Five localStorage keys reserved
  - Passive session behavior capture wired at save time
- Smart Replace foundation:
  - MovementPattern, ExerciseAngle, ExerciseEquipment, ExerciseDifficulty types
  - scoreReplacement() and getSmartReplacements() scoring engine
  - ReplacementEvent storage for V2 learning
  - groupSetsByMovementPattern() for Insights aggregation
- Exercise taxonomy: two-layer system (named exercises + structural metadata) designed
- Design docs: navigation-map.md, psych-layer.md, smart-replace.md

## Phase 4

- Smart Replace UI: SmartReplaceSheet component with reason picker + ranked suggestions
- Exercise library enrichment: populate movementPattern, angle, equipment, difficultyLevel on all ~100 exercises
- Insights and Reports integration: WorkoutReportPage fully wired, Insights Reports tab shows history
- Insights → Progress tab: photo timeline, compare mode, Add Photo prompt
- Goal Planner refinement and onboarding alignment
- Profile, account, preferences, and import/export wiring
- Community foundation: Groups, Friends, Leaderboard (friends/group scope)
- Post-workout psych capture UI: mood + energy chips on Report screen
- Home daily readiness card

## Planned Backlog

These are intentionally captured so they do not get lost while we finish the core logger and coaching loop.

### After Core Workout Flow Stabilizes

- Inactivity check-in for active workouts after prolonged no-input periods
- Single-alert behavior for inactivity so duplicate prompts or notifications do not stack
- Optional app notification for inactivity check-ins when permission is granted
- Refine non-logger pages toward white-surface + separator layouts instead of stacked-card treatment
- Test whether subtle in-logger micro rewards add motivation without becoming distracting
- Design reward-aware share cards:
  - reward counts/types in the main summary
  - separate reward-only card
- Keep colored highlight treatments gradient-based / slightly shiny rather than flat
- Full muscle-map expansion:
  - richer anatomical vector
  - more detailed region mapping
  - improved intensity logic and legend
  - stronger overall-vs-exercise comparison view
  - shorter, more compact page layout with less vertical sprawl

### Next Screen Sequence

1. Library workout optimization and filters
2. Workout builder refinement
3. Goal Planner / generation refinement
4. Insights and reports integration
5. Profile / import-export / account wiring

### Smart Replace
- Populate movementPattern + angle + equipment + difficultyLevel on all exercises in exerciseLibrary
- SmartReplaceSheet: reason picker (1 tap) → ranked suggestions (top 5 with match reason chip)
- Wire existing "Replace exercise" ⋮ menu item to the sheet
- Confirm swap if sets already logged; silent swap if 0 sets
- Contextual "Having trouble with this one?" hint on zero-progress exercises after 5+ min
- "Browse all" fallback filtered by primary muscle
- Log ReplacementEvent per swap for V2 learning

### Exercise Taxonomy Enrichment
- Each exercise in exerciseLibrary needs: movementPattern, angle, equipment, difficultyLevel
- Custom exercise creation form needs movementPattern selector
- ~100 exercises covering all practical gym variants

### Progress Photos (Phase 3)
- Photo capture at Finish Workout (prompted, never mandatory)
- Insights → Progress tab: chronological timeline, session data overlay, compare mode
- Private by default; explicit share action required

### Community (Phase 4)
- Groups: create, join (invite or link), activity feed (opt-out), leaderboard
- Friends: search by username, pending requests, friend profile (shared workouts only)
- Leaderboard: weekly streak/sessions, monthly volume/PRs/improvement%
- Default scope: friends/group — never global by default
- Surface from Home card + Profile until feature has density; then promote to bottom nav

### Psychological Intelligence V2
- Skip prediction: surface lighter alternative on high-risk days
- Deload recommendation: mood trend declining + high load = deload suggestion
- Motivation style derivation from adherence patterns
- Insights → Analyzer: mood/readiness trend overlay on training graphs
- Goal drift detection: stated goal vs actual session behaviour

### After Theme System Matures

- Curated user-selectable theme packs in settings
- Theme packs should control background, text, button/accent, and highlight colors together
- Theme changes should apply live without restart if token-based theming remains intact
