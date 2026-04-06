# RepIQ Project Status

## Current State

RepIQ has a working project foundation across the web app, API, engine, shared types, and planning docs. The product is still pre-V1, but the core workout-logger direction is now established and testable.

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
- App-level theme system exists with:
  - Light
  - Dark
  - System
- Styling is token-based, which keeps the door open for future curated theme packs

## Logger Flow

- Workout header includes:
  - back button
  - session name
  - elapsed timer
  - `Alter`
  - `Finish`
- The active workout timer now ticks live while the logger stays open
- Exercise logging includes:
  - editable notes
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
- Workout-level actions are grouped under `Alter`
- A top in-workout guidance strip now exists with a first-pass shutter interaction
- Guidance still remains available in the bottom section as the stable fallback

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

## Additional Screens

- `Add Exercise` is now a separate page with a back button
- A simple workout resume/selector shell exists to support leaving and returning to an active workout
- A dedicated post-finish workout screen is planned for workout naming, notes, attachments, and save/share summary flow

## UX Direction Locked In

- Trust-first, readable, non-hyped interface
- Calm light theme with restrained accent color
- Dark mode should feel calm and legible, not neon
- Contextual exercise actions are better as bottom sheets than small popovers
- Logger should stay dense and fast
- Deeper exercise intelligence belongs outside the main logging surface
- In-workout guidance should be accessible near the top, dismissible, and restorable later without conflicting with the pull-down `Alter` interaction
- Non-logger pages should prefer white page surfaces with separators over heavy stacked card treatment

## Captured Follow-On Features

These are documented and should not be forgotten:

- Inactivity check-in for active workouts after long no-input periods
- Deduplicated inactivity notifications/prompts
- Curated user-selectable theme packs in settings
- Full anatomical muscle-map upgrade:
  - richer vector illustration
  - more precise front/back muscle regions
  - smoother gradients / intensity legend
  - clearer comparison between overall workout and selected exercise

## Most Likely Next Screens

1. Exercise selector
2. Custom exercise addition
3. Post-finish workout screen
4. Workout plans screen
5. Exercise details / history expansion
6. App-level shell with clearer navigation between `Today`, `Workouts`, `Analyze`, and `Profile`

## Planned Logger Enhancement

- Add a top sticky guidance strip or expandable coaching tray for in-workout recommendations
- Keep it compact by default and dismissible per session
- Allow the user to re-open guidance later from the bottom of the logger
- Do not overload the same pull-down gesture used for `Alter`

## Meaningful Milestone Reached

The project has moved beyond scaffolding. RepIQ now has a real, testable workout logger foundation with engine-backed coaching architecture and a growing app shell around it.
