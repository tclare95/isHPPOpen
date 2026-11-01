# River Data Platform — current coding-agent and release handoff

**Reviewed 1 November 2026.** The canonical product backlog and priority order are [isHPPOpen #57](https://github.com/tclare95/isHPPOpen/issues/57); [legacy-writer dependency map](LEGACY_SCRAPER_RETIREMENT.md) is the source of truth for retirement dependencies. This is an execution handoff, **not another issue registry**. For approved deployment commands and live-state evidence use RDP's [production](https://github.com/tclare95/river-data-platform/blob/main/docs/PRODUCTION.md) and [production read API](https://github.com/tclare95/river-data-platform/blob/main/docs/PRODUCTION-READ-API.md) runbooks, not historic prompts.

## Verified baseline versus incomplete gates

| Capability | Verified delivery | Outstanding / not implied |
| --- | --- | --- |
| Platform foundation [#64](https://github.com/tclare95/isHPPOpen/issues/64), ingestion [#49](https://github.com/tclare95/isHPPOpen/issues/49), archival [#65](https://github.com/tclare95/isHPPOpen/issues/65) | .NET 10 platform, configured EA ingestion, verified archive-first S3, 365-day hot query contract. RDP [#1](https://github.com/tclare95/river-data-platform/pull/1), [#2](https://github.com/tclare95/river-data-platform/pull/2), [#3](https://github.com/tclare95/river-data-platform/pull/3). | Foundation code is **not** authorisation for future domain modules or arbitrary data writes. |
| Lightweight stage [#75](https://github.com/tclare95/isHPPOpen/issues/75) | Approved tiny stage smoke completed; left collection disabled. [Evidence](https://github.com/tclare95/river-data-platform/blob/main/docs/INTEGRATION-75.md). | No always-on staging mirror or automatic staging jobs. |
| Production [#81](https://github.com/tclare95/isHPPOpen/issues/81) | P1–P4 deployed: three EA measures, 15-minute EventBridge collection, monitoring, versioned S3 and Dynamo. First review recorded **82/82** scheduled runs and recovered EA timeouts. Production recovery code merged [#25](https://github.com/tclare95/river-data-platform/pull/25). | **P5** six-measure expansion not approved; **P6** read API not deployed; **D7** Dynamo TTL disabled. Seven-day cost review due **on or after 7 Nov 2026** before P5. |
| Read API [#69](https://github.com/tclare95/isHPPOpen/issues/69) | Four private AWS_IAM GET routes implemented [#10](https://github.com/tclare95/river-data-platform/pull/10), staging signed-smoke verified [#16](https://github.com/tclare95/river-data-platform/pull/16); production deploy tooling merged [#26](https://github.com/tclare95/river-data-platform/pull/26). | Production P6 exact-ID IAM allocation/activation, caller setup and signed smoke require separately authorised releases; website federation is not yet proven live. |
| Six EA series [#52](https://github.com/tclare95/isHPPOpen/issues/52) | All six registered with stable identities and fixture/onboarding tests [RDP #18](https://github.com/tclare95/river-data-platform/pull/18). | Production still **selects three**; selection is independent from registration/publication. P5 requires operational review and approval. |
| Website [#51](https://github.com/tclare95/isHPPOpen/issues/51) | Server-only client and Trent/Colwick read modes merged [#80](https://github.com/tclare95/isHPPOpen/pull/80), [#84](https://github.com/tclare95/isHPPOpen/pull/84), [#85](https://github.com/tclare95/isHPPOpen/pull/85). | Source modes remain **legacy** according to recorded evidence; live shadow/activation and alert-safe Slice D not complete. [#47](https://github.com/tclare95/isHPPOpen/issues/47) reliability first. |

**Interpret the above as recorded repo/issue evidence, not a fresh read of current AWS/Vercel resources.** Do not mark an API, consumer or job live based on a merged code or documentation PR alone.

## Product milestones and execution priority

1. **RDP serves isHPPOpen gauge data:** separately authorise/verify P6 production API; complete P5 cost/health gate and six-measure selection; capture Trent and Colwick shadow evidence, then independently approve and roll out each read mode. Keep gauge alerts on legacy until [#47](https://github.com/tclare95/isHPPOpen/issues/47) reliability + [#51](https://github.com/tclare95/isHPPOpen/issues/51) Slice D are verified.
2. **Replace Node collection responsibilities:** implement [#71](https://github.com/tclare95/isHPPOpen/issues/71) CSO catalogue/selection, then [#72](https://github.com/tclare95/isHPPOpen/issues/72) source evidence, stable spill events/revisions and tiered CSO history in RDP. In parallel, implement independent [#89](https://github.com/tclare95/isHPPOpen/issues/89) HPP status/transition service (not an RDP HPP writer), fixing [#63](https://github.com/tclare95/isHPPOpen/issues/63) historical carry-in. Later site assessment evidence and a separate public snapshot compatibility publisher follow [#68](https://github.com/tclare95/isHPPOpen/issues/68)/[#90](https://github.com/tclare95/isHPPOpen/issues/90).
3. **Retire the legacy Node writer/scheduler last:** individually prove replacement readers, historical continuity, source ownership, alert parity, archive/SQS safety and rollback. Preserve public `levels/latest.json` and existing forecast/data contracts. [#68](https://github.com/tclare95/isHPPOpen/issues/68) holds the writer/consumer dependency matrix.

## Small, independent coding-agent assignments

| Order | Agent outcome | Boundary |
| --- | --- | --- |
| A — now | [#71](https://github.com/tclare95/isHPPOpen/issues/71) read-only provider catalogue/validated named selection planner; then versioned S3 last-good snapshot and separately gated refresh. | RDP only; no status/event polling from mere discovery; no new general-purpose framework. |
| B — now | [#63](https://github.com/tclare95/isHPPOpen/issues/63) closure carry-in fix, followed by [#89](https://github.com/tclare95/isHPPOpen/issues/89) pure HPP threshold/transition semantics and safe state/freshness tests. | HPP owns decisions outside RDP; no new event writer, service credentials or emails in first PR. |
| C — now | [#47](https://github.com/tclare95/isHPPOpen/issues/47) reliability-only Vercel alert evaluation, then [#51](https://github.com/tclare95/isHPPOpen/issues/51) non-mutating RDP gauge alert shadow after separate review. | No 5-minute cadence change, source switch, subscriber reset or notifications from shadow. |
| D — after #71 selection interface | [#72](https://github.com/tclare95/isHPPOpen/issues/72) provider claims/current status, then event identity/revisions, then 24-calendar-month CSO hot plus verified S3 history/internal reads. | Separate CSO model/store from scalar observations; no legacy producer replacement in first slice. Review [spec PR #93](https://github.com/tclare95/isHPPOpen/pull/93) first. |
| E — parallel if capacity | [#50](https://github.com/tclare95/isHPPOpen/issues/50) read-only Colwick historical source inventory/dry-run, conflicts and gaps. | No canonical writes or cursor/health/latest changes; importer is a separate approved stage. |

**Coordination:** agent branches/worktrees must not concurrently edit shared RDP `template.yaml`, deployment IAM or composition files without an agreed owner. Prefer fixture/unit coverage and bounded PRs with issue/acceptance links. Product requirements belong in OpenSpec capability specs; implementation details and alternatives in design/agent PRs. Avoid inventing locks, queues, tables, extra services or exact algorithms unless required by actual correctness/security contracts.

## Explicitly later

[#53](https://github.com/tclare95/isHPPOpen/issues/53) predictor observation input is **investigation only**: its currently independent Python model uses rainfall inputs not yet collected by RDP; retain official EA fallback and verify incident-time freshness before any switch. Full historical import [#50](https://github.com/tclare95/isHPPOpen/issues/50) is not a prerequisite to verified recent-data web shadow. Public RDP API [#78](https://github.com/tclare95/isHPPOpen/issues/78) and playground [#77](https://github.com/tclare95/isHPPOpen/issues/77) do not block legacy retirement.

Future bounded backlog under [#68](https://github.com/tclare95/isHPPOpen/issues/68): `water-quality-site-assessments`, `cso-web-consumer-migration`, `legacy-river-snapshot-publication` and final `retire-legacy-scraper-writers`. Create their own product-first specifications only when their dependencies are ready.

## Release safety

- Merges and CI **never** approve AWS, Vercel, Atlas, provider data-source, scheduling, alert or production writes. Each production action requires its own explicit owner approval, narrow scope, prepare/review/apply and recorded rollback/evidence.
- P6 API activation and P5 measure expansion are **operator/release** work, not new coding-agent prerequisites to developing CSO/HPP modules.
- The 7 November review is a **not-before** condition for P5, not an automatic activation date.
- Stage remains tiny and off by default; distinct prod/stage IAM and storage; no full historical replica. Gauge archive-first integrity and CSO-specific 24-month completed-event hot retention must not be conflated.
- Keep the legacy Node main schedule enabled until all of its mixed duties have independently proven replacements. Never run competing authoritative event/public S3 writers or send replay notifications during cutover.
