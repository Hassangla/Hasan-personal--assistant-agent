"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/app/Toast";

// Enable Web Push on this device. On iPhone/iPad, Apple requires the site to
// be installed to the Home Screen first (iOS 16.4+); this walks the user
// through it and knows which state the device is in.
export function NotificationsSetup() {
  const [state, setState] = useState<
    "loading" | "unsupported" | "needs-install" | "ready" | "enabled" | "denied"
  >("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState(isIOS && !standalone ? "needs-install" : "unsupported");
      return;
    }
    if (isIOS && !standalone) {
      setState("needs-install");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "enabled" : "ready");
    });
  }, []);

  async function enable() {
    if (busy) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const { key } = await fetch("/api/push/public-key").then((r) => r.json());
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error();
      setState("enabled");
      toast("Notifications enabled on this device 🔔");
    } catch {
      toast("Couldn't enable notifications — try again", "err");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (busy) return;
    setBusy(true);
    try {
      const j = await fetch("/api/push/test", { method: "POST" }).then((r) => r.json());
      toast(j.sent > 0 ? `Test sent to ${j.sent} device(s)` : "No devices registered yet", j.sent > 0 ? "ok" : "err");
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "rounded-[8px] bg-accent px-3 py-1.5 text-[12px] font-bold text-[#0C0D10] shadow-accent transition hover:brightness-105 disabled:opacity-50";
  const ghost =
    "rounded-[8px] border border-line bg-card px-3 py-1.5 text-[12px] font-semibold text-ink2 transition hover:border-[#3A3F47] hover:text-[#E4E2DC] disabled:opacity-50";

  return (
    <div className="mt-4 rounded-[12px] border border-line2 bg-cardalt px-3.5 py-3">
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink3">🔔 On this device</div>
      {state === "loading" && <p className="m-0 text-[12.5px] text-ink3">Checking…</p>}
      {state === "unsupported" && (
        <p className="m-0 text-[12.5px] leading-normal text-ink2">This browser doesn't support push notifications.</p>
      )}
      {state === "needs-install" && (
        <div className="text-[12.5px] leading-normal text-ink2">
          <p className="m-0 mb-1.5">
            One Apple requirement first: <b>add this site to your Home Screen</b>, then enable notifications from the
            installed app.
          </p>
          <ol className="m-0 space-y-1 pl-4">
            <li>
              Tap the <b>Share</b> button (□↑) in Safari
            </li>
            <li>
              Choose <b>Add to Home Screen</b> → Add
            </li>
            <li>
              Open <b>Agent</b> from the Home Screen and tap Enable here
            </li>
          </ol>
        </div>
      )}
      {state === "ready" && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="m-0 basis-full text-[12.5px] leading-normal text-ink2">
            Get task reminders and meeting alerts right on this device — same content as Telegram, delivered natively.
          </p>
          <button onClick={enable} disabled={busy} className={btn}>
            {busy ? "Enabling…" : "Enable notifications"}
          </button>
        </div>
      )}
      {state === "enabled" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-semibold text-good">✓ Enabled on this device</span>
          <button onClick={sendTest} disabled={busy} className={ghost}>
            {busy ? "Sending…" : "Send a test"}
          </button>
        </div>
      )}
      {state === "denied" && (
        <p className="m-0 text-[12.5px] leading-normal text-ink2">
          Notifications are blocked for this app in system settings — enable them under Settings → Notifications →
          Agent, then reload.
        </p>
      )}
    </div>
  );
}
