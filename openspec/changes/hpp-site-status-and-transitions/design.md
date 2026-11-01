# Design notes: Independent HPP service

This file captures consequential boundaries and possible approaches. The [capability specs](specs/hpp-site-status/spec.md) are authoritative for product behaviour; implementation details below are **not prescriptions**.

## Confirmed architecture

- An independently operated **HPP service** (separate from `river-data-platform`) consumes the existing RDP first-party **read** contract. It owns HPP rule evaluation, durable state/transition history, and operator-facing health. RDP remains the canonical gauge-observation source and is not asked to write HPP decisions.
- The web retains public formatting and notification delivery. Direct browser access to RDP/internal HPP credentials is unnecessary; use server-to-server access appropriate to the deployment.
- Initial HPP site: one verified Colwick series and one 2.2 m rule; do not create a cross-site rule engine.

## Source evidence and historical semantics

Current Node code uses `4009`, threshold comparison `< 2.2`, then creates `openIndicator` events stamped with poll time, sometimes after serving S3/Mongo fallback values. These legacy timestamps are historical facts, **not evidence that the underlying observation was fresh**. Preserve them with provenance when transitioning history; do not overwrite them with inferred observation times.

RDP `ea-colwick-level` is registered as metres above station datum (mASD). Verify exact measure/datum equivalence against the legacy decision input before enabling authority. Prefer source observation time for evidence eligibility, with evaluation time separately recorded. Match the user-visible 30-minute freshness baseline initially, but record measured EA lag and explicitly review any proposed policy adjustment.

State and notification are distinct: the HPP service decides state; the website keeps subscribers, delivery idempotency, and email execution. Uncertain or stale input cannot create a change. A prolonged gap may require reviewing first fresh reading versus last established state; no automatic synthetic transitions across the unknown period.

## Migration and rollback

1. Read-only inventory of existing `openIndicator` records and dependent fields. Handle [#63](https://github.com/tclare95/isHPPOpen/issues/63)'s one-year carry-in defect with verified tests; record gaps/legacy inconsistencies.
2. Independently validate RDP Colwick access, identity, source lag and failure modes. Stage fixtures and parallel **non-authoritative** evaluations against legacy transitions.
3. Only after approved continuity/history evidence, arrange a single-writer switch and separately migrate the website status reader. The service may temporarily provide a legacy-compatible projection, or the web may adapt its reader; neither is required by this spec.
4. Reconcile the last known state, event sequence and alert source before activating, and prove rollback can use the preserved historical source without creating new notifications.

Consider the smallest durable state mechanism that can preserve transitions and the carry-in lookup. A database, table shape, transport, runtime, deployment region, schedule and repository name are **not** selected here. Existing separate deployment isolation and manual approval practices remain binding on operational work.

## Non-overlap

- [#51](https://github.com/tclare95/isHPPOpen/issues/51) migrates gauge display/alert source reads; HPP events are another domain.
- [#47](https://github.com/tclare95/isHPPOpen/issues/47) hardens alert delivery; HPP cutover must depend on that assurance, not replace delivery infrastructure.
- [#50](https://github.com/tclare95/isHPPOpen/issues/50) imports gauge **observations** only; it does not recreate `openIndicator` decisions.
- CSO site assessments remain RDP evidence + website-calibrated presentation/risk, not HPP rules.
