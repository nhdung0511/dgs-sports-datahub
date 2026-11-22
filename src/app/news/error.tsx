"use client";

import { Paper } from "@/components/news/paper";

export default function NewsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Paper>
      <div role="alert" className="max-w-[680px]">
        <h1 className="h-page">News</h1>
        <p className="mt-6 text-xl">Couldn’t load posts. Refresh to try again.</p>
        <button type="button" className="btn btn-primary mt-6" onClick={reset}>
          Refresh
        </button>
      </div>
    </Paper>
  );
}
