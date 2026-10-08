# Design: Read-only .NET observation API

## Service boundary

A dedicated `RiverDataPlatform.ReadApi` AWS Lambda hosts a small HTTP API behind **API Gateway HTTP API** in the approved AWS account/region (first target eu-west-1). Its read services/interfaces live alongside the collector in the new repository and reuse stable source/station/measurement contracts and Dynamo/S3 adapters. The read Lambda has its **own execution role** and cannot write observations, update latest pointers, publish archives, enable TTL or mutate the collection registry. API Gateway has explicit GET routes only, **AWS_IAM on every route**, no unauthenticated `$default`/`ANY` proxy, no browser CORS use case.

No arbitrary S3 key, Dynamo partition key, provider URL, SQL/PartiQL, expression or IAM role is accepted from callers. All IDs resolve through the published measurement registry. Existing app-specific aliases such as `4009-level` are mapped in the web adapter; they are not assumed to be canonical EA measure IDs.

## Server-to-server authentication

- Vercel project/workload exchanges its OIDC token via `AssumeRoleWithWebIdentity` and signs HTTP API invocation requests with **SigV4**. Document use of `@vercel/oidc-aws-credentials-provider` and AWS SDK/Smithy signing in the *separate* web adapter (#51); this backend change owns API Gateway IAM config, trust-policy example, endpoint contract and negative tests, not production Vercel settings.
- AWS trust `sub` and `aud` conditions must be **project- and environment-specific**, pinned to the exact issuer mode. Separate production and preview roles: Preview invokes **stage only**, Production invokes **production only**. Pin the target AWS API region explicitly; Vercel's default `AWS_REGION` may reflect the function region, not the backend region.
- Caller IAM grants `execute-api:Invoke` only to the exact GET method/resource ARNs on the appropriate stage. The Lambda execution role grants only `dynamodb:GetItem`/`Query` (plus precise required metadata reads), `s3:GetObject`/`GetObjectVersion` for canonical archive/manifests and required logs; no `Scan`, `ListBucket` by default, no writes, no cross-stage access. If a manifest access pattern really needs listing, revise the IaC permission boundary explicitly rather than granting it pre-emptively.
- Unsigned, expired/incorrectly signed, wrong-account or cross-stage calls fail **before Lambda invocation**. No static access keys, fallback shared token, raw Vercel OIDC token passthrough to Lambda, or browser-origin access. Log request IDs, never STS/OIDC tokens or signed request headers. Local developer auth uses a separately scoped/test role or mocks; never disables API Gateway auth.

References: [AWS HTTP API IAM](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-access-control-iam.html), [Vercel AWS OIDC guide](https://vercel.com/docs/oidc/aws).

## Routes and representation

| Route | Input | Result |
| --- | --- | --- |
| `GET /v1/measurements` | No arbitrary filters in v1 | Published enabled measurements and their stable IDs, station/provider identifiers, parameter, unit/datum, optional label and expected interval. No credentials or editable config. |
| `GET /v1/measurements/latest?ids={comma-separated-IDs}` | 1–20 unique canonical measurement IDs | One item per requested ID in caller order; per-item `available`, `no_observations` or `unavailable` state, source `observedAt` and explicit `freshness`. Partial failures do not invalidate successful IDs. |
| `GET /v1/measurements/{id}/observations?from=...&to=...&limit=...&cursor=...` | UTC ISO 8601 `from` inclusive / `to` exclusive, both required; one calendar-year-sized window (max 366 days), default 2,000 rows, max 5,000; cursor optional | Full-resolution chronological canonical observations, unit/quality/source provenance as available; coverage and page metadata, opaque next cursor. |
| `GET /v1/measurements/{id}/health` | Known measurement ID | Last attempt, last successful persistence and last source observation; source freshness, ingest lag and independent failure state. |

Responses are internal **`{ data, meta }`** objects (error `{ error: { code, message }, requestId }`); existing public Next.js `{ ok: true, data }` envelopes stay unchanged and their adapters wrap/translate this new contract. Schema fields, examples, error codes and limits are frozen in [api-contract.md](api-contract.md). No chart-specific derived changes or HPP threshold decisions in backend.

### Registry and latest behaviour

- Registry only exposes enabled/published metadata. Unknown IDs return `404`; present but never-observed measures appear in latest as `no_observations` (not numerical zero). Batch fails as `400` for duplicate IDs/over-limit/malformed query, or `404` for an unknown canonical ID; no partial discovery of invalid IDs.
- A valid batch can return `200` with `meta.partial=true` when one or more store reads fail; each error has a safe per-item status and code. If all dependencies are unusable return `503`. `retrievedAt` and `observedAt` are distinct; observation `freshness` is derived from `observedAt` and configured expected interval/policy, never request success alone.
- Observations with unusual upstream quality remain distinguishable; low-quality or stale readings are never silently dropped/converted to zero. No persisted data, no data and stale data are different states.

## Unified historical reads

1. Validate authorised registry ID and UTC span/row+byte limits. Capture `requestAsOf` and the **rolling 365-day cutoff once**, using observedAt, not ingestedAt or Dynamo TTL deletion timing. Persist boundary in subsequent cursor pages.
2. Use measurement-scoped Dynamo `Query` against month keys for the hot side, and committed archive manifest versions + bounded S3 `GetObject` reads for the older side. For mixed windows use both and merge chronologically, prefer the authoritative latest correction for identical (measurementId, observedAt), and do not interpolate source samples.
3. Dynamo results need *internal* pagination through `LastEvaluatedKey`; one Query has a **1 MB** maximum, which is not the API's page boundary. Never `Scan` the table. For compressed S3 JSONL, stream and validate bounded object decompression; do not read the entire permanent archive or list all S3 objects.
4. Pagination uses one **opaque authenticated-encrypted cursor (AEAD with a stage-specific protected server-side key)**, bound to measurement, original `from`/`to`, page-size, stage, cutoff, last emitted timestamp, Dynamo continuation position, and relevant committed archive manifest/object-version references. Expire after **30 minutes**. Never expose raw Dynamo keys, S3 paths or cursor-encryption secrets. The Lambda's stage-specific key is supplied using an approved encrypted environment/secret mechanism, with only the necessary tightly scoped decrypt/read permission. If referenced immutable generations no longer exist, return `409 CURSOR_STALE`. A corrupted/tampered cursor is `400 INVALID_CURSOR`; expired cursor is `409 CURSOR_EXPIRED`. No commitment to a cross-store transaction snapshot; use deterministic no-repeat chronological paging and pinned archive revisions.
5. Start with a **4 MB maximum serialised JSON response** and a bounded ~**20-second application work budget** (tune during normal stage smoke tests). Trim a page early with a cursor if row/byte bounds would be exceeded. API Gateway HTTP API has **10 MB** payload and **30s** integration timeout ceilings, so remain safely below those. No API streaming or async export service.
6. A calendar-year request (including leap day) fits inside the **366-day** request-span limit; older multi-year series are obtained through multiple bounded windows, each paginated. Next.js caching choices are separately specified in #51.

References: [DynamoDB Query pagination](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.Pagination.html), [HTTP API quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html).

## Coverage and integrity: explicit distinctions

**Decision:** historical absence that can legitimately occur is not corruption. Coverage is a declared *source/migration/archive inventory* fact, not computed by assuming exactly 96 readings per day.

- `coverage.status=complete` means the **recorded collection/archive coverage metadata accounts for the requested window**, even when legitimate upstream samples are absent. It does not imply every quarter-hour has a reading and does not claim unread future pages' bytes were just checked.
- `coverage.status=partial` means one or more explicitly documented intervals are `not_collected`, `legacy_unrecoverable` or `source_outage`. Return the available verified observations and an explicit `gaps[]` array for the original requested period.
- `coverage.status=unknown` means sufficient evidence about a part of the period is unavailable. Report `unknown` ranges; **never** label unknown history complete or silently equate absent manifest to “zero observations.”
- **Status precedence over a combined range:** if **any** requested subrange has unknown evidence, the overall status is `unknown` and `gaps[]` still lists any independently known gaps; otherwise use `partial` if known gaps exist, or `complete` if all subranges have declared complete coverage. Coverage descriptors must never hide a known gap because another interval is unknown.
- `meta.pageIntegrity=verified` applies to rows and S3 objects **actually read on this page**, whose checksums/counts and manifest references were checked. A page with no S3 reads may mark its store reads successful without asserting all unread S3 objects are sound.
- If a manifest says an archive object **should exist**, but `GetObject` returns missing/denied/corrupt/checksum mismatch, fail with `503 ARCHIVE_INTEGRITY` (or `STORAGE_UNAVAILABLE` for transient general outages) instead of returning partial success. The client can retry; no fabrication or silent omission.
- Archive generations retained during cursor lifetime must be readable or return `409 CURSOR_STALE` as appropriate. Source corrections remain canonical; no permanent user-visible duplication at the hot/cold boundary.

Implementation must preserve distinctions among no source reading, a known legacy gap, uncertainty about historical coverage, stale-but-valid latest reading, and missing **expected** archive data.

## Errors, failure isolation and observability

| Condition | Response |
| --- | --- |
| Malformed/overlong/naive timestamp or reversed/oversized date range; malformed/duplicate/over-limit IDs | `400 VALIDATION_ERROR` |
| Unknown configured/published measurement ID | `404 MEASUREMENT_NOT_FOUND` |
| Opaque cursor tampered or unrelated to query | `400 INVALID_CURSOR` |
| Cursor expired or archive revision no longer consistent | `409 CURSOR_EXPIRED` / `CURSOR_STALE` |
| Expected archive missing/corrupt/inaccessible | `503 ARCHIVE_INTEGRITY`; no false `200` |
| Dynamo throttling, S3 temporary failure or application work deadline | `503 STORAGE_UNAVAILABLE` or `504 QUERY_TIMEOUT`, safe retry guidance |
| Auth missing/wrong stage or caller lacks IAM | Gateway `403`/denial **before Lambda**; do not attempt internal fallback |
| API Gateway stage throttle | `429` with bounded backoff/retry guidance |
| Unexpected exception | `500 INTERNAL_ERROR` with correlation ID, no AWS key/stack trace leakage |

Public Next.js adapters control their own availability/fallback and current `health` response; the .NET Lambda does **not** fallback to calling EA directly or to legacy Mongo/S3 public snapshots. It fails precisely so the web's rollout flag can select legacy behavior without double reading or double alert sends.

Emit structured requestId, endpoint, measurement count/id (non-sensitive), source tier, rows, page count, result/coverage state, latency, source store error type and downstream throttling. No raw OIDC tokens, credentials, caller query dumps, or logged full S3 objects. Stage/prod separate metrics: 4xx auth/validation, 5xx, throttling, S3 corruption, p95 latency and query cost/bytes. Basic budgets; no separate benchmark/prototype gate.

## Responsibility split and safe rollout

**This change (#69):** .NET read Lambda, its API Gateway/IAM/templates, read-side application services, DTO/OpenAPI contract, storage boundary tests and staged security/smoke checks. **No production AWS apply in the documentation PR** and no modifications to the old Lambdas or to Next.js in its backend implementation PR.

**Follow-on web #51:**
1. A first-party Next.js server-only client uses Vercel OIDC role exchange + SigV4 and maps canonical measure IDs onto existing Trent station/level/flow aliases; performs shadow comparison before switching `/api/trentweirs`.
2. Migrate *observed* level readings to the new adapter, keeping `forecast_data` from existing forecast inputs and preserving `/api/levels` envelope, source/freshness, null/fallback and cached response behaviour.
3. Switch gauge-alert observation reads last, retaining HPP events, CSO, forecast, subscription state, source freshness checks, margin/hysteresis, transition idempotency and email delivery behaviour. A failure must not send alerts from unavailable data.

The web already uses a **30-minute freshness threshold** and 15-minute cache period; preserve initial behaviour, then refine separately if needed. For Trent hour/day deltas, use actual timestamps rather than fixed array offsets once the web adapter is separately approved; preserve existing units/rounding/response keys. Rollout by explicit independently reversible per-consumer flags: old reader remains the fallback until parity signoff. Do not silently switch alert behavior.

**Out of scope:** historic source reconstruction (#50), ingest/archiving code (#49/#65), predictor changes (#53), legacy Node service retirement (#68), or public/third-party API consumers.
