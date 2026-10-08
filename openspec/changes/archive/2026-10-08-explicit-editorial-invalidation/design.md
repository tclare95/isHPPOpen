## Context

The homepage caches its events/banner snapshot for six hours with `home-snapshot`, `events`, and `site-banner` tags. Successful event POST/DELETE and banner POST handlers already call one shared invalidation helper. Its deprecated single-argument call implied immediate expiration.

## Goals / Non-Goals

Preserve first-read freshness after successful editorial writes and normal cache reuse between writes. Keep failed or rejected writes from invalidating content. No framework migration, new cache abstraction, operational cadence changes, or deployment is needed.

## Decisions

Use native `revalidateTag(tag, { expire: 0 })` in the existing helper. This explicitly preserves immediate expiration in Route Handlers. The `max` profile would serve stale content on the first read, and `updateTag` is restricted to Server Actions. See the [Next.js revalidateTag reference](https://nextjs.org/docs/app/api-reference/functions/revalidateTag).

Keep per-tag error isolation: persistence has already succeeded, so an invalidation failure must be logged without causing a misleading failed-write response or preventing later tags from being attempted.

Test the production homepage and write handlers against the installed Next.js in-memory IncrementalCache and request-completion revalidation pipeline. Persistence, session, NextResponse (shared Jest setup), and the client component are mocked. This is a data-cache boundary integration check, not a full HTTP/server rendering test. A deterministic Date.now clock advances between warming and invalidating because Next compares entry and tag timestamps strictly. Unique cache key prefixes isolate test entries; disk flushing is disabled.

## Risks / Trade-offs

The regression harness imports private Next.js request/cache internals. Check these imports when upgrading Next.js; no private framework API is introduced into production code. The existing unstable_cache primitive remains suitable for this snapshot, so defer a Cache Components migration until application requirements justify it.

## Migration Plan

No data migration or deployment ordering is required. Prepare an unmerged web PR with lint, Jest, build, and Astra review evidence.
