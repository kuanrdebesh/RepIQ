import { z } from "zod";

export const experienceLevelSchema = z.enum([
  "beginner",
  "returning",
  "intermediate",
  "advanced"
]);

export const goalSchema = z.enum([
  "strength",
  "hypertrophy",
  "general_fitness"
]);

export const engineGoalSchema = z.enum([
  "strength",
  "hypertrophy",
  "endurance",
  "powerbuilding"
]);

export const sessionStatusSchema = z.enum([
  "planned",
  "in_progress",
  "completed",
  "skipped"
]);

export const suggestionTypeSchema = z.enum([
  "NO_CHANGE",
  "DELOAD",
  "INCREASE_LOAD",
  "INCREASE_REPS",
  "INCREASE_SETS",
  "PLATEAU_OPTIONS",
  "BUILDING"
]);

export const certaintyBandSchema = z.enum([
  "low",
  "medium",
  "high"
]);

export const evidenceItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.string(),
  detail: z.string()
});

export const suggestionOptionSchema = z.object({
  label: z.string(),
  detail: z.string()
});

export const repRangeContextSchema = z.object({
  average_reps: z.number(),
  rep_min: z.number().int(),
  rep_max: z.number().int(),
  status: z.enum(["above", "below", "plateau", "progressing", "building"])
});

export const coachingSuggestionSchema = z.object({
  suggestion_type: suggestionTypeSchema,
  reason_code: z.string(),
  label: z.string(),
  what: z.string(),
  why: z.string(),
  certainty: certaintyBandSchema,
  evidence: z.array(evidenceItemSchema),
  coaching_note: z.string().nullable().optional(),
  override_allowed: z.boolean(),
  override_prompt: z.string(),
  safety_notes: z.array(z.string()),
  generated_for_date: z.string().nullable().optional(),
  options: z.array(suggestionOptionSchema),
  rep_range_context: repRangeContextSchema.nullable().optional()
});

export const workoutSetSchema = z.object({
  weight: z.number().nonnegative(),
  reps: z.number().int().nonnegative(),
  set_type: z.string().default("normal"),
  rpe: z.number().min(0).max(10).nullable().optional(),
  failed: z.boolean().optional()
});

export const exerciseHistorySessionSchema = z.object({
  date: z.string(),
  exercise: z.string().optional(),
  session_key: z.string().optional(),
  sets: z.array(workoutSetSchema).min(1)
});

export const exerciseEvaluationRequestSchema = z.object({
  goal: engineGoalSchema,
  exercise_name: z.string().min(1),
  sessions: z.array(exerciseHistorySessionSchema).min(1)
});

export type ExperienceLevel = z.infer<typeof experienceLevelSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type EngineGoal = z.infer<typeof engineGoalSchema>;
export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type SuggestionType = z.infer<typeof suggestionTypeSchema>;
export type CertaintyBand = z.infer<typeof certaintyBandSchema>;
export type CoachingSuggestion = z.infer<typeof coachingSuggestionSchema>;
export type WorkoutSet = z.infer<typeof workoutSetSchema>;
export type ExerciseHistorySession = z.infer<typeof exerciseHistorySessionSchema>;
export type ExerciseEvaluationRequest = z.infer<typeof exerciseEvaluationRequestSchema>;

export const northStar =
  "You've been putting in the work. RepIQ makes sure the work pays off.";
