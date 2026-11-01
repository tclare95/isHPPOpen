# Tasks and acceptance: CSO evidence, events, archive and API (#72)

**All tasks unchecked** until separate RDP implementation PRs and recorded evidence. This is a documentation-only plan, not permission to query the provider, deploy AWS, enable a source schedule or touch the legacy scraper.

## Delivery slices

### PR 1 — Source evidence and current-state projection (no event reconstruction)
- [ ] 1.1 After #71's selection contract is available, consume the verified versioned plan of eligible outfalls. Enforce empty/disabled/unresolved/no-verified-catalogue fail-closed behaviour; record selected set/config/catalogue provenance.
- [ ] 1.2 With separately authorised **bounded read-only** source verification, document Severn Trent live field/status/time semantics and error shape with attributed fixtures; distinguish verified guarantees from assumptions. No production collection activation.
- [ ] 1.3 Add separate CSO-owned provider fetch/evidence and current-status contracts. Use bounded work, timeouts, retries and per-asset failure isolation. Do not reuse EA `IObservationStore`/measurement validation/365-day TTL or create spill events yet.
- [ ] 1.4 Persist immutable deduplicated substantive source evidence and collection run/health outcomes, with recoverable S3-first evidence references and a current monitor projection that distinguishes source update age, fetch time, durable commit and effective state.
- [ ] 1.5 Test failure after evidence commit / before current-state projection, duplicate fetch, stale/offline and stage disabled behaviour using local fake storage. No new infrastructure or schedules required for this slice.

### PR 2 — Stable event identity, material revisions and reconciliation
- [ ] 2.1 Interpret source-reported exact start/end claims, including complete intervals discovered between polls. Preserve missing/invalid/uncertain boundaries without invented exact times.
- [ ] 2.2 Establish stable internal event identity and durable source-claim lineage, with one canonical event for concurrent duplicates; keep distinct proven nearby events separate.
- [ ] 2.3 Reconcile ongoing, completed and unresolved events; keep source current state independent. Append immutable material revisions and conservatively handle untrusted source revision ordering.
- [ ] 2.4 Replay retries and recover partial S3/Dynamo commits, index/identity concurrency conflicts, completed-event corrections and unresolved claims without silently merging or moving an event backward.
- [ ] 2.5 Expose safe per-outfall reconciliation/health diagnostics. Defer an operator-facing reconciliation UI and general-purpose event processing framework.

### PR 3 — CSO archive, retention and six authenticated reads
- [ ] 3.1 Add domain-specific hot status/event/identity and bounded interval-overlap retrieval, plus private verified S3 canonical event history. Keep raw evidence/revisions under a separate no-automatic-deletion policy. Do not reuse scalar gauge persistence.
- [ ] 3.2 Define UTC month-end/leap arithmetic and prove 24-calendar-month-after-verified-end eligibility; block TTL until complete canonical archive/evidence verification. Ongoing/unresolved never expire.
- [ ] 3.3 Make archived corrections/reopens safe: same ID, newer verified archive generation, discoverable corrected interval, repaired hot/index state and suppressed TTL when no longer complete.
- [ ] 3.4 Extend the **existing** read API host with exactly six CSO GET routes and read-only domain services; revise gateway route list, Lambda `SourceArn`, stage-specific caller invoke allow/deny list, read execution policy and boundary, offline guard tests. No new API or read Lambda by default.
- [ ] 3.5 Implement bounded mixed hot/S3 event interval queries, carry-in events, stable IDs, current authoritative revisions, pagination and coverage vs archive-integrity handling. Preserve the existing four measurement endpoints and safe wire semantics.
- [ ] 3.6 Validate absent/corrupt committed archives, stale cursors, query/memory/byte budgets, signed/unsigned/wrong-stage requests, role scope and denied writes offline.

