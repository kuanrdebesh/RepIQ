# RepIQ Adaptive Experience Design Guidelines

Last updated: 2026-04-17

## 1. Purpose

RepIQ should remain one product, one training engine, and one data model.

What changes by user type is the experience layer:

- what is visible
- what is emphasized
- how much choice is exposed
- how much explanation is shown
- how dense the interface feels
- how assertive RepIQ is in telling the user what to do next

The goal is to make RepIQ feel personally fitted without fragmenting the product into separate apps or separate logic stacks.


## 2. Core Product Rule

> Same app, different layers.

RepIQ should adapt to the user by changing presentation, defaults, and reveal depth, while keeping the underlying workout generation, logging, analytics, and plan logic unified.

This is not a "basic app" and an "advanced app".

This is one app with:

- a shared engine
- shared state and data structures
- shared navigation map
- adaptive visibility, density, tone, and default behavior


## 3. Why This Matters

RepIQ has natural product tension:

- some users want control and customization
- many users want clarity, trust, and the next best action

If both groups see the same interface by default, one side feels constrained and the other feels overwhelmed.

Adaptive layers let RepIQ:

- reduce cognitive load
- improve trust and follow-through
- increase onboarding fit
- improve retention by making the app feel built for the user
- preserve power features without forcing them on everyone


## 4. Experience Architecture

RepIQ should adapt across 4 axes.

### 4.1 Module visibility

Controls which product areas are emphasized or hidden by default.

Primary modules:

1. Workout generation and logging
2. Analytics
3. Other surfaces
   - community
   - profile depth
   - future social/discovery areas
4. Styling layer
   - visual density
   - copy density
   - control prominence

### 4.2 Guidance level

Controls how much RepIQ decides versus how much the user configures.

Recommended values:

- `guided`
- `flexible`
- `advanced`

Meaning:

- `guided`: user is mainly told what to do next
- `flexible`: RepIQ guides, but customization is easy and visible
- `advanced`: user is comfortable seeing more controls, data, and planning options

### 4.3 Information depth

Controls how much explanation and detail is shown on each screen.

Recommended values:

- `minimal`
- `balanced`
- `detailed`

Meaning:

- `minimal`: one clear takeaway, one clear next step, most detail collapsed
- `balanced`: summary first, with a visible path to detail
- `detailed`: more metrics, comparisons, and supporting context visible by default

### 4.4 Visual style

Controls the emotional feel of the UI rather than the business logic.

Recommended values:

- `calm`
- `standard`

Meaning:

- `calm`: lighter hierarchy, fewer competing accents, more whitespace, lower visual pressure
- `standard`: regular product presentation


## 5. Recommended Launch Model

Do not launch with too many persona variants.

Recommended V1.5 model:

### 5.1 Global experience modes

Start with 2 primary modes:

1. `Guided`
2. `Flexible`

Optional later:

3. `Advanced`

This captures most of the value without making the product hard to reason about.

### 5.2 Per-module depth

Within each module, allow only 2 reveal levels:

- `Simple`
- `Detailed`

This is easier to design and maintain than building fully separate basic/intermediate/advanced versions of every screen.

Recommended interpretation:

- global mode controls defaults and overall surface area
- per-module depth controls how much of a module is shown when the user enters it


## 6. Design Principles

1. The app should feel easier, not smaller.
2. Hiding complexity is better than removing capability.
3. Defaults should do most of the work for guided users.
4. Detail should be available on demand, not forced up front.
5. The same user may want different depths in different modules.
6. Analytics should guide confidence, not create homework.
7. Planning should be occasional, not a daily burden.
8. Community and social surfaces should be optional, not assumed.
9. Styling choices should reinforce trust and calm, not spectacle.
10. Personalization should feel empowering, never restrictive or patronizing.


## 7. Experience Profile Model

RepIQ should store a single profile object that drives UI behavior.

Example shape:

