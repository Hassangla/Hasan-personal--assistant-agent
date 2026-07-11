import "server-only";
import { AREAS } from "@/lib/areas";
import { sendMessage, type InlineKeyboard, type InlineButton } from "@/lib/telegram/client";

// Seven area buttons, two per row → tap to file a task's area.
export function areaKeyboard(taskId: string): InlineKeyboard {
  const rows: InlineKeyboard = [];
  for (let i = 0; i < AREAS.length; i += 2) {
    const row: InlineButton[] = [{ text: AREAS[i]!, callback_data: `ta:${taskId}:${i}` }];
    const next = AREAS[i + 1];
    if (next) row.push({ text: next, callback_data: `ta:${taskId}:${i + 1}` });
    rows.push(row);
  }
  return rows;
}

export function priorityRow(taskId: string): InlineButton[] {
  return [
    { text: "P1 · high", callback_data: `tp:${taskId}:1` },
    { text: "P2 · normal", callback_data: `tp:${taskId}:2` },
    { text: "P3 · low", callback_data: `tp:${taskId}:3` },
  ];
}

export function followupKeyboard(taskId: string, delegated: boolean): InlineKeyboard {
  if (delegated) {
    return [
      [
        { text: "✅ They finished", callback_data: `dg:${taskId}:done` },
        { text: "⏳ Still pending", callback_data: `dg:${taskId}:pending` },
      ],
      [{ text: "🗑 Drop", callback_data: `fu:${taskId}:drop` }],
    ];
  }
  return [
    [
      { text: "✅ Done", callback_data: `fu:${taskId}:done` },
      { text: "⏰ +1h", callback_data: `fu:${taskId}:snooze1h` },
      { text: "😴 1 day", callback_data: `fu:${taskId}:snooze1d` },
    ],
    [
      { text: "🕒 Pick a time…", callback_data: `fu:${taskId}:snoozeask` },
      { text: "👤 Delegate", callback_data: `fu:${taskId}:delegate` },
      { text: "🗑 Drop", callback_data: `fu:${taskId}:drop` },
    ],
  ];
}

// Sent right after a task is created so the user picks area + priority in a tap.
export async function sendTaskOptions(
  taskId: string,
  title: string,
  areaMissing: boolean,
  chatId?: string,
): Promise<void> {
  const buttons: InlineKeyboard = [];
  if (areaMissing) buttons.push(...areaKeyboard(taskId));
  buttons.push(priorityRow(taskId));
  buttons.push([{ text: "👤 Delegate", callback_data: `fu:${taskId}:delegate` }]);
  await sendMessage(
    areaMissing
      ? `Filed: "${title}". Which area, and how urgent?`
      : `Filed: "${title}". How urgent?`,
    { chatId, buttons },
  );
}
