# HPP River Tracer consumer

Implemented locally on 6 November 2026 for [isHPPOpen #114](https://github.com/tclare95/isHPPOpen/issues/114)
and [OpenSpec #115](https://github.com/tclare95/isHPPOpen/pull/115). Reviewed the producer's
[River Tracer #47](https://github.com/tclare95/river-data-platform/issues/47),
[consumer roadmap PR #65](https://github.com/tclare95/river-data-platform/pull/65) and
[`RIVER-TRACER.md`](https://github.com/tclare95/river-data-platform/blob/main/docs/RIVER-TRACER.md).
The owner confirmed on 6 November 2026 that licensing is sorted and explicitly
requested this on live isHPPOpen. This supersedes the initial fixture-only public
gate. Original RDP licence metadata is preserved verbatim; no producer change is
made here. CSO membership-source replacement remains outside this slice.

## What works

Only isHPPOpen changes. RDP remains a normal, location-neutral producer: there is
no HPP-specific RDP endpoint, network algorithm, release or infrastructure change.

- `createRdpClient().locateRiver(point)` calls existing `GET /v1/river/locate`.
- `getRiverTrace(location, direction, geometry)` constructs the existing
  release-scoped sample route from validated IDs. It never follows an upstream URL.
- Both reuse the existing Vercel OIDC → STS → SigV4 transport, region/role/host/stage
  checks, credential cache, redirect rejection, timeout and bounded retry policy.
  Measurement reads keep their current envelope validation and behavior.
- Server-only `getHppRiverContext()` supplies the fixed HPP anchor, checks its
  reviewed release/reach/sample and basin version, and preserves locate confidence,
  distance, canonical sample displacement, source/version/attribution/licence,
  summaries, completeness/termination/reasons, and qualified catchment evidence.
- Ambiguous, unmatched and out-of-coverage locations return their explicit status
  with `trace: null`. Changed identities, absent samples or unsupported responses
  fail closed. A retired release triggers at most one fresh locate, never an
  automatic acceptance of an unreviewed release.
- River bodies are limited to **3 MiB decoded**, including streamed/gzipped bodies,
  before parsing. An HTTP 413 or local size limit retries that same sample once
  with `geometry=none`. The consumer then returns no features, preserving text and
  catchment metadata. RDP's `none` mode can still include a catchment polygon on the
  wire: an oversized summary also fails safely, without raising the limit.

The existing `/waterquality` map has an optional upstream/downstream selector,
blue river lines and a purple source-catchment layer, with text summaries,
tributaries, completeness and attribution alongside it. It starts off and fetches
only on demand, without new polling or automatic request retries. A River Tracer
failure leaves the existing CSO markers, filters, charts, calculations and alerts
independent. The legacy membership source is unchanged.

## Anchor evidence

The consumer point is **longitude -1.094674, latitude 52.944867**, a vertex on the
mapped River Trent reach near HPP. It is separate from the CSO map centre
`[latitude 52.9458, longitude -1.0907]` and the scraper's legacy NWSC/Sewage Map
lookup coordinate `[-1.0948257285275267, 52.944976358291115]` (longitude first).
The new point lies about 16 m from the latter; that lookup is not changed.

Offline verification used the existing local `orn-v2-gb-packs` release and RDP's
unmodified `RiverApiService.LocateAsync` and `river-api-local` upstream/downstream
handlers. No AWS, Sewage Map lookup, download or live credential was used.

| Evidence | Verified result |
| --- | --- |
| Release version | `838c7ed826b26ee16a11ba2b5be9dc4d286bca8cc0159c6f33d540bf04c0155c` |
| Basin network version | `3d3ceee25d1282f8854865d9d52b5917c5dc49a70b7477a7779ba02088e39075` |
| Locate | `Matched`, `SingleReachWithinMargin`, River Trent reach `23210`, candidate distance 0 m, basin `80` |
| Canonical route sample | `227995`, position `[-1.093826, 52.945248]`, 71 m downstream snap |
| Upstream | Complete to source; 4,026 reaches, 4,011,195 m total network length |
| Downstream | Complete to tidal outlet; 93 reaches, 148,698 m; Trent → Humber → sea |
| Catchment | Published sample `227994`, 7,481.745 km², pour point another 100.1 m downstream of the route sample |
| Summary wire sizes | Upstream 105,893 bytes decoded; downstream 3,992 bytes |
| Full upstream geometry | 2,117,905 bytes decoded; 4,028 features including query point/catchment |

The **71 m route snap** and **100.1 m catchment displacement** are different
evidence, not an exact boundary at the site. Coordinate conversion is the source's
approximately 5 m Helmert transform. This establishes an offline network anchor,
not signed production caller access or an operational membership decision.
Pins live only in `libs/services/hppRiverService.js`; a changed release requires
rechecking locate and both directions before updating them.

## Consumer interface

The isHPPOpen Route Handler is `GET /api/waterquality/river` with only
`direction=upstream|downstream` (default upstream) and
`geometry=reaches|none` (default reaches). Unknown/duplicate parameters are 400;
coordinates, paths, release IDs and arbitrary URLs cannot be supplied. It uses
the existing `{ ok, data }` / `{ ok: false, error: { message } }` conventions.
Successful live results have a 24-hour CDN cache, with an hour of stale-while-
revalidate; unmatched results cache for 60 seconds. Stage/deployment origins keep
these caches separate. Errors and fixtures use `private, no-store`. Service errors
become a fixed 503 message; unexpected errors use the existing redacting mapper.
Only fixed RDP failure codes are logged. Each source read retains the existing
30-second timeout and at most two transport attempts; the handler's 180-second
ceiling accommodates the bounded locate/re-locate and geometry-fallback sequence.

On Vercel this uses the existing stage-separated RDP settings: Preview can only
use staging, Production can only use production. No environment variable or
project setting needs changing. Local fixtures cannot override Vercel live reads.
Unconfigured local access returns 404. Local fixture mode requires:

```powershell
$env:HPP_RIVER_FIXTURES = "1"
npm run dev
Invoke-RestMethod 'http://localhost:3000/api/waterquality/river?direction=upstream&geometry=none'
Invoke-RestMethod 'http://localhost:3000/api/waterquality/river?direction=downstream'
```

Fixtures require no AWS configuration. Results say `source: "fixture"`.
`libs/rdp/fixtures/hpp-river.json` retains the offline locate and abbreviated,
attributed metadata; its geometry is **synthetic**, not a usable HPP river map.
Full local releases, cached outputs and the temporary evidence runner remain
ignored under `.history-fixtures/`; none is included in the change.

## Verification and remaining gates

- Fixture-backed tests cover parsing, missing/ambiguous matches, partial routes,
  absent/displaced catchments, mixed-release rejection, changed anchor pins,
  streamed size limits, summary fallback, retired releases and safe errors.
- Mocked federation tests exercise both river directions against Preview/staging
  and Production/production, retaining the existing cross-stage negative tests.
- Route tests exercise actual local fixtures, bounded input, no-AWS behavior,
  live-stage selection, fixture isolation and error redaction. The full web test suite and lint are
  run for this change; RDP is read-only and its code is unmodified.
- The new parser was also checked against both complete, untrimmed offline
  summary responses, including the upstream catchment polygon on the wire.
- A real local Next.js HTTP smoke returned
  200 for upstream summary-only and downstream fixtures, and 400 for an arbitrary
  coordinate parameter. No RDP/AWS call was made by that fixture endpoint.

No AWS/IAM permission, producer deployment, Vercel project setting or operational
source-mode change is included. CSO membership/parity, source replacement and
dynamic spill overlays remain separate work; connectivity is not pollution or safety.

## Production caller and release evidence — 6 November 2026

The production-target candidate `dpl_Hr5M7g4xdLgVzeqaX3fe7npchHGr`, runtime code
commit `897d0c952bb7ac2edab9af97647afa3ebc293c2f`, built successfully using the
existing Production configuration, without moving `ishppopen.co.uk`.
Requests through its Next.js handler used the normal **production** Vercel
OIDC/SigV4 caller and returned `source: river-data-platform`, not fixtures:

| Request | Verified result |
| --- | --- |
| Upstream, `geometry=none` | HTTP 200, reviewed release/Trent match, complete 4,026-reach summary and published catchment evidence, no returned features |
| Upstream, full geometry | HTTP 200, 4,028 features, 2,116,121-byte consumer response, complete to source |
| Downstream, full geometry | HTTP 200, 94 features, 42,719-byte consumer response, complete 148,698 m route to tidal outlet |

The browser displayed upstream network/catchment geometry and the existing CSO
markers together, plus the catchment displacement, named rivers and source
details. Switching downstream displayed Trent → Humber → sea. The narrow mobile
layout remained usable. This proves function-runtime production federation,
not just a build token or a fixture match.

All **702 tests in 67 suites** passed locally. Lint passed with nine existing
unused-disable warnings. The required GitHub `Web checks` run
[`42278201493`](https://github.com/tclare95/isHPPOpen/actions/runs/42278201493)
passed lint, tests and the production build. Live release is tracked in
[PR #116](https://github.com/tclare95/isHPPOpen/pull/116), through protected main
and the existing Vercel Git integration. Raw local response bodies stay ignored;
only this bounded evidence is versioned.
