# Proposal: Authenticated observation read API

## Why

The **observation module of the shared** `river-data-platform` backend needs a stable read interface before the Next.js application can stop fetching Environment Agency gauges directly. Putting database and S3 query logic into Vercel would duplicate persistence decisions and force web and backend changes to deploy together. The existing `/api/trentweirs`, `/api/levels`, alerts, HPP status and predictor output have different contracts and must not be rewritten as a side effect.

## Accepted owner decisions (8 October 2026)

1. **Runtime and topology:** a separate, read-only .NET 10 Lambda in the *same shared* `river-data-platform` repository, sharing domain and query adapters with (but independent from) the scheduled collector. AWS API Gateway **HTTP API** exposes explicit versioned GET routes.
2. **Auth:** server-side Next.js/Vercel obtains short-lived AWS credentials via **Vercel OIDC + AWS STS AssumeRoleWithWebIdentity**; signs requests with SigV4; API Gateway `AWS_IAM` authorisation. No static AWS credentials, API key, browser calls or anonymous access.
3. **Storage abstraction:** one history route joins DynamoDB's rolling **365-day full-resolution** store and indefinite S3 Standard archives via direct GetObject, with paging and a stable request boundary.
4. **Audience:** first-party **server-to-server** only. Existing public Next.js API routes remain the UI-facing contract.
5. **Historic gaps:** return **available verified observations** with explicit known-uncollected/unrecoverable/unknown coverage intervals. Do not mistake a legitimate missing source reading for storage failure. Missing, inaccessible or corrupt **expected archive objects/manifests** cause an error, not a successful-looking partial response.
6. **Web migration order is separate:** Trent dashboard first, observed levels second, gauge alerts third. HPP transition events, forecasts, CSO, water quality and alert send/idempotency remain in their existing systems.

## What changes

- A small versioned read-only HTTP API: measurement registry; batch latest; one bounded historical series; per-measurement collection health.
- Per-stage API Gateway/STS IAM trust, invoke permissions, isolated read-only Lambda execution role, request validation, structured errors and metrics.
- UTC/key-safe measurement identifiers, bounded month/key queries, S3 manifest-driven history, correction resolution, opaque cursor and explicit coverage metadata.
- OpenAPI/JSON contract examples and fixture-driven validation, including bad-input/security/failure cases.

## Capabilities

### New
- `observation-read-api`: authenticated first-party retrieval of measurement metadata, latest, historical raw observations and health.

## Impact

**Implementation:** new `tclare95/river-data-platform` backend; **planning:** `tclare95/isHPPOpen`. Tracking [#69](https://github.com/tclare95/isHPPOpen/issues/69). Depends on [#64](https://github.com/tclare95/isHPPOpen/issues/64), [#49](https://github.com/tclare95/isHPPOpen/issues/49), [#65](https://github.com/tclare95/isHPPOpen/issues/65) and accepted [ADR-001](../../../docs/decisions/0001-observation-storage.md).

## Non-goals

No implementation in this documentation change. No changes to old Node Lambdas, new provider ingestion, source backfill, S3 compaction design, raw archive writes, Dynamo TTL policies, web service adapters, public route responses, HPP/CSO/forecast/alert logic, third-party API, user-login system, Athena or GraphQL. Next.js OIDC client, feature flags, shadow reads and cutover belong to [#51](https://github.com/tclare95/isHPPOpen/issues/51).

## Release and rollback

This is **architecture/specification only**, with no AWS operations. Future backend implementation is tested in CI without credentials, then stage-tested only after separately approved manual prepare/apply. An API version may be deployed without routing web traffic to it. Production invoke roles and web migration require separate approval. Rollback disables web read preference or read API exposure without stopping the old scraper or deleting canonical observations.
