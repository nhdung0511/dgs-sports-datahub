import { existsSync } from "node:fs";
import path from "node:path";
import Image from "next/image";

/**
 * Hero image slot. Drop a photo into /public named hero-player.jpg (or .png / .webp)
 * and it appears here; until then the space stays empty.
 */
const CANDIDATES = ["hero-player.webp", "hero-player.jpg", "hero-player.jpeg", "hero-player.png"];

/** URL of the hero photo, or null when none has been added yet. */
export function heroPhotoSrc(): string | null {
  const dir = path.join(process.cwd(), "public");
  const file = CANDIDATES.find((f) => existsSync(path.join(dir, f)));
  return file ? `/${file}` : null;
}

export function HeroPhoto({ src }: { src: string | null }) {
  if (src) {
    return (
      <div className="relative mx-auto aspect-[4/5] w-full max-w-[440px] lg:max-w-none">
        <div className="absolute inset-6 rounded-full bg-cyan-strong/20 blur-3xl" />
        <Image
          src={src}
          alt="DGS player in action"
          fill
          priority
          sizes="(min-width: 1024px) 480px, 90vw"
          className="rounded-3xl object-cover shadow-2xl shadow-black/60"
        />
      </div>
    );
  }

  // No photo yet: leave the space empty (mascot artwork coming later).
  return null;
}
