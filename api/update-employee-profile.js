/**
 * Vercel serverless: update employee profile, role, pay, dates, and archive status with service role.
 * Env: VITE_SUPABASE_URL or SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
}

function cleanRole(value) {
  const role = String(value || "")
    .trim()
    .toLowerCase();
  if (role === "supervisor" || role === "owner") return role;
  return "employee";
}

function cleanStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase() === "archived"
    ? "archived"
    : "active";
}

function cleanDate(value) {
  const s = value == null ? "" : String(value).trim();
  return s ? s.slice(0, 10) : null;
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
  const requestedRole = cleanRole(body.role);
  const employment_status = cleanStatus(body.employment_status);
  const pay_rate_effective_date = cleanDate(body.pay_rate_effective_date);
  const joining_date = cleanDate(body.joining_date);
  const hourlyRaw = body.hourly_rate;
  const hourly_rate = typeof hourlyRaw === "number" ? hourlyRaw : Number(String(hourlyRaw ?? "0").replace(",", "."));

  if (!company_id || !target_user_id || !full_name) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Invalid email" });
    return;
  }

  if (!Number.isFinite(hourly_rate) || hourly_rate < 0) {
    res.status(400).json({ error: "Invalid hourly rate" });
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

  const { data: callerMember, error: callerErr } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", company_id)
    .eq("user_id", callerId)
    .maybeSingle();

  if (callerErr) {
    res.status(500).json({ error: callerErr.message });
    return;
  }

  const callerRole = cleanRole(callerMember?.role);
  if (callerRole !== "owner" && callerRole !== "supervisor") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { data: targetMember, error: targetErr } = await supabase
    .from("company_members")
    .select("id, role")
    .eq("company_id", company_id)
    .eq("user_id", target_user_id)
    .maybeSingle();

  if (targetErr) {
    res.status(500).json({ error: targetErr.message });
    return;
  }

  if (!targetMember) {
    res.status(400).json({ error: "User is not a member of this company" });
    return;
  }

  const targetRole = cleanRole(targetMember.role);
  const targetIsOwner = targetRole === "owner";
  if (targetIsOwner && employment_status === "archived") {
    res.status(400).json({ error: "Owner cannot be archived." });
    return;
  }

  if (targetIsOwner && String(callerId) !== String(target_user_id)) {
    res.status(403).json({ error: "Only the owner can change this owner profile." });
    return;
  }

  const finalRole = targetIsOwner ? "owner" : requestedRole === "supervisor" ? "supervisor" : "employee";

  if (!targetIsOwner && finalRole !== targetRole) {
    const { error: roleErr } = await supabase
      .from("company_members")
      .update({ role: finalRole })
      .eq("id", targetMember.id)
      .eq("company_id", company_id)
      .eq("user_id", target_user_id);

    if (roleErr) {
      res.status(500).json({ error: roleErr.message });
      return;
    }
  }

  const profilePayload = {
    full_name,
    hourly_rate,
    pay_rate_effective_date,
    joining_date,
    employment_status: targetIsOwner ? "active" : employment_status,
    role: finalRole,
  };
  if (email) profilePayload.email = email;

  const { data: updatedProfile, error: profileErr } = await supabase
    .from("profiles")
    .update(profilePayload)
    .eq("id", target_user_id)
    .select("id, employment_status, role")
    .maybeSingle();

  if (profileErr) {
    res.status(500).json({ error: profileErr.message });
    return;
  }

  if (!updatedProfile?.id) {
    res.status(404).json({ error: "Profile was not updated." });
    return;
  }

  res.status(200).json({
    success: true,
    employment_status: updatedProfile.employment_status,
    role: finalRole,
  });
}
