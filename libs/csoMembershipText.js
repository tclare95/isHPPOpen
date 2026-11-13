// Where the upstream outfall list comes from (#114). Shared by the map and event history.
export function membershipText(membership) {
  if (membership?.source !== 'rdp') return null;
  if (membership.state !== 'available') return 'Upstream outfall list unavailable.';
  const confirmed = membership.scopes?.find((scope) => scope.name === 'confirmed')?.count;
  const sources = (membership.catalogues ?? []).map((entry) => entry.attribution || entry.providerLabel).filter(Boolean).join(', ');
  return `Upstream outfalls: River Data Platform set ${membership.relationshipSet} (${String(membership.version).slice(0, 12)}, ${confirmed} confirmed)${sources ? `. Data: ${sources}` : ''}.`;
}
