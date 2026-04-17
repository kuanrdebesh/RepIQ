# RepIQ — Session Plan & Build Queue

> This file is the source of truth for what to work on next.
> At the start of each session, read this file first.
> Update it as tasks complete or priorities shift.

Last updated: 2026-04-19

---

## Upcoming Sessions (in order)

### Session A — Analytics Analyzer Tab  ← NEXT
See detailed task list below.

### Session B — Workout Generator Refinement
After Analytics is done.
- See task list below.

### Session C — Goal Planner
After Workout Generator is done.
- See task list below.

### Session D — Community
After Goal Planner is done.
- See task list below.

### Session E — Optimisation Pass
After Community scaffolding is done.
- See task list below.

### Session F — DB, Auth & Deployment Readiness  ← Last major phase
- Supabase: schema, auth, row-level security
- Migrate localStorage → Postgres (workouts, plans, psych, replacement events)
- Media: swap local `/seed/` uploads → Supabase Storage
- API layer: Node service endpoints for plan generation, session save, media prepare
- Python engine: wire `computeTrainingTrend`, plan generation to API
- Env config, CI/CD, staging → production

---

## Session A — Analytics Analyzer Tab (detailed task list)

Reference docs: `docs/analytics-plan-updated_v2.md`

Operating model: **Daily awareness · Weekly action · Monthly strategy**

All analytics engine functions are already built. The Analyzer tab is a "coming soon" placeholder. The job is to wire real data into a real UI across 5 implementation phases.

---

### Phase 1 — Summary tab refinement

#### A1 — Date range system
Build a two-mode range selector at the top of all Insights tabs:

**Segmented control:** `Rolling` / `To date`

**Rolling chips** (scrollable row): `7d` `14d` `30d` `60d` `90d` `6m` `1y` `All`
- Comparison: current period vs immediately preceding equal-length period

**To-date chips**: `WTD` `MTD` `QTD` `YTD` `All`
- Comparison: current period to same calendar point in prior period (e.g. Apr 1–17 vs Mar 1–17)

Persist last selection per mode in `localStorage`.
Default on open: Rolling → `30d`.

#### A2 — Summary tab restructure
Replace the current action-heavy Summary with a calm daily briefing. Hard limits apply:
- **Max 2 takeaways**
- **Max 1 CTA** (only when confidence is high and user is clearly off track)
- **Max 1 keep-in-mind checkpoint**

New card order (top to bottom):
1. **Headline card** — single sentence "What stands out" (from `computeTrainingTrend` message or top insight)
2. **Next Best Target card** (see A3)
3. **3 compact health scores** (see A4)
4. **1–2 takeaway cards** (see A5)
5. **Keep-in-mind checkpoint** (optional, from `computeActionPlan`)

Cards that currently show multi-item action lists → move those actions into expandable detail drawers ("See details" → drawer shows: Why it matters / Confidence / Comparison period / Suggested response).

#### A3 — Next Best Target card
Single card below headline:
- Most overdue muscle group (from `computeMuscleCoverage`)
- Shows: muscle name, days since last trained, suggested movement pattern
- CTA: "Generate session →" — opens Generate Session with that muscle pre-filtered
- If nothing overdue: show "You're well-covered — keep it up" with last trained muscle summary

#### A4 — 3 compact health score cards
Horizontal row of 3 score chips:

| Score | Source | Display |
|---|---|---|
| Consistency | sessions in range vs target cadence | % on track, zone colour |
| Goal Alignment | `computeGoalAlignment()` | Aligned / Drifting / Off-track |
| Movement Balance | `computeMovementBalance()` | Balanced / Imbalanced + worst imbalance name |

Each card tappable → expands to detail drawer with explanation and comparison.

#### A5 — Takeaway cards (max 2)
- Priority ranking: Action > Insight > Observation
- Sources: training trend, overdue muscles, goal drift, streak, plateau detection
- Each card: short bold headline + 1-line body + optional "See details" link
- No more than 1 action card (CTA button) at a time
- If no significant signal: show positive reinforcement card ("Training looks solid this week")

---

### Phase 2 — Stats tab expansion

#### A6 — Movement balance chart
First section in Stats tab. 8 user-facing buckets:

| Bucket | Internal mapping |
|---|---|
| Horizontal Push | horizontal_push + isolation push rollup |
| Vertical Push | vertical_push |
| Horizontal Pull | horizontal_pull + isolation pull rollup |
| Vertical Pull | vertical_pull |
| Squat | squat + lunge (rollup) |
| Hinge | hinge |
| Core | core |
| Cardio | cardio |

