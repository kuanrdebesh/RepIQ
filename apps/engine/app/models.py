from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class GoalKey(str, Enum):
    STRENGTH = "strength"
    HYPERTROPHY = "hypertrophy"
    ENDURANCE = "endurance"
    POWERBUILDING = "powerbuilding"


class SuggestionType(str, Enum):
    NO_CHANGE = "NO_CHANGE"
    INCREASE_LOAD = "INCREASE_LOAD"
    INCREASE_REPS = "INCREASE_REPS"
    INCREASE_SETS = "INCREASE_SETS"
    DELOAD = "DELOAD"
    PLATEAU_OPTIONS = "PLATEAU_OPTIONS"
    BUILDING = "BUILDING"


class CertaintyBand(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class AgeBand(str, Enum):
    UNDER_25 = "under25"
    BETWEEN_25_AND_35 = "25to35"
    BETWEEN_35_AND_45 = "35to45"
    OVER_45 = "over45"


class ExperienceBand(str, Enum):
    BEGINNER = "beginner"
    BEGINNER_PLUS = "beginner_plus"
    INTERMEDIATE = "intermediate"
    INTERMEDIATE_PLUS = "intermediate_plus"
    ADVANCED = "advanced"
    EXPERT = "expert"


class RecoverySpeed(str, Enum):
    SLOW = "slow"
    AVERAGE = "average"
    FAST = "fast"


class StressLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class UserContext(BaseModel):
    name: str = ""
    gender: str | None = None
    age: AgeBand | None = None
    experience: ExperienceBand | None = None
    recovery: RecoverySpeed | None = None
    stress: StressLevel | None = None


class SetEntry(BaseModel):
    weight: float = Field(ge=0)
    reps: int = Field(ge=0)
    set_type: str = "normal"
    rpe: float | None = Field(default=None, ge=0, le=10)
    failed: bool = False


class Session(BaseModel):
    date: str
    exercise: str | None = None
    session_key: str | None = None
    sets: list[SetEntry] = Field(default_factory=list)


class SuggestionOption(BaseModel):
    label: str
    detail: str


class EvidenceItem(BaseModel):
    key: str
    label: str
    value: str
    detail: str


class RepRangeContext(BaseModel):
    average_reps: float
    rep_min: int
    rep_max: int
    status: Literal["above", "below", "plateau", "progressing", "building"]


class Suggestion(BaseModel):
    suggestion_type: SuggestionType
    reason_code: str
    label: str
    what: str
    why: str
    certainty: CertaintyBand
    evidence: list[EvidenceItem] = Field(default_factory=list)
    coaching_note: str | None = None
    override_allowed: bool = True
    override_prompt: str = "If this does not match how the session felt, you can override it and keep training ownership."
    safety_notes: list[str] = Field(default_factory=list)
    generated_for_date: str | None = None
    options: list[SuggestionOption] = Field(default_factory=list)
    rep_range_context: RepRangeContext | None = None


class PlateauEvent(BaseModel):
    date: str
    orm_average: float
    orm_range: float


class BadgeAward(BaseModel):
    id: str
    icon: str
    name: str
    note: str
    earned: bool


class FrequencyRecommendation(BaseModel):
    min_sessions: int
    max_sessions: int
    ideal_sessions: int
    reasons: list[str]


class TrainingPattern(BaseModel):
    pattern: str
    pattern_severity: str
    pattern_icon: str
    tagline: str
    implication: str
    max_streak: int
    average_streak: float
    gaps_1_week: int
    gaps_2_weeks: int
    gaps_3_weeks: int
    significant_gaps: int
    average_gap: float
    gap_trend: str
    planned_deload: bool
    consistency_pct: int
    worst_gap: dict[str, float | str] | None = None


class ExerciseAnalysis(BaseModel):
    exercise_name: str
    goal_label: str
    session_count: int
    latest_estimated_1rm: float
    latest_weight: float
    next_suggestion: Suggestion
    suggestion_history: list[Suggestion]
    plateaus: list[PlateauEvent]


class HistoryAnalysisRequest(BaseModel):
    goal: GoalKey = GoalKey.HYPERTROPHY
    user_context: UserContext = Field(default_factory=UserContext)
    exercises: dict[str, list[Session]]


class ExerciseEvaluationRequest(BaseModel):
    goal: GoalKey = GoalKey.HYPERTROPHY
    exercise_name: str
    sessions: list[Session]


class HistoryAnalysisResponse(BaseModel):
    goal: GoalKey
    frequency_recommendation: FrequencyRecommendation
    training_pattern: TrainingPattern | None
    badges: list[BadgeAward]
    exercises: list[ExerciseAnalysis]
