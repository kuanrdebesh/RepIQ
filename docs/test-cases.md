# RepIQ Test Cases

Living registry of test cases across all built modules. Updated as features are added or changed.

**Status key**
- ✅ Verified working
- ❌ Known broken
- ⚠️ Partial / edge case issue
- 🔲 Not yet tested
- 🚧 Feature not built yet

---

## Onboarding

| ID | Test | Expected | Status |
|---|---|---|---|
| OB-01 | First launch with no localStorage | Onboarding shown before any other view | ✅ |
| OB-02 | Step 1 — enter name and select gender | Values saved; Next enabled | ✅ |
| OB-03 | Step 2 — height/weight inputs, metric/imperial toggle | Unit system persists across steps | ✅ |
| OB-04 | Step 3 — experience chips + returning-after-break toggle | Break duration stepper appears only when toggle is on | ✅ |
| OB-05 | Step 4 — days/week stepper, session length, best time, style chips | All selections persist | ✅ |
| OB-06 | Step 5 — mindset chips + success vision textarea | Data saved to UserPsychProfile | ✅ |
| OB-07 | Complete onboarding → PostOnboardingPage shown | Personalized greeting, profile summary, what's-next checklist | ✅ |
| OB-08 | "Let's Go →" on PostOnboarding → Home | No re-shows onboarding | ✅ |
| OB-09 | Reload after onboarding complete | Skips onboarding, goes to Home | ✅ |
| OB-10 | Theme toggle on all 5 steps | Theme changes live on every step | ✅ |
| OB-11 | Step 1 gradient (light mode) | Blue → teal full-page gradient | ✅ |
| OB-12 | Step 1 gradient (dark mode) | Navy → teal gradient | ✅ |
| OB-13 | Steps 2–5 background | White (var(--paper)), not gradient | ✅ |
| OB-14 | Returning-after-break banner on PostOnboarding | Only shows if `isReturningAfterBreak = true` | ✅ |

---

## Dev Landing Page

| ID | Test | Expected | Status |
|---|---|---|---|
| DEV-01 | Add `?dev` to URL | Dev landing page shown | ✅ |
| DEV-02 | Navigate to any AppView from dev page | Correct view opens | ✅ |
| DEV-03 | Preview PostOnboarding from dev page | PostOnboarding shown without re-running onboarding | ✅ |
| DEV-04 | Reset Onboarding | Clears `onboardingCompletedAt`; onboarding shown on next load | ✅ |
| DEV-05 | Remove `?dev` from URL | Returns to normal app | ✅ |

---

## Home

| ID | Test | Expected | Status |
|---|---|---|---|
| HM-01 | Home loads after onboarding | Bottom nav visible; no logger or onboarding shown | ✅ |
| HM-02 | Profile avatar (top-right) | Opens ProfilePage | ✅ |
| HM-03 | Latest workout card — no workouts | Empty state prompt shown | ✅ |
| HM-04 | Latest workout card — workout exists | Shows session name, date, duration, sets | 🔲 |
| HM-05 | Quick Workout button — no active workout | Opens fresh logger session with timer at 0 | ✅ |
| HM-06 | Quick Workout button — active workout exists | Button disabled or shows resume state | ✅ |
| HM-07 | Bottom nav: Home → Planner → Insights | Correct views switch; active tab highlighted | ✅ |

---

## Workout Logger

