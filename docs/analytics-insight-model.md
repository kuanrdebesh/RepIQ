# RepIQ Analytics & Insight Model

Last updated: 2026-04-17

Companion to `analytics-plan-updated_v1.md` / `v2.md`. Those docs describe **what** to build (tabs, charts, reports). This doc describes **how** insights are produced, ranked, surfaced, and escalated into actions — and how the same underlying data serves both a casual user who wants to be told one thing and an advanced user who wants to drill down.

---

## 1. Core problem

RepIQ produces more information than a user can act on in a day. The product must decide, every time the user opens analytics:

- What is worth saying at all
- What is worth saying *today* vs *this week* vs *this month*
- What is worth asking them to **do**
- What is worth only showing if they **ask**

If this decision is wrong, two failure modes appear:

- **Overwhelm:** casual users see a wall of numbers, ignore it, and lose trust.
- **Under-inform:** advanced users feel RepIQ is a toy and leave for a spreadsheet.

The solution is a layered model with strict gates between layers.

---

## 2. The three-layer model

Layers apply to the **rendering of a metric on a surface**, not to the metric itself. The engine produces each metric once; surfaces choose how to render it, and the rendering determines the layer.

A weekly volume number rendered as "18 hinge sets (last 30d)" on Stats is an **observation**. The same value rendered as "Hinge volume down 40% — worth watching" on Summary is an **insight**. The same concern, once it clears the action gates in §6, may render as an **action** CTA on Home. One metric, three renderings, three layers.

Layers are ordered by how much user attention they demand.

### Layer 1 — Observation

Facts with no interpretation.

- "You trained 3 times this week."
- "Your bench press 1RM estimate is 95 kg."
- "You have trained hinge 4 times in the last 30 days."

Observations are always available, never pushed. They live in **Stats** and **Progress** tabs and inside drill-downs. They never appear as banners, alerts, or CTAs.

### Layer 2 — Insight

An observation plus a comparison and a frame.

- "Your bench press is progressing steadily — 3 small PRs in 14 days."
- "Hinge volume is down 40% vs the previous 4 weeks."
- "You've missed 2 of 4 planned sessions this week."

Insights require a **confidence band** (see §4) and a **comparison window** (rolling vs to-date, defined in the main plan). Insights appear in the Summary feed and in card-level interpretation copy. An insight alone does not ask the user to do anything.

### Layer 3 — Action

An insight that has crossed a gate and earned the right to ask for a decision.

- "Add a hinge session this week." *(user confirms or dismisses)*
- "Consider a deload next week — your bar speed has dropped across 3 lifts." *(user confirms or dismisses)*
- "Start your next planned session: Push A." *(user confirms or dismisses)*

Actions are rare by design. The gating rules in §6 decide what becomes one.

**Hard rule:** no screen ever surfaces more actions than the user can hold in their head. Concrete caps:

| Surface | Max observations visible | Max insights | Max actions |
|---|---|---|---|
| Home | unlimited (passive cards) | 2 | 1 |
| Summary (daily) | via drill-down only | 2 | 1 |
| Stats | unlimited | unlimited | 0 |
| Progress | unlimited | unlimited | 0 |
| Weekly report | unlimited | 5–8 | 3 |
| Monthly report | unlimited | unlimited | 3 |

Stats and Progress having **zero actions** means those surfaces never *render* the action layer. The underlying insights still exist and may render as actions on Summary or Home — Stats and Progress simply choose not to. This keeps those tabs as pure analysis surfaces.

---

## 3. Two user modes, one model

RepIQ serves two user postures simultaneously.

### Casual mode (default)

The user opens the app and wants to be told:

- Am I on track?
- What's the one thing that matters right now?
- What's next?

They see the Summary tab with its headline + next best target + 3 compact scores + at most 2 takeaways. They may never tap into detail. The app should feel complete at that depth.

### Advanced mode (drill-down)

The user wants to verify, investigate, or explore. They:

- Tap into an insight to see the numbers behind it
- Switch date ranges and comparison modes
- Open Stats tab for distributions and tables
- Open Progress tab for exercise trends and PR history

Both modes read from the same engine. The advanced view is always the casual view **plus** disclosure — never a separate data source. This guarantees the casual summary is faithful to the detail.

**Design rule:** every casual-mode card must be expandable into its advanced-mode counterpart. If a card has no drill-down, it is either cut or demoted to an observation.

---

## 4. Confidence model

Every insight carries a confidence band: `low`, `medium`, `high`. Confidence is derived from three inputs.

