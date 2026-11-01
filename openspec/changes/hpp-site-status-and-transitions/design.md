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

### Decisions recorded 1 November 2026

- **Storage (agreed):** MongoDB remains the isHPPOpen application database. After an approved cutover the HPP service is the single writer to the existing `openIndicator` collection, keeping `{ timestamp, value }` for current readers and adding provenance fields (`observedAt`, `evaluatedAt`, `level`, `ruleId`, `source`). Shadow decisions go to a separate, non-authoritative collection or log. No new storage or AWS resources.
- **Hosting (stated direction):** the HPP service is expected to run within the isHPPOpen Vercel deployment, reusing its server-side RDP read client and Mongo connection. HPP rules stay outside RDP. The schedule mechanism, and how a single writer is guaranteed across overlapping invocations, remain to be designed and approved with the shadow slice.
- **Source:** the legacy rule input is the station 4009 level, equivalent to RDP `ea-colwick-level` (`4009-level-stage-i-15_min-mASD`, mASD/ASD). The RDP read API is available.
- **Accepted risks:** EA publication lag against the 30-minute freshness baseline is not a concern; a small number of duplicate HPP emails at cutover or rollback is acceptable while usage is low.
- **Decision core:** `libs/hpp/hppDecision.js` holds the pure rule, evidence assessment and transition decision (no I/O, clock or storage), with deterministic tests for tasks 3 and 4.

Read-only `openIndicator` inventory (1 November 2026): 126 documents, only the `_id` index; 5 older-shape `{ readingDate, openIndicatorField }` rows (14–17 March 2024) that readers ignore and that conflict with the main series; about 15 flips under 30 minutes apart (the rule has no hysteresis); a 285-day gap from February to November 2025. Treat these as recorded anomalies, not data to rewrite.

Existing separate deployment isolation and manual approval practices remain binding on operational work.

## Non-overlap

- [#51](https://github.com/tclare95/isHPPOpen/issues/51) migrates gauge display/alert source reads; HPP events are another domain.
- [#47](https://github.com/tclare95/isHPPOpen/issues/47) hardens alert delivery; HPP cutover must depend on that assurance, not replace delivery infrastructure.
- [#50](https://github.com/tclare95/isHPPOpen/issues/50) imports gauge **observations** only; it does not recreate `openIndicator` decisions.
- CSO site assessments remain RDP evidence + website-calibrated presentation/risk, not HPP rules.
