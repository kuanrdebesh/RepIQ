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

### Simplicity Should Be A First-Class Mode, Not An Accident

- RepIQ should support a lower-cognitive-load mode for less tech-savvy users
- this mode should reduce visible text, decisions, and branching
- defaults should carry more of the flow
- advanced controls should stay available, but behind deliberate reveal points
- the same product can support:
  - a simple guided mode
  - a fuller advanced mode

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
- trainer workflows should not be mixed into member navigation by default
- trainer should be treated as a distinct product path with its own home, navigation, and task hierarchy

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
- simple-mode entry points should bias toward:
  - `Start Workout`
  - `Resume Workout`
  - `History`
- advanced planning and configuration should remain reachable without dominating the main path

### Identity And Public Profile Direction

- every user should have:
  - an internal immutable `user_id`
  - a public shareable `username` / handle
- the product must never use the public handle as the system-of-record identity
- all durable links and relations should be tied to `user_id`
- usernames should be availability-checked and public-facing
- current direction:
  - free users receive an auto-generated username
  - paid users can customize it, subject to availability
- future username changes should not break trainer relationships, profile links, imports, or saved references because those remain tied to `user_id`

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

### Simplicity / Role / Identity To-Dos

1. define `Simple Mode` as an intentional low-text, low-choice product layer
2. identify page-by-page simple-mode variants for:
   - Home
   - Logger
   - Finish Workout
   - Planner entry points
   - Settings / Preferences
3. define onboarding / auth split for:
   - member path
   - trainer path
4. design trainer-first navigation and dashboard separately from member mode
5. define identity model:
   - immutable internal `user_id`
   - public `username`
   - future display name / trainer-visible profile metadata
6. define username policy:
   - availability
   - free vs paid edit rules
   - rename behavior
   - reserved words

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

## Navigation and Page Design Decisions

### Bottom Navigation Slot Discipline
- Bottom nav is reserved for the three highest-frequency destinations: Home, Planner, Insights
- Profile stays accessible from Home (top-right avatar) — not in bottom nav
- Community will be built in full but surfaced from Home card + Profile initially; it earns a bottom-nav slot only after it has proven density and daily return value
- The nav slot decision is a product milestone, not a technical one

### Home as a Motivation Surface
- Home is not a task launcher — it is a momentum and motivation surface
- Every return visit should show the user their own progress reflected back at them
- Content hierarchy: contextual greeting + streak → primary CTA (context-aware, never static) → this week snapshot → last workout card → recent PR highlight → planner shortcut
- The primary CTA label must change based on context: active plan → "Continue Push Day A →"; no plan → "Start a session →"; just trained yesterday → "Rest day — review your week →"
- Streak is always visible, even at 0 — "Start your streak today" is motivating, not punishing
- No feature promotion on Home. No banners. Home belongs to the user's own story.
- Home empty state (no workouts logged): prompt to complete onboarding or start first session — not an empty screen

### Onboarding as an Experience
- Onboarding is the most important first-impression surface in the product — not a form
- Emotional arc: arrive with hope/skepticism → feel seen → feel understood → feel anticipation → feel the reveal → feel momentum
- Step 1 asks "What finally made you open this?" (emotional why) — not "select your goal"
- Each step reflects their answers back: "So you're training 4 days/week with a full gym, focused on strength"
- The generate step is a ritual — exercises appearing, days filling in — not a spinner
- The reveal names the plan after their goal, shows week 1 as a visual schedule, has one highlighted stat that speaks to their why
- Primary CTA at reveal: "Start today →" — goes straight into session 1 — zero friction
- Skip is always available on steps 2–5, never on step 1 (the emotional opener)
- Splash / Landing: single strong line ("Train smarter. Every session."), two buttons, nothing else

### Onboarding ↔ Goal Planner Shared UI
- The in-app Goal Planner and the onboarding flow share the same step UI and generation logic
- The difference is a `returnTarget` parameter: onboarding → "home"; in-app → "builder"
- This means the Goal Planner also gets the same motivating reveal moment — not just new users

