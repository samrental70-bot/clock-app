import { createClient } from "@supabase/supabase-js";
import { DEFAULT_TIME_ZONE, calendarDateKeyInTimeZone } from "../api-shared/dailyReport.js";

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
}

function getSupabaseServiceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function isMissingRelationError(error) {
  const msg = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return code === "42p01" || msg.includes("does not exist") || msg.includes("schema cache");
}

function isMissingColumnError(error, columnName) {
  const msg = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  const target = String(columnName || "").toLowerCase();
  return code === "42703" || (msg.includes("column") && (!target || msg.includes(target)));
}

function addWallDays(dateKey, days) {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return "";
  return new Date(Date.UTC(year, month - 1, day + Number(days || 0))).toISOString().slice(0, 10);
}

function diffDays(laterKey, earlierKey) {
  const later = new Date(`${laterKey}T00:00:00Z`).getTime();
  const earlier = new Date(`${earlierKey}T00:00:00Z`).getTime();
  if (!Number.isFinite(later) || !Number.isFinite(earlier)) return 0;
  return Math.floor((later - earlier) / 86400000);
}

function payrollFrequencyCycleDays(value) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "weekly_friday") return 7;
  if (key === "monthly") return null;
  return 14;
}

function payrollPayDateOffsetDaysValue(settings) {
  const raw = Number(settings?.payDateOffsetDays ?? settings?.pay_date_offset_days ?? 10);
  if (!Number.isFinite(raw)) return 10;
  return Math.max(1, Math.trunc(raw));
}

function getPayrollPeriodWindowForDateKey(dateKey, settings) {
  const anchorDate = cleanText(settings?.anchorDate || settings?.anchor_date);
  const frequency = cleanText(settings?.frequency).toLowerCase() || "alternate_friday";
  const payDateOffsetDays = payrollPayDateOffsetDaysValue(settings);
  const normalizedDateKey = cleanText(dateKey);
  if (!normalizedDateKey) return null;

  const monthlyMatch = normalizedDateKey.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (frequency === "monthly" && monthlyMatch) {
    const year = Number(monthlyMatch[1]);
    const month = Number(monthlyMatch[2]);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
    const startKey = `${year}-${String(month).padStart(2, "0")}-01`;
    const endKey = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return {
      startKey,
      endKey,
      payDateKey: addWallDays(endKey, payDateOffsetDays),
      label: `${startKey} - ${endKey}`,
      frequency,
    };
  }

  const cycleDays = payrollFrequencyCycleDays(frequency);
  if (!cycleDays || !anchorDate) return null;
  let endKey = anchorDate;
  let guard = 0;
  if (normalizedDateKey > endKey) {
    while (guard < 200) {
      const nextKey = addWallDays(endKey, cycleDays);
      if (!nextKey || nextKey === endKey) break;
      endKey = nextKey;
      if (endKey >= normalizedDateKey) break;
      guard += 1;
    }
  } else if (normalizedDateKey < endKey) {
    while (guard < 200) {
      const prevKey = addWallDays(endKey, -cycleDays);
      if (!prevKey || prevKey === endKey) break;
      if (prevKey >= normalizedDateKey) {
        endKey = prevKey;
        guard += 1;
        continue;
      }
      break;
    }
  }
  const startKey = addWallDays(endKey, 1 - cycleDays);
  return {
    startKey,
    endKey,
    payDateKey: addWallDays(endKey, payDateOffsetDays),
    label: `${startKey} - ${endKey}`,
    frequency,
  };
}

function formatBalanceMessage(balanceAbs, periodLabel, stage) {
  const amount = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(Math.abs(Number(balanceAbs) || 0));
  if (stage === "overdue") {
    return `Your balance of ${amount} from ${periodLabel} is overdue. Your salary will be delayed if it is not cleared by today.`;
  }
  return `You owe ${amount} from ${periodLabel}. Please clear it within 3 days.`;
}

