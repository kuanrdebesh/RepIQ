# RepIQ Engine

This service owns auditable training logic:

- overload decisions
- plateau detection
- return-from-break adjustments
- reward record detection
- later, projections and report generation

The engine should remain deterministic wherever possible. LLM output belongs around explanations, not inside the core decision path.