### 4.1 Data sufficiency

- **high** — window contains ≥ 6 sessions and ≥ 2 sessions/week average
- **medium** — 3–5 sessions in window, or ≥ 6 sessions but irregular cadence
- **low** — < 3 sessions in window

### 4.2 Signal strength

How far the observed value is from its comparison baseline, measured in meaningful units for the insight type. Examples:

- Volume trend: % change vs previous equal-length window
- Exercise progression: estimated 1RM delta vs last 4 sessions
- Muscle coverage: sets below or above recommended floor/ceiling

Each insight type defines its own thresholds for weak / moderate / strong signal.

### 4.3 Noise check

How volatile the series is. A 10% drop on a normally flat series is stronger than a 10% drop on a series that swings ±15% week to week.

### 4.4 Combined rule

Confidence = `min(sufficiency, signal, 1 - noise)`, each term normalized to 0–1 per insight category using the scoring tables in Appendix A. The `min` rule is a meta-rule; it is not implementable without the per-category bands. An insight needs **medium+** confidence (≥ 0.5) to appear in the daily Summary feed. **Low-confidence insights are not hidden** — they appear in Stats drill-downs with an explicit "Early signal, limited data" label. This lets advanced users see what the engine is watching without letting it pressure casual users.

---

## 5. Ranking & selection — how to pick the 2 daily takeaways

Every day the engine produces a candidate pool of insights. The Summary tab can show at most 2. Selection uses a single priority score.

### 5.1 Candidate pool sources

- Consistency vs plan
- Movement balance deltas
- Muscle coverage gaps
- Exercise progression (improving / stalled / regressing)
- Plateau detection
- Rotation warnings
- Goal alignment drift
- Returning-from-gap
- PR events

### 5.2 Priority score

For each candidate:

```
base       = severity × confidence × recency × novelty
persistBonus = min(0.25, 0.05 × weeksPersisting)
priority   = clamp01(base + persistBonus)

// Severity floor: don't let a real, confirmed concern
// get buried purely by low novelty.
if severity ≥ 0.8 AND confidence = high:
    priority = max(priority, 0.5)
```

- **severity** (0–1): how bad/good the deviation is in the insight type's own scale (Appendix A)
- **confidence** (0–1): from §4
- **recency** (0–1): linear decay over 14 days since the signal first appeared
- **novelty** (0–1): 1.0 if the user has not been shown this insight in the last 7 days, 0.3 if they have (tracked via the state store in §13.1)
- **weeksPersisting** (integer): how many consecutive weeks this insight key has been present in the candidate pool — rewards long-standing concerns the user hasn't addressed
- **persistenceBonus** caps at 0.25 (≈5 weeks) so it lifts but doesn't dominate
- **severity floor** of 0.5 guarantees a high-severity, high-confidence item stays in the top half of the ranking even after novelty decays

The top-2 by priority fill the daily slots. Ties broken by severity, then by category diversity (prefer two different categories over two from the same category).

### 5.3 Opposite-sign rule

If the top candidate is a concern and the next-highest candidate is a win (e.g., a PR or strong progression), always surface the win as the second takeaway. The daily feed should not be two negatives in a row. If both top candidates are concerns, the second slot becomes a supportive "handled by your plan" message instead.

---

## 6. Action gating — when an insight becomes a CTA

An insight earns an action CTA only if **all** of the following are true:

1. Confidence is **high**
2. Severity is above the insight type's action threshold
3. The user has not dismissed the same action within the last 7 days
4. A concrete, bounded response exists ("add 1 hinge session this week", not "think about hinge")
5. RepIQ's plan engine is **not already compensating** for it in the next session

Otherwise the insight appears with "See details" / "Review this week" / "Your plan will adjust" instead of a CTA.

**Daily cap:** max 1 action CTA in the Summary tab. If two insights both qualify, the higher-priority one wins the CTA and the other is shown without one.

**Weekly cap:** max 3 action priorities in the weekly report. Monthly: max 3.

**Dismissal behavior:** when a user dismisses an action, it is suppressed for 7 days. The underlying insight still appears (downgraded to "See details"). This preserves honesty without nagging.

---

## 7. "Next Best Target" — defined

Next Best Target is a **summary-layer decision card**, not an analytics insight. It resolves a blend of (a) plan state, (b) readiness signals, (c) lifecycle state, and (d) high-confidence analytics into a single next move.

The precedence ladder below deliberately puts operational paths above analytical ones — a scheduled session almost always beats a rebalance nudge. Each path is labeled with its source so the seam between plan logic and analytics is explicit.

