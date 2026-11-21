import type { SupabaseClient } from "@supabase/supabase-js";
import type { Team } from "@/lib/sports/types";

export type Role = "admin" | "scorekeeper";

export interface Member {
  userId: string;
  email: string;
  role: Role;
}

interface TeamRow {
  id: string;
  name: string;
  sport: string;
}

const toTeam = (r: TeamRow): Team => ({ id: r.id, name: r.name, sport: r.sport });

/** The team this user scores for (v1: one club team per user). */
export async function getMyTeam(
  supabase: SupabaseClient,
  userId: string,
): Promise<(Team & { role: Role }) | null> {
  const { data, error } = await supabase
    .from("team_members")
    .select("role, created_at, teams(id, name, sport)")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const t = data?.teams as unknown as TeamRow | null;
  return data && t ? { ...toTeam(t), role: data.role as Role } : null;
}

/** The club team for public pages: the viewer's team, else the first team created. */
export async function getClubTeam(supabase: SupabaseClient, userId?: string | null): Promise<Team | null> {
  if (userId) {
    const mine = await getMyTeam(supabase, userId);
    if (mine) return mine;
  }
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, sport")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? toTeam(data as TeamRow) : null;
}

export async function listMembers(supabase: SupabaseClient, teamId: string): Promise<Member[]> {
  const { data, error } = await supabase.rpc("team_members_with_email", { p_team: teamId });
  if (error) throw error;
  return (data as { user_id: string; email: string; role: Role }[]).map((r) => ({
    userId: r.user_id,
    email: r.email,
    role: r.role,
  }));
}
