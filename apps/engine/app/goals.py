from __future__ import annotations

from dataclasses import dataclass

from .models import GoalKey, UserContext


@dataclass(frozen=True)
class GoalDefinition:
    key: GoalKey
    name: str
    rep_min: int
    rep_max: int
    target_sets: int
    load_increment: float
    consistency_threshold: int
    progression_note: str
    below_range_note: str
    within_range_note: str
    overridden: bool = False
    label: str | None = None
    note: str | None = None
    goal_name: str | None = None


GOALS: dict[GoalKey, GoalDefinition] = {
    GoalKey.STRENGTH: GoalDefinition(
        key=GoalKey.STRENGTH,
        name="Strength",
        rep_min=1,
        rep_max=5,
        target_sets=4,
        load_increment=2.5,
        consistency_threshold=2,
        progression_note="At the top of your strength rep range — add load and drop back to lower reps.",
        below_range_note="Reps are above your strength range. Consider increasing load to bring reps down to 1–5.",
        within_range_note="Within your strength rep range. Build consistency before adding load.",
    ),
    GoalKey.HYPERTROPHY: GoalDefinition(
        key=GoalKey.HYPERTROPHY,
        name="Hypertrophy",
        rep_min=6,
        rep_max=12,
        target_sets=3,
        load_increment=2.5,
        consistency_threshold=2,
        progression_note="At the top of your hypertrophy rep range — add load and target 6–8 reps next session.",
        below_range_note="Reps are below your hypertrophy range (6–12). Either reduce load or these are strength sets — treat accordingly.",
        within_range_note="Within your hypertrophy range. Build reps toward 12 before adding load.",
    ),
    GoalKey.ENDURANCE: GoalDefinition(
        key=GoalKey.ENDURANCE,
        name="Endurance / Fitness",
        rep_min=12,
        rep_max=20,
        target_sets=3,
        load_increment=1.25,
        consistency_threshold=3,
        progression_note="At the top of your endurance rep range — small load increase or add a set.",
        below_range_note="Reps are below your endurance range. Reduce load to stay in the 12–20 range.",
        within_range_note="Within your endurance range. Keep building reps before adding load.",
    ),
    GoalKey.POWERBUILDING: GoalDefinition(
        key=GoalKey.POWERBUILDING,
        name="Powerbuilding",
        rep_min=3,
        rep_max=8,
        target_sets=4,
        load_increment=2.5,
        consistency_threshold=2,
        progression_note="At the top of your powerbuilding rep range — add load and target 3–5 reps.",
        below_range_note="Reps are below your powerbuilding range. This may be a peak set — if intentional, continue.",
        within_range_note="Within your powerbuilding range. Build toward top of range before adding load.",
    ),
}


def get_goal(goal_key: GoalKey) -> GoalDefinition:
    return GOALS.get(goal_key, GOALS[GoalKey.HYPERTROPHY])


def get_frequency_recommendation(goal_key: GoalKey, context: UserContext) -> tuple[int, int, int, list[str]]:
    base = {
        GoalKey.STRENGTH: {"min": 3, "max": 5, "ideal": 4},
        GoalKey.HYPERTROPHY: {"min": 3, "max": 5, "ideal": 4},
        GoalKey.ENDURANCE: {"min": 3, "max": 6, "ideal": 4},
        GoalKey.POWERBUILDING: {"min": 3, "max": 5, "ideal": 4},
    }[goal_key]

    min_sessions = base["min"]
    max_sessions = base["max"]
    ideal_sessions = base["ideal"]
    reasons: list[str] = []

    if context.age == "over45":
        max_sessions = min(max_sessions, 4)
        ideal_sessions = min(ideal_sessions, 3)
        reasons.append("Recovery time increases with age — more rest between sessions preserves quality and reduces injury risk.")
    elif context.age == "35to45":
        max_sessions = min(max_sessions, 5)
        ideal_sessions = min(ideal_sessions, 4)
        reasons.append("At 35–45, recovery is still strong but benefits from slightly more spacing between intense sessions.")
    elif context.age == "under25":
        reasons.append("Recovery capacity is high — you can handle the upper end of the frequency range if nutrition and sleep support it.")

    if context.experience == "beginner":
        min_sessions = max(min_sessions, 2)
        max_sessions = min(max_sessions, 3)
        ideal_sessions = 3
        reasons.append("Beginners adapt well to 2–3 sessions per week. More is rarely better at this stage — movement quality and consistency matter more than frequency.")
    elif context.experience == "advanced":
        min_sessions = max(min_sessions, 4)
        reasons.append("Advanced trainees need higher frequency to maintain progressive stimulus — fewer sessions often mean insufficient volume per muscle group.")

    if context.recovery == "slow":
        max_sessions = max(min_sessions, max_sessions - 1)
        ideal_sessions = max(min_sessions, ideal_sessions - 1)
        reasons.append("Self-reported slow recovery suggests your effective volume ceiling is lower than average. Fewer, higher-quality sessions will outperform frequent sessions with accumulated fatigue.")
    elif context.recovery == "fast":
        max_sessions = min(6, max_sessions + 1)
        reasons.append("Fast recovery means you can train more frequently without accumulating fatigue. Monitor performance — if progress stalls, frequency is not the problem.")

    if context.stress == "high":
        max_sessions = max(min_sessions, max_sessions - 1)
        ideal_sessions = max(min_sessions, ideal_sessions - 1)
        reasons.append("High life stress is a real training variable. Fewer sessions done well beat more sessions done while depleted.")
    elif context.stress == "low":
        reasons.append("Low external stress means your recovery budget is available almost entirely for training adaptation.")

    min_sessions = max(2, min(min_sessions, max_sessions))
    ideal_sessions = max(min_sessions, min(ideal_sessions, max_sessions))
    return min_sessions, max_sessions, ideal_sessions, reasons

