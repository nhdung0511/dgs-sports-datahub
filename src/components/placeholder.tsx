import Link from "next/link";

/** Temporary page shell for routes not built yet. */
export function Placeholder({ title, todo }: { title: string; todo: string[] }) {
  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-10">
      <Link href="/" className="text-sm text-neutral-500 hover:underline">
        ← Home
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
      <p className="mt-4 text-sm text-neutral-500">Not built yet. Planned:</p>
      <ul className="mt-2 list-disc pl-5 text-sm">
        {todo.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </main>
  );
}
