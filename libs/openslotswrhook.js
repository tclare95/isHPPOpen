import useSWR from "swr";
import {fetcher} from "./fetcher";

export const useFetchedOpenSlots = () => {
    const { data, error, mutate } = useSWR("/api/openslot", fetcher); 
  
    const slotArray = data
    const isPending = !data
  
    return { slotArray, error, isPending };
  };