# Psychological Data Layer

> **Status: V1 schema designed and stubbed. Capture UI and V2 intelligence not yet built.**
>
> The types and storage functions are in `App.tsx` under `── Psychological Data Layer ──`.
> The localStorage keys are in the key constants block.

---

## Why this exists

Psychological and subjective signals — mood, energy, stress, readiness — are among the strongest predictors of training consistency and plateau. Without them, the app can only tell you *what* happened (sets, volume, duration). With them, it can tell you *why* — and start to predict and prevent the patterns that cause people to quit.

The data must be collected in V1, even though the intelligence that uses it ships in V2. Retrospective reconstruction is impossible. A user who has been logging for 6 months with psych data has 10× more coaching value than one who hasn't.

---

## Data architecture principles

1. **Separate stores, linked by ID.** Psych data is stored in its own localStorage keys, linked to session records via `sessionId = savedAt`. This keeps the existing `SavedWorkoutData` schema intact and allows psych data to evolve independently.

2. **Privacy-isolated.** All psych data lives under its own keys and is treated as more sensitive than training data. When implementing backend sync, psych data should be encrypted at rest and never included in any export or share operation by default.

3. **Nullable everywhere.** Every captured field is nullable. The user can skip any capture at any time without creating gaps that break analysis. Null means "not captured", not "zero".

4. **Version field on every schema.** Enables future migrations without data loss.

5. **Passive capture where possible.** Behavioral signals (day of week, time of day, completion rate, session source) are derived automatically at save time — zero user friction.

---

## Data stores

### 1. `repiq-psych-profile` — UserPsychProfile (singleton)

Captured at onboarding. Re-checked every 90 days (optional). Contains the user's stated motivational context, preferences, and consent flags.

```typescript
interface UserPsychProfile {
  schemaVersion: 1;

  // Onboarding: emotional "why" — what brought them here
  motivationalWhy: MotivationalWhy | null;

  // Onboarding: stated goal
  primaryGoal: TrainingGoal | null;

  // Onboarding: experience level
  experienceLevel: ExperienceLevel | null;

  // Onboarding: equipment access
  equipmentAccess: EquipmentAccess | null;

  // Onboarding: weekly schedule commitment
  scheduleCommitment: ScheduleCommitment | null;

  // Meta
  onboardingCompletedAt: string | null;   // ISO timestamp
  lastGoalCheckAt: string | null;          // ISO timestamp — 90-day re-check

  // Consent flags — each capture dimension can be turned off independently
  capturePostWorkoutMood: boolean;         // default: true
  capturePostWorkoutEnergy: boolean;       // default: true
  captureSessionRPE: boolean;              // default: true
  captureDailyReadiness: boolean;          // default: true
  capturePassiveBehavior: boolean;         // default: true (session timing, completion rates)
}
```

**MotivationalWhy values and their meaning:**

| Value | Screen label | Coaching implication |
|---|---|---|
| `"inconsistent"` | "I've been inconsistent and want to fix that" | Accountability-first; streak and re-engagement copy matters most |
| `"plateau"` | "I've hit a plateau and need structure" | Achievement-first; progressive overload visibility, plateau detection |
| `"look_feel_stronger"` | "I want to look and feel stronger" | Visual progress emphasis; body composition framing |
| `"fresh_start"` | "I'm starting fresh" | Low-pressure onboarding; beginner-friendly defaults |
| `"feel_good"` | "I just want to feel good" | Wellbeing framing; recovery emphasis; lower intensity defaults |

---

### 2. `repiq-post-workout-psych` — PostWorkoutPsych[]

Captured at the end of Finish Workout flow, after the Report screen. One entry per session. All fields optional.

```typescript
interface PostWorkoutPsych {
  schemaVersion: 1;

  // Foreign key — links to SavedWorkoutData.savedAt
  sessionId: string;

  // When this was captured (may be later than session end if user fills it in after)
  capturedAt: string;  // ISO timestamp

  // Post-session mood: 1 (very low) → 5 (great)
  postMood: MoodRating | null;

  // Post-session energy: 1 (drained) → 5 (on fire)
  postEnergy: EnergyRating | null;

  // Perceived exertion for the whole session: 1 (very easy) → 10 (max effort)
  // Note: per-exercise RPE is captured separately in the logger.
  // This is the session-level subjective load.
  sessionRPE: RPERating | null;

  // Optional free-text note about the session (separate from SavedWorkoutData.note
  // which is a pre-existing training note; this is a psychological reflection)
  psychNote: string | null;  // max 280 chars
}
```

**Emoji scales (UI reference):**

| Rating | Mood emoji | Mood label | Energy emoji | Energy label |
|---|---|---|---|---|
| 1 | 😞 | Very low | 😴 | Drained |
| 2 | 😕 | Low | 😪 | Tired |
| 3 | 😐 | Neutral | 😐 | Okay |
| 4 | 🙂 | Good | ⚡ | Energised |
| 5 | 😄 | Great | 🔥 | On fire |

