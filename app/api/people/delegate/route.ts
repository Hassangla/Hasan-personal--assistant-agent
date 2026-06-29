import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { executeTool } from "@/lib/agent/execute";

// Delegate a task to a person from the People page: create the task, mark it
// delegated (so it shows in "I'm Chasing" immediately), and queue an email to
// the person describing it. The email is IRREVERSIBLE, so it routes through the
// approval gate (lands in Approvals + a Telegram Approve/Reject) — it sends once
// you approve. Auth via middleware.
export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!title || !name) return NextResponse.json({ error: "task and person are required" }, { status: 400 });

  // 1. Create + delegate the task → appears in "I'm Chasing" right away.
  const created = (await executeTool("create_task", { title }, { userId: USER_ID })) as Record<string, unknown>;
  if (created && typeof created === "object" && "error" in created) {
    return NextResponse.json({ error: String(created.error) }, { status: 400 });
  }
  if (created?.id) {
    await executeTool("delegate_task", { task_id: created.id, person: name }, { userId: USER_ID });
  }

  // 2. Queue the email through the approval gate (send_email is irreversible).
  let emailQueued = false;
  if (email) {
    await executeTool(
      "send_email",
      {
        to: email,
        subject: `Request: ${title}`,
        body: `Hi ${name},\n\nCould you take care of the following for me?\n\n• ${title}\n\nThanks — much appreciated.`,
      },
      { userId: USER_ID },
    );
    emailQueued = true;
  }

  return NextResponse.json({ ok: true, delegated: true, emailQueued });
}
