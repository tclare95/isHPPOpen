import useSWR from "swr";
import {fetcher} from "./fetcher";

export const useFetchedOpenSlots = (queryString) => {
    const { data, error, mutate } = useSWR("/api/allslots", fetcher); 
  
    const slotArray = data;
    const isPending = !data;
    console.log(queryString);
    return { slotArray, error, isPending, mutate};
  };