```ts
interface ExperienceProfile {
  guidanceLevel: "guided" | "flexible" | "advanced";
  informationDepth: "minimal" | "balanced" | "detailed";
  visualStyle: "calm" | "standard";
  enabledModules: {
    workout: true;
    analytics: true;
    community: boolean;
  };
  moduleDepth: {
    workout: "simple" | "detailed";
    analytics: "simple" | "detailed";
    community: "simple" | "detailed";
  };
  defaults: {
    homeSurface: "next_action" | "planner" | "overview";
    analyticsLanding: "summary" | "stats" | "progress";
    plannerEntry: "generate" | "my_workouts" | "library";
  };
}
```

Important rule:

Screens should not branch on user personas directly.
They should branch on capabilities derived from this profile.


## 8. Derived Capability Pattern

Avoid sprinkling logic such as:

- if beginner, hide this
- if older user, show that
- if guided user, remove this section

Instead derive explicit UI capabilities, such as:

- `showCommunity`
- `showAdvancedPlannerControls`
- `maxVisibleDailyActions`
- `showExpandedAnalyticsCards`
- `defaultInsightsTab`
- `showExerciseReplacementTools`
- `showPlanBuilderByDefault`
- `showDetailedSetHistory`

This keeps the system maintainable and prevents persona logic from leaking across the app.


## 9. Module Guidelines

## 9.1 Workout generation and logging

This is the highest-trust surface in RepIQ.

Guidelines:

- Keep the core logger behavior consistent across all user types
- Change emphasis, not the training truth
- Guided users should land closer to `Start` and `Continue`
- Flexible and advanced users can see more planning and customization controls

### Guided presentation

- default home focuses on `Next Workout` or `Start Workout`
- session generation should feel assistant-led
- plan generation should be recommendation-first, not builder-first
- builder controls should be collapsed or secondary
- exercise replacement stays available, but not dominant
- fewer visible optional actions during workout

### Flexible presentation

- guided suggestions remain visible
- user can browse, edit, swap, and fine-tune more easily
- planner can expose both generated and saved structures more directly

### Advanced presentation

- more planning controls visible up front
- denser drill-down on exercises, patterns, history, and plan structure


## 9.2 Analytics

Analytics should adapt more aggressively than logging.

### Minimal / simple analytics

- 1 to 2 takeaways maximum
- 1 primary action maximum
- details collapsed behind a clear reveal
- emphasis on confidence, consistency, recovery, and next best target
- avoid showing multiple competing recommendations on daily surfaces

### Balanced analytics

- summary first
- important charts visible
- details one click away
- weekly framing begins to matter more

### Detailed analytics

- more comparisons
- more trend and movement breakdown
- richer tables and drill-downs
- monthly and longer-term review become more central

### Analytics rule

Daily:

- awareness
- one clear takeaway
- minimal pressure

Weekly:

- action
- pattern correction
- practical checkpoint

Monthly:

- strategy
- broader pattern review
- planning adjustments


## 9.3 Other surfaces, including community

Community should be optional.

Guidelines:

- never make social participation feel mandatory
- do not let community compete with the core training path for guided users
- community can be hidden entirely for users who do not want it
- discovery of hidden modules should still exist in settings or profile preferences

Recommended handling:

- `community off`: hide from main navigation and main recommendations
- `community quiet`: available, but not promoted
- `community visible`: visible in navigation or home modules


## 9.4 Styling layer

Styling should reflect cognitive preference, not only brand preference.

### Calm style

- lower visual contrast between secondary sections
- fewer simultaneous accents
- restrained use of red/orange urgency
- more whitespace
- less copy per card
- stronger prioritization of one main CTA

### Standard style

- regular emphasis and density
- broader visible information

Styling should be controlled through tokens and component props, not hand-tuned one-off overrides.


## 10. Onboarding and Preference Capture

This should be optional, short, and framed around comfort rather than identity.

