# Architecture Decision

## Why not local-only?

RepIQ's trust loop depends on persistent history:

- logged sessions across weeks
- rule-based suggestions tied to prior performance
- return-from-break detection
- reward records and milestone tracking
- paywall timing after Session 3

A local-only prototype would be useful for UI exploration, but not for the product's core value. That is why this repo starts with a real backend boundary and a real schema boundary.

## Chosen structure

- Web first, not native first
- Supabase for auth and Postgres
- Node API for product workflows and integration points
- Python engine service for auditable training logic
- Shared domain package for app and API contracts

## Mobile-Ready Direction

- the current web app should behave like the first client, not the only client
- a future mobile app should be able to reuse:
  - API contracts
  - engine contracts
  - workout/session domain rules
  - media constraints
- client-specific behavior should stay at the edge:
  - browser file picking
  - native media picking
  - notifications
  - local device storage

## Media Boundary

- finish-workout images are a real product need for progress/self-reference
- media should not be persisted as temporary browser blob URLs long-term
- RepIQ should use a backend-managed media contract even before cloud storage exists
- near-term beta path:
  - frontend requests media constraints and an upload slot from the API
  - API owns the storage target
  - local uploads folder can sit behind the API first
- later production path:
  - keep the same contract
  - swap storage target from local uploads to cloud/object storage

## Architectural Modifications Applied

- shared media schemas now live in `packages/shared`
- API now exposes a media boundary via:
  - `GET /v1/media/config`
  - `POST /v1/media/prepare`
- this keeps the repo ready for:
  - beta web users with backend-managed uploads
  - a later mobile client using the same media handshake

## First vertical slice

1. User profile created
2. Program request stored
3. Session loaded from program
4. Sets logged and saved
5. Engine computes next suggestion
6. Suggestion shown on session complete

If this loop does not feel trustworthy, nothing else matters yet.

## Captured Follow-On Design Notes

These are not first-slice blockers, but they are part of the intended product direction and should stay visible in planning.

### Inactivity Check-In

- Only relevant when a workout is active
- Trigger after a long period of no meaningful input, starting with an hourly check cadence
- Support both in-app reminder UI and optional system notification
- Deduplicate alerts so the user never sees multiple concurrent inactivity prompts of the same kind

### User Theme Packs

- Theme preference is app-level, not per-screen
- Extend the token-based theme system with curated presets rather than arbitrary freeform colors first
- Each preset should define background, surface, text, accent/button, and highlight tones together
- Apply changes live without restart wherever possible