## Smart Replace Design Decisions

### Entry Points (Two, Intentionally Different)
- ⋮ menu "Replace exercise": full flow with reason picker → `best_match` default reason → ranked browse with hint chips
- ⇄ swap button on exercise card header: shortcut path with `just_change` reason → skips reason picker → ranked browse with hint chips
- A secondary contextual hint may appear below exercises with 0 logged sets after 5+ minutes (not yet built)

### Reason Picker is Not Optional for Full Replace Flow
- The reason picker (machine taken / no equipment / too difficult / pain / best match / just change) drives the equipment filter
- "Machine taken" → exclude machines from results
- "No equipment" → bodyweight only
- "Too difficult" → difficulty tier weights down advanced exercises
- The reason is logged as a `ReplacementEvent` for V2 learning
- `just_change` applies no filter — the user explicitly wants variety, not a constrained alternative

### Browse-First, Not Ranked List
- The replace UI opens the full exercise browse, not a forced ranked suggestion sheet
- `smartReplacementMeta` provides rank hint chips per row — informational, not prescriptive
- Rationale: ranked suggestion lists create false confidence when taxonomy is incomplete; browse-with-hints preserves user agency and makes no algorithmic promise
- This decision stands until the full exercise taxonomy is verified and complete

### Scoring Principles
- 10-tuple lexicographic ranking: movement > muscle > angle > equipment > reason > difficulty > tracking > preference > fatigue > novelty
- No numeric scores shown to the user. Ever.
- Session balance: fatigue tier (position 8) penalises muscles already heavily worked in the session
- Movement family awareness: push stays push, hinge stays hinge — the user doesn't need to understand this

## Exercise Taxonomy Decisions

### Two-Layer Principle
- Users see and log named exercises: "Incline Dumbbell Press"
- The analytics engine reads structural metadata: horizontal_push · incline · dumbbell
- Both needs are served by the same exercise record — name is the label, metadata is the intelligence
- This is not an either/or — conflating the two layers is the mistake

### Library Size Discipline
- ~100 well-structured exercises is better than 300 poorly-tagged ones
- Only include variants that people actually do in real gyms
- Naming convention: [Angle if not flat] [Equipment] [Base movement]
- Every exercise needs: movementPattern, angle, equipment, difficultyLevel

### What the Taxonomy Enables
- Smart Replace precision: same pattern + same angle + different equipment = best possible swap
- Insights: "Horizontal Push — 18 sets this week" aggregated across all press variants — the user sees insight, not a name list
- Progression across variants: alternating Barbell Bench and Dumbbell Press = continuous progress on the same movement
- Progressive overload suggestions that bridge variants: "Ready to try Barbell Bench after 6 weeks of Dumbbell Press?"

## Psychological Data Layer Decisions

### Capture Philosophy
- Psychological data must be collected from V1 even though the intelligence ships in V2
- A user who has been logging for 6 months with psych data has 10× more coaching value than one who hasn't
- All capture is optional, contextual, and under 10 seconds per session
- Never ask psychological questions in the middle of a workout — only at natural pause points

### Capture Points (V1)
- Onboarding Step 1: emotional "why" — already planned, zero extra cost
- Finish Workout (after Report): post-session mood + energy (two 5-point emoji scales, 3 seconds)
- Home daily card (max once/day, dismissible): sleep quality + stress + energy (three 3-point icon selectors)
- Passive at save: SessionBehaviorSignals auto-captured — day of week, time of day, completion rate, session source — zero user input

### Privacy Rules (Non-Negotiable)
- All psych data lives under repiq-psych-* keys, separate from training data
- Never included in plan shares, shareable cards, or any community feature
- Any individual capture dimension can be disabled independently
- On account deletion: psych data destroyed immediately, no archive
- The derived profile (motivation style, patterns) is never surfaced to the user as a label — it only influences UI behaviour silently
- Exception: Insights → Analyzer (V2) will show users their own patterns on explicit opt-in

