"use client";

import { useState } from "react";
import { btnPrimary, card, input, label } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    // With a password, sign in directly (no email sent); otherwise email a magic link.
    if (password) {
      const { error } = await createClient().auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setState("error");
      } else {
        // Full navigation so the server sees the new session cookies.
        window.location.assign(next);
      }
      return;
    }
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setError(error.message);
      setState("error");
    } else {
      setState("sent");
    }
  }

  if (state === "sent") {
    return (
      <div className={`${card} mt-8 p-6 text-center`}>
        <p className="text-4xl">✉</p>
        <h2 className="mt-2 text-xl font-bold">Check your email</h2>
        <p className="mt-1 text-sm text-muted">
          We sent a sign-in link to <b className="text-fg">{email}</b>. Open it on this device.
        </p>
        <button onClick={() => setState("idle")} className="mt-4 text-sm font-medium text-cyan underline">
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={`${card} mt-8 space-y-4 p-6`}>
      <div>
        <label htmlFor="email" className={label}>
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={input}
        />
      </div>
      <div>
        <label htmlFor="password" className={label}>
          Password (optional)
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Leave blank to get an email link"
          className={input}
        />
      </div>
      {state === "error" && <p className="text-sm text-opp">{error}</p>}
      <button type="submit" disabled={state === "sending"} className={`${btnPrimary} w-full`}>
        {state === "sending"
          ? password
            ? "Signing in…"
            : "Sending…"
          : password
            ? "Sign in"
            : "Email me a sign-in link"}
      </button>
    </form>
  );
}