| ID | Test | Expected | Status |
|---|---|---|---|
| LG-01 | Start workout from Home (Quick Workout) | Logger opens; timer starts at 0; startInstant recorded | ✅ |
| LG-02 | Start workout from My Workouts plan | Logger opens with exercises pre-loaded; timer at 0 | ✅ |
| LG-03 | Timer ticks live while logger open | Duration updates every second | ✅ |
| LG-04 | Log weight + reps → mark set done | Set row shows done state; volume updates in top strip | ✅ |
| LG-05 | RPE field on set row | Value accepted; no required validation | ✅ |
| LG-06 | Add set to exercise | New blank row appended | ✅ |
| LG-07 | Remove set from exercise | Row removed; count updates | ✅ |
| LG-08 | Set type selector (normal / warmup / drop / rest-pause / failure) | Type badge updates on row | ✅ |
| LG-09 | Collapse exercise card | Shows logged volume, set count, reward summary | ✅ |
| LG-10 | Expand all / Collapse all | All cards toggle correctly | ✅ |
| LG-11 | Drag reorder exercise from expanded header | Order updates; no data lost | ✅ |
| LG-12 | Exercise sticky note | Note saved per exercise | ✅ |
| LG-13 | Editable rest timer per exercise | Timer value updated | ✅ |
| LG-14 | Rest dock appears after set marked done | Full-width bottom tray; countdown starts | ✅ |
| LG-15 | Rest dock minimize | Collapses to compact FAB timer | ✅ |
| LG-16 | Rest dock −5 / +5 controls | Adjusts countdown correctly | ✅ |
| LG-17 | Rest dock dismiss | Dock hidden; restorable from workout actions | ✅ |
| LG-18 | Active exercise highlight — blue name + green dot | First incomplete exercise highlighted | ✅ |
| LG-19 | All exercises complete — no stale active highlight | No exercise shows active state | ✅ |
| LG-20 | Between-exercises timer after last set of an exercise | Between-exercise timer starts | ✅ |
| LG-21 | Superset grouping — add two exercises to superset | Badge appears on both; grouped visually | ✅ |
| LG-22 | Superset — remove from superset | Badge removed | ✅ |
| LG-23 | Set-level reward — new PB | Medal + text appears inline on set row | ✅ |
| LG-24 | Exercise-level reward | Shows in exercise header | ✅ |
| LG-25 | Reward summary modal | Opens centered; shows all rewards | ✅ |
| LG-26 | Guidance strip — top / inline / both / neither options | Display mode changes in workout settings | ✅ |
| LG-27 | Guidance modal tap (inline) | Centered modal with full tip | ✅ |
| LG-28 | Back button from logger | Leave-workout sheet (not discard) | ✅ |
| LG-29 | "Come back later" from leave sheet | Returns to Home/Planner; workout state preserved | ✅ |
| LG-30 | Resume workout from Home | Logger reopens with same state | ✅ |
| LG-31 | Cannot start new workout while one is active | Quick Workout disabled; plan-start blocked | ✅ |
| LG-32 | Finish Workout — no completed sets | Finish button does nothing | ✅ |
| LG-33 | Finish Workout — incomplete sets only | Combined warning modal shown | ✅ |
| LG-34 | Finish Workout — blank reps on done sets | Combined warning modal shown | ✅ |
| LG-35 | Combined warning modal — "Go Back And Finish" | Returns to logger | ✅ |
| LG-36 | Combined warning modal — "Finish Anyway" | Proceeds to Finish Workout page; incomplete sets ignored | ✅ |
| LG-37 | Finish Workout — all sets complete | Goes directly to Finish Workout page | ✅ |
| LG-38 | Focused expanded-card mode | Tapping a collapsed card centers and dims others | ✅ |
| LG-39 | Tap outside focused card | Exits focus mode | ✅ |

---

## Add Exercise

