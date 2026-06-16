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
        className="w-full max-w-sm rounded-xl border border-border bg-panel/70 p-6"
      >
        <div className="font-mono text-[10px] tracking-[0.22em] text-faint">
          PERSONAL AGENT // ACCESS
        </div>
        <h1 className="mt-2 font-serif text-2xl italic text-text">Sign in.</h1>
        <p className="mt-1 text-sm text-muted">Single-operator console.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          className="mt-5 w-full rounded-lg border border-border bg-panel2 px-3 py-2 text-text outline-none focus:border-accent/60"
        />
        {error && <p className="mt-2 text-sm text-hot">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="mt-4 w-full rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-accent transition hover:bg-accent/20 disabled:opacity-40"
        >
          {loading ? "checking…" : "enter"}
        </button>
      </form>
    </main>
  );
}
