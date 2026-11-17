# Capability: Understandable alert subscriptions

## ADDED Requirements

### Requirement: Explain subscriptions in user terms
Visitors SHALL be able to understand the currently offered gauge, forecast, HPP status and water-quality alerts before subscribing.

#### Scenario: Creating a subscription
- **WHEN** a visitor selects an alert type and conditions **THEN** the interface states what may cause a notification, the relevant location/threshold where applicable, and that unavailable or stale source evidence can delay or prevent evaluation.

#### Scenario: Confirmation
- **WHEN** a subscription or confirmation step succeeds **THEN** the user receives a clear result; a failed or incomplete request SHALL NOT appear to be a successful active subscription.

### Requirement: Manage existing alerts
Subscribers SHALL have a straightforward path from the site and notification emails to review and stop existing subscriptions without revealing other subscribers' details.

#### Scenario: Inspect and unsubscribe
- **WHEN** a subscriber follows a valid management link **THEN** they can identify the subscription(s) controlled by that link and unsubscribe according to existing authorization/token rules.

#### Scenario: Expired or invalid link
- **WHEN** a management link cannot be used **THEN** the user receives a useful recovery explanation without exposure of private subscription details.

### Requirement: Trustworthy notification expectations
- **WHEN** source observations or evaluation runs are delayed, skipped or unavailable **THEN** the product SHALL NOT imply that healthy delivery is assured from a successful HTTP response or a matching shadow run alone.
- **WHEN** alert reliability is repaired **THEN** existing subscription thresholds, version-rebaselining, duplicate protection and re-arm semantics SHALL remain intact unless a separately accepted product change revises them.
- User-facing messages SHALL be concise and distinguish an informational alert from a guarantee of river access or water safety.

## Non-goals
New notification channels, new rule categories, mandated edit/pause features, changes to schedules, recalibration of thresholds, sending test emails to real users, or replacing the existing delivery service. Existing `improve-alert-scheduling` owns operational evaluation invariants.
