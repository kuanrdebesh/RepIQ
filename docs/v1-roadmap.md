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
- In-workout top guidance strip / expandable coaching tray
- Post-finish workout save screen for workout title, notes, attachments, and summary
- Reward detection and records table
- Live workout timer in logger header
- Expanded set-type support including `rest-pause`
- Workout-level between-exercises timer behavior
- Manual collapse / expand for exercise sections in long workouts
- V1 `Muscles Worked` page with:
  - overall workout spread
  - selected exercise focus
  - simple front/back vector intensity map
  - navigation into exercise details

## Phase 4

- Progress dashboard basics
- Session 3 paywall
- Referrals and share-card hooks
- Validation pass on engine accuracy and explanation quality

## Planned Backlog

These are intentionally captured so they do not get lost while we finish the core logger and coaching loop.

### After Core Workout Flow Stabilizes

- Inactivity check-in for active workouts after prolonged no-input periods
- Single-alert behavior for inactivity so duplicate prompts or notifications do not stack
- Optional app notification for inactivity check-ins when permission is granted
- Refine non-logger pages toward white-surface + separator layouts instead of stacked-card treatment
- Full muscle-map expansion:
  - richer anatomical vector
  - more detailed region mapping
  - improved intensity logic and legend
  - stronger overall-vs-exercise comparison view
  - shorter, more compact page layout with less vertical sprawl

### Next Screen Sequence

1. Exercise selector
2. Custom exercise addition
3. Post-finish workout screen
4. Workout plans screen
5. Exercise details / history expansion
6. App shell and navigation polish

### After Theme System Matures

- Curated user-selectable theme packs in settings
- Theme packs should control background, text, button/accent, and highlight colors together
- Theme changes should apply live without restart if token-based theming remains intact
