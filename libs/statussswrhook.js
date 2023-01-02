import useSWR from "swr";
import {fetcher} from "./fetcher";

export const useFetchedStatus = () => {
    const { data, error, mutate } = useSWR("/api/hppstatus", fetcher); 
  
    const statusData = data
    const isPending = !data
  
    return { statusData, error, isPending };
  };