import useSWR from 'swr';
import { fetcher } from './fetcher';

export default function useFetch(path, options = {}) {
  const { fallbackData } = options;
  const { data, error, mutate } = useSWR(path, fetcher, { fallbackData });
  const isPending = !data && !error;
  return { data, error, isPending, mutate };
}
