import useSWR from 'swr';
import { fetcher } from './fetcher';

export default function useFetch(path) {
  const { data, error, mutate } = useSWR(path, fetcher);
  const isPending = !data && !error;
  return { data, error, isPending, mutate };
}
