# RepIQ Analytics Plan (Updated)

Last updated: 2026-04-17

## 1. Purpose

RepIQ analytics should not feel like a dashboard for dashboard's sake.

It should feel like:

- a calm daily briefing
- a trustworthy explanation layer
- a deeper weekly/monthly review when the user wants reflection

The product rule is:

> Daily analytics should be light, confidence-aware, and minimally pushy.  
> Deeper interpretation and recommendations should live in expandable detail and in weekly/monthly reports.

Updated operating model:

> Daily awareness, weekly action, monthly strategy.


## 2. Design Principles

1. Daily surface is summary-first, not action-first.
2. One primary takeaway beats five low-confidence recommendations.
3. Every metric should answer one of:
   - What changed?
   - What is off-balance?
   - What is improving?
   - What deserves attention later?
4. If the action is not urgent, it belongs in details or in a report.
5. Comparisons must be fair:
   - rolling ranges compare to the immediately preceding equal-length period
   - WTD/MTD/QTD/YTD compare to the previous period up to the same point
6. Personal analytics should stay personal-first. Social comparison is optional and secondary.
7. Missed work should default to `continue with the next`, not catch-up pressure.
8. RepIQ should absorb complexity wherever possible through plan logic and guidance tips.
9. The user should usually leave analytics with one target, not a list of jobs.


## 3. What RepIQ Already Has

Current implementation already gives RepIQ a meaningful analytics base.

### 3.1 Implemented in the app

From `apps/web/src/App.tsx`:

- `InsightsPage` with tabs: `Summary`, `Stats`, `Progress`
- Summary insight feed with expandable details
- Consistency analytics:
  - sessions in 7d / 30d
  - streak
  - longest streak
  - avg per week
  - consistency vs target
  - days since last workout
  - returning-after-gap detection
- Session summary analytics:
  - total workouts
  - total sets
  - total volume
  - avg duration
  - avg sets
  - avg exercises
  - volume trend
  - sessions trend
- Lagging muscle detection:
  - absent
  - low volume
  - low frequency
  - suggested exercises
- Exercise progress tracking:
  - improving / stable / building / stalled / regressing
  - recent best set
  - confidence level
- Plateau detection
- Exercise rotation warnings
- Goal alignment scoring
- Goal progress scoring
- Movement balance computation:
  - push vs pull
  - squat vs hinge
  - upper vs lower
  - imbalance messages
- PR history extraction
- Recommended action list
- Home cards already connected to analytics:
  - training trend
  - muscle coverage nudge
  - streaks
  - PR banner

### 3.2 Partially implemented

- Progress tab exists, but is still placeholder-level
- Movement balance exists in logic, but not yet as the required dedicated movement chart
- No proper date range system yet
- No weekly report
- No monthly report
- No yearly recap
- No explicit comparison framework across all analytics cards


## 4. What Hevy Currently Provides

Based on Hevy public help/product pages, Hevy currently provides:

### 4.1 Core statistics

- Last 7 day body graph
- Set count per muscle group
- Muscle distribution chart with comparison to the previous matching period
- Muscle distribution body view
- Main exercises
- Calendar + weekly streak + rest days since last workout
- Monthly report
- Yearly review
- PR tracking across multiple exercise types
- Set-record table per exercise

### 4.2 Monthly / yearly recap surfaces

Hevy monthly report includes:

- number of workouts
- training duration
- total sets
- total volume
- PR list
- calendar of completed workouts
- muscle distribution vs previous month
- main muscles trained
- top exercises
- photos posted with workouts

Hevy yearly review includes:

- most productive month
- most trained body parts
- most logged exercises
- total yearly volume / reps / duration
- yearly calendar
- longest streak
- yearly PRs
- shareables

### 4.3 PR system depth

Hevy tracks different PR types depending on exercise type, including:

- heaviest weight
- best 1RM
- best set volume
- best session volume
- best set reps
- most session reps
- longest time
- longest distance
- best time

### 4.4 What this means for RepIQ

Hevy is strong on:

- descriptive stats
- muscle distribution
- consistency surfaces
- monthly/yearly recap
- PR taxonomy

