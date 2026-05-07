import { createClient } from "@supabase/supabase-js";

const AUTO_CLOCK_OUT_HOURS = 24;
const AUTO_CLOCK_OUT_MS = AUTO_CLOCK_OUT_HOURS * 60 * 60 * 1000;
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

function isMissingOptionalAccuracyColumnError(error) {
  const m = String(error?.message || "").toLowerCase();
  return (
    m.includes("column") &&
    (m.includes("accuracy") || m.includes("clock_in_accuracy") || m.includes("clock_out_accuracy"))
  );
}

function hourlyRateFromValue(value) {
  if (value == null || value === "") return 0;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function computeLabourCost(clockInIso, clockOutIso, hourlyRate) {
  const t0 = new Date(clockInIso).getTime();
  const t1 = new Date(clockOutIso).getTime();
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return 0;
  return ((t1 - t0) / 3600000) * (Number(hourlyRate) || 0);
}

function autoClockOutIso(clockInIso) {
  const t0 = new Date(clockInIso).getTime();
  if (!Number.isFinite(t0)) return null;
  return new Date(t0 + AUTO_CLOCK_OUT_MS).toISOString();
}

function formatDateTime(iso, timeZone) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "America/Toronto",
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
    `${subject} was automatically clocked out after 24 hours${place ? ` at ${place}` : ""}.`,
    clockInText ? `Clock in: ${clockInText}` : "",
    clockOutText ? `Auto timed out: ${clockOutText}` : "",
  ].filter(Boolean).join("\n");
}

async function getHourlyRateForRow(supabase, row) {
  const rowRate = hourlyRateFromValue(row?.hourly_rate);
  if (rowRate > 0 || !row?.user_id) return rowRate;
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

async function updateTimesheetAutoClockOut(supabase, row, hourlyRate) {
  const clockOutIso = autoClockOutIso(row.clock_in);
  if (!clockOutIso) {
    return { data: [], error: new Error("Invalid clock_in") };
  }
  const labourCost = computeLabourCost(row.clock_in, clockOutIso, hourlyRate);
  let payload = {
    clock_out: clockOutIso,
    status: AUTO_TIMED_OUT_STATUS,
    labour_cost: labourCost,
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
    ("clock_out_accuracy" in payload || "clock_out_latitude" in payload || "clock_out_longitude" in payload)
  ) {
    const { clock_out_accuracy, clock_out_latitude, clock_out_longitude, ...rest } = payload;
    ({ data, error } = await supabase
      .from("timesheets")
      .update(rest)
      .eq("id", row.id)
      .is("clock_out", null)
      .select("*"));
  }

  return { data: data || [], error };
}

async function getCompanyTimeZones(supabase, companyIds) {
  const ids = [...new Set((companyIds || []).filter(Boolean).map(String))];
  if (!ids.length) return {};
  const { data, error } = await supabase.from("companies").select("id, time_zone").in("id", ids);
  if (error) {
    console.warn("[AUTO_CLOCK_OUT] company time zone fetch failed", error);
    return {};
  }
  const map = {};
  for (const row of data || []) {
    map[String(row.id)] = row.time_zone || "America/Toronto";
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
    const retryRows = rows.map(({ is_read, ...rest }) => rest);
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

  const cutoffIso = new Date(Date.now() - AUTO_CLOCK_OUT_MS).toISOString();
  const { data: dueRows, error: dueError } = await supabase
    .from("timesheets")
    .select("*")
    .is("clock_out", null)
    .lte("clock_in", cutoffIso)
    .order("clock_in", { ascending: true })
    .limit(100);

  if (dueError) {
    res.status(500).json({ error: dueError.message });
    return;
  }

  const rows = dueRows || [];
  const timeZones = await getCompanyTimeZones(supabase, rows.map((row) => row.company_id));
  const memberCache = new Map();
  const updatedIds = [];
  const notificationIds = [];
  const errors = [];

  for (const row of rows) {
    try {
      const hourlyRate = await getHourlyRateForRow(supabase, row);
      const { data: updatedRows, error: updateError } = await updateTimesheetAutoClockOut(supabase, row, hourlyRate);
      if (updateError) {
        console.warn("[AUTO_CLOCK_OUT] timesheet update failed", row.id, updateError);
        errors.push({ id: row.id, error: updateError.message || String(updateError) });
        continue;
      }
      const updated = updatedRows?.[0];
      if (!updated) continue;
      updatedIds.push(updated.id);
      const recipients = await getNotificationRecipients(supabase, updated.company_id, updated.user_id, memberCache);
      const companyTz = timeZones[String(updated.company_id)] || "America/Toronto";
      const ids = await insertAutoClockOutNotifications(supabase, updated, recipients, companyTz);
      notificationIds.push(...ids);
      console.log("[AUTO_CLOCK_OUT] timed out", updated.id, "notifications", ids.length);
    } catch (error) {
      console.warn("[AUTO_CLOCK_OUT] row exception", row?.id, error);
      errors.push({ id: row?.id, error: error?.message || String(error) });
    }
  }

  const pushResult = await sendPushForNotifications(req, notificationIds);
  res.status(200).json({
    ok: true,
    scanned: rows.length,
    updated: updatedIds.length,
    updated_ids: updatedIds,
    notification_ids: notificationIds,
    push: pushResult,
    errors,
  });
}
