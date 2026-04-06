from __future__ import annotations

import json
from pathlib import Path

from .goals import GoalDefinition


CATALOG_PATH = Path(__file__).with_name("exercise_catalog.json")
EXERCISE_LOOKUP: dict[str, dict[str, str]] = json.loads(CATALOG_PATH.read_text())

EXERCISE_EXCEPTIONS = [
    {"fragments": ["chest supported"], "group": "Back"},
    {"fragments": ["chest to bar"], "group": "Back"},
    {"fragments": ["t-bar row", "t bar row"], "group": "Back"},
    {"fragments": ["pendlay"], "group": "Back"},
    {"fragments": ["seal row"], "group": "Back"},
    {"fragments": ["meadows row"], "group": "Back"},
    {"fragments": ["face pull"], "group": "Shoulders"},
    {"fragments": ["band pull apart", "band pull-apart"], "group": "Shoulders"},
    {"fragments": ["rear delt", "rear deltoid"], "group": "Shoulders"},
    {"fragments": ["reverse pec deck", "reverse fly", "reverse flye"], "group": "Shoulders"},
    {"fragments": ["hip thrust", "hip extension"], "group": "Glutes"},
    {"fragments": ["glute bridge", "glute drive"], "group": "Glutes"},
    {"fragments": ["nordic hamstring", "nordic curl"], "group": "Hamstrings"},
    {"fragments": ["leg press"], "group": "Quads"},
    {"fragments": ["good morning"], "group": "Hamstrings"},
    {"fragments": ["close grip bench", "close-grip bench"], "group": "Triceps"},
    {"fragments": ["jm press"], "group": "Triceps"},
    {"fragments": ["spider curl"], "group": "Biceps"},
    {"fragments": ["drag curl"], "group": "Biceps"},
    {"fragments": ["dips", "dip"], "group": "Chest"},
    {"fragments": ["push up", "push-up", "pushup"], "group": "Chest"},
    {"fragments": ["landmine press"], "group": "Chest"},
]

STRIP_PREFIXES = [
    "barbell ",
    "dumbbell ",
    "db ",
    "cable ",
    "machine ",
    "smith machine ",
    "weighted ",
    "assisted ",
    "single arm ",
    "single leg ",
    "one arm ",
    "seated ",
    "standing ",
    "lying ",
    "incline ",
    "decline ",
    "flat ",
    "wide grip ",
    "close grip ",
    "reverse grip ",
    "narrow grip ",
    "ez bar ",
    "ez-bar ",
    "trap bar ",
    "hex bar ",
    "hammer strength ",
    "resistance band ",
    "band ",
    "rope ",
    "straight bar ",
]

