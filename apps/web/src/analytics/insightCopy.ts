// Tone-varied copy for Summary cards.
//
// Same insight, three tones: beginner / intermediate / advanced.
// Writers can edit tone here without touching component code.
//
// Each entry is a function so dynamic values (exercise names, muscle
// groups, day counts) interpolate cleanly.
//
// Conventions:
//   - Beginner: explain the "why", encourage, avoid jargon.
//   - Intermediate: neutral, direct, assumes basic terms.
//   - Advanced: terse, assumes expertise, skip the hand-holding.

import type { InsightTone } from "./insightMode";

type ToneCopy<A extends unknown[]> = Record<InsightTone, (...args: A) => string>;

// ─── Today card ─────────────────────────────────────────────────────────────

export const TODAY_COPY = {
  // L0 — no data yet
  promise: {
    beginner: () =>
      "Log your first session and RepIQ will start spotting patterns in how you train. Keep it simple to start.",
    intermediate: () =>
      "Log a few sessions and RepIQ will show you what's working and what's missing.",
    advanced: () =>
      "Log a few sessions — or import your history — and RepIQ will stay quiet until there's signal worth reporting."
  } satisfies ToneCopy<[]>,

  // L1 — habit forming
  habit: {
    beginner: (n: number) =>
      `Session ${n} of your first week. Showing up is the whole game right now.`,
    intermediate: (n: number) =>
      `Session ${n}. Keep the cadence — insights unlock as the data fills in.`,
    advanced: (n: number) =>
      `Session ${n}. Still collecting baseline.`
  } satisfies ToneCopy<[number]>,

  // L2+ — normal state with an overdue muscle
  nextBestTarget: {
    beginner: (muscle: string, days: number) =>
      `Your ${muscle} hasn't been trained in ${days} days — today's a good day for it.`,
    intermediate: (muscle: string, days: number) =>
      `${muscle} undertrained — ${days} day gap. Good target for today.`,
    advanced: (muscle: string, days: number) =>
      `${muscle}: ${days}d gap.`
  } satisfies ToneCopy<[string, number]>,

  // L2+ — everything covered
  wellCovered: {
    beginner: () =>
      "All major muscle groups trained recently. Rest or pick whatever you enjoy most.",
    intermediate: () =>
      "All major groups trained recently. Pick whatever fits today.",
    advanced: () => "Coverage clean."
  } satisfies ToneCopy<[]>,

  // Re-entry — short gap
  reEntryShort: {
    beginner: (days: number) =>
      `${days} days since your last session — a good time to get back in. One easy session resets everything.`,
    intermediate: (days: number) =>
      `${days} days since your last session. One session today resets the momentum.`,
    advanced: (days: number) => `${days}d layoff. Get back in.`
  } satisfies ToneCopy<[number]>,

  // Re-entry — medium gap
  reEntryMedium: {
    beginner: (days: number) =>
      `${days} days since you trained. Start lighter than you remember — one good session today rebuilds the rhythm.`,
    intermediate: (days: number) =>
      `${days} days off. Keep today light; momentum returns over 2–3 sessions.`,
    advanced: (days: number) =>
      `${days}d off. Deload today, progress back over 2–3 sessions.`
  } satisfies ToneCopy<[number]>,

  // Re-entry — long gap
  reEntryLong: {
    beginner: (days: number) =>
      `Welcome back after ${days} days away. Start lighter than you remember — your body needs 2–3 sessions to find its feet again.`,
    intermediate: (days: number) =>
      `Back after ${days} days. Expect 2–3 sessions to return to previous loads.`,
    advanced: (days: number) =>
      `${days}d break. Detraining expected; ramp back over 2–3 sessions.`
  } satisfies ToneCopy<[number]>
} as const;

// ─── Signal card (plateau / PR / momentum / streak) ─────────────────────────

