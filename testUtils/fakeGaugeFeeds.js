// Deterministic gauge observation feeds for live gauge alert tests (#51 Slice D).
// `legacy` is served through a fake Environment Agency `/id/measures/{id}/readings` endpoint
// (install `fetch` with `feeds.fetch`), `rdp` through a fake RDP client `getObservations`.
// Each feed is an in-memory history that tests append to as time moves on.
import { RDP_MEASUREMENTS } from "../libs/rdp/measurements";

const EA_MEASURES = "http://environment.data.gov.uk/flood-monitoring/id/measures";
/** Environment Agency `dateTime` format. */
export const eaTime = (date) => new Date(date).toISOString().replace(/\.000Z$/, "Z");
/** RDP `observedAt` format (offset form), a different spelling of the same instant. */
export const rdpTime = (date) => new Date(date).toISOString().replace(/\.000Z$/, "+00:00");

const gaugeKeyForProviderMeasure = (id) => Object.keys(RDP_MEASUREMENTS).find((key) => RDP_MEASUREMENTS[key].providerMeasureId === id);
const gaugeKeyForMeasurement = (id) => Object.keys(RDP_MEASUREMENTS).find((key) => RDP_MEASUREMENTS[key].measurementId === id);
const byTime = (left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt);

export function createGaugeFeeds() {
  const history = { legacy: {}, rdp: {} };
  const blocks = { legacy: [], rdp: [] };
  const failures = { legacy: {}, rdp: {} };
  const requests = { legacy: [], rdp: [] };

  async function waitIfBlocked(source) {
    const block = blocks[source].shift();
    if (block) await block.promise;
  }

  const feeds = {
    history,
    requests,
    /** Append one reading. `extra` may override quality, measure or any row field. */
    add(source, gaugeKey, value, at, extra = {}) {
      (history[source][gaugeKey] ||= []).push({ observedAt: new Date(at).toISOString(), value, ...extra });
    },
    /** Same reading in both sources. */
    addBoth(gaugeKey, value, at) {
      feeds.add("legacy", gaugeKey, value, at);
      feeds.add("rdp", gaugeKey, value, at);
    },
    set(source, gaugeKey, rows) {
      history[source][gaugeKey] = rows.map(([value, at, extra = {}]) => ({ observedAt: new Date(at).toISOString(), value, ...extra }));
    },
    /** The next read of `source` waits until the returned `release()` is called. */
    block(source) {
      let release;
      const promise = new Promise((resolve) => { release = resolve; });
      blocks[source].push({ promise });
      return { release };
    },
    /** Make every read of `gaugeKey` from `source` fail (`status` for legacy HTTP, `error` for RDP). */
    fail(source, gaugeKey, failure) {
      failures[source][gaugeKey] = failure;
    },

    async fetch(url) {
      const parsed = new URL(url);
      const providerMeasureId = decodeURIComponent(parsed.pathname.split("/").at(-2));
      const gaugeKey = gaugeKeyForProviderMeasure(providerMeasureId);
      requests.legacy.push({ gaugeKey, url: String(url) });
      await waitIfBlocked("legacy");
      const failure = failures.legacy[gaugeKey];
      if (failure) return { ok: false, status: failure.status ?? 503, json: async () => ({}) };
      const since = Date.parse(parsed.searchParams.get("since"));
      const limit = Number(parsed.searchParams.get("_limit"));
      const items = (history.legacy[gaugeKey] || [])
        .filter((row) => Date.parse(row.observedAt) >= since)
        .sort(byTime)
        .reverse()
        .slice(0, limit)
        .map(({ observedAt, value, ...extra }) => ({
          "@id": `${EA_MEASURES.replace("/id/measures", "/data/readings")}/${providerMeasureId}/${eaTime(observedAt)}`,
          dateTime: eaTime(observedAt),
          measure: `${EA_MEASURES}/${providerMeasureId}`,
          value,
          ...extra,
        }));
      return { ok: true, status: 200, json: async () => ({ items }) };
    },

    client: {
      async getObservations(measurementId, { from, to, limit }) {
        const gaugeKey = gaugeKeyForMeasurement(measurementId);
        const measure = RDP_MEASUREMENTS[gaugeKey];
        requests.rdp.push({ gaugeKey, from, to, limit });
        await waitIfBlocked("rdp");
        const failure = failures.rdp[gaugeKey];
        if (failure) throw Object.assign(new Error("RDP failure"), { code: failure.error ?? "UPSTREAM_ERROR" });
        const rows = (history.rdp[gaugeKey] || [])
          .filter((row) => Date.parse(row.observedAt) >= Date.parse(from) && Date.parse(row.observedAt) <= Date.parse(to))
          .sort(byTime);
        return {
          data: rows.slice(0, limit).map(({ observedAt, value, ...extra }) => ({
            observedAt: rdpTime(observedAt), value, unit: measure.unit, datum: measure.datum, quality: null,
            sourceId: "ea-flood-monitoring", providerMeasureId: measure.providerMeasureId, revision: 1, ...extra,
          })),
          meta: { measurementId, pageIntegrity: "verified", nextCursor: rows.length > limit ? "next-page" : null },
        };
      },
    },
  };
  return feeds;
}
