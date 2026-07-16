import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizeLabels } from "@/lib/labels";

// Set a task's labels: {task_id, labels: string[]}. Unknown keys are dropped;
// the array is stored canonicalised (recognised keys, de-duped, ordered).
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const taskId = typeof body.task_id === "string" ? body.task_id.trim() : "";
  if (!taskId) return NextResponse.json({ error: "task_id required" }, { status: 400 });
  const labels = normalizeLabels(body.labels);

  const { error } = await supabaseAdmin()
    .from("tasks")
    .update({ labels })
    .eq("id", taskId)
    .eq("user_id", USER_ID);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, labels });
}
