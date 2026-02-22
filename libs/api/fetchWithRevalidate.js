import { API_OPERATIONAL_REVALIDATE_SECONDS } from "../dataFreshness";

export function fetchWithOperationalRevalidate(url, init = {}) {
  return fetch(url, {
    ...init,
    next: {
      ...init?.next,
      revalidate: API_OPERATIONAL_REVALIDATE_SECONDS,
    },
  });
}