It resolves to exactly one of these, in order of precedence:

1. `[plan]` **Start next planned session** — if the user has a plan and a session is due today or overdue ≤ 2 days. CTA: "Start [Session Name]."
2. `[state]` **Return gently** — if returning from a gap of 7+ days. CTA: "Ease back in with [session]."
3. `[readiness]` **Recovery nudge** — if the user has trained 4+ days in a row and readiness is low. CTA: "Take a rest day."
4. `[analytics]` **Rebalance a missing movement** — if a movement bucket is `Missing` (0 sets in the comparison window) AND goal is hypertrophy/general_fitness AND plan is not already covering it next session. CTA: "Add [movement] this week."
5. `[analytics]` **Break a plateau** — if a priority exercise has been stalled for ≥ 4 sessions with high confidence. CTA: "Try a plateau option for [lift]."
6. `[analytics]` **Protect a progressing lift** — if a key lift is improving with high confidence and next session's plan is unusually heavy/risky. CTA: "Hold [lift] steady next session."
7. `[plan]` **Default** — "Continue with your plan." No CTA, just a preview of the next scheduled session.

Only one card. One target. One CTA. The source label is not rendered to the user — it's for implementation clarity so analytics-derived and operationally-derived targets don't get confused at the code layer.

---

## 8. Detailed view pattern

When a user taps into any Summary card or Home card, they land in a **detail drawer** with a fixed structure:

1. **Headline** — restatement of the insight
2. **What the numbers show** — a small chart or number block (observation layer)
3. **How we compared** — explicit comparison window label (e.g., "Last 30 days vs previous 30 days")
4. **Confidence** — band + one-line reason ("Based on 5 sessions — early signal")
5. **Why it matters** — one paragraph, plain language
6. **What RepIQ will do** — how the plan adjusts automatically, if at all
7. **What you can do** — the action, if one was gated in; otherwise "Handled by your plan" or "Review in your weekly report"
8. **Related** — 1–3 links to Stats or Progress sections with deeper breakdowns

Every field is optional except **Headline**, **What the numbers show**, and **Confidence**. Fields that don't apply are omitted, not shown empty.

**Drill-down rule:** a detail drawer can link outward (to Stats, Progress, exercise detail) but cannot itself generate new actions. Actions are only produced at the Summary/Home/report layer.

---

## 9. Empty state and early-user behavior

The plan assumes enough data to compare periods. Early users don't have that. The engine treats the first 14 days differently.

### First session → first 3 sessions

- Summary tab shows a dedicated "Getting started" headline instead of insight ranking
- No comparisons rendered (comparison requires a prior window)
- Stats shows current-period numbers only, with "Comparison unlocks after 14 days" footer
- Progress shows PRs as they happen, no trend lines
- Movement chart renders with absolute counts, no delta column

### 4–14 days

- Insights can appear but confidence is capped at `medium` regardless of signal
- No action CTAs. All insights end with "Your plan will adjust" or "See details"
- Next Best Target defaults to path 1 or 7 (start planned session / continue)

### After 14 days

Full engine behavior per §4–§7.

---

## 10. Applied per tab

### Home
- Next Best Target card (§7)
- 1–2 passive insight cards at medium+ confidence
- Streaks, PR banner, training trend — observations rendered visually, not as text insights

### Summary (daily)
- Headline (top-ranked insight, §5)
- Next Best Target
- 3 compact score cards: Consistency, Goal Alignment, Movement Balance — each with current value, delta, and drill-down
- Optional second takeaway (§5, opposite-sign rule)
- Optional single "Keep in mind" checkpoint (observation-level)
- Max 1 action CTA total

### Stats
- Zero actions. Pure observation + insight rendering at user-selected ranges.
- Movement chart, muscle distribution, main exercises, consistency breakdown, session output, goal alignment breakdown, lagging muscles
- Every section carries confidence and comparison labels when applicable
- Low-confidence insights shown here with explicit labeling

### Progress

Sub-tabs: **Goals / Body / Performance**. Each answers one question.

- **Goals** (depends on Goal Planner): active goal cards with % complete, trajectory, ETA. Reuses `computeGoalProgress`. Goal creation lives in Planner → Goals, not here — this is the tracking surface only.
- **Body**: progress photo grid + compare (built), measurements later.
- **Performance**: PR timeline, exercise progress list with status chips (improving / stable / stalled / plateau / regressing), plateau list, exercise detail drill-down with set records.

