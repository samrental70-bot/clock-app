import { createClient } from "@supabase/supabase-js";

function cleanPublicEnvValue(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/\uFEFF/g, "")
    .trim();
}

function extractSupabaseProjectRef(url) {
  const match = String(url || "").match(/^https:\/\/([^.]+)\.supabase\.co/i);
  return match ? match[1] : "";
}

function maskProjectRef(ref) {
  const value = String(ref || "").trim();
  if (!value) return "";
  if (value.length <= 8) return `${value.slice(0, 4)}...`;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

const runtimeHostname = typeof window !== "undefined" ? window.location.hostname : "";
const buildChannel = cleanPublicEnvValue(import.meta.env.VITE_OPERA_APP_CHANNEL);
const runtimeLooksDevelopment =
  import.meta.env.DEV ||
  buildChannel !== "production" ||
  /(^localhost$|^127\.0\.0\.1$|^\[::1\]$)/i.test(runtimeHostname) ||
  /development/i.test(runtimeHostname);

const developmentSupabaseProjectRef = cleanPublicEnvValue(
  import.meta.env.VITE_SUPABASE_DEVELOPMENT_PROJECT_REF || "jvlxahskximvbajjwbut"
);
const productionSupabaseProjectRef = cleanPublicEnvValue(
  import.meta.env.VITE_SUPABASE_PRODUCTION_PROJECT_REF || "vunwijmdewrlsrevhyjm"
);

export const supabaseUrl = cleanPublicEnvValue(import.meta.env.VITE_SUPABASE_URL);
export const supabaseAnonKey = cleanPublicEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY);
export const supabaseProjectRef = extractSupabaseProjectRef(supabaseUrl);
export const supabaseAppMode = runtimeLooksDevelopment ? "development" : "production";
export const supabaseExpectedProjectRef =
  supabaseAppMode === "development" ? developmentSupabaseProjectRef : productionSupabaseProjectRef;
export const supabaseProjectRefMasked = maskProjectRef(supabaseProjectRef);
export const supabaseExpectedProjectRefMasked = maskProjectRef(supabaseExpectedProjectRef);
export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);
export const hasSupabaseProjectRef = Boolean(supabaseProjectRef);
export const supabaseConfigIssue = (() => {
  if (!hasSupabaseEnv) return "Missing Supabase public environment variables.";
  if (!hasSupabaseProjectRef) return "Supabase URL is missing a valid project ref.";
  if (!supabaseExpectedProjectRef) return "Missing expected Supabase project ref for this build.";
  if (supabaseProjectRef !== supabaseExpectedProjectRef) {
    return `Supabase project ref mismatch. Expected ${supabaseExpectedProjectRefMasked || "a known ref"} for ${supabaseAppMode} builds, but found ${supabaseProjectRefMasked || "an unknown ref"}.`;
  }
  return "";
})();
export const supabaseClientReady = hasSupabaseEnv && !supabaseConfigIssue;

export const supabase = supabaseClientReady
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;
