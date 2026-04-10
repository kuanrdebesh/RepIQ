# RepIQ Product Management Log

This document captures product decisions, interaction principles, and UI optimizations that were intentionally chosen during V1 shaping. It exists so the team can preserve decision-making context instead of re-litigating the same UI questions later.

## Current Product Priority

RepIQ's most important product surface remains:

- in-workout logger
- live guidance during the workout
- analysis and planning after the workout

The logger is the trust-building surface. The post-finish and planning surfaces should build on that trust, not replace it.

## Decision Principles

### Guidance Should Feel Anticipated, Not Annoying

- guidance should be visible enough that users look for it
- guidance should not interrupt normal logging too aggressively
- the first layer should stay short:
  - one clear tip
  - one quiet why
- deeper explanation should be available on demand

### Rewards Should Mean Progress, Not Activity

- rewards should only signal meaningful progress
- logger rewards must stay small and non-intrusive
- session-level reward emphasis belongs in completion and summary flows
- the app should avoid cheap or inflated reward moments

### Logger Density Matters

- the logger should stay compact and fast
- deeper intelligence belongs in adjacent surfaces, not inside every row
- collapsed rows should help navigation, not create another heavy layer of UI

### Non-Logger Pages Should Stay Calm

- use white surfaces and clean separation
- avoid stacked-card overload outside the logger when possible
- dark mode should preserve clarity without neon or muddy contrast

## Key Decisions Captured

### App Navigation And Page Roles

- the app should no longer feel like a logger-first prototype on refresh
- `Home` is now the operational launch surface
- `Planner` is now the build/manage surface
- `Insights` should own analyzer-style understanding plus reports
- `Profile` remains important, but should be reached from `Home` instead of consuming a bottom-nav slot
- bottom navigation should be reserved for the highest-frequency destinations only:
  - `Home`
  - `Planner`
  - `Insights`
- focused task flows should hide bottom nav:
  - logger
  - builder
  - add exercise
  - custom exercise
  - finish workout
  - report detail

### Home And Planner Information Architecture

- `Ready to Train` belongs inside `Home`, not as a separate top-level destination
- `Quick Session` should create a fresh blank session, not act like a lightweight resume
- `Planner` should center around:
  - `My Workouts`
  - `Library`
  - `Generate Session`
- `Generate Session` should be visible, but should not visually replace the identity of `Planner`
- `Create Template` belongs to the `+` action, not the main heading structure
- generated sessions should always stop at review/builder before logger entry
- `Goal Planner` should live under `Planner`, not become its own app-level destination

### Workout Builder Principles

- builder bottom tray should stay simple:
  - save only
- back already exists in the top bar and should not be duplicated
- builder should feel calmer than logger:
  - editable
  - ordered
  - structured
  - not like a dense live-session surface
- tags should be typeable and create-on-demand, not preloaded with a heavy fixed folder taxonomy
- unsaved new-workout drafts should persist until the user saves or discards them deliberately

### Logger Structure

- top row now focuses on:
  - back
  - session name
  - settings
  - collapse / expand
- workout completion remains primarily at the bottom as `Finish Workout`
- `Discard` now requires confirmation
- leave-workout confirmation uses a centered modal rather than a bottom tray

### Active Exercise Logic

- default active exercise is the first not-started exercise
- before the workout starts, interacting with another exercise can make it active
- once an exercise is in progress, casual interaction elsewhere should not steal active focus
- completing a set in another exercise can move active focus there
- active indication is now title-led:
  - blue exercise name
  - green status dot
- when all exercises are complete by the current rule, there should be no stale active highlight

### Collapsed Logger Pattern

- collapsed exercises should behave like a flatter list
- collapsed rows should not feel like full cards
- collapsed rows still need:
  - exercise name
  - logged volume
  - reward summary
  - superset visibility
  - completed-state signal

### Guidance Presentation

- user-configurable guidance display is preferred over hardcoded behavior
- current supported display options:
  - top strip
  - inline
  - both
  - neither
- inline guidance is subtle and exercise-local
- tapping inline guidance opens a centered modal for more context
- collapsed guidance should show exercise/workout context plus tip preview
- experimental auto-pop-up guidance after exercise completion was removed
- guidance card should stay content-led:
  - exercise/workout context is secondary
  - main tip is the primary emphasis
  - no exercise = no guidance surface

### Reward Presentation

- set-level rewards can show multiple medal + text entries inline
- exercise-level rewards live in the exercise header
- top strip should not become a heavy reward dashboard
- reward summary is better as a centered modal than as a bottom sheet
- session-level rewards should be reserved for completion and summary pages