Visual: horizontal bar chart, 8 rows
Each row: current period sets · delta vs prior · status chip (`Missing` / `Low` / `Balanced` / `High`)

Optional toggle (Sets / Volume) in expanded view.
Supporting table: Movement | Current | Previous | Delta | Share% | Status

Insight rules: generate callouts for missing, underrepresented, dominant, and paired imbalance patterns (push vs pull, squat vs hinge).

Source: `groupSetsByMovementPattern()` (already built) + date range from A1.

#### A7 — Muscle set count section
- Chip grid or sortable table: each primary muscle group, sets in range
- Trend arrow (↑ ↓ →) vs prior period
- Highlight overdue (0 sets in range) in amber
- Filter chips: All / Upper / Lower / Core
- Tap a row → placeholder "drill-down coming" (full drill-down is a later phase)

#### A8 — Main exercises section
- Top 6 exercises by set count in range
- Each: exercise name, set count, avg weight, trend vs prior period
- "See all" → full list sorted by sets

#### A9 — Consistency breakdown section
- Sessions in range vs target
- Avg sessions/week in range vs target cadence
- Days since last workout
- Streak + longest streak
- Simple bar or calendar-dot display (week rows, coloured by trained/rest/missed)

---

### Phase 3 — Progress tab completion

#### A10 — Progress tab sub-tabs
Replace single-scroll Progress tab with 3 sub-tabs:
```
Progress
├── Goals        ← goal tracking cards (depends on Goal Planner - Session C)
├── Body         ← photos + compare (already built — no changes needed)
└── Performance  ← PRs, exercise progress, plateaus
```

Body sub-tab: move existing photo grid + compare + lightbox here. No changes to logic.

#### A11 — Performance sub-tab: PR timeline
- List of PRs in selected date range
- Source: `computePRsHistory()` (already built)
- Each row: exercise name, old weight → new weight, date, PR type label
- Sort: newest first
- Empty state: "No PRs in this period — keep training"

#### A12 — Performance sub-tab: exercise progress list
- Each tracked exercise: status chip (Improving / Stable / Building / Stalled / Plateau / Regressing)
- Source: existing exercise progress tracking in `InsightsPage`
- Recent best set shown inline
- Tap → detail drawer with set history, confidence note
- Plateau list highlighted separately at top if any detected

#### A13 — Goals sub-tab (depends on Session C — Goal Planner)
- Active goal cards: % complete, current trajectory, ETA at current pace
- Source: `computeGoalProgress()` (already built)
- Each card tappable → breakdown by contributing metric
- Stub with "Set a goal in Planner → Goals" CTA until Session C ships

---

### Phase 4 — Weekly report surface

#### A14 — Weekly report
Accessible from: Insights → Summary → "Review this week" link (or Profile → Reports later)

Tone: reflective, lightly directive. Max 2–3 action priorities.

Sections:
1. **Overview card** — workouts completed vs target, total sets, total volume, training trend label
2. **Movement chart** — same 8-bucket chart, week scope
3. **Wins** — exercises that improved, PRs hit, consistency maintained
4. **Watchouts** — missed movements, undertrained muscles, stalled exercises
5. **Next-week focus** — 2–3 action priorities for the coming week

Trigger: auto-available from Monday (covering Mon–Sun prior week). No push notification until Phase F.

---

### Phase 5 — Monthly report surface

#### A15 — Monthly report
Accessible from: Insights → Summary → "Review this month" link (or Profile → Reports later)

Tone: strategic recap. Right place for plan-level corrections (deload suggestion, split adjustment, volume redistribution).

Sections:
1. **Stats header** — workouts, total duration, sets, volume (vs prior month)
2. **PR list** — all PRs in the month
3. **Top exercises** — by set count
4. **Muscle distribution** — set count per muscle vs prior month
5. **Movement distribution** — movement chart for the month
6. **Consistency calendar** — month grid, each day coloured (trained / rest / missed)
7. **Themes** — strongest training themes, biggest gaps
8. **Goal alignment** — goal progress over the month
9. **Photos** — progress photos taken during the month (if any)
10. **Plan-level suggestions** — deload / split adjustment / volume redistribution / goal recalibration (when confidence is high)

Trigger: available from the 1st of each month, covering prior calendar month.

---

### A-Stretch — Mood/energy overlay (do last, only if A1–A13 done)
- Overlay mood/energy from `DailyReadiness` + `PostWorkoutPsych` on the training trend sparkline
- Small coloured dots on sparkline or separate row beneath it
- Data already being collected — just needs surfacing

