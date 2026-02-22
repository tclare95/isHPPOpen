import WaterQualityPage from '../../components/pages/water-quality-page';
import { getLatestWaterQualityData } from '../../libs/services/waterQualityService';

export const revalidate = 300;

export const metadata = {
  title: 'Water Quality Dashboard',
  description: 'Live combined sewer overflow map and density metrics for the Trent catchment.',
};

export default async function WaterQuality() {
  let currentData = null;

  try {
    currentData = await getLatestWaterQualityData();
  } catch (error) {
    console.error('Failed to load water quality page data', error);
  }

  return <WaterQualityPage currentData={currentData} />;
}