RepIQ should not merely copy this.

RepIQ should beat Hevy in:

- decision support
- confidence-aware explanations
- goal alignment
- movement balance intelligence
- “what matters now vs what can wait for the weekly/monthly report”


## 5. Hevy Coverage Check vs RepIQ

| Area | Hevy | RepIQ Current | RepIQ Plan |
|---|---|---|---|
| Last 7 day body / muscle heat | Yes | Partial | Keep and improve |
| Set count per muscle group | Yes | Partial | Expand with filters and comparisons |
| Muscle distribution chart | Yes | Partial | Add richer comparison + movement dimension |
| Main exercises | Yes | Missing | Add |
| Calendar / streak / consistency | Yes | Partial | Add dedicated consistency section + calendar later |
| PR tracking | Yes | Partial | Expand PR taxonomy and exercise detail |
| Set records table | Yes | Missing | Add in exercise detail |
| Monthly report | Yes | Missing | Add |
| Yearly review | Yes | Missing | Add later |
| Progress photos / measurements | Yes | Planned | Add in Progress |
| Goal alignment | Limited / not core | Yes | Keep as differentiator |
| Plateau / rotation / lagging muscles | Limited / not core | Yes | Keep as differentiator |
| Movement pattern chart | Not core in Hevy docs | Missing as UI | Add as core RepIQ asset |
| Clear coaching summary | Limited | Partial | Make this the centerpiece |

Conclusion:

- RepIQ already covers some higher-intelligence areas that Hevy does not foreground
- RepIQ is weaker today in report packaging, comparison tools, and polished stats surfaces
- The updated plan should preserve RepIQ's coaching edge while closing the reporting/statistics gap


## 6. Updated Information Architecture

## 6.1 Primary tabs

Keep these top-level analytics tabs:

1. `Summary`
2. `Stats`
3. `Progress`

Progress gets sub-tabs once goals and measurements land (see §10.3).

Add reports as a sub-surface later, not as daily-first clutter.

Future report surfaces:

- `Weekly Report`
- `Monthly Report`
- `Year in Review`

These can live under:

- Profile -> Reports
- Insights -> Summary detail entry points
- Home passive cards when available

## 6.2 Goal tracking placement

Goal-related work has three distinct jobs and they should live on three different surfaces. Mixing them creates duplicate goal presence and confuses "where do I go to do X?"

| Job | Surface | Rationale |
|---|---|---|
| Define / edit / retire goals | `Planner → Goals` (new sub-tab) | Goals are inputs to plan generation. They belong next to plans, not in analytics. |
| Track progress toward goals | `Insights → Progress → Goals` (new sub-view) | Goal progress is evidence — belongs next to photos and PRs. |
| Daily awareness of goal alignment | `Insights → Summary` (3-score card: Consistency / Goal Alignment / Movement Balance) | Keeps the daily surface summary-first. |
| Passive watch on priority goal | `Home` (optional card, later) | Same pattern as streaks and PR banner. |

Goal creation and goal tracking are different mental models. Creation is a commitment act (planning). Tracking is a looking-back act (analytics). The split above honors that.

Reuse of existing engine: `computeGoalAlignment` feeds the Summary score card; `computeGoalProgress` feeds the Progress → Goals sub-view. No new engine work needed to wire these.

## 6.3 Planner tabs

With the Goal Planner coming, Planner hosts four sub-tabs:

1. `My Workouts`
2. `Library`
3. `Generate`
4. `Goals` (new — create, edit, retire goals)

Generated plans should read active goals so session generation is goal-aware.


## 7. Daily UX Rule

Daily analytics should be lighter than the current action-heavy version.

### 7.1 Daily Summary behavior

Daily Summary should show:

- one headline takeaway
- 3 compact scores
- 1-2 short takeaways max
- one `Next Best Target` card
- one optional primary CTA only when confidence is high
- a detail drawer for deeper interpretation

### 7.2 Action policy

On a normal day:

- do not show a list of 4-5 actions
- do not push corrective tasks aggressively
- prefer explanation over instruction
- prefer checkpoints over prescriptions
- prefer “handled by your plan” when RepIQ is already compensating

