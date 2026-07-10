import { createClient } from "@supabase/supabase-js";
import { runDailySupervisorReportCron } from "../api-shared/dailyReportScheduler.js";

const DEFAULT_TIME_ZONE = "America/Toronto";
const DEFAULT_AUTO_CLOCK_OUT_TIME = "00:00";
const AUTO_TIMED_OUT_STATUS = "Auto timed out";

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
}

function headerValue(req, name) {
  const key = String(name || "").toLowerCase();
  const value = req.headers?.[key] ?? req.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function requestOrigin(req) {
  const host = headerValue(req, "x-forwarded-host") || headerValue(req, "host");
  if (!host) return "";
  const proto = headerValue(req, "x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

function requestBody(req) {
  if (!req?.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return typeof req.body === "object" ? req.body : {};
}

function requestFlag(req, body, name) {
  const value = String(body?.[name] ?? req.query?.[name] ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y"].includes(value);
}

function normalizeAutoClockOutTime(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? `${match[1]}:${match[2]}` : DEFAULT_AUTO_CLOCK_OUT_TIME;
}

function isMissingCompanySettingsColumnError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return (
    msg.includes("column") &&
    (msg.includes("auto_clock_out_time") ||
      msg.includes("assign_all_projects_to_all_employees") ||
      msg.includes("assign_all_tasks_to_all_projects"))
  );
}

function isMissingOptionalAccuracyColumnError(error) {
  const m = String(error?.message || "").toLowerCase();
  return (
    m.includes("column") &&
    (m.includes("accuracy") ||
      m.includes("clock_in_accuracy") ||
      m.includes("clock_out_accuracy") ||
      m.includes("break_minutes") ||
      m.includes("break_start_at") ||
      m.includes("break_end_at"))
  );
}

function hourlyRateFromValue(value) {
  if (value == null || value === "") return 0;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function isMissingPayRatesTableError(error) {
  const msg = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return code === "42p01" || msg.includes("employee_pay_rates") || (msg.includes("relation") && msg.includes("does not exist"));
}

function datePartsInTimeZone(dateOrIso, timeZone) {
  const date = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || DEFAULT_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const out = {};
    for (const part of parts) {
      if (part.type !== "literal") out[part.type] = part.value;
    }
    const hour = Number(out.hour);
    return {
      year: Number(out.year),
      month: Number(out.month),
      day: Number(out.day),
      hour: Number.isFinite(hour) ? hour % 24 : 0,
      minute: Number(out.minute),
      second: Number(out.second),
    };
  } catch {
    return null;
  }
}

function calendarDateKeyInTimeZone(dateOrIso, timeZone) {
  const parts = datePartsInTimeZone(dateOrIso, timeZone);
  if (!parts) return "";
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function wallDateTimeToUtcIso(dateKey, timeText, timeZone) {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  const [hour = 0, minute = 0, second = 0] = String(timeText || "00:00:00").split(":").map(Number);
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null;

  const targetUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = targetUtc;
  for (let i = 0; i < 3; i += 1) {
    const parts = datePartsInTimeZone(new Date(guess), timeZone);
    if (!parts) return null;
    const seenUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const delta = targetUtc - seenUtc;
    if (Math.abs(delta) < 1000) break;
    guess += delta;
  }
  return new Date(guess).toISOString();
}

function addWallDays(dateKey, days) {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return "";
  return new Date(Date.UTC(year, month - 1, day + Number(days || 0))).toISOString().slice(0, 10);
}

function autoClockOutIsoForShift(clockInIso, timeZone, autoClockOutTime) {
  const clockInMs = new Date(clockInIso).getTime();
  if (!Number.isFinite(clockInMs)) return null;
  const tz = timeZone || DEFAULT_TIME_ZONE;
  const time = normalizeAutoClockOutTime(autoClockOutTime);
  const clockInDateKey = calendarDateKeyInTimeZone(clockInIso, tz);
  if (!clockInDateKey) return null;
  const sameDayIso = wallDateTimeToUtcIso(clockInDateKey, `${time}:00`, tz);
  const sameDayMs = sameDayIso ? new Date(sameDayIso).getTime() : NaN;
  const dueDateKey = Number.isFinite(sameDayMs) && sameDayMs > clockInMs ? clockInDateKey : addWallDays(clockInDateKey, 1);
  return dueDateKey ? wallDateTimeToUtcIso(dueDateKey, `${time}:00`, tz) : null;
}

function rowIsDue(row, settings, nowMs) {
  if (!row?.clock_in || row?.clock_out) return false;
  const clockInMs = new Date(row.clock_in).getTime();
  if (!Number.isFinite(clockInMs) || clockInMs > nowMs) return false;
  const dueIso = autoClockOutIsoForShift(row.clock_in, settings?.timeZone, settings?.autoClockOutTime);
  const dueMs = dueIso ? new Date(dueIso).getTime() : NaN;
  return Number.isFinite(dueMs) && dueMs <= nowMs;
}

function computeWorkedHours(row, clockOutIso) {
  const t0 = new Date(row?.clock_in).getTime();
  const t1 = new Date(clockOutIso).getTime();
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return 0;
  let workedMs = t1 - t0;
  const breakStart = row?.break_start_at || row?.break_start || row?.breakStart;
  const breakEnd = row?.break_end_at || row?.break_end || row?.breakEnd;
  const tb0 = new Date(breakStart).getTime();
  const tb1 = new Date(breakEnd).getTime();
  if (Number.isFinite(tb0) && Number.isFinite(tb1) && tb1 > tb0) {
    workedMs -= Math.max(0, Math.min(tb1, t1) - Math.max(tb0, t0));
  }
  return Math.max(0, workedMs / 3600000);
}

function computeLabourCost(row, clockOutIso, hourlyRate) {
  return computeWorkedHours(row, clockOutIso) * (Number(hourlyRate) || 0);
}

function formatDateTime(iso, timeZone) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || DEFAULT_TIME_ZONE,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function employeeNameForRow(row) {
  return (
    String(row?.employee_name || "").trim() ||
    String(row?.employee_email || "").trim() ||
    "Employee"
  );
}

function projectLabelForRow(row) {
  return [row?.project_name, row?.cost_centre]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" - ");
}

function buildNotificationMessage(row, timeZone, recipientUserId) {
  const employeeName = employeeNameForRow(row);
  const place = projectLabelForRow(row);
  const clockInText = formatDateTime(row.clock_in, timeZone);
  const clockOutText = formatDateTime(row.clock_out, timeZone);
  const isEmployeeRecipient = String(recipientUserId) === String(row.user_id);
  const subject = isEmployeeRecipient ? "Your shift" : `${employeeName}'s shift`;
  return [
    `${subject} was automatically clocked out${place ? ` at ${place}` : ""}.`,
    clockInText ? `Clock in: ${clockInText}` : "",
    clockOutText ? `Auto clock-out: ${clockOutText}` : "",
  ].filter(Boolean).join("\n");
}

async function getEffectiveHourlyRateForRow(supabase, row, settings) {
  const rowRate = hourlyRateFromValue(row?.hourly_rate);
  if (!row?.user_id) return rowRate;
  const effectiveDate = calendarDateKeyInTimeZone(row?.clock_in || new Date(), settings?.timeZone || DEFAULT_TIME_ZONE);
  if (row?.company_id && effectiveDate) {
    const { data, error } = await supabase
      .from("employee_pay_rates")
      .select("hourly_rate, effective_date")
      .eq("company_id", row.company_id)
      .eq("employee_id", row.user_id)
      .lte("effective_date", effectiveDate)
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error && !isMissingPayRatesTableError(error)) {
      console.warn("[AUTO_CLOCK_OUT] effective rate fetch failed", row.user_id, error);
    }
    const historyRate = hourlyRateFromValue(data?.hourly_rate);
    if (historyRate > 0) return historyRate;
  }
  if (rowRate > 0) return rowRate;
  const { data, error } = await supabase
    .from("profiles")
    .select("hourly_rate")
    .eq("id", row.user_id)
    .maybeSingle();
  if (error) {
    console.warn("[AUTO_CLOCK_OUT] profile rate fetch failed", row.user_id, error);
    return 0;
  }
  return hourlyRateFromValue(data?.hourly_rate);
}

async function updateTimesheetAutoClockOut(supabase, row, hourlyRate, settings) {
  const clockOutIso = autoClockOutIsoForShift(row.clock_in, settings?.timeZone, settings?.autoClockOutTime);
  if (!clockOutIso) {
    return { data: [], error: new Error("Invalid clock_in") };
  }
  const labourCost = computeLabourCost(row, clockOutIso, hourlyRate);
  const rawBreakMinutes =
    row?.break_start_at && row?.break_end_at
      ? Math.round((new Date(row.break_end_at).getTime() - new Date(row.break_start_at).getTime()) / 60000)
      : Number(row?.break_minutes || 0) || 0;
  const payload = {
    clock_out: clockOutIso,
    status: AUTO_TIMED_OUT_STATUS,
    labour_cost: labourCost,
    break_minutes: Number.isFinite(rawBreakMinutes) ? Math.max(0, rawBreakMinutes) : 0,
    clock_out_latitude: null,
    clock_out_longitude: null,
    clock_out_accuracy: null,
  };
  if (hourlyRate > 0 && hourlyRateFromValue(row.hourly_rate) <= 0) {
    payload.hourly_rate = hourlyRate;
  }

  let { data, error } = await supabase
    .from("timesheets")
    .update(payload)
    .eq("id", row.id)
    .is("clock_out", null)
    .select("*");

  if (
    error &&
    isMissingOptionalAccuracyColumnError(error) &&
    ("clock_out_accuracy" in payload ||
      "clock_out_latitude" in payload ||
      "clock_out_longitude" in payload ||
      "break_minutes" in payload)
  ) {
    const rest = { ...payload };
    delete rest.clock_out_accuracy;
    delete rest.clock_out_latitude;
    delete rest.clock_out_longitude;
    delete rest.break_minutes;
    ({ data, error } = await supabase
      .from("timesheets")
      .update(rest)
      .eq("id", row.id)
      .is("clock_out", null)
      .select("*"));
  }

  return { data: data || [], error };
}

async function getCompanySettings(supabase, companyIds) {
  const ids = [...new Set((companyIds || []).filter(Boolean).map(String))];
  if (!ids.length) return {};

  let { data, error } = await supabase
    .from("companies")
    .select("id, time_zone, auto_clock_out_time")
    .in("id", ids);
  if (error && isMissingCompanySettingsColumnError(error)) {
    ({ data, error } = await supabase.from("companies").select("id, time_zone").in("id", ids));
  }
  if (error) {
    console.warn("[AUTO_CLOCK_OUT] company settings fetch failed", error);
    return {};
  }

  const map = {};
  for (const row of data || []) {
    map[String(row.id)] = {
      timeZone: row.time_zone || DEFAULT_TIME_ZONE,
      autoClockOutTime: normalizeAutoClockOutTime(row.auto_clock_out_time),
    };
  }
  return map;
}

async function getNotificationRecipients(supabase, companyId, employeeUserId, cache) {
  const companyKey = String(companyId || "");
  if (!companyKey) return employeeUserId ? [String(employeeUserId)] : [];
  if (!cache.has(companyKey)) {
    const { data, error } = await supabase
      .from("company_members")
      .select("user_id, role")
      .eq("company_id", companyKey);
    if (error) {
      console.warn("[AUTO_CLOCK_OUT] company members fetch failed", companyKey, error);
      cache.set(companyKey, []);
    } else {
      cache.set(companyKey, data || []);
    }
  }
  const members = cache.get(companyKey) || [];
  const recipients = [];
  if (employeeUserId) recipients.push(String(employeeUserId));
  for (const member of members) {
    const role = String(member?.role || "").trim().toLowerCase();
    const userId = String(member?.user_id || "").trim();
    if (!userId) continue;
    if (role === "owner" || role === "admin" || role === "supervisor") {
      recipients.push(userId);
    }
  }
  return [...new Set(recipients)];
}

async function insertAutoClockOutNotifications(supabase, row, recipients, timeZone) {
  if (!row?.company_id || !row?.id || !recipients?.length) return [];
  const rows = recipients.map((recipientUserId) => ({
    company_id: row.company_id,
    recipient_user_id: recipientUserId,
    actor_user_id: row.user_id || null,
    type: "clock_out",
    title: "Shift auto timed out",
    message: buildNotificationMessage(row, timeZone, recipientUserId),
    read_at: null,
    is_read: false,
    project_id: row.project_id != null ? String(row.project_id) : null,
    project_name: row.project_name || null,
    cost_centre: row.cost_centre || null,
    related_timesheet_id: row.id,
    related_folder: row.project_name || null,
    item_count: null,
  }));

  let { data, error } = await supabase.from("notifications").insert(rows).select("id");
  if (error && String(error.message || "").toLowerCase().includes("is_read")) {
    const retryRows = rows.map((row) => {
      const retryRow = { ...row };
      delete retryRow.is_read;
      return retryRow;
    });
    ({ data, error } = await supabase.from("notifications").insert(retryRows).select("id"));
  }
  if (error) {
    console.warn("[AUTO_CLOCK_OUT] notification insert failed", row.id, error);
    return [];
  }
  return (data || []).map((item) => item.id).filter(Boolean);
}

async function sendPushForNotifications(req, notificationIds) {
  const ids = [...new Set((notificationIds || []).filter(Boolean).map(String))];
  if (!ids.length) return { ok: true, skipped: true, sent: 0 };
  const origin = requestOrigin(req);
  if (!origin) return { ok: false, error: "missing origin" };
  try {
    const response = await fetch(`${origin}/api/send-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notification_ids: ids }),
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok) {
      console.warn("[AUTO_CLOCK_OUT] send-push failed", response.status, data);
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    console.warn("[AUTO_CLOCK_OUT] send-push exception", error);
    return { ok: false, error: String(error?.message || error) };
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = headerValue(req, "authorization");
    if (auth !== `Bearer ${cronSecret}` && req.query?.secret !== cronSecret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = getSupabaseUrl();
  if (!serviceKey || !url) {
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const body = requestBody(req);
  if (requestFlag(req, body, "daily_report_only") || requestFlag(req, body, "dailyReportOnly")) {
    const dailyReport = await runDailySupervisorReportCron(req);
    res.status(dailyReport.status).json(dailyReport.body);
    return;
  }

  const companyId = String(body.company_id || req.query?.company_id || "").trim();
  const userId = String(body.user_id || req.query?.user_id || "").trim();
  const nowMs = Date.now();
  let query = supabase
    .from("timesheets")
    .select("*")
    .is("clock_out", null)
    .lte("clock_in", new Date(nowMs).toISOString())
    .order("clock_in", { ascending: true })
    .limit(500);

  if (companyId) query = query.eq("company_id", companyId);
  if (userId) query = query.eq("user_id", userId);

  const { data: openRows, error: dueError } = await query;

  if (dueError) {
    res.status(500).json({ error: dueError.message });
    return;
  }

  const candidateRows = openRows || [];
  const settingsByCompany = await getCompanySettings(supabase, candidateRows.map((row) => row.company_id));
  const rows = candidateRows.filter((row) => {
    const settings = settingsByCompany[String(row.company_id)] || {
      timeZone: DEFAULT_TIME_ZONE,
      autoClockOutTime: DEFAULT_AUTO_CLOCK_OUT_TIME,
    };
    return rowIsDue(row, settings, nowMs);
  });
  const memberCache = new Map();
  const updatedIds = [];
  const notificationIds = [];
  const errors = [];

  for (const row of rows) {
    try {
      const settings = settingsByCompany[String(row.company_id)] || {
        timeZone: DEFAULT_TIME_ZONE,
        autoClockOutTime: DEFAULT_AUTO_CLOCK_OUT_TIME,
      };
      const hourlyRate = await getEffectiveHourlyRateForRow(supabase, row, settings);
      const { data: updatedRows, error: updateError } = await updateTimesheetAutoClockOut(supabase, row, hourlyRate, settings);
      if (updateError) {
        console.warn("[AUTO_CLOCK_OUT] timesheet update failed", row.id, updateError);
        errors.push({ id: row.id, error: updateError.message || String(updateError) });
        continue;
      }
      const updated = updatedRows?.[0];
      if (!updated) continue;
      updatedIds.push(updated.id);
      const recipients = await getNotificationRecipients(supabase, updated.company_id, updated.user_id, memberCache);
      const ids = await insertAutoClockOutNotifications(supabase, updated, recipients, settings.timeZone);
      notificationIds.push(...ids);
      console.log("[AUTO_CLOCK_OUT] timed out", updated.id, "notifications", ids.length);
    } catch (error) {
      console.warn("[AUTO_CLOCK_OUT] row exception", row?.id, error);
      errors.push({ id: row?.id, error: error?.message || String(error) });
    }
  }

  const pushResult = await sendPushForNotifications(req, notificationIds);
  let dailyReport;
  try {
    dailyReport = await runDailySupervisorReportCron(req);
  } catch (error) {
    dailyReport = {
      status: 500,
      body: {
        ok: false,
        error: error?.message || "Daily report scheduler failed",
      },
    };
  }
  res.status(200).json({
    ok: true,
    scanned: candidateRows.length,
    due: rows.length,
    updated: updatedIds.length,
    updated_ids: updatedIds,
    notification_ids: notificationIds,
    push: pushResult,
    daily_report: dailyReport.body,
    errors,
  });
}