## Community Design Decisions

### Cold-Start Discipline
- Community is built in full but not given a bottom-nav slot until it has proven density
- A ghost-town community tab visible every day kills motivation faster than no community
- Surface from Home card ("Your groups") and Profile until the feature earns its slot

### Social Surface Minimalism
- RepIQ is a training app, not a fitness influencer platform
- No public walls, no follower counts, no like counts, no feed scrolling
- Groups are the container — small, purposeful, invite-based or link-join
- Reactions are a single emoji per session (🔥 is enough)
- The re-engagement hook is the leaderboard notification: "Sarah just overtook you" — not content feeds

### Leaderboard Design
- Weekly resets for streak and sessions — newcomers can always compete, no legacy advantage
- Monthly resets for volume, PRs, improvement % — rewards sustained effort
- Default scope is always friends or group — global is deprioritised in UI
- Improvement % metric is key for retention: a beginner improving 15% beats a veteran improving 2%

## Plan Generation Decisions

### V1: Rules-Based Only

- V1 plan generation is fully rule-based: `goal + experience + days/week + split preference → template`
- No AI API calls in V1 — zero per-generation cost, instant output, fully predictable
- Two users with identical inputs will receive identical plan structures — accepted as a V1 limitation
- Rules handle the skeleton: split type, days per week, mesocycle length, volume landmarks per muscle group
- Exercise slot selection within that skeleton is drawn from the exercise catalog by movement pattern + difficulty + equipment

### V2: AI-Assisted Generation (Charged Feature)

- V2 upgrades plan generation to a hybrid model:
  - Rules still own the skeleton (guarantees structural validity and fallback)
  - AI (Claude Haiku) fills exercise slots given the user's full psych profile, equipment, injury flags, and returning-after-break context
  - AI also writes a 2–3 sentence "why this plan" summary surfaced to the user
- AI plan generation is a **paid feature** — gated behind a V2 subscription tier or add-on
- Rationale: psychological parameters (motivation style, skip patterns, deload signals) only become meaningful after several months of data; charging for it aligns cost and value timing
- Estimated cost: ~$0.01 per generation (Haiku, ~1K in / ~2K out); 1,000 users × 5 regenerations ≈ $50 — negligible until scale justifies a pricing review
- Latency: 4–8 seconds — UI must show a "building your plan" animation (not a bare spinner)
- Validation layer required in V2: AI output must be checked against the exercise catalog before rendering (exercise names, set/rep sanity)
- If AI is unavailable, rules-based fallback produces a valid plan silently — no degraded UX shown to user

### Plan Regeneration (Both Versions)

- When a user changes split, goal, or timing in plan detail, the plan regenerates from scratch (not adjusted forward)
- Animation shown during regeneration: "Doing science — building the best plan for you"
- Week unlock rule: week N+1 unlocks when week N is marked completed; user can preview the next week but cannot access workouts beyond `plan_start_date + current_day + 7`

## Plan Detail Page Action Hierarchy

- Three actions exist on a plan detail page: Start Workout (primary), Edit, Delete
- Start Workout is a full-width primary button occupying its own `plan-detail-actions-top` row
- Edit and Delete are compact icon-only buttons (44×44px) placed to the right of the Start Workout button in the same row — no separate secondary row beneath
- Edit uses a pencil outline SVG; Delete uses a simple outlined trash SVG with no fill texture; Delete button uses red (`#ef4444`) border and stroke
- This pattern keeps three actions on one bar without creating visual hierarchy confusion from a second row

## History Detail Page — Edit And Share

- Completed RepIQ sessions always show both "Edit Session" and "Share Summary" buttons — no conditional hiding based on logged data
- Reasoning: if a session appears in history, the user expects to be able to share the completion record and re-edit it
- Edit Session opens the logger with timer pre-seeded from the original session duration
- Share Summary opens the Workout Report page for the session
- Editing a session currently appends a new saved-workout entry; the save-as-update (overwrite original entry) behavior is deferred to the Workout History sprint
- The dual-button layout uses `history-detail-actions` flex row: secondary "Edit Session" + primary "Share Summary" — both `flex: 1` so they split the width equally

