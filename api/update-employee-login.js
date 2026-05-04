/**
 * Vercel serverless: update Auth user email/password/metadata + profiles name/email (service role only).
 * Env: VITE_SUPABASE_URL or SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
}

function isDuplicateAuthEmailError(err) {
  if (!err) return false;
  const msg = String(err.message || "").toLowerCase();
  const code = String(err.code || "").toLowerCase();
  if (code === "email_exists" || code === "user_already_exists") return true;
  if (msg.includes("already been registered") || msg.includes("already registered")) return true;
  if (msg.includes("duplicate") && msg.includes("user")) return true;
  if (msg.includes("email") && (msg.includes("exists") || msg.includes("taken"))) return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const url = getSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }

  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    res.status(401).json({ error: "Missing authorization" });
    return;
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  const company_id = body.company_id;
  const target_user_id = body.target_user_id;
  const full_name = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
  const email = emailRaw.toLowerCase();
  const new_password =
    typeof body.new_password === "string" && body.new_password.length > 0 ? body.new_password : "";

  if (!company_id || !target_user_id || !full_name || !email) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Invalid email" });
    return;
  }

  if (new_password && new_password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  const callerId = userData.user.id;

  const { data: callerMember, error: callerMemErr } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", company_id)
    .eq("user_id", callerId)
    .maybeSingle();

  if (callerMemErr) {
    res.status(500).json({ error: callerMemErr.message });
    return;
  }

  const callerRole = String(callerMember?.role || "")
    .trim()
    .toLowerCase();
  if (callerRole !== "owner" && callerRole !== "supervisor") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { data: targetMember, error: targetMemErr } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", company_id)
    .eq("user_id", target_user_id)
    .maybeSingle();

  if (targetMemErr) {
    res.status(500).json({ error: targetMemErr.message });
    return;
  }

  if (!targetMember) {
    res.status(400).json({ error: "User is not a member of this company" });
    return;
  }

  const targetRole = String(targetMember.role || "")
    .trim()
    .toLowerCase();
  if (targetRole === "owner" && String(callerId) !== String(target_user_id)) {
    res.status(403).json({ error: "Only the owner can change this account's login details." });
    return;
  }

  const { data: existingAuth, error: getErr } = await supabase.auth.admin.getUserById(target_user_id);
  if (getErr || !existingAuth?.user) {
    res.status(400).json({ error: getErr?.message || "Target user not found" });
    return;
  }

  const existingUser = existingAuth.user;
  const existingMeta = existingUser.user_metadata || {};
  const patch = {
    user_metadata: { ...existingMeta, full_name },
  };

  if (email !== String(existingUser.email || "").toLowerCase()) {
    patch.email = email;
  }

  if (new_password) {
    patch.password = new_password;
  }

  const { error: updErr } = await supabase.auth.admin.updateUserById(target_user_id, patch);

  if (updErr) {
    if (isDuplicateAuthEmailError(updErr)) {
      res.status(400).json({
        error: "This email is already in use by another account.",
      });
      return;
    }
    res.status(400).json({ error: updErr.message || "Could not update login" });
    return;
  }

  const { error: pErr } = await supabase
    .from("profiles")
    .update({ full_name, email })
    .eq("id", target_user_id);

  if (pErr) {
    res.status(500).json({ error: pErr.message });
    return;
  }

  res.status(200).json({ success: true, message: "Login details updated." });
}
