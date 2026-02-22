import ForecastInfoPage from '../../components/pages/forecast-info-page';

export const metadata = {
  title: 'River Level Forecast | isHPPOpen',
  description:
    'River level forecast for Holme Pierrepont - view predictions, accuracy metrics, and compare forecast sources',
};

async function fetchJson(path) {
  try {
    const response = await fetch(path, { next: { revalidate: 300 } });
    if (!response.ok) {
      return null;
    }
    return response.json();
  } catch {
    return null;
  }
}

export default async function ForecastInfo() {
  const [levelData, s3Data, accuracyData, stabilityData] = await Promise.all([
    fetchJson(`${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/api/levels`),
    fetchJson(`${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/api/s3forecast`),
    fetchJson(`${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/api/forecastaccuracy`),
    fetchJson(`${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/api/forecaststability`),
  ]);

  return (
    <ForecastInfoPage
      initialData={{
        levelData,
        s3Data,
        accuracyData,
        stabilityData,
      }}
    />
  );
}