function breakMinutesBetween(clockInIso, clockOutIso, breakStartIso, breakEndIso) {
  const clockIn = new Date(clockInIso).getTime();
  const clockOut = new Date(clockOutIso).getTime();
  const breakStart = new Date(breakStartIso).getTime();
  const breakEnd = new Date(breakEndIso).getTime();
  if (![clockIn, clockOut, breakStart, breakEnd].every(Number.isFinite)) return 0;
  const start = Math.max(clockIn, breakStart);
  const end = Math.min(clockOut, breakEnd);
  if (end <= start) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}

function workedMinutes(row, now = new Date()) {
  const start = new Date(row?.clock_in).getTime();
  const end = row?.clock_out ? new Date(row.clock_out).getTime() : now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  let total = Math.max(0, Math.round((end - start) / 60000));
  const breakStart = new Date(row?.break_start_at || row?.break_start || "").getTime();
  const breakEnd = new Date(row?.break_end_at || row?.break_end || "").getTime();
  if (Number.isFinite(breakStart) && Number.isFinite(breakEnd) && breakEnd > breakStart) {
    total -= breakMinutesBetween(row.clock_in, row.clock_out || new Date().toISOString(), breakStartIso(row), breakEndIso(row));
  } else {
    total -= Math.max(0, Number(row?.break_minutes || 0));
  }
  return Math.max(0, total);
}

function breakStartIso(row) {
  return row?.break_start_at || row?.break_start || null;
}

function breakEndIso(row) {
  return row?.break_end_at || row?.break_end || null;
}

function hourlyRateFromValue(value) {
  if (value == null || value === "") return 0;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function getAuthedUser(supabase, req) {
  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    const error = new Error("Missing authorization");
    error.status = 401;
    throw error;
  }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) {
    const authError = new Error("Invalid or expired session");
    authError.status = 401;
    throw authError;
  }
  return data.user;
}

function normalizeMembershipRole(value) {
  const role = cleanText(value).toLowerCase();
  if (role === "owner" || role === "supervisor" || role === "admin") return role;
  return "employee";
}

function effectiveHourlyRateForDate(payRateRows, asOfDate, fallbackRate) {
  const target = cleanText(asOfDate);
  let selected = 0;
  for (const row of Array.isArray(payRateRows) ? payRateRows : []) {
    const effectiveDate = cleanText(row?.effective_date);
    const rate = hourlyRateFromValue(row?.hourly_rate);
    if (!effectiveDate || !target) continue;
    if (effectiveDate <= target && rate > 0) selected = rate;
  }
  return selected > 0 ? selected : hourlyRateFromValue(fallbackRate);
}

