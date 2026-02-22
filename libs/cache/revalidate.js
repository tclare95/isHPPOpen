import { revalidateTag } from "next/cache";

export async function revalidateTagsSafe(tags, options = {}) {
  const logger = options?.logger;
  const context = options?.context ?? "cache";

  for (const tag of tags) {
    try {
      await Promise.resolve(revalidateTag(tag));
    } catch (error) {
      logger?.warn?.("Cache tag revalidation skipped", {
        context,
        tag,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
