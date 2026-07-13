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

async function assignUserToAllActiveProjects(supabase, { companyId, userId, assignedBy, assignCostCentres = true }) {
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

  if (!assignCostCentres) {
    return { projects: projectAssignmentRows.length, costCentres: 0 };
  }

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

function isMissingCompanySettingsColumnError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return (
    msg.includes("column") &&
    (msg.includes("assign_all_projects_to_all_employees") ||
      msg.includes("assign_all_tasks_to_all_projects"))
  );
}

function isMissingPayRatesTableError(error) {
  const msg = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return code === "42p01" || msg.includes("employee_pay_rates") || (msg.includes("relation") && msg.includes("does not exist"));
}

async function recordEmployeePayRate(supabase, { companyId, employeeId, hourlyRate, effectiveDate, createdBy }) {
  const date = effectiveDate || new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("employee_pay_rates")
    .upsert(
      {
        company_id: companyId,
        employee_id: employeeId,
        hourly_rate: hourlyRate,
        effective_date: date,
        created_by: createdBy || null,
        note: "employee_create",
      },
      { onConflict: "company_id,employee_id,effective_date" }
    );
  if (error) {
    if (isMissingPayRatesTableError(error)) {
      console.warn("[CREATE_EMPLOYEE] employee_pay_rates table not installed; profile rate saved only.");
      return { skipped: "missing_table" };
    }
    console.warn("[CREATE_EMPLOYEE] pay history upsert failed; profile rate saved", error);
    return { skipped: "history_failed", error: error.message || String(error) };
  }
  return { saved: true };
}

function isMissingPayrollBalanceAdjustmentsTableError(error) {
  const msg = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return code === "42p01" || msg.includes("payroll_balance_adjustments") || (msg.includes("relation") && msg.includes("does not exist"));
}

function isMissingAutoPayrollCompanyMemberColumnsError(error) {
  const msg = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return (
    code === "42703" ||
    (msg.includes("column") && msg.includes("auto_payroll_")) ||
    (msg.includes("relation") && msg.includes("does not exist"))
  );
}

