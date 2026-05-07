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

function cleanGeneratedLoginPart(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 28);
  return normalized || "employee";
}

function buildGeneratedEmployeeEmail(fullName, companyId) {
  const namePart = cleanGeneratedLoginPart(fullName);
  const companyPart = cleanGeneratedLoginPart(companyId).replace(/\./g, "").slice(0, 8) || "team";
  const stamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${namePart}.${companyPart}.${stamp}${randomPart}@login.opera-ai.app`;
}

async function assignUserToAllActiveProjects(supabase, { companyId, userId, assignedBy }) {
  const { data: projects, error: projectsErr } = await supabase
    .from("projects")
    .select("id")
    .eq("company_id", companyId)
    .eq("status", "active");
  if (projectsErr) throw projectsErr;

  const projectIds = [...new Set((projects || []).map((p) => p.id).filter(Boolean))];
  if (projectIds.length === 0) return { projects: 0, costCentres: 0 };

  const projectAssignmentRows = projectIds.map((projectId) => ({
    company_id: companyId,
    project_id: projectId,
    user_id: userId,
    assigned_by: assignedBy || null,
    status: "active",
  }));

  const { error: paErr } = await supabase.from("project_assignments").insert(projectAssignmentRows);
  if (paErr) throw paErr;

  const { data: centres, error: centresErr } = await supabase
    .from("cost_centres")
    .select("id, project_id")
    .eq("company_id", companyId)
    .in("project_id", projectIds)
    .eq("status", "active");
  if (centresErr) throw centresErr;

  const costCentreRows = (centres || [])
    .filter((c) => c?.id && c?.project_id)
    .map((c) => ({
      company_id: companyId,
      project_id: c.project_id,
      cost_centre_id: c.id,
      user_id: userId,
      assigned_by: assignedBy || null,
      status: "active",
    }));

  if (costCentreRows.length > 0) {
    const { error: pccaErr } = await supabase
      .from("project_cost_centre_assignments")
      .insert(costCentreRows);
    if (pccaErr) throw pccaErr;
  }

  return { projects: projectAssignmentRows.length, costCentres: costCentreRows.length };
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
  const email = (emailRaw ? emailRaw : buildGeneratedEmployeeEmail(full_name, company_id)).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const role = typeof body.role === "string" ? body.role.trim().toLowerCase() : "";

  const hourly_raw = body.hourly_rate;
  const pay_rate_effective_date = body.pay_rate_effective_date;
  const joining_date_raw = body.joining_date;

  if (!company_id || !full_name || !password) {
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

  let joining_date = null;
  if (joining_date_raw != null && String(joining_date_raw).trim() !== "") {
    joining_date = String(joining_date_raw).trim().slice(0, 10);
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
    user_metadata: {
      full_name,
      should_change_password: true,
      password_prompt_created_at: new Date().toISOString(),
    },
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
      joining_date,
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

  let defaultAssignments = { projects: 0, costCentres: 0 };
  try {
    defaultAssignments = await assignUserToAllActiveProjects(supabase, {
      companyId: company_id,
      userId: newUserId,
      assignedBy: callerId,
    });
  } catch (assignErr) {
    console.warn("[CREATE_EMPLOYEE] default project assignment failed", assignErr);
  }

  res.status(200).json({ success: true, user_id: newUserId, email, default_assignments: defaultAssignments });
}