| ID | Test | Expected | Status |
|---|---|---|---|
| AE-01 | All Exercises tab — alphabetical browse | Full list shown A–Z | ✅ |
| AE-02 | Search — single term | Matches exercise name and muscle | ✅ |
| AE-03 | Search — multi-word (any order) | "press chest" finds Bench Press | ✅ |
| AE-04 | By Muscle tab — 10 canonical groups | Chest / Back / Shoulders / Core / Biceps / Triceps / Quads / Hamstrings / Glutes / Calves | ✅ |
| AE-05 | By Muscle — secondary drill-down on by default | Sub-groups visible without extra tap | ✅ |
| AE-06 | Types tab — collapse / expand groups | Toggle works per group | ✅ |
| AE-07 | Expand All / Collapse All | All groups toggle | ✅ |
| AE-08 | Multi-select — numbered badges in selection order | Badges show 1, 2, 3… in order tapped | ✅ |
| AE-09 | "In workout" quick filter | Shows only exercises already in the session | ✅ |
| AE-10 | "Selected" quick filter | Shows only currently selected exercises | ✅ |
| AE-11 | Fixed bottom add-action bar | Appears when ≥1 exercise selected | ✅ |
| AE-12 | Info (i) action on exercise row | Opens Exercise Detail without selecting | ✅ |
| AE-13 | Custom exercise "MINE" amber badge | Appears on all user-created exercises | ✅ |
| AE-14 | Smart Replace mode — replace exercise | Opens with blank query; rank hint chips on each exercise row | ✅ |

---

## Custom Exercise

| ID | Test | Expected | Status |
|---|---|---|---|
| CE-01 | Create custom exercise — step 1 (name + primary muscle) | Can't proceed without both | ✅ |
| CE-02 | Create custom exercise — step 2 (secondary muscles + movement pattern) | Optional; can complete without | ✅ |
| CE-03 | Duplicate name | Should warn / offer rename | 🔲 |
| CE-04 | Edit custom exercise from Exercise Detail | Form pre-filled; saves updates | ✅ |
| CE-05 | Delete custom exercise — unused | Removed from library | ✅ |
| CE-06 | Archive custom exercise — has history | Hidden from library; history preserved | ✅ |
| CE-07 | MINE badge visible after creation | Appears in all exercise tabs | ✅ |

---

## Finish Workout

| ID | Test | Expected | Status |
|---|---|---|---|
| FW-01 | Session name carried from logger | Pre-filled in finish flow | ✅ |
| FW-02 | Edit session name on finish screen | Updated name saved | ✅ |
| FW-03 | Add workout note | Saved in workout data | ✅ |
| FW-04 | Stats shown — duration, volume, sets, exercises | All correct | ✅ |
| FW-05 | Rewards section shown | All earned rewards listed | ✅ |
| FW-06 | Add up to 3 images | Images attached; 4th blocked | 🔲 |
| FW-07 | Save workout | Saved to `saved-workouts` localStorage; routes to Report | ✅ |
| FW-08 | Workout Report shown after save | Hero stats, exercises, rewards | ✅ |
| FW-09 | Share Summary from Report | Routes to share view | ✅ |
| FW-10 | SessionBehaviorSignals captured on save | Day, time, duration, completion rate stored silently | ✅ |
| FW-11 | durationSeconds stored correctly | Matches actual elapsed time | ✅ |

---

## Workout Planner — General

| ID | Test | Expected | Status |
|---|---|---|---|
| PL-01 | Planner opens to My Workouts tab by default | Tab active; cards shown if any | ✅ |
| PL-02 | RepIQ Plan mode + Custom mode — dropdown toggle | Switches between modes | ✅ |
| PL-03 | Planner mode dropdown — click outside | Dropdown closes | ✅ |
| PL-04 | Bottom nav visible on Planner | Home / Planner / Insights tabs | ✅ |

---

## My Workouts (Custom Planner)

| ID | Test | Expected | Status |
|---|---|---|---|
| MW-01 | Plan card tap → plan detail page | Detail opens with exercises | ✅ |
| MW-02 | Plan detail — Start Workout button | Logger opens with plan exercises | ✅ |
| MW-03 | Plan detail — Edit icon button (pencil) | Opens PlanBuilderPage in edit mode | ✅ |
| MW-04 | Plan detail — Delete icon button (trash) | Confirmation then deleted | ✅ |
| MW-05 | Plan detail — Edit + Delete not shown for sample plans | Icon buttons hidden | ✅ |
| MW-06 | Plan card three-dot menu — open | Menu appears | ✅ |
| MW-07 | Plan card three-dot menu — click outside | Menu closes | ✅ |
| MW-08 | Plan card — duplicate | New copy appears in My Workouts | ✅ |
| MW-09 | Plan card — delete | Removed after confirmation | ✅ |
| MW-10 | Plan card — tag editing | Tags updated on card | ✅ |
| MW-11 | Drag reorder plans | Order persists | ✅ |
| MW-12 | Tag filter | Filters to matching plans | ✅ |
| MW-13 | Back from PlanBuilder (edit) → returns to Custom mode | Not RepIQ mode | ✅ |

