# Specifications

This is the canonical product-level specification registry for the isHPPOpen suite (web application, scraper and Trent predictor). Existing behaviour is described in [architecture](../ARCHITECTURE.md), [system](../SYSTEM.md) and [contracts](../CONTRACTS.md) documentation; it does not need retrospective specs.

## Workflow

1. **Draft** — agree the problem, scope, affected repositories and acceptance criteria. Use [TEMPLATE.md](TEMPLATE.md).
2. **Ready** — the proposal is approved for an implementation agent and dependencies are identified.
3. **In Progress** — link the relevant repository-specific implementation issues and PRs.
4. **Completed** — acceptance criteria are verified and affected architecture, contract and operations docs are updated.

Use sequential suite-wide IDs `SPEC-001`, `SPEC-002`, etc. The ID belongs to the feature, even if implementation spans multiple repositories. A spec is required for substantial product, architecture or cross-repository contract changes; routine fixes, maintenance and small refactors may use ordinary issues. Don't create specs retrospectively to document stable features.

## Index

| Spec | Title | Status | Repositories |
| --- | --- | --- | --- |
| — | No specs recorded yet | — | — |

Maintain this table when specs are created or change status. Prefer concise, implementable specs and avoid duplicating the codebase's current-state documentation.

## Cross-repository implementation

- The web repository owns product specs and shared contracts, **not** scraper/predictor implementation details.
- Each implementation change belongs to an issue/PR in the repository being changed; cross-link all PRs from the spec and name `SPEC-NNN` in PR descriptions.
- For contracts, make additive producer changes first; verify consumers before removing fields or altering object paths. Include rollout and rollback in the spec.
- Repositories retain independent deployment procedures. Merging a spec or a backend PR is **not** approval to deploy; merging the web repository's main branch can trigger a production Vercel deployment.
- Do not change live infrastructure, publish models, invoke production jobs or rotate credentials without explicit authorization.
