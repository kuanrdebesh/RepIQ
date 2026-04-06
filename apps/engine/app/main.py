from fastapi import FastAPI

from .analyzer import analyze_history
from .goals import get_goal
from .models import CertaintyBand, ExerciseEvaluationRequest, HistoryAnalysisRequest, HistoryAnalysisResponse, Suggestion, SuggestionType
from .overload import evaluate_recent_sessions


app = FastAPI(title="RepIQ Engine", version="0.2.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "engine"}


@app.post("/v1/evaluate", response_model=Suggestion)
def evaluate(payload: ExerciseEvaluationRequest) -> Suggestion:
    if not payload.sessions:
        return Suggestion(
            suggestion_type=SuggestionType.BUILDING,
            reason_code="NO_EXERCISES",
            label="Build the baseline",
            what="No exercise history provided.",
            why="RepIQ needs at least one exercise history to evaluate.",
            certainty=CertaintyBand.LOW,
        )
    ordered_sessions = sorted(payload.sessions, key=lambda session: session.date)
    return evaluate_recent_sessions(ordered_sessions, payload.exercise_name, get_goal(payload.goal))


@app.post("/v1/history/analyze", response_model=HistoryAnalysisResponse)
def history_analyze(payload: HistoryAnalysisRequest) -> HistoryAnalysisResponse:
    return analyze_history(payload)