---

## Library

| ID | Test | Expected | Status |
|---|---|---|---|
| LB-01 | Library tab shows template cards | Cards visible | ✅ |
| LB-02 | Filter tray — Type / Level / Goal / Equipment | Filters apply | ✅ |
| LB-03 | Template card tap → detail page | Preview with exercises | ✅ |
| LB-04 | Start Workout from template | Logger opens | ✅ |
| LB-05 | Save to My Workouts from template | Appears in My Workouts | ✅ |

---

## Workout Builder / Plan Builder

| ID | Test | Expected | Status |
|---|---|---|---|
| WB-01 | Create new workout — name required | Can't save without name | ✅ |
| WB-02 | Add exercises | Exercises appear in builder list | ✅ |
| WB-03 | Drag reorder exercises in builder | Order updates | ✅ |
| WB-04 | Per-exercise rest editing | Rest value saved | ✅ |
| WB-05 | Per-set type editing | Set type updates | ✅ |
| WB-06 | Add / remove sets per exercise | Count updates | ✅ |
| WB-07 | Tags — typeable, create-on-demand | New tag created inline | ✅ |
| WB-08 | Save workout → appears in My Workouts | Card visible | ✅ |
| WB-09 | Edit existing workout — save changes | Updated data persists | ✅ |
| WB-10 | Delete in edit mode | Removed after confirmation | ✅ |
| WB-11 | Unsaved new draft persists on navigate away | Draft restored on return | ✅ |
| WB-12 | Discard draft | Draft cleared | ✅ |

---

## RepIQ Plan

| ID | Test | Expected | Status |
|---|---|---|---|
| RP-01 | Generate RepIQ plan from preferences | Plan created and shown | ✅ |
| RP-02 | Plan displayed with weeks and session cards | Week/day structure visible | ✅ |
| RP-03 | Future sessions locked until prior week complete | Lock icon shown | ✅ |
| RP-04 | Start session from RepIQ plan | Logger opens with plan exercises | ✅ |
| RP-05 | Pause plan | isPaused = true; banner shown | ✅ |
| RP-06 | Adjust Preferences overlay | Plan length and other prefs editable | ✅ |
| RP-07 | Plan Length field alignment in overlay | Aligned with other input fields | ✅ |
| RP-08 | needsReview banner — appears after non-plan workout saved | Banner visible | ✅ |
| RP-09 | needsReview banner — "Regenerate remaining sessions" | Remaining sessions regenerated; flag cleared | ✅ |
| RP-10 | needsReview banner — "Dismiss" | Flag cleared; banner gone; no regen | ✅ |
| RP-11 | needsReview flag — guard: workout saved before lastRegeneratedAt | Flag NOT set | ✅ |
| RP-12 | needsReview flag — extra volume workout deleted | Flag set if after lastRegeneratedAt | ✅ |
| RP-13 | Completed sessions — collapsible history section | "Completed · N sessions" toggle | ✅ |
| RP-14 | Completed session card — always clickable | Opens WorkoutHistoryDetailPage | ✅ |
| RP-15 | Completed session card — "Save to My Workouts" | Only shown when real saved workout exists | ✅ |
| RP-16 | Planner mode dropdown — RepIQ ↔ Custom toggle | Switches correctly | ✅ |
| RP-17 | Planner mode dropdown — click outside closes | Closes without selecting | ✅ |

---

## Workout History Detail

