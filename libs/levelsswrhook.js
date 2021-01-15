import useSWR from "swr";
import {fetcher} from "./fetcher";

export const useFetchedLevels = () => {
    const { data, error, mutate } = useSWR("https://api.ishppopen.co.uk/levels", fetcher); 
  
    const levelData = data
    const isPending = !data
  
    return { levelData, error, isPending };
  };