RepIQ Exercise Taxonomy Schema + Validation Rules (v1.0)

SCHEMA

Fields:
- id: string (unique, snake-case)
- name: string
- primaryMuscle: enum
- secondaryMuscles: pipe-separated string
- movementPattern: enum
- angle: enum
- equipment: enum
- difficultyLevel: enum
- exerciseType: enum
- performanceMetric: enum
- supportsExternalLoad: boolean
- implement: enum (nullable)

ALLOWED VALUES

primaryMuscle:
Chest, Back, Lats, Upper Back,
Shoulders, Front Delts, Side Delts, Rear Delts,
Biceps, Triceps, Forearms,
Quads, Hamstrings, Glutes, Calves,
Core, Obliques, Adductors, Abductors

movementPattern:
squat, hip_hinge, lunge,
horizontal_push, vertical_push,
horizontal_pull, vertical_pull,
isolation_push, isolation_pull, isolation_legs,
core_anterior, core_rotational,
carry, cardio, mobility

angle:
flat, incline, decline, overhead, upright, prone, supine, none

equipment:
barbell, dumbbell, kettlebell, machine, cable,
smith_machine, resistance_band, bodyweight, landmine

difficultyLevel:
beginner, intermediate, advanced

exerciseType:
barbell, dumbbell, machine, cable,
bodyweight, bodyweight_weighted, resistance_band

performanceMetric:
reps, time, distance_or_time, mixed

implement:
suspension_trainer, sled, medicine_ball,
jump_rope, plate, battle_ropes, yoke

VALIDATION RULES

1. ID:
- unique, snake-case, no spaces

2. primaryMuscle:
- must be from allowed list
- no vague terms like Legs, Back, Full Body

3. secondaryMuscles:
- same vocabulary as primary
- pipe-separated
- no 'none'

4. movementPattern:
- exactly one value

5. angle:
- overhead movements -> overhead

6. equipment:
- must reflect primary load source

7. exerciseType:
- reflects load behavior
- barbell/EZ/landmine -> barbell

8. performanceMetric:
- holds -> time
- carries -> distance_or_time
- lifts -> reps

9. supportsExternalLoad:
- true for weighted lifts, bands, machines

10. implement:
- TRX -> suspension_trainer

CROSS FIELD RULES

- equipment=barbell -> exerciseType=barbell
- bodyweight_weighted -> supportsExternalLoad=true
- resistance_band -> exerciseType=resistance_band
- TRX -> equipment=bodyweight + implement=suspension_trainer
- 'Overhead' in name -> angle=overhead