| ID | Test | Expected | Status |
|---|---|---|---|
| HD-01 | Open completed session — real saved workout | Hero stats, actual exercises + logged sets | ✅ |
| HD-02 | Open completed session — no saved workout (plan fallback) | Synthetic data shown; exercises "not logged" | ✅ |
| HD-03 | Hero gradient and stats row | Duration / Sets / Exercises / Volume displayed | ✅ |
| HD-04 | Both "Edit Session" and "Share Summary" always shown | Neither button conditionally hidden | ✅ |
| HD-05 | "Edit Session" → opens logger | Logger opens with session exercises | ✅ |
| HD-06 | Timer pre-seeded from durationSeconds | Timer starts at original session duration, not 0 | ✅ |
| HD-07 | Timer pre-seed fallback for older sessions | Parses duration string ("45:30") if durationSeconds = 0 | ✅ |
| HD-08 | "Share Summary" → opens share cards directly | PostSaveShareScreen shown with session data; no intermediate report page | ✅ |
| HD-09 | Back button → returns to Planner | Planner shown (not Home) | ✅ |
| HD-10 | Edit session → save → share summary reflects new data | ⚠️ Deferred — currently appends new entry; overwrite pending | ⚠️ |

---

## Insights

| ID | Test | Expected | Status |
|---|---|---|---|
| IN-01 | Insights opens to Reports tab | History list shown | ✅ |
| IN-02 | Tap history card → WorkoutReportPage | Report detail opens | ✅ |
| IN-03 | Analyzer tab | Tab switches | ✅ |
| IN-04 | Delete button removed from history cards | No delete on card; reserved for future dropdown | ✅ |
| IN-05 | Save to My Workouts from history card | Workout saved as plan | ✅ |

---

## Profile

| ID | Test | Expected | Status |
|---|---|---|---|
| PR-01 | Profile opens from Home avatar | Profile page shown | ✅ |
| PR-02 | Max-width 430px on profile page | Matches all other pages | ✅ |
| PR-03 | Preferences row | Opens preferences | 🔲 |
| PR-04 | Account row | Opens account settings | 🔲 |
| PR-05 | Import / Export row | Opens import/export | 🔲 |

---

## Theme

| ID | Test | Expected | Status |
|---|---|---|---|
| TH-01 | Light mode — all pages | Correct token colors applied | ✅ |
| TH-02 | Dark mode — all pages | Dark tokens applied; no neon or muddy contrast | ✅ |
| TH-03 | System preference | Follows OS setting | ✅ |
| TH-04 | Theme toggle persists across reload | Preference saved to localStorage | ✅ |
| TH-05 | Theme toggle visible on all key pages | Logger, Finish, Report, Planner, Insights, Profile, Onboarding | ✅ |

---

## Smart Replace

