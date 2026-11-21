import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./env";

/** Supabase client for Client Components (scoring screen, realtime viewers). */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
