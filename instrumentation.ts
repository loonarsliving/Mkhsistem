import { logger, serializeError } from "@/lib/logger";

/**
 * Next.js 15's built-in server-error hook: fires for uncaught errors in
 * route handlers, server actions, and RSC rendering. This is the server-side
 * half of error tracking — the client half lives in app/global-error.tsx and
 * app/(app)/error.tsx, which report through reportClientErrorAction.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | Array<string> | undefined> },
) {
  const serialized = serializeError(error);
  logger.error(serialized.message, {
    source: "server",
    path: request.path,
    method: request.method,
    stack: serialized.stack,
  });

  if (process.env.NEXT_RUNTIME !== "edge") {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const admin = createAdminClient();
      await admin.from("mkc_error_logs").insert({
        level: "error",
        source: "server",
        message: serialized.message,
        stack: serialized.stack,
        url: request.path,
        environment: process.env.NODE_ENV ?? "production",
        context: { method: request.method },
      });
    } catch (loggingError) {
      logger.error("Failed to persist server error log", { error: serializeError(loggingError).message });
    }
  }
}