async function recordPayrollOpeningBalance(supabase, { companyId, employeeId, openingBalance, effectiveDate, createdBy }) {
  const hasOpeningBalance = openingBalance != null && String(openingBalance).trim() !== "";
  const hasEffectiveDate = effectiveDate != null && String(effectiveDate).trim() !== "";
  const { data: existingRow, error: existingErr } = await supabase
    .from("payroll_balance_adjustments")
    .select("id, amount, effective_date")
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .eq("adjustment_type", "brought_forward")
    .is("deleted_at", null)
    .maybeSingle();
  if (existingErr) {
    if (isMissingPayrollBalanceAdjustmentsTableError(existingErr)) {
      console.warn("[CREATE_EMPLOYEE] payroll_balance_adjustments table not installed; opening balance skipped.");
      return { skipped: "missing_table" };
    }
    throw existingErr;
  }

  const nextAmount = hasOpeningBalance ? Number(openingBalance) || 0 : Number(existingRow?.amount ?? 0);
  const nextDate = hasEffectiveDate
    ? String(effectiveDate).trim().slice(0, 10)
    : String(existingRow?.effective_date || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  const payload = {
    company_id: companyId,
    employee_id: employeeId,
    adjustment_type: "brought_forward",
    amount: nextAmount,
    effective_date: nextDate,
    note: "employee start balance",
    updated_by: createdBy || null,
    updated_at: new Date().toISOString(),
  };

  if (existingRow?.id) {
    const { error } = await supabase.from("payroll_balance_adjustments").update(payload).eq("id", existingRow.id);
    if (error) throw error;
    return { saved: true, updated: true };
  }

  const { error } = await supabase.from("payroll_balance_adjustments").insert({
    ...payload,
    created_by: createdBy || null,
  });
  if (error) throw error;
  return { saved: true, created: true };
}

async function recordAutoPayrollSettings(
  supabase,
  { companyId, employeeId, enabled, startPeriodKey, amount, createdBy }
) {
  const payload = {
    auto_payroll_enabled: Boolean(enabled),
    auto_payroll_start_date: enabled ? (String(startPeriodKey || "").trim().slice(0, 10) || null) : null,
    auto_payroll_amount: enabled ? (Number.isFinite(Number(amount)) ? Number(amount) : 0) : 0,
  };
  const { error } = await supabase
    .from("company_members")
    .update(payload)
    .eq("company_id", companyId)
    .eq("user_id", employeeId);
  if (error) {
    if (isMissingAutoPayrollCompanyMemberColumnsError(error)) {
      console.warn("[CREATE_EMPLOYEE] auto payroll columns not installed; settings skipped.");
      return { skipped: "missing_table_or_columns" };
    }
    throw error;
  }
  return { saved: true, enabled: Boolean(enabled), updated_by: createdBy || null };
}

async function getCompanyAssignmentSettings(supabase, companyId) {
  let { data, error } = await supabase
    .from("companies")
    .select("assign_all_projects_to_all_employees, assign_all_tasks_to_all_projects")
    .eq("id", companyId)
    .maybeSingle();
  if (error && isMissingCompanySettingsColumnError(error)) {
    return { assignAllProjects: true, assignAllTasks: true };
  }
  if (error) throw error;
  return {
    assignAllProjects: data?.assign_all_projects_to_all_employees !== false,
    assignAllTasks: data?.assign_all_tasks_to_all_projects !== false,
  };
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
  const payroll_start_date_raw = body.payroll_start_date;
  const payroll_start_balance_raw = body.payroll_start_balance;
  const auto_payroll_enabled_raw = body.auto_payroll_enabled;
  const auto_payroll_start_period_key_raw = body.auto_payroll_start_period_key;
  const auto_payroll_amount_raw = body.auto_payroll_amount;

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
  let payroll_start_date = null;
  if (payroll_start_date_raw != null && String(payroll_start_date_raw).trim() !== "") {
    payroll_start_date = String(payroll_start_date_raw).trim().slice(0, 10);
  }
  const payroll_start_balance = Number.isFinite(Number(payroll_start_balance_raw)) ? Number(payroll_start_balance_raw) : 0;
  const auto_payroll_enabled =
    auto_payroll_enabled_raw === true ||
    String(auto_payroll_enabled_raw).trim().toLowerCase() === "true" ||
    String(auto_payroll_enabled_raw).trim() === "1";
  const auto_payroll_start_period_key = String(auto_payroll_start_period_key_raw || "").trim().slice(0, 10) || null;
  const auto_payroll_amount = Number.isFinite(Number(auto_payroll_amount_raw)) ? Number(auto_payroll_amount_raw) : 0;

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

  try {
    await recordAutoPayrollSettings(supabase, {
      companyId: company_id,
      employeeId: newUserId,
      enabled: auto_payroll_enabled,
      startPeriodKey: auto_payroll_start_period_key || payroll_start_date || joining_date || pay_date,
      amount: auto_payroll_amount,
      createdBy: callerId,
    });
  } catch (autoPayrollErr) {
    console.warn("[CREATE_EMPLOYEE] auto payroll save failed", autoPayrollErr);
  }

  let defaultAssignments = { projects: 0, costCentres: 0 };
  let payHistory = { skipped: "not_attempted" };
  try {
    payHistory = await recordEmployeePayRate(supabase, {
      companyId: company_id,
      employeeId: newUserId,
      hourlyRate: hrNum,
      effectiveDate: pay_date || joining_date,
      createdBy: callerId,
    });
  } catch (payHistoryErr) {
    console.warn("[CREATE_EMPLOYEE] pay history save failed", payHistoryErr);
  }

  try {
    await recordPayrollOpeningBalance(supabase, {
      companyId: company_id,
      employeeId: newUserId,
      openingBalance: payroll_start_balance,
      effectiveDate: payroll_start_date || joining_date || pay_date,
      createdBy: callerId,
    });
  } catch (openingBalanceErr) {
    console.warn("[CREATE_EMPLOYEE] opening balance save failed", openingBalanceErr);
  }

  try {
    const assignmentSettings = await getCompanyAssignmentSettings(supabase, company_id);
    if (assignmentSettings.assignAllProjects) {
      defaultAssignments = await assignUserToAllActiveProjects(supabase, {
        companyId: company_id,
        userId: newUserId,
        assignedBy: callerId,
        assignCostCentres: assignmentSettings.assignAllTasks,
      });
    }
  } catch (assignErr) {
    console.warn("[CREATE_EMPLOYEE] default project assignment failed", assignErr);
  }

  res.status(200).json({ success: true, user_id: newUserId, email, default_assignments: defaultAssignments, pay_history: payHistory });
}
