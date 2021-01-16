import useSWR from "swr";
import {fetcher} from "./fetcher";

export const useFetchedEvents = () => {
    const { data, error, mutate } = useSWR("/api/events", fetcher); 
    //checking for presence of data
    const eventData = data
    const isPending = !data
  
    return { eventData, error, isPending };
  };