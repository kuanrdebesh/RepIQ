/**
 * RepIQ — Full-page screenshot capture
 * Usage:  npm run screenshots
 *         (requires dev server running at http://localhost:5173)
 *
 * Saves PNGs to docs/screenshots/ — filenames are prefixed so they sort
 * in the logical user journey order.
 */

import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = resolve(__dirname, "../docs/screenshots");
mkdirSync(OUT_DIR, { recursive: true });

const BASE     = "http://localhost:5173";
const VIEWPORT = { width: 430, height: 932 }; // iPhone 14 Pro Max

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Seed localStorage with a representative plan + one completed workout. */
const SEED_DATA = `
  (() => {
    const completedAt = new Date(Date.now() - 864e5).toISOString();
    const seedPlan = {
      schemaVersion:1, id:"dev-seed-plan", generatedAt:completedAt,
      startDate:completedAt.slice(0,10), planName:"Push / Pull / Legs",
      goal:"build_muscle", secondaryGoal:null, experienceLevel:"intermediate",
      daysPerWeek:3, sessionLengthMin:60, splitType:"ppl",
      mesocycleLengthWeeks:8, currentWeekIndex:0, status:"active",
      weeks: Array.from({length:8},(_,wi)=>({
        weekNumber:wi+1, isCompleted:false,
        days:[
          { sessionLabel:"Upper Push "+"ABCDEFGH"[wi],
            focus:"Chest / Shoulders / Triceps",
            completedAt: wi===0 ? completedAt : null,
            exercises:[
              {exerciseId:"bench-press",sets:4,reps:"6–8",restSeconds:120},
              {exerciseId:"incline-dumbbell-press",sets:3,reps:"8–10",restSeconds:90},
              {exerciseId:"shoulder-press",sets:3,reps:"8–10",restSeconds:90},
              {exerciseId:"cable-lateral-raise",sets:3,reps:"12–15",restSeconds:60},
              {exerciseId:"rope-pushdown",sets:3,reps:"10–12",restSeconds:60},
            ]},
          { sessionLabel:"Lower "+"ABCDEFGH"[wi], focus:"Quads / Hamstrings / Glutes",
            completedAt:null,
            exercises:[
              {exerciseId:"barbell-squat",sets:4,reps:"6–8",restSeconds:180},
              {exerciseId:"leg-press",sets:3,reps:"10–12",restSeconds:120},
              {exerciseId:"romanian-deadlift",sets:3,reps:"8–10",restSeconds:120},
            ]},
          { sessionLabel:"Pull "+"ABCDEFGH"[wi], focus:"Back / Biceps",
            completedAt:null,
            exercises:[
              {exerciseId:"weighted-pull-up",sets:4,reps:"6–8",restSeconds:120},
              {exerciseId:"chest-supported-row",sets:3,reps:"8–10",restSeconds:90},
              {exerciseId:"lat-pulldown",sets:3,reps:"10–12",restSeconds:90},
              {exerciseId:"ez-bar-curl",sets:3,reps:"10–12",restSeconds:60},
            ]},
        ],
      })),
    };
    const seedWorkout = {
      sessionName:"Upper Push A", note:"Felt strong today. Hit a small PR on bench.",
      date:completedAt.slice(0,10), duration:"1:02:14", durationSeconds:3734,
      totalVolume:6840, totalSets:16, exerciseCount:5, loggedExerciseCount:5,
      ignoredIncompleteSets:0,
      exercises:[
        {id:"bench-press",name:"Bench Press",primaryMuscle:"Chest",loggedSets:4,loggedVolume:2520,
          sets:[{weight:80,reps:8,rpe:7,setType:"normal"},{weight:80,reps:8,rpe:7.5,setType:"normal"},{weight:80,reps:7,rpe:8,setType:"normal"},{weight:77.5,reps:7,rpe:8.5,setType:"normal"}]},
        {id:"incline-dumbbell-press",name:"Incline Dumbbell Press",primaryMuscle:"Chest",loggedSets:3,loggedVolume:1260,
          sets:[{weight:32.5,reps:10,rpe:7,setType:"normal"},{weight:32.5,reps:10,rpe:7.5,setType:"normal"},{weight:32.5,reps:9,rpe:8,setType:"normal"}]},
        {id:"shoulder-press",name:"Shoulder Press",primaryMuscle:"Shoulders",loggedSets:3,loggedVolume:1260,
          sets:[{weight:40,reps:10,rpe:7,setType:"normal"},{weight:40,reps:10,rpe:7.5,setType:"normal"},{weight:40,reps:9,rpe:8,setType:"normal"}]},
        {id:"cable-lateral-raise",name:"Cable Lateral Raise",primaryMuscle:"Shoulders",loggedSets:3,loggedVolume:600,
          sets:[{weight:10,reps:15,rpe:7,setType:"normal"},{weight:10,reps:14,rpe:7.5,setType:"normal"},{weight:10,reps:13,rpe:8,setType:"normal"}]},
        {id:"rope-pushdown",name:"Rope Pushdown",primaryMuscle:"Triceps",loggedSets:3,loggedVolume:1200,
          sets:[{weight:32.5,reps:12,rpe:7,setType:"normal"},{weight:32.5,reps:11,rpe:7.5,setType:"normal"},{weight:30,reps:12,rpe:8,setType:"normal"}]},
      ],
      rewards:[], rewardSummary:{set:0,exercise:0,session:0,total:0},
      takeawayTitle:"Solid push session!", takeawayBody:"16 sets across 5 exercises. Volume up from last week.",
      images:[], savedAt:completedAt, repiqSourceKey:"0-0",
    };
    localStorage.setItem("repiq-generated-plan", JSON.stringify(seedPlan));
    const existing = JSON.parse(localStorage.getItem("repiq-saved-workouts") || "[]");
    localStorage.setItem("repiq-saved-workouts", JSON.stringify([seedWorkout, ...existing.filter(w=>w.repiqSourceKey!=="0-0")]));
    // Ensure onboarding complete + basic profile
    const raw = localStorage.getItem("repiq-psych-profile");
    const profile = raw ? JSON.parse(raw) : null;
    const base = { schemaVersion:1, name:"Alex", gender:"male", unitSystem:"metric",
      heightCm:178, weightKg:80, age:28, primaryGoal:"build_muscle",
      experienceLevel:"intermediate", daysPerWeekPref:3, sessionLengthPref:60,
      capturePostWorkoutMood:true, capturePostWorkoutEnergy:true,
      captureSessionRPE:true, captureDailyReadiness:true, capturePassiveBehavior:true };
    localStorage.setItem("repiq-psych-profile", JSON.stringify({
      ...base, ...(profile||{}), onboardingCompletedAt: new Date().toISOString(),
    }));
  })();
`;

