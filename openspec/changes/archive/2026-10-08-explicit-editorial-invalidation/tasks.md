## Implementation

- [x] Trace all invalidation callers and select an explicit freshness policy.
- [x] Use native immediate expiration in the shared helper.
- [x] Prove cache reuse and first-read freshness through the real Next data cache.
- [x] Cover exact tags, rejected writes, and per-tag invalidation failure isolation.
- [x] Complete Astra review, lint, full Jest, and build checks.
- [x] Record evidence, validate and archive the spec, and prepare the PR.

Validation: 41 Jest suites / 165 tests passed; lint passed with nine pre-existing unused-disable warnings; production build passed using CI placeholders (unavailable local MongoDB and unset source URLs exercised existing fallbacks). Astra found no blocking issues after the test clock correction. Strict OpenSpec validation passed. PR scope is web only; production deployment remains a separate action.
