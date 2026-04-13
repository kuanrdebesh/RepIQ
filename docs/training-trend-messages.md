# Training Trend Card — Messages & Logic

> **Card location:** Home screen, below the This Week snapshot  
> **Metric:** Overall volume (kg lifted), week-over-week delta across last 4 weeks  
> **Taps to:** Insights → Analyzer tab  
> **Muscle-level detail:** Available in Analyzer (card explicitly directs users there)

---

## How Zone Classification Works

Each of the last 4 weeks is classified by comparing its total volume to the prior week:

| Condition | Zone |
|---|---|
| Volume = 0 (no sessions logged) | **Missed** |
| No prior week to compare against | **Maintenance** (neutral default) |
| Volume up > 5% | **Progress** |
| Volume down > 10% | **Plateau** |
| Volume within ±5–10% | **Maintenance** |

The **current zone** is always week-0 (this week).  
The **3 week boxes** (W-2, W-1, W-0) show ISO week numbers and zone colors — oldest is dimmed, current is outlined.  
The **3-zone bar** shows the position marker at the current zone (Plateau | Maintaining | Progress).

---

## Message Table

Each state has a **zone label**, **insight line**, and **tap hint**. States are evaluated in priority order — the first match wins.

### [NO] No data / all 4 weeks missed
- **Trigger:** `workouts.length === 0` OR all 4 recent weeks are "missed"
- **Zone label:** No data yet
- **Insight:** "Log your first session and your volume trend will appear here."
- **Tap hint:** "Explore Analyzer →"
- **Rationale:** User has nothing to analyse yet; neutral call to action.

---

### [M2] Multiple missed weeks + current week also missed
- **Trigger:** `missedCount >= 2` AND `currentZone === "missed"`
- **Zone label:** On a break
- **Insight:** "A few weeks off. Let's ease back in — even one session restarts the engine."
- **Tap hint:** "Let's get back on it →"
- **Rationale:** Two or more consecutive missed weeks signals a break, not just a skip. Tone is warm and low-pressure — "ease back in" reduces the barrier to returning. The engine metaphor reinforces that momentum rebuilds fast.

---

### [M1] Current week missed (single miss, recent history exists)
- **Trigger:** `currentZone === "missed"` (missedCount < 2)
- **Zone label:** Week missed
- **Insight:** "You had good momentum — one session this week will keep it alive."
- **Tap hint:** "Let's get back on it →"
- **Rationale:** References the good prior history to remind the user they're not starting from zero. Creates urgency ("keep it alive") without guilt. One actionable step keeps the CTA achievable.

---

### [M3] Back training after 2+ missed weeks in recent history
- **Trigger:** `missedCount >= 2` AND `currentZone !== "missed"`
- **Zone label:** ↑ Resuming
- **Insight:** "Back in the gym after some missed weeks — rebuild gradually to avoid injury."
- **Tap hint:** "Track your rebuild in Analyzer →"
- **Rationale:** Celebrates the return without ignoring the gap. "Rebuild gradually" is a safety-first cue that also sets realistic expectations. Analyzer link lets them track week-by-week recovery of volume.

---

### [P3] Strong multi-week progress streak
- **Trigger:** `progressCount >= 3` (3 or 4 of last 4 weeks are Progress)
- **Zone label:** ↑ Progressing
- **Insight:** "Volume up 3+ weeks in a row. Check which muscles are carrying the load."
- **Tap hint:** "Muscle breakdown in Analyzer →"
- **Rationale:** Overall volume climbing is great — but the user should know *which muscles* are driving it (and which lag). This is the clearest moment to push them into the Analyzer because the data will be meaningful and satisfying.

---

### [P2] Two progress weeks, no plateau
- **Trigger:** `progressCount >= 2` AND `plateauCount === 0`
- **Zone label:** ↑ Progressing
- **Insight:** "Solid upward trend. Push progressive overload on your main lifts."
- **Tap hint:** "Muscle breakdown in Analyzer →"
- **Rationale:** Good but not yet a streak — coaching cue to keep the mechanism (progressive overload) explicit so the user understands *why* volume is growing.

---

### [PL2] Multi-week plateau
- **Trigger:** `plateauCount >= 2`
- **Zone label:** ↓ Plateauing
- **Insight:** "Overall volume has stalled for 2+ weeks. Something needs to change."
- **Tap hint:** "See which lifts need a reset →"
- **Rationale:** Two weeks of plateau is a real signal. "Something needs to change" is direct without being prescriptive — the Analyzer is positioned as the diagnostic tool. Deliberately avoids blaming the user.

---

### [PL1] Single-week volume dip
- **Trigger:** `currentZone === "plateau"` (plateauCount < 2)
- **Zone label:** ↓ Plateauing
- **Insight:** "Volume dipped this week. Deload intentionally or push back next session."
- **Tap hint:** "See which lifts need a reset →"
- **Rationale:** One dip could be intentional (deload) or accidental. Offering both framings removes blame and gives the user agency. "Push back next session" is an immediate, achievable action.

---

### [PR1] Progress this week, mixed recent history
- **Trigger:** `currentZone === "progress"` (progressCount < 2)
- **Zone label:** ↑ Progressing
- **Insight:** "Volume up this week. Check the Analyzer to see which muscles are leading."
- **Tap hint:** "Muscle breakdown in Analyzer →"
- **Rationale:** Progress week deserves acknowledgment, but with mixed prior weeks it's too early to call it a trend. Directing to muscle breakdown rewards curiosity ("which muscles?") and keeps engagement with data.

---

### [MT] Maintaining (fallback)
- **Trigger:** All other states (stable volume, no strong pattern)
- **Zone label:** → Maintaining
- **Insight:** "Load is steady. A small overload nudge could push you into a progress phase."
- **Tap hint:** "Muscle breakdown in Analyzer →"
- **Rationale:** Maintenance is neutral. The nudge framing makes it aspirational rather than flat. "Small overload" is actionable and non-intimidating. Analyzer link helps identify where to apply the nudge.

---

## State Priority Order (evaluated top → bottom)

```
1. [NO]  No data / all 4 missed
2. [M2]  2+ missed + current missed
3. [M1]  Current missed only
4. [M3]  2+ missed in history but current is back
5. [P3]  Progress 3+ of 4 weeks
6. [P2]  Progress 2 weeks, no plateau
7. [PL2] Plateau 2+ weeks
8. [PL1] Plateau this week only
9. [PR1] Progress this week (mixed history)
10. [MT] Maintaining (fallback)
```

---

## Design Notes

- **"Overall volume"** is shown in the card eyebrow label ("TRAINING TREND · OVERALL VOLUME") to set expectations that this is aggregate load, not per-exercise or per-muscle.
- **Muscle-level insight** is always available one tap away in the Analyzer — the tap hint for all non-missed states directs there.
- **Missed-state tap hints** always read "Let's get back on it →" (not "Analyzer") because motivation is the primary need, not data analysis.
- **Volume delta thresholds** (+5% / −10%) are intentionally asymmetric — it's harder to call something a plateau than a progress, to reduce false negatives on actual gains.
- **Week boxes** use ISO week numbers (W14, W15, W16) so users can cross-reference their own calendar or training log. Current week box has an outlined border to distinguish it from history.
