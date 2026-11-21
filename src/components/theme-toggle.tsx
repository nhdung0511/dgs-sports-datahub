"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "theme";

/** Runs in <head> before paint so the page never flashes the wrong theme. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${KEY}");if(!t){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}if(t==="dark")document.documentElement.classList.add("dark")}catch(e){}})();`;

export function ThemeToggle({ className = "", onBrand = false }: { className?: string; onBrand?: boolean }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // storage blocked: theme still switches for this visit
    }
    setTheme(next);
  }

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={`inline-flex h-10 items-center gap-2 rounded-full border px-3 text-sm font-medium transition ${
        onBrand
          ? "border-white/40 text-white hover:border-lime-strong hover:text-lime-strong"
          : "border-line bg-card text-fg hover:border-lime"
      } ${className}`}
    >
      <span aria-hidden className="text-base">
        {isDark ? "☀" : "☾"}
      </span>
      <span>{theme === null ? "Theme" : isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
