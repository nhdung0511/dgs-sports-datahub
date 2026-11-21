import type { SupabaseClient } from "@supabase/supabase-js";

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
}

/** Admin-only (enforced by RLS): newest Contact Us messages. */
export async function listContactMessages(supabase: SupabaseClient, limit = 50): Promise<ContactMessage[]> {
  const { data, error } = await supabase
    .from("contact_messages")
    .select("id, name, email, message, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as { id: string; name: string; email: string; message: string; created_at: string }[]).map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    message: r.message,
    createdAt: r.created_at,
  }));
}
