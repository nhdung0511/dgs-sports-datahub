import { Notice, PageTitle, SiteShell } from "@/components/site-shell";
import { btnAccent, btnGhost, btnPrimary, card, input, label } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fetchRoster } from "@/lib/db/games";
import { canEdit, getMyTeam, listMembers } from "@/lib/db/teams";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { listContactMessages } from "@/lib/db/contact";
import {
  addMember,
  deleteContactMessage,
  addPlayer,
  createTeam,
  removeMember,
  renameTeam,
  setPlayerActive,
  updatePlayer,
} from "./actions";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; error?: string }>;
}) {
  if (!isSupabaseConfigured) return <SiteShell>{null}</SiteShell>;
  const { msg, error } = await searchParams;
  const { supabase, user } = await requireUser("/team");
  const team = await getMyTeam(supabase, user.id);

  if (!team) {
    return (
      <SiteShell>
        <PageTitle title="Create your team" sub="This is the club team you'll track in detail." />
        <Notice msg={error} tone="error" />
        <form action={createTeam} className={`${card} max-w-lg space-y-4 p-6`}>
          <div>
            <label htmlFor="name" className={label}>
              Team name
            </label>
            <input id="name" name="name" required placeholder="e.g. Club Varsity" className={input} />
          </div>
          <button className={btnPrimary}>Create team</button>
        </form>
      </SiteShell>
    );
  }

  const isAdmin = team.role === "admin";
  const editor = canEdit(team.role);
  const [players, members, messages] = await Promise.all([
    fetchRoster(supabase, team.id, { includeInactive: true }),
    listMembers(supabase, team.id),
    isAdmin ? listContactMessages(supabase) : Promise.resolve([]),
  ]);
  const active = players.filter((p) => p.active);
  const inactive = players.filter((p) => !p.active);

  return (
    <SiteShell>
      <PageTitle
        title={team.name}
        sub={`${active.length} active players · you are ${
          isAdmin ? "an admin" : editor ? "a scorekeeper" : "a player (view-only)"
        }`}
      />
      <Notice msg={msg} />
      <Notice msg={error} tone="error" />

      {!editor && (
        <section className={`${card} p-5 sm:p-6`}>
          <h2 className="text-xl font-black">Roster</h2>
          <ul className="mt-4 divide-y divide-line">
            {active.length === 0 && <li className="py-4 text-sm text-muted">No players yet.</li>}
            {active.map((p) => (
              <li key={p.id} className="py-2.5">
                <b className="inline-block w-12">#{p.jersey ?? "–"}</b> {p.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      {editor && (
      <section className={`${card} p-5 sm:p-6`}>
        <h2 className="text-xl font-black">Roster</h2>
        <p className="mt-1 text-sm text-muted">
          Edit a name or number and press Save. Inactive players stay in past box scores.
        </p>

        <form action={addPlayer} className="mt-5 grid gap-3 rounded-xl bg-card-2 p-4 sm:grid-cols-[6rem_1fr_auto]">
          <div>
            <label htmlFor="new-jersey" className={label}>
              Number
            </label>
            <input id="new-jersey" name="jersey" inputMode="numeric" maxLength={3} placeholder="23" className={input} />
          </div>
          <div>
            <label htmlFor="new-name" className={label}>
              Player name
            </label>
            <input id="new-name" name="name" required placeholder="First Last" className={input} />
          </div>
          <button className={`${btnAccent} self-end`}>+ Add player</button>
        </form>

        <ul className="mt-4 divide-y divide-line">
          {active.length === 0 && <li className="py-4 text-sm text-muted">No players yet. Add your first one above.</li>}
          {active.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 py-3">
              <form action={updatePlayer} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={p.id} />
                <input
                  name="jersey"
                  defaultValue={p.jersey ?? ""}
                  aria-label={`Number for ${p.name}`}
                  maxLength={3}
                  className={`${input} w-16 text-center font-black`}
                />
                <input
                  name="name"
                  defaultValue={p.name}
                  aria-label="Player name"
                  required
                  className={`${input} min-w-40 flex-1`}
                />
                <button className={btnGhost}>Save</button>
              </form>
              <form action={setPlayerActive}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="active" value="false" />
                <button className="text-sm font-medium text-muted underline hover:text-opp">Make inactive</button>
              </form>
            </li>
          ))}
        </ul>

        {inactive.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-bold text-muted">
              Inactive players ({inactive.length})
            </summary>
            <ul className="mt-2 divide-y divide-line">
              {inactive.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <b>#{p.jersey ?? "–"}</b> {p.name}
                  </span>
                  <form action={setPlayerActive}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="active" value="true" />
                    <button className="font-medium text-cyan underline">Reactivate</button>
                  </form>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
      )}

      <section className={`${card} mt-6 p-5 sm:p-6`}>
        <h2 className="text-xl font-black">Members</h2>
        <p className="mt-1 text-sm text-muted">
          Admins and scorekeepers can create games and keep score. Players can sign in to see the team&apos;s
          analysis but can&apos;t change anything. Each person needs an account first: create it in Supabase or have
          them sign in once.
        </p>
        <ul className="mt-4 divide-y divide-line">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0 truncate">
                {m.email}
                {m.userId === user.id && <span className="ml-2 text-muted">(you)</span>}
              </span>
              <span className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    m.role === "admin"
                      ? "bg-lime-soft ring-1 ring-lime/50"
                      : m.role === "player"
                        ? "bg-card-2 ring-1 ring-line"
                        : "bg-cyan-soft ring-1 ring-cyan/40"
                  }`}
                >
                  {m.role}
                </span>
                {isAdmin && m.userId !== user.id && (
                  <form action={removeMember}>
                    <input type="hidden" name="userId" value={m.userId} />
                    <button className="text-muted hover:text-opp" aria-label={`Remove ${m.email}`}>
                      ✕
                    </button>
                  </form>
                )}
              </span>
            </li>
          ))}
        </ul>
        {isAdmin && (
          <form action={addMember} className="mt-4 grid gap-3 rounded-xl bg-card-2 p-4 sm:grid-cols-[1fr_10rem_auto]">
            <div>
              <label htmlFor="member-email" className={label}>
                Email
              </label>
              <input id="member-email" name="email" type="email" required placeholder="coach@example.com" className={input} />
            </div>
            <div>
              <label htmlFor="member-role" className={label}>
                Role
              </label>
              <select id="member-role" name="role" className={input} defaultValue="scorekeeper">
                <option value="scorekeeper">Scorekeeper</option>
                <option value="player">Player (view-only)</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button className={`${btnPrimary} self-end`}>Add</button>
          </form>
        )}
      </section>

      {isAdmin && (
        <section id="messages" className={`${card} mt-6 p-5 sm:p-6`}>
          <h2 className="text-xl font-black">Messages ({messages.length})</h2>
          <p className="mt-1 text-sm text-muted">Sent through Contact Us on the home page. Reply by email.</p>
          <ul className="mt-4 space-y-3">
            {messages.length === 0 && <li className="text-sm text-muted">No messages yet.</li>}
            {messages.map((m) => (
              <li key={m.id} className="rounded-xl bg-card-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <b>{m.name}</b>{" "}
                    <a href={`mailto:${m.email}`} className="text-cyan underline">
                      {m.email}
                    </a>
                  </span>
                  <span className="flex items-center gap-3 text-xs text-muted">
                    {new Date(m.createdAt).toLocaleString()}
                    <form action={deleteContactMessage}>
                      <input type="hidden" name="id" value={m.id} />
                      <button className="font-medium hover:text-opp hover:underline">Delete</button>
                    </form>
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm">{m.message}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAdmin && (
        <section className={`${card} mt-6 p-5 sm:p-6`}>
          <h2 className="text-xl font-black">Team settings</h2>
          <form action={renameTeam} className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <label htmlFor="team-name" className={label}>
                Team name
              </label>
              <input id="team-name" name="name" defaultValue={team.name} required className={input} />
            </div>
            <button className={btnGhost}>Rename</button>
          </form>
        </section>
      )}
    </SiteShell>
  );
}
