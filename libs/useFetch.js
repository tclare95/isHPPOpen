import useSWR from 'swr';
import { fetcher } from './fetcher';

export default function useFetch(path, options = undefined) {
  const { data, error, mutate } = useSWR(path, fetcher, options);
  const isPending = !data && !error;
  return { data, error, isPending, mutate };
}