## Finish Modal Consolidation

- Blank-set warnings and incomplete-set warnings are combined into a single confirmation modal
- Modal offers "Go Back And Finish" or "Finish Anyway" — the same options serve both empty-reps and incomplete sets
- Rationale: two separate modals in sequence create unnecessary friction and cognitive overhead

## needsReview Banner — Dismiss Action

- The needsReview banner always shows a "Dismiss" button alongside "Regenerate remaining sessions"
- Dismiss clears the `needsReview` flag without triggering a regeneration
- Rationale: users may acknowledge the change and choose not to act — they should not be forced to regenerate or live with a permanent banner

## Progress Photo Decisions

### Privacy First
- Progress photos are private by default, always
- Sharing requires an explicit tap — never automatic
- No progress photos visible in community without deliberate share action per photo

### Presentation
- Full-width cards, most recent first
- Semi-transparent dark gradient overlay at bottom: date chip + session name + 2–3 stats
- Overlay never obscures the face/body — gradient only from bottom edge
- Tap → full-screen lightbox; session detail accessible by scrolling up
- Compare mode: two photos side by side, one stat-diff line between them

## RepIQ Planner — Intelligence & Progression Decisions

### Session Card Visibility
- Active (upcoming) session cards are capped at one cycle's worth (e.g. 3 on a 3-day/week plan)
- Only the "Next" card is expanded by default; all others are collapsed one-liners
- Sessions beyond the cap are hidden until the previous one is completed
- Rationale: showing all unlocked cards creates noise; the user only needs to see what's immediately relevant

