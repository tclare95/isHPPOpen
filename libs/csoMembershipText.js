// Where the upstream outfall list comes from (#114). Status (unavailable) is shown beside the data it affects;
// provenance (set, version, providers) is stated once, in the page's "About the data" section.
export function membershipUnavailable(membership) {
  return membership?.source === 'rdp' && membership.state !== 'available';
}

export function membershipSummary(membership) {
  if (membership?.source !== 'rdp' || membership.state !== 'available') return null;
  return {
    relationshipSet: membership.relationshipSet,
    version: String(membership.version).slice(0, 12),
    confirmed: membership.scopes?.find((scope) => scope.name === 'confirmed')?.count,
    providers: [...new Set((membership.catalogues ?? []).map((entry) => entry.providerLabel || entry.attribution).filter(Boolean))],
  };
}
