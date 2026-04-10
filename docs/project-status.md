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

- Exercise actions exist through a bottom sheet
- Supported actions include:
  - view details
  - replace exercise
  - reorder
  - remove exercise
  - add to superset / remove from superset
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

## Most Likely Next Surfaces

1. Library workout optimization and filters
2. Workout builder refinement
3. Goal Planner / generation refinement
4. Insights and reports integration
5. Profile, preferences, and import/export wiring
5. App-level shell with clearer navigation between `Today`, `Workouts`, `Analyze`, and `Profile`

## Planned Logger Enhancement

- Add a top sticky guidance strip or expandable coaching tray for in-workout recommendations
- Keep it compact by default and dismissible per session
- Allow the user to re-open guidance later from the bottom of the logger
- Do not overload the same pull-down gesture used for `Alter`

## Meaningful Milestone Reached

The project has moved beyond scaffolding. RepIQ now has a real, testable workout logger foundation with engine-backed coaching architecture and a growing app shell around it.
