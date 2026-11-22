import { Paper } from "@/components/news/paper";

/** Plain rules where the list will be: no spinner, no shimmer. */
export default function Loading() {
  return (
    <Paper>
      <div role="status" aria-live="polite">
        <h1 className="h-page">News</h1>
        <p className="sans muted mt-3 text-[15px]">Loading posts…</p>
        <div className="rule mt-6 border-t" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="rule border-t py-6" aria-hidden>
            <div className="h-3 w-20" style={{ background: "var(--news-fill)" }} />
            <div className="mt-4 h-6 w-3/4" style={{ background: "var(--news-fill)" }} />
          </div>
        ))}
      </div>
    </Paper>
  );
}
