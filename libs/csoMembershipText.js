// Plain-language description of where the upstream outfall list comes from (#114). Shared by the map and event history.
export function membershipText(membership) {
  if (membership?.source !== 'rdp') return null;
  if (membership.state !== 'available') {
    return 'The reviewed upstream outfall list from River Data Platform is unavailable, so no outfall is shown as upstream until it can be read.';
  }
  const confirmed = membership.scopes?.find((scope) => scope.name === 'confirmed')?.count;
  const sources = (membership.catalogues ?? []).map((entry) => entry.attribution || entry.providerLabel).filter(Boolean).join(', ');
  return `Upstream outfalls: River Data Platform reviewed set ${membership.relationshipSet} (version ${String(membership.version).slice(0, 12)}, ${confirmed} confirmed)${sources ? `; outfall data ${sources}` : ''}.`;
}
