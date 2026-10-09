# Tasks: CSO asset catalogue and selection (#71)

All tasks are **unchecked future implementation tasks** in the unified backend, not completed by this documentation PR.

- [ ] Verify the Severn Trent feature layer schema, coded statuses, stable `Id` semantics, query/object-ID pagination and reuse limitations using an approved read-only API check; commit anonymised/schema-only fixtures.
- [ ] Define platform CSO asset and provider adapter contracts with external ID distinct from ArcGIS OBJECTID and measured provenance.
- [ ] Implement bounded full catalogue discovery, validation, completeness checkpoint and last-verified-catalogue preservation.
- [ ] Implement versioned YAML/JSON config schema with strict CI/startup validation, named enabled collection sets and exact explicit IDs.
- [ ] Implement deterministic set union / dedup / unresolved-ID diagnostics and a dry-run selection-plan diff; do not auto-enable newly discovered assets.
- [ ] Record per-run plan/config/catalogue versions, selected/resolved/unresolved counts and per-ID provider failures without secrets/raw provider payload dumps.
- [ ] Provide independent daily catalogue refresh and 15-minute selected polling job contracts with bounded provider batching/backoff and proper cancellation.
- [ ] Add tests for partial provider failure, failed/stale catalogue, unexpected/duplicate IDs, disabled sets, reappearing IDs, malformed HTTP-200 payloads and zero selection.
- [ ] Document one-time reviewed Sewage Map ID import into explicit config, retaining provenance and **no runtime dependency**.
- [ ] Run dotnet test/build/format and SAM validation without production secrets, then separately approved staging smoke only. No legacy service changes.
- [ ] Link evidence and backend PR to [#71](https://github.com/tclare95/isHPPOpen/issues/71), keeping [#72](https://github.com/tclare95/isHPPOpen/issues/72) spill-event persistence separate.

## Lightweight integration acceptance

- [ ] Verify that stage may discover a **complete provider asset catalogue** while polling **only a handful of explicitly selected outfall IDs**, with zero default background collection and a bounded manual test invocation.
- [ ] Preserve isolated stage role/storage/config and record a narrow #71 source-adapter smoke plan under [#75](https://github.com/tclare95/isHPPOpen/issues/75); do not provision production-sized staging history or reuse production writable access.