**RPE scale (UI reference):**

| RPE | Label |
|---|---|
| 1–2 | Very easy — warm-up pace |
| 3–4 | Light — could do much more |
| 5–6 | Moderate — challenging but sustainable |
| 7–8 | Hard — very challenging |
| 9 | Very hard — near max |
| 10 | Max effort — nothing left |

---

### 3. `repiq-daily-readiness` — DailyReadiness[]

Captured via the Home daily card. One entry per calendar day. All signal fields optional.

```typescript
interface DailyReadiness {
  schemaVersion: 1;

  // Calendar date this check-in applies to
  date: string;  // YYYY-MM-DD

  // When the check-in was captured
  capturedAt: string;  // ISO timestamp

  // Sleep quality last night: 1 (poor) / 2 (ok) / 3 (great)
  sleepQuality: ThreePointScale | null;

  // Stress level today: 1 (low) / 2 (medium) / 3 (high)
  stressLevel: ThreePointScale | null;

  // Energy level right now: 1 (low) / 2 (medium) / 3 (high)
  energyLevel: ThreePointScale | null;

  // Populated after the day's session completes — was there one?
  followedBySessionId: string | null;

  // True if the user had a planned session today but did not start it
  // Populated at end of day (or next app open) by comparing plan schedule vs sessions
  skippedPlannedSession: boolean;
}
```

**Composite readiness score (V2 derived):**
```
readinessScore = ((4 - stressLevel) + sleepQuality + energyLevel) / 7
```
Yields a 0–1 score. Low stress (1) + great sleep (3) + high energy (3) = 6/7 = 0.86 (high readiness). High stress (3) + poor sleep (1) + low energy (1) = 2/7 = 0.29 (low readiness).

---

### 4. `repiq-session-behavior` — SessionBehaviorSignals[]

Captured automatically at `finalizeFinishedWorkoutSave`. Zero user input required. One entry per completed session.

```typescript
interface SessionBehaviorSignals {
  schemaVersion: 1;

  // Foreign key — links to SavedWorkoutData.savedAt
  sessionId: string;

  // Calendar date
  date: string;  // YYYY-MM-DD

  // Day of week: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;

  // Derived from session start time
  timeOfDay: TimeOfDay;

  // Absolute start time
  startedAt: string;  // ISO timestamp

  // Duration in minutes (integer)
  actualDurationMinutes: number;

  // From plan if available
  plannedDurationMinutes: number | null;

  // Completion ratios — null if session had no plan
  plannedExerciseCount: number | null;
  actualExerciseCount: number;

  plannedSetCount: number | null;
  completedSetCount: number;

  // 0.0–1.0, null if no plan to compare against
  setCompletionRate: number | null;

  // Where did this session originate
  sessionSource: SessionSource;

  // If from a plan, which plan
  planId: string | null;

  // Number of rest timer uses during session
  restTimerUseCount: number;

  // Were any exercises added mid-session (beyond original plan)
  midSessionExercisesAdded: number;
}
```

**TimeOfDay buckets:**

| Value | Hours |
|---|---|
| `"early_morning"` | 04:00–07:00 |
| `"morning"` | 07:00–11:00 |
| `"afternoon"` | 11:00–17:00 |
| `"evening"` | 17:00–21:00 |
| `"night"` | 21:00–04:00 |

**SessionSource values:**

| Value | Meaning |
|---|---|
| `"plan"` | Started from a saved plan in My Workouts |
| `"template"` | Started from a Library template |
| `"generated"` | Started after Generate Workout flow |
| `"goal_planner"` | Started after Goal Planner flow |
| `"quick"` | Quick Session (blank) from Home |
| `"resume"` | Resumed an in-progress session |

---

### 5. `repiq-derived-psych` — DerivedPsychProfile (V2 computed, schema defined now)

This record is **written by V2 analytics**, not by any user action. It is a cached computed summary of all the above data. Defined in V1 schema so the storage slot is reserved and the type is available when V2 ships.

```typescript
interface DerivedPsychProfile {
  schemaVersion: 1;

  computedAt: string;  // ISO timestamp — when this derivation was last run

  // How confident the system is in these derivations (0–1)
  // Low confidence = less data, don't surface to user yet
  confidenceScore: number;

  // Derived motivation style
  motivationStyle: MotivationStyle | null;

  // Best days of week to train (by consistency %)
  bestTrainingDays: (0 | 1 | 2 | 3 | 4 | 5 | 6)[];

  // Days with highest skip rate
  skipRiskDays: (0 | 1 | 2 | 3 | 4 | 5 | 6)[];

  // Best time of day (by session completion rate and mood outcome)
  bestTimeOfDay: TimeOfDay | null;

  // Rolling averages (last 30 days)
  avgSessionsPerWeek: number | null;
  avgReadinessScore: number | null;    // 0–1 from daily check-ins
  avgPostMood: number | null;          // 1–5
  avgPostEnergy: number | null;        // 1–5
  avgSessionRPE: number | null;        // 1–10
  avgSetCompletionRate: number | null; // 0–1

  // Trend directions (last 14 days vs 14 days before that)
  moodTrend: Trend | null;
  energyTrend: Trend | null;
  consistencyTrend: Trend | null;
  volumeTrend: Trend | null;

  // Active recommendations
  deloadRecommended: boolean;
  deloadReason: string | null;  // human-readable explanation

  // Goal alignment
  statedGoal: TrainingGoal | null;
  behaviourAlignedWithGoal: boolean | null;
  goalDriftDetectedAt: string | null;  // ISO timestamp — when drift was first noticed
}
```

