"use client";

import { useEffect, useRef, useState } from "react";

/** One control: native share sheet if the browser has one, otherwise copy the link and say so in place. */
export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      /* User dismissed the share sheet, or the clipboard is blocked: nothing to report. */
    }
  }

  return (
    <button type="button" className="pill" onClick={share} aria-live="polite">
      {copied ? "Link copied" : "Share article"}
    </button>
  );
}
