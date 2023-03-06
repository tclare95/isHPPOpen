import useSWR from "swr";
import {fetcher} from "./fetcher";

export const useFetchedEvents = (limit) => {
    const { data, error, mutate} = useSWR(`/api/events?limit=${limit}`, fetcher); 
    const eventData = data
    const isPending = !data
    // for compatability with existing code the split into data and count is done here
    return { eventData, error, isPending, mutate };
  

  };