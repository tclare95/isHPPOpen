# Capability: Subscriber-managed alert controls

## ADDED Requirements

### Requirement: Subscribers can control existing alerts
A holder of a valid existing management authorization SHALL be able to identify and manage the subscriptions covered by that authorization, without gaining access to other users.

#### Scenario: Edit
- **WHEN** a subscriber edits an eligible existing alert **THEN** the new conditions are validated, presented back to the subscriber, and applied to that subscription without unintentionally creating another active alert.
- **WHEN** a proposed edit is invalid or unsupported **THEN** the change is rejected clearly and the existing rule stays intact.

#### Scenario: Pause and resume
- **WHEN** a subscriber pauses an active alert **THEN** it stops generating future notifications while the pause applies.
- **WHEN** a subscriber resumes **THEN** the alert resumes from current eligible evidence, without retroactively notifying for conditions missed during the paused interval.
- **WHEN** a subscription is pending confirmation **THEN** unconfirmed rules remain inactive and are not accidentally activated by an edit or resume operation.

#### Scenario: Remove
- **WHEN** a subscriber removes an alert **THEN** the existing deletion/management semantics remain usable and the deleted rule is no longer evaluated.

### Requirement: Safe rule transitions
- **WHEN** threshold, direction, source or other trigger-defining parameters change **THEN** stored alert state is reconciled/re-baselined so the edit alone never produces a notification or bypasses re-arm/deduplication safeguards.
- **WHEN** operations are retried or two management actions race **THEN** the result must not leave duplicate live subscriptions, resurrect a deleted rule or send duplicate emails.
- **WHEN** a management token is invalid, expired or not authorized for that subscription **THEN** changes are refused without disclosing subscriber details.

### Requirement: Understandable status
- **WHEN** a subscriber views managed alerts **THEN** the view distinguishes active, paused and pending confirmation, with the configured conditions and last known trigger where available.
- **WHEN** available operational evidence is stale, unavailable or insufficient to establish evaluation health **THEN** the interface does not imply assured notification delivery.
- Management actions SHALL provide clear success/failure feedback and remain usable on mobile.

## Non-goals
New alert categories/channels, new user accounts, promise of guaranteed delivery, automatic retroactive alerting, changes to provider input freshness policy, or recalibration of existing thresholds.
