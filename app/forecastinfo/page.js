import ForecastInfoPage from '../../components/pages/forecast-info-page';
import {
  getForecastAccuracyData,
  getForecastStabilityData,
  getLevelsData,
  getS3ForecastData,
} from '../../libs/services/forecastService';

export const metadata = {
  title: 'River Level Forecast | isHPPOpen',
  description:
    'River level forecast for Holme Pierrepont - view predictions, accuracy metrics, and compare forecast sources',
};

export const revalidate = 300;

export default async function ForecastInfo() {
  const [levelData, s3Data, accuracyData, stabilityData] = await Promise.all([
    getLevelsData().catch(() => null),
    getS3ForecastData().catch(() => null),
    getForecastAccuracyData().catch(() => null),
    getForecastStabilityData().catch(() => ({ stability_data: [] })),
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
