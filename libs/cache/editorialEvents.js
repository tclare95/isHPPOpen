import { revalidateTagsSafe } from "./revalidate";
import { CACHE_TAGS } from "./tags";

/** Expires the event list and homepage snapshot after a persisted event write. */
export function revalidateEventCaches(logger, context) {
  return revalidateTagsSafe([CACHE_TAGS.EVENTS, CACHE_TAGS.HOME_SNAPSHOT], { logger, context });
}
