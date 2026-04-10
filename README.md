# RepIQ

RepIQ is an AI-powered workout coach for intermediate lifters who have plateaued. This repository is set up as a monorepo so we can build the core V1 loop first, while keeping clean seams for the engine, network layer, and later coach features.

## Architecture

- `apps/web`: mobile-first React web app and eventual PWA session logger
- future `apps/mobile`: native beta client can later sit on the same API/engine contracts
- `apps/api`: Node.js API for auth-adjacent app logic, programs, sessions, suggestions, payments, and share surfaces
- `apps/engine`: Python coaching engine service for rule-based overload, plateau detection, and later projection/reporting
- `packages/shared`: shared domain types, constants, and validation boundaries
- `packages/ui`: shared UI primitives for the web app
- `infra/supabase`: schema and migration files for the app database
- `docs`: product-to-engineering plan and execution notes

## Reference Docs

- `docs/project-status.md`: current implementation status
- `docs/api-and-sequences.md`: living API inventory and sequence diagrams
- `docs/algorithms.md`: implemented web, API, and engine algorithms
- `docs/navigation-map.md`: page connectivity, entry points, exit points, and bottom-nav rules
- `docs/psych-layer.md`: psychological-data schema, capture plan, and future intelligence layer
- `docs/v1-roadmap.md`: phased roadmap
- `docs/architecture.md`: architecture decisions and follow-on design notes
- `docs/product-management.md`: product decisions and interaction rationale

## Recommended V1 build order

1. Auth and profile bootstrap
2. Program generation request and persistence
3. Session logger with autosave and optimistic completion
4. Overload engine integration and suggestion persistence
5. Session-complete intelligence surface
6. Session 3 paywall and referral hooks

## Local setup

1. Copy `.env.example` to `.env`
2. Install workspace dependencies with `npm install`
3. Run `npm run dev:web`
4. Run `npm run dev:api`
5. Run `npm run dev:engine`

Supabase is the source of truth for auth and persistence. The API and engine should stay stateless wherever possible.

Media direction:
- V1 finish flow supports up to 3 images for self-reference/progress
- API owns the future upload boundary so web and mobile clients can share the same media contract