---

## Session B — Workout Generator Refinement (task list)

Current state: Generate Session works with equipment filter pre-filled from profile. Needs refinement.

### B1 — Smarter exercise selection
- Avoid repeating exercises from the last 2 sessions for the same muscle group
- Prefer exercises not recently used (recency signal from saved workouts)
- Respect user difficulty level from psych profile

### B2 — Session duration accuracy
- Current: rough estimate based on exercise count
- Target: estimate from avg set count × rest time × exercise count, using user's past session data

### B3 — Warm-up suggestion
- Prepend 1–2 warm-up sets or exercises based on first primary muscle in the session
- Label them as warm-up (not counted in volume)

### B4 — Generator output card improvements
- Show muscle coverage preview before accepting the session
- Show estimated duration (from B2)
- "Regenerate" button that picks different exercises keeping same structure

### B5 — Link from Analyzer "Next Best Target" card
- When tapping "Generate session →" from A3, open generator with muscle pre-filtered
- Already partially wired — complete the handoff

---

## Session C — Goal Planner (task list)

Current state: `computeGoalProgress()` runs but output is not shown anywhere except score cards (after A1). Goal planner UI does not exist.

### C1 — Goal display on Home
- Show goal progress score card on Home (currently computed but hidden)
- Tap → opens Goal Planner

### C2 — Goal Planner page
- Shows current goal (from psych profile: strength / hypertrophy / fat_loss / endurance / general)
- Timeline: weeks remaining, sessions completed vs target, volume trend
- Progress bar: 0–100 score from `computeGoalProgress()`
- Weekly target vs actual (sessions/week)

### C3 — Goal adjustment
- Allow user to update goal mid-cycle
- Recalculate baseline on change
- Show "goal changed X days ago" if recently changed

### C4 — Milestone markers
- Mark every 25-pt increment on the progress bar
- Trigger a reward / celebration card at 50, 75, 100

---

## Session D — Community (task list)

Requires backend (Phase 0) to be complete first. These are UI stubs only until DB is live.

### D1 — Home card entry point
- Community card on Home (below Training Trend)
- Shows friend count, latest friend activity, weekly leaderboard position
- Taps → Community page

### D2 — Community page scaffold
- Bottom sheet or full page
- Tabs: Feed | Groups | Leaderboard

### D3 — Groups
- Create group (name, invite link)
- Join group (via link)
- Group activity feed (opt-out)
- Group leaderboard: sessions/week, volume, streak

### D4 — Friends
- Search by username
- Friend profile (shared workouts only — no private data)
- Friend activity in feed

### D5 — Leaderboard
- Weekly: streak, sessions
- Monthly: volume, PRs, improvement %
- Scope: friends-first or group (never global by default)
- Scores derived server-side only

---

## Session E — Optimisation Pass (task list)

### E1 — Performance audit
- Lighthouse score on mobile viewport
- Identify any remaining eager-load bottlenecks
- Check bundle size — split large dependencies if needed

### E2 — Accessibility pass
- ARIA labels audit across all interactive elements
- Focus management in modals / sheets
- Colour contrast check in both themes

### E3 — Offline resilience
- Queue failed saves when offline, retry on reconnect
- Show offline indicator in header when network unavailable

### E4 — Animation & polish
- Page transition consistency (slide in/out)
- Sheet animations (bottom sheets)
- Skeleton loaders on any async data surfaces

### E5 — Psych layer completion (Phase 2 leftovers)
- Persistent Daily Readiness Card on Home
- Consent toggles in Profile → Preferences

---

## Session F — DB, Auth & Deployment (task list)

### F1 — Supabase setup
- Create project, configure RLS policies
- Schema: users, workouts, plans, psych_entries, replacement_events, media_assets

### F2 — Auth
- Email + password signup/login
- SSO (Google) optional
- Session token management

### F3 — Data migration
- On first login: sync all localStorage data to Supabase
- Conflict resolution: server wins on date overlap

### F4 — Media
- Replace `/seed/` local uploads with Supabase Storage
- Use existing media boundary API contract (`GET /v1/media/config`, `POST /v1/media/prepare`)

### F5 — API layer
- Node service: session save, plan CRUD, media handshake
- Python engine: expose `computeTrainingTrend`, plan generation as HTTP endpoints

### F6 — Deployment
- Staging environment
- CI/CD pipeline (GitHub Actions)
- Production deploy
- App name / domain finalisation

---

## Status Legend

- ✅ Complete
- 🔄 In progress
- ❌ Not started
- ⏸ Blocked (dependency noted)
