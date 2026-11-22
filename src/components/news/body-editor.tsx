"use client";

import { useRef, useState } from "react";
import { Markdown } from "./markdown";

/**
 * The one place that knows posts are markdown. Everything else passes a string in and out, so a
 * friendlier editor can replace this file without touching storage, pages or RLS.
 */
export function BodyEditor({
  value,
  onChange,
  disabled,
  id = "body",
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");

  /** Wrap the selection (or insert a placeholder) and keep the caret sensible. */
  function wrap(before: string, after = before, placeholder = "text") {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const sel = value.slice(a, b) || placeholder;
    onChange(value.slice(0, a) + before + sel + after + value.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + before.length, a + before.length + sel.length);
    });
  }
  /** Prefix every selected line, starting at the beginning of the first. */
  function prefixLines(prefix: string) {
    const el = ref.current;
    if (!el) return;
    const start = value.lastIndexOf("\n", el.selectionStart - 1) + 1;
    const end = el.selectionEnd;
    const block = value.slice(start, end) || "text";
    const next = block.split("\n").map((l) => prefix + l).join("\n");
    onChange(value.slice(0, start) + next + value.slice(end));
    requestAnimationFrame(() => el.focus());
  }

  const tools: { label: string; run: () => void }[] = [
    { label: "Bold", run: () => wrap("**") },
    { label: "Italic", run: () => wrap("*") },
    { label: "Heading", run: () => prefixLines("## ") },
    { label: "Link", run: () => wrap("[", "](https://)", "link text") },
    { label: "Quote", run: () => prefixLines("> ") },
    { label: "List", run: () => prefixLines("- ") },
  ];

  return (
    <div>
      <div role="tablist" aria-label="Editor view" className="mb-3 flex gap-6 md:hidden">
        {(["write", "preview"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`${id}-tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`${id}-${t}`}
            className="tab"
            aria-current={tab === t ? "page" : undefined}
            onClick={() => setTab(t)}
          >
            {t === "write" ? "Write" : "Preview"}
          </button>
        ))}
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <div id={`${id}-write`} role="tabpanel" aria-labelledby={`${id}-tab-write`} className={tab === "write" ? "block" : "hidden md:block"}>
          <div className="mb-2 flex flex-wrap gap-x-4" role="toolbar" aria-label="Formatting">
            {tools.map((t) => (
              <button
                key={t.label}
                type="button"
                className="sans inline-flex min-h-11 items-center text-[13px] font-semibold underline-offset-4 hover:underline disabled:opacity-50"
                disabled={disabled}
                onClick={t.run}
              >
                {t.label}
              </button>
            ))}
          </div>
          <label htmlFor={id} className="sr-only">
            Body
          </label>
          <textarea
            ref={ref}
            id={id}
            className="field editor-body"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Write in plain text. Use the buttons above for bold, links and headings."
          />
          <p className="field-hint mt-1 tnum">{value.length.toLocaleString("en-US")} / 50,000</p>
        </div>

        <div id={`${id}-preview`} role="tabpanel" aria-labelledby={`${id}-tab-preview`} className={tab === "preview" ? "block" : "hidden md:block"}>
          <p className="label mb-3 md:mt-[52px]">Preview</p>
          {value.trim() ? <Markdown>{value}</Markdown> : <p className="muted">Nothing to preview yet.</p>}
        </div>
      </div>
    </div>
  );
}
