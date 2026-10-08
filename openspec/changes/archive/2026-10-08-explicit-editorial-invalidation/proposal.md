## Why

Issue #55 identified deprecated single-argument `revalidateTag` calls and missing cache-boundary regression coverage. Admin edits must remain visible on the first subsequent homepage read.

## What Changes

- Use explicit immediate expiration in the existing shared invalidation helper.
- Verify cache reuse and freshness after event updates, deletions, and banner updates using Next's real data cache.
- Cover rejected writes and per-tag invalidation failure isolation.
- Retain the six-hour `unstable_cache` homepage snapshot. A Cache Components migration is unnecessary for this fix and can be considered when a feature requires it.

## Capabilities

### New Capabilities
- `editorial-cache`: Cached homepage editorial content and write-triggered immediate expiration.

### Modified Capabilities
None.

## Impact

Web app only: shared invalidation helper, regression tests, and architecture documentation. No data contracts, dependencies, operational refresh cadences, deployments, or other repositories change.
