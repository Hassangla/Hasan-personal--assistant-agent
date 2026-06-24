"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      window.location.href = "/";
    } else {
      setError("Incorrect password.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-[20px] border border-line bg-card p-8 shadow-card"
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-accent shadow-[0_3px_8px_-2px_rgba(199,95,63,0.5)]">
            <span className="h-[9px] w-[9px] rounded-full bg-white" />
          </span>
          <span className="font-display text-[16px] font-bold tracking-[-0.01em] text-ink">Personal Agent</span>
        </div>
        <h1 className="m-0 font-display text-[28px] font-extrabold tracking-[-0.02em] text-ink">Sign in.</h1>
        <p className="mt-1.5 text-[14px] text-ink2">Single-operator console.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          className="mt-5 w-full rounded-[11px] border border-line bg-cardalt px-3.5 py-2.5 text-[15px] text-ink outline-none transition focus:border-accent"
        />
        {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="mt-4 w-full rounded-[11px] bg-accent px-3 py-2.5 text-[13px] font-bold text-white shadow-accent transition hover:brightness-105 disabled:opacity-50"
        >
          {loading ? "Checking…" : "Enter"}
        </button>
      </form>
    </main>
  );
}
