// Register the Telegram webhook to point at your deployment.
//
//   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
//     node scripts/set-telegram-webhook.mjs https://your-app.vercel.app
//
// Run again any time the URL or secret changes. To inspect the current state:
//   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"

const base = process.argv[2];
if (!base) {
  console.error("Usage: node scripts/set-telegram-webhook.mjs <https-base-url>");
  process.exit(1);
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!token || !secret) {
  console.error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in the environment first.");
  process.exit(1);
}

const url = `${base.replace(/\/$/, "")}/api/telegram/webhook`;
const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
  }),
});

const json = await res.json();
console.log(JSON.stringify(json, null, 2));
if (!json.ok) process.exit(1);
console.log(`\nWebhook set → ${url}`);