| ID | Test | Expected | Status |
|---|---|---|---|
| SR-01 | Replace exercise via ⋮ menu | Opens AddExercisePage in replace mode; Suggested tab active | ✅ |
| SR-02 | Suggested tab — only ranked candidates shown | Only exercises that passed hard exclusions appear; not the full library | ✅ |
| SR-03 | Browse All tab — full library | All exercises shown alphabetically; no smart ranking filter applied | ✅ |
| SR-04 | Browse All — muscle dropdown filter | Filters list to selected muscle group | ✅ |
| SR-05 | Browse All — equipment dropdown filter | Filters list to selected equipment | ✅ |
| SR-06 | Inline reason chips | Reason choices visible in replace mode without blocking the user | ✅ |
| SR-07 | Reason — machine_taken | Hard-excludes machine + smith_machine candidates from Suggested | ✅ |
| SR-08 | Reason — no_equipment | Hard-excludes all non-bodyweight/cardio candidates | ✅ |
| SR-09 | Reason — too_difficult | Hard-excludes candidates harder than original (non-advanced users) | ✅ |
| SR-10 | Reason — pain_discomfort | Safer options rise via difficultyFit scoring | ✅ |
| SR-11 | Equipment unavailable chip | Toggling removes same-equipment exercises from Suggested | ✅ |
| SR-12 | Equipment unavailable chip — off | Returns full Suggested list including same-equipment exercises | ✅ |
| SR-13 | Hard exclusion — same exercise | Original exercise never appears in Suggested | ✅ |
| SR-14 | Hard exclusion — session duplicate | Exercises already in the session are excluded from Suggested | ✅ |
| SR-15 | Hard exclusion — zero shared muscles | Candidates with no primary or secondary muscle overlap with original are excluded | ✅ |
| SR-16 | Laterality — bilateral replaces bilateral | Bilateral exercises rank above unilateral when replacing a bilateral exercise | ✅ |
| SR-17 | Laterality — unilateral replaces unilateral | Unilateral exercises rank above bilateral when replacing a unilateral exercise | ✅ |
| SR-18 | Laterality — inferred from name | "Single-Arm Dumbbell Press" inferred as unilateral even without movementSide field | ✅ |
| SR-19 | Equipment diversity — max 2 per type | After sorting, no more than 2 barbell (or any) exercises appear consecutively before other equipment types fill in | ✅ |
| SR-20 | Equipment eligibility | Unavailable equipment classes excluded (including TRX via implement field) | ✅ |
| SR-21 | Last replaced with section — shown | Appears above Possible replacements when user has replaced this exercise before | ✅ |
| SR-22 | Last replaced with section — hidden | Not shown when no replacement history exists for this exercise | ✅ |
| SR-23 | Last replaced with — max 5 | Shows up to 5 most recent unique replacements | ✅ |
| SR-24 | Last replaced with — search applies | Search query filters the Last replaced with section | ✅ |
| SR-25 | History matching uses base IDs | Session exercise `bench-press-1748...-1` matches history entry `bench-press` | ✅ |
| SR-26 | Replace mode ranking hints | Match reason copy appears on exercise rows in Suggested | ✅ |
| SR-27 | Confirm swap — 0 sets logged | Silent swap; no confirmation modal | ✅ |
| SR-28 | Confirm swap — sets already logged | Confirmation modal before clearing and replacing | ✅ |
| SR-29 | Exercise replaced in-place | Same position; rest timer, note, superset preserved; sets reset | ✅ |
| SR-30 | ReplacementEvent stored | Written to `repiq-replacement-events`; includes reason, setsAlreadyLogged, matchScore | ✅ |
| SR-31 | Learned preference — ranking boost | Previously chosen replacement scores higher (preferenceFit) on next replace | ✅ |
| SR-32 | Search in Suggested | Filters Suggested candidates by name/muscle; no non-candidate exercises appear | ✅ |

---

## Generate Session — Determinism and Shuffle

| ID | Test | Expected | Status |
|---|---|---|---|
| GS-01 | Same GenConfig inputs produce same plan | Two calls with identical goal/muscles/duration/seedOffset produce identical exercise lists | ✅ |
| GS-02 | Shuffle button increments seedOffset | New plan shown; different exercise order or selection | ✅ |
| GS-03 | Exercise cards collapsed by default in Plan Builder | All exercise cards start collapsed | ✅ |
| GS-04 | Tap exercise card to expand | Card expands; others stay collapsed | ✅ |
| GS-05 | Shuffle resets expanded state | All cards collapse after shuffle (expandedIds cleared on draft.id change) | ✅ |
| GS-06 | Compress/Regenerate hidden when sessionsRemaining ≤ daysRemaining | Both buttons not rendered | ✅ |
| GS-07 | Compress/Regenerate visible when sessionsRemaining > daysRemaining | Both buttons shown | ✅ |

---

## NFR — Performance

