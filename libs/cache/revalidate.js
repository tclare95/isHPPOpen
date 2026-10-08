import { revalidateTag } from "next/cache";

export async function revalidateTagsSafe(tags, options = {}) {
  const logger = options?.logger;
  const context = options?.context ?? "cache";

  for (const tag of tags) {
    try {
      // Admin writes must be visible on the next read, without serving stale content.
      await Promise.resolve(revalidateTag(tag, { expire: 0 }));
    } catch (error) {
      logger?.warn?.("Cache tag revalidation skipped", {
        context,
        tag,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
