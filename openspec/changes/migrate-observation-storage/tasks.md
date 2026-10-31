# Tasks and acceptance: Historical gauge reconstruction (#50)

Documentation-only plan. **All implementation tasks remain unchecked.** Product behaviour is in [spec.md](specs/historical-observation-backfill/spec.md); architecture and current RDP capabilities are in [design.md](design.md). The acceptance cases below are fixture/mock tests until separately approved source access or staging evidence is available.

## Slice A — inventory / normalisation / dry-run (no canonical writes)

- [ ] A.1 Inventory legacy Mongo `ishppopen.riverschemas` and timestamped S3 `levels/` snapshots using bounded read-only access; collect source locator/version/hash, wrapper time, native observed times, candidate counts and access gaps. Include readily accessible versions when materially useful; do not assume access has been granted or data inspected.
- [ ] A.2 Inspect supported EA historic measure readings, daily flood-monitoring archives and hydrology contracts; document actual access/coverage limits. Inventory official history availability for all six registered series, **but mark only Colwick import-eligible initially**.
- [ ] A.3 Resolve station alias `2102` (RLOI) ↔ `4009` (EA station), then separately validate government-page *observed measurement* identity, unit/datum and semantics. Quarantine unsupported rows; exclude forecast series.
- [ ] A.4 Normalise UTC timestamps and decimals, retain individual source-evidence uncertainty, deduplicate per canonical key and apply documented source precedence. Allow verified-identity cached-only readings as the lowest-confidence gap fill.
- [ ] A.5 Produce deterministic read-only review report: eligible, duplicate, already-canonical, conflicting, invalid, quarantined, unavailable, candidate count/range, source limitations, observed gaps and representative source/canonical comparisons. Include stable source manifest and plan digest; keep private payloads/secrets out of public artifacts.
- [ ] A.6 Review a representative Colwick dry run and its unresolved hold list before any Slice B execution approval.

### Slice A exact acceptance cases

| Test | Fixture / action | Pass criterion |
| --- | --- | --- |
| A1 repeated snapshots | Same verified observed timestamp/value in 100 distinct snapshots | Exactly one candidate; 100 evidence occurrences accounted for, without 100 canonical readings |
| A2 mixed wrapper | `level_source=flood-api` snapshot containing one newly fetched and one copied cached row | The copied row is never claimed as an individual direct EA fetch; `model_date` is not a reading or revision timestamp |
| A3 station alias | EA metadata 4009/RLOI 2102 plus government-page level row with unverified datum; separate verified mASD case | Alias is recognised; ambiguous row quarantined; separately verified stage row eligible; forecast row never eligible |
| A4 deterministic inputs | Identical inputs presented in reverse source/document order | Same candidate set, conflict classifications and dry-run digest |
| A5 numerical/time precision | `1.20`, `1.2` with compatible metadata; a negative reading; invalid/non-finite value and timestamp | Equal numeric values deduplicate while native evidence remains; negative preserved; invalid cases rejected; no invented rounding/grid/zero |
| A6 precedence/conflicts | Verified exact-EA and cached values disagree; two equally credible official rows disagree without revision proof | Stronger verified candidate selected for vacant key with disagreement reported; equal-priority unresolved values both held |
| A7 identity isolation | Same timestamp for Shardlow level and flow plus a mismatched unit/datum | No cross-measure deduplication; mismatched series/datum ineligible |
| A8 source gap | One inaccessible legacy month and one EA endpoint returning no supported older records | Source limitation and unknown history reported explicitly; no invented `complete` coverage |
| A9 write denial | Instrument all RDP Dynamo/S3 write, Mongo update and recovery/cursor operations during inventory/dry run | Zero calls to any write/mutate operation |

**Slice A release boundary:** code review and fixture tests only. Private source inventory itself requires separately authorised read-only access with bounded scope; no production RDP writes, collector activity, deployments or notifications.

## Slice B — reviewed conditional importer (implementation only; execution separately authorised)

- [ ] B.1 Add narrowly scoped, internally auditable historical-import provenance and validation without forged EA URLs or original fetch times. Preserve existing ordinary EA validation and read API compatibility.
- [ ] B.2 Reuse RDP's conditional archive insert-if-absent and committed object verification. Existing canonical value, revision and fetch evidence must remain untouched; quarantine an archive/hot inconsistency rather than overwrite it.
- [ ] B.3 Support conditional hot insertion only for eligible observations newer than the 365-day cutoff, from verified archive receipts, **without any latest, cursor or health update**. Older/equal-to-cutoff rows remain archive-only.
- [ ] B.4 Add an on-demand approved-plan execution boundary, bounded work and resumable verified checkpoints distinct from outage-recovery `REPAIR`/`GAP`/`RESUME` state. Replay incomplete work safely, while handling a new live canonical occupant as a preserved skip/conflict.
- [ ] B.5 Reconcile approved candidates, accepted/duplicate/occupied/conflict/invalid/held/unprocessed outcomes, source evidence, verified archive objects and actual historical time coverage. Generate, but **do not apply**, `coverage.json` recommendations.
- [ ] B.6 Add integration/adapter fixture tests below, run normal RDP restore/format/build/test and deployment guard checks; attach evidence to #50. No production invocation in the implementation PR.