### PR 4 — Bounded stage verification (separate explicit approval)
- [ ] 4.1 Run local/CI fixtures and policy tests first; no AWS or source access is required to prove historical behaviours.
- [ ] 4.2 Obtain separate reviewed #75/#81-aligned permission for stage storage/IAM/template changes and manually invoked provider collection of **only a few explicitly selected outfalls**. Stage schedule remains disabled; never enable current gauge collector to run CSO.
- [ ] 4.3 Use tiny **synthetic** event and injected-clock fixtures for multi-year retention, corrected old events and cross-tier pagination (do **not** populate two years of stage history). Inspect stage logs, safety/latency/cost and source provenance. Never tamper with canonical existing records just to inject corruption.
- [ ] 4.4 Validate CSO-only IAM routes and wrong-stage/unsigned denial through a finite, approved smoke. Disable any temporary access afterwards. Any stage fixture cleanup is separately authorised and cannot weaken canonical archive preservation.
- [ ] 4.5 Record test evidence and remaining operational risks on [#72](https://github.com/tclare95/isHPPOpen/issues/72). Defer production collection/alarms, consumer parity, historical import and legacy cutover to distinct approvals/specs. Leave #72 open until verified acceptance.

## Exact acceptance scenario matrix (fixtures first)

The source times below are **illustrative UTC** claims, not verified live Severn Trent incidents. Each scenario should assert resulting current state, event identity/revision and durability/visibility, not just successful Lambda execution.

| ID | Input and failure condition | Exact expected outcome |
| --- | --- | --- |
| S01 | #71 discovers an unselected outfall, or staging has no enabled set | Zero CSO status requests for it; no evidence or event writes. |
| S02 | One configured ID unresolved; a second valid ID selected; same valid ID in two sets | Unresolved ID not polled; valid ID polled once; both set memberships and unresolved diagnostics retained. |
| S03 | Last-good catalogue exists but latest refresh fails | Plan identifies its stale verified version; only still-verified eligible IDs may be polled under separate approval, never new identities. |
| S04 | Active report at 10:00, duplicate identical reports at 10:15 and retry at 10:16 | One substantive source claim/event identity, no duplicate event revision; 3 independent collection outcomes can be observed. |
| S05 | Poll fetched 10:15 but provider `LastUpdated` still 09:00 | Successful fetch cannot reset source age; effective state follows source-freshness policy, and health retains both timestamps. |
| S06 | Fresh spilling report at 10:00, offline report at 10:15, timeout at 10:30 | `reportedState=offline` after valid offline claim, effective unknown; same event still open/unresolved, `endedAt=null`, no invented completion. |
| S07 | Fresh stopped status at 10:15 without a valid end for existing active event | Current reported state may be not-spilling; event remains without a precise completion/end until authoritative event evidence arrives. |
| S08 | Poll at 10:00 then 10:15 discovers `LatestEventStart=10:04`, `LatestEventEnd=10:11`, currently stopped | One completed event [10:04,10:11] even though no active state was polled; no inference that other unreported spills did not happen. |
| S09 | Source says end 10:03 before start 10:04 or gives unparseable time | Invalid claim diagnosed/preserved; previously committed state unchanged; no negative duration. |
| S10 | Provider corrects completed event start 10:04 to 10:02; retry of old payload arrives later | Same eventId; exactly one new material revision with 10:02, earlier 10:04 revision retained, old retry cannot revert. |
| S11 | Provider corrects completed event end 10:11 to 10:13 with authoritative lineage | Same eventId; duration/index and new revision change consistently; previous revision remains auditable. |
| S12 | Two separate evidenced spills [10:04,10:11] and [10:13,10:18] | Two event IDs; temporal proximity alone causes no merge. |
| S13 | New corrected start could equally refer to either of S12's two spills | Original two IDs unchanged; claim marked unresolved; no arbitrary merge or completed count inflation. |
| S14 | Two concurrent workers ingest the **same new claim** with no existing event ID | Exactly one published canonical ID, no fork, zero lost source references or duplicate material revisions. |
| S15 | Two workers race an older snapshot against a later correction, with provider precedence not verifiable | No last-writer-wins rollback or fabricated authority; deterministic hold/reconciliation or verified authoritative result; evidence preserved. |
| S16 | S3 evidence upload/readback fails before Dynamo projection | No new acknowledged current/event checkpoint, prior version remains readable; retry can resume. |
| S17 | S3 commit succeeds; Dynamo latest/event/head/index write fails halfway; retry arrives | One authoritative event+revision after replay, consistent discoverability, no unfindable committed correction or duplicated ID. |
| S18 | Completed 2024-01-31T12:00Z and now 2026-01-31T11:59Z, then 12:00Z | Not TTL-eligible before the anniversary; eligible at/after it **only if** full required S3 archive verified. |
| S19 | Completed 2024-02-29T09:00Z, policy UTC clamp-to-month-end | Eligibility boundary 2026-02-28T09:00Z (document this exact calendar policy); never silently use 730 fixed days. |
| S20 | Three-year-old start but still ongoing/unresolved, or verified end yesterday | Both remain hot-discoverable and non-expiring (for different reasons), regardless of start age. |
| S21 | Completed archived event corrected to remove end/reopen | Same ID, new S3 generation, restored hot discoverability and no TTL; old revision retained and not exposed as second event. |
| S22 | TTL deletion delayed or hot/S3 overlap has same event | One event in history, deduplicated by ID+authoritative revision, independent of physical expiry. |
| S23 | Event started before `from` and ends inside requested `[from,to)`; another begins exactly at `to` | Carry-in event included once; event at exclusive `to` excluded. |
| S24 | Query crosses 24-month boundary; a long-running event began prior to cutoff but ended after | Correct hot+S3 interval overlap with no missing or duplicate event, no routing solely by start timestamp. |
| S25 | Correction changes archived event's start across query/index boundary mid-pagination | Restart with new authoritative view or explicit `CURSOR_STALE`, never silent missing/duplicate event in a continued page. |
| S26 | A committed manifest references an absent/corrupt S3 event object | `503 ARCHIVE_INTEGRITY`; no successful-looking partial response or TTL promotion on this evidence. |
| S27 | Window predates collection or contains unknown periods but verified event(s) exist | `200` verified events plus `coverage=partial/unknown` with ranges; no zero-spill assertion. |
| S28 | One of three batch current reads fails, then all three fail | First case: good 2 + explicit partial unavailable 1; second: `503 STORAGE_UNAVAILABLE`. |
| S29 | Unsigned caller, Preview role to production, or CSO caller tries write storage | Denied; existing measurement routes remain unchanged. |
| S30 | Stage verification uses tiny fixture events aged over two years and a few selected IDs | Rollover/correction/route security demonstrated with no live 24-month replica, stage schedule activation, production data write or legacy change. |

## Decisions and evidence still open

These are **not** invitations to substitute unsupported implementation guesses for product requirements:

1. **Provider semantics (evidence pending):** verify ArcGIS coded `Status` values, `StatusStart/LatestEvent*/LastUpdated`, event ID/revision availability, single-latest-event limitations, status/report lag and update monotonicity using an explicitly approved bounded source read.
2. **Freshness threshold (tentative):** 15-minute planned collection and 30-minute source age are placeholders pending actual lag measurement. What happens to an active event is already decided: it never closes for stale/offline.
3. **Reconciliation ownership:** initial unresolved diagnostic + reviewed operator action without an admin UI. Choose a small repeatable procedure and acceptance evidence at implementation time; automatic fuzzy time/coordinate matching is excluded.
4. **Retention month arithmetic:** recommend UTC month addition with end-of-month clamp (see S19). Confirm in implementation review; preserve the accepted **24 calendar months**, not fixed-day approximation. Source/revision S3 automatic deletion remains out of scope until a governance decision.
5. **Archive/index efficiency:** exact CSO Dynamo key/manifest scheme and compacted archive shape are agent choices, constrained by bounded overlap queries, durable lineage, verified direct reads and correction/replay tests. Avoid introducing unnecessary infrastructure.
6. **Read-host isolation trade-off (recommended):** extend existing read Lambda + separate resource-scoped CSO read IAM (not a separate handler). Revisit only if a documented security, traffic or fault-isolation need requires a separate role. Explicit IAM/bootstrap tests are mandatory.
7. **Operational activation:** distinct CSO stage/production flags, schedule and alarms must be separately reviewed when implementation exists. #71 catalogue refresh and RDP gauge schedule must not accidentally enable CSO polling.