---

## Capture point map

Where each piece of data enters the system:

```
App Launch (cold start, no session)
  └── UserPsychProfile.capturePassiveBehavior check
        └── If today has no DailyReadiness entry → show Home readiness card

Onboarding Step 1
  └── UserPsychProfile.motivationalWhy

Onboarding Step 2
  └── UserPsychProfile.primaryGoal

Onboarding Step 3
  └── UserPsychProfile.experienceLevel

Onboarding Step 4
  └── UserPsychProfile.equipmentAccess

Onboarding Step 5
  └── UserPsychProfile.scheduleCommitment
        └── UserPsychProfile.onboardingCompletedAt = now()

Home (daily, dismissible card — max once per day)
  └── DailyReadiness.sleepQuality
  └── DailyReadiness.stressLevel
  └── DailyReadiness.energyLevel
        └── DailyReadiness.capturedAt = now()

finalizeFinishedWorkoutSave() — automatic, zero friction
  └── SessionBehaviorSignals (all fields derived from existing session data)
        └── SessionBehaviorSignals.sessionId = savedAt
        └── SessionBehaviorSignals.dayOfWeek = derived from date
        └── SessionBehaviorSignals.timeOfDay = derived from startInstant
        └── SessionBehaviorSignals.setCompletionRate = completedSets / plannedSets
        └── SessionBehaviorSignals.sessionSource = context variable
        └── DailyReadiness.followedBySessionId = savedAt (if today has an entry)

Finish Workout → Report screen → psych prompt (optional, skippable)
  └── PostWorkoutPsych.postMood
  └── PostWorkoutPsych.postEnergy
  └── PostWorkoutPsych.sessionRPE
  └── PostWorkoutPsych.psychNote (optional)
        └── PostWorkoutPsych.sessionId = savedAt
        └── PostWorkoutPsych.capturedAt = now()

90-day goal re-check (triggered from Home or notification)
  └── UserPsychProfile.primaryGoal (updated)
  └── UserPsychProfile.motivationalWhy (updated)
  └── UserPsychProfile.lastGoalCheckAt = now()
```

---

## V2 intelligence that this enables

Once ~4 weeks of data exists:

| Signal available | V2 feature unlocked |
|---|---|
| `DailyReadiness` × `SessionBehaviorSignals` | Predict skip-risk days; surface lighter alternatives |
| `PostWorkoutPsych.postMood` trend declining | Deload recommendation |
| `SessionBehaviorSignals.timeOfDay` + completion rate | "You're most consistent at morning sessions" |
| `SessionBehaviorSignals.dayOfWeek` skip pattern | "You've skipped Thursday 3 weeks running — want to move it?" |
| `DailyReadiness.stressLevel` high + planned heavy session | Auto-suggest deload variant |
| `MotivationalWhy` + adherence pattern | Derived `MotivationStyle` → personalised notification copy |
| `PostWorkoutPsych.sessionRPE` high + mood/energy declining | Overtraining signal |
| `UserPsychProfile.primaryGoal` vs actual session types | Goal drift detection |

---

## Privacy & consent

- All psych data is stored under `repiq-psych-*` keys, separate from training data
- Any individual capture dimension can be disabled in Profile → Preferences → My Data
- Disabling a dimension stops future capture; does not delete historical data (unless user explicitly clears)
- Clearing psych data: Profile → Preferences → My Data → Clear psychological data → confirm
- On account deletion: all psych data is deleted immediately, no archive
- Psych data is **never included** in plan shares, shareable cards, or community features
- The derived profile (`repiq-derived-psych`) is never shown to the user as a label — it only influences UI behaviour silently
- Exception: Insights → Analyzer (V2) will show the user their own patterns on opt-in

---

## localStorage keys (to add to App.tsx key constants)

```typescript
const psychProfileStorageKey      = "repiq-psych-profile";
const postWorkoutPsychStorageKey   = "repiq-post-workout-psych";
const dailyReadinessStorageKey     = "repiq-daily-readiness";
const sessionBehaviorStorageKey    = "repiq-session-behavior";
const derivedPsychStorageKey       = "repiq-derived-psych";
```