Only show a prominent daily CTA when one of these is true:

- user is clearly behind plan pace
- a muscle group has been fully missed for too long
- there is a meaningful plan-level issue
- there is an obvious next session to start

Otherwise:

- show “See details”
- show “Review this week”
- show “This will be covered in your weekly report”
- show “Continue with the next session”

### 7.3 Details section

Each summary insight should expand into:

- Why this matters
- Confidence
- Comparison period
- Suggested response
- Optional related metrics / chart link

This preserves depth without making the daily page noisy.

### 7.4 Daily output rule

Hard rule for the default daily surface:

- max 2 takeaways
- max 1 CTA
- max 1 keep-in-mind checkpoint

Do not ask the user to re-plan frequently.

### 7.5 Default recovery behavior

If the user falls behind:

- do not encourage cramming missed work
- do not overload the user with recovery tasks
- default to:
  - `Continue with the next`
  - `RepIQ will adjust volume where needed`
  - `Use weekly review for corrections, not today`


## 8. Date Range System

RepIQ should support two modes.

## 8.1 Rolling mode

Scrollable chips:

- `7d`
- `14d`
- `30d`
- `60d`
- `90d`
- `6m`
- `1y`
- `All`

Comparison rule:

- compare against the immediately previous equal-length period

Examples:

- `30d` compares to previous `30d`
- `90d` compares to previous `90d`

Best use cases:

- movement chart
- muscle distribution
- volume trends
- progress trends
- consistency
- lagging muscle detection

## 8.2 Period-to-date mode

Chips:

- `WTD`
- `MTD`
- `QTD`
- `YTD`
- `All`

Comparison rule:

- compare to previous period up to the same point

Examples:

- `MTD` on April 17 compares Apr 1-17 vs Mar 1-17
- `QTD` compares current quarter-to-date vs previous quarter-to-date
- `YTD` compares current year-to-date vs previous year-to-date

Best use cases:

- pacing against goals
- weekly report
- monthly report
- yearly review
- plan adherence

## 8.3 UX recommendation

At the top of analytics:

- segmented control: `Rolling` / `To date`
- below it, the relevant chip row only

Persist selection per mode:

- remember last rolling selection
- remember last to-date selection


## 9. Required Movement Chart

This should be a first-class analytics module.

## 9.1 Required buckets

- Horizontal Push
- Vertical Push
- Horizontal Pull
- Vertical Pull
- Squat
- Hinge
- Cardio
- Core

Important:

- this chart should not mix in isolation buckets
- existing internal movement logic can still use isolation patterns, but the user-facing chart should roll them into these 8 understandable categories where appropriate

Suggested rollup:

- isolation push -> nearest push bucket or separate hidden internal contribution
- isolation pull -> nearest pull bucket or hidden internal contribution
- lunge -> squash into squat bucket for summary-level movement pattern reporting
- isolation legs -> attributed to squat/hinge only where confidently inferable, otherwise excluded from movement chart but still used in muscle analytics

## 9.2 Where it should appear

### Summary

Compact card:

- title: `Movement balance`
- 8-row mini bar chart
- one sentence interpretation
- `See details`

### Stats

Expanded section:

- full chart
- comparison vs previous period
- imbalance callouts
- optional table

### Weekly / Monthly report

Included as one of the main recap blocks

## 9.3 Recommended visual

Default:

- horizontal bar chart with 8 rows

Each row shows:

- current period sets
- delta vs prior comparable period
- status chip: `Missing`, `Low`, `Balanced`, `High`

Optional toggle in detail:

- `Sets`
- `Volume`

## 9.4 Supporting table

| Movement | Current | Previous | Delta | Share | Status |
|---|---:|---:|---:|---:|---|
| Horizontal Push | 18 | 12 | +6 | 16% | Balanced |
| Vertical Pull | 2 | 7 | -5 | 2% | Low |
| Hinge | 0 | 5 | -5 | 0% | Missing |

## 9.5 Insight rules

Use this chart to generate:

