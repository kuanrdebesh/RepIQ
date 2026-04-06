from __future__ import annotations

from .exercise_lookup import get_exercise_rep_range
from .goals import GoalDefinition
from .metrics import average_reps_in_sessions, failed_set_ratio, session_avg_rpe, session_max_1rm, session_max_weight, session_working_sets
from .models import CertaintyBand, EvidenceItem, PlateauEvent, RepRangeContext, Session, Suggestion, SuggestionOption, SuggestionType


def reps_in_range(session: Session, goal: GoalDefinition) -> bool:
    rep_values = [set_entry.reps for set_entry in session.sets if set_entry.weight > 0 and set_entry.reps > 0 and set_entry.set_type in {"", "normal"}]
    if not rep_values:
        return False
    average = sum(rep_values) / len(rep_values)
    return goal.rep_min <= average <= goal.rep_max


def reps_at_top_of_range(session: Session, goal: GoalDefinition) -> bool:
    rep_values = [set_entry.reps for set_entry in session.sets if set_entry.weight > 0 and set_entry.reps > 0 and set_entry.set_type in {"", "normal"}]
    if not rep_values:
        return False
    average = sum(rep_values) / len(rep_values)
    return average >= goal.rep_max - 1


def detect_plateaus(sessions: list[Session]) -> list[PlateauEvent]:
    plateaus: list[PlateauEvent] = []
    for index in range(3, len(sessions)):
        trailing_one_rms = [session_max_1rm(session) for session in sessions[index - 3 : index]]
        if not trailing_one_rms:
            continue
        average = sum(trailing_one_rms) / len(trailing_one_rms)
        orm_range = max(trailing_one_rms) - min(trailing_one_rms)
        if average > 0 and orm_range < average * 0.015:
            plateaus.append(
                PlateauEvent(
                    date=sessions[index].date,
                    orm_average=average,
                    orm_range=orm_range,
                )
            )
    deduped: list[PlateauEvent] = []
    previous_date: str | None = None
    for plateau in plateaus:
        if plateau.date != previous_date:
            deduped.append(plateau)
        previous_date = plateau.date
    return deduped


def _build_evidence(items: list[tuple[str, str, str, str]]) -> list[EvidenceItem]:
    return [
        EvidenceItem(key=key, label=label, value=value, detail=detail)
        for key, label, value, detail in items
    ]


def _make_suggestion(
    *,
    suggestion_type: SuggestionType,
    reason_code: str,
    label: str,
    what: str,
    why: str,
    certainty: CertaintyBand,
    generated_for_date: str | None,
    evidence: list[tuple[str, str, str, str]] | None = None,
    coaching_note: str | None = None,
    options: list[SuggestionOption] | None = None,
    rep_range_context: RepRangeContext | None = None,
    safety_notes: list[str] | None = None,
    override_allowed: bool = True,
    override_prompt: str | None = None,
) -> Suggestion:
    return Suggestion(
        suggestion_type=suggestion_type,
        reason_code=reason_code,
        label=label,
        what=what,
        why=why,
        certainty=certainty,
        generated_for_date=generated_for_date,
        evidence=_build_evidence(evidence or []),
        coaching_note=coaching_note,
        options=options or [],
        rep_range_context=rep_range_context,
        safety_notes=safety_notes or [],
        override_allowed=override_allowed,
        override_prompt=override_prompt
        or "If this does not match how the session felt, you can override it and RepIQ will keep that context with your history.",
    )