/** Reset onboarding so the gate shows. */
const RESET_ONBOARDING = `
  (() => {
    const raw = localStorage.getItem("repiq-psych-profile");
    if (raw) {
      const p = JSON.parse(raw);
      p.onboardingCompletedAt = null;
      localStorage.setItem("repiq-psych-profile", JSON.stringify(p));
    }
  })();
`;

async function goTo(page, url = BASE) {
  await page.goto(url);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
}

async function shot(page, name, label) {
  const path = `${OUT_DIR}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`  ✓ ${name}  —  ${label}`);
}

/**
 * Advance through N onboarding steps.
 * Each step: click the first unselected chip (to enable Continue), then click Continue.
 */
async function advanceOnboarding(page, steps) {
  for (let i = 0; i < steps; i++) {
    // Pick first available chip if none is already active
    const activeChip = page.locator(".ob-chip.is-active").first();
    const hasActive = await activeChip.isVisible().catch(() => false);
    if (!hasActive) {
      const firstChip = page.locator(".ob-chip").first();
      await firstChip.click({ force: true }).catch(() => {});
      await page.waitForTimeout(200);
    }
    // Also fill name field on step 1 if empty
    const nameInput = page.locator("input[placeholder='Your name']");
    if (await nameInput.isVisible().catch(() => false)) {
      const val = await nameInput.inputValue().catch(() => "");
      if (!val) await nameInput.fill("Alex");
      await page.waitForTimeout(150);
    }
    await page.click(".ob-cta", { force: true });
    await page.waitForTimeout(350);
  }
}

// ── Page definitions (in journey order) ──────────────────────────────────────

const PAGES = [

  // ── ONBOARDING ─────────────────────────────────────────────────────────────
  {
    name: "01-onboarding-welcome",
    label: "Onboarding – Step 1: Welcome / You",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.evaluate(RESET_ONBOARDING);
      await page.reload();
      await page.waitForTimeout(800);
      await shot(page, this.name, this.label);
    },
  },
  {
    name: "02-onboarding-body",
    label: "Onboarding – Step 2: Body",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.evaluate(RESET_ONBOARDING);
      await page.reload();
      await page.waitForTimeout(800);
      await advanceOnboarding(page, 1);       // through step 1
      await shot(page, this.name, this.label);
    },
  },
  {
    name: "03-onboarding-goal",
    label: "Onboarding – Step 3: Goal",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.evaluate(RESET_ONBOARDING);
      await page.reload();
      await page.waitForTimeout(800);
      await advanceOnboarding(page, 2);       // through steps 1–2
      await shot(page, this.name, this.label);
    },
  },
  {
    name: "04-onboarding-experience",
    label: "Onboarding – Step 4: Schedule",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.evaluate(RESET_ONBOARDING);
      await page.reload();
      await page.waitForTimeout(800);
      await advanceOnboarding(page, 3);       // through steps 1–3
      await shot(page, this.name, this.label);
    },
  },
  {
    name: "05-onboarding-mindset",
    label: "Onboarding – Step 5: Mindset",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.evaluate(RESET_ONBOARDING);
      await page.reload();
      await page.waitForTimeout(800);
      await advanceOnboarding(page, 4);       // through steps 1–4
      await shot(page, this.name, this.label);
    },
  },
  {
    name: "06-post-onboarding",
    label: "Post-Onboarding – What's Next",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.evaluate(RESET_ONBOARDING);
      await page.reload();
      await page.waitForTimeout(800);
      await advanceOnboarding(page, 5);       // complete all 5 steps
      await page.waitForTimeout(600);
      await shot(page, this.name, this.label);
    },
  },

  // ── HOME ───────────────────────────────────────────────────────────────────
  {
    name: "07-home",
    label: "Home",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.reload();
      await page.waitForTimeout(800);
      await shot(page, this.name, this.label);
    },
  },

  // ── PLANNER ────────────────────────────────────────────────────────────────
  {
    name: "08-planner-repiq",
    label: "Planner – RepIQ Plan",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.reload();
      await page.waitForTimeout(800);
      await page.click("text=Planner");
      await page.waitForTimeout(500);
      await shot(page, this.name, this.label);
    },
  },
  {
    name: "09-planner-repiq-preferences",
    label: "Planner – RepIQ Preferences overlay",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.reload();
      await page.waitForTimeout(800);
      await page.click("text=Planner");
      await page.waitForTimeout(500);
      await page.click(".repiq-regenerate-btn");
      await page.waitForTimeout(400);
      await shot(page, this.name, this.label);
    },
  },
  {
    name: "10-planner-repiq-completed",
    label: "Planner – RepIQ completed section expanded",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.reload();
      await page.waitForTimeout(800);
      await page.click("text=Planner");
      await page.waitForTimeout(500);
      await page.click(".repiq-completed-toggle");
      await page.waitForTimeout(300);
      await shot(page, this.name, this.label);
    },
  },
  {
    name: "11-planner-my-workouts",
    label: "Planner – My Workouts tab",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.reload();
      await page.waitForTimeout(800);
      await page.click("text=Planner");
      await page.waitForTimeout(400);
      // Switch to custom/my-workouts view via the mode dropdown
      const repiqBtn = page.locator(".planner-mode-btn, [class*='mode']").first();
      await repiqBtn.click().catch(() => {});
      await page.waitForTimeout(300);
      const myWorkouts = page.locator("text=My Workouts").first();
      await myWorkouts.click().catch(() => {});
      await page.waitForTimeout(400);
      await shot(page, this.name, this.label);
    },
  },
  {
    name: "12-planner-library",
    label: "Planner – Library tab",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.reload();
      await page.waitForTimeout(800);
      await page.click("text=Planner");
      await page.waitForTimeout(400);
      const repiqBtn = page.locator(".planner-mode-btn, [class*='mode']").first();
      await repiqBtn.click().catch(() => {});
      await page.waitForTimeout(300);
      await page.locator("text=Library").first().click().catch(() => {});
      await page.waitForTimeout(400);
      await shot(page, this.name, this.label);
    },
  },
  {
    name: "13-planner-generate-session",
    label: "Planner – Generate Session",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.reload();
      await page.waitForTimeout(800);
      await page.click("text=Planner");
      await page.waitForTimeout(400);
      await page.click(".planner-top-action-generate").catch(async () => {
        await page.locator("text=Generate Session").first().click().catch(() => {});
      });
      await page.waitForTimeout(500);
      await shot(page, this.name, this.label);
    },
  },

  // ── HISTORY DETAIL ─────────────────────────────────────────────────────────
  {
    name: "14-history-detail",
    label: "History Detail – summary",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.reload();
      await page.waitForTimeout(800);
      await page.click("text=Planner");
      await page.waitForTimeout(500);
      await page.click(".repiq-completed-toggle");
      await page.waitForTimeout(300);
      await page.click(".repiq-session-card.is-done");
      await page.waitForTimeout(500);
      await shot(page, this.name, this.label);
    },
  },
  {
    name: "15-history-detail-expanded",
    label: "History Detail – exercise row expanded",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.reload();
      await page.waitForTimeout(800);
      await page.click("text=Planner");
      await page.waitForTimeout(500);
      await page.click(".repiq-completed-toggle");
      await page.waitForTimeout(300);
      await page.click(".repiq-session-card.is-done");
      await page.waitForTimeout(500);
      await page.click(".hd-ex-row");
      await page.waitForTimeout(300);
      await shot(page, this.name, this.label);
    },
  },

  // ── LOGGER ─────────────────────────────────────────────────────────────────
  {
    name: "16-logger",
    label: "Logger – active workout",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.reload();
      await page.waitForTimeout(800);
      await page.click("text=Planner");
      await page.waitForTimeout(500);
      // Start the next session
      const startBtn = page.locator(".repiq-session-start-pill").first();
      await startBtn.click();
      await page.waitForTimeout(800);
      await shot(page, this.name, this.label);
    },
  },
  {
    name: "17-logger-rest-timer",
    label: "Logger – rest timer visible",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.reload();
      await page.waitForTimeout(800);
      await page.click("text=Planner");
      await page.waitForTimeout(500);
      const startBtn = page.locator(".repiq-session-start-pill").first();
      await startBtn.click();
      await page.waitForTimeout(800);
      // Mark first set done to trigger rest timer
      const firstCheckbox = page.locator(".set-row .set-done-checkbox, .set-done-check, input[type=checkbox]").first();
      if (await firstCheckbox.isVisible()) {
        // Fill weight + reps first
        const weightBox = page.locator("input[placeholder='KG'], input[placeholder='kg'], .weight-input").first();
        await weightBox.fill("80").catch(() => {});
        const repsBox = page.locator("input[placeholder='REPS'], input[placeholder='reps'], .reps-input").first();
        await repsBox.fill("8").catch(() => {});
        await firstCheckbox.click().catch(() => {});
        await page.waitForTimeout(600);
      }
      await shot(page, this.name, this.label);
    },
  },

  // ── ADD EXERCISE ───────────────────────────────────────────────────────────
  {
    name: "18-add-exercise-all",
    label: "Add Exercise – All Exercises tab",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.reload();
      await page.waitForTimeout(800);
      await page.click("text=Planner");
      await page.waitForTimeout(500);
      await page.locator(".repiq-session-start-pill").first().click();
      await page.waitForTimeout(800);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(300);
      await page.locator("text=+ Add Exercise").first().click();
      await page.waitForTimeout(600);
      await shot(page, this.name, this.label);
    },
  },
  {
    name: "19-add-exercise-by-muscle",
    label: "Add Exercise – By Muscle tab",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.reload();
      await page.waitForTimeout(800);
      await page.click("text=Planner");
      await page.waitForTimeout(500);
      await page.locator(".repiq-session-start-pill").first().click();
      await page.waitForTimeout(800);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(300);
      await page.locator("text=+ Add Exercise").first().click();
      await page.waitForTimeout(600);
      await page.locator(".add-exercise-tab", { hasText: "By Muscle" }).click();
      await page.waitForTimeout(400);
      await shot(page, this.name, this.label);
    },
  },
  {
    name: "20-add-exercise-types",
    label: "Add Exercise – Types tab",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.reload();
      await page.waitForTimeout(800);
      await page.click("text=Planner");
      await page.waitForTimeout(500);
      await page.locator(".repiq-session-start-pill").first().click();
      await page.waitForTimeout(800);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(300);
      await page.locator("text=+ Add Exercise").first().click();
      await page.waitForTimeout(600);
      await page.locator(".add-exercise-tab", { hasText: "Types" }).click();
      await page.waitForTimeout(400);
      await shot(page, this.name, this.label);
    },
  },

  // ── WORKOUT SETTINGS ───────────────────────────────────────────────────────
  {
    name: "21-workout-settings",
    label: "Workout Settings panel",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.reload();
      await page.waitForTimeout(800);
      await page.click("text=Planner");
      await page.waitForTimeout(500);
      await page.locator(".repiq-session-start-pill").first().click();
      await page.waitForTimeout(800);
      await page.locator(".topbar-settings-button").click();
      await page.waitForTimeout(400);
      await shot(page, this.name, this.label);
    },
  },

  // ── FINISH + SHARE ─────────────────────────────────────────────────────────
  {
    name: "22-workout-report",
    label: "Workout Report screen",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.reload();
      await page.waitForTimeout(800);
      await page.click("text=Planner");
      await page.waitForTimeout(500);
      // Open history detail → use its report as stand-in
      await page.click(".repiq-completed-toggle");
      await page.waitForTimeout(300);
      await page.click(".repiq-session-card.is-done");
      await page.waitForTimeout(500);
      // Share → goes to WorkoutReportPage-equivalent layout
      await shot(page, this.name, this.label);
    },
  },
  {
    name: "23-share-card",
    label: "Shareable card (Post-save share screen)",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.reload();
      await page.waitForTimeout(800);
      await page.click("text=Planner");
      await page.waitForTimeout(500);
      await page.click(".repiq-completed-toggle");
      await page.waitForTimeout(300);
      await page.click(".repiq-session-card.is-done");
      await page.waitForTimeout(500);
      // Click Share Summary
      await page.locator(".history-detail-actions .primary-button").click();
      await page.waitForTimeout(600);
      await shot(page, this.name, this.label);
    },
  },

  // ── INSIGHTS ───────────────────────────────────────────────────────────────
  {
    name: "24-insights-reports",
    label: "Insights – Reports tab",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.reload();
      await page.waitForTimeout(800);
      await page.click("text=Insights");
      await page.waitForTimeout(500);
      // Reports is usually the first/default tab
      const reportsTab = page.locator("text=Reports").first();
      await reportsTab.click().catch(() => {});
      await page.waitForTimeout(400);
      await shot(page, this.name, this.label);
    },
  },
  {
    name: "25-insights-analyzer",
    label: "Insights – Analyzer tab",
    async run(page) {
      await goTo(page);
      await page.evaluate(SEED_DATA);
      await page.reload();
      await page.waitForTimeout(800);
      await page.click("text=Insights");
      await page.waitForTimeout(500);
      await page.locator("text=Analyzer").first().click().catch(() => {});
      await page.waitForTimeout(400);
      await shot(page, this.name, this.label);
    },
  },

  // ── PROFILE ────────────────────────────────────────────────────────────────
  {
    name: "26-profile",
    label: "Profile page",
    async run(page) {
      await goTo(page, `${BASE}/?dev`);
      await page.evaluate(SEED_DATA);
      await page.waitForTimeout(400);
      await page.locator("text=Profile").first().click();
      await page.waitForTimeout(500);
      await shot(page, this.name, this.label);
    },
  },

  // ── PLAN BUILDER ───────────────────────────────────────────────────────────
  {
    name: "27-plan-builder",
    label: "Plan Builder",
    async run(page) {
      await goTo(page, `${BASE}/?dev`);
      await page.evaluate(SEED_DATA);
      await page.waitForTimeout(400);
      await page.locator("text=Plan Builder").first().click();
      await page.waitForTimeout(500);
      await shot(page, this.name, this.label);
    },
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`Capturing ${PAGES.length} screens → ${OUT_DIR}\n`);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT });

  let passed = 0, failed = 0;
  for (const pg of PAGES) {
    const page = await context.newPage();
    try {
      await pg.run(page);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${pg.name}: ${err.message}`);
      failed++;
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log(`\n${passed} captured, ${failed} failed  —  docs/screenshots/`);
}

run().catch((err) => { console.error(err); process.exit(1); });
