export const DEFAULT_TIME_ZONE = process.env.DEFAULT_COMPANY_TIMEZONE || "America/Toronto";

export function cleanText(value) {
  return String(value ?? "").trim();
}

export function cleanRole(value) {
  const role = cleanText(value).toLowerCase();
  if (role === "owner" || role === "admin") return "owner";
  if (role === "supervisor") return "supervisor";
  return "employee";
}

export function dedupeTimesheetRowsById(rows = []) {
  const byId = new Map();
  const passthrough = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = cleanText(row?.id);
    if (!id) {
      passthrough.push(row);
      continue;
    }
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, row);
      continue;
    }
    const existingTime = new Date(existing.updated_at || existing.clock_out || existing.clock_in || 0).getTime();
    const nextTime = new Date(row.updated_at || row.clock_out || row.clock_in || 0).getTime();
    if (Number.isFinite(nextTime) && (!Number.isFinite(existingTime) || nextTime >= existingTime)) {
      byId.set(id, row);
    }
  }
  return [...byId.values(), ...passthrough];
}

export function isAdminRole(role) {
  return ["owner", "supervisor"].includes(cleanRole(role));
}

export function isMissingDailyReportLogsTable(error) {
  const message = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return code === "42p01" || (message.includes("daily_report_logs") && message.includes("does not exist"));
}

export function datePartsInTimeZone(dateOrIso, timeZone = DEFAULT_TIME_ZONE) {
  const date = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
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
    return {
      year: Number(out.year),
      month: Number(out.month),
      day: Number(out.day),
      hour: Number(out.hour || 0) % 24,
      minute: Number(out.minute || 0),
      second: Number(out.second || 0),
    };
  } catch {
    return null;
  }
}

