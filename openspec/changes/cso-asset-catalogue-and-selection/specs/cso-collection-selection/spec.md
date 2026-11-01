# Specification delta: CSO asset catalogue and collection selection

## ADDED Requirements

### Requirement: Independent complete provider catalogue
The system SHALL be able to discover a configured CSO provider's complete asset catalogue independently of which assets are selected for monitoring, with stable provider-associated identities, source attribution and a versioned last-verified result.

#### Scenario: Provider results span multiple pages
- **WHEN** complete discovery needs multiple bounded requests
- **THEN** the system establishes completeness before a newly discovered catalogue becomes authoritative.

#### Scenario: Incomplete or ambiguous identity data
- **WHEN** a refresh is incomplete, contains conflicting asset identities or fails to establish identity completeness
- **THEN** it cannot replace the last verified catalogue, and the refresh failure is visible.

#### Scenario: Optional metadata absent
- **WHEN** an asset has a valid identity but optional name, location or watercourse metadata is missing
- **THEN** the asset may be retained with unknown metadata and the absence is not silently invented.

#### Scenario: Source refresh fails
- **WHEN** provider discovery fails after a previously verified snapshot exists
- **THEN** the last verified catalogue remains available, with stale/failure diagnostics rather than partial replacement.

### Requirement: Stable identity and controlled provider changes
The system SHALL preserve canonical asset continuity based on verified upstream identities and explicit provenance, without treating a transient provider row identifier or geographic resemblance as proof of identity.

#### Scenario: Provider row identifiers change
- **WHEN** a provider republishes the same verified outfall with different transport-specific row identifiers
- **THEN** its existing canonical identity is preserved.

#### Scenario: Provider changes an asset identifier
- **WHEN** a previously selected outfall's upstream ID disappears and a different ID appears
- **THEN** the selection remains unresolved and the system does not silently remap it by coordinates, label or other inferred similarity.

#### Scenario: Reviewed mapping resolves an identity change
- **WHEN** an operator accepts an evidenced mapping between upstream IDs through reviewed configuration
- **THEN** the relationship and its provenance are recorded, and the resulting selection is deterministically resolved without hidden changes to the intended monitored asset.

#### Scenario: Official provider source is replaced
- **WHEN** an equivalent official public source is verified and approved
- **THEN** the system can continue catalogue discovery with traceable source provenance and verified identity continuity, without silently switching to an unverified source.

### Requirement: Explicit, environment-specific named selection
The system SHALL determine monitored assets solely from version-controlled explicit provider outfall IDs in named enabled selection sets. For each environment it SHALL resolve a deduplicated union, retaining set membership for review.

#### Scenario: Unselected new asset discovered
- **WHEN** an asset appears in a catalogue but in no enabled set
- **THEN** it is not automatically selected for polling.

#### Scenario: Asset belongs to multiple sets
- **WHEN** an ID is listed in several enabled sets
- **THEN** it appears once in the effective polling plan, while contributing set membership remains inspectable.

#### Scenario: A set is disabled
- **WHEN** a configured set is disabled for an environment
- **THEN** assets unique to that set cease future polling without deletion of previously collected data; assets still selected by another enabled set remain selected.

#### Scenario: Empty selection is intentional
- **WHEN** no collection sets are enabled for an environment
- **THEN** the effective plan selects no outfalls and no implicit provider-wide fallback occurs.

#### Scenario: Staging differs from production
- **WHEN** staging enables only a few explicit test outfalls
- **THEN** staging does not inherit a production selection or begin polling every discovered asset.

### Requirement: Unresolved IDs are retained and isolated
The system SHALL keep syntactically valid but unresolved configured IDs visible and unhealthy without preventing other valid selections.

#### Scenario: A configured outfall disappears
- **WHEN** a selected ID is absent from the current verified catalogue
- **THEN** it remains configured and unresolved, and valid peers remain selected.

#### Scenario: The same verified outfall ID reappears
- **WHEN** a later verified catalogue again contains the exact configured upstream ID
- **THEN** the selection becomes resolvable without a configuration edit.

### Requirement: Deterministic reviewable selection plan
The system SHALL produce a bounded, deterministic plan linked to its configuration and verified catalogue versions, and SHALL support a safe dry-run comparison.

#### Scenario: Identical verified inputs
- **WHEN** the same configuration and verified catalogue are resolved again
- **THEN** effective selections, unresolved outcomes and plan version/digest are the same.

#### Scenario: No verified catalogue exists
- **WHEN** an enabled selection needs resolution but no verified provider catalogue exists
- **THEN** the system fails closed rather than treating unverified assets as eligible or an empty catalogue as authoritative.

#### Scenario: Previous catalogue becomes stale
- **WHEN** refresh fails but a verified catalogue still exists
- **THEN** a plan based on that catalogue explicitly reports its stale state instead of presenting it as freshly verified.

#### Scenario: Invalid selection configuration
- **WHEN** a provider, set, ID or environment selection configuration is invalid
- **THEN** the invalid configuration is rejected without making provider requests for arbitrary assets.

### Requirement: Independent source and polling responsibilities
The system MUST NOT depend on Sewage Map at runtime, infer upstream hydrological relationships for collection selection, or start polling newly discovered assets as a consequence of catalogue refresh.

#### Scenario: Sewage Map is unavailable
- **WHEN** Sewage Map cannot be reached
- **THEN** existing verified catalogues and valid explicit selections remain usable independently.

#### Scenario: Catalogue refresh completes
- **WHEN** an independent discovery job verifies a new catalogue
- **THEN** it updates catalogue/selection evidence only and does not itself initiate status polling or spill-event writes.
