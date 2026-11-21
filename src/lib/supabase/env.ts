export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** False until .env.local is filled in — lets the app boot without a Supabase project. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
