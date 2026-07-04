import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

// Attach a file to a task (multipart form: task_id + file). Stored in the
// private task-files bucket; downloads go through short-lived signed URLs
// minted by /api/task. Auth via middleware. Vercel caps request bodies at
// ~4.5MB, so uploads are limited to 4MB.
export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart form-data expected" }, { status: 400 });
  }
  const taskId = String(form.get("task_id") ?? "").trim();
  const file = form.get("file");
  if (!taskId || !(file instanceof File)) {
    return NextResponse.json({ error: "task_id and file required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file too large — 4 MB max" }, { status: 413 });
  }

  const sb = supabaseAdmin();
  const { data: task } = await sb.from("tasks").select("id").eq("id", taskId).eq("user_id", USER_ID).maybeSingle();
  if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });

  const safeName = (file.name || "file").replace(/[^\w.\- ()]/g, "_").slice(0, 120);
  const path = `${USER_ID}/${taskId}/${crypto.randomUUID()}-${safeName}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await sb.storage.from("task-files").upload(path, buf, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  const { data: row, error: insErr } = await sb
    .from("task_files")
    .insert({
      user_id: USER_ID,
      task_id: taskId,
      name: safeName,
      path,
      size_bytes: file.size,
      mime: file.type || null,
    })
    .select("id,name,size_bytes")
    .single();
  if (insErr) {
    await sb.storage.from("task-files").remove([path]);
    return NextResponse.json({ error: insErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, file: { id: row.id, name: row.name, size: row.size_bytes } });
}