| ID | Test | Expected | Status |
|---|---|---|---|
| PF-01 | Initial app load (cold, no cache) | First meaningful paint under 2s on mobile network | 🔲 |
| PF-02 | Logger renders with 10 exercises, 5 sets each | No visible lag on scroll or set-done tap | 🔲 |
| PF-03 | Exercise library renders full catalog (~136 exercises) | List renders without stutter; search results appear instantly | 🔲 |
| PF-04 | Timer tick — no re-render of unrelated components | Only timer element re-renders each second | 🔲 |
| PF-05 | Drag reorder with 10+ exercises | No frame drops during drag | 🔲 |
| PF-06 | Theme toggle — light ↔ dark | Switches without full page repaint or flash | 🔲 |
| PF-07 | Page transitions — all AppView switches | No blank flash between views | 🔲 |
| PF-08 | localStorage read on app boot | App state hydrated before first render; no layout shift | 🔲 |

---

## NFR — Layout and Responsiveness

| ID | Test | Expected | Status |
|---|---|---|---|
| LY-01 | All pages max-width 430px centered | No page overflows on wide desktop screens | ✅ |
| LY-02 | iPhone SE (375px width) | No horizontal scroll; no clipped content | 🔲 |
| LY-03 | iPhone 14 Pro (393px width) | Standard target device; everything fits | 🔲 |
| LY-04 | Large Android (412px width) | Layout holds; no wrapping issues | 🔲 |
| LY-05 | Safe area insets (notch / home bar on iOS) | Bottom nav and rest dock clear the home bar | 🔲 |
| LY-06 | Keyboard appearance on mobile (logger inputs) | Page scrolls correctly; focused field not hidden behind keyboard | 🔲 |
| LY-07 | Landscape orientation | No broken layout; usable (not optimised) | 🔲 |
| LY-08 | Bottom nav height — all shell pages | Content not cut off behind nav | ✅ |
| LY-09 | Rest dock active — additional padding applied | Last exercise not hidden behind dock | ✅ |
| LY-10 | Onboarding step 1 gradient — full bleed | No white gap at top or bottom | ✅ |
| LY-11 | Finish Workout hero — no overflow clipping | Stats grid fits on small screens | 🔲 |
| LY-12 | Plan detail icon buttons — 44×44 tap targets | No mis-taps on small screens | 🔲 |

---

## NFR — Touch and Interaction

| ID | Test | Expected | Status |
|---|---|---|---|
| TX-01 | All primary buttons — minimum 44px tap height | Meets iOS / Android tap target guidelines | ✅ |
| TX-02 | Set row done checkbox — easy to tap | No accidental triggers on adjacent fields | 🔲 |
| TX-03 | Swipe actions on set rows | Smooth; no sticky behaviour | ✅ |
| TX-04 | Drag reorder — initiation only from drag handle | Does not conflict with scroll | ✅ |
| TX-05 | Rest dock time tap (pause/resume) | Single tap registers reliably | ✅ |
| TX-06 | Bottom sheet / modal — dismiss by tapping backdrop | Closes correctly | ✅ |
| TX-07 | Click-outside on dropdowns and card menus | All close reliably on outside tap | ✅ |
| TX-08 | Long exercise name — no overflow into action buttons | Name truncates cleanly | 🔲 |

---

## NFR — Data Integrity and Persistence

| ID | Test | Expected | Status |
|---|---|---|---|
| DI-01 | Save workout → reload app → workout in Insights history | Data survives reload | ✅ |
| DI-02 | RepIQ plan saved → reload → plan intact | Weeks, sessions, completedAt all preserved | ✅ |
| DI-03 | Onboarding data → reload → not re-shown | `onboardingCompletedAt` persists | ✅ |
| DI-04 | Edit workout → save → reopen | Changes reflected, not a duplicate | 🔲 |
| DI-05 | Delete plan → reload | Plan gone; no orphaned references | ✅ |
| DI-06 | Multiple saved workouts — correct order (newest first) | Insights history sorted correctly | 🔲 |
| DI-07 | durationSeconds stored on save | Correct elapsed seconds, not 0 | ✅ |
| DI-08 | repiqSourceKey format stored as "wi-di" | Parseable in editHistoryWorkout regex | ✅ |
| DI-09 | ReplacementEvents logged without duplicates | One event per confirmed swap | 🔲 |
| DI-10 | localStorage near-full — graceful handling | No silent data loss; user-facing error if possible | 🔲 |
| DI-11 | Corrupt localStorage value for saved-workouts | App does not crash; falls back to empty state | 🔲 |
| DI-12 | Two tabs open simultaneously | No state conflict from concurrent writes | 🔲 |

