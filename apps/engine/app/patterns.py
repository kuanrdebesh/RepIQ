from __future__ import annotations

from datetime import datetime
from math import sqrt

from .models import TrainingPattern, UserContext


def _parse_date(date_str: str) -> datetime:
    return datetime.strptime(date_str, "%Y-%m-%d")


def build_training_pattern(all_session_dates: list[str], user_context: UserContext) -> TrainingPattern | None:
    if len(all_session_dates) < 8:
        return None

    dates = sorted(set(all_session_dates))
    gaps: list[dict[str, float | str]] = []
    for index in range(1, len(dates)):
        gap = (_parse_date(dates[index]) - _parse_date(dates[index - 1])).days
        gaps.append({"gap": gap, "from": dates[index - 1], "to": dates[index]})

    gaps_1_week = [gap for gap in gaps if 7 <= gap["gap"] < 14]
    gaps_2_weeks = [gap for gap in gaps if 14 <= gap["gap"] < 21]
    gaps_3_weeks = [gap for gap in gaps if gap["gap"] >= 21]
    significant_gaps = [gap for gap in gaps if gap["gap"] >= 14]

    def iso_week_key(date_str: str) -> str:
        date_value = _parse_date(date_str)
        iso_year, iso_week, _ = date_value.isocalendar()
        return f"{iso_year}_{iso_week:02d}"

    week_keys = sorted(set(iso_week_key(date_str) for date_str in dates))
    absolute_weeks = [int(year) * 53 + int(week) for year, week in (key.split("_") for key in week_keys)]
    active_streaks: list[int] = []
    current_streak = 1
    for index in range(1, len(absolute_weeks)):
        if absolute_weeks[index] == absolute_weeks[index - 1] + 1:
            current_streak += 1
        else:
            active_streaks.append(current_streak)
            current_streak = 1
    if absolute_weeks:
        active_streaks.append(current_streak)

    average_streak = (sum(active_streaks) / len(active_streaks)) if active_streaks else 1.0
    max_streak = max(active_streaks) if active_streaks else 0
    average_gap = (sum(float(gap["gap"]) for gap in significant_gaps) / len(significant_gaps)) if significant_gaps else 0.0

    planned_deload = False
    if len(significant_gaps) >= 3:
        gap_lengths = [float(gap["gap"]) for gap in significant_gaps]
        mean = sum(gap_lengths) / len(gap_lengths)
        variance = sum((gap_length - mean) ** 2 for gap_length in gap_lengths) / len(gap_lengths)
        if sqrt(variance) <= 5:
            planned_deload = True

    gap_trend = "stable"
    if len(significant_gaps) >= 4:
        half = len(significant_gaps) // 2
        early_average = sum(float(gap["gap"]) for gap in significant_gaps[:half]) / half
        late_average = sum(float(gap["gap"]) for gap in significant_gaps[half:]) / (len(significant_gaps) - half)
        if late_average > early_average * 1.25:
            gap_trend = "worsening"
        elif late_average < early_average * 0.75:
            gap_trend = "improving"

    total_calendar_weeks = max(1, (_parse_date(dates[-1]) - _parse_date(dates[0])).days / 7)
    consistency_pct = min(100, round(len(week_keys) / max(1, round(total_calendar_weeks)) * 100))

    experience_label = {
        "beginner": "beginners",
        "beginner_plus": "early-stage trainees",
        "intermediate": "intermediate trainees",
        "intermediate_plus": "intermediate trainees",
        "advanced": "advanced trainees",
        "expert": "experienced trainees",
    }.get(user_context.experience.value if user_context.experience else "intermediate", "trainees at your level")

    if planned_deload and len(significant_gaps) >= 2:
        pattern = "Structured with planned breaks"
        pattern_severity = "green"
        pattern_icon = "planned_breaks"
        tagline = f"{len(significant_gaps)} regular breaks detected — this looks intentional."
        implication = "Your gaps are consistent in length, which suggests planned deloads rather than missed sessions."
    elif len(gaps_3_weeks) >= 2:
        worst_gap = max(significant_gaps, key=lambda gap: float(gap["gap"]))
        pattern = "Fragmented — significant gaps recurring"
        pattern_severity = "red"
        pattern_icon = "fragmented"
        tagline = f"{len(gaps_3_weeks)} gaps of 3+ weeks detected. Each one resets adaptation."
        implication = (
            f"Gaps of 21+ days cause measurable detraining in {experience_label}. "
            f"The most damaging one was {round(float(worst_gap['gap']))} days ({worst_gap['from']} -> {worst_gap['to']})."
        )
    elif len(significant_gaps) >= 3 and average_streak <= 3:
        pattern = "On/off cycling"
        pattern_severity = "amber"
        pattern_icon = "on_off"
        tagline = "Short bursts of training followed by repeated 2-week breaks."
        implication = f"You average {average_streak:.1f} active weeks before a significant break. Breaking this cycle is the highest-leverage consistency fix."
    elif gap_trend == "worsening":
        pattern = "Consistency declining over time"
        pattern_severity = "amber"
        pattern_icon = "declining"
        tagline = "Gaps are getting longer as the history progresses."
        implication = "Your earlier training history had shorter gaps between sessions. Recently, gaps have been getting longer."
    elif not significant_gaps or (len(significant_gaps) <= 1 and average_streak >= 6):
        pattern = "Steady and consistent"
        pattern_severity = "green"
        pattern_icon = "steady"
        tagline = "No recurring gap pattern detected."
        implication = "This is the kind of consistency that allows the engine to give reliable suggestions."
    else:
        pattern = "Generally consistent with occasional misses"
        pattern_severity = "blue"
        pattern_icon = "consistent_with_misses"
        tagline = f"{len(significant_gaps)} gap(s) of 2+ weeks — isolated, not systemic."
        implication = "The longer gaps appear to be isolated events rather than a structural pattern."

    worst_gap = max(significant_gaps, key=lambda gap: float(gap["gap"])) if significant_gaps else None
    return TrainingPattern(
        pattern=pattern,
        pattern_severity=pattern_severity,
        pattern_icon=pattern_icon,
        tagline=tagline,
        implication=implication,
        max_streak=max_streak,
        average_streak=round(average_streak, 1),
        gaps_1_week=len(gaps_1_week),
        gaps_2_weeks=len(gaps_2_weeks),
        gaps_3_weeks=len(gaps_3_weeks),
        significant_gaps=len(significant_gaps),
        average_gap=round(average_gap, 0),
        gap_trend=gap_trend,
        planned_deload=planned_deload,
        consistency_pct=consistency_pct,
        worst_gap=worst_gap,
    )

