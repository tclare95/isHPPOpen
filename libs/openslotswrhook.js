import useSWR from "swr";
import {fetcher} from "./fetcher";

export const useFetchedOpenSlots = () => {
    const { data, error, mutate } = useSWR("https://api.ishppopen.co.uk/openslot?limit=28", fetcher); 
  
    const slotArray = data
    const isPending = !data
  
    return { slotArray, error, isPending };
  };