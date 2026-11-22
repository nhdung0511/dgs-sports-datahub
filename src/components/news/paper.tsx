/** Reading surface for /news pages: paper background and the shared container width. */
export function Paper({ children, narrow = false }: { children: React.ReactNode; narrow?: boolean }) {
  return (
    <div className="news">
      <main className={`mx-auto px-4 pb-16 pt-8 sm:px-8 sm:pt-12 ${narrow ? "max-w-[680px]" : "max-w-6xl"}`}>{children}</main>
    </div>
  );
}