export const SIGNAL_COPY = {
  plateau: {
    beginner: (ex: string) =>
      `Your ${ex} isn't improving yet — that's normal. Try fewer reps at a heavier weight, or change the rep range.`,
    intermediate: (ex: string) =>
      `${ex} has stalled. Try dropping reps and adding weight, or swap the rep range.`,
    advanced: (ex: string) =>
      `${ex} plateau. Linear progression exhausted — change the stimulus.`
  } satisfies ToneCopy<[string]>,

  improving: {
    beginner: (ex: string) =>
      `Your ${ex} is improving. Whatever you're doing is working — keep going.`,
    intermediate: (ex: string) => `${ex} is trending up. Keep it in rotation.`,
    advanced: (ex: string) => `${ex}: trending up.`
  } satisfies ToneCopy<[string]>,

  newPR: {
    beginner: (count: number) =>
      count === 1
        ? "You just set a new personal best! Keep doing what you're doing."
        : `You set ${count} new personal bests recently. Your training is working.`,
    intermediate: (count: number) =>
      count === 1 ? "New PR recently. Same approach is working." : `${count} PRs recently. Keep the same approach.`,
    advanced: (count: number) =>
      count === 1 ? "PR logged." : `${count} PRs logged.`
  } satisfies ToneCopy<[number]>,

  laggingMuscle: {
    beginner: (muscle: string, days: number) =>
      `Your ${muscle} also needs attention — hasn't been trained in ${days} days. Worth including soon.`,
    intermediate: (muscle: string, days: number) =>
      `${muscle} also lagging — ${days}d gap.`,
    advanced: (muscle: string, days: number) => `${muscle}: ${days}d gap.`
  } satisfies ToneCopy<[string, number]>,

  streak: {
    beginner: (n: number) =>
      `You're on a ${n}-session streak. Consistency compounds — keep showing up.`,
    intermediate: (n: number) =>
      `${n}-session streak. Consistency is paying off.`,
    advanced: (n: number) => `${n}-session streak.`
  } satisfies ToneCopy<[number]>
} as const;

// ─── This week card ─────────────────────────────────────────────────────────

export const WEEK_COPY = {
  fresh: {
    beginner: (target: number) =>
      `Fresh week. ${target} sessions to aim for — one at a time.`,
    intermediate: (target: number) =>
      `Fresh week. ${target} sessions to aim for.`,
    advanced: (target: number) => `New week. Target: ${target}.`
  } satisfies ToneCopy<[number]>,

  onTrack: {
    beginner: (done: number, target: number) =>
      `${done} of ${target} sessions done this week. You're on track.`,
    intermediate: (done: number, target: number) =>
      `${done}/${target} this week. On track.`,
    advanced: (done: number, target: number) => `Week: ${done}/${target}.`
  } satisfies ToneCopy<[number, number]>,

  behind: {
    beginner: (done: number, target: number, daysLeft: number) =>
      `${done} of ${target} sessions this week. ${daysLeft} day${daysLeft === 1 ? "" : "s"} left — still room to hit target.`,
    intermediate: (done: number, target: number, daysLeft: number) =>
      `${done}/${target} this week. ${daysLeft} day${daysLeft === 1 ? "" : "s"} left.`,
    advanced: (done: number, target: number, daysLeft: number) =>
      `Week: ${done}/${target}, ${daysLeft}d left.`
  } satisfies ToneCopy<[number, number, number]>,

  exceeded: {
    beginner: (done: number, target: number) =>
      `${done} sessions this week — ahead of your ${target}/week target. Listen to your body.`,
    intermediate: (done: number, target: number) =>
      `${done}/${target} — exceeded target. Watch recovery.`,
    advanced: (done: number, target: number) =>
      `Week: ${done}/${target}, +${done - target}.`
  } satisfies ToneCopy<[number, number]>
} as const;

// ─── This month card ────────────────────────────────────────────────────────

export const MONTH_COPY = {
  volumeUp: {
    beginner: (pct: number) =>
      `This month: volume up ${pct}% vs last month. You're putting in more work — nice.`,
    intermediate: (pct: number) => `Volume +${pct}% vs last month.`,
    advanced: (pct: number) => `MoM volume: +${pct}%.`
  } satisfies ToneCopy<[number]>,

  volumeDown: {
    beginner: (pct: number) =>
      `This month: volume down ${pct}% vs last month. One more session a week would close the gap.`,
    intermediate: (pct: number) =>
      `Volume ${pct}% below last month. One more session/week closes it.`,
    advanced: (pct: number) => `MoM volume: −${pct}%.`
  } satisfies ToneCopy<[number]>,

  stable: {
    beginner: () => "This month looks similar to last month — steady training.",
    intermediate: () => "Volume stable month-over-month.",
    advanced: () => "MoM volume: flat."
  } satisfies ToneCopy<[]>
} as const;

// ─── Helper to pick the right line ──────────────────────────────────────────

/**
 * Read a copy line by tone, dropping to intermediate if the requested tone
 * key is missing. Keeps callers from having to switch-case everywhere.
 */
export function pickCopy<A extends unknown[]>(
  bundle: ToneCopy<A>,
  tone: InsightTone,
  ...args: A
): string {
  const fn = bundle[tone] ?? bundle.intermediate;
  return fn(...args);
}
