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

function isMissingPayRatesTableError(error) {
  const msg = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return code === "42p01" || msg.includes("employee_pay_rates") || msg.includes("relation") && msg.includes("does not exist");
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
        note: "profile_update",
      },
      { onConflict: "company_id,employee_id,effective_date" }
    );
  if (error) {
    if (isMissingPayRatesTableError(error)) {
      console.warn("[PAY_RATES] employee_pay_rates table not installed; profile rate saved only.");
      return { skipped: "missing_table" };
    }
    console.warn("[PAY_RATES] history upsert failed; profile rate saved", error);
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
      console.warn("[PAYROLL] payroll_balance_adjustments table not installed; opening balance skipped.");
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
      console.warn("[PAYROLL] auto payroll columns not installed; settings skipped.");
      return { skipped: "missing_table_or_columns" };
    }
    throw error;
  }
  return { saved: true, enabled: Boolean(enabled), updated_by: createdBy || null };
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
  const payroll_start_date = cleanDate(body.payroll_start_date);
  const payroll_start_balance_raw = body.payroll_start_balance;
  const auto_payroll_enabled_raw = body.auto_payroll_enabled;
  const auto_payroll_start_period_key_raw = body.auto_payroll_start_period_key;
  const auto_payroll_amount_raw = body.auto_payroll_amount;
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
  const auto_payroll_enabled =
    auto_payroll_enabled_raw === true ||
    String(auto_payroll_enabled_raw).trim().toLowerCase() === "true" ||
    String(auto_payroll_enabled_raw).trim() === "1";
  const auto_payroll_start_period_key = cleanDate(auto_payroll_start_period_key_raw);
  const auto_payroll_amount = Number.isFinite(Number(auto_payroll_amount_raw)) ? Number(auto_payroll_amount_raw) : 0;

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

  const payHistory = await recordEmployeePayRate(supabase, {
    companyId: company_id,
    employeeId: target_user_id,
    hourlyRate: hourly_rate,
    effectiveDate: pay_rate_effective_date || joining_date,
    createdBy: callerId,
  });

  try {
    await recordPayrollOpeningBalance(supabase, {
      companyId: company_id,
      employeeId: target_user_id,
      openingBalance: Number.isFinite(Number(payroll_start_balance_raw)) ? Number(payroll_start_balance_raw) : undefined,
      effectiveDate: payroll_start_date || joining_date || pay_rate_effective_date,
      createdBy: callerId,
    });
  } catch (openingBalanceErr) {
    console.warn("[PAYROLL] opening balance save failed", openingBalanceErr);
  }

  try {
    await recordAutoPayrollSettings(supabase, {
      companyId: company_id,
      employeeId: target_user_id,
      enabled: auto_payroll_enabled,
      startPeriodKey: auto_payroll_start_period_key || payroll_start_date || joining_date || pay_rate_effective_date,
      amount: auto_payroll_amount,
      createdBy: callerId,
    });
  } catch (autoPayrollErr) {
    console.warn("[PAYROLL] auto payroll save failed", autoPayrollErr);
  }

  res.status(200).json({
    success: true,
    employment_status: updatedProfile.employment_status,
    role: finalRole,
    pay_history: payHistory,
  });
}
