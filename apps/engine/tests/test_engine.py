import unittest
from pathlib import Path

from app.analyzer import analyze_history
from app.exercise_lookup import get_muscle_group
from app.ingest import normalize_hevy_rows, parse_csv
from app.models import ExerciseEvaluationRequest, GoalKey, HistoryAnalysisRequest, Session, SetEntry
from app.overload import evaluate_recent_sessions


class EngineTests(unittest.TestCase):
    def test_insufficient_history_returns_building(self) -> None:
        payload = ExerciseEvaluationRequest(
            goal=GoalKey.HYPERTROPHY,
            exercise_name="Bench Press",
            sessions=[
                Session(date="2026-01-01", sets=[SetEntry(weight=80, reps=8)]),
                Session(date="2026-01-08", sets=[SetEntry(weight=80, reps=9)]),
            ],
        )

        result = evaluate_recent_sessions(payload.sessions, payload.exercise_name, _goal(payload.goal))
        self.assertEqual(result.suggestion_type.value, "BUILDING")
        self.assertEqual(result.certainty.value, "low")
        self.assertGreaterEqual(len(result.evidence), 1)

    def test_top_of_range_increases_load(self) -> None:
        sessions = [
            Session(date="2026-01-01", sets=[SetEntry(weight=80, reps=11), SetEntry(weight=80, reps=11), SetEntry(weight=80, reps=10)]),
            Session(date="2026-01-08", sets=[SetEntry(weight=80, reps=12), SetEntry(weight=80, reps=11), SetEntry(weight=80, reps=11)]),
            Session(date="2026-01-15", sets=[SetEntry(weight=80, reps=12), SetEntry(weight=80, reps=12), SetEntry(weight=80, reps=11)]),
        ]

        result = evaluate_recent_sessions(sessions, "Bench Press", _goal(GoalKey.HYPERTROPHY))
        self.assertEqual(result.suggestion_type.value, "INCREASE_LOAD")
        self.assertIn(result.certainty.value, {"medium", "high"})
        self.assertGreaterEqual(len(result.evidence), 3)

    def test_history_analysis_includes_badges(self) -> None:
        sessions = [
            Session(date="2026-01-01", sets=[SetEntry(weight=60, reps=8)]),
            Session(date="2026-02-01", sets=[SetEntry(weight=62.5, reps=8)]),
            Session(date="2026-03-01", sets=[SetEntry(weight=65, reps=8)]),
            Session(date="2026-04-01", sets=[SetEntry(weight=67.5, reps=8)]),
            Session(date="2026-05-01", sets=[SetEntry(weight=70, reps=8)]),
            Session(date="2026-06-30", sets=[SetEntry(weight=72.5, reps=8)]),
        ]
        payload = HistoryAnalysisRequest(
            goal=GoalKey.HYPERTROPHY,
            exercises={"Bench Press": sessions},
        )

        result = analyze_history(payload)
        badge_ids = {badge.id for badge in result.badges if badge.earned}
        self.assertIn("long_game", badge_ids)

    def test_ingest_fixture_preserves_single_session_exercises_and_uses_lookup(self) -> None:
        fixture_path = Path(__file__).with_name("fixtures") / "hevy_sample.csv"
        rows = parse_csv(fixture_path.read_text())
        by_exercise = normalize_hevy_rows(rows)

        self.assertIn("Cable Lateral Raise", by_exercise)
        self.assertIn("Smith Machine Squat", by_exercise)
        self.assertEqual(get_muscle_group("Smith Machine Squat"), "Quads")
        self.assertGreaterEqual(len(by_exercise["Bench Press"]), 4)

    def test_fixture_history_generates_load_increase_and_badges(self) -> None:
        fixture_path = Path(__file__).with_name("fixtures") / "hevy_sample.csv"
        rows = parse_csv(fixture_path.read_text())
        by_exercise = normalize_hevy_rows(rows)

        result = analyze_history(
            HistoryAnalysisRequest(
                goal=GoalKey.HYPERTROPHY,
                exercises=by_exercise,
            )
        )

        bench = next(item for item in result.exercises if item.exercise_name == "Bench Press")
        self.assertEqual(bench.next_suggestion.suggestion_type.value, "INCREASE_LOAD")
        earned_badges = {badge.id for badge in result.badges if badge.earned}
        self.assertIn("strong_foundation", earned_badges)


def _goal(goal_key: GoalKey):
    from app.goals import get_goal

    return get_goal(goal_key)


if __name__ == "__main__":
    unittest.main()
