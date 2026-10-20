# Design: RDP-owned gauge catalogue with curated first-party consumers

## Six-measure parity
The web already addresses six EA series (station IDs 4009 Colwick level, 4126 Clifton Bridge level, 4007 Shardlow level + flow, 4067 Church Wilne level, 4074 Kegworth level). RDP already registers:
- `ea-colwick-level`, station 4009, upstream `4009-level-stage-i-15_min-mASD`.
- `ea-shardlow-level`, station 4007, upstream `4007-level-stage-i-15_min-mASD`.
- `ea-shardlow-flow`, station 4007, upstream `4007-flow--i-15_min-m3_s`.

Add stable proposed IDs `ea-clifton-bridge-level`, `ea-church-wilne-level`, `ea-kegworth-level` **only after verifying each exact Environment Agency measure metadata**, level parameter, 15-minute instant sampling, unit/datum and compatible web semantics. A station may expose more than one level or other period; station+parameter alone must not silently select the wrong series. Existing IDs must never be renamed or repurposed. Preserve independent level and flow when times overlap.

RDP should hold source watercourse/station identity when verified. isHPPOpen grouping under a Trent-region dashboard does not turn every gauge into an observation of the Trent itself.

## Catalogue and selection states
Treat three separate logical axes explicitly, with a tested default-deny path:
1. **Registration**: version-controlled validated entry with provider/station/exact external measure ID, parameter, unit/datum, interval and stable canonical ID.
2. **Operational selection**: environment-specific explicit collector allowlist/schedule/rollout approval; registration or catalogue publication cannot expand the running set. Current stage remains a 1–3-measure allowlist; production selection is designed only under a separately approved activation plan.
3. **Read publication**: intentional exposure of a registered/valid measurement to the internal #69 catalogue/read endpoints. An unpublished/disabled measurement cannot be probed via user-supplied storage partition or guessed ID.

The current RDP `MeasurementRegistry` combines enabled catalogue eligibility with a staging allowlist and caps all measurements at 12. Extend only the metadata/validation necessary to make registration, collection and internal publication semantics explicit. Preserve conservative defaults, existing identity validation and the 12-item initial operational bound unless ordinary tested change requirements justify revision. No dynamic admin storage or unnecessary generic config framework.

All collection configuration changes are reviewed, stage/prod isolated, and never activated by merging a data catalogue entry. Source outages are isolated by measurement.

## Web presentation boundary
RDP owns source truth and identifiers. isHPPOpen keeps explicit curated selection, presentation names/order, chart group, comparison and independent alert eligibility. Existing `4009-level` etc aliases remain publicly compatible; #51 owns their canonical-ID mapping and reader implementation. The #69 internal catalogue is reusable by future consumers; it is not an instruction for isHPPOpen to display every published gauge.

Adding a new RDP measurement must not require editing isHPPOpen. Making it visible in the curated isHPPOpen UI is a separate intentional website config decision. No coupling from web-specific labels/alert eligibility into the backend registry.

## Playground and public API boundaries
Future RDP playground issue #77 is a standalone data-exploration consumer and may initially use the authenticated #69 API through its own server-side service. Public API issue #78 separately considers external developer access, anonymous vs registered auth, versioning, rate limits, quotas, costs and attribution. Neither is an implementation prerequisite. Do **not** expose raw Lambda functions, AWS_IAM credentials to browsers or production S3/Dynamo data through a public endpoint in #52.

## Verification and release
Validate exact EA measure refs with read-only metadata (fixture snapshots in tests), startup/CI rejection of duplicates/unsupported datum/time units, level/flow at same timestamp, unknown/disabled/unpublished IDs, independent per-measure health and full catalogue/latest/history behaviour. Test adding a hypothetical supported seventh measurement in configuration without source or API code edits; it may remain uncollected. Use local/mock tests and, with separate #75 approval, one to three small stage selections; do not clone a full six-gauge history into staging.
