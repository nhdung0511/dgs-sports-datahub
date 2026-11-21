import Link from "next/link";

export const SITE_NAME = "DGS Sports Datahub";

/** Wordmark: lime "DGS" + aqua "sports datahub", built for the green header bar. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`whitespace-nowrap text-xl font-black tracking-tight sm:text-2xl ${className}`} aria-label={SITE_NAME}>
      <span className="text-lime-strong">DGS</span>
      <span className="text-cyan-strong"> sports datahub</span>
    </Link>
  );
}
