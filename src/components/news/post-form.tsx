"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { savePost, type FormState } from "@/app/news/actions";
import { CATEGORIES, STATUS_LABEL, type Category, type PostStatus } from "@/lib/news";
import { BodyEditor } from "./body-editor";

export interface PostFormValues {
  id?: string;
  title: string;
  summary: string;
  body: string;
  category: Category;
  authorName: string;
  status: PostStatus;
}

const AUTHOR_KEY = "news-author";
const safe = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode: the draft mirror is a convenience only */
    }
  },
  del: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* same */
    }
  },
};

export function PostForm({ initial, isAdmin, saved }: { initial: PostFormValues; isAdmin: boolean; saved?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(savePost, {});
  const [v, setV] = useState(initial);
  const set = <K extends keyof PostFormValues>(k: K, val: PostFormValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const key = `news-draft:${initial.id ?? "new"}`;
  const [restore, setRestore] = useState<{ v: PostFormValues; at: number } | null>(null);
  const submitting = useRef(false);

  const dirty =
    v.title !== initial.title || v.summary !== initial.summary || v.body !== initial.body ||
    v.category !== initial.category || v.authorName !== initial.authorName;

  // Prefill the byline with the last name this writer used.
  useEffect(() => {
    if (!initial.authorName) {
      const last = safe.get(AUTHOR_KEY);
      if (last) setV((p) => (p.authorName ? p : { ...p, authorName: last }));
    }
  }, [initial.authorName]);

  // Offer to restore text that never reached the server (tab closed, network drop, error).
  useEffect(() => {
    const raw = safe.get(key);
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as { v: PostFormValues; at: number };
      if (d.v.title !== initial.title || d.v.body !== initial.body) setRestore(d);
    } catch {
      safe.del(key);
    }
  }, [key, initial.title, initial.body]);

  // Mirror to localStorage every few seconds while there are unsaved changes.
  const latest = useRef(v);
  latest.current = v;
  useEffect(() => {
    if (!dirty) return;
    const t = setInterval(() => {
      if (!submitting.current) safe.set(key, JSON.stringify({ v: latest.current, at: Date.now() }));
    }, 3000);
    return () => clearInterval(t);
  }, [dirty, key]);

  // Warn before leaving with unsaved changes, except while our own submit is navigating away.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty && !submitting.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  useEffect(() => {
    if (state.error) submitting.current = false;
  }, [state]);

  const mins = restore ? Math.max(1, Math.round((Date.now() - restore.at) / 60000)) : 0;
  const status = initial.id ? initial.status : "draft";
  const btn = (intent: string, label: string, cls = "btn") => (
    <button type="submit" name="intent" value={intent} className={cls} disabled={pending}>
      {label}
    </button>
  );

  return (
    <form
      action={action}
      onSubmit={() => {
        submitting.current = true;
        safe.set(AUTHOR_KEY, v.authorName);
        safe.del(key);
      }}
      className="space-y-6"
    >
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="body" value={v.body} />

      <p className="sans flex items-center gap-2 text-[13px]">
        <span className={`dot dot-${status}`} aria-hidden />
        {initial.id ? STATUS_LABEL[status] : "New post"}
      </p>

      {restore && (
        <div className="notice flex flex-wrap items-center gap-x-4 gap-y-1" role="status">
          <span>Restore unsaved text from {mins} {mins === 1 ? "minute" : "minutes"} ago?</span>
          <button type="button" className="font-semibold underline underline-offset-4" onClick={() => { setV(restore.v); setRestore(null); }}>
            Restore
          </button>
          <button type="button" className="underline underline-offset-4" onClick={() => { safe.del(key); setRestore(null); }}>
            Discard
          </button>
        </div>
      )}
      {saved && !state.error && !dirty && (
        <p className="notice" role="status">
          Saved.
        </p>
      )}
      {state.error && (
        <p className="notice notice-error" role="alert">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="title" className="field-label">
          Headline
        </label>
        <input id="title" name="title" className="field" required maxLength={140} value={v.title} onChange={(e) => set("title", e.target.value)} />
      </div>

      <div>
        <label htmlFor="summary" className="field-label">
          Summary <span className="field-hint">Shown under the headline and in link previews. Optional.</span>
        </label>
        <textarea id="summary" name="summary" className="field" rows={2} maxLength={300} value={v.summary} onChange={(e) => set("summary", e.target.value)} />
        <p className="field-hint tnum mt-1">{v.summary.length} / 300</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="category" className="field-label">
            Category
          </label>
          <select id="category" name="category" className="field" value={v.category} onChange={(e) => set("category", e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="authorName" className="field-label">
            Written by
          </label>
          <input id="authorName" name="authorName" className="field" required maxLength={80} autoComplete="name" value={v.authorName} onChange={(e) => set("authorName", e.target.value)} />
        </div>
      </div>

      <BodyEditor value={v.body} onChange={(b) => set("body", b)} disabled={pending} />

      <div className="rule flex flex-wrap gap-3 border-t pt-6">
        {status === "draft" && (
          <>
            {btn("save", "Save draft")}
            {btn("submit", "Submit for review", isAdmin ? "btn" : "btn btn-primary")}
            {isAdmin && btn("publish", "Publish", "btn btn-primary")}
          </>
        )}
        {status === "submitted" && (
          <>
            {btn("save", "Save")}
            {btn("draft", "Back to draft")}
            {isAdmin && btn("publish", "Publish", "btn btn-primary")}
          </>
        )}
        {status === "published" && isAdmin && (
          <>
            {btn("publish", "Save changes", "btn btn-primary")}
            {btn("unpublish", "Unpublish")}
          </>
        )}
      </div>
    </form>
  );
}
