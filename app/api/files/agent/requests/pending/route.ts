import { NextResponse } from "next/server";

import { requireFileAgentAuth } from "@/lib/security/file-agent-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Polled by the Mac Mini agent (Filemanager repo) -- there is no push
 * channel to it (no public URL, home network), so it asks "anything for me
 * to deliver?" on an interval. Only ever returns requests already resolved
 * to exactly one file (status='matched', set by
 * lib/ai/domains/file-request.ts when the WhatsApp requester's query had
 * one confident match) -- ambiguous/no_match requests are handled entirely
 * on the WhatsApp side and never reach the agent.
 */
export async function GET(request: Request) {
  const unauthorized = requireFileAgentAuth(request);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("mkc_file_requests")
    .select("id, wa_phone_number, raw_query, created_at, file:mkc_files!matched_file_id(agent_relative_path, original_filename, mime_type, size_bytes)")
    .eq("status", "matched")
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }

  const requests = (data ?? [])
    .filter((row) => row.file)
    .map((row) => {
      const file = row.file as unknown as { agent_relative_path: string; original_filename: string; mime_type: string | null; size_bytes: number };
      return {
        requestId: row.id,
        waPhoneNumber: row.wa_phone_number,
        rawQuery: row.raw_query,
        createdAt: row.created_at,
        agentRelativePath: file.agent_relative_path,
        originalFilename: file.original_filename,
        mimeType: file.mime_type,
        sizeBytes: file.size_bytes,
      };
    });

  return NextResponse.json({ status: "ok", requests });
}
