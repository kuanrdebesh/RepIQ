import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type ReactNode } from "react";
import {
  coachingSuggestionSchema,
  mediaConfigSchema,
  mediaPrepareUploadResponseSchema,
  workoutMediaAssetSchema,
  type CoachingSuggestion,
  type ExerciseEvaluationRequest,
  type ExerciseHistorySession,
  type WorkoutMediaAsset,
  type WorkoutSet
} from "@repiq/shared";
import benchPressImage from "./assets/bench-press.svg";
import inclineDumbbellPressImage from "./assets/incline-dumbbell-press.svg";
import anatomyFrontImg from "./assets/anatomy-front.png";
import anatomyBackImg from "./assets/anatomy-back.png";
import { allCatalogExercises, generationCatalogExercises } from "./catalog";
import { getStoredReplacementEvents, persistReplacementEvent, getStoredExercisePreferences, persistExercisePreference, getStoredHiddenSuggestions, persistHiddenSuggestion, removeHiddenSuggestion, themeStorageKey, workoutSettingsStorageKey, customExercisesStorageKey, savedWorkoutsStorageKey, workoutPlansStorageKey, planBuilderDraftStorageKey, psychProfileStorageKey, postWorkoutPsychStorageKey, dailyReadinessStorageKey, sessionBehaviorStorageKey, derivedPsychStorageKey, repiqPlanStorageKey, getStoredSavedWorkouts, persistSavedWorkout, persistSavedWorkoutsList, getStoredPsychProfile, persistPsychProfile, getStoredRepIQPlan, persistRepIQPlan, getStoredPostWorkoutPsych, persistPostWorkoutPsych, getStoredDailyReadiness, persistDailyReadiness, getStoredSessionBehavior, persistSessionBehavior, getStoredWorkoutPlans, persistWorkoutPlans, getStoredPlanBuilderDraft, persistPlanBuilderDraft, SAMPLE_WORKOUT_PLANS, SAMPLE_PLAN_IDS } from "./storage";
import { DEFAULT_PSYCH_PROFILE, deriveTimeOfDay, buildSessionBehaviorSignals, createInitialSwipeState, COMPOUND_PATTERNS } from "./types";
import type { FlowState, DraftSet, ExerciseDraft, DetailTab, ThemePreference, DraftSetType, AppView, MotivationalWhy, TrainingGoal, ExperienceLevel, EquipmentAccess, ScheduleCommitment, MoodRating, EnergyRating, RPERating, ThreePointScale, TimeOfDay, SessionSource, Trend, MotivationStyle, UserPsychProfile, PostWorkoutPsych, DailyReadiness, SessionBehaviorSignals, DerivedPsychProfile, SplitType, RepIQPlanExercise, RepIQPlanDay, RepIQPlanWeek, RepIQPlan, PlannedExercise, WorkoutPlan, PlanBuilderMode, PlanSessionSource, ActivePlanSession, WorkoutSettings, WorkoutMeta, RewardCategory, RewardLevel, AddExerciseMode, CreateExerciseStep, CustomExerciseType, MeasurementType, MovementSide, MovementPattern, ExerciseDifficulty, ExerciseAngle, ExerciseEquipment, ReplacementReason, ReplacementEvent, ExerciseWithTaxonomy, ExercisePreferenceEntry, ExercisePreferenceMap, CustomExerciseInput, LoggerReward, RewardSummary, FinishedExerciseSummary, FinishWorkoutDraft, SavedWorkoutData, ExerciseRestDefaults, SwipeState, ActiveRestTimer, MuscleRegion } from "./types";

// ── Types — see types.ts ──────────────────────────────────────────────────────
// ── Psych types, plan types, storage functions — see types.ts / storage.ts ────

// Movement family — used for partial-match scoring
function getMovementFamily(pattern: MovementPattern): string {
  if (["horizontal_push", "vertical_push", "isolation_push"].includes(pattern)) return "push";
  if (["horizontal_pull", "vertical_pull", "isolation_pull"].includes(pattern)) return "pull";
  if (["squat", "lunge", "hip_hinge", "isolation_legs"].includes(pattern)) return "legs";
  if (["core_anterior", "core_rotational"].includes(pattern)) return "core";
  if (pattern === "carry") return "carry";
  return "cardio";
}

// Maps user's equipment access level to the exercise types they can perform
const EQUIPMENT_ALLOWED_TYPES: Record<EquipmentAccess, CustomExerciseType[]> = {
  bodyweight:    ["bodyweight", "freestyle_cardio"],
  dumbbell_pair: ["bodyweight", "dumbbell", "freestyle_cardio"],
  home_setup:    ["bodyweight", "dumbbell", "barbell", "resistance_band", "freestyle_cardio"],
  basic_gym:     ["bodyweight", "dumbbell", "barbell", "cable", "machine", "resistance_band", "freestyle_cardio"],
  full_gym:      ["bodyweight", "dumbbell", "barbell", "cable", "machine", "resistance_band", "freestyle_cardio"],
};

// Equipment accessibility — maps exerciseType to what the user needs available
function getEquipmentAccessibility(type: CustomExerciseType): CustomExerciseType[] {
  switch (type) {
    // V2 types
    case "bodyweight":      return ["bodyweight"];
    case "dumbbell":        return ["dumbbell"];
    case "cable":           return ["cable"];
    case "resistance_band": return ["resistance_band"];
    case "barbell":         return ["barbell"];
    case "machine":         return ["machine"];
    case "freestyle_cardio": return ["freestyle_cardio"];
    // Legacy types (backward compat)
    case "bodyweight_only":          return ["bodyweight"];
    case "bodyweight_weighted":      return ["bodyweight", "dumbbell", "barbell", "resistance_band"];
    case "free_weights_accessories": return ["dumbbell", "barbell", "cable", "resistance_band"];
    // Fallback
    default: return [];
  }
}

// ── Exercise Replacement Engine ───────────────────────────────────────────────
// Lexicographic 10-tuple ranking: movement > muscle > angle > equipment > reason
//   > difficulty > tracking > preference > fatigue > novelty
// Each tier is computed independently; higher tiers are never overridden by lower.

type ReplacementRankTuple = [
  number, // movement
  number, // muscle
  number, // angle
  number, // equipment
  number, // reason
  number, // difficulty
  number, // tracking
  number, // preference
  number, // fatigue
  number, // novelty
];

type RankedReplacement = {
  exercise: ExerciseWithTaxonomy;
  score: number;
  matchReason: string;
  rankTuple: ReplacementRankTuple;
};

function normalizeReplacementReason(reason: ReplacementReason): ReplacementReason {
  return reason === "preference" ? "best_match" : reason;
}

function getEquipmentBucket(exercise: ExerciseWithTaxonomy): "machine" | "free_weight" | "cable" | "bodyweight" | "cardio" | "accessory" {
  const equipment = exercise.equipment;
  const exerciseType = exercise.exerciseType ?? inferExerciseType(exercise);

  if (equipment === "machine" || equipment === "smith_machine" || exerciseType === "machine") {
    return "machine";
  }
  if (equipment === "cable") {
    return "cable";
  }
  if (equipment === "barbell" || equipment === "dumbbell" || equipment === "kettlebell" || equipment === "landmine") {
    return "free_weight";
  }
  if (equipment === "bodyweight" || equipment === "none" || exerciseType === "bodyweight_only") {
    return "bodyweight";
  }
  if (exerciseType === "freestyle_cardio") {
    return "cardio";
  }
  return "accessory";
}

// Strip timestamp suffix from cloned exercise IDs (e.g. "bench-press-1748...-1" → "bench-press")
function getBaseExerciseId(exerciseId: string): string {
  return exerciseId.replace(/-\d{8,}-\d+$/, "");
}

function getExercisePrimaryMuscles(exercise: ExerciseDraft): string[] {
  const raw = exercise.primaryMuscles?.length ? exercise.primaryMuscles : [exercise.primaryMuscle];
  return Array.from(new Set(raw.map((muscle) => getCanonicalMuscle(muscle))));
}

function getExerciseSecondaryMuscles(exercise: ExerciseDraft): string[] {
  return Array.from(new Set((exercise.secondaryMuscles ?? []).map((muscle) => getCanonicalMuscle(muscle))));
}

function getExerciseTrackingType(exercise: ExerciseDraft): MeasurementType {
  return exercise.measurementType ?? getExerciseMeasurementType(exercise);
}

function getDifficultyRank(level?: ExerciseDifficulty): number {
  switch (level ?? "intermediate") {
    case "beginner":
      return 1;
    case "intermediate":
      return 2;
    case "advanced":
      return 3;
  }
}

function isNearbyAngle(original?: ExerciseAngle, candidate?: ExerciseAngle): boolean {
  if (!original || !candidate) return false;
  if (original === candidate) return true;
  const nearbyPairs = new Set([
    "flat:incline",
    "incline:flat",
    "flat:decline",
    "decline:flat",
    "neutral:none",
    "none:neutral",
    "overhead:neutral",
    "neutral:overhead",
  ]);
  return nearbyPairs.has(`${original}:${candidate}`);
}

function hasPrimaryOverlap(original: ExerciseDraft, candidate: ExerciseDraft): boolean {
  const originalPrimary = getExercisePrimaryMuscles(original);
  const candidatePrimary = getExercisePrimaryMuscles(candidate);
  return candidatePrimary.some((muscle) => originalPrimary.includes(muscle));
}

function computeMovementTier(original: ExerciseWithTaxonomy, candidate: ExerciseWithTaxonomy): number {
  const originalPattern = original.movementPattern;
  const candidatePattern = candidate.movementPattern;
  if (!originalPattern || !candidatePattern) return 0;
  if (candidatePattern === originalPattern) return 4;
  if (getMovementFamily(candidatePattern) === getMovementFamily(originalPattern) && isNearbyAngle(original.angle, candidate.angle)) {
    return 3;
  }
  if (getMovementFamily(candidatePattern) === getMovementFamily(originalPattern) && hasPrimaryOverlap(original, candidate)) {
    return 2;
  }
  return 0;
}

function computeMuscleTier(original: ExerciseWithTaxonomy, candidate: ExerciseWithTaxonomy): number {
  const originalPrimary = getExercisePrimaryMuscles(original);
  const candidatePrimary = getExercisePrimaryMuscles(candidate);
  const originalSecondary = getExerciseSecondaryMuscles(original);
  const candidateSecondary = getExerciseSecondaryMuscles(candidate);
  const primaryOverlap = candidatePrimary.filter((muscle) => originalPrimary.includes(muscle));
  const secondaryOverlap = candidateSecondary.filter((muscle) => originalSecondary.includes(muscle));

  if (primaryOverlap.length === originalPrimary.length && secondaryOverlap.length > 0) return 4;
  if (primaryOverlap.length === originalPrimary.length) return 3;
  if (primaryOverlap.length > 0) return 2;
  if (candidateSecondary.some((muscle) => originalPrimary.includes(muscle))) return 1;
  return 0;
}

function computeAngleTier(original: ExerciseWithTaxonomy, candidate: ExerciseWithTaxonomy): number {
  if (original.angle && candidate.angle && original.angle === candidate.angle) return 3;
  if (isNearbyAngle(original.angle, candidate.angle)) return 2;
  if (!original.angle || !candidate.angle || original.angle === "none" || candidate.angle === "none" || original.angle === "neutral" || candidate.angle === "neutral") {
    return 1;
  }
  return 0;
}

function isFreeWeightSibling(original?: ExerciseEquipment, candidate?: ExerciseEquipment): boolean {
  return (
    (original === "barbell" && candidate === "dumbbell") ||
    (original === "dumbbell" && candidate === "barbell")
  );
}

function computeEquipmentTier(
  original: ExerciseWithTaxonomy,
  candidate: ExerciseWithTaxonomy,
  reason: ReplacementReason,
): number {
  const normalizedReason = normalizeReplacementReason(reason);
  const originalBucket = getEquipmentBucket(original);
  const candidateBucket = getEquipmentBucket(candidate);
  const originalEquipment = original.equipment;
  const candidateEquipment = candidate.equipment;

  if (normalizedReason === "best_match") {
    if (isFreeWeightSibling(originalEquipment, candidateEquipment)) return 4;
    if (originalEquipment && candidateEquipment && originalEquipment === candidateEquipment) return 3;
    if (originalBucket === candidateBucket) return 2;
    if (candidateBucket === "cable" || candidateBucket === "machine") return 1;
    return 0;
  }

  if (normalizedReason === "just_change") {
    if (originalBucket !== candidateBucket) return 4;
    if (originalEquipment && candidateEquipment && originalEquipment !== candidateEquipment) return 3;
    return 1;
  }

  if (originalEquipment && candidateEquipment && originalEquipment === candidateEquipment) return 3;
  if (originalBucket === candidateBucket) return 2;
  if (candidateBucket === "bodyweight") return 1;
  return 1;
}

function computeReasonTier(original: ExerciseWithTaxonomy, candidate: ExerciseWithTaxonomy, reason: ReplacementReason): number {
  const normalizedReason = normalizeReplacementReason(reason);
  const bucket = getEquipmentBucket(candidate);
  const samePattern = candidate.movementPattern && candidate.movementPattern === original.movementPattern;
  const samePrimary = hasPrimaryOverlap(original, candidate);
  const sameEquipmentBucket = getEquipmentBucket(original) === bucket;
  const candidateDifficulty = getDifficultyRank(candidate.difficultyLevel);
  const originalDifficulty = getDifficultyRank(original.difficultyLevel);
  const isIsolation = candidate.movementPattern?.startsWith("isolation_") ?? false;

  switch (normalizedReason) {
    case "best_match":
      if (samePattern && samePrimary && candidate.angle === original.angle) return 4;
      if (samePattern && samePrimary) return 3;
      if (getMovementFamily(candidate.movementPattern ?? "cardio") === getMovementFamily(original.movementPattern ?? "cardio") && samePrimary) return 2;
      if (samePrimary) return 1;
      return 0;
    case "machine_taken":
      if (bucket === "machine") return 0;
      if ((bucket === "free_weight" || bucket === "cable") && samePattern) return 4;
      if (bucket === "accessory" && samePrimary) return 3;
      if (bucket === "bodyweight") return 2;
      return 1;
    case "no_equipment":
      if (!["bodyweight", "cardio"].includes(bucket)) return 0;
      if (bucket === "bodyweight" && samePattern) return 4;
      if (bucket === "bodyweight" && getMovementFamily(candidate.movementPattern ?? "cardio") === getMovementFamily(original.movementPattern ?? "cardio")) return 3;
      if (bucket === "cardio") return 2;
      return 1;
    case "too_difficult":
      if (candidateDifficulty > originalDifficulty) return 0;
      if (isIsolation && samePrimary) return 4;
      if (bucket === "bodyweight" && getMovementFamily(candidate.movementPattern ?? "cardio") === getMovementFamily(original.movementPattern ?? "cardio")) return 3;
      if (bucket === "machine") return 2;
      if (candidateDifficulty <= originalDifficulty) return 1;
      return 0;
    case "pain_discomfort":
      if (isIsolation && samePrimary) return 4;
      if ((bucket === "cable" || bucket === "machine" || bucket === "bodyweight") && samePrimary) return 4;
      if (samePrimary && !sameEquipmentBucket) return 3;
      if (samePrimary) return 2;
      return 1;
    case "just_change":
      if (samePattern && samePrimary && (!sameEquipmentBucket || candidate.angle !== original.angle)) return 4;
      if (samePrimary && !sameEquipmentBucket) return 3;
      if (getMovementFamily(candidate.movementPattern ?? "cardio") === getMovementFamily(original.movementPattern ?? "cardio") && samePrimary) return 2;
      return 1;
  }

  return 1;
}

function computeDifficultyTier(original: ExerciseWithTaxonomy, candidate: ExerciseWithTaxonomy, reason: ReplacementReason): number {
  const normalizedReason = normalizeReplacementReason(reason);
  const originalDifficulty = getDifficultyRank(original.difficultyLevel);
  const candidateDifficulty = getDifficultyRank(candidate.difficultyLevel);
  if (candidateDifficulty <= originalDifficulty) {
    return candidateDifficulty < originalDifficulty && (normalizedReason === "too_difficult" || normalizedReason === "pain_discomfort")
      ? 2
      : 3;
  }
  return candidateDifficulty - originalDifficulty === 1 ? 1 : 0;
}

function computeTrackingTier(original: ExerciseWithTaxonomy, candidate: ExerciseWithTaxonomy): number {
  const originalTracking = getExerciseTrackingType(original);
  const candidateTracking = getExerciseTrackingType(candidate);
  if (originalTracking === candidateTracking) return 2;
  if (
    (originalTracking === "timed" && candidateTracking === "weight_timed") ||
    (originalTracking === "weight_timed" && candidateTracking === "timed")
  ) {
    return 1;
  }
  return 0;
}

function computePreferenceTier(original: ExerciseWithTaxonomy, candidate: ExerciseWithTaxonomy, reason: ReplacementReason): number {
  if (!hasPrimaryOverlap(original, candidate)) return 0;

  const normalizedReason = normalizeReplacementReason(reason);
  const originalBaseId = getBaseExerciseId(original.id);
  const candidateBaseId = getBaseExerciseId(candidate.id);
  const now = Date.now();
  let score = 0;
  let primaryMuscleMatches = 0;

  for (const event of getStoredReplacementEvents()) {
    const eventOriginalBase = getBaseExerciseId(event.originalExerciseId);
    const eventReplacementBase = getBaseExerciseId(event.replacementExerciseId);
    if (eventReplacementBase !== candidateBaseId) continue;

    const ageDays = Math.max(0, (now - new Date(event.replacedAt).getTime()) / (1000 * 60 * 60 * 24));
    const decay = ageDays <= 30 ? 1 : ageDays <= 90 ? 0.7 : 0.4;

    if (eventOriginalBase === originalBaseId) {
      score = Math.max(score, Math.round(6 * decay));
      if (normalizeReplacementReason(event.reason) === normalizedReason) {
        score = Math.max(score, Math.round(7 * decay));
      }
    }

    if (normalizeReplacementReason(event.reason) === normalizedReason) {
      score = Math.max(score, Math.round(3 * decay));
    }

    primaryMuscleMatches += 1;
    if (ageDays <= 30) {
      score = Math.max(score, Math.round(4 * decay));
    }
  }

  if (primaryMuscleMatches >= 2) {
    score = Math.max(score, 2);
  }

  return Math.min(score, 8);
}

function computeFatigueTier(candidate: ExerciseWithTaxonomy, sessionExercises: ExerciseDraft[]): number {
  const candidatePrimary = getExercisePrimaryMuscles(candidate);
  const completedSetsOnCandidateMuscles = sessionExercises.reduce((sum, exercise) => {
    const exercisePrimary = getExercisePrimaryMuscles(exercise);
    if (!exercisePrimary.some((muscle) => candidatePrimary.includes(muscle))) {
      return sum;
    }
    return sum + exercise.draftSets.filter((set) => set.done).length;
  }, 0);

  if (completedSetsOnCandidateMuscles >= 9) return 0;
  if (completedSetsOnCandidateMuscles >= 6) return 1;
  if (completedSetsOnCandidateMuscles >= 3) return 2;
  return 3;
}

function computeNoveltyTier(candidate: ExerciseWithTaxonomy): number {
  const candidateBaseId = getBaseExerciseId(candidate.id);
  const matchingEvents = getStoredReplacementEvents().filter(
    (event) => getBaseExerciseId(event.replacementExerciseId) === candidateBaseId
  );
  if (matchingEvents.length === 0) return 2;
  const latest = matchingEvents
    .map((event) => new Date(event.replacedAt).getTime())
    .sort((left, right) => right - left)[0];
  if (!latest) return 2;
  const ageDays = (Date.now() - latest) / (1000 * 60 * 60 * 24);
  if (ageDays <= 30) return 0;
  if (ageDays <= 90) return 1;
  return 2;
}

function compareRankTuples(left: ReplacementRankTuple, right: ReplacementRankTuple): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return right[index] - left[index];
    }
  }
  return 0;
}

function flattenRankTuple(rankTuple: ReplacementRankTuple): number {
  return rankTuple.reduce((sum, value, index) => sum + value * 10 ** (rankTuple.length - index), 0);
}

function buildMatchReason(
  original: ExerciseWithTaxonomy,
  candidate: ExerciseWithTaxonomy,
  reason: ReplacementReason,
  rankTuple: ReplacementRankTuple,
): string {
  const normalizedReason = normalizeReplacementReason(reason);
  const [movementTier, muscleTier, angleTier, equipmentTier, reasonTier, difficultyTier, trackingTier, preferenceTier] = rankTuple;

  if (movementTier === 4 && angleTier === 3) {
    if (normalizedReason === "best_match" && equipmentTier >= 4) {
      return "Closest equipment sibling";
    }
    return "Same movement, same angle";
  }
  if (movementTier >= 3 && reasonTier >= 4) {
    if (normalizedReason === "best_match") return "Closest overall match";
    if (normalizedReason === "machine_taken") return "Closest non-machine swap";
    if (normalizedReason === "no_equipment") return "Closest no-equipment swap";
    if (normalizedReason === "too_difficult") return "Easier matched variation";
    if (normalizedReason === "pain_discomfort") return "Safer matched variation";
    return "Closest like-for-like change";
  }
  if (muscleTier >= 3) {
    return `Targets ${original.primaryMuscle}`;
  }
  if (preferenceTier > 0) {
    return "Picked before";
  }
  if (difficultyTier >= 2) {
    return "Simpler to perform";
  }
  if (trackingTier === 2) {
    return "Keeps the same logging style";
  }
  return "Similar muscle coverage";
}

// ── Core ranking function — returns RankedReplacement or null (excluded) ──────
function rankCandidate(
  original: ExerciseWithTaxonomy,
  candidate: ExerciseWithTaxonomy,
  sessionExercises: ExerciseDraft[],
  reason: ReplacementReason,
  availableEquipment: CustomExerciseType[],
  userLevel: ExperienceLevel | null,
): RankedReplacement | null {
  if (getBaseExerciseId(candidate.id) === getBaseExerciseId(original.id)) return null;
  if (sessionExercises.some((exercise) => getBaseExerciseId(exercise.id) === getBaseExerciseId(candidate.id))) return null;

  const normalizedReason = normalizeReplacementReason(reason);
  const neededEquipment = getEquipmentAccessibility(candidate.exerciseType ?? inferExerciseType(candidate));
  const canDo = neededEquipment.some((item) => availableEquipment.includes(item));
  if (!canDo) return null;

  const candidateBucket = getEquipmentBucket(candidate);
  if (normalizedReason === "machine_taken" && candidateBucket === "machine") return null;
  if (normalizedReason === "no_equipment" && !["bodyweight", "cardio"].includes(candidateBucket)) return null;
  if (normalizedReason === "too_difficult" && userLevel !== "advanced" && (candidate.difficultyLevel ?? "intermediate") === "advanced") return null;

  const movementTier = computeMovementTier(original, candidate);
  if (movementTier === 0) return null;

  const muscleTier = computeMuscleTier(original, candidate);
  if (muscleTier === 0) return null;

  const angleTier = computeAngleTier(original, candidate);
  const equipmentTier = computeEquipmentTier(original, candidate, reason);
  const reasonTier = computeReasonTier(original, candidate, reason);
  if (reasonTier === 0) return null;

  const difficultyTier = computeDifficultyTier(original, candidate, reason);
  if (difficultyTier === 0) return null;

  const trackingTier = computeTrackingTier(original, candidate);
  if (trackingTier === 0) return null;

  const rankTuple: ReplacementRankTuple = [
    movementTier,
    muscleTier,
    angleTier,
    equipmentTier,
    reasonTier,
    difficultyTier,
    trackingTier,
    computePreferenceTier(original, candidate, reason),
    computeFatigueTier(candidate, sessionExercises),
    computeNoveltyTier(candidate),
  ];

  return {
    exercise: candidate,
    score: flattenRankTuple(rankTuple),
    matchReason: buildMatchReason(original, candidate, reason, rankTuple),
    rankTuple,
  };
}

// ── Main replacement function ─────────────────────────────────────────────────
function getSmartReplacements(
  original: ExerciseWithTaxonomy,
  sessionExercises: ExerciseDraft[],
  reason: ReplacementReason,
  availableEquipment: CustomExerciseType[],
  allExercises: ExerciseWithTaxonomy[],
  userLevel: ExperienceLevel | null,
): RankedReplacement[] {
  return allExercises
    .map((candidate) =>
      rankCandidate(original, candidate, sessionExercises, reason, availableEquipment, userLevel)
    )
    .filter((candidate): candidate is RankedReplacement => candidate !== null)
    .sort((left, right) => {
      const tupleDelta = compareRankTuples(left.rankTuple, right.rankTuple);
      if (tupleDelta !== 0) return tupleDelta;
      return right.score - left.score;
    });
}

// Seeded PRNG helpers for deterministic Generate Session
// Same inputs → same seed → same exercise selection every time.
// Incrementing the seed gives a valid, different deterministic set (Shuffle).
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed === 0 ? 1 : seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Config passed around for generated sessions — stored in root so shuffle can re-run
export type GenConfig = {
  goal: string;
  muscles: string[];
  duration: string;
  equipment: EquipmentAccess;
  seedOffset: number;
};

// Pure function — deterministically builds a WorkoutPlan from user inputs + library.
// Called both by WorkoutPlannerPage (initial generate) and root App (shuffle on review).
function buildGeneratedPlan(config: GenConfig, library: ExerciseWithTaxonomy[]): WorkoutPlan | null {
  const { goal, muscles, duration, equipment, seedOffset } = config;
  const muscleKeywords: Record<string, string[]> = {
    Chest:      ["chest", "pec"],
    Back:       ["back", "lat", "row", "rhomboid", "trap"],
    Shoulders:  ["shoulder", "delt"],
    Biceps:     ["bicep"],
    Triceps:    ["tricep"],
    Quads:      ["quad"],
    Hamstrings: ["hamstring"],
    Glutes:     ["glute"],
    Calves:     ["calf", "calve"],
    Abductors:  ["abductor", "abductors"],
    Adductors:  ["adductor", "adductors", "inner thigh"],
    "Core / Abs": ["core", "ab", "oblique"],
    Obliques:   ["oblique"],
    Arms: ["bicep", "tricep", "arm", "forearm"],
    Legs: ["quad", "hamstring", "glute", "calf", "leg", "hip"],
    Core: ["core", "ab", "oblique"],
  };
  const goalConfig: Record<string, { setCount: number; restTimer: string }> = {
    Strength:    { setCount: 5, restTimer: "180" },
    Hypertrophy: { setCount: 3, restTimer: "90" },
    Endurance:   { setCount: 3, restTimer: "45" },
    "Fat loss":  { setCount: 4, restTimer: "60" },
  };
  const durationCount: Record<string, number> = {
    "30 min": 4, "45 min": 5, "60 min": 6, "75+ min": 8,
  };
  const config2 = goalConfig[goal] ?? { setCount: 3, restTimer: "90" };
  const count = durationCount[duration] ?? 5;
  const keywords = muscles.flatMap((m) => muscleKeywords[m] ?? [m.toLowerCase()]);

  const STRETCH_IDS = new Set(["chest-stretch", "hip-flexor-stretch"]);
  let candidates = library.filter((ex) =>
    ex.movementPattern !== "cardio" &&
    ex.exerciseType !== "freestyle_cardio" &&
    !STRETCH_IDS.has(ex.id)
  );
  const allowedEquipTypes = EQUIPMENT_ALLOWED_TYPES[equipment] ?? EQUIPMENT_ALLOWED_TYPES.full_gym;
  candidates = candidates.filter((ex) => {
    if (ex.exerciseType == null) return true;
    const neededEquipment = getEquipmentAccessibility(ex.exerciseType as CustomExerciseType);
    return neededEquipment.some((item) => allowedEquipTypes.includes(item));
  });
  if (keywords.length > 0) {
    candidates = candidates.filter((ex) =>
      keywords.some(
        (kw) =>
          ex.primaryMuscle.toLowerCase().includes(kw) ||
          ex.primaryMuscles?.some((pm) => pm.toLowerCase().includes(kw)) ||
          ex.secondaryMuscles.some((sm) => sm.toLowerCase().includes(kw))
      )
    );
  }

  const inputKey = `${goal}|${[...muscles].sort().join(",")}|${duration}|${equipment}`;
  const seed = hashString(inputKey) + seedOffset;

  const scored = candidates.map(ex => ({
    ex,
    score: keywords.filter(
      kw => ex.primaryMuscle.toLowerCase().includes(kw) ||
            ex.primaryMuscles?.some(pm => pm.toLowerCase().includes(kw))
    ).length,
  }));
  const shuffled = seededShuffle(scored, seed);
  shuffled.sort((a, b) => b.score - a.score);
  candidates = shuffled.map(s => s.ex);

  const selected: ExerciseWithTaxonomy[] = [];
  const muscleCounts: Record<string, number> = {};
  const leftover: ExerciseWithTaxonomy[] = [];
  for (const ex of candidates) {
    const pm = ex.primaryMuscle;
    if ((muscleCounts[pm] ?? 0) < 2) {
      selected.push(ex);
      muscleCounts[pm] = (muscleCounts[pm] ?? 0) + 1;
      if (selected.length >= count) break;
    } else {
      leftover.push(ex);
    }
  }
  for (const ex of leftover) {
    if (selected.length >= count) break;
    selected.push(ex);
  }

  if (selected.length === 0) return null;

  return {
    id: `gen-${Date.now()}`,
    name: muscles.length > 0
      ? `${goal} · ${muscles.slice(0, 2).join(" & ")}`
      : `${goal} Workout`,
    tag: goal,
    note: muscles.length > 0 ? `${muscles.join(", ")} · ${duration}` : duration,
    exercises: selected.map((ex, exIdx) => {
      const isCompound = ex.movementPattern
        ? COMPOUND_PATTERNS.has(ex.movementPattern as MovementPattern)
        : false;
      const warmupCount = isCompound ? 2 : exIdx === 0 ? 1 : 0;
      const setTypes: DraftSetType[] = [
        ...Array.from({ length: warmupCount }, () => "warmup" as DraftSetType),
        ...Array.from({ length: config2.setCount }, () => "normal" as DraftSetType),
      ];
      return {
        exerciseId: ex.id,
        setCount: warmupCount + config2.setCount,
        setTypes,
        restTimer: config2.restTimer,
      };
    }),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Insights helper — roll up session volume by movement pattern
// Used by Insights → Analyzer to show "Horizontal Push: 18 sets this week"
function groupSetsByMovementPattern(
  exercises: ExerciseDraft[],
): Record<string, { sets: number; exercises: string[] }> {
  const result: Record<string, { sets: number; exercises: string[] }> = {};
  for (const ex of exercises) {
    const pattern = (ex as ExerciseWithTaxonomy).movementPattern;
    const family = pattern ? getMovementFamily(pattern) : "unknown";
    if (!result[family]) result[family] = { sets: 0, exercises: [] };
    result[family].sets += ex.draftSets.length;
    if (!result[family].exercises.includes(ex.name)) result[family].exercises.push(ex.name);
  }
  return result;
}
const apiBaseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://127.0.0.1:4000";

// ── Storage keys — see storage.ts ─────────────────────────────────────────────

const setTypeOptions: Array<{
  value: DraftSetType;
  symbol: string;
  label: string;
}> = [
  { value: "warmup", symbol: "W", label: "Warm-up" },
  { value: "normal", symbol: "#", label: "Working set" },
  { value: "drop", symbol: "D", label: "Drop set" },
  { value: "restpause", symbol: "RP", label: "Rest-pause" },
  { value: "failure", symbol: "F", label: "Failure set" }
];

const supersetPalette = ["#0ea5e9", "#f97316", "#8b5cf6", "#10b981", "#e11d48", "#eab308"];
const muscleMapPalette = ["#dbeafe", "#93c5fd", "#4a97cf"];
const muscleContributionMap: Record<string, Partial<Record<MuscleRegion, number>>> = {
  Chest: { chest: 1 },
  "Upper Chest": { chest: 1 },
  "Front Delts": { frontDelts: 1 },
  "Side Delts": { sideDelts: 1 },
  "Rear Delts": { rearDelts: 1 },
  Shoulders: { frontDelts: 0.45, sideDelts: 1, rearDelts: 0.45 },
  Triceps: { triceps: 1 },
  Biceps: { biceps: 1 },
  Lats: { lats: 1 },
  "Upper Back": { upperBack: 1 },
  "Lower Back": { lowerBack: 1 },
  Quads: { quads: 1 },
  Hamstrings: { hamstrings: 1 },
  Glutes: { glutes: 1 },
  Adductors: { adductors: 1 },
  Calves: { calves: 1 },
  "Upper Traps": { upperBack: 0.8, rearDelts: 0.2 }
};

const certaintyTone: Record<CoachingSuggestion["certainty"], string> = {
  low: "tone-low",
  medium: "tone-medium",
  high: "tone-high"
};

const rewardLevelIcon: Record<RewardLevel, string> = {
  set: "🏅",
  exercise: "🎖",
  session: "🏆"
};

function summarizeRewards(rewards: LoggerReward[]): RewardSummary {
  return rewards.reduce(
    (summary, reward) => {
      summary[reward.level] += 1;
      summary.total += 1;
      return summary;
    },
    { set: 0, exercise: 0, session: 0, total: 0 }
  );
}

const genericExerciseImage = `data:image/svg+xml;utf8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" fill="none">
    <rect x="3" y="3" width="82" height="82" rx="20" fill="#F7FAFC"/>
    <circle cx="44" cy="23" r="7" fill="#8A9BB2"/>
    <path d="M30 66L39 44L33 31" stroke="#61728B" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M58 66L49 44L55 31" stroke="#61728B" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M36 35H52" stroke="#24324A" stroke-width="8" stroke-linecap="round"/>
    <path d="M25 28H63" stroke="#4A97CF" stroke-width="6" stroke-linecap="round"/>
    <path d="M44 30V50" stroke="#F48C3A" stroke-width="7" stroke-linecap="round"/>
  </svg>
`)}`;

const primaryMuscleOptions = [
  "Chest",
  "Biceps",
  "Triceps",
  "Back",
  "Middle Back",
  "Traps",
  "Front Shoulders",
  "Side Delts",
  "Rear Delts",
  "Quads",
  "Hamstrings",
  "Hip Flexors",
  "Glutes",
  "Calves",
  "Abs / Core",
  "Obliques",
  "Forearms",
  "Lower Back",
  "Abductors"
];

const primaryMuscleGroups: Array<{ label: string; muscles: string[] }> = [
  { label: "Chest & Push", muscles: ["Chest", "Front Shoulders", "Side Delts", "Triceps"] },
  { label: "Back & Pull", muscles: ["Back", "Middle Back", "Traps", "Rear Delts", "Biceps", "Forearms"] },
  { label: "Legs", muscles: ["Quads", "Hamstrings", "Glutes", "Hip Flexors", "Calves", "Abductors"] },
  { label: "Core", muscles: ["Abs / Core", "Obliques", "Lower Back"] }
];

const secondaryMuscleGroups: Array<{ label: string; muscles: string[] }> = [
  { label: "Chest & Shoulders", muscles: ["Chest", "Upper Chest", "Front Delts", "Front Shoulders", "Side Delts", "Rear Delts"] },
  { label: "Back", muscles: ["Back", "Lats", "Middle Back", "Upper Back", "Lower Back", "Traps"] },
  { label: "Arms", muscles: ["Biceps", "Triceps", "Forearms"] },
  { label: "Legs", muscles: ["Quads", "Hamstrings", "Glutes", "Calves", "Adductors", "Abductors"] },
  { label: "Core", muscles: ["Abs / Core", "Obliques"] }
];

const secondaryMuscleLibrary = [
  "Chest",
  "Upper Chest",
  "Back",
  "Lats",
  "Middle Back",
  "Upper Back",
  "Lower Back",
  "Biceps",
  "Triceps",
  "Forearms",
  "Front Delts",
  "Front Shoulders",
  "Side Delts",
  "Rear Delts",
  "Traps",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Abs / Core",
  "Abs",
  "Core",
  "Obliques",
  "Adductors",
  "Abductors"
];

const customExerciseTypeOptions: Array<{
  value: CustomExerciseType;
  label: string;
}> = [
  { value: "bodyweight_only", label: "Bodyweight only" },
  { value: "bodyweight_weighted", label: "Weighted bodyweight" },
  {
    value: "free_weights_accessories",
    label: "Dumbbells / kettlebells / accessories"
  },
  { value: "barbell", label: "Barbell" },
  { value: "machine", label: "Machine" },
  { value: "freestyle_cardio", label: "Freestyle / cardio" }
];

const customMeasurementOptions: Array<{
  value: MeasurementType;
  label: string;
}> = [
  { value: "timed", label: "Timed" },
  { value: "reps_volume", label: "Reps and volume" },
  { value: "weight_timed", label: "Weight + timed" }
];

const customMovementSideOptions: Array<{
  value: MovementSide;
  label: string;
}> = [
  { value: "unilateral", label: "Unilateral" },
  { value: "bilateral", label: "Bilateral" }
];

const exerciseTypeDescriptions: Record<string, string> = {
  bodyweight_only: "No equipment needed — push-ups, pull-ups, dips",
  bodyweight_weighted: "Bodyweight base + optional load — weighted pull-ups",
  free_weights_accessories: "Dumbbells, kettlebells, cables, bands",
  barbell: "Barbell movements — bench, squat, deadlift",
  machine: "Pin-loaded or plate-loaded machines",
  freestyle_cardio: "Timed effort — runs, rows, bike intervals"
};

const measurementDescriptions: Record<string, string> = {
  timed: "Log time and optional distance — plank, run, bike interval",
  reps_volume: "Log reps and weight per set — bench press, curl, squat",
  weight_timed: "Log weight held and duration — weighted wall sit, weighted plank"
};

const movementSideDescriptions: Record<string, string> = {
  bilateral: "Both sides move together — bench press, squat",
  unilateral: "One side at a time — dumbbell curl, single-leg press"
};

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesSearchTokens(query: string, values: string[]) {
  const queryTokens = normalizeSearchText(query).split(" ").filter(Boolean);
  if (queryTokens.length === 0) {
    return true;
  }

  const haystack = normalizeSearchText(values.join(" "));
  return queryTokens.every((token) => haystack.includes(token));
}

function ensureUniqueExerciseName(name: string, existingNames: string[]) {
  const normalizedExisting = new Set(existingNames.map((entry) => entry.trim().toLowerCase()));
  const requestedName = name.trim();
  if (!normalizedExisting.has(requestedName.toLowerCase())) {
    return requestedName;
  }

  const baseName = requestedName.replace(/_\d+$/, "").trim();
  let nextVersion = 1;

  existingNames.forEach((entry) => {
    const trimmed = entry.trim();
    const match = trimmed.match(new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:_(\\d+))?$`, "i"));
    if (!match) {
      return;
    }

    const suffix = match[1] ? Number(match[1]) : 0;
    nextVersion = Math.max(nextVersion, suffix + 1);
  });

  return `${baseName}_${nextVersion}`;
}

function inferExerciseType(exercise: Pick<ExerciseDraft, "id" | "name" | "exerciseType">): CustomExerciseType {
  if (exercise.exerciseType) {
    return exercise.exerciseType;
  }

  const name = exercise.name.toLowerCase();
  if (/(run|bike|cycle|walk|elliptical|rower|stair|cardio)/.test(name)) {
    return "freestyle_cardio";
  }
  if (/(stretch|mobility|yoga)/.test(name)) {
    return "bodyweight_only";
  }
  if (/(barbell|ez bar|trap bar|smith)/.test(name)) {
    return "barbell";
  }
  if (/(machine|leg press|selectorized|hack squat)/.test(name)) {
    return "machine";
  }
  if (/(dumbbell|kettlebell|landmine|medicine ball|rope|cable|band)/.test(name)) {
    return "free_weights_accessories";
  }
  if (/(push-up|pull-up|chin-up|dip|plank|crunch|sit-up|bodyweight)/.test(name)) {
    return "bodyweight_only";
  }
  return "bodyweight_weighted";
}

function getExerciseTypeLabel(exerciseType: CustomExerciseType) {
  return customExerciseTypeOptions.find((option) => option.value === exerciseType)?.label ?? "Weighted";
}

function createTemplateExercise({
  id,
  name,
  restTimer,
  goal = "hypertrophy",
  imageSrc = genericExerciseImage,
  exerciseType,
  measurementType,
  movementSide,
  primaryMuscle,
  secondaryMuscles,
  howTo,
  videoLabel,
  historySets,
  movementPattern,
  angle,
  equipment,
  difficultyLevel,
}: {
  id: string;
  name: string;
  restTimer: string;
  goal?: ExerciseEvaluationRequest["goal"];
  imageSrc?: string;
  exerciseType?: CustomExerciseType;
  measurementType?: MeasurementType;
  movementSide?: MovementSide;
  primaryMuscle: string;
  secondaryMuscles: string[];
  howTo: string[];
  videoLabel?: string;
  historySets: WorkoutSet[][];
  movementPattern?: MovementPattern;
  angle?: ExerciseAngle;
  equipment?: ExerciseEquipment;
  difficultyLevel?: ExerciseDifficulty;
}): ExerciseWithTaxonomy {
  const normalizedHistorySets =
    historySets.length >= 3
      ? historySets
      : [
          historySets[0],
          historySets[0].map((set) => ({
            ...set,
            weight: Number((set.weight * 0.9).toFixed(1)),
            reps: Math.max(1, set.reps - 1),
            rpe: typeof set.rpe === "number" ? Math.max(5, set.rpe - 0.5) : set.rpe
          })),
          ...historySets.slice(1)
        ];

  return {
    id,
    name,
    note: "",
    stickyNoteEnabled: false,
    restTimer,
    goal,
    imageSrc,
    exerciseType,
    measurementType,
    movementSide,
    primaryMuscle,
    primaryMuscles: [primaryMuscle],
    secondaryMuscles,
    howTo,
    videoLabel,
    history: normalizedHistorySets.map((sets, index) => ({
      date: `2026-01-${["05", "12", "19"][index] ?? "19"}`,
      exercise: name,
      session_key: `${id}-${index + 1}`,
      sets
    })),
    draftSets: [
      { id: `${id}-w`, setType: "warmup", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: `${id}-1`, setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: `${id}-2`, setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: `${id}-3`, setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false }
    ],
    movementPattern,
    angle,
    equipment,
    difficultyLevel,
  };
}

const selectorCategorySamples: ExerciseWithTaxonomy[] = [
  createTemplateExercise({
    id: "barbell-squat",
    name: "Barbell Squat",
    restTimer: "01:45",
    imageSrc: benchPressImage,
    exerciseType: "barbell",
    primaryMuscle: "Quads",
    secondaryMuscles: ["Glutes", "Lower Back"],
    movementPattern: "squat", angle: "none", equipment: "barbell", difficultyLevel: "advanced",
    howTo: [
      "Set the bar across the upper back and brace before unracking.",
      "Sit down between the hips while keeping the mid-foot pressure even.",
      "Drive up through the floor and keep the chest stacked over the hips."
    ],
    videoLabel: "Barbell Squat Guide",
    historySets: [
      [
        { weight: 20, reps: 8, set_type: "warmup", rpe: 6, failed: false },
        { weight: 70, reps: 10, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 70, reps: 10, set_type: "normal", rpe: 8, failed: false },
        { weight: 70, reps: 9, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 20, reps: 8, set_type: "warmup", rpe: 6, failed: false },
        { weight: 75, reps: 8, set_type: "normal", rpe: 8, failed: false },
        { weight: 75, reps: 8, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 75, reps: 7, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "ez-bar-curl",
    name: "EZ Bar Curl",
    restTimer: "00:45",
    imageSrc: genericExerciseImage,
    exerciseType: "free_weights_accessories",
    primaryMuscle: "Biceps",
    secondaryMuscles: ["Front Delts"],
    movementPattern: "isolation_pull", angle: "none", equipment: "barbell", difficultyLevel: "beginner",
    howTo: [
      "Start tall with elbows slightly in front of the torso.",
      "Curl the bar without swinging the shoulders forward.",
      "Lower under control until the elbows are nearly straight."
    ],
    videoLabel: "EZ Bar Curl Guide",
    historySets: [
      [
        { weight: 10, reps: 10, set_type: "warmup", rpe: 6, failed: false },
        { weight: 25, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 25, reps: 11, set_type: "normal", rpe: 8, failed: false },
        { weight: 25, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 10, reps: 10, set_type: "warmup", rpe: 6, failed: false },
        { weight: 27.5, reps: 10, set_type: "normal", rpe: 8, failed: false },
        { weight: 27.5, reps: 10, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 27.5, reps: 9, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "rope-pushdown",
    name: "Rope Pushdown",
    restTimer: "00:45",
    imageSrc: genericExerciseImage,
    exerciseType: "machine",
    primaryMuscle: "Triceps",
    secondaryMuscles: ["Front Delts"],
    movementPattern: "isolation_push", angle: "none", equipment: "cable", difficultyLevel: "beginner",
    howTo: [
      "Lock the elbows near the ribs before starting the pushdown.",
      "Spread the rope slightly at the bottom without shrugging.",
      "Control the return until the triceps are fully stretched."
    ],
    videoLabel: "Rope Pushdown Guide",
    historySets: [
      [
        { weight: 10, reps: 12, set_type: "warmup", rpe: 6, failed: false },
        { weight: 20, reps: 15, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 20, reps: 14, set_type: "normal", rpe: 8, failed: false },
        { weight: 20, reps: 13, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 10, reps: 12, set_type: "warmup", rpe: 6, failed: false },
        { weight: 22.5, reps: 12, set_type: "normal", rpe: 8, failed: false },
        { weight: 22.5, reps: 12, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 22.5, reps: 11, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "push-up",
    name: "Push-Up",
    restTimer: "00:45",
    imageSrc: genericExerciseImage,
    exerciseType: "bodyweight_only",
    primaryMuscle: "Chest",
    secondaryMuscles: ["Front Delts", "Triceps"],
    movementPattern: "horizontal_push", angle: "flat", equipment: "bodyweight", difficultyLevel: "beginner",
    howTo: [
      "Set a long straight plank before the first rep.",
      "Lower as one unit until the chest nearly touches the floor.",
      "Press away while keeping the ribs and hips locked together."
    ],
    videoLabel: "Push-Up Guide",
    historySets: [
      [
        { weight: 0, reps: 8, set_type: "warmup", rpe: 6, failed: false },
        { weight: 0, reps: 15, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 0, reps: 13, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 12, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 0, reps: 8, set_type: "warmup", rpe: 6, failed: false },
        { weight: 0, reps: 18, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 16, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 0, reps: 14, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "pull-up",
    name: "Pull-Up",
    restTimer: "01:15",
    imageSrc: genericExerciseImage,
    exerciseType: "bodyweight_only",
    primaryMuscle: "Lats",
    secondaryMuscles: ["Upper Back", "Biceps"],
    movementPattern: "vertical_pull", angle: "overhead", equipment: "bodyweight", difficultyLevel: "intermediate",
    howTo: [
      "Start from a dead hang with the ribs down.",
      "Drive elbows toward the hips instead of pulling with the neck.",
      "Lower all the way to full extension under control."
    ],
    videoLabel: "Pull-Up Guide",
    historySets: [
      [
        { weight: 0, reps: 5, set_type: "warmup", rpe: 6, failed: false },
        { weight: 0, reps: 8, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 0, reps: 7, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 6, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 0, reps: 5, set_type: "warmup", rpe: 6, failed: false },
        { weight: 0, reps: 9, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 8, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 0, reps: 7, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "treadmill-run",
    name: "Treadmill Run",
    restTimer: "00:30",
    goal: "strength",
    imageSrc: genericExerciseImage,
    exerciseType: "machine",
    primaryMuscle: "Quads",
    secondaryMuscles: ["Calves", "Glutes"],
    movementPattern: "cardio", angle: "none", equipment: "machine", difficultyLevel: "beginner",
    howTo: [
      "Set the pace before stepping fully into the run.",
      "Keep the torso stacked and let the arms swing naturally.",
      "Ease the pace down gradually before stepping off."
    ],
    videoLabel: "Treadmill Run Tips",
    historySets: [
      [
        { weight: 0, reps: 10, set_type: "warmup", rpe: 6, failed: false },
        { weight: 0, reps: 20, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 0, reps: 20, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 15, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 0, reps: 10, set_type: "warmup", rpe: 6, failed: false },
        { weight: 0, reps: 25, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 20, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 0, reps: 15, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "stationary-bike",
    name: "Stationary Bike",
    restTimer: "00:30",
    goal: "strength",
    imageSrc: genericExerciseImage,
    exerciseType: "machine",
    primaryMuscle: "Quads",
    secondaryMuscles: ["Glutes", "Calves"],
    movementPattern: "cardio", angle: "none", equipment: "machine", difficultyLevel: "beginner",
    howTo: [
      "Set the saddle height so the knee stays slightly bent at the bottom.",
      "Keep the cadence smooth and avoid rocking the hips.",
      "Let the resistance challenge the legs without losing posture."
    ],
    videoLabel: "Stationary Bike Setup",
    historySets: [
      [
        { weight: 0, reps: 8, set_type: "warmup", rpe: 6, failed: false },
        { weight: 0, reps: 15, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 0, reps: 15, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 12, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 0, reps: 8, set_type: "warmup", rpe: 6, failed: false },
        { weight: 0, reps: 18, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 15, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 0, reps: 12, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "hip-flexor-stretch",
    name: "Hip Flexor Stretch",
    restTimer: "00:30",
    imageSrc: genericExerciseImage,
    exerciseType: "bodyweight_only",
    primaryMuscle: "Quads",
    secondaryMuscles: ["Glutes"],
    movementPattern: "lunge", angle: "none", equipment: "bodyweight", difficultyLevel: "beginner",
    howTo: [
      "Set a half-kneeling stance and tuck the pelvis under slightly.",
      "Shift forward until the front of the hip opens up.",
      "Breathe slowly and keep the ribcage stacked over the hips."
    ],
    videoLabel: "Hip Flexor Stretch Guide",
    historySets: [
      [
        { weight: 0, reps: 1, set_type: "warmup", rpe: 3, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false }
      ],
      [
        { weight: 0, reps: 1, set_type: "warmup", rpe: 3, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "chest-stretch",
    name: "Chest Stretch",
    restTimer: "00:30",
    imageSrc: genericExerciseImage,
    exerciseType: "bodyweight_only",
    primaryMuscle: "Chest",
    secondaryMuscles: ["Front Delts"],
    movementPattern: "isolation_push", angle: "none", equipment: "bodyweight", difficultyLevel: "beginner",
    howTo: [
      "Place the forearm on the wall slightly below shoulder height.",
      "Turn the torso away gently until the chest opens.",
      "Keep the shoulder relaxed instead of forcing the stretch."
    ],
    videoLabel: "Chest Stretch Guide",
    historySets: [
      [
        { weight: 0, reps: 1, set_type: "warmup", rpe: 3, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false }
      ],
      [
        { weight: 0, reps: 1, set_type: "warmup", rpe: 3, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false },
        { weight: 0, reps: 2, set_type: "normal", rpe: 4, failed: false }
      ]
    ]
  })
];

const expandedExerciseSamples: ExerciseWithTaxonomy[] = [
  createTemplateExercise({
    id: "weighted-pull-up",
    name: "Weighted Pull-Up",
    restTimer: "01:30",
    exerciseType: "bodyweight_weighted",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Back",
    secondaryMuscles: ["Biceps", "Middle Back", "Forearms"],
    movementPattern: "vertical_pull", angle: "overhead", equipment: "bodyweight", difficultyLevel: "intermediate",
    howTo: [
      "Let the load hang still before starting the first rep.",
      "Pull the elbows down toward the hips instead of craning the neck.",
      "Lower to full extension without swinging."
    ],
    videoLabel: "Weighted Pull-Up Guide",
    historySets: [
      [
        { weight: 5, reps: 6, set_type: "warmup", rpe: 6, failed: false },
        { weight: 10, reps: 8, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 10, reps: 7, set_type: "normal", rpe: 8, failed: false },
        { weight: 10, reps: 6, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 5, reps: 6, set_type: "warmup", rpe: 6, failed: false },
        { weight: 12.5, reps: 6, set_type: "normal", rpe: 8, failed: false },
        { weight: 12.5, reps: 6, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 12.5, reps: 5, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "chest-dip",
    name: "Chest Dip",
    restTimer: "01:00",
    exerciseType: "bodyweight_only",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Chest",
    secondaryMuscles: ["Triceps", "Front Shoulders"],
    movementPattern: "vertical_push", angle: "decline", equipment: "bodyweight", difficultyLevel: "intermediate",
    howTo: [
      "Lean slightly forward before starting the descent.",
      "Lower until the chest opens without shrugging the shoulders.",
      "Press back up while keeping tension through the chest."
    ],
    videoLabel: "Chest Dip Guide",
    historySets: [
      [
        { weight: 0, reps: 6, set_type: "warmup", rpe: 6, failed: false },
        { weight: 0, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 0, reps: 11, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 0, reps: 6, set_type: "warmup", rpe: 6, failed: false },
        { weight: 0, reps: 14, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 12, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 0, reps: 10, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "weighted-chest-dip",
    name: "Weighted Chest Dip",
    restTimer: "01:15",
    exerciseType: "bodyweight_weighted",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Chest",
    secondaryMuscles: ["Triceps", "Front Shoulders"],
    movementPattern: "vertical_push", angle: "decline", equipment: "bodyweight", difficultyLevel: "advanced",
    howTo: [
      "Let the load settle before lowering into the dip.",
      "Keep a slight forward lean so the chest stays the main driver.",
      "Press up without rushing the turnaround."
    ],
    videoLabel: "Weighted Chest Dip Guide",
    historySets: [
      [
        { weight: 5, reps: 5, set_type: "warmup", rpe: 6, failed: false },
        { weight: 10, reps: 10, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 10, reps: 9, set_type: "normal", rpe: 8, failed: false },
        { weight: 10, reps: 8, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 5, reps: 5, set_type: "warmup", rpe: 6, failed: false },
        { weight: 12.5, reps: 8, set_type: "normal", rpe: 8, failed: false },
        { weight: 12.5, reps: 8, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 12.5, reps: 7, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "plank",
    name: "Plank",
    restTimer: "00:30",
    exerciseType: "bodyweight_only",
    measurementType: "timed",
    movementSide: "bilateral",
    primaryMuscle: "Abs / Core",
    secondaryMuscles: ["Obliques", "Glutes"],
    movementPattern: "core_anterior", angle: "none", equipment: "bodyweight", difficultyLevel: "beginner",
    howTo: [
      "Brace the abs before lifting into position.",
      "Keep the ribs and hips stacked instead of sagging through the lower back.",
      "Breathe behind the brace while holding the line."
    ],
    videoLabel: "Plank Guide",
    historySets: [
      [
        { weight: 0, reps: 30, set_type: "warmup", rpe: 4, failed: false },
        { weight: 0, reps: 45, set_type: "normal", rpe: 6, failed: false },
        { weight: 0, reps: 45, set_type: "normal", rpe: 6.5, failed: false },
        { weight: 0, reps: 40, set_type: "normal", rpe: 7, failed: false }
      ],
      [
        { weight: 0, reps: 30, set_type: "warmup", rpe: 4, failed: false },
        { weight: 0, reps: 50, set_type: "normal", rpe: 6.5, failed: false },
        { weight: 0, reps: 45, set_type: "normal", rpe: 7, failed: false },
        { weight: 0, reps: 45, set_type: "normal", rpe: 7.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "weighted-plank",
    name: "Weighted Plank",
    restTimer: "00:45",
    exerciseType: "bodyweight_weighted",
    measurementType: "weight_timed",
    movementSide: "bilateral",
    primaryMuscle: "Abs / Core",
    secondaryMuscles: ["Obliques", "Glutes"],
    movementPattern: "core_anterior", angle: "none", equipment: "bodyweight", difficultyLevel: "intermediate",
    howTo: [
      "Set the plate securely before lifting into the hold.",
      "Brace first so the torso stays locked from ribs to hips.",
      "Hold cleanly instead of letting the lower back take over."
    ],
    videoLabel: "Weighted Plank Guide",
    historySets: [
      [
        { weight: 10, reps: 30, set_type: "warmup", rpe: 5, failed: false },
        { weight: 20, reps: 40, set_type: "normal", rpe: 7, failed: false },
        { weight: 20, reps: 35, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 20, reps: 30, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 10, reps: 30, set_type: "warmup", rpe: 5, failed: false },
        { weight: 25, reps: 35, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 25, reps: 35, set_type: "normal", rpe: 8, failed: false },
        { weight: 25, reps: 30, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "weighted-push-up",
    name: "Weighted Push-Up",
    restTimer: "01:00",
    exerciseType: "bodyweight_weighted",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Chest",
    secondaryMuscles: ["Triceps", "Front Shoulders"],
    movementPattern: "horizontal_push", angle: "flat", equipment: "bodyweight", difficultyLevel: "intermediate",
    howTo: [
      "Set the load securely before taking the plank position.",
      "Lower as one unit until the chest nearly reaches the floor.",
      "Drive away while keeping the core tight."
    ],
    videoLabel: "Weighted Push-Up Guide",
    historySets: [
      [
        { weight: 5, reps: 8, set_type: "warmup", rpe: 6, failed: false },
        { weight: 10, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 10, reps: 10, set_type: "normal", rpe: 8, failed: false },
        { weight: 10, reps: 9, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 5, reps: 8, set_type: "warmup", rpe: 6, failed: false },
        { weight: 15, reps: 10, set_type: "normal", rpe: 8, failed: false },
        { weight: 15, reps: 9, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 15, reps: 8, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "wall-sit",
    name: "Wall Sit",
    restTimer: "00:30",
    exerciseType: "bodyweight_only",
    measurementType: "timed",
    movementSide: "bilateral",
    primaryMuscle: "Quads",
    secondaryMuscles: ["Glutes", "Abs / Core"],
    movementPattern: "isolation_legs", angle: "none", equipment: "bodyweight", difficultyLevel: "beginner",
    howTo: [
      "Set the knees close to ninety degrees before starting the hold.",
      "Keep the full foot planted and the lower back supported by the wall.",
      "Hold steady instead of bouncing through the position."
    ],
    videoLabel: "Wall Sit Guide",
    historySets: [
      [
        { weight: 0, reps: 30, set_type: "warmup", rpe: 4, failed: false },
        { weight: 0, reps: 45, set_type: "normal", rpe: 6, failed: false },
        { weight: 0, reps: 45, set_type: "normal", rpe: 6.5, failed: false },
        { weight: 0, reps: 40, set_type: "normal", rpe: 7, failed: false }
      ],
      [
        { weight: 0, reps: 30, set_type: "warmup", rpe: 4, failed: false },
        { weight: 0, reps: 60, set_type: "normal", rpe: 6.5, failed: false },
        { weight: 0, reps: 50, set_type: "normal", rpe: 7, failed: false },
        { weight: 0, reps: 45, set_type: "normal", rpe: 7.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "weighted-wall-sit",
    name: "Weighted Wall Sit",
    restTimer: "00:45",
    exerciseType: "bodyweight_weighted",
    measurementType: "weight_timed",
    movementSide: "bilateral",
    primaryMuscle: "Quads",
    secondaryMuscles: ["Glutes", "Abs / Core"],
    movementPattern: "isolation_legs", angle: "none", equipment: "bodyweight", difficultyLevel: "intermediate",
    howTo: [
      "Set the load securely before settling into the sit.",
      "Hold the knee angle steady rather than drifting upward.",
      "Keep the core braced through the whole hold."
    ],
    videoLabel: "Weighted Wall Sit Guide",
    historySets: [
      [
        { weight: 10, reps: 30, set_type: "warmup", rpe: 5, failed: false },
        { weight: 20, reps: 40, set_type: "normal", rpe: 7, failed: false },
        { weight: 20, reps: 35, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 20, reps: 30, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 10, reps: 30, set_type: "warmup", rpe: 5, failed: false },
        { weight: 25, reps: 35, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 25, reps: 35, set_type: "normal", rpe: 8, failed: false },
        { weight: 25, reps: 30, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "cable-hip-abduction",
    name: "Cable Hip Abduction",
    restTimer: "00:45",
    exerciseType: "machine",
    measurementType: "reps_volume",
    movementSide: "unilateral",
    primaryMuscle: "Abductors",
    secondaryMuscles: ["Glutes"],
    movementPattern: "isolation_legs", angle: "none", equipment: "cable", difficultyLevel: "beginner",
    howTo: [
      "Brace against the stack before moving the working leg out.",
      "Lead from the hip instead of swinging the foot.",
      "Return slowly so the glute med stays loaded."
    ],
    videoLabel: "Cable Hip Abduction Guide",
    historySets: [
      [
        { weight: 5, reps: 12, set_type: "warmup", rpe: 5, failed: false },
        { weight: 10, reps: 15, set_type: "normal", rpe: 7, failed: false },
        { weight: 10, reps: 14, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 10, reps: 12, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 5, reps: 12, set_type: "warmup", rpe: 5, failed: false },
        { weight: 12.5, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 12.5, reps: 12, set_type: "normal", rpe: 8, failed: false },
        { weight: 12.5, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "standing-calf-raise",
    name: "Standing Calf Raise",
    restTimer: "00:45",
    exerciseType: "bodyweight_only",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Calves",
    secondaryMuscles: [],
    movementPattern: "isolation_legs", angle: "none", equipment: "none", difficultyLevel: "beginner",
    howTo: [
      "Let the heels drop into a full stretch at the bottom.",
      "Drive up through the big toe and hold the top briefly.",
      "Lower slowly instead of bouncing."
    ],
    videoLabel: "Standing Calf Raise Guide",
    historySets: [
      [
        { weight: 20, reps: 12, set_type: "warmup", rpe: 5, failed: false },
        { weight: 40, reps: 18, set_type: "normal", rpe: 7, failed: false },
        { weight: 40, reps: 16, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 40, reps: 15, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 20, reps: 12, set_type: "warmup", rpe: 5, failed: false },
        { weight: 50, reps: 15, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 50, reps: 15, set_type: "normal", rpe: 8, failed: false },
        { weight: 50, reps: 14, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "wrist-curl",
    name: "Wrist Curl",
    restTimer: "00:45",
    exerciseType: "free_weights_accessories",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Forearms",
    secondaryMuscles: ["Biceps"],
    movementPattern: "isolation_pull", angle: "none", equipment: "dumbbell", difficultyLevel: "beginner",
    howTo: [
      "Let the wrist extend first to find the full range.",
      "Curl through the forearm without lifting the whole arm.",
      "Lower under control instead of dropping the weight."
    ],
    videoLabel: "Wrist Curl Guide",
    historySets: [
      [
        { weight: 5, reps: 15, set_type: "warmup", rpe: 5, failed: false },
        { weight: 10, reps: 18, set_type: "normal", rpe: 7, failed: false },
        { weight: 10, reps: 16, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 10, reps: 15, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 5, reps: 15, set_type: "warmup", rpe: 5, failed: false },
        { weight: 12.5, reps: 15, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 12.5, reps: 15, set_type: "normal", rpe: 8, failed: false },
        { weight: 12.5, reps: 14, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "chest-supported-row",
    name: "Chest Supported Row",
    restTimer: "01:00",
    exerciseType: "free_weights_accessories",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Middle Back",
    secondaryMuscles: ["Back", "Rear Delts", "Biceps"],
    movementPattern: "horizontal_pull", angle: "prone", equipment: "dumbbell", difficultyLevel: "beginner",
    howTo: [
      "Set the chest firmly against the bench before pulling.",
      "Drive the elbows back without shrugging the shoulders.",
      "Control the stretch through the upper back on the way down."
    ],
    videoLabel: "Chest Supported Row Guide",
    historySets: [
      [
        { weight: 12.5, reps: 10, set_type: "warmup", rpe: 5, failed: false },
        { weight: 22.5, reps: 12, set_type: "normal", rpe: 7, failed: false },
        { weight: 22.5, reps: 11, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 22.5, reps: 10, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 12.5, reps: 10, set_type: "warmup", rpe: 5, failed: false },
        { weight: 25, reps: 10, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 25, reps: 10, set_type: "normal", rpe: 8, failed: false },
        { weight: 25, reps: 9, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "back-extension",
    name: "Back Extension",
    restTimer: "00:45",
    exerciseType: "bodyweight_only",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Lower Back",
    secondaryMuscles: ["Glutes", "Hamstrings"],
    movementPattern: "hip_hinge", angle: "prone", equipment: "bodyweight", difficultyLevel: "beginner",
    howTo: [
      "Brace before hinging over the pad.",
      "Lift by extending through the hips and lower back together.",
      "Stop at a straight line instead of overextending."
    ],
    videoLabel: "Back Extension Guide",
    historySets: [
      [
        { weight: 0, reps: 10, set_type: "warmup", rpe: 5, failed: false },
        { weight: 0, reps: 15, set_type: "normal", rpe: 7, failed: false },
        { weight: 0, reps: 14, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 0, reps: 12, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 0, reps: 10, set_type: "warmup", rpe: 5, failed: false },
        { weight: 0, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 0, reps: 12, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "weighted-back-extension",
    name: "Weighted Back Extension",
    restTimer: "01:00",
    exerciseType: "bodyweight_weighted",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Lower Back",
    secondaryMuscles: ["Glutes", "Hamstrings"],
    movementPattern: "hip_hinge", angle: "prone", equipment: "bodyweight", difficultyLevel: "intermediate",
    howTo: [
      "Hold a plate or dumbbell against the chest before setting up on the pad.",
      "Brace the core and hinge down slowly under control.",
      "Extend through the hips and lower back to a straight line — avoid hyperextending."
    ],
    videoLabel: "Weighted Back Extension Guide",
    historySets: [
      [
        { weight: 0, reps: 10, set_type: "warmup", rpe: 5, failed: false },
        { weight: 10, reps: 12, set_type: "normal", rpe: 7, failed: false },
        { weight: 10, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 10, reps: 10, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 0, reps: 10, set_type: "warmup", rpe: 5, failed: false },
        { weight: 15, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 15, reps: 11, set_type: "normal", rpe: 8, failed: false },
        { weight: 15, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "dumbbell-shrug",
    name: "Dumbbell Shrug",
    restTimer: "00:45",
    exerciseType: "free_weights_accessories",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Traps",
    secondaryMuscles: ["Forearms"],
    movementPattern: "isolation_pull", angle: "none", equipment: "dumbbell", difficultyLevel: "beginner",
    howTo: [
      "Stand tall and let the shoulders settle before each rep.",
      "Lift the shoulders straight up without rolling them.",
      "Pause briefly at the top before lowering."
    ],
    videoLabel: "Dumbbell Shrug Guide",
    historySets: [
      [
        { weight: 12.5, reps: 12, set_type: "warmup", rpe: 5, failed: false },
        { weight: 22.5, reps: 15, set_type: "normal", rpe: 7, failed: false },
        { weight: 22.5, reps: 14, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 22.5, reps: 12, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 12.5, reps: 12, set_type: "warmup", rpe: 5, failed: false },
        { weight: 25, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 25, reps: 12, set_type: "normal", rpe: 8, failed: false },
        { weight: 25, reps: 11, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "barbell-hip-thrust",
    name: "Barbell Hip Thrust",
    restTimer: "01:15",
    exerciseType: "barbell",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Glutes",
    secondaryMuscles: ["Hamstrings", "Abs / Core"],
    movementPattern: "hip_hinge", angle: "none", equipment: "barbell", difficultyLevel: "intermediate",
    howTo: [
      "Set the bench against the shoulder blades before unracking the bar.",
      "Drive through the heels and squeeze the glutes hard at the top.",
      "Lower under control without losing the ribcage position."
    ],
    videoLabel: "Barbell Hip Thrust Guide",
    historySets: [
      [
        { weight: 30, reps: 10, set_type: "warmup", rpe: 5, failed: false },
        { weight: 80, reps: 12, set_type: "normal", rpe: 7, failed: false },
        { weight: 80, reps: 11, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 80, reps: 10, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 30, reps: 10, set_type: "warmup", rpe: 5, failed: false },
        { weight: 90, reps: 10, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 90, reps: 10, set_type: "normal", rpe: 8, failed: false },
        { weight: 90, reps: 9, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "hanging-leg-raise",
    name: "Hanging Leg Raise",
    restTimer: "00:45",
    exerciseType: "bodyweight_only",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Abs / Core",
    secondaryMuscles: ["Obliques", "Hip Flexors"],
    movementPattern: "core_anterior", angle: "none", equipment: "bodyweight", difficultyLevel: "intermediate",
    howTo: [
      "Set the ribs down before lifting the legs.",
      "Raise with the abs instead of swinging the torso.",
      "Lower slowly to keep tension through the midline."
    ],
    videoLabel: "Hanging Leg Raise Guide",
    historySets: [
      [
        { weight: 0, reps: 8, set_type: "warmup", rpe: 5, failed: false },
        { weight: 0, reps: 15, set_type: "normal", rpe: 7, failed: false },
        { weight: 0, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 0, reps: 10, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 0, reps: 8, set_type: "warmup", rpe: 5, failed: false },
        { weight: 0, reps: 18, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 0, reps: 14, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 12, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "cable-wood-chop",
    name: "Cable Wood Chop",
    restTimer: "00:45",
    exerciseType: "free_weights_accessories",
    measurementType: "reps_volume",
    movementSide: "unilateral",
    primaryMuscle: "Obliques",
    secondaryMuscles: ["Abs / Core", "Glutes"],
    movementPattern: "core_rotational", angle: "none", equipment: "cable", difficultyLevel: "intermediate",
    howTo: [
      "Brace before rotating away from the stack.",
      "Turn through the torso, not just the arms.",
      "Finish under control and resist the pull back."
    ],
    videoLabel: "Cable Wood Chop Guide",
    historySets: [
      [
        { weight: 5, reps: 10, set_type: "warmup", rpe: 5, failed: false },
        { weight: 12.5, reps: 15, set_type: "normal", rpe: 7, failed: false },
        { weight: 12.5, reps: 14, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 12.5, reps: 12, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 5, reps: 10, set_type: "warmup", rpe: 5, failed: false },
        { weight: 15, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 15, reps: 12, set_type: "normal", rpe: 8, failed: false },
        { weight: 15, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "reverse-pec-deck",
    name: "Reverse Pec Deck",
    restTimer: "00:45",
    exerciseType: "machine",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Rear Delts",
    secondaryMuscles: ["Middle Back", "Traps"],
    movementPattern: "isolation_pull", angle: "prone", equipment: "machine", difficultyLevel: "beginner",
    howTo: [
      "Set the handles so the shoulders stay slightly below the ears.",
      "Sweep out and back without arching the lower back.",
      "Control the return so the rear delts stay loaded."
    ],
    videoLabel: "Reverse Pec Deck Guide",
    historySets: [
      [
        { weight: 10, reps: 12, set_type: "warmup", rpe: 5, failed: false },
        { weight: 25, reps: 15, set_type: "normal", rpe: 7, failed: false },
        { weight: 25, reps: 14, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 25, reps: 12, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 10, reps: 12, set_type: "warmup", rpe: 5, failed: false },
        { weight: 30, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 30, reps: 12, set_type: "normal", rpe: 8, failed: false },
        { weight: 30, reps: 11, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "dumbbell-front-raise",
    name: "Dumbbell Front Raise",
    restTimer: "00:45",
    exerciseType: "free_weights_accessories",
    measurementType: "reps_volume",
    movementSide: "bilateral",
    primaryMuscle: "Front Delts",
    secondaryMuscles: ["Upper Chest", "Side Delts"],
    movementPattern: "isolation_push", angle: "none", equipment: "dumbbell", difficultyLevel: "beginner",
    howTo: [
      "Lift with a soft elbow and a quiet torso.",
      "Raise only to shoulder height so the front delts stay loaded.",
      "Lower slowly without swinging."
    ],
    videoLabel: "Dumbbell Front Raise Guide",
    historySets: [
      [
        { weight: 5, reps: 12, set_type: "warmup", rpe: 5, failed: false },
        { weight: 10, reps: 15, set_type: "normal", rpe: 7, failed: false },
        { weight: 10, reps: 14, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 10, reps: 12, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 5, reps: 12, set_type: "warmup", rpe: 5, failed: false },
        { weight: 12.5, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 12.5, reps: 12, set_type: "normal", rpe: 8, failed: false },
        { weight: 12.5, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  })
];

const seededCustomExercises: ExerciseWithTaxonomy[] = [
  createTemplateExercise({
    id: "custom-landmine-press",
    name: "Landmine Press",
    restTimer: "01:00",
    imageSrc: genericExerciseImage,
    exerciseType: "barbell",
    primaryMuscle: "Shoulders",
    secondaryMuscles: ["Upper Chest", "Triceps"],
    movementPattern: "vertical_push", angle: "overhead", equipment: "landmine", difficultyLevel: "intermediate",
    howTo: [
      "Set the bar in the landmine and start with the elbow slightly in front.",
      "Press up and forward without over-arching the lower back.",
      "Lower under control to the shoulder line."
    ],
    videoLabel: "Landmine Press Guide",
    historySets: [
      [
        { weight: 10, reps: 10, set_type: "warmup", rpe: 6, failed: false },
        { weight: 20, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 20, reps: 11, set_type: "normal", rpe: 8, failed: false },
        { weight: 20, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
      ],
      [
        { weight: 10, reps: 10, set_type: "warmup", rpe: 6, failed: false },
        { weight: 22.5, reps: 10, set_type: "normal", rpe: 8, failed: false },
        { weight: 22.5, reps: 10, set_type: "normal", rpe: 8.5, failed: false },
        { weight: 22.5, reps: 9, set_type: "normal", rpe: 9, failed: false }
      ]
    ]
  }),
  createTemplateExercise({
    id: "custom-cossack-squat",
    name: "Cossack Squat",
    restTimer: "00:45",
    imageSrc: genericExerciseImage,
    exerciseType: "bodyweight_only",
    primaryMuscle: "Adductors",
    secondaryMuscles: ["Glutes", "Quads"],
    movementPattern: "lunge", angle: "none", equipment: "bodyweight", difficultyLevel: "intermediate",
    howTo: [
      "Shift into one hip while keeping the other leg long.",
      "Sit as deep as mobility allows without rounding the trunk.",
      "Push through the bent leg to return to center."
    ],
    videoLabel: "Cossack Squat Guide",
    historySets: [
      [
        { weight: 0, reps: 6, set_type: "warmup", rpe: 5, failed: false },
        { weight: 0, reps: 10, set_type: "normal", rpe: 7, failed: false },
        { weight: 0, reps: 10, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 0, reps: 8, set_type: "normal", rpe: 8, failed: false }
      ],
      [
        { weight: 0, reps: 6, set_type: "warmup", rpe: 5, failed: false },
        { weight: 0, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 0, reps: 10, set_type: "normal", rpe: 8, failed: false },
        { weight: 0, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
      ]
    ]
  })
];

const exerciseLibrary: ExerciseWithTaxonomy[] = [
  {
    id: "bench-press",
    name: "Bench Press",
    note: "",
    restTimer: "01:30",
    goal: "hypertrophy",
    imageSrc: benchPressImage,
    primaryMuscle: "Chest",
    secondaryMuscles: ["Front Delts", "Triceps"],
    movementPattern: "horizontal_push",
    angle: "flat",
    equipment: "barbell",
    difficultyLevel: "intermediate",
    exerciseType: "barbell",
    howTo: [
      "Set your eyes under the bar and plant your feet before unracking.",
      "Lower the bar to your mid-chest with controlled elbows.",
      "Press back up while keeping the upper back tight against the bench."
    ],
    videoLabel: "Bench Press Form Video",
    history: [
      {
        date: "2026-01-05",
        exercise: "Bench Press",
        session_key: "bench-week-1",
        sets: [
          { weight: 60, reps: 10, set_type: "warmup", rpe: 6.5, failed: false },
          { weight: 80, reps: 10, set_type: "normal", rpe: 7.5, failed: false },
          { weight: 80, reps: 10, set_type: "normal", rpe: 7.5, failed: false },
          { weight: 80, reps: 10, set_type: "normal", rpe: 8, failed: false }
        ]
      },
      {
        date: "2026-01-12",
        exercise: "Bench Press",
        session_key: "bench-week-2",
        sets: [
          { weight: 60, reps: 10, set_type: "warmup", rpe: 6.5, failed: false },
          { weight: 80, reps: 11, set_type: "normal", rpe: 8, failed: false },
          { weight: 80, reps: 11, set_type: "normal", rpe: 8, failed: false },
          { weight: 80, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
        ]
      },
      {
        date: "2026-01-19",
        exercise: "Bench Press",
        session_key: "bench-week-3",
        sets: [
          { weight: 60, reps: 10, set_type: "warmup", rpe: 6.5, failed: false },
          { weight: 80, reps: 12, set_type: "normal", rpe: 8, failed: false },
          { weight: 80, reps: 12, set_type: "normal", rpe: 8, failed: false },
          { weight: 80, reps: 11, set_type: "normal", rpe: 8.5, failed: false }
        ]
      }
    ],
    draftSets: [
      { id: "bench-w", setType: "warmup", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "bench-1", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "bench-2", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "bench-3", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false }
    ]
  },
  {
    id: "incline-dumbbell-press",
    name: "Incline Dumbbell Press",
    note: "",
    restTimer: "01:00",
    goal: "hypertrophy",
    imageSrc: inclineDumbbellPressImage,
    primaryMuscle: "Upper Chest",
    secondaryMuscles: ["Front Delts", "Triceps"],
    movementPattern: "horizontal_push",
    angle: "incline",
    equipment: "dumbbell",
    difficultyLevel: "beginner",
    exerciseType: "free_weights_accessories",
    howTo: [
      "Set the bench incline before picking the dumbbells up into position.",
      "Lower the bells with elbows slightly tucked and wrists stacked.",
      "Drive upward in an arc that keeps tension through the upper chest."
    ],
    videoLabel: "Incline Dumbbell Press Guide",
    history: [
      {
        date: "2026-01-05",
        exercise: "Incline Dumbbell Press",
        session_key: "incline-week-1",
        sets: [
          { weight: 20, reps: 12, set_type: "warmup", rpe: 6, failed: false },
          { weight: 30, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
          { weight: 30, reps: 11, set_type: "normal", rpe: 8, failed: false },
          { weight: 30, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
        ]
      },
      {
        date: "2026-01-12",
        exercise: "Incline Dumbbell Press",
        session_key: "incline-week-2",
        sets: [
          { weight: 20, reps: 12, set_type: "warmup", rpe: 6, failed: false },
          { weight: 32.5, reps: 10, set_type: "normal", rpe: 8, failed: false },
          { weight: 32.5, reps: 10, set_type: "normal", rpe: 8.5, failed: false },
          { weight: 32.5, reps: 9, set_type: "normal", rpe: 9, failed: false }
        ]
      },
      {
        date: "2026-01-19",
        exercise: "Incline Dumbbell Press",
        session_key: "incline-week-3",
        sets: [
          { weight: 20, reps: 12, set_type: "warmup", rpe: 6, failed: false },
          { weight: 32.5, reps: 11, set_type: "normal", rpe: 8, failed: false },
          { weight: 32.5, reps: 10, set_type: "normal", rpe: 8.5, failed: false },
          { weight: 32.5, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
        ]
      }
    ],
    draftSets: [
      { id: "incline-w", setType: "warmup", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "incline-1", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "incline-2", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "incline-3", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false }
    ]
  }
];

const exerciseTemplates: ExerciseWithTaxonomy[] = [
  ...exerciseLibrary,
  {
    id: "lat-pulldown",
    name: "Lat Pulldown",
    note: "",
    restTimer: "01:00",
    goal: "hypertrophy",
    imageSrc: inclineDumbbellPressImage,
    primaryMuscle: "Lats",
    secondaryMuscles: ["Upper Back", "Biceps"],
    exerciseType: "machine" as const,
    movementPattern: "vertical_pull" as const,
    angle: "overhead" as const,
    equipment: "cable" as const,
    difficultyLevel: "beginner" as const,
    howTo: [
      "Set the thigh pad so you stay locked into the seat.",
      "Drive elbows down toward your ribs without swinging your torso.",
      "Control the upward stretch before starting the next rep."
    ],
    videoLabel: "Lat Pulldown Technique Guide",
    history: [
      {
        date: "2026-01-12",
        exercise: "Lat Pulldown",
        session_key: "lat-pulldown-1",
        sets: [
          { weight: 25, reps: 10, set_type: "warmup", rpe: 6, failed: false },
          { weight: 50, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
          { weight: 50, reps: 11, set_type: "normal", rpe: 8, failed: false },
          { weight: 50, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
        ]
      },
      {
        date: "2026-01-19",
        exercise: "Lat Pulldown",
        session_key: "lat-pulldown-2",
        sets: [
          { weight: 25, reps: 10, set_type: "warmup", rpe: 6, failed: false },
          { weight: 55, reps: 11, set_type: "normal", rpe: 8, failed: false },
          { weight: 55, reps: 10, set_type: "normal", rpe: 8.5, failed: false },
          { weight: 55, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
        ]
      }
    ],
    draftSets: [
      { id: "lat-w", setType: "warmup", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "lat-1", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "lat-2", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "lat-3", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false }
    ]
  },
  {
    id: "seated-cable-row",
    name: "Seated Cable Row",
    note: "",
    restTimer: "01:00",
    goal: "hypertrophy",
    imageSrc: benchPressImage,
    exerciseType: "machine" as const,
    primaryMuscle: "Upper Back",
    secondaryMuscles: ["Lats", "Biceps", "Rear Delts"],
    movementPattern: "horizontal_pull" as const,
    angle: "flat" as const,
    equipment: "cable" as const,
    difficultyLevel: "beginner" as const,
    howTo: [
      "Brace your feet and sit tall before starting the pull.",
      "Drive elbows back while keeping the chest lifted.",
      "Let the shoulder blades protract under control on the return."
    ],
    videoLabel: "Seated Cable Row Guide",
    history: [
      {
        date: "2026-01-12",
        exercise: "Seated Cable Row",
        session_key: "row-1",
        sets: [
          { weight: 20, reps: 10, set_type: "warmup", rpe: 6, failed: false },
          { weight: 60, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
          { weight: 60, reps: 12, set_type: "normal", rpe: 8, failed: false },
          { weight: 60, reps: 11, set_type: "normal", rpe: 8.5, failed: false }
        ]
      },
      {
        date: "2026-01-19",
        exercise: "Seated Cable Row",
        session_key: "row-2",
        sets: [
          { weight: 20, reps: 10, set_type: "warmup", rpe: 6, failed: false },
          { weight: 60, reps: 12, set_type: "normal", rpe: 8, failed: false },
          { weight: 60, reps: 12, set_type: "normal", rpe: 8, failed: false },
          { weight: 60, reps: 12, set_type: "normal", rpe: 8.5, failed: false }
        ]
      }
    ],
    draftSets: [
      { id: "row-w", setType: "warmup", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "row-1", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "row-2", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "row-3", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false }
    ]
  },
  {
    id: "shoulder-press",
    name: "Shoulder Press",
    note: "",
    restTimer: "01:00",
    goal: "hypertrophy",
    imageSrc: inclineDumbbellPressImage,
    primaryMuscle: "Shoulders",
    secondaryMuscles: ["Triceps", "Upper Chest"],
    exerciseType: "free_weights_accessories" as const,
    movementPattern: "vertical_push" as const,
    angle: "overhead" as const,
    equipment: "dumbbell" as const,
    difficultyLevel: "intermediate" as const,
    howTo: [
      "Stack wrists over elbows before pressing overhead.",
      "Keep the ribcage down instead of leaning back.",
      "Finish with the biceps near the ears without shrugging."
    ],
    videoLabel: "Shoulder Press Guide",
    history: [
      {
        date: "2026-01-12",
        exercise: "Shoulder Press",
        session_key: "shoulder-press-1",
        sets: [
          { weight: 12.5, reps: 10, set_type: "warmup", rpe: 6, failed: false },
          { weight: 22.5, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
          { weight: 22.5, reps: 11, set_type: "normal", rpe: 8, failed: false },
          { weight: 22.5, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
        ]
      },
      {
        date: "2026-01-19",
        exercise: "Shoulder Press",
        session_key: "shoulder-press-2",
        sets: [
          { weight: 12.5, reps: 10, set_type: "warmup", rpe: 6, failed: false },
          { weight: 25, reps: 10, set_type: "normal", rpe: 8, failed: false },
          { weight: 25, reps: 10, set_type: "normal", rpe: 8.5, failed: false },
          { weight: 25, reps: 9, set_type: "normal", rpe: 9, failed: false }
        ]
      }
    ],
    draftSets: [
      { id: "sp-w", setType: "warmup", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "sp-1", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "sp-2", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "sp-3", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false }
    ]
  },
  {
    id: "leg-press",
    name: "Leg Press",
    note: "",
    restTimer: "01:30",
    goal: "hypertrophy",
    imageSrc: benchPressImage,
    exerciseType: "machine" as const,
    primaryMuscle: "Quads",
    secondaryMuscles: ["Glutes", "Adductors"],
    movementPattern: "squat" as const,
    angle: "none" as const,
    equipment: "machine" as const,
    difficultyLevel: "beginner" as const,
    howTo: [
      "Plant the full foot on the platform before unlocking.",
      "Lower until the knees and hips are deeply bent without the hips lifting.",
      "Drive through mid-foot and keep the knees tracking over the toes."
    ],
    videoLabel: "Leg Press Setup",
    history: [
      {
        date: "2026-01-12",
        exercise: "Leg Press",
        session_key: "leg-press-1",
        sets: [
          { weight: 80, reps: 12, set_type: "warmup", rpe: 6, failed: false },
          { weight: 160, reps: 15, set_type: "normal", rpe: 7.5, failed: false },
          { weight: 160, reps: 14, set_type: "normal", rpe: 8, failed: false },
          { weight: 160, reps: 13, set_type: "normal", rpe: 8.5, failed: false }
        ]
      },
      {
        date: "2026-01-19",
        exercise: "Leg Press",
        session_key: "leg-press-2",
        sets: [
          { weight: 80, reps: 12, set_type: "warmup", rpe: 6, failed: false },
          { weight: 180, reps: 12, set_type: "normal", rpe: 8, failed: false },
          { weight: 180, reps: 12, set_type: "normal", rpe: 8.5, failed: false },
          { weight: 180, reps: 11, set_type: "normal", rpe: 9, failed: false }
        ]
      }
    ],
    draftSets: [
      { id: "lp-w", setType: "warmup", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "lp-1", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "lp-2", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "lp-3", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false }
    ]
  },
  {
    id: "romanian-deadlift",
    name: "Romanian Deadlift",
    note: "",
    restTimer: "01:30",
    goal: "hypertrophy",
    imageSrc: benchPressImage,
    primaryMuscle: "Hamstrings",
    secondaryMuscles: ["Glutes", "Lower Back"],
    exerciseType: "barbell" as const,
    movementPattern: "hip_hinge" as const,
    angle: "none" as const,
    equipment: "barbell" as const,
    difficultyLevel: "intermediate" as const,
    howTo: [
      "Unlock the knees and push the hips back before the bar drifts forward.",
      "Keep the lats tight so the weight stays close to the legs.",
      "Stand tall by driving the hips through, not by leaning back."
    ],
    videoLabel: "Romanian Deadlift Guide",
    history: [
      {
        date: "2026-01-12",
        exercise: "Romanian Deadlift",
        session_key: "rdl-1",
        sets: [
          { weight: 40, reps: 10, set_type: "warmup", rpe: 6, failed: false },
          { weight: 80, reps: 12, set_type: "normal", rpe: 7.5, failed: false },
          { weight: 80, reps: 12, set_type: "normal", rpe: 8, failed: false },
          { weight: 80, reps: 11, set_type: "normal", rpe: 8.5, failed: false }
        ]
      },
      {
        date: "2026-01-19",
        exercise: "Romanian Deadlift",
        session_key: "rdl-2",
        sets: [
          { weight: 40, reps: 10, set_type: "warmup", rpe: 6, failed: false },
          { weight: 90, reps: 10, set_type: "normal", rpe: 8, failed: false },
          { weight: 90, reps: 10, set_type: "normal", rpe: 8.5, failed: false },
          { weight: 90, reps: 9, set_type: "normal", rpe: 9, failed: false }
        ]
      }
    ],
    draftSets: [
      { id: "rdl-w", setType: "warmup", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "rdl-1", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "rdl-2", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "rdl-3", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false }
    ]
  },
  {
    id: "cable-lateral-raise",
    name: "Cable Lateral Raise",
    note: "",
    restTimer: "00:45",
    goal: "hypertrophy",
    imageSrc: inclineDumbbellPressImage,
    exerciseType: "machine" as const,
    primaryMuscle: "Side Delts",
    secondaryMuscles: ["Upper Traps"],
    movementPattern: "isolation_push" as const,
    angle: "none" as const,
    equipment: "cable" as const,
    difficultyLevel: "beginner" as const,
    howTo: [
      "Start slightly in front of the cable stack with a soft elbow.",
      "Raise out and slightly forward until the hand reaches shoulder height.",
      "Lower under control without letting the stack crash."
    ],
    videoLabel: "Cable Lateral Raise Guide",
    history: [
      {
        date: "2026-01-12",
        exercise: "Cable Lateral Raise",
        session_key: "clr-1",
        sets: [
          { weight: 5, reps: 12, set_type: "warmup", rpe: 6, failed: false },
          { weight: 10, reps: 15, set_type: "normal", rpe: 7.5, failed: false },
          { weight: 10, reps: 14, set_type: "normal", rpe: 8, failed: false },
          { weight: 10, reps: 13, set_type: "normal", rpe: 8.5, failed: false }
        ]
      },
      {
        date: "2026-01-19",
        exercise: "Cable Lateral Raise",
        session_key: "clr-2",
        sets: [
          { weight: 5, reps: 12, set_type: "warmup", rpe: 6, failed: false },
          { weight: 12.5, reps: 12, set_type: "normal", rpe: 8, failed: false },
          { weight: 12.5, reps: 12, set_type: "normal", rpe: 8.5, failed: false },
          { weight: 12.5, reps: 11, set_type: "normal", rpe: 9, failed: false }
        ]
      }
    ],
    draftSets: [
      { id: "clr-w", setType: "warmup", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "clr-1", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "clr-2", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "clr-3", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false }
    ]
  },
  {
    id: "hamstring-curl",
    name: "Hamstring Curl",
    note: "",
    restTimer: "00:45",
    goal: "hypertrophy",
    imageSrc: benchPressImage,
    primaryMuscle: "Hamstrings",
    secondaryMuscles: ["Calves"],
    exerciseType: "machine" as const,
    movementPattern: "isolation_legs" as const,
    angle: "prone" as const,
    equipment: "machine" as const,
    difficultyLevel: "beginner" as const,
    howTo: [
      "Set the machine so the pad sits just above the heels.",
      "Curl smoothly without lifting the hips off the bench.",
      "Control the lowering phase all the way back to full stretch."
    ],
    videoLabel: "Hamstring Curl Guide",
    history: [
      {
        date: "2026-01-12",
        exercise: "Hamstring Curl",
        session_key: "hc-1",
        sets: [
          { weight: 20, reps: 12, set_type: "warmup", rpe: 6, failed: false },
          { weight: 35, reps: 15, set_type: "normal", rpe: 7.5, failed: false },
          { weight: 35, reps: 14, set_type: "normal", rpe: 8, failed: false },
          { weight: 35, reps: 13, set_type: "normal", rpe: 8.5, failed: false }
        ]
      },
      {
        date: "2026-01-19",
        exercise: "Hamstring Curl",
        session_key: "hc-2",
        sets: [
          { weight: 20, reps: 12, set_type: "warmup", rpe: 6, failed: false },
          { weight: 40, reps: 12, set_type: "normal", rpe: 8, failed: false },
          { weight: 40, reps: 12, set_type: "normal", rpe: 8.5, failed: false },
          { weight: 40, reps: 11, set_type: "normal", rpe: 9, failed: false }
        ]
      }
    ],
    draftSets: [
      { id: "hc-w", setType: "warmup", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "hc-1", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "hc-2", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false },
      { id: "hc-3", setType: "normal", weightInput: "", repsInput: "", rpeInput: "", done: false, failed: false }
    ]
  },
  ...selectorCategorySamples,
  ...expandedExerciseSamples
];

const replacementTemplates: Array<
  Pick<
    ExerciseDraft,
    "name" | "imageSrc" | "primaryMuscle" | "secondaryMuscles" | "howTo"
  > & { id: string }
> = [
  {
    id: "machine-chest-press",
    name: "Machine Chest Press",
    imageSrc: benchPressImage,
    primaryMuscle: "Chest",
    secondaryMuscles: ["Front Delts", "Triceps"],
    howTo: [
      "Adjust the seat so handles start around chest height.",
      "Keep the ribcage stable and press without shrugging.",
      "Control the return until the handles nearly touch the stack."
    ]
  },
  {
    id: "flat-dumbbell-press",
    name: "Flat Dumbbell Press",
    imageSrc: inclineDumbbellPressImage,
    primaryMuscle: "Chest",
    secondaryMuscles: ["Front Delts", "Triceps"],
    howTo: [
      "Kick the dumbbells up with a tight upper back position.",
      "Lower with stacked wrists and elbows below the bells.",
      "Press together and up while keeping the shoulder blades set."
    ]
  }
];

// ── Exercise catalog — see catalog.ts ────────────────────────────────────────
// (allCatalogExercises is imported above; push into exerciseTemplates below)
{
  const _existingIds = new Set(exerciseTemplates.map((e) => e.id));
  exerciseTemplates.push(...allCatalogExercises.filter((e) => !_existingIds.has(e.id)));
}

const defaultState: FlowState = {
  status: "idle",
  suggestion: null,
  message: null,
  engineSource: null
};

const fallbackGuidanceTip =
  "Complete a few quality working sets first, then let RepIQ suggest the next best move.";
const fallbackGuidanceWhy =
  "RepIQ becomes more useful once it can compare today's logged work against your recent pattern. As soon as you complete enough sets, it can guide whether to hold, add reps, add load, or stay conservative based on your actual performance trend.";

const sessionDate = "2026-01-26";
const defaultWorkoutSettings: WorkoutSettings = {
  defaultRestSeconds: "90",
  transitionRestSeconds: "60",
  carryForwardDefaults: true,
  showRpe: true,
  guidanceTopStrip: false,
  guidanceInline: true,
  preferredGoal: null,
  preferredLevel: null,
  preferredEquipment: null,
};
const initialWorkoutExercises: ExerciseDraft[] = [
  exerciseLibrary[0],
  exerciseLibrary[1],
  cloneExerciseTemplate(
    exerciseTemplates.find((exercise) => exercise.id === "lat-pulldown")!,
    defaultWorkoutSettings.defaultRestSeconds,
    "seed-1"
  ),
  cloneExerciseTemplate(
    exerciseTemplates.find((exercise) => exercise.id === "seated-cable-row")!,
    defaultWorkoutSettings.defaultRestSeconds,
    "seed-2"
  ),
  cloneExerciseTemplate(
    exerciseTemplates.find((exercise) => exercise.id === "shoulder-press")!,
    defaultWorkoutSettings.defaultRestSeconds,
    "seed-3"
  )
];
const defaultWorkoutMeta: WorkoutMeta = {
  date: formatDateInputValue(new Date()),
  startTime: formatTimeFromDate(new Date()),
  startedMinutesAgo: "0",
  sessionName: "Upper Push",
  startInstant: new Date().toISOString()
};

function generateWorkoutName(exercises: ExerciseDraft[]): string {
  const hour = new Date().getHours();
  const timePrefix =
    hour < 11 ? "Morning" : hour < 14 ? "Midday" : hour < 17 ? "Afternoon" : hour < 20 ? "Evening" : "Night";

  const pushMuscles = new Set(["Chest", "Upper Chest", "Shoulders", "Triceps"]);
  const pullMuscles = new Set(["Lats", "Upper Back", "Rear Delts", "Biceps", "Traps"]);
  const legMuscles = new Set(["Quads", "Hamstrings", "Glutes", "Calves", "Adductors", "Hip Flexors"]);
  const coreMuscles = new Set(["Core", "Abs", "Obliques"]);

  const muscles = exercises.map((e) => e.primaryMuscle);

  const hasPush = muscles.some((m) => pushMuscles.has(m));
  const hasPull = muscles.some((m) => pullMuscles.has(m));
  const hasLegs = muscles.some((m) => legMuscles.has(m));
  const hasCore = muscles.some((m) => coreMuscles.has(m));

  let label: string;
  if (hasPush && hasPull && hasLegs) label = "Full Body";
  else if (hasPush && hasPull) label = "Upper Body";
  else if ((hasPush || hasPull) && hasLegs) label = "Full Body";
  else if (hasPush) label = "Upper Push";
  else if (hasPull) label = "Upper Pull";
  else if (hasLegs) label = "Legs";
  else if (hasCore) label = "Core";
  else label = "Workout";

  return `${timePrefix} ${label}`;
}

function formatSessionDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short"
  });
}

// ── Storage functions — see storage.ts ───────────────────────────────────────

// ── Age helper — always derived from DOB, never stored directly ──────────────
function getAge(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

function getTodayReadiness(): DailyReadiness | null {
  const today = new Date().toISOString().slice(0, 10);
  return getStoredDailyReadiness().find(e => e.date === today) ?? null;
}

// ── Hardcoded starter templates ──────────────────────────────────────────────

const WORKOUT_PLAN_TEMPLATES: WorkoutPlan[] = [
  // ── PPL ──
  {
    id: "template-push",
    name: "Push Day",
    tag: "Push",
    note: "Chest, shoulders and triceps",
    category: "PPL", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Chest", "Shoulders", "Triceps"], duration: 45,
    exercises: [
      { exerciseId: "bench-press", setCount: 4, restTimer: "02:00" },
      { exerciseId: "incline-dumbbell-press", setCount: 3, restTimer: "01:45" },
      { exerciseId: "shoulder-press", setCount: 3, restTimer: "01:45" },
      { exerciseId: "cable-lateral-raise", setCount: 3, restTimer: "01:00" },
      { exerciseId: "rope-pushdown", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-pull",
    name: "Pull Day",
    tag: "Pull",
    note: "Back and biceps",
    category: "PPL", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Back", "Biceps"], duration: 40,
    exercises: [
      { exerciseId: "lat-pulldown", setCount: 4, restTimer: "02:00" },
      { exerciseId: "seated-cable-row", setCount: 3, restTimer: "01:45" },
      { exerciseId: "chest-supported-row", setCount: 3, restTimer: "01:45" },
      { exerciseId: "ez-bar-curl", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-legs",
    name: "Leg Day",
    tag: "Legs",
    note: "Quads, hamstrings and glutes",
    category: "PPL", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Legs"], duration: 50,
    exercises: [
      { exerciseId: "barbell-squat", setCount: 4, restTimer: "02:30" },
      { exerciseId: "romanian-deadlift", setCount: 3, restTimer: "02:00" },
      { exerciseId: "leg-press", setCount: 3, restTimer: "02:00" },
      { exerciseId: "hamstring-curl", setCount: 3, restTimer: "01:30" },
      { exerciseId: "standing-calf-raise", setCount: 4, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  // ── Upper / Lower ──
  {
    id: "template-upper-a",
    name: "Upper Body A",
    tag: "Upper",
    note: "Chest, back and shoulders — press-focused",
    category: "Upper/Lower", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Chest", "Back", "Shoulders"], duration: 50,
    exercises: [
      { exerciseId: "bench-press", setCount: 4, restTimer: "02:00" },
      { exerciseId: "weighted-pull-up", setCount: 3, restTimer: "02:00" },
      { exerciseId: "shoulder-press", setCount: 3, restTimer: "01:45" },
      { exerciseId: "seated-cable-row", setCount: 3, restTimer: "01:30" },
      { exerciseId: "cable-lateral-raise", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-upper-b",
    name: "Upper Body B",
    tag: "Upper",
    note: "Back, chest and arms — row-focused",
    category: "Upper/Lower", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Back", "Chest", "Arms"], duration: 55,
    exercises: [
      { exerciseId: "lat-pulldown", setCount: 4, restTimer: "02:00" },
      { exerciseId: "bench-press", setCount: 3, restTimer: "02:00" },
      { exerciseId: "chest-supported-row", setCount: 3, restTimer: "01:45" },
      { exerciseId: "incline-dumbbell-press", setCount: 3, restTimer: "01:45" },
      { exerciseId: "ez-bar-curl", setCount: 3, restTimer: "01:00" },
      { exerciseId: "rope-pushdown", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-lower-a",
    name: "Lower Body A",
    tag: "Lower",
    note: "Quad-dominant — squat pattern",
    category: "Upper/Lower", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Legs", "Core"], duration: 50,
    exercises: [
      { exerciseId: "barbell-squat", setCount: 4, restTimer: "02:30" },
      { exerciseId: "leg-press", setCount: 3, restTimer: "02:00" },
      { exerciseId: "hamstring-curl", setCount: 3, restTimer: "01:30" },
      { exerciseId: "standing-calf-raise", setCount: 4, restTimer: "01:00" },
      { exerciseId: "plank", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-lower-b",
    name: "Lower Body B",
    tag: "Lower",
    note: "Hip-dominant — hinge and glute pattern",
    category: "Upper/Lower", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Legs", "Glutes"], duration: 50,
    exercises: [
      { exerciseId: "romanian-deadlift", setCount: 4, restTimer: "02:00" },
      { exerciseId: "barbell-hip-thrust", setCount: 4, restTimer: "02:00" },
      { exerciseId: "hamstring-curl", setCount: 3, restTimer: "01:30" },
      { exerciseId: "cable-hip-abduction", setCount: 3, restTimer: "01:00" },
      { exerciseId: "standing-calf-raise", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  // ── Full Body ──
  {
    id: "template-full-body-a",
    name: "Full Body A",
    tag: "Full Body",
    note: "Compound movements covering all major groups",
    category: "Full Body", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Full Body"], duration: 45,
    exercises: [
      { exerciseId: "barbell-squat", setCount: 3, restTimer: "02:30" },
      { exerciseId: "bench-press", setCount: 3, restTimer: "02:00" },
      { exerciseId: "lat-pulldown", setCount: 3, restTimer: "02:00" },
      { exerciseId: "shoulder-press", setCount: 3, restTimer: "01:45" },
      { exerciseId: "plank", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-full-body-b",
    name: "Full Body B",
    tag: "Full Body",
    note: "Deadlift + press + row pattern",
    category: "Full Body", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Full Body"], duration: 45,
    exercises: [
      { exerciseId: "romanian-deadlift", setCount: 3, restTimer: "02:00" },
      { exerciseId: "bench-press", setCount: 3, restTimer: "02:00" },
      { exerciseId: "seated-cable-row", setCount: 3, restTimer: "01:45" },
      { exerciseId: "shoulder-press", setCount: 3, restTimer: "01:45" },
      { exerciseId: "hanging-leg-raise", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-full-body-c",
    name: "Full Body C",
    tag: "Full Body",
    note: "Squat + pull-up + incline pattern",
    category: "Full Body", level: "Intermediate", equipment: "Full Gym", goal: "Strength",
    muscleGroups: ["Full Body"], duration: 50,
    exercises: [
      { exerciseId: "barbell-squat", setCount: 3, restTimer: "02:30" },
      { exerciseId: "weighted-pull-up", setCount: 3, restTimer: "02:00" },
      { exerciseId: "incline-dumbbell-press", setCount: 3, restTimer: "02:00" },
      { exerciseId: "cable-lateral-raise", setCount: 3, restTimer: "01:00" },
      { exerciseId: "back-extension", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  // ── Specialisation ──
  {
    id: "template-chest-tris",
    name: "Chest & Triceps",
    tag: "Chest",
    note: "Volume day for chest and tricep detail",
    category: "Specialisation", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Chest", "Triceps"], duration: 45,
    exercises: [
      { exerciseId: "bench-press", setCount: 4, restTimer: "02:00" },
      { exerciseId: "incline-dumbbell-press", setCount: 4, restTimer: "01:45" },
      { exerciseId: "chest-dip", setCount: 3, restTimer: "01:30" },
      { exerciseId: "rope-pushdown", setCount: 4, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-back-bis",
    name: "Back & Biceps",
    tag: "Back",
    note: "Lats, rhomboids and bicep curls",
    category: "Specialisation", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Back", "Biceps"], duration: 50,
    exercises: [
      { exerciseId: "lat-pulldown", setCount: 4, restTimer: "02:00" },
      { exerciseId: "seated-cable-row", setCount: 4, restTimer: "01:45" },
      { exerciseId: "chest-supported-row", setCount: 3, restTimer: "01:45" },
      { exerciseId: "weighted-pull-up", setCount: 3, restTimer: "02:00" },
      { exerciseId: "ez-bar-curl", setCount: 4, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-shoulders",
    name: "Shoulder Day",
    tag: "Shoulders",
    note: "Press, lateral raise and rear delt work",
    category: "Specialisation", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Shoulders"], duration: 40,
    exercises: [
      { exerciseId: "shoulder-press", setCount: 4, restTimer: "02:00" },
      { exerciseId: "cable-lateral-raise", setCount: 4, restTimer: "01:00" },
      { exerciseId: "reverse-pec-deck", setCount: 3, restTimer: "01:00" },
      { exerciseId: "dumbbell-front-raise", setCount: 3, restTimer: "01:00" },
      { exerciseId: "dumbbell-shrug", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-glutes-hams",
    name: "Glutes & Hamstrings",
    tag: "Glutes",
    note: "Hip thrust, hinge and isolation work",
    category: "Specialisation", level: "Intermediate", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Glutes", "Legs"], duration: 45,
    exercises: [
      { exerciseId: "barbell-hip-thrust", setCount: 4, restTimer: "02:00" },
      { exerciseId: "romanian-deadlift", setCount: 4, restTimer: "02:00" },
      { exerciseId: "hamstring-curl", setCount: 3, restTimer: "01:30" },
      { exerciseId: "cable-hip-abduction", setCount: 3, restTimer: "01:00" },
      { exerciseId: "back-extension", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  // ── Powerlifting ──
  {
    id: "template-pl-squat",
    name: "Squat Day",
    tag: "Powerlifting",
    note: "Competition squat with accessory work",
    category: "Powerlifting", level: "Advanced", equipment: "Full Gym", goal: "Strength",
    muscleGroups: ["Legs", "Core"], duration: 60,
    exercises: [
      { exerciseId: "barbell-squat", setCount: 5, restTimer: "03:00" },
      { exerciseId: "leg-press", setCount: 4, restTimer: "02:00" },
      { exerciseId: "hamstring-curl", setCount: 3, restTimer: "01:30" },
      { exerciseId: "back-extension", setCount: 3, restTimer: "01:00" },
      { exerciseId: "plank", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-pl-bench",
    name: "Bench Day",
    tag: "Powerlifting",
    note: "Competition bench with pressing accessories",
    category: "Powerlifting", level: "Advanced", equipment: "Full Gym", goal: "Strength",
    muscleGroups: ["Chest", "Triceps", "Shoulders"], duration: 55,
    exercises: [
      { exerciseId: "bench-press", setCount: 5, restTimer: "03:00" },
      { exerciseId: "incline-dumbbell-press", setCount: 4, restTimer: "02:00" },
      { exerciseId: "chest-dip", setCount: 3, restTimer: "01:30" },
      { exerciseId: "rope-pushdown", setCount: 4, restTimer: "01:00" },
      { exerciseId: "dumbbell-front-raise", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-pl-deadlift",
    name: "Deadlift Day",
    tag: "Powerlifting",
    note: "Hinge pattern with upper back and trap work",
    category: "Powerlifting", level: "Advanced", equipment: "Full Gym", goal: "Strength",
    muscleGroups: ["Back", "Legs"], duration: 55,
    exercises: [
      { exerciseId: "romanian-deadlift", setCount: 5, restTimer: "03:00" },
      { exerciseId: "seated-cable-row", setCount: 4, restTimer: "02:00" },
      { exerciseId: "dumbbell-shrug", setCount: 3, restTimer: "01:00" },
      { exerciseId: "back-extension", setCount: 3, restTimer: "01:00" },
      { exerciseId: "standing-calf-raise", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  // ── Minimal Equipment ──
  {
    id: "template-dumbbell-fb",
    name: "Dumbbell Full Body",
    tag: "Dumbbells",
    note: "Full body with dumbbells only",
    category: "Minimal", level: "Intermediate", equipment: "Dumbbells", goal: "Hypertrophy",
    muscleGroups: ["Full Body"], duration: 40,
    exercises: [
      { exerciseId: "incline-dumbbell-press", setCount: 3, restTimer: "01:45" },
      { exerciseId: "romanian-deadlift", setCount: 3, restTimer: "02:00" },
      { exerciseId: "dumbbell-front-raise", setCount: 3, restTimer: "01:00" },
      { exerciseId: "dumbbell-shrug", setCount: 3, restTimer: "01:00" },
      { exerciseId: "standing-calf-raise", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-bodyweight",
    name: "Bodyweight",
    tag: "Bodyweight",
    note: "No equipment needed",
    category: "Minimal", level: "Beginner", equipment: "Bodyweight", goal: "Endurance",
    muscleGroups: ["Full Body"], duration: 30,
    exercises: [
      { exerciseId: "push-up", setCount: 4, restTimer: "01:00" },
      { exerciseId: "pull-up", setCount: 4, restTimer: "01:30" },
      { exerciseId: "wall-sit", setCount: 3, restTimer: "01:00" },
      { exerciseId: "plank", setCount: 3, restTimer: "01:00" },
      { exerciseId: "hanging-leg-raise", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  // ── Beginner ──
  {
    id: "template-beginner-a",
    name: "Beginner Full Body A",
    tag: "Beginner",
    note: "Simple compound movements — day 1",
    category: "Beginner", level: "Beginner", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Full Body"], duration: 40,
    exercises: [
      { exerciseId: "barbell-squat", setCount: 3, restTimer: "02:00" },
      { exerciseId: "bench-press", setCount: 3, restTimer: "02:00" },
      { exerciseId: "lat-pulldown", setCount: 3, restTimer: "01:30" },
      { exerciseId: "shoulder-press", setCount: 3, restTimer: "01:30" },
      { exerciseId: "plank", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-beginner-b",
    name: "Beginner Full Body B",
    tag: "Beginner",
    note: "Machine-friendly — day 2",
    category: "Beginner", level: "Beginner", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Full Body"], duration: 40,
    exercises: [
      { exerciseId: "leg-press", setCount: 3, restTimer: "02:00" },
      { exerciseId: "chest-dip", setCount: 3, restTimer: "01:30" },
      { exerciseId: "seated-cable-row", setCount: 3, restTimer: "01:30" },
      { exerciseId: "cable-lateral-raise", setCount: 3, restTimer: "01:00" },
      { exerciseId: "back-extension", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  },
  {
    id: "template-beginner-c",
    name: "Beginner Full Body C",
    tag: "Beginner",
    note: "Bodyweight + free weights — day 3",
    category: "Beginner", level: "Beginner", equipment: "Full Gym", goal: "Hypertrophy",
    muscleGroups: ["Full Body"], duration: 40,
    exercises: [
      { exerciseId: "romanian-deadlift", setCount: 3, restTimer: "02:00" },
      { exerciseId: "push-up", setCount: 3, restTimer: "01:00" },
      { exerciseId: "pull-up", setCount: 3, restTimer: "01:30" },
      { exerciseId: "shoulder-press", setCount: 3, restTimer: "01:30" },
      { exerciseId: "standing-calf-raise", setCount: 3, restTimer: "01:00" }
    ],
    createdAt: "", updatedAt: ""
  }
];

function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  const stored = window.localStorage.getItem(themeStorageKey);
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "system";
}

function getStoredWorkoutSettings(): WorkoutSettings {
  if (typeof window === "undefined") {
    return defaultWorkoutSettings;
  }

  try {
    const raw = window.localStorage.getItem(workoutSettingsStorageKey);
    if (!raw) {
      return defaultWorkoutSettings;
    }

    const parsed = JSON.parse(raw) as Partial<WorkoutSettings>;
    return {
      defaultRestSeconds:
        typeof parsed.defaultRestSeconds === "string"
          ? sanitizeIntegerInput(parsed.defaultRestSeconds)
          : defaultWorkoutSettings.defaultRestSeconds,
      transitionRestSeconds:
        typeof parsed.transitionRestSeconds === "string"
          ? sanitizeIntegerInput(parsed.transitionRestSeconds)
          : defaultWorkoutSettings.transitionRestSeconds,
      carryForwardDefaults:
        typeof parsed.carryForwardDefaults === "boolean"
          ? parsed.carryForwardDefaults
          : defaultWorkoutSettings.carryForwardDefaults,
      showRpe:
        typeof parsed.showRpe === "boolean" ? parsed.showRpe : defaultWorkoutSettings.showRpe,
      guidanceTopStrip:
        typeof parsed.guidanceTopStrip === "boolean"
          ? parsed.guidanceTopStrip
          : defaultWorkoutSettings.guidanceTopStrip,
      guidanceInline:
        typeof parsed.guidanceInline === "boolean"
          ? parsed.guidanceInline
          : defaultWorkoutSettings.guidanceInline,
      preferredGoal: typeof parsed.preferredGoal === "string" ? parsed.preferredGoal : null,
      preferredLevel: typeof parsed.preferredLevel === "string" ? parsed.preferredLevel : null,
      preferredEquipment: typeof parsed.preferredEquipment === "string" ? parsed.preferredEquipment : null,
    };
  } catch {
    return defaultWorkoutSettings;
  }
}

function getStoredCustomExercises(): ExerciseDraft[] {
  if (typeof window === "undefined") {
    return seededCustomExercises.map((exercise) => cloneExerciseDraft(exercise));
  }

  try {
    const raw = window.localStorage.getItem(customExercisesStorageKey);
    if (!raw) {
      return seededCustomExercises.map((exercise) => cloneExerciseDraft(exercise));
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return seededCustomExercises.map((exercise) => cloneExerciseDraft(exercise));
    }

    if (parsed.length === 0) {
      return seededCustomExercises.map((exercise) => cloneExerciseDraft(exercise));
    }

    return parsed
      .filter(
        (exercise): exercise is ExerciseDraft =>
          Boolean(exercise) &&
          typeof exercise.id === "string" &&
          typeof exercise.name === "string" &&
          typeof exercise.restTimer === "string" &&
          typeof exercise.primaryMuscle === "string" &&
          Array.isArray(exercise.secondaryMuscles) &&
          Array.isArray(exercise.howTo) &&
          Array.isArray(exercise.history) &&
          Array.isArray(exercise.draftSets)
      )
      .map((exercise) =>
        cloneExerciseDraft(exercise, {
          isCustom: true,
          libraryStatus: exercise.libraryStatus === "archived" ? "archived" : "active",
          imageSrc:
            typeof exercise.imageSrc === "string" && exercise.imageSrc.length > 0
              ? exercise.imageSrc
              : genericExerciseImage
        })
      );
  } catch {
    return seededCustomExercises.map((exercise) => cloneExerciseDraft(exercise));
  }
}

function getSystemTheme(): Exclude<ThemePreference, "system"> {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getExerciseMeasurementType(exercise: ExerciseDraft): MeasurementType {
  if (exercise.measurementType) {
    return exercise.measurementType;
  }

  const name = exercise.name.toLowerCase();

  // Only match exercises that are genuinely timed (holds / cardio machines / stretches).
  // "walk" removed — it false-positives on Walking Lunge, Banded Lateral Walk, etc.
  if (/\b(run|bike|cycle|elliptical|rower|stair|stretch|mobility|yoga)\b/.test(name)) {
    return "timed";
  }

  // Planks and holds are timed, but NOT "crunch", "lunge", "walk" etc.
  if (/\bplank\b/.test(name) || /\bhold\b/.test(name)) {
    return "timed";
  }

  const exerciseType = inferExerciseType(exercise);
  if (exerciseType === "freestyle_cardio") {
    return "timed";
  }

  return "reps_volume";
}

function getPrimaryMuscles(exercise: Pick<ExerciseDraft, "primaryMuscle" | "primaryMuscles">) {
  return exercise.primaryMuscles && exercise.primaryMuscles.length > 0
    ? exercise.primaryMuscles
    : [exercise.primaryMuscle];
}

function formatPrimaryMuscles(exercise: Pick<ExerciseDraft, "primaryMuscle" | "primaryMuscles">) {
  return getPrimaryMuscles(exercise).join(", ");
}

function usesWeightInputForMeasurement(measurementType: MeasurementType) {
  return measurementType !== "timed";
}

function usesTimedMetric(measurementType: MeasurementType) {
  return measurementType === "timed" || measurementType === "weight_timed";
}

function getMeasurementColumnLabels(measurementType: MeasurementType) {
  return {
    first: usesWeightInputForMeasurement(measurementType) ? "Kg" : "—",
    second: usesTimedMetric(measurementType) ? "Time" : "Reps"
  };
}

function formatMeasurementValue(value: number, measurementType: MeasurementType) {
  if (usesTimedMetric(measurementType)) {
    return `${value}s`;
  }

  return String(value);
}

function formatPreviousSet(set: WorkoutSet | undefined, measurementType: MeasurementType = "reps_volume") {
  if (!set) {
    return "";
  }

  if (measurementType === "timed") {
    return formatMeasurementValue(set.reps, measurementType);
  }

  if (measurementType === "weight_timed") {
    return `${set.weight}kg x ${formatMeasurementValue(set.reps, measurementType)}`;
  }

  return `${set.weight}kg x ${set.reps}`;
}

function getSupersetAccent(groupId?: string | null) {
  if (!groupId) {
    return null;
  }

  const total = Array.from(groupId).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return supersetPalette[total % supersetPalette.length];
}

function formatRestTimer(secondsInput: string) {
  const totalSeconds = Math.max(0, Number(secondsInput || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${padTimeSegment(minutes % 60)}:${padTimeSegment(seconds)}`;
  }

  return `${padTimeSegment(minutes)}:${padTimeSegment(seconds)}`;
}

function padTimeSegment(value: number) {
  return String(value).padStart(2, "0");
}

function formatTimeFromDate(date: Date) {
  return `${padTimeSegment(date.getHours())}:${padTimeSegment(date.getMinutes())}`;
}

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = padTimeSegment(date.getMonth() + 1);
  const day = padTimeSegment(date.getDate());
  return `${year}-${month}-${day}`;
}

function buildDateTime(date: string, time: string) {
  if (!date || !time) {
    return null;
  }

  const parsed = new Date(`${date}T${time}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getMinutesAgoFromDateTime(date: string, time: string) {
  const start = buildDateTime(date, time);
  if (!start) {
    return "";
  }

  const diffMs = Date.now() - start.getTime();
  return String(Math.max(0, Math.round(diffMs / 60000)));
}

function getDateAndTimeFromMinutesAgo(minutesAgoInput: string) {
  const minutesAgo = Number(minutesAgoInput || 0);
  const start = new Date(Date.now() - Math.max(0, minutesAgo) * 60000);

  return {
    date: formatDateInputValue(start),
    startTime: formatTimeFromDate(start),
    startInstant: start.toISOString()
  };
}

function formatMinutesSecondsInput(value: string) {
  const digits = value.replace(/[^\d]/g, "").slice(-4);

  if (!digits) {
    return "";
  }

  if (digits.length <= 2) {
    return `00:${digits.padStart(2, "0")}`;
  }

  const minutes = digits.slice(0, -2).padStart(2, "0");
  const seconds = digits.slice(-2);
  return `${minutes}:${seconds}`;
}

function formatElapsedDuration(date: string, time: string, startInstant?: string) {
  const instantStart =
    typeof startInstant === "string" && startInstant
      ? new Date(startInstant)
      : null;
  const start =
    instantStart && !Number.isNaN(instantStart.getTime())
      ? instantStart
      : buildDateTime(date, time);
  if (!start) {
    return "00:00";
  }

  const elapsedSeconds = Math.max(0, Math.round((Date.now() - start.getTime()) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  if (hours > 0) {
    return `${hours}:${padTimeSegment(minutes)}:${padTimeSegment(seconds)}`;
  }

  return `${minutes}:${padTimeSegment(seconds)}`;
}

function parseMinutesSecondsToSeconds(value: string) {
  const [minutesText, secondsText] = value.split(":");
  const minutes = Number(minutesText);
  const seconds = Number(secondsText);

  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return 0;
  }

  return Math.max(0, minutes * 60 + seconds);
}

function formatRemainingSeconds(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${padTimeSegment(minutes)}:${padTimeSegment(seconds)}`;
}

function shiftIsoDateByDays(date: string, deltaDays: number) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  parsed.setDate(parsed.getDate() + deltaDays);
  return parsed.toISOString().slice(0, 10);
}

function createDerivedHistorySession(
  session: ExerciseHistorySession,
  exerciseName: string,
  sessionKey: string,
  date: string
): ExerciseHistorySession {
  return {
    ...session,
    date,
    exercise: exerciseName,
    session_key: sessionKey,
    sets: session.sets.map((set) => ({
      ...set,
      weight: Number((set.weight * 0.9).toFixed(1)),
      reps: Math.max(1, set.reps - 1),
      rpe: typeof set.rpe === "number" ? Math.max(5, set.rpe - 0.5) : set.rpe
    }))
  };
}

function normalizeExerciseHistory(
  history: ExerciseHistorySession[],
  exerciseName: string,
  historyKeyBase: string
) {
  const clonedHistory: ExerciseHistorySession[] = history.map((session) => ({
    ...session,
    exercise: exerciseName,
    sets: session.sets.map((set) => ({ ...set }))
  }));

  if (clonedHistory.length === 0 || clonedHistory.length >= 3) {
    return clonedHistory;
  }

  while (clonedHistory.length < 3) {
    const earliestSession = clonedHistory[0];
    clonedHistory.unshift(
      createDerivedHistorySession(
        earliestSession,
        exerciseName,
        `${historyKeyBase}-history-${clonedHistory.length + 1}`,
        shiftIsoDateByDays(earliestSession.date, -7)
      )
    );
  }

  return clonedHistory;
}

function cloneExerciseTemplate(template: ExerciseDraft, restSeconds: string, suffix: string): ExerciseDraft {
  return {
    ...template,
    id: `${template.id}-${suffix}`,
    note: "",
    stickyNoteEnabled: template.stickyNoteEnabled ?? false,
    restTimer: formatRestTimer(restSeconds),
    supersetGroupId: null,
    primaryMuscles: template.primaryMuscles ? [...template.primaryMuscles] : [template.primaryMuscle],
    secondaryMuscles: [...template.secondaryMuscles],
    howTo: [...template.howTo],
    history: normalizeExerciseHistory(template.history, template.name, template.id),
    draftSets: template.draftSets.map((set, index) => ({
      ...set,
      id: `${template.id}-${suffix}-set-${index + 1}`,
      weightInput: "",
      repsInput: "",
      rpeInput: "",
      done: false,
      failed: false
    }))
  };
}

function cloneExerciseDraft(
  exercise: ExerciseDraft,
  overrides?: Partial<ExerciseDraft>
): ExerciseDraft {
  const resolvedPrimaryMuscles = overrides?.primaryMuscles ?? exercise.primaryMuscles ?? [exercise.primaryMuscle];
  return {
    ...exercise,
    ...overrides,
    stickyNoteEnabled: overrides?.stickyNoteEnabled ?? exercise.stickyNoteEnabled ?? false,
    primaryMuscles: [...resolvedPrimaryMuscles],
    secondaryMuscles: [...(overrides?.secondaryMuscles ?? exercise.secondaryMuscles)],
    howTo: [...(overrides?.howTo ?? exercise.howTo)],
    history: normalizeExerciseHistory(
      exercise.history,
      overrides?.name ?? exercise.name,
      overrides?.id ?? exercise.id
    ),
    draftSets: exercise.draftSets.map((set) => ({ ...set }))
  };
}

function buildInitialWorkoutExercises(restDefaults: ExerciseRestDefaults) {
  return initialWorkoutExercises.map((exercise) =>
    cloneExerciseDraft(exercise, {
      restTimer: restDefaults[exercise.name] ?? exercise.restTimer
    })
  );
}

function sanitizeDecimalInput(value: string) {
  const stripped = value.replace(/[^\d.]/g, "");
  const [head, ...rest] = stripped.split(".");
  return rest.length > 0 ? `${head}.${rest.join("")}` : head;
}

function sanitizeIntegerInput(value: string) {
  return value.replace(/[^\d]/g, "");
}

function parseNumberInput(input: string, fallback?: number | null) {
  if (input.trim() === "") {
    return fallback ?? null;
  }
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : fallback ?? null;
}

function normalizeSetType(value?: string): DraftSetType {
  return setTypeOptions.some((option) => option.value === value)
    ? (value as DraftSetType)
    : "normal";
}

function getSetTypeOccurrence(draftSets: DraftSet[], index: number) {
  const currentType = draftSets[index]?.setType;
  return draftSets.slice(0, index + 1).filter((set) => set.setType === currentType).length;
}

function getDisplaySetLabel(draftSets: DraftSet[], index: number) {
  const setType = draftSets[index]?.setType;
  if (setType === "normal") {
    return String(
      draftSets.slice(0, index + 1).filter((set) => set.setType === "normal").length
    );
  }

  return setTypeOptions.find((option) => option.value === setType)?.symbol ?? "W";
}

function getPreviousReferenceSet(
  draftSets: DraftSet[],
  index: number,
  lastSession: ExerciseHistorySession | undefined
) {
  if (!lastSession) return undefined;
  const draftType = draftSets[index]?.setType;
  const targetOccurrence = getSetTypeOccurrence(draftSets, index);
  const matchingSets = lastSession.sets.filter(
    (set) => normalizeSetType(set.set_type) === draftType
  );

  return matchingSets[targetOccurrence - 1];
}

function getCurrentExerciseCarrySource(
  draftSets: DraftSet[],
  index: number
): DraftSet | null {
  for (let currentIndex = index - 1; currentIndex >= 0; currentIndex -= 1) {
    const candidate = draftSets[currentIndex];
    if (
      candidate.weightInput.trim().length > 0 ||
      candidate.repsInput.trim().length > 0 ||
      candidate.rpeInput.trim().length > 0 ||
      candidate.done
    ) {
      return candidate;
    }
  }

  return null;
}

function normalizeSupersetGroups(exercises: ExerciseDraft[]) {
  const counts = new Map<string, number>();

  exercises.forEach((exercise) => {
    if (exercise.supersetGroupId) {
      counts.set(
        exercise.supersetGroupId,
        (counts.get(exercise.supersetGroupId) ?? 0) + 1
      );
    }
  });

  return exercises.map((exercise) =>
    exercise.supersetGroupId && (counts.get(exercise.supersetGroupId) ?? 0) < 2
      ? { ...exercise, supersetGroupId: null }
      : exercise
  );
}

function buildCompletedSets(
  draftSets: DraftSet[],
  lastSession: ExerciseHistorySession | undefined,
  carryForwardDefaults: boolean,
  measurementType: MeasurementType = "reps_volume"
) {
  const resolvedSets: WorkoutSet[] = [];
  const issues: string[] = [];

  draftSets.forEach((draftSet, index) => {
    if (!draftSet.done) {
      return;
    }

    const previousSet = getPreviousReferenceSet(draftSets, index, lastSession);
    const weight = usesWeightInputForMeasurement(measurementType)
      ? parseNumberInput(
          draftSet.weightInput,
          carryForwardDefaults ? previousSet?.weight : null
        )
      : 0;
    const reps = parseNumberInput(
      draftSet.repsInput,
      carryForwardDefaults ? previousSet?.reps : null
    );
    const rpe = parseNumberInput(
      draftSet.rpeInput,
      carryForwardDefaults ? previousSet?.rpe ?? null : null
    );

    if (reps === null || (usesWeightInputForMeasurement(measurementType) && weight === null)) {
      issues.push(
        `Set ${getDisplaySetLabel(draftSets, index)} needs ${
          usesWeightInputForMeasurement(measurementType)
            ? usesTimedMetric(measurementType)
              ? "weight and time."
              : "weight and reps."
            : "time."
        }`
      );
      return;
    }

    resolvedSets.push({
      weight: weight ?? 0,
      reps: Math.round(reps),
      set_type: draftSet.setType,
      rpe,
      failed: draftSet.failed
    });
  });

  return { resolvedSets, issues };
}

function isExerciseComplete(exercise: ExerciseDraft) {
  return exercise.draftSets.length > 0 && exercise.draftSets[exercise.draftSets.length - 1]?.done === true;
}

function isExerciseStarted(exercise: ExerciseDraft) {
  return exercise.draftSets.some((set) => set.done);
}

function isExerciseInProgress(exercise: ExerciseDraft) {
  return isExerciseStarted(exercise) && !isExerciseComplete(exercise);
}

function isInteractiveSwipeTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("input, button, label, summary"));
}

function estimateOneRm(set?: WorkoutSet) {
  if (!set) {
    return 0;
  }
  return Math.round(set.weight * (1 + set.reps / 30));
}

function resolveDraftSet(
  draftSets: DraftSet[],
  index: number,
  lastSession: ExerciseHistorySession | undefined,
  carryForwardDefaults: boolean,
  measurementType: MeasurementType = "reps_volume"
) {
  const draftSet = draftSets[index];
  const previousSet = getPreviousReferenceSet(draftSets, index, lastSession);
  const weight = usesWeightInputForMeasurement(measurementType)
    ? parseNumberInput(
        draftSet.weightInput,
        carryForwardDefaults ? previousSet?.weight : null
      )
    : 0;
  const reps = parseNumberInput(
    draftSet.repsInput,
    carryForwardDefaults ? previousSet?.reps : null
  );
  const rpe = parseNumberInput(
    draftSet.rpeInput,
    carryForwardDefaults ? previousSet?.rpe ?? null : null
  );

  if (reps === null || (usesWeightInputForMeasurement(measurementType) && weight === null)) {
    return null;
  }

  return {
    weight: weight ?? 0,
    reps: Math.round(reps),
    set_type: draftSet.setType,
    rpe,
    failed: draftSet.failed
  } satisfies WorkoutSet;
}

function sumSessionVolume(sets: WorkoutSet[]) {
  return sets.reduce((total, set) => total + set.weight * set.reps, 0);
}

function buildSetRewards(
  exercise: ExerciseDraft,
  draftSet: DraftSet,
  resolvedSet: WorkoutSet,
  benchmarkSets: WorkoutSet[]
): LoggerReward[] {
  if (benchmarkSets.length === 0) {
    return [];
  }

  const rewards: LoggerReward[] = [];
  const maxHistoricalWeight = Math.max(...benchmarkSets.map((set) => set.weight), 0);
  const maxHistoricalOneRm = Math.max(...benchmarkSets.map((set) => estimateOneRm(set)), 0);
  const maxSameWeightReps = Math.max(
    0,
    ...benchmarkSets
      .filter((set) => set.weight === resolvedSet.weight)
      .map((set) => set.reps)
  );

  if (resolvedSet.weight > maxHistoricalWeight) {
    rewards.push({
      id: `${exercise.id}:${draftSet.id}:max-weight:${resolvedSet.weight}`,
      exerciseId: exercise.id,
      setId: draftSet.id,
      category: "pr",
      level: "set",
      shortLabel: "Max Wt",
      detail: `${exercise.name}: ${resolvedSet.weight} kg is your new heaviest completed set.`
    });
  }

  if (resolvedSet.reps > maxSameWeightReps && maxSameWeightReps > 0) {
    rewards.push({
      id: `${exercise.id}:${draftSet.id}:rep-pr:${resolvedSet.weight}:${resolvedSet.reps}`,
      exerciseId: exercise.id,
      setId: draftSet.id,
      category: "pr",
      level: "set",
      shortLabel: "Rep PR",
      detail: `${exercise.name}: ${resolvedSet.weight} kg x ${resolvedSet.reps} beats your best rep count at this load.`
    });
  }

  const estimatedOneRm = estimateOneRm(resolvedSet);
  if (estimatedOneRm > maxHistoricalOneRm) {
    rewards.push({
      id: `${exercise.id}:${draftSet.id}:one-rm:${estimatedOneRm}`,
      exerciseId: exercise.id,
      setId: draftSet.id,
      category: "pr",
      level: "set",
      shortLabel: "1RM PR",
      detail: `${exercise.name}: estimated 1RM is now ${estimatedOneRm} kg.`
    });
  }

  return rewards;
}

function buildExerciseRewards(
  exercise: ExerciseDraft,
  completedSets: WorkoutSet[]
): LoggerReward[] {
  if (completedSets.length === 0) {
    return [];
  }

  const currentVolume = sumSessionVolume(completedSets);
  const maxHistoricalVolume = Math.max(
    ...exercise.history.map((session) => sumSessionVolume(session.sets)),
    0
  );

  if (currentVolume > maxHistoricalVolume) {
    return [
      {
        id: `${exercise.id}:best-volume:${currentVolume}`,
        exerciseId: exercise.id,
        setId: null,
        category: "volume",
        level: "exercise",
        shortLabel: "Best Vol",
        detail: `${exercise.name}: ${currentVolume.toFixed(0)} kg is your best logged volume for this exercise.`
      }
    ];
  }

  return [];
}

function recomputeLoggerRewards(
  exercises: ExerciseDraft[],
  carryForwardDefaults: boolean
): LoggerReward[] {
  const latestRewards = new Map<string, LoggerReward>();

  exercises.forEach((exercise) => {
    const lastSession = exercise.history[exercise.history.length - 1];
    const historicalSets = exercise.history.flatMap((session) => session.sets);
    const completedSetsInWorkout: WorkoutSet[] = [];

    exercise.draftSets.forEach((draftSet, index) => {
      if (!draftSet.done) {
        return;
      }

      const resolvedSet = resolveDraftSet(
        exercise.draftSets,
        index,
        lastSession,
        carryForwardDefaults,
        getExerciseMeasurementType(exercise)
      );

      if (!resolvedSet) {
        return;
      }

      const setRewards = buildSetRewards(
        exercise,
        draftSet,
        resolvedSet,
        [...historicalSets, ...completedSetsInWorkout]
      );

      setRewards.forEach((reward) => {
        latestRewards.set(
          `${exercise.id}:${reward.level}:${reward.shortLabel}`,
          reward
        );
      });

      completedSetsInWorkout.push(resolvedSet);
    });

    const isExerciseComplete =
      exercise.draftSets.length > 0 && exercise.draftSets.every((draftSet) => draftSet.done);

    if (!isExerciseComplete || completedSetsInWorkout.length === 0) {
      return;
    }

    buildExerciseRewards(exercise, completedSetsInWorkout).forEach((reward) => {
      latestRewards.set(`${exercise.id}:${reward.level}:${reward.shortLabel}`, reward);
    });
  });

  return Array.from(latestRewards.values());
}

function buildSparkline(values: number[], width = 260, height = 92) {
  if (values.length === 0) {
    return "";
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * (height - 16) - 8;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function buildMuscleSpread(exercises: ExerciseDraft[]) {
  const counts = new Map<string, number>();

  exercises.forEach((exercise) => {
    counts.set(exercise.primaryMuscle, (counts.get(exercise.primaryMuscle) ?? 0) + 2);
    exercise.secondaryMuscles.forEach((muscle) => {
      counts.set(muscle, (counts.get(muscle) ?? 0) + 1);
    });
  });

  return [...counts.entries()]
    .map(([muscle, score]) => ({ muscle, score }))
    .sort((left, right) => right.score - left.score || left.muscle.localeCompare(right.muscle));
}

function buildMuscleRegionScores(exercises: ExerciseDraft[]) {
  const scores = new Map<MuscleRegion, number>();

  const applyContribution = (muscleName: string, weight: number) => {
    const mapping = muscleContributionMap[muscleName];
    if (!mapping) {
      return;
    }

    Object.entries(mapping).forEach(([region, regionWeight]) => {
      if (!regionWeight) {
        return;
      }
      const key = region as MuscleRegion;
      scores.set(key, (scores.get(key) ?? 0) + regionWeight * weight);
    });
  };

  exercises.forEach((exercise) => {
    applyContribution(exercise.primaryMuscle, 3);
    exercise.secondaryMuscles.forEach((muscle) => applyContribution(muscle, 1.5));
  });

  return scores;
}

function getMuscleTone(score: number, maxScore: number) {
  if (score <= 0 || maxScore <= 0) {
    return "var(--surface-alt)";
  }

  const ratio = score / maxScore;
  if (ratio >= 0.72) {
    return muscleMapPalette[2];
  }
  if (ratio >= 0.38) {
    return muscleMapPalette[1];
  }
  return muscleMapPalette[0];
}

type ExerciseInsight = {
  headline: string;
  detail: string;
  tone: "positive" | "neutral" | "warning";
};

function buildExerciseInsight(
  weightTrend: number[],
  volumeTrend: number[],
  oneRmTrend: number[]
): ExerciseInsight | null {
  const n = weightTrend.length;
  if (n < 2) return null;

  const lastWeight = weightTrend[n - 1];
  const maxWeight = Math.max(...weightTrend);
  const previousMaxWeight = Math.max(...weightTrend.slice(0, -1));
  const lastVolume = volumeTrend[n - 1];
  const avgVolume = volumeTrend.reduce((a, b) => a + b, 0) / n;
  const lastOneRm = oneRmTrend[n - 1];
  const previousMaxOneRm = Math.max(...oneRmTrend.slice(0, -1));

  // 1RM hit all-time best last session
  if (lastOneRm > 0 && lastOneRm > previousMaxOneRm && n >= 3) {
    return {
      headline: "Estimated 1RM at all-time best",
      detail: `Your best working set puts your 1RM at ${lastOneRm.toFixed(0)} kg — the highest recorded here.`,
      tone: "positive"
    };
  }

  // Weight hit new high last session
  if (lastWeight > 0 && lastWeight > previousMaxWeight && n >= 2) {
    return {
      headline: "New weight high last session",
      detail: `You moved ${lastWeight} kg — the heaviest logged for this exercise.`,
      tone: "positive"
    };
  }

  if (n >= 3) {
    const recent = weightTrend.slice(-3);
    const nonZero = recent.filter((w) => w > 0);

    // Weight climbing 3 sessions in a row
    if (nonZero.length === 3 && recent[2] > recent[1] && recent[1] >= recent[0]) {
      const gain = recent[2] - recent[0];
      return {
        headline: "Weight climbing consistently",
        detail: `Up ${gain.toFixed(1)} kg across your last 3 sessions — keep the overload going.`,
        tone: "positive"
      };
    }

    // Weight falling 3 sessions in a row
    if (nonZero.length === 3 && recent[2] < recent[1] && recent[1] <= recent[0]) {
      const drop = recent[0] - recent[2];
      return {
        headline: "Weight has been dropping",
        detail: `Down ${drop.toFixed(1)} kg over your last 3 sessions — a recovery week or form check may help.`,
        tone: "warning"
      };
    }

    // Weight flat (within 2.5 kg) for 3 sessions
    if (nonZero.length === 3 && Math.max(...nonZero) - Math.min(...nonZero) <= 2.5 && lastWeight > 0) {
      return {
        headline: "Weight has been steady",
        detail: `Holding around ${lastWeight} kg for 3 sessions — try adding a rep or a small load increase.`,
        tone: "neutral"
      };
    }
  }

  // Last session volume notably below average
  if (n >= 3 && lastVolume > 0 && avgVolume > 0 && lastVolume < avgVolume * 0.78) {
    return {
      headline: "Volume was lower last session",
      detail: `Last session: ${lastVolume.toFixed(0)} kg total — below your usual average of ${avgVolume.toFixed(0)} kg.`,
      tone: "warning"
    };
  }

  // Default: where they stand
  if (lastWeight > 0) {
    return {
      headline: "Keep building",
      detail: `Your heaviest logged is ${maxWeight} kg. Log consistently to unlock trend insights.`,
      tone: "neutral"
    };
  }

  return null;
}

function buildMuscleEngagementCopy(exercise: ExerciseDraft) {
  const secondary = exercise.secondaryMuscles.join(", ");

  return [
    `${exercise.name} mainly loads your ${exercise.primaryMuscle.toLowerCase()} while your ${secondary.toLowerCase()} support the movement and help you stay in a strong position.`,
    `The main training effect should come from feeling the ${exercise.primaryMuscle.toLowerCase()} do most of the work instead of letting stronger compensations take over.`,
    `If the setup and path are right, the ${exercise.primaryMuscle.toLowerCase()} should stay under tension while the secondary muscles assist with stability, control, and finish.`
  ];
}

function BodyMapPair({
  title,
  subtitle,
  scores
}: {
  title: string;
  subtitle: string;
  scores: Map<MuscleRegion, number>;
}) {
  const maxScore = Math.max(...scores.values(), 0);

  return (
    <article className="body-map-panel">
      <div className="body-map-copy">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <div className="body-map-figures">
        <svg viewBox="0 0 120 220" className="body-map-svg" aria-label={`${title} front view`}>
          <circle cx="60" cy="18" r="12" fill="var(--surface)" stroke="var(--line)" />
          <rect x="46" y="32" width="28" height="28" rx="12" fill="var(--surface)" />
          <rect x="38" y="52" width="44" height="26" rx="12" fill={getMuscleTone(scores.get("chest") ?? 0, maxScore)} />
          <ellipse cx="36" cy="48" rx="10" ry="12" fill={getMuscleTone(scores.get("frontDelts") ?? 0, maxScore)} />
          <ellipse cx="84" cy="48" rx="10" ry="12" fill={getMuscleTone(scores.get("frontDelts") ?? 0, maxScore)} />
          <ellipse cx="32" cy="66" rx="8" ry="12" fill={getMuscleTone(scores.get("biceps") ?? 0, maxScore)} />
          <ellipse cx="88" cy="66" rx="8" ry="12" fill={getMuscleTone(scores.get("biceps") ?? 0, maxScore)} />
          <rect x="46" y="78" width="28" height="32" rx="12" fill="var(--surface)" />
          <rect x="44" y="110" width="12" height="52" rx="10" fill={getMuscleTone(scores.get("quads") ?? 0, maxScore)} />
          <rect x="64" y="110" width="12" height="52" rx="10" fill={getMuscleTone(scores.get("quads") ?? 0, maxScore)} />
          <path d="M60 108 L68 146 L60 166 L52 146 Z" fill={getMuscleTone(scores.get("adductors") ?? 0, maxScore)} />
          <rect x="44" y="164" width="10" height="34" rx="8" fill={getMuscleTone(scores.get("calves") ?? 0, maxScore)} />
          <rect x="66" y="164" width="10" height="34" rx="8" fill={getMuscleTone(scores.get("calves") ?? 0, maxScore)} />
        </svg>

        <svg viewBox="0 0 120 220" className="body-map-svg" aria-label={`${title} back view`}>
          <circle cx="60" cy="18" r="12" fill="var(--surface)" stroke="var(--line)" />
          <rect x="46" y="32" width="28" height="28" rx="12" fill="var(--surface)" />
          <ellipse cx="36" cy="48" rx="10" ry="12" fill={getMuscleTone(scores.get("rearDelts") ?? 0, maxScore)} />
          <ellipse cx="84" cy="48" rx="10" ry="12" fill={getMuscleTone(scores.get("rearDelts") ?? 0, maxScore)} />
          <ellipse cx="30" cy="66" rx="8" ry="12" fill={getMuscleTone(scores.get("triceps") ?? 0, maxScore)} />
          <ellipse cx="90" cy="66" rx="8" ry="12" fill={getMuscleTone(scores.get("triceps") ?? 0, maxScore)} />
          <rect x="42" y="52" width="36" height="26" rx="12" fill={getMuscleTone(scores.get("upperBack") ?? 0, maxScore)} />
          <path d="M42 70 C34 80 34 100 44 110 L52 110 L52 74 Z" fill={getMuscleTone(scores.get("lats") ?? 0, maxScore)} />
          <path d="M78 70 C86 80 86 100 76 110 L68 110 L68 74 Z" fill={getMuscleTone(scores.get("lats") ?? 0, maxScore)} />
          <rect x="48" y="82" width="24" height="22" rx="10" fill={getMuscleTone(scores.get("lowerBack") ?? 0, maxScore)} />
          <ellipse cx="52" cy="118" rx="10" ry="12" fill={getMuscleTone(scores.get("glutes") ?? 0, maxScore)} />
          <ellipse cx="68" cy="118" rx="10" ry="12" fill={getMuscleTone(scores.get("glutes") ?? 0, maxScore)} />
          <rect x="44" y="128" width="12" height="42" rx="10" fill={getMuscleTone(scores.get("hamstrings") ?? 0, maxScore)} />
          <rect x="64" y="128" width="12" height="42" rx="10" fill={getMuscleTone(scores.get("hamstrings") ?? 0, maxScore)} />
          <rect x="44" y="172" width="10" height="30" rx="8" fill={getMuscleTone(scores.get("calves") ?? 0, maxScore)} />
          <rect x="66" y="172" width="10" height="30" rx="8" fill={getMuscleTone(scores.get("calves") ?? 0, maxScore)} />
        </svg>
      </div>
    </article>
  );
}

// ── Active workout tray ───────────────────────────────────────────────────────

function ActiveWorkoutTray({
  sessionName,
  duration,
  onResume,
  onDiscardRequest
}: {
  sessionName: string;
  duration: string;
  onResume: () => void;
  onDiscardRequest: () => void;
}) {
  return (
    <div className="active-tray">
      <div className="active-tray-bar">
        <div className="active-tray-info">
          <span className="active-tray-dot" aria-hidden="true" />
          <div className="active-tray-text">
            <span className="active-tray-name">{sessionName}</span>
            <span className="active-tray-timer">{duration}</span>
          </div>
        </div>
        <div className="active-tray-actions">
          <button
            className="active-tray-ghost-btn"
            type="button"
            aria-label="Discard workout"
            onClick={onDiscardRequest}
          >
            Discard
          </button>
          <button
            className="active-tray-resume-btn"
            type="button"
            aria-label="Resume workout"
            onClick={onResume}
          >
            Resume
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Planner ───────────────────────────────────────────────────────────────────

const PLAN_TAG_OPTIONS = ["Push", "Pull", "Legs", "Upper", "Lower", "Full Body", "Home", "Machines"];
function planMusclePreview(plan: WorkoutPlan, library: ExerciseDraft[]): string {
  const muscles = new Set<string>();
  for (const pe of plan.exercises.slice(0, 5)) {
    const ex = library.find((e) => e.id === pe.exerciseId);
    if (ex) muscles.add(ex.primaryMuscle);
  }
  return [...muscles].slice(0, 3).join(" · ");
}

function getExistingUserTags(plans: WorkoutPlan[]): string[] {
  // Most recently updated plans first, latest-added tags first within each plan
  const sorted = [...plans].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const plan of sorted) {
    for (const tag of [...(plan.userTags ?? [])].reverse()) {
      if (tag && !seen.has(tag)) { seen.add(tag); result.push(tag); }
    }
  }
  return result;
}

function buildBlankWorkoutPlan(): WorkoutPlan {
  const now = new Date().toISOString();
  return {
    id: `plan-${Date.now()}`,
    name: "",
    tag: "",
    userTags: [],
    note: "",
    exercises: [],
    createdAt: now,
    updatedAt: now
  };
}

function normalizePlanForComparison(plan: WorkoutPlan) {
  return {
    name: plan.name.trim(),
    tag: plan.tag?.trim() ?? "",
    userTags: [...(plan.userTags ?? [])].sort(),
    note: plan.note?.trim() ?? "",
    exercises: plan.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      setCount: exercise.setCount,
      restTimer: exercise.restTimer,
      note: exercise.note?.trim() ?? ""
    }))
  };
}

function PlanCard({
  plan,
  isTemplate,
  library,
  draggable,
  position,
  onOpen,
  onEdit,
  onDuplicate,
  onShare,
  onEditTags,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop
}: {
  plan: WorkoutPlan;
  isTemplate: boolean;
  library: ExerciseDraft[];
  draggable?: boolean;
  position?: number;
  onOpen?: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onShare?: () => void;
  onEditTags?: () => void;
  onDelete?: () => void;
  onDragStart?: () => void;
  onDragOver?: (event: React.DragEvent<HTMLElement>) => void;
  onDrop?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);
  const musclePreview = planMusclePreview(plan, library);
  const tags = [...(plan.userTags ?? [])].reverse(); // latest first
  const statsRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(tags.length);
  const tagKey = tags.join("\0");

  useLayoutEffect(() => {
    const el = statsRef.current;
    if (!el || tags.length === 0) { setVisibleCount(0); return; }

    const GAP = 6;
    const MORE_PILL_W = 58; // approximate "+N more" width incl. gap
    const availWidth = el.offsetWidth;

    const tagEls = Array.from(el.querySelectorAll<HTMLElement>("[data-tag]"));
    let used = 0, count = 0;
    for (let i = 0; i < tagEls.length; i++) {
      const w = tagEls[i].offsetWidth + (i > 0 ? GAP : 0);
      const willHaveMore = i < tagEls.length - 1;
      if (used + w + (willHaveMore ? MORE_PILL_W : 0) <= availWidth) {
        used += w;
        count++;
      } else break;
    }
    setVisibleCount(count);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagKey]);

  const hiddenCount = tags.length - visibleCount;

  return (
    <article
      className={`plan-card plan-card--tappable${draggable ? " is-draggable" : ""}`}
      draggable={draggable}
      onClick={onOpen}
      onDragStart={draggable ? onDragStart : undefined}
      onDragOver={draggable ? onDragOver : undefined}
      onDrop={draggable ? onDrop : undefined}
    >
      <div className="plan-card-top">
        <div className="plan-card-meta">
          <h3 className="plan-card-name">{plan.name}</h3>
          {plan.note && <p className="plan-card-note">{plan.note}</p>}
        </div>
        {!isTemplate && (
          <div className="plan-card-actions" ref={menuRef} onClick={(e) => e.stopPropagation()}>
            <button
              className="plan-card-menu-btn"
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Plan options"
            >
              ⋮
            </button>
            {menuOpen && (
              <div className="plan-card-menu" onClick={() => setMenuOpen(false)}>
                <button type="button" onClick={onShare}>Share</button>
                <button type="button" onClick={onEdit}>Edit</button>
                <button type="button" onClick={onEditTags}>Edit Tags</button>
                <button type="button" onClick={onDuplicate}>Duplicate</button>
                {onDelete && (
                  <button type="button" className="is-danger" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}>Delete</button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {tags.length > 0 && (
        <div className="plan-card-stats" ref={statsRef}>
          {tags.map((t, i) => (
            <span
              key={t}
              data-tag
              className="plan-tag-inline"
              style={i >= visibleCount ? { display: "none" } : undefined}
            >
              {t}
            </span>
          ))}
          {hiddenCount > 0 && (
            <span className="plan-tags-more">+{hiddenCount} more</span>
          )}
        </div>
      )}
      <p className="plan-card-excount">
        {plan.exercises.length} {plan.exercises.length === 1 ? "exercise" : "exercises"}
      </p>
      {musclePreview && <p className="plan-card-muscles-line">{musclePreview}</p>}
      {position !== undefined && (
        <span className="plan-card-position" aria-hidden="true">{position}</span>
      )}
    </article>
  );
}

function buildPlanContext(plan: RepIQPlan, profile: UserPsychProfile | null): string {
  const days = plan.daysPerWeek;
  const split = plan.splitType;
  const goal = plan.goal;
  const why = profile?.motivationalWhy ?? null;
  const exp = plan.experienceLevel;

  // Sentence 1 — opening hook tied to why the user is here
  const whySentence: Record<string, string> = {
    inconsistent:      `You told us consistency has been your challenge — so this plan is designed to be simple enough to show up for, ${days} times a week.`,
    plateau:           `You said you've hit a plateau and need structure — this plan gives you that, with ${days} sessions a week and progressive overload built in week over week.`,
    look_feel_stronger:`You're here to look and feel stronger — so we structured ${days} sessions a week with the volume and intensity that drives visible, lasting change.`,
    fresh_start:       `You're starting fresh — this plan gives you a clean, repeatable structure: ${days} focused sessions a week, nothing more than you need.`,
    feel_good:         `You want to feel good and stay consistent — this plan keeps it sustainable: ${days} sessions a week, leaving room to recover and come back strong.`,
  };
  const opening = why && whySentence[why]
    ? whySentence[why]
    : `${days} sessions a week, each designed to move you toward ${
        goal === "build_muscle" ? "building muscle" :
        goal === "get_stronger" ? "getting stronger" :
        goal === "improve_fitness" ? "better overall fitness" :
        goal === "athletic_performance" ? "athletic performance" :
        "your goals"
      }.`;

  // Sentence 2 — why this split for this person
  const splitSentence: Record<string, string> = {
    full_body:   `Every session hits all major muscle groups — so even if you miss a day, nothing gets left behind.`,
    upper_lower: `Upper and lower body alternate each session, so each muscle group gets trained twice a week with proper recovery in between.`,
    ppl:         `Push, Pull, and Legs each get their own day — enough dedicated volume per muscle group to drive real progression.`,
    body_part:   `Each session focuses on one muscle group, maximising the stimulus and giving it a full week to recover before you hit it again.`,
  };
  const splitLine = splitSentence[split] ?? "";

  // Sentence 3 — experience-honest note, no labels
  const expSentence =
    (exp === "never" || exp === "beginner")
      ? `The rep ranges and set counts are calibrated for where you are right now — enough to drive adaptation without burning you out early.`
      : exp === "intermediate"
      ? `Sets, reps, and rest are tuned for your training age — enough stimulus to keep driving progress without unnecessary junk volume.`
      : `Volume and intensity are set for a trained athlete — structured to challenge you and keep the adaptation signal strong.`;

  return [opening, splitLine, expSentence].filter(Boolean).join(" ");
}

function PlannerHomePage({
  plans,
  library,
  generationLibrary,
  existingTags,
  activeView,
  onViewChange,
  hasActiveWorkout,
  onBack,
  onStartEmpty,
  onCreateNew,
  onGeneratePlan,
  onStartPlan,
  onEditPlan,
  onDuplicatePlan,
  onSharePlan,
  onEditTags,
  onReorderPlans,
  onDeletePlan,
  onUseTemplate,
  onResumeWorkout,
  resolvedTheme,
  onToggleTheme,
  defaultGoal,
  defaultLevel,
  defaultEquipment,
  repiqPlan,
  initialPlannerMode,
  onStartRepIQSession,
  onRegeneratePlan,
  onRegenerateRemaining,
  onSaveSessionToLibrary,
  psychProfile,
  onToggleRepIQStatus,
  onPausePlan,
  onDismissReview,
  savedWorkouts,
  onOpenHistoryWorkout,
  onSaveHistoryWorkout,
  onTryRepIQPlan,
  onNavigateGlossary,
  onApplyCustomSplit,
  onCarryOverSessions,
  onCompressSessions,
  genDraftConfig,
  onGenDraftConfigChange,
}: {
  plans: WorkoutPlan[];
  library: ExerciseDraft[];
  generationLibrary: ExerciseWithTaxonomy[];
  existingTags: string[];
  activeView: "mine" | "library" | "generate";
  onViewChange: (view: "mine" | "library" | "generate") => void;
  hasActiveWorkout: boolean;
  onBack: () => void;
  onStartEmpty: () => void;
  onCreateNew: () => void;
  onGeneratePlan: (plan: WorkoutPlan, config: GenConfig) => void;
  onStartPlan: (plan: WorkoutPlan) => void;
  onEditPlan: (plan: WorkoutPlan) => void;
  onDuplicatePlan: (plan: WorkoutPlan) => void;
  onSharePlan: (plan: WorkoutPlan) => void;
  onEditTags: (plan: WorkoutPlan) => void;
  resolvedTheme: string;
  onToggleTheme: () => void;
  defaultGoal: string | null;
  defaultLevel: string | null;
  defaultEquipment: string | null;
  onReorderPlans: (sourceId: string, targetId: string) => void;
  onDeletePlan: (planId: string) => void;
  onUseTemplate: (template: WorkoutPlan) => void;
  onResumeWorkout: () => void;
  repiqPlan?: RepIQPlan | null;
  initialPlannerMode?: "repiq" | "custom";
  onStartRepIQSession?: (weekIdx: number, dayIdx: number) => void;
  onRegeneratePlan?: (prefs: { goal: string; experience: string; daysPerWeek: number; cycleDays: number | null; sessionLength: number; planLengthWeeks: number; splitPref: string | null }) => void;
  onRegenerateRemaining?: () => void;
  onSaveSessionToLibrary?: (day: RepIQPlanDay, sessionLabel: string) => void;
  psychProfile?: UserPsychProfile | null;
  onToggleRepIQStatus?: () => void;
  onPausePlan?: (pauseEndDate: string) => void;
  onDismissReview?: () => void;
  savedWorkouts?: SavedWorkoutData[];
  onOpenHistoryWorkout?: (workout: SavedWorkoutData | null, weekIdx: number, dayIdx: number, label: string, sessionNum: number) => void;
  onSaveHistoryWorkout?: (workout: SavedWorkoutData) => void;
  onTryRepIQPlan?: () => void;
  onNavigateGlossary?: (term: string) => void;
  onApplyCustomSplit?: (arrangement: { label: string; muscles: string[] }[]) => void;
  onCarryOverSessions?: () => void;
  onCompressSessions?: () => void;
  genDraftConfig?: GenConfig | null;
  onGenDraftConfigChange?: (config: GenConfig) => void;
}) {
  // Generate state
  const [genGoal, setGenGoal] = useState(genDraftConfig?.goal ?? "Hypertrophy");
  const [genMuscles, setGenMuscles] = useState<string[]>(genDraftConfig?.muscles ?? []);
  const [genDuration, setGenDuration] = useState(genDraftConfig?.duration ?? "45 min");
  const [genEquipment, setGenEquipment] = useState<EquipmentAccess>(genDraftConfig?.equipment ?? psychProfile?.equipmentAccess ?? "full_gym");
  const [genError, setGenError] = useState<string | null>(null);
  const [dragPlanId, setDragPlanId] = useState<string | null>(null);
  const [activeTagFilter, setActiveTagFilter] = useState<string[]>([]);
  const [tagFilterSearch, setTagFilterSearch] = useState("");
  const lastBrowseViewRef = useRef<"mine" | "library">("mine");
  const [detailPlan, setDetailPlan] = useState<WorkoutPlan | null>(null);
  const [detailIsTemplate, setDetailIsTemplate] = useState(false);
  const [libCategory, setLibCategory] = useState<string | null>(null);
  const [libLevel, setLibLevel] = useState<string | null>(defaultLevel);
  const [libGoal, setLibGoal] = useState<string | null>(defaultGoal);
  const [libEquipment, setLibEquipment] = useState<string | null>(defaultEquipment);
  const [plannerMode, setPlannerMode] = useState<"repiq" | "custom">(initialPlannerMode ?? "repiq");
  const [plannerModeOpen, setPlannerModeOpen] = useState(false);
  const plannerModeDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!plannerModeOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (plannerModeDropdownRef.current && !plannerModeDropdownRef.current.contains(e.target as Node)) {
        setPlannerModeOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [plannerModeOpen]);
  const [showPrefsOverlay, setShowPrefsOverlay] = useState(false);
  const [prefGoal, setPrefGoal] = useState<string>(repiqPlan?.goal ?? "build_muscle");
  const [prefExp, setPrefExp] = useState<string>(repiqPlan?.experienceLevel ?? "beginner");
  const [prefDays, setPrefDays] = useState<number>(repiqPlan?.daysPerWeek ?? 3);
  const [prefUseRotatingCycle, setPrefUseRotatingCycle] = useState<boolean>(() => (psychProfile?.cycleDays ?? null) !== null);
  const [prefCycleDays, setPrefCycleDays] = useState<number>(() => psychProfile?.cycleDays ?? 7);
  const [prefLength, setPrefLength] = useState<number>(repiqPlan?.sessionLengthMin ?? 45);
  const [prefWeeks, setPrefWeeks] = useState<number>(repiqPlan?.mesocycleLengthWeeks ?? 12);
  const [prefSplit, setPrefSplit] = useState<string | null>(null);
  const [sessionMenuIdx, setSessionMenuIdx] = useState<string | null>(null);
  const [editingSessionKey, setEditingSessionKey] = useState<string | null>(null);
  const [editingSessionName, setEditingSessionName] = useState("");
  const [showPauseForm, setShowPauseForm] = useState(false);
  const [pauseReturnDate, setPauseReturnDate] = useState("");
  const [paceNudgeDismissedCycle, setPaceNudgeDismissedCycle] = useState<number>(-1);

  // Customise Split overlay
  const [showCustomSplit, setShowCustomSplit] = useState(false);
  const [customDays, setCustomDays] = useState<{ label: string; muscles: string[] }[]>([]);
  const [initialCustomDays, setInitialCustomDays] = useState<{ label: string; muscles: string[] }[]>([]);
  const [selectedMuscle, setSelectedMuscle] = useState<{ dayIdx: number; muscle: string } | null>(null);
  const [addingToDayIdx, setAddingToDayIdx] = useState<number | null>(null);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [toggledSessionKeys, setToggledSessionKeys] = useState<Set<string>>(new Set());
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState(false);
  const [libFilterOpen, setLibFilterOpen] = useState(false);
  const [libFilterFocus, setLibFilterFocus] = useState<string | null>(null);
  const [libDraftCategory, setLibDraftCategory] = useState<string | null>(null);
  const [libDraftLevel, setLibDraftLevel] = useState<string | null>(null);
  const [libDraftGoal, setLibDraftGoal] = useState<string | null>(null);
  const [libDraftEquipment, setLibDraftEquipment] = useState<string | null>(null);
  const draftVisibleCount = useMemo(() => WORKOUT_PLAN_TEMPLATES.filter((t) => {
    if (libDraftCategory !== null && t.category !== libDraftCategory) return false;
    if (libDraftLevel !== null && t.level !== libDraftLevel) return false;
    if (libDraftGoal !== null && t.goal !== libDraftGoal) return false;
    if (libDraftEquipment !== null && t.equipment !== libDraftEquipment) return false;
    return true;
  }).length, [libDraftCategory, libDraftLevel, libDraftGoal, libDraftEquipment]);
  const visibleTemplates = useMemo(() => {
    return WORKOUT_PLAN_TEMPLATES.filter((t) => {
      if (libCategory !== null && t.category !== libCategory) return false;
      if (libLevel !== null && t.level !== libLevel) return false;
      if (libGoal !== null && t.goal !== libGoal) return false;
      if (libEquipment !== null && t.equipment !== libEquipment) return false;
      return true;
    });
  }, [libCategory, libLevel, libGoal, libEquipment]);

  // Close session 3-dot menu on outside click
  useEffect(() => {
    if (!sessionMenuIdx) return;
    function handleOutsideClick(e: MouseEvent) {
      const wrap = document.querySelector(".repiq-session-menu-wrap");
      if (wrap && !wrap.contains(e.target as Node)) {
        setSessionMenuIdx(null);
      }
    }
    document.addEventListener("click", handleOutsideClick, { capture: true });
    return () => document.removeEventListener("click", handleOutsideClick, { capture: true });
  }, [sessionMenuIdx]);

  useEffect(() => {
    if (activeView !== "generate") {
      lastBrowseViewRef.current = activeView;
    }
  }, [activeView]);

  function toggleMuscle(m: string) {
    setGenMuscles((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  }

  function handleGenerate() {
    const genConfig: GenConfig = {
      goal: genGoal,
      muscles: genMuscles,
      duration: genDuration,
      equipment: genEquipment,
      seedOffset: 0
    };
    const plan = buildGeneratedPlan(genConfig, generationLibrary);
    if (!plan) {
      setGenError("No exercises found for your selections. Try removing some filters.");
      return;
    }
    setGenError(null);
    onGenDraftConfigChange?.(genConfig);
    onGeneratePlan(plan, genConfig);
  }

  const trayClass = hasActiveWorkout ? " has-tray" : "";

  if (activeView === "generate") {
    return (
      <main className={`planner-page${trayClass}`}>
        <header className="planner-topbar">
          <button
            className="back-nav-button"
            type="button"
            onClick={() => onViewChange(lastBrowseViewRef.current)}
            aria-label="Back"
          >
            ←
          </button>
          <div className="planner-topbar-copy">
            <h1>Generate Session</h1>
            <p className="planner-topbar-sub">Drafts a single workout from your goals</p>
          </div>
          <button type="button" className="theme-toggle-btn" onClick={onToggleTheme} aria-label="Toggle theme">
            {resolvedTheme === "dark" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
          </button>
        </header>
        <section className="planner-section planner-generate-section">
          <div className="generate-fields">
            <div className="generate-field">
              <label className="generate-field-label">Goal</label>
              <div className="generate-field-chips">
                {["Strength", "Hypertrophy", "Endurance", "Fat loss"].map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`generate-chip${genGoal === g ? " is-selected" : ""}`}
                    onClick={() => setGenGoal(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div className="generate-field">
              <label className="generate-field-label">Target muscles <span className="generate-field-hint">(optional)</span></label>
              <div className="generate-field-chips">
                {["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Quads", "Hamstrings", "Glutes", "Calves", "Abductors", "Adductors", "Core / Abs", "Obliques"].map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`generate-chip${genMuscles.includes(m) ? " is-selected" : ""}`}
                    onClick={() => toggleMuscle(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="generate-field">
              <label className="generate-field-label">Duration</label>
              <div className="generate-field-chips">
                {["30 min", "45 min", "60 min", "75+ min"].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`generate-chip${genDuration === d ? " is-selected" : ""}`}
                    onClick={() => setGenDuration(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="generate-field">
              <label className="generate-field-label">Where do you train?</label>
              <div className="generate-field-chips">
                {([
                  { value: "bodyweight", label: "No equipment" },
                  { value: "dumbbell_pair", label: "Dumbbells" },
                  { value: "home_setup", label: "Home setup" },
                  { value: "basic_gym", label: "Basic gym" },
                  { value: "full_gym", label: "Full gym" },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`generate-chip${genEquipment === option.value ? " is-selected" : ""}`}
                    onClick={() => setGenEquipment(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {genError && <p className="generate-error">{genError}</p>}
          <p className="planner-generate-note">
            Same selections always generate the same session. Shuffle on the next screen for a fresh variation.
          </p>
        </section>
        <div className={`planner-bottom-actions${hasActiveWorkout ? " has-tray" : ""}`}>
          {hasActiveWorkout ? (
            <button className="primary-button generate-cta-btn" type="button" disabled>
              Generate Session
            </button>
          ) : (
            <button className="primary-button generate-cta-btn" type="button" onClick={handleGenerate}>
              Generate Session
            </button>
          )}
        </div>
      </main>
    );
  }

  if (detailPlan) {
    const detailMusclePreview = planMusclePreview(detailPlan, library);
    return (
      <main className={`planner-page${trayClass}`}>
        <header className="planner-topbar">
          <button className="back-nav-button" type="button" onClick={() => setDetailPlan(null)} aria-label="Back">
            ←
          </button>
          <div className="planner-topbar-copy">
            <h1>{detailPlan.name}</h1>
          </div>
          <button type="button" className="theme-toggle-btn" onClick={onToggleTheme} aria-label="Toggle theme">
            {resolvedTheme === "dark" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
          </button>
        </header>

        <div className="plan-detail-actions-top">
          {hasActiveWorkout ? (
            <>
              <p className="plan-detail-active-notice">A workout is already in progress. Finish or discard it to start this one.</p>
              {detailIsTemplate && (
                <button
                  className="primary-button plan-detail-action-btn"
                  type="button"
                  onClick={() => { onUseTemplate(detailPlan); setDetailPlan(null); }}
                >
                  Save to My Workouts
                </button>
              )}
            </>
          ) : (
            <>
              {detailIsTemplate && (
                <button
                  className="secondary-button plan-detail-action-btn"
                  type="button"
                  onClick={() => { onUseTemplate(detailPlan); setDetailPlan(null); }}
                >
                  Save to My Workouts
                </button>
              )}
              <button
                className="primary-button plan-detail-action-btn"
                type="button"
                onClick={() => { onStartPlan(detailPlan); setDetailPlan(null); }}
              >
                Start Workout
              </button>
              {!detailIsTemplate && (
                <>
                  <button
                    type="button"
                    className="plan-detail-icon-btn"
                    title="Edit workout"
                    onClick={() => { setDetailPlan(null); onEditPlan(detailPlan); }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  {!SAMPLE_PLAN_IDS.has(detailPlan.id) && (
                    <button
                      type="button"
                      className="plan-detail-icon-btn plan-detail-icon-btn--danger"
                      title="Delete workout"
                      onClick={() => { setDetailPlan(null); setDeletingPlanId(detailPlan.id); }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <section className="plan-detail-section">
          {detailPlan.note && <p className="plan-detail-note">{detailPlan.note}</p>}
          {((detailPlan.userTags?.length ?? 0) > 0 || detailPlan.tag) && (
            <div className="plan-detail-tags">
              {detailPlan.tag && <span className="plan-tag-inline">{detailPlan.tag}</span>}
              {detailPlan.userTags?.map((t) => <span key={t} className="plan-tag-inline">{t}</span>)}
            </div>
          )}
          {detailMusclePreview && (
            <p className="plan-detail-muscles">{detailMusclePreview}</p>
          )}
          <div className="plan-detail-exercises">
            {detailPlan.exercises.map((pe, i) => {
              const ex = library.find((e) => e.id === pe.exerciseId);
              const setLabel = pe.setTypes
                ? pe.setTypes.map((t) => ({ warmup: "W", normal: "●", drop: "D", restpause: "RP", failure: "F" }[t] ?? "●")).join(" ")
                : `${pe.setCount} sets`;
              return (
                <div key={pe.exerciseId + i} className="plan-detail-exercise-row">
                  <span className="plan-detail-ex-num">{i + 1}</span>
                  <div className="plan-detail-ex-info">
                    <p className="plan-detail-ex-name">{ex?.name ?? "Unknown exercise"}</p>
                    <span className="plan-detail-ex-meta">{setLabel} · {pe.restTimer.includes(":") ? pe.restTimer : `${pe.restTimer}s`} rest</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    );
  }

  // Filter overlay helpers — defined outside JSX to avoid IIFE parse issues
  type FilterDef = { label: string; options: string[]; draftValue: string | null; realSet: (v: string | null) => void; draftSet: (v: string | null) => void };
  const filterAllDefs: FilterDef[] = [
    { label: "Type",      options: ["PPL", "Upper/Lower", "Full Body", "Specialisation", "Powerlifting", "Minimal", "Beginner"], draftValue: libDraftCategory, realSet: setLibCategory,    draftSet: setLibDraftCategory },
    { label: "Level",     options: ["Beginner", "Intermediate", "Advanced"],                                                     draftValue: libDraftLevel,    realSet: setLibLevel,       draftSet: setLibDraftLevel },
    { label: "Goal",      options: ["Hypertrophy", "Strength", "Endurance"],                                                     draftValue: libDraftGoal,     realSet: setLibGoal,        draftSet: setLibDraftGoal },
    { label: "Equipment", options: ["Full Gym", "Dumbbells", "Bodyweight"],                                                      draftValue: libDraftEquipment,realSet: setLibEquipment,   draftSet: setLibDraftEquipment },
  ];
  const filterVisibleDefs = libFilterFocus ? filterAllDefs.filter((f) => f.label === libFilterFocus) : filterAllDefs;
  const applyFiltersAndClose = () => {
    setLibCategory(libDraftCategory);
    setLibLevel(libDraftLevel);
    setLibGoal(libDraftGoal);
    setLibEquipment(libDraftEquipment);
    setLibFilterOpen(false);
  };

  return (
    <main className={`planner-page${trayClass}`}>
      <header className="planner-topbar">
        <button className="back-nav-button" type="button" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div className="planner-topbar-copy">
          {repiqPlan ? (
            <div className="planner-mode-dropdown-wrap" ref={plannerModeDropdownRef}>
              <button
                className="planner-mode-dropdown-btn"
                type="button"
                onClick={() => setPlannerModeOpen((v) => !v)}
              >
                <span className="planner-mode-dropdown-label">
                  {plannerMode === "repiq" ? "✦ RepIQ Plan" : "Custom Workout Planner"}
                </span>
                <svg
                  className={`planner-mode-chevron${plannerModeOpen ? " is-open" : ""}`}
                  width="12" height="12" viewBox="0 0 12 12"
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                >
                  <polyline points="2,4 6,8 10,4"/>
                </svg>
              </button>
              {plannerModeOpen && (
                <div className="planner-mode-dropdown-menu">
                  {(["repiq", "custom"] as const).map((m) => (
                    <button
                      key={m}
                      className={`planner-mode-option${plannerMode === m ? " is-active" : ""}`}
                      type="button"
                      onClick={() => { setPlannerMode(m); setPlannerModeOpen(false); }}
                    >
                      {m === "repiq" ? "✦ RepIQ Plan" : "Custom Workout Planner"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <h1>Workout Planner</h1>
          )}
        </div>
        <button type="button" className="theme-toggle-btn" onClick={onToggleTheme} aria-label="Toggle theme">
          {resolvedTheme === "dark" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
        </button>
      </header>

      {repiqPlan && plannerMode === "repiq" && (() => {
        // Minimum 1 full week unlocked; each completed session unlocks 1 more beyond that
        const totalCompleted = repiqPlan.weeks.reduce(
          (acc, week) => acc + week.days.filter((d) => d.completedAt).length, 0
        );
        const sessionsPerWeek = repiqPlan.weeks[0]?.days.length ?? repiqPlan.daysPerWeek;
        const totalUnlocked = sessionsPerWeek + totalCompleted;
        // Build flat sessions list
        let sessionNum = 0;
        const allSessions = repiqPlan.weeks.flatMap((week, wi) =>
          week.days.map((day, di) => {
            sessionNum++;
            const globalIdx = sessionNum - 1; // 0-indexed
            return {
              key: `${wi}-${di}`,
              weekIdx: wi,
              dayIdx: di,
              sessionNum,
              label: day.sessionLabel,
              focus: day.focus,
              exercises: day.exercises,
              isCompleted: !!day.completedAt,
              isCurrent: wi === repiqPlan.currentWeekIndex && !week.isCompleted,
              isLocked: globalIdx >= totalUnlocked,
            };
          })
        );

        const completedSessions = allSessions.filter(s => s.isCompleted);
        const allActiveSessions = allSessions.filter(s => !s.isCompleted && !s.isLocked);
        // Show at most one cycle's worth of upcoming sessions
        const visibleActiveCount = Math.min(sessionsPerWeek, allActiveSessions.length);
        const activeSessions = allActiveSessions.slice(0, visibleActiveCount);
        const lockedSessions = allSessions.filter(s => s.isLocked);

        return (
          <div className="planner-repiq-section">
            {/* Header */}
            <div className="repiq-plan-header">
              <div className="repiq-plan-header-btns">
                {onToggleRepIQStatus && (
                  <button
                    type="button"
                    className={`repiq-status-btn${repiqPlan.status === "paused" ? " is-paused" : ""}`}
                    onClick={() => {
                      if (repiqPlan.status === "paused") {
                        onToggleRepIQStatus();
                        setShowPauseForm(false);
                      } else {
                        setShowPauseForm(prev => !prev);
                        // Default return date: 7 days from now
                        const d = new Date(); d.setDate(d.getDate() + 7);
                        setPauseReturnDate(d.toISOString().split("T")[0]);
                      }
                    }}
                  >
                    {repiqPlan.status === "paused" ? "▶ Resume" : showPauseForm ? "✕ Cancel" : "⏸ Pause"}
                  </button>
                )}
                {onRegeneratePlan && (
                  <button
                    type="button"
                    className="repiq-regenerate-btn"
                    onClick={() => {
                      setPrefGoal(repiqPlan.goal);
                      setPrefExp(repiqPlan.experienceLevel);
                      setPrefDays(repiqPlan.daysPerWeek);
                      setPrefLength(repiqPlan.sessionLengthMin);
                      setPrefSplit(null);
                      setShowPrefsOverlay(true);
                    }}
                  >
                    ✦ Adjust Preferences
                  </button>
                )}
                {onApplyCustomSplit && (
                  <button
                    type="button"
                    className="repiq-customise-btn"
                    onClick={() => {
                      const firstCycle = repiqPlan.weeks[0];
                      if (firstCycle) {
                        const arrangement = firstCycle.days.map(day => ({
                          label: day.sessionLabel,
                          muscles: day.focus.split(" · ").map(m => m.trim()).filter(Boolean),
                        }));
                        setCustomDays(arrangement);
                        setInitialCustomDays(arrangement.map(d => ({ ...d, muscles: [...d.muscles] })));
                      }
                      setSelectedMuscle(null);
                      setAddingToDayIdx(null);
                      setShowCustomSplit(true);
                    }}
                  >
                    ✎ Customise Split
                  </button>
                )}
              </div>
              {/* Inline pause form */}
              {showPauseForm && repiqPlan.status !== "paused" && (
                <div className="repiq-pause-form">
                  <label className="repiq-pause-label">Returning on</label>
                  <input
                    type="date"
                    className="repiq-pause-date"
                    value={pauseReturnDate}
                    min={(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]; })()}
                    max={(() => { const d = new Date(); d.setDate(d.getDate() + (repiqPlan.pauseDaysMax ?? 45)); return d.toISOString().split("T")[0]; })()}
                    onChange={(e) => setPauseReturnDate(e.target.value)}
                  />
                  {pauseReturnDate && (
                    <span className="repiq-pause-days-info">
                      {Math.max(1, Math.round((new Date(pauseReturnDate).getTime() - Date.now()) / 86400000))} day{Math.max(1, Math.round((new Date(pauseReturnDate).getTime() - Date.now()) / 86400000)) !== 1 ? "s" : ""} pause
                    </span>
                  )}
                  <button
                    type="button"
                    className="repiq-pause-confirm-btn"
                    disabled={!pauseReturnDate}
                    onClick={() => {
                      if (onPausePlan && pauseReturnDate) {
                        onPausePlan(pauseReturnDate);
                        setShowPauseForm(false);
                      }
                    }}
                  >
                    Confirm Pause
                  </button>
                </div>
              )}
              <h2 className="repiq-plan-title">{repiqPlan.planName}</h2>
              <div className="repiq-plan-meta-row">
                <span>{SPLIT_LABEL[repiqPlan.splitType]}</span>
                <span className="repiq-meta-dot">·</span>
                <span>{repiqPlan.daysPerWeek} {psychProfile?.cycleDays ? `sessions / ${psychProfile.cycleDays}-day cycle` : "days/week"}</span>
                <span className="repiq-meta-dot">·</span>
                <span>{repiqPlan.mesocycleLengthWeeks} weeks</span>
                <span className="repiq-meta-dot">·</span>
                <span>Ends {(() => {
                  const start = new Date(repiqPlan.startDate);
                  const planDays = repiqPlan.mesocycleLengthWeeks * 7;
                  const pauseDays = repiqPlan.totalPauseDaysUsed ?? 0;
                  // If currently paused with an end date, add those planned pause days
                  const currentPauseDays = repiqPlan.status === "paused" && repiqPlan.pauseEndDate
                    ? Math.max(0, Math.round((new Date(repiqPlan.pauseEndDate).getTime() - new Date(repiqPlan.pausedAt ?? Date.now()).getTime()) / 86400000))
                    : repiqPlan.status === "paused" && repiqPlan.pausedAt
                    ? Math.round((Date.now() - new Date(repiqPlan.pausedAt).getTime()) / 86400000)
                    : 0;
                  // Buffer: 1 week per 4 weeks of plan (natural slack for rest days)
                  const bufferDays = Math.floor(repiqPlan.mesocycleLengthWeeks / 4) * 7;
                  const endDate = new Date(start.getTime() + (planDays + pauseDays + currentPauseDays + bufferDays) * 86400000);
                  return endDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                })()}</span>
              </div>
            </div>

            {/* Paused notice */}
            {repiqPlan.status === "paused" && (() => {
              const pausedAtMs = repiqPlan.pausedAt ? new Date(repiqPlan.pausedAt).getTime() : Date.now();
              const daysPaused = Math.round((Date.now() - pausedAtMs) / 86400000);
              const totalUsed = (repiqPlan.totalPauseDaysUsed ?? 0) + daysPaused;
              const maxDays = repiqPlan.pauseDaysMax ?? 45;
              const daysRemaining = Math.max(0, maxDays - totalUsed);
              const isNearExpiry = totalUsed >= maxDays * 0.7;
              const isExpired = totalUsed >= maxDays;
              const returnDate = repiqPlan.pauseEndDate
                ? new Date(repiqPlan.pauseEndDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                : null;
              const daysUntilReturn = repiqPlan.pauseEndDate
                ? Math.max(0, Math.round((new Date(repiqPlan.pauseEndDate).getTime() - Date.now()) / 86400000))
                : null;
              return (
                <div className={`repiq-paused-banner${isNearExpiry ? " is-warning" : ""}${isExpired ? " is-expired" : ""}`}>
                  <div className="repiq-paused-top">
                    <span>{isExpired ? "⚠ Plan expired" : "⏸ Plan paused"}</span>
                    <span className="repiq-paused-day-count">
                      Day {totalUsed} of {maxDays}
                    </span>
                  </div>
                  {isExpired ? (
                    <span className="repiq-paused-sub">This plan has been paused too long. Archive it and start fresh to continue your progress.</span>
                  ) : returnDate ? (
                    <span className="repiq-paused-sub">
                      Returning {returnDate}{daysUntilReturn !== null && daysUntilReturn > 0 ? ` (${daysUntilReturn} day${daysUntilReturn !== 1 ? "s" : ""} left)` : daysUntilReturn === 0 ? " (today!)" : ""}. Plan end date adjusted accordingly.
                    </span>
                  ) : isNearExpiry ? (
                    <span className="repiq-paused-sub">⚠ Plan expires in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""}. Resume soon or your progress will be archived.</span>
                  ) : (
                    <span className="repiq-paused-sub">Sessions won't count toward plan progress. Resume when you're ready.</span>
                  )}
                </div>
              );
            })()}

            {/* ── Plan health nudges (needs-review + pace) ── */}
            {(() => {
              // Compute pace info for both banners
              let isBehindPace = false;
              let sessionsRemaining = 0;
              let daysRemaining = 0;
              let cycleLabel = "this week";
              if (repiqPlan.status !== "paused") {
                const currentWeek = repiqPlan.weeks[repiqPlan.currentWeekIndex];
                if (currentWeek && !currentWeek.isCompleted) {
                  const completedTimestamps = currentWeek.days
                    .map(d => d.completedAt ? new Date(d.completedAt).getTime() : null)
                    .filter((t): t is number => t !== null);
                  if (completedTimestamps.length > 0) {
                    const cycleStartMs = Math.min(...completedTimestamps);
                    const cycleLengthDays = repiqPlan.cycleDays ?? 7;
                    const cycleEndMs = cycleStartMs + cycleLengthDays * 86400000;
                    daysRemaining = Math.max(0, Math.floor((cycleEndMs - Date.now()) / 86400000));
                    sessionsRemaining = currentWeek.days.filter(d => !d.completedAt).length;
                    isBehindPace = sessionsRemaining > 0 && daysRemaining < sessionsRemaining;
                    cycleLabel = repiqPlan.cycleDays ? `${cycleLengthDays}-day cycle` : "this week";
                  }
                }
              }
              const paceNudgeDismissed = paceNudgeDismissedCycle === repiqPlan.currentWeekIndex;
              const showPace = isBehindPace && !paceNudgeDismissed;
              const showReview = !!repiqPlan.needsReview;

              // ── Combined: both review + pace active ──
              if (showReview && showPace) {
                return (
                  <div className="repiq-needs-review-banner repiq-combined-nudge">
                    <div className="repiq-needs-review-body">
                      <p className="repiq-needs-review-title">Plan needs attention</p>
                      <p className="repiq-needs-review-sub">
                        You logged {repiqPlan.extraVolumeCount ?? 1} session{(repiqPlan.extraVolumeCount ?? 1) !== 1 ? "s" : ""} outside this plan, and you have {sessionsRemaining} session{sessionsRemaining !== 1 ? "s" : ""} left with {daysRemaining === 0 ? "no days" : `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`} remaining in {cycleLabel}.
                      </p>
                      <p className="repiq-needs-review-sub" style={{ marginTop: 4, fontStyle: "italic" }}>
                        Regenerating will recalculate volumes and adjust pacing for the remaining sessions.
                      </p>
                    </div>
                    <div className="repiq-needs-review-actions">
                      {onRegenerateRemaining && sessionsRemaining > daysRemaining && (
                        <button type="button" className="repiq-needs-review-regen-btn" onClick={() => { onRegenerateRemaining(); setPaceNudgeDismissedCycle(repiqPlan.currentWeekIndex); }}>
                          Regenerate &amp; Rebalance
                        </button>
                      )}
                      {onDismissReview && (
                        <button type="button" className="repiq-needs-review-dismiss-btn" onClick={() => { onDismissReview(); setPaceNudgeDismissedCycle(repiqPlan.currentWeekIndex); }}>
                          Dismiss
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              // ── Review only (no pacing issue) ──
              if (showReview) {
                return (
                  <div className="repiq-needs-review-banner">
                    <div className="repiq-needs-review-body">
                      <p className="repiq-needs-review-title">Your remaining sessions may need a refresh</p>
                      <p className="repiq-needs-review-sub">
                        You logged {repiqPlan.extraVolumeCount ?? 1} session{(repiqPlan.extraVolumeCount ?? 1) !== 1 ? "s" : ""} outside this plan. RepIQ can regenerate your remaining sessions to account for the extra volume and avoid overlap.
                      </p>
                    </div>
                    <div className="repiq-needs-review-actions">
                      {onRegenerateRemaining && (
                        <button type="button" className="repiq-needs-review-regen-btn" onClick={onRegenerateRemaining}>
                          Regenerate remaining sessions
                        </button>
                      )}
                      {onDismissReview && (
                        <button type="button" className="repiq-needs-review-dismiss-btn" onClick={onDismissReview}>
                          Dismiss
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              // ── Pace nudge only (no review needed) ──
              if (showPace) {
                return (
                  <div className="repiq-pace-nudge">
                    <div className="repiq-pace-nudge-body">
                      <span className="repiq-pace-nudge-icon">⚡</span>
                      <div>
                        <p className="repiq-pace-nudge-title">
                          {sessionsRemaining} session{sessionsRemaining !== 1 ? "s" : ""} left, {daysRemaining === 0 ? "last day" : `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} remaining`}
                        </p>
                        <p className="repiq-pace-nudge-sub">
                          Choose how to adjust {cycleLabel}:
                        </p>
                      </div>
                    </div>
                    <div className="repiq-pace-nudge-actions">
                      {onCarryOverSessions && (
                        <button type="button" className="repiq-pace-action-btn" onClick={() => { onCarryOverSessions(); setPaceNudgeDismissedCycle(repiqPlan.currentWeekIndex); }}>
                          Carry over to next cycle
                        </button>
                      )}
                      {onCompressSessions && sessionsRemaining > daysRemaining && (
                        <button type="button" className="repiq-pace-action-btn" onClick={() => { onCompressSessions(); setPaceNudgeDismissedCycle(repiqPlan.currentWeekIndex); }}>
                          Compress remaining
                        </button>
                      )}
                      <button
                        type="button"
                        className="repiq-pace-nudge-dismiss-btn"
                        onClick={() => setPaceNudgeDismissedCycle(repiqPlan.currentWeekIndex)}
                      >
                        Ignore &amp; continue
                      </button>
                    </div>
                  </div>
                );
              }

              return null;
            })()}

            {/* Plan context — why this plan was chosen */}
            <div className="repiq-plan-context">
              <p className="repiq-plan-context-text">{buildPlanContext(repiqPlan, psychProfile ?? null)}</p>
            </div>

            {/* Active / upcoming sessions */}
            <div className="repiq-sessions-list">
              {activeSessions.map((s, idx) => {
                const isNext = idx === 0;
                const isMenuOpen = sessionMenuIdx === s.key;
                const isEditing = editingSessionKey === s.key;
                // Next card: expanded by default; others: collapsed by default
                const isToggled = toggledSessionKeys.has(s.key);
                const isExpanded = isNext ? !isToggled : isToggled;
                const toggleExpand = () => setToggledSessionKeys(prev => {
                  const next = new Set(prev);
                  if (next.has(s.key)) next.delete(s.key); else next.add(s.key);
                  return next;
                });
                return (
                  <div key={s.key} className={`repiq-session-card${isNext ? " is-next" : ""}`}>
                    {/* Row 1: session number + badges + actions */}
                    <div className="repiq-session-header">
                      <div className="repiq-session-meta">
                        <span className="repiq-session-num">Session {s.sessionNum}</span>
                        {isNext && <span className="repiq-session-badge">Next</span>}
                      </div>
                      <div className="repiq-session-header-right">
                        {onStartRepIQSession && (
                          <button
                            type="button"
                            className={`repiq-session-start-pill${isNext ? " is-next" : ""}${repiqPlan.status === "paused" ? " is-paused-disabled" : ""}`}
                            onClick={(e) => { e.stopPropagation(); if (repiqPlan.status !== "paused") onStartRepIQSession(s.weekIdx, s.dayIdx); }}
                            disabled={repiqPlan.status === "paused"}
                            title={repiqPlan.status === "paused" ? "Resume plan to start sessions" : undefined}
                          >
                            Start
                          </button>
                        )}
                        <div className="repiq-session-menu-wrap">
                          <button
                            type="button"
                            className="repiq-session-menu-btn"
                            onClick={() => setSessionMenuIdx(isMenuOpen ? null : s.key)}
                            aria-label="Session options"
                          >⋯</button>
                          {isMenuOpen && (
                            <div className="repiq-session-menu">
                              <button type="button" onClick={() => {
                                setEditingSessionName(s.label);
                                setEditingSessionKey(s.key);
                                setSessionMenuIdx(null);
                              }}>Rename session</button>
                              {onSaveSessionToLibrary && (
                                <button type="button" onClick={() => {
                                  const week = repiqPlan.weeks[s.weekIdx];
                                  onSaveSessionToLibrary(week.days[s.dayIdx], s.label);
                                  setSessionMenuIdx(null);
                                  setSavedToast(true);
                                  setTimeout(() => setSavedToast(false), 2500);
                                }}>Save to My Workouts</button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Row 2: session name */}
                    {isEditing ? (
                      <div className="repiq-session-rename-row">
                        <input
                          className="repiq-session-rename-input"
                          value={editingSessionName}
                          onChange={e => setEditingSessionName(e.target.value)}
                          autoFocus
                        />
                        <button type="button" className="repiq-session-rename-save" onClick={() => setEditingSessionKey(null)}>Save</button>
                        <button type="button" className="repiq-session-rename-cancel" onClick={() => setEditingSessionKey(null)}>✕</button>
                      </div>
                    ) : (
                      <p className="repiq-session-name">{s.label}</p>
                    )}
                    {/* Row 3: muscles/focus */}
                    {s.focus && <p className="repiq-session-focus">{s.focus}</p>}
                    {/* Expandable exercise list */}
                    <button type="button" className="repiq-session-expand-toggle" onClick={toggleExpand}>
                      {isExpanded ? "Hide exercises ›" : `${s.exercises.length} exercises ›`}
                    </button>
                    {isExpanded && (
                      <ul className="repiq-ex-list">
                        {s.exercises.map((e) => {
                          const exName = library.find((ex) => ex.id === e.exerciseId)?.name ?? e.exerciseId;
                          return (
                            <li key={e.exerciseId} className="repiq-ex-item">
                              {exName} <span className="repiq-ex-sets">{e.sets}×{e.reps}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}

              {/* Locked sessions — count only, no cards */}
              {lockedSessions.length > 0 && (
                <p className="repiq-locked-count">
                  🔒 {lockedSessions.length} session{lockedSessions.length !== 1 ? "s" : ""} locked · complete upcoming sessions to unlock
                </p>
              )}
            </div>

            {/* Completed sessions — last 2 weeks shown inline */}
            {completedSessions.length > 0 && (() => {
              const twoWeeksCount = 2 * (repiqPlan.weeks[0]?.days.length ?? repiqPlan.daysPerWeek);
              const recentCompleted = completedSessions.slice(-twoWeeksCount);
              const olderCount = completedSessions.length - recentCompleted.length;
              return (
                <div className="repiq-completed-section">
                  <button
                    type="button"
                    className="repiq-completed-toggle"
                    onClick={() => setCompletedExpanded(v => !v)}
                  >
                    <span>Completed · {completedSessions.length} sessions</span>
                    <span className={`repiq-completed-chevron${completedExpanded ? " is-open" : ""}`}>›</span>
                  </button>
                  {completedExpanded && (
                    <div className="repiq-sessions-list">
                      {olderCount > 0 && (
                        <p className="repiq-history-see-all">
                          {olderCount} earlier session{olderCount !== 1 ? "s" : ""} — see full history in <strong>Workout History</strong>
                        </p>
                      )}
                      {recentCompleted.map((s) => {
                        const historyMatch = savedWorkouts?.find(w => w.repiqSourceKey === s.key) ?? null;
                        return (
                          <div
                            key={s.key}
                            className="repiq-session-card is-done"
                            style={{ cursor: "pointer" }}
                            onClick={() => onOpenHistoryWorkout?.(historyMatch, s.weekIdx, s.dayIdx, s.label, s.sessionNum)}
                          >
                            <div className="repiq-session-header">
                              <div className="repiq-session-meta">
                                <span className="repiq-session-num">Session {s.sessionNum}</span>
                                {s.focus && <span className="repiq-session-focus">{s.focus}</span>}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span className="repiq-week-badge is-done">✓ Done</span>
                                <span className="repiq-session-chevron">›</span>
                              </div>
                            </div>
                            <p className="repiq-session-name">{s.label}</p>
                            {historyMatch && onSaveHistoryWorkout && (
                              <button
                                type="button"
                                className="repiq-history-save-btn"
                                onClick={(e) => { e.stopPropagation(); onSaveHistoryWorkout(historyMatch); }}
                              >
                                Save to My Workouts
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Preferences overlay */}
            {showPrefsOverlay && (
              <div className="repiq-prefs-overlay" onClick={() => setShowPrefsOverlay(false)}>
                <div className="repiq-prefs-sheet" onClick={e => e.stopPropagation()}>
                  <div className="repiq-prefs-header">
                    <h3 className="repiq-prefs-title">Adjust Plan Preferences</h3>
                    <button type="button" className="repiq-prefs-close" onClick={() => setShowPrefsOverlay(false)}>✕</button>
                  </div>

                  <div className="repiq-prefs-body">
                    {/* Goal */}
                    <div className="ob-field">
                      <label className="ob-field-label">Primary Goal</label>
                      <div className="ob-chip-grid">
                        {([
                          { value: "build_muscle", label: "💪 Build Muscle" },
                          { value: "get_stronger", label: "🏋️ Get Stronger" },
                          { value: "improve_fitness", label: "🏃 Improve Fitness" },
                          { value: "fat_loss", label: "🔥 Fat Loss" },
                          { value: "athletic_performance", label: "⚡ Performance" },
                          { value: "stay_active", label: "🌿 Stay Active" },
                        ] as { value: string; label: string }[]).map(o => (
                          <button
                            key={o.value}
                            type="button"
                            className={`ob-chip${prefGoal === o.value ? " is-active" : ""}`}
                            onClick={() => setPrefGoal(o.value)}
                          >
                            <span className="ob-chip-check" style={{ visibility: prefGoal === o.value ? "visible" : "hidden" }}>✓</span>
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Experience */}
                    <div className="ob-field">
                      <label className="ob-field-label">Experience Level</label>
                      <div className="ob-chip-grid">
                        {([
                          { value: "never", label: "🌱 New to training" },
                          { value: "beginner", label: "🚶 Getting started" },
                          { value: "intermediate", label: "🏃 Building foundations" },
                          { value: "advanced", label: "💪 Experienced" },
                          { value: "veteran", label: "🦅 Veteran" },
                        ] as { value: string; label: string }[]).map(o => (
                          <button
                            key={o.value}
                            type="button"
                            className={`ob-chip${prefExp === o.value ? " is-active" : ""}`}
                            onClick={() => setPrefExp(o.value)}
                          >
                            <span className="ob-chip-check" style={{ visibility: prefExp === o.value ? "visible" : "hidden" }}>✓</span>
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Sessions per week / cycle */}
                    <div className="ob-field">
                      <label className="ob-field-label">
                        {prefUseRotatingCycle ? "Sessions per cycle" : "Days per week"}
                      </label>
                      <div className="ob-chip-row">
                        {[1, 2, 3, 4, 5, 6, 7].map(d => (
                          <button
                            key={d}
                            type="button"
                            className={`ob-chip${prefDays === d ? " is-active" : ""}`}
                            onClick={() => setPrefDays(d)}
                          >
                            <span className="ob-chip-check" style={{ visibility: prefDays === d ? "visible" : "hidden" }}>✓</span>
                            {d}
                          </button>
                        ))}
                      </div>
                      <label className="ob-rotating-toggle" style={{ marginTop: 10 }}>
                        <input
                          type="checkbox"
                          checked={prefUseRotatingCycle}
                          onChange={e => setPrefUseRotatingCycle(e.target.checked)}
                        />
                        <span className="ob-checkbox-label">I follow a rotating cycle (not a fixed weekly schedule)</span>
                      </label>
                      {prefUseRotatingCycle && (
                        <div style={{ marginTop: 10 }}>
                          <label className="ob-field-label" style={{ fontSize: "0.8rem", marginBottom: 6 }}>Cycle length</label>
                          <div className="ob-chip-row" style={{ flexWrap: "wrap" }}>
                            {[3, 4, 5, 6, 7, 8, 9, 10, 12, 14].map(d => (
                              <button
                                key={d}
                                type="button"
                                className={`ob-chip${prefCycleDays === d ? " is-active" : ""}`}
                                onClick={() => setPrefCycleDays(d)}
                              >
                                <span className="ob-chip-check" style={{ visibility: prefCycleDays === d ? "visible" : "hidden" }}>✓</span>
                                {d}d
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Session length */}
                    <div className="ob-field">
                      <label className="ob-field-label">Session length</label>
                      <div className="ob-chip-row">
                        {([30, 45, 60, 75, 90] as number[]).map(l => (
                          <button
                            key={l}
                            type="button"
                            className={`ob-chip${prefLength === l ? " is-active" : ""}`}
                            onClick={() => setPrefLength(l)}
                          >
                            <span className="ob-chip-check" style={{ visibility: prefLength === l ? "visible" : "hidden" }}>✓</span>
                            {l} min
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Plan length */}
                    <div className="ob-field">
                      <label className="ob-field-label">Plan Length</label>
                      <div className="ob-chip-row">
                        {([4, 6, 8, 10, 12, 16] as number[]).map(w => (
                          <button
                            key={w}
                            type="button"
                            className={`ob-chip${prefWeeks === w ? " is-active" : ""}`}
                            onClick={() => setPrefWeeks(w)}
                          >
                            <span className="ob-chip-check" style={{ visibility: prefWeeks === w ? "visible" : "hidden" }}>✓</span>
                            {w}w
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Workout split — smart recommendations based on day count */}
                    <div className="ob-field">
                      <label className="ob-field-label">Workout Split <InfoIcon onClick={(e) => { e.stopPropagation(); onNavigateGlossary?.("workout split"); }} /></label>
                      <p className="ob-field-hint" style={{ marginBottom: 8 }}>Recommended for {prefDays} day{prefDays !== 1 ? "s" : ""}. Or customise the muscle arrangement from the plan header.</p>
                      <div className="ob-split-grid">
                        {(() => {
                          const VALID_SPLITS_FOR_DAYS_PREF: Record<number, SplitType[]> = {
                            1: ["full_body"],
                            2: ["push_pull", "full_body", "upper_lower"],
                            3: ["ppl", "arnold", "full_body"],
                            4: ["upper_lower", "phul", "ppl_fb", "arnold_fb"],
                            5: ["ppl_ul", "arnold_ul", "body_part"],
                            6: ["ppl", "arnold", "ppl_arnold", "body_part"],
                            7: ["body_part"],
                          };
                          const validSplits: SplitType[] = VALID_SPLITS_FOR_DAYS_PREF[prefDays] ?? ["full_body"];
                          const autoRec = pickSplitType(prefDays, (prefExp as ExperienceLevel) ?? "beginner");
                          return validSplits.map(s => {
                            const isRec = s === autoRec;
                            const isActive = prefSplit === s || (prefSplit === null && isRec);
                            return (
                              <button
                                key={s}
                                type="button"
                                className={`ob-split-btn${isActive ? " is-active" : ""}`}
                                onClick={() => setPrefSplit(isActive && isRec ? null : s)}
                              >
                                <div className="ob-split-text">
                                  <span className="ob-split-name">{SPLIT_LABEL[s]}</span>
                                  <span className="ob-split-desc">{SPLIT_DESC[s]}</span>
                                </div>
                                {isRec && <span className="ob-split-rec">Recommended</span>}
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>

                  <div className="repiq-prefs-footer">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => {
                        onRegeneratePlan?.({ goal: prefGoal, experience: prefExp, daysPerWeek: prefDays, cycleDays: prefUseRotatingCycle ? prefCycleDays : null, sessionLength: prefLength, planLengthWeeks: prefWeeks, splitPref: prefSplit });
                        setShowPrefsOverlay(false);
                      }}
                    >
                      Regenerate Plan
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Customise Split overlay ── */}
            {showCustomSplit && (() => {
              const ALL_MUSCLES = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Quads", "Hamstrings", "Glutes", "Core", "Calves"] as const;
              // Muscles "covered" by composite focus labels like "Upper Body", "Full Body"
              const COMPOSITE_COVERAGE: Record<string, string[]> = {
                "Upper Body":  ["Chest", "Back", "Shoulders", "Biceps", "Triceps"],
                "Lower Body":  ["Quads", "Hamstrings", "Glutes", "Calves"],
                "Full Body":   ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Quads", "Hamstrings", "Glutes", "Core", "Calves"],
                "Upper Body · Strength": ["Chest", "Back", "Shoulders", "Biceps", "Triceps"],
                "Upper Body · Hypertrophy": ["Chest", "Back", "Shoulders", "Biceps", "Triceps"],
              };
              const coveredMuscles = new Set<string>();
              customDays.forEach(d => {
                d.muscles.forEach(m => coveredMuscles.add(m));
                // Check if day focus or label implies composite coverage
                const focusParts = d.muscles;
                if (focusParts.length === 0) return;
                // Also check known composite names in the label
                Object.entries(COMPOSITE_COVERAGE).forEach(([key, muscles]) => {
                  if (d.label === key || d.muscles.some(mm => mm === key)) {
                    muscles.forEach(mm => coveredMuscles.add(mm));
                  }
                });
              });
              const assignedMuscles = new Set(customDays.flatMap(d => d.muscles));
              const unassignedMuscles = ALL_MUSCLES.filter(m => !assignedMuscles.has(m));
              const hasChanges = JSON.stringify(customDays) !== JSON.stringify(initialCustomDays);

              return (
                <div className="cs-overlay" onClick={() => { setShowCustomSplit(false); setSelectedMuscle(null); setAddingToDayIdx(null); }}>
                  <div className="cs-sheet" onClick={e => e.stopPropagation()}>
                    <div className="cs-header">
                      <button type="button" className="cs-back" onClick={() => { setShowCustomSplit(false); setSelectedMuscle(null); setAddingToDayIdx(null); }}>← Back</button>
                      <h3 className="cs-title">Customise Split</h3>
                      <button
                        type="button"
                        className={`cs-reset${!hasChanges ? " is-disabled" : ""}`}
                        disabled={!hasChanges}
                        onClick={() => {
                          setCustomDays(initialCustomDays.map(d => ({ ...d, muscles: [...d.muscles] })));
                          setSelectedMuscle(null);
                          setAddingToDayIdx(null);
                        }}
                      >
                        Reset
                      </button>
                    </div>
                    <p className="cs-hint">Tap a muscle to select it, then tap another day to move it. Remove with ×. Drag unassigned muscles into any day.</p>

                    <div className="cs-days-list">
                      {customDays.map((day, dayIdx) => (
                        <div
                          key={dayIdx}
                          className={`cs-day-card${selectedMuscle && selectedMuscle.dayIdx !== dayIdx ? " cs-day-drop-target" : ""}`}
                          onClick={() => {
                            if (selectedMuscle && selectedMuscle.dayIdx !== dayIdx) {
                              const updated = customDays.map((d, i) => {
                                if (i === selectedMuscle.dayIdx) return { ...d, muscles: d.muscles.filter(m => m !== selectedMuscle.muscle) };
                                if (i === dayIdx) return { ...d, muscles: [...d.muscles, selectedMuscle.muscle] };
                                return d;
                              });
                              setCustomDays(updated);
                              setSelectedMuscle(null);
                            }
                          }}
                          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("cs-day-drop-target"); }}
                          onDragLeave={(e) => { e.currentTarget.classList.remove("cs-day-drop-target"); }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.currentTarget.classList.remove("cs-day-drop-target");
                            const muscle = e.dataTransfer.getData("text/plain");
                            if (muscle && !day.muscles.includes(muscle)) {
                              // Remove from source day if it was assigned
                              const updated = customDays.map((d, i) => {
                                const filtered = d.muscles.filter(m => m !== muscle);
                                if (i === dayIdx) return { ...d, muscles: [...filtered, muscle] };
                                return { ...d, muscles: filtered };
                              });
                              setCustomDays(updated);
                            }
                          }}
                        >
                          <div className="cs-day-header">
                            <span className="cs-day-label">{day.label}</span>
                            <span className="cs-day-count">{day.muscles.length} muscle{day.muscles.length !== 1 ? "s" : ""}</span>
                          </div>
                          <div className="cs-muscle-chips">
                            {day.muscles.map(muscle => {
                              const isSelected = selectedMuscle?.dayIdx === dayIdx && selectedMuscle?.muscle === muscle;
                              return (
                                <span
                                  key={muscle}
                                  className={`cs-muscle-chip${isSelected ? " is-selected" : ""}`}
                                  draggable
                                  onDragStart={(e) => e.dataTransfer.setData("text/plain", muscle)}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isSelected) {
                                      setSelectedMuscle(null);
                                    } else {
                                      setSelectedMuscle({ dayIdx, muscle });
                                      setAddingToDayIdx(null);
                                    }
                                  }}
                                >
                                  {muscle}
                                  <button
                                    type="button"
                                    className="cs-chip-remove"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const updated = customDays.map((d, i) =>
                                        i === dayIdx ? { ...d, muscles: d.muscles.filter(m => m !== muscle) } : d
                                      );
                                      setCustomDays(updated);
                                      setSelectedMuscle(null);
                                    }}
                                    aria-label={`Remove ${muscle}`}
                                  >×</button>
                                </span>
                              );
                            })}
                            {/* Add muscle button */}
                            <button
                              type="button"
                              className="cs-add-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMuscle(null);
                                setAddingToDayIdx(addingToDayIdx === dayIdx ? null : dayIdx);
                              }}
                            >+</button>
                          </div>
                          {/* Add muscle dropdown */}
                          {addingToDayIdx === dayIdx && (() => {
                            const availableMuscles = ALL_MUSCLES.filter(m => !day.muscles.includes(m));
                            return availableMuscles.length > 0 ? (
                              <div className="cs-dropdown">
                                {availableMuscles.map(m => (
                                  <button
                                    key={m}
                                    type="button"
                                    className="cs-dropdown-item"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const updated = customDays.map((d, i) =>
                                        i === dayIdx ? { ...d, muscles: [...d.muscles, m] } : d
                                      );
                                      setCustomDays(updated);
                                      setAddingToDayIdx(null);
                                    }}
                                  >
                                    {m}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="cs-add-empty">All muscles already assigned to this day.</p>
                            );
                          })()}
                        </div>
                      ))}
                    </div>

                    {/* Unassigned muscles — draggable back into any day */}
                    {unassignedMuscles.length > 0 && (
                      <div className="cs-unassigned">
                        <p className="cs-unassigned-label">Not assigned — drag into a day or tap to select a destination:</p>
                        <div className="cs-muscle-chips">
                          {unassignedMuscles.map(m => (
                            <span
                              key={m}
                              className={`cs-muscle-chip is-unassigned${selectedMuscle?.muscle === m && selectedMuscle?.dayIdx === -1 ? " is-selected" : ""}`}
                              draggable
                              onDragStart={(e) => e.dataTransfer.setData("text/plain", m)}
                              onClick={() => {
                                if (selectedMuscle?.muscle === m && selectedMuscle?.dayIdx === -1) {
                                  setSelectedMuscle(null);
                                } else {
                                  setSelectedMuscle({ dayIdx: -1, muscle: m });
                                }
                              }}
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="cs-footer">
                      <button
                        type="button"
                        className={`primary-button${unassignedMuscles.length > 0 ? " is-disabled" : ""}`}
                        disabled={unassignedMuscles.length > 0}
                        onClick={() => {
                          onApplyCustomSplit?.(customDays);
                          setShowCustomSplit(false);
                          setSelectedMuscle(null);
                          setAddingToDayIdx(null);
                        }}
                      >
                        {unassignedMuscles.length > 0 ? `Assign all muscles first (${unassignedMuscles.length} remaining)` : "Apply & Regenerate"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}
      <div style={repiqPlan && plannerMode === "repiq" ? { display: "none" } : undefined}>

      {/* ── Try RepIQ strip — only shown when no plan ── */}
      {!repiqPlan && (
        <div className="planner-repiq-strip">
          <div className="planner-repiq-strip-left">
            <span className="planner-repiq-strip-eyebrow">✦ REPIQ PLAN</span>
            <p className="planner-repiq-strip-body">Get a personalised programme built around your goal and schedule.</p>
          </div>
          <button
            type="button"
            className="planner-repiq-strip-btn"
            onClick={() => {
              if (onTryRepIQPlan) {
                onTryRepIQPlan();
                setPlannerMode("repiq");
              } else {
                onViewChange("generate");
              }
            }}
          >
            Try it →
          </button>
        </div>
      )}

      <section className="planner-actions-strip">
        <div className="planner-top-actions-row">
          <button
            className="planner-top-action planner-top-action-generate"
            type="button"
            onClick={() => onViewChange("generate")}
          >
            Generate Session
          </button>
          <button
            className="planner-top-action planner-top-action-quick"
            type="button"
            onClick={onStartEmpty}
            disabled={hasActiveWorkout}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true" style={{flexShrink:0, filter:"drop-shadow(0 0 3px rgba(251,113,20,0.55))"}}>
              <defs>
                <linearGradient id="planner-flame" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#facc15"/>
                  <stop offset="50%" stopColor="#f97316"/>
                  <stop offset="100%" stopColor="#ef4444"/>
                </linearGradient>
              </defs>
              <path d="M7.5 1L2 7.5h4.5L5 12l6.5-7H7L7.5 1z" fill="url(#planner-flame)"/>
            </svg>
            Quick
          </button>
        </div>
      </section>

      <div className="planner-tabs" role="tablist" aria-label="Workout planner sections">
        <div className="planner-tabs-track">
          <button
            type="button"
            className={activeView === "mine" ? "is-active" : ""}
            aria-selected={activeView === "mine"}
            onClick={() => onViewChange("mine")}
          >
            My Workouts{plans.length > 0 ? ` (${plans.length})` : ""}
          </button>
          <button
            type="button"
            className={activeView === "library" ? "is-active" : ""}
            aria-selected={activeView === "library"}
            onClick={() => onViewChange("library")}
          >
            Library
          </button>
        </div>
      </div>

      <section className="planner-section">
        {activeView === "mine" ? (
          <>
            {existingTags.length > 0 && (
              <div className="plan-tag-filter">
                <input
                  className="plan-tag-search"
                  placeholder="Filter by tag…"
                  value={tagFilterSearch}
                  onChange={(e) => setTagFilterSearch(e.target.value)}
                />
                <div className="plan-tag-chip-row">
                  {(() => {
                    const trimmed = tagFilterSearch.trim().toLowerCase();
                    // Active filters first, then rest alphabetically
                    const ordered = [
                      ...activeTagFilter.filter((t) => existingTags.includes(t)),
                      ...existingTags.filter((t) => !activeTagFilter.includes(t))
                    ];
                    return (trimmed ? ordered.filter((t) => t.toLowerCase().includes(trimmed)) : ordered).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={`generate-chip${activeTagFilter.includes(tag) ? " is-selected" : ""}`}
                        onClick={() =>
                          setActiveTagFilter((prev) =>
                            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                          )
                        }
                      >
                        {tag}
                      </button>
                    ));
                  })()}
                </div>
              </div>
            )}
            {(() => {
              const visiblePlans = activeTagFilter.length > 0
                ? plans.filter((p) => activeTagFilter.some((t) => p.userTags?.includes(t)))
                : plans;
              return visiblePlans.length === 0 ? (
                <div className="planner-empty">
                  <p className="planner-empty-title">
                    {plans.length === 0 ? "No routines yet" : "No workouts match the selected tags"}
                  </p>
                  <p className="planner-empty-sub">
                    {plans.length === 0
                      ? "Create your first workout template, or use Generate Workout to draft one for you."
                      : "Try selecting different tags or clear the filter."}
                  </p>
                </div>
              ) : (
                <div className="plan-list">
                  <p className="planner-list-count">{visiblePlans.length} {visiblePlans.length === 1 ? "workout" : "workouts"}</p>
                  {visiblePlans.map((plan, idx) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      isTemplate={false}
                      library={library}
                      position={idx + 1}
                      draggable={activeTagFilter.length === 0}
                      onOpen={() => { setDetailPlan(plan); setDetailIsTemplate(false); }}
                      onDragStart={() => setDragPlanId(plan.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (dragPlanId) onReorderPlans(dragPlanId, plan.id);
                        setDragPlanId(null);
                      }}
                      onEdit={() => onEditPlan(plan)}
                      onShare={() => void onSharePlan(plan)}
                      onEditTags={() => onEditTags(plan)}
                      onDuplicate={() => onDuplicatePlan(plan)}
                      onDelete={SAMPLE_PLAN_IDS.has(plan.id) ? undefined : () => setDeletingPlanId(plan.id)}
                    />
                  ))}
                </div>
              );
            })()}
          </>
        ) : (
          <>
            {/* Filter tray — compact summary + open button */}
            <div className="lib-filter-tray">
              <button
                type="button"
                className="lib-filter-open-btn"
                onClick={() => {
                  setLibDraftCategory(libCategory);
                  setLibDraftLevel(libLevel);
                  setLibDraftGoal(libGoal);
                  setLibDraftEquipment(libEquipment);
                  setLibFilterFocus(null);
                  setLibFilterOpen(true);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M1 3h12M3 7h8M5 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Filters
              </button>
              <div className="lib-filter-tray-pills">
                {([
                  { label: "Type", value: libCategory, clear: () => setLibCategory(null) },
                  { label: "Level", value: libLevel, clear: () => setLibLevel(null) },
                  { label: "Goal", value: libGoal, clear: () => setLibGoal(null) },
                  { label: "Equipment", value: libEquipment, clear: () => setLibEquipment(null) },
                ] as { label: string; value: string | null; clear: () => void }[])
                  .sort((a, b) => (a.value ? -1 : b.value ? 1 : 0))
                  .map(({ label, value, clear }) => (
                  <button
                    key={label}
                    type="button"
                    className={`lib-filter-pill${value ? " is-active" : ""}`}
                    onClick={() => {
                      setLibDraftCategory(libCategory);
                      setLibDraftLevel(libLevel);
                      setLibDraftGoal(libGoal);
                      setLibDraftEquipment(libEquipment);
                      setLibFilterFocus(label);
                      setLibFilterOpen(true);
                    }}
                  >
                    <span className="lib-filter-pill-key">{label}</span>
                    <span className="lib-filter-pill-sep">:</span>
                    <span className="lib-filter-pill-val">{value ?? "none"}</span>
                    {value && (
                      <span
                        className="lib-filter-pill-clear"
                        role="button"
                        aria-label={`Clear ${label} filter`}
                        onClick={(e) => { e.stopPropagation(); clear(); }}
                      >×</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <p className="planner-section-hint">
              {visibleTemplates.length} {visibleTemplates.length === 1 ? "template" : "templates"} — tap to preview and start.
            </p>
            {visibleTemplates.length === 0 ? (
              <div className="planner-empty">
                <p className="planner-empty-title">No templates match</p>
                <p className="planner-empty-sub">Try adjusting the filters above.</p>
              </div>
            ) : (
              <div className="plan-template-grid">
                {visibleTemplates.map((template) => (
                  <PlanCard
                    key={template.id}
                    plan={template}
                    isTemplate={true}
                    library={library}
                    onOpen={() => { setDetailPlan(template); setDetailIsTemplate(true); }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <button
        className={`planner-fab${hasActiveWorkout ? " has-tray" : ""}`}
        type="button"
        onClick={onCreateNew}
        aria-label="Create workout"
      >
        +
      </button>

      {/* Filter overlay */}
      {libFilterOpen && (
        <div className="lib-filter-overlay" onClick={libFilterFocus ? () => setLibFilterOpen(false) : applyFiltersAndClose}>
          <div className="lib-filter-sheet" onClick={(e) => e.stopPropagation()}>
            <header className="lib-filter-sheet-header">
              <h2 className="lib-filter-sheet-title">{libFilterFocus ?? "Filters"}</h2>
              <button type="button" className="lib-filter-sheet-close" onClick={libFilterFocus ? () => setLibFilterOpen(false) : applyFiltersAndClose}>×</button>
            </header>
            <div className="lib-filter-sheet-body">
              {filterVisibleDefs.map(({ label, options, draftValue, realSet, draftSet }) => (
                <div key={label} className="lib-filter-sheet-section">
                  {!libFilterFocus && <p className="lib-filter-sheet-section-label">{label}</p>}
                  <div className="lib-filter-sheet-chips">
                    {options.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        className={`generate-chip${draftValue === opt ? " is-selected" : ""}`}
                        onClick={() => {
                          const newVal = draftValue === opt ? null : opt;
                          if (libFilterFocus) {
                            realSet(newVal);
                            setLibFilterOpen(false);
                          } else {
                            draftSet(newVal);
                          }
                        }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {!libFilterFocus && (
              <div className="lib-filter-sheet-footer">
                <button
                  type="button"
                  className="lib-filter-clear-btn"
                  onClick={() => { setLibDraftCategory(null); setLibDraftLevel(null); setLibDraftGoal(null); setLibDraftEquipment(null); }}
                >
                  Clear all
                </button>
                <button type="button" className="primary-button lib-filter-apply-btn" onClick={applyFiltersAndClose}>
                  Show {draftVisibleCount} {draftVisibleCount === 1 ? "template" : "templates"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
      {savedToast && (
        <div className="repiq-saved-toast">Saved to My Workouts</div>
      )}
      {deletingPlanId && (() => {
        const plan = plans.find((p) => p.id === deletingPlanId);
        return (
          <div className="plan-delete-confirm-overlay" onClick={() => setDeletingPlanId(null)}>
            <div className="plan-delete-confirm-sheet" onClick={(e) => e.stopPropagation()}>
              <p className="plan-delete-confirm-title">Delete "{plan?.name}"?</p>
              <p className="plan-delete-confirm-body">This workout will be permanently removed. You can&apos;t undo this.</p>
              <div className="plan-delete-confirm-actions">
                <button type="button" className="secondary-button" onClick={() => setDeletingPlanId(null)}>Cancel</button>
                <button type="button" className="danger-button" onClick={() => { const id = deletingPlanId; setDeletingPlanId(null); onDeletePlan(id); }}>Delete</button>
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}

function PlanTagPicker({
  value,
  existingTags,
  createLabel,
  onChange,
  searchValue,
  onSearchChange,
}: {
  value: string[];
  existingTags: string[];
  createLabel?: string;
  onChange: (tags: string[]) => void;
  searchValue?: string;
  onSearchChange?: (s: string) => void;
}) {
  const [internalSearch, setInternalSearch] = useState("");
  const search = searchValue ?? internalSearch;
  const setSearch = onSearchChange ?? setInternalSearch;
  const trimmed = search.trim();

  const allTags = [...new Set([...existingTags, ...value])].sort((a, b) => a.localeCompare(b));
  // Selected tags shown first, then unselected alphabetically
  const ordered = [...value.filter((t) => allTags.includes(t)), ...allTags.filter((t) => !value.includes(t))];
  const filtered = trimmed ? ordered.filter((t) => t.toLowerCase().includes(trimmed.toLowerCase())) : ordered;
  const canCreate = trimmed.length > 0 && !allTags.some((t) => t.toLowerCase() === trimmed.toLowerCase());

  function toggle(tag: string) {
    onChange(value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag]);
  }

  function createAndAdd() {
    if (!trimmed) return;
    onChange([...value, trimmed]);
    setSearch("");
  }

  return (
    <div className="plan-tag-picker">
      <input
        className="plan-tag-search"
        placeholder="Search or create a tag…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && canCreate) { e.preventDefault(); createAndAdd(); } }}
      />
      <div className="plan-tag-chip-row">
        {filtered.map((tag) => (
          <button
            key={tag}
            type="button"
            className={`generate-chip${value.includes(tag) ? " is-selected" : ""}`}
            onClick={() => toggle(tag)}
          >
            {tag}
          </button>
        ))}
        {canCreate && (
          <button type="button" className="generate-chip plan-tag-create-chip" onClick={createAndAdd}>
            {createLabel ?? "+ New"} {trimmed}
          </button>
        )}
        {filtered.length === 0 && !canCreate && (
          <span className="plan-tag-empty">Type a name to create your first tag.</span>
        )}
      </div>
    </div>
  );
}

function PlanBuilderPage({
  draft,
  mode,
  library,
  existingTags,
  onBack,
  onChange,
  onAddExercise,
  onSavePlan,
  onStartNow,
  onDeletePlan,
  onShuffle,
  onOpenExerciseDetails,
  resolvedTheme,
  onToggleTheme,
}: {
  draft: WorkoutPlan;
  mode: PlanBuilderMode;
  library: ExerciseDraft[];
  existingTags: string[];
  onBack: () => void;
  onChange: (plan: WorkoutPlan) => void;
  onAddExercise: () => void;
  onSavePlan: (plan: WorkoutPlan) => void;
  onStartNow?: (plan: WorkoutPlan) => void;
  onDeletePlan?: () => void;
  onShuffle?: () => void;
  onOpenExerciseDetails: (exerciseId: string) => void;
  resolvedTheme: string;
  onToggleTheme: () => void;
}) {
  const [dragExerciseId, setDragExerciseId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // Collapse all cards when the exercise list is replaced (e.g. shuffle regenerates)
  const prevDraftIdRef = useRef(draft.id);
  useEffect(() => {
    if (draft.id !== prevDraftIdRef.current) {
      setExpandedIds(new Set());
      prevDraftIdRef.current = draft.id;
    }
  }, [draft.id]);
  const resolvedTitle =
    mode === "generate" ? "Review Workout" : mode === "edit" ? "Edit Workout" : "New Workout";
  const canSave = draft.exercises.length > 0;

  const resolvedExercises = draft.exercises
    .map((planned) => {
      const exercise = library.find((entry) => entry.id === planned.exerciseId);
      return exercise ? { planned, exercise } : null;
    })
    .filter((entry): entry is { planned: PlannedExercise; exercise: ExerciseDraft } => entry !== null);

  function updateDraft(patch: Partial<WorkoutPlan>) {
    onChange({
      ...draft,
      ...patch,
      updatedAt: new Date().toISOString()
    });
  }

  function moveExercise(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const sourceIndex = draft.exercises.findIndex((e) => e.exerciseId === sourceId);
    const targetIndex = draft.exercises.findIndex((e) => e.exerciseId === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;
    const reordered = [...draft.exercises];
    const [item] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, item);
    updateDraft({ exercises: reordered });
  }

  function removeExercise(exerciseId: string) {
    updateDraft({ exercises: draft.exercises.filter((pe) => pe.exerciseId !== exerciseId) });
  }

  function updatePlannedExercise(exerciseId: string, patch: Partial<PlannedExercise>) {
    updateDraft({
      exercises: draft.exercises.map((pe) =>
        pe.exerciseId === exerciseId ? { ...pe, ...patch } : pe
      )
    });
  }

  function getEffectiveSetTypes(pe: PlannedExercise): DraftSetType[] {
    if (pe.setTypes && pe.setTypes.length === pe.setCount) return pe.setTypes;
    return Array.from({ length: pe.setCount }, () => "normal" as DraftSetType);
  }

  function addSet(exerciseId: string) {
    const pe = draft.exercises.find((e) => e.exerciseId === exerciseId);
    if (!pe) return;
    const types = getEffectiveSetTypes(pe);
    updatePlannedExercise(exerciseId, { setCount: pe.setCount + 1, setTypes: [...types, "normal"] });
  }

  function removeSet(exerciseId: string, index: number) {
    const pe = draft.exercises.find((e) => e.exerciseId === exerciseId);
    if (!pe || pe.setCount <= 1) return;
    const types = getEffectiveSetTypes(pe).filter((_, i) => i !== index);
    updatePlannedExercise(exerciseId, { setCount: pe.setCount - 1, setTypes: types });
  }

  function cycleSetType(exerciseId: string, index: number) {
    const pe = draft.exercises.find((e) => e.exerciseId === exerciseId);
    if (!pe) return;
    const order: DraftSetType[] = ["normal", "warmup", "drop", "restpause", "failure"];
    const types = getEffectiveSetTypes(pe);
    const current = types[index] ?? "normal";
    types[index] = order[(order.indexOf(current) + 1) % order.length];
    updatePlannedExercise(exerciseId, { setTypes: [...types] });
  }

  function builderSetLabel(types: DraftSetType[], index: number): string {
    const type = types[index] ?? "normal";
    if (type === "normal") {
      return String(types.slice(0, index + 1).filter((t) => t === "normal").length);
    }
    return setTypeOptions.find((o) => o.value === type)?.symbol ?? "#";
  }

  return (
    <main className="planner-page is-builder">
      <header className="planner-topbar">
        <button className="back-nav-button" type="button" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div className="planner-topbar-copy">
          <h1>{resolvedTitle}</h1>
        </div>
        <button type="button" className="theme-toggle-btn" onClick={onToggleTheme} aria-label="Toggle theme">
          {resolvedTheme === "dark" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
        </button>
      </header>

      <div className="plan-detail-actions-top">
        {/* Generate mode: primary action is Start Now, secondary is Save */}
        {mode === "generate" && onStartNow ? (
          <>
            <button
              className="secondary-button plan-detail-action-btn"
              type="button"
              disabled={!canSave}
              onClick={() => onSavePlan(draft)}
            >
              Save
            </button>
            <button
              className="primary-button plan-detail-action-btn"
              type="button"
              disabled={!canSave}
              onClick={() => onStartNow(draft)}
              style={{ flex: 2 }}
            >
              ▶ Start Now
            </button>
          </>
        ) : (
          <button
            className="primary-button plan-detail-action-btn"
            type="button"
            disabled={!canSave}
            onClick={() => onSavePlan(draft)}
          >
            {mode === "edit" ? "Save Changes" : "Save Workout"}
          </button>
        )}
        {mode === "edit" && onDeletePlan && (
          <button
            type="button"
            className="danger-button plan-detail-manage-btn"
            onClick={onDeletePlan}
          >
            Delete
          </button>
        )}
      </div>

      <section className="planner-section planner-builder-section">
        <div className="builder-form">
          <div className="builder-form-field">
            <label className="builder-form-label" htmlFor="plan-name">Name</label>
            <input
              id="plan-name"
              className="builder-form-input"
              value={draft.name}
              onChange={(event) => updateDraft({ name: event.target.value })}
              placeholder="e.g. Upper Push, Leg Day…"
            />
          </div>

          <div className="builder-form-field">
            <label className="builder-form-label" htmlFor="plan-note">Note <span className="builder-form-optional">optional</span></label>
            <input
              id="plan-note"
              className="builder-form-input"
              value={draft.note ?? ""}
              onChange={(event) => updateDraft({ note: event.target.value })}
              placeholder="Focus, equipment, intent…"
            />
          </div>

          <div className="builder-form-field">
            <label className="builder-form-label">Tags <span className="builder-form-optional">optional</span></label>
            <PlanTagPicker
              value={draft.userTags ?? []}
              existingTags={existingTags}
              createLabel="+ New"
              onChange={(userTags) => updateDraft({ userTags })}
            />
          </div>
        </div>

        <div className="planner-builder-summary">
          <p className="planner-routine-count">
            {draft.exercises.length} {draft.exercises.length === 1 ? "exercise" : "exercises"}
          </p>
          {mode === "generate" && onShuffle && (
            <button
              className="builder-shuffle-btn"
              type="button"
              onClick={onShuffle}
              title="Get a different set of exercises"
            >
              ↻ Shuffle
            </button>
          )}
        </div>

        {resolvedExercises.length === 0 ? (
          <div className="planner-builder-stub">
            <p className="planner-empty-title">No exercises yet</p>
            <p className="planner-empty-sub">Add exercises below to build your workout.</p>
          </div>
        ) : (
          <div className="plan-list">
            {resolvedExercises.map(({ planned, exercise }, cardIdx) => {
              const setTypes = getEffectiveSetTypes(planned);
              const isExpanded = expandedIds.has(planned.exerciseId);
              const workingSets = setTypes.filter(t => t !== "warmup").length;
              const warmupSets = setTypes.filter(t => t === "warmup").length;
              const setsSummary = warmupSets > 0
                ? `${warmupSets}W + ${workingSets} sets`
                : `${workingSets} set${workingSets !== 1 ? "s" : ""}`;
              const restSummary = planned.restTimer
                ? `${planned.restTimer}s rest`
                : "";
              return (
                <article
                  key={planned.exerciseId}
                  className={`builder-exercise-card${isExpanded ? " is-expanded" : ""}`}
                  draggable={!isExpanded}
                  onDragStart={() => !isExpanded && setDragExerciseId(planned.exerciseId)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragExerciseId) moveExercise(dragExerciseId, planned.exerciseId);
                    setDragExerciseId(null);
                  }}
                >
                  <div className="builder-ex-header" onClick={() => {
                    setExpandedIds(prev => {
                      const next = new Set(prev);
                      if (next.has(planned.exerciseId)) next.delete(planned.exerciseId);
                      else next.add(planned.exerciseId);
                      return next;
                    });
                  }} style={{ cursor: "pointer" }}>
                    <div className="builder-ex-title-area">
                      {!isExpanded && <span className="builder-ex-drag" aria-hidden="true">⋮⋮</span>}
                      <div className="builder-ex-copy">
                        <div className="builder-ex-name-row">
                          <span className="builder-ex-num">{cardIdx + 1}</span>
                          <button
                            type="button"
                            className="builder-ex-name"
                            onClick={(e) => { e.stopPropagation(); onOpenExerciseDetails(exercise.id); }}
                          >
                            {exercise.name}
                          </button>
                        </div>
                        <p className="builder-ex-muscle">{exercise.primaryMuscles?.join(", ") || exercise.primaryMuscle}</p>
                        {!isExpanded && (
                          <p className="builder-ex-summary">{setsSummary}{restSummary ? ` · ${restSummary}` : ""}</p>
                        )}
                      </div>
                    </div>
                    <div className="builder-ex-header-right">
                      {isExpanded && (
                        <button className="builder-remove-btn" type="button" onClick={(e) => { e.stopPropagation(); removeExercise(planned.exerciseId); }} aria-label="Remove exercise">×</button>
                      )}
                      <span className="builder-ex-chevron" aria-hidden="true">{isExpanded ? "∧" : "∨"}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <>
                      <div className="builder-ex-rest-row">
                        <span className="builder-ex-rest-label">Rest</span>
                        <input
                          className="builder-ex-rest-input"
                          type="text"
                          inputMode="numeric"
                          value={planned.restTimer}
                          onChange={(e) => updatePlannedExercise(planned.exerciseId, { restTimer: e.target.value.replace(/\D/g, "") })}
                          aria-label="Rest seconds"
                        />
                        <span className="builder-ex-rest-unit">sec</span>
                      </div>

                      <div className="builder-set-list">
                        <div className="builder-set-header">
                          <span>SET</span>
                          <span>TYPE</span>
                        </div>
                        {setTypes.map((type, i) => (
                          <div key={i} className="builder-set-row">
                            <button
                              type="button"
                              className={`builder-set-label builder-set-label--${type}`}
                              onClick={() => cycleSetType(planned.exerciseId, i)}
                              title="Tap to change set type"
                            >
                              {builderSetLabel(setTypes, i)}
                            </button>
                            <span className="builder-set-type-name">{setTypeOptions.find((o) => o.value === type)?.label ?? "Working set"}</span>
                            <button type="button" className="builder-set-remove" onClick={() => removeSet(planned.exerciseId, i)} aria-label="Remove set">−</button>
                          </div>
                        ))}
                      </div>

                      <button type="button" className="builder-add-set-btn" onClick={() => addSet(planned.exerciseId)}>+ Add Set</button>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        )}

        <button
          className="secondary-button builder-add-exercise-btn"
          type="button"
          onClick={onAddExercise}
        >
          + Add Exercise
        </button>
      </section>

    </main>
  );
}

function ExerciseDetailPage({
  exercise,
  activeTab,
  initialScrollTarget,
  onTabChange,
  onBack,
  customActions,
  resolvedTheme,
  onToggleTheme,
  onBrowseExercises,
}: {
  exercise: ExerciseDraft;
  activeTab: DetailTab;
  initialScrollTarget: "top" | "bottom";
  onTabChange: (tab: DetailTab) => void;
  onBack: () => void;
  customActions?: {
    deleteMode: "delete" | "archive";
    onEdit: () => void;
    onDeleteOrArchive: () => void;
  } | null;
  resolvedTheme?: string;
  onToggleTheme?: () => void;
  onBrowseExercises?: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [manageConfirmOpen, setManageConfirmOpen] = useState(false);
  const measurementType = getExerciseMeasurementType(exercise);
  const recentHistory = [...exercise.history].reverse();
  const engagementCopy = buildMuscleEngagementCopy(exercise);
  const lastSession = recentHistory[0];
  const bestWorkingSet = [...(lastSession?.sets ?? [])]
    .filter((set) => set.set_type === "normal")
    .sort((a, b) => b.weight - a.weight)[0];
  const weightTrend = exercise.history.map(
    (session) =>
      [...session.sets].filter((set) => set.set_type === "normal").sort((a, b) => b.weight - a.weight)[0]?.weight ?? 0
  );
  const volumeTrend = exercise.history.map((session) =>
    session.sets.reduce((total, set) => total + set.weight * set.reps, 0)
  );
  const oneRmTrend = exercise.history.map((session) =>
    estimateOneRm(
      [...session.sets]
        .filter((set) => set.set_type === "normal")
        .sort((a, b) => estimateOneRm(b) - estimateOneRm(a))[0]
    )
  );
  const hasHistory = recentHistory.length > 0;
  const exerciseInsight = buildExerciseInsight(weightTrend, volumeTrend, oneRmTrend);

  useEffect(() => {
    if (initialScrollTarget !== "bottom") {
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    window.requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end"
      });
    });
  }, [exercise.id, initialScrollTarget]);

  return (
    <main className="detail-page">
      <header className="detail-topbar">
        <button className="back-nav-button detail-back-button" type="button" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div className="detail-topbar-copy">
          <h1>{exercise.name}</h1>
          <p>{exercise.primaryMuscle}</p>
        </div>
        {customActions ? (
          <div className="detail-topbar-manage">
            <button className="detail-manage-button" type="button" onClick={customActions.onEdit}>
              Edit
            </button>
            <button
              className="detail-manage-button is-danger"
              type="button"
              onClick={() => setManageConfirmOpen(true)}
            >
              {customActions.deleteMode === "archive" ? "Hide" : "Delete"}
            </button>
          </div>
        ) : resolvedTheme && onToggleTheme ? (
          <button type="button" className="theme-toggle-btn" onClick={onToggleTheme} aria-label="Toggle theme">
            {resolvedTheme === "dark" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
          </button>
        ) : (
          <span className="detail-topbar-spacer" aria-hidden="true" />
        )}
      </header>

      <nav className="detail-tabs">
        <button
          className={activeTab === "summary" ? "is-active" : ""}
          type="button"
          onClick={() => onTabChange("summary")}
        >
          Summary
        </button>
        <button
          className={activeTab === "history" ? "is-active" : ""}
          type="button"
          onClick={() => onTabChange("history")}
        >
          History
        </button>
        <button
          className={activeTab === "howto" ? "is-active" : ""}
          type="button"
          onClick={() => onTabChange("howto")}
        >
          How To
        </button>
      </nav>

      {activeTab === "summary" && (
        <section className="detail-section">
          <div className="detail-hero">
            <img src={exercise.imageSrc} alt={exercise.name} className="detail-image" />
          </div>

          <div className="detail-muscles-card">
            <div className="detail-muscles-row">
              <span className="detail-muscles-label">Primary</span>
              <div className="detail-muscle-chips">
                {(exercise.primaryMuscles ?? [exercise.primaryMuscle]).map((m) => (
                  <span key={m} className="detail-muscle-chip is-primary">{m}</span>
                ))}
              </div>
            </div>
            {exercise.secondaryMuscles.length > 0 && (
              <div className="detail-muscles-row">
                <span className="detail-muscles-label">Secondary</span>
                <div className="detail-muscle-chips">
                  {exercise.secondaryMuscles.map((m) => (
                    <span key={m} className="detail-muscle-chip">{m}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="detail-meta-pills">
            <span className="detail-meta-pill">{getExerciseTypeLabel(inferExerciseType(exercise))}</span>
            <span className="detail-meta-pill">{measurementType === "timed" ? "Timed" : measurementType === "weight_timed" ? "Weight + timed" : "Reps & volume"}</span>
            {exercise.movementSide && (
              <span className="detail-meta-pill">{exercise.movementSide === "unilateral" ? "Unilateral" : "Bilateral"}</span>
            )}
            {(exercise as ExerciseWithTaxonomy).movementPattern && (
              <span className="detail-meta-pill detail-meta-pill--pattern">
                {((exercise as ExerciseWithTaxonomy).movementPattern ?? "").replace(/_/g, " ")}
              </span>
            )}
          </div>

          {onBrowseExercises && (
            <button type="button" className="detail-browse-link" onClick={onBrowseExercises}>
              Browse all exercises →
            </button>
          )}

          <div className="chart-card">
            <div className="chart-copy">
              <h3>Muscles Engaged</h3>
              <span>How this movement should feel when it is working well</span>
            </div>
            <div className="detail-explanation-list">
              {engagementCopy.map((paragraph) => (
                <p key={paragraph} className="detail-explanation-copy">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeTab === "history" && (
        <section className="detail-section">
          {hasHistory ? (
            <>
              <div className="detail-metrics">
                <article className="detail-metric">
                  <span>Heaviest Weight</span>
                  <strong>{Math.max(...weightTrend)}kg</strong>
                </article>
                <article className="detail-metric">
                  <span>Best 1RM</span>
                  <strong>{Math.max(...oneRmTrend)}kg</strong>
                </article>
                <article className="detail-metric">
                  <span>Last Volume</span>
                  <strong>{volumeTrend.at(-1)?.toFixed(0)}kg</strong>
                </article>
              </div>

              <div className="chart-card">
                <div className="chart-copy">
                  <h3>Highest Weight</h3>
                  <span>Recent sessions</span>
                </div>
                <svg viewBox="0 0 260 92" className="trend-chart" aria-hidden="true">
                  <path d={buildSparkline(weightTrend)} />
                </svg>
              </div>

              <div className="chart-card">
                <div className="chart-copy">
                  <h3>One Rep Max</h3>
                  <span>Estimated from best working set</span>
                </div>
                <svg viewBox="0 0 260 92" className="trend-chart" aria-hidden="true">
                  <path d={buildSparkline(oneRmTrend)} />
                </svg>
              </div>

              <div className="chart-card">
                <div className="chart-copy">
                  <h3>Volume History</h3>
                  <span>Session volume trend</span>
                </div>
                <svg viewBox="0 0 260 92" className="trend-chart" aria-hidden="true">
                  <path d={buildSparkline(volumeTrend)} />
                </svg>
              </div>

              {exerciseInsight && (
                <div className={`exercise-insight-card tone-${exerciseInsight.tone}`}>
                  <div className="exercise-insight-header">
                    <span className="exercise-insight-label">Performance insight</span>
                    <span className="exercise-insight-badge">Based on your history</span>
                  </div>
                  <p className="exercise-insight-headline">{exerciseInsight.headline}</p>
                  <p className="exercise-insight-detail">{exerciseInsight.detail}</p>
                </div>
              )}

              <div className="history-list">
                {recentHistory.map((session) => (
                  <article key={session.session_key ?? session.date} className="history-card">
                    <div className="history-top">
                      <strong>{formatSessionDate(session.date)}</strong>
                      <span>
                        {session.sets.reduce((total, set) => total + set.weight * set.reps, 0).toFixed(0)} kg
                      </span>
                    </div>
                    <p className="history-detail">
                      {session.sets.map((set) => formatPreviousSet(set, measurementType)).join(" • ")}
                    </p>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <article className="empty-state-card detail-empty-state">
              <strong>No history yet</strong>
              <p>
                Log this exercise in a workout first, and RepIQ will start showing trends, volume, and performance insights here.
              </p>
            </article>
          )}
        </section>
      )}

      {activeTab === "howto" && (
        <section className="detail-section">
          <div className="detail-hero">
            <img src={exercise.imageSrc} alt={exercise.name} className="detail-image" />
          </div>
          <div className="howto-steps">
            {exercise.howTo.map((step, index) => (
              <div key={step} className="howto-step">
                <span className="howto-step-num">{index + 1}</span>
                <p className="howto-step-text">{step}</p>
              </div>
            ))}
          </div>
          {exercise.videoLabel && (
            <a href="#" className="video-link" onClick={(event) => event.preventDefault()}>
              {exercise.videoLabel}
            </a>
          )}
        </section>
      )}

      {activeTab === "summary" && <div ref={bottomRef} />}

      {customActions && manageConfirmOpen && (
        <section className="sheet-overlay leave-center-overlay" onClick={() => setManageConfirmOpen(false)}>
          <div className="leave-center-card" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-head">
              <div>
                <p className="label">
                  {customActions.deleteMode === "archive" ? "Hide Custom Exercise" : "Delete Custom Exercise"}
                </p>
                <h3>{exercise.name}</h3>
              </div>
              <button className="icon-button" type="button" onClick={() => setManageConfirmOpen(false)}>
                ×
              </button>
            </div>
            <p className="settings-note">
              {customActions.deleteMode === "archive"
                ? "This exercise already has history, so RepIQ will hide it from the library instead of deleting it."
                : "This custom exercise will be removed from your library."}
            </p>
            <div className="custom-manage-confirm-actions">
              <div className="custom-manage-confirm-row">
                <button
                  className="secondary-button custom-manage-confirm-secondary"
                  type="button"
                  onClick={() => setManageConfirmOpen(false)}
                >
                  Cancel
                </button>
              </div>
              <button
                className="primary-button custom-manage-confirm-button"
                type="button"
                onClick={() => {
                  setManageConfirmOpen(false);
                  customActions.onDeleteOrArchive();
                }}
              >
                {customActions.deleteMode === "archive" ? "Hide from Library" : "Delete Exercise"}
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

const MEDIA_MAX_PHOTOS = 3;
const MEDIA_MAX_VIDEO_MB = 100;
const MEDIA_MAX_PHOTO_MB = 10;
const MEDIA_MAX_VIDEO_SECONDS = 30;

function formatTrimTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const CROP_OUTPUT_PX = 600;
const THEME_BG = "#f4f5f7";

// ──────────────────────────────────────────────
// SHARE CARDS
// ──────────────────────────────────────────────

function RepIQWatermark() {
  return (
    <div className="share-card-watermark" aria-hidden="true">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.3)" />
        <path d="M9 7v10l9-5-9-5z" fill="white" />
      </svg>
      <span>RepIQ</span>
    </div>
  );
}

function SummaryShareCard({ draft }: { draft: FinishWorkoutDraft }) {
  return (
    <div className="share-card share-card-summary">
      <span className="share-card-eyebrow">Workout Complete</span>
      <h2 className="share-card-title">{draft.sessionName || "Today's Workout"}</h2>
      <p className="share-card-subtitle">{formatSessionDate(draft.date)}</p>
      <div className="share-card-stats-grid">
        <div className="share-card-stat">
          <strong>{draft.duration}</strong>
          <span>Duration</span>
        </div>
        <div className="share-card-stat">
          <strong>{draft.totalVolume.toFixed(0)}<em>kg</em></strong>
          <span>Volume</span>
        </div>
        <div className="share-card-stat">
          <strong>{draft.totalSets}</strong>
          <span>Sets</span>
        </div>
        <div className="share-card-stat">
          <strong>{draft.loggedExerciseCount}</strong>
          <span>Exercises</span>
        </div>
      </div>
      <RepIQWatermark />
    </div>
  );
}

function RewardsShareCard({ draft }: { draft: FinishWorkoutDraft }) {
  const displayed = draft.rewards.slice(0, 4);
  const overflow = draft.rewards.length - displayed.length;
  return (
    <div className="share-card share-card-rewards">
      <span className="share-card-eyebrow">Achievements</span>
      <h2 className="share-card-title">
        {draft.rewardSummary.total === 1 ? "1 Reward Earned" : `${draft.rewardSummary.total} Rewards Earned`}
      </h2>
      <div className="share-card-reward-chips">
        {draft.rewardSummary.session > 0 && (
          <span className="share-card-reward-chip share-card-reward-chip-session">{rewardLevelIcon.session} {draft.rewardSummary.session} session</span>
        )}
        {draft.rewardSummary.exercise > 0 && (
          <span className="share-card-reward-chip share-card-reward-chip-exercise">{rewardLevelIcon.exercise} {draft.rewardSummary.exercise} exercise</span>
        )}
        {draft.rewardSummary.set > 0 && (
          <span className="share-card-reward-chip share-card-reward-chip-set">{rewardLevelIcon.set} {draft.rewardSummary.set} set</span>
        )}
      </div>
      <div className="share-card-reward-list">
        {displayed.map((r) => (
          <div key={r.id} className="share-card-reward-row">
            <span className="share-card-reward-icon">{rewardLevelIcon[r.level]}</span>
            <div className="share-card-reward-text">
              <strong>{r.shortLabel}</strong>
              <p>{r.detail}</p>
            </div>
          </div>
        ))}
        {overflow > 0 && <p className="share-card-reward-overflow">+{overflow} more</p>}
      </div>
      <RepIQWatermark />
    </div>
  );
}

function MusclesShareCard({ draft }: { draft: FinishWorkoutDraft }) {
  const muscleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    draft.exercises.forEach((ex) => {
      if (ex.primaryMuscle) counts[ex.primaryMuscle] = (counts[ex.primaryMuscle] || 0) + ex.loggedSets;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [draft.exercises]);
  const maxCount = muscleCounts[0]?.[1] ?? 1;

  return (
    <div className="share-card share-card-muscles">
      <span className="share-card-eyebrow">Muscles Worked</span>
      <h2 className="share-card-title">
        {muscleCounts.length} muscle {muscleCounts.length === 1 ? "group" : "groups"}
      </h2>
      <div className="share-card-muscle-list">
        {muscleCounts.map(([muscle, sets]) => (
          <div key={muscle} className="share-card-muscle-row">
            <span className="share-card-muscle-name">{muscle}</span>
            <div className="share-card-muscle-bar-track">
              <div
                className="share-card-muscle-bar-fill"
                style={{ width: `${(sets / maxCount) * 100}%` }}
              />
            </div>
            <span className="share-card-muscle-sets">{sets}s</span>
          </div>
        ))}
      </div>
      <RepIQWatermark />
    </div>
  );
}

function ExercisesShareCard({ draft }: { draft: FinishWorkoutDraft }) {
  const maxVol = Math.max(...draft.exercises.map((e) => e.loggedVolume), 1);
  const displayed = draft.exercises.slice(0, 6);
  const overflow = draft.exercises.length - displayed.length;

  return (
    <div className="share-card share-card-exercises">
      <span className="share-card-eyebrow">Exercises</span>
      <h2 className="share-card-title">{draft.exercises.length} logged</h2>
      <div className="share-card-exercise-list">
        {displayed.map((ex) => (
          <div key={ex.id} className="share-card-exercise-row">
            <div className="share-card-exercise-meta">
              <span className="share-card-exercise-name">{ex.name}</span>
              <span className="share-card-exercise-detail">
                {ex.loggedSets} {ex.loggedSets === 1 ? "set" : "sets"} · {ex.loggedVolume.toFixed(0)} kg
              </span>
            </div>
            <div className="share-card-exercise-bar-track">
              <div
                className="share-card-exercise-bar-fill"
                style={{ width: `${(ex.loggedVolume / maxVol) * 100}%` }}
              />
            </div>
          </div>
        ))}
        {overflow > 0 && <p className="share-card-exercise-overflow">+{overflow} more exercises</p>}
      </div>
      <RepIQWatermark />
    </div>
  );
}

function AchievementsShareCard({ draft }: { draft: FinishWorkoutDraft }) {
  return (
    <div className="share-card share-card-achievements">
      <span className="share-card-eyebrow">✨ What I Achieved</span>
      <h2 className="share-card-achieve-title">{draft.takeawayTitle}</h2>
      <p className="share-card-achieve-body">{draft.takeawayBody}</p>
      <div className="share-card-achieve-stats">
        <div className="share-card-achieve-stat">
          <strong>{draft.totalVolume.toFixed(0)}</strong>
          <span>kg lifted</span>
        </div>
        <div className="share-card-achieve-stat">
          <strong>{draft.totalSets}</strong>
          <span>sets done</span>
        </div>
        <div className="share-card-achieve-stat">
          <strong>{draft.loggedExerciseCount}</strong>
          <span>exercises</span>
        </div>
        {draft.rewardSummary.total > 0 && (
          <div className="share-card-achieve-stat">
            <strong>{draft.rewardSummary.total}</strong>
            <span>rewards</span>
          </div>
        )}
      </div>
      <RepIQWatermark />
    </div>
  );
}

const weightComparisons = [
  { label: "bowling balls", kg: 7.26 },
  { label: "golden retrievers", kg: 30 },
  { label: "mountain bikes", kg: 14 },
  { label: "office chairs", kg: 20 },
  { label: "car tyres", kg: 12 },
  { label: "suitcases", kg: 25 },
  { label: "watermelons", kg: 9 },
  { label: "bags of cement", kg: 50 },
  { label: "microwave ovens", kg: 13 },
  { label: "small cars", kg: 1200 },
  { label: "grand pianos", kg: 450 },
  { label: "horses", kg: 500 },
  { label: "polar bears", kg: 450 },
];

function getBestComparison(totalKg: number) {
  let best = weightComparisons[0];
  let bestCount = 0;
  for (const c of weightComparisons) {
    const count = totalKg / c.kg;
    if (count >= 1 && (bestCount === 0 || Math.abs(count - 5) < Math.abs(bestCount - 5))) {
      best = c;
      bestCount = count;
    }
  }
  return { label: best.label, count: Math.round(totalKg / best.kg) };
}

function FunWeightCard({ draft }: { draft: FinishWorkoutDraft }) {
  const { label, count } = getBestComparison(draft.totalVolume);
  return (
    <div className="share-card share-card-funweight">
      <span className="share-card-eyebrow">💪 Did You Know?</span>
      <h2 className="share-card-title">You lifted</h2>
      <div className="share-card-funweight-big">
        <strong>{draft.totalVolume.toFixed(0)}<em>kg</em></strong>
      </div>
      <p className="share-card-funweight-compare">
        That's like lifting <strong>{count} {label}</strong>!
      </p>
      <p className="share-card-funweight-sub">across {draft.totalSets} sets in {draft.duration}</p>
      <RepIQWatermark />
    </div>
  );
}

function ShareCardsStrip({ draft }: { draft: FinishWorkoutDraft }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const cards = useMemo<string[]>(() => {
    const list: string[] = ["summary"];
    if (draft.rewardSummary.total > 0) list.push("rewards");
    if (draft.exercises.some((e) => e.primaryMuscle) && draft.exercises.length > 0) list.push("muscles");
    if (draft.exercises.length > 0) list.push("exercises");
    if (draft.totalVolume > 10) list.push("funweight");
    list.push("achievements");
    return list;
  }, [draft]);

  function handleScroll() {
    if (!scrollRef.current) return;
    const sl = scrollRef.current.scrollLeft;
    const cw = scrollRef.current.offsetWidth;
    setActiveIndex(Math.round(sl / cw));
  }

  function goToCard(index: number) {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ left: index * scrollRef.current.offsetWidth, behavior: "smooth" });
  }

  async function handleShare(cardType: string) {
    const title = `${draft.sessionName} — ${cardType}`;
    const text = `Check out my workout: ${draft.sessionName} on ${formatSessionDate(draft.date)} — ${draft.totalVolume.toFixed(0)}kg across ${draft.totalSets} sets.`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text });
      } catch {
        // user dismissed
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        alert("Copied to clipboard!");
      } catch {
        // clipboard not available
      }
    }
  }

  return (
    <section className="finish-workout-card share-cards-section">
      <div className="share-cards-header">
        <p className="label">Share</p>
        {cards.length > 1 && <span className="share-cards-hint">{activeIndex + 1} / {cards.length}</span>}
      </div>
      <div ref={scrollRef} className="share-cards-scroll" onScroll={handleScroll}>
        {cards.map((cardType) => (
          <div key={cardType} className="share-card-slide">
            {cardType === "summary" && <SummaryShareCard draft={draft} />}
            {cardType === "rewards" && <RewardsShareCard draft={draft} />}
            {cardType === "muscles" && <MusclesShareCard draft={draft} />}
            {cardType === "exercises" && <ExercisesShareCard draft={draft} />}
            {cardType === "funweight" && <FunWeightCard draft={draft} />}
            {cardType === "achievements" && <AchievementsShareCard draft={draft} />}
            <button type="button" className="share-card-action-btn" onClick={() => handleShare(cardType)}>↗ Share</button>
          </div>
        ))}
      </div>
      {cards.length > 1 && (
        <div className="share-cards-dots" aria-hidden="true">
          {cards.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`share-cards-dot${i === activeIndex ? " is-active" : ""}`}
              onClick={() => goToCard(i)}
              aria-label={`Go to card ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PostSaveShareScreen({
  data,
  onDone,
  resolvedTheme,
  onToggleTheme,
}: {
  data: SavedWorkoutData;
  onDone: () => void;
  resolvedTheme?: string;
  onToggleTheme?: () => void;
}) {
  return (
    <main className="detail-page post-save-screen">
      <div className="post-save-hero">
        <div className="post-save-topbar">
          <span className="post-save-eyebrow">Saved!</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {resolvedTheme && onToggleTheme && (
              <button type="button" className="theme-toggle-btn theme-toggle-btn--ghost" onClick={onToggleTheme} aria-label="Toggle theme">
                {resolvedTheme === "dark" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
              </button>
            )}
            <button type="button" className="post-save-done-btn" onClick={onDone}>Done</button>
          </div>
        </div>
        <h1 className="post-save-title">{data.sessionName}</h1>
        <p className="post-save-subtitle">{formatSessionDate(data.date)}</p>
      </div>
      <section className="detail-section post-save-section">
        <ShareCardsStrip draft={data} />
      </section>
    </main>
  );
}

type CropMode = "crop" | "fit-width" | "fit-height";
type CropFill = "blank" | "blur" | "fill";

function CropTool({
  imageUrl,
  onCrop,
  onCancel
}: {
  imageUrl: string;
  onCrop: (croppedUrl: string) => void;
  onCancel: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [containerSize, setContainerSize] = useState(0);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [confirming, setConfirming] = useState(false);
  const [mode, setMode] = useState<CropMode>("crop");
  const [fill, setFill] = useState<CropFill>("blank");
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  function clampOffset(x: number, y: number, s: number, cSize: number, nw: number, nh: number) {
    return {
      x: Math.min(0, Math.max(cSize - nw * s, x)),
      y: Math.min(0, Math.max(cSize - nh * s, y))
    };
  }

  function handleImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    const cSize = containerRef.current?.offsetWidth ?? 300;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const s = Math.max(cSize / nw, cSize / nh);
    setNaturalSize({ w: nw, h: nh });
    setContainerSize(cSize);
    setScale(s);
    setOffset({ x: (cSize - nw * s) / 2, y: (cSize - nh * s) / 2 });
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (mode !== "crop") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.sx;
    const dy = e.clientY - dragRef.current.sy;
    setOffset(clampOffset(dragRef.current.ox + dx, dragRef.current.oy + dy, scale, containerSize, naturalSize.w, naturalSize.h));
  }

  function handlePointerUp() { dragRef.current = null; }

  // Fit mode image display dimensions (within the square container)
  const fitStyle = useMemo((): React.CSSProperties => {
    if (containerSize === 0 || naturalSize.w === 0) return { position: "absolute" };
    if (mode === "fit-width") {
      const w = containerSize;
      const h = (naturalSize.h / naturalSize.w) * containerSize;
      return { position: "absolute", left: 0, top: (containerSize - h) / 2, width: w, height: h };
    }
    // fit-height
    const h = containerSize;
    const w = (naturalSize.w / naturalSize.h) * containerSize;
    return { position: "absolute", left: (containerSize - w) / 2, top: 0, width: w, height: h };
  }, [mode, containerSize, naturalSize]);

  const frameBg = mode === "crop" || fill !== "blank" ? "transparent" : "rgba(255,255,255,0.07)";

  async function handleConfirm() {
    if (confirming || containerSize === 0) return;
    setConfirming(true);
    const O = CROP_OUTPUT_PX;
    const canvas = document.createElement("canvas");
    canvas.width = O; canvas.height = O;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setConfirming(false); return; }

    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = imageUrl; });

    const drawFit = (drawW: number, drawH: number) => {
      const x = (O - drawW) / 2;
      const y = (O - drawH) / 2;
      ctx.drawImage(img, x, y, drawW, drawH);
    };

    let mimeType: string = "image/jpeg";
    let quality: number | undefined = 0.92;

    const fitW = mode === "fit-width" ? O : (img.naturalWidth / img.naturalHeight) * O;
    const fitH = mode === "fit-width" ? (img.naturalHeight / img.naturalWidth) * O : O;

    if (mode === "crop") {
      ctx.drawImage(img, -offset.x / scale, -offset.y / scale, containerSize / scale, containerSize / scale, 0, 0, O, O);
      mimeType = "image/jpeg";
      quality = 0.92;
    } else if (fill === "blank") {
      // Transparent PNG — empty space is truly transparent, adapts to any display context
      drawFit(fitW, fitH);
      mimeType = "image/png";
    } else if (fill === "blur" || fill === "fill") {
      // Draw cover-scaled background first
      const bgScale = Math.max(O / img.naturalWidth, O / img.naturalHeight);
      const bgW = img.naturalWidth * bgScale;
      const bgH = img.naturalHeight * bgScale;
      const bgX = (O - bgW) / 2;
      const bgY = (O - bgH) / 2;
      if (fill === "blur") {
        const bgCanvas = document.createElement("canvas");
        bgCanvas.width = O; bgCanvas.height = O;
        const bgCtx = bgCanvas.getContext("2d")!;
        bgCtx.filter = "blur(22px) saturate(1.2) brightness(0.82)";
        bgCtx.drawImage(img, bgX, bgY, bgW, bgH);
        ctx.drawImage(bgCanvas, 0, 0);
      } else {
        ctx.drawImage(img, bgX, bgY, bgW, bgH);
      }
      drawFit(fitW, fitH);
      mimeType = "image/jpeg";
      quality = 0.92;
    }

    canvas.toBlob((blob) => {
      setConfirming(false);
      if (blob) onCrop(URL.createObjectURL(blob));
    }, mimeType, quality);
  }

  return (
    <div className="crop-overlay">
      <div className="crop-topbar">
        <button type="button" className="crop-cancel-btn" onClick={onCancel}>Cancel</button>
        <span className="crop-title">Adjust Photo</span>
        <button type="button" className="crop-done-btn" onClick={handleConfirm} disabled={confirming}>
          {confirming ? "…" : "Done"}
        </button>
      </div>

      <div className="crop-stage">
        <div
          ref={containerRef}
          className="crop-frame"
          style={{ background: frameBg, cursor: mode === "crop" ? undefined : "default" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Blur / fill background layer (fit modes only) */}
          {mode !== "crop" && (fill === "blur" || fill === "fill") && naturalSize.w > 0 && (
            <img
              src={imageUrl}
              style={{
                position: "absolute",
                inset: "-12%",
                width: "124%",
                height: "124%",
                objectFit: "cover",
                filter: fill === "blur" ? "blur(18px) saturate(1.2) brightness(0.82)" : "none",
                pointerEvents: "none",
                userSelect: "none"
              }}
              draggable={false}
              alt=""
            />
          )}
          {/* Main image */}
          <img
            src={imageUrl}
            onLoad={handleImageLoad}
            style={mode === "crop" ? {
              position: "absolute",
              left: offset.x, top: offset.y,
              width: naturalSize.w * scale, height: naturalSize.h * scale,
              opacity: naturalSize.w > 0 ? 1 : 0,
              userSelect: "none", touchAction: "none", pointerEvents: "none"
            } : { ...fitStyle, opacity: naturalSize.w > 0 ? 1 : 0, userSelect: "none", pointerEvents: "none" }}
            draggable={false}
            alt=""
          />
          {mode === "crop" && <div className="crop-frame-grid" aria-hidden="true" />}
          <div className="crop-frame-corners" aria-hidden="true" />
        </div>
      </div>

      {mode === "crop" && <p className="crop-hint">Drag to reposition · 1:1</p>}

      <div className="crop-mode-bar">
        {(["crop", "fit-width", "fit-height"] as CropMode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={`crop-mode-btn${mode === m ? " is-active" : ""}`}
            onClick={() => setMode(m)}
          >
            {m === "crop" ? "Crop" : m === "fit-width" ? "Fit Width" : "Fit Height"}
          </button>
        ))}
      </div>

      {mode !== "crop" && (
        <div className="crop-fill-bar">
          <span className="crop-fill-label">Fill</span>
          {(["blank", "blur", "fill"] as CropFill[]).map((f) => (
            <button
              key={f}
              type="button"
              className={`crop-fill-btn${fill === f ? " is-active" : ""}`}
              onClick={() => setFill(f)}
            >
              {f === "blank" ? "Blank" : f === "blur" ? "Blur" : "Fill"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FinishWorkoutPage({
  draft,
  onTitleChange,
  onNoteChange,
  onPersonalNoteChange,
  onQuoteNoteChange,
  onProgressPicChange,
  onBack,
  onSave,
  resolvedTheme,
  onToggleTheme,
}: {
  draft: FinishWorkoutDraft;
  onTitleChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onPersonalNoteChange: (value: string) => void;
  onQuoteNoteChange: (value: string) => void;
  onProgressPicChange: (index: number | undefined) => void;
  onBack: () => void;
  onSave: (images: WorkoutMediaAsset[]) => Promise<void>;
  resolvedTheme?: string;
  onToggleTheme?: () => void;
}) {
  // V1 decision: keep photo support visible for progress/self-reference.
  // Video stays parked behind a disabled flag until we design its real
  // persistence model for social/feed use cases.
  const finishPhotosEnabled = true;
  const finishVideoEnabled = false;
  const [exercisesExpanded, setExercisesExpanded] = useState(false);
  const [rewardsExpanded, setRewardsExpanded] = useState(false);
  const [cooldownExpanded, setCooldownExpanded] = useState(false);
  const [cooldownDismissed, setCooldownDismissed] = useState(false);
  // Each photo stores the original src (for re-editing) and the adjusted display URL
  const [photos, setPhotos] = useState<{ name: string; src: string; display: string }[]>([]);
  const [pendingCrop, setPendingCrop] = useState<{ name: string; src: string; index: number | null } | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoConfirmed, setVideoConfirmed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trimTrackRef = useRef<HTMLDivElement | null>(null);
  const trimDragRef = useRef<{
    type: "start" | "end" | "range";
    startX: number;
    startTrimStart: number;
    startTrimEnd: number;
    duration: number;
  } | null>(null);
  const playIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      photos.forEach((p) => { URL.revokeObjectURL(p.src); URL.revokeObjectURL(p.display); });
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, []);

  useEffect(() => {
    return () => { if (playIntervalRef.current !== null) clearInterval(playIntervalRef.current); };
  }, []);

  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    setMediaError(null);
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (photos.length >= MEDIA_MAX_PHOTOS) {
      setMediaError(`Maximum ${MEDIA_MAX_PHOTOS} photos allowed.`);
      return;
    }
    if (file.size > MEDIA_MAX_PHOTO_MB * 1024 * 1024) {
      setMediaError(`Photo must be under ${MEDIA_MAX_PHOTO_MB} MB.`);
      return;
    }
    setPendingCrop({ name: file.name, src: URL.createObjectURL(file), index: null });
  }

  function openPhotoEdit(index: number) {
    setPendingCrop({ name: photos[index].name, src: photos[index].src, index });
  }

  function handleCropDone(outputUrl: string) {
    if (!pendingCrop) return;
    if (pendingCrop.index === null) {
      // New photo
      setPhotos((prev) => [...prev, { name: pendingCrop.name, src: pendingCrop.src, display: outputUrl }]);
    } else {
      // Re-edit: replace display URL only, keep original src
      setPhotos((prev) => {
        const next = [...prev];
        URL.revokeObjectURL(next[pendingCrop.index!].display);
        next[pendingCrop.index!] = { ...next[pendingCrop.index!], display: outputUrl };
        return next;
      });
    }
    setPendingCrop(null);
  }

  function handleCropCancel() {
    // If new photo (not re-edit), revoke the src we created
    if (pendingCrop?.index === null) URL.revokeObjectURL(pendingCrop.src);
    setPendingCrop(null);
  }

  function removePhoto(index: number) {
    const p = photos[index];
    URL.revokeObjectURL(p.src);
    URL.revokeObjectURL(p.display);
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setMediaError(null);
  }

  function handleVideoChange(event: React.ChangeEvent<HTMLInputElement>) {
    setMediaError(null);
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MEDIA_MAX_VIDEO_MB * 1024 * 1024) {
      setMediaError(`Video must be under ${MEDIA_MAX_VIDEO_MB} MB.`);
      event.target.value = "";
      return;
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideo(file);
    setVideoUrl(url);
    setTrimStart(0);
    setTrimEnd(0);
    setVideoDuration(0);
    event.target.value = "";
  }

  function handleVideoMetadata() {
    if (!videoRef.current) return;
    const dur = videoRef.current.duration;
    setVideoDuration(dur);
    setTrimEnd(Math.min(dur, MEDIA_MAX_VIDEO_SECONDS));
  }

  function removeVideo() {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    stopPlayback();
    setVideo(null);
    setVideoUrl(null);
    setVideoDuration(0);
    setTrimStart(0);
    setTrimEnd(0);
    setVideoConfirmed(false);
    setMediaError(null);
  }

  function stopPlayback() {
    if (playIntervalRef.current !== null) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
    if (videoRef.current) videoRef.current.pause();
    setIsPlaying(false);
  }

  function togglePlay() {
    const vid = videoRef.current;
    if (!vid || videoDuration === 0) return;
    if (isPlaying) {
      stopPlayback();
      return;
    }
    vid.currentTime = trimStart;
    vid.play().catch(() => {});
    setIsPlaying(true);
    playIntervalRef.current = window.setInterval(() => {
      if (!videoRef.current) return;
      if (videoRef.current.currentTime >= trimEnd) {
        videoRef.current.pause();
        videoRef.current.currentTime = trimStart;
        setIsPlaying(false);
        if (playIntervalRef.current !== null) clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    }, 100);
  }

  function confirmVideoTrim() {
    stopPlayback();
    setVideoConfirmed(true);
  }

  function reopenVideoTrim() {
    setVideoConfirmed(false);
  }

  function startTrimDrag(type: "start" | "end" | "range", e: React.PointerEvent) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    trimDragRef.current = {
      type,
      startX: e.clientX,
      startTrimStart: trimStart,
      startTrimEnd: trimEnd,
      duration: videoDuration
    };
  }

  function handleTrimPointerMove(e: React.PointerEvent) {
    if (isPlaying) stopPlayback();
    const drag = trimDragRef.current;
    if (!drag || !trimTrackRef.current) return;
    const trackW = trimTrackRef.current.offsetWidth;
    const dSec = ((e.clientX - drag.startX) / trackW) * drag.duration;
    const len = drag.startTrimEnd - drag.startTrimStart;

    if (drag.type === "range") {
      let s = drag.startTrimStart + dSec;
      let en = drag.startTrimEnd + dSec;
      if (s < 0) { s = 0; en = len; }
      if (en > drag.duration) { en = drag.duration; s = drag.duration - len; }
      setTrimStart(s);
      setTrimEnd(en);
    } else if (drag.type === "start") {
      // Floor: can't go below 0, and can't make range exceed 30s (start can't go more than 30s before end)
      const minStart = Math.max(0, drag.startTrimEnd - MEDIA_MAX_VIDEO_SECONDS);
      const s = Math.max(minStart, Math.min(drag.startTrimStart + dSec, drag.startTrimEnd - 1));
      setTrimStart(s);
    } else {
      const maxEnd = Math.min(drag.duration, drag.startTrimStart + MEDIA_MAX_VIDEO_SECONDS);
      const en = Math.max(drag.startTrimStart + 1, Math.min(drag.startTrimEnd + dSec, maxEnd));
      setTrimEnd(en);
    }
  }

  function stopTrimDrag() {
    trimDragRef.current = null;
  }

  const trimLength = trimEnd - trimStart;
  const needsTrim = videoDuration > MEDIA_MAX_VIDEO_SECONDS;

  async function uploadPhotoAssets(): Promise<WorkoutMediaAsset[]> {
    if (!finishPhotosEnabled || photos.length === 0) {
      return [];
    }

    const mediaConfigResponse = await fetch(`${apiBaseUrl}/v1/media/config`);
    if (!mediaConfigResponse.ok) {
      throw new Error("RepIQ could not load media settings.");
    }

    const mediaConfigJson = await mediaConfigResponse.json();
    const mediaConfig = mediaConfigSchema.parse(mediaConfigJson.constraints);

    if (!mediaConfig.image_enabled) {
      throw new Error("Image uploads are currently disabled.");
    }

    if (photos.length > mediaConfig.max_images_per_workout) {
      throw new Error(`You can upload up to ${mediaConfig.max_images_per_workout} images.`);
    }

    const uploadedAssets: WorkoutMediaAsset[] = [];

    for (const [index, photo] of photos.entries()) {
      const blobResponse = await fetch(photo.display);
      const blob = await blobResponse.blob();

      const prepareResponse = await fetch(`${apiBaseUrl}/v1/media/prepare`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "image",
          file_name: photo.name || `workout-photo-${index + 1}.jpg`,
          mime_type: blob.type || "image/jpeg",
          byte_size: blob.size,
          workout_id: draft.sessionName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "workout"
        })
      });

      if (!prepareResponse.ok) {
        throw new Error("RepIQ could not prepare an image upload.");
      }

      const preparedJson = await prepareResponse.json();
      const prepared = mediaPrepareUploadResponseSchema.parse(preparedJson);

      if (!prepared.asset.upload_url) {
        throw new Error("RepIQ did not return a valid upload target.");
      }

      const uploadResponse = await fetch(`${apiBaseUrl}${prepared.asset.upload_url}`, {
        method: "POST",
        headers: {
          "content-type": prepared.asset.mime_type
        },
        body: blob
      });

      if (!uploadResponse.ok) {
        throw new Error("RepIQ could not save one of the selected images.");
      }

      const uploadJson = await uploadResponse.json();
      uploadedAssets.push(workoutMediaAssetSchema.parse(uploadJson.asset));
    }

    return uploadedAssets;
  }

  async function handleSaveClick() {
    if (isSaving) return;
    setMediaError(null);
    setIsSaving(true);
    try {
      const uploadedImages = await uploadPhotoAssets();
      await onSave(uploadedImages);
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "RepIQ could not save this workout.");
      setIsSaving(false);
    }
  }

  return (
    <main className="detail-page finish-workout-page">
      <div className="finish-hero">
        <div className="finish-hero-topbar">
          <button
            className="finish-hero-back"
            type="button"
            onClick={onBack}
            aria-label="Back to logger"
          >
            ←
          </button>
          <span className="finish-hero-eyebrow">Workout Complete</span>
          {resolvedTheme && onToggleTheme ? (
            <button type="button" className="theme-toggle-btn theme-toggle-btn--ghost" onClick={onToggleTheme} aria-label="Toggle theme">
              {resolvedTheme === "dark" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
            </button>
          ) : (
            <span style={{ width: 32 }} aria-hidden="true" />
          )}
        </div>
        <h1 className="finish-hero-title">{draft.sessionName || "Today's Workout"}</h1>
        <p className="finish-hero-date">{formatSessionDate(draft.date)}</p>
        <div className="finish-hero-stats">
          <div className="finish-hero-stat">
            <strong>{draft.duration}</strong>
            <span>Duration</span>
          </div>
          <div className="finish-hero-stat">
            <strong>{draft.totalVolume.toFixed(0)} kg</strong>
            <span>Volume</span>
          </div>
          <div className="finish-hero-stat">
            <strong>{draft.totalSets}</strong>
            <span>Sets</span>
          </div>
          <div className="finish-hero-stat">
            <strong>{draft.loggedExerciseCount}</strong>
            <span>Exercises</span>
          </div>
        </div>
      </div>

      <section className="detail-section finish-workout-section">
        {draft.rewardSummary.total > 0 && (
          <section className="finish-workout-card finish-rewards-card">
            <button
              type="button"
              className="finish-rewards-toggle"
              onClick={() => setRewardsExpanded((v) => !v)}
              aria-expanded={rewardsExpanded}
            >
              <div className="finish-rewards-toggle-left">
                <p className="label" style={{ margin: 0 }}>Rewards</p>
                <div className="reward-sheet-summary finish-workout-reward-summary">
                  {draft.rewardSummary.exercise > 0 && (
                    <span className="reward-summary-chip reward-summary-chip-exercise">
                      {rewardLevelIcon.exercise} {draft.rewardSummary.exercise}
                    </span>
                  )}
                  {draft.rewardSummary.set > 0 && (
                    <span className="reward-summary-chip reward-summary-chip-set">
                      {rewardLevelIcon.set} {draft.rewardSummary.set}
                    </span>
                  )}
                  {draft.rewardSummary.session > 0 && (
                    <span className="reward-summary-chip reward-summary-chip-session">
                      {rewardLevelIcon.session} {draft.rewardSummary.session}
                    </span>
                  )}
                </div>
              </div>
              <span className={`finish-rewards-chevron${rewardsExpanded ? " is-open" : ""}`} aria-hidden="true">›</span>
            </button>
            {rewardsExpanded && (
              <div className="reward-sheet-list finish-workout-reward-list">
                {draft.rewards.map((reward) => (
                  <article key={reward.id} className="reward-sheet-item">
                    <div className={`reward-sheet-icon reward-sheet-icon-${reward.level}`} aria-hidden="true">
                      {rewardLevelIcon[reward.level]}
                    </div>
                    <div>
                      <strong>{reward.shortLabel}</strong>
                      <p>{reward.detail}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="finish-workout-card finish-takeaway-card">
          <p className="label">RepIQ Takeaway</p>
          <h3 className="finish-workout-takeaway-title">{draft.takeawayTitle}</h3>
          <p className="settings-note finish-workout-takeaway-body">{draft.takeawayBody}</p>
        </section>

        <section className="finish-workout-card">
          <p className="label">Save Details</p>
          <label className="finish-title-row">
            <span className="finish-title-label">Workout title</span>
            <input
              className="finish-title-input"
              type="text"
              value={draft.sessionName}
              onChange={(event) => onTitleChange(event.target.value)}
            />
          </label>
          {(finishPhotosEnabled || finishVideoEnabled) && (
            <div className="finish-media-strip">
              <div className="finish-media-btns">
                {finishPhotosEnabled && (
                  <button
                    type="button"
                    className={`finish-media-add-btn${photos.length >= MEDIA_MAX_PHOTOS ? " is-maxed" : ""}`}
                    onClick={() => photos.length < MEDIA_MAX_PHOTOS && photoInputRef.current?.click()}
                    aria-disabled={photos.length >= MEDIA_MAX_PHOTOS}
                  >
                    📷 Photo
                    <span className="finish-media-count">{photos.length}/{MEDIA_MAX_PHOTOS}</span>
                  </button>
                )}
                {finishVideoEnabled && (
                  <button
                    type="button"
                    className={`finish-media-add-btn${video ? " is-maxed" : ""}`}
                    onClick={() => !video && videoInputRef.current?.click()}
                    aria-disabled={!!video}
                  >
                    🎬 Video
                    <span className="finish-media-count">{video ? "1/1" : "0/1"}</span>
                  </button>
                )}
              </div>
              {finishPhotosEnabled && (
                <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={handlePhotoChange} />
              )}
              {finishVideoEnabled && (
                <input ref={videoInputRef} type="file" accept="video/*" hidden onChange={handleVideoChange} />
              )}

              {mediaError && <p className="finish-media-error">{mediaError}</p>}

              {finishPhotosEnabled && photos.length > 0 && (
                <div className="finish-media-cards">
                  {photos.map((photo, index) => {
                    const isProgress = draft.progressPicIndex === index;
                    return (
                      <div key={index} className={`finish-media-card${isProgress ? " is-progress-pic" : ""}`}>
                        {/* Image with overlays */}
                        <div className="finish-media-img-wrap" onClick={() => openPhotoEdit(index)}>
                          <img src={photo.display} alt={`Photo ${index + 1}`} />
                          {isProgress && (
                            <div className="finish-media-progress-overlay">⭐ Progress Pic</div>
                          )}
                          <button
                            type="button"
                            className="finish-media-remove"
                            onClick={(e) => { e.stopPropagation(); removePhoto(index); }}
                            aria-label="Remove photo"
                          >×</button>
                        </div>
                        {/* Progress pic toggle — always visible below the image */}
                        <button
                          type="button"
                          className={`finish-media-progress-toggle${isProgress ? " is-active" : ""}`}
                          onClick={() => onProgressPicChange(isProgress ? undefined : index)}
                        >
                          <span className="finish-media-progress-toggle-dot" />
                          {isProgress ? "✓ Progress pic" : "Mark as progress pic"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {finishVideoEnabled && video && videoUrl && (
                <div className="finish-video-trimmer">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    className="finish-video-preview"
                    onLoadedMetadata={handleVideoMetadata}
                    controls={false}
                    muted
                    playsInline
                  />
                  {videoConfirmed ? (
                    <div className="finish-video-confirmed-row">
                      <div className="finish-video-confirmed-info">
                        <span className="finish-video-confirmed-icon">🎬</span>
                        <div>
                          <span className="finish-video-confirmed-name">{video.name}</span>
                          <span className="finish-video-confirmed-range">
                            {formatTrimTime(trimStart)}–{formatTrimTime(trimEnd)} ({formatTrimTime(trimLength)})
                          </span>
                        </div>
                      </div>
                      <div className="finish-video-confirmed-actions">
                        <button type="button" className="finish-video-edit-btn" onClick={reopenVideoTrim}>✎ Edit</button>
                        <button type="button" className="finish-video-remove" onClick={removeVideo}>✕</button>
                      </div>
                    </div>
                  ) : (
                    videoDuration > 0 && (
                      <>
                        <div className="finish-video-header">
                          <span className="finish-video-name">{video.name}</span>
                          <button type="button" className="finish-video-remove" onClick={removeVideo}>Remove</button>
                        </div>
                        {needsTrim && (
                          <p className="finish-trim-notice">Video is {formatTrimTime(videoDuration)} — trim to 30s max</p>
                        )}
                        <div className="finish-trim-wrapper">
                          <div
                            ref={trimTrackRef}
                            className="finish-trim-track"
                            onPointerMove={handleTrimPointerMove}
                            onPointerUp={stopTrimDrag}
                            onPointerCancel={stopTrimDrag}
                          >
                            <div
                              className="finish-trim-fill"
                              style={{
                                left: `${(trimStart / videoDuration) * 100}%`,
                                width: `${((trimEnd - trimStart) / videoDuration) * 100}%`
                              }}
                              onPointerDown={(e) => startTrimDrag("range", e)}
                            />
                            <div
                              className="finish-trim-handle"
                              style={{ left: `${(trimStart / videoDuration) * 100}%` }}
                              onPointerDown={(e) => { e.stopPropagation(); startTrimDrag("start", e); }}
                            />
                            <div
                              className="finish-trim-handle"
                              style={{ left: `${(trimEnd / videoDuration) * 100}%` }}
                              onPointerDown={(e) => { e.stopPropagation(); startTrimDrag("end", e); }}
                            />
                          </div>
                          <div className="finish-trim-labels">
                            <span>{formatTrimTime(trimStart)}</span>
                            <span className="finish-trim-length">{formatTrimTime(trimLength)} selected</span>
                            <span>{formatTrimTime(trimEnd)}</span>
                          </div>
                        </div>
                        <div className="finish-trim-actions">
                          <button
                            type="button"
                            className={`finish-trim-play-btn${isPlaying ? " is-playing" : ""}`}
                            onClick={togglePlay}
                            aria-label={isPlaying ? "Pause preview" : "Play trim preview"}
                          >
                            {isPlaying ? "⏸" : "▶"}
                          </button>
                          <button
                            type="button"
                            className="finish-trim-confirm-fab"
                            onClick={confirmVideoTrim}
                            aria-label="Confirm trim and add to tray"
                          >
                            ✓
                          </button>
                        </div>
                      </>
                    )
                  )}
                </div>
              )}
            </div>
          )}
          {/* Notes Section with Two Modes */}
          <div className="finish-notes-section">
            <div className="finish-notes-mode-tabs">
              <button
                type="button"
                className={`finish-notes-mode-btn${(draft.noteType ?? "personal") === "personal" ? " is-active" : ""}`}
                onClick={() => onPersonalNoteChange(draft.personalNote ?? "")}
              >
                📝 Personal Note
              </button>
              <button
                type="button"
                className={`finish-notes-mode-btn${draft.noteType === "quote" ? " is-active" : ""}`}
                onClick={() => onQuoteNoteChange(draft.quoteNote ?? "")}
              >
                ✨ Quote
              </button>
            </div>

            {(draft.noteType ?? "personal") === "personal" ? (
              <textarea
                className="notes-textarea finish-workout-notes"
                placeholder="Add a personal note about this workout. Only visible to you."
                value={draft.personalNote ?? ""}
                onChange={(event) => onPersonalNoteChange(event.target.value)}
              />
            ) : (
              <>
                <textarea
                  className="notes-textarea finish-workout-notes"
                  placeholder="Share an inspiring quote from your workout. This can be shared in the community."
                  value={draft.quoteNote ?? ""}
                  onChange={(event) => onQuoteNoteChange(event.target.value)}
                />
                {draft.quoteNote && (
                  <div className="finish-quote-preview">
                    <div className="quote-preview-box">
                      <p className="quote-preview-text">"{draft.quoteNote}"</p>
                      <p className="quote-preview-author">— {draft.sessionName || "Your Name"}</p>
                    </div>
                    <p className="quote-preview-hint">This is how your quote will appear when shared</p>
                  </div>
                )}
              </>
            )}
          </div>

          <p className="settings-note">
            {formatSessionDate(draft.date)} • {draft.loggedExerciseCount} logged{" "}
            {draft.loggedExerciseCount === 1 ? "exercise" : "exercises"}
          </p>
        </section>

        <section className="finish-workout-card">
          <button
            type="button"
            className="finish-exercises-toggle"
            onClick={() => setExercisesExpanded((e) => !e)}
          >
            <p className="label">Logged Exercises</p>
            <span className="finish-exercises-toggle-meta">
              {draft.loggedExerciseCount}{" "}
              {draft.loggedExerciseCount === 1 ? "exercise" : "exercises"}
              <span className="finish-exercises-chevron">{exercisesExpanded ? "⌄" : "›"}</span>
            </span>
          </button>
          {exercisesExpanded && (
            <div className="finish-workout-exercise-list">
              {draft.exercises.length === 0 ? (
                <p className="settings-note">No completed exercise data is ready to save yet.</p>
              ) : (
                draft.exercises.map((exercise) => (
                  <article key={exercise.id} className="finish-workout-exercise-item">
                    <div>
                      <strong>{exercise.name}</strong>
                      <p>
                        {exercise.loggedSets} logged {exercise.loggedSets === 1 ? "set" : "sets"}
                      </p>
                    </div>
                    <span>{exercise.loggedVolume.toFixed(0)} kg</span>
                  </article>
                ))
              )}
            </div>
          )}
        </section>

        {draft.ignoredIncompleteSets > 0 && (
          <section className="finish-workout-card finish-workout-note-card">
            <p className="label">Incomplete Rows</p>
            <p className="settings-note finish-workout-note-text">
              {draft.ignoredIncompleteSets} unfinished{" "}
              {draft.ignoredIncompleteSets === 1 ? "set was" : "sets were"} not included in this saved workout.
            </p>
          </section>
        )}

        {/* ── Cool-down / static stretching guidance ── */}
        {!cooldownDismissed && (() => {
          const sessionMuscles = [...new Set(draft.exercises.map(e => e.primaryMuscle).filter(Boolean))];
          if (sessionMuscles.length === 0) return null;
          const STRETCH_MAP: Record<string, string[]> = {
            "Chest":      ["Doorway chest stretch (30s each)", "Cross-body arm stretch (20s each)"],
            "Back":       ["Child's pose (30s)", "Seated spinal twist (20s each)"],
            "Shoulders":  ["Cross-body shoulder stretch (20s each)", "Overhead tricep/shoulder stretch (20s each)"],
            "Biceps":     ["Wall bicep stretch (20s each)"],
            "Triceps":    ["Overhead tricep stretch (20s each)"],
            "Quads":      ["Standing quad stretch (30s each)", "Couch stretch (20s each)"],
            "Hamstrings": ["Standing toe touch (30s)", "Seated hamstring stretch (30s each)"],
            "Glutes":     ["Pigeon pose (30s each)", "Seated figure-4 stretch (20s each)"],
            "Calves":     ["Wall calf stretch (30s each)", "Downward dog (30s)"],
            "Core":       ["Cobra stretch (20s)", "Cat-cow (10 reps)"],
            "Abs":        ["Cobra stretch (20s)", "Lying spinal twist (20s each)"],
            "Obliques":   ["Standing side bend (20s each)", "Lying spinal twist (20s each)"],
          };
          const stretches: string[] = [];
          const seen = new Set<string>();
          for (const m of sessionMuscles) {
            for (const s of STRETCH_MAP[m] ?? []) {
              if (!seen.has(s)) { seen.add(s); stretches.push(s); }
            }
          }
          if (stretches.length === 0) return null;
          return (
            <section className={`cooldown-guidance-block${cooldownExpanded ? " is-expanded" : ""}`}>
              <button
                type="button"
                className="cooldown-guidance-toggle"
                onClick={() => setCooldownExpanded(prev => !prev)}
              >
                <span className="cooldown-guidance-icon">🧊</span>
                <span className="cooldown-guidance-title">Cool Down</span>
                <span className="cooldown-guidance-hint">{stretches.length} stretches · ~3 min</span>
                <span className="cooldown-guidance-chevron">{cooldownExpanded ? "▾" : "›"}</span>
              </button>
              {cooldownExpanded && (
                <div className="cooldown-guidance-content">
                  <p className="cooldown-guidance-sub">Static stretches for {sessionMuscles.slice(0, 3).join(", ")}{sessionMuscles.length > 3 ? "…" : ""}</p>
                  <ul className="cooldown-guidance-list">
                    {stretches.slice(0, 8).map((s) => (
                      <li key={s} className="cooldown-guidance-item">{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          );
        })()}

        <div className="finish-workout-actions">
          <button className="primary-button logger-finish-button" type="button" onClick={() => void handleSaveClick()} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Workout"}
          </button>
          <button className="finish-back-link" type="button" onClick={onBack}>
            ← Back to Logger
          </button>
        </div>
      </section>

      {finishPhotosEnabled && pendingCrop && (
        <CropTool
          imageUrl={pendingCrop.src}
          onCrop={handleCropDone}
          onCancel={handleCropCancel}
        />
      )}
    </main>
  );
}

// ── Canonical primary-muscle groups ──────────────────────────────────────────
const CANONICAL_MUSCLE_ORDER = [
  "Chest", "Back", "Shoulders", "Core",
  "Biceps", "Triceps", "Quads", "Hamstrings", "Glutes", "Calves", "Other",
] as const;

type CanonicalMuscle = typeof CANONICAL_MUSCLE_ORDER[number];

const MUSCLE_TO_CANONICAL: Record<string, CanonicalMuscle> = {
  // Chest
  "Chest": "Chest", "Upper Chest": "Chest", "Lower Chest": "Chest",
  // Back
  "Back": "Back", "Lats": "Back", "Upper Back": "Back",
  "Lower Back": "Back", "Middle Back": "Back", "Traps": "Back",
  // Shoulders
  "Shoulders": "Shoulders", "Shoulder": "Shoulders",
  "Front Delts": "Shoulders", "Front Shoulders": "Shoulders",
  "Side Delts": "Shoulders", "Rear Delts": "Shoulders",
  "Rotator Cuff": "Shoulders",
  // Core
  "Core": "Core", "Abs": "Core", "Abs / Core": "Core",
  "Obliques": "Core", "Hip Flexors": "Core",
  // Biceps
  "Biceps": "Biceps", "Forearms": "Biceps", "Brachialis": "Biceps",
  // Triceps
  "Triceps": "Triceps",
  // Quads
  "Quads": "Quads", "Quadriceps": "Quads",
  // Hamstrings
  "Hamstrings": "Hamstrings", "Hamstring": "Hamstrings",
  // Glutes
  "Glutes": "Glutes", "Glutes / Hips": "Glutes",
  "Adductors": "Glutes", "Abductors": "Glutes", "Inner Thigh": "Glutes",
  // Calves
  "Calves": "Calves", "Calves / Shins": "Calves",
};

function getCanonicalMuscle(primaryMuscle: string): CanonicalMuscle {
  return MUSCLE_TO_CANONICAL[primaryMuscle] ?? "Other";
}

// ── RepIQ Plan — rules engine (V1) ───────────────────────────────────────────
const PLAN_GOAL_LABEL: Record<string, string> = {
  build_muscle: "Muscle Building", get_stronger: "Strength",
  improve_fitness: "Fitness", athletic_performance: "Performance",
  stay_active: "Active Lifestyle", muscle_strength: "Muscle & Strength",
  fat_loss: "Fat Loss", endurance: "Endurance", general_fitness: "General Fitness",
};

const SPLIT_LABEL: Record<SplitType, string> = {
  full_body:       "Full Body",
  upper_lower:     "Upper / Lower",
  push_pull:       "Push / Pull",
  push_pull_legs:  "Push / Pull / Legs",
  ppl:             "Push · Pull · Legs",
  ppl_ul:          "PPL + Upper / Lower",
  ppl_arnold:      "PPL + Arnold",
  ppl_fb:          "PPL + Full Body",
  arnold:          "Arnold Split",
  arnold_ul:       "Arnold + Upper / Lower",
  arnold_fb:       "Arnold + Full Body",
  phul:            "PHUL",
  body_part:       "Body Part Split",
  custom:          "Custom",
};

const SPLIT_DESC: Record<SplitType, string> = {
  full_body:       "Train every muscle each session. Great for 2–3 days or beginners.",
  push_pull:       "Push day (chest, shoulders, triceps, quads, calves) and Pull day (back, biceps, hamstrings, glutes). Complete 2-day split.",
  push_pull_legs:  "Push, Pull, and Legs as separate days. Classic 3 or 6-day rotation.",
  upper_lower:     "Alternate upper and lower body. Classic 4-day structure.",
  ppl:             "Push, Pull, Legs — each session has a clear focus. 3 or 6 days.",
  ppl_ul:          "Push, Pull, Legs, Upper, Lower. The standard 5-day hybrid split.",
  ppl_arnold:      "PPL for the first 3 days, Arnold split for the next 3. Full 6-day coverage.",
  ppl_fb:          "Push, Pull, Legs plus a Full Body day for extra frequency. 4-day split.",
  arnold:          "Chest+Back, Shoulders+Arms, Legs. Arnold's famous 3 or 6-day rotation.",
  arnold_ul:       "Arnold's 3-day split plus Upper and Lower days. 5-day hybrid.",
  arnold_fb:       "Arnold's 3-day split plus a Full Body session. 4-day coverage.",
  phul:            "Power days for strength, hypertrophy days for size. 4-day split.",
  body_part:       "One muscle group per day. Maximum volume, 5–7 days.",
  custom:          "Build your own split — assign muscles to each day in the Planner.",
};

const ALL_SPLIT_TYPES: SplitType[] = ["full_body", "upper_lower", "push_pull", "push_pull_legs", "ppl", "ppl_ul", "ppl_arnold", "ppl_fb", "arnold", "arnold_ul", "arnold_fb", "phul", "body_part", "custom"];

function pickSplitType(
  days: number,
  exp: ExperienceLevel,
  stylePref?: string | null,
): SplitType {
  // If user explicitly chose a split, honour it
  if (stylePref && ALL_SPLIT_TYPES.includes(stylePref as SplitType)) return stylePref as SplitType;
  if (days === 1) return "full_body";
  if (days === 2) return "push_pull";
  if (days === 3) return (exp === "beginner" || exp === "never") ? "full_body" : "ppl";
  if (days === 4) return (exp === "advanced" || exp === "veteran") ? "phul" : "upper_lower";
  if (days === 5) return "ppl_ul";
  if (days === 6) return (exp === "beginner" || exp === "intermediate") ? "ppl" : "arnold";
  return "body_part"; // 7 days
}

function getMesocycleLength(exp: ExperienceLevel): 4 | 6 | 8 {
  if (exp === "never" || exp === "beginner") return 4;
  if (exp === "intermediate") return 6;
  return 8;
}

function getPlanSetRepScheme(goal: TrainingGoal): { sets: number; reps: string; restSeconds: number } {
  switch (goal) {
    case "get_stronger":          return { sets: 4, reps: "3–5",  restSeconds: 180 };
    case "build_muscle":
    case "muscle_strength":       return { sets: 3, reps: "8–12", restSeconds: 90 };
    case "fat_loss":
    case "improve_fitness":
    case "general_fitness":       return { sets: 3, reps: "12–15",restSeconds: 60 };
    case "endurance":             return { sets: 2, reps: "15–20",restSeconds: 45 };
    case "athletic_performance":  return { sets: 4, reps: "5–8",  restSeconds: 120 };
    default:                      return { sets: 3, reps: "10–12",restSeconds: 90 };
  }
}

type PlanExerciseSlot = { patterns: MovementPattern[]; primaryMuscle?: string };
type PlanDayTemplate = { label: string; focus: string; slots: PlanExerciseSlot[] };

function buildDayTemplates(split: SplitType, days: number): PlanDayTemplate[] {
  const fullBody: PlanDayTemplate = {
    label: "Full Body", focus: "Full Body",
    slots: [
      { patterns: ["squat", "hip_hinge"],            primaryMuscle: "Quads" },
      { patterns: ["horizontal_push"],                primaryMuscle: "Chest" },
      { patterns: ["vertical_pull","horizontal_pull"],primaryMuscle: "Back" },
      { patterns: ["vertical_push"],                  primaryMuscle: "Shoulders" },
      { patterns: ["isolation_pull"],                 primaryMuscle: "Biceps" },
      { patterns: ["isolation_push"],                 primaryMuscle: "Triceps" },
    ],
  };
  const push: PlanDayTemplate = {
    label: "Push", focus: "Chest · Shoulders · Triceps",
    slots: [
      { patterns: ["horizontal_push"], primaryMuscle: "Chest" },
      { patterns: ["vertical_push"],   primaryMuscle: "Shoulders" },
      { patterns: ["horizontal_push"], primaryMuscle: "Chest" },
      { patterns: ["isolation_push"],  primaryMuscle: "Triceps" },
      { patterns: ["isolation_push"],  primaryMuscle: "Triceps" },
    ],
  };
  const pull: PlanDayTemplate = {
    label: "Pull", focus: "Back · Biceps",
    slots: [
      { patterns: ["vertical_pull"],   primaryMuscle: "Lats" },
      { patterns: ["horizontal_pull"], primaryMuscle: "Upper Back" },
      { patterns: ["vertical_pull"],   primaryMuscle: "Lats" },
      { patterns: ["isolation_pull"],  primaryMuscle: "Biceps" },
      { patterns: ["isolation_pull"],  primaryMuscle: "Biceps" },
    ],
  };
  const legs: PlanDayTemplate = {
    label: "Legs", focus: "Quads · Hamstrings · Glutes",
    slots: [
      { patterns: ["squat"],          primaryMuscle: "Quads" },
      { patterns: ["hip_hinge"],      primaryMuscle: "Hamstrings" },
      { patterns: ["squat"],          primaryMuscle: "Quads" },
      { patterns: ["hip_hinge"],      primaryMuscle: "Glutes" },
      { patterns: ["isolation_legs"] },
    ],
  };
  const upper: PlanDayTemplate = {
    label: "Upper", focus: "Upper Body",
    slots: [
      { patterns: ["horizontal_push"], primaryMuscle: "Chest" },
      { patterns: ["vertical_pull"],   primaryMuscle: "Back" },
      { patterns: ["vertical_push"],   primaryMuscle: "Shoulders" },
      { patterns: ["horizontal_pull"], primaryMuscle: "Upper Back" },
      { patterns: ["isolation_pull"],  primaryMuscle: "Biceps" },
      { patterns: ["isolation_push"],  primaryMuscle: "Triceps" },
    ],
  };
  const lower: PlanDayTemplate = {
    label: "Lower", focus: "Lower Body",
    slots: [
      { patterns: ["squat"],          primaryMuscle: "Quads" },
      { patterns: ["hip_hinge"],      primaryMuscle: "Hamstrings" },
      { patterns: ["squat"],          primaryMuscle: "Quads" },
      { patterns: ["hip_hinge"],      primaryMuscle: "Glutes" },
      { patterns: ["isolation_legs"] },
    ],
  };

  // ── push / pull (2-day rotation) ─────────────────────────────────────────
  const chestBack: PlanDayTemplate = {
    label: "Chest & Back", focus: "Chest · Back",
    slots: [
      { patterns: ["horizontal_push"], primaryMuscle: "Chest" },
      { patterns: ["vertical_pull"],   primaryMuscle: "Back" },
      { patterns: ["horizontal_push"], primaryMuscle: "Upper Chest" },
      { patterns: ["horizontal_pull"], primaryMuscle: "Upper Back" },
      { patterns: ["isolation_push"],  primaryMuscle: "Triceps" },
    ],
  };
  const shouldersArms: PlanDayTemplate = {
    label: "Shoulders & Arms", focus: "Shoulders · Biceps · Triceps",
    slots: [
      { patterns: ["vertical_push"],   primaryMuscle: "Shoulders" },
      { patterns: ["isolation_pull"],  primaryMuscle: "Biceps" },
      { patterns: ["isolation_push"],  primaryMuscle: "Triceps" },
      { patterns: ["vertical_push"] },
      { patterns: ["isolation_pull"] },
    ],
  };
  // ── power-hypertrophy templates (PHUL) ──────────────────────────────────
  const upperPower: PlanDayTemplate = {
    label: "Upper (Power)", focus: "Upper Body · Strength",
    slots: [
      { patterns: ["horizontal_push"], primaryMuscle: "Chest" },
      { patterns: ["vertical_pull"],   primaryMuscle: "Back" },
      { patterns: ["vertical_push"],   primaryMuscle: "Shoulders" },
      { patterns: ["horizontal_pull"], primaryMuscle: "Upper Back" },
      { patterns: ["isolation_pull"],  primaryMuscle: "Biceps" },
    ],
  };
  const lowerPower: PlanDayTemplate = {
    label: "Lower (Power)", focus: "Quads · Hamstrings · Strength",
    slots: [
      { patterns: ["squat"],           primaryMuscle: "Quads" },
      { patterns: ["hip_hinge"],       primaryMuscle: "Hamstrings" },
      { patterns: ["squat"] },
      { patterns: ["isolation_legs"] },
    ],
  };
  const upperHyp: PlanDayTemplate = {
    label: "Upper (Volume)", focus: "Upper Body · Hypertrophy",
    slots: [
      { patterns: ["horizontal_push"], primaryMuscle: "Chest" },
      { patterns: ["horizontal_pull"], primaryMuscle: "Upper Back" },
      { patterns: ["vertical_push"],   primaryMuscle: "Shoulders" },
      { patterns: ["isolation_push"],  primaryMuscle: "Triceps" },
      { patterns: ["isolation_pull"],  primaryMuscle: "Biceps" },
    ],
  };
  const lowerHyp: PlanDayTemplate = {
    label: "Lower (Volume)", focus: "Quads · Glutes · Hypertrophy",
    slots: [
      { patterns: ["squat"],           primaryMuscle: "Quads" },
      { patterns: ["hip_hinge"],       primaryMuscle: "Glutes" },
      { patterns: ["squat"] },
      { patterns: ["hip_hinge"],       primaryMuscle: "Hamstrings" },
      { patterns: ["isolation_legs"] },
    ],
  };

  // ── Push/Pull with integrated legs (2-day: quads+calves on push, hams+glutes on pull) ──
  const pushWithLegs: PlanDayTemplate = {
    label: "Push", focus: "Chest · Shoulders · Triceps · Quads · Calves",
    slots: [
      { patterns: ["squat"],           primaryMuscle: "Quads" },
      { patterns: ["horizontal_push"], primaryMuscle: "Chest" },
      { patterns: ["vertical_push"],   primaryMuscle: "Shoulders" },
      { patterns: ["horizontal_push"], primaryMuscle: "Chest" },
      { patterns: ["isolation_push"],  primaryMuscle: "Triceps" },
      { patterns: ["isolation_legs"],  primaryMuscle: "Calves" },
    ],
  };
  const pullWithLegs: PlanDayTemplate = {
    label: "Pull", focus: "Back · Biceps · Hamstrings · Glutes",
    slots: [
      { patterns: ["hip_hinge"],       primaryMuscle: "Hamstrings" },
      { patterns: ["vertical_pull"],   primaryMuscle: "Back" },
      { patterns: ["horizontal_pull"], primaryMuscle: "Upper Back" },
      { patterns: ["hip_hinge"],       primaryMuscle: "Glutes" },
      { patterns: ["isolation_pull"],  primaryMuscle: "Biceps" },
      { patterns: ["isolation_pull"],  primaryMuscle: "Biceps" },
    ],
  };

  if (split === "full_body") {
    return Array(days).fill(null).map((_, i) => ({ ...fullBody, label: `Day ${i + 1}` }));
  }
  if (split === "push_pull") {
    // 2-day: legs integrated — quads+calves on Push, hamstrings+glutes on Pull
    const pattern = [pushWithLegs, pullWithLegs];
    return Array(days).fill(null).map((_, i) => ({ ...pattern[i % 2], label: `${pattern[i % 2].label} ${Math.floor(i / 2) > 0 ? Math.floor(i / 2) + 1 : ""}`.trim() }));
  }
  if (split === "push_pull_legs") {
    const pattern = [push, pull, legs, push, pull, legs];
    return pattern.slice(0, days);
  }
  if (split === "upper_lower") {
    const pattern = [upper, lower, upper, lower, upper, lower];
    return pattern.slice(0, days);
  }
  if (split === "ppl") {
    const pattern = [push, pull, legs, push, pull, legs];
    return pattern.slice(0, days);
  }
  if (split === "arnold") {
    const pattern = [chestBack, shouldersArms, legs, chestBack, shouldersArms, legs];
    return pattern.slice(0, days);
  }
  if (split === "phul") {
    const pattern = [upperPower, lowerPower, upperHyp, lowerHyp];
    return pattern.slice(0, days);
  }
  if (split === "ppl_ul") {
    return [push, pull, legs, upper, lower].slice(0, days);
  }
  if (split === "arnold_ul") {
    return [chestBack, shouldersArms, legs, upper, lower].slice(0, days);
  }
  if (split === "ppl_arnold") {
    return [push, pull, legs, chestBack, shouldersArms, legs].slice(0, days);
  }
  if (split === "ppl_fb") {
    return [push, pull, legs, fullBody].slice(0, days);
  }
  if (split === "arnold_fb") {
    return [chestBack, shouldersArms, legs, fullBody].slice(0, days);
  }
  if (split === "custom") {
    return Array(days).fill(null).map((_, i) => ({
      label: `Day ${i + 1}`,
      focus: "Full Body",
      slots: fullBody.slots,
    }));
  }
  // body_part: one focus per day — 5/6/7 day variants
  const bodyPart: PlanDayTemplate[] = [
    { label: "Chest", focus: "Chest · Triceps", slots: [
      { patterns: ["horizontal_push"], primaryMuscle: "Chest" },
      { patterns: ["horizontal_push"], primaryMuscle: "Upper Chest" },
      { patterns: ["horizontal_push"], primaryMuscle: "Chest" },
      { patterns: ["isolation_push"],  primaryMuscle: "Triceps" },
      { patterns: ["isolation_push"],  primaryMuscle: "Triceps" },
    ]},
    { label: "Back", focus: "Back · Biceps", slots: [
      { patterns: ["vertical_pull"],   primaryMuscle: "Lats" },
      { patterns: ["horizontal_pull"], primaryMuscle: "Upper Back" },
      { patterns: ["vertical_pull"],   primaryMuscle: "Lats" },
      { patterns: ["horizontal_pull"], primaryMuscle: "Back" },
      { patterns: ["isolation_pull"],  primaryMuscle: "Biceps" },
    ]},
    { label: "Shoulders", focus: "Shoulders · Traps", slots: [
      { patterns: ["vertical_push"],   primaryMuscle: "Shoulders" },
      { patterns: ["vertical_push"],   primaryMuscle: "Shoulders" },
      { patterns: ["vertical_push"] },
      { patterns: ["isolation_push"] },
    ]},
    { label: "Arms", focus: "Biceps · Triceps", slots: [
      { patterns: ["isolation_pull"],  primaryMuscle: "Biceps" },
      { patterns: ["isolation_push"],  primaryMuscle: "Triceps" },
      { patterns: ["isolation_pull"],  primaryMuscle: "Biceps" },
      { patterns: ["isolation_push"],  primaryMuscle: "Triceps" },
    ]},
    { label: "Legs", focus: "Quads · Hamstrings · Glutes · Calves", slots: [
      { patterns: ["squat"],      primaryMuscle: "Quads" },
      { patterns: ["hip_hinge"],  primaryMuscle: "Hamstrings" },
      { patterns: ["squat"],      primaryMuscle: "Quads" },
      { patterns: ["hip_hinge"],  primaryMuscle: "Glutes" },
      { patterns: ["isolation_legs"], primaryMuscle: "Calves" },
    ]},
    // Day 6 — Quads & Glutes (split legs across two days for 6–7 day variants)
    { label: "Quads & Glutes", focus: "Quads · Glutes · Calves", slots: [
      { patterns: ["squat"],      primaryMuscle: "Quads" },
      { patterns: ["squat"],      primaryMuscle: "Quads" },
      { patterns: ["hip_hinge"],  primaryMuscle: "Glutes" },
      { patterns: ["isolation_legs"], primaryMuscle: "Calves" },
    ]},
    // Day 7 — Hamstrings & Core
    { label: "Hams & Core", focus: "Hamstrings · Glutes · Core", slots: [
      { patterns: ["hip_hinge"],      primaryMuscle: "Hamstrings" },
      { patterns: ["hip_hinge"],      primaryMuscle: "Glutes" },
      { patterns: ["hip_hinge"],      primaryMuscle: "Hamstrings" },
      { patterns: ["isolation_push"], primaryMuscle: "Core" },
    ]},
  ];
  return bodyPart.slice(0, days);
}

function pickPlanExercise(
  catalog: ExerciseWithTaxonomy[],
  slot: PlanExerciseSlot,
  exp: ExperienceLevel,
  used: Set<string>,
  equipment: EquipmentAccess = "full_gym",
): string | null {
  const allowedDifficulty: Record<ExperienceLevel, ExerciseDifficulty[]> = {
    never:        ["beginner"],
    beginner:     ["beginner", "intermediate"],
    intermediate: ["beginner", "intermediate", "advanced"],
    advanced:     ["intermediate", "advanced"],
    veteran:      ["intermediate", "advanced"],
  };
  const allowed = allowedDifficulty[exp] ?? ["beginner", "intermediate"];

  const allowedEquipTypes = EQUIPMENT_ALLOWED_TYPES[equipment];
  let candidates = catalog.filter((ex) =>
    slot.patterns.some((p) => ex.movementPattern === p) &&
    (ex.difficultyLevel == null || allowed.includes(ex.difficultyLevel as ExerciseDifficulty)) &&
    !used.has(ex.id) &&
    (() => {
      if (ex.exerciseType == null) return true;
      const neededEquipment = getEquipmentAccessibility(ex.exerciseType as CustomExerciseType);
      return neededEquipment.some((item) => allowedEquipTypes.includes(item));
    })()
  );

  if (slot.primaryMuscle) {
    const preferred = candidates.filter((ex) => ex.primaryMuscle === slot.primaryMuscle);
    if (preferred.length > 0) candidates = preferred;
  }

  if (candidates.length === 0) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  used.add(pick.id);
  return pick.id;
}

function generateRepIQPlan(profile: UserPsychProfile): RepIQPlan {
  const goal: TrainingGoal = profile.primaryGoal ?? "improve_fitness";
  const exp: ExperienceLevel = profile.experienceLevel ?? "beginner";
  const days = getSafeTargetPerWeek(profile.scheduleCommitment, profile.daysPerWeekPref);
  const equipment: EquipmentAccess = profile.equipmentAccess ?? "full_gym";
  const sessionLen = profile.sessionLengthPref ?? 45;
  const cycleDays = profile.cycleDays ?? null;   // null = standard weekly

  const splitType = pickSplitType(days, exp, profile.workoutStylePref);
  const mesoWeeks = profile.planLengthWeeksPref ?? 12;
  const scheme = getPlanSetRepScheme(goal);
  const dayTemplates = buildDayTemplates(splitType, days);

  // Total cycles = how many full/partial cycles fit in the mesocycle duration.
  // For weekly schedules (cycleDays null or 7): totalCycles = mesoWeeks (1 cycle = 1 week).
  // For rotating cycles: totalCycles = round((mesoWeeks × 7) / cycleDays).
  // Each "week" slot in the plan = one cycle regardless of whether it's 7 days or not.
  const effectiveCycleDays = cycleDays ?? 7;
  const totalCycles = cycleDays && cycleDays !== 7
    ? Math.round((mesoWeeks * 7) / effectiveCycleDays)
    : mesoWeeks;

  const used = new Set<string>();
  const weeks: RepIQPlanWeek[] = Array(totalCycles).fill(null).map((_, weekIdx) => ({
    weekNumber: weekIdx + 1,
    isCompleted: false,
    days: dayTemplates.map((tmpl) => ({
      sessionLabel: tmpl.label,
      focus: tmpl.focus,
      completedAt: null,
      exercises: tmpl.slots
        .map((slot, slotIdx) => {
          const exerciseId = pickPlanExercise(generationCatalogExercises, slot, exp, used, equipment);
          if (!exerciseId) return null;
          // Warm-up sets: compound movements get 2 warm-up sets, first exercise of
          // each session always gets at least 1 (even if isolation)
          const isCompound = slot.patterns.some((p) => COMPOUND_PATTERNS.has(p));
          const warmupSets = isCompound ? 2 : slotIdx === 0 ? 1 : 0;
          return {
            exerciseId,
            sets: scheme.sets,
            ...(warmupSets > 0 ? { warmupSets } : {}),
            reps: scheme.reps,
            restSeconds: scheme.restSeconds,
          } satisfies RepIQPlanExercise;
        })
        .filter((e): e is RepIQPlanExercise => e !== null),
    })),
  }));

  const splitNames: Record<SplitType, string> = {
    full_body:       "Full Body",
    upper_lower:     "Upper / Lower",
    push_pull:       "Push / Pull",
    push_pull_legs:  "Push / Pull / Legs",
    ppl:             "Push · Pull · Legs",
    ppl_ul:          "PPL + Upper / Lower",
    ppl_arnold:      "PPL + Arnold",
    ppl_fb:          "PPL + Full Body",
    arnold:          "Arnold Split",
    arnold_ul:       "Arnold + Upper / Lower",
    arnold_fb:       "Arnold + Full Body",
    body_part:       "Body Part",
    phul:            "PHUL",
    custom:          "Custom",
  };
  const goalLabel = PLAN_GOAL_LABEL[goal] ?? "Training";
  const planName = `${goalLabel} — ${splitNames[splitType]}`;

  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: `plan-${Date.now()}`,
    generatedAt: now,
    startDate: now.slice(0, 10),
    lastRegeneratedAt: now,
    planName,
    goal,
    secondaryGoal: profile.secondaryGoal ?? null,
    experienceLevel: exp,
    daysPerWeek: days,
    cycleDays,
    totalCycles,
    sessionLengthMin: sessionLen,
    splitType,
    mesocycleLengthWeeks: mesoWeeks,
    currentWeekIndex: 0,
    weeks,
  };
}

// ── Volume compensation — called after RepIQ session completes ───────────────
function computeVolumeCompensation(
  plan: RepIQPlan,
  completedWeekIdx: number,
  completedDayIdx: number,
  sessionExercises: ExerciseDraft[],
  exerciseTemplates: ExerciseDraft[]
): RepIQPlan {
  const planDay = plan.weeks[completedWeekIdx]?.days[completedDayIdx];
  if (!planDay) return plan;

  // Compute deficit per primary muscle — cap individual exercise deficit at +2 sets
  // Only count working sets (exclude warm-up sets from deficit calculation)
  const muscleDeficits = new Map<string, number>();
  for (const pe of planDay.exercises) {
    const loggedEx = sessionExercises.find((e) => e.id === pe.exerciseId);
    const actualDone = loggedEx ? loggedEx.draftSets.filter((s) => s.done && s.setType !== "warmup").length : 0;
    const deficit = pe.sets - actualDone;
    if (deficit > 0) {
      const template = exerciseTemplates.find((e) => e.id === pe.exerciseId);
      if (template?.primaryMuscle) {
        const existing = muscleDeficits.get(template.primaryMuscle) ?? 0;
        muscleDeficits.set(template.primaryMuscle, existing + Math.min(deficit, 2));
      }
    }
  }
  if (muscleDeficits.size === 0) return plan;

  // Apply deficit to the first future session targeting each deficient muscle (once per muscle)
  const remaining = new Map(muscleDeficits);
  const updatedWeeks = plan.weeks.map((week, wi) => ({
    ...week,
    days: week.days.map((day, di) => {
      if (wi < completedWeekIdx) return day;
      if (wi === completedWeekIdx && di <= completedDayIdx) return day;
      if (day.completedAt) return day;
      let changed = false;
      const updatedExercises = day.exercises.map((pe) => {
        const template = exerciseTemplates.find((e) => e.id === pe.exerciseId);
        if (!template?.primaryMuscle) return pe;
        const deficit = remaining.get(template.primaryMuscle);
        if (!deficit || deficit <= 0) return pe;
        remaining.set(template.primaryMuscle, 0);
        changed = true;
        return { ...pe, sets: pe.sets + deficit };
      });
      return changed ? { ...day, exercises: updatedExercises } : day;
    }),
  }));
  return { ...plan, weeks: updatedWeeks };
}

// ── Plan Reveal — shown after onboarding completes ────────────────────────────
function PlanRevealPage({
  plan,
  profile,
  resolvedTheme,
  onStart,
  onBuildOwn,
}: {
  plan: RepIQPlan;
  profile: UserPsychProfile;
  resolvedTheme: string;
  onStart: () => void;
  onBuildOwn: () => void;
}) {
  const firstName = profile.name?.split(" ")[0] ?? null;
  const week1 = plan.weeks[0];

  return (
    <div data-theme={resolvedTheme} className="pr-shell">
      <div className="pr-hero">
        <div className="pr-badge">✦ RepIQ Plan</div>
        <h1 className="pr-title">
          {firstName ? `${firstName}, your\nplan is ready.` : "Your plan\nis ready."}
        </h1>
        <p className="pr-sub">
          Built around your goal, schedule, and experience. Adjust any session as you train.
        </p>
        <div className="pr-meta-row">
          <span className="pr-meta-chip">{PLAN_GOAL_LABEL[plan.goal] ?? plan.goal}</span>
          <span className="pr-meta-chip">{SPLIT_LABEL[plan.splitType]}</span>
          <span className="pr-meta-chip">{plan.daysPerWeek}×/week</span>
          <span className="pr-meta-chip">{plan.mesocycleLengthWeeks} weeks</span>
        </div>
      </div>

      <div className="pr-body">
        {profile.isReturningAfterBreak && (
          <div className="pr-return-banner">
            <span>🔄</span>
            <p>We'll ease you back in — week 1 starts lighter to protect your joints.</p>
          </div>
        )}

        {week1 && (
          <div className="pr-week1-section">
            <p className="pr-section-label">Week 1 — your first sessions</p>
            <div className="pr-day-list">
              {week1.days.map((day, i) => (
                <div key={i} className="pr-day-row">
                  <span className="pr-day-num">S{i + 1}</span>
                  <div className="pr-day-info">
                    <p className="pr-day-name">{day.sessionLabel}</p>
                    <p className="pr-day-focus">{day.focus}</p>
                  </div>
                  <span className="pr-day-sets">{day.exercises.length} exercises</span>
                </div>
              ))}
            </div>
            {plan.mesocycleLengthWeeks > 1 && (
              <p className="pr-unlock-note">
                Weeks 2–{plan.mesocycleLengthWeeks} unlock as you finish each week.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="pr-footer">
        <button type="button" className="pr-cta-primary" onClick={onStart}>
          Let's go →
        </button>
        <button type="button" className="pr-cta-secondary" onClick={onBuildOwn}>
          Build my own plan instead
        </button>
      </div>
    </div>
  );
}

// ── Internal dev navigation page (URL param: ?dev) ───────────────────────────
function DevLandingPage({
  resolvedTheme,
  onToggleTheme,
  onGoTo,
  onResetOnboarding,
  onShowPostOnboarding,
  onSeedHistoryData,
  onSeedRepIQData,
  onSeedMuscleGap,
  onClearHistoryData,
}: {
  resolvedTheme: string;
  onToggleTheme: () => void;
  onGoTo: (view: AppView) => void;
  onResetOnboarding: () => void;
  onShowPostOnboarding: () => void;
  onSeedHistoryData: () => void;
  onSeedRepIQData: () => void;
  onSeedMuscleGap: () => void;
  onClearHistoryData: () => void;
}) {
  const views: { view: AppView; label: string; emoji: string }[] = [
    { view: "home",         label: "Home",          emoji: "🏠" },
    { view: "planner",      label: "Planner",        emoji: "📋" },
    { view: "insights",     label: "Insights",       emoji: "📊" },
    { view: "profile",      label: "Profile",        emoji: "👤" },
    { view: "report",       label: "Workout Report", emoji: "📄" },
    { view: "plan-builder", label: "Plan Builder",   emoji: "🏗️" },
  ];

  return (
    <div data-theme={resolvedTheme} className="dev-shell">
      <header className="dev-header">
        <div className="dev-badge">DEV</div>
        <h1 className="dev-title">Internal Navigator</h1>
        <button type="button" className="dev-theme-btn" onClick={onToggleTheme} aria-label="Toggle theme">
          {resolvedTheme === "dark"
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          }
        </button>
      </header>

      <div className="dev-body">
        <section className="dev-section">
          <p className="dev-section-title">App Views</p>
          <div className="dev-grid">
            {views.map(({ view, label, emoji }) => (
              <button key={view} type="button" className="dev-btn" onClick={() => onGoTo(view)}>
                <span className="dev-btn-icon">{emoji}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="dev-section">
          <p className="dev-section-title">Onboarding</p>
          <div className="dev-grid">
            <button type="button" className="dev-btn dev-btn-accent" onClick={onShowPostOnboarding}>
              <span className="dev-btn-icon">🎉</span>
              <span>Post-Onboarding Screen</span>
            </button>
            <button type="button" className="dev-btn dev-btn-warn" onClick={onResetOnboarding}>
              <span className="dev-btn-icon">🔄</span>
              <span>Reset &amp; Re-run Onboarding</span>
            </button>
          </div>
        </section>

        <section className="dev-section">
          <p className="dev-section-title">Test Data</p>
          <div className="dev-grid">
            <button type="button" className="dev-btn dev-btn-accent" onClick={onSeedHistoryData}>
              <span className="dev-btn-icon">🌱</span>
              <span>6-Week History (no plan)</span>
            </button>
            <button type="button" className="dev-btn dev-btn-accent" onClick={onSeedRepIQData}>
              <span className="dev-btn-icon">📋</span>
              <span>5-Day Plan (midway, wk 3)</span>
            </button>
            <button type="button" className="dev-btn dev-btn-accent" onClick={onSeedMuscleGap}>
              <span className="dev-btn-icon">🦵</span>
              <span>Muscle Gap (legs+core overdue)</span>
            </button>
            <button type="button" className="dev-btn dev-btn-warn" onClick={onClearHistoryData}>
              <span className="dev-btn-icon">🗑️</span>
              <span>Clear History + Plan</span>
            </button>
          </div>
        </section>

        <p className="dev-hint">Remove <code>?dev</code> from the URL to exit this page.</p>
      </div>
    </div>
  );
}

// ── Onboarding flow (first-launch, 5 steps) ───────────────────────────────────
function OnboardingPage({
  onComplete,
  resolvedTheme,
  onToggleTheme,
}: {
  onComplete: (profile: Partial<UserPsychProfile>) => void;
  resolvedTheme: string;
  onToggleTheme: () => void;
}) {
  const TOTAL = 6;
  const STEP_LABELS = ["You", "Body", "Goal", "Experience", "Schedule", "Mindset"];

  const [step, setStep] = useState(1);

  // Step 1 — You
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other" | null>(null);

  // Step 2 — Body
  const [unitSystem, setUnitSystem] = useState<"metric" | "imperial">("metric");
  const [heightCm, setHeightCm] = useState(170);
  const [heightFt, setHeightFt] = useState(5);
  const [heightIn, setHeightIn] = useState(8);
  const [weightKg, setWeightKg] = useState(75);
  const [weightLbs, setWeightLbs] = useState(165);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [dobDisplay, setDobDisplay] = useState("");
  const [bodyFatBracket, setBodyFatBracket] = useState<string | null>(null);

  // Step 3 — Goal
  const [goal, setGoal] = useState<TrainingGoal | null>(null);
  const [secondaryGoal, setSecondaryGoal] = useState<TrainingGoal | null>(null);
  const [biggestObstacles, setBiggestObstacles] = useState<string[]>([]);

  // Step 4 — Experience
  const [equipmentAccess, setEquipmentAccess] = useState<EquipmentAccess | null>(null);
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);
  const [isReturning, setIsReturning] = useState(false);
  const [breakMonths, setBreakMonths] = useState(3);

  // Step 5 — Schedule & Split
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [sessionLength, setSessionLength] = useState<number>(60);
  const [bestTime, setBestTime] = useState<string | null>(null);
  const [splitPref, setSplitPref] = useState<string | null>(null);

  // Step 6 — Mindset
  const [preWorkoutFeeling, setPreWorkoutFeeling] = useState<string | null>(null);
  const [workoutStyle, setWorkoutStyle] = useState<string | null>(null);
  const [successVision, setSuccessVision] = useState<string | null>(null);
  const [optionalOpen, setOptionalOpen] = useState(false);
  const optionalSectionRef = useRef<HTMLDivElement | null>(null);

  const [maxStep, setMaxStep] = useState(1);
  const [showStepError, setShowStepError] = useState(false);

  // Refs for scrolling to error fields
  const nameFieldRef = useRef<HTMLDivElement | null>(null);
  const dobFieldRef = useRef<HTMLDivElement | null>(null);
  const goalFieldRef = useRef<HTMLDivElement | null>(null);
  const equipmentFieldRef = useRef<HTMLDivElement | null>(null);
  const experienceFieldRef = useRef<HTMLDivElement | null>(null);
  const obBodyRef = useRef<HTMLDivElement | null>(null);

  // DOB masked input handler — auto-formats as DD/MM/YYYY
  function handleDobInput(raw: string) {
    // Strip non-digits
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    // Build display with slashes
    let display = "";
    if (digits.length > 0) display += digits.slice(0, 2);
    if (digits.length > 2) display += "/" + digits.slice(2, 4);
    if (digits.length > 4) display += "/" + digits.slice(4, 8);
    setDobDisplay(display);

    // Parse to ISO date when complete
    if (digits.length === 8) {
      const dd = parseInt(digits.slice(0, 2), 10);
      const mm = parseInt(digits.slice(2, 4), 10);
      const yyyy = parseInt(digits.slice(4, 8), 10);
      const minAge = 10;
      const maxYear = new Date().getFullYear() - minAge;
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= new Date(yyyy, mm, 0).getDate() && yyyy >= 1930 && yyyy <= maxYear) {
        setDateOfBirth(`${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`);
      } else {
        setDateOfBirth("");
      }
    } else {
      setDateOfBirth("");
    }
    setShowStepError(false);
  }

  // Auto-scroll to next field helper
  function scrollToNextField(currentRef: React.RefObject<HTMLElement | null>) {
    requestAnimationFrame(() => {
      const el = currentRef.current;
      if (!el) return;
      const next = el.nextElementSibling as HTMLElement | null;
      if (next) {
        next.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  // Refs for each ob-field that needs scroll-to-next
  const dobPickerRef = useRef<HTMLInputElement | null>(null);
  const genderFieldRef = useRef<HTMLDivElement | null>(null);
  const primaryGoalFieldRef = useRef<HTMLDivElement | null>(null);
  const secondaryGoalFieldRef = useRef<HTMLDivElement | null>(null);
  const expFieldScrollRef = useRef<HTMLDivElement | null>(null);
  const equipFieldScrollRef = useRef<HTMLDivElement | null>(null);
  const daysFieldRef = useRef<HTMLDivElement | null>(null);
  const sessionLengthFieldRef = useRef<HTMLDivElement | null>(null);

  const canAdvance =
    step === 1 ? name.trim().length > 0 :
    step === 2 ? dateOfBirth.length > 0 :
    step === 3 ? goal !== null :
    step === 4 ? experience !== null && equipmentAccess !== null :
    true;

  // ── Smart split recommendations based on day count ──────────────────────
  const VALID_SPLITS_FOR_DAYS: Record<number, SplitType[]> = {
    1: ["full_body"],
    2: ["push_pull", "full_body", "upper_lower"],
    3: ["ppl", "arnold", "full_body"],
    4: ["upper_lower", "phul", "ppl_fb", "arnold_fb"],
    5: ["ppl_ul", "arnold_ul", "body_part"],
    6: ["ppl", "arnold", "ppl_arnold", "body_part"],
    7: ["body_part"],
  };
  const recommendedSplits: SplitType[] = VALID_SPLITS_FOR_DAYS[daysPerWeek] ?? ["full_body"];
  const autoRecommendedSplit = pickSplitType(daysPerWeek, experience ?? "beginner");

  // Reset split pref when days change makes it invalid
  useEffect(() => {
    if (splitPref && splitPref !== "custom" && !recommendedSplits.includes(splitPref as SplitType)) {
      setSplitPref(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysPerWeek]);

  const stepErrorMessage: Record<number, string | null> = {
    1: name.trim().length === 0 ? "Please enter your name to continue." : null,
    2: dateOfBirth.length === 0 ? "Please enter your date of birth to continue." : null,
    3: goal === null ? "Please select your primary training goal to continue." : null,
    4: experience === null && equipmentAccess === null
         ? "Please select your training background and where you train."
         : experience === null
           ? "Please select your training background."
           : equipmentAccess === null
             ? "Please select where you train."
             : null,
    5: null,
    6: null,
  };

  function advance() {
    if (!canAdvance) {
      setShowStepError(true);
      // Scroll to the first missing field
      requestAnimationFrame(() => {
        const target =
          step === 1 ? nameFieldRef.current :
          step === 2 ? dobFieldRef.current :
          step === 3 ? goalFieldRef.current :
          step === 4 ? (experience === null ? experienceFieldRef.current : equipmentFieldRef.current) :
          null;
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }
    setShowStepError(false);
    if (step < TOTAL) {
      const next = step + 1;
      setMaxStep((m) => Math.max(m, next));
      setStep(next);
      requestAnimationFrame(() => obBodyRef.current?.scrollTo({ top: 0 }));
      return;
    }
    const finalHeightCm = unitSystem === "metric" ? heightCm : Math.round(heightFt * 30.48 + heightIn * 2.54);
    const finalWeightKg = unitSystem === "metric" ? weightKg : Math.round(weightLbs * 0.4536);
    onComplete({
      name: name.trim() || null,
      gender,
      unitSystem,
      heightCm: finalHeightCm,
      weightKg: finalWeightKg,
      dateOfBirth: dateOfBirth || null,
      bodyFatBracket,
      primaryGoal: goal,
      secondaryGoal,
      biggestObstacles,
      experienceLevel: experience,
      equipmentAccess,
      scheduleCommitment: (Math.max(2, Math.min(6, daysPerWeek))) as ScheduleCommitment,
      daysPerWeekPref: daysPerWeek,
      cycleDays: null, // rotating cycles configured in Planner
      sessionLengthPref: sessionLength,
      bestTimePref: bestTime,
      workoutStylePref: splitPref,
      preWorkoutFeeling,
      isReturningAfterBreak: isReturning,
      breakMonths: isReturning ? breakMonths : null,
      successVision,
    });
  }

  const bfBrackets = (gender === "female")
    ? [
        { id: "very_lean_f", label: "Very Lean", range: "< 18%", desc: "Highly defined", color: "#3b82f6" },
        { id: "athletic_f", label: "Athletic", range: "18–22%", desc: "Lean & toned", color: "#22c55e" },
        { id: "fit_f", label: "Fit", range: "23–27%", desc: "Healthy shape", color: "#06b6d4" },
        { id: "average_f", label: "Average", range: "28–33%", desc: "Typical range", color: "#eab308" },
        { id: "higher_f", label: "Higher", range: "34%+", desc: "Room to go", color: "#f97316" },
      ]
    : [
        { id: "very_lean_m", label: "Very Lean", range: "< 10%", desc: "Abs clearly visible", color: "#3b82f6" },
        { id: "athletic_m", label: "Athletic", range: "10–15%", desc: "Lean & defined", color: "#22c55e" },
        { id: "fit_m", label: "Fit", range: "16–20%", desc: "Good shape", color: "#06b6d4" },
        { id: "average_m", label: "Average", range: "21–25%", desc: "Typical range", color: "#eab308" },
        { id: "higher_m", label: "Higher", range: "26%+", desc: "Room to go", color: "#f97316" },
      ];

  const trustMessages: Record<number, { icon: string; headline: string; body: string }> = {
    2: { icon: "📏", headline: "Your body is the baseline", body: "These numbers help RepIQ set realistic starting loads and track what genuinely changes — not just the scale." },
    3: { icon: "🎯", headline: "Goals without a plan are just wishes", body: "Knowing where you want to go — and what stands in your way — lets RepIQ build a path that fits your reality." },
    4: { icon: "📈", headline: "Where you've been shapes what's next", body: "Your history and equipment are the two biggest inputs for building your plan. We take both seriously." },
    5: { icon: "📅", headline: "Consistency beats intensity", body: "How many days and how you split your training determines recovery, volume, and results. RepIQ recommends the best split for your schedule." },
    6: { icon: "🧠", headline: "Training is 80% mental", body: "These questions help RepIQ read your patterns — so when motivation dips, the app already knows how to adapt." },
  };

  function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
      <button type="button" className={`ob-chip ${active ? "is-active" : ""}`} onClick={onClick}>
        <span className="ob-chip-check" style={{ visibility: active ? "visible" : "hidden" }}>✓</span>
        {label}
      </button>
    );
  }

  function Stepper({ value, onChange, min, max, unit }: { value: number; onChange: (v: number) => void; min: number; max: number; unit?: string }) {
    return (
      <div className="ob-stepper">
        <button type="button" className="ob-stepper-btn" onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <div className="ob-stepper-val">
          <span className="ob-stepper-num">{value}</span>
          {unit && <span className="ob-stepper-unit">{unit}</span>}
        </div>
        <button type="button" className="ob-stepper-btn" onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </div>
    );
  }

  function UnitToggle({ value, onChange }: { value: "metric" | "imperial"; onChange: (v: "metric" | "imperial") => void }) {
    return (
      <div className="ob-unit-toggle">
        <button type="button" className={`ob-unit-btn ${value === "metric" ? "is-active" : ""}`} onClick={() => onChange("metric")}>Metric</button>
        <button type="button" className={`ob-unit-btn ${value === "imperial" ? "is-active" : ""}`} onClick={() => onChange("imperial")}>Imperial</button>
      </div>
    );
  }

  const stepContent: Record<number, ReactNode> = {
    1: (
      <div className="ob-step ob-step-welcome" key="step-1">
        <div className="ob-welcome-hero">
          <div className="ob-welcome-wordmark">RepIQ</div>
          <h1 className="ob-welcome-title">Built around you,<br />from day one.</h1>
          <p className="ob-welcome-sub">6 quick steps and RepIQ knows exactly how to train you.</p>
        </div>
        <div className="ob-welcome-card">
          <div className="ob-fields">
            <div className="ob-field" ref={nameFieldRef}>
              <label className="ob-field-label">What should we call you? <span className="ob-required">*</span></label>
              <input
                className="ob-text-input"
                type="text"
                placeholder="Your name or nickname"
                value={name}
                maxLength={32}
                onChange={(e) => { setName(e.target.value); setShowStepError(false); }}
              />
            </div>
            <div className="ob-field" ref={genderFieldRef}>
              <label className="ob-field-label">I identify as</label>
              <div className="ob-chip-row">
                <Chip label="Male" active={gender === "male"} onClick={() => setGender("male")} />
                <Chip label="Female" active={gender === "female"} onClick={() => setGender("female")} />
                <Chip label="Prefer not to say" active={gender === "other"} onClick={() => setGender("other")} />
              </div>
            </div>
          </div>
        </div>
      </div>
    ),

    2: (
      <div className="ob-step" key="step-2">
        <div className="ob-trust-card">
          <span className="ob-trust-icon">{trustMessages[2].icon}</span>
          <div>
            <strong className="ob-trust-headline">{trustMessages[2].headline}</strong>
            <p className="ob-trust-body">{trustMessages[2].body}</p>
          </div>
        </div>
        <div className="ob-fields">
          <div className="ob-field" ref={dobFieldRef}>
            <label className="ob-field-label">Date of birth <span className="ob-required">*</span></label>
            <p className="ob-field-hint">
              Used to personalise your training intensity, recovery time, and health context. Your age updates automatically.
            </p>
            <div className="ob-dob-wrap">
              <input
                type="text"
                inputMode="numeric"
                className="ob-dob-input"
                placeholder="DD/MM/YYYY"
                value={dobDisplay}
                maxLength={10}
                onChange={(e) => handleDobInput(e.target.value)}
              />
              <input
                ref={dobPickerRef}
                type="date"
                className="ob-dob-native"
                value={dateOfBirth}
                max={(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 10); return d.toISOString().split("T")[0]; })()}
                min="1930-01-01"
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    const [y, m, d] = val.split("-");
                    setDobDisplay(`${d}/${m}/${y}`);
                    setDateOfBirth(val);
                  }
                  setShowStepError(false);
                }}
                tabIndex={-1}
              />
              <button
                type="button"
                className="ob-dob-picker-btn"
                onClick={() => { dobPickerRef.current?.focus(); dobPickerRef.current?.showPicker?.(); }}
                aria-label="Open date picker"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </button>
            </div>
            {dobDisplay.length === 10 && !dateOfBirth && (
              <p className="ob-dob-error">Invalid date or age must be 10+.</p>
            )}
            {dateOfBirth && getAge(dateOfBirth) !== null && (
              <p className="ob-dob-age-preview">Age: {getAge(dateOfBirth)} years old</p>
            )}
          </div>
          <div className="ob-field ob-field-unit-row">
            <label className="ob-field-label">Units</label>
            <UnitToggle value={unitSystem} onChange={setUnitSystem} />
          </div>
          <div className="ob-hw-row">
            <div className="ob-field ob-hw-col">
              <label className="ob-field-label">Height</label>
              {unitSystem === "metric" ? (
                <Stepper value={heightCm} onChange={setHeightCm} min={120} max={230} unit="cm" />
              ) : (
                <div className="ob-imperial-height">
                  <Stepper value={heightFt} onChange={setHeightFt} min={3} max={7} unit="ft" />
                  <Stepper value={heightIn} onChange={setHeightIn} min={0} max={11} unit="in" />
                </div>
              )}
            </div>
            <div className="ob-field ob-hw-col">
              <label className="ob-field-label">Weight</label>
              {unitSystem === "metric" ? (
                <Stepper value={weightKg} onChange={setWeightKg} min={30} max={250} unit="kg" />
              ) : (
                <Stepper value={weightLbs} onChange={setWeightLbs} min={66} max={550} unit="lbs" />
              )}
            </div>
          </div>
          <div className="ob-field">
            <label className="ob-field-label">Body composition <span className="ob-optional">(best guess)</span></label>
            <div className="ob-bf-grid">
              {bfBrackets.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`ob-bf-card ${bodyFatBracket === b.id ? "is-active" : ""}`}
                  onClick={() => setBodyFatBracket(bodyFatBracket === b.id ? null : b.id)}
                  style={{ "--bf-color": b.color } as React.CSSProperties}
                >
                  <div className="ob-bf-dot" />
                  <span className="ob-bf-label">{b.label}</span>
                  <span className="ob-bf-range">{b.range}</span>
                  <span className="ob-bf-desc">{b.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),

    3: (
      <div className="ob-step" key="step-3">
        <div className="ob-fields">
          <div className="ob-field" ref={goalFieldRef}>
            <label className="ob-field-label">Primary training goal <span className="ob-required">*</span></label>
            <p className="ob-field-hint">A clear goal helps RepIQ prioritise your program — pick the one that matters most right now.</p>
            <div className="ob-chip-grid">
              {([
                { value: "build_muscle", label: "Build Muscle" },
                { value: "fat_loss", label: "Lose Fat" },
                { value: "get_stronger", label: "Get Stronger" },
                { value: "improve_fitness", label: "Improve Fitness" },
                { value: "athletic_performance", label: "Athletic Performance" },
                { value: "stay_active", label: "Stay Active" },
              ] as { value: TrainingGoal; label: string }[]).map((g) => (
                <Chip key={g.value} label={g.label} active={goal === g.value} onClick={() => {
                  setGoal(g.value);
                  if (secondaryGoal === g.value) setSecondaryGoal(null);
                  setShowStepError(false);
                  scrollToNextField(goalFieldRef);
                }} />
              ))}
            </div>
          </div>

          <div className={`ob-field${!goal ? " ob-field-disabled" : ""}`}>
            <label className="ob-field-label">Secondary goal <span className="ob-optional">(optional)</span></label>
            {!goal && <p className="ob-field-hint">Select a primary goal first to unlock this.</p>}
            <div className="ob-chip-grid">
              {([
                { value: "build_muscle", label: "Build Muscle" },
                { value: "fat_loss", label: "Lose Fat" },
                { value: "get_stronger", label: "Get Stronger" },
                { value: "improve_fitness", label: "Improve Fitness" },
                { value: "athletic_performance", label: "Athletic Performance" },
                { value: "stay_active", label: "Stay Active" },
              ] as { value: TrainingGoal; label: string }[]).map((g) => {
                const isSelectedPrimary = g.value === goal;
                const isDisabled = !goal || isSelectedPrimary;
                return (
                  <button
                    key={g.value}
                    type="button"
                    className={`ob-chip${secondaryGoal === g.value ? " is-active" : ""}${isDisabled ? " is-disabled" : ""}`}
                    disabled={isDisabled}
                    onClick={() => setSecondaryGoal(secondaryGoal === g.value ? null : g.value)}
                  >
                    <span className="ob-chip-check" style={{ visibility: secondaryGoal === g.value ? "visible" : "hidden" }}>✓</span>
                    {g.label}
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    ),

    4: (
      <div className="ob-step" key="step-4">
        <div className="ob-trust-card">
          <span className="ob-trust-icon">{trustMessages[4].icon}</span>
          <div>
            <strong className="ob-trust-headline">{trustMessages[4].headline}</strong>
            <p className="ob-trust-body">{trustMessages[4].body}</p>
          </div>
        </div>
        <div className="ob-fields">
          <div className="ob-field" ref={experienceFieldRef}>
            <label className="ob-field-label">Training background <span className="ob-required">*</span></label>
            <div className="ob-exp-list">
              {([
                { value: "never", label: "New to training", desc: "I haven't trained before" },
                { value: "beginner", label: "Getting started", desc: "Training for less than a year" },
                { value: "intermediate", label: "Building foundations", desc: "1–3 years of consistent training" },
                { value: "advanced", label: "Experienced", desc: "3–5 years, I know my way around" },
                { value: "veteran", label: "Veteran", desc: "5+ years — I've seen it all" },
              ] as { value: ExperienceLevel; label: string; desc: string }[]).map((e) => (
                <button
                  key={e.value}
                  type="button"
                  className={`ob-exp-row ${experience === e.value ? "is-active" : ""}`}
                  onClick={() => { setExperience(e.value); setShowStepError(false); scrollToNextField(experienceFieldRef); }}
                >
                  <div className="ob-exp-row-dot" />
                  <div className="ob-exp-row-text">
                    <strong>{e.label}</strong>
                    <span>{e.desc}</span>
                  </div>
                  {experience === e.value && <span className="ob-exp-check">✓</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="ob-field" ref={equipmentFieldRef}>
            <label className="ob-field-label">Where do you train? <span className="ob-required">*</span></label>
            <p className="ob-field-hint">This determines which exercises RepIQ can include in your plan.</p>
            <div className="ob-equipment-list">
              {([
                { value: "bodyweight",    label: "Bodyweight only",     desc: "No equipment — push-ups, pull-ups, planks" },
                { value: "dumbbell_pair", label: "A pair of dumbbells", desc: "Fixed or adjustable dumbbells at home" },
                { value: "home_setup",    label: "Home gym",            desc: "Dumbbells + barbell with plates" },
                { value: "basic_gym",     label: "Basic gym",           desc: "Barbells, dumbbells, some machines and cables" },
                { value: "full_gym",      label: "Full gym",            desc: "All equipment — cables, machines, full selection" },
              ] as { value: EquipmentAccess; label: string; desc: string }[]).map((e) => (
                <button
                  key={e.value}
                  type="button"
                  className={`ob-equipment-btn${equipmentAccess === e.value ? " is-active" : ""}`}
                  onClick={() => { setEquipmentAccess(e.value); setShowStepError(false); scrollToNextField(equipmentFieldRef); }}
                >
                  <div className="ob-equipment-text">
                    <strong>{e.label}</strong>
                    <span>{e.desc}</span>
                  </div>
                  {equipmentAccess === e.value && <span className="ob-exp-check">✓</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="ob-field ob-returning-field">
            <label className="ob-checkbox-row">
              <input
                type="checkbox"
                className="ob-checkbox"
                checked={isReturning}
                onChange={(e) => setIsReturning(e.target.checked)}
              />
              <span className="ob-checkbox-label">I'm returning after a break</span>
            </label>
            {isReturning && (
              <div className="ob-break-stepper">
                <span className="ob-break-label">Break duration</span>
                <Stepper value={breakMonths} onChange={setBreakMonths} min={1} max={60} unit={breakMonths === 1 ? "month" : "months"} />
              </div>
            )}
          </div>
        </div>
      </div>
    ),

    5: (
      <div className="ob-step" key="step-5">
        <div className="ob-trust-card">
          <span className="ob-trust-icon">{trustMessages[5].icon}</span>
          <div>
            <strong className="ob-trust-headline">{trustMessages[5].headline}</strong>
            <p className="ob-trust-body">{trustMessages[5].body}</p>
          </div>
        </div>
        <div className="ob-fields">
          {/* 1. Training sessions per week */}
          <div className="ob-field" ref={daysFieldRef}>
            <label className="ob-field-label">Training sessions per week</label>
            <div className="ob-days-strip">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`ob-day-btn ${daysPerWeek === d ? "is-active" : ""}`}
                  onClick={() => { setDaysPerWeek(d); scrollToNextField(daysFieldRef); }}
                >
                  {d}
                </button>
              ))}
            </div>
            <p className="ob-field-hint" style={{ marginTop: 8 }}>Follow a rotating cycle instead of a fixed week? You can set that up in the Planner.</p>
          </div>

          {/* 2. Session length */}
          <div className="ob-field" ref={sessionLengthFieldRef}>
            <label className="ob-field-label">Session length</label>
            <div className="ob-chip-row">
              {[30, 45, 60, 75, 90].map((m) => (
                <Chip key={m} label={m === 90 ? "90+ min" : `${m} min`} active={sessionLength === m} onClick={() => { setSessionLength(m); scrollToNextField(sessionLengthFieldRef); }} />
              ))}
            </div>
          </div>

          {/* 3. Workout split */}
          <div className="ob-field">
            <label className="ob-field-label">Workout split</label>
            <p className="ob-field-hint">Based on {daysPerWeek} session{daysPerWeek !== 1 ? "s" : ""}.{daysPerWeek === 7 ? " No rest days — recommended for advanced trainees." : ""} You can customise the muscle arrangement per day in the Planner later.</p>
            <div className="ob-split-grid">
              {recommendedSplits.map((s) => {
                const isRecommended = s === autoRecommendedSplit;
                const isActive = splitPref === s || (splitPref === null && isRecommended);
                return (
                  <button
                    key={s}
                    type="button"
                    className={`ob-split-btn${isActive ? " is-active" : ""}`}
                    onClick={() => setSplitPref(isActive && isRecommended ? null : s)}
                  >
                    <div className="ob-split-text">
                      <span className="ob-split-name">{SPLIT_LABEL[s]}</span>
                      <span className="ob-split-desc">{SPLIT_DESC[s]}</span>
                    </div>
                    {isRecommended && <span className="ob-split-rec">Recommended</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Best time to train — optional, at end */}
          <div className="ob-field">
            <label className="ob-field-label">Best time to train <span className="ob-optional">(optional)</span></label>
            <p className="ob-field-hint">We'll use this to send reminders at the right time.</p>
            <div className="ob-chip-row">
              {[
                { value: "morning", label: "Morning" },
                { value: "afternoon", label: "Afternoon" },
                { value: "evening", label: "Evening" },
                { value: "varies", label: "Varies" },
              ].map((t) => (
                <Chip key={t.value} label={t.label} active={bestTime === t.value} onClick={() => setBestTime(bestTime === t.value ? null : t.value)} />
              ))}
            </div>
          </div>
        </div>
      </div>
    ),

    6: (
      <div className="ob-step" key="step-6">
        <div className="ob-trust-card">
          <span className="ob-trust-icon">{trustMessages[6].icon}</span>
          <div>
            <strong className="ob-trust-headline">{trustMessages[6].headline}</strong>
            <p className="ob-trust-body">{trustMessages[6].body}</p>
          </div>
        </div>
        <div className="ob-fields">
          {/* Biggest challenge */}
          <div className="ob-field">
            <label className="ob-field-label">Biggest challenge right now <span className="ob-optional">(pick all that apply)</span></label>
            <div className="ob-chip-grid">
              {[
                { value: "time",        label: "Not enough time" },
                { value: "motivation",  label: "Staying motivated" },
                { value: "knowledge",   label: "Not sure what to do" },
                { value: "injury",      label: "Recovery / injury" },
                { value: "consistency", label: "Staying consistent" },
              ].map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  active={biggestObstacles.includes(o.value)}
                  onClick={() => {
                    setBiggestObstacles((prev) =>
                      prev.includes(o.value) ? prev.filter((x) => x !== o.value) : [...prev, o.value]
                    );
                  }}
                />
              ))}
            </div>
          </div>

          {/* Pre-workout feeling */}
          <div className="ob-field">
            <label className="ob-field-label">Before a workout, you usually feel <span className="ob-optional">(optional)</span></label>
            <div className="ob-chip-grid">
              {[
                { value: "energised", label: "Energised & ready" },
                { value: "neutral",   label: "Neutral" },
                { value: "reluctant", label: "Reluctant, but I go" },
                { value: "tired",     label: "Usually tired" },
              ].map((f) => (
                <Chip key={f.value} label={f.label} active={preWorkoutFeeling === f.value} onClick={() =>
                  setPreWorkoutFeeling(preWorkoutFeeling === f.value ? null : f.value)
                } />
              ))}
            </div>
          </div>

          {/* Success vision */}
          <div className="ob-field">
            <label className="ob-field-label">In 3 months, success means <span className="ob-optional">(optional)</span></label>
            <div className="ob-chip-grid">
              {[
                { value: "look_different", label: "I look noticeably different" },
                { value: "stronger",       label: "I'm significantly stronger" },
                { value: "consistent",     label: "I've trained consistently" },
                { value: "healthier",      label: "I feel healthier overall" },
                { value: "habit",          label: "I've built a real habit" },
              ].map((v) => (
                <Chip key={v.value} label={v.label} active={successVision === v.value} onClick={() =>
                  setSuccessVision(successVision === v.value ? null : v.value)
                } />
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
  };

  const ThemeBtn = () => (
    <button type="button" className="ob-theme-btn" onClick={onToggleTheme} aria-label="Toggle theme">
      {resolvedTheme === "dark"
        ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      }
    </button>
  );

  return (
    <div className="ob-page" data-step={step}>
      <header className={`ob-header ${step === 1 ? "ob-header-splash" : ""}`}>
        <div className="ob-progress">
          <div className="ob-step-row">
            {STEP_LABELS.map((lbl, i) => {
              const n = i + 1;
              const done = n < step;
              const active = n === step;
              return (
                <Fragment key={n}>
                  {n <= maxStep || (n === step + 1 && canAdvance) ? (
                    <button
                      type="button"
                      className={`ob-dot is-clickable${done ? " is-done" : active ? " is-active" : " is-visited"}`}
                      onClick={() => {
                        if (n > maxStep) setMaxStep(n);
                        setStep(n);
                        setShowStepError(false);
                        requestAnimationFrame(() => obBodyRef.current?.scrollTo({ top: 0 }));
                      }}
                      aria-label={done ? `Go back to ${lbl}` : lbl}
                    >{done ? "✓" : n}</button>
                  ) : (
                    <div className="ob-dot">{n}</div>
                  )}
                  {i < TOTAL - 1 && <div className={`ob-connector ${n < step ? "is-filled" : ""}`} />}
                </Fragment>
              );
            })}
          </div>
          <div className="ob-label-row">
            {STEP_LABELS.map((lbl, i) => (
              <span key={i} className={`ob-step-lbl ${i + 1 === step ? "is-active" : ""}`}>{lbl}</span>
            ))}
          </div>
          <div className="ob-progress-foot">
            <p className="ob-step-count">Step {step} of {TOTAL}</p>
            <ThemeBtn />
          </div>
        </div>
      </header>

      <div className="ob-body" ref={obBodyRef}>
        {stepContent[step]}
      </div>

      <div className="ob-footer">
        {step > 1 && (
          <button type="button" className="ob-back" onClick={() => { setStep((s) => s - 1); setShowStepError(false); requestAnimationFrame(() => obBodyRef.current?.scrollTo({ top: 0 })); }}>← Back</button>
        )}
        <div className="ob-cta-wrap">
          {showStepError && stepErrorMessage[step] && (
            <p className="ob-step-error">⚠ {stepErrorMessage[step]}</p>
          )}
          <button
            type="button"
            className="ob-cta"
            onClick={advance}
          >
            {step === TOTAL ? "I'm Ready →" : step === 1 ? "Get Started →" : "Continue →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddExercisePage({
  templates,
  existingExerciseNames,
  onBack,
  onAddSelected,
  onCreateCustom,
  onOpenDetails,
  editorExercise,
  onUpdateCustom,
  resolvedTheme,
  onToggleTheme,
  preFilterMuscle,
  replaceMode,
  smartReplacementMeta,
}: {
  templates: ExerciseDraft[];
  existingExerciseNames: string[];
  onBack: () => void;
  onAddSelected: (templateIds: string[]) => void;
  onCreateCustom: (draft: CustomExerciseInput) => string | null;
  onOpenDetails: (exerciseId: string) => void;
  editorExercise?: ExerciseDraft | null;
  onUpdateCustom?: (exerciseId: string, draft: CustomExerciseInput) => string | null;
  resolvedTheme?: string;
  onToggleTheme?: () => void;
  preFilterMuscle?: string;
  replaceMode?: boolean;
  smartReplacementMeta?: Record<string, { rank: number; score: number; matchReason: string }>;
}) {
  const isEditingCustomExercise = Boolean(editorExercise);
  const [mode, setMode] = useState<AddExerciseMode>(editorExercise ? "create" : "browse");
  const [createStep, setCreateStep] = useState<CreateExerciseStep>(1);
  const [browseTab, setBrowseTab] = useState<"all" | "muscle" | "type">("all");
  const [expandedMuscleKeys, setExpandedMuscleKeys] = useState<string[] | null>(null);
  const [expandedTypeKeys, setExpandedTypeKeys] = useState<string[]>([]);
  const [showSecondaryDrilldown, setShowSecondaryDrilldown] = useState(true);
  const [expandedSecondaryKeys, setExpandedSecondaryKeys] = useState<string[] | null>(null);
  const [sortMode, setSortMode] = useState<"alphabetical" | "frequency" | "library">("alphabetical");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState(replaceMode ? "" : (preFilterMuscle ?? ""));
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [showInWorkoutOnly, setShowInWorkoutOnly] = useState(false);
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [customName, setCustomName] = useState(editorExercise?.name ?? "");
  const [customImageSrc, setCustomImageSrc] = useState(editorExercise?.imageSrc ?? "");
  const [customPrimaryMuscles, setCustomPrimaryMuscles] = useState<string[]>(
    editorExercise?.primaryMuscles ?? (editorExercise ? [editorExercise.primaryMuscle] : [])
  );
  const [customSecondaryMuscles, setCustomSecondaryMuscles] = useState<string[]>(
    editorExercise?.secondaryMuscles ?? []
  );
  const [customExerciseType, setCustomExerciseType] = useState<CustomExerciseType | null>(
    editorExercise?.exerciseType ?? (editorExercise ? inferExerciseType(editorExercise) : null)
  );
  const [customMeasurementType, setCustomMeasurementType] = useState<MeasurementType | null>(
    editorExercise ? getExerciseMeasurementType(editorExercise) : null
  );
  const [customMovementSide, setCustomMovementSide] = useState<MovementSide | null>(
    editorExercise?.movementSide ?? null
  );
  const [customMovementPattern, setCustomMovementPattern] = useState<MovementPattern | null>(
    (editorExercise as ExerciseWithTaxonomy)?.movementPattern ?? null
  );
  const [duplicateNamePrompt, setDuplicateNamePrompt] = useState<{
    requestedName: string;
    suggestedName: string;
  } | null>(null);
  const [primarySelectorOpen, setPrimarySelectorOpen] = useState(false);
  const [secondarySelectorOpen, setSecondarySelectorOpen] = useState(false);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const previousPrimaryCountRef = useRef(customPrimaryMuscles.length);

  useEffect(() => {
    if (!editorExercise) {
      return;
    }

    setMode("create");
    setCreateStep(1);
    setCustomName(editorExercise.name);
    setCustomImageSrc(editorExercise.imageSrc);
    setCustomPrimaryMuscles(editorExercise.primaryMuscles ?? [editorExercise.primaryMuscle]);
    setCustomSecondaryMuscles(editorExercise.secondaryMuscles);
    setCustomExerciseType(editorExercise.exerciseType ?? inferExerciseType(editorExercise));
    setCustomMeasurementType(getExerciseMeasurementType(editorExercise));
    setCustomMovementSide(editorExercise.movementSide ?? null);
    setCustomMovementPattern((editorExercise as ExerciseWithTaxonomy).movementPattern ?? null);
    setDuplicateNamePrompt(null);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [editorExercise]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    window.requestAnimationFrame(() => {
      resultsRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [mode]);

  const getExerciseType = (exercise: ExerciseDraft) => {
    if (exercise.id.startsWith("custom-")) {
      return "Added by me";
    }

    const inferredType = inferExerciseType(exercise);
    if (inferredType === "bodyweight_weighted") {
      return "Weighted Bodyweight";
    }
    if (inferredType === "freestyle_cardio") {
      return "Cardio";
    }
    if (/(stretch|mobility|yoga)/.test(exercise.name.toLowerCase())) {
      return "Stretching";
    }
    if (inferredType === "bodyweight_only") {
      return "Bodyweight";
    }
    return "Weighted";
  };

  const templateOrder = useMemo(() => {
    const order = new Map<string, number>();
    templates.forEach((template, index) => {
      order.set(template.id, index);
    });
    return order;
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    const searched = templates.filter((template) => {
      return matchesSearchTokens(query, [
        template.name,
        ...getPrimaryMuscles(template),
        template.secondaryMuscles.join(" "),
        template.goal,
        getExerciseType(template)
      ]);
    });

    const narrowed = searched.filter((template) => {
      const alreadyInWorkout = existingExerciseNames.includes(template.name);
      const isSelected = selectedTemplateIds.includes(template.id);

      if (showInWorkoutOnly && !alreadyInWorkout) {
        return false;
      }

      if (showSelectedOnly && !isSelected) {
        return false;
      }

      return true;
    });

    const sorted = [...narrowed].sort((left, right) => {
      const leftReplacementMeta = smartReplacementMeta?.[left.id];
      const rightReplacementMeta = smartReplacementMeta?.[right.id];
      if (replaceMode && (leftReplacementMeta || rightReplacementMeta)) {
        if (leftReplacementMeta && rightReplacementMeta) {
          if (leftReplacementMeta.rank !== rightReplacementMeta.rank) {
            return leftReplacementMeta.rank - rightReplacementMeta.rank;
          }
          if (leftReplacementMeta.score !== rightReplacementMeta.score) {
            return rightReplacementMeta.score - leftReplacementMeta.score;
          }
        } else {
          return leftReplacementMeta ? -1 : 1;
        }
      }

      if (sortMode === "library") {
        const orderDelta = (templateOrder.get(left.id) ?? 0) - (templateOrder.get(right.id) ?? 0);
        return sortDirection === "asc" ? orderDelta : -orderDelta;
      }

      if (sortMode === "frequency") {
        const frequencyDelta =
          sortDirection === "asc"
            ? left.history.length - right.history.length
            : right.history.length - left.history.length;
        if (frequencyDelta !== 0) {
          return frequencyDelta;
        }
      }

      const nameDelta = left.name.localeCompare(right.name);
      return sortDirection === "asc" ? nameDelta : -nameDelta;
    });

    return sorted;
  }, [existingExerciseNames, query, replaceMode, selectedTemplateIds, showInWorkoutOnly, showSelectedOnly, smartReplacementMeta, sortDirection, sortMode, templateOrder, templates]);

  function selectSortMode(nextMode: "alphabetical" | "frequency" | "library") {
    if (nextMode === sortMode) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortMode(nextMode);
      setSortDirection(nextMode === "frequency" ? "desc" : "asc");
    }
    setFilterOpen(false);
  }

  const groupedByMuscle = useMemo(() => {
    return filteredTemplates.reduce<Record<string, ExerciseDraft[]>>((groups, template) => {
      const key = getCanonicalMuscle(getPrimaryMuscles(template)[0]);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(template);
      return groups;
    }, {});
  }, [filteredTemplates]);

  const muscleGroupKeys = useMemo(
    () => CANONICAL_MUSCLE_ORDER.filter((g) => Boolean(groupedByMuscle[g])),
    [groupedByMuscle]
  );

  const groupedByType = useMemo(() => {
    return filteredTemplates.reduce<Record<string, ExerciseDraft[]>>((groups, template) => {
      const key = getExerciseType(template);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(template);
      return groups;
    }, {});
  }, [filteredTemplates]);

  const typeGroupKeys = useMemo(
    () => Object.keys(groupedByType).sort((left, right) => left.localeCompare(right)),
    [groupedByType]
  );

  // Secondary-muscle drill-down
  // Sub-groups = actual primaryMuscle value (e.g. "Upper Chest", "Lats") +
  //              any secondaryMuscles that map to the SAME canonical group (overlap allowed)
  const groupedByMuscleWithSecondary = useMemo(() => {
    if (!showSecondaryDrilldown) return {} as Record<string, Record<string, ExerciseDraft[]>>;
    const result: Record<string, Record<string, ExerciseDraft[]>> = {};
    muscleGroupKeys.forEach((canonical) => {
      const exercises = groupedByMuscle[canonical] ?? [];
      const subMap: Record<string, ExerciseDraft[]> = {};
      exercises.forEach((ex) => {
        // Always bucket by the exercise's own primaryMuscle label
        const ownPrimary = getPrimaryMuscles(ex)[0];
        if (!subMap[ownPrimary]) subMap[ownPrimary] = [];
        subMap[ownPrimary].push(ex);
        // Also bucket by any secondary that maps to this same canonical group (creates overlap)
        (ex.secondaryMuscles ?? []).forEach((sec) => {
          if (getCanonicalMuscle(sec) === canonical && sec !== ownPrimary) {
            if (!subMap[sec]) subMap[sec] = [];
            subMap[sec].push(ex);
          }
        });
      });
      result[canonical] = subMap;
    });
    return result;
  }, [showSecondaryDrilldown, groupedByMuscle, muscleGroupKeys]);

  const allSecondaryKeys = useMemo(() => {
    const keys: string[] = [];
    muscleGroupKeys.forEach((pk) => {
      const secMap = groupedByMuscleWithSecondary[pk] ?? {};
      Object.keys(secMap).sort((a, b) => a.localeCompare(b)).forEach((sk) => keys.push(`${pk}::${sk}`));
    });
    return keys;
  }, [groupedByMuscleWithSecondary, muscleGroupKeys]);

  useEffect(() => {
    setExpandedMuscleKeys((current) => {
      if (current === null) {
        return [...muscleGroupKeys];
      }

      return current.filter((key) => (muscleGroupKeys as string[]).includes(key));
    });
  }, [muscleGroupKeys]);

  function toggleMuscleGroup(muscle: string) {
    setExpandedMuscleKeys((current) => {
      const resolved = current ?? muscleGroupKeys;
      return resolved.includes(muscle)
        ? resolved.filter((entry) => entry !== muscle)
        : [...resolved, muscle];
    });
  }

  function toggleAllMuscleGroups() {
    setExpandedMuscleKeys((current) => {
      const resolved = current ?? muscleGroupKeys;
      return resolved.length === muscleGroupKeys.length ? [] : [...muscleGroupKeys];
    });
  }

  function toggleTypeGroup(type: string) {
    setExpandedTypeKeys((current) =>
      current.includes(type) ? current.filter((entry) => entry !== type) : [...current, type]
    );
  }

  function toggleAllTypeGroups() {
    setExpandedTypeKeys((current) =>
      current.length === typeGroupKeys.length ? [] : [...typeGroupKeys]
    );
  }

  function toggleSecondaryDrilldown() {
    setShowSecondaryDrilldown((prev) => {
      if (!prev) setExpandedSecondaryKeys(null); // reset to all expanded when turning on
      return !prev;
    });
  }

  function toggleSecondaryGroup(key: string) {
    setExpandedSecondaryKeys((current) => {
      const resolved = current ?? allSecondaryKeys;
      return resolved.includes(key)
        ? resolved.filter((k) => k !== key)
        : [...resolved, key];
    });
  }

  const canCreateCustom =
    customName.trim().length > 1 &&
    customPrimaryMuscles.length > 0 &&
    customExerciseType !== null &&
    customMeasurementType !== null &&
    customMovementSide !== null;
  const canContinueToStepTwo =
    customName.trim().length > 1 && customPrimaryMuscles.length > 0;

  const hasSearchQuery = query.trim().length > 0;
  const existingTemplateNames = useMemo(() => templates.map((template) => template.name), [templates]);

  function openCreateMode(prefilledName?: string) {
    if (isEditingCustomExercise) {
      return;
    }
    setMode("create");
    setCreateStep(1);
    setCustomName(prefilledName?.trim() ?? "");
    setCustomImageSrc("");
    setCustomPrimaryMuscles([]);
    setCustomSecondaryMuscles([]);
    setCustomExerciseType(null);
    setCustomMeasurementType(null);
    setCustomMovementSide(null);
  }

  function togglePrimaryMuscle(muscle: string) {
    setCustomPrimaryMuscles((current) =>
      current.includes(muscle)
        ? current.filter((entry) => entry !== muscle)
        : [...current, muscle]
    );
  }

  function toggleSecondaryMuscle(muscle: string) {
    setCustomSecondaryMuscles((current) =>
      current.includes(muscle)
        ? current.filter((entry) => entry !== muscle)
        : [...current, muscle]
    );
  }

  function continueToCreateStepTwo() {
    if (!canContinueToStepTwo) {
      return;
    }

    setCreateStep(2);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
      resultsRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
  }

  function submitCustomExercise(nameOverride?: string) {
    const finalName = (nameOverride ?? customName).trim();
    if (!finalName || !customExerciseType || !customMeasurementType || !customMovementSide) {
      return;
    }

    const exerciseInput: CustomExerciseInput = {
      name: finalName,
      imageSrc: customImageSrc || undefined,
      primaryMuscles: customPrimaryMuscles,
      secondaryMuscles: customSecondaryMuscles,
      exerciseType: customExerciseType,
      measurementType: customMeasurementType,
      movementSide: customMovementSide,
      movementPattern: customMovementPattern ?? undefined
    };

    const createdId =
      isEditingCustomExercise && editorExercise && onUpdateCustom
        ? onUpdateCustom(editorExercise.id, exerciseInput)
        : onCreateCustom(exerciseInput);

    if (createdId) {
      setDuplicateNamePrompt(null);
      if (isEditingCustomExercise) {
        onBack();
      } else {
        setMode("browse");
        setCreateStep(1);
      }
    }
  }

  function handleCreateCustomSubmit() {
    const requestedName = customName.trim();
    if (!requestedName) {
      return;
    }

    const comparableTemplateNames = isEditingCustomExercise && editorExercise
      ? existingTemplateNames.filter(
          (name) => name.trim().toLowerCase() !== editorExercise.name.trim().toLowerCase()
        )
      : existingTemplateNames;

    const hasExactDuplicate = comparableTemplateNames.some(
      (name) => name.trim().toLowerCase() === requestedName.toLowerCase()
    );

    if (hasExactDuplicate) {
      setDuplicateNamePrompt({
        requestedName,
        suggestedName: ensureUniqueExerciseName(requestedName, comparableTemplateNames)
      });
      return;
    }

    submitCustomExercise();
  }

  useEffect(() => {
    if (customPrimaryMuscles.length === 0) {
      return;
    }

    setCustomSecondaryMuscles((current) =>
      current.filter((muscle) => !customPrimaryMuscles.includes(muscle))
    );
  }, [customPrimaryMuscles]);

  const secondaryMuscleOptions = useMemo(
    () => secondaryMuscleLibrary.filter((muscle) => !customPrimaryMuscles.includes(muscle)),
    [customPrimaryMuscles]
  );

  useEffect(() => {
    if (!customExerciseType) {
      return;
    }

    if (customExerciseType === "freestyle_cardio") {
      setCustomMeasurementType("timed");
      return;
    }

    setCustomMeasurementType((current) => current ?? "reps_volume");
  }, [customExerciseType]);

  useEffect(() => {
    const previousCount = previousPrimaryCountRef.current;
    if (previousCount === 0 && customPrimaryMuscles.length > 0) {
      setSecondarySelectorOpen(true);
    }
    previousPrimaryCountRef.current = customPrimaryMuscles.length;
  }, [customPrimaryMuscles.length]);

  function handleCustomImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCustomImageSrc(reader.result);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  const toggleTemplateSelection = (templateId: string) => {
    setSelectedTemplateIds((current) =>
      current.includes(templateId)
        ? current.filter((id) => id !== templateId)
        : [...current, templateId]
    );
  };

  const clearSearch = () => {
    setQuery("");
    window.requestAnimationFrame(() => {
      resultsRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const renderTemplateCard = (template: ExerciseDraft) => {
    const alreadyInWorkout = existingExerciseNames.includes(template.name);
    const selectionIndex = selectedTemplateIds.indexOf(template.id);
    const replacementHint = smartReplacementMeta?.[template.id]?.matchReason;

    return (
      <article
        key={template.id}
        className={`template-card ${selectionIndex >= 0 ? "is-selected" : ""}`}
      >
        <button
          type="button"
          className="template-card-main"
          title={template.name}
          onClick={() => toggleTemplateSelection(template.id)}
        >
          <img src={template.imageSrc} alt={template.name} className="template-thumb" />
          <div className="template-card-copy">
            <div className="template-card-top">
              <strong>{template.name}</strong>
              <div className="template-card-statuses">
                {template.id.startsWith("custom-") && (
                  <span className="custom-exercise-badge" aria-label="Custom exercise">Mine</span>
                )}
                {alreadyInWorkout && <span className="session-status-pill">In workout</span>}
                {selectionIndex >= 0 && (
                  <span className="template-select-badge" aria-label={`Selected ${selectionIndex + 1}`}>
                    ✓ {selectionIndex + 1}
                  </span>
                )}
              </div>
            </div>
            {replaceMode && replacementHint && (
              <p className="template-card-match-reason">{replacementHint}</p>
            )}
            <p className="template-card-meta">
              <strong>{formatPrimaryMuscles(template)}</strong>
              {template.secondaryMuscles.length > 0 ? (
                <>
                  {" · "}
                  <span>{template.secondaryMuscles.join(", ")}</span>
                </>
              ) : null}
            </p>
          </div>
        </button>
        <button
          type="button"
          className="template-card-info-button"
          aria-label={`View details for ${template.name}`}
          title={`View details for ${template.name}`}
          onClick={() => onOpenDetails(template.id)}
        >
          i
        </button>
      </article>
    );
  };

  return (
    <main className="detail-page add-exercise-page">
      <header className="detail-topbar">
        <button
          className="back-nav-button detail-back-button"
          type="button"
          onClick={() => {
            if (mode === "create") {
              if (createStep === 2) {
                setCreateStep(1);
                return;
              }
              if (isEditingCustomExercise) {
                onBack();
                return;
              }
              setMode("browse");
              return;
            }
            onBack();
          }}
          aria-label="Back"
        >
          ←
        </button>
        <div className="detail-topbar-copy">
          <p className="label">{mode === "create" ? "Custom Exercise" : "Exercise Selector"}</p>
          <h1>
            {mode === "create"
              ? isEditingCustomExercise
                ? "Edit Exercise"
                : "Create Exercise"
              : replaceMode
                ? "Replace Exercise"
                : "Add Exercise"}
          </h1>
        </div>
        <div className="detail-topbar-actions">
          <div className="detail-topbar-action-group">
            {resolvedTheme && onToggleTheme && (
              <button type="button" className="theme-toggle-btn" onClick={onToggleTheme} aria-label="Toggle theme">
                {resolvedTheme === "dark" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
              </button>
            )}
            {mode === "browse" && (
              <button
                className="icon-button add-exercise-header-icon"
                type="button"
                aria-label="Sort and filter"
                title="Sort and filter"
                onClick={() => setFilterOpen(true)}
              >
                ≡
              </button>
            )}
          </div>
        </div>
      </header>

      <section className={`detail-section ${mode === "browse" ? "add-exercise-section" : ""}`}>
        {mode === "browse" ? (
          <>
            <div className="add-exercise-browse">
              <div className="add-exercise-toolbar">
                <div className="add-exercise-tab-strip">
                  <button
                    type="button"
                    className={`theme-choice add-exercise-tab ${browseTab === "all" ? "is-active" : ""}`}
                    onClick={() => setBrowseTab("all")}
                  >
                    All Exercises
                  </button>
                  <button
                    type="button"
                    className={`theme-choice add-exercise-tab ${browseTab === "muscle" ? "is-active" : ""}`}
                    onClick={() => setBrowseTab("muscle")}
                  >
                    By Muscle
                  </button>
                  <button
                    type="button"
                    className={`theme-choice add-exercise-tab ${browseTab === "type" ? "is-active" : ""}`}
                    onClick={() => setBrowseTab("type")}
                  >
                    Types
                  </button>
                </div>

                <div className="search-shell">
                  <div className="search-shell-head">
                    <div className="search-shell-head-left">
                      <span className="selected-count-label">{selectedTemplateIds.length} <span className="selected-count-word">selected</span></span>
                      <div className="quick-filter-row" aria-label="Quick exercise filters">
                        <button
                          type="button"
                          className={`quick-filter-chip ${showInWorkoutOnly ? "is-active" : ""}`}
                          onClick={() => setShowInWorkoutOnly((current) => !current)}
                        >
                          <span>In workout</span>
                        </button>
                        <button
                          type="button"
                          className={`quick-filter-chip ${showSelectedOnly ? "is-active" : ""}`}
                          onClick={() => setShowSelectedOnly((current) => !current)}
                        >
                          <span>Selected</span>
                        </button>
                      </div>
                    </div>
                    <div className="search-shell-head-right">
                      {(browseTab === "type" || browseTab === "muscle") && (
                        <button
                          type="button"
                          className="template-group-toolbar-button"
                          onClick={
                            browseTab === "type" ? toggleAllTypeGroups : toggleAllMuscleGroups
                          }
                        >
                          {browseTab === "type"
                            ? expandedTypeKeys.length === typeGroupKeys.length
                              ? "Collapse all"
                              : "Expand all"
                            : (expandedMuscleKeys ?? muscleGroupKeys).length === muscleGroupKeys.length
                              ? "Collapse all"
                              : "Expand all"}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="search-input-shell">
                    <input
                      className="search-input"
                      type="text"
                      aria-label="Search exercises"
                      placeholder="Search by exercise or muscle"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                    {query.trim().length > 0 && (
                      <button
                        className="search-clear-button"
                        type="button"
                        aria-label="Clear search"
                        onClick={clearSearch}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div ref={resultsRef} className="template-results">
                {filteredTemplates.length === 0 ? (
                  <article className="empty-state-card">
                    <strong>No matching exercise yet</strong>
                    <p>
                      Try a broader search or create this as your own exercise instead.
                    </p>
                    {hasSearchQuery && (
                      <button
                        type="button"
                        className="empty-state-create-button"
                        onClick={() => openCreateMode(query)}
                      >
                        Create &quot;{query.trim()}&quot;
                      </button>
                    )}
                  </article>
                ) : (
                  <>
                    {browseTab === "all" && (
                      <>
                        <div className="template-list">{filteredTemplates.map(renderTemplateCard)}</div>
                      </>
                    )}

                    {browseTab === "muscle" && (
                      <div className="template-group-list">
                        {/* ── Secondary-muscle drill-down toggle ── */}
                        <div className="muscle-drilldown-strip">
                          <span className="muscle-drilldown-label">
                            {showSecondaryDrilldown ? "Primary + sub-muscles" : "Primary muscle only"}
                          </span>
                          <button
                            type="button"
                            className={`muscle-drilldown-btn ${showSecondaryDrilldown ? "is-active" : ""}`}
                            onClick={toggleSecondaryDrilldown}
                          >
                            {showSecondaryDrilldown ? "Sub-muscles: On" : "Sub-muscles: Off"}
                          </button>
                        </div>

                        {muscleGroupKeys.map((muscle) => {
                          const isPrimaryExpanded = (expandedMuscleKeys ?? muscleGroupKeys).includes(muscle);
                          const secMap = groupedByMuscleWithSecondary[muscle] ?? {};
                          const secKeys = Object.keys(secMap).sort((a, b) => a.localeCompare(b));
                          return (
                            <section key={muscle} className="template-group-section">
                              <button
                                type="button"
                                className={`template-group-heading template-group-heading-button ${isPrimaryExpanded ? "is-expanded" : ""}`}
                                onClick={() => toggleMuscleGroup(muscle)}
                              >
                                <strong>{muscle}</strong>
                                <span>{groupedByMuscle[muscle].length}</span>
                                <span className="template-group-chevron" aria-hidden="true">
                                  {isPrimaryExpanded ? "⌃" : "⌄"}
                                </span>
                              </button>

                              {isPrimaryExpanded && (
                                showSecondaryDrilldown ? (
                                  // ── Nested secondary sub-groups ──
                                  <div className="secondary-muscle-groups">
                                    {secKeys.map((secondary) => {
                                      const secKey = `${muscle}::${secondary}`;
                                      const isSecExpanded = (expandedSecondaryKeys ?? allSecondaryKeys).includes(secKey);
                                      const secExercises = secMap[secondary];
                                      return (
                                        <div key={secondary} className="secondary-muscle-section">
                                          <button
                                            type="button"
                                            className={`secondary-muscle-heading ${isSecExpanded ? "is-expanded" : ""}`}
                                            onClick={() => toggleSecondaryGroup(secKey)}
                                          >
                                            <span className="secondary-muscle-name">{secondary}</span>
                                            <span className="secondary-muscle-count">{secExercises.length}</span>
                                            <span className="template-group-chevron" aria-hidden="true">
                                              {isSecExpanded ? "⌃" : "⌄"}
                                            </span>
                                          </button>
                                          {isSecExpanded && (
                                            <div className="template-list secondary-muscle-list">
                                              {secExercises.map(renderTemplateCard)}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  // ── Default flat list ──
                                  <div className="template-list">
                                    {groupedByMuscle[muscle].map(renderTemplateCard)}
                                  </div>
                                )
                              )}
                            </section>
                          );
                        })}
                      </div>
                    )}

                    {browseTab === "type" && (
                      <div className="template-group-list">
                        {typeGroupKeys.map((type) => (
                          <section key={type} className="template-group-section">
                            <button
                              type="button"
                              className={`template-group-heading template-group-heading-button ${
                                expandedTypeKeys.includes(type) ? "is-expanded" : ""
                              }`}
                              onClick={() => toggleTypeGroup(type)}
                            >
                              <strong>{type}</strong>
                              <span>{groupedByType[type].length}</span>
                              <span className="template-group-chevron" aria-hidden="true">
                                {expandedTypeKeys.includes(type) ? "⌃" : "⌄"}
                              </span>
                            </button>
                            {expandedTypeKeys.includes(type) && (
                              <div className="template-list">
                                {groupedByType[type].map(renderTemplateCard)}
                              </div>
                            )}
                          </section>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {selectedTemplateIds.length > 0 && (
                <div className="add-exercise-sticky-actions">
                  <button
                    className="primary-button add-exercise-sticky-submit"
                    type="button"
                    onClick={() => onAddSelected(selectedTemplateIds)}
                  >
                    {replaceMode
                      ? "Replace with this exercise"
                      : `Add Exercise${selectedTemplateIds.length > 1 ? "s" : ""} (${selectedTemplateIds.length})`}
                  </button>
                </div>
              )}
            </div>

              <button
                className={`icon-button add-exercise-create-fab ${
                  selectedTemplateIds.length > 0 ? "is-raised" : ""
                } ${filterOpen ? "is-hidden" : ""}`}
                type="button"
                aria-label="Create custom exercise"
                title="Create custom exercise"
                onClick={() => openCreateMode(query)}
              >
                +
              </button>
          </>
        ) : (
          <div className="custom-exercise-form">
            {/* ── Step stepper ── */}
            <div className="create-stepper">
              <div className={`create-stepper-step${createStep === 1 ? " is-active" : " is-done"}`}>
                <div className="create-stepper-dot">{createStep > 1 ? "✓" : "1"}</div>
                <span className="create-stepper-label">Basics</span>
              </div>
              <div className={`create-stepper-line${createStep > 1 ? " is-done" : ""}`} />
              <div className={`create-stepper-step${createStep === 2 ? " is-active" : createStep > 2 ? " is-done" : ""}`}>
                <div className="create-stepper-dot">2</div>
                <span className="create-stepper-label">Logging</span>
              </div>
            </div>

            <div className="custom-form-intro">
              <h2 className="custom-form-title">
                {isEditingCustomExercise
                  ? createStep === 1 ? "Edit basics" : "Edit logging"
                  : createStep === 1 ? "Name & muscles" : "How RepIQ logs it"}
              </h2>
              <p className="custom-form-copy">
                {createStep === 1
                  ? "Set the exercise name, target muscles, and an optional photo."
                  : "These choices tell RepIQ how to track and interpret this exercise in the logger."}
              </p>
            </div>

            {createStep === 1 ? (
              <>
                {/* Name + Image card */}
                <div className="create-form-card">
                  <label className="custom-form-field">
                    <span className="custom-form-label">Exercise name</span>
                    <input
                      className="custom-form-input"
                      type="text"
                      value={customName}
                      placeholder="e.g. Machine Chest Press"
                      onChange={(event) => setCustomName(event.target.value)}
                      autoFocus={!isEditingCustomExercise}
                    />
                  </label>

                  <div className="custom-form-field">
                    <div className="custom-form-label-row">
                      <span className="custom-form-label">Photo</span>
                      <span className="custom-form-label-optional">Optional</span>
                    </div>
                    <label htmlFor="custom-exercise-image" className={`custom-image-zone${customImageSrc ? " has-image" : ""}`}>
                      {customImageSrc ? (
                        <img src={customImageSrc} alt="Exercise preview" />
                      ) : (
                        <div className="custom-image-zone-empty">
                          <span className="custom-image-zone-icon" aria-hidden="true">📷</span>
                          <span>Tap to add photo</span>
                        </div>
                      )}
                      <input
                        id="custom-exercise-image"
                        className="custom-image-input"
                        type="file"
                        accept="image/*"
                        onChange={handleCustomImageChange}
                      />
                    </label>
                    {customImageSrc && (
                      <button
                        type="button"
                        className="custom-image-remove-link"
                        onClick={() => setCustomImageSrc("")}
                      >
                        Remove photo
                      </button>
                    )}
                  </div>
                </div>

                {/* Primary muscles card — grouped by region */}
                <div className="create-form-card">
                  <div className="custom-form-label-row">
                    <span className="custom-form-label">Primary muscles</span>
                    {customPrimaryMuscles.length > 0 && (
                      <span className="custom-form-label-count">{customPrimaryMuscles.length} selected</span>
                    )}
                  </div>
                  {primaryMuscleGroups.map((group) => (
                    <div key={group.label} className="muscle-group">
                      <span className="muscle-group-label">{group.label}</span>
                      <div className="custom-option-grid custom-option-grid-muscles">
                        {group.muscles.map((muscle) => (
                          <button
                            key={muscle}
                            type="button"
                            className={`custom-choice-button${customPrimaryMuscles.includes(muscle) ? " is-active" : ""}`}
                            onClick={() => togglePrimaryMuscle(muscle)}
                          >
                            {muscle}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Secondary muscles card */}
                {customPrimaryMuscles.length > 0 && (
                  <div className="create-form-card">
                    <div className="custom-form-label-row">
                      <span className="custom-form-label">Secondary muscles</span>
                      <span className="custom-form-label-optional">
                        {customSecondaryMuscles.length > 0 ? `${customSecondaryMuscles.length} selected` : "Optional"}
                      </span>
                    </div>
                    <p className="custom-form-copy" style={{ marginTop: -4 }}>
                      Muscles meaningfully involved but not the primary focus.
                    </p>
                    {secondaryMuscleGroups.map((group) => {
                      const available = group.muscles.filter((m) => secondaryMuscleOptions.includes(m));
                      if (available.length === 0) return null;
                      return (
                        <div key={group.label} className="muscle-group">
                          <span className="muscle-group-label">{group.label}</span>
                          <div className="custom-option-grid custom-option-grid-muscles">
                            {available.map((muscle) => (
                              <button
                                key={muscle}
                                type="button"
                                className={`custom-choice-button${customSecondaryMuscles.includes(muscle) ? " is-active" : ""}`}
                                onClick={() => toggleSecondaryMuscle(muscle)}
                              >
                                {muscle}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Exercise type card */}
                <div className="create-form-card">
                  <span className="custom-form-label">Equipment / type</span>
                  <div className="custom-option-grid custom-option-grid-described">
                    {customExerciseTypeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`custom-choice-button custom-choice-button-described${customExerciseType === option.value ? " is-active" : ""}`}
                        onClick={() => setCustomExerciseType(option.value)}
                      >
                        <span className="custom-choice-label">{option.label}</span>
                        <span className="custom-choice-desc">{exerciseTypeDescriptions[option.value]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Measurement card — always shown so user can override */}
                <div className="create-form-card">
                  <span className="custom-form-label">What to track per set</span>
                  <div className="custom-option-grid custom-option-grid-described">
                    {customMeasurementOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`custom-choice-button custom-choice-button-described${customMeasurementType === option.value ? " is-active" : ""}`}
                        onClick={() => setCustomMeasurementType(option.value)}
                      >
                        <span className="custom-choice-label">{option.label}</span>
                        <span className="custom-choice-desc">{measurementDescriptions[option.value]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Movement side card */}
                <div className="create-form-card">
                  <span className="custom-form-label">Movement side</span>
                  <div className="custom-option-grid custom-option-grid-described">
                    {customMovementSideOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`custom-choice-button custom-choice-button-described${customMovementSide === option.value ? " is-active" : ""}`}
                        onClick={() => setCustomMovementSide(option.value)}
                      >
                        <span className="custom-choice-label">{option.label}</span>
                        <span className="custom-choice-desc">{movementSideDescriptions[option.value]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Movement pattern card — for Smart Replace intelligence */}
                <div className="create-form-card">
                  <div className="custom-form-label-row">
                    <span className="custom-form-label">Movement pattern</span>
                    <span className="custom-form-label-optional">Optional</span>
                  </div>
                  <p className="custom-form-copy" style={{ marginTop: -4 }}>
                    Helps RepIQ suggest smarter replacements when this exercise is swapped mid-session.
                  </p>
                  <div className="custom-option-grid custom-option-grid-pattern">
                    {(
                      [
                        { value: "horizontal_push", label: "Horizontal Push", desc: "Bench, push-up, chest press" },
                        { value: "vertical_push", label: "Vertical Push", desc: "Overhead press, shoulder press" },
                        { value: "horizontal_pull", label: "Horizontal Pull", desc: "Row, seated row" },
                        { value: "vertical_pull", label: "Vertical Pull", desc: "Lat pulldown, pull-up" },
                        { value: "hip_hinge", label: "Hip Hinge", desc: "Deadlift, RDL, hip thrust" },
                        { value: "squat", label: "Squat", desc: "Back squat, leg press, goblet" },
                        { value: "lunge", label: "Lunge", desc: "Lunge, split squat, step-up" },
                        { value: "isolation_push", label: "Isolation Push", desc: "Fly, lateral raise, triceps" },
                        { value: "isolation_pull", label: "Isolation Pull", desc: "Curl, face pull, rear delt" },
                        { value: "isolation_legs", label: "Isolation Legs", desc: "Leg extension, leg curl, calf" },
                        { value: "core_anterior", label: "Core", desc: "Plank, crunch, leg raise" },
                        { value: "core_rotational", label: "Core Rotation", desc: "Russian twist, woodchop" },
                        { value: "carry", label: "Carry", desc: "Farmer carry, suitcase" },
                        { value: "cardio", label: "Cardio", desc: "Running, cycling, rowing" },
                      ] as Array<{ value: MovementPattern; label: string; desc: string }>
                    ).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`custom-choice-button custom-choice-button-described${customMovementPattern === option.value ? " is-active" : ""}`}
                        onClick={() => setCustomMovementPattern(prev => prev === option.value ? null : option.value)}
                      >
                        <span className="custom-choice-label">{option.label}</span>
                        <span className="custom-choice-desc">{option.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="sheet-actions custom-form-actions">
              {!canContinueToStepTwo && createStep === 1 && (
                <p className="custom-form-continue-hint">
                  {customName.trim().length <= 1
                    ? "Add a name to continue"
                    : "Select at least one primary muscle"}
                </p>
              )}
              {createStep === 1 ? (
                <>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      if (isEditingCustomExercise) {
                        onBack();
                        return;
                      }
                      setMode("browse");
                    }}
                  >
                    {isEditingCustomExercise ? "Cancel" : "Back to Library"}
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={!canContinueToStepTwo}
                    onClick={continueToCreateStepTwo}
                  >
                    Continue
                  </button>
                </>
              ) : (
                <>
                  <button className="secondary-button" type="button" onClick={() => setCreateStep(1)}>
                    Back
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={!canCreateCustom}
                    onClick={handleCreateCustomSubmit}
                  >
                    {isEditingCustomExercise ? "Save Changes" : "Save Exercise"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {duplicateNamePrompt && (
        <section
          className="sheet-overlay leave-center-overlay"
          onClick={() => setDuplicateNamePrompt(null)}
        >
          <div className="leave-center-card" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-head">
              <div>
                <p className="label">Exercise Name Exists</p>
                <h3>{duplicateNamePrompt.requestedName} is already in the library</h3>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setDuplicateNamePrompt(null)}
              >
                ×
              </button>
            </div>
            <p className="settings-note">
              You can rename it yourself, or save it as{" "}
              <strong>{duplicateNamePrompt.suggestedName}</strong>.
            </p>
            <div className="finish-confirm-actions">
              <div className="finish-confirm-actions-row">
                <button
                  className="logger-action-button"
                  type="button"
                  onClick={() => setDuplicateNamePrompt(null)}
                >
                  Rename It
                </button>
              </div>
              <button
                className="primary-button logger-finish-button"
                type="button"
                onClick={() => submitCustomExercise(duplicateNamePrompt.suggestedName)}
              >
                Save As {duplicateNamePrompt.suggestedName}
              </button>
            </div>
          </div>
        </section>
      )}

      {filterOpen && (
        <section className="sheet-overlay bottom-sheet-overlay" onClick={() => setFilterOpen(false)}>
          <div className="sheet-card action-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-head">
              <div>
                <p className="label">Sort Exercises</p>
                <h3>Choose order</h3>
              </div>
              <button className="icon-button" type="button" onClick={() => setFilterOpen(false)}>
                ×
              </button>
            </div>

            <div className="action-sheet-list">
              <button
                type="button"
                onClick={() => selectSortMode("library")}
              >
                Library order {sortMode === "library" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
              </button>
              <button
                type="button"
                onClick={() => selectSortMode("alphabetical")}
              >
                Alphabetical {sortMode === "alphabetical" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
              </button>
              <button
                type="button"
                onClick={() => selectSortMode("frequency")}
              >
                Most Logged {sortMode === "frequency" ? (sortDirection === "desc" ? "↓" : "↑") : ""}
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function MusclesWorkedPage({
  exercises,
  selectedExercise,
  initialMode,
  onOpenDetails,
  onBack
}: {
  exercises: ExerciseDraft[];
  selectedExercise: ExerciseDraft;
  initialMode: "overall" | "exercise";
  onOpenDetails: (exerciseId: string) => void;
  onBack: () => void;
}) {
  const [focusedExerciseId, setFocusedExerciseId] = useState(selectedExercise.id);
  const [viewMode, setViewMode] = useState<"overall" | "exercise">(initialMode);
  const focusCardRef = useRef<HTMLDivElement | null>(null);
  const muscleSpread = buildMuscleSpread(exercises);
  const maxScore = muscleSpread[0]?.score ?? 1;
  const focusedExercise =
    exercises.find((exercise) => exercise.id === focusedExerciseId) ?? selectedExercise;
  const overallBodyMapScores = useMemo(() => buildMuscleRegionScores(exercises), [exercises]);
  const focusedBodyMapScores = useMemo(
    () => buildMuscleRegionScores([focusedExercise]),
    [focusedExercise]
  );

  useEffect(() => {
    setFocusedExerciseId(selectedExercise.id);
  }, [selectedExercise.id]);

  useEffect(() => {
    setViewMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (viewMode !== "exercise") {
      return;
    }

    if (!focusCardRef.current) {
      return;
    }

    window.requestAnimationFrame(() => {
      focusCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }, [focusedExerciseId]);

  return (
    <main className="detail-page muscles-page">
      <header className="detail-topbar">
        <button className="back-nav-button detail-back-button" type="button" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div className="detail-topbar-copy">
          <p className="label">Muscles Worked</p>
          <h1>{viewMode === "overall" ? "Overall Workout" : focusedExercise.name}</h1>
        </div>
        <span className="detail-topbar-spacer" aria-hidden="true" />
      </header>

      <section className="detail-section">
        <div className="chart-card">
          <div className="chart-copy">
            <h3>Visual Muscle Map</h3>
            <span>Intensity is based on workout contribution points</span>
          </div>

          <div className="body-map-grid">
            <BodyMapPair
              title="Overall Workout"
              subtitle="Primary muscles score higher than secondary support muscles"
              scores={overallBodyMapScores}
            />
            {viewMode === "exercise" && (
              <BodyMapPair
                title={focusedExercise.name}
                subtitle="Current selected exercise focus"
                scores={focusedBodyMapScores}
              />
            )}
          </div>
        </div>

        <details className="muscle-spread-details">
          <summary>
            <span>Overall Workout Spread</span>
            <span className="muscle-spread-summary-copy">Point-based breakdown</span>
          </summary>

          <div className="chart-card muscle-spread-card">
            <div className="chart-copy">
              <h3>Overall Workout Spread</h3>
              <span>Based on all exercises in the current workout</span>
            </div>

            <div className="muscle-spread-list">
              {muscleSpread.map((entry) => (
                <div key={entry.muscle} className="muscle-spread-row">
                  <div className="muscle-spread-copy">
                    <strong>{entry.muscle}</strong>
                    <span>{entry.score} points</span>
                  </div>
                  <div className="muscle-spread-track">
                    <span
                      className="muscle-spread-fill"
                      style={{ width: `${(entry.score / maxScore) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </details>

        {viewMode === "exercise" && (
          <div ref={focusCardRef} className="detail-hero muscles-focus-card">
            <img
              src={focusedExercise.imageSrc}
              alt={focusedExercise.name}
              className="detail-image"
            />
            <div className="detail-copy">
              <p className="label">Selected Exercise</p>
              <h2>{focusedExercise.name}</h2>
              <div className="muscle-chip-row">
                <span className="muscle-chip muscle-chip-primary">
                  Primary: {focusedExercise.primaryMuscle}
                </span>
                {focusedExercise.secondaryMuscles.map((muscle) => (
                  <span key={muscle} className="muscle-chip">
                    {muscle}
                  </span>
                ))}
              </div>
              <div className="muscles-focus-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => onOpenDetails(focusedExercise.id)}
                >
                  View Exercise Details
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="chart-card">
          <div className="chart-copy">
            <h3>Exercise To Muscle Map</h3>
            <span>
              {viewMode === "overall"
                ? "Choose an exercise to inspect its specific muscle focus"
                : "See how this movement fits the full workout"}
            </span>
          </div>

          <div className="exercise-muscle-map">
            {exercises.map((exercise) => (
              <button
                key={exercise.id}
                type="button"
                className={`exercise-muscle-card ${
                  viewMode === "exercise" && exercise.id === focusedExercise.id ? "is-selected" : ""
                }`}
                onClick={() => {
                  setFocusedExerciseId(exercise.id);
                  setViewMode("exercise");
                }}
              >
                <div className="exercise-muscle-top">
                  <strong>{exercise.name}</strong>
                  {viewMode === "exercise" && exercise.id === focusedExercise.id && (
                    <span className="session-status-pill">Selected</span>
                  )}
                </div>
                <p className="exercise-muscle-line">Primary: {exercise.primaryMuscle}</p>
                <p className="exercise-muscle-line">
                  Secondary: {exercise.secondaryMuscles.join(", ")}
                </p>
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

// ── Info Icon ─────────────────────────────────────────────────────────────────
function InfoIcon({ onClick }: { onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button
      type="button"
      className="info-icon"
      onClick={onClick}
      aria-label="What does this mean?"
    >
      <em>i</em>
    </button>
  );
}

// ── Bottom Navigation Bar ─────────────────────────────────────────────────────
function BottomNav({ activeView, onNavigate, onMore }: { activeView: AppView; onNavigate: (view: "home" | "planner" | "insights" | "community") => void; onMore?: () => void }) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <button className={`bottom-nav-tab${activeView === "home" ? " is-active" : ""}`} type="button" onClick={() => onNavigate("home")} aria-label="Home">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span>Home</span>
      </button>
      <button className={`bottom-nav-tab${activeView === "planner" ? " is-active" : ""}`} type="button" onClick={() => onNavigate("planner")} aria-label="Planner">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
        </svg>
        <span>Planner</span>
      </button>
      <button className={`bottom-nav-tab${activeView === "insights" ? " is-active" : ""}`} type="button" onClick={() => onNavigate("insights")} aria-label="Insights">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
        <span>Insights</span>
      </button>
      <button className={`bottom-nav-tab${activeView === "community" ? " is-active" : ""}`} type="button" onClick={() => onNavigate("community")} aria-label="Community">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <span>Community</span>
      </button>
      <button className={`bottom-nav-tab${activeView === "more" ? " is-active" : ""}`} type="button" onClick={onMore} aria-label="More">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
        <span>More</span>
      </button>
    </nav>
  );
}

// ── Muscle Heatmap ────────────────────────────────────────────────────────────

type MuscleStatus = "fresh" | "fading" | "due" | "none";

const HEATMAP_MUSCLES = [
  "Chest", "Back", "Shoulders", "Core",
  "Biceps", "Triceps", "Quads", "Hamstrings", "Glutes", "Calves",
] as const;

function computeMuscleCoverage(workouts: SavedWorkoutData[], cycleDays: number = 7): Record<string, MuscleStatus> {
  const today = new Date();
  const todayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const lastTrained: Record<string, number> = {};
  for (const workout of workouts) {
    const ds = (workout.date ?? workout.savedAt).slice(0, 10);
    const [y, mo, d] = ds.split("-").map(Number);
    const wMs = Date.UTC(y, mo - 1, d);
    for (const ex of workout.exercises) {
      const canonical = getCanonicalMuscle(ex.primaryMuscle);
      if (canonical && canonical !== "Other" && (!lastTrained[canonical] || wMs > lastTrained[canonical])) {
        lastTrained[canonical] = wMs;
      }
    }
  }
  const result: Record<string, MuscleStatus> = {};
  for (const muscle of HEATMAP_MUSCLES) {
    const last = lastTrained[muscle];
    if (!last) { result[muscle] = "none"; continue; }
    const days = Math.round((todayMs - last) / 86400000);
    const freshDays = Math.max(2, Math.round(cycleDays * 0.3));
    const fadingDays = Math.max(freshDays + 1, Math.round(cycleDays * 0.75));
    result[muscle] = days <= freshDays ? "fresh" : days <= fadingDays ? "fading" : "due";
  }
  return result;
}

function sessionToMuscleCoverage(exercises: FinishedExerciseSummary[]): Record<string, MuscleStatus> {
  const trained = new Set(
    exercises.map((ex) => getCanonicalMuscle(ex.primaryMuscle)).filter((m) => m !== "Other")
  );
  const result: Record<string, MuscleStatus> = {};
  for (const m of HEATMAP_MUSCLES) result[m] = trained.has(m) ? "fresh" : "none";
  return result;
}

// Compact home-screen muscle nudge — only renders when ≥1 muscle is "due" (5+ days)
function HomeMuscleNudge({
  coverage,
  onTap,
}: {
  coverage: Record<string, MuscleStatus>;
  onTap: () => void;
}) {
  const hasHistory = HEATMAP_MUSCLES.some((m) => coverage[m] !== "none");
  const due = HEATMAP_MUSCLES.filter((m) => coverage[m] === "due");
  if (!hasHistory || due.length === 0) return null;

  const display =
    due.length <= 3
      ? due.join(" · ")
      : `${due.slice(0, 2).join(", ")} +${due.length - 2} more`;

  return (
    <button
      type="button"
      className="home-muscle-nudge home-card-tappable"
      onClick={onTap}
      aria-label="View muscle coverage in Analyzer"
    >
      <div className="home-muscle-nudge-left">
        <p className="home-goal-label">Muscle Coverage</p>
        <p className="home-muscle-nudge-muscles">{display}</p>
        <p className="home-muscle-nudge-sub">{due.length === 1 ? "hasn't been trained recently" : "haven't been trained recently"}</p>
      </div>
      <span className="home-muscle-nudge-cta">Analyze →</span>
    </button>
  );
}

// Muscle overlay paths in a 100×140 coordinate space aligned to the anatomy PNG.
// Each path is drawn to roughly match the muscle group's anatomical position.
// The paths are rendered with mix-blend-mode:multiply over a greyscale PNG base,
// so the anatomical detail shows through the color tint.

const FRONT_MUSCLE_PATHS: Record<string, string> = {
  // Pectoralis major — two fan-shaped pecs in upper-mid chest
  Chest: "M 50,30 C 43,30 34,36 31,44 C 29,51 32,60 39,64 C 44,67 50,65 50,65 C 50,65 56,67 61,64 C 68,60 71,51 69,44 C 66,36 57,30 50,30 Z",
  // Anterior deltoid caps — shoulder balls
  Shoulders: "M 29,27 C 23,29 19,36 20,44 C 21,50 27,53 33,50 C 37,47 38,39 35,31 Z M 71,27 C 77,29 81,36 80,44 C 79,50 73,53 67,50 C 63,47 62,39 65,31 Z",
  // Biceps brachii — front of upper arm
  Biceps: "M 18,44 C 14,51 13,63 17,71 C 20,75 26,75 28,71 C 30,65 29,51 25,45 Z M 82,44 C 86,51 87,63 83,71 C 80,75 74,75 72,71 C 70,65 71,51 75,45 Z",
  // Rectus abdominis — segmented abs
  Core: "M 44,66 C 41,74 40,87 43,97 C 46,101 54,101 57,97 C 60,87 59,74 56,66 C 53,63 47,63 44,66 Z",
  // Quadriceps — front of thighs
  Quads: "M 37,101 C 33,112 32,132 36,145 C 39,151 47,152 51,147 C 54,135 52,111 48,101 Z M 63,101 C 67,112 68,132 64,145 C 61,151 53,152 49,147 C 46,135 48,111 52,101 Z",
  // Tibialis anterior / gastrocnemius front
  Calves: "M 34,146 C 31,157 31,172 35,180 C 38,184 45,184 48,180 C 50,171 48,155 44,146 Z M 66,146 C 69,157 69,172 65,180 C 62,184 55,184 52,180 C 50,171 52,155 56,146 Z",
};

const BACK_MUSCLE_PATHS: Record<string, string> = {
  // Trapezius — upper back diamond + posterior deltoid area
  Back: "M 50,28 C 42,31 32,38 30,48 C 28,56 33,64 42,68 C 47,70 53,70 58,68 C 67,64 72,56 70,48 C 68,38 58,31 50,28 Z M 30,55 C 24,64 22,80 26,93 C 30,98 40,98 44,91 C 46,80 44,63 38,54 Z M 70,55 C 76,64 78,80 74,93 C 70,98 60,98 56,91 C 54,80 56,63 62,54 Z",
  // Posterior deltoid
  Shoulders: "M 29,27 C 23,29 19,37 21,45 C 22,51 28,53 34,50 C 38,47 39,38 36,31 Z M 71,27 C 77,29 81,37 79,45 C 78,51 72,53 66,50 C 62,47 61,38 64,31 Z",
  // Triceps — back of upper arm
  Triceps: "M 18,44 C 14,52 14,65 18,72 C 21,76 27,75 29,70 C 31,63 30,50 26,45 Z M 82,44 C 86,52 86,65 82,72 C 79,76 73,75 71,70 C 69,63 70,50 74,45 Z",
  // Gluteus maximus
  Glutes: "M 33,94 C 28,101 27,115 31,123 C 35,128 44,129 50,125 C 56,129 65,128 69,123 C 73,115 72,101 67,94 C 62,89 38,89 33,94 Z",
  // Biceps femoris / hamstrings
  Hamstrings: "M 36,102 C 32,113 31,133 35,146 C 38,152 46,153 50,148 C 53,136 51,111 47,102 Z M 64,102 C 68,113 69,133 65,146 C 62,152 54,153 50,148 C 47,136 49,111 53,102 Z",
  // Gastrocnemius — two heads from back
  Calves: "M 34,148 C 31,159 30,174 34,182 C 37,186 45,186 48,182 C 50,173 48,157 44,148 Z M 66,148 C 69,159 70,174 66,182 C 63,186 55,186 52,182 C 50,173 52,157 56,148 Z",
};

function AnatomyView({
  img, paths, coverage, mode,
}: {
  img: string;
  paths: Record<string, string>;
  coverage: Record<string, MuscleStatus>;
  mode: "history" | "session";
}) {
  function col(muscle: string): string {
    const s = coverage[muscle] ?? "none";
    if (mode === "session") return s === "fresh" ? "#3b82f6" : "transparent";
    if (s === "fresh") return "#3b82f6";
    if (s === "fading") return "#60a5fa";
    return "transparent";
  }
  function op(muscle: string): number {
    const s = coverage[muscle] ?? "none";
    if (mode === "session") return s === "fresh" ? 0.72 : 0;
    if (s === "fresh") return 0.72;
    if (s === "fading") return 0.55;
    return 0;
  }

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {/* Greyscale anatomical base */}
      <img
        src={img}
        alt=""
        aria-hidden="true"
        style={{
          width: "100%",
          display: "block",
          filter: "grayscale(1) brightness(1.15) contrast(0.9)",
        }}
      />
      {/* SVG overlay — same coordinate space as the PNG (100×140 viewBox) */}
      <svg
        viewBox="0 0 100 200"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          mixBlendMode: "multiply",
        }}
        aria-hidden="true"
      >
        {Object.entries(paths).map(([muscle, d]) => (
          op(muscle) > 0 ? (
            <path
              key={muscle}
              d={d}
              fill={col(muscle)}
              fillOpacity={op(muscle)}
              stroke={col(muscle)}
              strokeOpacity={Math.min(op(muscle) + 0.08, 1)}
              strokeWidth="0.5"
              strokeLinejoin="round"
            />
          ) : null
        ))}
      </svg>
    </div>
  );
}

// ── Next Session Card (Home primary CTA) ─────────────────────────────────────
function NextSessionCard({
  repiqPlan,
  savedWorkoutsCount,
  hasActiveWorkout,
  nextSession,
  onStartRepIQ,
  onOpenQuick,
  onGoToRepIQPlan,
  onGoToGenerate,
  onGoToCustom,
  onGoToBrowse,
  onReviewPlan,
}: {
  repiqPlan: RepIQPlan | null;
  savedWorkoutsCount: number;
  hasActiveWorkout: boolean;
  nextSession: { weekIdx: number; dayIdx: number } | null;
  onStartRepIQ: (weekIdx: number, dayIdx: number) => void;
  onOpenQuick: () => void;
  onGoToRepIQPlan: () => void;
  onGoToGenerate: () => void;
  onGoToCustom: () => void;
  onGoToBrowse: () => void;
  onReviewPlan: () => void;
}) {
  // ── State 1: active plan with a next session ──
  if (repiqPlan && nextSession) {
    const nextDay = repiqPlan.weeks[nextSession.weekIdx]?.days[nextSession.dayIdx];
    const exCount = nextDay?.exercises.length ?? 0;
    const approxMin = Math.round((exCount * 3 * 2.5) / 5) * 5; // rough: sets × rest+set time
    return (
      <div className="nsc-card">
        <div className="nsc-eyebrow-row">
          <span className="nsc-eyebrow">NEXT UP</span>
          <span className="nsc-eyebrow nsc-eyebrow-dim">Week {nextSession.weekIdx + 1}</span>
        </div>
        <h2 className="nsc-title">{nextDay?.sessionLabel ?? "Next Session"}</h2>
        {nextDay?.focus && <p className="nsc-focus">{nextDay.focus}</p>}
        <p className="nsc-meta">{exCount} exercise{exCount !== 1 ? "s" : ""}{approxMin > 0 ? ` · ~${approxMin} min` : ""}</p>
        {repiqPlan.needsReview && (
          <div className="nsc-review-notice">
            <span className="nsc-review-text">
              {repiqPlan.extraVolumeCount ?? 1} extra session{(repiqPlan.extraVolumeCount ?? 1) !== 1 ? "s" : ""} logged outside your plan — sessions may need a refresh.
            </span>
            <button type="button" className="nsc-review-btn" onClick={onReviewPlan}>Review →</button>
          </div>
        )}
        <div className="nsc-actions">
          <button
            type="button"
            className="primary-button nsc-start-btn"
            disabled={hasActiveWorkout}
            onClick={() => onStartRepIQ(nextSession.weekIdx, nextSession.dayIdx)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" style={{ marginRight: 6, flexShrink: 0 }}>
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Start Session
          </button>
          <button
            type="button"
            className="secondary-button nsc-quick-btn"
            disabled={hasActiveWorkout}
            onClick={onOpenQuick}
          >
            Quick Workout
          </button>
        </div>
        <button type="button" className="nsc-plan-link" onClick={onGoToRepIQPlan}>
          View full plan →
        </button>
      </div>
    );
  }

  // ── State 2: active plan, all sessions complete ──
  if (repiqPlan && !nextSession) {
    return (
      <div className="nsc-card nsc-card-complete">
        <div className="nsc-complete-icon">✅</div>
        <h2 className="nsc-title">Plan Complete!</h2>
        <p className="nsc-focus">All sessions done — great work this cycle.</p>
        <div className="nsc-actions">
          <button type="button" className="primary-button nsc-start-btn" onClick={onGoToRepIQPlan}>
            Start New Cycle
          </button>
          <button type="button" className="secondary-button nsc-quick-btn" disabled={hasActiveWorkout} onClick={onOpenQuick}>
            Quick Workout
          </button>
        </div>
      </div>
    );
  }

  // ── State 3: no plan, has some history ──
  if (!repiqPlan && savedWorkoutsCount > 0) {
    return (
      <div className="nsc-card">
        <span className="nsc-eyebrow">READY TO TRAIN?</span>
        <p className="nsc-focus" style={{ marginTop: 4, marginBottom: 14 }}>Pick up where you left off or let RepIQ plan your next session.</p>
        <div className="nsc-actions">
          <button
            type="button"
            className="primary-button nsc-start-btn"
            disabled={hasActiveWorkout}
            onClick={onOpenQuick}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 6, flexShrink: 0 }}>
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            Quick Workout
          </button>
          <button
            type="button"
            className="secondary-button nsc-quick-btn"
            onClick={onGoToGenerate}
          >
            Generate Session
          </button>
        </div>
        <button type="button" className="nsc-plan-link" onClick={onGoToBrowse}>
          Browse plans →
        </button>
      </div>
    );
  }

  // ── State 4: brand new user, no history, no plan ──
  return (
    <div className="nsc-card">
      <span className="nsc-eyebrow">LET'S GET STARTED</span>
      <p className="nsc-focus" style={{ marginTop: 4, marginBottom: 14 }}>Log your first workout or generate a session plan.</p>
      <div className="nsc-actions">
        <button
          type="button"
          className="primary-button nsc-start-btn"
          disabled={hasActiveWorkout}
          onClick={onOpenQuick}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 6, flexShrink: 0 }}>
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          Start First Workout
        </button>
        <button
          type="button"
          className="secondary-button nsc-quick-btn"
          onClick={onGoToGenerate}
        >
          Generate Session
        </button>
      </div>
      <button type="button" className="nsc-plan-link" onClick={onGoToBrowse}>
        Build a plan →
      </button>
    </div>
  );
}

function MuscleCoverageCard({
  coverage,
  mode,
  tapHint,
}: {
  coverage: Record<string, MuscleStatus>;
  mode: "history" | "session";
  tapHint?: string;
}) {
  const trainNext = HEATMAP_MUSCLES.filter((m) =>
    coverage[m] === "due" || coverage[m] === "none"
  );

  return (
    <div className="muscle-coverage-card">
      <div className="muscle-coverage-header">
        <p className="muscle-coverage-title">
          {mode === "session" ? "Muscles Trained" : "Muscle Coverage"}
        </p>
        {mode === "history" && (
          <div className="muscle-coverage-legend">
            <span className="muscle-legend-dot" style={{ background: "#3b82f6" }} />
            <span className="muscle-legend-label">Recent</span>
            <span className="muscle-legend-dot" style={{ background: "#93c5fd" }} />
            <span className="muscle-legend-label">Fading</span>
            <span className="muscle-legend-dot" style={{ background: "var(--line)", opacity: 0.5 }} />
            <span className="muscle-legend-label">Rest</span>
          </div>
        )}
      </div>
      <div className="muscle-anatomy-figures">
        <div className="muscle-anatomy-figure">
          <p className="muscle-anatomy-label">FRONT</p>
          <AnatomyView img={anatomyFrontImg} paths={FRONT_MUSCLE_PATHS} coverage={coverage} mode={mode} />
        </div>
        <div className="muscle-anatomy-figure">
          <p className="muscle-anatomy-label">BACK</p>
          <AnatomyView img={anatomyBackImg} paths={BACK_MUSCLE_PATHS} coverage={coverage} mode={mode} />
        </div>
      </div>
      {/* Chip rows removed — map communicates visually */}
      {tapHint && <p className="home-card-tap-hint">{tapHint}</p>}
    </div>
  );
}

// ── Pre-Workout Readiness Check Sheet ────────────────────────────────────────
const READINESS_CHIPS: { value: MoodRating; emoji: string; label: string }[] = [
  { value: 1, emoji: "😫", label: "Rough" },
  { value: 2, emoji: "😕", label: "Low" },
  { value: 3, emoji: "😐", label: "OK" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "💪", label: "Great" },
];

const MOOD_MESSAGES: Record<MoodRating, string[]> = {
  1: [
    "Showing up on a rough day? That's real discipline.",
    "The fact you're here says everything.",
    "Hard days build the strongest habits.",
    "You don't have to crush it today — just move.",
    "Some days the win is simply walking through the door.",
    "Every rep today counts double. It takes more grit.",
    "Low energy days still build the machine.",
    "Even a short session beats skipping entirely.",
    "Your future self will thank you for being here.",
    "Champions train when it's hard too.",
  ],
  2: [
    "A low-energy session is still a session.",
    "Momentum is built on days exactly like this.",
    "You might surprise yourself once you warm up.",
    "Start slow — the body often catches up.",
    "Consistency on tough days compounds fast.",
    "Half effort beats zero effort every single time.",
    "Not every session has to be your best one.",
    "Progress doesn't wait for perfect conditions.",
    "Showing up low is still showing up.",
    "The warm-up will shift things. Trust the process.",
  ],
  3: [
    "Steady days are where gains quietly stack.",
    "Not every session needs to be epic.",
    "Consistent and present — that's the formula.",
    "Average sessions over time create exceptional results.",
    "You're here. You're ready enough.",
    "Keep the rhythm. That's the whole game.",
    "The body doesn't need fire every day — just fuel.",
    "Solid effort leads to solid results.",
    "Middle-of-the-road today, progress tomorrow.",
    "OK is a perfectly solid place to build from.",
  ],
  4: [
    "Good energy — let's put it to work.",
    "You've got what you need today.",
    "Feeling good is a signal. Use it.",
    "Strong foundation — now go build on it.",
    "This is your window. Make it count.",
    "Good days like this are why you stay consistent.",
    "Body's ready. Mind's ready. Let's go.",
    "Great sessions start exactly like this.",
    "You're dialled in — stay in it.",
    "This is the zone. Protect it.",
  ],
  5: [
    "You're in the zone. Own every rep.",
    "Days like this don't come every week — maximise it.",
    "Prime condition. Make every set count.",
    "This is your best self showing up.",
    "Full tank. No excuses. Just results.",
    "Channel this energy into something you'll remember.",
    "Whatever you planned today — go beyond it.",
    "This is why you put in the work on hard days.",
    "Feel this. Remember this. Chase this.",
    "Elite sessions start with exactly this mindset.",
  ],
};

function pickMoodMessage(rating: MoodRating): string {
  const pool = MOOD_MESSAGES[rating];
  return pool[Math.floor(Math.random() * pool.length)];
}

function ReadinessCheckSheet({
  onSelect,
  onSkip,
  onDontAskAgain,
}: {
  onSelect: (rating: MoodRating) => void;
  onSkip: () => void;
  onDontAskAgain: () => void;
}) {
  return (
    <div className="readiness-overlay" onClick={onSkip}>
      <div className="readiness-sheet" onClick={(e) => e.stopPropagation()}>
        <p className="readiness-q">How's your energy?</p>
        <p className="readiness-hint">Sleep, food, mood combined — how charged are you?</p>
        <div className="readiness-chips">
          {READINESS_CHIPS.map((c) => (
            <button key={c.value} className="readiness-chip" onClick={() => onSelect(c.value)}>
              <span className="readiness-emoji">{c.emoji}</span>
              <span className="readiness-label">{c.label}</span>
            </button>
          ))}
        </div>
        <button className="readiness-skip" onClick={onSkip}>Skip for now</button>
        <button className="readiness-dont-ask" onClick={onDontAskAgain}>Don't ask again</button>
      </div>
    </div>
  );
}

// ── Post-Workout Psych Capture Card ──────────────────────────────────────────
function PsychCaptureCard({
  sessionId,
  profile,
  onSave,
}: {
  sessionId: string;
  profile: UserPsychProfile;
  onSave: (entry: PostWorkoutPsych) => void;
}) {
  const showMood   = profile.capturePostWorkoutMood   !== false;
  const showEnergy = profile.capturePostWorkoutEnergy !== false;
  const showRPE    = profile.captureSessionRPE        !== false;

  // Check if already captured for this session
  const [saved, setSaved] = useState<boolean>(() => {
    try {
      const entries = getStoredPostWorkoutPsych();
      return entries.some((e) => e.sessionId === sessionId);
    } catch { return false; }
  });
  const [mood,   setMood]   = useState<MoodRating | null>(null);
  const [energy, setEnergy] = useState<EnergyRating | null>(null);
  const [rpe,    setRpe]    = useState<RPERating | null>(null);

  if (!showMood && !showEnergy && !showRPE) return null;

  const MOOD_OPTIONS: { value: MoodRating; emoji: string; label: string }[] = [
    { value: 1, emoji: "😫", label: "Rough" },
    { value: 2, emoji: "😕", label: "Low"   },
    { value: 3, emoji: "😐", label: "OK"    },
    { value: 4, emoji: "🙂", label: "Good"  },
    { value: 5, emoji: "😄", label: "Great" },
  ];
  const ENERGY_OPTIONS: { value: EnergyRating; emoji: string; label: string }[] = [
    { value: 1, emoji: "🪫", label: "Empty" },
    { value: 2, emoji: "😴", label: "Low"   },
    { value: 3, emoji: "⚡", label: "OK"    },
    { value: 4, emoji: "🔥", label: "High"  },
    { value: 5, emoji: "💪", label: "Max"   },
  ];
  const RPE_VALUES: RPERating[] = [1,2,3,4,5,6,7,8,9,10];

  if (saved) {
    return (
      <section className="finish-workout-card psych-capture-saved-card">
        <span className="psych-capture-saved-icon">✓</span>
        <span className="psych-capture-saved-text">Feeling logged</span>
      </section>
    );
  }

  return (
    <section className="finish-workout-card psych-capture-card">
      <p className="label" style={{ marginBottom: 14 }}>How did it feel?</p>

      {showMood && (
        <div className="psych-capture-row">
          <p className="psych-capture-row-label">Mood after</p>
          <div className="psych-chip-row">
            {MOOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`psych-chip${mood === opt.value ? " is-selected" : ""}`}
                onClick={() => setMood(mood === opt.value ? null : opt.value)}
              >
                <span className="psych-chip-emoji">{opt.emoji}</span>
                <span className="psych-chip-label">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showEnergy && (
        <div className="psych-capture-row">
          <p className="psych-capture-row-label">Energy left</p>
          <div className="psych-chip-row">
            {ENERGY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`psych-chip${energy === opt.value ? " is-selected" : ""}`}
                onClick={() => setEnergy(energy === opt.value ? null : opt.value)}
              >
                <span className="psych-chip-emoji">{opt.emoji}</span>
                <span className="psych-chip-label">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showRPE && (
        <div className="psych-capture-row">
          <p className="psych-capture-row-label">Session effort (RPE)</p>
          <div className="psych-rpe-row">
            {RPE_VALUES.map((v) => (
              <button
                key={v}
                type="button"
                className={`psych-rpe-chip${rpe === v ? " is-selected" : ""}`}
                onClick={() => setRpe(rpe === v ? null : v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        className="psych-save-btn"
        onClick={() => {
          const entry: PostWorkoutPsych = {
            schemaVersion: 1,
            sessionId,
            capturedAt: new Date().toISOString(),
            postMood:    mood,
            postEnergy:  energy,
            sessionRPE:  rpe,
            psychNote:   null,
          };
          onSave(entry);
          setSaved(true);
        }}
      >
        Save
      </button>
    </section>
  );
}

// ── Workout Report Page ───────────────────────────────────────────────────────
function WorkoutReportPage({
  data,
  onBack,
  resolvedTheme,
  onToggleTheme,
  psychCapture,
}: {
  data: SavedWorkoutData;
  onBack: () => void;
  resolvedTheme?: string;
  onToggleTheme?: () => void;
  psychCapture?: {
    profile: UserPsychProfile;
    onSave: (entry: PostWorkoutPsych) => void;
  };
}) {
  const rewardLevelIcon: Record<LoggerReward["level"], string> = { session: "🏆", exercise: "⭐", set: "✓" };

  return (
    <main className="detail-page finish-workout-page" data-theme={resolvedTheme}>
      <div className="finish-hero">
        <div className="finish-hero-topbar">
          <button className="finish-hero-back" type="button" onClick={onBack} aria-label="Back">←</button>
          <div style={{ flex: 1, textAlign: "center" }}>
            <p className="finish-hero-eyebrow label" style={{ color: "rgba(255,255,255,0.7)", margin: 0 }}>Workout Report</p>
          </div>
          {resolvedTheme && onToggleTheme ? (
            <button type="button" className="theme-toggle-btn theme-toggle-btn--ghost" onClick={onToggleTheme} aria-label="Toggle theme">
              {resolvedTheme === "dark"
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
            </button>
          ) : <span style={{ width: 38 }} />}
        </div>
        <h1 className="finish-hero-title">{data.sessionName}</h1>
        <p className="finish-hero-date">{new Date(data.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</p>
        <div className="finish-hero-stats">
          <div className="finish-hero-stat"><span className="finish-hero-stat-label">Duration</span><strong className="finish-hero-stat-value">{data.duration}</strong></div>
          <div className="finish-hero-stat"><span className="finish-hero-stat-label">Sets</span><strong className="finish-hero-stat-value">{data.totalSets}</strong></div>
          <div className="finish-hero-stat"><span className="finish-hero-stat-label">Exercises</span><strong className="finish-hero-stat-value">{data.exerciseCount}</strong></div>
          {data.totalVolume > 0 && <div className="finish-hero-stat"><span className="finish-hero-stat-label">Volume</span><strong className="finish-hero-stat-value">{data.totalVolume.toFixed(0)} kg</strong></div>}
        </div>
      </div>

      <div className="finish-workout-body">
        {/* Share cards — directly visible, no extra button needed */}
        <ShareCardsStrip draft={data} />

        <MuscleCoverageCard coverage={sessionToMuscleCoverage(data.exercises)} mode="session" />

        {data.rewards.length > 0 && (
          <section className="finish-workout-card">
            <p className="label" style={{ marginBottom: 8 }}>Rewards</p>
            <div className="reward-sheet-summary finish-workout-reward-summary">
              {data.rewardSummary.session > 0 && <span className="reward-summary-chip reward-summary-chip-session">{rewardLevelIcon.session} {data.rewardSummary.session}</span>}
              {data.rewardSummary.exercise > 0 && <span className="reward-summary-chip reward-summary-chip-exercise">{rewardLevelIcon.exercise} {data.rewardSummary.exercise}</span>}
              {data.rewardSummary.set > 0 && <span className="reward-summary-chip reward-summary-chip-set">{rewardLevelIcon.set} {data.rewardSummary.set}</span>}
            </div>
            <div className="reward-sheet-list finish-workout-reward-list" style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 10, marginTop: 8 }}>
              {data.rewards.map((r) => (
                <article key={r.id} className="reward-sheet-item">
                  <div className={`reward-sheet-icon reward-sheet-icon-${r.level}`}>{rewardLevelIcon[r.level]}</div>
                  <div><strong>{r.shortLabel}</strong><p>{r.detail}</p></div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="finish-workout-card">
          <p className="label" style={{ marginBottom: 8 }}>Exercises</p>
          {data.exercises.map((ex) => (
            <div key={ex.id} className="finish-exercise-row">
              <span className="finish-exercise-name">{ex.name}</span>
              <span className={`finish-exercise-sets${ex.loggedSets === 0 ? " is-unlogged" : ""}`}>
                {ex.loggedSets === 0 ? "not logged" : `${ex.loggedSets} sets`}
              </span>
            </div>
          ))}
        </section>

        {data.note && (
          <section className="finish-workout-card">
            <p className="label" style={{ marginBottom: 6 }}>Note</p>
            <p className="settings-note" style={{ margin: 0 }}>{data.note}</p>
          </section>
        )}

        {/* ── Psych capture — How did it feel? ── */}
        {psychCapture && (
          <PsychCaptureCard
            sessionId={data.savedAt}
            profile={psychCapture.profile}
            onSave={psychCapture.onSave}
          />
        )}
      </div>
    </main>
  );
}

// ── Workout History Detail Page ───────────────────────────────────────────────
function WorkoutHistoryDetailPage({
  workout,
  onBack,
  onEdit,
  onShare,
  resolvedTheme,
  onToggleTheme,
}: {
  workout: SavedWorkoutData;
  onBack: () => void;
  onEdit?: () => void;
  onShare?: () => void;
  resolvedTheme?: string;
  onToggleTheme?: () => void;
}) {
  const isRepIQ = !!workout.repiqSourceKey;
  const [expandedExId, setExpandedExId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());

  function toggleExercise(id: string) {
    setExpandedExId(prev => {
      const next = prev === id ? null : id;
      if (next) {
        requestAnimationFrame(() => {
          rowRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      }
      return next;
    });
  }

  const SET_TYPE_LABEL: Record<string, string> = {
    warmup: "W", dropset: "D", "rest-pause": "RP", failure: "F", normal: "",
  };

  return (
    <main className="detail-page finish-workout-page" data-theme={resolvedTheme}>
      <div className="finish-hero">
        <div className="finish-hero-topbar">
          <button className="finish-hero-back" type="button" onClick={onBack} aria-label="Back">←</button>
          <div style={{ flex: 1, textAlign: "center" }}>
            <p className="finish-hero-eyebrow label" style={{ color: "rgba(255,255,255,0.7)", margin: 0 }}>
              {isRepIQ ? "RepIQ Session" : "Workout"}
            </p>
          </div>
          {resolvedTheme && onToggleTheme ? (
            <button type="button" className="theme-toggle-btn theme-toggle-btn--ghost" onClick={onToggleTheme} aria-label="Toggle theme">
              {resolvedTheme === "dark"
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
            </button>
          ) : <span style={{ width: 38 }} />}
        </div>
        <h1 className="finish-hero-title">{workout.sessionName}</h1>
        <p className="finish-hero-date">{new Date(workout.date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</p>
        <div className="finish-hero-stats">
          <div className="finish-hero-stat"><span className="finish-hero-stat-label">Duration</span><strong className="finish-hero-stat-value">{workout.duration}</strong></div>
          <div className="finish-hero-stat"><span className="finish-hero-stat-label">Sets</span><strong className="finish-hero-stat-value">{workout.totalSets}</strong></div>
          <div className="finish-hero-stat"><span className="finish-hero-stat-label">Exercises</span><strong className="finish-hero-stat-value">{workout.exerciseCount}</strong></div>
          {workout.totalVolume > 0 && <div className="finish-hero-stat"><span className="finish-hero-stat-label">Volume</span><strong className="finish-hero-stat-value">{workout.totalVolume.toFixed(0)} kg</strong></div>}
        </div>
      </div>

      <div className="finish-workout-body">
        <section className="finish-workout-card">
          <p className="label" style={{ marginBottom: 8 }}>Exercises Performed</p>
          {workout.exercises.map((ex) => {
            const isExpanded = expandedExId === ex.id;
            return (
              <div
                key={ex.id}
                ref={(el) => { if (el) rowRefs.current.set(ex.id, el); else rowRefs.current.delete(ex.id); }}
              >
                <button
                  type="button"
                  className={`finish-exercise-row hd-ex-row${isExpanded ? " is-expanded" : ""}`}
                  onClick={() => toggleExercise(ex.id)}
                  aria-expanded={isExpanded}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span className="finish-exercise-name">{ex.name}</span>
                    <span className="finish-exercise-muscle" style={{ fontSize: "0.76rem", color: "var(--muted)", display: "block", marginTop: 1 }}>{ex.primaryMuscle}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <div style={{ textAlign: "right" }}>
                      <span className={`finish-exercise-sets${ex.loggedSets === 0 ? " is-unlogged" : ""}`}>
                        {ex.loggedSets === 0 ? "not logged" : `${ex.loggedSets} sets`}
                      </span>
                      {ex.loggedVolume > 0 && (
                        <span style={{ fontSize: "0.76rem", color: "var(--muted)", display: "block", marginTop: 1 }}>{ex.loggedVolume.toFixed(0)} kg</span>
                      )}
                    </div>
                    <svg className={`hd-chevron${isExpanded ? " is-open" : ""}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                </button>
                {isExpanded && ex.sets && ex.sets.length > 0 && (
                  <div className="hd-sets-detail">
                    <div className="hd-sets-header">
                      <span>SET</span><span>KG</span><span>REPS</span><span>RPE</span>
                    </div>
                    {ex.sets.map((s, i) => {
                      const typeLabel = SET_TYPE_LABEL[s.setType] ?? s.setType;
                      return (
                        <div key={i} className="hd-set-row">
                          <span className="hd-set-num">{i + 1}{typeLabel ? <em>{typeLabel}</em> : null}</span>
                          <span>{s.weight > 0 ? s.weight : "—"}</span>
                          <span>{s.reps > 0 ? s.reps : "—"}</span>
                          <span>{s.rpe != null ? s.rpe : "—"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {workout.note && (
          <section className="finish-workout-card">
            <p className="label" style={{ marginBottom: 6 }}>Note</p>
            <p className="settings-note" style={{ margin: 0 }}>{workout.note}</p>
          </section>
        )}

        {(onEdit || onShare) && (
          <div className="history-detail-actions">
            {onEdit && (
              <button className="secondary-button history-detail-action-btn" type="button" onClick={onEdit}>
                Edit Session
              </button>
            )}
            {onShare && (
              <button className="primary-button history-detail-action-btn" type="button" onClick={onShare}>
                Share Summary
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

// ── Insights Page ─────────────────────────────────────────────────────────────
function InsightsPage({
  savedWorkouts,
  psychProfile,
  library,
  onOpenReport,
  onRedoWorkout,
  onSaveToMyWorkouts,
  onDeleteWorkout,
  resolvedTheme,
  onToggleTheme,
  initialTab,
}: {
  savedWorkouts: SavedWorkoutData[];
  psychProfile: UserPsychProfile;
  library: ExerciseWithTaxonomy[];
  onOpenReport: (workout: SavedWorkoutData) => void;
  onRedoWorkout?: (workout: SavedWorkoutData) => void;
  onSaveToMyWorkouts?: (workout: SavedWorkoutData) => void;
  onDeleteWorkout?: (savedAt: string) => void;
  resolvedTheme?: string;
  onToggleTheme?: () => void;
  initialTab?: "summary" | "stats" | "progress";
}) {
  const [tab, setTab] = useState<"summary" | "stats" | "progress">(initialTab ?? "summary");
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // ── Analytics (all memoized) ──────────────────────────────────────────────
  const targetPerWeek = getSafeTargetPerWeek(psychProfile.scheduleCommitment, psychProfile.daysPerWeekPref);
  const cycleDays = psychProfile.cycleDays ?? 7;

  const consistency = useMemo(() => computeConsistencyStats(savedWorkouts, psychProfile), [savedWorkouts, psychProfile]);
  const sessionSummary = useMemo(() => computeSessionSummary(savedWorkouts), [savedWorkouts]);
  const laggingMuscles = useMemo(() => computeLaggingMuscles(savedWorkouts, psychProfile, library), [savedWorkouts, psychProfile, library]);
  const exerciseProgress = useMemo(() => computeExerciseProgress(savedWorkouts), [savedWorkouts]);
  const plateaus = useMemo(() => computePlateauExercises(savedWorkouts), [savedWorkouts]);
  const rotations = useMemo(() => computeExerciseRotation(savedWorkouts), [savedWorkouts]);
  const goalAlignment = useMemo(() => computeGoalAlignment(savedWorkouts, psychProfile), [savedWorkouts, psychProfile]);
  const movementBalance = useMemo(() => computeMovementBalance(savedWorkouts, library), [savedWorkouts, library]);
  const muscleCoverage = useMemo(() => computeMuscleCoverage(savedWorkouts, cycleDays), [savedWorkouts, cycleDays]);
  const trainingTrend = useMemo(() => computeTrainingTrend(savedWorkouts, cycleDays), [savedWorkouts, cycleDays]);
  const goalProgress = useMemo(() => computeGoalProgress(savedWorkouts, psychProfile), [savedWorkouts, psychProfile]);
  const prsHistory = useMemo(() => computePRsHistory(savedWorkouts), [savedWorkouts]);
  const actionPlan = useMemo(() => computeActionPlan(laggingMuscles, plateaus, rotations, goalAlignment, consistency, targetPerWeek), [laggingMuscles, plateaus, rotations, goalAlignment, consistency, targetPerWeek]);
  const weekStats = useMemo(() => getThisWeekStats(savedWorkouts), [savedWorkouts]);

  const hasEnoughData = savedWorkouts.length >= 3;

  function handleSave(w: SavedWorkoutData) {
    onSaveToMyWorkouts?.(w);
    setSavedToast(w.savedAt);
    setTimeout(() => setSavedToast(null), 2200);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const coverageColor = (s: MuscleStatus) =>
    s === "fresh" ? "#22c55e" : s === "fading" ? "#f59e0b" : s === "due" ? "#ef4444" : "var(--border)";
  const formatVol = (kg: number) => kg >= 1000 ? `${(kg / 1000).toFixed(1)}t` : `${Math.round(kg)}kg`;
  const trendArrow = (trend: SessionSummaryStats["volumeTrend"]) =>
    trend === "up" ? "↑" : trend === "down" ? "↓" : trend === "stable" ? "→" : "";
  const statusColor = (status: ExerciseProgressItem["status"]) =>
    status === "improving" ? "#22c55e"
    : status === "stalled" ? "#f59e0b"
    : status === "regressing" ? "#ef4444"
    : status === "building" ? "#3b82f6"
    : "var(--subtle-text)";
  const confidenceDot = (confidence: InsightConfidence) =>
    confidence === "high" ? "●●●" : confidence === "medium" ? "●●○" : "●○○";

  // Health ring scores (0–100)
  const ringConsistency = Number.isFinite(consistency.consistencyPct) ? consistency.consistencyPct : 0;
  const ringMuscle = (() => {
    const statuses = Object.values(muscleCoverage);
    if (statuses.length === 0) return 0;
    const freshCount = statuses.filter(s => s === "fresh" || s === "fading").length;
    return Math.round((freshCount / statuses.length) * 100);
  })();
  const ringGoal = goalAlignment.score;
  const goalAlignColor =
    goalAlignment.label === "aligned"
      ? "#22c55e"
      : goalAlignment.label === "partially_aligned"
        ? "#f59e0b"
        : "#ef4444";

  // ── Synthesize insight feed cards ──────────────────────────────────────────
  type FeedCard = { id: string; severity: "green" | "amber" | "red" | "info"; headline: string; detail: string; why: string; action: string };

  const insightFeed = useMemo((): FeedCard[] => {
    const cards: FeedCard[] = [];

    // Consistency insights
    if (consistency.lastGapDays > 7) {
      cards.push({ id: "gap", severity: "red", headline: `${consistency.lastGapDays} days since your last workout`, detail: "Consistency is the strongest predictor of progress. Even a light session counts.", why: "Long breaks cause detraining — strength drops ~1% per day after 2 weeks of inactivity.", action: "Do any session today, even 20 minutes." });
    } else if (consistency.consistencyPct < 50) {
      cards.push({ id: "low-freq", severity: "amber", headline: `Hitting ${consistency.consistencyPct}% of your weekly target`, detail: `You're averaging ${consistency.avgPerWeek} sessions/week — target is ${targetPerWeek}.`, why: "Undershoot your frequency target too long and all your gains slow down.", action: `Add ${Math.max(1, Math.ceil(targetPerWeek - consistency.avgPerWeek))} more session${targetPerWeek - consistency.avgPerWeek > 1.5 ? "s" : ""} per week.` });
    } else if (consistency.streak >= 5) {
      cards.push({ id: "streak", severity: "green", headline: `${consistency.streak}-day streak — keep it going`, detail: `${consistency.consistencyPct}% consistency this month. Your longest streak is ${consistency.longestStreak} days.`, why: "Streaks build habit. Consistency beats intensity for long-term results.", action: "Keep showing up. You're doing great." });
    }

    // Lagging muscles
    for (const m of laggingMuscles.slice(0, 3)) {
      const sug = m.suggestedExercises.slice(0, 2).join(", ");
      cards.push({
        id: `lag-${m.muscle}`, severity: m.reason === "absent" ? "red" : "amber",
        headline: `${m.muscle} is lagging`,
        detail: m.reason === "absent"
          ? `Not directly trained in ${m.lastTrainedDaysAgo ?? "14+"} days.`
          : `Only ${m.directSets30d} sets this month — your goal needs ~${m.minEffectiveVolume}.`,
        why: m.reason === "absent"
          ? "Muscles you skip consistently will fall behind and create imbalances."
          : "Below minimum effective volume — not enough stimulus to maintain, let alone grow.",
        action: sug ? `Add ${m.muscle} work this week. Try: ${sug}.` : `Add direct ${m.muscle} work in your next 2 sessions.`,
      });
    }

    // Plateaus
    for (const p of plateaus.slice(0, 2)) {
      cards.push({ id: `plat-${p.exerciseId}`, severity: "amber", headline: `${p.name} has plateaued`, detail: `Performance flat across ${p.sessionsAnalyzed} recent sessions.`, why: p.cause === "volume_stuck" ? "Volume dropped while load stayed the same — not enough total work to force adaptation." : "Same weight and reps repeated without progression. Your body has adapted to this stimulus.", action: p.action });
    }

    // Rotation warnings
    for (const r of rotations.filter(x => x.rotationLevel === "high").slice(0, 2)) {
      cards.push({ id: `rot-${r.muscle}`, severity: "amber", headline: `Too many ${r.muscle} variations`, detail: `${r.variantsUsed} different exercises in 8 weeks. Hard to track real progress.`, why: "Switching exercises too often means no single lift gets enough repeated exposure to show clear progression.", action: r.recommendation ?? `Keep ${r.anchorExercise} as your anchor lift for 4–6 weeks.` });
    }

    // Goal alignment
    if (goalAlignment.label === "misaligned" && goalAlignment.mismatches.length > 0) {
      cards.push({ id: "goal-mismatch", severity: "red", headline: "Training doesn't match your goal", detail: goalAlignment.mismatches[0], why: "Your actual training pattern diverges from what your stated goal requires.", action: goalAlignment.suggestions[0] ?? "Review your training split against your goal." });
    } else if (goalAlignment.label === "partially_aligned" && goalAlignment.mismatches.length > 0) {
      cards.push({ id: "goal-partial", severity: "amber", headline: "Partially aligned with your goal", detail: goalAlignment.mismatches[0], why: "Close, but there's a gap between what you're doing and optimal training for your goal.", action: goalAlignment.suggestions[0] ?? "Small adjustments will get you aligned." });
    }

    // Movement balance
    for (const im of movementBalance.imbalances.slice(0, 1)) {
      cards.push({ id: "balance", severity: "amber", headline: "Movement imbalance detected", detail: im, why: "Unbalanced patterns increase injury risk and limit overall development.", action: "Adjust your next session to include the missing movement type." });
    }

    // Improving exercises (positive feedback)
    const improving = exerciseProgress.filter(e => e.status === "improving").slice(0, 2);
    for (const ex of improving) {
      cards.push({ id: `prog-${ex.exerciseId}`, severity: "green", headline: `${ex.name} is progressing`, detail: ex.recentBestSet ? `Recent best: ${ex.recentBestSet.weight}kg × ${ex.recentBestSet.reps}` : `Trending up over ${ex.sessionsCount} sessions.`, why: "Consistent progressive overload — this exercise is responding to your training.", action: "Keep this movement in your rotation. Don't fix what isn't broken." });
    }

    // PRs
    if (prsHistory.length > 0) {
      const recentPRs = prsHistory.slice(0, 3);
      cards.push({ id: "prs", severity: "green", headline: `${prsHistory.length} personal record${prsHistory.length > 1 ? "s" : ""}`, detail: recentPRs.map(p => p.detail).join(" | "), why: "PRs confirm your training is working — real measurable progress.", action: "Celebrate it. Then keep pushing." });
    }

    return cards;
  }, [consistency, laggingMuscles, plateaus, rotations, goalAlignment, movementBalance, exerciseProgress, prsHistory, targetPerWeek]);

  const toggleInsight = (id: string) => setExpandedInsight(prev => prev === id ? null : id);

  return (
    <main className="shell selector-shell" data-theme={resolvedTheme}>
      <section className="app-shell selector-page">
        <header className="selector-header">
          <div>
            <p className="label">REPIQ</p>
            <h1>Insights</h1>
          </div>
          {resolvedTheme && onToggleTheme && (
            <button type="button" className="theme-toggle-btn" onClick={onToggleTheme} aria-label="Toggle theme">
              {resolvedTheme === "dark"
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
            </button>
          )}
        </header>

        <div className="planner-tabs" role="tablist" aria-label="Analytics sections">
          <div className="planner-tabs-track">
            <button type="button" className={tab === "summary" ? "is-active" : ""} aria-selected={tab === "summary"} onClick={() => setTab("summary")}>Summary</button>
            <button type="button" className={tab === "stats" ? "is-active" : ""} aria-selected={tab === "stats"} onClick={() => setTab("stats")}>Stats</button>
            <button type="button" className={tab === "progress" ? "is-active" : ""} aria-selected={tab === "progress"} onClick={() => setTab("progress")}>Progress</button>
          </div>
        </div>

        {tab === "summary" && (
          <section className="planner-section az-section">
            {savedWorkouts.length === 0 ? (
              <div className="planner-builder-stub">
                <p className="planner-empty-title">No workouts yet</p>
                <p className="planner-empty-sub">Complete a workout to see your insights here.</p>
              </div>
            ) : insightFeed.length === 0 ? (
              <div className="planner-builder-stub">
                <p className="planner-empty-title">Still learning your patterns</p>
                <p className="planner-empty-sub">Complete {Math.max(0, 3 - savedWorkouts.length)} more workout{savedWorkouts.length < 2 ? "s" : ""} to unlock insights.</p>
              </div>
            ) : (
              <div className="az-content">
                {insightFeed.map(card => (
                  <div key={card.id} className={`az-card az-insight-card az-severity-${card.severity}`}>
                    <div className="az-card-header-row">
                      <p className="az-card-title">{card.headline}</p>
                      <span className={`az-severity-badge az-severity-${card.severity}`}>
                        {card.severity === "green" ? "✓" : card.severity === "amber" ? "⚠" : card.severity === "red" ? "!" : "ℹ"}
                      </span>
                    </div>
                    <p className="az-card-sub">{card.detail}</p>
                    <button
                      type="button"
                      className="az-expand-btn"
                      onClick={() => toggleInsight(card.id)}
                      aria-expanded={expandedInsight === card.id}
                    >
                      {expandedInsight === card.id ? "Hide details" : "Show details"}
                    </button>
                    {expandedInsight === card.id && (
                      <div className="az-insight-details" style={{ marginTop: 12 }}>
                        <p style={{ fontSize: "0.9rem", color: "var(--subtle-text)", marginBottom: 8 }}>
                          <strong>Why:</strong> {card.why}
                        </p>
                        <p style={{ fontSize: "0.9rem", color: "var(--accent)" }}>
                          <strong>Next step:</strong> {card.action}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "stats" && (
          /* ── STATS ──────────────────────────────────────────────────────────── */
          <section className="planner-section az-section">
            {!hasEnoughData && (
              <div className="az-learning-banner">
                <span className="az-learning-icon">📊</span>
                <div>
                  <p className="az-learning-title">Still learning your patterns</p>
                  <p className="az-learning-sub">Complete {Math.max(0, 3 - savedWorkouts.length)} more workout{savedWorkouts.length < 2 ? "s" : ""} to unlock full insights.</p>
                </div>
              </div>
            )}
              <div className="az-content">
                {/* Action plan */}
                {actionPlan.length > 0 && (
                  <div className="az-card">
                    <p className="az-card-title">Recommended next actions</p>
                    <div className="az-action-list">
                      {actionPlan.map((a, i) => (
                        <div key={a.id} className="az-action-item">
                          <span className="az-action-num">{i + 1}</span>
                          <div className="az-action-body">
                            <p className="az-action-title">{a.title}</p>
                            <p className="az-action-detail">{a.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Consistency card */}
                <div className="az-card">
                  <p className="az-card-title">Consistency</p>
                  <div className="az-stat-grid">
                    <div className="az-stat">
                      <p className="az-stat-val">{consistency.streak}</p>
                      <p className="az-stat-lbl">Day streak</p>
                    </div>
                    <div className="az-stat">
                      <p className="az-stat-val">{consistency.sessions7d}</p>
                      <p className="az-stat-lbl">This week</p>
                    </div>
                    <div className="az-stat">
                      <p className="az-stat-val">{consistency.sessions30d}</p>
                      <p className="az-stat-lbl">Last 30 days</p>
                    </div>
                    <div className="az-stat">
                      <p className="az-stat-val">{ringConsistency}%</p>
                      <p className="az-stat-lbl">vs target</p>
                    </div>
                    <div className="az-stat">
                      <p className="az-stat-val">{consistency.longestStreak}</p>
                      <p className="az-stat-lbl">Best streak</p>
                    </div>
                    <div className="az-stat">
                      <p className="az-stat-val">{consistency.avgPerWeek}</p>
                      <p className="az-stat-lbl">Avg/week</p>
                    </div>
                  </div>
                  {consistency.lastGapDays > 7 && (
                    <p className="az-card-note az-note-warn">Last session was {consistency.lastGapDays} days ago — get back on track.</p>
                  )}
                  {consistency.isReturningAfterGap && consistency.lastGapDays <= 5 && (
                    <p className="az-card-note az-note-pos">Returning after a break — great to see you back.</p>
                  )}
                </div>

                {/* Training trend */}
                <div className="az-card">
                  <p className="az-card-title">Training trend</p>
                  <div className="az-trend-weeks">
                    {trainingTrend.recentWeeks.map(w => (
                      <div key={w.label} className={`az-trend-wk az-trend-wk--${w.zone}${w.isCurrent ? " is-current" : ""}`}>
                        <span className="az-trend-wk-label">{w.label}</span>
                        <span className="az-trend-wk-zone">{w.zone === "progress" ? "↑" : w.zone === "plateau" ? "↓" : w.zone === "missed" ? "–" : "→"}</span>
                      </div>
                    ))}
                  </div>
                  <p className="az-card-sub">{trainingTrend.insight}</p>
                </div>

                {/* Session output */}
                <div className="az-card">
                  <div className="az-card-header-row">
                    <p className="az-card-title">Session output</p>
                    {sessionSummary.volumeTrend !== "insufficient" && (
                      <span className={`az-trend-badge az-trend-badge--${sessionSummary.volumeTrend}`}>
                        Volume {trendArrow(sessionSummary.volumeTrend)}
                      </span>
                    )}
                  </div>
                  <div className="az-stat-grid">
                    <div className="az-stat">
                      <p className="az-stat-val">{sessionSummary.totalWorkouts}</p>
                      <p className="az-stat-lbl">Total workouts</p>
                    </div>
                    <div className="az-stat">
                      <p className="az-stat-val">{sessionSummary.totalSets}</p>
                      <p className="az-stat-lbl">Total sets</p>
                    </div>
                    <div className="az-stat">
                      <p className="az-stat-val">{formatVol(sessionSummary.totalVolumeKg)}</p>
                      <p className="az-stat-lbl">Total volume</p>
                    </div>
                    <div className="az-stat">
                      <p className="az-stat-val">{sessionSummary.avgDurationMin}m</p>
                      <p className="az-stat-lbl">Avg duration</p>
                    </div>
                    <div className="az-stat">
                      <p className="az-stat-val">{sessionSummary.avgSets}</p>
                      <p className="az-stat-lbl">Avg sets</p>
                    </div>
                    <div className="az-stat">
                      <p className="az-stat-val">{sessionSummary.avgExercises}</p>
                      <p className="az-stat-lbl">Avg exercises</p>
                    </div>
                  </div>
                </div>

                {/* Goal progress */}
                <div className="az-card">
                  <div className="az-card-header-row">
                    <p className="az-card-title">Goal progress</p>
                    <span className="az-goal-score">{goalProgress.score}/100</span>
                  </div>
                  <div className="az-progress-bar-wrap">
                    <div className="az-progress-bar" style={{ width: `${goalProgress.score}%` }} />
                  </div>
                  <p className="az-goal-label">{goalProgress.label}</p>
                  <p className="az-card-sub">{goalProgress.insight}</p>
                </div>
              </div>
          </section>
        )}

        {tab === "progress" && (
          <section className="planner-section az-section">
            <div className="planner-builder-stub">
              <p className="planner-empty-title">Progress tracking</p>
              <p className="planner-empty-sub">Coming soon — track your fitness journey with photos and milestone tracking.</p>
            </div>
          </section>
        )}

        {deleteConfirmId && (() => {
          const w = savedWorkouts.find(x => x.savedAt === deleteConfirmId);
          return (
            <div className="plan-delete-confirm-overlay" onClick={() => setDeleteConfirmId(null)}>
              <div className="plan-delete-confirm-sheet" onClick={e => e.stopPropagation()}>
                <p className="plan-delete-confirm-title">Delete "{w?.sessionName}"?</p>
                <p className="plan-delete-confirm-body">This will be permanently removed from your history. You can&apos;t undo this.</p>
                <div className="plan-delete-confirm-actions">
                  <button type="button" className="secondary-button" onClick={() => setDeleteConfirmId(null)}>Cancel</button>
                  <button type="button" className="danger-button" onClick={() => { const id = deleteConfirmId; setDeleteConfirmId(null); onDeleteWorkout?.(id); }}>Delete</button>
                </div>
              </div>
            </div>
          );
        })()}
      </section>
    </main>
  );
}

// ── Profile Page ──────────────────────────────────────────────────────────────
function ProfilePage({
  onBack,
  resolvedTheme,
  onToggleTheme,
  hiddenSuggestionIds,
  allExerciseTemplates,
  onRestoreHidden,
  onRestoreAllHidden,
}: {
  onBack: () => void;
  resolvedTheme?: string;
  onToggleTheme?: () => void;
  hiddenSuggestionIds: Set<string>;
  allExerciseTemplates: ExerciseDraft[];
  onRestoreHidden: (exerciseId: string) => void;
  onRestoreAllHidden: () => void;
}) {
  const [showHiddenSection, setShowHiddenSection] = useState(false);

  const hiddenExercises = [...hiddenSuggestionIds]
    .map(id => allExerciseTemplates.find(e => e.id === id))
    .filter((e): e is ExerciseDraft => e != null);

  return (
    <main className="profile-page" data-theme={resolvedTheme}>
      <header className="profile-header">
        <button className="back-nav-button detail-back-button" type="button" onClick={onBack} aria-label="Back">←</button>
        <span className="profile-header-title">Profile</span>
        {resolvedTheme && onToggleTheme ? (
          <button type="button" className="theme-toggle-btn" onClick={onToggleTheme} aria-label="Toggle theme">
            {resolvedTheme === "dark"
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
          </button>
        ) : <span style={{ width: 38 }} aria-hidden="true" />}
      </header>

      <div className="profile-section">
        <p className="profile-section-label">Settings</p>
        <div className="profile-list">
          {[
            { label: "Preferences", sub: "Theme, units, display" },
            { label: "Account", sub: "Manage your account" },
            { label: "Import / Export", sub: "Backup and restore data" },
          ].map(({ label, sub }) => (
            <button key={label} type="button" className="profile-row">
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: "0.92rem" }}>{label}</p>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--muted)" }}>{sub}</p>
              </div>
              <span className="profile-row-chevron">›</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Exercise customisation ─────────────────────────────────────────── */}
      <div className="profile-section">
        <p className="profile-section-label">Customisation</p>
        <div className="profile-list">
          <button
            type="button"
            className="profile-row"
            onClick={() => setShowHiddenSection(v => !v)}
          >
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: "0.92rem" }}>Hidden from suggestions</p>
              <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--muted)" }}>
                {hiddenExercises.length === 0
                  ? "No exercises hidden yet"
                  : `${hiddenExercises.length} exercise${hiddenExercises.length !== 1 ? "s" : ""} hidden`}
              </p>
            </div>
            <span className="profile-row-chevron" style={{ transform: showHiddenSection ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>›</span>
          </button>

          {showHiddenSection && (
            <div className="profile-hidden-list">
              {hiddenExercises.length === 0 ? (
                <p className="profile-hidden-empty">
                  You haven't hidden any exercises yet. Tap ✕ on a Smart Replace suggestion to hide it.
                </p>
              ) : (
                <>
                  {hiddenExercises.map(ex => (
                    <div key={ex.id} className="profile-hidden-row">
                      <div className="profile-hidden-info">
                        <span className="profile-hidden-name">{ex.name}</span>
                        <span className="profile-hidden-muscle">{ex.primaryMuscle}</span>
                      </div>
                      <button
                        type="button"
                        className="profile-hidden-restore-btn"
                        onClick={() => onRestoreHidden(ex.id)}
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="profile-hidden-restore-all-btn"
                    onClick={onRestoreAllHidden}
                  >
                    Restore all
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ── Home page helpers ─────────────────────────────────────────────────────────

// ── Goal progress algorithm ───────────────────────────────────────────────────
// Score 0–100 from 4 components (last 28 days vs profile targets):
//   Consistency  40pts — sessions vs target (scheduleCommitment × 4 weeks)
//   Volume trend 20pts — avg weekly vol this 28d vs prior 28d
//   Coverage     20pts — unique canonical muscle groups hit ≥ once
//   Streak       20pts — current streak vs weekly target

type GoalProgressResult = {
  score: number;
  label: string;
  goalName: string;
  insight: string;
};

// Pre-defined one-liners: keyed by goal bucket + score tier + dominant signal
// goal buckets: muscle | strength | fat | endurance | general
// score tiers:  none(0) | low(1-25) | mid(26-55) | good(56-79) | great(80+)
type GoalBucket = "muscle" | "strength" | "fat" | "endurance" | "general";
type ScoreTier = "none" | "low" | "mid" | "good" | "great";

const INSIGHT_LIBRARY: Record<GoalBucket, Record<ScoreTier, string[]>> = {
  muscle: {
    none:     ["Start lifting — every rep is a brick in the wall."],
    low:      ["Consistency beats intensity. Show up a few more times this month.", "The muscle doesn't know your plan — log the work.", "You've started. That's the hardest part. Keep that momentum."],
    mid:      ["You're in the building phase. Volume is your best friend right now.", "Missing sessions is where gains get left behind — tighten your schedule.", "Good foundation. Hit legs and back more to balance your coverage."],
    good:     ["You're building real volume. Recovery days are part of the plan too.", "Solid month. Push progressive overload on your main lifts.", "Strong coverage — make sure you're hitting progressive sets each week."],
    great:    ["You're in the zone. Keep the volume up and deload when needed.", "Muscle-building on track. Next focus: squeeze a bit more on each set.", "Elite consistency this month. Your body is responding — stay the course."],
  },
  strength: {
    none:     ["Log your first session — strength starts with showing up."],
    low:      ["Every session adds to your base. Prioritise the big lifts.", "Strength is built over months. Get the sessions in first.", "Few sessions logged — consistency is what drives strength gains."],
    mid:      ["You're training, but gaps in your schedule slow strength progress.", "Hit your compound lifts 3x this week — the numbers will follow.", "Coverage looks thin. Squat, press, pull — those are your pillars."],
    good:     ["Good month. Aim to add small weight to your main lifts each week.", "Solid frequency. Track your top sets — that's where PRs live.", "Strong pattern. Make sure your volume supports the intensity."],
    great:    ["Excellent load this month. You're in the adaptation window.", "Strength is compounding. Keep the frequency high and sleep well.", "One of your best months. Don't let a deload derail momentum."],
  },
  fat: {
    none:     ["The first session burns the most mental calories. Start today."],
    low:      ["More sessions = more output. Aim for at least 3 this week.", "Fat loss is a numbers game — log more sessions to tip the scale.", "Every workout is a calorie deficit you don't have to count."],
    mid:      ["Good effort. Closing the gap between sessions will accelerate results.", "Mix in some higher-rep sets to keep metabolism elevated.", "Solid start — consistency in the next 2 weeks will show up on you."],
    good:     ["You're doing the work. Pair this with protein and sleep.", "Strong month. Your body is in active recomposition mode.", "Great session count. Add one more day if you can — the compound effect is real."],
    great:    ["Outstanding month. This is the kind of consistency that changes physiques.", "You're in full fat-loss mode. Recovery and nutrition are the multiplier now.", "Top tier effort. Results take 6–8 weeks to show — you're already ahead."],
  },
  endurance: {
    none:     ["Endurance is built one session at a time. Log the first one."],
    low:      ["Frequency is everything for endurance. Get more sessions in.", "Even short sessions count — they build the aerobic base.", "Start small, stay consistent. That's the endurance formula."],
    mid:      ["You're training. Closing gaps between sessions matters most now.", "Add one more session this week — endurance loves volume.", "Good base. Focus on keeping effort levels steady across sessions."],
    good:     ["Strong work capacity this month. You're building real endurance.", "Great consistency. Your recovery between sessions is improving.", "Good month — now start layering in progressive effort on your key sessions."],
    great:    ["Your engine is firing. Keep the sessions flowing and trust the process.", "Elite consistency. Your aerobic base is compounding nicely.", "Exceptional month. Protect your sleep — that's where endurance adapts."],
  },
  general: {
    none:     ["Your first workout is the most important one. Make it today."],
    low:      ["A little is always better than nothing. Build the habit first.", "Three sessions a week changes everything. Start there.", "You've logged in — now make it a routine."],
    mid:      ["Good momentum. A couple more sessions will really lock in the habit.", "You're showing up. Now focus on showing up consistently.", "Halfway there. Make the remaining weeks count."],
    good:     ["Great month overall. You're ahead of most people already.", "Solid work — your body is adapting. Keep feeding it movement.", "Good frequency and coverage. That's a healthy training month."],
    great:    ["Exceptional month. Your consistency is your superpower.", "You're building something real. Don't stop here.", "Top of your game this month. Set a new target for next month."],
  },
};

function getGoalBucket(goal: TrainingGoal | null): GoalBucket {
  if (!goal) return "general";
  if (goal === "build_muscle" || goal === "muscle_strength") return "muscle";
  if (goal === "get_stronger") return "strength";
  if (goal === "fat_loss") return "fat";
  if (goal === "endurance" || goal === "athletic_performance") return "endurance";
  return "general";
}

function getScoreTier(score: number): ScoreTier {
  if (score === 0) return "none";
  if (score <= 25) return "low";
  if (score <= 55) return "mid";
  if (score <= 79) return "good";
  return "great";
}

function getSafeTargetPerWeek(scheduleCommitment?: number | null, daysPerWeekPref?: number | null): number {
  for (const candidate of [scheduleCommitment, daysPerWeekPref]) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      return Math.min(Math.max(Math.round(candidate), 1), 7);
    }
  }
  return 3;
}

function pickInsight(bucket: GoalBucket, tier: ScoreTier, seed: number): string {
  const options = INSIGHT_LIBRARY[bucket][tier];
  return options[seed % options.length];
}

function computeGoalProgress(
  workouts: SavedWorkoutData[],
  profile: UserPsychProfile,
): GoalProgressResult {
  const msPerDay = 86400000;
  const today = new Date();
  const todayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days28Ms = todayMs - 27 * msPerDay;
  const days56Ms = todayMs - 55 * msPerDay;

  const recent = workouts.filter((w) => {
    const ds = (w.date ?? w.savedAt).slice(0, 10);
    const [y, mo, d] = ds.split("-").map(Number);
    return Date.UTC(y, mo - 1, d) >= days28Ms;
  });
  const prior = workouts.filter((w) => {
    const ds = (w.date ?? w.savedAt).slice(0, 10);
    const [y, mo, d] = ds.split("-").map(Number);
    const wMs = Date.UTC(y, mo - 1, d);
    return wMs >= days56Ms && wMs < days28Ms;
  });

  const targetPerWeek = getSafeTargetPerWeek(profile.scheduleCommitment, profile.daysPerWeekPref);
  const targetSessions = targetPerWeek * 4;

  // 1. Consistency (40pts)
  const consistencyRaw = Math.min(recent.length / Math.max(targetSessions, 1), 1);
  const consistencyScore = Math.round(consistencyRaw * 40);

  // 2. Volume trend (20pts)
  const recentVol = recent.reduce((s, w) => s + (w.totalVolume ?? 0), 0) / 4;
  const priorVol = prior.reduce((s, w) => s + (w.totalVolume ?? 0), 0) / 4;
  let volScore = 10;
  if (priorVol > 0) {
    const trend = (recentVol - priorVol) / priorVol;
    volScore = Math.round(Math.min(Math.max((trend + 0.5) * 20, 0), 20));
  } else if (recentVol > 0) {
    volScore = 14;
  }

  // 3. Muscle coverage (20pts)
  const hitMuscles = new Set<string>();
  for (const w of recent) {
    for (const ex of w.exercises) {
      const c = getCanonicalMuscle(ex.primaryMuscle);
      if (c !== "Other") hitMuscles.add(c);
    }
  }
  const coverageScore = Math.round((hitMuscles.size / 10) * 20);

  // 4. Streak quality (20pts)
  const streak = computeStreak(workouts);
  const streakScore = Math.round(Math.min(streak / Math.max(targetPerWeek, 1), 1) * 20);

  const total = Math.min(consistencyScore + volScore + coverageScore + streakScore, 100);

  const label =
    total >= 80 ? "On Fire 🔥" :
    total >= 60 ? "Strong" :
    total >= 40 ? "Building" :
    total >= 20 ? "Getting Started" : "Day One";

  const goalName = profile.primaryGoal
    ? profile.primaryGoal.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : "Stay Active";

  const bucket = getGoalBucket(profile.primaryGoal);
  const tier = getScoreTier(total);
  // Seed with session count so insight rotates each month but is stable within a day
  const seed = recent.length + today.getMonth();
  const insight = pickInsight(bucket, tier, seed);

  return { score: total, label, goalName, insight };
}

function computeStreak(workouts: SavedWorkoutData[]): number {
  if (workouts.length === 0) return 0;
  const today = new Date();
  const msPerDay = 86400000;
  const todayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const dateMsSet = new Set(
    workouts.map((w) => {
      const ds = (w.date ?? w.savedAt).slice(0, 10);
      const [y, mo, d] = ds.split("-").map(Number);
      return Date.UTC(y, mo - 1, d);
    })
  );
  const startMs = dateMsSet.has(todayMs)
    ? todayMs
    : dateMsSet.has(todayMs - msPerDay)
      ? todayMs - msPerDay
      : null;
  if (startMs === null) return 0;
  let streak = 0;
  let cur = startMs;
  while (dateMsSet.has(cur)) { streak++; cur -= msPerDay; }
  return streak;
}

/// A "quality week" requires either:
//   - sessions >= 2 (regardless of muscle coverage), OR
//   - sessions === 1 AND muscles.size >= 3 (single thorough session)
// Anything else (0 sessions, or 1 session with <3 muscle groups) is NOT quality.
function isQualityWeek(
  sessions: number,
  muscles: Set<string>,
  _targetPerWeek: number,
): boolean {
  if (sessions >= 2) return true;
  if (sessions === 1 && muscles.size >= 3) return true;
  return false;
}

function isPartialWeek(sessions: number, muscles: Set<string>): boolean {
  return sessions === 1 && muscles.size < 3;
}

function computeWeekStreak(workouts: SavedWorkoutData[], targetPerWeek: number, cycleDays: number = 7): number {
  if (workouts.length === 0) return 0;

  const today = new Date();

  if (cycleDays !== 7) {
    // Rolling cycle mode: count consecutive cycleDays-length windows with quality sessions
    const todayMs2 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const cycleMs2 = cycleDays * 86400000;

    // Map each workout to its cycle offset (0 = current, 1 = one cycle ago, etc.)
    const cycleMap = new Map<number, { sessions: number; muscles: Set<string> }>();
    for (const w of workouts) {
      const ds = (w.date ?? w.savedAt).slice(0, 10);
      const [y, mo, d] = ds.split("-").map(Number);
      const wMs = Date.UTC(y, mo - 1, d);
      const offset = Math.floor((todayMs2 - wMs) / cycleMs2);
      if (!cycleMap.has(offset)) cycleMap.set(offset, { sessions: 0, muscles: new Set() });
      const entry = cycleMap.get(offset)!;
      entry.sessions += 1;
      for (const ex of w.exercises) {
        const canonical = getCanonicalMuscle(ex.primaryMuscle);
        if (canonical !== "Other") entry.muscles.add(canonical);
      }
    }
    let streak = 0;
    // Start checking from offset 0 (current cycle)
    for (let off = 0; off < 52; off++) {
      const entry = cycleMap.get(off);
      if (!entry) break;
      if (isQualityWeek(entry.sessions, entry.muscles, targetPerWeek)) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  const msPerWeek = 7 * 86400000;

  const getMondayUtc = (d: Date): number => {
    const day = d.getDay(); // 0 Sun … 6 Sat
    const diffDays = day === 0 ? -6 : 1 - day;
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + diffDays);
  };

  // Build map: weekMondayMs → { sessions, muscles }
  const weekMap = new Map<number, { sessions: number; muscles: Set<string> }>();
  for (const w of workouts) {
    const ds = (w.date ?? w.savedAt).slice(0, 10);
    const [y, mo, d] = ds.split("-").map(Number);
    const mon = getMondayUtc(new Date(y, mo - 1, d));
    if (!weekMap.has(mon)) weekMap.set(mon, { sessions: 0, muscles: new Set() });
    const entry = weekMap.get(mon)!;
    entry.sessions += 1;
    for (const ex of w.exercises) {
      const canonical = getCanonicalMuscle(ex.primaryMuscle);
      if (canonical !== "Other") entry.muscles.add(canonical);
    }
  }

  const isQuality = (mon: number) => {
    const entry = weekMap.get(mon);
    if (!entry) return false;
    return isQualityWeek(entry.sessions, entry.muscles, targetPerWeek);
  };

  const currentMon = getMondayUtc(today);

  // Start from current week if already quality, else previous week
  const startMon = isQuality(currentMon) ? currentMon : currentMon - msPerWeek;

  let streak = 0;
  let cur = startMon;
  while (isQuality(cur)) { streak++; cur -= msPerWeek; }
  return streak;
}

type TrainingZone = "progress" | "maintenance" | "plateau" | "missed";

// Returns ISO week number (1–53) for a given Monday timestamp (UTC ms)
function getISOWeekNumber(mondayMs: number): number {
  const year = new Date(mondayMs).getUTCFullYear();
  // Jan 4 is always in ISO week 1
  const jan4 = Date.UTC(year, 0, 4);
  const jan4DayOfWeek = new Date(jan4).getUTCDay() || 7; // Mon=1 … Sun=7
  const week1Mon = jan4 - (jan4DayOfWeek - 1) * 86400000;
  const weekNum = Math.round((mondayMs - week1Mon) / (7 * 86400000)) + 1;
  // Handle year-boundary edge cases
  if (weekNum < 1) return 52;
  if (weekNum > 53) return 1;
  return weekNum;
}

function pickMessage(workouts: SavedWorkoutData[], missedCount: number, progressCount: number, plateauCount: number, currentZone: TrainingZone): { insight: string; zoneLabel: string; tapHint: string } {
  if (workouts.length === 0 || missedCount === 4) {
    return { zoneLabel: "No data yet", insight: "Log your first session and your volume trend will appear here.", tapHint: "Explore Analyzer →" };
  } else if (missedCount >= 2 && currentZone === "missed") {
    return { zoneLabel: "On a break", insight: "A few weeks off. Let's ease back in — even one session restarts the engine.", tapHint: "Let's get back on it →" };
  } else if (currentZone === "missed") {
    return { zoneLabel: "Week missed", insight: "You had good momentum — one session this week will keep it alive.", tapHint: "Let's get back on it →" };
  } else if (missedCount >= 2) {
    return { zoneLabel: "↑ Resuming", insight: "Back in the gym after some missed weeks — rebuild gradually to avoid injury.", tapHint: "Track your rebuild in Analyzer →" };
  } else if (progressCount >= 3) {
    return { zoneLabel: "↑ Progressing", insight: "Volume up 3+ weeks in a row. Check which muscles are carrying the load.", tapHint: "Muscle breakdown in Analyzer →" };
  } else if (progressCount >= 2 && plateauCount === 0) {
    return { zoneLabel: "↑ Progressing", insight: "Solid upward trend. Push progressive overload on your main lifts.", tapHint: "Muscle breakdown in Analyzer →" };
  } else if (plateauCount >= 2) {
    return { zoneLabel: "↓ Plateauing", insight: "Overall volume has stalled for 2+ weeks. Something needs to change.", tapHint: "See which lifts need a reset →" };
  } else if (currentZone === "plateau") {
    return { zoneLabel: "↓ Plateauing", insight: "Volume dipped this week. Deload intentionally or push back next session.", tapHint: "See which lifts need a reset →" };
  } else if (currentZone === "progress") {
    return { zoneLabel: "↑ Progressing", insight: "Volume up this week. Check the Analyzer to see which muscles are leading.", tapHint: "Muscle breakdown in Analyzer →" };
  } else {
    return { zoneLabel: "→ Maintaining", insight: "Load is steady. A small overload nudge could push you into a progress phase.", tapHint: "Muscle breakdown in Analyzer →" };
  }
}

function computeTrainingTrend(workouts: SavedWorkoutData[], cycleDays: number = 7): {
  weekZones: TrainingZone[];
  recentWeeks: { label: string; zone: TrainingZone; isCurrent: boolean; isPartial: boolean }[];
  currentZone: TrainingZone;
  insight: string;
  zoneLabel: string;
  tapHint: string;
} {
  const classify = (vol: number, prev: number): TrainingZone => {
    if (vol === 0) return "missed";
    if (prev === 0) return "maintenance";
    const delta = (vol - prev) / prev;
    if (delta > 0.05) return "progress";
    if (delta < -0.10) return "plateau";
    return "maintenance";
  };

  const today = new Date();
  const todayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());

  if (cycleDays === 7) {
    // ── Calendar-week mode ─────────────────────────────────────────────────
    const getMondayUtc = (d: Date): number => {
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + diff);
    };
    const todayDow = today.getDay() === 0 ? 6 : today.getDay() - 1; // Mon=0 Sun=6
    const currentMon = getMondayUtc(today);
    const msPerWeek = 7 * 86400000;

    // Full week volumes and TTD (to-date) volumes per week
    const weekVolMap = new Map<number, number>();
    const weekVolTTDMap = new Map<number, number>();
    const weekSessMap = new Map<number, { sessions: number; muscles: Set<string> }>();

    for (const w of workouts) {
      const ds = (w.date ?? w.savedAt).slice(0, 10);
      const [y, mo, d] = ds.split("-").map(Number);
      const date = new Date(y, mo - 1, d);
      const dow = date.getDay() === 0 ? 6 : date.getDay() - 1;
      const mon = getMondayUtc(date);
      weekVolMap.set(mon, (weekVolMap.get(mon) ?? 0) + (w.totalVolume ?? 0));
      if (dow <= todayDow) {
        weekVolTTDMap.set(mon, (weekVolTTDMap.get(mon) ?? 0) + (w.totalVolume ?? 0));
      }
      if (!weekSessMap.has(mon)) weekSessMap.set(mon, { sessions: 0, muscles: new Set() });
      const entry = weekSessMap.get(mon)!;
      entry.sessions += 1;
      for (const ex of w.exercises) {
        const canonical = getCanonicalMuscle(ex.primaryMuscle);
        if (canonical !== "Other") entry.muscles.add(canonical);
      }
    }

    // Volumes for complete weeks (W-4 through W-1) — full week
    // For W0 (current) vs W-1 baseline: use TTD for fair comparison
    const vols: number[] = [];
    for (let i = 4; i >= 1; i--) {
      vols.push(weekVolMap.get(currentMon - i * msPerWeek) ?? 0);
    }
    vols.push(weekVolMap.get(currentMon) ?? 0); // W0 full (not used in zone calc below)

    // Zones for W-3, W-2, W-1 use full-week comparison
    const weekZones: TrainingZone[] = vols.slice(1).map((vol, i) => classify(vol, vols[i]));

    // Override W0 zone with TTD comparison (fair: same days-of-week elapsed)
    const currentTTD = weekVolTTDMap.get(currentMon) ?? 0;
    const lastWeekTTD = weekVolTTDMap.get(currentMon - msPerWeek) ?? 0;
    weekZones[3] = classify(currentTTD, lastWeekTTD);

    const currentZone = weekZones[3];

    const recentWeeks = [1, 2, 3].map((idx) => {
      const offset = 3 - idx;
      const monMs = currentMon - offset * msPerWeek;
      const zone = weekZones[idx];
      const sessEntry = weekSessMap.get(monMs);
      const partial = sessEntry
        ? isPartialWeek(sessEntry.sessions, sessEntry.muscles) && zone !== "missed"
        : false;
      return {
        label: `W${getISOWeekNumber(monMs)}`,
        zone,
        isCurrent: offset === 0,
        isPartial: partial,
      };
    });

    const progressCount = weekZones.filter(z => z === "progress").length;
    const plateauCount  = weekZones.filter(z => z === "plateau").length;
    const missedCount   = weekZones.filter(z => z === "missed").length;
    return { weekZones, recentWeeks, currentZone, ...pickMessage(workouts, missedCount, progressCount, plateauCount, currentZone) };

  } else {
    // ── Rolling-cycle mode ─────────────────────────────────────────────────
    const cycleMs = cycleDays * 86400000;

    // Build per-cycle volumes (rolling windows from today, going back 4 cycles)
    // Cycle 0: [today - cycleDays + 1 day, today]
    // Cycle -1: [today - 2*cycleDays + 1 day, today - cycleDays + ... ]
    const cycleStart = (offset: number) => todayMs - (offset + 1) * cycleMs + 86400000;
    const cycleEnd   = (offset: number) => todayMs - offset * cycleMs;

    const cycleVol  = new Map<number, number>(); // offset → volume
    const cycleSess = new Map<number, { sessions: number; muscles: Set<string> }>(); // offset → sessions

    for (const w of workouts) {
      const ds = (w.date ?? w.savedAt).slice(0, 10);
      const [y, mo, d] = ds.split("-").map(Number);
      const wMs = Date.UTC(y, mo - 1, d);
      for (let off = 0; off <= 4; off++) {
        if (wMs >= cycleStart(off) && wMs <= cycleEnd(off)) {
          cycleVol.set(off, (cycleVol.get(off) ?? 0) + (w.totalVolume ?? 0));
          if (!cycleSess.has(off)) cycleSess.set(off, { sessions: 0, muscles: new Set() });
          const entry = cycleSess.get(off)!;
          entry.sessions += 1;
          for (const ex of w.exercises) {
            const canonical = getCanonicalMuscle(ex.primaryMuscle);
            if (canonical !== "Other") entry.muscles.add(canonical);
          }
          break;
        }
      }
    }

    // vols: [C-4, C-3, C-2, C-1, C0] (offset 4 → 0)
    const vols: number[] = [4, 3, 2, 1, 0].map(off => cycleVol.get(off) ?? 0);
    const weekZones: TrainingZone[] = vols.slice(1).map((vol, i) => classify(vol, vols[i]));
    const currentZone = weekZones[3];

    // For week-to-date within current cycle: compare partial current cycle
    // vs equivalent partial prior cycle
    const cycleDaysElapsed = Math.max(1, Math.round((todayMs - cycleStart(0)) / 86400000) + 1);
    const fracElapsed = cycleDaysElapsed / cycleDays;
    // If still early in cycle (< 50% elapsed), compare proportionally
    if (fracElapsed < 0.9 && vols[3] > 0) {
      const priorProrated = vols[3] * fracElapsed;
      weekZones[3] = classify(vols[4], priorProrated);
    }

    const recentWeeks = [1, 2, 3].map((idx) => {
      const offset = 3 - idx;  // 2, 1, 0
      const zone = weekZones[idx];
      const sessEntry = cycleSess.get(offset);
      const partial = sessEntry
        ? isPartialWeek(sessEntry.sessions, sessEntry.muscles) && zone !== "missed"
        : false;
      const label = offset === 0 ? "Now" : `C-${offset}`;
      return { label, zone, isCurrent: offset === 0, isPartial: partial };
    });

    const progressCount = weekZones.filter(z => z === "progress").length;
    const plateauCount  = weekZones.filter(z => z === "plateau").length;
    const missedCount   = weekZones.filter(z => z === "missed").length;
    return { weekZones, recentWeeks, currentZone, ...pickMessage(workouts, missedCount, progressCount, plateauCount, currentZone) };
  }
}

function getThisWeekStats(workouts: SavedWorkoutData[]): {
  sessions: number; sets: number; volume: number; activeDayNumbers: number[];
} {
  const today = new Date();
  const dow = today.getDay(); // 0=Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const mondayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + mondayOffset);
  const sundayMs = mondayMs + 6 * 86400000;
  const msPerDay = 86400000;
  const thisWeek = workouts.filter((w) => {
    const ds = (w.date ?? w.savedAt).slice(0, 10);
    const [y, mo, d] = ds.split("-").map(Number);
    const wMs = Date.UTC(y, mo - 1, d);
    return wMs >= mondayMs && wMs <= sundayMs;
  });
  const seenDays = new Set<number>();
  for (const w of thisWeek) {
    const ds = (w.date ?? w.savedAt).slice(0, 10);
    const [y, mo, d] = ds.split("-").map(Number);
    seenDays.add(Math.floor((Date.UTC(y, mo - 1, d) - mondayMs) / msPerDay));
  }
  return {
    sessions: thisWeek.length,
    sets: thisWeek.reduce((s, w) => s + (w.totalSets ?? 0), 0),
    volume: thisWeek.reduce((s, w) => s + (w.totalVolume ?? 0), 0),
    activeDayNumbers: [...seenDays],
  };
}

// ── Insights V1 Engine ────────────────────────────────────────────────────────

type InsightConfidence = "low" | "medium" | "high";

type ConsistencyStats = {
  sessions7d: number;
  sessions30d: number;
  streak: number;
  longestStreak: number;
  avgPerWeek: number;
  consistencyPct: number;
  lastGapDays: number;
  isReturningAfterGap: boolean;
};

type SessionSummaryStats = {
  totalWorkouts: number;
  totalSets: number;
  totalVolumeKg: number;
  totalDurationMin: number;
  avgDurationMin: number;
  avgSets: number;
  avgVolumeKg: number;
  avgExercises: number;
  volumeTrend: "up" | "down" | "stable" | "insufficient";
  sessionsTrend: "up" | "down" | "stable" | "insufficient";
};

type LaggingMuscleItem = {
  muscle: string;
  directSets30d: number;
  minEffectiveVolume: number;
  lastTrainedDaysAgo: number | null;
  reason: "absent" | "low_volume" | "low_frequency";
  suggestedExercises: string[];
};

type ExerciseProgressItem = {
  exerciseId: string;
  name: string;
  primaryMuscle: string;
  status: "improving" | "stable" | "building" | "stalled" | "regressing" | "insufficient_data";
  sessionsCount: number;
  bestSetEver: { weight: number; reps: number } | null;
  recentBestSet: { weight: number; reps: number } | null;
  volumeTrend: "up" | "down" | "stable";
  confidence: InsightConfidence;
};

type PlateauItem = {
  exerciseId: string;
  name: string;
  sessionsAnalyzed: number;
  confidence: InsightConfidence;
  cause: "weight_stuck" | "reps_stuck" | "volume_stuck";
  action: string;
};

type RotationItem = {
  muscle: string;
  variantsUsed: number;
  variantNames: string[];
  anchorExercise: string | null;
  rotationLevel: "high" | "acceptable" | "well_standardized";
  warning?: string;
  recommendation?: string;
};

type GoalAlignmentResult = {
  score: number;
  label: "aligned" | "partially_aligned" | "misaligned";
  mismatches: string[];
  suggestions: string[];
};

type MovementBalanceResult = {
  byPattern: Record<string, { sets: number; volume: number }>;
  pushSets: number;
  pullSets: number;
  squatSets: number;
  hingeSets: number;
  upperSets: number;
  lowerSets: number;
  imbalances: string[];
};

type PREntry = {
  exerciseName: string;
  prType: "weight" | "reps" | "estimated_1rm";
  detail: string;
  date: string;
};

type ActionItem = {
  id: string;
  priority: number;
  title: string;
  detail: string;
  linkedType: "consistency" | "lagging_muscle" | "plateau" | "rotation" | "goal_alignment" | "balance";
};

function wkToMs(w: SavedWorkoutData): number {
  const ds = (w.date ?? w.savedAt).slice(0, 10);
  const [y, mo, d] = ds.split("-").map(Number);
  return Date.UTC(y, mo - 1, d);
}

function computeConsistencyStats(workouts: SavedWorkoutData[], profile: UserPsychProfile): ConsistencyStats {
  const msPerDay = 86400000;
  const today = new Date();
  const todayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const sessions7d = workouts.filter(w => todayMs - wkToMs(w) <= 6 * msPerDay).length;
  const sessions30d = workouts.filter(w => todayMs - wkToMs(w) <= 29 * msPerDay).length;
  const streak = computeStreak(workouts);

  // Longest streak
  const sortedMs = [...new Set(workouts.map(wkToMs))].sort((a, b) => a - b);
  let longest = 0, cur = 0;
  for (let i = 0; i < sortedMs.length; i++) {
    if (i === 0 || sortedMs[i] - sortedMs[i - 1] === msPerDay) { cur++; }
    else { cur = 1; }
    longest = Math.max(longest, cur);
  }

  // Avg per week (last 8 weeks)
  const recent8w = workouts.filter(w => todayMs - wkToMs(w) <= 55 * msPerDay);
  const avgPerWeek = Math.round((recent8w.length / 8) * 10) / 10;

  // Consistency % vs target
  const targetPerWeek = getSafeTargetPerWeek(profile.scheduleCommitment, profile.daysPerWeekPref);
  const target30d = targetPerWeek * 4;
  const consistencyPct = Math.min(Math.round((sessions30d / Math.max(target30d, 1)) * 100), 100);

  // Days since last workout
  const lastMs = workouts.length > 0 ? wkToMs(workouts[0]) : null;
  const lastGapDays = lastMs != null ? Math.round((todayMs - lastMs) / msPerDay) : 999;

  // Returning after gap: had a 14+ day break at some point in last 30 days
  const recent = workouts.filter(w => todayMs - wkToMs(w) <= 30 * msPerDay);
  let isReturningAfterGap = false;
  if (recent.length >= 2) {
    const rMs = recent.map(wkToMs).sort((a, b) => b - a);
    for (let i = 0; i < rMs.length - 1; i++) {
      if ((rMs[i] - rMs[i + 1]) / msPerDay >= 14) { isReturningAfterGap = true; break; }
    }
  }

  return { sessions7d, sessions30d, streak, longestStreak: longest, avgPerWeek, consistencyPct, lastGapDays, isReturningAfterGap };
}

function computeSessionSummary(workouts: SavedWorkoutData[]): SessionSummaryStats {
  const msPerDay = 86400000;
  const today = new Date();
  const todayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const recent = workouts.filter(w => todayMs - wkToMs(w) <= 27 * msPerDay);
  const prior = workouts.filter(w => { const d = todayMs - wkToMs(w); return d > 27 * msPerDay && d <= 55 * msPerDay; });

  const n = workouts.length || 1;
  const totalDurationSec = workouts.reduce((s, w) => s + (w.durationSeconds ?? 0), 0);
  const totalSets = workouts.reduce((s, w) => s + (w.totalSets ?? 0), 0);
  const totalVolumeKg = workouts.reduce((s, w) => s + (w.totalVolume ?? 0), 0);

  const recentVol = recent.reduce((s, w) => s + (w.totalVolume ?? 0), 0);
  const priorVol = prior.reduce((s, w) => s + (w.totalVolume ?? 0), 0);
  let volumeTrend: SessionSummaryStats["volumeTrend"] = "insufficient";
  if (prior.length >= 2 && recent.length >= 2) {
    const delta = priorVol > 0 ? (recentVol - priorVol) / priorVol : 0;
    volumeTrend = delta > 0.08 ? "up" : delta < -0.08 ? "down" : "stable";
  }
  let sessionsTrend: SessionSummaryStats["sessionsTrend"] = "insufficient";
  if (prior.length >= 2) {
    sessionsTrend = recent.length > prior.length + 1 ? "up" : recent.length < prior.length - 1 ? "down" : "stable";
  }

  return {
    totalWorkouts: workouts.length,
    totalSets,
    totalVolumeKg: Math.round(totalVolumeKg),
    totalDurationMin: Math.round(totalDurationSec / 60),
    avgDurationMin: Math.round(totalDurationSec / n / 60),
    avgSets: Math.round((totalSets / n) * 10) / 10,
    avgVolumeKg: Math.round(totalVolumeKg / n),
    avgExercises: Math.round((workouts.reduce((s, w) => s + (w.exerciseCount ?? 0), 0) / n) * 10) / 10,
    volumeTrend,
    sessionsTrend,
  };
}

function computeLaggingMuscles(workouts: SavedWorkoutData[], profile: UserPsychProfile, library: ExerciseWithTaxonomy[]): LaggingMuscleItem[] {
  if (workouts.length < 3) return [];
  const msPerDay = 86400000;
  const today = new Date();
  const todayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const recent = workouts.filter(w => todayMs - wkToMs(w) <= 29 * msPerDay);

  const goalBucket = getGoalBucket(profile.primaryGoal);
  const MEV: Record<string, number> = goalBucket === "strength"
    ? { Chest: 6, Back: 8, Shoulders: 6, Biceps: 4, Triceps: 4, Quads: 6, Hamstrings: 4, Glutes: 4, Calves: 4, Core: 4 }
    : goalBucket === "endurance" || goalBucket === "fat"
    ? { Chest: 4, Back: 6, Shoulders: 4, Biceps: 2, Triceps: 2, Quads: 6, Hamstrings: 4, Glutes: 4, Calves: 6, Core: 6 }
    : { Chest: 8, Back: 10, Shoulders: 8, Biceps: 6, Triceps: 6, Quads: 8, Hamstrings: 6, Glutes: 6, Calves: 6, Core: 8 };

  const directSets: Record<string, number> = {};
  const lastTrained: Record<string, number> = {};
  const sessionsByMuscle: Record<string, number> = {};

  for (const w of recent) {
    const wMs = wkToMs(w);
    for (const ex of w.exercises) {
      const canonical = getCanonicalMuscle(ex.primaryMuscle);
      if (!canonical || canonical === "Other") continue;
      directSets[canonical] = (directSets[canonical] ?? 0) + (ex.loggedSets ?? 0);
      sessionsByMuscle[canonical] = (sessionsByMuscle[canonical] ?? 0) + 1;
      if (!lastTrained[canonical] || wMs > lastTrained[canonical]) lastTrained[canonical] = wMs;
    }
  }

  const lagging: LaggingMuscleItem[] = [];
  for (const muscle of HEATMAP_MUSCLES) {
    const mevPerWeek = MEV[muscle] ?? 6;
    const target30d = mevPerWeek * 4;
    const actual = directSets[muscle] ?? 0;
    const lastMs = lastTrained[muscle];
    const lastDays = lastMs != null ? Math.round((todayMs - lastMs) / msPerDay) : null;

    let reason: LaggingMuscleItem["reason"] | null = null;
    if (!lastMs || (lastDays !== null && lastDays > 14)) reason = "absent";
    else if (actual < target30d * 0.5) reason = "low_volume";
    else if (actual < target30d * 0.7 && (sessionsByMuscle[muscle] ?? 0) <= 2) reason = "low_frequency";
    if (!reason) continue;

    const suggested = library
      .filter(ex => getCanonicalMuscle(ex.primaryMuscle) === muscle && ex.exerciseType !== "freestyle_cardio")
      .slice(0, 3).map(ex => ex.name);

    lagging.push({ muscle, directSets30d: actual, minEffectiveVolume: target30d, lastTrainedDaysAgo: lastDays, reason, suggestedExercises: suggested });
  }

  const order = { absent: 0, low_volume: 1, low_frequency: 2 } as const;
  return lagging.sort((a, b) => order[a.reason] - order[b.reason]);
}

function computeExerciseProgress(workouts: SavedWorkoutData[]): ExerciseProgressItem[] {
  if (workouts.length < 2) return [];
  const byEx = new Map<string, { name: string; muscle: string; sessions: { wt: number; reps: number; vol: number }[][] }>();

  for (const w of [...workouts].reverse()) {
    for (const ex of w.exercises) {
      if (!ex.sets || ex.sets.length === 0) continue;
      const valid = ex.sets.filter(s => s.weight > 0 && s.reps > 0);
      if (valid.length === 0) continue;
      if (!byEx.has(ex.id)) byEx.set(ex.id, { name: ex.name, muscle: ex.primaryMuscle, sessions: [] });
      byEx.get(ex.id)!.sessions.push(valid.map(s => ({ wt: s.weight, reps: s.reps, vol: s.weight * s.reps })));
    }
  }

  const e1rm = (wt: number, reps: number) => wt * (1 + reps / 30);
  const bestE1rm = (sets: { wt: number; reps: number }[]) => Math.max(...sets.map(s => e1rm(s.wt, s.reps)));

  const results: ExerciseProgressItem[] = [];
  for (const [id, data] of byEx) {
    if (data.sessions.length < 2) continue;
    const allSets = data.sessions.flat();
    const bestAll = allSets.reduce((b, s) => e1rm(s.wt, s.reps) > e1rm(b.wt, b.reps) ? s : b, allSets[0]);
    const recentSess = data.sessions.slice(-3);
    const recentSets = recentSess.flat();
    const recentBest = recentSets.reduce((b, s) => e1rm(s.wt, s.reps) > e1rm(b.wt, b.reps) ? s : b, recentSets[0]);

    const oldVol = data.sessions.slice(-6, -3).flat().reduce((s, x) => s + x.vol, 0);
    const newVol = recentSess.flat().reduce((s, x) => s + x.vol, 0);
    let volumeTrend: ExerciseProgressItem["volumeTrend"] = "stable";
    if (data.sessions.length >= 6) {
      const delta = oldVol > 0 ? (newVol - oldVol) / oldVol : 0;
      volumeTrend = delta > 0.08 ? "up" : delta < -0.08 ? "down" : "stable";
    }

    const recentE1 = bestE1rm(recentBest ? [recentBest] : []);
    const allE1 = bestE1rm(bestAll ? [bestAll] : []);
    let status: ExerciseProgressItem["status"] = "insufficient_data";
    if (data.sessions.length >= 3) {
      if (recentE1 >= allE1 * 0.98 && volumeTrend !== "down") status = "improving";
      else if (recentE1 >= allE1 * 0.93 && volumeTrend !== "down") status = "stable";
      else if (data.sessions.length <= 5 && volumeTrend !== "down") status = "building";
      else if (volumeTrend === "down" && recentE1 < allE1 * 0.9) status = "regressing";
      else status = "stalled";
    }

    const confidence: InsightConfidence = data.sessions.length >= 8 ? "high" : data.sessions.length >= 4 ? "medium" : "low";
    results.push({
      exerciseId: id, name: data.name, primaryMuscle: data.muscle, status,
      sessionsCount: data.sessions.length,
      bestSetEver: bestAll ? { weight: bestAll.wt, reps: bestAll.reps } : null,
      recentBestSet: recentBest ? { weight: recentBest.wt, reps: recentBest.reps } : null,
      volumeTrend, confidence,
    });
  }

  const ord = { improving: 0, stable: 1, building: 2, stalled: 3, regressing: 4, insufficient_data: 5 };
  return results.sort((a, b) => ord[a.status] - ord[b.status]).slice(0, 25);
}

function computePlateauExercises(workouts: SavedWorkoutData[]): PlateauItem[] {
  if (workouts.length < 4) return [];
  const byEx = new Map<string, { name: string; sessions: { e1rm: number; vol: number }[] }>();

  for (const w of [...workouts].reverse()) {
    for (const ex of w.exercises) {
      if (!ex.sets) continue;
      const valid = ex.sets.filter(s => s.weight > 0 && s.reps > 0);
      if (!valid.length) continue;
      const bestE1rm = Math.max(...valid.map(s => s.weight * (1 + s.reps / 30)));
      const vol = valid.reduce((s, x) => s + x.weight * x.reps, 0);
      if (!byEx.has(ex.id)) byEx.set(ex.id, { name: ex.name, sessions: [] });
      byEx.get(ex.id)!.sessions.push({ e1rm: bestE1rm, vol });
    }
  }

  const plateaus: PlateauItem[] = [];
  for (const [id, data] of byEx) {
    if (data.sessions.length < 5) continue;
    const recent4 = data.sessions.slice(-4);
    const older = data.sessions.slice(-8, -4);
    if (older.length < 2) continue;

    const maxRecent = Math.max(...recent4.map(s => s.e1rm));
    const minRecent = Math.min(...recent4.map(s => s.e1rm));
    if (maxRecent === 0 || (maxRecent - minRecent) / maxRecent > 0.15) continue; // too noisy

    const maxOlder = Math.max(...older.map(s => s.e1rm));
    if (maxOlder === 0) continue;
    if ((maxRecent - maxOlder) / maxOlder > 0.03) continue; // improving

    const recentVol = recent4.reduce((s, x) => s + x.vol, 0) / recent4.length;
    const olderVol = older.reduce((s, x) => s + x.vol, 0) / older.length;
    const volDelta = olderVol > 0 ? (recentVol - olderVol) / olderVol : 0;

    let cause: PlateauItem["cause"] = "weight_stuck";
    let action: string;
    if (volDelta < -0.1) {
      cause = "volume_stuck";
      action = "Add 1 set per session for 2 weeks before increasing load.";
    } else {
      cause = "reps_stuck";
      action = "Build reps at current weight — hit the top of your rep range before adding load.";
    }

    plateaus.push({
      exerciseId: id, name: data.name, sessionsAnalyzed: data.sessions.length,
      confidence: data.sessions.length >= 8 ? "high" : "medium",
      cause, action,
    });
  }
  return plateaus.slice(0, 5);
}

function computeExerciseRotation(workouts: SavedWorkoutData[]): RotationItem[] {
  if (workouts.length < 4) return [];
  const today = new Date();
  const todayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const recent = workouts.filter(w => todayMs - wkToMs(w) <= 55 * 86400000);
  if (recent.length < 4) return [];

  const byMuscle = new Map<string, Map<string, { name: string; count: number }>>();
  for (const w of recent) {
    for (const ex of w.exercises) {
      const canonical = getCanonicalMuscle(ex.primaryMuscle);
      if (!canonical || canonical === "Other") continue;
      if (!byMuscle.has(canonical)) byMuscle.set(canonical, new Map());
      const mm = byMuscle.get(canonical)!;
      if (!mm.has(ex.id)) mm.set(ex.id, { name: ex.name, count: 0 });
      mm.get(ex.id)!.count++;
    }
  }

  const results: RotationItem[] = [];
  for (const [muscle, mm] of byMuscle) {
    if (mm.size < 2) continue;
    const sorted = [...mm.values()].sort((a, b) => b.count - a.count);
    const total = sorted.reduce((s, e) => s + e.count, 0);
    const anchor = sorted[0];
    const anchorPct = anchor.count / total;

    let rotationLevel: RotationItem["rotationLevel"];
    let warning: string | undefined, recommendation: string | undefined;
    if (mm.size >= 4 && anchorPct < 0.4) {
      rotationLevel = "high";
      warning = `${mm.size} different ${muscle} exercises in 8 weeks — hard to track progress.`;
      recommendation = `Keep ${anchor.name} as your anchor lift. Rotate accessories, not your main movement.`;
    } else if (mm.size >= 3 && anchorPct < 0.55) {
      rotationLevel = "acceptable";
      recommendation = `${anchor.name} is appearing most — keep it in every session.`;
    } else {
      rotationLevel = "well_standardized";
    }
    results.push({ muscle, variantsUsed: mm.size, variantNames: sorted.map(e => e.name), anchorExercise: anchor.name, rotationLevel, warning, recommendation });
  }
  return results.filter(r => r.rotationLevel !== "well_standardized").slice(0, 6);
}

function computeGoalAlignment(workouts: SavedWorkoutData[], profile: UserPsychProfile): GoalAlignmentResult {
  if (workouts.length < 3) return { score: 0, label: "misaligned", mismatches: ["Not enough data yet"], suggestions: ["Complete at least 3 workouts to see goal alignment"] };
  const today = new Date();
  const todayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const recent = workouts.filter(w => todayMs - wkToMs(w) <= 27 * 86400000);
  if (recent.length < 2) return { score: 50, label: "partially_aligned", mismatches: ["Need more recent sessions"], suggestions: ["Keep training — more sessions give better insights"] };

  const goalBucket = getGoalBucket(profile.primaryGoal);
  const mismatches: string[] = [], suggestions: string[] = [];
  let score = 100;

  let totalSets = 0, totalReps = 0;
  for (const w of recent) {
    for (const ex of w.exercises) {
      for (const s of (ex.sets ?? [])) {
        if (s.reps > 0) { totalReps += s.reps; totalSets++; }
      }
    }
  }
  const avgReps = totalSets > 0 ? totalReps / totalSets : 0;
  const targetPerWeek = getSafeTargetPerWeek(profile.scheduleCommitment, profile.daysPerWeekPref);
  const actualPerWeek = recent.length / 4;

  if (goalBucket === "muscle") {
    if (avgReps > 0 && (avgReps < 6 || avgReps > 20)) {
      score -= 15;
      mismatches.push(`Avg ${Math.round(avgReps)} reps/set — hypertrophy range is 8–15`);
      suggestions.push("Aim for 8–12 reps on most sets for muscle growth.");
    }
    if (actualPerWeek < targetPerWeek * 0.65) {
      score -= 20;
      mismatches.push(`Training ~${Math.round(actualPerWeek * 10) / 10}×/week vs goal of ${targetPerWeek}×`);
      suggestions.push(`Add ${Math.ceil(targetPerWeek - actualPerWeek)} more sessions per week.`);
    }
    const weeklySets = recent.reduce((s, w) => s + (w.totalSets ?? 0), 0) / 4;
    if (weeklySets > 0 && weeklySets < 15) {
      score -= 15;
      mismatches.push(`Only ~${Math.round(weeklySets)} sets/week — muscle growth needs more volume`);
      suggestions.push("Aim for 15–25 sets per session or train more frequently.");
    }
  } else if (goalBucket === "strength") {
    if (avgReps > 8) {
      score -= 15;
      mismatches.push(`Avg ${Math.round(avgReps)} reps/set — strength responds best to 3–6 reps`);
      suggestions.push("Work heavier at 3–6 reps on your compound lifts.");
    }
    if (actualPerWeek < 2) {
      score -= 20;
      mismatches.push("Strength needs at least 2–3 sessions/week on main lifts");
      suggestions.push("Add a second dedicated strength session.");
    }
  } else if (goalBucket === "endurance" || goalBucket === "fat") {
    if (actualPerWeek < targetPerWeek * 0.7) {
      score -= 25;
      mismatches.push(`Training ~${Math.round(actualPerWeek * 10) / 10}×/week — your goal needs frequent sessions`);
      suggestions.push(`Aim for ${targetPerWeek}+ sessions per week.`);
    }
    if (avgReps > 0 && avgReps < 12) {
      score -= 10;
      mismatches.push(`Low rep ranges (avg ${Math.round(avgReps)}) — higher reps build endurance capacity`);
      suggestions.push("Use 12–20 rep ranges with shorter rest intervals.");
    }
  } else {
    if (actualPerWeek < 2) {
      score -= 20;
      mismatches.push("Very low frequency for general fitness");
      suggestions.push("Aim for 3 sessions per week.");
    }
  }

  score = Math.max(0, Math.min(100, score));
  const label: GoalAlignmentResult["label"] = score >= 75 ? "aligned" : score >= 45 ? "partially_aligned" : "misaligned";
  return { score, label, mismatches, suggestions };
}

function computeMovementBalance(workouts: SavedWorkoutData[], library: ExerciseWithTaxonomy[]): MovementBalanceResult {
  const today = new Date();
  const todayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const recent = workouts.filter(w => todayMs - wkToMs(w) <= 27 * 86400000);

  const patternLookup = new Map<string, MovementPattern>();
  for (const ex of library) { if (ex.movementPattern) patternLookup.set(ex.id, ex.movementPattern); }

  const byPattern: Record<string, { sets: number; volume: number }> = {};
  for (const w of recent) {
    for (const ex of w.exercises) {
      const pat = patternLookup.get(ex.id);
      if (!pat || pat === "cardio") continue;
      if (!byPattern[pat]) byPattern[pat] = { sets: 0, volume: 0 };
      byPattern[pat].sets += ex.loggedSets ?? 0;
      byPattern[pat].volume += ex.loggedVolume ?? 0;
    }
  }

  const g = (p: string) => byPattern[p]?.sets ?? 0;
  const pushSets = g("horizontal_push") + g("vertical_push") + g("isolation_push");
  const pullSets = g("horizontal_pull") + g("vertical_pull") + g("isolation_pull");
  const squatSets = g("squat") + g("lunge");
  const hingeSets = g("hip_hinge");
  const upperSets = pushSets + pullSets;
  const lowerSets = squatSets + hingeSets + g("isolation_legs");

  const imbalances: string[] = [];
  if (pushSets > 0 && pullSets === 0) imbalances.push("No pulling movements — add rows or pull-ups");
  else if (pullSets > 0 && pushSets === 0) imbalances.push("No pushing movements — add press work");
  else if (pushSets > 0 && pullSets > 0 && pushSets / pullSets > 1.6) imbalances.push("Push-heavy — add more rows/pull-ups to balance");
  if (squatSets > 0 && hingeSets === 0) imbalances.push("No hip hinge work — add deadlifts or RDLs");
  if (hingeSets > 0 && squatSets === 0) imbalances.push("No squat pattern — add squats or leg press");
  if (upperSets > 0 && lowerSets === 0) imbalances.push("No lower body work this month");
  if (lowerSets > 0 && upperSets === 0) imbalances.push("No upper body work this month");

  return { byPattern, pushSets, pullSets, squatSets, hingeSets, upperSets, lowerSets, imbalances };
}

function computePRsHistory(workouts: SavedWorkoutData[]): PREntry[] {
  const prs: PREntry[] = [];
  for (const w of workouts) {
    for (const r of (w.rewards ?? [])) {
      if (r.category === "pr" && r.detail) {
        prs.push({
          exerciseName: r.detail.split(":")[0]?.trim() ?? r.detail,
          prType: r.shortLabel === "Max Wt" ? "weight" : r.shortLabel === "Rep PR" ? "reps" : "estimated_1rm",
          detail: r.detail,
          date: w.date ?? w.savedAt,
        });
      }
    }
  }
  const seen = new Set<string>();
  return prs.filter(p => { const k = `${p.exerciseName}:${p.prType}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 20);
}

function computeActionPlan(
  lagging: LaggingMuscleItem[],
  plateaus: PlateauItem[],
  rotations: RotationItem[],
  goalAlignment: GoalAlignmentResult,
  consistency: ConsistencyStats,
  targetPerWeek: number,
): ActionItem[] {
  const actions: ActionItem[] = [];
  if (consistency.lastGapDays > 7) {
    actions.push({ id: "gap", priority: 1, title: "Get back on track", detail: `${consistency.lastGapDays} days since your last session. Start lighter today.`, linkedType: "consistency" });
  } else if (consistency.consistencyPct < 60) {
    actions.push({ id: "freq", priority: 1, title: "Train more consistently", detail: `You're hitting ${consistency.consistencyPct}% of your ${targetPerWeek}×/week target.`, linkedType: "consistency" });
  }
  for (const m of lagging.slice(0, 2)) {
    const sug = m.suggestedExercises.slice(0, 2).join(", ");
    actions.push({
      id: `lag-${m.muscle}`, priority: 2,
      title: `Bring up ${m.muscle}`,
      detail: m.reason === "absent"
        ? `Not trained in ${m.lastTrainedDaysAgo ?? "many"} days.${sug ? ` Try: ${sug}.` : ""}`
        : `Only ${m.directSets30d} sets this month (target: ${m.minEffectiveVolume}).${sug ? ` Try: ${sug}.` : ""}`,
      linkedType: "lagging_muscle",
    });
  }
  for (const p of plateaus.slice(0, 1)) {
    actions.push({ id: `plat-${p.exerciseId}`, priority: 3, title: `Unstick ${p.name}`, detail: p.action, linkedType: "plateau" });
  }
  for (const r of rotations.filter(x => x.rotationLevel === "high").slice(0, 1)) {
    actions.push({ id: `rot-${r.muscle}`, priority: 4, title: `Standardize ${r.muscle}`, detail: r.recommendation ?? `Too many variants — pick one anchor movement.`, linkedType: "rotation" });
  }
  if (actions.length < 5 && goalAlignment.suggestions.length > 0) {
    actions.push({ id: "goal-0", priority: 5, title: "Goal alignment", detail: goalAlignment.suggestions[0], linkedType: "goal_alignment" });
  }
  return actions.slice(0, 5);
}

// ── End Insights V1 Engine ────────────────────────────────────────────────────

function getRelativeDate(dateStr: string): string {
  const today = new Date();
  const todayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, mo, d] = dateStr.slice(0, 10).split("-").map(Number);
  const diff = Math.round((todayMs - Date.UTC(y, mo - 1, d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  if (diff < 14) return "Last week";
  return `${Math.round(diff / 7)} weeks ago`;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ── Seed demo data (6-week hypertrophy history) ──────────────────────────────
function buildSeedWorkouts(): SavedWorkoutData[] {
  // Local noon on a given date → ISO string
  const D = (y: number, m: number, d: number) =>
    new Date(y, m - 1, d, 12, 0, 0).toISOString();

  const ex = (
    id: string,
    name: string,
    primaryMuscle: string,
    sets: { weight: number; reps: number; rpe: number | null }[]
  ): FinishedExerciseSummary => ({
    id,
    name,
    primaryMuscle,
    loggedSets: sets.length,
    loggedVolume: sets.reduce((s, t) => s + t.weight * t.reps, 0),
    sets: sets.map(s => ({ ...s, setType: "normal" as const })),
  });

  const mk = (
    date: string,
    sessionName: string,
    note: string,
    duration: string,
    durationSeconds: number,
    exercises: FinishedExerciseSummary[],
    takeawayTitle: string,
    workoutSource: SavedWorkoutData["workoutSource"] = "saved"
  ): SavedWorkoutData => ({
    sessionName, note,
    date: date.slice(0, 10),
    duration, durationSeconds,
    totalVolume: exercises.reduce((s, e) => s + e.loggedVolume, 0),
    totalSets: exercises.reduce((s, e) => s + e.loggedSets, 0),
    exerciseCount: exercises.length,
    loggedExerciseCount: exercises.length,
    ignoredIncompleteSets: 0,
    exercises,
    rewards: [],
    rewardSummary: { set: 0, exercise: 0, session: 0, total: 0 },
    takeawayTitle, takeawayBody: "", images: [],
    savedAt: date,
    workoutSource,
  });

  return [
    // ── Week 1 (Mar 3–8) ───────────────────────────────────────────────────
    mk(D(2026,3,3), "Push A", "Good energy today.", "58 min", 3480, [
      ex("bench-press",            "Bench Press",            "Chest",      [{weight:80,reps:8,rpe:7},{weight:80,reps:8,rpe:7.5},{weight:80,reps:7,rpe:8},{weight:77.5,reps:7,rpe:8.5}]),
      ex("incline-dumbbell-press", "Incline Dumbbell Press", "Upper Chest",[{weight:28,reps:10,rpe:7},{weight:28,reps:10,rpe:7.5},{weight:28,reps:9,rpe:8}]),
      ex("overhead-press",         "Overhead Press",         "Shoulders",  [{weight:55,reps:8,rpe:7},{weight:55,reps:8,rpe:7.5},{weight:55,reps:7,rpe:8}]),
      ex("lateral-raise",          "Lateral Raise",          "Side Delts", [{weight:10,reps:15,rpe:6},{weight:10,reps:15,rpe:6},{weight:10,reps:14,rpe:7}]),
      ex("tricep-pushdown",        "Tricep Pushdown",        "Triceps",    [{weight:45,reps:12,rpe:7},{weight:45,reps:12,rpe:7},{weight:45,reps:11,rpe:7.5}]),
      ex("skull-crushers",         "Skull Crushers",         "Triceps",    [{weight:30,reps:10,rpe:7},{weight:30,reps:10,rpe:7.5},{weight:30,reps:9,rpe:8}]),
    ], "Solid push to kick off the week."),

    mk(D(2026,3,5), "Pull A", "", "54 min", 3240, [
      ex("lat-pulldown",  "Lat Pulldown",     "Lats",      [{weight:70,reps:10,rpe:7},{weight:70,reps:10,rpe:7},{weight:70,reps:9,rpe:7.5},{weight:70,reps:9,rpe:8}]),
      ex("seated-row",    "Seated Cable Row", "Back",      [{weight:65,reps:10,rpe:7},{weight:65,reps:10,rpe:7.5},{weight:65,reps:9,rpe:8}]),
      ex("face-pulls",    "Face Pulls",       "Rear Delts",[{weight:20,reps:15,rpe:6},{weight:20,reps:15,rpe:6},{weight:20,reps:15,rpe:6.5}]),
      ex("barbell-curl",  "Barbell Curl",     "Biceps",    [{weight:40,reps:10,rpe:7},{weight:40,reps:10,rpe:7.5},{weight:40,reps:9,rpe:8}]),
      ex("hammer-curl",   "Hammer Curl",      "Biceps",    [{weight:20,reps:12,rpe:6},{weight:20,reps:12,rpe:7},{weight:20,reps:11,rpe:7.5}]),
    ], "Back feels well-worked."),

    mk(D(2026,3,8), "Legs A", "Legs day — going heavy.", "65 min", 3900, [
      ex("barbell-squat",     "Barbell Squat",       "Quads",      [{weight:80,reps:8,rpe:7},{weight:80,reps:8,rpe:7.5},{weight:80,reps:7,rpe:8},{weight:77.5,reps:7,rpe:8.5}]),
      ex("romanian-deadlift", "Romanian Deadlift",   "Hamstrings", [{weight:70,reps:10,rpe:7},{weight:70,reps:10,rpe:7.5},{weight:70,reps:9,rpe:8}]),
      ex("leg-press",         "Leg Press",           "Quads",      [{weight:120,reps:12,rpe:7},{weight:120,reps:12,rpe:7.5},{weight:120,reps:11,rpe:8}]),
      ex("leg-extension",     "Leg Extension",       "Quads",      [{weight:50,reps:15,rpe:7},{weight:50,reps:15,rpe:7},{weight:50,reps:13,rpe:7.5}]),
      ex("calf-raise",        "Standing Calf Raise", "Calves",     [{weight:40,reps:20,rpe:6},{weight:40,reps:20,rpe:6},{weight:40,reps:18,rpe:7}]),
    ], "Legs are always humbling."),

    // ── Week 2 (Mar 10–16) ────────────────────────────────────────────────
    mk(D(2026,3,10), "Push A", "+2.5 kg on bench today.", "60 min", 3600, [
      ex("bench-press",            "Bench Press",            "Chest",      [{weight:82.5,reps:8,rpe:7},{weight:82.5,reps:8,rpe:7.5},{weight:82.5,reps:7,rpe:8},{weight:80,reps:7,rpe:8.5}]),
      ex("incline-dumbbell-press", "Incline Dumbbell Press", "Upper Chest",[{weight:30,reps:10,rpe:7},{weight:30,reps:10,rpe:7.5},{weight:30,reps:9,rpe:8}]),
      ex("overhead-press",         "Overhead Press",         "Shoulders",  [{weight:57.5,reps:8,rpe:7},{weight:57.5,reps:8,rpe:7.5},{weight:57.5,reps:7,rpe:8}]),
      ex("lateral-raise",          "Lateral Raise",          "Side Delts", [{weight:10,reps:15,rpe:6},{weight:10,reps:15,rpe:6.5},{weight:10,reps:14,rpe:7}]),
      ex("tricep-pushdown",        "Tricep Pushdown",        "Triceps",    [{weight:47.5,reps:12,rpe:7},{weight:47.5,reps:12,rpe:7},{weight:47.5,reps:11,rpe:7.5}]),
      ex("skull-crushers",         "Skull Crushers",         "Triceps",    [{weight:30,reps:10,rpe:7},{weight:30,reps:10,rpe:7.5},{weight:30,reps:9,rpe:8}]),
    ], "Bench PR. OHP still fighting for a rep."),

    mk(D(2026,3,12), "Pull B", "", "52 min", 3120, [
      ex("lat-pulldown",  "Lat Pulldown",  "Lats",      [{weight:72.5,reps:10,rpe:7},{weight:72.5,reps:10,rpe:7},{weight:72.5,reps:9,rpe:7.5},{weight:72.5,reps:9,rpe:8}]),
      ex("cable-row",     "Cable Row",     "Back",      [{weight:67.5,reps:10,rpe:7},{weight:67.5,reps:10,rpe:7.5},{weight:67.5,reps:9,rpe:8}]),
      ex("rear-delt-fly", "Rear Delt Fly", "Rear Delts",[{weight:15,reps:15,rpe:6},{weight:15,reps:15,rpe:6.5},{weight:15,reps:14,rpe:7}]),
      ex("barbell-curl",  "Barbell Curl",  "Biceps",    [{weight:42.5,reps:10,rpe:7},{weight:42.5,reps:10,rpe:7.5},{weight:42.5,reps:9,rpe:8}]),
      ex("preacher-curl", "Preacher Curl", "Biceps",    [{weight:30,reps:10,rpe:7},{weight:30,reps:10,rpe:7.5},{weight:30,reps:9,rpe:8}]),
    ], "Pull feeling solid."),

    mk(D(2026,3,14), "Legs B", "", "62 min", 3720, [
      ex("barbell-squat", "Barbell Squat",       "Quads",      [{weight:82.5,reps:8,rpe:7},{weight:82.5,reps:8,rpe:7.5},{weight:82.5,reps:7,rpe:8},{weight:80,reps:7,rpe:8.5}]),
      ex("leg-press",     "Leg Press",           "Quads",      [{weight:125,reps:12,rpe:7},{weight:125,reps:12,rpe:7.5},{weight:125,reps:11,rpe:8}]),
      ex("leg-curl",      "Leg Curl",            "Hamstrings", [{weight:40,reps:12,rpe:7},{weight:40,reps:12,rpe:7.5},{weight:40,reps:11,rpe:8}]),
      ex("leg-extension", "Leg Extension",       "Quads",      [{weight:50,reps:15,rpe:7},{weight:50,reps:15,rpe:7.5},{weight:50,reps:13,rpe:8}]),
      ex("calf-raise",    "Standing Calf Raise", "Calves",     [{weight:42.5,reps:20,rpe:6},{weight:42.5,reps:20,rpe:6.5},{weight:42.5,reps:18,rpe:7}]),
    ], "Squat +2.5 kg. Legs programme is inconsistent."),

    mk(D(2026,3,16), "Upper", "Light upper day.", "50 min", 3000, [
      ex("bench-press",    "Bench Press",    "Chest",     [{weight:82.5,reps:8,rpe:7},{weight:82.5,reps:8,rpe:7.5},{weight:82.5,reps:7,rpe:8},{weight:80,reps:7,rpe:8.5}]),
      ex("lat-pulldown",   "Lat Pulldown",   "Lats",      [{weight:72.5,reps:10,rpe:7},{weight:72.5,reps:10,rpe:7.5},{weight:72.5,reps:9,rpe:8}]),
      ex("overhead-press", "Overhead Press", "Shoulders", [{weight:57.5,reps:8,rpe:7},{weight:57.5,reps:8,rpe:7.5},{weight:57.5,reps:7,rpe:8}]),
      ex("barbell-curl",   "Barbell Curl",   "Biceps",    [{weight:42.5,reps:10,rpe:7},{weight:42.5,reps:10,rpe:7.5},{weight:42.5,reps:9,rpe:8}]),
      ex("tricep-pushdown","Tricep Pushdown","Triceps",   [{weight:47.5,reps:12,rpe:7},{weight:47.5,reps:12,rpe:7.5},{weight:47.5,reps:11,rpe:8}]),
    ], "Quick full-body touch-up."),

    // ── Week 3 (Mar 17–23) ────────────────────────────────────────────────
    mk(D(2026,3,17), "Push A", "Hit 85 kg on bench!", "61 min", 3660, [
      ex("bench-press",            "Bench Press",            "Chest",      [{weight:85,reps:8,rpe:7},{weight:85,reps:8,rpe:7.5},{weight:85,reps:7,rpe:8},{weight:82.5,reps:7,rpe:8.5}]),
      ex("incline-dumbbell-press", "Incline Dumbbell Press", "Upper Chest",[{weight:30,reps:10,rpe:7},{weight:30,reps:10,rpe:7.5},{weight:30,reps:9,rpe:8}]),
      ex("overhead-press",         "Overhead Press",         "Shoulders",  [{weight:60,reps:8,rpe:7},{weight:60,reps:8,rpe:7.5},{weight:60,reps:7,rpe:8}]),
      ex("lateral-raise",          "Lateral Raise",          "Side Delts", [{weight:12,reps:15,rpe:7},{weight:12,reps:15,rpe:7},{weight:12,reps:13,rpe:7.5}]),
      ex("tricep-pushdown",        "Tricep Pushdown",        "Triceps",    [{weight:50,reps:12,rpe:7},{weight:50,reps:12,rpe:7.5},{weight:50,reps:11,rpe:8}]),
      ex("skull-crushers",         "Skull Crushers",         "Triceps",    [{weight:32.5,reps:10,rpe:7},{weight:32.5,reps:10,rpe:7.5},{weight:32.5,reps:9,rpe:8}]),
    ], "Bench milestone. OHP finally moved up."),

    mk(D(2026,3,19), "Pull A", "", "55 min", 3300, [
      ex("lat-pulldown",  "Lat Pulldown",     "Lats",      [{weight:75,reps:10,rpe:7},{weight:75,reps:10,rpe:7},{weight:75,reps:9,rpe:7.5},{weight:75,reps:9,rpe:8}]),
      ex("seated-row",    "Seated Cable Row", "Back",      [{weight:70,reps:10,rpe:7},{weight:70,reps:10,rpe:7.5},{weight:70,reps:9,rpe:8}]),
      ex("face-pulls",    "Face Pulls",       "Rear Delts",[{weight:20,reps:15,rpe:6},{weight:20,reps:15,rpe:6.5},{weight:20,reps:15,rpe:7}]),
      ex("barbell-curl",  "Barbell Curl",     "Biceps",    [{weight:42.5,reps:10,rpe:7},{weight:42.5,reps:10,rpe:7.5},{weight:42.5,reps:9,rpe:8}]),
      ex("hammer-curl",   "Hammer Curl",      "Biceps",    [{weight:22,reps:12,rpe:7},{weight:22,reps:12,rpe:7.5},{weight:22,reps:11,rpe:8}]),
    ], "Back volume building well."),

    mk(D(2026,3,21), "Legs A", "", "67 min", 4020, [
      ex("barbell-squat",     "Barbell Squat",       "Quads",      [{weight:85,reps:8,rpe:7},{weight:85,reps:8,rpe:7.5},{weight:85,reps:7,rpe:8},{weight:82.5,reps:7,rpe:8.5}]),
      ex("romanian-deadlift", "Romanian Deadlift",   "Hamstrings", [{weight:75,reps:10,rpe:7},{weight:75,reps:10,rpe:7.5},{weight:75,reps:9,rpe:8}]),
      ex("leg-press",         "Leg Press",           "Quads",      [{weight:125,reps:12,rpe:7},{weight:125,reps:12,rpe:7.5},{weight:125,reps:11,rpe:8}]),
      ex("leg-extension",     "Leg Extension",       "Quads",      [{weight:52.5,reps:15,rpe:7},{weight:52.5,reps:15,rpe:7.5},{weight:52.5,reps:13,rpe:8}]),
      ex("calf-raise",        "Standing Calf Raise", "Calves",     [{weight:42.5,reps:20,rpe:6},{weight:42.5,reps:20,rpe:6.5},{weight:42.5,reps:18,rpe:7}]),
    ], "Squat 85 kg for reps. Last legs day for a while..."),

    mk(D(2026,3,23), "Push B", "Chest volume day.", "56 min", 3360, [
      ex("incline-bench-press","Incline Bench Press","Upper Chest",[{weight:70,reps:10,rpe:7},{weight:70,reps:10,rpe:7.5},{weight:70,reps:9,rpe:8},{weight:67.5,reps:9,rpe:8.5}]),
      ex("cable-fly",          "Cable Fly",          "Chest",      [{weight:20,reps:12,rpe:7},{weight:20,reps:12,rpe:7.5},{weight:20,reps:11,rpe:8}]),
      ex("overhead-press",     "Overhead Press",     "Shoulders",  [{weight:60,reps:8,rpe:7},{weight:60,reps:8,rpe:7.5},{weight:60,reps:7,rpe:8}]),
      ex("lateral-raise",      "Lateral Raise",      "Side Delts", [{weight:12,reps:15,rpe:7},{weight:12,reps:15,rpe:7},{weight:12,reps:13,rpe:7.5}]),
      ex("tricep-pushdown",    "Tricep Pushdown",    "Triceps",    [{weight:50,reps:12,rpe:7},{weight:50,reps:12,rpe:7.5},{weight:50,reps:11,rpe:8}]),
    ], "Volume chest day felt great."),

    // ── Week 4 (Mar 24–29) ────────────────────────────────────────────────
    mk(D(2026,3,24), "Push A", "OHP stuck at 60 again.", "59 min", 3540, [
      ex("bench-press",            "Bench Press",            "Chest",      [{weight:85,reps:8,rpe:7},{weight:85,reps:8,rpe:7.5},{weight:85,reps:7,rpe:8},{weight:82.5,reps:7,rpe:8.5}]),
      ex("incline-dumbbell-press", "Incline Dumbbell Press", "Upper Chest",[{weight:32,reps:10,rpe:7},{weight:32,reps:10,rpe:7.5},{weight:32,reps:9,rpe:8}]),
      ex("overhead-press",         "Overhead Press",         "Shoulders",  [{weight:60,reps:8,rpe:7},{weight:60,reps:7,rpe:8},{weight:60,reps:7,rpe:8.5}]),
      ex("lateral-raise",          "Lateral Raise",          "Side Delts", [{weight:12,reps:15,rpe:7},{weight:12,reps:15,rpe:7},{weight:12,reps:13,rpe:7.5}]),
      ex("tricep-pushdown",        "Tricep Pushdown",        "Triceps",    [{weight:52.5,reps:12,rpe:7},{weight:52.5,reps:12,rpe:7.5},{weight:52.5,reps:11,rpe:8}]),
      ex("skull-crushers",         "Skull Crushers",         "Triceps",    [{weight:32.5,reps:10,rpe:7},{weight:32.5,reps:10,rpe:7.5},{weight:32.5,reps:9,rpe:8}]),
    ], "Chest and tris moving. OHP stalled at 60."),

    mk(D(2026,3,27), "Pull A", "", "54 min", 3240, [
      ex("lat-pulldown",  "Lat Pulldown",     "Lats",      [{weight:77.5,reps:10,rpe:7},{weight:77.5,reps:10,rpe:7},{weight:77.5,reps:9,rpe:7.5},{weight:77.5,reps:9,rpe:8}]),
      ex("seated-row",    "Seated Cable Row", "Back",      [{weight:70,reps:10,rpe:7},{weight:70,reps:10,rpe:7.5},{weight:70,reps:9,rpe:8}]),
      ex("face-pulls",    "Face Pulls",       "Rear Delts",[{weight:22,reps:15,rpe:6},{weight:22,reps:15,rpe:6.5},{weight:22,reps:15,rpe:7}]),
      ex("barbell-curl",  "Barbell Curl",     "Biceps",    [{weight:45,reps:10,rpe:7},{weight:45,reps:10,rpe:7.5},{weight:45,reps:9,rpe:8}]),
      ex("hammer-curl",   "Hammer Curl",      "Biceps",    [{weight:22,reps:12,rpe:7},{weight:22,reps:12,rpe:7.5},{weight:22,reps:11,rpe:8}]),
    ], "Pull numbers continuing to climb."),

    mk(D(2026,3,29), "Upper", "Missed legs this week.", "51 min", 3060, [
      ex("bench-press",    "Bench Press",    "Chest",     [{weight:85,reps:8,rpe:7},{weight:85,reps:8,rpe:7.5},{weight:85,reps:7,rpe:8},{weight:82.5,reps:7,rpe:8.5}]),
      ex("lat-pulldown",   "Lat Pulldown",   "Lats",      [{weight:77.5,reps:10,rpe:7},{weight:77.5,reps:10,rpe:7.5},{weight:77.5,reps:9,rpe:8}]),
      ex("overhead-press", "Overhead Press", "Shoulders", [{weight:60,reps:8,rpe:7},{weight:60,reps:7,rpe:8},{weight:60,reps:7,rpe:8.5}]),
      ex("barbell-curl",   "Barbell Curl",   "Biceps",    [{weight:45,reps:10,rpe:7},{weight:45,reps:10,rpe:7.5},{weight:45,reps:9,rpe:8}]),
      ex("tricep-pushdown","Tricep Pushdown","Triceps",   [{weight:52.5,reps:12,rpe:7},{weight:52.5,reps:12,rpe:7.5},{weight:52.5,reps:11,rpe:8}]),
    ], "Upper work solid. Need to bring legs back."),

    // ── Week 5 (Mar 31–Apr 6) ─────────────────────────────────────────────
    mk(D(2026,3,31), "Push A", "87.5 kg bench — feeling strong!", "62 min", 3720, [
      ex("bench-press",            "Bench Press",            "Chest",      [{weight:87.5,reps:8,rpe:7},{weight:87.5,reps:8,rpe:7.5},{weight:87.5,reps:7,rpe:8},{weight:85,reps:7,rpe:8.5}]),
      ex("incline-dumbbell-press", "Incline Dumbbell Press", "Upper Chest",[{weight:32,reps:10,rpe:7},{weight:32,reps:10,rpe:7.5},{weight:32,reps:9,rpe:8}]),
      ex("overhead-press",         "Overhead Press",         "Shoulders",  [{weight:60,reps:8,rpe:7},{weight:60,reps:7,rpe:8},{weight:60,reps:7,rpe:8.5}]),
      ex("lateral-raise",          "Lateral Raise",          "Side Delts", [{weight:12,reps:15,rpe:7},{weight:12,reps:15,rpe:7},{weight:12,reps:13,rpe:7.5}]),
      ex("tricep-pushdown",        "Tricep Pushdown",        "Triceps",    [{weight:52.5,reps:12,rpe:7},{weight:52.5,reps:12,rpe:7.5},{weight:52.5,reps:11,rpe:8}]),
      ex("skull-crushers",         "Skull Crushers",         "Triceps",    [{weight:32.5,reps:10,rpe:7},{weight:32.5,reps:10,rpe:7.5},{weight:32.5,reps:9,rpe:8}]),
    ], "Bench moving nicely. OHP still stuck at 60 kg."),

    mk(D(2026,4,2), "Pull B", "", "53 min", 3180, [
      ex("lat-pulldown",  "Lat Pulldown",  "Lats",      [{weight:80,reps:10,rpe:7},{weight:80,reps:10,rpe:7},{weight:80,reps:9,rpe:7.5},{weight:80,reps:9,rpe:8}]),
      ex("cable-row",     "Cable Row",     "Back",      [{weight:72.5,reps:10,rpe:7},{weight:72.5,reps:10,rpe:7.5},{weight:72.5,reps:9,rpe:8}]),
      ex("rear-delt-fly", "Rear Delt Fly", "Rear Delts",[{weight:17.5,reps:15,rpe:7},{weight:17.5,reps:15,rpe:7},{weight:17.5,reps:14,rpe:7.5}]),
      ex("barbell-curl",  "Barbell Curl",  "Biceps",    [{weight:47.5,reps:10,rpe:7},{weight:47.5,reps:10,rpe:7.5},{weight:47.5,reps:9,rpe:8}]),
      ex("preacher-curl", "Preacher Curl", "Biceps",    [{weight:32.5,reps:10,rpe:7},{weight:32.5,reps:10,rpe:7.5},{weight:32.5,reps:9,rpe:8}]),
    ], "Biceps feeling bigger every session."),

    mk(D(2026,4,4), "Legs (accessories)", "No squats today — just accessories.", "55 min", 3300, [
      ex("romanian-deadlift","Romanian Deadlift",   "Hamstrings",[{weight:80,reps:10,rpe:7},{weight:80,reps:10,rpe:7.5},{weight:80,reps:9,rpe:8}]),
      ex("leg-press",        "Leg Press",           "Quads",     [{weight:130,reps:12,rpe:7},{weight:130,reps:12,rpe:7.5},{weight:130,reps:11,rpe:8}]),
      ex("leg-extension",    "Leg Extension",       "Quads",     [{weight:55,reps:15,rpe:7},{weight:55,reps:15,rpe:7.5},{weight:55,reps:13,rpe:8}]),
      ex("leg-curl",         "Leg Curl",            "Hamstrings",[{weight:47.5,reps:12,rpe:7},{weight:47.5,reps:12,rpe:7.5},{weight:47.5,reps:11,rpe:8}]),
      ex("calf-raise",       "Standing Calf Raise", "Calves",    [{weight:45,reps:20,rpe:6},{weight:45,reps:20,rpe:6.5},{weight:45,reps:18,rpe:7}]),
    ], "Skipped squats again. Legs need a proper day."),

    mk(D(2026,4,6), "Upper", "", "52 min", 3120, [
      ex("bench-press",    "Bench Press",    "Chest",     [{weight:87.5,reps:8,rpe:7},{weight:87.5,reps:8,rpe:7.5},{weight:87.5,reps:7,rpe:8},{weight:85,reps:7,rpe:8.5}]),
      ex("lat-pulldown",   "Lat Pulldown",   "Lats",      [{weight:80,reps:10,rpe:7},{weight:80,reps:10,rpe:7.5},{weight:80,reps:9,rpe:8}]),
      ex("overhead-press", "Overhead Press", "Shoulders", [{weight:60,reps:8,rpe:7},{weight:60,reps:7,rpe:8},{weight:60,reps:7,rpe:8.5}]),
      ex("barbell-curl",   "Barbell Curl",   "Biceps",    [{weight:47.5,reps:10,rpe:7},{weight:47.5,reps:10,rpe:7.5},{weight:47.5,reps:9,rpe:8}]),
      ex("tricep-pushdown","Tricep Pushdown","Triceps",   [{weight:55,reps:12,rpe:7},{weight:55,reps:12,rpe:7.5},{weight:55,reps:11,rpe:8}]),
    ], "Getting stronger. OHP frustrating — zero movement in 3 weeks."),

    // ── Week 6 (Apr 7–11) ─────────────────────────────────────────────────
    mk(D(2026,4,7), "Push A", "Bench 90 kg — new all-time PR!", "63 min", 3780, [
      ex("bench-press",            "Bench Press",            "Chest",      [{weight:90,reps:8,rpe:7},{weight:90,reps:8,rpe:7.5},{weight:90,reps:7,rpe:8},{weight:87.5,reps:7,rpe:8.5}]),
      ex("incline-dumbbell-press", "Incline Dumbbell Press", "Upper Chest",[{weight:34,reps:10,rpe:7},{weight:34,reps:10,rpe:7.5},{weight:34,reps:9,rpe:8}]),
      ex("overhead-press",         "Overhead Press",         "Shoulders",  [{weight:60,reps:8,rpe:7},{weight:60,reps:7,rpe:8},{weight:60,reps:7,rpe:8.5}]),
      ex("lateral-raise",          "Lateral Raise",          "Side Delts", [{weight:12,reps:15,rpe:7},{weight:12,reps:15,rpe:7},{weight:12,reps:13,rpe:7.5}]),
      ex("tricep-pushdown",        "Tricep Pushdown",        "Triceps",    [{weight:55,reps:12,rpe:7},{weight:55,reps:12,rpe:7.5},{weight:55,reps:11,rpe:8}]),
      ex("skull-crushers",         "Skull Crushers",         "Triceps",    [{weight:35,reps:10,rpe:7},{weight:35,reps:10,rpe:7.5},{weight:35,reps:9,rpe:8}]),
    ], "90 kg bench PR! OHP still 60 — needs a reset strategy."),

    mk(D(2026,4,9), "Pull A", "", "57 min", 3420, [
      ex("lat-pulldown",  "Lat Pulldown",     "Lats",      [{weight:82.5,reps:10,rpe:7},{weight:82.5,reps:10,rpe:7},{weight:82.5,reps:9,rpe:7.5},{weight:82.5,reps:9,rpe:8}]),
      ex("seated-row",    "Seated Cable Row", "Back",      [{weight:72.5,reps:10,rpe:7},{weight:72.5,reps:10,rpe:7.5},{weight:72.5,reps:9,rpe:8}]),
      ex("face-pulls",    "Face Pulls",       "Rear Delts",[{weight:22,reps:15,rpe:6},{weight:22,reps:15,rpe:6.5},{weight:22,reps:15,rpe:7}]),
      ex("barbell-curl",  "Barbell Curl",     "Biceps",    [{weight:47.5,reps:10,rpe:7},{weight:47.5,reps:10,rpe:7.5},{weight:47.5,reps:9,rpe:8}]),
      ex("hammer-curl",   "Hammer Curl",      "Biceps",    [{weight:24,reps:12,rpe:7},{weight:24,reps:12,rpe:7.5},{weight:24,reps:11,rpe:8}]),
    ], "Pull numbers at all-time highs."),

    mk(D(2026,4,11), "Push B", "Volume chest day.", "58 min", 3480, [
      ex("incline-bench-press","Incline Bench Press","Upper Chest",[{weight:75,reps:10,rpe:7},{weight:75,reps:10,rpe:7.5},{weight:75,reps:9,rpe:8},{weight:72.5,reps:9,rpe:8.5}]),
      ex("cable-fly",          "Cable Fly",          "Chest",      [{weight:22,reps:12,rpe:7},{weight:22,reps:12,rpe:7.5},{weight:22,reps:11,rpe:8}]),
      ex("overhead-press",     "Overhead Press",     "Shoulders",  [{weight:60,reps:8,rpe:7},{weight:60,reps:7,rpe:8},{weight:60,reps:7,rpe:8.5}]),
      ex("lateral-raise",      "Lateral Raise",      "Side Delts", [{weight:12,reps:15,rpe:7},{weight:12,reps:15,rpe:7},{weight:12,reps:13,rpe:7.5}]),
      ex("tricep-pushdown",    "Tricep Pushdown",    "Triceps",    [{weight:55,reps:12,rpe:7},{weight:55,reps:12,rpe:7.5},{weight:55,reps:11,rpe:8}]),
    ], "Good volume. Chest and tris well pumped."),
  ];
}

// ── Seed midway RepIQ plan (5-day body-part split, week 3 in progress) ─────────
// Muscle gap seed — upper-body only for the last 7 days; legs + core last trained 8+ days ago
// → Quads, Hamstrings, Glutes, Calves, Core show as "due" in HomeMuscleNudge
function buildMuscleGapSeed(): SavedWorkoutData[] {
  const D = (y: number, m: number, d: number) =>
    new Date(y, m - 1, d, 12, 0, 0).toISOString();
  const ex = (
    id: string, name: string, primaryMuscle: string,
    sets: { weight: number; reps: number; rpe: number | null }[]
  ): FinishedExerciseSummary => ({
    id, name, primaryMuscle,
    loggedSets: sets.length,
    loggedVolume: sets.reduce((s, r) => s + r.weight * r.reps, 0),
    sets: sets.map(s => ({ ...s, setType: "normal" as const })),
  });
  const mk = (
    date: string, sessionName: string, duration: string, durationSeconds: number,
    exercises: FinishedExerciseSummary[]
  ): SavedWorkoutData => ({
    sessionName, note: "", date: date.slice(0, 10), duration, durationSeconds,
    totalVolume: exercises.reduce((s, e) => s + e.loggedVolume, 0),
    totalSets: exercises.reduce((s, e) => s + e.loggedSets, 0),
    exerciseCount: exercises.length, loggedExerciseCount: exercises.length,
    ignoredIncompleteSets: 0, exercises,
    rewards: [], rewardSummary: { set: 0, exercise: 0, session: 0, total: 0 },
    takeawayTitle: "", takeawayBody: "", images: [], savedAt: date,
  });

  return [
    // 8 days ago — Legs + Core (will be "due" today)
    mk(D(2026,4,4), "Legs + Core", "58 min", 3480, [
      ex("squat",    "Barbell Squat",          "Quads",      [{weight:90,reps:8,rpe:8},{weight:90,reps:7,rpe:8.5},{weight:90,reps:6,rpe:9}]),
      ex("legpress", "Leg Press",              "Quads",      [{weight:160,reps:10,rpe:7},{weight:160,reps:9,rpe:8}]),
      ex("rdl",      "Romanian Deadlift",      "Hamstrings", [{weight:80,reps:10,rpe:7},{weight:80,reps:9,rpe:8}]),
      ex("legcurl",  "Lying Leg Curl",         "Hamstrings", [{weight:45,reps:12,rpe:8},{weight:45,reps:10,rpe:9}]),
      ex("calf",     "Standing Calf Raise",    "Calves",     [{weight:60,reps:15,rpe:8},{weight:60,reps:12,rpe:9}]),
      ex("plank",    "Cable Crunch",           "Core",       [{weight:30,reps:15,rpe:7},{weight:30,reps:15,rpe:8}]),
    ]),
    // 5 days ago — Push (will be "fading")
    mk(D(2026,4,7), "Push Day", "52 min", 3120, [
      ex("bench",    "Barbell Bench Press",    "Chest",      [{weight:85,reps:8,rpe:8},{weight:85,reps:7,rpe:8.5},{weight:85,reps:6,rpe:9}]),
      ex("ohp",      "Overhead Press",         "Shoulders",  [{weight:57.5,reps:6,rpe:8},{weight:57.5,reps:5,rpe:9}]),
      ex("incline",  "Incline DB Press",       "Chest",      [{weight:32,reps:10,rpe:8},{weight:32,reps:8,rpe:9}]),
      ex("lateral",  "Lateral Raise",          "Shoulders",  [{weight:12,reps:15,rpe:8},{weight:12,reps:12,rpe:8.5}]),
      ex("tricep",   "Tricep Pushdown",        "Triceps",    [{weight:25,reps:12,rpe:7},{weight:25,reps:10,rpe:8}]),
    ]),
    // 3 days ago — Pull (will be "fading")
    mk(D(2026,4,9), "Pull Day", "50 min", 3000, [
      ex("row",      "Barbell Row",            "Back",       [{weight:75,reps:8,rpe:8},{weight:75,reps:7,rpe:8.5}]),
      ex("pullup",   "Pull-Up",                "Back",       [{weight:0,reps:8,rpe:8},{weight:0,reps:7,rpe:8.5}]),
      ex("cablerow", "Cable Row",              "Back",       [{weight:65,reps:10,rpe:7},{weight:65,reps:9,rpe:8}]),
      ex("curl",     "Barbell Curl",           "Biceps",     [{weight:40,reps:10,rpe:8},{weight:40,reps:8,rpe:9}]),
    ]),
    // 1 day ago — Push again (will be "fresh")
    mk(D(2026,4,11), "Push Day", "48 min", 2880, [
      ex("bench2",   "Barbell Bench Press",    "Chest",      [{weight:87.5,reps:7,rpe:8},{weight:87.5,reps:6,rpe:9}]),
      ex("ohp2",     "Overhead Press",         "Shoulders",  [{weight:60,reps:5,rpe:9},{weight:57.5,reps:5,rpe:8.5}]),
      ex("fly",      "Dumbbell Fly",           "Chest",      [{weight:22,reps:12,rpe:8},{weight:22,reps:10,rpe:9}]),
      ex("tricep2",  "Overhead Tricep Ext",    "Triceps",    [{weight:30,reps:12,rpe:8},{weight:30,reps:10,rpe:9}]),
    ]),
  ];
}

function buildSeedRepIQData(): { plan: RepIQPlan; workouts: SavedWorkoutData[] } {
  const D = (y: number, m: number, d: number) =>
    new Date(y, m - 1, d, 12, 0, 0).toISOString();

  const ex = (
    id: string, name: string, primaryMuscle: string,
    sets: { weight: number; reps: number; rpe: number | null }[]
  ): FinishedExerciseSummary => ({
    id, name, primaryMuscle,
    loggedSets: sets.length,
    loggedVolume: sets.reduce((s, t) => s + t.weight * t.reps, 0),
    sets: sets.map(s => ({ ...s, setType: "normal" as const })),
  });

  const mk = (
    date: string, sessionName: string, note: string,
    duration: string, durationSeconds: number,
    exercises: FinishedExerciseSummary[], takeawayTitle: string
  ): SavedWorkoutData => ({
    sessionName, note, date: date.slice(0, 10), duration, durationSeconds,
    totalVolume: exercises.reduce((s, e) => s + e.loggedVolume, 0),
    totalSets: exercises.reduce((s, e) => s + e.loggedSets, 0),
    exerciseCount: exercises.length, loggedExerciseCount: exercises.length,
    ignoredIncompleteSets: 0, exercises,
    rewards: [], rewardSummary: { set: 0, exercise: 0, session: 0, total: 0 },
    takeawayTitle, takeawayBody: "", images: [], savedAt: date,
    workoutSource: "repiq",
  });

  // 5 day plan exercises (plan schema — just IDs + reps)
  const chestTri  = [
    { exerciseId: "bench-press",            sets: 4, reps: "6–8",   restSeconds: 120 },
    { exerciseId: "incline-dumbbell-press", sets: 3, reps: "8–10",  restSeconds: 90  },
    { exerciseId: "cable-fly",              sets: 3, reps: "12–15", restSeconds: 60  },
    { exerciseId: "tricep-pushdown",        sets: 3, reps: "10–12", restSeconds: 60  },
    { exerciseId: "skull-crushers",         sets: 3, reps: "10–12", restSeconds: 60  },
  ];
  const backBi    = [
    { exerciseId: "lat-pulldown",   sets: 4, reps: "8–10",  restSeconds: 90  },
    { exerciseId: "seated-row",     sets: 3, reps: "8–10",  restSeconds: 90  },
    { exerciseId: "face-pulls",     sets: 3, reps: "12–15", restSeconds: 60  },
    { exerciseId: "barbell-curl",   sets: 3, reps: "10–12", restSeconds: 60  },
    { exerciseId: "hammer-curl",    sets: 3, reps: "10–12", restSeconds: 60  },
  ];
  const legs      = [
    { exerciseId: "barbell-squat",     sets: 4, reps: "6–8",   restSeconds: 180 },
    { exerciseId: "romanian-deadlift", sets: 3, reps: "8–10",  restSeconds: 120 },
    { exerciseId: "leg-press",         sets: 3, reps: "10–12", restSeconds: 120 },
    { exerciseId: "leg-extension",     sets: 3, reps: "12–15", restSeconds: 60  },
    { exerciseId: "calf-raise",        sets: 3, reps: "15–20", restSeconds: 60  },
  ];
  const shoulders = [
    { exerciseId: "overhead-press",  sets: 4, reps: "6–8",   restSeconds: 120 },
    { exerciseId: "lateral-raise",   sets: 4, reps: "12–15", restSeconds: 60  },
    { exerciseId: "face-pulls",      sets: 3, reps: "12–15", restSeconds: 60  },
    { exerciseId: "rear-delt-fly",   sets: 3, reps: "12–15", restSeconds: 60  },
  ];
  const armsCore  = [
    { exerciseId: "barbell-curl",   sets: 3, reps: "10–12", restSeconds: 60  },
    { exerciseId: "hammer-curl",    sets: 3, reps: "10–12", restSeconds: 60  },
    { exerciseId: "tricep-pushdown",sets: 3, reps: "10–12", restSeconds: 60  },
    { exerciseId: "skull-crushers", sets: 3, reps: "10–12", restSeconds: 60  },
  ];

  const makeDay = (
    label: string, focus: string,
    planEx: typeof chestTri, completedAt: string | null
  ): RepIQPlanDay => ({ sessionLabel: label, focus, exercises: planEx, completedAt });

  const makeWeek = (
    n: number, isCompleted: boolean, doneAt: (string | null)[]
  ): RepIQPlanWeek => ({
    weekNumber: n, isCompleted,
    days: [
      makeDay("Chest & Triceps", "Chest · Triceps",              chestTri,  doneAt[0]),
      makeDay("Back & Biceps",   "Back · Biceps",                backBi,    doneAt[1]),
      makeDay("Legs",            "Quads · Hamstrings · Glutes",  legs,      doneAt[2]),
      makeDay("Shoulders",       "Shoulders · Rear Delts",       shoulders, doneAt[3]),
      makeDay("Arms",            "Biceps · Triceps",             armsCore,  doneAt[4]),
    ],
  });

  // Completed timestamps ─ weeks 1 and 2 full, week 3 days 1–3 done
  const W1 = [D(2026,3,23), D(2026,3,24), D(2026,3,25), D(2026,3,26), D(2026,3,27)];
  const W2 = [D(2026,3,30), D(2026,3,31), D(2026,4,1),  D(2026,4,2),  D(2026,4,3) ];
  const W3 = [D(2026,4,7),  D(2026,4,8),  D(2026,4,9),  null,         null        ];
  const NONE = [null, null, null, null, null];

  const plan: RepIQPlan = {
    schemaVersion: 1, id: "dev-midway-plan",
    generatedAt: D(2026,3,23),
    startDate: "2026-03-23",
    planName: "5-Day Hypertrophy",
    goal: "build_muscle", secondaryGoal: null,
    experienceLevel: "intermediate",
    daysPerWeek: 5, cycleDays: null, totalCycles: 8, sessionLengthMin: 60,
    splitType: "body_part",
    mesocycleLengthWeeks: 8,
    currentWeekIndex: 2, // 0-indexed → week 3
    status: "active",
    weeks: [
      makeWeek(1, true,  W1),
      makeWeek(2, true,  W2),
      makeWeek(3, false, W3),
      makeWeek(4, false, NONE),
      makeWeek(5, false, NONE),
      makeWeek(6, false, NONE),
      makeWeek(7, false, NONE),
      makeWeek(8, false, NONE),
    ],
  };

  // Matching saved workouts for every completed day
  const workouts: SavedWorkoutData[] = [
    // ── Week 1 ──────────────────────────────────────────────────────────────
    mk(W1[0], "Chest & Triceps", "", "57 min", 3420, [
      ex("bench-press",            "Bench Press",            "Chest",      [{weight:80,reps:8,rpe:7},{weight:80,reps:8,rpe:7.5},{weight:80,reps:7,rpe:8},{weight:77.5,reps:7,rpe:8.5}]),
      ex("incline-dumbbell-press", "Incline Dumbbell Press", "Upper Chest",[{weight:28,reps:10,rpe:7},{weight:28,reps:10,rpe:7.5},{weight:28,reps:9,rpe:8}]),
      ex("cable-fly",              "Cable Fly",              "Chest",      [{weight:20,reps:12,rpe:6},{weight:20,reps:12,rpe:6.5},{weight:20,reps:11,rpe:7}]),
      ex("tricep-pushdown",        "Tricep Pushdown",        "Triceps",    [{weight:45,reps:12,rpe:7},{weight:45,reps:12,rpe:7.5},{weight:45,reps:11,rpe:8}]),
      ex("skull-crushers",         "Skull Crushers",         "Triceps",    [{weight:30,reps:10,rpe:7},{weight:30,reps:10,rpe:7.5},{weight:30,reps:9,rpe:8}]),
    ], "Good chest session to start the plan."),
    mk(W1[1], "Back & Biceps", "", "55 min", 3300, [
      ex("lat-pulldown",  "Lat Pulldown",     "Lats",      [{weight:70,reps:10,rpe:7},{weight:70,reps:10,rpe:7},{weight:70,reps:9,rpe:7.5},{weight:70,reps:9,rpe:8}]),
      ex("seated-row",    "Seated Cable Row", "Back",      [{weight:65,reps:10,rpe:7},{weight:65,reps:10,rpe:7.5},{weight:65,reps:9,rpe:8}]),
      ex("face-pulls",    "Face Pulls",       "Rear Delts",[{weight:20,reps:15,rpe:6},{weight:20,reps:15,rpe:6.5},{weight:20,reps:14,rpe:7}]),
      ex("barbell-curl",  "Barbell Curl",     "Biceps",    [{weight:40,reps:10,rpe:7},{weight:40,reps:10,rpe:7.5},{weight:40,reps:9,rpe:8}]),
      ex("hammer-curl",   "Hammer Curl",      "Biceps",    [{weight:20,reps:12,rpe:6},{weight:20,reps:12,rpe:7},{weight:20,reps:11,rpe:7.5}]),
    ], "Back pumped."),
    mk(W1[2], "Legs", "First leg day of the plan.", "65 min", 3900, [
      ex("barbell-squat",     "Barbell Squat",       "Quads",      [{weight:80,reps:8,rpe:7},{weight:80,reps:8,rpe:7.5},{weight:80,reps:7,rpe:8},{weight:77.5,reps:7,rpe:8.5}]),
      ex("romanian-deadlift", "Romanian Deadlift",   "Hamstrings", [{weight:70,reps:10,rpe:7},{weight:70,reps:10,rpe:7.5},{weight:70,reps:9,rpe:8}]),
      ex("leg-press",         "Leg Press",           "Quads",      [{weight:120,reps:12,rpe:7},{weight:120,reps:12,rpe:7.5},{weight:120,reps:11,rpe:8}]),
      ex("leg-extension",     "Leg Extension",       "Quads",      [{weight:50,reps:15,rpe:7},{weight:50,reps:15,rpe:7.5},{weight:50,reps:13,rpe:8}]),
      ex("calf-raise",        "Standing Calf Raise", "Calves",     [{weight:40,reps:20,rpe:6},{weight:40,reps:20,rpe:6.5},{weight:40,reps:18,rpe:7}]),
    ], "Legs are brutal."),
    mk(W1[3], "Shoulders", "", "50 min", 3000, [
      ex("overhead-press", "Overhead Press",  "Shoulders",  [{weight:55,reps:8,rpe:7},{weight:55,reps:8,rpe:7.5},{weight:55,reps:7,rpe:8},{weight:52.5,reps:7,rpe:8.5}]),
      ex("lateral-raise",  "Lateral Raise",   "Side Delts", [{weight:10,reps:15,rpe:6},{weight:10,reps:15,rpe:6.5},{weight:10,reps:14,rpe:7},{weight:10,reps:13,rpe:7.5}]),
      ex("face-pulls",     "Face Pulls",      "Rear Delts", [{weight:20,reps:15,rpe:6},{weight:20,reps:15,rpe:6.5},{weight:20,reps:14,rpe:7}]),
      ex("rear-delt-fly",  "Rear Delt Fly",   "Rear Delts", [{weight:12,reps:15,rpe:6},{weight:12,reps:15,rpe:6.5},{weight:12,reps:14,rpe:7}]),
    ], "Shoulders well hit."),
    mk(W1[4], "Arms", "", "45 min", 2700, [
      ex("barbell-curl",   "Barbell Curl",   "Biceps",  [{weight:40,reps:10,rpe:7},{weight:40,reps:10,rpe:7.5},{weight:40,reps:9,rpe:8}]),
      ex("hammer-curl",    "Hammer Curl",    "Biceps",  [{weight:20,reps:12,rpe:6},{weight:20,reps:12,rpe:7},{weight:20,reps:11,rpe:7.5}]),
      ex("tricep-pushdown","Tricep Pushdown","Triceps", [{weight:45,reps:12,rpe:7},{weight:45,reps:12,rpe:7.5},{weight:45,reps:11,rpe:8}]),
      ex("skull-crushers", "Skull Crushers", "Triceps", [{weight:30,reps:10,rpe:7},{weight:30,reps:10,rpe:7.5},{weight:30,reps:9,rpe:8}]),
    ], "Arms session done."),

    // ── Week 2 ──────────────────────────────────────────────────────────────
    mk(W2[0], "Chest & Triceps", "+2.5 kg on bench.", "58 min", 3480, [
      ex("bench-press",            "Bench Press",            "Chest",      [{weight:82.5,reps:8,rpe:7},{weight:82.5,reps:8,rpe:7.5},{weight:82.5,reps:7,rpe:8},{weight:80,reps:7,rpe:8.5}]),
      ex("incline-dumbbell-press", "Incline Dumbbell Press", "Upper Chest",[{weight:30,reps:10,rpe:7},{weight:30,reps:10,rpe:7.5},{weight:30,reps:9,rpe:8}]),
      ex("cable-fly",              "Cable Fly",              "Chest",      [{weight:20,reps:12,rpe:6},{weight:20,reps:12,rpe:7},{weight:20,reps:11,rpe:7.5}]),
      ex("tricep-pushdown",        "Tricep Pushdown",        "Triceps",    [{weight:47.5,reps:12,rpe:7},{weight:47.5,reps:12,rpe:7.5},{weight:47.5,reps:11,rpe:8}]),
      ex("skull-crushers",         "Skull Crushers",         "Triceps",    [{weight:30,reps:10,rpe:7},{weight:30,reps:10,rpe:7.5},{weight:30,reps:9,rpe:8}]),
    ], "Chest progressing."),
    mk(W2[1], "Back & Biceps", "", "54 min", 3240, [
      ex("lat-pulldown",  "Lat Pulldown",     "Lats",      [{weight:72.5,reps:10,rpe:7},{weight:72.5,reps:10,rpe:7},{weight:72.5,reps:9,rpe:7.5},{weight:72.5,reps:9,rpe:8}]),
      ex("seated-row",    "Seated Cable Row", "Back",      [{weight:67.5,reps:10,rpe:7},{weight:67.5,reps:10,rpe:7.5},{weight:67.5,reps:9,rpe:8}]),
      ex("face-pulls",    "Face Pulls",       "Rear Delts",[{weight:20,reps:15,rpe:6},{weight:20,reps:15,rpe:6.5},{weight:20,reps:15,rpe:7}]),
      ex("barbell-curl",  "Barbell Curl",     "Biceps",    [{weight:42.5,reps:10,rpe:7},{weight:42.5,reps:10,rpe:7.5},{weight:42.5,reps:9,rpe:8}]),
      ex("hammer-curl",   "Hammer Curl",      "Biceps",    [{weight:20,reps:12,rpe:7},{weight:20,reps:12,rpe:7.5},{weight:20,reps:11,rpe:8}]),
    ], "Back volume building."),
    mk(W2[2], "Legs", "", "63 min", 3780, [
      ex("barbell-squat",     "Barbell Squat",       "Quads",      [{weight:82.5,reps:8,rpe:7},{weight:82.5,reps:8,rpe:7.5},{weight:82.5,reps:7,rpe:8},{weight:80,reps:7,rpe:8.5}]),
      ex("romanian-deadlift", "Romanian Deadlift",   "Hamstrings", [{weight:72.5,reps:10,rpe:7},{weight:72.5,reps:10,rpe:7.5},{weight:72.5,reps:9,rpe:8}]),
      ex("leg-press",         "Leg Press",           "Quads",      [{weight:125,reps:12,rpe:7},{weight:125,reps:12,rpe:7.5},{weight:125,reps:11,rpe:8}]),
      ex("leg-extension",     "Leg Extension",       "Quads",      [{weight:52.5,reps:15,rpe:7},{weight:52.5,reps:15,rpe:7.5},{weight:52.5,reps:13,rpe:8}]),
      ex("calf-raise",        "Standing Calf Raise", "Calves",     [{weight:42.5,reps:20,rpe:6},{weight:42.5,reps:20,rpe:6.5},{weight:42.5,reps:18,rpe:7}]),
    ], "Legs +2.5 kg on squat."),
    mk(W2[3], "Shoulders", "", "51 min", 3060, [
      ex("overhead-press", "Overhead Press",  "Shoulders",  [{weight:57.5,reps:8,rpe:7},{weight:57.5,reps:8,rpe:7.5},{weight:57.5,reps:7,rpe:8},{weight:55,reps:7,rpe:8.5}]),
      ex("lateral-raise",  "Lateral Raise",   "Side Delts", [{weight:10,reps:15,rpe:6},{weight:10,reps:15,rpe:6.5},{weight:12,reps:12,rpe:7},{weight:12,reps:12,rpe:7.5}]),
      ex("face-pulls",     "Face Pulls",      "Rear Delts", [{weight:20,reps:15,rpe:6},{weight:20,reps:15,rpe:6.5},{weight:20,reps:15,rpe:7}]),
      ex("rear-delt-fly",  "Rear Delt Fly",   "Rear Delts", [{weight:12,reps:15,rpe:6},{weight:12,reps:15,rpe:7},{weight:12,reps:14,rpe:7.5}]),
    ], "OHP up 2.5 kg."),
    mk(W2[4], "Arms", "", "44 min", 2640, [
      ex("barbell-curl",   "Barbell Curl",   "Biceps",  [{weight:42.5,reps:10,rpe:7},{weight:42.5,reps:10,rpe:7.5},{weight:42.5,reps:9,rpe:8}]),
      ex("hammer-curl",    "Hammer Curl",    "Biceps",  [{weight:20,reps:12,rpe:7},{weight:20,reps:12,rpe:7.5},{weight:20,reps:11,rpe:8}]),
      ex("tricep-pushdown","Tricep Pushdown","Triceps", [{weight:47.5,reps:12,rpe:7},{weight:47.5,reps:12,rpe:7.5},{weight:47.5,reps:11,rpe:8}]),
      ex("skull-crushers", "Skull Crushers", "Triceps", [{weight:30,reps:10,rpe:7},{weight:30,reps:10,rpe:7.5},{weight:30,reps:9,rpe:8}]),
    ], "Arm isolation session done."),

    // ── Week 3 (days 1–3 done) ───────────────────────────────────────────────
    mk(W3[0]!, "Chest & Triceps", "Bench 85 kg!", "59 min", 3540, [
      ex("bench-press",            "Bench Press",            "Chest",      [{weight:85,reps:8,rpe:7},{weight:85,reps:8,rpe:7.5},{weight:85,reps:7,rpe:8},{weight:82.5,reps:7,rpe:8.5}]),
      ex("incline-dumbbell-press", "Incline Dumbbell Press", "Upper Chest",[{weight:30,reps:10,rpe:7},{weight:30,reps:10,rpe:7.5},{weight:30,reps:9,rpe:8}]),
      ex("cable-fly",              "Cable Fly",              "Chest",      [{weight:22,reps:12,rpe:7},{weight:22,reps:12,rpe:7.5},{weight:22,reps:11,rpe:8}]),
      ex("tricep-pushdown",        "Tricep Pushdown",        "Triceps",    [{weight:50,reps:12,rpe:7},{weight:50,reps:12,rpe:7.5},{weight:50,reps:11,rpe:8}]),
      ex("skull-crushers",         "Skull Crushers",         "Triceps",    [{weight:32.5,reps:10,rpe:7},{weight:32.5,reps:10,rpe:7.5},{weight:32.5,reps:9,rpe:8}]),
    ], "Bench milestone — 85 kg."),
    mk(W3[1]!, "Back & Biceps", "", "55 min", 3300, [
      ex("lat-pulldown",  "Lat Pulldown",     "Lats",      [{weight:75,reps:10,rpe:7},{weight:75,reps:10,rpe:7},{weight:75,reps:9,rpe:7.5},{weight:75,reps:9,rpe:8}]),
      ex("seated-row",    "Seated Cable Row", "Back",      [{weight:70,reps:10,rpe:7},{weight:70,reps:10,rpe:7.5},{weight:70,reps:9,rpe:8}]),
      ex("face-pulls",    "Face Pulls",       "Rear Delts",[{weight:22,reps:15,rpe:6},{weight:22,reps:15,rpe:6.5},{weight:22,reps:15,rpe:7}]),
      ex("barbell-curl",  "Barbell Curl",     "Biceps",    [{weight:45,reps:10,rpe:7},{weight:45,reps:10,rpe:7.5},{weight:45,reps:9,rpe:8}]),
      ex("hammer-curl",   "Hammer Curl",      "Biceps",    [{weight:22,reps:12,rpe:7},{weight:22,reps:12,rpe:7.5},{weight:22,reps:11,rpe:8}]),
    ], "Back volume up again."),
    mk(W3[2]!, "Legs", "", "64 min", 3840, [
      ex("barbell-squat",     "Barbell Squat",       "Quads",      [{weight:85,reps:8,rpe:7},{weight:85,reps:8,rpe:7.5},{weight:85,reps:7,rpe:8},{weight:82.5,reps:7,rpe:8.5}]),
      ex("romanian-deadlift", "Romanian Deadlift",   "Hamstrings", [{weight:75,reps:10,rpe:7},{weight:75,reps:10,rpe:7.5},{weight:75,reps:9,rpe:8}]),
      ex("leg-press",         "Leg Press",           "Quads",      [{weight:130,reps:12,rpe:7},{weight:130,reps:12,rpe:7.5},{weight:130,reps:11,rpe:8}]),
      ex("leg-extension",     "Leg Extension",       "Quads",      [{weight:55,reps:15,rpe:7},{weight:55,reps:15,rpe:7.5},{weight:55,reps:13,rpe:8}]),
      ex("calf-raise",        "Standing Calf Raise", "Calves",     [{weight:42.5,reps:20,rpe:6},{weight:42.5,reps:20,rpe:6.5},{weight:42.5,reps:18,rpe:7}]),
    ], "Squat 85 kg. Shoulders and Arms still to go this week."),
  ];

  return { plan, workouts };
}

// ── Glossary Page ─────────────────────────────────────────────────────────────
const GLOSSARY_DATA: { section: string; terms: { name: string; def: string }[] }[] = [
  {
    section: "Effort & Intensity",
    terms: [
      {
        name: "RPE — Rate of Perceived Exertion",
        def: "A 1–10 scale that measures how hard a set feels relative to your maximum effort.\n\nRPE 10 = absolutely nothing left, couldn't do one more rep.\nRPE 9 = could have done 1 more rep.\nRPE 8 = could have done 2 more reps.\nRPE 7 = could have done 3 more reps.\nRPE 6 = 4+ reps left — a warm-up effort.\n\nLog RPE per set to track fatigue accumulation over a session and week. The same weight at RPE 8 early in a programme may creep to RPE 9 by week 4 — that's a signal to deload.",
      },
      {
        name: "RIR — Reps In Reserve",
        def: "The flip side of RPE. RIR counts how many reps you had left in the tank at the end of a set.\n\nRIR 0 = failure (RPE 10). RIR 1 = 1 rep left (RPE 9). RIR 2 = 2 reps left (RPE 8).\n\nRIR is more intuitive for many lifters: instead of rating difficulty, you simply ask 'how many more could I have done?' Both RPE and RIR are useful — use whichever clicks. RepIQ accepts either.",
      },
      {
        name: "1RM — One Rep Max",
        def: "The maximum weight you can lift for exactly one rep with full control and good form. Used as a reference to set training percentages (e.g. work at 75% of 1RM).\n\nYou can estimate your 1RM without testing it to failure. The Epley formula: 1RM ≈ weight × (1 + reps ÷ 30). Example: 80 kg × 10 reps → estimated 1RM ≈ 107 kg.\n\nRepIQ uses logged sets to estimate 1RM trends over time.",
      },
      {
        name: "Training to Failure",
        def: "Performing reps until you cannot complete another rep with good form. This is RPE 10 / RIR 0.\n\nTechnical failure = you can't maintain form but muscles aren't fully exhausted.\nAbsolute failure = muscles genuinely cannot contract to complete the movement.\n\nMost evidence suggests training to 1–3 RIR (RPE 7–9) provides nearly identical hypertrophy stimulus with lower injury risk and faster recovery. Reserve true failure training for occasional intensification weeks.",
      },
    ],
  },
  {
    section: "Exercise Types",
    terms: [
      {
        name: "Compound",
        def: "A movement that involves two or more joints and recruits multiple muscle groups simultaneously. Examples: squat (hips + knees), deadlift (hips + spine), bench press (shoulder + elbow), pull-up (shoulder + elbow).\n\nCompounds deliver the most training stimulus per set and should make up the majority of your session. They also have the largest carryover to real-world strength.",
      },
      {
        name: "Isolation",
        def: "A movement that targets a single muscle group across a single joint, with minimal involvement from other muscles. Examples: bicep curl (elbow flexion only), leg extension (knee extension only), lateral raise (shoulder abduction only).\n\nIsolation work is best used to address weak points or provide additional volume for a muscle that your compound work doesn't fully reach. Not a replacement for compounds.",
      },
      {
        name: "Unilateral",
        def: "Training one limb at a time — one arm or one leg independently. Examples: single-leg press, Bulgarian split squat, single-arm dumbbell row, single-leg Romanian deadlift.\n\nBenefits: identifies and corrects left-right strength imbalances; improves stability and proprioception; each side gets full range of motion without the dominant side compensating.\n\nIn RepIQ, log the weight per side (not combined). If you used a 20 kg dumbbell per leg, log 20 — RepIQ calculates volume correctly.",
      },
    ],
  },
  {
    section: "Set Types",
    terms: [
      {
        name: "Superset",
        def: "Two exercises performed back-to-back with no rest between them, then rest after both are done.\n\nAntagonist superset (recommended): pair muscles that oppose each other — e.g. bench press + barbell row, or bicep curl + tricep pushdown. One muscle recovers while the other works, so strength loss is minimal and time is halved.\n\nAgonist superset: pair similar muscles — e.g. dumbbell flye + bench press. More fatiguing; used for intensification.\n\nIn RepIQ: tap the superset icon on the first exercise, then select the paired exercise. Both are grouped in your log.",
      },
      {
        name: "Drop Set",
        def: "A set taken to or near failure, then immediately reducing the weight by 20–30% and continuing for more reps — no rest between the drop.\n\nPurpose: maximises metabolic stress and muscle fibre recruitment beyond what a normal working set reaches. Useful for hypertrophy.\n\nUse sparingly: 1–2 drop sets per session is plenty. Overuse leads to excessive fatigue that degrades quality across the rest of your workout.\n\nIn RepIQ: log your working set, then immediately add a new set row at the reduced weight and tag it as a drop set.",
      },
      {
        name: "AMRAP — As Many Reps As Possible",
        def: "A set where you perform as many reps as you can with good form, typically at a given weight. Used as a max-effort back-off set or as a testing tool.\n\nCommonly programmed as the final set: 'Do 3×8, then AMRAP at the same weight.' The rep count tells you whether to progress the load next session.\n\nLog the actual reps completed. RepIQ will use this to update your estimated 1RM.",
      },
    ],
  },
  {
    section: "Programming",
    terms: [
      {
        name: "Progressive Overload",
        def: "The principle of systematically increasing the stress placed on your body over time so it continues to adapt. You can achieve progressive overload by:\n\n• Adding weight to the bar\n• Increasing reps at the same weight\n• Adding sets (more volume)\n• Reducing rest periods\n• Improving technique (more effective stimulus at the same load)\n\nWithout progressive overload, training becomes maintenance at best. RepIQ's Training Trend card tracks whether your weekly volume is climbing — that is the most direct measurable signal of overload.",
      },
      {
        name: "Volume",
        def: "The total amount of work done, most commonly measured as sets × reps × weight (kg). Also expressed as 'working sets' — the number of challenging sets per muscle group per week.\n\nResearch consensus: 10–20 working sets per muscle group per week is the effective hypertrophy range for most people. Below 10 is maintenance; above 20 risks overtraining.\n\nRepIQ measures volume as total kg lifted per session and week, and tracks week-over-week volume trends in the Training Trend card.",
      },
      {
        name: "Mesocycle",
        def: "A structured training block with a defined goal, typically 4–8 weeks. A mesocycle usually follows a pattern of weekly progressive overload followed by a deload at the end.\n\nExample 8-week hypertrophy mesocycle:\nWeeks 1–2: Moderate volume, RPE 7–8\nWeeks 3–4: Higher volume, RPE 8\nWeeks 5–6: Higher volume, RPE 8–9\nWeek 7: Peak week, highest intensity\nWeek 8: Deload — 40–50% volume reduction\n\nRepIQ plan lengths are set in weeks and correspond to mesocycle length.",
      },
      {
        name: "Deload",
        def: "A planned reduction in training volume or intensity — typically 40–60% less volume for one week — to allow the body to fully recover and supercompensate before the next training block.\n\nWhen to deload: after 4–6 hard weeks; when joints feel beaten up; when motivation is unusually low; when performance is stagnating or declining despite good sleep and nutrition.\n\nA deload is not a week off — you still train, but easier. This is different from a rest week (no training at all), which is valid but less common.",
      },
      {
        name: "Training Split",
        def: "How your training is divided across the week. Common splits by experience level:\n\nFull Body (2–3×/wk): each session hits all major muscle groups. Best for beginners and time-constrained lifters. High frequency drives faster skill and strength acquisition.\n\nUpper / Lower (4×/wk): two upper days, two lower days. Good balance of frequency and volume. Strong choice for intermediates.\n\nPush / Pull / Legs (5–6×/wk): each muscle group trained ~2× per week. Popular intermediate–advanced split. Requires consistent attendance.\n\nBody Part (5–6×/wk): one or two muscle groups per session. Allows high volume per muscle. Requires 5–6 sessions/week to maintain adequate frequency.",
      },
      {
        name: "Hypertrophy",
        def: "The physiological process of muscle fibres increasing in size (cross-sectional area) as an adaptation to training stress. The primary goal of bodybuilding and physique training.\n\nKey drivers: sufficient volume (10–20 sets/muscle/week), progressive overload, proximity to failure (RIR 0–3), adequate protein (1.6–2.2 g/kg/day), and sleep.\n\nHypertrophy training typically uses 6–20 rep ranges at moderate loads (60–80% 1RM). It is distinct from pure strength training, which prioritises neural adaptations at heavier loads (1–5 reps).",
      },
    ],
  },
  {
    section: "RepIQ Concepts",
    terms: [
      {
        name: "Training Zone",
        def: "How RepIQ classifies each week's training based on total volume compared to the previous week.\n\nProgress: week's volume is more than 5% higher than the prior week — you're applying progressive overload.\n\nMaintaining: week's volume is within ±5–10% of the prior week — load is steady.\n\nPlateau: week's volume is more than 10% lower than the prior week — stimulus is declining.\n\nMissed: no sessions logged that week.\n\nThe Training Trend card on the Home screen shows your last 3 weeks and current zone. Tap to see the muscle-level breakdown in Analyzer.",
      },
      {
        name: "Quality Week (Streak)",
        def: "For the weekly streak badge, RepIQ counts a week as 'quality' only if it meets both criteria:\n\n1. Sessions: 2 or more sessions in the week. OR 1 session if it covers 3+ canonical muscle groups.\n2. Muscle coverage: 3 or more distinct muscle groups trained (e.g. Chest + Back + Legs).\n\nA single session hitting only one muscle group (e.g. biceps only) counts as a partial week and does not extend the streak. The streak measures consistent, balanced training — not just showing up.",
      },
      {
        name: "Muscle Coverage",
        def: "The number of distinct canonical muscle groups trained in a given period. RepIQ uses 10 canonical groups: Chest, Back, Shoulders, Biceps, Triceps, Core, Quads, Hamstrings, Glutes, and Calves.\n\nThe muscle coverage card on the Home screen shows which groups have been trained recently and which are overdue. Coverage of 7–10 groups over a training week indicates a well-balanced programme.",
      },
    ],
  },
  {
    section: "Logging How-Tos",
    terms: [
      {
        name: "How to log a Superset",
        def: "1. In the exercise list, find the first exercise of the pair.\n2. Tap the superset (⊕) icon on that exercise card.\n3. Search for and select the paired exercise.\n4. Both exercises now appear grouped — sets for both log together.\n5. Complete one set of exercise A, then immediately one set of exercise B, then rest.",
      },
      {
        name: "How to log a Drop Set",
        def: "1. Complete and log your normal working set.\n2. Without resting, reduce the weight (typically 20–30%).\n3. Add a new set row for the same exercise at the reduced weight.\n4. Tap the set type selector and mark it as a Drop Set.\n\nRepIQ will show the drop visually and exclude it from your progressive overload comparison (so it doesn't inflate your top-set weight).",
      },
      {
        name: "How to log Unilateral exercises",
        def: "Always log the weight per side, not the combined total.\n\nExample: Bulgarian split squat with 20 kg dumbbells in each hand → log 20 kg (not 40 kg).\n\nRepIQ calculates volume assuming the logged weight is per-side for exercises tagged as unilateral. This keeps volume comparable to bilateral movements and accurate across sessions.",
      },
    ],
  },
  {
    section: "Workout Splits",
    terms: [
      { name: "Full Body", def: "Every major muscle group is trained each session. Great for beginners or anyone training 2–4 days per week. High frequency per muscle, moderate volume per session." },
      { name: "Push / Pull", def: "Day 1 trains all pushing muscles (chest, shoulders, triceps). Day 2 trains all pulling muscles (back, biceps). A simple 2-day rotation that pairs naturally opposing movements." },
      { name: "Upper / Lower", def: "Alternating upper-body and lower-body days. Classic 4-day structure — 2 upper and 2 lower sessions per week. Good balance of frequency and volume." },
      { name: "Push · Pull · Legs (PPL)", def: "Three distinct sessions: Push (chest, shoulders, triceps), Pull (back, biceps), and Legs. Run it as a 3-day or 6-day rotation. One of the most popular intermediate splits." },
      { name: "Arnold Split", def: "Chest + Back together, Shoulders + Arms together, then Legs. Named after Arnold Schwarzenegger. A 3-day rotation, typically run 6 days a week. Supersets between opposing muscles for efficiency." },
      { name: "Power Hypertrophy (PHUL)", def: "Four days: Upper Power, Lower Power, Upper Hypertrophy, Lower Hypertrophy. Power days use heavy compounds (3–5 reps), hypertrophy days use moderate weight and higher reps (8–12). Best of both worlds." },
      { name: "Body Part Split", def: "Each session dedicates maximum volume to one muscle group — e.g., Chest day, Back day, Shoulder day, Arms day, Leg day. Requires 5–7 days per week but allows very high volume per muscle." },
      { name: "Custom Split", def: "You assign muscles to each day yourself from the Planner. Choose exactly which muscles go together. RepIQ generates exercises based on your arrangement. Best for experienced lifters with specific needs." },
    ],
  },
];

function GlossaryPage({ onBack, resolvedTheme, initialTerm = "" }: { onBack: () => void; resolvedTheme: string; initialTerm?: string }) {
  const [query, setQuery] = useState(initialTerm);
  // Sync if parent changes the term (e.g. navigating to glossary from different Info icons)
  const prevInitialTerm = useRef(initialTerm);
  useEffect(() => {
    if (initialTerm !== prevInitialTerm.current) {
      prevInitialTerm.current = initialTerm;
      setQuery(initialTerm);
    }
  }, [initialTerm]);
  const q = query.trim().toLowerCase();

  const filtered = GLOSSARY_DATA.map((sec) => ({
    ...sec,
    terms: sec.terms.filter(
      (t) => t.name.toLowerCase().includes(q) || t.def.toLowerCase().includes(q)
    ),
  })).filter((sec) => sec.terms.length > 0);

  return (
    <div className="glossary-shell" data-theme={resolvedTheme}>
      <header className="glossary-header">
        <button className="glossary-back-btn" type="button" onClick={onBack} aria-label="Back">
          ← Back
        </button>
        <h1 className="glossary-title">Fitness Glossary</h1>
        <div style={{ width: 60 }} />
      </header>

      {/* Search bar */}
      <div className="glossary-search-wrap">
        <svg className="glossary-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          className="glossary-search-input"
          type="search"
          placeholder="Search terms…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search glossary"
          autoComplete="off"
          spellCheck={false}
        />
        {query && (
          <button
            type="button"
            className="glossary-search-clear"
            onClick={() => setQuery("")}
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      <div className="glossary-body">
        {filtered.length === 0 ? (
          <div className="glossary-empty">
            <p className="glossary-empty-title">No results for "{query}"</p>
            <p className="glossary-empty-sub">Try a different term — e.g. RPE, superset, deload</p>
          </div>
        ) : (
          filtered.map((sec) => (
            <div key={sec.section}>
              <p className="glossary-section-title">{sec.section}</p>
              {sec.terms.map((term) => (
                <div key={term.name} className="glossary-term">
                  <p className="glossary-term-name">{term.name}</p>
                  <p className="glossary-term-def">{term.def}</p>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── More Sheet ────────────────────────────────────────────────────────────────
function MoreSheet({ open, onClose, onGoTo, resolvedTheme }: { open: boolean; onClose: () => void; onGoTo: (view: AppView) => void; resolvedTheme: string }) {
  if (!open) return null;
  return (
    <div className="more-sheet-overlay" data-theme={resolvedTheme} onClick={onClose}>
      <div className="more-sheet-card" onClick={(e) => e.stopPropagation()}>
        <div className="more-sheet-handle" />
        <p className="more-sheet-title">More</p>
        <button className="more-sheet-item" type="button" onClick={() => onGoTo("history-detail")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          History
        </button>
        <button className="more-sheet-item" type="button" onClick={() => onGoTo("profile")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          Profile
        </button>
        <button className="more-sheet-item" type="button" onClick={() => onGoTo("glossary")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          Glossary
        </button>
      </div>
    </div>
  );
}

export function App() {
  const storedPlanBuilderState = getStoredPlanBuilderDraft();
  const [psychProfile, setPsychProfile] = useState<UserPsychProfile>(getStoredPsychProfile);
  const [appView, setAppView] = useState<AppView>("home");
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [insightsInitialTab, setInsightsInitialTab] = useState<"summary" | "stats" | "progress">("summary");
  const [glossaryTerm, setGlossaryTerm] = useState("");
  const [hasActiveWorkout, setHasActiveWorkout] = useState(false);
  const [showReadinessSheet, setShowReadinessSheet] = useState(false);
  const pendingWorkoutStartRef = useRef<(() => void) | null>(null);
  const [moodToast, setMoodToast] = useState<string | null>(null);
  const [showCompressDurationSheet, setShowCompressDurationSheet] = useState(false);
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [themePreference, setThemePreference] = useState<ThemePreference>(getStoredThemePreference);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(getSystemTheme);
  const [exercises, setExercises] = useState<ExerciseDraft[]>([]);
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);
  const [userActiveExerciseId, setUserActiveExerciseId] = useState<string | null>(null);
  const [detailsExerciseId, setDetailsExerciseId] = useState<string | null>(null);
  const [detailsScrollTarget, setDetailsScrollTarget] = useState<"top" | "bottom">("top");
  const [musclesExerciseId, setMusclesExerciseId] = useState<string | null>(null);
  const [musclesPageMode, setMusclesPageMode] = useState<"overall" | "exercise">("exercise");
  const [detailsTab, setDetailsTab] = useState<DetailTab>("summary");
  const [menuExerciseId, setMenuExerciseId] = useState<string | null>(null);
  const [workoutMenuOpen, setWorkoutMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [reorderDragId, setReorderDragId] = useState<string | null>(null);
  const [collapsedExerciseIds, setCollapsedExerciseIds] = useState<string[]>([]);
  const [focusedExpandedExerciseId, setFocusedExpandedExerciseId] = useState<string | null>(null);
  const [guidanceCollapsed, setGuidanceCollapsed] = useState(false);
  const [warmupExpanded, setWarmupExpanded] = useState(false);
  const [warmupDismissed, setWarmupDismissed] = useState(false);
  const [cooldownDismissed, setCooldownDismissed] = useState(false);
  const [timingOpen, setTimingOpen] = useState(false);
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const [finishWorkoutDraft, setFinishWorkoutDraft] = useState<FinishWorkoutDraft | null>(null);
  const [savedWorkoutData, setSavedWorkoutData] = useState<SavedWorkoutData | null>(null);
  const [workoutPlans, setWorkoutPlans] = useState<WorkoutPlan[]>(getStoredWorkoutPlans);
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  const [planBuilderDraft, setPlanBuilderDraft] = useState<WorkoutPlan | null>(
    storedPlanBuilderState?.draft ?? null
  );
  const [planBuilderMode, setPlanBuilderMode] = useState<PlanBuilderMode>(
    storedPlanBuilderState?.mode ?? "create"
  );
  const [lastGenConfig, setLastGenConfig] = useState<GenConfig | null>(null);
  const [plannerGenDraftConfig, setPlannerGenDraftConfig] = useState<GenConfig>({
    goal: "Hypertrophy",
    muscles: [],
    duration: "45 min",
    equipment: psychProfile.equipmentAccess ?? "full_gym",
    seedOffset: 0,
  });
  const [plannerView, setPlannerView] = useState<"mine" | "library" | "generate">("mine");
  const [activePlanSession, setActivePlanSession] = useState<ActivePlanSession>(null);
  const [discardReturnView, setDiscardReturnView] = useState<"home" | "planner">("home");
  const [reportWorkout, setReportWorkout] = useState<SavedWorkoutData | null>(null);
  const [historyDetailWorkout, setHistoryDetailWorkout] = useState<SavedWorkoutData | null>(null);
  const [historyDetailReturnView, setHistoryDetailReturnView] = useState<AppView>("planner");
  const [historyDetailPlanContext, setHistoryDetailPlanContext] = useState<{ weekIdx: number; dayIdx: number; label: string; sessionNum: number } | null>(null);
  const [savedWorkoutsList, setSavedWorkoutsList] = useState<SavedWorkoutData[]>(getStoredSavedWorkouts);
  const [templateApplyPromptImages, setTemplateApplyPromptImages] = useState<WorkoutMediaAsset[] | null>(null);
  const [tagPlanId, setTagPlanId] = useState<string | null>(null);
  const [tagPlanDraft, setTagPlanDraft] = useState<string[]>([]);
  const [tagPlanSearch, setTagPlanSearch] = useState("");
  const [builderAddExerciseOpen, setBuilderAddExerciseOpen] = useState(false);
  const [trayDiscardOpen, setTrayDiscardOpen] = useState(false);
  const [supersetSheetExerciseId, setSupersetSheetExerciseId] = useState<string | null>(null);
  const [smartReplaceExerciseId, setSmartReplaceExerciseId] = useState<string | null>(null);
  const [smartReplaceSheetOpen, setSmartReplaceSheetOpen] = useState(false);
  const [smartReplaceReason, setSmartReplaceReason] = useState<ReplacementReason>("preference");
  const [hiddenSuggestionIds, setHiddenSuggestionIds] = useState<Set<string>>(getStoredHiddenSuggestions);
  const [supersetSelectionIds, setSupersetSelectionIds] = useState<string[]>([]);
  const [exerciseRestDefaults, setExerciseRestDefaults] = useState<ExerciseRestDefaults>({});
  const [customExercises, setCustomExercises] = useState<ExerciseDraft[]>(getStoredCustomExercises);
  const [editingCustomExerciseId, setEditingCustomExerciseId] = useState<string | null>(null);
  const [noteEditorExerciseId, setNoteEditorExerciseId] = useState<string | null>(null);
  const [noteEditorValue, setNoteEditorValue] = useState("");
  const [restTimerEditorExerciseId, setRestTimerEditorExerciseId] = useState<string | null>(null);
  const [restTimerEditorValue, setRestTimerEditorValue] = useState("");
  const [saveRestTimerToDefault, setSaveRestTimerToDefault] = useState(false);
  const [settings, setSettings] = useState<WorkoutSettings>(getStoredWorkoutSettings);
  const [workoutMeta, setWorkoutMeta] = useState<WorkoutMeta>(defaultWorkoutMeta);
  const [setTypePickerRowId, setSetTypePickerRowId] = useState<string | null>(null);
  const [swipeState, setSwipeState] = useState<SwipeState>(createInitialSwipeState);
  const swipeStateRef = useRef<SwipeState>(createInitialSwipeState());
  const [revealedDeleteRowId, setRevealedDeleteRowId] = useState<string | null>(null);
  const [state, setState] = useState<FlowState>(defaultState);
  const onboardingComplete = psychProfile.onboardingCompletedAt !== null;
  const [showPostOnboarding, setShowPostOnboarding] = useState(false);
  const [repiqPlan, setRepiqPlan] = useState<RepIQPlan | null>(getStoredRepIQPlan);
  const [repiqUpdatePrompt, setRepiqUpdatePrompt] = useState<{ weekIdx: number; dayIdx: number; completedExerciseIds: string[] } | null>(null);
  // tracks which repiq session is currently being logged, so we can tag the saved workout
  const [activeRepIQSessionKey, setActiveRepIQSessionKey] = useState<string | null>(null);
  const [activeWorkoutIsRedo, setActiveWorkoutIsRedo] = useState(false);
  // no cross-plan modal — plan is flagged silently and user is prompted contextually
  const DEV_MODE = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("dev");
  const [showDevPage, setShowDevPage] = useState(DEV_MODE);
  const [devBypassGate, setDevBypassGate] = useState(false);
  const [plannerInitialMode, setPlannerInitialMode] = useState<"repiq" | "custom">("repiq");
  const [inlineGuidanceOpen, setInlineGuidanceOpen] = useState(false);
  // Session-level guidance toggles — initialized from settings at session start, never written back to settings
  const [sessionGuidanceInline, setSessionGuidanceInline] = useState(() => settings.guidanceInline);
  const [sessionGuidanceTopStrip, setSessionGuidanceTopStrip] = useState(() => settings.guidanceTopStrip);
  const [showTopGuidance, setShowTopGuidance] = useState(false);
  const [topGuidanceExpanded, setTopGuidanceExpanded] = useState(false);
  const [topGuidancePullDistance, setTopGuidancePullDistance] = useState(0);
  const [activeRestTimer, setActiveRestTimer] = useState<ActiveRestTimer>(null);
  const [restDockMinimized, setRestDockMinimized] = useState(false);
  const [showBottomRestDock, setShowBottomRestDock] = useState(true);
  const [loggerRewards, setLoggerRewards] = useState<LoggerReward[]>([]);
  const [rewardSheetOpen, setRewardSheetOpen] = useState(false);
  const titleHoldTimer = useRef<number | null>(null);
  const titleHoldTriggered = useRef(false);
  const pullStartY = useRef<number | null>(null);
  const pullPointerId = useRef<number | null>(null);
  const pullGestureActive = useRef(false);
  const guidancePullStartY = useRef<number | null>(null);
  const guidancePullActive = useRef(false);
  const topStripClosedRef = useRef(false);
  const [pullDownDistance, setPullDownDistance] = useState(0);
  const topSectionRef = useRef<HTMLDivElement | null>(null);

  function updateSwipeState(nextState: SwipeState | ((current: SwipeState) => SwipeState)) {
    const resolvedState =
      typeof nextState === "function" ? nextState(swipeStateRef.current) : nextState;
    swipeStateRef.current = resolvedState;
    setSwipeState(resolvedState);
  }

  const allExercisesComplete = getFirstIncompleteExerciseId(exercises) === null;
  const resolvedActiveExerciseId =
    allExercisesComplete ? null : activeExerciseId ?? getDefaultActiveExerciseId(exercises);
  const activeExercise =
    (resolvedActiveExerciseId
      ? exercises.find((exercise) => exercise.id === resolvedActiveExerciseId)
      : null) ?? exercises[0] ?? null;
  const activeExerciseIndex = resolvedActiveExerciseId
    ? exercises.findIndex((exercise) => exercise.id === resolvedActiveExerciseId)
    : -1;
  const resolvedFocusedExpandedExerciseId =
    focusedExpandedExerciseId &&
    exercises.some(
      (exercise) =>
        exercise.id === focusedExpandedExerciseId && !collapsedExerciseIds.includes(exercise.id)
    )
      ? focusedExpandedExerciseId
      : null;
  const activeCustomExercises = useMemo(
    () => customExercises.filter((exercise) => exercise.libraryStatus !== "archived"),
    [customExercises]
  );
  const existingUserTags = useMemo(() => getExistingUserTags(workoutPlans), [workoutPlans]);
  const availableExerciseTemplates = useMemo(
    () => [...exerciseTemplates, ...activeCustomExercises],
    [activeCustomExercises]
  );
  const editingCustomExercise =
    customExercises.find((exercise) => exercise.id === editingCustomExerciseId) ?? null;
  const detailsCustomExercise =
    customExercises.find((exercise) => exercise.id === detailsExerciseId) ?? null;
  const detailsExercise =
    exercises.find((exercise) => exercise.id === detailsExerciseId) ??
    customExercises.find((exercise) => exercise.id === detailsExerciseId) ??
    availableExerciseTemplates.find((exercise) => exercise.id === detailsExerciseId) ??
    null;
  const musclesExercise =
    exercises.find((exercise) => exercise.id === musclesExerciseId) ?? null;
  const supersetSheetExercise =
    exercises.find((exercise) => exercise.id === supersetSheetExerciseId) ?? null;
  const restTimerEditorExercise =
    exercises.find((exercise) => exercise.id === restTimerEditorExerciseId) ?? null;
  const activeMenuExercise =
    exercises.find((exercise) => exercise.id === menuExerciseId) ?? null;
  const activeRestExercise =
    activeRestTimer ? exercises.find((exercise) => exercise.id === activeRestTimer.exerciseId) ?? null : null;
  const resolvedTheme = themePreference === "system" ? systemTheme : themePreference;
  const hasGuidance = state.status !== "idle" || state.suggestion || state.message;
  const guidanceTip =
    state.status === "loading"
      ? "Reviewing your latest logged sets before suggesting the next move."
      : state.suggestion?.what ?? fallbackGuidanceTip;
  const guidanceWhy =
    state.status === "loading"
      ? "RepIQ is checking your completed sets against recent sessions so the next prompt reflects your actual workout pattern, not just the plan on paper."
      : state.suggestion?.why ?? state.message ?? fallbackGuidanceWhy;
  const hasExercises = exercises.length > 0;
  const hasStartedExercise = exercises.some((exercise) => isExerciseStarted(exercise));
  const showTopGuidanceSurface =
    hasExercises && sessionGuidanceTopStrip && showTopGuidance && !allExercisesComplete;

  const activeRestSeconds =
    activeRestTimer
      ? activeRestTimer.pausedRemainingSeconds ??
        Math.max(0, Math.ceil(((activeRestTimer.endAt ?? 0) - clockTick) / 1000))
      : 0;
  const stickyRestProgressPercent =
    activeRestTimer && activeRestTimer.totalSeconds > 0
      ? Math.max(0, Math.min(100, (activeRestSeconds / activeRestTimer.totalSeconds) * 100))
      : 0;
  const showStickyRestDock =
    showBottomRestDock && activeRestTimer !== null && activeRestSeconds > 0;

  const workoutSummary = useMemo(() => {
    return exercises.reduce(
      (summary, exercise) => {
        const lastSession = exercise.history[exercise.history.length - 1];
        const completed = buildCompletedSets(
          exercise.draftSets,
          lastSession,
          settings.carryForwardDefaults,
          getExerciseMeasurementType(exercise)
        ).resolvedSets;
        return {
          sets: summary.sets + completed.length,
          volume:
            summary.volume +
            completed.reduce((total, set) => total + set.weight * set.reps, 0)
        };
      },
      { sets: 0, volume: 0 }
    );
  }, [exercises, settings.carryForwardDefaults]);

  const incompleteSetCount = useMemo(
    () =>
      exercises.reduce(
        (count, exercise) => count + exercise.draftSets.filter((set) => !set.done).length,
        0
      ),
    [exercises]
  );

  const completedSetCount = useMemo(
    () =>
      exercises.reduce(
        (count, exercise) => count + exercise.draftSets.filter((set) => set.done).length,
        0
      ),
    [exercises]
  );

  const rewardSummary = useMemo(() => {
    return loggerRewards.reduce(
      (summary, reward) => {
        summary.total += 1;
        summary[reward.level] += 1;
        return summary;
      },
      { total: 0, set: 0, exercise: 0, session: 0 }
    );
  }, [loggerRewards]);

  const derivedDuration = useMemo(
    () => formatElapsedDuration(workoutMeta.date, workoutMeta.startTime, workoutMeta.startInstant),
    [clockTick, workoutMeta.date, workoutMeta.startTime, workoutMeta.startedMinutesAgo, workoutMeta.startInstant]
  );

  useEffect(() => {
    if (planBuilderDraft && planBuilderMode !== "edit") {
      persistPlanBuilderDraft(planBuilderDraft, planBuilderMode);
      return;
    }
    persistPlanBuilderDraft(null, "create");
  }, [planBuilderDraft, planBuilderMode]);

  useEffect(() => {
    if (!resolvedFocusedExpandedExerciseId) {
      return;
    }

    window.requestAnimationFrame(() => {
      const card = document.querySelector<HTMLElement>(
        `[data-exercise-card-id="${resolvedFocusedExpandedExerciseId}"]`
      );
      card?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    });
  }, [resolvedFocusedExpandedExerciseId]);

  function buildPlanFromCurrentExercises(basePlan?: WorkoutPlan | null): WorkoutPlan {
    const now = new Date().toISOString();
    return {
      id: basePlan?.id ?? `plan-${Date.now()}`,
      name: workoutMeta.sessionName.trim() || basePlan?.name || generateWorkoutName(exercises),
      tag: basePlan?.tag ?? "",
      userTags: basePlan?.userTags ?? [],
      note: basePlan?.note ?? "",
      exercises: exercises.map((exercise) => ({
        exerciseId:
          availableExerciseTemplates.find(
            (template) => exercise.id === template.id || exercise.id.startsWith(`${template.id}-`)
          )?.id ?? exercise.id,
        setCount: exercise.draftSets.length,
        restTimer: exercise.restTimer,
        note: exercise.note.trim() || undefined
      })),
      createdAt: basePlan?.createdAt ?? now,
      updatedAt: now
    };
  }

  function activeWorkoutHasTemplateChanges() {
    if (activePlanSession?.source !== "saved" || !activePlanSession.originalPlan) {
      return false;
    }
    const currentPlan = buildPlanFromCurrentExercises(activePlanSession.originalPlan);
    return JSON.stringify(normalizePlanForComparison(currentPlan)) !== JSON.stringify(normalizePlanForComparison(activePlanSession.originalPlan));
  }

  function finalizeFinishedWorkoutSave(images: WorkoutMediaAsset[], applyTemplateChanges: boolean) {
    if (!finishWorkoutDraft) return;

    if (applyTemplateChanges && activePlanSession?.source === "saved" && activePlanSession.originalPlan) {
      const updatedPlan = buildPlanFromCurrentExercises(activePlanSession.originalPlan);
      savePlan(updatedPlan);
    }

    const completedCustomSessions = exercises.flatMap((exercise) => {
      const matchingTemplate = customExercises.find(
        (template) => exercise.id === template.id || exercise.id.startsWith(`${template.id}-`)
      );
      if (!matchingTemplate) {
        return [];
      }

      const lastSession = exercise.history[exercise.history.length - 1];
      const completedSets = buildCompletedSets(
        exercise.draftSets,
        lastSession,
        settings.carryForwardDefaults,
        getExerciseMeasurementType(exercise)
      ).resolvedSets;

      if (completedSets.length === 0) {
        return [];
      }

      return [
        {
          templateId: matchingTemplate.id,
          session: {
            date: workoutMeta.date,
            exercise: matchingTemplate.name,
            session_key: `${matchingTemplate.id}-${Date.now()}-${exercise.id}`,
            sets: completedSets
          } satisfies ExerciseHistorySession
        }
      ];
    });

    if (completedCustomSessions.length > 0) {
      setCustomExercises((current) =>
        current.map((exercise) => {
          const matchingSessions = completedCustomSessions.filter(
            (entry) => entry.templateId === exercise.id
          );
          if (matchingSessions.length === 0) {
            return exercise;
          }

          return cloneExerciseDraft(exercise, {
            history: [...exercise.history, ...matchingSessions.map((entry) => entry.session)]
          });
        })
      );
    }

    const saved: SavedWorkoutData = {
      ...finishWorkoutDraft,
      images,
      savedAt: new Date().toISOString(),
      ...(activeRepIQSessionKey ? { repiqSourceKey: activeRepIQSessionKey } : {}),
      workoutSource: activeRepIQSessionKey ? "repiq"
        : activePlanSession ? (activePlanSession.source as "saved" | "library" | "generated" | "quick")
        : activeWorkoutIsRedo ? "history"
        : "quick",
    };
    persistSavedWorkout(saved);

    // ── Passive psych capture (zero user friction) ──────────────────────────
    // Automatically record behavioral signals for every completed session.
    // This seeds the V2 psychological intelligence layer from day one.
    const psychProfile = getStoredPsychProfile();
    if (psychProfile.capturePassiveBehavior) {
      const source: SessionSource = activePlanSession
        ? activePlanSession.source === "saved" ? "plan"
          : activePlanSession.source === "library" ? "template"
          : "generated"
        : "quick";
      const signals = buildSessionBehaviorSignals(
        saved.savedAt,
        {
          date: saved.date,
          startInstant: workoutMeta.startInstant,
          duration: saved.duration,
          exerciseCount: saved.exerciseCount,
          totalSets: saved.totalSets,
        },
        activePlanSession?.originalPlan
          ? { id: activePlanSession.originalPlan.id, exercises: activePlanSession.originalPlan.exercises }
          : null,
        source,
        0,   // TODO: wire restTimerUseCount from logger state
        0,   // TODO: wire midSessionExercisesAdded from logger state
      );
      persistSessionBehavior(signals);
      // Link today's readiness entry to this session if one was captured
      const todayReadiness = getTodayReadiness();
      if (todayReadiness && !todayReadiness.followedBySessionId) {
        persistDailyReadiness({ ...todayReadiness, followedBySessionId: saved.savedAt });
      }
    }
    // ── End passive psych capture ───────────────────────────────────────────

    setSavedWorkoutData(saved);
    setReportWorkout(saved);
    setSavedWorkoutsList(getStoredSavedWorkouts());
    setTemplateApplyPromptImages(null);
    // ── RepIQ plan day completion ──────────────────────────────────────────────
    const snapshotSession = activePlanSession;
    setActivePlanSession(null);
    setActiveWorkoutIsRedo(false);
    resetWorkout();
    setHasActiveWorkout(false);
    if (snapshotSession?.source === "repiq" && repiqPlan) {
      const { weekIdx, dayIdx } = snapshotSession;
      const completedAt = new Date().toISOString();
      const updatedWeeks = repiqPlan.weeks.map((week, wi) => {
        if (wi !== weekIdx) return week;
        const updatedDays = week.days.map((day, di) => {
          if (di !== dayIdx) return day;
          return { ...day, completedAt };
        });
        const weekDone = updatedDays.every((d) => d.completedAt !== null);
        return { ...week, days: updatedDays, isCompleted: weekDone };
      });
      // Advance currentWeekIndex if current week just completed
      const currentWeekCompleted = updatedWeeks[repiqPlan.currentWeekIndex]?.isCompleted;
      const newCurrentWeekIndex = currentWeekCompleted
        ? Math.min(repiqPlan.currentWeekIndex + 1, repiqPlan.weeks.length - 1)
        : repiqPlan.currentWeekIndex;
      // Volume compensation: add deficit sets to next sessions targeting same muscles
      const compensatedPlan = computeVolumeCompensation(
        { ...repiqPlan, weeks: updatedWeeks, currentWeekIndex: newCurrentWeekIndex },
        weekIdx,
        dayIdx,
        exercises,
        availableExerciseTemplates
      );
      // Check if any planned exercise had fewer working sets done than planned (volume deficit)
      // Warm-up sets are excluded — deleting a warm-up set should NOT trigger needsReview
      const planDay = repiqPlan.weeks[weekIdx]?.days[dayIdx];
      let hasDeficit = false;
      if (planDay) {
        for (const pe of planDay.exercises) {
          const loggedEx = exercises.find((e) => e.id === pe.exerciseId);
          const actualWorkingDone = loggedEx ? loggedEx.draftSets.filter((s) => s.done && s.setType !== "warmup").length : 0;
          if (actualWorkingDone < pe.sets) { hasDeficit = true; break; }
        }
      }
      if (hasDeficit) {
        const flaggedPlan: RepIQPlan = {
          ...compensatedPlan,
          needsReview: true,
        };
        persistRepIQPlan(flaggedPlan);
        setRepiqPlan(flaggedPlan);
      } else {
        persistRepIQPlan(compensatedPlan);
        setRepiqPlan(compensatedPlan);
      }
      // Check if today's exercises differ from plan (exercise swaps)
      const planExIds = new Set(planDay?.exercises.map((e) => e.exerciseId) ?? []);
      const actualExIds = exercises.map((e) => e.id);
      const hasDiff = actualExIds.some((id) => !planExIds.has(id)) || planExIds.size !== actualExIds.length;
      if (hasDiff) {
        setRepiqUpdatePrompt({ weekIdx, dayIdx, completedExerciseIds: actualExIds });
      }
    } else if (!activeRepIQSessionKey && repiqPlan && repiqPlan.status !== "paused") {
      // Non-plan workout completed while RepIQ plan is active.
      // Only flag if it occurred after the last plan regeneration (i.e., not already accounted for).
      const lastRegen = repiqPlan.lastRegeneratedAt ?? repiqPlan.generatedAt;
      if (saved.savedAt > lastRegen) {
        const updatedPlan: RepIQPlan = {
          ...repiqPlan,
          needsReview: true,
          extraVolumeCount: (repiqPlan.extraVolumeCount ?? 0) + 1,
          extraVolumeWorkoutIds: [...(repiqPlan.extraVolumeWorkoutIds ?? []), saved.savedAt],
        };
        persistRepIQPlan(updatedPlan);
        setRepiqPlan(updatedPlan);
      }
    }
    setActiveRepIQSessionKey(null);
    setAppView("report");
  }

  function buildFinishWorkoutDraft(ignoredIncompleteSets: number): FinishWorkoutDraft {
    const exerciseSummaries = exercises
      .map((exercise) => {
        const lastSession = exercise.history[exercise.history.length - 1];
        const completedSets = buildCompletedSets(
          exercise.draftSets,
          lastSession,
          settings.carryForwardDefaults,
          getExerciseMeasurementType(exercise)
        ).resolvedSets;

        return {
          id: exercise.id,
          name: exercise.name,
          primaryMuscle: exercise.primaryMuscle,
          loggedSets: completedSets.length,
          loggedVolume: sumSessionVolume(completedSets),
          sets: completedSets.map(s => ({ weight: s.weight, reps: s.reps, rpe: s.rpe ?? null, setType: s.set_type })),
        };
      })
      ;

    const rewardSnapshot = [...loggerRewards];
    const rewardSnapshotSummary = summarizeRewards(rewardSnapshot);

    let takeawayTitle = "Workout ready to save";
    let takeawayBody =
      "RepIQ has captured this workout review. Save it now, and richer report generation can build on top of this clean log.";

    if (rewardSnapshotSummary.total > 0) {
      takeawayTitle =
        rewardSnapshotSummary.total === 1
          ? "One clear progress signal"
          : `${rewardSnapshotSummary.total} progress wins spotted`;
      takeawayBody =
        rewardSnapshotSummary.exercise > 0
          ? `You earned ${rewardSnapshotSummary.exercise} exercise-level and ${rewardSnapshotSummary.set} set-level rewards in this workout.`
          : `You earned ${rewardSnapshotSummary.set} set-level ${rewardSnapshotSummary.set === 1 ? "reward" : "rewards"} in this workout.`;
    } else if (exerciseSummaries.length > 0) {
      takeawayTitle = "Clean workout log";
      takeawayBody = `${exerciseSummaries.length} ${
        exerciseSummaries.length === 1 ? "exercise was" : "exercises were"
      } logged with ${workoutSummary.sets} completed ${
        workoutSummary.sets === 1 ? "set" : "sets"
      } ready to save.`;
    }

    const elapsedSeconds = workoutMeta.startInstant
      ? Math.floor((Date.now() - Date.parse(workoutMeta.startInstant)) / 1000)
      : 0;

    return {
      sessionName: workoutMeta.sessionName.trim() || generateWorkoutName(exercises),
      note: "",
      date: workoutMeta.date,
      duration: derivedDuration,
      durationSeconds: elapsedSeconds,
      totalVolume: workoutSummary.volume,
      totalSets: workoutSummary.sets,
      exerciseCount: exercises.length,
      loggedExerciseCount: exerciseSummaries.length,
      ignoredIncompleteSets,
      exercises: exerciseSummaries,
      rewards: rewardSnapshot,
      rewardSummary: rewardSnapshotSummary,
      takeawayTitle,
      takeawayBody,
      images: []
    };
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = (event?: MediaQueryListEvent) => {
      setSystemTheme(event?.matches ?? mediaQuery.matches ? "dark" : "light");
    };

    updateTheme();
    mediaQuery.addEventListener("change", updateTheme);

    return () => mediaQuery.removeEventListener("change", updateTheme);
  }, []);

  // Reset insights tab to Analyzer whenever user navigates away from Insights
  useEffect(() => {
    if (appView !== "insights") setInsightsInitialTab("summary");
  }, [appView]);

  useEffect(() => {
    setLoggerRewards(recomputeLoggerRewards(exercises, settings.carryForwardDefaults));
  }, [exercises, settings.carryForwardDefaults]);

  useEffect(() => {
    if (!hasActiveWorkout) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setClockTick(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [hasActiveWorkout]);

  // Auto-dismiss mood toast after 4 seconds
  useEffect(() => {
    if (!moodToast) return undefined;
    const t = window.setTimeout(() => setMoodToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [moodToast]);

  useEffect(() => {
    if (activeRestTimer && activeRestTimer.pausedRemainingSeconds === null && activeRestSeconds <= 0) {
      setActiveRestTimer(null);
    }
  }, [activeRestSeconds, activeRestTimer]);

  useEffect(() => {
    setRestDockMinimized(false);
  }, [activeRestTimer?.exerciseId]);

  useEffect(() => {
    if (!showStickyRestDock) {
      setRestDockMinimized(false);
    }
  }, [showStickyRestDock]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
    window.localStorage.setItem(themeStorageKey, themePreference);
  }, [resolvedTheme, themePreference]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(workoutSettingsStorageKey, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(customExercisesStorageKey, JSON.stringify(customExercises));
  }, [customExercises]);

  useEffect(() => {
    if (typeof document === "undefined" || !setTypePickerRowId) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof HTMLElement &&
        !event.target.closest("[data-set-type-picker]") &&
        !event.target.closest("[data-set-type-trigger]")
      ) {
        setSetTypePickerRowId(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [setTypePickerRowId]);

  useEffect(() => {
    if (!pullGestureActive.current) {
      return undefined;
    }

    return () => {
      pullGestureActive.current = false;
      pullStartY.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !sessionGuidanceTopStrip) {
      setShowTopGuidance(false);
      setTopGuidanceExpanded(false);
      setTopGuidancePullDistance(0);
      return undefined;
    }

    const updateTopGuidanceVisibility = () => {
      const topSectionBottom = topSectionRef.current?.getBoundingClientRect().bottom ?? 0;
      if (topSectionBottom >= 0) {
        // Scrolled back up past the top section — reset explicit-close flag
        topStripClosedRef.current = false;
      }
      if (!topStripClosedRef.current) {
        setShowTopGuidance(topSectionBottom < 0);
      }
    };

    updateTopGuidanceVisibility();
    window.addEventListener("scroll", updateTopGuidanceVisibility, { passive: true });
    window.addEventListener("resize", updateTopGuidanceVisibility);

    return () => {
      window.removeEventListener("scroll", updateTopGuidanceVisibility);
      window.removeEventListener("resize", updateTopGuidanceVisibility);
    };
  }, [hasGuidance, sessionGuidanceTopStrip]);

  useEffect(() => {
    if (!showTopGuidance) {
      setTopGuidanceExpanded(false);
      setTopGuidancePullDistance(0);
    }
  }, [showTopGuidance]);

  useEffect(() => {
    if (!showTopGuidanceSurface) return;
    function handleOutsideClick(e: MouseEvent) {
      const strip = document.querySelector(".guidance-top-helper");
      if (strip && !strip.contains(e.target as Node)) {
        topStripClosedRef.current = true;
        setTopGuidanceExpanded(false);
        setShowTopGuidance(false);
      }
    }
    document.addEventListener("click", handleOutsideClick, { capture: true });
    return () => document.removeEventListener("click", handleOutsideClick, { capture: true });
  }, [showTopGuidanceSurface]);

  useEffect(() => {
    const validUserActiveExerciseId =
      userActiveExerciseId &&
      exercises.some(
        (exercise) => exercise.id === userActiveExerciseId && !isExerciseComplete(exercise)
      )
        ? userActiveExerciseId
        : null;

    if (!validUserActiveExerciseId && userActiveExerciseId) {
      setUserActiveExerciseId(null);
    }

    const nextActiveExerciseId =
      validUserActiveExerciseId ?? getDefaultActiveExerciseId(exercises);

    if (nextActiveExerciseId !== activeExerciseId) {
      setActiveExerciseId(nextActiveExerciseId);
    }
  }, [activeExerciseId, exercises, userActiveExerciseId]);

  function openDetails(
    exerciseId: string,
    tab: DetailTab = "summary",
    scrollTarget: "top" | "bottom" = "top"
  ) {
    setDetailsExerciseId(exerciseId);
    setDetailsTab(tab);
    setDetailsScrollTarget(scrollTarget);
  }

  function getFirstNotStartedExerciseId(exerciseList: ExerciseDraft[]) {
    return exerciseList.find((exercise) => !isExerciseComplete(exercise) && !isExerciseStarted(exercise))?.id ?? null;
  }

  function getDefaultActiveExerciseId(exerciseList: ExerciseDraft[]) {
    const firstIncompleteExerciseId = getFirstIncompleteExerciseId(exerciseList);

    if (!firstIncompleteExerciseId) {
      return null;
    }

    const firstIncompleteExercise = exerciseList.find(
      (exercise) => exercise.id === firstIncompleteExerciseId
    );

    if (firstIncompleteExercise && isExerciseStarted(firstIncompleteExercise)) {
      return firstIncompleteExerciseId;
    }

    return getFirstNotStartedExerciseId(exerciseList) ?? firstIncompleteExerciseId;
  }

  function getFirstIncompleteExerciseId(exerciseList: ExerciseDraft[]) {
    return exerciseList.find((exercise) => !isExerciseComplete(exercise))?.id ?? null;
  }

  function getNextActiveExerciseIdFromProgress(
    exerciseList: ExerciseDraft[],
    fallbackExerciseId?: string
  ) {
    return (
      getFirstIncompleteExerciseId(exerciseList) ??
      fallbackExerciseId ??
      exerciseList[0]?.id ??
      null
    );
  }

  function getNextIncompleteExerciseIdAfter(
    exerciseList: ExerciseDraft[],
    exerciseId: string
  ) {
    const currentIndex = exerciseList.findIndex((exercise) => exercise.id === exerciseId);
    if (currentIndex === -1) {
      return null;
    }

    for (let index = currentIndex + 1; index < exerciseList.length; index += 1) {
      if (!isExerciseComplete(exerciseList[index])) {
        return exerciseList[index].id;
      }
    }

    return null;
  }

  function setInteractedExerciseActive(exerciseId: string) {
    const exercise = exercises.find((entry) => entry.id === exerciseId);
    if (!exercise || isExerciseComplete(exercise)) {
      return;
    }
    const hasInProgressExercise = exercises.some((entry) => isExerciseInProgress(entry));
    if (hasInProgressExercise && activeExerciseId !== exerciseId) {
      return;
    }
    setUserActiveExerciseId(exerciseId);
    if (activeExerciseId !== exerciseId) {
      setActiveExerciseId(exerciseId);
    }
    setCollapsedExerciseIds((current) => current.filter((id) => id !== exerciseId));
  }

  function setPreStartExerciseActive(exerciseId: string) {
    const exercise = exercises.find((entry) => entry.id === exerciseId);
    if (!exercise || isExerciseComplete(exercise)) {
      return;
    }
    setUserActiveExerciseId(exerciseId);
    if (activeExerciseId !== exerciseId) {
      setActiveExerciseId(exerciseId);
    }
  }

  function toggleExerciseCollapse(exerciseId: string) {
    setCollapsedExerciseIds((current) => {
      const isCollapsed = current.includes(exerciseId);

      if (isCollapsed) {
        return current.filter((id) => id !== exerciseId);
      }

      if (exerciseId === activeExerciseId) {
        const nextActiveExercise = exercises.find(
          (exercise) => exercise.id !== exerciseId && !current.includes(exercise.id)
        );

        if (nextActiveExercise) {
          setActiveExerciseId(nextActiveExercise.id);
        }
      }

      if (resolvedFocusedExpandedExerciseId === exerciseId) {
        setFocusedExpandedExerciseId(null);
      }

      return [...current, exerciseId];
    });
    setMenuExerciseId(null);
  }

  function toggleCollapseAllExercises() {
    const allCollapsed = collapsedExerciseIds.length === exercises.length && guidanceCollapsed;
    setCollapsedExerciseIds(allCollapsed ? [] : exercises.map((exercise) => exercise.id));
    setFocusedExpandedExerciseId(null);
    setGuidanceCollapsed(!allCollapsed);
    setMenuExerciseId(null);
  }

  function openMusclesPage(exerciseId: string) {
    setMusclesPageMode("exercise");
    setMusclesExerciseId(exerciseId);
    setMenuExerciseId(null);
  }

  function openWorkoutMusclesPage() {
    if (!activeExercise) {
      return;
    }
    setMusclesPageMode("overall");
    setMusclesExerciseId(activeExercise.id);
    setMenuExerciseId(null);
  }

  function beginTitleHold(exerciseId: string) {
    if (titleHoldTimer.current) {
      window.clearTimeout(titleHoldTimer.current);
    }

    titleHoldTriggered.current = false;
    titleHoldTimer.current = window.setTimeout(() => {
      titleHoldTriggered.current = true;
      setInteractedExerciseActive(exerciseId);
      setReorderOpen(true);
      setWorkoutMenuOpen(false);
      setMenuExerciseId(null);
    }, 420);
  }

  function endTitleHold() {
    if (titleHoldTimer.current) {
      window.clearTimeout(titleHoldTimer.current);
      titleHoldTimer.current = null;
    }
  }

  function updateDraftSet(
    exerciseId: string,
    setIndex: number,
    field: "weightInput" | "repsInput" | "rpeInput" | "done" | "failed",
    value: string | boolean
  ) {
    if (field !== "done" || value !== false) {
      setInteractedExerciseActive(exerciseId);
    }
    setExercises((current) =>
      current.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }

        return {
          ...exercise,
          draftSets: exercise.draftSets.map((set, index) => {
            if (index !== setIndex) {
              return set;
            }
            if (field === "weightInput" && typeof value === "string") {
              return { ...set, weightInput: sanitizeDecimalInput(value) };
            }
            if (field === "repsInput" && typeof value === "string") {
              return { ...set, repsInput: sanitizeIntegerInput(value) };
            }
            if (field === "rpeInput" && typeof value === "string") {
              return { ...set, rpeInput: sanitizeDecimalInput(value) };
            }
            return { ...set, [field]: value };
          })
        };
      })
    );
  }

  function applyResolvedValuesToDraftSet(
    exerciseId: string,
    setIndex: number,
    values: { weightInput?: string; repsInput?: string; rpeInput?: string }
  ) {
    setExercises((current) =>
      current.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }

        return {
          ...exercise,
          draftSets: exercise.draftSets.map((set, index) =>
            index === setIndex
              ? {
                  ...set,
                  weightInput: values.weightInput ?? set.weightInput,
                  repsInput: values.repsInput ?? set.repsInput,
                  rpeInput: values.rpeInput ?? set.rpeInput
                }
              : set
          )
        };
      })
    );
  }

  function applyPreviousValuesToDraftSet(exerciseId: string, setIndex: number) {
    const exercise = exercises.find((entry) => entry.id === exerciseId);
    if (!exercise) {
      return;
    }
    const measurementType = getExerciseMeasurementType(exercise);

    const previousSet = getPreviousReferenceSet(
      exercise.draftSets,
      setIndex,
      exercise.history[exercise.history.length - 1]
    );

    if (!previousSet) {
      return;
    }

    setInteractedExerciseActive(exerciseId);

    applyResolvedValuesToDraftSet(exerciseId, setIndex, {
      weightInput: usesWeightInputForMeasurement(measurementType)
        ? String(previousSet.weight)
        : "",
      repsInput: String(previousSet.reps),
      rpeInput:
        typeof previousSet.rpe === "number" && Number.isFinite(previousSet.rpe)
          ? String(previousSet.rpe)
          : ""
    });
  }

  function markSetDone(exerciseId: string, setIndex: number) {
    const exercise = exercises.find((entry) => entry.id === exerciseId);
    if (!exercise) {
      return;
    }
    const measurementType = getExerciseMeasurementType(exercise);
    const carrySource = getCurrentExerciseCarrySource(exercise.draftSets, setIndex);

    const previousSet = getPreviousReferenceSet(
      exercise.draftSets,
      setIndex,
      exercise.history[exercise.history.length - 1]
    );
    const draftSet = exercise.draftSets[setIndex];
    const resolvedWeightInput = usesWeightInputForMeasurement(measurementType)
      ? settings.carryForwardDefaults &&
        draftSet.weightInput.trim().length === 0
          ? carrySource?.weightInput?.trim().length
            ? carrySource.weightInput
            : previousSet
              ? String(previousSet.weight)
              : ""
          : draftSet.weightInput
      : "";
    const resolvedRepsInput =
      settings.carryForwardDefaults &&
      draftSet.repsInput.trim().length === 0
        ? carrySource?.repsInput?.trim().length
          ? carrySource.repsInput
          : previousSet
            ? String(previousSet.reps)
            : ""
        : draftSet.repsInput;
    const resolvedRpeInput =
      settings.carryForwardDefaults &&
      draftSet.rpeInput.trim().length === 0
        ? carrySource?.rpeInput?.trim().length
          ? carrySource.rpeInput
          : typeof previousSet?.rpe === "number" && Number.isFinite(previousSet.rpe)
            ? String(previousSet.rpe)
            : ""
        : draftSet.rpeInput;

    const nextExercises = exercises.map((currentExercise) => {
      if (currentExercise.id !== exerciseId) {
        return currentExercise;
      }

      return {
        ...currentExercise,
        draftSets: currentExercise.draftSets.map((set, index) =>
          index === setIndex
            ? {
                ...set,
                weightInput: resolvedWeightInput,
                repsInput: resolvedRepsInput,
                rpeInput: resolvedRpeInput,
                done: true
              }
            : set
        )
      };
    });

    setExercises(nextExercises);

    const didCompleteExerciseBoundary = setIndex === exercise.draftSets.length - 1;
    const nextActiveExerciseId = didCompleteExerciseBoundary
      ? getFirstIncompleteExerciseId(nextExercises)
      : exerciseId;

    if (nextActiveExerciseId) {
      setActiveExerciseId(nextActiveExerciseId);
      setCollapsedExerciseIds((current) =>
        current.filter((id) => id !== nextActiveExerciseId)
      );
    }

    if (!didCompleteExerciseBoundary) {
      setUserActiveExerciseId(exerciseId);
      startRestTimer(nextActiveExerciseId ?? exerciseId, undefined, "exercise");
      return;
    }

    setUserActiveExerciseId(null);

    if (nextActiveExerciseId) {
      startRestTimer(nextActiveExerciseId, settings.transitionRestSeconds, "transition");
      return;
    }

    stopRestTimer();
  }

  function markSetUndone(exerciseId: string, setIndex: number) {
    const nextExercises = exercises.map((exercise) => {
      if (exercise.id !== exerciseId) {
        return exercise;
      }

      return {
        ...exercise,
        draftSets: exercise.draftSets.map((set, index) =>
          index === setIndex ? { ...set, done: false } : set
        )
      };
    });

    setExercises(nextExercises);
    setUserActiveExerciseId(exerciseId);
    setCollapsedExerciseIds((current) => current.filter((id) => id !== exerciseId));
    stopRestTimer(exerciseId);
  }

  function updateExerciseNote(exerciseId: string, note: string) {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, note } : exercise
      )
    );
  }

  function setExerciseStickyNoteEnabled(exerciseId: string, enabled: boolean) {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, stickyNoteEnabled: enabled } : exercise
      )
    );
  }

  function openNoteEditor(exerciseId: string) {
    const exercise = exercises.find((entry) => entry.id === exerciseId);
    if (!exercise) {
      return;
    }

    setNoteEditorExerciseId(exerciseId);
    setNoteEditorValue(exercise.note);
    setMenuExerciseId(null);
  }

  function enableStickyNote(exerciseId: string) {
    setExerciseStickyNoteEnabled(exerciseId, true);
    setMenuExerciseId(null);
  }

  function hideStickyNote(exerciseId: string) {
    setExerciseStickyNoteEnabled(exerciseId, false);
    if (noteEditorExerciseId === exerciseId) {
      closeNoteEditor();
    }
    setMenuExerciseId(null);
  }

  function closeNoteEditor() {
    setNoteEditorExerciseId(null);
    setNoteEditorValue("");
  }

  function saveNoteEditor() {
    if (!noteEditorExerciseId) {
      return;
    }

    updateExerciseNote(noteEditorExerciseId, noteEditorValue.trim());
    closeNoteEditor();
  }

  function updateExerciseRestTimer(exerciseId: string, restTimer: string) {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId
          ? { ...exercise, restTimer: formatMinutesSecondsInput(restTimer) }
          : exercise
      )
    );
  }

  function openRestTimerEditor(exerciseId: string) {
    const exercise = exercises.find((entry) => entry.id === exerciseId);
    if (!exercise) {
      return;
    }
    setRestTimerEditorExerciseId(exerciseId);
    setRestTimerEditorValue(exercise.restTimer);
    setSaveRestTimerToDefault(false);
  }

  function closeRestTimerEditor() {
    setRestTimerEditorExerciseId(null);
    setRestTimerEditorValue("");
    setSaveRestTimerToDefault(false);
  }

  function saveRestTimerEditor() {
    if (!restTimerEditorExercise) {
      return;
    }

    const formatted = formatMinutesSecondsInput(restTimerEditorValue);
    updateExerciseRestTimer(restTimerEditorExercise.id, formatted);
    stopRestTimer(restTimerEditorExercise.id);

    if (saveRestTimerToDefault) {
      setExerciseRestDefaults((current) => ({
        ...current,
        [restTimerEditorExercise.name]: formatted
      }));
    }

    closeRestTimerEditor();
  }

  function startRestTimer(
    exerciseId: string,
    overrideRestSeconds?: string,
    kind: "exercise" | "transition" = "exercise"
  ) {
    const exercise = exercises.find((entry) => entry.id === exerciseId);
    if (!exercise) {
      return;
    }

    const restSeconds = parseMinutesSecondsToSeconds(
      overrideRestSeconds ? formatRestTimer(overrideRestSeconds) : exercise.restTimer
    );
    if (restSeconds <= 0) {
      setActiveRestTimer(null);
      return;
    }

    const now = Date.now();
    setClockTick(now);
    setActiveRestTimer({
      exerciseId,
      endAt: now + restSeconds * 1000,
      pausedRemainingSeconds: null,
      totalSeconds: restSeconds,
      kind
    });
  }

  function stopRestTimer(exerciseId?: string) {
    setActiveRestTimer((current) => {
      if (!current) {
        return current;
      }
      if (exerciseId && current.exerciseId !== exerciseId) {
        return current;
      }
      return null;
    });
  }

  function togglePauseRestTimer(exerciseId: string) {
    setActiveRestTimer((current) => {
      if (!current || current.exerciseId !== exerciseId) {
        return current;
      }

      if (current.pausedRemainingSeconds !== null) {
        const now = Date.now();
        setClockTick(now);
        return {
          exerciseId,
          endAt: now + current.pausedRemainingSeconds * 1000,
          pausedRemainingSeconds: null,
          totalSeconds: current.totalSeconds,
          kind: current.kind
        };
      }

      const remainingSeconds = Math.max(
        0,
        Math.ceil(((current.endAt ?? Date.now()) - Date.now()) / 1000)
      );

      return {
        exerciseId,
        endAt: null,
        pausedRemainingSeconds: remainingSeconds,
        totalSeconds: current.totalSeconds,
        kind: current.kind
      };
    });
  }

  function adjustActiveRestTimer(deltaSeconds: number) {
    setActiveRestTimer((current) => {
      if (!current) {
        return current;
      }

      const currentSeconds =
        current.pausedRemainingSeconds ??
        Math.max(0, Math.ceil(((current.endAt ?? Date.now()) - Date.now()) / 1000));
      const nextSeconds = Math.max(1, currentSeconds + deltaSeconds);
      const nextTotalSeconds = Math.max(1, current.totalSeconds + deltaSeconds);

      if (current.pausedRemainingSeconds !== null) {
        return {
          ...current,
          pausedRemainingSeconds: nextSeconds,
          totalSeconds: Math.max(nextSeconds, nextTotalSeconds)
        };
      }

      const now = Date.now();
      setClockTick(now);
      return {
        ...current,
        endAt: now + nextSeconds * 1000,
        totalSeconds: Math.max(nextSeconds, nextTotalSeconds)
      };
    });
  }

  function discardWorkout() {
    resetWorkout();
    setHasActiveWorkout(false);
    setActivePlanSession(null);
    setActiveWorkoutIsRedo(false);
    setAppView(discardReturnView);
    setWorkoutMenuOpen(false);
    setDiscardConfirmOpen(false);
    setTrayDiscardOpen(false);
  }

  function requestDiscardWorkout() {
    setWorkoutMenuOpen(false);
    setDiscardConfirmOpen(true);
  }

  function returnToWorkoutSelector() {
    setMenuExerciseId(null);
    setWorkoutMenuOpen(false);
    setSettingsOpen(false);
    setAddExerciseOpen(false);
    setReorderOpen(false);
    setTimingOpen(false);
    setLeavePromptOpen(false);
    setFinishConfirmOpen(false);
    setFinishConfirmOpen(false);
    setFinishWorkoutDraft(null);
    setSupersetSheetExerciseId(null);
    setSupersetSelectionIds([]);
    setSmartReplaceExerciseId(null);
    setSetTypePickerRowId(null);
    setPullDownDistance(0);
    // Go back to where the session was started from
    setAppView(discardReturnView);
  }

  function openActiveWorkout() {
    if (!hasActiveWorkout) {
      openQuickSession();
      return;
    }
    setAppView("logger");
  }

  // ── Readiness check gate ──────────────────────────────────────────────────
  function withReadinessCheck(startFn: () => void) {
    const today = new Date().toISOString().slice(0, 10);
    const alreadyCaptured = getStoredDailyReadiness().some((r) => r.date === today);
    const capture = getStoredPsychProfile().captureDailyReadiness;
    if (capture && !alreadyCaptured) {
      pendingWorkoutStartRef.current = startFn;
      setShowReadinessSheet(true);
    } else {
      startFn();
    }
  }

  function handleReadinessSelect(rating: MoodRating) {
    const now = new Date();
    persistDailyReadiness({
      schemaVersion: 1,
      date: now.toISOString().slice(0, 10),
      capturedAt: now.toISOString(),
      overallReadiness: rating,
      sleepQuality: null,
      stressLevel: null,
      energyLevel: null,
      followedBySessionId: null,
      skippedPlannedSession: false,
    });
    const fn = pendingWorkoutStartRef.current;
    pendingWorkoutStartRef.current = null;
    setShowReadinessSheet(false);
    setMoodToast(pickMoodMessage(rating));
    fn?.();
  }

  function handleReadinessSkip() {
    const fn = pendingWorkoutStartRef.current;
    pendingWorkoutStartRef.current = null;
    setShowReadinessSheet(false);
    fn?.();
  }

  function handleReadinessDontAskAgain() {
    const updated = { ...psychProfile, captureDailyReadiness: false };
    setPsychProfile(updated);
    persistPsychProfile(updated);
    const fn = pendingWorkoutStartRef.current;
    pendingWorkoutStartRef.current = null;
    setShowReadinessSheet(false);
    fn?.();
  }

  // exercises per session based on available duration
  const COMPRESS_DURATION_CAP: Record<number, number> = {
    30: 3,
    45: 4,
    60: 5,
    75: 6,
    90: 8,
  };

  function handleCompressWithDuration(durationMinutes: number) {
    setShowCompressDurationSheet(false);
    if (!repiqPlan) return;
    const wi = repiqPlan.currentWeekIndex;
    const currentWeek = repiqPlan.weeks[wi];
    if (!currentWeek) return;
    const incompleteDays = currentWeek.days.filter(d => !d.completedAt);
    if (incompleteDays.length <= 1) return;

    const maxPerSession = COMPRESS_DURATION_CAP[durationMinutes] ?? 5;
    const allExercises = incompleteDays.flatMap(d => d.exercises);
    const targetCount = Math.ceil(incompleteDays.length / 2);

    // Sort: compounds (multi-joint) first, isolation last
    const COMPOUND_PATTERNS = new Set(["squat", "hinge", "push", "pull", "lunge", "carry"]);
    const sorted = [...allExercises].sort((a, b) => {
      const tmplA = availableExerciseTemplates.find(t => t.id === a.exerciseId);
      const tmplB = availableExerciseTemplates.find(t => t.id === b.exerciseId);
      const aCompound = COMPOUND_PATTERNS.has((tmplA as ExerciseWithTaxonomy | undefined)?.movementPattern ?? "") ? 0 : 1;
      const bCompound = COMPOUND_PATTERNS.has((tmplB as ExerciseWithTaxonomy | undefined)?.movementPattern ?? "") ? 0 : 1;
      return aCompound - bCompound;
    });

    // Cap total exercises to what fits
    const totalCap = targetCount * maxPerSession;
    const capped = sorted.slice(0, totalCap);

    const compressedDays = Array.from({ length: targetCount }, (_, i) => {
      const slice = capped.slice(i * maxPerSession, (i + 1) * maxPerSession);
      const baseDay = incompleteDays[i] ?? incompleteDays[0];
      const muscles = [...new Set(slice.map(e => {
        const tmpl = availableExerciseTemplates.find(t => t.id === e.exerciseId);
        return tmpl?.primaryMuscle ?? "";
      }).filter(Boolean))];
      return {
        ...baseDay,
        completedAt: null,
        sessionLabel: muscles.length > 0 ? muscles.join(" & ") : baseDay.sessionLabel,
        focus: muscles.join(" · "),
        exercises: slice,
      };
    });

    const completedDays = currentWeek.days.filter(d => d.completedAt);
    const updatedWeeks = repiqPlan.weeks.map((week, wIdx) => {
      if (wIdx !== wi) return week;
      return { ...week, days: [...completedDays, ...compressedDays] };
    });
    const updated: RepIQPlan = { ...repiqPlan, weeks: updatedWeeks };
    persistRepIQPlan(updated);
    setRepiqPlan(updated);
  }

  function openQuickSession(returnView: "home" | "planner" = "home") {
    setDiscardReturnView(returnView);
    resetWorkout();
    setExercises([]);
    setActiveExerciseId(null);
    const now = new Date();
    const hour = now.getHours();
    const timeLabel = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
    setWorkoutMeta({
      date: formatDateInputValue(now),
      startTime: formatTimeFromDate(now),
      startedMinutesAgo: "0",
      sessionName: `${timeLabel} Workout`,
      startInstant: now.toISOString()
    });
    setShowBottomRestDock(true);
    setHasActiveWorkout(true);
    setActivePlanSession({ source: "quick", planId: null, originalPlan: null });
    setActiveRepIQSessionKey(null);
    withReadinessCheck(() => setAppView("logger"));
  }

  function updateSetType(exerciseId: string, setIndex: number, setType: DraftSetType) {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              draftSets: exercise.draftSets.map((set, index) =>
                index === setIndex ? { ...set, setType } : set
              )
            }
          : exercise
      )
    );
    setSetTypePickerRowId(null);
  }

  function openSupersetSheet(exerciseId: string) {
    const currentExercise = exercises.find((exercise) => exercise.id === exerciseId);
    const selectedIds = currentExercise?.supersetGroupId
      ? exercises
          .filter(
            (exercise) =>
              exercise.supersetGroupId === currentExercise.supersetGroupId &&
              exercise.id !== exerciseId
          )
          .map((exercise) => exercise.id)
      : [];

    setSupersetSheetExerciseId(exerciseId);
    setSupersetSelectionIds(selectedIds);
    setMenuExerciseId(null);
  }

  function saveSupersetSelection() {
    if (!supersetSheetExerciseId) {
      return;
    }

    const selection = Array.from(new Set(supersetSelectionIds)).filter(
      (exerciseId) => exerciseId !== supersetSheetExerciseId
    );
    const groupedIds = new Set([supersetSheetExerciseId, ...selection]);
    const sourceExercise = exercises.find((exercise) => exercise.id === supersetSheetExerciseId);
    const reusedGroupId =
      sourceExercise?.supersetGroupId ??
      exercises.find((exercise) => selection.includes(exercise.id))?.supersetGroupId ??
      null;
    const nextGroupId =
      groupedIds.size > 1 ? reusedGroupId ?? `superset-${Date.now()}` : null;

    setExercises((current) =>
      normalizeSupersetGroups(
        current.map((exercise) =>
          groupedIds.has(exercise.id)
            ? { ...exercise, supersetGroupId: nextGroupId }
            : exercise
        )
      )
    );
    setSupersetSheetExerciseId(null);
    setSupersetSelectionIds([]);
    setMenuExerciseId(null);
  }

  function removeFromSuperset(exerciseId: string) {
    setExercises((current) =>
      normalizeSupersetGroups(
        current.map((exercise) =>
          exercise.id === exerciseId
            ? { ...exercise, supersetGroupId: null }
            : exercise
        )
      )
    );
    setSupersetSheetExerciseId(null);
    setSupersetSelectionIds([]);
    setMenuExerciseId(null);
  }

  function addSet(exerciseId: string) {
    setInteractedExerciseActive(exerciseId);
    setExercises((current) =>
      current.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }
        return {
          ...exercise,
          draftSets: [
            ...exercise.draftSets,
            {
              id: `${exercise.id}-${exercise.draftSets.length + 1}`,
              setType: "normal",
              weightInput: "",
              repsInput: "",
              rpeInput: "",
              done: false,
              failed: false
            }
          ]
        };
      })
    );
  }

  function replaceExerciseWithTemplate(
    originalId: string,
    templateId: string,
    reason: ReplacementReason = "preference",
    matchScore = 0,
  ) {
    const template = availableExerciseTemplates.find(e => e.id === templateId);
    if (!template) return;
    const suffix = `${Date.now()}-1`;
    const nextExercise = cloneExerciseTemplate(template, settings.defaultRestSeconds, suffix);
    const configuredRestTimer = exerciseRestDefaults[template.name];
    if (configuredRestTimer) nextExercise.restTimer = configuredRestTimer;
    const setsAlreadyLogged = exercises.find(e => e.id === originalId)?.draftSets.filter(s => s.done).length ?? 0;
    setExercises(current =>
      current.map(ex => {
        if (ex.id !== originalId) return ex;
        return { ...nextExercise, id: ex.id, note: ex.note, supersetGroupId: ex.supersetGroupId };
      })
    );
    const event: ReplacementEvent = {
      schemaVersion: 1,
      sessionId: workoutMeta.startInstant ?? new Date().toISOString(),
      replacedAt: new Date().toISOString(),
      originalExerciseId: originalId,
      replacementExerciseId: templateId,
      reason,
      setsAlreadyLogged,
      matchScore,
    };
    persistReplacementEvent(event);

    // Save preference when the chosen replacement targets the same primary muscle.
    // This lets us surface it at the top of future Smart Replace lists for this exercise.
    const originalExercise = availableExerciseTemplates.find(e => e.id === originalId);
    if (
      originalExercise &&
      template.primaryMuscle &&
      originalExercise.primaryMuscle === template.primaryMuscle
    ) {
      persistExercisePreference(originalId, templateId);
    }

    setSmartReplaceExerciseId(null);
    setAddExerciseOpen(false);
  }

  function addExercisesFromTemplates(templateIds: string[]) {
    if (templateIds.length === 0) {
      return;
    }

    const nextExercises = templateIds
      .map((templateId, index) => {
        const template = availableExerciseTemplates.find((entry) => entry.id === templateId);
        if (!template) {
          return null;
        }

        const suffix = `${Date.now()}-${index + 1}`;
        const nextExercise = cloneExerciseTemplate(
          template,
          settings.defaultRestSeconds,
          suffix
        );

        const configuredRestTimer = exerciseRestDefaults[template.name];
        if (configuredRestTimer) {
          nextExercise.restTimer = configuredRestTimer;
        }

        return nextExercise;
      })
      .filter((exercise): exercise is ExerciseDraft => exercise !== null);

    if (nextExercises.length === 0) {
      return;
    }

    setExercises((current) => [...current, ...nextExercises]);
    setUserActiveExerciseId(nextExercises[0].id);
    setActiveExerciseId(nextExercises[0].id);
    setCollapsedExerciseIds((current) =>
      current.filter((id) => !nextExercises.some((exercise) => exercise.id === id))
    );
    setAddExerciseOpen(false);
    setWorkoutMenuOpen(false);
  }

  function buildDefaultHowTo(measurementType: MeasurementType) {
    return measurementType === "timed"
      ? [
          "Set up in a stable position before the timer starts.",
          "Keep each rep controlled so the full interval stays clean.",
          "Stop the set when technique drops instead of chasing extra time."
        ]
      : [
          "Set up with a controlled starting position before the first rep.",
          "Move through the target muscle with a steady tempo.",
          "Finish the range with control and keep tension on the working muscle."
        ];
  }

  function createCustomExercise(draft: CustomExerciseInput) {
    const requestedName = draft.name.trim();
    if (!requestedName) {
      return null;
    }
    const normalizedName = ensureUniqueExerciseName(
      requestedName,
      availableExerciseTemplates.map((exercise) => exercise.name)
    );

    const customIdBase = normalizedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const customId = `custom-${customIdBase || "exercise"}-${Date.now()}`;
    const normalizedPrimaryMuscles = draft.primaryMuscles
      .map((muscle) => muscle.trim())
      .filter(Boolean);
    if (normalizedPrimaryMuscles.length === 0) {
      return null;
    }
    const normalizedSecondaryMuscles = draft.secondaryMuscles.filter(
      (muscle) => !normalizedPrimaryMuscles.includes(muscle)
    );
    const restSeconds = Math.max(1, Number(settings.defaultRestSeconds) || 60);
    const defaultHowTo = buildDefaultHowTo(draft.measurementType);
    const normalizedTemplate: ExerciseDraft = {
      id: customId,
      name: normalizedName,
      note: "",
      stickyNoteEnabled: false,
      restTimer: formatRestTimer(String(restSeconds)),
      goal: "hypertrophy",
      imageSrc: draft.imageSrc || genericExerciseImage,
      primaryMuscle: normalizedPrimaryMuscles[0],
      primaryMuscles: normalizedPrimaryMuscles,
      secondaryMuscles: normalizedSecondaryMuscles,
      exerciseType: draft.exerciseType,
      measurementType: draft.measurementType,
      movementSide: draft.movementSide,
      isCustom: true,
      libraryStatus: "active",
      howTo: defaultHowTo,
      history: [],
      draftSets: [
        {
          id: `${customId}-set-1`,
          setType: "warmup",
          weightInput: "",
          repsInput: "",
          rpeInput: "",
          done: false,
          failed: false
        },
        {
          id: `${customId}-set-2`,
          setType: "normal",
          weightInput: "",
          repsInput: "",
          rpeInput: "",
          done: false,
          failed: false
        },
        {
          id: `${customId}-set-3`,
          setType: "normal",
          weightInput: "",
          repsInput: "",
          rpeInput: "",
          done: false,
          failed: false
        },
        {
          id: `${customId}-set-4`,
          setType: "normal",
          weightInput: "",
          repsInput: "",
          rpeInput: "",
          done: false,
          failed: false
        }
      ]
    };

    setCustomExercises((current) => [...current, normalizedTemplate]);
    setExerciseRestDefaults((current) => ({
      ...current,
      [normalizedTemplate.name]: normalizedTemplate.restTimer
    }));
    return normalizedTemplate.id;
  }

  function updateCustomExercise(exerciseId: string, draft: CustomExerciseInput) {
    const existing = customExercises.find((exercise) => exercise.id === exerciseId);
    const requestedName = draft.name.trim();
    if (!existing || !requestedName) {
      return null;
    }

    const normalizedPrimaryMuscles = draft.primaryMuscles
      .map((muscle) => muscle.trim())
      .filter(Boolean);
    if (normalizedPrimaryMuscles.length === 0) {
      return null;
    }

    const normalizedSecondaryMuscles = draft.secondaryMuscles.filter(
      (muscle) => !normalizedPrimaryMuscles.includes(muscle)
    );
    const normalizedName = ensureUniqueExerciseName(
      requestedName,
      availableExerciseTemplates
        .filter((exercise) => exercise.id !== exerciseId)
        .map((exercise) => exercise.name)
    );

    setCustomExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId
          ? cloneExerciseDraft(exercise, {
              name: normalizedName,
              imageSrc: draft.imageSrc || genericExerciseImage,
              primaryMuscle: normalizedPrimaryMuscles[0],
              primaryMuscles: normalizedPrimaryMuscles,
              secondaryMuscles: normalizedSecondaryMuscles,
              exerciseType: draft.exerciseType,
              measurementType: draft.measurementType,
              movementSide: draft.movementSide,
              isCustom: true,
              libraryStatus: "active",
              howTo: exercise.howTo.length > 0 ? exercise.howTo : buildDefaultHowTo(draft.measurementType)
            })
          : exercise
      )
    );
    setExerciseRestDefaults((current) => {
      const next = { ...current };
      const resolvedRestTimer = next[existing.name] ?? existing.restTimer;
      if (existing.name !== normalizedName) {
        delete next[existing.name];
      }
      next[normalizedName] = resolvedRestTimer;
      return next;
    });

    return exerciseId;
  }

  function archiveCustomExercise(exerciseId: string) {
    setCustomExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId
          ? cloneExerciseDraft(exercise, { libraryStatus: "archived", isCustom: true })
          : exercise
      )
    );
    setEditingCustomExerciseId((current) => (current === exerciseId ? null : current));
    setDetailsExerciseId((current) => (current === exerciseId ? null : current));
  }

  function deleteCustomExercise(exerciseId: string) {
    const customExercise = customExercises.find((exercise) => exercise.id === exerciseId);
    setCustomExercises((current) => current.filter((exercise) => exercise.id !== exerciseId));
    if (customExercise) {
      setExerciseRestDefaults((current) => {
        if (!(customExercise.name in current)) {
          return current;
        }
        const next = { ...current };
        delete next[customExercise.name];
        return next;
      });
    }
    setEditingCustomExerciseId((current) => (current === exerciseId ? null : current));
    setDetailsExerciseId((current) => (current === exerciseId ? null : current));
  }

  function importCustomExercises(importedExercises: CustomExerciseInput[]) {
    if (importedExercises.length === 0) {
      return [];
    }

    const existingNames = availableExerciseTemplates.map((exercise) => exercise.name);
    const createdIds: string[] = [];

    importedExercises.forEach((draft) => {
      const uniqueName = ensureUniqueExerciseName(draft.name.trim(), existingNames);
      if (uniqueName.trim().length === 0) {
        return;
      }
      existingNames.push(uniqueName);
      const createdId = createCustomExercise({
        ...draft,
        name: uniqueName
      });
      if (createdId) {
        createdIds.push(createdId);
      }
    });

    return createdIds;
  }

  function moveExerciseByIds(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      return;
    }

    setExercises((current) => {
      const sourceIndex = current.findIndex((exercise) => exercise.id === sourceId);
      const targetIndex = current.findIndex((exercise) => exercise.id === targetId);

      if (sourceIndex === -1 || targetIndex === -1) {
        return current;
      }

      const reordered = [...current];
      const [item] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, item);
      return reordered;
    });
  }

  function removeSet(exerciseId: string, setId: string) {
    setExercises((current) =>
      current.map((exercise) => {
        if (exercise.id !== exerciseId || exercise.draftSets.length <= 1) {
          return exercise;
        }
        return {
          ...exercise,
          draftSets: exercise.draftSets.filter((set) => set.id !== setId)
        };
      })
    );
    setRevealedDeleteRowId(null);
  }

  function clearUncheckedSets() {
    setExercises((current) =>
      current.map((exercise) => ({
        ...exercise,
        draftSets: exercise.draftSets.map((set) =>
          set.done
            ? set
            : {
                ...set,
                weightInput: "",
                repsInput: "",
                rpeInput: "",
                failed: false
              }
        )
      }))
    );
    setWorkoutMenuOpen(false);
  }

  function moveExercise(exerciseId: string, direction: -1 | 1) {
    setExercises((current) => {
      const index = current.findIndex((exercise) => exercise.id === exerciseId);
      const nextIndex = index + direction;
      if (index === -1 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const reordered = [...current];
      const [item] = reordered.splice(index, 1);
      reordered.splice(nextIndex, 0, item);
      return reordered;
    });
    setMenuExerciseId(null);
  }

  function replaceExercise(exerciseId: string) {
    setExercises((current) =>
      current.map((exercise, index) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }
        const template = replacementTemplates[index % replacementTemplates.length];
        return {
          ...exercise,
          id: `${exercise.id}-replaced`,
          name: template.name,
          restTimer: exerciseRestDefaults[template.name] ?? exercise.restTimer,
          imageSrc: template.imageSrc,
          primaryMuscle: template.primaryMuscle,
          secondaryMuscles: template.secondaryMuscles,
          howTo: template.howTo
        };
      })
    );
    setMenuExerciseId(null);
  }

  function removeExercise(exerciseId: string) {
    setExercises((current) => {
      const remaining = normalizeSupersetGroups(
        current.filter((exercise) => exercise.id !== exerciseId)
      );
      if (remaining.length === 0) {
        setActiveExerciseId(null);
        return remaining;
      }
      if (activeExerciseId === exerciseId) {
        const nextActiveExerciseId = getDefaultActiveExerciseId(remaining);
        if (nextActiveExerciseId) {
          setActiveExerciseId(nextActiveExerciseId);
        }
      }
      return remaining;
    });
    if (userActiveExerciseId === exerciseId) {
      setUserActiveExerciseId(null);
    }
    if (supersetSheetExerciseId === exerciseId) {
      setSupersetSheetExerciseId(null);
      setSupersetSelectionIds([]);
    }
    setCollapsedExerciseIds((current) => current.filter((id) => id !== exerciseId));
    setMenuExerciseId(null);
  }

  function resetWorkout() {
    const nextExercises = buildInitialWorkoutExercises(exerciseRestDefaults);
    setExercises(nextExercises);
    setUserActiveExerciseId(null);
    setActiveExerciseId(nextExercises[0].id);
    setDetailsExerciseId(null);
    setMusclesExerciseId(null);
    setMenuExerciseId(null);
    setWorkoutMenuOpen(false);
    setSettingsOpen(false);
    setAddExerciseOpen(false);
    setReorderOpen(false);
    setReorderDragId(null);
    setCollapsedExerciseIds([]);
    setGuidanceCollapsed(false);
    setWarmupExpanded(false);
    setWarmupDismissed(false);
    setCooldownDismissed(false);
    setFocusedExpandedExerciseId(null);
    setTimingOpen(false);
    setLeavePromptOpen(false);
    setSupersetSheetExerciseId(null);
    setSupersetSelectionIds([]);
    setSmartReplaceExerciseId(null);
    setRestTimerEditorExerciseId(null);
    setRestTimerEditorValue("");
    setSaveRestTimerToDefault(false);
    setSetTypePickerRowId(null);
    setRevealedDeleteRowId(null);
    setShowBottomRestDock(true);
    setPullDownDistance(0);
    updateSwipeState(createInitialSwipeState());
    setWorkoutMeta(defaultWorkoutMeta);
    setState(defaultState);
    setShowTopGuidance(false);
    setActiveRestTimer(null);
    setLoggerRewards([]);
    setRewardSheetOpen(false);
    setTemplateApplyPromptImages(null);
  }

  function beginPullToAdd(event: React.PointerEvent<HTMLElement>) {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("input, button, label, summary, details")
    ) {
      return;
    }

    if (window.scrollY > 8) {
      return;
    }

    pullStartY.current = event.clientY;
    pullPointerId.current = event.pointerId;
    pullGestureActive.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function movePullToAdd(event: React.PointerEvent<HTMLElement>) {
    if (!pullGestureActive.current || pullStartY.current === null) {
      return;
    }

    const distance = Math.max(0, Math.min(88, event.clientY - pullStartY.current));
    setPullDownDistance(distance);
  }

  function endPullToAdd() {
    if (!pullGestureActive.current) {
      return;
    }

    if (pullDownDistance > 58) {
      setWorkoutMenuOpen(true);
    }

    pullGestureActive.current = false;
    pullStartY.current = null;
    pullPointerId.current = null;
    setPullDownDistance(0);
  }

  function beginGuidancePull(event: React.PointerEvent<HTMLElement>) {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("button")
    ) {
      return;
    }

    guidancePullStartY.current = event.clientY;
    guidancePullActive.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveGuidancePull(event: React.PointerEvent<HTMLElement>) {
    if (!guidancePullActive.current || guidancePullStartY.current === null) {
      return;
    }

    const rawDelta = event.clientY - guidancePullStartY.current;
    const delta = topGuidanceExpanded
      ? Math.max(-72, Math.min(18, rawDelta))
      : Math.max(-12, Math.min(72, rawDelta));

    setTopGuidancePullDistance(delta);
  }

  function endGuidancePull() {
    if (!guidancePullActive.current) {
      return;
    }

    if (!topGuidanceExpanded && topGuidancePullDistance > 34) {
      setTopGuidanceExpanded(true);
    } else if (topGuidanceExpanded && topGuidancePullDistance < -34) {
      setTopGuidanceExpanded(false);
    }

    guidancePullActive.current = false;
    guidancePullStartY.current = null;
    setTopGuidancePullDistance(0);
  }

  function beginSwipe(rowId: string, event: React.PointerEvent<HTMLDivElement>) {
    if (isInteractiveSwipeTarget(event.target)) {
      return;
    }

    updateSwipeState({
      rowId,
      startX: event.clientX,
      startY: event.clientY,
      deltaX: 0,
      axis: "undecided",
      dragging: false
    });
  }

  function resetSwipeState() {
    updateSwipeState(createInitialSwipeState());
  }

  function moveSwipe(rowId: string, event: React.PointerEvent<HTMLDivElement>) {
    const currentSwipeState = swipeStateRef.current;

    if (currentSwipeState.rowId !== rowId) {
      return;
    }

    const deltaX = event.clientX - currentSwipeState.startX;
    const deltaY = event.clientY - currentSwipeState.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (currentSwipeState.axis === "undecided") {
      if (absX < 10 && absY < 10) {
        return;
      }

      if (absY > absX * 1.1) {
        updateSwipeState((current) => ({
          ...current,
          axis: "vertical",
          deltaX: 0,
          dragging: false
        }));
        return;
      }

      if (absX > absY * 1.2 && absX > 14) {
        const clamped = Math.max(-84, Math.min(112, deltaX));
        if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) {
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }
        updateSwipeState((current) => ({
          ...current,
          axis: "horizontal",
          deltaX: clamped,
          dragging: true
        }));
      }
      return;
    }

    if (currentSwipeState.axis !== "horizontal") {
      return;
    }

    const clamped = Math.max(-84, Math.min(112, deltaX));
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    updateSwipeState((current) => ({
      ...current,
      deltaX: clamped,
      dragging: Math.abs(clamped) > 14
    }));
  }

  function endSwipe(
    exerciseId: string,
    setIndex: number,
    rowId: string,
    event: React.PointerEvent<HTMLDivElement>
  ) {
    const currentSwipeState = swipeStateRef.current;

    if (currentSwipeState.rowId !== rowId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!currentSwipeState.dragging) {
      resetSwipeState();
      return;
    }

    if (currentSwipeState.deltaX < -56) {
      markSetDone(exerciseId, setIndex);
      setRevealedDeleteRowId(null);
    } else if (currentSwipeState.deltaX > 64) {
      setRevealedDeleteRowId(rowId);
    } else {
      setRevealedDeleteRowId(null);
    }

    resetSwipeState();
  }

  async function performFinishWorkout() {
    const lastSession = activeExercise.history[activeExercise.history.length - 1];
    const { resolvedSets, issues } = buildCompletedSets(
      activeExercise.draftSets,
      lastSession,
      settings.carryForwardDefaults,
      getExerciseMeasurementType(activeExercise)
    );

    if (resolvedSets.length === 0) {
      setState({
        status: "error",
        suggestion: null,
        message: "Mark at least one set as done before finishing the workout.",
        engineSource: null
      });
      return;
    }

    if (issues.length > 0) {
      setState({
        status: "error",
        suggestion: null,
        message: issues[0],
        engineSource: null
      });
      return;
    }

    const payload: ExerciseEvaluationRequest = {
      goal: activeExercise.goal,
      exercise_name: activeExercise.name,
      sessions: [
        ...activeExercise.history,
        {
          date: sessionDate,
          exercise: activeExercise.name,
          session_key: `${activeExercise.id}-current`,
          sets: resolvedSets
        }
      ]
    };

    setState({
      status: "loading",
      suggestion: null,
      message: null,
      engineSource: null
    });

    try {
      const response = await fetch(`${apiBaseUrl}/v1/sessions/${activeExercise.id}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });

      const body = await response.json();

      if (!response.ok) {
        setState({
          status: "error",
          suggestion: body.fallbackSuggestion
            ? coachingSuggestionSchema.parse(body.fallbackSuggestion)
            : null,
          message: body.message ?? "The coaching engine is not reachable yet.",
          engineSource: body.fallbackSuggestion ? "fallback" : "unavailable"
        });
        return;
      }

      setState({
        status: "success",
        suggestion: coachingSuggestionSchema.parse(body.suggestion),
        message: null,
        engineSource: body.engineSource === "live" ? "live" : "fallback"
      });
    } catch (error) {
      setState({
        status: "error",
        suggestion: null,
        message:
          error instanceof Error ? error.message : "The API could not be reached.",
        engineSource: "unavailable"
      });
    }
  }

  function openFinishWorkoutPage(ignoredIncompleteSets: number) {
    setFinishConfirmOpen(false);
    setFinishConfirmOpen(false);
    setWorkoutMenuOpen(false);
    setRewardSheetOpen(false);
    setInlineGuidanceOpen(false);
    setTopGuidanceExpanded(false);
    stopRestTimer();
    setFinishWorkoutDraft(buildFinishWorkoutDraft(ignoredIncompleteSets));
    setAppView("finish");
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }

  async function finishWorkout() {
    if (completedSetCount === 0) {
      return; // button is disabled — guard in case of direct call
    }
    const hasIssues = incompleteSetCount > 0 || exercises.some(ex =>
      ex.draftSets.some(s => s.done && s.repsInput.trim() === "")
    );
    if (hasIssues) {
      setFinishConfirmOpen(true);
      return;
    }
    openFinishWorkoutPage(0);
  }

  function finishWorkoutAnyway() {
    openFinishWorkoutPage(incompleteSetCount);
  }

  // ── Workout plan management ────────────────────────────────────────────────

  function savePlan(plan: WorkoutPlan) {
    setWorkoutPlans((current) => {
      // Strip sample plans from current state before building the user list
      const userPlans = current.filter((p) => !SAMPLE_PLAN_IDS.has(p.id));
      const exists = userPlans.some((p) => p.id === plan.id);
      const updated = exists
        ? userPlans.map((p) => (p.id === plan.id ? { ...plan, updatedAt: new Date().toISOString() } : p))
        : [plan, ...userPlans];
      persistWorkoutPlans(updated);
      // Show updated user plans; if empty fall back to sample plans
      return updated.length > 0 ? updated : SAMPLE_WORKOUT_PLANS;
    });
  }

  function reorderPlans(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      return;
    }
    setWorkoutPlans((current) => {
      const sourceIndex = current.findIndex((plan) => plan.id === sourceId);
      const targetIndex = current.findIndex((plan) => plan.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1) {
        return current;
      }
      const reordered = [...current];
      const [plan] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, plan);
      persistWorkoutPlans(reordered);
      return reordered;
    });
  }

  function deletePlan(planId: string) {
    setWorkoutPlans((current) => {
      const updated = current.filter((p) => p.id !== planId && !SAMPLE_PLAN_IDS.has(p.id));
      persistWorkoutPlans(updated);
      // If all user plans are gone, show sample plans again
      return updated.length > 0 ? updated : SAMPLE_WORKOUT_PLANS;
    });
  }

  function duplicatePlan(plan: WorkoutPlan) {
    const copy: WorkoutPlan = {
      ...plan,
      id: `plan-${Date.now()}`,
      name: `${plan.name} (copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    savePlan(copy);
  }

  async function sharePlan(plan: WorkoutPlan) {
    const body = [
      `${plan.name}`,
      plan.userTags && plan.userTags.length > 0 ? `Tags: ${plan.userTags.join(", ")}` : null,
      plan.note ? plan.note : null,
      `${plan.exercises.length} ${plan.exercises.length === 1 ? "exercise" : "exercises"}`
    ].filter(Boolean).join("\n");

    try {
      if (navigator.share) {
        await navigator.share({ title: plan.name, text: body });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(body);
      }
    } catch {
      // ignore cancelled shares
    }
  }

  function setPlanTags(planId: string, tags: string[]) {
    setWorkoutPlans((current) => {
      const updated = current.map((plan) =>
        plan.id === planId
          ? { ...plan, userTags: tags, updatedAt: new Date().toISOString() }
          : plan
      );
      persistWorkoutPlans(updated);
      return updated;
    });
  }

  function useTemplate(template: WorkoutPlan) {
    const copy: WorkoutPlan = {
      ...template,
      id: `plan-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    savePlan(copy);
    setPlannerView("mine");
  }

  function startPlanWorkout(plan: WorkoutPlan, source: PlanSessionSource = "saved") {
    // Build exercises from plan, hydrating from the library
    const planExercises: ExerciseDraft[] = plan.exercises.flatMap((pe, exIdx) => {
      const template = availableExerciseTemplates.find((e) => e.id === pe.exerciseId);
      if (!template) return [];

      // If setTypes is already specified (e.g. from generated plan), use it directly —
      // warmup rows are already embedded. Otherwise auto-add warmups for compounds.
      const hasExplicitSetTypes = pe.setTypes && pe.setTypes.length === pe.setCount;
      let allSets: DraftSet[];

      if (hasExplicitSetTypes) {
        allSets = pe.setTypes!.map((setType, i) => ({
          id: `${pe.exerciseId}-${i}-${Date.now()}`,
          setType,
          weightInput: "",
          repsInput: "",
          rpeInput: "",
          done: false,
          failed: false,
        }));
      } else {
        // Auto-add warmups: compound movements get 2, first exercise gets at least 1
        const templateWithTaxonomy = template as ExerciseWithTaxonomy;
        const isCompound = templateWithTaxonomy.movementPattern
          ? COMPOUND_PATTERNS.has(templateWithTaxonomy.movementPattern as MovementPattern)
          : false;
        const warmupCount = isCompound ? 2 : exIdx === 0 ? 1 : 0;
        const warmupSets: DraftSet[] = Array.from({ length: warmupCount }, (_, i) => ({
          id: `${pe.exerciseId}-wu-${i}-${Date.now()}`,
          setType: "warmup" as DraftSetType,
          weightInput: "",
          repsInput: "",
          rpeInput: "",
          done: false,
          failed: false,
        }));
        const workingSets: DraftSet[] = Array.from({ length: pe.setCount }, (_, i) => ({
          id: `${pe.exerciseId}-${i}-${Date.now()}`,
          setType: pe.setTypes?.[i] ?? "normal" as DraftSetType,
          weightInput: "",
          repsInput: "",
          rpeInput: "",
          done: false,
          failed: false,
        }));
        allSets = [...warmupSets, ...workingSets];
      }

      return [{
        ...template,
        restTimer: pe.restTimer,
        note: pe.note ?? "",
        draftSets: allSets
      }];
    });

    if (planExercises.length === 0) return;

    setExercises(planExercises);
    setCollapsedExerciseIds(source === "saved" ? planExercises.map((exercise) => exercise.id) : []);
    setGuidanceCollapsed(source === "saved");
    setFocusedExpandedExerciseId(null);
    const now = new Date();
    setWorkoutMeta({
      date: formatDateInputValue(now),
      startTime: formatTimeFromDate(now),
      startedMinutesAgo: "0",
      sessionName: plan.name,
      startInstant: now.toISOString()
    });
    setShowBottomRestDock(true);
    setActivePlanSession({
      source,
      planId: source === "saved" ? plan.id : null,
      originalPlan: source === "saved" ? plan : null
    });
    setActiveRepIQSessionKey(null);
    setDiscardReturnView("planner");
    setHasActiveWorkout(true);
    withReadinessCheck(() => setAppView("logger"));
  }

  function redoWorkout(workout: SavedWorkoutData) {
    const redoExercises: ExerciseDraft[] = workout.exercises.flatMap((summary) => {
      const template = availableExerciseTemplates.find((e) => e.id === summary.id);
      if (!template) return [];
      const setCount = Math.max(summary.loggedSets, 1);
      const sets: DraftSet[] = Array.from({ length: setCount }, (_, i) => ({
        id: `${summary.id}-redo-${i}`,
        setType: "normal" as const,
        weightInput: "",
        repsInput: "",
        rpeInput: "",
        done: false,
        failed: false,
      }));
      return [{ ...template, note: "", draftSets: sets }];
    });

    if (redoExercises.length === 0) return;
    setExercises(redoExercises);
    setCollapsedExerciseIds([]);
    setGuidanceCollapsed(false);
    setFocusedExpandedExerciseId(null);
    const now = new Date();
    setWorkoutMeta({
      date: formatDateInputValue(now),
      startTime: formatTimeFromDate(now),
      startedMinutesAgo: "0",
      sessionName: workout.sessionName,
      startInstant: now.toISOString(),
    });
    setShowBottomRestDock(true);
    setActivePlanSession(null);
    setActiveRepIQSessionKey(null);
    setActiveWorkoutIsRedo(true);
    setDiscardReturnView("home");
    setHasActiveWorkout(true);
    withReadinessCheck(() => setAppView("logger"));
  }

  function editHistoryWorkout(workout: SavedWorkoutData) {
    // Re-loads the logger with the same exercises as the original session.
    // Timer is pre-seeded from durationSeconds so elapsed time starts where the session left off.
    const sourceKey = workout.repiqSourceKey;
    let sourceExercises: ExerciseDraft[] = [];
    // Helper: build DraftSets pre-filled from stored set data when available
    const makeDraftSets = (
      exerciseId: string,
      count: number,
      storedSets?: { weight: number; reps: number; rpe: number | null; setType: string }[]
    ): DraftSet[] =>
      Array.from({ length: count }, (_, i) => {
        const s = storedSets?.[i];
        const preFilled = !!(s && s.weight > 0 && s.reps > 0);
        return {
          id: `${exerciseId}-edit-${i}`,
          setType: (s?.setType ?? "normal") as DraftSet["setType"],
          weightInput: preFilled ? String(s!.weight) : "",
          repsInput: preFilled ? String(s!.reps) : "",
          rpeInput: s?.rpe != null ? String(s.rpe) : "",
          done: preFilled,
          failed: false,
        };
      });

    if (sourceKey && repiqPlan) {
      // repiqSourceKey format: "wi-di" (e.g. "0-2")
      const match = sourceKey.match(/^(\d+)-(\d+)$/);
      if (match) {
        const wi = parseInt(match[1], 10);
        const di = parseInt(match[2], 10);
        const day = repiqPlan.weeks[wi]?.days[di];
        if (day) {
          sourceExercises = day.exercises.flatMap((pe) => {
            const template = availableExerciseTemplates.find((e) => e.id === pe.exerciseId);
            if (!template) return [];
            const savedSummary = workout.exercises.find((ex) => ex.id === pe.exerciseId);
            const draftSets = makeDraftSets(
              pe.exerciseId,
              savedSummary?.loggedSets ?? pe.sets,
              savedSummary?.sets
            );
            return [{ ...template, note: "", draftSets }];
          });
        }
      }
    }
    // Fall back to summary exercise list if plan day not found
    if (sourceExercises.length === 0) {
      sourceExercises = workout.exercises.flatMap((summary) => {
        const template = availableExerciseTemplates.find((e) => e.id === summary.id);
        if (!template) return [];
        const draftSets = makeDraftSets(
          summary.id,
          Math.max(summary.loggedSets, 1),
          summary.sets
        );
        return [{ ...template, note: "", draftSets }];
      });
    }
    if (sourceExercises.length === 0) return;
    setExercises(sourceExercises);
    setCollapsedExerciseIds([]);
    setGuidanceCollapsed(false);
    setFocusedExpandedExerciseId(null);
    // Pre-seed timer from the workout's stored duration.
    // durationSeconds may be 0 for older sessions — parse the formatted duration string as fallback.
    let elapsed = workout.durationSeconds ?? 0; // durationSeconds is in FinishWorkoutDraft
    if (elapsed === 0 && workout.duration && workout.duration !== "—") {
      const parts = workout.duration.split(":").map(Number);
      if (parts.length === 3 && parts.every(Number.isFinite)) {
        elapsed = parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2 && parts.every(Number.isFinite)) {
        elapsed = parts[0] * 60 + parts[1];
      }
    }
    const fakeStart = new Date(Date.now() - elapsed * 1000);
    setWorkoutMeta({
      date: formatDateInputValue(fakeStart),
      startTime: formatTimeFromDate(fakeStart),
      startedMinutesAgo: String(Math.floor(elapsed / 60)),
      sessionName: workout.sessionName,
      startInstant: fakeStart.toISOString(),
    });
    setShowBottomRestDock(true);
    setActivePlanSession(null);
    setActiveRepIQSessionKey(null);
    setDiscardReturnView("planner");
    setHasActiveWorkout(true);
    setAppView("logger");
  }

  function saveHistoryWorkoutToMyWorkouts(workout: SavedWorkoutData) {
    const now = new Date().toISOString();
    const plan: WorkoutPlan = {
      id: `plan-${Date.now()}`,
      name: workout.sessionName,
      exercises: workout.exercises.flatMap((summary) => {
        const template = availableExerciseTemplates.find((e) => e.id === summary.id);
        if (!template) return [];
        return [{
          exerciseId: summary.id,
          setCount: Math.max(summary.loggedSets, 1),
          restTimer: `${settings.defaultRestSeconds ?? "90"}s`,
        }];
      }),
      createdAt: now,
      updatedAt: now,
    };
    const updated = [plan, ...workoutPlans];
    setWorkoutPlans(updated);
    persistWorkoutPlans(updated);
  }

  function regenerateRemainingRepIQSessions() {
    if (!repiqPlan) return;
    const exp = repiqPlan.experienceLevel;
    const dayTemplates = buildDayTemplates(repiqPlan.splitType, repiqPlan.daysPerWeek);
    const scheme = getPlanSetRepScheme(repiqPlan.goal);
    // Collect exercise IDs already used in completed sessions (avoid repeating them)
    const used = new Set<string>();
    repiqPlan.weeks.forEach(week =>
      week.days.forEach(day => {
        if (day.completedAt) day.exercises.forEach(e => used.add(e.exerciseId));
      })
    );
    const updatedWeeks = repiqPlan.weeks.map((week) => ({
      ...week,
      days: week.days.map((day, di) => {
        if (day.completedAt) return day; // keep completed sessions as-is
        const tmpl = dayTemplates[di % dayTemplates.length];
        return {
          ...day,
          exercises: tmpl.slots
            .map((slot, slotIdx) => {
              const exerciseId = pickPlanExercise(generationCatalogExercises, slot, exp, used, psychProfile.equipmentAccess ?? "full_gym");
              if (!exerciseId) return null;
              const isCompound = slot.patterns.some((p) => COMPOUND_PATTERNS.has(p));
              const warmupSets = isCompound ? 2 : slotIdx === 0 ? 1 : 0;
              return { exerciseId, sets: scheme.sets, ...(warmupSets > 0 ? { warmupSets } : {}), reps: scheme.reps, restSeconds: scheme.restSeconds } satisfies RepIQPlanExercise;
            })
            .filter((e): e is RepIQPlanExercise => e !== null),
        };
      }),
    }));
    const updated: RepIQPlan = {
      ...repiqPlan,
      weeks: updatedWeeks,
      needsReview: false,
      extraVolumeCount: 0,
      extraVolumeWorkoutIds: [],
      lastRegeneratedAt: new Date().toISOString(),
    };
    persistRepIQPlan(updated);
    setRepiqPlan(updated);
  }

  function deleteHistoryWorkout(savedAt: string) {
    const updated = savedWorkoutsList.filter(w => w.savedAt !== savedAt);
    setSavedWorkoutsList(updated);
    persistSavedWorkoutsList(updated);
    if (!repiqPlan || repiqPlan.status === "paused") return;
    const lastRegen = repiqPlan.lastRegeneratedAt ?? repiqPlan.generatedAt;
    if (repiqPlan.extraVolumeWorkoutIds?.includes(savedAt)) {
      // Was a tracked extra-volume workout — decrement count
      const remainingIds = repiqPlan.extraVolumeWorkoutIds.filter(id => id !== savedAt);
      const updatedPlan: RepIQPlan = {
        ...repiqPlan,
        extraVolumeWorkoutIds: remainingIds,
        extraVolumeCount: remainingIds.length,
        needsReview: remainingIds.length > 0,
      };
      persistRepIQPlan(updatedPlan);
      setRepiqPlan(updatedPlan);
    } else if (savedAt > lastRegen) {
      // Volume decreased after last regeneration — plan may need adjustment
      const updatedPlan: RepIQPlan = {
        ...repiqPlan,
        needsReview: true,
      };
      persistRepIQPlan(updatedPlan);
      setRepiqPlan(updatedPlan);
    }
  }

  function getNextRepIQSession(plan: RepIQPlan): { weekIdx: number; dayIdx: number } | null {
    for (let wi = plan.currentWeekIndex; wi < plan.weeks.length; wi++) {
      const week = plan.weeks[wi];
      if (week.isCompleted) continue;
      for (let di = 0; di < week.days.length; di++) {
        if (!week.days[di].completedAt) return { weekIdx: wi, dayIdx: di };
      }
    }
    return null;
  }

  function startRepIQSession(weekIdx: number, dayIdx: number) {
    if (!repiqPlan) return;
    const day = repiqPlan.weeks[weekIdx]?.days[dayIdx];
    if (!day) return;
    resetWorkout();
    const planExercises: ExerciseDraft[] = day.exercises.flatMap((pe) => {
      const template = availableExerciseTemplates.find((e) => e.id === pe.exerciseId);
      if (!template) return [];
      const warmupCount = pe.warmupSets ?? 0;
      const warmupSets: DraftSet[] = Array.from({ length: warmupCount }, (_, i) => ({
        id: `${pe.exerciseId}-wu-${i}-${Date.now()}`,
        setType: "warmup" as DraftSetType,
        weightInput: "",
        repsInput: "",
        rpeInput: "",
        done: false,
        failed: false,
      }));
      const workingSets: DraftSet[] = Array.from({ length: pe.sets }, (_, i) => ({
        id: `${pe.exerciseId}-${i}-${Date.now()}`,
        setType: "normal" as DraftSetType,
        weightInput: "",
        repsInput: String(pe.reps),
        rpeInput: "",
        done: false,
        failed: false,
      }));
      return [{ ...template, restTimer: formatRestTimer(String(pe.restSeconds)), note: "", draftSets: [...warmupSets, ...workingSets] }];
    });
    setExercises(planExercises);
    setCollapsedExerciseIds([]);
    setGuidanceCollapsed(false);
    setFocusedExpandedExerciseId(null);
    const now = new Date();
    setWorkoutMeta({
      date: formatDateInputValue(now),
      startTime: formatTimeFromDate(now),
      startedMinutesAgo: "0",
      sessionName: day.sessionLabel,
      startInstant: now.toISOString(),
    });
    setShowBottomRestDock(true);
    setActivePlanSession({ source: "repiq", planId: null, originalPlan: null, weekIdx, dayIdx });
    setActiveRepIQSessionKey(`${weekIdx}-${dayIdx}`);
    setDiscardReturnView("planner");
    setHasActiveWorkout(true);
    withReadinessCheck(() => setAppView("logger"));
  }

  function propagateRepIQChanges(weekIdx: number, dayIdx: number, completedExerciseIds: string[]) {
    if (!repiqPlan) return;
    const usedIds = new Set<string>(completedExerciseIds);
    // Add all previously completed exercise IDs too
    repiqPlan.weeks.forEach((week, wi) => {
      week.days.forEach((day, di) => {
        if (day.completedAt && !(wi === weekIdx && di === dayIdx)) {
          day.exercises.forEach((e) => usedIds.add(e.exerciseId));
        }
      });
    });
    const scheme = getPlanSetRepScheme(repiqPlan.goal as TrainingGoal);
    const exp = repiqPlan.experienceLevel as ExperienceLevel;
    const dayTemplates = buildDayTemplates(repiqPlan.splitType, repiqPlan.daysPerWeek);
    const updatedWeeks = repiqPlan.weeks.map((week, wi) => {
      if (wi <= weekIdx) return week;
      return {
        ...week,
        days: week.days.map((day, di) => {
          const tmpl = dayTemplates[di % dayTemplates.length];
          const newExercises = tmpl.slots
            .map((slot) => {
              const id = pickPlanExercise(generationCatalogExercises, slot, exp, usedIds, psychProfile.equipmentAccess ?? "full_gym");
              if (!id) return null;
              usedIds.add(id);
              return { exerciseId: id, sets: scheme.sets, reps: scheme.reps, restSeconds: scheme.restSeconds } satisfies RepIQPlanExercise;
            })
            .filter((e): e is RepIQPlanExercise => e !== null);
          return { ...day, exercises: newExercises };
        }),
      };
    });
    const updatedPlan = { ...repiqPlan, weeks: updatedWeeks };
    persistRepIQPlan(updatedPlan);
    setRepiqPlan(updatedPlan);
  }

  function regenerateRepIQPlan(prefs: { goal: string; experience: string; daysPerWeek: number; cycleDays: number | null; sessionLength: number; planLengthWeeks: number; splitPref: string | null }) {
    const updatedProfile: UserPsychProfile = {
      ...psychProfile,
      primaryGoal: prefs.goal as TrainingGoal,
      experienceLevel: prefs.experience as ExperienceLevel,
      daysPerWeekPref: prefs.daysPerWeek,
      cycleDays: prefs.cycleDays,
      sessionLengthPref: prefs.sessionLength,
      planLengthWeeksPref: prefs.planLengthWeeks,
      workoutStylePref: prefs.splitPref,
    };
    persistPsychProfile(updatedProfile);
    setPsychProfile(updatedProfile);
    const plan = generateRepIQPlan(updatedProfile);
    persistRepIQPlan(plan);
    setRepiqPlan(plan);
  }

  async function saveFinishedWorkout(images: WorkoutMediaAsset[]) {
    if (!finishWorkoutDraft) return;
    if (activeWorkoutHasTemplateChanges()) {
      setTemplateApplyPromptImages(images);
      return;
    }
    finalizeFinishedWorkoutSave(images, false);
  }

  // ── Dev landing page ─────────────────────────────────────────────────────────
  if (showDevPage) {
    return (
      <DevLandingPage
        resolvedTheme={resolvedTheme}
        onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
        onGoTo={(view) => { setAppView(view); setShowDevPage(false); setDevBypassGate(true); }}
        onShowPostOnboarding={() => { setShowPostOnboarding(true); setShowDevPage(false); setDevBypassGate(true); }}
        onResetOnboarding={() => {
          const reset: UserPsychProfile = { ...psychProfile, onboardingCompletedAt: null };
          persistPsychProfile(reset);
          setPsychProfile(reset);
          setShowDevPage(false);
        }}
        onSeedHistoryData={() => {
          const workouts = buildSeedWorkouts();
          persistSavedWorkoutsList(workouts);
          setSavedWorkoutsList(workouts);
          setAppView("home");
          setShowDevPage(false);
          setDevBypassGate(true);
        }}
        onSeedRepIQData={() => {
          const { plan, workouts } = buildSeedRepIQData();
          persistRepIQPlan(plan);
          persistSavedWorkoutsList(workouts);
          setRepiqPlan(plan);
          setSavedWorkoutsList(workouts);
          setAppView("home");
          setShowDevPage(false);
          setDevBypassGate(true);
        }}
        onSeedMuscleGap={() => {
          const workouts = buildMuscleGapSeed();
          window.localStorage.removeItem(repiqPlanStorageKey);
          persistSavedWorkoutsList(workouts);
          setRepiqPlan(null);
          setSavedWorkoutsList(workouts);
          setAppView("home");
          setShowDevPage(false);
          setDevBypassGate(true);
        }}
        onClearHistoryData={() => {
          window.localStorage.removeItem(repiqPlanStorageKey);
          window.localStorage.removeItem(savedWorkoutsStorageKey);
          setRepiqPlan(null);
          setSavedWorkoutsList([]);
        }}
      />
    );
  }

  // ── Onboarding gate ──────────────────────────────────────────────────────────
  if (!onboardingComplete && !devBypassGate) {
    return (
      <div data-theme={resolvedTheme} className="ob-shell">
        <OnboardingPage
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
          onComplete={(profileData) => {
            const updated: UserPsychProfile = {
              ...psychProfile,
              ...profileData,
              onboardingCompletedAt: new Date().toISOString(),
            };
            persistPsychProfile(updated);
            setPsychProfile(updated);
            const plan = generateRepIQPlan(updated);
            persistRepIQPlan(plan);
            setRepiqPlan(plan);
            setShowPostOnboarding(true);
          }}
        />
      </div>
    );
  }

  // ── Post-onboarding plan reveal ──────────────────────────────────────────────
  if (showPostOnboarding && repiqPlan) {
    return (
      <PlanRevealPage
        plan={repiqPlan}
        profile={psychProfile}
        resolvedTheme={resolvedTheme}
        onStart={() => { setShowPostOnboarding(false); setAppView("planner"); }}
        onBuildOwn={() => { setShowPostOnboarding(false); setAppView("planner"); }}
      />
    );
  }

  if (editingCustomExercise) {
    return (
      <div data-theme={resolvedTheme}>
        <AddExercisePage
          templates={availableExerciseTemplates}
          existingExerciseNames={exercises.map((exercise) => exercise.name)}
          onBack={() => setEditingCustomExerciseId(null)}
          onAddSelected={addExercisesFromTemplates}
          onCreateCustom={createCustomExercise}
          onOpenDetails={(exerciseId) => openDetails(exerciseId)}
          editorExercise={editingCustomExercise}
          onUpdateCustom={updateCustomExercise}
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
        />
        <BottomNav activeView={appView} onNavigate={(view) => { setEditingCustomExerciseId(null); setAppView(view); }} onMore={() => setShowMoreSheet(true)} />
        <MoreSheet open={showMoreSheet} onClose={() => setShowMoreSheet(false)} onGoTo={(v) => { setShowMoreSheet(false); setAppView(v); }} resolvedTheme={resolvedTheme} />
      </div>
    );
  }

  if (detailsExercise) {
    return (
      <div data-theme={resolvedTheme}>
        <ExerciseDetailPage
          exercise={detailsExercise}
          activeTab={detailsTab}
          initialScrollTarget={detailsScrollTarget}
          onTabChange={setDetailsTab}
          onBack={() => setDetailsExerciseId(null)}
          onBrowseExercises={() => { setDetailsExerciseId(null); setAddExerciseOpen(true); }}
          customActions={
            detailsCustomExercise
              ? {
                  deleteMode: detailsCustomExercise.history.length > 0 ? "archive" : "delete",
                  onEdit: () => setEditingCustomExerciseId(detailsCustomExercise.id),
                  onDeleteOrArchive: () => {
                    if (detailsCustomExercise.history.length > 0) {
                      archiveCustomExercise(detailsCustomExercise.id);
                      return;
                    }
                    deleteCustomExercise(detailsCustomExercise.id);
                  }
                }
              : null
          }
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
        />
        <BottomNav activeView={appView} onNavigate={(view) => { setDetailsExerciseId(null); setAppView(view); }} onMore={() => setShowMoreSheet(true)} />
        <MoreSheet open={showMoreSheet} onClose={() => setShowMoreSheet(false)} onGoTo={(v) => { setShowMoreSheet(false); setAppView(v); }} resolvedTheme={resolvedTheme} />
      </div>
    );
  }

  if (musclesExercise) {
    return (
      <div data-theme={resolvedTheme}>
        <MusclesWorkedPage
          exercises={exercises}
          selectedExercise={musclesExercise}
          initialMode={musclesPageMode}
          onOpenDetails={(exerciseId) => {
            openDetails(exerciseId);
          }}
          onBack={() => setMusclesExerciseId(null)}
        />
        <BottomNav activeView={appView} onNavigate={(view) => { setMusclesExerciseId(null); setAppView(view); }} onMore={() => setShowMoreSheet(true)} />
        <MoreSheet open={showMoreSheet} onClose={() => setShowMoreSheet(false)} onGoTo={(v) => { setShowMoreSheet(false); setAppView(v); }} resolvedTheme={resolvedTheme} />
      </div>
    );
  }

  if (addExerciseOpen) {
    const replaceTarget = smartReplaceExerciseId
      ? exercises.find(e => e.id === smartReplaceExerciseId)
      : null;
    const smartReplaceAvailableEquipment: CustomExerciseType[] = (() => {
      const access = psychProfile.equipmentAccess ?? "full_gym";
      return EQUIPMENT_ALLOWED_TYPES[access] ?? EQUIPMENT_ALLOWED_TYPES.full_gym;
    })();
    const smartReplacementResults = replaceTarget
      ? getSmartReplacements(
          replaceTarget as ExerciseWithTaxonomy,
          exercises,
          "best_match",
          smartReplaceAvailableEquipment,
          availableExerciseTemplates as ExerciseWithTaxonomy[],
          psychProfile.experienceLevel
        )
      : [];
    const smartReplacementMeta = smartReplacementResults.reduce<Record<string, { rank: number; score: number; matchReason: string }>>(
      (result, entry, index) => {
        result[entry.exercise.id] = {
          rank: index,
          score: entry.score,
          matchReason: entry.matchReason,
        };
        return result;
      },
      {}
    );
    return (
      <div data-theme={resolvedTheme}>
        <AddExercisePage
          templates={availableExerciseTemplates}
          existingExerciseNames={exercises.map((exercise) => exercise.name)}
          onBack={() => { setAddExerciseOpen(false); setSmartReplaceExerciseId(null); }}
          onAddSelected={(templateIds) => {
            if (replaceTarget && templateIds[0]) {
              replaceExerciseWithTemplate(
                replaceTarget.id,
                templateIds[0],
                "best_match",
                smartReplacementMeta[templateIds[0]]?.score ?? 0
              );
            } else {
              addExercisesFromTemplates(templateIds);
            }
          }}
          onCreateCustom={createCustomExercise}
          onOpenDetails={(exerciseId) => openDetails(exerciseId)}
          onUpdateCustom={updateCustomExercise}
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
          replaceMode={Boolean(replaceTarget)}
          smartReplacementMeta={replaceTarget ? smartReplacementMeta : undefined}
        />
        <BottomNav activeView={appView} onNavigate={(view) => { setAddExerciseOpen(false); setSmartReplaceExerciseId(null); setAppView(view); }} onMore={() => setShowMoreSheet(true)} />
        <MoreSheet open={showMoreSheet} onClose={() => setShowMoreSheet(false)} onGoTo={(v) => { setShowMoreSheet(false); setAppView(v); }} resolvedTheme={resolvedTheme} />
      </div>
    );
  }

  if (appView === "report" && reportWorkout) {
    return (
      <div data-theme={resolvedTheme}>
        <WorkoutReportPage
          data={reportWorkout}
          onBack={() => setAppView("home")}
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
          psychCapture={{
            profile: psychProfile,
            onSave: persistPostWorkoutPsych,
          }}
        />
        <BottomNav activeView={appView} onNavigate={(view) => setAppView(view)} onMore={() => setShowMoreSheet(true)} />
        {/* ── RepIQ plan update prompt ─────────────────────────────────────── */}
        {repiqUpdatePrompt && (
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 600, display: "flex", alignItems: "flex-end" }}
            onClick={() => setRepiqUpdatePrompt(null)}
          >
            <div
              style={{ width: "100%", maxWidth: 430, margin: "0 auto", background: "var(--paper)", borderRadius: "20px 20px 0 0", padding: "20px 20px 32px" }}
              onClick={(e) => e.stopPropagation()}
              data-theme={resolvedTheme}
            >
              <p style={{ fontSize: "1rem", fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>Update your plan?</p>
              <p style={{ fontSize: "0.85rem", color: "var(--subtle-text)", marginBottom: 20 }}>
                You changed exercises in today&apos;s session. RepIQ can update your remaining sessions to avoid overlap and keep things fresh.
              </p>
              <button
                type="button"
                className="primary-button"
                style={{ width: "100%", marginBottom: 10 }}
                onClick={() => {
                  propagateRepIQChanges(repiqUpdatePrompt.weekIdx, repiqUpdatePrompt.dayIdx, repiqUpdatePrompt.completedExerciseIds);
                  setRepiqUpdatePrompt(null);
                }}
              >
                Yes, update future sessions
              </button>
              <button
                type="button"
                className="secondary-button"
                style={{ width: "100%" }}
                onClick={() => setRepiqUpdatePrompt(null)}
              >
                Keep original plan
              </button>
            </div>
          </div>
        )}
        {/* cross-plan prompt removed — plan is flagged silently; review notice shown inline on home and planner */}
        <MoreSheet open={showMoreSheet} onClose={() => setShowMoreSheet(false)} onGoTo={(v) => { setShowMoreSheet(false); setAppView(v); }} resolvedTheme={resolvedTheme} />
      </div>
    );
  }

  if (appView === "history-detail" && (historyDetailWorkout || historyDetailPlanContext)) {
    // Build a plan-only fallback when no saved workout exists
    const planDay = historyDetailPlanContext && repiqPlan
      ? repiqPlan.weeks[historyDetailPlanContext.weekIdx]?.days[historyDetailPlanContext.dayIdx]
      : null;
    const effectiveWorkout: SavedWorkoutData | null = historyDetailWorkout ?? (planDay && historyDetailPlanContext ? {
      sessionName: historyDetailPlanContext.label,
      note: "",
      date: planDay.completedAt ?? new Date().toISOString(),
      duration: "—",
      durationSeconds: 0,
      totalVolume: 0,
      totalSets: 0,
      exerciseCount: planDay.exercises.length,
      loggedExerciseCount: 0,
      ignoredIncompleteSets: 0,
      exercises: planDay.exercises.map(pe => ({
        id: pe.exerciseId,
        name: availableExerciseTemplates.find(t => t.id === pe.exerciseId)?.name ?? pe.exerciseId,
        primaryMuscle: availableExerciseTemplates.find(t => t.id === pe.exerciseId)?.primaryMuscle ?? "",
        loggedSets: 0,
        loggedVolume: 0,
      })),
      rewards: [],
      rewardSummary: { total: 0, session: 0, exercise: 0, set: 0 },
      takeawayTitle: "",
      takeawayBody: "",
      images: [],
      savedAt: planDay.completedAt ?? new Date().toISOString(),
      repiqSourceKey: `${historyDetailPlanContext.weekIdx}-${historyDetailPlanContext.dayIdx}`,
    } : null);
    if (!effectiveWorkout) { setAppView(historyDetailReturnView); return null; }
    const canEdit = !!(effectiveWorkout.repiqSourceKey);
    return (
      <div data-theme={resolvedTheme}>
        <WorkoutHistoryDetailPage
          workout={effectiveWorkout}
          onBack={() => setAppView(historyDetailReturnView)}
          onEdit={canEdit ? () => editHistoryWorkout(effectiveWorkout) : undefined}
          onShare={canEdit ? () => { setReportWorkout(effectiveWorkout); setAppView("share"); } : undefined}
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
        />
      </div>
    );
  }

  if (appView === "insights") {
    return (
      <div data-theme={resolvedTheme}>
        <InsightsPage
          savedWorkouts={savedWorkoutsList}
          psychProfile={psychProfile}
          library={availableExerciseTemplates as ExerciseWithTaxonomy[]}
          onOpenReport={(workout) => { setReportWorkout(workout); setAppView("report"); }}
          onRedoWorkout={redoWorkout}
          onSaveToMyWorkouts={saveHistoryWorkoutToMyWorkouts}
          onDeleteWorkout={deleteHistoryWorkout}
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
          initialTab={insightsInitialTab}
        />
        <BottomNav activeView={appView} onNavigate={(view) => setAppView(view)} onMore={() => setShowMoreSheet(true)} />
        <MoreSheet open={showMoreSheet} onClose={() => setShowMoreSheet(false)} onGoTo={(v) => { setShowMoreSheet(false); setAppView(v); }} resolvedTheme={resolvedTheme} />
      </div>
    );
  }

  if (appView === "community") {
    return (
      <div data-theme={resolvedTheme}>
        <main className="page-container">
          <div className="page-header">
            <h1>Community</h1>
          </div>
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <p style={{ fontSize: "1.1rem", color: "var(--subtle-text)" }}>Coming soon...</p>
            <p style={{ fontSize: "0.9rem", color: "var(--subtle-text)", marginTop: "1rem" }}>Connect with other RepIQ users, share workouts, and build your fitness community.</p>
          </div>
        </main>
        <BottomNav activeView={appView} onNavigate={(view) => setAppView(view)} onMore={() => setShowMoreSheet(true)} />
        <MoreSheet open={showMoreSheet} onClose={() => setShowMoreSheet(false)} onGoTo={(v) => { setShowMoreSheet(false); setAppView(v); }} resolvedTheme={resolvedTheme} />
      </div>
    );
  }

  if (appView === "profile") {
    return (
      <div data-theme={resolvedTheme}>
        <ProfilePage
          onBack={() => setAppView("home")}
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
          hiddenSuggestionIds={hiddenSuggestionIds}
          allExerciseTemplates={availableExerciseTemplates}
          onRestoreHidden={(id) => {
            removeHiddenSuggestion(id);
            setHiddenSuggestionIds(prev => { const next = new Set(prev); next.delete(id); return next; });
          }}
          onRestoreAllHidden={() => {
            [...hiddenSuggestionIds].forEach(id => removeHiddenSuggestion(id));
            setHiddenSuggestionIds(new Set());
          }}
        />
        <BottomNav activeView={appView} onNavigate={(view) => setAppView(view)} onMore={() => setShowMoreSheet(true)} />
        <MoreSheet open={showMoreSheet} onClose={() => setShowMoreSheet(false)} onGoTo={(v) => { setShowMoreSheet(false); setAppView(v); }} resolvedTheme={resolvedTheme} />
      </div>
    );
  }

  if (appView === "glossary") {
    return (
      <div data-theme={resolvedTheme} style={{ height: "100dvh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <GlossaryPage
          resolvedTheme={resolvedTheme}
          initialTerm={glossaryTerm}
          onBack={() => { setGlossaryTerm(""); setAppView("home"); }}
        />
      </div>
    );
  }

  if (appView === "share" && (savedWorkoutData || reportWorkout)) {
    const shareData = savedWorkoutData ?? reportWorkout!;
    return (
      <div data-theme={resolvedTheme}>
        <PostSaveShareScreen
          data={shareData}
          onDone={() => { setSavedWorkoutData(null); setAppView("report"); }}
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
        />
        <BottomNav activeView={appView} onNavigate={(view) => setAppView(view)} onMore={() => setShowMoreSheet(true)} />
        <MoreSheet open={showMoreSheet} onClose={() => setShowMoreSheet(false)} onGoTo={(v) => { setShowMoreSheet(false); setAppView(v); }} resolvedTheme={resolvedTheme} />
      </div>
    );
  }

  if (appView === "finish" && finishWorkoutDraft) {
    return (
      <div data-theme={resolvedTheme}>
        <FinishWorkoutPage
          draft={finishWorkoutDraft}
          onTitleChange={(value) =>
            setFinishWorkoutDraft((current) =>
              current
                ? {
                    ...current,
                    sessionName: value
                  }
                : current
            )
          }
          onNoteChange={(value) =>
            setFinishWorkoutDraft((current) =>
              current
                ? {
                    ...current,
                    note: value
                  }
                : current
            )
          }
          onPersonalNoteChange={(value) =>
            setFinishWorkoutDraft((current) =>
              current
                ? {
                    ...current,
                    personalNote: value,
                    noteType: "personal"
                  }
                : current
            )
          }
          onQuoteNoteChange={(value) =>
            setFinishWorkoutDraft((current) =>
              current
                ? {
                    ...current,
                    quoteNote: value,
                    noteType: "quote"
                  }
                : current
            )
          }
          onProgressPicChange={(index) =>
            setFinishWorkoutDraft((current) =>
              current
                ? {
                    ...current,
                    progressPicIndex: index ?? undefined
                  }
                : current
            )
          }
          onBack={() => setAppView("logger")}
          onSave={saveFinishedWorkout}
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
        />
        <BottomNav activeView={appView} onNavigate={(view) => setAppView(view)} onMore={() => setShowMoreSheet(true)} />
        {templateApplyPromptImages && (
          <section className="sheet-overlay leave-center-overlay" onClick={() => setTemplateApplyPromptImages(null)}>
            <div className="leave-center-card" onClick={(event) => event.stopPropagation()}>
              <div className="sheet-head">
                <div>
                  <p className="label">Update Template</p>
                  <h3>Save changes to your template?</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setTemplateApplyPromptImages(null)}>×</button>
              </div>
              <p className="settings-note">
                You changed the exercises or order during this session. Update your saved template to match, or keep the original.
              </p>
              <div className="sheet-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => finalizeFinishedWorkoutSave(templateApplyPromptImages, false)}
                >
                  Don&apos;t Apply
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => finalizeFinishedWorkoutSave(templateApplyPromptImages, true)}
                >
                  Apply to Original
                </button>
              </div>
            </div>
          </section>
        )}
        <MoreSheet open={showMoreSheet} onClose={() => setShowMoreSheet(false)} onGoTo={(v) => { setShowMoreSheet(false); setAppView(v); }} resolvedTheme={resolvedTheme} />
      </div>
    );
  }

  if (appView === "planner") {
    return (
      <div data-theme={resolvedTheme}>
        <PlannerHomePage
          plans={workoutPlans}
          library={availableExerciseTemplates}
          generationLibrary={generationCatalogExercises}
          existingTags={existingUserTags}
          activeView={plannerView}
          onViewChange={setPlannerView}
          hasActiveWorkout={hasActiveWorkout}
          onBack={() => setAppView("home")}
          onStartEmpty={() => openQuickSession("planner")}
          onCreateNew={() => {
            setEditingPlan(null);
            if (planBuilderDraft && planBuilderMode !== "edit") {
              setPlanBuilderMode(planBuilderMode);
              setPlanBuilderDraft(planBuilderDraft);
            } else {
              setPlanBuilderMode("create");
              setPlanBuilderDraft(buildBlankWorkoutPlan());
            }
            setAppView("plan-builder");
          }}
          onGeneratePlan={(plan, config) => {
            setEditingPlan(null);
            setPlanBuilderMode("generate");
            setPlanBuilderDraft(plan);
            setLastGenConfig(config);
            setAppView("plan-builder");
          }}
          onStartPlan={(plan) => startPlanWorkout(plan, workoutPlans.some((entry) => entry.id === plan.id) ? "saved" : "library")}
          onEditPlan={(plan) => {
            setEditingPlan(plan);
            setPlanBuilderMode("edit");
            setPlanBuilderDraft(plan);
            setAppView("plan-builder");
          }}
          onDuplicatePlan={duplicatePlan}
          onSharePlan={sharePlan}
          onEditTags={(plan) => {
            setTagPlanId(plan.id);
            setTagPlanDraft(plan.userTags ?? []);
            setTagPlanSearch("");
          }}
          onReorderPlans={reorderPlans}
          onDeletePlan={deletePlan}
          onUseTemplate={useTemplate}
          onResumeWorkout={openActiveWorkout}
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
          defaultGoal={settings.preferredGoal}
          defaultLevel={settings.preferredLevel}
          defaultEquipment={settings.preferredEquipment}
          repiqPlan={repiqPlan}
          initialPlannerMode={plannerInitialMode}
          onStartRepIQSession={startRepIQSession}
          onRegeneratePlan={regenerateRepIQPlan}
          onRegenerateRemaining={regenerateRemainingRepIQSessions}
          onSaveSessionToLibrary={(day, label) => {
            const plan: WorkoutPlan = {
              id: `plan-${Date.now()}`,
              name: label,
              exercises: day.exercises.map((e) => ({
                exerciseId: e.exerciseId,
                setCount: e.sets,
                restTimer: String(e.restSeconds),
              })),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            savePlan(plan);
            setPlannerView("mine");
          }}
          psychProfile={psychProfile}
          onToggleRepIQStatus={() => {
            if (!repiqPlan) return;
            const isPaused = repiqPlan.status === "paused";
            if (isPaused) {
              // Resuming: calculate days used in this pause session
              const pausedAtMs = repiqPlan.pausedAt ? new Date(repiqPlan.pausedAt).getTime() : Date.now();
              const daysPaused = Math.round((Date.now() - pausedAtMs) / 86400000);
              const updated: RepIQPlan = {
                ...repiqPlan,
                status: "active",
                pausedAt: null,
                pauseEndDate: null,
                totalPauseDaysUsed: (repiqPlan.totalPauseDaysUsed ?? 0) + daysPaused,
              };
              persistRepIQPlan(updated);
              setRepiqPlan(updated);
            } else {
              // Direct pause (no date) — fallback
              const updated: RepIQPlan = {
                ...repiqPlan,
                status: "paused",
                pausedAt: new Date().toISOString(),
                pauseEndDate: null,
              };
              persistRepIQPlan(updated);
              setRepiqPlan(updated);
            }
          }}
          onPausePlan={(pauseEndDate) => {
            if (!repiqPlan) return;
            const updated: RepIQPlan = {
              ...repiqPlan,
              status: "paused",
              pausedAt: new Date().toISOString(),
              pauseEndDate,
            };
            persistRepIQPlan(updated);
            setRepiqPlan(updated);
          }}
          onDismissReview={() => {
            if (!repiqPlan) return;
            const updated = { ...repiqPlan, needsReview: false };
            persistRepIQPlan(updated);
            setRepiqPlan(updated);
          }}
          onCarryOverSessions={() => {
            if (!repiqPlan) return;
            const wi = repiqPlan.currentWeekIndex;
            const currentWeek = repiqPlan.weeks[wi];
            if (!currentWeek) return;
            const nextWi = wi + 1;
            if (nextWi >= repiqPlan.weeks.length) return; // no next cycle to carry over to
            const incompleteDays = currentWeek.days.filter(d => !d.completedAt);
            if (incompleteDays.length === 0) return;
            // Mark current cycle as completed (skip remaining), prepend to next cycle
            const updatedWeeks = repiqPlan.weeks.map((week, wIdx) => {
              if (wIdx === wi) {
                return {
                  ...week,
                  isCompleted: true,
                  days: week.days.map(d => d.completedAt ? d : { ...d, completedAt: "skipped" }),
                };
              }
              if (wIdx === nextWi) {
                return {
                  ...week,
                  days: [...incompleteDays.map(d => ({ ...d, completedAt: null })), ...week.days],
                };
              }
              return week;
            });
            const updated: RepIQPlan = {
              ...repiqPlan,
              weeks: updatedWeeks,
              currentWeekIndex: nextWi,
            };
            persistRepIQPlan(updated);
            setRepiqPlan(updated);
          }}
          onCompressSessions={() => {
            setShowCompressDurationSheet(true);
          }}
          genDraftConfig={plannerGenDraftConfig}
          onGenDraftConfigChange={(config) => setPlannerGenDraftConfig(config)}
          savedWorkouts={savedWorkoutsList}
          onOpenHistoryWorkout={(workout, weekIdx, dayIdx, label, sessionNum) => {
            setHistoryDetailWorkout(workout);
            setHistoryDetailPlanContext(repiqPlan ? { weekIdx, dayIdx, label, sessionNum } : null);
            setHistoryDetailReturnView("planner");
            setAppView("history-detail");
          }}
          onSaveHistoryWorkout={saveHistoryWorkoutToMyWorkouts}
          onTryRepIQPlan={() => {
            const plan = generateRepIQPlan(psychProfile);
            persistRepIQPlan(plan);
            setRepiqPlan(plan);
            setPlannerInitialMode("repiq");
          }}
          onNavigateGlossary={(term) => { setGlossaryTerm(term); setAppView("glossary"); }}
          onApplyCustomSplit={(arrangement) => {
            if (!repiqPlan) return;
            // Convert muscle arrangement to PlanDayTemplates
            const MUSCLE_SLOT: Record<string, PlanExerciseSlot> = {
              "Chest":      { patterns: ["horizontal_push"], primaryMuscle: "Chest" },
              "Back":       { patterns: ["vertical_pull", "horizontal_pull"], primaryMuscle: "Back" },
              "Shoulders":  { patterns: ["vertical_push"], primaryMuscle: "Shoulders" },
              "Biceps":     { patterns: ["isolation_pull"], primaryMuscle: "Biceps" },
              "Triceps":    { patterns: ["isolation_push"], primaryMuscle: "Triceps" },
              "Quads":      { patterns: ["squat"], primaryMuscle: "Quads" },
              "Hamstrings": { patterns: ["hip_hinge"], primaryMuscle: "Hamstrings" },
              "Glutes":     { patterns: ["hip_hinge"], primaryMuscle: "Glutes" },
              "Core":       { patterns: ["isolation_push"], primaryMuscle: "Core" },
              "Calves":     { patterns: ["isolation_legs"], primaryMuscle: "Calves" },
            };
            const customTemplates: PlanDayTemplate[] = arrangement.map(day => {
              const baseSlots = day.muscles.map(m => MUSCLE_SLOT[m]).filter(Boolean);
              // Pad to at least 4 slots by doubling primary muscles
              const slots = [...baseSlots];
              let padIdx = 0;
              while (slots.length < 4 && baseSlots.length > 0) {
                slots.push({ ...baseSlots[padIdx % baseSlots.length] });
                padIdx++;
              }
              return {
                label: day.label,
                focus: day.muscles.join(" · "),
                slots: slots.slice(0, 6),
              };
            });
            // Regenerate plan with custom templates
            const goal: TrainingGoal = repiqPlan.goal;
            const exp: ExperienceLevel = repiqPlan.experienceLevel;
            const days = arrangement.length;
            const equipment: EquipmentAccess = psychProfile.equipmentAccess ?? "full_gym";
            const sessionLen = repiqPlan.sessionLengthMin;
            const mesoWeeks = repiqPlan.mesocycleLengthWeeks;
            const scheme = getPlanSetRepScheme(goal);
            const cycleDaysVal = psychProfile.cycleDays ?? null;
            const effectiveCycleDays = cycleDaysVal ?? 7;
            const totalCycles = cycleDaysVal && cycleDaysVal !== 7
              ? Math.round((mesoWeeks * 7) / effectiveCycleDays)
              : mesoWeeks;
            const used = new Set<string>();
            const weeks: RepIQPlanWeek[] = Array(totalCycles).fill(null).map((_, weekIdx) => ({
              weekNumber: weekIdx + 1,
              isCompleted: false,
              days: customTemplates.map(tmpl => ({
                sessionLabel: tmpl.label,
                focus: tmpl.focus,
                exercises: tmpl.slots
                  .map(slot => {
                    const exId = pickPlanExercise(generationCatalogExercises, slot, exp, used, equipment);
                    if (!exId) return null;
                    used.add(exId);
                    return {
                      exerciseId: exId,
                      sets: scheme.sets,
                      reps: scheme.reps,
                      restSeconds: scheme.restSeconds,
                    } satisfies RepIQPlanExercise;
                  })
                  .filter((e): e is RepIQPlanExercise => e !== null),
                completedAt: null,
              })),
            }));
            const now = new Date().toISOString();
            const plan: RepIQPlan = {
              ...repiqPlan,
              id: `plan-${Date.now()}`,
              generatedAt: now,
              startDate: now.slice(0, 10),
              lastRegeneratedAt: now,
              planName: `Custom Split · ${days} days`,
              daysPerWeek: days,
              splitType: "custom" as SplitType,
              cycleDays: cycleDaysVal,
              totalCycles,
              currentWeekIndex: 0,
              weeks,
              status: "active",
              customSplitArrangement: arrangement,
            };
            persistRepIQPlan(plan);
            setRepiqPlan(plan);
          }}
        />
        <BottomNav activeView={appView} onNavigate={(view) => setAppView(view)} onMore={() => setShowMoreSheet(true)} />

        {hasActiveWorkout && (
          <ActiveWorkoutTray
            sessionName={workoutMeta.sessionName}
            duration={derivedDuration}
            onResume={openActiveWorkout}
            onDiscardRequest={() => {
              setDiscardReturnView("planner");
              setTrayDiscardOpen(true);
            }}
          />
        )}
        {trayDiscardOpen && (
          <section className="sheet-overlay leave-center-overlay" onClick={() => setTrayDiscardOpen(false)}>
            <div className="leave-center-card" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-head">
                <div>
                  <p className="label">Discard Workout</p>
                  <h3>{workoutMeta.sessionName}</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setTrayDiscardOpen(false)}>×</button>
              </div>
              <section className="session-summary session-summary-compact">
                <p className="label">Session so far</p>
                <div className="session-summary-grid">
                  <article className="session-summary-item">
                    <span>Elapsed</span>
                    <strong>{derivedDuration}</strong>
                  </article>
                  <article className="session-summary-item">
                    <span>Completed</span>
                    <strong>{workoutSummary.sets} sets</strong>
                  </article>
                  <article className="session-summary-item">
                    <span>Volume</span>
                    <strong>{workoutSummary.volume.toFixed(0)} kg</strong>
                  </article>
                  <article className="session-summary-item">
                    <span>Incomplete</span>
                    <strong>{incompleteSetCount} sets</strong>
                  </article>
                </div>
              </section>
              <div className="sheet-actions">
                <button className="secondary-button" type="button" onClick={() => setTrayDiscardOpen(false)}>
                  Keep Going
                </button>
                <button className="primary-button is-danger-btn" type="button" onClick={() => { setTrayDiscardOpen(false); discardWorkout(); }}>
                  Discard
                </button>
              </div>
            </div>
          </section>
        )}
        {tagPlanId && (
          <section className="sheet-overlay leave-center-overlay" onClick={() => setTagPlanId(null)}>
            <div className="leave-center-card" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-head">
                <div>
                  <p className="label">Tags</p>
                  <h3>Edit workout tags</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setTagPlanId(null)}>×</button>
              </div>
              <PlanTagPicker
                value={tagPlanDraft}
                existingTags={existingUserTags}
                createLabel="+ New"
                onChange={setTagPlanDraft}
                searchValue={tagPlanSearch}
                onSearchChange={setTagPlanSearch}
              />
              <div className="sheet-actions" style={{ marginTop: "16px" }}>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => {
                    const pending = tagPlanSearch.trim();
                    const allTags = [...new Set([...existingUserTags, ...tagPlanDraft])];
                    const canAdd = pending.length > 0 && !allTags.some(t => t.toLowerCase() === pending.toLowerCase());
                    const finalTags = canAdd ? [...tagPlanDraft, pending] : tagPlanDraft;
                    setPlanTags(tagPlanId, finalTags);
                    setTagPlanSearch("");
                    setTagPlanId(null);
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </section>
        )}
        <MoreSheet open={showMoreSheet} onClose={() => setShowMoreSheet(false)} onGoTo={(v) => { setShowMoreSheet(false); setAppView(v); }} resolvedTheme={resolvedTheme} />
        {showCompressDurationSheet && (
          <section className="sheet-overlay" onClick={() => setShowCompressDurationSheet(false)}>
            <div className="sheet-card" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-head">
                <div>
                  <p className="label">Compress sessions</p>
                  <h3>How long per session?</h3>
                  <p className="readiness-hint" style={{ textAlign: "left", marginTop: 4 }}>
                    We'll keep the best exercises to fit your time
                  </p>
                </div>
                <button className="icon-button" type="button" onClick={() => setShowCompressDurationSheet(false)}>×</button>
              </div>
              <div className="readiness-chips" style={{ marginTop: 16 }}>
                {([30, 45, 60, 75, 90] as const).map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    className="readiness-chip"
                    onClick={() => handleCompressWithDuration(mins)}
                  >
                    <span className="readiness-chip-label">{mins} min</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    );
  }

  if (appView === "plan-builder" && planBuilderDraft) {
    if (builderAddExerciseOpen) {
      const addedIds = new Set(planBuilderDraft.exercises.map((pe) => pe.exerciseId));
      return (
        <div data-theme={resolvedTheme}>
          <AddExercisePage
            templates={availableExerciseTemplates}
            existingExerciseNames={planBuilderDraft.exercises
              .map((pe) => availableExerciseTemplates.find((t) => t.id === pe.exerciseId)?.name ?? "")
              .filter(Boolean)}
            onBack={() => setBuilderAddExerciseOpen(false)}
            onAddSelected={(templateIds) => {
              const newExercises = templateIds
                .filter((id) => !addedIds.has(id))
                .map((id) => ({ exerciseId: id, setCount: 3, setTypes: ["normal", "normal", "normal"] as DraftSetType[], restTimer: "90" }));
              setPlanBuilderDraft((draft) =>
                draft
                  ? { ...draft, exercises: [...draft.exercises, ...newExercises], updatedAt: new Date().toISOString() }
                  : draft
              );
              setBuilderAddExerciseOpen(false);
            }}
            onCreateCustom={(input) => {
              const id = createCustomExercise(input);
              return id;
            }}
            onOpenDetails={(exerciseId) => openDetails(exerciseId)}
            resolvedTheme={resolvedTheme}
            onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
          />
          <BottomNav activeView={appView} onNavigate={(view) => { setBuilderAddExerciseOpen(false); setAppView(view); }} onMore={() => setShowMoreSheet(true)} />
          {hasActiveWorkout && (
            <ActiveWorkoutTray
              sessionName={workoutMeta.sessionName}
              duration={derivedDuration}
              onResume={openActiveWorkout}
              onDiscardRequest={() => { setDiscardReturnView("planner"); setTrayDiscardOpen(true); }}
            />
          )}
          <MoreSheet open={showMoreSheet} onClose={() => setShowMoreSheet(false)} onGoTo={(v) => { setShowMoreSheet(false); setAppView(v); }} resolvedTheme={resolvedTheme} />
        </div>
      );
    }

    return (
      <div data-theme={resolvedTheme}>
        <PlanBuilderPage
          draft={planBuilderDraft}
          mode={planBuilderMode}
          library={availableExerciseTemplates}
          existingTags={existingUserTags}
          onBack={() => { setPlannerInitialMode("custom"); setAppView("planner"); }}
          onChange={setPlanBuilderDraft}
          onAddExercise={() => setBuilderAddExerciseOpen(true)}
          onOpenExerciseDetails={(exerciseId) => openDetails(exerciseId)}
          onDeletePlan={planBuilderMode === "edit" && editingPlan ? () => {
            deletePlan(editingPlan.id);
            setEditingPlan(null);
            setPlanBuilderDraft(null);
            setPlanBuilderMode("create");
            setPlannerInitialMode("custom");
            setAppView("planner");
          } : undefined}
          onSavePlan={(plan) => {
            savePlan(plan);
            setEditingPlan(planBuilderMode === "edit" ? plan : null);
            setPlanBuilderDraft(null);
            setPlanBuilderMode("create");
            setPlannerView("mine");
            setPlannerInitialMode("custom");
            setAppView("planner");
          }}
          onStartNow={planBuilderMode === "generate" ? (plan) => {
            // Start the generated session immediately (saves time vs. save → find → start)
            setPlanBuilderDraft(null);
            setPlanBuilderMode("create");
            setPlannerGenDraftConfig({
              goal: "Hypertrophy",
              muscles: [],
              duration: "45 min",
              equipment: psychProfile.equipmentAccess ?? "full_gym",
              seedOffset: 0,
            });
            startPlanWorkout(plan, "generated");
          } : undefined}
          onShuffle={planBuilderMode === "generate" && lastGenConfig ? () => {
            const nextConfig = { ...lastGenConfig, seedOffset: lastGenConfig.seedOffset + 1 };
            setLastGenConfig(nextConfig);
            const newPlan = buildGeneratedPlan(nextConfig, generationCatalogExercises);
            if (newPlan) setPlanBuilderDraft(newPlan);
          } : undefined}
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
        />
        <BottomNav activeView={appView} onNavigate={(view) => setAppView(view)} onMore={() => setShowMoreSheet(true)} />
        {hasActiveWorkout && (
          <ActiveWorkoutTray
            sessionName={workoutMeta.sessionName}
            duration={derivedDuration}
            onResume={openActiveWorkout}
            onDiscardRequest={() => { setDiscardReturnView("planner"); setTrayDiscardOpen(true); }}
          />
        )}
        <MoreSheet open={showMoreSheet} onClose={() => setShowMoreSheet(false)} onGoTo={(v) => { setShowMoreSheet(false); setAppView(v); }} resolvedTheme={resolvedTheme} />
      </div>
    );
  }

  if (appView === "home") {
    const latestWorkout = savedWorkoutsList[0] ?? null;
    const streak = computeStreak(savedWorkoutsList);
    const cycleDays = psychProfile.cycleDays ?? 7;
    const weekStreak = computeWeekStreak(
      savedWorkoutsList,
      getSafeTargetPerWeek(psychProfile.scheduleCommitment, psychProfile.daysPerWeekPref),
      cycleDays,
    );
    const weekStats = getThisWeekStats(savedWorkoutsList);
    const firstName = psychProfile.name?.split(" ")[0] ?? null;
    const greeting = getGreeting();
    // Most recent PR from any workout in the last 30 days
    const topPR = (() => {
      const cutoff = Date.now() - 30 * 86_400_000;
      for (const w of savedWorkoutsList) {
        if (new Date(w.savedAt).getTime() < cutoff) break;
        const pr = w.rewards?.find((r) => r.category === "pr");
        if (pr?.detail) return pr.detail;
      }
      return null;
    })();
    const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
    const muscleCoverage = computeMuscleCoverage(savedWorkoutsList, cycleDays);
    const goalProgress = computeGoalProgress(savedWorkoutsList, psychProfile);
    const trainingTrend = computeTrainingTrend(savedWorkoutsList, cycleDays);
    // Check if paused plan has expired
    const pausedPlanExpired = (() => {
      if (!repiqPlan || repiqPlan.status !== "paused") return false;
      const pausedAtMs = repiqPlan.pausedAt ? new Date(repiqPlan.pausedAt).getTime() : 0;
      const daysPaused = Math.round((Date.now() - pausedAtMs) / 86400000);
      const totalUsed = (repiqPlan.totalPauseDaysUsed ?? 0) + daysPaused;
      const maxDays = repiqPlan.pauseDaysMax ?? 45;
      const lastSessionDate = savedWorkoutsList[0]
        ? new Date((savedWorkoutsList[0].date ?? savedWorkoutsList[0].savedAt).slice(0, 10)).getTime()
        : 0;
      const daysSinceLastSession = Math.round((Date.now() - lastSessionDate) / 86400000);
      return totalUsed >= maxDays && daysSinceLastSession > 30;
    })();
    const todayDayNum = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })();
    const nextRepIQSession = repiqPlan ? getNextRepIQSession(repiqPlan) : null;
    // Show last workout card whenever there's a recent session (≤14 days), plan or not
    const lastWorkoutDaysAgo = latestWorkout
      ? Math.floor((Date.now() - new Date(latestWorkout.savedAt).getTime()) / 86_400_000)
      : Infinity;
    const showLastWorkout = !!latestWorkout && lastWorkoutDaysAgo <= 14;

    return (
      <main className={`shell selector-shell${hasActiveWorkout ? " has-tray" : ""}`} data-theme={resolvedTheme}>
        <section className="app-shell selector-page">

          {/* ── Header ── */}
          <header className="home-header">
            <div className="home-header-left">
              <h1 className="home-greeting">
                {firstName ? `${greeting}, ${firstName}` : greeting}
              </h1>
              {(streak >= 1 || weekStreak >= 1) && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div className="home-streak-row">
                    {streak >= 1 && (
                      <div className="home-streak-badge">
                        <span className="home-streak-fire">🔥</span>
                        <span className="home-streak-count">{streak}</span>
                        <span className="home-streak-label">day{streak !== 1 ? "s" : ""}</span>
                      </div>
                    )}
                    {weekStreak >= 1 && (
                      <div className="home-streak-badge home-streak-badge--week">
                        <svg className="home-streak-cal-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                          <line x1="16" y1="2" x2="16" y2="6"/>
                          <line x1="8" y1="2" x2="8" y2="6"/>
                          <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        <span className="home-streak-count">{weekStreak}</span>
                        <span className="home-streak-label">wk{weekStreak !== 1 ? "s" : ""}</span>
                      </div>
                    )}
                  </div>
                  <InfoIcon onClick={() => { setGlossaryTerm("streak"); setAppView("glossary"); }} />
                </div>
              )}
            </div>
            <div className="home-header-actions">
              <button
                type="button"
                className="theme-toggle-btn"
                aria-label={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                onClick={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
              >
                {resolvedTheme === "dark" ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="5"/>
                    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                )}
              </button>
            </div>
          </header>

          <section className="selector-stack">

            {/* ── PR highlight — standalone, above everything ── */}
            {topPR && (
              <div className="home-pr-banner">
                <span className="home-pr-icon">🏆</span>
                <span className="home-pr-text">{topPR}</span>
              </div>
            )}

            {/* ── Next Session Card — primary action ── */}
            <NextSessionCard
              repiqPlan={repiqPlan}
              savedWorkoutsCount={savedWorkoutsList.length}
              hasActiveWorkout={hasActiveWorkout}
              nextSession={nextRepIQSession}
              onStartRepIQ={startRepIQSession}
              onOpenQuick={() => openQuickSession("home")}
              onGoToRepIQPlan={() => { setPlannerInitialMode("repiq"); setAppView("planner"); }}
              onGoToGenerate={() => { setPlannerView("generate"); setAppView("planner"); }}
              onGoToCustom={() => openQuickSession("home")}
              onGoToBrowse={() => { setPlannerView("library"); setAppView("planner"); }}
              onReviewPlan={() => { setPlannerInitialMode("repiq"); setAppView("planner"); }}
            />

            {/* ── Section divider: action → review ── */}
            <div className="home-section-label">
              {(psychProfile.cycleDays ?? 7) !== 7 ? `This Cycle · ${psychProfile.cycleDays}d` : "This Week"}
            </div>

            {/* ── This week dots ── */}
            <article className="home-week-card">
              <div className="home-week-dots">
                {DAY_LABELS.map((label, i) => (
                  <div key={i} className={`home-week-dot-col${i === todayDayNum ? " is-today" : ""}`}>
                    <div className={`home-week-dot${weekStats.activeDayNumbers.includes(i) ? " is-done" : ""}`} />
                    <span className="home-week-day-label">{label}</span>
                  </div>
                ))}
              </div>
              {weekStats.sessions > 0 ? (
                <p className="home-week-meta">
                  {weekStats.sessions} {weekStats.sessions === 1 ? "session" : "sessions"}
                  {weekStats.sets > 0 ? ` · ${weekStats.sets} sets` : ""}
                  {weekStats.volume > 0 ? ` · ${Math.round(weekStats.volume).toLocaleString()} kg` : ""}
                </p>
              ) : (
                <p className="home-week-meta home-week-meta-empty">No workouts yet this week</p>
              )}
            </article>

            {/* ── Last workout — no-plan users, recent session (≤14 days) ── */}
            {showLastWorkout && (
              <article
                className="session-card home-latest-card"
                onClick={() => { setReportWorkout(latestWorkout!); setAppView("report"); }}
                style={{ cursor: "pointer" }}
              >
                <div className="home-latest-info">
                  <p className="home-latest-label">
                    Last Workout · {getRelativeDate(latestWorkout!.date ?? latestWorkout!.savedAt)}
                  </p>
                  <h2 className="home-latest-name">{latestWorkout!.sessionName}</h2>
                  <p className="home-latest-meta">
                    {latestWorkout!.duration}
                    {latestWorkout!.totalSets > 0 ? ` · ${latestWorkout!.totalSets} sets` : ""}
                    {latestWorkout!.totalVolume > 0 ? ` · ${Math.round(latestWorkout!.totalVolume).toLocaleString()} kg` : ""}
                  </p>
                </div>
                <span className="home-latest-chevron" aria-hidden="true">›</span>
              </article>
            )}

            {/* ── Section divider: this week → progress ── */}
            <div className="home-section-label">Progress</div>

            {/* ── Training Trend card ── */}
            <div
              className="home-goal-card home-card-tappable"
              role="button"
              tabIndex={0}
              onClick={() => { setInsightsInitialTab("summary"); setAppView("insights"); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setInsightsInitialTab("summary"); setAppView("insights"); } }}
            >
              <div className="home-trend-header">
                <p className="home-goal-label">Training Trend · Overall Volume <InfoIcon onClick={(e) => { e.stopPropagation(); setGlossaryTerm("training trend"); setAppView("glossary"); }} /></p>
                <p className={`home-trend-zone-label home-trend-zone-label--${trainingTrend.currentZone}`}>
                  {trainingTrend.zoneLabel}
                </p>
              </div>
              {/* 3 week boxes — W-2, W-1, W-0 (current) */}
              <div className="home-trend-weeks home-trend-weeks--full" aria-hidden="true">
                {trainingTrend.recentWeeks.map((wk) => (
                  <div
                    key={wk.label}
                    className={`home-trend-wk home-trend-wk--${wk.zone}${wk.isCurrent ? " home-trend-wk--current" : ""}${wk.isPartial ? " home-trend-wk--partial" : ""}`}
                  >
                    <span className="home-trend-wk-label">{wk.label}</span>
                    <span className="home-trend-wk-zone">
                      {wk.isPartial ? "Partial"
                        : wk.zone === "progress" ? "Progress"
                        : wk.zone === "plateau" ? "Plateau"
                        : wk.zone === "missed" ? "Missed"
                        : "Maintain"}
                    </span>
                  </div>
                ))}
              </div>
              <p className="home-goal-insight">{trainingTrend.insight}</p>
              <p className="home-card-tap-hint">{trainingTrend.tapHint}</p>
            </div>

            {/* ── Muscle nudge — compact, only shows when muscles are due ── */}
            <HomeMuscleNudge
              coverage={muscleCoverage}
              onTap={() => { setInsightsInitialTab("summary"); setAppView("insights"); }}
            />


          </section>
        </section>

        <BottomNav activeView={appView} onNavigate={(view) => setAppView(view)} onMore={() => setShowMoreSheet(true)} />

        {hasActiveWorkout && (
          <ActiveWorkoutTray
            sessionName={workoutMeta.sessionName}
            duration={derivedDuration}
            onResume={openActiveWorkout}
            onDiscardRequest={() => {
              setDiscardReturnView("home");
              setTrayDiscardOpen(true);
            }}
          />
        )}
        {trayDiscardOpen && (
          <section className="sheet-overlay leave-center-overlay" onClick={() => setTrayDiscardOpen(false)}>
            <div className="leave-center-card" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-head">
                <div>
                  <p className="label">Discard Workout</p>
                  <h3>{workoutMeta.sessionName}</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setTrayDiscardOpen(false)}>×</button>
              </div>
              <section className="session-summary session-summary-compact">
                <p className="label">Session so far</p>
                <div className="session-summary-grid">
                  <article className="session-summary-item">
                    <span>Elapsed</span>
                    <strong>{derivedDuration}</strong>
                  </article>
                  <article className="session-summary-item">
                    <span>Completed</span>
                    <strong>{workoutSummary.sets} sets</strong>
                  </article>
                  <article className="session-summary-item">
                    <span>Volume</span>
                    <strong>{workoutSummary.volume.toFixed(0)} kg</strong>
                  </article>
                  <article className="session-summary-item">
                    <span>Incomplete</span>
                    <strong>{incompleteSetCount} sets</strong>
                  </article>
                </div>
              </section>
              <div className="sheet-actions">
                <button className="secondary-button" type="button" onClick={() => setTrayDiscardOpen(false)}>
                  Keep Going
                </button>
                <button className="primary-button is-danger-btn" type="button" onClick={() => { setTrayDiscardOpen(false); discardWorkout(); }}>
                  Discard
                </button>
              </div>
            </div>
          </section>
        )}
        <MoreSheet open={showMoreSheet} onClose={() => setShowMoreSheet(false)} onGoTo={(v) => { setShowMoreSheet(false); setAppView(v); }} resolvedTheme={resolvedTheme} />
        {showReadinessSheet && (
          <ReadinessCheckSheet
            onSelect={handleReadinessSelect}
            onSkip={handleReadinessSkip}
            onDontAskAgain={handleReadinessDontAskAgain}
          />
        )}
      </main>
    );
  }

  if (settingsOpen) {
    return (
      <>
      <main className="detail-page workout-settings-page" data-theme={resolvedTheme}>
        <header className="detail-topbar">
          <button className="back-nav-button detail-back-button" type="button" onClick={() => setSettingsOpen(false)} aria-label="Back">←</button>
          <div className="detail-topbar-copy">
            <p className="label">Workout</p>
            <h1>Settings</h1>
          </div>
          <button type="button" className="theme-toggle-btn" onClick={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
            {resolvedTheme === "dark" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
          </button>
        </header>

        <div className="workout-settings-body">
          <div className="settings-block">
            <p className="settings-section-title">Session Settings</p>
            <label className="settings-row">
              <span>Default rest timer for new exercises</span>
              <input type="text" inputMode="numeric" value={settings.defaultRestSeconds}
                onChange={(e) => setSettings((c) => ({ ...c, defaultRestSeconds: sanitizeIntegerInput(e.target.value) }))} />
            </label>
            <label className="settings-row">
              <span>Between exercises</span>
              <input type="text" inputMode="numeric" value={settings.transitionRestSeconds}
                onChange={(e) => setSettings((c) => ({ ...c, transitionRestSeconds: sanitizeIntegerInput(e.target.value) }))} />
            </label>
            <label className="toggle-row">
              <span>Carry forward previous values</span>
              <input type="checkbox" checked={settings.carryForwardDefaults}
                onChange={(e) => setSettings((c) => ({ ...c, carryForwardDefaults: e.target.checked }))} />
            </label>
            <label className="toggle-row">
              <span>Show RPE column</span>
              <input type="checkbox" checked={settings.showRpe}
                onChange={(e) => setSettings((c) => ({ ...c, showRpe: e.target.checked }))} />
            </label>
            <p className="settings-note">New exercises use the default rest timer. Existing exercises keep their own timer. The between-exercises timer fires after the final set when moving to the next exercise.</p>
          </div>

          <div className="settings-block">
            <p className="settings-section-title">Guidance Defaults</p>
            <label className="toggle-row">
              <span>Start session with top strip guidance</span>
              <input type="checkbox" checked={settings.guidanceTopStrip}
                onChange={(e) => setSettings((c) => ({ ...c, guidanceTopStrip: e.target.checked }))} />
            </label>
            <label className="toggle-row">
              <span>Start session with inline tips</span>
              <input type="checkbox" checked={settings.guidanceInline}
                onChange={(e) => setSettings((c) => ({ ...c, guidanceInline: e.target.checked }))} />
            </label>
            <p className="settings-note">These defaults apply when a new session starts. Changes during a session only affect the current session.</p>
          </div>

          <div className="settings-block">
            <p className="settings-section-title">Library Defaults</p>
            <p className="settings-note" style={{ marginBottom: 10 }}>Pre-applied filters when you open the Library tab.</p>
            {([
              { label: "Goal", key: "preferredGoal" as const, options: ["Hypertrophy", "Strength", "Endurance"] },
              { label: "Level", key: "preferredLevel" as const, options: ["Beginner", "Intermediate", "Advanced"] },
              { label: "Equipment", key: "preferredEquipment" as const, options: ["Full Gym", "Dumbbells", "Bodyweight"] },
            ]).map(({ label, key, options }) => (
              <div key={key} className="settings-pref-row">
                <span className="settings-pref-label">{label}</span>
                <div className="settings-pref-chips">
                  {options.map((opt) => (
                    <button key={opt} type="button"
                      className={`generate-chip generate-chip--sm${settings[key] === opt ? " is-selected" : ""}`}
                      onClick={() => setSettings((c) => ({ ...c, [key]: c[key] === opt ? null : opt }))}
                    >{opt}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
      <BottomNav activeView={appView} onNavigate={(view) => { setSettingsOpen(false); setAppView(view); }} onMore={() => setShowMoreSheet(true)} />
      <MoreSheet open={showMoreSheet} onClose={() => setShowMoreSheet(false)} onGoTo={(v) => { setShowMoreSheet(false); setAppView(v); }} resolvedTheme={resolvedTheme} />
      </>
    );
  }

  return (
    <main
      className={`shell ${showStickyRestDock ? "has-active-rest-dock" : ""} ${
        showStickyRestDock && restDockMinimized ? "has-minimized-rest-dock" : ""
      }`}
      data-theme={resolvedTheme}
    >
      <section className="app-shell">
        {showTopGuidanceSurface && (
          <div className="guidance-top-helper-backdrop" />
        )}
        {showTopGuidanceSurface && (
          <section
            className={`guidance-top-helper ${topGuidanceExpanded ? "is-expanded" : ""}`}
            style={{ transform: `translateY(${topGuidancePullDistance}px)` }}
            onPointerDown={beginGuidancePull}
            onPointerMove={moveGuidancePull}
            onPointerUp={endGuidancePull}
            onPointerCancel={endGuidancePull}
          >
            <div className="guidance-top-helper-handle" aria-hidden="true" />
            <div className="guidance-top-helper-copy">
              <p className="label">Workout Guidance</p>
              <strong>{guidanceTip}</strong>
              <p className="guidance-top-helper-detail">{guidanceWhy}</p>
            </div>
            <button
              className="guidance-top-helper-dismiss"
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setSessionGuidanceTopStrip(false);
                setShowTopGuidance(false);
              }}
            >
              Dismiss
            </button>
          </section>
        )}

        <div ref={topSectionRef}>
          <header className="topbar">
            <div className="topbar-start">
              <button
                className="back-nav-button"
                type="button"
                onClick={returnToWorkoutSelector}
                aria-label="Back"
              >
                ←
              </button>
              <div className="topbar-session-copy">
                <p className="session-name" title={workoutMeta.sessionName}>
                  {workoutMeta.sessionName}
                </p>
                <p className="session-name-meta">
                  {exercises.length} {exercises.length === 1 ? "exercise" : "exercises"}
                </p>
              </div>
            </div>
            <div className="topbar-actions">
              <button type="button" className="theme-toggle-btn" onClick={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
                {resolvedTheme === "dark" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
              </button>
              <button
                className="icon-button topbar-settings-button"
                type="button"
                aria-label="Workout settings and actions"
                title="Alter"
                onClick={() => setWorkoutMenuOpen((current) => !current)}
              >
                <span className="topbar-settings-glyph" aria-hidden="true">⚙</span>
              </button>
              <button
                className="icon-button topbar-collapse-toggle"
                type="button"
                aria-label={
                  collapsedExerciseIds.length === exercises.length && guidanceCollapsed
                    ? "Expand all"
                    : "Collapse all"
                }
                title={
                  collapsedExerciseIds.length === exercises.length && guidanceCollapsed
                    ? "Expand all"
                    : "Collapse all"
                }
                onClick={toggleCollapseAllExercises}
              >
                <span className="stack-toggle-icon" aria-hidden="true">
                  <span className="stack-toggle-corner" />
                  <span
                    className={`stack-toggle-card ${
                      collapsedExerciseIds.length === exercises.length && guidanceCollapsed ? "is-expand" : "is-collapse"
                    }`}
                  >
                    <span className="stack-toggle-card-line" />
                  </span>
                </span>
              </button>
            </div>
          </header>

          <div className="stats-strip">
            <div className="stat-item">
              <span className="stat-label">Duration</span>
              <button
                className="stat-value-button"
                type="button"
                onClick={() => setTimingOpen(true)}
              >
                {derivedDuration}
              </button>
            </div>
            <div className="stat-item stat-item-volume">
              <span className="stat-label">Volume</span>
              <span className="stat-value">{workoutSummary.volume.toFixed(0)} kg</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Sets</span>
              <span className="stat-value">{workoutSummary.sets}</span>
            </div>
            <button
              className={`stat-rewards-button ${rewardSummary.total > 0 ? "has-rewards" : ""}`}
              type="button"
              aria-label="View workout rewards"
              disabled={rewardSummary.set + rewardSummary.exercise === 0}
              onClick={() => setRewardSheetOpen(true)}
            >
              <div className="stat-reward-podium" aria-hidden="true">
                {rewardSummary.exercise > 0 && (
                  <span className="stat-reward-token stat-reward-token-exercise">
                    <span>{rewardLevelIcon.exercise}</span>
                    <strong>{rewardSummary.exercise}</strong>
                  </span>
                )}
                {rewardSummary.set > 0 && (
                  <span className="stat-reward-token stat-reward-token-set">
                    <span>{rewardLevelIcon.set}</span>
                    <strong>{rewardSummary.set}</strong>
                  </span>
                )}
              </div>
            </button>
            <button
              className="stat-muscles-button"
              type="button"
              aria-label="View muscles worked"
              onClick={openWorkoutMusclesPage}
            >
              Muscles ›
            </button>
          </div>
        </div>

        <section className={`exercise-stack ${resolvedFocusedExpandedExerciseId ? "has-focused-card" : ""}`}>
          {resolvedFocusedExpandedExerciseId && (
            <button
              className="logger-focus-backdrop"
              type="button"
              aria-label="Exit focused exercise view"
              onClick={() => setFocusedExpandedExerciseId(null)}
            />
          )}
          <div
            className={`pull-to-add ${pullDownDistance > 0 ? "is-visible" : ""} ${
              pullDownDistance > 58 ? "is-ready" : ""
            }`}
            style={{ height: `${pullDownDistance}px` }}
            onPointerDown={beginPullToAdd}
            onPointerMove={movePullToAdd}
            onPointerUp={endPullToAdd}
            onPointerCancel={endPullToAdd}
          >
            <span>{pullDownDistance > 58 ? "Release for workout actions" : "Pull for workout actions"}</span>
          </div>
          {exercises.length === 0 && (
            <div className="logger-empty-state">
              <p className="logger-empty-title">No exercises yet</p>
              <p className="logger-empty-sub">Add your first exercise to get started.</p>
              <div className="logger-empty-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => setAddExerciseOpen(true)}
                >
                  + Add Exercise
                </button>
                <button
                  className="logger-empty-discard-btn"
                  type="button"
                  onClick={requestDiscardWorkout}
                >
                  Discard
                </button>
              </div>
            </div>
          )}
          {/* ── Warm-up / activation guidance ── */}
          {exercises.length > 0 && !warmupDismissed && (() => {
            const sessionMuscles = [...new Set(exercises.map(e => e.primaryMuscle).filter(Boolean))];
            if (sessionMuscles.length === 0) return null;
            const ACTIVATION_MAP: Record<string, string[]> = {
              "Chest":      ["Arm circles (10 each)", "Band pull-aparts (15)", "Light push-ups (10)"],
              "Back":       ["Cat-cow stretches (10)", "Band pull-aparts (15)", "Scapular retractions (10)"],
              "Shoulders":  ["Arm circles (10 each)", "Band dislocates (10)", "Light lateral raises (10)"],
              "Biceps":     ["Wrist circles (10 each)", "Light band curls (15)"],
              "Triceps":    ["Arm circles (10 each)", "Light overhead extensions (10)"],
              "Quads":      ["Bodyweight squats (15)", "Leg swings front-to-back (10 each)", "Walking lunges (10)"],
              "Hamstrings": ["Leg swings side-to-side (10 each)", "Inchworms (8)", "Light RDL hip hinges (10)"],
              "Glutes":     ["Glute bridges (15)", "Clamshells (10 each)", "Fire hydrants (10 each)"],
              "Calves":     ["Ankle circles (10 each)", "Calf raises on step (15)"],
              "Core":       ["Dead bugs (10)", "Bird dogs (8 each)", "Plank hold (20s)"],
              "Abs":        ["Dead bugs (10)", "Bird dogs (8 each)", "Plank hold (20s)"],
              "Obliques":   ["Side plank hold (15s each)", "Standing trunk rotations (10 each)"],
            };
            const movements: string[] = [];
            const seen = new Set<string>();
            for (const m of sessionMuscles) {
              for (const move of ACTIVATION_MAP[m] ?? []) {
                if (!seen.has(move)) { seen.add(move); movements.push(move); }
              }
            }
            if (movements.length === 0) return null;
            return (
              <div className={`warmup-guidance-block${warmupExpanded ? " is-expanded" : ""}`}>
                <button
                  type="button"
                  className="warmup-guidance-toggle"
                  onClick={() => setWarmupExpanded(prev => !prev)}
                >
                  <span className="warmup-guidance-icon">🔥</span>
                  <span className="warmup-guidance-title">Warm Up &amp; Activate</span>
                  <span className="warmup-guidance-hint">{movements.length} movements · ~3 min</span>
                  <span className="warmup-guidance-chevron">{warmupExpanded ? "▾" : "›"}</span>
                </button>
                {warmupExpanded && (
                  <div className="warmup-guidance-content">
                    <p className="warmup-guidance-sub">Dynamic stretches and activation for {sessionMuscles.slice(0, 3).join(", ")}{sessionMuscles.length > 3 ? "…" : ""}</p>
                    <ul className="warmup-guidance-list">
                      {movements.slice(0, 6).map((m) => (
                        <li key={m} className="warmup-guidance-item">{m}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="warmup-guidance-dismiss"
                      onClick={() => setWarmupDismissed(true)}
                    >
                      Done — start workout
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {exercises.map((exercise, exerciseIndex) => {
            const lastSession = exercise.history[exercise.history.length - 1];
            const measurementType = getExerciseMeasurementType(exercise);
            const measurementLabels = getMeasurementColumnLabels(measurementType);
            const hasWeightInput = usesWeightInputForMeasurement(measurementType);
            const isCollapsed = collapsedExerciseIds.includes(exercise.id);
            const completedExerciseSets = buildCompletedSets(
              exercise.draftSets,
              lastSession,
              settings.carryForwardDefaults,
              measurementType
            ).resolvedSets;
            const isComplete = exercise.draftSets.length > 0 && exercise.draftSets.every((set) => set.done);
            const loggedSetCount = completedExerciseSets.length;
            const loggedVolume = sumSessionVolume(completedExerciseSets);
            const setRewardCount = loggerRewards.filter(
              (reward) => reward.exerciseId === exercise.id && reward.level === "set"
            ).length;
            const exerciseRewards = loggerRewards.filter(
              (reward) => reward.exerciseId === exercise.id && reward.level === "exercise"
            );
            const focusedExerciseIndex = resolvedFocusedExpandedExerciseId
              ? exercises.findIndex((entry) => entry.id === resolvedFocusedExpandedExerciseId)
              : -1;

            return (
              <article
                key={exercise.id}
                data-exercise-card-id={exercise.id}
                className={`exercise-card ${
                  exercise.id === resolvedActiveExerciseId ? "is-active" : ""
                } ${isComplete ? "is-complete" : ""} ${
                  isComplete && isCollapsed ? "is-complete-collapsed" : ""
                } ${exercise.supersetGroupId ? "has-superset" : ""} ${
                  isCollapsed ? "is-collapsed" : ""
                } ${reorderDragId === exercise.id ? "is-dragging" : ""
                } ${resolvedFocusedExpandedExerciseId === exercise.id ? "is-focused" : ""
                } ${
                  resolvedFocusedExpandedExerciseId &&
                  resolvedFocusedExpandedExerciseId !== exercise.id
                    ? "is-defocused"
                    : ""
                } ${
                  resolvedFocusedExpandedExerciseId &&
                  focusedExerciseIndex !== -1 &&
                  exerciseIndex < focusedExerciseIndex
                    ? "is-before-focus"
                    : ""
                } ${
                  resolvedFocusedExpandedExerciseId &&
                  focusedExerciseIndex !== -1 &&
                  exerciseIndex > focusedExerciseIndex
                    ? "is-after-focus"
                    : ""
                }`}
                style={
                  exercise.supersetGroupId
                    ? ({
                        "--superset-accent": getSupersetAccent(exercise.supersetGroupId) ?? undefined
                      } as CSSProperties)
                    : undefined
                }
                onDragOver={(event) => {
                  if (!reorderDragId || reorderDragId === exercise.id) {
                    return;
                  }
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  if (!reorderDragId || reorderDragId === exercise.id) {
                    return;
                  }
                  event.preventDefault();
                  moveExerciseByIds(reorderDragId, exercise.id);
                  setReorderDragId(null);
                }}
                onClick={() => {
                  if (isCollapsed) {
                    setFocusedExpandedExerciseId(exercise.id);
                    if (!hasStartedExercise) {
                      setPreStartExerciseActive(exercise.id);
                    }
                    toggleExerciseCollapse(exercise.id);
                  } else {
                    setInteractedExerciseActive(exercise.id);
                  }
                  setMenuExerciseId(null);
                }}
                >
                <div
                  className="exercise-title-row"
                  draggable
                  onDragStart={(event) => {
                    setReorderDragId(exercise.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", exercise.id);
                  }}
                  onDragEnd={() => setReorderDragId(null)}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (isCollapsed) {
                      setFocusedExpandedExerciseId(exercise.id);
                    }
                    if (!hasStartedExercise) {
                      setPreStartExerciseActive(exercise.id);
                    }
                    toggleExerciseCollapse(exercise.id);
                  }}
                >
                  <button
                    className="exercise-header-toggle"
                    type="button"
                    aria-label={isCollapsed ? `Expand ${exercise.name}` : `Collapse ${exercise.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (isCollapsed) {
                        setFocusedExpandedExerciseId(exercise.id);
                      }
                      if (!hasStartedExercise) {
                        setPreStartExerciseActive(exercise.id);
                      }
                        toggleExerciseCollapse(exercise.id);
                      }}
                  >
                    <img src={exercise.imageSrc} alt="" className="exercise-thumb" aria-hidden="true" />
                  </button>
                  <div className="exercise-title-copy">
                    <div className="exercise-title-heading">
                      <button
                        className={`exercise-link ${exercise.id === resolvedActiveExerciseId ? "is-active" : ""}`}
                        type="button"
                        title={exercise.name}
                        style={exercise.id === resolvedActiveExerciseId ? { color: "var(--accent)" } : undefined}
                        onPointerDown={() => beginTitleHold(exercise.id)}
                        onPointerUp={endTitleHold}
                        onPointerCancel={endTitleHold}
                        onPointerLeave={endTitleHold}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (titleHoldTriggered.current) {
                            titleHoldTriggered.current = false;
                            return;
                          }
                          openDetails(exercise.id);
                        }}
                      >
                        {exercise.name}
                      </button>
                      {exercise.id === resolvedActiveExerciseId && (
                        <span className="exercise-active-indicator" aria-hidden="true" />
                      )}
                    </div>
                  </div>
                  {(exerciseRewards.length > 0 || (isCollapsed && setRewardCount > 0)) && (
                    <button
                      className="exercise-reward-trigger"
                      type="button"
                      aria-label="View exercise reward summary"
                      title={
                        isCollapsed
                          ? [
                              setRewardCount > 0 ? `${setRewardCount} set rewards` : null,
                              exerciseRewards.length > 0
                                ? exerciseRewards.map((reward) => reward.shortLabel).join(", ")
                                : null
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : exerciseRewards.map((reward) => reward.shortLabel).join(", ")
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        setRewardSheetOpen(true);
                      }}
                    >
                      {isCollapsed ? (
                        <>
                          {exerciseRewards.length > 0 && (
                            <span className="reward-inline reward-inline-exercise">
                              <span className="reward-inline-icon" aria-hidden="true">
                                {rewardLevelIcon.exercise}
                              </span>
                              <span>{exerciseRewards.length}</span>
                            </span>
                          )}
                          {setRewardCount > 0 && (
                            <span className="reward-inline reward-inline-set">
                              <span className="reward-inline-icon" aria-hidden="true">
                                {rewardLevelIcon.set}
                              </span>
                              <span>{setRewardCount}</span>
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="reward-inline reward-inline-exercise">
                          <span className="reward-inline-icon" aria-hidden="true">
                            {rewardLevelIcon.exercise}
                          </span>
                          <span>{exerciseRewards.length}</span>
                        </span>
                      )}
                    </button>
                  )}
                  {isCollapsed && exercise.supersetGroupId && (
                    <span
                      className="superset-badge superset-badge-inline"
                      style={
                        {
                          "--superset-accent":
                            getSupersetAccent(exercise.supersetGroupId) ?? undefined
                        } as CSSProperties
                      }
                    >
                      Superset
                    </span>
                  )}
                  <div className="exercise-title-actions">
                    <button
                      className="icon-button exercise-swap-button"
                      type="button"
                      aria-label="Replace exercise"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSmartReplaceExerciseId(exercise.id);
                        setSmartReplaceReason("just_change");
                        setSmartReplaceSheetOpen(true);
                        setMenuExerciseId(null);
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="17 1 21 5 17 9"/>
                        <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                        <polyline points="7 23 3 19 7 15"/>
                        <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                      </svg>
                    </button>
                    <button
                      className="icon-button exercise-collapse-button"
                      type="button"
                      aria-label={isCollapsed ? "Expand exercise" : "Collapse exercise"}
                      aria-expanded={!isCollapsed}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (isCollapsed) {
                          setFocusedExpandedExerciseId(exercise.id);
                        }
                        if (!hasStartedExercise) {
                          setPreStartExerciseActive(exercise.id);
                        }
                        toggleExerciseCollapse(exercise.id);
                      }}
                    >
                      {isCollapsed ? "⌄" : "⌃"}
                    </button>
                    <button
                      className="icon-button exercise-menu-button"
                      type="button"
                      aria-label="Exercise options"
                      onClick={(event) => {
                        event.stopPropagation();
                        setMenuExerciseId((current) =>
                          current === exercise.id ? null : exercise.id
                        );
                      }}
                    >
                      ⋮
                    </button>
                  </div>
                </div>

                {isCollapsed && (
                  <p className="exercise-collapsed-meta">
                    {loggedSetCount} set{loggedSetCount === 1 ? "" : "s"} logged ·{" "}
                    {loggedVolume > 0 ? (
                      <strong className="exercise-collapsed-volume">
                        {loggedVolume.toFixed(0)} kg volume
                      </strong>
                    ) : (
                      <span>{loggedVolume.toFixed(0)} kg volume</span>
                    )}
                  </p>
                )}

                {exercise.stickyNoteEnabled && (
                  <button
                    className={`exercise-sticky-note ${
                      exercise.note.trim().length > 0 ? "has-note" : "is-empty"
                    }`}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openNoteEditor(exercise.id);
                    }}
                  >
                    <span className="exercise-sticky-label">Sticky note</span>
                    <span className="exercise-sticky-text">
                      {exercise.note.trim().length > 0 ? exercise.note : "Add a quick reference note"}
                    </span>
                  </button>
                )}

                <div className="rest-timer-row" onClick={(event) => event.stopPropagation()}>
                  <div className="rest-timer-main">
                    <span className="rest-timer-icon" aria-hidden="true">◷</span>
                    <span className="rest-timer-label">Rest Timer:</span>
                    <span className="rest-timer-controls">
                      {activeRestTimer?.exerciseId === exercise.id ? (
                        <>
                          <span className="rest-timer-countdown">
                            {formatRemainingSeconds(activeRestSeconds)}
                          </span>
                          <button
                            className="rest-timer-icon-button"
                            type="button"
                            aria-label={
                              activeRestTimer.pausedRemainingSeconds !== null
                                ? "Resume rest timer"
                                : "Pause rest timer"
                            }
                            onClick={() => togglePauseRestTimer(exercise.id)}
                          >
                            {activeRestTimer.pausedRemainingSeconds !== null ? "▶" : "⏸"}
                          </button>
                          <button
                            className="rest-timer-icon-button rest-timer-stop-button"
                            type="button"
                            aria-label="Stop rest timer"
                            onClick={() => stopRestTimer(exercise.id)}
                          >
                            <span className="rest-timer-stop-glyph" aria-hidden="true">■</span>
                          </button>
                        </>
                      ) : (
                        <button
                          className="rest-timer-trigger"
                          type="button"
                          aria-label={`Edit ${exercise.name} rest timer`}
                          onClick={() => openRestTimerEditor(exercise.id)}
                        >
                          {exercise.restTimer}
                        </button>
                      )}
                    </span>
                  </div>
                  {exercise.supersetGroupId && (
                    <span
                      className="superset-badge"
                      style={
                        {
                          "--superset-accent":
                            getSupersetAccent(exercise.supersetGroupId) ?? undefined
                        } as CSSProperties
                      }
                    >
                      Superset
                    </span>
                  )}
                </div>

                {sessionGuidanceInline &&
                  !allExercisesComplete &&
                  !isCollapsed &&
                  exerciseIndex === activeExerciseIndex && (
                    <div className="exercise-guidance-inline-wrap">
                      <button
                        className="exercise-guidance-inline"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setInlineGuidanceOpen(true);
                        }}
                      >
                        <span className="exercise-guidance-inline-label">Next Tip</span>
                        <span className="exercise-guidance-inline-text">{guidanceTip}</span>
                        <span className="exercise-guidance-inline-arrow" aria-hidden="true">›</span>
                      </button>
                      <button
                        className="exercise-guidance-inline-dismiss"
                        type="button"
                        aria-label="Disable inline tips"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSessionGuidanceInline(false);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )}

                <div className={`set-grid-header ${settings.showRpe ? "has-rpe" : "no-rpe"}`}>
                  <span>Set</span>
                  <span>Previous</span>
                  <span>{measurementLabels.first}</span>
                  <span>{measurementLabels.second}</span>
                  {settings.showRpe && <span>RPE</span>}
                  <label className="done-cell done-cell-header" title="Mark all sets done" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={exercise.draftSets.length > 0 && exercise.draftSets.every(s => s.done)}
                      onChange={() => {
                        const allDone = exercise.draftSets.every(s => s.done);
                        if (!allDone) {
                          const targetId = exercise.id;
                          setExercises(prev => prev.map(ex => {
                            if (ex.id !== targetId) return ex;
                            const lastSession = ex.history[ex.history.length - 1];
                            return {
                              ...ex,
                              draftSets: ex.draftSets.map((set, i) => {
                                if (set.done) return set;
                                const measurementType = getExerciseMeasurementType(ex);
                                const carrySource = getCurrentExerciseCarrySource(ex.draftSets, i);
                                const previousSet = getPreviousReferenceSet(ex.draftSets, i, lastSession);
                                const resolvedWeight = usesWeightInputForMeasurement(measurementType)
                                  ? settings.carryForwardDefaults && set.weightInput.trim() === ""
                                    ? carrySource?.weightInput?.trim().length ? carrySource.weightInput
                                      : previousSet ? String(previousSet.weight) : ""
                                    : set.weightInput
                                  : "";
                                const resolvedReps = settings.carryForwardDefaults && set.repsInput.trim() === ""
                                  ? carrySource?.repsInput?.trim().length ? carrySource.repsInput
                                    : previousSet ? String(previousSet.reps) : ""
                                  : set.repsInput;
                                const resolvedRpe = settings.carryForwardDefaults && set.rpeInput.trim() === ""
                                  ? carrySource?.rpeInput?.trim().length ? carrySource.rpeInput
                                    : typeof previousSet?.rpe === "number" && Number.isFinite(previousSet.rpe)
                                      ? String(previousSet.rpe) : ""
                                  : set.rpeInput;
                                return { ...set, done: true, weightInput: resolvedWeight, repsInput: resolvedReps, rpeInput: resolvedRpe };
                              })
                            };
                          }));
                        } else {
                          setExercises(prev => prev.map(ex =>
                            ex.id === exercise.id
                              ? { ...ex, draftSets: ex.draftSets.map(s => ({ ...s, done: false })) }
                              : ex
                          ));
                        }
                      }}
                    />
                  </label>
                </div>

                <div className="set-list">
                  {exercise.draftSets.map((draftSet, index) => {
                    const previousSet = getPreviousReferenceSet(
                      exercise.draftSets,
                      index,
                      lastSession
                    );
                    const setLabel = getDisplaySetLabel(exercise.draftSets, index);
                    const rowId = `${exercise.id}:${draftSet.id}`;
                    const isSetTypePickerOpen = setTypePickerRowId === rowId;
                    const isDraggingRow = swipeState.rowId === rowId && swipeState.dragging;
                    const isDeleteRevealed = revealedDeleteRowId === rowId;
                    const swipeDirection =
                      isDraggingRow && swipeState.deltaX > 0
                        ? "right"
                        : isDraggingRow && swipeState.deltaX < 0
                          ? "left"
                          : null;
                    const translateX =
                      swipeState.rowId === rowId
                        ? swipeState.dragging
                          ? Math.max(-68, Math.min(92, swipeState.deltaX))
                          : 0
                        : isDeleteRevealed
                          ? 92
                          : 0;
                    const setRewards = loggerRewards.filter(
                      (reward) =>
                        reward.exerciseId === exercise.id &&
                        reward.setId === draftSet.id &&
                        reward.level === "set"
                    );

                    return (
                      <div
                        key={draftSet.id}
                        className={`set-row-shell ${
                          isDraggingRow || isDeleteRevealed ? "is-swipe-visible" : ""
                        } ${isSetTypePickerOpen ? "has-type-picker" : ""} ${
                          isSetTypePickerOpen ? "is-picker-open" : ""
                        } ${swipeDirection === "left" ? "show-done-action" : ""} ${
                          swipeDirection === "right" || isDeleteRevealed
                            ? "show-delete-action"
                            : ""
                        }`}
                      >
                        <div className="swipe-action swipe-action-delete">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeSet(exercise.id, draftSet.id);
                            }}
                          >
                            Delete Set
                          </button>
                        </div>
                        <div className="swipe-action swipe-action-done">
                          <span>Done</span>
                        </div>
                        <div
                          className={`set-row ${settings.showRpe ? "has-rpe" : "no-rpe"} ${
                            draftSet.done ? "is-done" : ""
                          }`}
                          style={{ transform: `translateX(${translateX}px)` }}
                          onPointerDown={(event) => beginSwipe(rowId, event)}
                          onPointerMove={(event) => moveSwipe(rowId, event)}
                          onPointerUp={(event) => endSwipe(exercise.id, index, rowId, event)}
                          onPointerCancel={(event) => {
                            if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
                              event.currentTarget.releasePointerCapture(event.pointerId);
                            }
                            resetSwipeState();
                          }}
                          onLostPointerCapture={() => resetSwipeState()}
                        >
                          <button
                            type="button"
                            data-set-type-trigger
                            className={`set-type-button set-type ${
                              draftSet.setType
                            }`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSetTypePickerRowId((current) =>
                                current === rowId ? null : rowId
                              );
                            }}
                          >
                            {setLabel}
                          </button>
                          {previousSet ? (
                            <button
                              type="button"
                              className="previous-cell previous-cell-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                applyPreviousValuesToDraftSet(exercise.id, index);
                              }}
                              title="Use previous values"
                            >
                              {formatPreviousSet(previousSet, measurementType)}
                            </button>
                          ) : (
                            <span className="previous-cell previous-cell-empty" />
                          )}
                          <input
                            className={`cell-input ${!hasWeightInput ? "cell-input-disabled" : ""}`}
                            type="text"
                            inputMode="decimal"
                            placeholder={
                              hasWeightInput && settings.carryForwardDefaults
                                ? getCurrentExerciseCarrySource(exercise.draftSets, index)?.weightInput || ""
                                : ""
                            }
                            value={hasWeightInput ? draftSet.weightInput : ""}
                            disabled={!hasWeightInput}
                            readOnly={!hasWeightInput}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) =>
                              updateDraftSet(exercise.id, index, "weightInput", event.target.value)
                            }
                          />
                          <input
                            className="cell-input"
                            type="text"
                            inputMode="numeric"
                            placeholder={
                              settings.carryForwardDefaults
                                ? getCurrentExerciseCarrySource(exercise.draftSets, index)?.repsInput || ""
                                : ""
                            }
                            value={draftSet.repsInput}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) =>
                              updateDraftSet(exercise.id, index, "repsInput", event.target.value)
                            }
                          />
                          {settings.showRpe && (
                            <input
                              className="cell-input cell-input-rpe"
                              type="text"
                              inputMode="decimal"
                              placeholder={
                                settings.carryForwardDefaults
                                  ? getCurrentExerciseCarrySource(exercise.draftSets, index)?.rpeInput || "RPE"
                                  : "RPE"
                              }
                              value={draftSet.rpeInput}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                updateDraftSet(exercise.id, index, "rpeInput", event.target.value)
                              }
                            />
                          )}
                          <label className="done-cell" onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={draftSet.done}
                              onChange={(event) => {
                                if (event.target.checked) {
                                  markSetDone(exercise.id, index);
                                  return;
                                }
                                markSetUndone(exercise.id, index);
                              }}
                            />
                          </label>
                        </div>

                        {isSetTypePickerOpen && (
                          <div className="set-type-picker" data-set-type-picker>
                            {setTypeOptions.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={`set-type-option ${
                                  draftSet.setType === option.value ? "is-active" : ""
                                }`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  updateSetType(exercise.id, index, option.value);
                                }}
                              >
                                <span
                                  className={`set-type-option-symbol ${option.value}`}
                                >
                                  {option.symbol}
                                </span>
                                <span className="set-type-option-label">{option.label}</span>
                              </button>
                            ))}
                            <button
                              type="button"
                              className="set-type-option set-type-option-delete"
                              onClick={(event) => {
                                event.stopPropagation();
                                removeSet(exercise.id, draftSet.id);
                                setSetTypePickerRowId(null);
                              }}
                            >
                              <span className="set-type-option-symbol failure">x</span>
                              <span className="set-type-option-label">Delete set</span>
                            </button>
                          </div>
                        )}

                        {setRewards.length > 0 && (
                          <button
                            className="reward-inline-row reward-inline-row-set reward-inline-trigger"
                            type="button"
                            aria-label={`${setRewards.length} set rewards`}
                            title={setRewards.map((reward) => reward.shortLabel).join(", ")}
                            onClick={(event) => {
                              event.stopPropagation();
                              setRewardSheetOpen(true);
                            }}
                          >
                            {setRewards.map((reward) => (
                              <span key={reward.id} className="reward-inline reward-inline-set">
                                <span className="reward-inline-icon" aria-hidden="true">
                                  {rewardLevelIcon.set}
                                </span>
                                <span className="reward-inline-text">{reward.shortLabel}</span>
                              </span>
                            ))}
                          </button>
                        )}

                      </div>
                    );
                  })}
                </div>

                <button
                  className="add-set-button"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    addSet(exercise.id);
                  }}
                >
                  + Add Set
                </button>

                    <details className="history-details" onClick={(event) => event.stopPropagation()}>
                  <summary>History</summary>
                  <div className="history-list">
                    {[...exercise.history]
                      .reverse()
                      .slice(0, 3)
                      .map((session) => (
                        <article key={session.session_key ?? session.date} className="history-card">
                          <div className="history-top">
                            <strong>{formatSessionDate(session.date)}</strong>
                            <span>
                              {session.sets
                                .reduce((total, set) => total + set.weight * set.reps, 0)
                                .toFixed(0)}{" "}
                              kg
                            </span>
                          </div>
                          <p className="history-detail">
                            {session.sets
                              .map((set) => formatPreviousSet(set, measurementType))
                              .join(" • ")}
                          </p>
                        </article>
                      ))}
                  </div>
                </details>
              </article>
            );
          })}
        </section>

        {hasExercises && activeExercise && (
          <section className={`coach-shell ${guidanceCollapsed ? "is-collapsed" : ""}`}>
            <header className="coach-header">
              <div className="coach-header-text">
                <p className="label">{allExercisesComplete ? "Overall Guidance" : "Next Guidance"}</p>
                {!guidanceCollapsed && (
                  <h2>{allExercisesComplete ? "Workout" : activeExercise.name}</h2>
                )}
              </div>
              {guidanceCollapsed && (
                <div className="coach-collapsed-preview">
                  <strong className="coach-collapsed-title">
                    {allExercisesComplete ? "Workout" : activeExercise.name}
                  </strong>
                  <p className="coach-collapsed-tip">{guidanceTip}</p>
                </div>
              )}
              {!guidanceCollapsed && (state.status === "loading" || state.status === "success" || state.engineSource) && (
                <div className="status-group">
                  {(state.status === "loading" || state.status === "success") && (
                    <span className={`status-pill status-${state.status}`}>
                      {state.status === "loading" && "Checking"}
                      {state.status === "success" && "Ready"}
                    </span>
                  )}
                  {state.engineSource && (
                    <span className="status-pill status-source">
                      {state.engineSource === "live" ? "Engine live" : "Fallback only"}
                    </span>
                  )}
                </div>
              )}
              <button
                className="coach-collapse-toggle"
                type="button"
                aria-label={guidanceCollapsed ? "Expand guidance" : "Collapse guidance"}
                onClick={() => setGuidanceCollapsed((c) => !c)}
              >
                {guidanceCollapsed ? "⌄" : "⌃"}
              </button>
            </header>

            {!guidanceCollapsed && (
              <>
                {!hasGuidance && (
                  <div className="idle-card">
                    <strong>{guidanceTip}</strong>
                    <p>{guidanceWhy}</p>
                  </div>
                )}

                {state.status === "loading" && (
                  <div className="loading-card">
                    <div className="loading-bar" />
                    <p>Analysing your last sets…</p>
                  </div>
                )}

                {state.message && (
                  <div className={`notice ${state.status === "error" ? "notice-error" : ""}`}>
                    {state.message}
                  </div>
                )}

                {state.suggestion && (
                  <article className={`coach-card ${certaintyTone[state.suggestion.certainty]}`}>
                    <p className="label">
                      Tip
                      <span className={`certainty-badge certainty-badge-${state.suggestion.certainty}`}>
                        {state.suggestion.certainty}
                      </span>
                    </p>
                    <h3 className="coach-tip">{guidanceTip}</h3>
                    <p className="coach-why">{guidanceWhy}</p>
                  </article>
                )}
              </>
            )}

            {!guidanceCollapsed && (
              <div className="coach-footer">
                <span className="coach-footer-label">Show in</span>
                <div className="guidance-mode-row">
                  <button
                    className={`guidance-mode-button ${sessionGuidanceTopStrip ? "is-active" : ""}`}
                    type="button"
                    onClick={() => {
                      setSessionGuidanceTopStrip((prev) => !prev);
                      setShowTopGuidance(false);
                    }}
                  >
                    Top Strip
                  </button>
                  <button
                    className={`guidance-mode-button ${sessionGuidanceInline ? "is-active" : ""}`}
                    type="button"
                    onClick={() => setSessionGuidanceInline((prev) => !prev)}
                  >
                    Inline
                  </button>
                </div>
              </div>
            )}

          </section>
        )}

        {exercises.length > 0 && <div className="logger-end-actions">
          <div className="logger-end-actions-row">
            <button
              className="secondary-button logger-action-button logger-add-button"
              type="button"
              onClick={() => setAddExerciseOpen(true)}
            >
              + Exercise
            </button>
            <button
              className="secondary-button logger-action-button logger-discard-button"
              type="button"
              onClick={requestDiscardWorkout}
            >
              Discard
            </button>
          </div>
          <button
            className="primary-button logger-finish-button"
            type="button"
            onClick={() => void finishWorkout()}
            disabled={completedSetCount === 0}
            title={completedSetCount === 0 ? "Complete at least one set to finish" : undefined}
          >
            Finish Workout
          </button>
          {completedSetCount === 0 && (
            <p className="finish-blocked-hint">Complete at least 1 set to finish</p>
          )}
        </div>}

        {showStickyRestDock && activeRestExercise && (
          restDockMinimized ? (
            <button
              className="sticky-rest-dock-minimized"
              type="button"
              onClick={() => setRestDockMinimized(false)}
              aria-label={`Expand active rest timer for ${activeRestExercise.name}`}
            >
              <span className="sticky-rest-dock-minimized-icon" aria-hidden="true">◷</span>
              <span className="sticky-rest-dock-minimized-time">{formatRemainingSeconds(activeRestSeconds)}</span>
            </button>
          ) : (
            <section className="sticky-rest-dock" aria-label="Active rest timer">
              <div className="sticky-rest-dock-progress" aria-hidden="true">
                <span
                  className="sticky-rest-dock-progress-fill"
                  style={{ width: `${stickyRestProgressPercent}%` }}
                />
              </div>
              <div className="sticky-rest-dock-controls">
                <div className="sticky-rest-dock-left">
                  <button
                    className="rest-timer-icon-button sticky-rest-dismiss-button"
                    type="button"
                    aria-label="Hide bottom rest timer"
                    onClick={() => setShowBottomRestDock(false)}
                  >
                    ×
                  </button>
                  <button
                    className="rest-timer-icon-button rest-timer-stop-button"
                    type="button"
                    aria-label="Stop rest timer"
                    onClick={() => stopRestTimer(activeRestExercise.id)}
                  >
                    <span className="rest-timer-stop-glyph" aria-hidden="true">■</span>
                  </button>
                </div>
                <div className="sticky-rest-dock-center">
                  <button
                    className="sticky-rest-adjust-button"
                    type="button"
                    onClick={() => adjustActiveRestTimer(-5)}
                    aria-label="Reduce rest timer by 5 seconds"
                  >
                    -5
                  </button>
                  <button
                    className={`sticky-rest-dock-time${activeRestTimer?.pausedRemainingSeconds !== null ? " is-paused" : ""}`}
                    type="button"
                    onClick={() => togglePauseRestTimer(activeRestExercise.id)}
                    aria-label={
                      activeRestTimer?.pausedRemainingSeconds !== null
                        ? "Resume rest timer"
                        : "Pause rest timer"
                    }
                  >
                    {formatRemainingSeconds(activeRestSeconds)}
                  </button>
                  <button
                    className="sticky-rest-adjust-button"
                    type="button"
                    onClick={() => adjustActiveRestTimer(5)}
                    aria-label="Increase rest timer by 5 seconds"
                  >
                    +5
                  </button>
                </div>
                <button
                  className="sticky-rest-dock-minimize"
                  type="button"
                  aria-label="Minimize active rest timer"
                  onClick={() => setRestDockMinimized(true)}
                >
                  <span className="sticky-rest-dock-minimize-glyph" aria-hidden="true">›</span>
                </button>
              </div>
            </section>
          )
        )}

        {leavePromptOpen && (
          <section className="sheet-overlay leave-center-overlay" onClick={() => setLeavePromptOpen(false)}>
            <div className="leave-center-card" onClick={(event) => event.stopPropagation()}>
              <div className="sheet-head">
                <div>
                  <p className="label">Leave Workout</p>
                  <h3>{workoutMeta.sessionName}</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setLeavePromptOpen(false)}>
                  ×
                </button>
              </div>
              <p className="settings-note">
                Your workout stays active. You can resume it later, but you won&apos;t be able to start
                another one until this is finished or discarded.
              </p>
              <section className="session-summary session-summary-compact">
                <p className="label">Workout Summary</p>
                <div className="session-summary-grid">
                  <article className="session-summary-item">
                    <span>Elapsed</span>
                    <strong>{derivedDuration}</strong>
                  </article>
                  <article className="session-summary-item">
                    <span>Logged</span>
                    <strong>{workoutSummary.sets} sets</strong>
                  </article>
                  <article className="session-summary-item">
                    <span>Volume</span>
                    <strong>{workoutSummary.volume.toFixed(0)} kg</strong>
                  </article>
                  <article className="session-summary-item">
                    <span>Exercises</span>
                    <strong>{exercises.length}</strong>
                  </article>
                </div>
              </section>
              <div className="sheet-actions">
                <button className="secondary-button" type="button" onClick={() => setLeavePromptOpen(false)}>
                  Stay Here
                </button>
                <button className="primary-button" type="button" onClick={returnToWorkoutSelector}>
                  Come back later
                </button>
              </div>
            </div>
          </section>
        )}

        {finishConfirmOpen && (() => {
          const emptyExercises = exercises.filter(ex =>
            ex.draftSets.some(s => s.done && s.repsInput.trim() === "")
          );
          const hasIncomplete = incompleteSetCount > 0;
          const hasEmpty = emptyExercises.length > 0;
          const allEmpty = exercises
            .filter(ex => ex.draftSets.some(s => s.done))
            .every(ex => ex.draftSets.every(s => !s.done || s.repsInput.trim() === ""));
          const canFinishAnyway = !allEmpty;
          return (
            <section className="sheet-overlay leave-center-overlay" onClick={() => setFinishConfirmOpen(false)}>
              <div className="leave-center-card" onClick={(event) => event.stopPropagation()}>
                <div className="sheet-head">
                  <div>
                    <p className="label">Finish Workout</p>
                    <h3>A few things to check</h3>
                  </div>
                  <button className="icon-button" type="button" onClick={() => setFinishConfirmOpen(false)}>×</button>
                </div>
                {hasIncomplete && (
                  <p className="settings-note" style={{ marginBottom: hasEmpty ? 6 : undefined }}>
                    <strong>{incompleteSetCount} {incompleteSetCount === 1 ? "set is" : "sets are"} still incomplete.</strong> You can go back and finish them, or finish anyway and they'll be skipped.
                  </p>
                )}
                {hasEmpty && (
                  <>
                    <p className="settings-note" style={{ marginBottom: 4 }}>
                      {allEmpty
                        ? "None of your completed sets have weight or reps entered."
                        : `${emptyExercises.length === 1 ? "1 exercise has" : `${emptyExercises.length} exercises have`} sets marked done but no values:`}
                    </p>
                    {!allEmpty && (
                      <ul style={{ margin: "0 0 10px", paddingLeft: "20px", fontSize: "0.88rem", color: "var(--ink)" }}>
                        {emptyExercises.map(ex => <li key={ex.id}>{ex.name}</li>)}
                      </ul>
                    )}
                  </>
                )}
                <div className="logger-end-actions finish-confirm-actions">
                  <div className="logger-end-actions-row finish-confirm-actions-row">
                    <button
                      className="secondary-button logger-action-button logger-add-button"
                      type="button"
                      onClick={() => setFinishConfirmOpen(false)}
                    >
                      Go Back
                    </button>
                  </div>
                  {canFinishAnyway && (
                    <button className="primary-button logger-finish-button" type="button" onClick={() => void finishWorkoutAnyway()}>
                      Finish Anyway
                    </button>
                  )}
                </div>
              </div>
            </section>
          );
        })()}

        {discardConfirmOpen && (
          <section className="sheet-overlay bottom-sheet-overlay" onClick={() => setDiscardConfirmOpen(false)}>
            <div className="sheet-card action-sheet" onClick={(event) => event.stopPropagation()}>
              <div className="sheet-handle" />
              <div className="sheet-head">
                <div>
                  <p className="label">Discard Workout</p>
                  <h3>{workoutMeta.sessionName}</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setDiscardConfirmOpen(false)}>
                  ×
                </button>
              </div>
              <p className="settings-note">
                This will remove the current workout in progress. You can&apos;t undo this action.
              </p>
              <div className="sheet-actions">
                <button className="secondary-button" type="button" onClick={() => setDiscardConfirmOpen(false)}>
                  Cancel
                </button>
                <button className="secondary-button logger-discard-button" type="button" onClick={discardWorkout}>
                  Discard workout
                </button>
              </div>
            </div>
          </section>
        )}


        {activeMenuExercise && (
          <section
            className="sheet-overlay bottom-sheet-overlay"
            onClick={() => setMenuExerciseId(null)}
          >
            <div
              className="sheet-card action-sheet"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sheet-handle" />
              <div className="ex-action-header">
                <div className="ex-action-header-body">
                  <button
                    type="button"
                    className="ex-action-heading-link"
                    onClick={() => openDetails(activeMenuExercise.id)}
                  >
                    {activeMenuExercise.name}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                  <div className="ex-action-meta">
                    {(activeMenuExercise as ExerciseWithTaxonomy).movementPattern && (
                      <span className="ex-action-pattern">{((activeMenuExercise as ExerciseWithTaxonomy).movementPattern ?? "").replace(/_/g, " ")}</span>
                    )}
                    <span className="ex-action-muscle">
                      <strong>{activeMenuExercise.primaryMuscle}</strong>
                      {activeMenuExercise.secondaryMuscles && activeMenuExercise.secondaryMuscles.length > 0 && (
                        <span className="ex-action-secondary-muscles"> · {activeMenuExercise.secondaryMuscles.slice(0, 2).join(", ")}</span>
                      )}
                    </span>
                  </div>
                </div>
                <button className="icon-button" type="button" onClick={() => setMenuExerciseId(null)}>
                  ×
                </button>
              </div>

              <div className="ex-action-grid">
                <button
                  type="button"
                  className="ex-action-tile"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSmartReplaceExerciseId(activeMenuExercise.id);
                    setSmartReplaceReason("preference");
                    setSmartReplaceSheetOpen(true);
                    setMenuExerciseId(null);
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                  Replace
                </button>
                {activeMenuExercise.stickyNoteEnabled ? (
                  <button
                    type="button"
                    className="ex-action-tile"
                    onClick={(event) => {
                      event.stopPropagation();
                      openNoteEditor(activeMenuExercise.id);
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    Edit note
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ex-action-tile"
                    onClick={(event) => {
                      event.stopPropagation();
                      enableStickyNote(activeMenuExercise.id);
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                    Add note
                  </button>
                )}
                {activeMenuExercise.supersetGroupId ? (
                  <button
                    type="button"
                    className="ex-action-tile"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeFromSuperset(activeMenuExercise.id);
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>
                    Unsuperset
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ex-action-tile"
                    onClick={(event) => {
                      event.stopPropagation();
                      openSupersetSheet(activeMenuExercise.id);
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>
                    Superset
                  </button>
                )}
                <button
                  type="button"
                  className="ex-action-tile"
                  onClick={(event) => {
                    event.stopPropagation();
                    setInteractedExerciseActive(activeMenuExercise.id);
                    setReorderOpen(true);
                    setMenuExerciseId(null);
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                  Reorder
                </button>
                <button
                  type="button"
                  className="ex-action-tile ex-action-tile--danger"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeExercise(activeMenuExercise.id);
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  Remove
                </button>
              </div>
            </div>
          </section>
        )}

        {rewardSheetOpen && (
          <section
            className="sheet-overlay reward-center-overlay"
            onClick={() => setRewardSheetOpen(false)}
          >
            <div
              className="reward-center-card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sheet-head">
                <div>
                  <p className="label">Workout Rewards</p>
                  <h3>{rewardSummary.total} progress wins</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setRewardSheetOpen(false)}>
                  ×
                </button>
              </div>

              <div className="reward-sheet-summary">
                {rewardSummary.session > 0 && (
                  <span className="reward-summary-chip reward-summary-chip-session">
                    {rewardLevelIcon.session} {rewardSummary.session}
                  </span>
                )}
                {rewardSummary.exercise > 0 && (
                  <span className="reward-summary-chip reward-summary-chip-exercise">
                    {rewardLevelIcon.exercise} {rewardSummary.exercise}
                  </span>
                )}
                {rewardSummary.set > 0 && (
                  <span className="reward-summary-chip reward-summary-chip-set">
                    {rewardLevelIcon.set} {rewardSummary.set}
                  </span>
                )}
              </div>

              <div className="reward-sheet-list">
                {loggerRewards.length === 0 ? (
                  <p className="settings-note">Complete meaningful sets to start earning progress rewards.</p>
                ) : (
                  loggerRewards.map((reward) => (
                    <article key={reward.id} className="reward-sheet-item">
                      <div className={`reward-sheet-icon reward-sheet-icon-${reward.level}`} aria-hidden="true">
                        {rewardLevelIcon[reward.level]}
                      </div>
                      <div>
                        <strong>{reward.shortLabel}</strong>
                        <p>{reward.detail}</p>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          </section>
        )}

        {inlineGuidanceOpen && activeExercise && (
          <section
            className="sheet-overlay guidance-center-overlay"
            onClick={() => setInlineGuidanceOpen(false)}
          >
            <div
              className="guidance-center-card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sheet-head">
                <div>
                  <p className="label">{allExercisesComplete ? "Overall Guidance" : "Next Guidance"}</p>
                  <h3>{allExercisesComplete ? "Workout" : activeExercise.name}</h3>
                </div>
              </div>
              <article className={`coach-card ${state.suggestion ? certaintyTone[state.suggestion.certainty] : ""}`}>
                {state.suggestion && (
                  <p className="label">
                    <span className={`certainty-badge certainty-badge-${state.suggestion.certainty}`}>
                      {state.suggestion.certainty}
                    </span>
                  </p>
                )}
                <h3 className="coach-tip">{guidanceTip}</h3>
                <p className="coach-why">{guidanceWhy}</p>
              </article>
              <button
                className="guidance-modal-dismiss"
                type="button"
                onClick={() => {
                  setSessionGuidanceInline(false);
                  setInlineGuidanceOpen(false);
                }}
              >
                Dismiss tip
              </button>
            </div>
          </section>
        )}


        {noteEditorExerciseId && (
          <section className="sheet-overlay" onClick={closeNoteEditor}>
            <div className="sheet-card" onClick={(event) => event.stopPropagation()}>
              <div className="sheet-head">
                <div>
                  <p className="label">Exercise Sticky Note</p>
                  <h3>
                    {exercises.find((exercise) => exercise.id === noteEditorExerciseId)?.name ??
                      "Exercise"}
                  </h3>
                </div>
                <button className="icon-button" type="button" onClick={closeNoteEditor}>
                  ×
                </button>
              </div>

              <label className="settings-stack-row">
                <span>Quick note</span>
                <textarea
                  className="notes-textarea"
                  rows={6}
                  value={noteEditorValue}
                  placeholder="Save a quick setup cue, seat setting, grip width, or anything you want to remember for this exercise."
                  onChange={(event) => setNoteEditorValue(event.target.value)}
                />
              </label>

              <p className="settings-note">
                This stays attached to the exercise in the current workout and can be referred to later.
              </p>

              <div className="sheet-actions">
                <button className="secondary-button" type="button" onClick={closeNoteEditor}>
                  Cancel
                </button>
                <button className="primary-button" type="button" onClick={saveNoteEditor}>
                  Save Note
                </button>
              </div>
            </div>
          </section>
        )}

        {restTimerEditorExercise && (
          <section className="sheet-overlay" onClick={closeRestTimerEditor}>
            <div className="sheet-card" onClick={(event) => event.stopPropagation()}>
              <div className="sheet-head">
                <div>
                  <p className="label">Exercise Rest Timer</p>
                  <h3>{restTimerEditorExercise.name}</h3>
                </div>
                <button className="icon-button" type="button" onClick={closeRestTimerEditor}>
                  ×
                </button>
              </div>

              <label className="settings-row">
                <span>Rest timer</span>
                <input
                  className="timing-input"
                  type="text"
                  inputMode="numeric"
                  value={restTimerEditorValue}
                  onChange={(event) =>
                    setRestTimerEditorValue(formatMinutesSecondsInput(event.target.value))
                  }
                />
              </label>

              <label className="toggle-row">
                <span>Save to exercise setting</span>
                <input
                  type="checkbox"
                  checked={saveRestTimerToDefault}
                  onChange={(event) => setSaveRestTimerToDefault(event.target.checked)}
                />
              </label>

              <p className="settings-note">
                This updates the current workout. Saving to exercise setting also uses this rest timer
                the next time this exercise appears in this app session.
              </p>

              <div className="sheet-actions">
                <button className="secondary-button" type="button" onClick={closeRestTimerEditor}>
                  Cancel
                </button>
                <button className="primary-button" type="button" onClick={saveRestTimerEditor}>
                  Save
                </button>
              </div>
            </div>
          </section>
        )}

        {supersetSheetExercise && (
          <section
            className="sheet-overlay"
            onClick={() => {
              setSupersetSheetExerciseId(null);
              setSupersetSelectionIds([]);
            }}
          >
            <div className="sheet-card" onClick={(event) => event.stopPropagation()}>
              <div className="sheet-head">
                <div>
                  <p className="label">Add to Superset</p>
                  <h3>{supersetSheetExercise.name}</h3>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => {
                    setSupersetSheetExerciseId(null);
                    setSupersetSelectionIds([]);
                  }}
                >
                  ×
                </button>
              </div>

              <div className="superset-list">
                {exercises
                  .filter((exercise) => exercise.id !== supersetSheetExercise.id)
                  .map((exercise) => {
                    const isSelected = supersetSelectionIds.includes(exercise.id);
                    const optionAccent = getSupersetAccent(exercise.supersetGroupId);
                    const isAlreadyGrouped =
                      exercise.supersetGroupId &&
                      exercise.supersetGroupId === supersetSheetExercise.supersetGroupId;

                    return (
                      <button
                        key={exercise.id}
                        type="button"
                        className={`superset-option ${isSelected ? "is-selected" : ""} ${
                          exercise.supersetGroupId ? "has-group" : ""
                        }`}
                        title={exercise.name}
                        style={
                          exercise.supersetGroupId
                            ? ({
                                "--superset-accent": optionAccent ?? undefined
                              } as CSSProperties)
                            : undefined
                        }
                        onClick={() =>
                          setSupersetSelectionIds((current) =>
                            current.includes(exercise.id)
                              ? current.filter((id) => id !== exercise.id)
                              : [...current, exercise.id]
                          )
                        }
                      >
                        <span>{exercise.name}</span>
                        <span className="superset-option-meta">
                          {isSelected
                            ? "Selected"
                            : isAlreadyGrouped
                              ? "Already in this superset"
                              : exercise.supersetGroupId
                                ? "In another superset"
                                : "Standalone"}
                        </span>
                      </button>
                    );
                  })}
              </div>

              <div className="sheet-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setSupersetSheetExerciseId(null);
                    setSupersetSelectionIds([]);
                  }}
                >
                  Cancel
                </button>
                <button className="primary-button" type="button" onClick={saveSupersetSelection}>
                  Save Superset
                </button>
              </div>
            </div>
          </section>
        )}

        {reorderOpen && (
          <section className="sheet-overlay" onClick={() => setReorderOpen(false)}>
            <div className="sheet-card" onClick={(event) => event.stopPropagation()}>
              <div className="sheet-head">
                <div>
                  <p className="label">Reorder Exercises</p>
                  <h3>Press, hold, and move</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setReorderOpen(false)}>
                  ×
                </button>
              </div>

              <div className="reorder-list">
                {exercises.map((exercise) => (
                  <div
                    key={exercise.id}
                    className={`reorder-item ${reorderDragId === exercise.id ? "is-dragging" : ""}`}
                    draggable
                    onDragStart={() => setReorderDragId(exercise.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (reorderDragId) {
                        moveExerciseByIds(reorderDragId, exercise.id);
                      }
                      setReorderDragId(null);
                    }}
                    onDragEnd={() => setReorderDragId(null)}
                  >
                    <span className="reorder-handle">≡</span>
                    <span className="reorder-name">{exercise.name}</span>
                    <button type="button" onClick={() => removeExercise(exercise.id)}>
                      -
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {workoutMenuOpen && (
          <section className="sheet-overlay bottom-sheet-overlay" onClick={() => setWorkoutMenuOpen(false)}>
            <div className="sheet-card action-sheet" onClick={(event) => event.stopPropagation()}>
              <div className="sheet-handle" />
              <div className="sheet-head">
                <div>
                  <p className="label">Workout Actions</p>
                  <h3>{workoutMeta.sessionName}</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setWorkoutMenuOpen(false)}>
                  ×
                </button>
              </div>
              <div className="workout-menu-action-list">
                <button
                  type="button"
                  onClick={() => { setAddExerciseOpen(true); setWorkoutMenuOpen(false); }}
                >
                  <span>Add exercise</span>
                  <span className="workout-menu-chevron">›</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setReorderOpen(true); setWorkoutMenuOpen(false); }}
                >
                  <span>Reorder exercises</span>
                  <span className="workout-menu-chevron">›</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setSettingsOpen(true); setWorkoutMenuOpen(false); }}
                >
                  <span>Workout settings</span>
                  <span className="workout-menu-chevron">›</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setShowBottomRestDock((v) => !v); setWorkoutMenuOpen(false); }}
                >
                  <span>{showBottomRestDock ? "Hide bottom rest timer" : "Show bottom rest timer"}</span>
                  <span className="workout-menu-check">{showBottomRestDock ? "✓" : ""}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExercises(prev => prev.map(ex => {
                      const allDone = ex.draftSets.every(s => s.done);
                      if (allDone) return ex;
                      const lastSession = ex.history[ex.history.length - 1];
                      return {
                        ...ex,
                        draftSets: ex.draftSets.map((set, i) => {
                          if (set.done) return set;
                          const measurementType = getExerciseMeasurementType(ex);
                          const carrySource = getCurrentExerciseCarrySource(ex.draftSets, i);
                          const previousSet = getPreviousReferenceSet(ex.draftSets, i, lastSession);
                          const resolvedWeight = usesWeightInputForMeasurement(measurementType)
                            ? settings.carryForwardDefaults && set.weightInput.trim() === ""
                              ? carrySource?.weightInput?.trim().length ? carrySource.weightInput
                                : previousSet ? String(previousSet.weight) : ""
                              : set.weightInput
                            : "";
                          const resolvedReps = settings.carryForwardDefaults && set.repsInput.trim() === ""
                            ? carrySource?.repsInput?.trim().length ? carrySource.repsInput
                              : previousSet ? String(previousSet.reps) : ""
                            : set.repsInput;
                          const resolvedRpe = settings.carryForwardDefaults && set.rpeInput.trim() === ""
                            ? carrySource?.rpeInput?.trim().length ? carrySource.rpeInput
                              : typeof previousSet?.rpe === "number" && Number.isFinite(previousSet.rpe)
                                ? String(previousSet.rpe) : ""
                            : set.rpeInput;
                          return { ...set, done: true, weightInput: resolvedWeight, repsInput: resolvedReps, rpeInput: resolvedRpe };
                        })
                      };
                    }));
                    setWorkoutMenuOpen(false);
                  }}
                >
                  <span>Mark all sets done</span>
                  <span className="workout-menu-chevron">›</span>
                </button>
                <button
                  type="button"
                  onClick={() => { clearUncheckedSets(); setWorkoutMenuOpen(false); }}
                >
                  <span>Clear unchecked rows</span>
                  <span className="workout-menu-chevron">›</span>
                </button>
                <button
                  type="button"
                  onClick={() => { resetWorkout(); setWorkoutMenuOpen(false); }}
                >
                  <span>Reset workout</span>
                  <span className="workout-menu-chevron">›</span>
                </button>
                <button
                  type="button"
                  className="is-danger"
                  onClick={() => requestDiscardWorkout()}
                >
                  <span>Discard workout</span>
                  <span className="workout-menu-chevron">›</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {timingOpen && (
          <section className="sheet-overlay" onClick={() => setTimingOpen(false)}>
            <div className="sheet-card" onClick={(event) => event.stopPropagation()}>
              <div className="sheet-head">
                <div>
                  <p className="label">Timing</p>
                  <h3>Adjust active workout timing</h3>
                </div>
                <button className="icon-button" type="button" onClick={() => setTimingOpen(false)}>
                  ×
                </button>
              </div>

              <label className="settings-row timing-row">
                <span>Started at</span>
                <input
                  className="timing-input"
                  type="time"
                  value={workoutMeta.startTime}
                  onChange={(event) =>
                    setWorkoutMeta((current) => ({
                      ...current,
                      startTime: event.target.value,
                      startInstant:
                        buildDateTime(current.date, event.target.value)?.toISOString() ??
                        current.startInstant,
                      startedMinutesAgo: getMinutesAgoFromDateTime(
                        current.date,
                        event.target.value
                      )
                    }))
                  }
                />
              </label>

              <label className="settings-row timing-row">
                <span>Started x mins ago</span>
                <input
                  className="timing-input"
                  type="text"
                  inputMode="numeric"
                  value={workoutMeta.startedMinutesAgo}
                  onChange={(event) =>
                    setWorkoutMeta((current) => {
                      const startedMinutesAgo = sanitizeIntegerInput(event.target.value);
                      const nextStart = getDateAndTimeFromMinutesAgo(startedMinutesAgo);

                      return {
                        ...current,
                        date: nextStart.date,
                        startTime: nextStart.startTime,
                        startedMinutesAgo,
                        startInstant: nextStart.startInstant
                      };
                    })
                  }
                />
              </label>

              <label className="settings-row timing-row">
                <span>Duration</span>
                <strong className="settings-value">{derivedDuration}</strong>
              </label>

              <p className="settings-note">
                For an active workout, timing correction stays lightweight. Full date, time, and
                duration editing should happen only when editing an older saved workout.
              </p>
            </div>
          </section>
        )}

        {smartReplaceSheetOpen && (() => {
          // Draft ID is "{templateId}-{timestamp}-{n}" — use the draft directly since it carries
          // all taxonomy from the template via spread in cloneExerciseTemplate.
          const replaceOriginal = (
            exercises.find(e => e.id === smartReplaceExerciseId) ??
            availableExerciseTemplates.find(e => e.id === smartReplaceExerciseId)
          ) as ExerciseWithTaxonomy | undefined;
          const equipment = psychProfile?.equipmentAccess ?? "full_gym";
          const availableEquipment = EQUIPMENT_ALLOWED_TYPES[equipment as keyof typeof EQUIPMENT_ALLOWED_TYPES] ?? EQUIPMENT_ALLOWED_TYPES.full_gym;
          const suggestions = replaceOriginal
            ? getSmartReplacements(
                replaceOriginal,
                exercises,
                smartReplaceReason,
                availableEquipment,
                availableExerciseTemplates as ExerciseWithTaxonomy[],
                psychProfile?.experienceLevel ?? null,
              ).slice(0, 5)
            : [];
          const hasEnoughSuggestions = suggestions.filter(s => s.score > 0).length >= 3;

          const reasonLabels: Record<ReplacementReason, string> = {
            best_match: "Best match",
            machine_taken: "Machine taken",
            no_equipment: "No equipment",
            too_difficult: "Too difficult",
            pain_discomfort: "Pain / discomfort",
            just_change: "Just a change",
            preference: "Just a change",
          };

          function equipLabel(type: string | undefined): string {
            switch (type) {
              case "bodyweight": return "Bodyweight";
              case "dumbbell": return "Dumbbell";
              case "cable": return "Cable";
              case "resistance_band": return "Band";
              case "bodyweight_only": return "Bodyweight";
              case "bodyweight_weighted": return "Weighted BW";
              case "free_weights_accessories": return "Free weights / accessories";
              case "barbell": return "Barbell";
              case "machine": return "Machine";
              case "freestyle_cardio": return "Cardio";
              default: return "Any";
            }
          }

          return (
            <div
              className="smart-replace-backdrop"
              onClick={() => { setSmartReplaceSheetOpen(false); setSmartReplaceExerciseId(null); }}
            >
              <div
                className="smart-replace-sheet"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="smart-replace-header">
                  <button
                    type="button"
                    className="smart-replace-back-btn"
                    onClick={() => { setSmartReplaceSheetOpen(false); setSmartReplaceExerciseId(null); }}
                    aria-label="Close"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                  <div className="smart-replace-title-wrap">
                    <span className="smart-replace-label">Replace</span>
                    <span className="smart-replace-title">{replaceOriginal?.name ?? "Exercise"}</span>
                  </div>
                </div>

                <div className="smart-replace-reasons">
                  {(Object.keys(reasonLabels) as ReplacementReason[]).filter(r => r !== "preference" && r !== "best_match").map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`smart-replace-reason-chip${smartReplaceReason === r ? " is-active" : ""}`}
                      onClick={() => setSmartReplaceReason(r)}
                    >
                      {reasonLabels[r]}
                    </button>
                  ))}
                </div>

                <div className="smart-replace-divider">
                  <span>Suggestions</span>
                </div>

                <div className="smart-replace-suggestions">
                  {hasEnoughSuggestions ? (
                    suggestions.map((s, idx) => (
                      <div
                        key={s.exercise.id}
                        className={`smart-replace-suggestion-card${idx === 0 ? " is-best" : ""}`}
                      >
                        <div className="smart-replace-suggestion-info">
                          {idx === 0 && (
                            <span className="smart-replace-best-badge">✦ Best match</span>
                          )}
                          <span className="smart-replace-suggestion-name">{s.exercise.name}</span>
                          <span className="smart-replace-suggestion-meta">
                            {s.exercise.primaryMuscle ?? "—"}
                            {" · "}
                            {equipLabel(s.exercise.exerciseType)}
                            {s.matchReason ? ` · ${s.matchReason}` : ""}
                          </span>
                        </div>
                        <div className="smart-replace-card-actions">
                          <button
                            type="button"
                            className="smart-replace-swap-btn"
                            onClick={() => {
                              replaceExerciseWithTemplate(smartReplaceExerciseId!, s.exercise.id, smartReplaceReason, s.score);
                              setSmartReplaceSheetOpen(false);
                            }}
                          >
                            Swap
                          </button>
                          <button
                            type="button"
                            className="smart-replace-hide-btn"
                            title="Don't suggest this exercise"
                            aria-label="Hide from suggestions"
                            onClick={() => {
                              persistHiddenSuggestion(s.exercise.id);
                              setHiddenSuggestionIds(new Set([...hiddenSuggestionIds, s.exercise.id]));
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="smart-replace-empty">
                      <span>Not enough great matches for this reason.</span>
                      <span className="smart-replace-empty-sub">Try a different reason or browse all exercises.</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="smart-replace-browse-all"
                  onClick={() => { setSmartReplaceSheetOpen(false); setAddExerciseOpen(true); }}
                >
                  Browse all exercises →
                </button>
              </div>
            </div>
          );
        })()}
      </section>
      {moodToast && (
        <div className="mood-toast" key={moodToast}>
          {moodToast}
        </div>
      )}
    </main>
  );
}
