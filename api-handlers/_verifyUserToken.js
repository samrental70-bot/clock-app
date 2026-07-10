/**
 * Shared user-JWT verification for API handlers.
 * Rule: user tokens must be validated with the anon/public Supabase client.
 * The service-role client is reserved for server-side DB reads/writes only.
 * Env: SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY (falls back to the
 * provided client when no anon key is configured, preserving prior behavior).
 */
import { createClient } from "@supabase/supabase-js";

export function getSupabaseAnonKey() {
  return process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
}

export async function verifyUserToken(url, token, { fallbackClient = null } = {}) {
  const cleanToken = String(token || "").trim();
  if (!cleanToken) {
    return { user: null, error: new Error("Missing authorization") };
  }
  const anonKey = getSupabaseAnonKey();
  const authClient =
    url && anonKey
      ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
      : fallbackClient;
  if (!authClient) {
    return { user: null, error: new Error("Server misconfigured") };
  }
  const { data, error } = await authClient.auth.getUser(cleanToken);
  return { user: data?.user || null, error: error || null };
}
