"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/games", label: "Games" },
  { href: "/team", label: "Team" },
  { href: "/season", label: "Season" },
  { href: "/dashboard", label: "Dashboard" },
];

/** Header links: hover only recolours and underlines; the current page stays lime + underlined. */
export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="flex items-center gap-4 overflow-x-auto text-[13px] font-bold uppercase tracking-wide sm:gap-7 sm:text-sm">
      {LINKS.map((l) => {
        const active = path === l.href || path.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap py-1 decoration-2 underline-offset-[6px] transition-colors hover:text-lime-strong hover:underline ${
              active ? "text-lime-strong underline" : "text-white"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