Zero actions across all sub-tabs. This is an evidence surface, not an instruction surface.

### Weekly report
- Wins (3)
- Watchouts (3)
- Movement balance snapshot
- Next-week focus (max 3 actions, §6)

### Monthly report
- Recap, PRs, distributions, consistency calendar
- Strategic corrections (max 3 actions, §6) — this is where deload, split adjustment, and volume redistribution live

---

## 11. Copy & tone guide

**Observation voice** — factual, terse.
> "18 hinge sets in the last 30 days."

**Insight voice** — interpretive, measured, never alarmed.
> "Hinge volume is down 40% vs the previous month — worth watching."

**Action voice** — specific, bounded, reversible.
> "Add one hinge-focused session this week. Your plan will fold it in."

Banned phrases on the daily surface:
- "You need to..."
- "You must..."
- "Urgent"
- "Critical"
- "Falling behind" (use "off pace")

Banned patterns:
- Stacking 3+ suggestions under a single card
- Countdown timers
- Red alert colors on anything short of a safety concern
- Social comparisons on the casual surface (leaderboards are an opt-in, secondary surface)

---

## 12. Examples

### Example A — casual user, normal day

**Home:** "Next best: Start Push A (your scheduled session)." + streak badge.
**Summary Headline:** "Bench is trending up — 3 small PRs in 2 weeks."
**Second takeaway:** none (single win is enough).
**Score cards:** Consistency 82, Goal Alignment 74, Movement Balance 68.
**No action CTA** beyond the planned session.

### Example B — casual user, concern day

**Home:** "Next best: Add a hinge session this week."
**Summary Headline:** "Hinge volume is down 40% vs the previous month."
**Second takeaway (opposite-sign rule):** "Overhead press is holding steady — good."
**Score cards:** same structure.
**Action CTA:** "Add a hinge session." Dismissible.

### Example C — advanced user, same day as B

Opens Summary → taps hinge card → detail drawer:
- Chart: weekly hinge sets over last 8 weeks
- Comparison label: "Last 30d vs previous 30d"
- Confidence: High (based on 14 sessions)
- Why it matters: imbalance with squat volume, posterior chain risk
- What RepIQ will do: "Next plan refresh adds a Deadlift/RDL slot"
- What you can do: "Add a hinge session this week" (CTA) + dismiss option
- Related: "See Movement Balance in Stats", "Exercise progress: Deadlift"

Then taps Stats → Movement chart at 90d range → sees the full distribution, including low-confidence signals that did not make the daily feed.

### Example D — week-1 user

**Summary Headline:** "Welcome. Log 3 more sessions and RepIQ will start showing trends."
**Next Best Target:** "Start your first planned session: Full Body A."
**Score cards:** show absolute numbers only. No deltas. Footer: "Comparisons unlock after 14 days."
**No insights, no actions.**

---

## 13. Engine surface (implementation sketch)

A single module produces the candidate pool. Consumers (Home, Summary, Stats, reports) call it with context.

```ts
type InsightCategory =
  | "consistency"
  | "movement_balance"
  | "muscle_coverage"
  | "exercise_progress"
  | "plateau"
  | "rotation"
  | "goal_alignment"
  | "return_from_gap"
  | "pr_event";

type Confidence = "low" | "medium" | "high";

type Insight = {
  id: string;
  category: InsightCategory;
  headline: string;              // insight-layer copy
  observation: string;           // raw fact
  comparisonWindow: string;      // "last 30d vs previous 30d"
  confidence: Confidence;
  severity: number;              // 0..1, signed via tone
  tone: "win" | "watch" | "concern" | "neutral";
  novelty: number;               // 0..1
  priority: number;              // computed, severity * confidence * recency * novelty
  action?: {
    label: string;               // "Add a hinge session this week"
    kind: "plan_nudge" | "session_start" | "deload" | "rotation" | "rest";
    dismissibleUntil?: string;   // ISO, 7d after dismiss
  };
  detail: {
    chart?: ChartRef;
    whyItMatters?: string;
    whatRepIqWillDo?: string;
    related?: Array<{ label: string; target: string }>;
  };
};

function buildInsightPool(ctx: {
  workouts: SavedWorkoutData[];
  plan: RepIQPlan;
  goal: Goal;
  range: DateRange;
  today: string;
}): Insight[];

function selectDailyTakeaways(pool: Insight[]): {
  headline: Insight;
  secondary?: Insight;            // opposite-sign rule applied
  action?: Insight;               // gated per §6
};

function selectNextBestTarget(ctx: /* same */): NextBestTarget;
```