MUSCLE_RULES = [
    {"group": "Triceps", "requires": ["tricep"], "excludes": []},
    {"group": "Triceps", "requires": ["skull"], "excludes": []},
    {"group": "Triceps", "requires": ["pushdown"], "excludes": []},
    {"group": "Triceps", "requires": ["kickback"], "excludes": []},
    {"group": "Triceps", "requires": ["close grip"], "excludes": []},
    {"group": "Triceps", "requires": ["jm press"], "excludes": []},
    {"group": "Triceps", "requires": ["dip"], "excludes": ["chest"]},
    {"group": "Biceps", "requires": ["bicep"], "excludes": []},
    {"group": "Biceps", "requires": ["biceps"], "excludes": []},
    {"group": "Biceps", "requires": ["curl"], "excludes": ["leg curl", "hamstring", "nordic", "calf", "tricep"]},
    {"group": "Biceps", "requires": ["preacher"], "excludes": []},
    {"group": "Biceps", "requires": ["spider curl"], "excludes": []},
    {"group": "Biceps", "requires": ["drag curl"], "excludes": []},
    {"group": "Shoulders", "requires": ["lateral raise"], "excludes": []},
    {"group": "Shoulders", "requires": ["side raise"], "excludes": []},
    {"group": "Shoulders", "requires": ["front raise"], "excludes": []},
    {"group": "Shoulders", "requires": ["shoulder press"], "excludes": []},
    {"group": "Shoulders", "requires": ["rear delt"], "excludes": []},
    {"group": "Shoulders", "requires": ["face pull"], "excludes": []},
    {"group": "Shoulders", "requires": ["reverse fly"], "excludes": []},
    {"group": "Shoulders", "requires": ["reverse flye"], "excludes": []},
    {"group": "Shoulders", "requires": ["upright row"], "excludes": []},
    {"group": "Shoulders", "requires": ["arnold"], "excludes": []},
    {"group": "Shoulders", "requires": ["military press"], "excludes": []},
    {"group": "Shoulders", "requires": ["ohp"], "excludes": []},
    {"group": "Shoulders", "requires": ["overhead press"], "excludes": ["tricep"]},
    {"group": "Shoulders", "requires": ["shoulder"], "excludes": []},
    {"group": "Shoulders", "requires": ["shrug"], "excludes": []},
    {"group": "Back", "requires": ["pull-up"], "excludes": []},
    {"group": "Back", "requires": ["pullup"], "excludes": []},
    {"group": "Back", "requires": ["pull up"], "excludes": []},
    {"group": "Back", "requires": ["chin-up"], "excludes": []},
    {"group": "Back", "requires": ["chinup"], "excludes": []},
    {"group": "Back", "requires": ["chin up"], "excludes": []},
    {"group": "Back", "requires": ["pulldown"], "excludes": []},
    {"group": "Back", "requires": ["lat pulldown"], "excludes": []},
    {"group": "Back", "requires": ["deadlift"], "excludes": ["romanian", "rdl", "sumo", "stiff"]},
    {"group": "Back", "requires": ["rdl"], "excludes": []},
    {"group": "Back", "requires": ["row"], "excludes": ["upright row", "leg", "calf"]},
    {"group": "Back", "requires": ["good morning"], "excludes": []},
    {"group": "Back", "requires": ["back extension"], "excludes": []},
    {"group": "Back", "requires": ["hyperextension"], "excludes": []},
    {"group": "Back", "requires": ["chest supported"], "excludes": []},
    {"group": "Back", "requires": ["pendlay"], "excludes": []},
    {"group": "Back", "requires": ["seal row"], "excludes": []},
    {"group": "Back", "requires": ["meadows"], "excludes": []},
    {"group": "Chest", "requires": ["bench press"], "excludes": []},
    {"group": "Chest", "requires": ["chest press"], "excludes": []},
    {"group": "Chest", "requires": ["chest fly"], "excludes": []},
    {"group": "Chest", "requires": ["pec deck"], "excludes": []},
    {"group": "Chest", "requires": ["cable crossover"], "excludes": []},
    {"group": "Chest", "requires": ["cable fly"], "excludes": []},
    {"group": "Chest", "requires": ["push up"], "excludes": []},
    {"group": "Chest", "requires": ["pushup"], "excludes": []},
    {"group": "Chest", "requires": ["push-up"], "excludes": []},
    {"group": "Chest", "requires": ["dip"], "excludes": ["tricep"]},
    {"group": "Chest", "requires": ["flye"], "excludes": []},
    {"group": "Chest", "requires": ["fly"], "excludes": ["reverse", "rear", "cable pull"]},
    {"group": "Chest", "requires": ["incline"], "excludes": ["row", "curl", "supported"]},
    {"group": "Chest", "requires": ["decline"], "excludes": ["row", "curl"]},
    {"group": "Quads", "requires": ["squat"], "excludes": ["sumo", "romanian", "rdl"]},
    {"group": "Quads", "requires": ["hack"], "excludes": []},
    {"group": "Quads", "requires": ["leg press"], "excludes": []},
    {"group": "Quads", "requires": ["leg extension"], "excludes": []},
    {"group": "Quads", "requires": ["lunge"], "excludes": []},
    {"group": "Quads", "requires": ["step up"], "excludes": []},
    {"group": "Quads", "requires": ["front squat"], "excludes": []},
    {"group": "Quads", "requires": ["goblet"], "excludes": []},
    {"group": "Quads", "requires": ["sissy squat"], "excludes": []},
    {"group": "Hamstrings", "requires": ["romanian"], "excludes": []},
    {"group": "Hamstrings", "requires": ["rdl"], "excludes": []},
    {"group": "Hamstrings", "requires": ["leg curl"], "excludes": []},
    {"group": "Hamstrings", "requires": ["nordic"], "excludes": []},
    {"group": "Hamstrings", "requires": ["hamstring"], "excludes": []},
    {"group": "Hamstrings", "requires": ["stiff leg"], "excludes": []},
    {"group": "Hamstrings", "requires": ["stiff-leg"], "excludes": []},
    {"group": "Hamstrings", "requires": ["lying curl"], "excludes": []},
    {"group": "Hamstrings", "requires": ["seated curl"], "excludes": []},
    {"group": "Hamstrings", "requires": ["sumo deadlift"], "excludes": []},
    {"group": "Hamstrings", "requires": ["good morning"], "excludes": []},
    {"group": "Glutes", "requires": ["hip thrust"], "excludes": []},
    {"group": "Glutes", "requires": ["glute bridge"], "excludes": []},
    {"group": "Glutes", "requires": ["glute drive"], "excludes": []},
    {"group": "Glutes", "requires": ["glute"], "excludes": []},
    {"group": "Glutes", "requires": ["cable kickback"], "excludes": []},
    {"group": "Glutes", "requires": ["sumo"], "excludes": ["deadlift"]},
    {"group": "Glutes", "requires": ["hip extension"], "excludes": []},
    {"group": "Glutes", "requires": ["donkey kick"], "excludes": []},
    {"group": "Glutes", "requires": ["fire hydrant"], "excludes": []},
    {"group": "Calves", "requires": ["calf"], "excludes": []},
    {"group": "Calves", "requires": ["calf raise"], "excludes": []},
    {"group": "Calves", "requires": ["standing raise"], "excludes": []},
    {"group": "Calves", "requires": ["seated raise"], "excludes": []},
    {"group": "Calves", "requires": ["tibialis"], "excludes": []},
    {"group": "Core", "requires": ["crunch"], "excludes": []},
    {"group": "Core", "requires": ["sit up"], "excludes": []},
    {"group": "Core", "requires": ["situp"], "excludes": []},
    {"group": "Core", "requires": ["plank"], "excludes": []},
    {"group": "Core", "requires": ["ab rollout"], "excludes": []},
    {"group": "Core", "requires": ["cable crunch"], "excludes": []},
    {"group": "Core", "requires": ["oblique"], "excludes": []},
    {"group": "Core", "requires": ["hollow"], "excludes": []},
    {"group": "Core", "requires": ["dragon flag"], "excludes": []},
    {"group": "Core", "requires": ["hanging leg raise"], "excludes": []},
    {"group": "Core", "requires": ["toe touch"], "excludes": []},
]

