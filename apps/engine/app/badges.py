from __future__ import annotations

from datetime import datetime, timedelta

from .exercise_lookup import get_muscle_group
from .metrics import session_max_1rm, session_working_sets
from .models import BadgeAward, Session
from .overload import detect_plateaus


def _week_key(date_str: str) -> str:
    date_value = datetime.strptime(date_str, "%Y-%m-%d")
    iso_year, iso_week, _ = date_value.isocalendar()
    return f"{iso_year}_{iso_week:02d}"


def evaluate_badges(by_exercise: dict[str, list[Session]], all_session_dates: list[str]) -> list[BadgeAward]:
    unique_dates = sorted(set(all_session_dates))

    def has_locked_in() -> bool:
        if len(unique_dates) < 2:
            return False
        week_keys = sorted(set(_week_key(date_str) for date_str in unique_dates))
        streak = 1
        best = 1
        previous_absolute: int | None = None
        for week_key in week_keys:
            year, week = week_key.split("_")
            absolute = int(year) * 53 + int(week)
            if previous_absolute is not None and absolute == previous_absolute + 1:
                streak += 1
            else:
                streak = 1
            best = max(best, streak)
            previous_absolute = absolute
        return best >= 8

    def has_built_habit() -> bool:
        week_map: dict[str, int] = {}
        for date_str in unique_dates:
            key = _week_key(date_str)
            week_map[key] = week_map.get(key, 0) + 1
        return sum(1 for count in week_map.values() if count >= 2) >= 12

    def has_century() -> bool:
        return len(unique_dates) >= 100

    def has_iron_streak() -> bool:
        week_map: dict[str, int] = {}
        for date_str in unique_dates:
            key = _week_key(date_str)
            week_map[key] = week_map.get(key, 0) + 1
        streak = 0
        for key in sorted(week_map):
            if week_map[key] >= 4:
                streak += 1
                if streak >= 3:
                    return True
            else:
                streak = 0
        return False

    def has_moving_up() -> bool:
        count = 0
        for sessions in by_exercise.values():
            if len(sessions) < 4:
                continue
            first = session_max_1rm(sessions[0])
            last = session_max_1rm(sessions[-1])
            if first > 0 and last > first * 1.05:
                count += 1
        return count >= 5

    def has_strong_foundation() -> bool:
        for exercise_name, sessions in by_exercise.items():
            lower = exercise_name.lower()
            if not any(fragment in lower for fragment in ("bench", "squat", "deadlift")) or len(sessions) < 4:
                continue
            first = session_max_1rm(sessions[0])
            last = session_max_1rm(sessions[-1])
            if first > 0 and last >= first * 1.10:
                return True
        return False

    def has_broke_through() -> bool:
        for sessions in by_exercise.values():
            if len(sessions) < 8:
                continue
            halfway = len(sessions) // 2
            if not detect_plateaus(sessions[:halfway]):
                continue
            second_half = sessions[halfway:]
            orm_first = session_max_1rm(second_half[0])
            orm_last = session_max_1rm(second_half[-1])
            if orm_first > 0 and orm_last > orm_first * 1.04:
                return True
        return False

    def has_volume_builder() -> bool:
        if not unique_dates:
            return False
        mev = {"Chest": 8, "Back": 10, "Shoulders": 8, "Legs": 10}
        cutoff = datetime.strptime(unique_dates[-1], "%Y-%m-%d") - timedelta(days=28)
        per_muscle: dict[str, float] = {}
        for exercise_name, sessions in by_exercise.items():
            muscle_group = get_muscle_group(exercise_name)
            bucket = "Legs" if muscle_group in {"Quads", "Hamstrings", "Glutes", "Calves"} else muscle_group
            if bucket not in mev:
                continue
            recent_sessions = [
                session for session in sessions if datetime.strptime(session.date, "%Y-%m-%d") >= cutoff
            ]
            weekly_sets = sum(session_working_sets(session) for session in recent_sessions) / 4
            per_muscle[bucket] = per_muscle.get(bucket, 0) + weekly_sets
        return sum(1 for muscle_group, value in per_muscle.items() if value >= mev[muscle_group]) >= 3

    def has_came_back() -> bool:
        for index in range(1, len(unique_dates)):
            gap = (datetime.strptime(unique_dates[index], "%Y-%m-%d") - datetime.strptime(unique_dates[index - 1], "%Y-%m-%d")).days
            if 15 <= gap <= 22:
                return True
        return False

    def has_long_game() -> bool:
        if len(unique_dates) < 2:
            return False
        return (datetime.strptime(unique_dates[-1], "%Y-%m-%d") - datetime.strptime(unique_dates[0], "%Y-%m-%d")).days >= 180

    badge_checks = [
        ("locked_in", "locked_in", "Locked In", "Trained every week for 8+ consecutive weeks without missing one.", has_locked_in),
        ("built_habit", "built_habit", "Built the Habit", "12+ weeks with at least 2 sessions each — the habit is genuinely established.", has_built_habit),
        ("century", "century", "Century", "100+ workout days logged. A rare level of commitment.", has_century),
        ("iron_streak", "iron_streak", "Iron Streak", "4+ sessions in a week, sustained for 3 consecutive weeks.", has_iron_streak),
        ("moving_up", "moving_up", "Moving Up", "5+ exercises showing meaningful 1RM improvement over your training history.", has_moving_up),
        ("strong_foundation", "strong_foundation", "Strong Foundation", "A primary compound lift improved by 10%+ over your history.", has_strong_foundation),
        ("broke_through", "broke_through", "Broke Through", "A plateaued exercise resumed meaningful progression.", has_broke_through),
        ("volume_builder", "volume_builder", "Volume Builder", "3+ muscle groups consistently trained above minimum effective volume.", has_volume_builder),
        ("came_back", "came_back", "Came Back", "Returned after a meaningful break instead of letting the break become a quit.", has_came_back),
        ("long_game", "long_game", "Long Game", "6+ months of training history in the data — you are playing the long game.", has_long_game),
    ]

    icons = {
        "locked_in": "fire",
        "built_habit": "calendar",
        "century": "hundred",
        "iron_streak": "streak",
        "moving_up": "trend_up",
        "strong_foundation": "trophy",
        "broke_through": "breakthrough",
        "volume_builder": "target",
        "came_back": "return",
        "long_game": "brick",
    }

    return [
        BadgeAward(
            id=badge_id,
            icon=icons[badge_id],
            name=name,
            note=note,
            earned=checker(),
        )
        for badge_id, _key, name, note, checker in badge_checks
    ]