- missing movement alerts
- underrepresented movement alerts
- dominant movement alerts
- paired imbalance alerts:
  - horizontal push vs horizontal pull
  - vertical push vs vertical pull
  - squat vs hinge
- goal mismatch commentary


## 10. Updated Tab Spec

## 10.1 Summary

Purpose:

- lightweight daily briefing

Contains:

- date mode + range selector
- daily headline card:
  - `What stands out`
  - one sentence only
- `Next Best Target` card
- 3 compact health cards:
  - Consistency
  - Goal Alignment
  - Movement Balance
- 1-2 short takeaway cards
- 1 keep-in-mind checkpoint when relevant
- expand-for-detail behavior

Should not lead with:

- long action lists
- large tables
- multi-chart walls
- backlog-recovery pressure

## 10.2 Stats

Purpose:

- detailed analysis surface

Contains:

- Movement balance chart
- Muscle distribution
- Set count per muscle group
- Training trend
- Session output
- Goal alignment breakdown
- Lagging muscles
- Main exercises
- Consistency breakdown

This is where tables and richer comparisons belong.

This is also where users can inspect the “why” behind daily takeaways without being asked to act on everything immediately.

## 10.3 Progress

Purpose:

- evidence of progress across goals, body, and performance

Structure — sub-tabs (not a scroll-wall):

```
Progress
├── Goals        ← goal progress cards, trajectory, ETA
├── Body         ← photos (already built), measurements (later)
└── Performance  ← PR timeline, exercise progress, plateaus, drill-down
```

Each sub-view answers one clear question:

- **Goals:** am I on track to what I said I wanted?
- **Body:** how does my body look over time?
- **Performance:** how are my lifts trending?

Sub-view contents:

**Goals** (depends on Goal Planner shipping)
- Active goal cards: % complete, current trajectory, ETA at current pace
- Tap into goal detail for breakdown by contributing metric
- Reuses `computeGoalProgress`; new goal definitions come from Planner → Goals

**Body**
- Progress photo grid + compare (already built)
- Measurements (weight, body fat, circumferences — later)

**Performance**
- PR timeline
- Exercise progress list with status chips (improving / stable / stalled / plateau / regressing)
- Plateau list
- Exercise detail drill-down with set-record table
- Later: per-exercise PR breakdown (heaviest, best 1RM, best set volume, best reps)

Progress renders zero actions per the layer model — this is an evidence surface, not an instruction surface.


## 11. Daily vs Weekly vs Monthly Logic

## 11.1 Daily

Tone:

- calm
- low-pressure
- not too prescriptive

Output:

- what changed
- what is notable
- one optional action at most
- next best target
- reassurance when the plan is already handling the correction

## 11.2 Weekly report

Tone:

- reflective
- lightly directive

Include:

- workouts completed vs target
- trend of the week
- movement balance for the week
- top muscles trained
- missed / undertrained areas
- exercises that improved
- exercises that stalled
- recommendation themes for next week
- 2-3 action priorities max

Suggested format:

- overview card
- movement chart
- wins
- watchouts
- next-week focus

## 11.3 Monthly report

Tone:

- recap and strategic correction

Include:

- workouts, duration, sets, volume
- PRs
- top exercises
- muscle distribution
- movement distribution
- consistency calendar
- strongest month themes
- biggest training gaps
- goal alignment over the month
- progress photos / measurements when available

This is the right place for more explicit recommendations and pattern-level conclusions.

This is also the right place for plan-level corrections such as:

- deload suggestion
- split adjustment
- volume redistribution
- goal recalibration


## 12. What RepIQ Should Add to Match or Beat Hevy

## 12.1 Must-add for parity

- date range system
- movement chart
- set count per muscle group with filters
- main exercises
- monthly report
- progress photos / measurements
- exercise detail PR / record view

## 12.2 Must-keep as RepIQ differentiators

- goal alignment
- lagging muscle detection
- plateau detection
- exercise rotation warnings
- confidence-aware insights
- calmer daily UX

## 12.3 Should-add later

- yearly review
- shareable recap cards
- readiness / mood overlays on trend views
- plan adherence reporting
- recovery pressure view


