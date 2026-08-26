import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { requireFileAgentAuth } from "@/lib/security/file-agent-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CategoryInput {
  /** Breadcrumb of names from root to this category, e.g. ["Legal", "Kontrak"]. Sent in top-down order (parents before children) by the agent. */
  path: string[];
}

interface FileInput {
  agentRelativePath: string;
  originalFilename: string;
  displayName?: string;
  extension?: string | null;
  mimeType?: string | null;
  sizeBytes: number;
  checksumSha256?: string | null;
  tags?: string[];
  description?: string | null;
  /** Same breadcrumb shape as CategoryInput.path, or null/omitted for an uncategorized file. */
  categoryPath?: string[] | null;
}

interface SyncBody {
  categories?: CategoryInput[];
  files?: FileInput[];
  /** When true, any mkc_files row NOT present in this payload (by agent_relative_path) is marked deleted -- the agent's periodic full-catalog resync. When false/omitted, this call only upserts what it sends (an incremental update from the file watcher). */
  fullSync?: boolean;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

type AdminClient = ReturnType<typeof createAdminClient>;

/** Resolves (creating as needed) every category breadcrumb to its leaf id, keyed by "Name/Name/Name" for reuse across the request. */
async function resolveCategoryPaths(supabase: AdminClient, paths: string[][]): Promise<Map<string, string>> {
  const idByPathKey = new Map<string, string>();

  // Sort by depth so a parent is always resolved (and inserted) before any
  // child breadcrumb that depends on it, regardless of the order the agent
  // sent them in.
  const sortedPaths = [...paths].sort((a, b) => a.length - b.length);

  for (const path of sortedPaths) {
    if (path.length === 0) continue;
    let parentId: string | null = null;
    let pathKey = "";
    for (const name of path) {
      pathKey = pathKey ? `${pathKey}/${name}` : name;
      const cached = idByPathKey.get(pathKey);
      if (cached) {
        parentId = cached;
        continue;
      }

      const slug = slugify(name);
      const matchFilter: { slug: string; parent_id: string | null } = { slug, parent_id: parentId };
      const existingResponse = await supabase.from("mkc_file_categories").select("id").match(matchFilter).maybeSingle();
      let categoryId: string | null = existingResponse.data?.id ?? null;

      if (!categoryId) {
        const insertPayload: { name: string; slug: string; parent_id: string | null } = { name, slug, parent_id: parentId };
        const insertResponse = await supabase.from("mkc_file_categories").insert(insertPayload).select("id").maybeSingle();
        if (insertResponse.error || !insertResponse.data) {
          logger.warn("files/agent/sync: failed to create category", { name, parentId, error: insertResponse.error?.message });
          break;
        }
        categoryId = insertResponse.data.id;
      }

      idByPathKey.set(pathKey, categoryId as string);
      parentId = categoryId;
    }
  }

  return idByPathKey;
}

/**
 * Called by the Mac Mini local agent (Filemanager repo) to push its file
 * catalog (metadata only -- see migration 0245's header comment for why the
 * actual bytes never come here). The agent is expected to call this
 * periodically (e.g. after its folder watcher detects a change, plus a
 * full resync on a longer interval) rather than this app ever reaching out
 * to the agent -- the agent has no public URL (home network, no port
 * forwarding), so every connection in this integration is agent-initiated.
 */
export async function POST(request: Request) {
  const unauthorized = requireFileAgentAuth(request);
  if (unauthorized) return unauthorized;

  let body: SyncBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", error: "invalid JSON body" }, { status: 400 });
  }

  const categories = Array.isArray(body.categories) ? body.categories : [];
  const files = Array.isArray(body.files) ? body.files : [];
  const supabase = createAdminClient();

  const allPaths = [...categories.map((c) => c.path), ...files.map((f) => f.categoryPath).filter((p): p is string[] => Array.isArray(p) && p.length > 0)];
  const categoryIdByPath = await resolveCategoryPaths(supabase, allPaths);

  let filesUpserted = 0;
  const seenPaths: string[] = [];
  for (const file of files) {
    if (!file.agentRelativePath || !file.originalFilename || typeof file.sizeBytes !== "number") continue;
    seenPaths.push(file.agentRelativePath);
    const categoryId = file.categoryPath && file.categoryPath.length > 0 ? (categoryIdByPath.get(file.categoryPath.join("/")) ?? null) : null;

    const { error } = await supabase
      .from("mkc_files")
      .upsert(
        {
          agent_relative_path: file.agentRelativePath,
          original_filename: file.originalFilename,
          display_name: file.displayName?.trim() || file.originalFilename,
          extension: file.extension ?? null,
          mime_type: file.mimeType ?? null,
          size_bytes: file.sizeBytes,
          checksum_sha256: file.checksumSha256 ?? null,
          tags: file.tags ?? [],
          description: file.description ?? null,
          category_id: categoryId,
          is_deleted: false,
          indexed_at: new Date().toISOString(),
        },
        { onConflict: "agent_relative_path" },
      );
    if (error) {
      logger.warn("files/agent/sync: failed to upsert file", { path: file.agentRelativePath, error: error.message });
      continue;
    }
    filesUpserted++;
  }

  let markedDeleted = 0;
  if (body.fullSync && seenPaths.length > 0) {
    const { data: deletedRows } = await supabase
      .from("mkc_files")
      .update({ is_deleted: true })
      .eq("is_deleted", false)
      .not("agent_relative_path", "in", `(${seenPaths.map((p) => `"${p.replace(/"/g, '\\"')}"`).join(",")})`)
      .select("id");
    markedDeleted = deletedRows?.length ?? 0;
  }

  return NextResponse.json({ status: "ok", categoriesResolved: categoryIdByPath.size, filesUpserted, markedDeleted });
}