### Pause Mechanics
- `pausedAt` timestamp recorded when user pauses (not just a boolean flag)
- Pause duration shown to user: "Plan paused · Day 12 of 45"
- Pause limit is **user-configurable** within a system upper ceiling (default 45 days)
- Total pause days across the plan's lifetime are capped (prevents gaming with repeated short pauses)
- Expiration condition: `daysSincePause > pauseDaysMax AND daysSinceLastSession > 30` — both must be true
- Active training during pause (from Library) suppresses expiration even if pause clock runs long
- Amber warning shown at 70% of pause limit (e.g. day 30 of 45)
- On expiration: plan auto-archives (view only, can't resume); user prompted to start fresh

### Smart Resume
- Resume experience driven by **training recency**, not pause duration alone
- At resume, system evaluates: `daysSinceLastSession`, volume during pause vs pre-pause baseline, muscles covered
- Tiers: Warm (≤5 days, ≥60% volume) → resume directly; Partially warm → load nudge; Cool (6–14 days) → 1 ramp session; Cold (15–30 days) → ramp week; Stale (30+ days no training) → archive
- Resume screen shows: sessions logged during pause, muscles covered, muscles with gap, recommended action
- User chooses "Resume with adjustments" or "Resume as-is" — no multi-step questionnaire

### Library Suggestions During Pause
- Home screen NextSessionCard switches to library recommendations when plan is paused
- Suggestions ranked by: muscle coverage gap (highest priority) → recency of template → session length fit → avoid yesterday's session
- Sessions logged during pause count toward training history (streak, trend, muscle coverage) but not plan progress
- On resume, outside-plan sessions during pause trigger the `needsReview` flow as normal

### Plan Refresh (Adjust This Cycle) — Pro Feature
- Compress or expand remaining sessions within the current cycle only
- Free tier: 1 use/month; Pro tier: 2 uses/cycle with 48h cooldown
- Pricing specifics deferred to payments phase
- Restrictions: min 1 session remaining; volume delta warning >30%; session length warning if exceeds preference; scope is current cycle only (future cycles unaffected)
- "Add more sessions" path: system recommends split for extra sessions based on muscle coverage gap; sessions appended to current cycle; original remaining sessions renumbered but untouched
- When compressing: isolation work dropped first, compound lifts preserved

### Milestone-Gated Intelligence Progression
Features unlock based on total logged exercises (not sessions — harder to game):
- **0 exercises** (Layer 0): Logging, streaks, session tracking, workout report
- **30 exercises** (Layer 1): Training Trend card, week streak badge, "compared to last session" in report
- **50 exercises** (Layer 2): Muscle Coverage nudge on Home, anatomy heatmap in Analyzer, volume-per-session trend
- **100 exercises** (Layer 3): Muscle share card in Insights, drift alerts on Home (passive observation cards), milestone check-in (one-tap: "Has anything improved?")
- **150 exercises** (Layer 4 — Pro): Goal Planner, plan generation bias toward goals, exercise/body part goal progress cards
- **200 exercises** (Layer 5 — Pro): Auto mode — plan adjustments happen proactively, deload suggestions, skip prediction

Locked tiers are visible in Insights with one-line preview of what they unlock and progress toward the milestone.

### Goal Planner (Pro, unlocks at 150 exercises)
- Sits inside RepIQ Planner view, above session cards — not a separate destination
- Two goal types: Exercise goal (e.g. "Bench 100kg") and Body part goal (e.g. "Build back")
- Limit: 1 primary + max 2 secondary goals
- Exercise goal tracks: load progression, projected date to target based on current rate
- Body part goal tracks: volume share increase, biases plan exercise selection toward that muscle group
- Defocus option: "Reduce direct arm work" — suppresses nudge, adjusts volume ratio baseline
- Pricing point: deferred to payments phase

### User Engagement Classification (Passive — No Interruption)
System classifies users silently by engagement signals:
- `insightCardTaps`, `milestoneResponseRate`, `plannerEdits`, `goalSets`
- High engagement → richer, more frequent insights surfaced
- Low engagement → minimal, high-confidence-only observations
- Never interrupt low-engagement users with prompts they haven't earned

### HomeMuscleNudge Visibility Rule
- Hide when all muscles are fresh or fading (no empty "all covered" state shown)
- Appear only when ≥1 canonical muscle is "due" — showing nothing is the correct state when training is balanced

### Volume Ratio Analysis (Phase 2.5)
- Compute each muscle's share of total volume as % (14-day window vs 8-week rolling baseline)
- Drift signal: flag when recent share is <0.5× or >1.5× the user's own baseline
- No external reference tables — user's own 3-month average is the ground truth
- Thresholds intentionally proportional to cycleDays (cycle-aware)
- Available at Layer 3 (100 exercises milestone)

## Smart Replace Engine — 10-Tuple Lexicographic Ranking

**Decision (2026-04-13):** Replaced the old additive `scoreReplacement()` function with a 10-tuple lexicographic ranking engine.

**Why lexicographic over additive:**
- Additive scoring allows low-priority signals (novelty, preference) to outweigh high-priority ones (movement pattern match) with enough combined weight
- Lexicographic ranking respects priority absolutely: a movement mismatch can never be compensated by a novelty bonus
- The tuple position defines priority; the first differing position always wins
- Tie-breaking via `flattenRankTuple` (weighted positional scalar) handles the rare case of fully equal tuples

**Swap button design decision:**
- A dedicated ⇄ swap shortcut on the exercise card header was added alongside the ⋮ menu entry
- Rationale: "I want a different exercise" is a frequent intent that should be one tap, not three (⋮ → Replace → pick reason)
- The shortcut uses `just_change` reason, which applies no equipment or difficulty filter — it trusts the user knows what they want
- The ⋮ menu path remains for users who want reason-specific filtering (machine taken, no equipment, etc.)
- `just_change` is explicitly distinct from `best_match` so analytics can separate deliberate-variety swaps from need-based swaps

**ReplacementReason design:**
- `best_match` is the correct default for the full replace flow (not the legacy name `preference`)
- `preference` is kept as a legacy alias and normalised to `best_match` via `normalizeReplacementReason()` at the storage boundary
- This avoids breaking existing stored `ReplacementEvent` records while deprecating the old name in new code
- `just_change` produces a `reasonTier` that gives no equipment/difficulty bonus — the engine treats all candidates equally on those dimensions, letting movement + muscle be the dominant signals

**Replace mode browse view:**
- Query deliberately resets to `""` (not preFilterMuscle) when replace mode opens
- Rationale: filtering by muscle pre-empts the user's judgment; ranked hints within a full browse list preserve user agency while still surfacing the best options
- `smartReplacementMeta` prop carries the rank context to `AddExercisePage`; hint chips are read-only annotations, not ranked lists

## Plan Generation — Determinism and Shuffle

**Decision (2026-04-13):** `buildGeneratedPlan()` is deterministic — same `GenConfig` inputs always produce the same session. Shuffle increments `seedOffset` rather than using random seeds.

**Why determinism:**
- Users re-entering the generate flow should see the same plan they saw before (not a random one)
- Reproducibility is essential for debugging and for feature parity between sessions
- Determinism does not remove variety — the shuffle button provides explicit user-controlled variety by incrementing `seedOffset`

**Plan Builder collapsed cards:**
- Exercise cards in the Plan Builder default to collapsed
- `expandedIds: Set<string>` state resets when `draft.id` changes (i.e., on shuffle or load of a new plan)
- Rationale: a generated plan with 5–8 exercises would be overwhelming if all expanded on load; collapse-by-default keeps the overview scannable

**Compress/Regenerate hide condition:**
- Both buttons hidden when `sessionsRemaining <= daysRemaining`
- Rationale: offering to compress when there's nothing to compress creates confusion; the condition means "there are no sessions to spare"

## Deferred Topics (Separate Discussion Required)

### Lazy Loading
- Evaluate lazy loading for workout history list, exercise catalog, and any long lists in Insights
- Priority: after core features are stable; apply where scroll jank is measurable
- Consider virtualisation (windowed lists) for history if it grows beyond ~100 entries

### Data Tiering by Package
- Define what data is visible per tier: free / starter / pro
- Decide cut-off points: e.g. history depth, Analyzer access, muscle gap detail, RepIQ plan features
- Requires pricing model to be decided first

### Package / Pricing Feature Segregation
- Map every current feature to a tier (free / paid / pro)
- Identify feature gates vs soft limits (e.g. X workouts free, then prompt)
- Design gate UI: non-intrusive prompt, not a hard block for core logging
- Decide: free tier keeps logging forever; plan intelligence is the paid value

### Basic vs Advanced Mode
- User chooses on first launch; can switch anytime from Settings
- **Basic mode**: instruction-led, minimal choices, sensible defaults everywhere — designed for users who want to follow a plan without thinking about it
- **Advanced mode**: full customisation — edit any session, modify splits, adjust rep ranges, swap exercises freely — for experienced lifters who know what they need
- Mode affects: planner entry point (Basic hides split editor), logger (Basic hides RPE and set type), Insights (Basic shows summary only, not raw Analyzer)
- Switching modes never deletes data; it only changes what is surfaced

### Minimal Presentation Across Modes
- Every screen should answer: "what is the one thing the user needs to do or know right now?"
- Remove chrome that serves the developer, not the user
- Progressive disclosure: show the action first, details on tap
- Design principle: if a screen has more than one primary action, one of them is wrong

### User Scenario Walkthroughs
- Map realistic journeys: new user day 1, returning user 3 months in, user who skipped a week, user mid-cycle with an injury
- For each: what does the app show? what does the user feel? what action does the app nudge?
- Use these scenarios to stress-test mode switching, plan pacing nudges, and home screen CTAs
- Schedule a dedicated session to walk through 3–4 scenarios before building Basic mode UI
- No body measurement overlays or composition prompts unless user has entered them
