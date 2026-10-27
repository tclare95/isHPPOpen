# RDP client foundation (#51-A)

Implements only section A of [unify-gauge-consumers](../openspec/changes/unify-gauge-consumers/tasks.md).
The consumer is this Next.js server; the producer is RDP's .NET read Lambda,
reading its own canonical DynamoDB/S3 contract. The scraper, predictor and RDP
repositories are unchanged. No route, dashboard, observed-level reader or alert
evaluator imports this client. All deployed source modes must remain `legacy`.

## Server boundary and configuration

`libs/rdp/client.js` exposes `listMeasurements()`, `getLatest(canonicalIds)`,
`getHealth(canonicalId)` and `getObservations(canonicalId, {from,to,limit,cursor})`.
History returns one page with unchanged opaque continuation/coverage metadata;
bounded multi-page dashboard adaptation belongs to B. No public proxy is added.
Every RDP module uses `server-only`; callers must be trusted Node server code.
Do not serialize returned internal envelopes or errors directly to browsers.

Vercel's request-context OIDC helper is called lazily when credentials are needed.
The explicit STS `AssumeRoleWithWebIdentity` command requests a 900-second session;
credentials stay in the client closure and refresh within 60 seconds of expiry.
No static-key or default AWS credential chain is used. The Smithy signer uses
service `execute-api`, fixed region `eu-west-1` and the session token. STS makes
one attempt, with 3s connection/5s request limits. Each API operation has a 30s
total budget including token retrieval, STS, response body and retry delay.
At most two signed GET attempts are made: network, 429 and transient 5xx errors
may retry with 200–399ms jitter and Retry-After clamped to 2s. Authentication,
403, validation, cursor and archive-integrity failures do not retry. Redirects
are refused. Responses use `no-store`; the existing 900s public cache boundary
is untouched and remains the responsibility of B/C/D.

Errors retain only fixed `RdpError.code`, numeric status and a fixed message.
Underlying bodies, SDK errors, tokens, keys, signed headers, endpoint and cursor
are neither logged nor attached as causes. Distinguishable codes include
`AUTHENTICATION_FAILED`, `AUTHORIZATION_FAILED`, `THROTTLED`, `TIMEOUT`,
`MEASUREMENT_NOT_FOUND`, `INVALID_CURSOR`, `CURSOR_EXPIRED`, `CURSOR_STALE`,
`ARCHIVE_INTEGRITY`, `STORAGE_UNAVAILABLE` and `RESPONSE_CONTRACT_ERROR`.
An empty/stale/partial successful result remains successful with its original
availability/freshness; this layer neither substitutes data nor infers coverage.

Configure only server-side variables, scoped to the appropriate Vercel target:

| Setting | Preview | Production (future approval required) |
| --- | --- | --- |
| `VERCEL_ENV` | Vercel-managed `preview` | Vercel-managed `production` |
| `RDP_AWS_REGION` | `eu-west-1` | `eu-west-1` |
| `RDP_API_URL` | `https://jfwpvzs8ig.execute-api.eu-west-1.amazonaws.com/staging` | Separately provisioned exact HTTPS execute-api origin with `/production`; staging API ID rejected |
| `RDP_ROLE_ARN` | `arn:aws:iam::080812383734:role/river-data-platform-staging-vercel-preview` | `arn:aws:iam::080812383734:role/river-data-platform-production-vercel-production` (not provisioned here) |
| `RDP_TRENT_SOURCE` | `legacy` | `legacy` |
| `RDP_LEVELS_SOURCE` | `legacy` | `legacy` |
| `RDP_GAUGE_ALERTS_SOURCE` | `legacy` | `legacy` |

`getRdpSourceModes()` independently validates `legacy|shadow|rdp`; absence means
`legacy`, while empty/invalid values fail. It requires no RDP credentials, so
legacy builds can run without any new settings. The helper does not activate a
consumer in A. `getRdpConfig()` rejects missing/development environments, a wrong
account/role, wrong stage/region/API, alternate hosts, query/fragment/userinfo,
ports and trailing paths before any credential/network request. No `NEXT_PUBLIC_`
settings, client flags, admin endpoints or generic AWS_REGION defaults exist.

The existing AWS caller trust pins team issuer
`https://oidc.vercel.com/tclare95s-projects`, audience
`https://vercel.com/tclare95s-projects`, subject
`owner:tclare95s-projects:project:is-hpp-open:environment:preview`.
AWS verifies the token; local environment validation does not replace IAM.
The caller permits only the four staging GET routes with an explicit deny
outside them. Production needs its separate exact trust and invoke policy.

## Six canonical aliases

| Public alias | Canonical ID | Exact EA provider measure | Unit / datum |
| --- | --- | --- | --- |
| `4009-level` | `ea-colwick-level` | `4009-level-stage-i-15_min-mASD` | mASD / ASD |
| `4126-level` | `ea-clifton-bridge-level` | `4126-level-stage-i-15_min-mASD` | mASD / ASD |
| `4007-level` | `ea-shardlow-level` | `4007-level-stage-i-15_min-mASD` | mASD / ASD |
| `4067-level` | `ea-church-wilne-level` | `4067-level-stage-i-15_min-mASD` | mASD / ASD |
| `4074-level` | `ea-kegworth-level` | `4074-level-stage-i-15_min-mASD` | mASD / ASD |
| `4007-flow` | `ea-shardlow-flow` | `4007-flow--i-15_min-m3_s` | m3/s / unknown |