EXERCISE_TYPES = [
    {
        "type": "explosive",
        "label": "Explosive / Power",
        "rep_min": 1,
        "rep_max": 5,
        "note": "Power movements always use low reps — fatigue degrades explosive output.",
        "keywords": ["clean", "snatch", "jerk", "box jump", "power", "med ball", "kettlebell swing", "kip"],
    },
    {
        "type": "high_rep",
        "label": "High-Rep Specific",
        "rep_min": 15,
        "rep_max": 25,
        "note": "This movement responds better to higher reps due to muscle fibre composition.",
        "keywords": ["calf", "calves", "ab ", "abs", "crunch", "sit up", "situp", "plank", "oblique", "neck", "forearm", "wrist", "tibialis", "face pull", "band", "cable pull through"],
    },
    {
        "type": "small_isolation",
        "label": "Small Isolation",
        "rep_min": 12,
        "rep_max": 20,
        "note": "Isolation movements for small muscles are better trained with moderate-to-high reps. Heavy loads compromise form and increase injury risk.",
        "keywords": [
            "lateral raise",
            "side raise",
            "front raise",
            "rear delt",
            "reverse fly",
            "bicep curl",
            "hammer curl",
            "preacher",
            "concentration curl",
            "spider curl",
            "tricep pushdown",
            "skull crusher",
            "kickback",
            "overhead extension",
            "wrist curl",
            "finger",
            "shrug",
            "upright row",
        ],
    },
]


def lookup_exercise(exercise_name: str) -> dict[str, str] | None:
    lower = exercise_name.lower().strip()
    if lower in EXERCISE_LOOKUP:
        return EXERCISE_LOOKUP[lower]

    for prefix in STRIP_PREFIXES:
        if lower.startswith(prefix):
            stripped = lower[len(prefix) :].strip()
            if stripped in EXERCISE_LOOKUP:
                return EXERCISE_LOOKUP[stripped]

    cleaned = (
        lower.replace("(", " (")
        .split(" - ")[0]
        .split(" w/")[0]
        .split(" with ")[0]
        .strip()
    )
    if cleaned != lower and cleaned in EXERCISE_LOOKUP:
        return EXERCISE_LOOKUP[cleaned]

    for prefix in STRIP_PREFIXES:
        if cleaned.startswith(prefix):
            stripped = cleaned[len(prefix) :].strip()
            if stripped in EXERCISE_LOOKUP:
                return EXERCISE_LOOKUP[stripped]

    return None


def get_muscle_group(exercise_name: str) -> str:
    lower = exercise_name.lower().strip()
    for exception in EXERCISE_EXCEPTIONS:
        if any(fragment in lower for fragment in exception["fragments"]):
            return exception["group"]

    hit = lookup_exercise(exercise_name)
    if hit:
        return hit["group"]

    for rule in MUSCLE_RULES:
        all_present = all(required in lower for required in rule["requires"])
        none_excluded = all(excluded not in lower for excluded in rule["excludes"])
        if all_present and none_excluded:
            return rule["group"]
    return "Other"


