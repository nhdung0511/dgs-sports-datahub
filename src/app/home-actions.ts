"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
