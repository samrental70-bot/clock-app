import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DEV_REF = "jvlxahskximvbajjwbut";
const QA_PREFIX = "QA Payroll Seed";

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateKey(dateKey) {
  return new Date(`${String(dateKey || "").trim()}T12:00:00`);
}

function addDaysKey(dateKey, deltaDays) {
  const d = parseDateKey(dateKey);
  if (Number.isNaN(d.getTime())) return String(dateKey || "").trim();
  d.setDate(d.getDate() + deltaDays);
  return localDateKey(d);
}

function addMinutesToLocalIso(dateKey, timeHHmm, minutes) {
  const start = new Date(`${String(dateKey || "").trim()}T${String(timeHHmm || "08:00").trim()}:00`);
  if (Number.isNaN(start.getTime())) return null;
  start.setMinutes(start.getMinutes() + minutes);
  return start.toISOString();
}

function firstDayOfMonth(dateKey) {
  const d = parseDateKey(dateKey);
  if (Number.isNaN(d.getTime())) return String(dateKey || "").trim();
  d.setDate(1);
  return localDateKey(d);
}

function lastDayOfMonth(dateKey) {
  const d = parseDateKey(dateKey);
  if (Number.isNaN(d.getTime())) return String(dateKey || "").trim();
  d.setMonth(d.getMonth() + 1, 0);
  return localDateKey(d);
}

function startOfWeekFriday(dateKey) {
  const d = parseDateKey(dateKey);
  if (Number.isNaN(d.getTime())) return String(dateKey || "").trim();
  while (d.getDay() !== 5) {
    d.setDate(d.getDate() - 1);
  }
  return localDateKey(d);
}

function buildPayrollPeriods(anchorDateKey, frequency, count = 4) {
  const freq = String(frequency || "").trim().toLowerCase();
  const anchor = String(anchorDateKey || "").trim() || startOfWeekFriday(localDateKey(new Date()));
  const periods = [];

  if (freq === "monthly") {
    let monthKey = lastDayOfMonth(anchor);
    for (let index = 0; index < count; index += 1) {
      const startKey = firstDayOfMonth(monthKey);
      periods.push({ startKey, endKey: monthKey, payDateKey: monthKey });
      const prevMonthEnd = parseDateKey(startKey);
      prevMonthEnd.setMonth(prevMonthEnd.getMonth() - 1, 0);
      monthKey = localDateKey(prevMonthEnd);
    }
    return periods.reverse();
  }

  const cycleDays = freq === "weekly_friday" ? 7 : 14;
  let endKey = anchor;
  for (let index = 0; index < count; index += 1) {
    const startKey = addDaysKey(endKey, 1 - cycleDays);
    periods.push({ startKey, endKey, payDateKey: endKey });
    endKey = addDaysKey(startKey, -1);
  }
  return periods.reverse();
}

function moneyNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function maskRef(url) {
  const match = String(url || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (!match) return "";
  const ref = match[1];
  return `...${ref.slice(-6)}`;
}

function chunk(items, size = 40) {
  const out = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

async function main() {
  const env = {
    ...readEnvFile(".env.development"),
    ...process.env,
  };

  const supabaseUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").trim();
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing development Supabase env. Ensure .env.development includes VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  if (!supabaseUrl.includes(DEV_REF)) {
    throw new Error(`Blocked: expected dev Supabase ref ${DEV_REF}, got ${maskRef(supabaseUrl) || "unknown"}.`);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const seedTag = `${QA_PREFIX} ${new Date().toISOString().slice(0, 10)}`;

  const { data: payrollSettingsRows, error: payrollSettingsErr } = await supabase
    .from("payroll_settings")
    .select("company_id, frequency, payroll_day, anchor_date")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (payrollSettingsErr) throw payrollSettingsErr;

  let companyId = String(payrollSettingsRows?.[0]?.company_id || "").trim();
  let payrollSettings = payrollSettingsRows?.[0] || null;

  if (!companyId) {
    const { data: memberRows, error: memberErr } = await supabase.from("company_members").select("company_id");
    if (memberErr) throw memberErr;
    const counts = new Map();
    for (const row of memberRows || []) {
      const cid = String(row?.company_id || "").trim();
      if (!cid) continue;
      counts.set(cid, (counts.get(cid) || 0) + 1);
    }
    if (counts.size === 0) throw new Error("No company found to seed.");
    companyId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const { data: companyPayrollSettings, error: settingsErr } = await supabase
      .from("payroll_settings")
      .select("company_id, frequency, payroll_day, anchor_date")
      .eq("company_id", companyId)
      .maybeSingle();
    if (settingsErr) throw settingsErr;
    payrollSettings = companyPayrollSettings || null;
  }

  const { data: companyRow, error: companyErr } = await supabase
    .from("companies")
    .select("id, name, time_zone")
    .eq("id", companyId)
    .maybeSingle();
  if (companyErr) throw companyErr;

  const frequency = String(payrollSettings?.frequency || "alternate_friday").trim().toLowerCase() || "alternate_friday";
  const anchorDate = String(payrollSettings?.anchor_date || "").trim() || startOfWeekFriday(localDateKey(new Date()));
  const periods = buildPayrollPeriods(anchorDate, frequency, 8);

  const [existingTimesheetRes, existingPaymentRes, existingAdjustmentRes, existingLoanRes] = await Promise.all([
    supabase
      .from("timesheets")
      .select("user_id, clock_in, cost_centre")
      .eq("company_id", companyId)
      .ilike("cost_centre", `${QA_PREFIX}%`),
    supabase
      .from("payroll_payments")
      .select("employee_id, period_start, period_end, paid_date, note")
      .eq("company_id", companyId)
      .ilike("note", `${QA_PREFIX}%`),
    supabase
      .from("payroll_balance_adjustments")
      .select("employee_id, adjustment_type, effective_date, note")
      .eq("company_id", companyId)
      .ilike("note", `${QA_PREFIX}%`),
    supabase
      .from("employee_loan_transactions")
      .select("employee_id, transaction_type, transaction_date, note")
      .eq("company_id", companyId)
      .ilike("note", `${QA_PREFIX}%`),
  ]);

  if (existingTimesheetRes.error) throw existingTimesheetRes.error;
  if (existingPaymentRes.error) throw existingPaymentRes.error;
  if (existingAdjustmentRes.error) throw existingAdjustmentRes.error;
  if (existingLoanRes.error) throw existingLoanRes.error;

  const existingSeedCounts = {
    timesheets: Number((existingTimesheetRes.data || []).length || 0),
    payments: Number((existingPaymentRes.data || []).length || 0),
    adjustments: Number((existingAdjustmentRes.data || []).length || 0),
    loans: Number((existingLoanRes.data || []).length || 0),
  };
  console.log(
    `[PAYROLL-SEED] existing QA rows for ${maskRef(supabaseUrl)} -> timesheets:${existingSeedCounts.timesheets}, payments:${existingSeedCounts.payments}, adjustments:${existingSeedCounts.adjustments}, loans:${existingSeedCounts.loans}`
  );

  const existingTimesheetKeys = new Set();
  for (const row of existingTimesheetRes.data || []) {
    const employeeId = String(row?.user_id || "").trim();
    const clockInDateKey = String(row?.clock_in || "").slice(0, 10);
    if (!employeeId || !clockInDateKey) continue;
    for (const period of periods) {
      if (clockInDateKey >= period.startKey && clockInDateKey <= period.endKey) {
        existingTimesheetKeys.add(`${employeeId}::${period.startKey}::${period.endKey}`);
        break;
      }
    }
  }

  const existingPaymentKeys = new Set();
  for (const row of existingPaymentRes.data || []) {
    const employeeId = String(row?.employee_id || "").trim();
    const periodStart = String(row?.period_start || "").trim();
    const periodEnd = String(row?.period_end || "").trim();
    const paidDateKey = String(row?.paid_date || "").trim();
    if (!employeeId) continue;
    if (periodStart && periodEnd) {
      existingPaymentKeys.add(`${employeeId}::${periodStart}::${periodEnd}`);
      continue;
    }
    for (const period of periods) {
      if (paidDateKey && paidDateKey >= period.startKey && paidDateKey <= period.endKey) {
        existingPaymentKeys.add(`${employeeId}::${period.startKey}::${period.endKey}`);
        break;
      }
    }
  }

  const existingAdjustmentKeys = new Set();
  for (const row of existingAdjustmentRes.data || []) {
    const employeeId = String(row?.employee_id || "").trim();
    const type = String(row?.adjustment_type || "").trim() || "brought_forward";
    if (employeeId) existingAdjustmentKeys.add(`${employeeId}::${type}`);
  }

  const existingLoanKeys = new Set();
  for (const row of existingLoanRes.data || []) {
    const employeeId = String(row?.employee_id || "").trim();
    const type = String(row?.transaction_type || "").trim() || "loan_given";
    const dateKey = String(row?.transaction_date || "").trim();
    if (employeeId) existingLoanKeys.add(`${employeeId}::${type}::${dateKey}`);
  }

  const { data: memberRows, error: memberErr } = await supabase
    .from("company_members")
    .select("user_id, role")
    .eq("company_id", companyId)
    .order("role", { ascending: true });
  if (memberErr) throw memberErr;

  const employeeIds = [...new Set((memberRows || []).map((row) => String(row?.user_id || "").trim()).filter(Boolean))];
  if (employeeIds.length === 0) throw new Error("No members found in the selected development company.");

  const { data: profileRows, error: profileErr } = await supabase
    .from("profiles")
    .select("id, full_name, email, hourly_rate, employment_status")
    .in("id", employeeIds);
  if (profileErr) throw profileErr;

  const profileById = new Map((profileRows || []).map((row) => [String(row.id), row]));

  const { data: projectRows, error: projectErr } = await supabase
    .from("projects")
    .select("id, name")
    .eq("company_id", companyId)
    .order("name", { ascending: true })
    .limit(12);
  if (projectErr) throw projectErr;

  const { data: sampleTimesheets, error: sampleErr } = await supabase
    .from("timesheets")
    .select("project_id, project_name, cost_centre")
    .eq("company_id", companyId)
    .order("clock_in", { ascending: false })
    .limit(30);
  if (sampleErr) throw sampleErr;

  const templates = [];
  for (const row of sampleTimesheets || []) {
    const key = `${String(row?.project_id || "")}::${String(row?.project_name || "")}::${String(row?.cost_centre || "")}`;
    if (!templates.some((item) => `${String(item.project_id || "")}::${String(item.project_name || "")}::${String(item.cost_centre || "")}` === key)) {
      templates.push({
        project_id: row?.project_id || null,
        project_name: row?.project_name || "QA Payroll Seed Project",
        cost_centre: row?.cost_centre || "QA Payroll Seed Task",
      });
    }
  }
  if (templates.length === 0) {
    for (const row of projectRows || []) {
      templates.push({
        project_id: row?.id || null,
        project_name: row?.name || "QA Payroll Seed Project",
        cost_centre: "QA Payroll Seed Task",
      });
    }
  }
  if (templates.length === 0) {
    templates.push({ project_id: null, project_name: "QA Payroll Seed Project", cost_centre: "QA Payroll Seed Task" });
  }

  const timesheetRows = [];
  const paymentRows = [];
  const adjustmentRows = [];
  const loanRows = [];

  for (let employeeIndex = 0; employeeIndex < employeeIds.length; employeeIndex += 1) {
    const employeeId = employeeIds[employeeIndex];
    const profile = profileById.get(employeeId) || {};
    const employeeName =
      normalizeText(profile.full_name) ||
      normalizeText(profile.email) ||
      employeeId.split("@")[0] ||
      `Employee ${employeeIndex + 1}`;
    const employeeEmail = normalizeText(profile.email) || `${employeeName.toLowerCase().replace(/\s+/g, ".")}@example.com`;
    const hourlyRate = moneyNumber(profile.hourly_rate, 0) > 0 ? moneyNumber(profile.hourly_rate, 0) : 28 + employeeIndex * 2.75;

    const balanceForward = employeeIndex % 4 === 0 ? 0 : employeeIndex % 4 === 1 ? 125 : employeeIndex % 4 === 2 ? -75 : 220;
    const loanGiven = employeeIndex % 2 === 0 ? 300 : 0;
    const loanReturned = employeeIndex % 3 === 0 ? 100 : employeeIndex % 5 === 0 ? 50 : 0;

    let periodWorkMinutes = 0;

    for (let periodIndex = 0; periodIndex < periods.length; periodIndex += 1) {
      const period = periods[periodIndex];
      const template = templates[(employeeIndex + periodIndex) % templates.length];
      const clockInDate = addDaysKey(period.startKey, 1 + ((employeeIndex + periodIndex) % 4));
      const clockInTime = employeeIndex % 2 === 0 ? "08:00" : "08:30";
      const workedMinutes = 360 + ((employeeIndex + periodIndex) % 4) * 45;
      const breakMinutes = (employeeIndex + periodIndex) % 2 === 0 ? 30 : 0;
      const shiftMinutes = workedMinutes + breakMinutes;
      const clockInIso = addMinutesToLocalIso(clockInDate, clockInTime, 0);
      const clockOutIso = clockInIso ? new Date(new Date(clockInIso).getTime() + shiftMinutes * 60000).toISOString() : null;
      const breakStartIso = breakMinutes > 0 && clockInIso ? new Date(new Date(clockInIso).getTime() + Math.max(60, Math.round(workedMinutes * 0.45)) * 60000).toISOString() : null;
      const breakEndIso = breakStartIso ? new Date(new Date(breakStartIso).getTime() + breakMinutes * 60000).toISOString() : null;
      const labourCost = (workedMinutes / 60) * hourlyRate;

      const periodKey = `${employeeId}::${period.startKey}::${period.endKey}`;
      if (!existingTimesheetKeys.has(periodKey)) {
        timesheetRows.push({
          company_id: companyId,
          company_name: companyRow?.name || "QA Payroll Company",
          user_id: employeeId,
          employee_email: employeeEmail,
          employee_name: employeeName,
          project_id: template.project_id,
          project_name: `${QA_PREFIX} - ${template.project_name}`,
          hourly_rate: hourlyRate,
          cost_centre: `${QA_PREFIX} - ${template.cost_centre}`,
          clock_in: clockInIso,
          clock_out: clockOutIso,
          status: "Submitted",
          labour_cost: labourCost,
          break_start_at: breakStartIso,
          break_end_at: breakEndIso,
          break_minutes: breakMinutes,
          clock_in_latitude: null,
          clock_in_longitude: null,
          clock_out_latitude: null,
          clock_out_longitude: null,
        });
        existingTimesheetKeys.add(periodKey);
      }

      if (!existingAdjustmentKeys.has(`${employeeId}::brought_forward`) && periodIndex === 0) {
        adjustmentRows.push({
          company_id: companyId,
          employee_id: employeeId,
          adjustment_type: "brought_forward",
          amount: balanceForward,
          effective_date: periods[0]?.startKey || anchorDate,
          note: `${seedTag} balance brought forward`,
          created_by: employeeIds[0],
        });
        existingAdjustmentKeys.add(`${employeeId}::brought_forward`);
      }

      if (loanGiven > 0 && periodIndex === 1) {
        const loanGivenKey = `${employeeId}::loan_given::${periods[1]?.startKey || periods[0]?.startKey || anchorDate}`;
        if (!existingLoanKeys.has(loanGivenKey)) {
          loanRows.push({
            company_id: companyId,
            employee_id: employeeId,
            transaction_type: "loan_given",
            amount: loanGiven,
            transaction_date: periods[1]?.startKey || periods[0]?.startKey || anchorDate,
            note: `${seedTag} loan given`,
            created_by: employeeIds[0],
          });
          existingLoanKeys.add(loanGivenKey);
        }
      }

      if (loanReturned > 0 && periodIndex === periods.length - 1) {
        const loanReturnedKey = `${employeeId}::loan_returned::${periods.at(-1)?.endKey || anchorDate}`;
        if (!existingLoanKeys.has(loanReturnedKey)) {
          loanRows.push({
            company_id: companyId,
            employee_id: employeeId,
            transaction_type: "loan_returned",
            amount: loanReturned,
            transaction_date: periods.at(-1)?.endKey || anchorDate,
            note: `${seedTag} loan returned`,
            created_by: employeeIds[0],
          });
          existingLoanKeys.add(loanReturnedKey);
        }
      }

      const targetBalance = (employeeIndex + periodIndex) % 3 === 0 ? 0 : (employeeIndex + periodIndex) % 3 === 1 ? 65 : -35;
      const paymentAmount = Math.max(0, labourCost - targetBalance);
      if (!existingPaymentKeys.has(periodKey)) {
        paymentRows.push({
          company_id: companyId,
          employee_id: employeeId,
          period_start: period.startKey,
          period_end: period.endKey,
          paid_amount: paymentAmount,
          paid_date: period.payDateKey,
          note: `${seedTag} payment ${period.startKey} - ${period.endKey}`,
          created_by: employeeIds[0],
        });
        existingPaymentKeys.add(periodKey);
      }

      periodWorkMinutes += workedMinutes;
    }
    console.log(
      `[PAYROLL-SEED] ${employeeName}: worked ${periodWorkMinutes} minutes across ${periods.length} periods, B/F ${balanceForward.toFixed(2)}, loans ${(loanReturned - loanGiven).toFixed(2)}`
    );
  }

  const inserts = [
    { table: "timesheets", rows: timesheetRows },
    { table: "payroll_payments", rows: paymentRows },
    { table: "payroll_balance_adjustments", rows: adjustmentRows },
    { table: "employee_loan_transactions", rows: loanRows },
  ];

  const insertedCounts = { timesheets: 0, payments: 0, adjustments: 0, loans: 0 };

  for (const batch of inserts) {
    let inserted = 0;
    for (const rows of chunk(batch.rows, 40)) {
      if (rows.length === 0) continue;
      const { error } = await supabase.from(batch.table).insert(rows);
      if (error) throw error;
      inserted += rows.length;
    }
    if (batch.table === "timesheets") insertedCounts.timesheets += inserted;
    if (batch.table === "payroll_payments") insertedCounts.payments += inserted;
    if (batch.table === "payroll_balance_adjustments") insertedCounts.adjustments += inserted;
    if (batch.table === "employee_loan_transactions") insertedCounts.loans += inserted;
  }

  console.log(
    `[PAYROLL-SEED] inserted ${insertedCounts.timesheets} timesheets, ${insertedCounts.payments} payments, ${insertedCounts.adjustments} balance rows, ${insertedCounts.loans} loan rows for ${maskRef(supabaseUrl)}.`
  );
}

main().catch((error) => {
  console.error("[PAYROLL-SEED] failed:", error.message);
  process.exitCode = 1;
});
