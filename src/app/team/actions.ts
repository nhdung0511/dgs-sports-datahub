"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canEdit, getMyTeam } from "@/lib/db/teams";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function done(msg: string, error = false): never {
  revalidatePath("/team");
  redirect(`/team?${error ? "error" : "msg"}=${encodeURIComponent(msg)}`);
}

async function myTeam() {
  const { supabase, user } = await requireUser("/team");
  const team = await getMyTeam(supabase, user.id);
  if (!team) done("Create your team first.", true);
  return { supabase, user, team };
}

/** Like myTeam(), but players (view-only) are turned away. */
async function myEditableTeam() {
  const ctx = await myTeam();
  if (!canEdit(ctx.team.role)) done("Players have view-only access.", true);
  return ctx;
}

const ROLE_LABEL = { admin: "an admin", coach: "a coach", scorekeeper: "a scorekeeper", player: "a player (view-only)" } as const;

export async function createTeam(form: FormData) {
  const { supabase, user } = await requireUser("/team");
  const name = text(form, "name");
  if (!name) done("Give the team a name.", true);
  if (await getMyTeam(supabase, user.id)) done("You already have a team.", true);
  const { error } = await supabase.from("teams").insert({ name, sport: "basketball" });
  if (error) done(error.message, true);
  done(`${name} created. Now add your players.`);
}

export async function renameTeam(form: FormData) {
  const { supabase, team } = await myTeam();
  const name = text(form, "name");
  if (!name) done("Team name can't be empty.", true);
  const { error } = await supabase.from("teams").update({ name }).eq("id", team.id);
  if (error) done(error.message, true);
  done("Team name saved.");
}

export async function addPlayer(form: FormData) {
  const { supabase, team } = await myEditableTeam();
  const name = text(form, "name");
  const jersey = text(form, "jersey") || null;
  if (!name) done("Enter the player's name.", true);
  const { error } = await supabase.from("players").insert({ team_id: team.id, name, jersey });
  if (error) done(error.message, true);
  done(`${name} added to the roster.`);
}

export async function updatePlayer(form: FormData) {
  const { supabase, team } = await myEditableTeam();
  const id = text(form, "id");
  const name = text(form, "name");
  if (!name) done("Player name can't be empty.", true);
  const { error } = await supabase
    .from("players")
    .update({ name, jersey: text(form, "jersey") || null })
    .eq("id", id)
    .eq("team_id", team.id);
  if (error) done(error.message, true);
  done(`${name} saved.`);
}

export async function setPlayerActive(form: FormData) {
  const { supabase, team } = await myEditableTeam();
  const active = text(form, "active") === "true";
  const { error } = await supabase
    .from("players")
    .update({ active })
    .eq("id", text(form, "id"))
    .eq("team_id", team.id);
  if (error) done(error.message, true);
  done(active ? "Player is back on the active roster." : "Player moved to inactive. Their stats are kept.");
}

export async function addMember(form: FormData) {
  const { supabase, team } = await myTeam();
  const email = text(form, "email");
  const picked = text(form, "role");
  const role = picked === "admin" || picked === "coach" || picked === "player" ? picked : "scorekeeper";
  if (!email) done("Enter an email address.", true);
  const { error } = await supabase.rpc("add_team_member_by_email", {
    p_team: team.id,
    p_email: email,
    p_role: role,
  });
  if (error) done(error.message, true);
  done(`${email} is now ${ROLE_LABEL[role]} on ${team.name}.`);
}

export async function deleteContactMessage(form: FormData) {
  const { supabase } = await myTeam();
  const { error } = await supabase.from("contact_messages").delete().eq("id", text(form, "id"));
  if (error) done(error.message, true);
  done("Message deleted.");
}

export async function removeMember(form: FormData) {
  const { supabase, user, team } = await myTeam();
  const userId = text(form, "userId");
  if (userId === user.id) done("You can't remove yourself.", true);
  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("team_id", team.id)
    .eq("user_id", userId);
  if (error) done(error.message, true);
  done("Member removed.");
}