The UI layer never recomputes priority or gating. It renders what the engine returns. This keeps casual and advanced views provably consistent.

### 13.1 Insight state store

Novelty, persistence bonus, and dismissal/snooze suppression all require per-user history. This is a first-class store, not a side effect.

```ts
type InsightEventState = "active" | "dismissed" | "snoozed";

type InsightEvent = {
  insightKey: string;        // stable identifier, see below
  category: InsightCategory;
  firstShownAt: string;      // ISO — drives persistence bonus
  lastShownAt: string;       // ISO — drives novelty decay
  shownCount: number;        // diagnostic + rate limiting
  state: InsightEventState;
  dismissedAt?: string;      // 7-day action suppression
  snoozedUntil?: string;     // ISO — shorter, user-chosen window
  lastActionLabel?: string;  // for audit / UX consistency
};

// Storage
// v1: localStorage, key = `insight_events`
// v2: backend-backed once Supabase (or chosen stack) lands
// Key scheme for insightKey must be STABLE across sessions:
//   `${category}:${scope}[:${qualifier}]`
// Examples:
//   "movement_balance:hinge:low"
//   "exercise_progress:deadlift:plateau"
//   "muscle_coverage:posterior_chain:gap"
//   "consistency:week:off_pace"
// If the key drifts (e.g., exercise renamed, bucket boundaries change),
// novelty resets and old dismissals leak — treat key stability as a
// migration concern.
```

**State semantics:**

| State | Effect on insight | Effect on action | Duration |
|---|---|---|---|
| `active` | appears per ranking | appears if gated in | — |
| `snoozed` | still appears in Stats drill-downs; hidden from Summary headline slot | action CTA hidden | until `snoozedUntil` (default 24–72h) |
| `dismissed` | still appears in Stats; may re-rank into Summary after suppression | action CTA hidden | 7 days from `dismissedAt` |

**Snooze vs dismiss** — snooze means "ask me later today/this week"; dismiss means "not this week, full stop." Both preserve the underlying insight in Stats so advanced users can still verify the signal. Only the push surfaces (Summary headline, Home CTA) honor the suppression.

**Writes happen on three events:**
1. Insight rendered on a push surface → update `lastShownAt`, increment `shownCount`
2. User taps dismiss → set `state = dismissed`, `dismissedAt = now`
3. User taps snooze → set `state = snoozed`, `snoozedUntil = now + window`

**Reads happen inside `selectDailyTakeaways` and `selectNextBestTarget`** — both consult the store before finalizing their output.

---

## 14. Non-goals

This model deliberately does **not**:

