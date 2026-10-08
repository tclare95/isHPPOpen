# SPEC-NNN — Short title

**Status:** Draft  
**Repositories:** Web / Scraper / Predictor (select those affected)  
**Tracking:** links to relevant issues and PRs

## Problem and outcome
What problem are we solving, and what observable result should change?

## Scope
- In scope:
- Out of scope:

## Behaviour and design
Concise user/system behaviour, constraints and important failure cases. Link to architecture documentation rather than repeating it.

## Shared contracts and dependencies
Identify affected S3 objects, CSV columns, Mongo collections, units, timestamps, freshness and consumer compatibility, or state **None**. Specify a safe rollout order if multiple repositories are affected.

## Acceptance criteria
- [ ] Observable behaviour and edge cases are covered.
- [ ] Relevant tests, validation or repeatable manual checks are identified.
- [ ] Operational effects and documentation updates are identified.

## Verification and release
Repository-specific checks, integration verification and any deployment/rollback ordering. Note that AWS releases require separate manual approval and a web main merge may deploy automatically.

## Decisions / open questions
Keep only unresolved decisions here. Move agreed behaviour into the sections above.

<!-- For predictor/model changes, include a time-ordered backtest, comparison with an explicit baseline, winter/high-water performance, absence of feature leakage, and separate model-artifact promotion. For scraper/data changes, include upstream failure, stale data and idempotent/retry behaviour. -->