def get_movement_type(exercise_name: str) -> str:
    hit = lookup_exercise(exercise_name)
    if hit:
        return hit["type"]

    lower = exercise_name.lower()
    if any(keyword in lower for keyword in ("squat", "hack", "leg press", "lunge", "step up", "goblet", "front squat")):
        return "compound_quad"
    if any(keyword in lower for keyword in ("romanian", "rdl", "deadlift", "good morning", "stiff", "sumo deadlift")):
        return "compound_hinge"
    if any(keyword in lower for keyword in ("leg curl", "nordic", "lying curl", "seated curl", "hamstring curl")):
        return "isolation_hamstring"
    if any(keyword in lower for keyword in ("hip thrust", "glute bridge", "glute drive")):
        return "compound_glute"
    if any(keyword in lower for keyword in ("glute", "kickback", "donkey kick", "fire hydrant", "hip extension")):
        return "isolation_glute"
    if "calf" in lower or "tibialis" in lower:
        return "isolation_calf"
    if "leg extension" in lower or "sissy" in lower:
        return "isolation_quad"
    if any(keyword in lower for keyword in ("row", "cable pull", "chest supported", "seal", "pendlay", "meadows", "t-bar")):
        return "compound_pull_horizontal"
    if any(keyword in lower for keyword in ("pull-up", "pullup", "pull up", "chin", "pulldown", "lat pull")):
        return "compound_pull_vertical"
    if ("bench" in lower or "press" in lower) and all(keyword not in lower for keyword in ("incline", "overhead", "shoulder", "military")):
        return "compound_push"
    if "incline" in lower and any(keyword in lower for keyword in ("bench", "press", "dumbbell")):
        return "compound_push_incline"
    if any(keyword in lower for keyword in ("fly", "flye", "cable cross", "pec deck")):
        return "isolation_chest"
    if any(keyword in lower for keyword in ("lat", "back extension", "hyperextension")):
        return "isolation_back"
    if any(keyword in lower for keyword in ("lateral raise", "side raise", "front raise")):
        return "isolation_shoulder_lateral"
    if any(keyword in lower for keyword in ("rear delt", "reverse fly", "face pull")):
        return "isolation_shoulder_rear"
    if any(keyword in lower for keyword in ("overhead press", "shoulder press", "military", "ohp", "arnold")):
        return "compound_press"
    if any(keyword in lower for keyword in ("curl", "bicep", "hammer")):
        return "isolation_bicep"
    if any(keyword in lower for keyword in ("tricep", "pushdown", "skull", "extension", "kickback")):
        return "isolation_tricep"
    if any(keyword in lower for keyword in ("ab", "crunch", "plank", "core", "sit up")):
        return "isolation_core"
    return "general"


def get_exercise_rep_range(exercise_name: str, goal: GoalDefinition) -> GoalDefinition:
    lower = exercise_name.lower()
    for exercise_type in EXERCISE_TYPES:
        if any(keyword in lower for keyword in exercise_type["keywords"]):
            return GoalDefinition(
                key=goal.key,
                name=exercise_type["label"],
                rep_min=exercise_type["rep_min"],
                rep_max=exercise_type["rep_max"],
                target_sets=goal.target_sets,
                load_increment=1.25 if exercise_type["rep_max"] >= 15 else goal.load_increment,
                consistency_threshold=goal.consistency_threshold,
                progression_note=f"At the top of the {exercise_type['label']} range ({exercise_type['rep_min']}–{exercise_type['rep_max']}) — add a small load increase.",
                below_range_note=f"Reps are below the {exercise_type['label']} range. {exercise_type['note']}",
                within_range_note=f"Within the {exercise_type['label']} range. Build toward {exercise_type['rep_max']} reps before adding load.",
                overridden=True,
                label=exercise_type["label"],
                note=exercise_type["note"],
                goal_name=goal.name,
            )
    return GoalDefinition(
        key=goal.key,
        name=goal.name,
        rep_min=goal.rep_min,
        rep_max=goal.rep_max,
        target_sets=goal.target_sets,
        load_increment=goal.load_increment,
        consistency_threshold=goal.consistency_threshold,
        progression_note=goal.progression_note,
        below_range_note=goal.below_range_note,
        within_range_note=goal.within_range_note,
        overridden=False,
        label=f"Compound — {goal.name}",
        note=None,
        goal_name=goal.name,
    )