Do not ask:

- "What kind of user are you?"

Prefer asking:

1. How much guidance do you want?
2. How much detail do you want to see?
3. Do you want to use social/community features?
4. Do you prefer a calmer, simpler interface?

Recommended outcome:

- 4 short questions
- one-time setup
- editable later in preferences
- product can auto-suggest changes later based on behavior

Example:

| User statement | System mapping |
|---|---|
| "Tell me what to do and I will follow it" | `guidanceLevel = guided` |
| "I do not want social features" | `enabledModules.community = false` |
| "Medium amount of information" | `informationDepth = balanced` |
| "Keep things minimal" | `visualStyle = calm` |


## 11. Discoverability Rules

Adaptive layers should reduce clutter, not bury important capabilities forever.

Rules:

1. Hidden does not mean inaccessible.
2. Advanced functions should remain reachable through deliberate reveal points.
3. Every hidden major area should have a discoverable path in preferences, profile, or module settings.
4. RepIQ can recommend turning on more depth only after the user shows readiness for it.
5. Do not surprise users by reconfiguring the app too aggressively without explanation.


## 12. Action and Recommendation Rules

RepIQ should adapt the number and style of actions shown.

### Guided users

- one primary next step
- one optional secondary action at most
- fewer branching decisions
- stronger reassurance language

### Flexible users

- one primary recommendation
- a few visible alternatives
- moderate comparison and browsing tools

### Advanced users

- more optional controls
- richer comparisons
- easier access to edits, replacements, and plan customization

Key rule:

The app should avoid giving a user five things to fix at once.


## 13. Navigation Rules

Navigation should reflect the chosen layer.

Examples:

- guided users land on `Home -> Next Action`
- flexible users may land on `Home -> Overview`
- advanced users may land on the most recently used planning or analytics surface

Modules not selected by the user should be:

- removed from the primary path
- still discoverable through settings or profile

Bottom navigation should remain stable where possible.
Avoid changing core nav structure too often across users; prefer changing module emphasis inside screens.


## 14. Implementation Guardrails

To keep this maintainable:

1. Do not fork screens into separate implementations unless absolutely necessary.
2. Do not create separate data pipelines for different experience types.
3. Do not encode behavior with persona-specific conditionals across the UI.
4. Use one centralized experience profile plus derived capabilities.
5. Keep module contracts stable and let presentation vary.
6. Use design tokens for visual density and calmness.
7. Use collapsible sections and progressive disclosure before building separate variants.


## 15. Rollout Recommendation

### Phase 1

- add experience profile model
- add onboarding/preferences capture
- support module visibility toggles
- support guidance and information depth defaults
- support calm styling preset

### Phase 2

- adapt Home, Planner, and Insights defaults
- reduce daily action overload for guided users
- add module-level simple vs detailed treatment

### Phase 3

- observe usage and retention by profile
- refine auto-suggestions
- optionally add advanced mode if needed


## 16. ROI and Product Value

This direction has high product value because it addresses one of the biggest reasons users drop off: too much cognitive work relative to what they actually want from a fitness app.

Expected upside:

- better onboarding completion
- stronger first-week retention
- higher plan adherence
- more consistent logging
- stronger trust in recommendations
- better fit across very different user types

Expected implementation difficulty:

- low to medium for visibility, defaults, and density changes
- medium for cross-app consistency
- high only if RepIQ drifts into maintaining separate flows instead of adaptive layers


## 17. Example Experience Profiles

### Profile A: "Tell me what to do"

- guidance: `guided`
- info depth: `minimal`
- analytics depth: `simple`
- community: `off`
- visual style: `calm`

Result:

- Home emphasizes next workout
- Planner emphasizes generated recommendation over manual building
- Insights shows 1 to 2 takeaways only
- detailed metrics are collapsed
- community is absent from the main path

### Profile B: "I like some control"

