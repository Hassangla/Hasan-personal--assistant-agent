import "server-only";
import { AgentMailClient } from "agentmail";
import { requireEnv, optionalEnv } from "@/lib/config";

let client: AgentMailClient | null = null;

export function agentmail(): AgentMailClient {
  if (!client) {
    client = new AgentMailClient({ apiKey: requireEnv("AGENTMAIL_API_KEY") });
  }
  return client;
}

export function agentEmailAddress(): string {
  return optionalEnv("AGENT_EMAIL_ADDRESS") ?? "the agent inbox";
}

// Reply within an existing thread (subject becomes "Re: …" automatically).
export async function sendReply(
  inboxId: string,
  messageId: string,
  text: string,
): Promise<void> {
  await agentmail().inboxes.messages.reply(inboxId, messageId, { text });
}