### Slice B exact acceptance cases

| Test | Fixture / action | Pass criterion |
| --- | --- | --- |
| B1 virgin key | One approved Colwick identity absent in archive/hot | One revision-1 canonical archive observation; manifest and referenced object independently verified before any eligible hot insert |
| B2 identical occupant | Same key/content already committed; stronger source evidence in proposed import | Zero canonical manifest/value/revision/evidence changes; reported `already_canonical` |
| B3 conflicting occupant | Same key with different existing canonical value | Existing canonical content and version unchanged, conflict preserved with both values/evidence |
| B4 live writer race | Collector wins a conditional monthly manifest commit after planning | Import does not overwrite collector value; retry re-reads and reports canonical occupancy/conflict; normal collector correction path is unchanged |
| B5 existing hot orphan | Hot row exists but no committed archive row for its key | Import does not overwrite hot row or silently install an inconsistent archive candidate; discrepancy is held for review |
| B6 crash/replay | Archive committed, then hot insert or checkpoint fails; restart approved plan | Committed rows re-verified, missing eligible hot work safely completed; no second canonical revision; checkpoint advances only after verified completion |
| B7 idempotent rerun | Repeat completed approved plan | Zero new canonical writes/revisions, same stable accepted/occupied outcomes (excluding independent live changes) |
| B8 cutoff | One observation before, one exactly at, one after `now - 365 days` | Before/at are archive-only; after is conditionally hot-eligible with correct expiry; archive reader returns all three |
| B9 operation isolation | Snapshot `LATEST`, `CURSOR`, `HEALTH`, neighbouring measurement state and #81-B2 records | Byte-for-byte unchanged by importer, including when running alongside live collection; no outage cursor resume or gap ack |
| B10 plan integrity | Tampered source manifest, measurement, target stage, range or approval digest | Refused before writes; a newly occupied canonical timestamp alone is a conditional preserved outcome, not an overwrite |
| B11 archive failures | Missing/corrupt committed chunk/version, forced failed S3 commit, five conditional manifest conflicts, oversize batch/month | Explicit integrity/limit error; no unverified hot writes; no false source-gap classification or silent truncated success |
| B12 read/coverage | Imported months across year/month and hot/archive boundary; genuine unknown source period | Existing history API returns each accepted timestamp once with working pagination and archive verification; unknown gap remains unknown; `coverage.json` unchanged |
| B13 provenance compatibility | Cached-only import with no recorded original fetch time; ordinary EA collector fetch | Import keeps unknown fetch evidence truthfully and is queryable for audit; collector validation/correction and existing public read contract still work |

**Boundaries to exercise, not redesign:** RDP's 1,024 observations per archive batch, 4,096 canonical rows/month, 16 segments, 4 MiB stored / 16 MiB expanded per object, 64 MiB aggregate read/verification, five manifest commit attempts; the existing 366-day read API window, max 5,000 rows and 30-minute cursor; `coverage.json` at most 128 reviewed entries. Exceeding a bound produces a visible refusal/error, not silent data loss. Source-specific pagination, quotas, request windows and CLI execution budgets are implementation choices justified and recorded by the agent, not new product requirements.

**Slice B release boundary:** offline tests and review may complete without cloud action. A tiny staging fixture is optional and separately approved; do not create a full staging history replica. Actual production execution additionally requires reviewed source manifest/plan and digest, exact Colwick time window, account/region/stage, operator identity/role, bounded source request budget and maximum intended writes. Subsequent non-Colwick measurements require a separate approval.

## Coverage and post-run handoff

- [ ] Produce interval evidence and gaps from source reconciliation, distinguishing `complete` (only when proven), `not_collected`, `source_outage`, `legacy_unrecoverable` and otherwise `unknown`.
- [ ] Submit any coverage change in a **separate reviewed PR** against #69's `coverage.json`. Import must never publish coverage automatically. A missing/corrupt *committed archive* is an integrity failure, not a published gap.
- [ ] Record final per-measurement audit, remaining conflicts/holds, access exclusions and pragmatic stopping rationale in #50. Existing canonical corrections, if warranted, are a separate issue/authorisation.

## Explicit non-goals

No automatic repair of operational outages, no collector cursor resumption, no changes to existing canonical readings, no new database/source framework, no legacy deletions, no consumer cutover, no production import on merge and no source or AWS operation in this documentation change.

