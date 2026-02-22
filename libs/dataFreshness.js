export const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
export const SIX_HOURS_SECONDS = 6 * 60 * 60;

export const HOME_ISR_REVALIDATE_SECONDS = SIX_HOURS_SECONDS;

export const SWR_15_MINUTES = {
  refreshInterval: FIFTEEN_MINUTES_MS,
  revalidateOnFocus: true,
  revalidateIfStale: true,
};

export const SWR_EDITORIAL = {
  refreshInterval: 0,
  revalidateOnFocus: true,
  revalidateIfStale: true,
};
