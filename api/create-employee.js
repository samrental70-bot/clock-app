/**
 * Vercel serverless: create Auth user + profile + company membership (service role only).
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
  const full_name = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
  const email = emailRaw.toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const role = typeof body.role === "string" ? body.role.trim().toLowerCase() : "";

  const hourly_raw = body.hourly_rate;
  const pay_rate_effective_date = body.pay_rate_effective_date;

  if (!company_id || !full_name || !email || !password) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Invalid email" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  if (role !== "employee" && role !== "supervisor") {
    res.status(400).json({ error: "Invalid role" });
    return;
  }

  const hrNum = typeof hourly_raw === "number" ? hourly_raw : Number(String(hourly_raw ?? "").replace(",", "."));
  if (!Number.isFinite(hrNum) || hrNum < 0) {
    res.status(400).json({ error: "Invalid hourly rate" });
    return;
  }

  let pay_date = null;
  if (pay_rate_effective_date != null && String(pay_rate_effective_date).trim() !== "") {
    pay_date = String(pay_rate_effective_date).trim().slice(0, 10);
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

  const { data: memberRow, error: memErr } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", company_id)
    .eq("user_id", callerId)
    .maybeSingle();

  if (memErr) {
    res.status(500).json({ error: memErr.message });
    return;
  }

  const callerRole = String(memberRow?.role || "")
    .trim()
    .toLowerCase();
  if (callerRole !== "owner" && callerRole !== "supervisor") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const profileRole = role === "supervisor" ? "supervisor" : "employee";

  const { data: createdAuth, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });

  if (createErr) {
    if (isDuplicateAuthEmailError(createErr)) {
      res.status(400).json({
        error: "This email already has an account. Use join company or reset password.",
      });
      return;
    }
    res.status(400).json({ error: createErr.message || "Could not create user" });
    return;
  }

  const newUserId = createdAuth?.user?.id;
  if (!newUserId) {
    res.status(500).json({ error: "User creation failed" });
    return;
  }

  const { error: pErr } = await supabase.from("profiles").upsert(
    {
      id: newUserId,
      full_name,
      email,
      role: profileRole,
      hourly_rate: hrNum,
      pay_rate_effective_date: pay_date,
      employment_status: "active",
    },
    { onConflict: "id" }
  );

  if (pErr) {
    await supabase.auth.admin.deleteUser(newUserId);
    res.status(500).json({ error: pErr.message });
    return;
  }

  const { error: cmErr } = await supabase.from("company_members").insert({
    company_id,
    user_id: newUserId,
    role,
  });

  if (cmErr) {
    await supabase.from("profiles").delete().eq("id", newUserId);
    await supabase.auth.admin.deleteUser(newUserId);
    res.status(500).json({ error: cmErr.message });
    return;
  }

  res.status(200).json({ success: true, user_id: newUserId });
}