---

## NFR — Accessibility

| ID | Test | Expected | Status |
|---|---|---|---|
| AC-01 | All interactive elements have accessible labels | Buttons with icons have `aria-label` or `title` | ⚠️ |
| AC-02 | Color contrast — light mode body text | Meets WCAG AA (4.5:1 for normal text) | 🔲 |
| AC-03 | Color contrast — dark mode body text | Meets WCAG AA | 🔲 |
| AC-04 | Color contrast — muted text on cards | At least 3:1 (WCAG AA large text) | 🔲 |
| AC-05 | Focus ring visible on keyboard navigation | All interactive elements focusable | 🔲 |
| AC-06 | Error states — not communicated by color alone | Text or icon accompanies color change | 🔲 |
| AC-07 | Images — alt text present | Progress photos, icons have alt or aria-hidden | 🔲 |
| AC-08 | Form inputs — labels associated | No unlabelled inputs | 🔲 |

---

## NFR — Cross-Browser / Cross-Platform

| ID | Test | Expected | Status |
|---|---|---|---|
| CB-01 | Safari iOS (primary target) | Full functionality; no WebKit-specific regressions | 🔲 |
| CB-02 | Chrome Android | Full functionality | 🔲 |
| CB-03 | Chrome desktop (dev/testing) | Full functionality | ✅ |
| CB-04 | Safari macOS | Layout and interactions correct | 🔲 |
| CB-05 | Firefox desktop | No critical regressions | 🔲 |
| CB-06 | CSS variables (`var(--*)`) | Supported in all target browsers | ✅ |
| CB-07 | `dvh` units (100dvh) | Correct viewport height on mobile Safari | 🔲 |
| CB-08 | `env(safe-area-inset-bottom)` | Applied correctly on notched iPhones | 🔲 |
| CB-09 | Drag-and-drop reorder — touch events | Works on touch screens, not only mouse | 🔲 |

---

## NFR — Security (Pre-Backend)

| ID | Test | Expected | Status |
|---|---|---|---|
| SC-01 | No sensitive data in localStorage keys | No passwords, tokens, or PII beyond profile name | ✅ |
| SC-02 | XSS — user-supplied text rendered as text, not HTML | Session name, note, exercise name never injected as HTML | 🔲 |
| SC-03 | localStorage values — no eval or dynamic script execution | No `eval()` or `innerHTML` with user data | 🔲 |

---

## Upcoming / Not Yet Built

| ID | Module | Test | Status |
|---|---|---|---|
| UP-01 | Home | Daily Readiness Card (persistent card showing today's readiness score) | 🚧 |
| UP-02 | Home | Consent toggles in Profile → Preferences | 🚧 |
| UP-03 | Insights | Analyzer tab real UI (Training Trend, Muscle Coverage, Goal Progress surfaced) | 🚧 |
| UP-04 | Progress | Progress photo prompt at Finish Workout | 🚧 |
| UP-05 | Progress | Insights → Progress tab timeline + compare mode | 🚧 |
| UP-06 | History | Edit-save overwrites original entry (not duplicate) | 🚧 |
| UP-07 | Payments | Paywall and feature gates | 🚧 |
| UP-08 | Smart Replace | Contextual hint on 0-progress exercises after 5 min | 🚧 |
| UP-09 | Exercise Library | 435-exercise taxonomy CSV import (replaces current ~136 exercises) | 🚧 |
| UP-10 | Custom Exercise | Duplicate name warning / rename prompt during creation | 🔲 |