All expect a 900-second interval and Environment Agency source. The three
existing mappings follow the RDP registry. The three reserved #52 IDs follow
the merged design; read-only public EA metadata verified exact station,
`level`, `Stage`, 900-second period and `mASD` on 24 October 2026:
[Clifton Bridge](https://environment.data.gov.uk/flood-monitoring/id/measures/4126-level-stage-i-15_min-mASD),
[Church Wilne](https://environment.data.gov.uk/flood-monitoring/id/measures/4067-level-stage-i-15_min-mASD),
[Kegworth](https://environment.data.gov.uk/flood-monitoring/id/measures/4074-level-stage-i-15_min-mASD).
These IDs are not yet published by staging. `assertRdpCatalogueMeasurement()`
requires one matching catalogue entry, provider/source, station, parameter,
unit/datum and interval; missing or mismatched entries fail visibly. History
also validates the exact provider measure, source, unit and datum. Latest
validates IDs/order/units/availability/freshness and finite available readings.
Backend publication/metadata verification under #52 remains a cutover gate.

## Separately approved genuine Preview federation check

The normal build and CI never run the live command. No public smoke route or
backend change is needed. A one-off **Preview build** can run:

```sh
npm run rdp:preview-smoke && npm run build
```

The script refuses non-Vercel/Production/Development and any non-legacy source
mode. It uses this exact client and the genuine Preview build token, validates
the three published aliases, then reads registry, latest(3), Colwick health and
one seven-day Colwick history page (limit 2, no continuation). Maximum eight
HTTP requests including retries; each credential exchange is a single STS
attempt. Normally four HTTP requests and one STS exchange. It logs only fixed check
results, deployment/commit identity, measurement IDs, availability/freshness,
row count and legacy modes. It never prints tokens, signed headers, cursors,
raw observations, internal URLs or SDK errors. This proves build-context Preview
federation; function-runtime federation remains a later consumer integration
check and must not be claimed from build evidence alone.

Approval scope, to be reviewed against the PR commit before execution:

1. On `tclare95s-projects/is-hpp-open`, supply the six Preview values above as
   deployment-only build environment overrides for `feat/rdp-client-51a`.
   No project-level environment edit is needed. Read-only inspection on
   24 October found no RDP variable entries and no explicit `oidcTokenConfig`.
   Do not infer the effective issuer from an absent setting. Changing that
   project setting, if needed, requires another explicit approval because it
   can affect other deployments.
2. Create one Preview deployment of the reviewed PR commit, overriding its build
   command for this deployment only. Keep deployment protection and all legacy
   database/auth/email settings unchanged. Do not promote or merge it.
3. Capture deployment ID, SHA, Preview target, READY result and the redacted smoke
   report. A local Development token or GitHub-assumed session cannot count as
   positive Preview evidence. Fixture tests prove client isolation; backend
   [staging evidence](https://github.com/tclare95/river-data-platform/blob/main/docs/READ-API-DEPLOYMENT.md)
   separately records real Development-token denial and cross-stage IAM denial.
4. Remove the ignored local deployment override file after success or failure;
   no project settings need restoration. Retained deployment settings/issued
   STS sessions persist until deletion/expiry (sessions at most 15 minutes).
   Deleting the one smoke Preview after saving evidence can be approved in
   the same bounded action; no other deployment may be deleted.

No AWS/IAM change, RDP release, source collection, production Vercel setting,
production deployment, route/alert cutover or email is included. Enabling OIDC
or changing its issuer, if inspection finds it necessary, must be separately
approved. Source-mode rollback is a reviewed environment change plus redeploy;
later B/C/D activation must account for the existing 900s cache propagation.

## Evidence

Fixture tests use the #69 wire shapes with synthetic values, including negative
levels, mixed latest outcomes, independent health and unknown coverage. They
exercise actual Smithy signing, mocked STS/token exchange, renewal, 403/429/5xx,
timeouts, bad inputs, cursor/integrity errors, metadata mismatch and Preview/prod
isolation without credentials. The real server-only package rejects a client
import. Production configuration success uses a fictional API ID only.

Live Preview federation: **pending separate configuration/deployment approval**.
No claim of live six-series readiness, shadow parity, runtime federation,
production readiness or consumer rollback is made by slice A.

Local verification on 24 October 2026: 75 RDP fixture/security checks and the
full 44-suite / 252-test Jest run passed; ESLint passed with nine existing unused
disable warnings. The Next.js production build passed using CI dummy local
Mongo/auth settings, with expected missing legacy-source/local Mongo fallback
diagnostics. It needed execution outside the restricted sandbox after the first
Turbopack attempt stalled. Route output still shows 15m levels/HPP/Trent caches.
The live command's local invocation refused with `PREVIEW_SMOKE_ONLY` before
credentials/network. No RDP configuration or deployment was changed locally.
