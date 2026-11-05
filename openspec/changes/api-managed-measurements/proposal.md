> **Historical copy — canonical specification relocated.** The maintained requirements, design and acceptance tasks now live in [RDP's api-managed-measurements OpenSpec](https://github.com/tclare95/river-data-platform/tree/main/openspec/changes/api-managed-measurements) (tracked by [RDP issue #48](https://github.com/tclare95/river-data-platform/issues/48)). This original is retained for traceability to old suite issues/PRs. **Do not edit or implement from this copy.** See [RDP ownership](https://github.com/tclare95/river-data-platform/blob/main/docs/ECOSYSTEM.md). Migration is documentation-only; no release or feature activation is implied.

# Proposal: API-managed measurements and collection (#101)

## Why

River Data Platform (RDP) currently defines measurement identities, per-stage collection selections and read publication in a deployment-bundled registry. That was a sound first step for six-series parity (#52), but requiring a code/release change to choose an already supported gauge limits independent RDP operation and future product capabilities.

The goal is a **small, controlled operator API** for measurement configuration. First make **selection of already registered measurements** safely mutable; later enable discovery, validation and registration of other supported provider measurements. Do not bundle both into one launch.

## Product outcome and decisions

An operator can see what a provider supports, what RDP has registered, what each environment actually collects, and what first-party readers can see. The following are **independent decisions**, not a single "enabled" flag:

1. **Registration**: a verified provider measurement has a permanent canonical RDP identity and metadata.
2. **Collection selection**: an authorised operator explicitly opts that registered measurement into or out of polling for one environment, within operating limits.
3. **Read publication**: an authorised operator independently chooses whether the registered measurement is available in that environment's private read catalogue.

Registration MUST NOT select for collection; collection selection MUST NOT publish to readers; publication MUST NOT start collection. A published but uncollected measure may have no observations, or retained older observations. An unpublished measure's underlying history is retained but not exposed through ordinary first-party reads.

Only authorised operators can change these decisions. Normal first-party read principals remain read-only. Unresolved, invalid or unsupported provider identities never become poll targets. Changes must be version-safe and auditable, with bounded/provider-friendly collection and visible effective state.

Disabling collection preserves data, identity, latest observation, cursor, and prior health. A later enable resumes from the existing safe cursor and existing outage-recovery rules; it never silently jumps over a backlog. An intentionally empty managed selection is a valid *explicit stop* after controlled migration, and must not be confused with missing/invalid configuration.

## Delivery boundaries

**First usable release:** operator-only view and change of environment-specific collection selection for **already registered** measurements, with a safe audit, optimistic conflict handling, effective-state visibility and retained history/cursors. Keep registration and discovery on the current reviewed path until a later release.

**Subsequent independent capabilities:** private read-publication controls; provider lookup and validation of parameter, unit, datum and interval; registration under stable IDs; richer health and historical-coverage inspection. These can land in small, testable increments.

The supported provider/measurement kinds remain those RDP can safely ingest. This proposal does not oblige support for arbitrary gauges, rainfall, novel units/intervals or a second provider. It does not require an operator UI.

## Ownership, compatibility and release

- **Canonical plan/issues:** tclare95/isHPPOpen, this OpenSpec and [#101](https://github.com/tclare95/isHPPOpen/issues/101).
- **Runtime, tests, deployment and operator API:** [tclare95/river-data-platform](https://github.com/tclare95/river-data-platform).
- **Baselines:** [#52](https://github.com/tclare95/isHPPOpen/issues/52) six registered EA series; [#49](https://github.com/tclare95/isHPPOpen/issues/49) collector; [#65](https://github.com/tclare95/isHPPOpen/issues/65) archive; [#69](https://github.com/tclare95/isHPPOpen/issues/69) IAM first-party reads; [#81](https://github.com/tclare95/isHPPOpen/issues/81) release/IAM/production selection; [#75](https://github.com/tclare95/isHPPOpen/issues/75) small on-demand stage.
- **Related but separate:** [#50](https://github.com/tclare95/isHPPOpen/issues/50) historical backfill/coverage evidence; [#51](https://github.com/tclare95/isHPPOpen/issues/51) curated website consumers and alerts; [#77](https://github.com/tclare95/isHPPOpen/issues/77) playground; [#78](https://github.com/tclare95/isHPPOpen/issues/78) public developer API.

**Compatibility gate:** the existing six registered records and their current approved collection state MUST remain unchanged until a **separately reviewed and authorised migration** establishes the new effective configuration. In particular, this proposal does not grant #81 P5 six-series production activation or override the production release guards. Future code deployment alone must not reset, broaden or silently replace API-managed selection. Staging and production have isolated writable configuration and identities even in the same AWS account.

Roll back an unwanted *selection/publication decision* through a further authorised, audited change; stop polling without deleting histories or resetting cursors. The separate [design](design.md) describes API, storage, IAM, release and migration options; the [capability spec](specs/api-managed-measurements/spec.md) governs observable behaviour.

## Non-goals

No generic workflow/approval platform, event bus, public admin portal or anonymous write API; no automatic poll-all, automatic provider onboarding, new provider adapter or CSO catalogue convergence; no automatic data import, retention change, cursor reset, backfill or consumer source switch; no new infrastructure unless an implementation demonstrates a concrete security/consistency need.

**Documentation only:** this OpenSpec and issue make no runtime changes, AWS calls/writes, release, schedule change, collection selection, or approval for any production activity.
