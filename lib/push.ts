import "server-only";
import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabase/server";

// Web Push (works on iPhone/iPad 16.4+ once the site is added to the Home
// Screen, and on desktop browsers directly). The VAPID keypair is generated
// once on first use and kept in app_config — no manual env setup.

const VAPID_SUBJECT = "mailto:hassan_gla@yahoo.com";

let cached: { publicKey: string; privateKey: string } | null = null;

export async function getVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  if (cached) return cached;
  const sb = supabaseAdmin();
  const { data } = await sb.from("app_config").select("key,value").in("key", ["vapid_public", "vapid_private"]);
  const map = new Map(((data ?? []) as any[]).map((r) => [r.key, r.value]));
  let publicKey = map.get("vapid_public");
  let privateKey = map.get("vapid_private");
  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    // upsert so a concurrent first-call race settles on one pair
    await sb.from("app_config").upsert(
      [
        { key: "vapid_public", value: publicKey },
        { key: "vapid_private", value: privateKey },
      ],
      { onConflict: "key", ignoreDuplicates: true },
    );
    const { data: again } = await sb.from("app_config").select("key,value").in("key", ["vapid_public", "vapid_private"]);
    const m2 = new Map(((again ?? []) as any[]).map((r) => [r.key, r.value]));
    publicKey = m2.get("vapid_public") ?? publicKey;
    privateKey = m2.get("vapid_private") ?? privateKey;
  }
  cached = { publicKey: publicKey!, privateKey: privateKey! };
  return cached;
}

export async function savePushSubscription(
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  ua?: string,
): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      ua: ua?.slice(0, 200) ?? null,
    },
    { onConflict: "endpoint" },
  );
}

export type PushPayload = { title: string; body?: string; url?: string };

// Send to every registered device; prune subscriptions the service rejects.
export async function sendPushToAll(userId: string, payload: PushPayload): Promise<number> {
  const sb = supabaseAdmin();
  const { data: subs } = await sb.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", userId);
  if (!subs || !subs.length) return 0;

  const { publicKey, privateKey } = await getVapidKeys();
  webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);

  let sent = 0;
  await Promise.all(
    (subs as any[]).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 3600 },
        );
        sent++;
      } catch (e: any) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) {
          await sb.from("push_subscriptions").delete().eq("id", s.id);
        } else {
          console.error("[push] send failed:", code, String(e?.body ?? e).slice(0, 120));
        }
      }
    }),
  );
  return sent;
}