function computeWorkedCost(row, rate) {
  if (row?.clock_out && row?.labour_cost != null && row?.labour_cost !== "") {
    const stored = Number(row.labour_cost);
    if (Number.isFinite(stored)) return stored;
  }
  const minutes = workedMinutes(row);
  const raw = (minutes / 60) * (Number(rate) || 0);
  return Number.isFinite(raw) ? raw : 0;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const url = getSupabaseUrl();
  const serviceKey = getSupabaseServiceKey();
  if (!url || !serviceKey) {
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const user = await getAuthedUser(supabase, req);
    let { data: membership, error: membershipError } = await supabase
      .from("company_members")
      .select("company_id, role, status, employment_status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (membershipError && isMissingColumnError(membershipError, "status")) {
      const fallback = await supabase.from("company_members").select("company_id, role").eq("user_id", user.id).maybeSingle();
      if (fallback.error) throw fallback.error;
      if (!fallback.data?.company_id) {
        res.status(200).json({ reminder: null });
        return;
      }
      const role = normalizeMembershipRole(fallback.data.role);
      if (role !== "employee") {
        res.status(200).json({ reminder: null });
        return;
      }
      membership = fallback.data;
    } else if (membershipError) {
      throw membershipError;
    }

    const role = normalizeMembershipRole(membership?.role);
    if (role !== "employee") {
      res.status(200).json({ reminder: null });
      return;
    }
    const companyId = cleanText(membership?.company_id);
    if (!companyId) {
      res.status(200).json({ reminder: null });
      return;
    }

    const { data: companyRow, error: companyError } = await supabase
      .from("companies")
      .select("time_zone")
      .eq("id", companyId)
      .maybeSingle();
    if (companyError) throw companyError;
    const timeZone = cleanText(companyRow?.time_zone) || DEFAULT_TIME_ZONE;

    const { data: settingsRow, error: settingsError } = await supabase
      .from("payroll_settings")
      .select("frequency, payroll_day, anchor_date, pay_date_offset_days")
      .eq("company_id", companyId)
      .maybeSingle();
    if (settingsError) {
      if (isMissingRelationError(settingsError)) {
        res.status(200).json({ reminder: null });
        return;
      }
      throw settingsError;
    }
    if (!settingsRow?.anchor_date) {
      res.status(200).json({ reminder: null });
      return;
    }

    const todayKey = calendarDateKeyInTimeZone(new Date(), timeZone);
    const latestCompletedPeriod = getPayrollPeriodWindowForDateKey(addWallDays(todayKey, -1), settingsRow, timeZone);
    if (!latestCompletedPeriod || !latestCompletedPeriod.endKey) {
      res.status(200).json({ reminder: null });
      return;
    }

    const daysSinceEnd = diffDays(todayKey, latestCompletedPeriod.endKey);
    if (daysSinceEnd < 1) {
      res.status(200).json({ reminder: null });
      return;
    }

    const { data: profileRow, error: profileError } = await supabase
      .from("profiles")
      .select("hourly_rate, joining_date, pay_rate_effective_date, employment_status, full_name, email")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    const { data: adjustmentRow, error: adjustmentError } = await supabase
      .from("payroll_balance_adjustments")
      .select("amount, effective_date, deleted_at, adjustment_type")
      .eq("company_id", companyId)
      .eq("employee_id", user.id)
      .eq("adjustment_type", "brought_forward")
      .is("deleted_at", null)
      .maybeSingle();
    if (adjustmentError && !isMissingRelationError(adjustmentError)) {
      throw adjustmentError;
    }

    const payrollStartDate =
      cleanText(adjustmentRow?.effective_date) ||
      cleanText(profileRow?.joining_date) ||
      cleanText(profileRow?.pay_rate_effective_date);
    if (payrollStartDate && payrollStartDate > latestCompletedPeriod.endKey) {
      res.status(200).json({ reminder: null });
      return;
    }

    let payRateRows = [];
    const { data: payRateData, error: payRateError } = await supabase
      .from("employee_pay_rates")
      .select("hourly_rate, effective_date")
      .eq("company_id", companyId)
      .eq("employee_id", user.id)
      .order("effective_date", { ascending: true });
    if (payRateError && !isMissingRelationError(payRateError)) {
      if (!isMissingRelationError(payRateError)) console.warn("[PAYROLL_REMINDER] pay rate history load failed", payRateError);
    } else {
      payRateRows = Array.isArray(payRateData) ? payRateData : [];
    }

    const startIso = payrollStartDate ? `${payrollStartDate}T00:00:00Z` : null;
    const endIso = `${latestCompletedPeriod.endKey}T23:59:59Z`;
    const [timesheetRes, paymentsRes, loansRes] = await Promise.all([
      supabase
        .from("timesheets")
        .select("id, clock_in, clock_out, labour_cost, hourly_rate, break_start_at, break_end_at, break_minutes")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .order("clock_in", { ascending: true })
        .gte("clock_in", startIso || `${latestCompletedPeriod.startKey}T00:00:00Z`)
        .lte("clock_in", endIso),
      supabase
        .from("payroll_payments")
        .select("paid_amount, paid_date, period_end, deleted_at")
        .eq("company_id", companyId)
        .eq("employee_id", user.id)
        .is("deleted_at", null)
        .lte("paid_date", latestCompletedPeriod.endKey),
      supabase
        .from("employee_loan_transactions")
        .select("amount, transaction_type, transaction_date, deleted_at")
        .eq("company_id", companyId)
        .eq("employee_id", user.id)
        .is("deleted_at", null)
        .lte("transaction_date", latestCompletedPeriod.endKey),
    ]);

    if (timesheetRes.error && !isMissingRelationError(timesheetRes.error)) throw timesheetRes.error;
    if (paymentsRes.error && !isMissingRelationError(paymentsRes.error)) throw paymentsRes.error;
    if (loansRes.error && !isMissingRelationError(loansRes.error)) throw loansRes.error;

    const completedTimesheets = (timesheetRes.data || []).filter((row) => cleanText(row?.clock_out));
    let workedAmount = 0;
    for (const row of completedTimesheets) {
      const rowDateKey = calendarDateKeyInTimeZone(row.clock_out || row.clock_in, timeZone);
      if (!rowDateKey || rowDateKey < (payrollStartDate || latestCompletedPeriod.startKey)) continue;
      if (rowDateKey > latestCompletedPeriod.endKey) continue;
      const storedRate = hourlyRateFromValue(row?.hourly_rate);
      const effectiveRate = storedRate > 0 ? storedRate : effectiveHourlyRateForDate(payRateRows, rowDateKey, profileRow?.hourly_rate);
      workedAmount += computeWorkedCost(row, effectiveRate);
    }

    let paidAmount = 0;
    for (const row of paymentsRes.data || []) {
      const paidDate = cleanText(row?.paid_date);
      if (!paidDate || paidDate < (payrollStartDate || latestCompletedPeriod.startKey) || paidDate > latestCompletedPeriod.endKey) continue;
      paidAmount += Number(row?.paid_amount || 0) || 0;
    }

    let loanNet = 0;
    for (const row of loansRes.data || []) {
      const transactionDate = cleanText(row?.transaction_date);
      if (!transactionDate || transactionDate < (payrollStartDate || latestCompletedPeriod.startKey) || transactionDate > latestCompletedPeriod.endKey) continue;
      const amount = Number(row?.amount || 0) || 0;
      const direction = cleanText(row?.transaction_type).toLowerCase();
      if (direction === "loan_returned") loanNet += amount;
      else loanNet -= amount;
    }

    const openingBalance = Number(adjustmentRow?.amount || 0) || 0;
    const balance = openingBalance + workedAmount - paidAmount + loanNet;
    if (!(balance < 0)) {
      res.status(200).json({ reminder: null });
      return;
    }

    const stage = daysSinceEnd <= 3 ? "due" : "overdue";
    const reminder = {
      employeeId: user.id,
      companyId,
      stage,
      balance,
      balanceAbs: Math.abs(balance),
      periodStart: latestCompletedPeriod.startKey,
      periodEnd: latestCompletedPeriod.endKey,
      periodLabel: `${latestCompletedPeriod.startKey} - ${latestCompletedPeriod.endKey}`,
      payDate: latestCompletedPeriod.payDateKey || addWallDays(latestCompletedPeriod.endKey, payrollPayDateOffsetDaysValue(settingsRow)),
      dueDate: addWallDays(latestCompletedPeriod.endKey, 1),
      warningDate: addWallDays(latestCompletedPeriod.endKey, 4),
      message: formatBalanceMessage(Math.abs(balance), `${latestCompletedPeriod.startKey} - ${latestCompletedPeriod.endKey}`, stage),
      title: stage === "overdue" ? "Salary delay warning" : "Payroll balance reminder",
    };

    res.status(200).json({ reminder });
  } catch (err) {
    console.warn("[PAYROLL_REMINDER] failed", err);
    res.status(err.status || 500).json({ error: err.message || "Could not load payroll reminder" });
  }
}
