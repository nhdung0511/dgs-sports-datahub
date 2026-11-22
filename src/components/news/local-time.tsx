"use client";

import { useEffect, useState } from "react";
import { formatTime } from "@/lib/news";

/** Time of day in the reader's own zone. Rendered after mount because the server's zone is not theirs. */
export function LocalTime({ iso, prefix }: { iso: string; prefix: string }) {
  const [text, setText] = useState("");
  useEffect(() => setText(formatTime(iso)), [iso]);
  return <span>{text ? `${prefix} ${text}` : ""}</span>;
}