- guidance: `flexible`
- info depth: `balanced`
- analytics depth: `detailed`
- community: `quiet`
- visual style: `standard`

Result:

- Home shows next action plus overview
- Planner keeps generation and manual browsing visible
- Insights opens in summary but exposes more drill-down
- community exists, but does not dominate

### Profile C: "Power user"

- guidance: `advanced`
- info depth: `detailed`
- analytics depth: `detailed`
- community: `visible`
- visual style: `standard`

Result:

- more visible planning controls
- more visible analytics layers
- easier access to replacements, history, and comparison surfaces


## 18. Reference Product Patterns

RepIQ's adaptive-layer direction is not unusual in principle, even if few fitness apps execute it cleanly end to end.

Several strong products apply parts of the same philosophy.

### 18.1 Notion

Relevant pattern:

- one product for very different user types
- simple initial surface with deep underlying capability
- progressive disclosure instead of separate beginner and expert products

What RepIQ can borrow:

- one shared engine with different visible depth
- advanced capability remaining available without dominating the default path

### 18.2 Duolingo

Relevant pattern:

- highly guided main path
- strong focus on the next action
- motivational nudges and pacing without requiring the user to configure much

What RepIQ can borrow:

- "tell me what to do next" orientation
- reduced branching for guided users
- motivation as support, not as a dashboard burden

### 18.3 Headspace and Calm

Relevant pattern:

- low-cognitive-load presentation
- calm, confidence-building visual tone
- limited choices in the main journey, with more depth available later

What RepIQ can borrow:

- calm styling for users who want less pressure
- lighter daily consumption
- less aggressive action density

### 18.4 Strava

Relevant pattern:

- same product serves casual and highly engaged users
- analytics and community exist together, but not every user needs both equally

What RepIQ can borrow:

- optional social/community layer
- community as a module, not a requirement
- deeper engagement paths for users who want them

### 18.5 Apple Health and Apple Fitness

Relevant pattern:

- summary-first presentation
- key signals shown clearly before deeper drill-down
- approachable experience for users who do not want to manage a complex system

What RepIQ can borrow:

- layered analytics
- confidence-building summaries
- deeper detail only when requested

### 18.6 Superhuman

Relevant pattern:

- opinionated workflow
- product teaches the user how to move through it
- defaults carry a lot of the experience

What RepIQ can borrow:

- stronger guided defaults
- fewer visible decisions for users who want speed and trust

### 18.7 Todoist

Relevant pattern:

- lightweight for casual use
- deeper organization available for users who want structure

What RepIQ can borrow:

- same product supporting low-intensity and high-intensity engagement
- complexity that stays mostly out of the way until invited in

### 18.8 Canva

Relevant pattern:

- works for non-experts and advanced users in the same product
- guided starting points plus deeper manual control

What RepIQ can borrow:

- assistant-led starting flows
- optional control for users who want to go beyond the default recommendation

### 18.9 Counterexample: MyFitnessPal

Relevant pattern:

- combines logging, reports, settings, and multiple secondary surfaces in one product

What RepIQ should learn from it:

- visible capability can easily become visible clutter
- if too many metrics, controls, and surfaces are presented at once, users feel managed by the app instead of supported by it

### 18.10 The closest philosophical mix for RepIQ

RepIQ's intended direction is closest to a blend of:

- Duolingo for next-best-action guidance
- Headspace or Calm for low-pressure consumption
- Notion or Canva for one engine with multiple depth levels
- Apple Health or Apple Fitness for layered analytics
- Strava for optional community rather than assumed community

The core philosophy can be summarized as:

> progressive disclosure + adaptive defaults + optional depth


## 19. Final Design Position

RepIQ should not ask every user to become an optimizer.

It should meet the user at their preferred level of involvement:

- tell me what to do
- help me understand a bit more
- let me go deep when I want

That is the right balance for RepIQ:

- one product
- one engine
- one source of truth
- multiple adaptive experience layers
