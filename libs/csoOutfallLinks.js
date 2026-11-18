// Shareable links for one storm overflow (Wave C / C4). The canonical RDP asset ID (`provider:source:externalId`) is the
// identity, never coordinates: co-located monitors share a map pin but each has its own link. Colons stay readable.
export function outfallDetailPath(id) {
  return `/waterquality/cso/${encodeURIComponent(id).replace(/%3A/gi, ':')}`;
}

// The existing /waterquality map and spill history, focused on one outfall (`outfall` is the page's public ID) and, when
// `route` (the canonical asset ID) is given, with the downstream impact overlay on and that outfall's route highlighted.
export function outfallMapPath({ publicId, assetId = null, route = false }) {
  const query = new URLSearchParams({ outfall: publicId });
  if (route && assetId) query.set('route', assetId);
  return `/waterquality?${query.toString().replace(/%3A/gi, ':')}#cso-map-panel`;
}

// Reads `?outfall=` and `?route=` from a /waterquality URL. Unknown or malformed values are ignored by the page.
export function readOutfallMapQuery(search) {
  const query = new URLSearchParams(search ?? '');
  const valid = (value, max) => (typeof value === 'string' && value.length > 0 && value.length <= max && /^[A-Za-z0-9_.:-]+$/.test(value) ? value : null);
  return { outfall: valid(query.get('outfall'), 200), route: valid(query.get('route'), 250) };
}
