export type Cell = string | number | null | undefined;

/** RFC 4180 CSV. Opens cleanly in Excel and Google Sheets. */
export function toCsv(rows: readonly (readonly Cell[])[]): string {
  return rows
    .map((row) =>
      row
        .map((c) => {
          const s = c === null || c === undefined ? "" : String(c);
          return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
}

export function safeFilename(s: string): string {
  return s.replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "-").toLowerCase() || "export";
}
