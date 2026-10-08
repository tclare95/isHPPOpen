# editorial-cache Specification

## Purpose
Define homepage editorial cache reuse and immediate freshness after successful event and banner writes.

## Requirements

### Requirement: Successful editorial writes immediately expire homepage content
Successful event upserts, event deletions, and banner updates SHALL expire both the relevant domain tag and home-snapshot using explicit immediate expiration. The first subsequent homepage read SHALL return updated content.

#### Scenario: Event content changes
- **WHEN** a successful event update or deletion follows a cached homepage read
- **THEN** the next homepage read returns the updated event list without serving the previous cached list

#### Scenario: Banner content changes
- **WHEN** a successful banner update follows a cached homepage read
- **THEN** the next homepage read returns the updated banner without serving the previous cached banner

### Requirement: Cache reuse and rejected write isolation
The homepage SHALL reuse its editorial snapshot within the six-hour refresh window between invalidations. Rejected or unsuccessful writes SHALL NOT invalidate snapshot tags.

#### Scenario: Reads reuse cached content
- **WHEN** repeated homepage reads occur without a successful editorial mutation within the refresh window
- **THEN** the existing cached snapshot is reused without another persistence read

#### Scenario: A protected write is rejected
- **WHEN** an unauthenticated request attempts an editorial write
- **THEN** no persistence mutation or cache invalidation occurs

### Requirement: Invalidation failures preserve successful writes
A failed tag invalidation SHALL be logged, SHALL NOT change a successful persisted write into an error response, and SHALL NOT prevent remaining tags from being attempted.

#### Scenario: One tag invalidation fails
- **WHEN** a successful event write is followed by a failure expiring its domain tag
- **THEN** the response remains successful and the home-snapshot tag is still attempted