### Finish Workout V1 Boundary

- the finish-workout flow should stay lean:
  - review
  - reward
  - save
  - share/report handoff
- the logger session name should be preserved into the finish flow
- a generated workout name should only be used when no session name exists yet
- whatever title the user leaves in the finish `Save Details` section is the title that gets saved
- finish-flow media is intentionally limited in V1
- up to 3 images are allowed in the finish flow for progress/self-reference
- video remains parked in code and hidden from the V1 UI
- media should return when RepIQ has a real persistence model for:
  - social/feed posting
  - or durable self-reference
- app-only temporary media state is not a trustworthy long-term model
- preferred future direction:
  - user selects from phone media
  - RepIQ stores its own managed copy
  - in local/dev environments, that now goes through the API media boundary into backend-managed local uploads
  - later syncs to app/cloud storage as needed
- current limitation:
  - images are supported, but video stays parked until the persistence/social path is worth shipping

### Add Exercise Optimization

- the selector should support fast browsing, not only search
- tabs now organize browsing into:
  - all exercises
  - by muscle
  - by type
- search should stay visible and stable
- quick thin filters should make it easy to inspect:
  - in-workout exercises
  - selected exercises
- multi-select order matters and should determine add order
- custom exercise creation should remain easy to reach from the selector
- grouped tabs should support expand / collapse consistently
- row controls should not jump when `Expand all / Collapse all` changes text
- search should behave like keyword intent, not strict continuous substring matching
- selector rows should support both:
  - direct selection
  - explicit detail inspection through a dedicated info action
- custom exercise creation should feel guided, not form-heavy:
  - 2-step flow
  - visible progress chips
  - stronger discoverability for secondary muscles once primary muscles are chosen
- custom exercises should be manageable from the exercise detail page:
  - edit existing custom exercise
  - delete if unused
  - hide/archive from library once history exists
- duplicate exercise names should not be silently accepted:
  - during direct creation, the user should choose to rename or save as `_1`
  - future import flows should reuse the same unique-name helper automatically

### Planner And Library Card Behavior

- `My Workouts` cards should feel like manageable assets:
  - reorderable
  - editable
  - shareable
  - duplicable
  - taggable
- `Library` should stay browsable and filterable, not user-reorderable by default
- planner content under the tab selector benefits from stronger contrast/tinting than plain white when the surrounding layout starts feeling too empty
- planner action buttons should read like buttons, not like content sections in disguise

## Optimizations Made During Logger Refinement

- reduced horizontal wasted space in logger cards and strips
- normalized top spacing between stats strip and first exercise
- kept rest-timer row layout stable when pause/stop controls appear
- improved swipe behavior so rows do not get sticky on click
- added carry-forward behavior that writes actual values into inputs when a set is completed
- made previous-set values tappable to fill the current row
- refined collapsed-row height and spacing significantly
- tuned title weight and darkness to reduce visual heaviness
- simplified the finish-with-incomplete prompt so it does not offer a misleading reset path
- reduced default logger seed size to 5 exercises for a lighter starting state
- added drag-reorder directly from expanded exercise headers
- added a sticky bottom rest dock with:
  - full-width tray treatment
  - minimize-to-FAB behavior
  - progress line
  - quick timer adjustment controls
- moved bottom-rest-dock visibility into workout actions because it is a session-level preference, not a reusable workout-level default
- changed quick/fresh sessions and plan starts to use precise session timestamps rather than deriving duration only from hour/minute strings
- moved current-set carry-forward toward lighter placeholders rather than hard-filled next-set values
- added focused expanded-card mode for collapsed→expanded logger transitions only

## Timer Decision Log

- the app currently treats an exercise as complete when its last set is marked done
- that rule should drive:
  - active exercise resolution
  - between-exercise timer handoff
  - end-of-workout state
- only clicking the actual last set row should count as the exercise-boundary completion event
- completing some earlier set later should still behave like an intra-exercise completion and start normal rest timing

## Current Known Future Work

### Next Major Product Block

1. library workout optimization and filter refinement
2. workout builder refinement
3. goal planner and generated-workout refinement
4. insights / reports integration
5. profile, preferences, account, and import/export wiring

### Guidance Refinement Later

- continue refining guidance visual hierarchy
- test whether top strip or inline becomes the stronger long-term behavior
- preserve the principle that guidance should feel like something users want to check next

### Reward Refinement Later

- completion-page reward section
- reward-aware summary cards
- shareable reward summaries

### Muscle Surface Later

- shorten the `Muscles Worked` page
- replace current V1 visuals with more realistic vectors
- improve scannability and reduce vertical sprawl
