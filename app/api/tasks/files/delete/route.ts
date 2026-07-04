import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

// Remove a task attachment: storage object + metadata row. Auth via middleware.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const fileId = typeof body.file_id === "string" ? body.file_id.trim() : "";
  if (!fileId) return NextResponse.json({ error: "file_id required" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from("task_files")
    .select("id,path")
    .eq("id", fileId)
    .eq("user_id", USER_ID)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  await sb.storage.from("task-files").remove([row.path]);
  await sb.from("task_files").delete().eq("id", row.id).eq("user_id", USER_ID);
  return NextResponse.json({ ok: true });
}
