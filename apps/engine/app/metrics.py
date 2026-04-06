from __future__ import annotations

from .models import Session, SetEntry


def is_working_set(set_entry: SetEntry) -> bool:
    return set_entry.weight > 0 and set_entry.reps > 0 and set_entry.set_type in {"", "normal"}


def is_failed_set(set_entry: SetEntry) -> bool:
    return set_entry.failed or set_entry.set_type == "failure"


def epley(weight: float, reps: int) -> float:
    if weight <= 0 or reps <= 0:
        return 0.0
    if reps == 1:
        return weight
    return weight * (1 + reps / 30)


def session_avg_rpe(session: Session) -> float | None:
    rpe_values = [float(set_entry.rpe) for set_entry in session.sets if set_entry.rpe is not None and set_entry.rpe > 0 and not is_failed_set(set_entry)]
    if len(rpe_values) < 2:
        return None
    return sum(rpe_values) / len(rpe_values)


def session_max_1rm(session: Session) -> float:
    one_rms = [epley(set_entry.weight, set_entry.reps) for set_entry in session.sets if is_working_set(set_entry)]
    return max(one_rms) if one_rms else 0.0


def session_volume(session: Session) -> float:
    return sum(set_entry.weight * set_entry.reps for set_entry in session.sets if set_entry.weight > 0 and set_entry.reps > 0)


def session_working_sets(session: Session) -> int:
    return sum(1 for set_entry in session.sets if is_working_set(set_entry))


def failed_set_ratio(session: Session) -> float:
    valid_sets = [set_entry for set_entry in session.sets if set_entry.weight > 0 and set_entry.reps > 0]
    if not valid_sets:
        return 0.0
    failed_sets = sum(1 for set_entry in session.sets if is_failed_set(set_entry))
    return failed_sets / len(valid_sets)


def session_max_weight(session: Session) -> float:
    weights = [set_entry.weight for set_entry in session.sets if set_entry.weight > 0]
    return max(weights) if weights else 0.0


def average_reps_in_sessions(sessions: list[Session], n: int) -> float:
    rep_values: list[int] = []
    for session in sessions[-n:]:
        rep_values.extend(set_entry.reps for set_entry in session.sets if is_working_set(set_entry))
    if not rep_values:
        return 0.0
    return sum(rep_values) / len(rep_values)

