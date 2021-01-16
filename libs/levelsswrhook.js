import useSWR from "swr";
import {fetcher} from "./fetcher";

export const useFetchedLevels = () => {
    const { data, error, mutate } = useSWR("/api/levels", fetcher); 
  
    const levelData = data
    const isPending = !data
  
    return { levelData, error, isPending };
  };