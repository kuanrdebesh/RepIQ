from __future__ import annotations

from .badges import evaluate_badges
from .goals import get_frequency_recommendation, get_goal
from .metrics import session_max_1rm, session_max_weight
from .models import ExerciseAnalysis, FrequencyRecommendation, HistoryAnalysisRequest, HistoryAnalysisResponse
from .overload import build_suggestion_history, detect_plateaus, evaluate_recent_sessions
from .patterns import build_training_pattern


def analyze_history(payload: HistoryAnalysisRequest) -> HistoryAnalysisResponse:
    goal = get_goal(payload.goal)
    min_sessions, max_sessions, ideal_sessions, reasons = get_frequency_recommendation(payload.goal, payload.user_context)

    exercise_analyses: list[ExerciseAnalysis] = []
    all_session_dates: list[str] = []

    for exercise_name, sessions in payload.exercises.items():
        ordered_sessions = sorted(sessions, key=lambda session: session.date)
        for session in ordered_sessions:
            if not session.exercise:
                session.exercise = exercise_name
            all_session_dates.append(session.date)

        suggestion_history = build_suggestion_history(ordered_sessions, exercise_name, goal)
        latest_session = ordered_sessions[-1] if ordered_sessions else None
        exercise_analyses.append(
            ExerciseAnalysis(
                exercise_name=exercise_name,
                goal_label=goal.name,
                session_count=len(ordered_sessions),
                latest_estimated_1rm=session_max_1rm(latest_session) if latest_session else 0.0,
                latest_weight=session_max_weight(latest_session) if latest_session else 0.0,
                next_suggestion=evaluate_recent_sessions(ordered_sessions, exercise_name, goal),
                suggestion_history=suggestion_history,
                plateaus=detect_plateaus(ordered_sessions),
            )
        )

    exercise_analyses.sort(key=lambda analysis: analysis.exercise_name.lower())
    all_session_dates = sorted(set(all_session_dates))

    return HistoryAnalysisResponse(
        goal=payload.goal,
        frequency_recommendation=FrequencyRecommendation(
            min_sessions=min_sessions,
            max_sessions=max_sessions,
            ideal_sessions=ideal_sessions,
            reasons=reasons,
        ),
        training_pattern=build_training_pattern(all_session_dates, payload.user_context),
        badges=evaluate_badges(payload.exercises, all_session_dates),
        exercises=exercise_analyses,
    )