export function calendarDateKeyInTimeZone(dateOrIso, timeZone = DEFAULT_TIME_ZONE) {
  const parts = datePartsInTimeZone(dateOrIso, timeZone);
  if (!parts) return "";
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function wallDateTimeToUtcIso(dateKey, timeText = "00:00:00", timeZone = DEFAULT_TIME_ZONE) {
  const [year, month, day] = cleanText(dateKey).split("-").map(Number);
  const [hour = 0, minute = 0, second = 0] = cleanText(timeText).split(":").map(Number);
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

export function formatReportDate(dateKey, timeZone = DEFAULT_TIME_ZONE) {
  const iso = wallDateTimeToUtcIso(dateKey, "12:00:00", timeZone);
  const date = iso ? new Date(iso) : new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return cleanText(dateKey);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatGeneratedAt(dateOrIso = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const date = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatMoney(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(number) ? number : 0);
}

export function formatHoursMinutes(minutes) {
  const m = Math.max(0, Math.round(Number(minutes || 0)));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h <= 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

export function formatHoursDecimal(minutes) {
  const number = Number(minutes || 0) / 60;
  return `${(Number.isFinite(number) ? number : 0).toFixed(2)}h`;
}

function workedMinutes(row, now = new Date()) {
  const start = new Date(row?.clock_in).getTime();
  const end = row?.clock_out ? new Date(row.clock_out).getTime() : now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  let total = Math.max(0, Math.round((end - start) / 60000));
  const breakStart = new Date(row?.break_start_at || row?.break_start || "").getTime();
  const breakEnd = new Date(row?.break_end_at || row?.break_end || "").getTime();
  if (Number.isFinite(breakStart) && Number.isFinite(breakEnd) && breakEnd > breakStart) {
    const clippedStart = Math.max(start, breakStart);
    const clippedEnd = Math.min(end, breakEnd);
    if (clippedEnd > clippedStart) total -= Math.round((clippedEnd - clippedStart) / 60000);
  } else {
    total -= Math.max(0, Number(row?.break_minutes || 0));
  }
  return Math.max(0, total);
}

function labourCost(row, minutes) {
  const stored = Number(row?.labour_cost);
  if (row?.clock_out && Number.isFinite(stored) && stored >= 0) return stored;
  const rate = Number(row?.hourly_rate);
  return Number.isFinite(rate) && rate > 0 ? (Number(minutes || 0) / 60) * rate : 0;
}

function addGroup(map, key, label, minutes, cost, count = 1) {
  const safeKey = key || "unassigned";
  if (!map.has(safeKey)) map.set(safeKey, { key: safeKey, label: label || "Unassigned", minutes: 0, cost: 0, count: 0 });
  const row = map.get(safeKey);
  row.minutes += Number(minutes || 0);
  row.cost += Number(cost || 0);
  row.count += Number(count || 0);
}

function htmlEscape(value) {
  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function safeQuery(label, fn, fallback) {
  try {
    const { data, error } = await fn();
    if (error) {
      console.warn(`[DAILY_REPORT] ${label} query failed`, error.message || error);
      return fallback;
    }
    return data || fallback;
  } catch (err) {
    console.warn(`[DAILY_REPORT] ${label} query exception`, err?.message || err);
    return fallback;
  }
}

export async function assertCompanyAdmin(supabase, { companyId, userId }) {
  const { data, error } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data || !isAdminRole(data.role)) {
    const err = new Error("Manager/Admin access required");
    err.statusCode = 403;
    throw err;
  }
  return data;
}

export async function buildDailyReport(supabase, { companyId, reportDate, origin = "https://project-rui1d.vercel.app", now = new Date() }) {
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, time_zone")
    .eq("id", companyId)
    .maybeSingle();
  if (companyError || !company?.id) {
    const err = new Error("Company not found");
    err.statusCode = 404;
    throw err;
  }

  const timeZone = company.time_zone || DEFAULT_TIME_ZONE;
  const safeReportDate = /^\d{4}-\d{2}-\d{2}$/.test(cleanText(reportDate))
    ? cleanText(reportDate)
    : calendarDateKeyInTimeZone(now, timeZone);
  const startIso = wallDateTimeToUtcIso(safeReportDate, "00:00:00", timeZone);
  const endIso = wallDateTimeToUtcIso(safeReportDate, "23:59:59", timeZone);
  if (!startIso || !endIso) {
    const err = new Error("Invalid report date");
    err.statusCode = 400;
    throw err;
  }

  const members = await safeQuery(
    "members",
    () => supabase.from("company_members").select("user_id, role").eq("company_id", companyId),
    []
  );
  const memberIds = [...new Set((members || []).map((row) => row.user_id).filter(Boolean))];
  const profiles = memberIds.length
    ? await safeQuery(
        "profiles",
        () => supabase.from("profiles").select("id, full_name, email, employment_status").in("id", memberIds),
        []
      )
    : [];
  const profileById = new Map((profiles || []).map((row) => [String(row.id), row]));
  const activeEmployees = memberIds
    .map((userId) => {
      const profile = profileById.get(String(userId)) || {};
      const status = cleanText(profile.employment_status).toLowerCase();
      return {
        userId,
        name: cleanText(profile.full_name) || cleanText(profile.email) || "Employee",
        role: cleanRole((members || []).find((row) => String(row.user_id) === String(userId))?.role),
        active: status !== "archived",
      };
    })
    .filter((row) => row.active);

  const timesheets = await safeQuery(
    "timesheets",
    () =>
      supabase
        .from("timesheets")
        .select("id, company_id, user_id, employee_name, employee_email, project_name, cost_centre, clock_in, clock_out, hourly_rate, labour_cost, status, updated_at, break_start_at, break_end_at, break_minutes")
        .eq("company_id", companyId)
        .gte("clock_in", startIso)
        .lte("clock_in", endIso)
        .order("clock_in", { ascending: true }),
    []
  );
  const rows = dedupeTimesheetRowsById(timesheets || []).filter((row) => calendarDateKeyInTimeZone(row.clock_in, timeZone) === safeReportDate);
  const completedRows = rows.filter((row) => row.clock_out);
  const activeRows = rows.filter((row) => !row.clock_out);
  const workedEmployeeIds = new Set(rows.map((row) => cleanText(row.user_id || row.employee_email || row.employee_name)).filter(Boolean));
  const completedEmployeeIds = new Set(completedRows.map((row) => cleanText(row.user_id || row.employee_email || row.employee_name)).filter(Boolean));
  const projectMap = new Map();
  const employeeMap = new Map();
  const taskMap = new Map();
  let completedMinutes = 0;
  let liveMinutes = 0;
  let labour = 0;

  for (const row of rows) {
    const minutes = workedMinutes(row, now);
    const completed = Boolean(row.clock_out);
    const cost = labourCost(row, completed ? minutes : 0);
    if (completed) {
      completedMinutes += minutes;
      labour += cost;
    } else {
      liveMinutes += minutes;
    }
    const employee =
      cleanText(row.employee_name) ||
      cleanText(profileById.get(String(row.user_id))?.full_name) ||
      cleanText(row.employee_email) ||
      "Employee";
    const project = cleanText(row.project_name) || "Unassigned";
    const task = cleanText(row.cost_centre) || "No task";
    addGroup(projectMap, `${project} / ${task}`, `${project} / ${task}`, completed ? minutes : 0, cost);
    addGroup(employeeMap, cleanText(row.user_id || employee), employee, completed ? minutes : 0, cost);
    addGroup(taskMap, task, task, completed ? minutes : 0, cost);
  }

  const mediaRows = await safeQuery(
    "project_media",
    () =>
      supabase
        .from("project_media")
        .select("id, media_type, documentation_type, amount, receipt_total, captured_at, uploaded_at, project_name, cost_centre")
        .eq("company_id", companyId)
        .gte("captured_at", startIso)
        .lte("captured_at", endIso)
        .order("captured_at", { ascending: true }),
    []
  );
  const mediaToday = (mediaRows || []).filter((row) => {
    const key = calendarDateKeyInTimeZone(row.captured_at || row.uploaded_at, timeZone);
    return key === safeReportDate;
  });
  let receiptCount = 0;
  let receiptTotal = 0;
  let photoCount = 0;
  let videoCount = 0;
  for (const row of mediaToday) {
    const mediaType = cleanText(row.media_type).toLowerCase();
    const docType = cleanText(row.documentation_type).toLowerCase();
    if (mediaType === "receipt" || docType === "receipt") {
      receiptCount += 1;
      const amount = Number(row.receipt_total ?? row.amount ?? 0);
      if (Number.isFinite(amount)) receiptTotal += amount;
    } else if (mediaType === "video") {
      videoCount += 1;
    } else {
      photoCount += 1;
    }
  }

  const scheduledTasks = await safeQuery(
    "scheduled_tasks",
    () =>
      supabase
        .from("scheduled_tasks")
        .select("id, start_time")
        .eq("company_id", companyId)
        .gte("start_time", startIso)
        .lte("start_time", endIso),
    []
  );
  const scheduleTaskIds = [...new Set((scheduledTasks || []).map((row) => row.id).filter(Boolean))];
  const assignees = scheduleTaskIds.length
    ? await safeQuery(
        "scheduled_task_assignees",
        () => supabase.from("scheduled_task_assignees").select("response_status").in("scheduled_task_id", scheduleTaskIds),
        []
      )
    : [];
  const schedule = {
    assigned: assignees.length,
    accepted: assignees.filter((row) => cleanText(row.response_status).toLowerCase() === "accepted").length,
    declined: assignees.filter((row) => cleanText(row.response_status).toLowerCase() === "declined").length,
    pending: assignees.filter((row) => !["accepted", "declined"].includes(cleanText(row.response_status).toLowerCase())).length,
  };

  const sortGroups = (map) =>
    [...map.values()].sort((a, b) => Number(b.minutes || 0) - Number(a.minutes || 0) || String(a.label).localeCompare(String(b.label)));

  return {
    companyId,
    companyName: cleanText(company.name) || "OPERA.AI",
    timeZone,
    reportDate: safeReportDate,
    reportDateLabel: formatReportDate(safeReportDate, timeZone),
    generatedAt: new Date(now).toISOString(),
    generatedAtLabel: formatGeneratedAt(now, timeZone),
    appTimesheetsUrl: `${String(origin || "").replace(/\/$/, "")}/?tab=timesheets`,
    activeEmployeesCount: activeEmployees.length,
    activeEmployees: activeEmployees.map((row) => row.name).slice(0, 20),
    employeesWorked: workedEmployeeIds.size,
    completedEmployees: completedEmployeeIds.size,
    entries: rows.length,
    completedEntries: completedRows.length,
    activeEntries: activeRows.length,
    completedMinutes,
    liveMinutes,
    labour,
    missingClockOut: activeRows.length,
    projects: sortGroups(projectMap),
    employees: sortGroups(employeeMap),
    tasks: sortGroups(taskMap),
    receipts: {
      count: receiptCount,
      total: receiptTotal,
    },
    media: {
      photos: photoCount,
      videos: videoCount,
    },
    schedule,
  };
}

export function formatDailyReportWhatsAppText(report) {
  const lines = [
    `Daily Timesheet Report - ${report.companyName}`,
    `Date: ${report.reportDateLabel}`,
    "",
    `Employees worked: ${report.employeesWorked}`,
    `Entries: ${report.entries}`,
    `Completed hours: ${formatHoursDecimal(report.completedMinutes)}`,
    `Live active hours: ${formatHoursDecimal(report.liveMinutes)}`,
    `Labour cost: ${formatMoney(report.labour)}`,
    "",
    "Issues:",
    report.missingClockOut > 0 ? `- ${report.missingClockOut} missing clock-out` : "- None",
    "",
    "Top projects:",
  ];
  const projects = (report.projects || []).slice(0, 5);
  if (!projects.length) lines.push("- No completed project labour");
  else projects.forEach((row) => lines.push(`- ${row.label}: ${formatHoursDecimal(row.minutes)} - ${formatMoney(row.cost)}`));
  lines.push("", "Open app:", report.appTimesheetsUrl);
  return lines.join("\n");
}

export function formatDailyReportEmailText(report) {
  const lines = [
    `OPERA.AI Daily Field Report - ${report.companyName} - ${report.reportDateLabel}`,
    `Generated: ${report.generatedAtLabel}`,
    "",
    "Summary",
    `- Active employees: ${report.activeEmployeesCount}`,
    `- Employees worked: ${report.employeesWorked}`,
    `- Entries: ${report.entries}`,
    `- Completed hours: ${formatHoursMinutes(report.completedMinutes)}`,
    `- Live active hours: ${formatHoursMinutes(report.liveMinutes)}`,
    `- Labour cost: ${formatMoney(report.labour)}`,
    `- Missing clock-outs: ${report.missingClockOut}`,
    "",
    "Projects / tasks",
  ];
  const projects = (report.projects || []).slice(0, 8);
  if (!projects.length) lines.push("- No completed project labour.");
  else projects.forEach((row) => lines.push(`- ${row.label}: ${formatHoursMinutes(row.minutes)} / ${formatMoney(row.cost)} / ${row.count} entries`));
  lines.push(
    "",
    "Receipts and media",
    `- Receipts uploaded: ${report.receipts.count}`,
    `- Receipt total: ${formatMoney(report.receipts.total)}`,
    `- Photos uploaded: ${report.media.photos}`,
    `- Videos uploaded: ${report.media.videos}`,
    "",
    "Schedule responses",
    `- Assigned: ${report.schedule.assigned}`,
    `- Accepted: ${report.schedule.accepted}`,
    `- Declined: ${report.schedule.declined}`,
    `- Pending: ${report.schedule.pending}`,
    "",
    `Open Timesheets: ${report.appTimesheetsUrl}`
  );
  return lines.join("\n");
}

export function formatDailyReportEmailHtml(report) {
  const metric = (label, value) => `
    <td style="padding:12px;border:1px solid #E2E8F0;border-radius:14px;background:#F8FAFC;">
      <div style="font-size:12px;color:#64748B;font-weight:700;">${htmlEscape(label)}</div>
      <div style="margin-top:4px;font-size:22px;color:#061426;font-weight:800;">${htmlEscape(value)}</div>
    </td>`;
  const rowHtml = (row) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #E2E8F0;">${htmlEscape(row.label)}</td>
      <td style="padding:10px;border-bottom:1px solid #E2E8F0;text-align:right;">${htmlEscape(formatHoursMinutes(row.minutes))}</td>
      <td style="padding:10px;border-bottom:1px solid #E2E8F0;text-align:right;">${htmlEscape(formatMoney(row.cost))}</td>
    </tr>`;
  const projectRows = (report.projects || []).slice(0, 8).map(rowHtml).join("") || `
    <tr><td colspan="3" style="padding:12px;color:#64748B;">No completed project labour.</td></tr>`;
  return `<!doctype html>
  <html>
    <body style="margin:0;background:#F4F7FB;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#061426;">
      <div style="max-width:680px;margin:0 auto;padding:24px;">
        <div style="background:#061426;color:#FFFFFF;border-radius:22px;padding:22px;">
          <div style="font-size:13px;color:#C9A227;font-weight:800;text-transform:uppercase;letter-spacing:.08em;">OPERA.AI</div>
          <h1 style="margin:8px 0 0;font-size:28px;line-height:1.1;">Daily Field Report</h1>
          <p style="margin:8px 0 0;color:#E2E8F0;">${htmlEscape(report.companyName)} - ${htmlEscape(report.reportDateLabel)}</p>
        </div>
        <div style="margin-top:16px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:22px;padding:18px;box-shadow:0 10px 26px rgba(6,20,38,.07);">
          <p style="margin:0 0 14px;color:#64748B;font-weight:700;">Generated ${htmlEscape(report.generatedAtLabel)}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-spacing:8px;">
            <tr>${metric("Employees worked", String(report.employeesWorked))}${metric("Entries", String(report.entries))}</tr>
            <tr>${metric("Completed hours", formatHoursMinutes(report.completedMinutes))}${metric("Labour cost", formatMoney(report.labour))}</tr>
            <tr>${metric("Live active hours", formatHoursMinutes(report.liveMinutes))}${metric("Missing clock-outs", String(report.missingClockOut))}</tr>
          </table>
          <h2 style="margin:18px 0 8px;font-size:18px;">Projects / tasks</h2>
          <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;">
            <thead>
              <tr>
                <th align="left" style="padding:10px;border-bottom:2px solid #E2E8F0;color:#64748B;">Project / task</th>
                <th align="right" style="padding:10px;border-bottom:2px solid #E2E8F0;color:#64748B;">Hours</th>
                <th align="right" style="padding:10px;border-bottom:2px solid #E2E8F0;color:#64748B;">Cost</th>
              </tr>
            </thead>
            <tbody>${projectRows}</tbody>
          </table>
          <h2 style="margin:18px 0 8px;font-size:18px;">Receipts, media, and schedule</h2>
          <p style="margin:0;color:#475569;line-height:1.6;">
            Receipts: <strong>${report.receipts.count}</strong> (${htmlEscape(formatMoney(report.receipts.total))})<br/>
            Photos: <strong>${report.media.photos}</strong> &nbsp; Videos: <strong>${report.media.videos}</strong><br/>
            Schedule responses: ${report.schedule.accepted} accepted, ${report.schedule.declined} declined, ${report.schedule.pending} pending
          </p>
          <p style="margin:20px 0 0;">
            <a href="${htmlEscape(report.appTimesheetsUrl)}" style="display:inline-block;background:#061426;color:#FFFFFF;text-decoration:none;border-radius:14px;padding:12px 18px;font-weight:800;">Open Timesheets</a>
          </p>
        </div>
      </div>
    </body>
  </html>`;
}

export async function reserveDailyReportSend(supabase, { companyId, reportDate, channel, recipient }) {
  const row = {
    company_id: companyId,
    report_date: reportDate,
    channel,
    recipient,
    status: "sending",
  };
  const { data, error } = await supabase.from("daily_report_logs").insert(row).select("id").single();
  if (error) {
    if (isMissingDailyReportLogsTable(error)) return { ok: false, missingTable: true, error };
    const code = String(error?.code || "").toLowerCase();
    if (code === "23505" || String(error?.message || "").toLowerCase().includes("duplicate")) {
      const { data: existing, error: lookupError } = await supabase
        .from("daily_report_logs")
        .select("id, status")
        .eq("company_id", companyId)
        .eq("report_date", reportDate)
        .eq("channel", channel)
        .eq("recipient", recipient)
        .maybeSingle();
      if (lookupError && !isMissingDailyReportLogsTable(lookupError)) return { ok: false, error: lookupError };
      if (existing?.id && existing.status === "failed") {
        const { data: retryRow, error: retryError } = await supabase
          .from("daily_report_logs")
          .update({
            status: "sending",
            sent_at: null,
            error: null,
            provider_message_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .eq("status", "failed")
          .select("id")
          .maybeSingle();
        if (retryError) return { ok: false, error: retryError };
        if (retryRow?.id) return { ok: true, id: retryRow.id, retry: true };
      }
      return { ok: false, duplicate: true, error };
    }
    return { ok: false, error };
  }
  return { ok: true, id: data?.id || null };
}

export async function finishDailyReportSend(supabase, { logId, status, providerMessageId = null, error = null }) {
  if (!logId) return { ok: false };
  const patch = {
    status,
    sent_at: new Date().toISOString(),
    error: error ? cleanText(error).slice(0, 1000) : null,
  };
  if (providerMessageId) patch.provider_message_id = String(providerMessageId).slice(0, 255);
  const { error: updateError } = await supabase.from("daily_report_logs").update(patch).eq("id", logId);
  if (updateError && !isMissingDailyReportLogsTable(updateError)) {
    console.warn("[DAILY_REPORT] log update failed", updateError.message || updateError);
  }
  return { ok: !updateError };
}
