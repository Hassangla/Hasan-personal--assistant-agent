"use client";

import { useEffect, useState } from "react";

// Tiny global toast system. Any client component fires `toast("Done ✓")`;
// the <Toaster/> in the root layout renders them bottom-center, warm-styled,
// auto-dismissing. No context/prop-drilling — a window CustomEvent is the bus.

export function toast(message: string, kind: "ok" | "err" = "ok") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("pa-toast", { detail: { message, kind } }));
}

type Item = { id: number; message: string; kind: "ok" | "err" };
let seq = 1;

export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const d = (e as CustomEvent).detail as { message: string; kind: "ok" | "err" };
      const id = seq++;
      setItems((list) => [...list.slice(-2), { id, message: d.message, kind: d.kind }]);
      setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 2600);
    }
    window.addEventListener("pa-toast", onToast);
    return () => window.removeEventListener("pa-toast", onToast);
  }, []);

  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[76px] z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6">
      {items.map((t) => (
        <div
          key={t.id}
          style={{ animation: "pa-toast-in 0.22s ease-out" }}
          className={`pointer-events-auto max-w-[92vw] rounded-[12px] border px-4 py-2.5 text-[13px] font-semibold shadow-[0_10px_30px_-10px_rgba(60,45,30,0.45)] backdrop-blur ${
            t.kind === "err"
              ? "border-[#E7C0B4] bg-[#FDF1EC] text-danger"
              : "border-[#DDE8DC] bg-[#F0F7EF] text-good"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
