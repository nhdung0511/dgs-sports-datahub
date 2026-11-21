"use client";

import { toCsv, type Cell } from "@/lib/csv";
import { btnGhost } from "./ui";

/** Downloads rows as a .csv file, generated in the browser. */
export function CsvButton({
  filename,
  rows,
  label = "Download CSV",
}: {
  filename: string;
  rows: Cell[][] | (() => Cell[][]);
  label?: string;
}) {
  function download() {
    const data = typeof rows === "function" ? rows() : rows;
    // BOM so Excel reads UTF-8 names correctly.
    const blob = new Blob(["﻿" + toCsv(data)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button type="button" onClick={download} className={btnGhost}>
      ⤓ {label}
    </button>
  );
}