- Personalize tone based on psychological profiling in v1 (that's the Phase 5 psych-layer work)
- Use social comparisons on the default surface
- Push streak preservation as a behavior lever — RepIQ's stance is that missing a day is fine
- Show more than one "concern" at a time on the daily surface
- Generate actions from Stats or Progress tabs
- Introduce notifications or emails — in-app only for v1

---

## 15. Success criteria

The model is working if:

- A new user, week 2, can open the app and know exactly what to do next in under 10 seconds without tapping anything
- An advanced user can reconstruct every Summary claim from Stats numbers within 2 taps
- Users who open analytics do not report feeling nagged (survey + dismissal rate < 20% per action type per month)
- At most 1 action CTA appears on Summary on 95%+ of days
- The action that is shown corresponds to something the user can do in their next session

---

## 16. Relationship to existing docs

- `analytics-plan-updated_v1.md` — product-level spec for tabs, charts, reports. This doc implements its philosophy.
- `adaptive-experience-guidelines.md` — broader UX rules; this doc is consistent with those.
- `psych-layer.md` — future readiness/mood overlays plug into §13's `ctx` without changing the layer/gating model.
- `project-status.md` — current implementation state; §10 describes the target state.

---

## Appendix A — Per-category confidence scoring

The confidence formula in §4.4 requires each category to define how raw observations map to the 0–1 bands for sufficiency, signal, and noise. This appendix is the canonical table. If two categories disagree on a threshold, this table wins.

Each row defines:
- **Sufficiency**: data-volume gate. Below the floor, sufficiency = 0 regardless of signal.
- **Signal bands**: weak / moderate / strong, mapped to 0.33 / 0.66 / 1.0.
- **Noise proxy**: variability measure used in the `1 - noise` term. `n/a` means binary insight with no noise term.
- **Severity mapping**: how the signal band maps to severity (not always 1:1 with signal).

### A.1 consistency

| Measure | Weak (0.33) | Moderate (0.66) | Strong (1.0) |
|---|---|---|---|
| Sufficiency | ≥ 2 weeks of data | — | — |
| Signal | 1 session off pace | 2 off pace | 3+ off pace |
| Noise | stdev of weekly session count | | |
| Severity | 0.3 | 0.6 | 0.9 |

### A.2 volume_trend

| Measure | Weak (0.33) | Moderate (0.66) | Strong (1.0) |
|---|---|---|---|
| Sufficiency | ≥ 3 weeks of data | — | — |
| Signal (% change vs prior window) | ±8% | ±15% | ±25% |
| Noise | coefficient of variation of weekly volume | | |
| Severity | 0.3 | 0.6 | 0.85 |

### A.3 exercise_progress

| Measure | Weak (0.33) | Moderate (0.66) | Strong (1.0) |
|---|---|---|---|
| Sufficiency | ≥ 4 sessions on lift | — | — |
| Signal (Δ e1RM) | +1 kg | +3 kg | +5 kg |
| Noise | stdev of session e1RM | | |
| Severity | 0.3 (win) | 0.5 (win) | 0.7 (win) |

### A.4 plateau

| Measure | Weak (0.33) | Moderate (0.66) | Strong (1.0) |
|---|---|---|---|
| Sufficiency | ≥ 4 sessions on lift | — | — |
| Signal (consecutive stalled sessions) | 2 | 3 | 4+ |
| Noise | rep variance at top set | | |
| Severity | 0.4 | 0.65 | 0.85 |

### A.5 movement_balance

| Measure | Weak (0.33) | Moderate (0.66) | Strong (1.0) |
|---|---|---|---|
| Sufficiency | ≥ 14 days of data | — | — |
| Signal (buckets off) | 1 | 2 | 3+ |
| Noise | n/a | | |
| Severity | 0.4 | 0.7 | 0.9 |

A `Missing` bucket (0 sets) always scores strong signal regardless of bucket count.

### A.6 muscle_coverage

| Measure | Weak (0.33) | Moderate (0.66) | Strong (1.0) |
|---|---|---|---|
| Sufficiency | ≥ 14 days of data | — | — |
| Signal (% below floor) | 20% | 50% | 80%+ |
| Noise | n/a | | |
| Severity | 0.3 | 0.6 | 0.85 |

### A.7 rotation

| Measure | Weak (0.33) | Moderate (0.66) | Strong (1.0) |
|---|---|---|---|
| Sufficiency | ≥ 6 weeks training the pattern | — | — |
| Signal (weeks on same variation) | 6 | 10 | 14+ |
| Noise | n/a | | |
| Severity | 0.3 | 0.5 | 0.7 |

### A.8 goal_alignment

| Measure | Weak (0.33) | Moderate (0.66) | Strong (1.0) |
|---|---|---|---|
| Sufficiency | ≥ 14 days of data | — | — |
| Signal (score drop vs prior period) | 5 pts | 10 pts | 15+ pts |
| Noise | stdev of weekly alignment score | | |
| Severity | 0.3 | 0.55 | 0.8 |

### A.9 return_from_gap

| Measure | Weak (0.33) | Moderate (0.66) | Strong (1.0) |
|---|---|---|---|
| Sufficiency | always | — | — |
| Signal (gap length) | 7 days | 14 days | 21+ days |
| Noise | n/a | | |
| Severity | 0.4 | 0.6 | 0.8 |

### A.10 pr_event

| Measure | Weak (0.33) | Moderate (0.66) | Strong (1.0) |
|---|---|---|---|
| Sufficiency | ≥ 3 prior sessions on lift | — | — |
| Signal (% above previous best) | +1% | +3% | +5%+ |
| Noise | n/a — single event | | |
| Severity | 0.4 (win) | 0.6 (win) | 0.8 (win) |

### A.11 Interpretation rules

- **Noise proxy to `1 - noise` term:** map coefficient-of-variation (or stdev where noted) onto 0–1 using category-specific thresholds determined during implementation. Start with simple bands (CV < 0.15 → noise = 0.1, CV 0.15–0.3 → 0.4, CV > 0.3 → 0.7) and tune per category from seed data.
- **Binary insights** (no noise term): confidence = `min(sufficiency, signal)`.
- **Tone vs severity:** severity is always positive 0–1; tone (`win` / `watch` / `concern` / `neutral`) is a separate field on the insight, set by the category's sign convention.
