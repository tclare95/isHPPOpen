export const TRENT_DASHBOARD_READING_LIMIT = 672;
export const TRENT_READINGS_PER_HOUR = 4;
export const TRENT_READINGS_PER_DAY = 96;

export function getTrentStationKey({ stationId, measureType = "level" }) {
  return `${stationId}-${measureType}`;
}

export const TRENT_DASHBOARD_STATIONS = [
  {
    stationId: 4009,
    name: "Colwick",
    gaugeName: "Colwick",
    measureType: "level",
    group: "Nottingham reach",
    summary: "Useful downstream city reference with a broad comparison role.",
    comparisonEnabled: true,
  },
  {
    stationId: 4126,
    name: "Clifton Bridge",
    gaugeName: "Clifton Bridge",
    measureType: "level",
    group: "Nottingham reach",
    summary: "Upstream city gauge and a strong anchor for surf-oriented comparison.",
    comparisonEnabled: true,
  },
  {
    stationId: 4007,
    name: "Shardlow",
    gaugeName: "Shardlow",
    measureType: "level",
    group: "Lower Trent",
    summary: "Key lower river level gauge alongside the separate Shardlow flow view.",
    comparisonEnabled: true,
  },
  {
    stationId: 4067,
    name: "Church Wilne",
    gaugeName: "Church Wilne",
    measureType: "level",
    group: "Lower Trent",
    summary: "Lower Trent level checkpoint that helps show broader downstream movement.",
    comparisonEnabled: true,
  },
  {
    stationId: 4074,
    name: "Kegworth",
    gaugeName: "Kegworth",
    measureType: "level",
    group: "Upper Trent",
    summary: "Upper reach gauge for spotting how conditions differ higher up the system.",
    comparisonEnabled: true,
  },
  {
    stationId: 4007,
    name: "Shardlow (Flow)",
    gaugeName: "Shardlow (Flow)",
    measureType: "flow",
    group: "Lower Trent",
    summary: "Separate flow series for Shardlow when you want discharge context.",
    comparisonEnabled: false,
  },
];

export const TRENT_WEIR_BLOCKS = TRENT_DASHBOARD_STATIONS;

export const TRENT_CHART_STATIONS = TRENT_DASHBOARD_STATIONS.filter(
  (station) => station.comparisonEnabled
);

export function getTrentStationDefinitions() {
  const stationMap = new Map();

  [...TRENT_WEIR_BLOCKS, ...TRENT_CHART_STATIONS].forEach((station) => {
    const existing = stationMap.get(station.stationId) ?? {
      stationId: station.stationId,
      name: station.gaugeName ?? station.name,
      measureTypes: new Set(),
    };

    existing.name = existing.name ?? station.gaugeName ?? station.name;
    existing.measureTypes.add(station.measureType ?? "level");
    stationMap.set(station.stationId, existing);
  });

  return Array.from(stationMap.values()).map((station) => ({
    stationId: station.stationId,
    name: station.name,
    measureTypes: Array.from(station.measureTypes),
  }));
}
