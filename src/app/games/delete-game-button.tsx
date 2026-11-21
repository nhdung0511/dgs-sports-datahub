"use client";

import { useFormStatus } from "react-dom";
import { deleteGame } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="rounded-full px-3 py-1.5 text-xs font-bold text-muted ring-1 ring-line hover:text-opp hover:ring-opp disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}

/** Delete button for one game, with a confirmation step (the game's plays and stats go with it). */
export function DeleteGameButton({ id, opponent }: { id: string; opponent: string }) {
  return (
    <form
      action={deleteGame}
      onSubmit={(e) => {
        const ok = window.confirm(
          `Delete the game vs ${opponent}?\n\nEvery play and stat recorded in it will be removed, and it can't be undone.`,
        );
        if (!ok) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <SubmitButton />
    </form>
  );
}
