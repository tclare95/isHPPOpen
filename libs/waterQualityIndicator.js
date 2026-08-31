import calibration from './waterQualityCalibration.json';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const FRESH_MS = 30 * MINUTE_MS;
const LEVEL_TOLERANCE_MS = 30 * MINUTE_MS;
const LABELS = { lower: 'Lower', elevated: 'Elevated', high: 'High indication', unavailable: 'Unavailable' };
const RANK = { lower: 0, elevated: 1, high: 2, unavailable: -1 };

function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function levelFor(value, elevated, high) {
  const normalized = value + 1e-12;
  if (normalized >= high) return 'high';
  if (normalized >= elevated) return 'elevated';
  return 'lower';
}

function result(level, details = {}) {
  return { level, label: LABELS[level], ...details };
}

export function getCsoActivityAssessment(csoData = [], now = new Date()) {
  const rows = csoData.map((row) => ({ timestamp: validDate(row?.timestamp), value: Number(row?.numberCSOsPerKm2) }))
    .filter((row) => row.timestamp && Number.isFinite(row.value)).sort((a, b) => a.timestamp - b.timestamp);
  const newest = rows.at(-1);
  if (!newest || now.getTime() - newest.timestamp.getTime() > FRESH_MS) {
    return result('unavailable', { value: null, observedAt: newest?.timestamp?.toISOString() ?? null, reason: 'Recent CSO activity data is unavailable.' });
  }
  const cutoff = newest.timestamp.getTime() - calibration.waterQuality.rollingWindowHours * HOUR_MS;
  const recent = rows.filter((row) => row.timestamp.getTime() >= cutoff);
  if (recent.length < calibration.waterQuality.minimumSamples) {
    return result('unavailable', { value: null, observedAt: newest.timestamp.toISOString(), reason: 'There are not enough recent CSO readings.' });
  }
  const value = recent.reduce((sum, row) => sum + row.value, 0) / recent.length;
  const level = levelFor(value, calibration.waterQuality.elevatedDensity, calibration.waterQuality.highDensity);
  const description = level === 'high' ? 'high' : level === 'elevated' ? 'elevated' : 'lower';
  return result(level, { value, observedAt: newest.timestamp.toISOString(), sampleCount: recent.length, reason: `CSO activity is ${description} relative to the past year.` });
}

export function getRunoffAssessment(levelData = [], now = new Date()) {
  const readings = levelData.map((row) => ({ timestamp: validDate(row?.reading_date), value: Number(row?.reading_level) }))
    .filter((row) => row.timestamp && Number.isFinite(row.value)).sort((a, b) => a.timestamp - b.timestamp);
  const newest = readings.at(-1);
  if (!newest || now.getTime() - newest.timestamp.getTime() > FRESH_MS) {
    return result('unavailable', { riseMetres: null, observedAt: newest?.timestamp?.toISOString() ?? null, reason: 'Recent river-level data is unavailable.' });
  }
  const target = newest.timestamp.getTime() - calibration.runoff.windowHours * HOUR_MS;
  const earlier = readings.reduce((best, reading) => {
    const distance = Math.abs(reading.timestamp.getTime() - target);
    return !best || distance < best.distance ? { reading, distance } : best;
  }, null);
  if (!earlier || earlier.distance > LEVEL_TOLERANCE_MS) {
    return result('unavailable', { riseMetres: null, observedAt: newest.timestamp.toISOString(), reason: 'A comparable river level from four hours ago is unavailable.' });
  }
  const riseMetres = newest.value - earlier.reading.value;
  const level = levelFor(riseMetres, calibration.runoff.elevatedRiseMetres, calibration.runoff.highRiseMetres);
  const reason = riseMetres > 0 ? `The river rose ${riseMetres.toFixed(2)} m in four hours, indicating additional runoff.` : `The river did not rise over the last four hours (${riseMetres.toFixed(2)} m).`;
  return result(level, { riseMetres, observedAt: newest.timestamp.toISOString(), reason });
}

export function buildWaterQualityIndicator({ csoData = [], levelData = [], now = new Date() } = {}) {
  const cso = getCsoActivityAssessment(csoData, now);
  const runoff = getRunoffAssessment(levelData, now);
  const available = [cso, runoff].filter((factor) => factor.level !== 'unavailable');
  if (!available.length) return result('unavailable', { partial: false, cso, runoff, reasons: [cso.reason, runoff.reason] });
  const level = available.reduce((worst, factor) => RANK[factor.level] > RANK[worst] ? factor.level : worst, 'lower');
  return result(level, { partial: available.length !== 2, cso, runoff, reasons: [cso.reason, runoff.reason] });
}

export { calibration as WATER_QUALITY_CALIBRATION };
