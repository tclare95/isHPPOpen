import CsoOutfallDetail from "../../../../components/functional/csoOutfallDetail";

export const metadata = {
  title: "Storm overflow | Is HPP Open",
  description: "One upstream storm overflow: its reported status, recorded spills, monitoring coverage and relationship to Holme Pierrepont.",
};

function decodeId(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// The canonical RDP asset ID (`provider:source:externalId`) is the address; old provider-ID links are resolved and replaced.
export default async function CsoOutfallPage({ params }) {
  const { id } = await params;
  return <CsoOutfallDetail id={decodeId(id)} />;
}
