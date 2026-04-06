from __future__ import annotations

import csv
from datetime import datetime
from io import StringIO

from .models import Session, SetEntry


def parse_csv(text: str) -> list[dict[str, str]]:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized:
        return []
    reader = csv.DictReader(StringIO(normalized))
    return [{key: (value or "").strip() for key, value in row.items()} for row in reader]


def _parse_date(date_str: str) -> str:
    if not date_str:
        return ""

    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d %b %Y, %H:%M", "%d %b %Y"):
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return date_str[:10]


def normalize_hevy_rows(rows: list[dict[str, str]]) -> dict[str, list[Session]]:
    if not rows:
        return {}

    first_row = rows[0]
    keys = list(first_row.keys())
    weight_field = next((key for key in keys if key == "weight_kg"), None) or next((key for key in keys if key == "weight_lbs"), None) or next((key for key in keys if "weight" in key.lower()), "")

    weights = sorted(float(row.get(weight_field, 0) or 0) for row in rows if 0 < float(row.get(weight_field, 0) or 0) < 1000)
    median_weight = weights[len(weights) // 2] if weights else 0
    is_lbs = "lbs" in weight_field and median_weight > 50

    sessions_by_key: dict[str, Session] = {}
    for row in rows:
        exercise_name = (row.get("exercise_title") or row.get("Exercise Name") or "").strip()
        if not exercise_name:
            continue
        date_str = _parse_date(row.get("start_time") or row.get("Workout Date") or row.get("date") or "")
        if len(date_str) < 8:
            continue

        raw_weight = float(row.get(weight_field, 0) or 0)
        weight = round(raw_weight * 0.453592 * 4) / 4 if is_lbs else raw_weight
        reps = int(float(row.get("reps") or row.get("Reps") or 0) or 0)
        set_type = (row.get("set_type") or row.get("Set Type") or "normal").strip().lower()
        rpe_value = row.get("rpe") or row.get("RPE") or ""
        rpe = float(rpe_value) if rpe_value else None
        workout_title = (row.get("title") or row.get("Workout Name") or "").strip()
        key = f"{date_str}||{exercise_name}||{workout_title}"

        session = sessions_by_key.setdefault(
            key,
            Session(date=date_str, exercise=exercise_name, session_key=f"{date_str}||{workout_title}", sets=[]),
        )
        session.sets.append(SetEntry(weight=weight, reps=reps, set_type=set_type, rpe=rpe, failed=set_type == "failure"))

    by_exercise: dict[str, list[Session]] = {}
    for session in sessions_by_key.values():
        valid_sets = [set_entry for set_entry in session.sets if set_entry.weight > 0 and set_entry.reps > 0]
        if not valid_sets:
            continue
        by_exercise.setdefault(session.exercise or "Unknown", []).append(session)

    for sessions in by_exercise.values():
        sessions.sort(key=lambda session: session.date)

    return by_exercise