## 13. Specific Changes to Current RepIQ UX

## 13.1 Summary tab changes

Current issue:

- Summary is still too recommendation-heavy for a daily home-for-analytics surface

Update:

- reduce visible actions hard
- remove multi-item action lists from the default daily surface
- convert most current “Next step” copy into expandable detail
- keep just one primary CTA only when needed
- add a dedicated `Next Best Target` card
- add “handled by your plan” states where appropriate

### New summary card structure

1. `Headline`
2. `Next Best Target`
3. `Keep in mind`
4. `Why it matters` hidden in detail
5. `Suggested response` hidden in detail unless urgent

## 13.2 Stats tab changes

Current issue:

- Stats has useful metrics, but lacks range control and the required movement chart

Update:

- add date selector
- add movement chart
- add comparison labels on every major chart/card
- add main exercises section

## 13.3 Progress tab changes

Current issue:

- placeholder only

Update:

- build this into PRs + exercise trends + photos + measurements

## 13.4 Weekly action model

Move most actionable guidance out of daily analytics and into weekly review.

Weekly action examples:

- Keep bench as your anchor lift
- Bring hinge volume back this week
- Do not add extra push work this week
- Hold overhead press steady and build reps

Hard rule:

- weekly surface should show no more than 2-3 action priorities

## 13.5 Planning model

Planning should not be frequent.

RepIQ should behave as follows:

- if the user misses work, default to `continue with the next`
- do not encourage squeezing extra sessions just to “complete” the plan
- use the plan engine and guidance tips to absorb deviations
- reserve structural changes for weekly or monthly review unless the user is clearly far off track


## 14. Implementation Phases

## Phase 1: Summary refinement

- Add dual date-range framework
- Keep Summary light
- Replace daily multi-action behavior with `Next Best Target`
- Move most “actions” into details
- Add confidence + comparison period labeling
- Add “continue with the next” fallback behavior

## Phase 2: Stats expansion

- Add movement chart with required 8 categories
- Add muscle set count section
- Add main exercises section
- Add comparison framework throughout Stats

## Phase 3: Progress completion

- PR detail
- exercise record table
- progress photos
- measurements

## Phase 4: Weekly report

- first generated report surface
- summary + chart + next-week focus

## Phase 5: Monthly report

- monthly recap with Hevy-parity coverage plus RepIQ coaching layer

## Phase 6: Year in review

- yearly summary
- shareable recap


## 15. Final Product Recommendation

RepIQ should position its analytics as:

- lighter than a spreadsheet
- smarter than a stat dump
- less pushy day to day
- more useful over weekly and monthly horizons

That means:

- Daily Summary = awareness
- Stats = analysis
- Progress = evidence
- Weekly Reports = action
- Monthly Reports = strategy

The right product stance is not:

- “Here are 12 things to fix today.”

It is:

- “Here is what is changing in your training.”
- “Here is what deserves attention.”
- “Here is your next best target.”
- “Here is what we will help you review at the end of the week and month.”


## 16. Source Notes

### RepIQ current-state references

- `apps/web/src/App.tsx`
- `docs/project-status.md`
- `docs/navigation-map.md`
- `docs/test-cases.md`

### Hevy references

- Hevy Statistics Explained: https://help.hevyapp.com/hc/en-us/articles/35702030346903-Hevy-Statistics-Explained-Track-Your-Training-Progress-and-Muscle-Growth
- Hevy Calendar and Streak: https://help.hevyapp.com/hc/en-us/articles/35380117933207-Track-Your-Workout-Consistency-with-the-Calendar-and-Streak-Features
- Hevy Yearly Review: https://help.hevyapp.com/hc/en-us/articles/35700454899991-Discover-Your-Hevy-Training-Stats-with-the-Yearly-Review
- Hevy PRs and Set Records: https://help.hevyapp.com/hc/en-us/articles/35649367857175-Personal-Records-PRs-and-Set-Records-Explained-How-They-Work-in-the-Hevy-App
- Hevy Monthly Report: https://www.hevyapp.com/features/monthly-report
