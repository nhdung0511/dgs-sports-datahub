"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getMyTeam } from "@/lib/db/teams";
import { createClient } from "@/lib/supabase/server";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function back(param: string, value: string, anchor: string): never {
  revalidatePath("/");
  redirect(`/?${param}=${encodeURIComponent(value)}#${anchor}`);
}

export async function sendContactMessage(form: FormData) {
  // Honeypot: real visitors never see or fill this field.
  if (text(form, "website")) back("contact", "sent", "contact");

  const name = text(form, "name").slice(0, 120);
  const email = text(form, "email").slice(0, 254);
  const message = text(form, "message").slice(0, 4000);
  if (!name || !email.includes("@") || !message) back("contactError", "Please fill in your name, email and message.", "contact");

  const supabase = await createClient();
  const { error } = await supabase.from("contact_messages").insert({ name, email, message });
  if (error) back("contactError", "Sorry, that didn't send. Please try again.", "contact");
  back("contact", "sent", "contact");
}

export async function createNewsPost(form: FormData) {
  const { supabase, user } = await requireUser("/#news");
  const team = await getMyTeam(supabase, user.id);
  if (!team || team.role !== "admin") back("newsError", "Only team admins can post news.", "news");
  const title = text(form, "title");
  const body = text(form, "body");
  if (!title || !body) back("newsError", "Add a headline and some text.", "news");
  const { error } = await supabase.from("news_posts").insert({ team_id: team.id, title, body });
  if (error) back("newsError", error.message, "news");
  back("news", "posted", "news");
}

export async function deleteNewsPost(form: FormData) {
  const { supabase } = await requireUser("/#news");
  const { error } = await supabase.from("news_posts").delete().eq("id", text(form, "id"));
  if (error) back("newsError", error.message, "news");
  back("news", "deleted", "news");
}
