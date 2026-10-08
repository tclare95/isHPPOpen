# Tasks

- [x] Derive chart rows and preserve the original annotation-clock sampling behavior.
- [x] Repair event selection without an effect and retain new-event mode.
- [x] Subscribe banner visibility to schedule boundaries/focus with consistent hydration.
- [x] Add focused input, selection, schedule, hydration and cleanup checks.
- [x] Restore global Hooks rules with documented external-clock exceptions only.
- [x] Run full lint, Jest and production build; complete Astra review.
- [x] Update architecture/backlog, validate and archive the OpenSpec change, prepare an implementation PR.


## Verification

- 42 suites / 171 tests passed; the final timer-ordering change also passed all eight banner checks.
- ESLint passed with zero errors and nine existing unused test suppression warnings.
- Final production build passed with CI-only placeholders and existing missing-source fallback logs.
- Astra found no blocking issues; its timer-ordering improvement was applied and verified.
- Web only; no source/storage contracts, cron, production data or deployment settings changed.
