import { createClient } from "@supabase/supabase-js";

function cleanPublicEnvValue(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/\uFEFF/g, "")
    .trim();
}

export const supabaseUrl = cleanPublicEnvValue(import.meta.env.VITE_SUPABASE_URL);
export const supabaseAnonKey = cleanPublicEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY);
export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseEnv
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;