def evaluate_recent_sessions(sessions: list[Session], exercise_name: str, base_goal: GoalDefinition) -> Suggestion:
    goal = get_exercise_rep_range(exercise_name, base_goal)
    if len(sessions) < 3:
        return _make_suggestion(
            suggestion_type=SuggestionType.BUILDING,
            reason_code="INSUFFICIENT_HISTORY",
            label="Build the baseline",
            what="Continue logging — the engine needs 3 sessions before it should prescribe change.",
            why=f"Session {len(sessions)} of 3 needed. RepIQ is still building your baseline.",
            certainty=CertaintyBand.LOW,
            generated_for_date=sessions[-1].date if sessions else None,
            evidence=[
                ("session_count", "Logged sessions", str(len(sessions)), "RepIQ waits for at least 3 sessions before making progression calls."),
                ("target_range", "Target rep range", f"{goal.rep_min}-{goal.rep_max}", "Your goal range is set, but the system still needs enough repeated exposure."),
            ],
            coaching_note="Right now the best guidance is patience. Accurate coaching is better than early false confidence.",
        )

    last_three = sessions[-3:]
    current = sessions[-1]
    one_rms = [session_max_1rm(session) for session in last_three]
    sets_history = [session_working_sets(session) for session in last_three]
    fail_ratio = failed_set_ratio(current)

    rpe_values = [value for value in (session_avg_rpe(session) for session in last_three) if value is not None]
    average_rpe = sum(rpe_values) / len(rpe_values) if len(rpe_values) >= 2 else None
    last_rpe = session_avg_rpe(last_three[-1])
    rpe_high = average_rpe is not None and average_rpe >= 8.5
    rpe_low = average_rpe is not None and average_rpe <= 7.0

    average_orm = sum(one_rms) / len(one_rms)
    orm_range = max(one_rms) - min(one_rms)
    average_reps = average_reps_in_sessions(last_three, 3)
    planned_sets = max(goal.target_sets, round(sum(sets_history) / len(sets_history)))
    current_sets = session_working_sets(current)
    all_in_range = sum(1 for session in last_three if reps_in_range(session, goal)) >= goal.consistency_threshold
    at_top_count = sum(1 for session in last_three if reps_at_top_of_range(session, goal))

    if fail_ratio >= 0.5:
        deload_weight = round(session_max_weight(last_three[-1]) * 0.85 * 2) / 2
        return _make_suggestion(
            suggestion_type=SuggestionType.DELOAD,
            reason_code="HIGH_FAILURE_RATE",
            label="Deload next session",
            what=f"Deload — drop to about {deload_weight:.1f}kg next session.",
            why=f"{round(fail_ratio * 100)}% of sets in your last session were failed. Pull load back before pushing again.",
            certainty=CertaintyBand.HIGH,
            generated_for_date=current.date,
            evidence=[
                ("failed_ratio", "Failed set ratio", f"{round(fail_ratio * 100)}%", "A high concentration of failed work is a strong recovery warning."),
                ("last_weight", "Last top weight", f"{session_max_weight(last_three[-1]):.1f}kg", "The deload target is anchored to the most recent working load."),
                ("recent_sessions", "Sessions reviewed", "3", "The engine is using your latest 3-session pattern."),
            ],
            coaching_note="This is not a step backward. It is protection of the progress you have already built.",
            safety_notes=["A deload should feel easier than your recent sessions.", "If pain rather than fatigue drove the failures, reduce more aggressively and flag the issue."],
        )

    def _session_average_reps(session: Session) -> float:
        reps = [set_entry.reps for set_entry in session.sets if set_entry.weight > 0 and set_entry.reps > 0 and set_entry.set_type in {'', 'normal'}]
        return sum(reps) / len(reps) if reps else 0.0

    reps_above_range = all(_session_average_reps(session) > goal.rep_max for session in last_three)
    if reps_above_range:
        last_weight = session_max_weight(last_three[-1])
        next_weight = round((last_weight + goal.load_increment) * 2) / 2
        return _make_suggestion(
            suggestion_type=SuggestionType.INCREASE_LOAD,
            reason_code="ABOVE_REP_RANGE",
            label="Increase the load",
            what=f"Increase load to {next_weight:.1f}kg — your average reps are above the {goal.name} range.",
            why=f"When reps consistently exceed the top of your target range ({goal.rep_min}–{goal.rep_max}), the load is too light to drive the intended adaptation.",
            certainty=CertaintyBand.HIGH,
            generated_for_date=current.date,
            evidence=[
                ("average_reps", "Average reps", f"{average_reps:.1f}", "Your recent rep performance is sitting above the target ceiling."),
                ("target_range", "Target rep range", f"{goal.rep_min}-{goal.rep_max}", "This is the rep band tied to your current training goal."),
                ("load_increment", "Suggested load jump", f"+{goal.load_increment}kg", "RepIQ uses the configured increment for this goal and movement class."),
            ],
            coaching_note="You have outgrown this weight for the adaptation you are chasing.",
            rep_range_context=RepRangeContext(
                average_reps=average_reps,
                rep_min=goal.rep_min,
                rep_max=goal.rep_max,
                status="above",
            ),
        )

    reps_below_range = all(_session_average_reps(session) < goal.rep_min for session in last_three)
    if reps_below_range and average_reps > 0:
        return _make_suggestion(
            suggestion_type=SuggestionType.INCREASE_REPS,
            reason_code="BELOW_REP_RANGE",
            label="Build reps first",
            what=f"Build reps before adding load — average reps ({average_reps:.1f}) are below your target range.",
            why=f"{goal.below_range_note} Focus on hitting {goal.rep_min}+ reps at this weight before progressing load.",
            certainty=CertaintyBand.MEDIUM,
            generated_for_date=current.date,
            evidence=[
                ("average_reps", "Average reps", f"{average_reps:.1f}", "Your recent rep output is below the lower edge of the target range."),
                ("target_range", "Target rep range", f"{goal.rep_min}-{goal.rep_max}", "RepIQ is trying to move you into the right adaptation range before adding load."),
                ("recent_sessions", "Sessions reviewed", "3", "The engine is using repeated recent performance, not a single hard day."),
            ],
            coaching_note="The goal here is cleaner, more repeatable work before the next weight jump.",
            rep_range_context=RepRangeContext(
                average_reps=average_reps,
                rep_min=goal.rep_min,
                rep_max=goal.rep_max,
                status="below",
            ),
        )

    orm_stalled = average_orm > 0 and orm_range < average_orm * 0.015
    if orm_stalled and all_in_range and at_top_count >= goal.consistency_threshold:
        return _make_suggestion(
            suggestion_type=SuggestionType.PLATEAU_OPTIONS,
            reason_code="STALLED_IN_RANGE",
            label="Plateau intervention",
            what=f"Plateau detected — reps are there, but estimated 1RM is not improving ({min(one_rms):.1f}–{max(one_rms):.1f}kg).",
            why=f"You are training within your {goal.name} range consistently, but your estimated 1RM has not improved across 3 sessions. Time to change the stimulus.",
            certainty=CertaintyBand.MEDIUM,
            generated_for_date=current.date,
            evidence=[
                ("orm_window", "Estimated 1RM window", f"{min(one_rms):.1f}-{max(one_rms):.1f}kg", "The estimated 1RM range across the last 3 sessions is effectively flat."),
                ("in_range_sessions", "Sessions in range", str(sum(1 for session in last_three if reps_in_range(session, goal))), "You are hitting the rep target often enough that this looks like a real stall, not random noise."),
                ("top_of_range_sessions", "Top-range sessions", str(at_top_count), "You are not stalling because the weight is obviously too heavy for the rep target."),
            ],
            coaching_note="This is where RepIQ should guide, not pretend there is only one right answer.",
            options=[
                SuggestionOption(label=f"Add Load (+{goal.load_increment}kg)", detail="Jump weight and drop to the bottom of the rep range."),
                SuggestionOption(label="Add a Set", detail="Keep load constant and build more volume first."),
                SuggestionOption(label="Deload", detail="Drop to 85% for one session, then retest."),
            ],
            rep_range_context=RepRangeContext(
                average_reps=average_reps,
                rep_min=goal.rep_min,
                rep_max=goal.rep_max,
                status="plateau",
            ),
        )

    if at_top_count >= goal.consistency_threshold and not orm_stalled:
        last_weight = session_max_weight(last_three[-1])
        next_weight = round((last_weight + goal.load_increment) * 2) / 2
        rpe_note = ""
        if rpe_high and last_rpe is not None and last_rpe >= 9.0:
            rpe_note = f" RPE was {last_rpe:.1f} last session — stay conservative on rep targets."
        elif rpe_low and average_rpe is not None:
            rpe_note = f" Average RPE has been low ({average_rpe:.1f}) — you have room to push."
        return _make_suggestion(
            suggestion_type=SuggestionType.INCREASE_LOAD,
            reason_code="TOP_OF_RANGE",
            label="Progress the weight",
            what=f"Add {goal.load_increment}kg and target {goal.rep_min}–{min(goal.rep_min + 2, goal.rep_max)} reps next session.",
            why=f"{goal.progression_note} You have been consistently at the top of your {goal.rep_min}–{goal.rep_max} range.{rpe_note}",
            certainty=CertaintyBand.HIGH if average_rpe is not None else CertaintyBand.MEDIUM,
            generated_for_date=current.date,
            evidence=[
                ("top_range_sessions", "Top-range sessions", str(at_top_count), "You have repeatedly reached the upper end of the target rep range."),
                ("last_weight", "Last top weight", f"{last_weight:.1f}kg", "The next target is anchored to your most recent completed load."),
                ("average_reps", "Average reps", f"{average_reps:.1f}", "Rep performance is consistent enough to justify a progression jump."),
            ]
            + (
                [("average_rpe", "Average RPE", f"{average_rpe:.1f}", "Effort data is present and informs how aggressive the progression should feel.")]
                if average_rpe is not None
                else []
            ),
            coaching_note="This is a progression signal, not a guess. The pattern is strong enough to move.",
            rep_range_context=RepRangeContext(
                average_reps=average_reps,
                rep_min=goal.rep_min,
                rep_max=goal.rep_max,
                status="progressing",
            ),
        )

    if sum(1 for session in last_three if reps_in_range(session, goal)) >= 2:
        reps_needed_per_set = max(1, int(-(-(goal.rep_max - average_reps) // max(1, planned_sets))))
        return _make_suggestion(
            suggestion_type=SuggestionType.INCREASE_REPS,
            reason_code="BUILDING_IN_RANGE",
            label="Hold weight, add reps",
            what=f"Hold weight and add about {reps_needed_per_set} rep per set, building toward {goal.rep_max} reps.",
            why=f"{goal.within_range_note} You are averaging {average_reps:.1f} reps right now.",
            certainty=CertaintyBand.MEDIUM,
            generated_for_date=current.date,
            evidence=[
                ("average_reps", "Average reps", f"{average_reps:.1f}", "You are inside the right range, but not yet at its top end."),
                ("target_ceiling", "Rep target ceiling", str(goal.rep_max), "RepIQ wants you to fill out the range before asking for more load."),
                ("planned_sets", "Working-set target", str(planned_sets), "The rep suggestion is spread across the expected number of working sets."),
            ],
            coaching_note="This is a consolidation phase. You are still progressing, just without changing load yet.",
            rep_range_context=RepRangeContext(
                average_reps=average_reps,
                rep_min=goal.rep_min,
                rep_max=goal.rep_max,
                status="building",
            ),
        )

    if current_sets < planned_sets - 1:
        average_sets = round(sum(sets_history) / len(sets_history))
        return _make_suggestion(
            suggestion_type=SuggestionType.INCREASE_SETS,
            reason_code="VOLUME_GAP",
            label="Add a working set",
            what=f"Aim for {planned_sets} working sets next time (recent average: {average_sets}).",
            why="Your set count has been below the target. Reach consistent volume before progressing load or reps.",
            certainty=CertaintyBand.MEDIUM,
            generated_for_date=current.date,
            evidence=[
                ("recent_average_sets", "Recent average sets", str(average_sets), "Your recent volume is below the level the engine expects for this goal."),
                ("planned_sets", "Target sets", str(planned_sets), "RepIQ is using the larger of goal floor or recent working pattern."),
                ("current_sets", "Current session sets", str(current_sets), "The latest session did not hit the expected volume target."),
            ],
            coaching_note="Before asking the weight to go up, make sure the work itself is complete enough to support it.",
        )

    return _make_suggestion(
        suggestion_type=SuggestionType.NO_CHANGE,
        reason_code="DEFAULT",
        label="Hold steady",
        what="Hold current weight and volume — recent signals are mixed.",
        why="Not enough consistency to progress, not enough failure to deload. Hold steady and collect one more clean data point.",
        certainty=CertaintyBand.LOW,
        generated_for_date=current.date,
        evidence=[
            ("average_reps", "Average reps", f"{average_reps:.1f}", "The rep pattern is not yet clean enough to push or pull hard."),
            ("failure_ratio", "Failure ratio", f"{round(fail_ratio * 100)}%", "There is not enough failure to call for a deload."),
            ("sessions_reviewed", "Sessions reviewed", "3", "RepIQ is deliberately being conservative until the pattern becomes clearer."),
        ],
        coaching_note="This is a gather-more-signal moment, not a sign that progress has stopped.",
    )


def build_suggestion_history(sessions: list[Session], exercise_name: str, goal: GoalDefinition) -> list[Suggestion]:
    history: list[Suggestion] = []
    for index in range(len(sessions)):
        current_slice = sessions[: index + 1]
        history.append(evaluate_recent_sessions(current_slice, exercise_name, goal))
    return history
