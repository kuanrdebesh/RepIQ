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

### Reward Presentation

- set-level rewards can show multiple medal + text entries inline
- exercise-level rewards live in the exercise header
- top strip should not become a heavy reward dashboard
- reward summary is better as a centered modal than as a bottom sheet
- session-level rewards should be reserved for completion and summary pages

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

## Optimizations Made During Logger Refinement

- reduced horizontal wasted space in logger cards and strips
- normalized top spacing between stats strip and first exercise
- kept rest-timer row layout stable when pause/stop controls appear
- improved swipe behavior so rows do not get sticky on click
- added carry-forward behavior that writes actual values into inputs when a set is completed
- made previous-set values tappable to fill the current row
- refined collapsed-row height and spacing significantly
- tuned title weight and darkness to reduce visual heaviness

## Current Known Future Work

### Next Major Product Block

1. custom workout creation
2. post-finish workout screen
3. workout plans

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
