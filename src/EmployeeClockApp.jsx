import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

const Card = ({ children, className }) => (
  <div className={`bg-white rounded-3xl ${className || ""}`}>{children}</div>
);

const CardContent = ({ children, className }) => (
  <div className={className}>{children}</div>
);

const Button = ({ children, className, ...props }) => (
  <button className={`bg-black text-white ${className || ""}`} {...props}>
    {children}
  </button>
);

const employees = [
  { id: 1, name: "Sam", role: "Admin", hourlyRate: 65 },
  { id: 2, name: "Anmol", role: "Admin", hourlyRate: 40 },
  { id: 3, name: "Worker 1", role: "Drywall", hourlyRate: 35 },
  { id: 4, name: "Worker 2", role: "Helper", hourlyRate: 25 },
];

const adminProjects = [
  {
    id: "basement-renovation",
    name: "Basement Renovation",
    costCenters: ["Framing", "Electrical Rough-In", "Drywall", "Mudding", "Painting", "Cleanup"],
  },
  {
    id: "bathroom-renovation",
    name: "Bathroom Renovation",
    costCenters: ["Demolition", "Plumbing", "Waterproofing", "Tile", "Vanity Install", "Final Fixtures"],
  },
  {
    id: "kitchen-renovation",
    name: "Kitchen Renovation",
    costCenters: ["Demolition", "Electrical", "Cabinets", "Countertop", "Backsplash", "Finishing"],
  },
];

const sampleRecords = [
  {
    id: 101,
    employeeId: 3,
    employee: "Worker 1",
    hourlyRate: 35,
    date: new Date().toISOString(),
    clockIn: "2026-04-25T08:05:00-04:00",
    breakStart: "2026-04-25T12:01:00-04:00",
    breakEnd: "2026-04-25T12:31:00-04:00",
    clockOut: "2026-04-25T16:42:00-04:00",
    project: "Basement Renovation",
    costCenter: "Drywall",
    status: "Submitted",
  },
];

function safeRead(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

const DEFAULT_COMPANY_TIME_ZONE = "America/Toronto";

const normalizeStatus = (status) => String(status || "").trim().toLowerCase();

const normalizeMemberRole = (role) => String(role || "").trim().toLowerCase();

/** Single canonical role from company_members / local state. Unknown → employee (safe). admin → owner. */
function normalizeCompanyMemberRole(role) {
  const r = normalizeMemberRole(role);
  if (r === "owner" || r === "admin") return "owner";
  if (r === "supervisor") return "supervisor";
  return "employee";
}

/** profiles.employment_status → "active" | "archived" */
function normalizeEmploymentStatus(raw) {
  const s = raw != null ? String(raw).trim().toLowerCase() : "active";
  return s === "archived" ? "archived" : "active";
}

const TEAM_ADD_INITIAL_DRAFT = {
  fullName: "",
  email: "",
  password: "",
  role: "employee",
  hourlyRate: "",
  payRateEffectiveDate: "",
  joiningDate: "",
};

function looksLikeEmail(value) {
  const s = String(value || "").trim();
  if (!s.includes("@")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+/.test(s);
}

/** True if value looks like a UUID, raw hex id, or shortened user-id label (not a human display name). */
function looksLikeUuidOrIdLike(value) {
  const s = String(value || "").trim();
  if (!s) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
  if (/^[0-9a-f]{32}$/i.test(s)) return true;
  if (/^[0-9a-f]{6}…[0-9a-f]{4}$/i.test(s)) return true;
  return false;
}

function pickGoodFreeformEmployeeName(record) {
  for (const raw of [record.employee, record.employeeName]) {
    const s = String(raw || "").trim();
    if (!s) continue;
    if (looksLikeEmail(s)) continue;
    if (looksLikeUuidOrIdLike(s)) continue;
    return s;
  }
  return "";
}

function shortUserLabel(userId) {
  if (userId == null || userId === "") return "—";
  const s = String(userId);
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function resolveTimesheetEmployeeTitle(record, { profileFullName, authUser, teamProfileFullNameByUserId = {} }) {
  const uid = record.userId || record.employeeId;
  const good = pickGoodFreeformEmployeeName(record);
  if (good) return good;

  const fromRecordProfile = (record.profileDisplayName || "").trim();
  if (fromRecordProfile) return fromRecordProfile;

  const fromTeam = teamProfileFullNameByUserId[uid];
  if (fromTeam && String(fromTeam).trim()) return String(fromTeam).trim();

  if (authUser?.id != null && String(uid) === String(authUser.id)) {
    const pf = (profileFullName || "").trim();
    if (pf && !looksLikeEmail(pf) && !looksLikeUuidOrIdLike(pf)) return pf;
  }

  const mail =
    (record.employeeEmail || "").trim() ||
    (record.profileEmailForRow || "").trim();
  if (mail) return mail;

  return shortUserLabel(uid) || "Employee";
}

function resolveTimesheetEmployeeSecondary(record, title) {
  const mail =
    (record.employeeEmail || "").trim() ||
    (record.profileEmailForRow || "").trim();
  if (!mail || !looksLikeEmail(mail)) return null;
  if (mail === title) return null;
  return mail;
}

/** Parse Supabase/Postgres timestamps into a correct instant for Intl formatting. */
function parseStoredInstant(value) {
  if (value == null || value === "") return new Date(NaN);
  if (value instanceof Date) return value;
  const s = String(value).trim();
  if (!s) return new Date(NaN);
  if (/[zZ]$/.test(s)) return new Date(s);
  if (/[+-]\d{2}:\d{2}$/.test(s) || /[+-]\d{4}$/.test(s) || /[+-]\d{2}$/.test(s)) return new Date(s);
  const isoLike = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s);
  if (isoLike) {
    const normalized = s.replace(" ", "T");
    if (/[zZ]$/.test(normalized) || /[+-]\d{2}:\d{2}$/.test(normalized) || /[+-]\d{4}$/.test(normalized)) {
      return new Date(normalized);
    }
    return new Date(`${normalized}Z`);
  }
  return new Date(s);
}

function calendarDateKeyInTimeZone(dateOrString, timeZone) {
  const tz = timeZone || DEFAULT_COMPANY_TIME_ZONE;
  const d = dateOrString instanceof Date ? dateOrString : parseStoredInstant(dateOrString);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Wall clock in `timeZone` as YYYY-MM-DD and HH:mm (24h) for edit inputs. */
function wallClockPartsInTimeZone(instant, timeZone) {
  const tz = timeZone || DEFAULT_COMPANY_TIME_ZONE;
  const d = instant instanceof Date ? instant : parseStoredInstant(instant);
  if (Number.isNaN(d.getTime())) return { dateStr: "", timeStr: "" };
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(d).filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
  );
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    timeStr: `${parts.hour}:${parts.minute}`,
  };
}

/** Wall date YYYY-MM-DD + time HH:mm in `timeZone` → UTC ISO string. */
function wallDateTimeToUtcIso(dateStr, timeStr, timeZone) {
  const tz = timeZone || DEFAULT_COMPANY_TIME_ZONE;
  if (!dateStr || !timeStr) return null;
  const timeNorm = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  const [H, Mi, SeRaw] = timeNorm.split(":").map((v) => Number(v));
  const Se = Number.isNaN(SeRaw) ? 0 : SeRaw;
  const [y, mo, d] = dateStr.split("-").map((v) => Number(v));
  if (!y || !mo || !d || Number.isNaN(H) || Number.isNaN(Mi)) return null;

  let t = Date.UTC(y, mo - 1, d, H, Mi, Se, 0);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  for (let i = 0; i < 48; i += 1) {
    const parts = Object.fromEntries(
      fmt.formatToParts(new Date(t)).filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
    );
    const gotY = Number(parts.year);
    const gotM = Number(parts.month);
    const gotD = Number(parts.day);
    const gotH = Number(parts.hour);
    const gotMin = Number(parts.minute);
    const gotSec = Number(parts.second || 0);
    if (gotY === y && gotM === mo && gotD === d && gotH === H && gotMin === Mi && gotSec === Se) {
      return new Date(t).toISOString();
    }
    const want = Date.UTC(y, mo - 1, d, H, Mi, Se, 0);
    const cur = Date.UTC(gotY, gotM - 1, gotD, gotH, gotMin, gotSec, 0);
    t += want - cur;
  }
  return new Date(t).toISOString();
}

function wallWeekdayLongInTimeZone(dateKey, timeZone) {
  const tz = timeZone || DEFAULT_COMPANY_TIME_ZONE;
  const iso = wallDateTimeToUtcIso(dateKey, "12:00:00", tz);
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(new Date(iso));
}

function addWallDaysInTimeZone(dateKey, deltaDays, timeZone) {
  const tz = timeZone || DEFAULT_COMPANY_TIME_ZONE;
  const iso = wallDateTimeToUtcIso(dateKey, "12:00:00", tz);
  if (!iso) return "";
  const t = new Date(iso).getTime() + Number(deltaDays) * 86400000;
  return calendarDateKeyInTimeZone(new Date(t), tz);
}

function mondayStartOfWallWeekContaining(todayKey, timeZone) {
  let key = todayKey;
  for (let i = 0; i < 8; i++) {
    if (wallWeekdayLongInTimeZone(key, timeZone) === "Monday") return key;
    const prev = addWallDaysInTimeZone(key, -1, timeZone);
    if (!prev || prev === key) return todayKey;
    key = prev;
  }
  return todayKey;
}

function lastWallDayOfMonthInTimeZone(year, month1to12, timeZone) {
  const tz = timeZone || DEFAULT_COMPANY_TIME_ZONE;
  let key = `${year}-${String(month1to12).padStart(2, "0")}-28`;
  for (;;) {
    const next = addWallDaysInTimeZone(key, 1, tz);
    if (!next) return key;
    const [ny, nm] = next.split("-").map(Number);
    if (ny !== year || nm !== month1to12) return key;
    key = next;
  }
}

/** Reports quick ranges: wall dates in `timeZone` (Monday–Sunday week). */
function computeReportsQuickRange(preset, now, timeZone) {
  const tz = timeZone || DEFAULT_COMPANY_TIME_ZONE;
  const todayKey = calendarDateKeyInTimeZone(now, tz);
  if (!todayKey) return { from: "", to: "" };
  const [yStr, mStr] = todayKey.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return { from: "", to: "" };
  if (preset === "weekly") {
    const mon = mondayStartOfWallWeekContaining(todayKey, tz);
    const sun = addWallDaysInTimeZone(mon, 6, tz);
    return { from: mon, to: sun || mon };
  }
  if (preset === "monthly") {
    const fromKey = `${y}-${String(m).padStart(2, "0")}-01`;
    const toKey = lastWallDayOfMonthInTimeZone(y, m, tz);
    return { from: fromKey, to: toKey };
  }
  if (preset === "yearly") {
    const fromKey = `${y}-01-01`;
    const toKey = lastWallDayOfMonthInTimeZone(y, 12, tz);
    return { from: fromKey, to: toKey };
  }
  if (preset === "last_year") {
    const ly = y - 1;
    const fromKey = `${ly}-01-01`;
    const toKey = lastWallDayOfMonthInTimeZone(ly, 12, tz);
    return { from: fromKey, to: toKey };
  }
  return { from: "", to: "" };
}

function reportsCostCentreKeyFromRow(row) {
  return String(row?.costCenter ?? "").trim() || "—";
}

function isTimesheetLiveOpenRow(record, visibleCurrentShift, now, companyTimeZone) {
  if (!visibleCurrentShift) return false;
  const liveRowId = visibleCurrentShift.supabaseTimesheetId;
  const recordRowId = record.supabaseTimesheetId ?? record.id;
  const matchesLiveShift =
    liveRowId != null && recordRowId != null && String(liveRowId) === String(recordRowId);
  const todayKey = calendarDateKeyInTimeZone(now, companyTimeZone);
  const clockInKey = calendarDateKeyInTimeZone(record.clockIn, companyTimeZone);
  return Boolean(matchesLiveShift && todayKey === clockInKey && todayKey !== "");
}

/** One row per member per day for Team attendance (prefer open active, then submitted missing out, then latest completed). */
/** Live dashboard: row is an active shift if clock_out is empty/null OR status is active (existing fields only). */
function isTimesheetRowActiveForLiveDashboard(record) {
  if (record == null) return false;
  const out = record.clockOut;
  const hasClockOut = out != null && String(out).trim() !== "";
  if (!hasClockOut) return true;
  return normalizeStatus(record.status) === "active";
}

function pickLatestActiveTimesheetForLiveDashboard(userRows) {
  const list = Array.isArray(userRows) ? userRows : [];
  const active = list.filter(isTimesheetRowActiveForLiveDashboard);
  if (!active.length) return null;
  const sorted = [...active].sort((a, b) => {
    const ta = parseStoredInstant(a?.clockIn).getTime();
    const tb = parseStoredInstant(b?.clockIn).getTime();
    const na = Number.isFinite(ta) ? ta : 0;
    const nb = Number.isFinite(tb) ? tb : 0;
    return nb - na;
  });
  return sorted[0] || null;
}

function pickRepresentativeTeamDayTimesheet(rowsForUser) {
  if (!rowsForUser?.length) return null;
  const byInDesc = [...rowsForUser].sort(
    (a, b) => parseStoredInstant(b.clockIn).getTime() - parseStoredInstant(a.clockIn).getTime()
  );
  const activeOpen = byInDesc.filter((r) => normalizeStatus(r.status) === "active" && !r.clockOut);
  if (activeOpen.length) return activeOpen[0];
  const submittedNoOut = byInDesc.filter((r) => normalizeStatus(r.status) === "submitted" && !r.clockOut);
  if (submittedNoOut.length) return submittedNoOut[0];
  const withOut = byInDesc.filter((r) => r.clockOut);
  if (withOut.length) {
    withOut.sort(
      (a, b) => parseStoredInstant(b.clockOut).getTime() - parseStoredInstant(a.clockOut).getTime()
    );
    return withOut[0];
  }
  return byInDesc[0];
}

function teamAttendanceStatusForRecord(record, ctx) {
  const { selectedDateKey, companyTimeZone, now, authUser, visibleCurrentShift } = ctx;
  if (!record) return { label: "Not clocked in", code: "none" };
  const st = normalizeStatus(record.status);
  const hasOut = Boolean(record.clockOut);
  const todayKey = calendarDateKeyInTimeZone(now, companyTimeZone);

  if (st === "active" && !hasOut) {
    if (selectedDateKey < todayKey) {
      return { label: "Missing clock-out", code: "missing_out" };
    }
    if (authUser?.id && String(record.userId) === String(authUser.id)) {
      if (visibleCurrentShift && isTimesheetLiveOpenRow(record, visibleCurrentShift, now, companyTimeZone)) {
        return { label: "Clocked in", code: "clocked_in" };
      }
      return { label: "Missing clock-out", code: "missing_out" };
    }
    return { label: "Clocked in", code: "clocked_in" };
  }
  if (hasOut) {
    return { label: "Clocked out", code: "clocked_out" };
  }
  if (st === "submitted" && !hasOut) {
    return { label: "Missing clock-out", code: "missing_out" };
  }
  return { label: "Missing clock-out", code: "missing_out" };
}

/** Dashboard row: aggregate display for all timesheets that day for one employee (multiple shifts). */
function computeDashboardEmployeeDayMetrics(userDayRows, rep, companyTimeZone, getWorkedMinutes, getLabourCost) {
  const projectDisp = rep?.project ? String(rep.project) : "—";
  const costDisp = rep?.costCenter ? String(rep.costCenter) : "—";
  if (!userDayRows?.length) {
    return {
      inDisp: "—",
      outDisp: "—",
      totalDisp: "—",
      labourDisp: "—",
      projectDisp,
      costDisp,
    };
  }
  const byInAsc = [...userDayRows].sort(
    (a, b) => parseStoredInstant(a.clockIn).getTime() - parseStoredInstant(b.clockIn).getTime()
  );
  const inDisp = byInAsc[0]?.clockIn ? formatTime(byInAsc[0].clockIn, companyTimeZone) : "—";
  const outsDesc = [...userDayRows]
    .filter((r) => r.clockOut)
    .sort((a, b) => parseStoredInstant(b.clockOut).getTime() - parseStoredInstant(a.clockOut).getTime());
  const anyOpenNoOut = userDayRows.some(
    (r) => normalizeStatus(r.status) === "active" && !r.clockOut
  );
  const outDisp =
    anyOpenNoOut || !outsDesc.length ? "—" : formatTime(outsDesc[0].clockOut, companyTimeZone);
  let sumMin = 0;
  let sumLab = 0;
  for (const ts of userDayRows) {
    sumMin += getWorkedMinutes(ts);
    sumLab += getLabourCost(ts);
  }
  return {
    inDisp,
    outDisp,
    totalDisp: formatDuration(sumMin),
    labourDisp: formatMoney(sumLab),
    projectDisp,
    costDisp,
  };
}

const COMPANY_TIME_ZONE_OPTIONS = [
  "America/Toronto",
  "America/Vancouver",
  "America/Edmonton",
  "America/Winnipeg",
  "America/Halifax",
  "America/St_Johns",
  "Asia/Kolkata",
  "UTC",
];

function formatDate(dateOrString, timeZone = DEFAULT_COMPANY_TIME_ZONE) {
  const tz = timeZone || DEFAULT_COMPANY_TIME_ZONE;
  const date = dateOrString instanceof Date ? dateOrString : parseStoredInstant(dateOrString);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateParts(dateOrString, timeZone = DEFAULT_COMPANY_TIME_ZONE) {
  const d = dateOrString instanceof Date ? dateOrString : parseStoredInstant(dateOrString);
  const tz = timeZone || DEFAULT_COMPANY_TIME_ZONE;
  if (Number.isNaN(d.getTime())) return { day: "—", fullDate: "—" };
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "short" }).format(d);
  const fullDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
  return { day, fullDate };
}

function formatTime(dateOrString, timeZone = DEFAULT_COMPANY_TIME_ZONE) {
  const tz = timeZone || DEFAULT_COMPANY_TIME_ZONE;
  const date = dateOrString instanceof Date ? dateOrString : parseStoredInstant(dateOrString);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function minutesBetween(start, end) {
  return Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000));
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function formatTimer(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatMoney(amount) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount || 0);
}

function formatLocation(location) {
  if (!location) return "Location not captured";
  return `${Number(location.latitude).toFixed(5)}, ${Number(location.longitude).toFixed(5)}`;
}

function getProjectFolderName(projectName) {
  return projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** Normalize profiles.hourly_rate for inserts (missing / invalid → 0). */
function hourlyRateFromProfileValue(hr) {
  if (hr == null || hr === "") return 0;
  const n = typeof hr === "number" ? hr : Number(String(hr).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** labour_cost = ((clock_out - clock_in) ms / 3600000) * hourly_rate */
function computeLabourCostFromWallTimes(clockInIso, clockOutIso, hourlyRate) {
  const t0 = new Date(clockInIso).getTime();
  const t1 = new Date(clockOutIso).getTime();
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return 0;
  const hours = (t1 - t0) / 3600000;
  const rate = Number(hourlyRate) || 0;
  return hours * rate;
}

/**
 * Build Supabase timesheets update for clock-out with profile hourly_rate fallback when timesheet rate is missing/0.
 */
async function buildTimesheetClockOutUpdate(supabase, { userId, clockInIso, clockOutIso, timesheetHourlyRate }) {
  let rate = Number(timesheetHourlyRate);
  if (!Number.isFinite(rate) || rate <= 0) {
    const { data: prof } = await supabase.from("profiles").select("hourly_rate").eq("id", userId).maybeSingle();
    rate = hourlyRateFromProfileValue(prof?.hourly_rate);
  }
  const labourCost = computeLabourCostFromWallTimes(clockInIso, clockOutIso, rate);
  const t0 = new Date(clockInIso).getTime();
  const t1 = new Date(clockOutIso).getTime();
  const hours =
    Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0 ? (t1 - t0) / 3600000 : 0;
  const update = {
    clock_out: clockOutIso,
    status: "Submitted",
    labour_cost: labourCost,
  };
  const rawTs = Number(timesheetHourlyRate);
  if ((!Number.isFinite(rawTs) || rawTs <= 0) && rate > 0) {
    update.hourly_rate = rate;
  }
  return {
    update,
    debug: {
      clockInIso,
      clockOutIso,
      hourlyRate: rate,
      hours,
      labourCost,
    },
  };
}

/** Map Supabase `timesheets` row → UI record shape used by Timesheet tab / reports */
function mapTimesheetRowFromSupabase(row) {
  const projectName = row.project_name || "";
  const empName = row.employee_name || "";
  return {
    id: row.id,
    supabaseTimesheetId: row.id,
    userId: row.user_id,
    employee: empName,
    employeeName: empName,
    employeeEmail: row.employee_email ?? null,
    companyId: row.company_id ?? null,
    companyName: row.company_name ?? null,
    projectId: row.project_id ?? null,
    project: projectName,
    costCenter: row.cost_centre || "",
    hourlyRate: Number(row.hourly_rate ?? 0),
    clockIn: row.clock_in,
    clockOut: row.clock_out ?? null,
    status: row.status || "Submitted",
    labour_cost:
      row.labour_cost != null && row.labour_cost !== "" ? Number(row.labour_cost) : undefined,
    breakStart: null,
    breakEnd: null,
    employeeId: row.user_id,
    projectFolder: projectName ? getProjectFolderName(projectName) : "",
    clockInLocation:
      row.clock_in_latitude != null && row.clock_in_longitude != null
        ? {
            latitude: row.clock_in_latitude,
            longitude: row.clock_in_longitude,
            accuracy: row.clock_in_accuracy,
            capturedAt: row.clock_in,
          }
        : null,
    clockOutLocation:
      row.clock_out_latitude != null && row.clock_out_longitude != null
        ? {
            latitude: row.clock_out_latitude,
            longitude: row.clock_out_longitude,
            accuracy: row.clock_out_accuracy,
            capturedAt: row.clock_out,
          }
        : null,
    profileDisplayName: "",
    profileEmailForRow: "",
  };
}

/** Load profile full_name/email for timesheet rows (by user_id). */
async function fetchProfilesByTimesheetUserIds(supabase, userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (ids.length === 0) return {};
  let { data: profs, error: pErr } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
  if (pErr) {
    const retry = await supabase.from("profiles").select("id, full_name").in("id", ids);
    if (retry.error) return {};
    profs = retry.data || [];
  }
  const map = {};
  (profs || []).forEach((p) => {
    map[p.id] = {
      full_name: (p.full_name && String(p.full_name).trim()) || "",
      email: (p.email && String(p.email).trim()) || "",
    };
  });
  return map;
}

/**
 * @returns {Promise<{
 *   coords: { latitude: number; longitude: number; accuracy: number; capturedAt: string } | null;
 *   error: "denied" | "unavailable" | "timeout" | null;
 * }>}
 */
function getCurrentLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ coords: null, error: "unavailable" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            capturedAt: new Date().toISOString(),
          },
          error: null,
        });
      },
      (err) => {
        const code = err?.code;
        if (code === 1) resolve({ coords: null, error: "denied" });
        else if (code === 2) resolve({ coords: null, error: "unavailable" });
        else if (code === 3) resolve({ coords: null, error: "timeout" });
        else resolve({ coords: null, error: "unavailable" });
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    );
  });
}

function isMissingOptionalAccuracyColumnError(error) {
  const m = String(error?.message || "").toLowerCase();
  return (
    m.includes("column") &&
    (m.includes("accuracy") || m.includes("clock_in_accuracy") || m.includes("clock_out_accuracy"))
  );
}

async function supabaseInsertTimesheetRow(supabase, row) {
  let payload = { ...row };
  let { data, error } = await supabase.from("timesheets").insert([payload]).select();
  if (
    error &&
    isMissingOptionalAccuracyColumnError(error) &&
    ("clock_in_accuracy" in payload || "clock_out_accuracy" in payload)
  ) {
    const { clock_in_accuracy, clock_out_accuracy, ...rest } = payload;
    ({ data, error } = await supabase.from("timesheets").insert([rest]).select());
  }
  return { data, error };
}

async function supabaseUpdateTimesheetRow(supabase, id, partial) {
  let payload = { ...partial };
  let { data, error } = await supabase.from("timesheets").update(payload).eq("id", id).select();
  if (
    error &&
    isMissingOptionalAccuracyColumnError(error) &&
    ("clock_in_accuracy" in payload || "clock_out_accuracy" in payload)
  ) {
    const { clock_in_accuracy, clock_out_accuracy, ...rest } = payload;
    ({ data, error } = await supabase.from("timesheets").update(rest).eq("id", id).select());
  }
  return { error, data };
}

async function saveLiveLocationRowManual(
  supabase,
  { companyId, employeeId, status, projectName, costCentre, coords }
) {
  if (!companyId || !employeeId) return { error: null };
  const payload = {
    employee_id: employeeId,
    company_id: companyId,
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
    accuracy: coords?.accuracy ?? null,
    updated_at: new Date().toISOString(),
    status: status || null,
    project_name: projectName || null,
    cost_centre: costCentre || null,
  };

  console.log("[LIVE GPS] payload", payload);

  // Manual select/update/insert (no upsert) to avoid conflicts.
  const { data: existing, error: exErr } = await supabase
    .from("live_locations")
    .select("id, employee_id, company_id, status, updated_at")
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (exErr) {
    console.warn("[LIVE GPS] error", exErr);
    return { error: exErr };
  }

  console.log("[LIVE GPS] existing row", existing || null);

  if (existing?.id) {
    const { error: uErr } = await supabase.from("live_locations").update(payload).eq("id", existing.id);
    if (uErr) {
      console.warn("[LIVE GPS] error", uErr);
      return { error: uErr };
    }
    console.log("[LIVE GPS] update success", { id: existing.id });
    return { error: null };
  }

  const { error: iErr } = await supabase.from("live_locations").insert(payload);
  if (iErr) {
    console.warn("[LIVE GPS] error", iErr);
    return { error: iErr };
  }
  console.log("[LIVE GPS] insert success");
  return { error: null };
}

function openMap(location) {
  if (!location) return;
  window.open(`https://www.google.com/maps?q=${location.latitude},${location.longitude}`, "_blank");
}



function getErrorMessage(error) {
  if (!error) return "Unknown error";

  if (typeof error === "string") return error;

  if (error.message) return error.message;

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

/** Detect missing-column errors from PostgREST / Postgres. */
function isMissingDbColumnError(error) {
  const m = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  return (
    (m.includes("column") && (m.includes("does not exist") || m.includes("undefined"))) ||
    m.includes("42703")
  );
}

const TEAM_PROFILES_SQL_HINT =
  "Add to public.profiles: hourly_rate (numeric), pay_rate_effective_date (date), employment_status (text), joining_date (date). Example: ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hourly_rate numeric DEFAULT 0; ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pay_rate_effective_date date; ALTER TABLE profiles ADD COLUMN IF NOT EXISTS employment_status text DEFAULT 'active'; ALTER TABLE profiles ADD COLUMN IF NOT EXISTS joining_date date;";

function showErrorPopup(title, error) {
  const message = getErrorMessage(error);
  console.error(title, error);
  alert(`${title}\n\n${message}`);
}

function withTimeout(promise, ms = 10000, message = "Operation timed out") {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]);
}

/**
 * Notification recipients by actor role (company_members in same company; actor always excluded).
 * - employee → all owner + supervisor user_ids
 * - supervisor → owner user_ids only
 * - owner → none (no notifications for own actions)
 */
async function getNotificationRecipients(supabase, companyId, actorUserId, actorRole) {
  const ar = normalizeMemberRole(actorRole);
  console.log("[NOTIFY] actor role", ar, "actorUserId", actorUserId, "companyId", companyId);
  if (!companyId || !actorUserId) return [];
  if (ar === "owner") {
    console.log("[NOTIFY] recipients (owner actor) → []");
    return [];
  }
  const { data, error } = await supabase.from("company_members").select("user_id, role").eq("company_id", companyId);
  if (error) {
    console.warn("[NOTIFY] company_members fetch error", error);
    return [];
  }
  if (!data?.length) {
    console.warn("[NOTIFY] company_members empty for company", companyId);
    return [];
  }
  const filtered = data.filter((row) => {
    const rr = normalizeMemberRole(row.role);
    if (ar === "employee") return rr === "owner" || rr === "supervisor";
    if (ar === "supervisor") return rr === "owner";
    return false;
  });
  const ids = [...new Set(filtered.map((row) => row.user_id).filter(Boolean).map(String))].filter(
    (id) => id !== String(actorUserId)
  );
  console.log("[NOTIFY] recipients", ids);
  return ids;
}

function clockInTitleForActorRole(actorRole) {
  return normalizeMemberRole(actorRole) === "supervisor" ? "Supervisor clocked in" : "Employee clocked in";
}

function clockOutTitleForActorRole(actorRole) {
  return normalizeMemberRole(actorRole) === "supervisor" ? "Supervisor clocked out" : "Employee clocked out";
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function rpcReturnedNotificationId(data) {
  if (data == null) return null;
  if (typeof data === "string") return data;
  if (Array.isArray(data) && data.length > 0) return String(data[0]);
  return null;
}

async function requestSendPushForNotificationIds(ids) {
  if (!ids.length) return;
  try {
    const res = await fetch("/api/send-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notification_ids: ids }),
    });
    if (!res.ok) console.warn("[NOTIFY] send-push HTTP", res.status);
  } catch (e) {
    console.warn("[NOTIFY] send-push fetch failed", e);
  }
}

/** Browser/PWA Notification API for clock_in / clock_out only; never throws. */
function tryShowClockBrowserNotification(notificationRow, shownIdsRef) {
  const id = String(notificationRow?.id ?? "");
  if (!id || shownIdsRef.current.has(id)) return;
  const t = String(notificationRow?.type || "").trim();
  if (t !== "clock_in" && t !== "clock_out") return;
  if (typeof window === "undefined" || !window.Notification) return;
  if (window.Notification.permission !== "granted") return;
  try {
    shownIdsRef.current.add(id);
    new window.Notification(String(notificationRow.title || "Clock App"), {
      body: String(notificationRow.message || ""),
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: id,
    });
  } catch (e) {
    console.warn("[NOTIFY] system Notification failed", e);
    shownIdsRef.current.delete(id);
  }
}

/** Insert one in-app row per recipient. Failures are logged only — never throws. */
async function createCompanyNotifications(supabase, params) {
  const {
    companyId,
    actorUserId,
    actorRole,
    type,
    title,
    message,
    projectId,
    projectName,
    costCentre,
    relatedTimesheetId,
    relatedFolder,
    itemCount,
  } = params;
  console.log("[NOTIFY] createCompanyNotifications start", {
    type,
    title,
    actorRole: normalizeMemberRole(actorRole),
    actorUserId,
    companyId,
  });
  if (!companyId || !actorUserId) {
    console.warn("[NOTIFY] missing companyId or actorUserId; skip");
    return;
  }
  let recipients;
  try {
    recipients = await getNotificationRecipients(supabase, companyId, actorUserId, actorRole);
  } catch (e) {
    console.error("[NOTIFY] getNotificationRecipients exception", e);
    return;
  }
  if (!recipients.length) {
    console.warn("[NOTIFY] no recipients; skip");
    return;
  }

  const pRelatedTimesheetId =
    relatedTimesheetId != null && relatedTimesheetId !== "" ? String(relatedTimesheetId) : null;
  const pItemCount = itemCount != null && Number.isFinite(Number(itemCount)) ? Number(itemCount) : null;

  const createdNotificationIds = [];

  for (const recipient_user_id of recipients) {
    const rpcPayload = {
      p_company_id: companyId,
      p_recipient_user_id: recipient_user_id,
      p_actor_user_id: actorUserId,
      p_type: String(type || ""),
      p_title: String(title || ""),
      p_message: String(message || ""),
      p_project_id: projectId != null && projectId !== "" ? String(projectId) : null,
      p_project_name: projectName != null ? String(projectName) : null,
      p_cost_centre: costCentre != null ? String(costCentre) : null,
      p_related_timesheet_id: pRelatedTimesheetId,
      p_related_folder: relatedFolder != null ? String(relatedFolder) : null,
      p_item_count: pItemCount,
    };
    console.log("[NOTIFY] rpc payload", rpcPayload);
    try {
      const { data, error } = await supabase.rpc("create_company_notification", rpcPayload);
      if (error) {
        console.error("[NOTIFY] rpc error", error);
        continue;
      }
      console.log("[NOTIFY] rpc success", data);
      const nid = rpcReturnedNotificationId(data);
      if (nid) createdNotificationIds.push(nid);
    } catch (e) {
      console.error("[NOTIFY] rpc exception", e);
    }
  }

  if (createdNotificationIds.length > 0) {
    void requestSendPushForNotificationIds(createdNotificationIds);
  }
}

async function sendPhotoBatchNotifications(supabase, payload, count) {
  if (!payload?.companyId || !payload?.actorUserId || !count) return;
  const c = count;
  const photoWord = c === 1 ? "photo" : "photos";
  const name = payload.actorName || "Someone";
  await createCompanyNotifications(supabase, {
    companyId: payload.companyId,
    actorUserId: payload.actorUserId,
    actorRole: payload.actorRole,
    type: "photos_uploaded",
    title: "Photos uploaded",
    message: `${name} uploaded ${c} ${photoWord} for ${payload.projectName} - ${payload.costCentre}`,
    projectId: payload.projectId,
    projectName: payload.projectName,
    costCentre: payload.costCentre,
    relatedTimesheetId: payload.relatedTimesheetId,
    relatedFolder: payload.relatedFolder,
    itemCount: c,
  });
}

export default function EmployeeClockApp() {
  const [activeTab, setActiveTab] = useState("clock");
  const [projectId, setProjectId] = useState(adminProjects[0].id);
  const [costCenter, setCostCenter] = useState(adminProjects[0].costCenters[0]);
  const [currentShift, setCurrentShift] = useState(() => safeRead("orp_current_shift", null));
  const [records, setRecords] = useState(() => []);
  const localTimesheetBackupRef = useRef(safeRead("orp_timesheet_records", sampleRecords));
  const [timesheetsLoading, setTimesheetsLoading] = useState(false);
  const [timesheetsError, setTimesheetsError] = useState("");
  const [projectPhotos, setProjectPhotos] = useState(() => safeRead("orp_project_photos", {}));
  const [projectReceipts, setProjectReceipts] = useState(() => safeRead("orp_project_receipts", {}));
  const [now, setNow] = useState(new Date());
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState(null);
  const [editClockInDate, setEditClockInDate] = useState("");
  const [editClockInTime, setEditClockInTime] = useState("");
  const [editClockOutDate, setEditClockOutDate] = useState("");
  const [editClockOutTime, setEditClockOutTime] = useState("");
  const [editProjectId, setEditProjectId] = useState("");
  const [editCostCenter, setEditCostCenter] = useState("");
  const [editTimesheetSaving, setEditTimesheetSaving] = useState(false);
  const [deletingTimesheetId, setDeletingTimesheetId] = useState(null);
  const [isChangingTask, setIsChangingTask] = useState(false);
  const [reportRange, setReportRange] = useState("today");
  const [reportType, setReportType] = useState("employee");
  const [reportEmployeeId, setReportEmployeeId] = useState("all");
  const [reportProjectId, setReportProjectId] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [locationStatus, setLocationStatus] = useState("");
  const [photoStatus, setPhotoStatus] = useState("");
const [uploadProgress, setUploadProgress] = useState(null);
  const [watchId, setWatchId] = useState(null);
  const [photoNotificationCount, setPhotoNotificationCount] = useState(() => safeRead("orp_photo_notification_count", 0));
  const [selectedPhotoFolder, setSelectedPhotoFolder] = useState("all");
  const [selectedReceiptFolder, setSelectedReceiptFolder] = useState("all");
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [inAppNotifications, setInAppNotifications] = useState([]);
  const [inAppNotifError, setInAppNotifError] = useState("");
  const [inAppNotifUnread, setInAppNotifUnread] = useState(0);
  const [markingNotifId, setMarkingNotifId] = useState(null);
  const [markingAllNotifs, setMarkingAllNotifs] = useState(false);
  const [liveToast, setLiveToast] = useState(null);
  const [mobileNotifPermissionUi, setMobileNotifPermissionUi] = useState("unknown");
  const [backgroundPushUi, setBackgroundPushUi] = useState("unknown");
  const [backgroundPushError, setBackgroundPushError] = useState("");
  const [backgroundPushSaveMessage, setBackgroundPushSaveMessage] = useState("");
  const notifPollBootstrappedRef = useRef(false);
  const notifLastUnreadIdsRef = useRef(new Set());
  const systemNotifShownIdsRef = useRef(new Set());

  const photoNotifyBatchRef = useRef({
    timer: null,
    count: 0,
    key: "",
    payload: null,
  });

  const [initialLoading, setInitialLoading] = useState(true);
  const [authUser, setAuthUser] = useState(null);
  const [authRole, setAuthRole] = useState(null);
  const [profileFullName, setProfileFullName] = useState("");
  const [profileEmploymentStatus, setProfileEmploymentStatus] = useState("active");
  const [startupError, setStartupError] = useState("");
  const hasSuccessfulLoginRef = useRef(false);
  const loginClickedRef = useRef(false);
  const [loginDebug, setLoginDebug] = useState("");
  const hasOpenedAppRef = useRef(false);
  // Live refs for auth listener stability (avoid stale closures)
  const authUserRef = useRef(null);
  const userCompanyRef = useRef(null);
  const companyCheckedRef = useRef(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Auth / onboarding flow
  const [authStep, setAuthStep] = useState("login"); // login | signup | company_choice | create_company | join_company | company_created
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState("");

  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyError, setCompanyError] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [joinCompanyCode, setJoinCompanyCode] = useState("");
  const [createdCompanyCode, setCreatedCompanyCode] = useState("");
  const [userCompany, setUserCompany] = useState(null); // { id, name, code }
  const [userCompanyRole, setUserCompanyRole] = useState(null); // owner | supervisor | employee
  const [companyChecked, setCompanyChecked] = useState(false);

  const employeeDisplayName = (profileFullName || authUser?.email || "").trim();
  const resolvedCompanyRole = useMemo(() => normalizeCompanyMemberRole(userCompanyRole), [userCompanyRole]);
  const isOwner = resolvedCompanyRole === "owner";
  const isSupervisor = resolvedCompanyRole === "supervisor";
  const isEmployeeRole = resolvedCompanyRole === "employee";
  const isAdmin = isOwner || isSupervisor;
  const isProfileArchived = normalizeEmploymentStatus(profileEmploymentStatus) === "archived";
  const companyTimeZone = userCompany?.time_zone || "America/Toronto";

  const scopedProjectPhotos = useMemo(() => {
    if (!isEmployeeRole || !authUser?.id) return projectPhotos;
    const uid = String(authUser.id);
    const out = {};
    for (const [folder, photos] of Object.entries(projectPhotos || {})) {
      const filtered = (photos || []).filter((p) => String(p.employeeId) === uid);
      if (filtered.length > 0) out[folder] = filtered;
    }
    return out;
  }, [isEmployeeRole, authUser?.id, projectPhotos]);

  const scopedProjectReceipts = useMemo(() => {
    if (!isEmployeeRole || !authUser?.id) return projectReceipts;
    const uid = String(authUser.id);
    const out = {};
    for (const [folder, receipts] of Object.entries(projectReceipts || {})) {
      const filtered = (receipts || []).filter((r) => String(r.employeeId) === uid);
      if (filtered.length > 0) out[folder] = filtered;
    }
    return out;
  }, [isEmployeeRole, authUser?.id, projectReceipts]);

  const [settingsTzDraft, setSettingsTzDraft] = useState(DEFAULT_COMPANY_TIME_ZONE);
  const [closingShiftId, setClosingShiftId] = useState(null);
  const [settingsTzMessage, setSettingsTzMessage] = useState("");
  const [settingsTzSaving, setSettingsTzSaving] = useState(false);

  const [teamRows, setTeamRows] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState("");
  const [teamCopyOk, setTeamCopyOk] = useState(false);
  const [teamRoleFeedback, setTeamRoleFeedback] = useState({ type: "", text: "" });
  const [teamEditingMemberRowId, setTeamEditingMemberRowId] = useState(null);
  const [teamEditDraft, setTeamEditDraft] = useState(null);
  const [teamEditInlineError, setTeamEditInlineError] = useState("");
  const [teamSchemaWarning, setTeamSchemaWarning] = useState("");
  const [teamSavingMemberRowId, setTeamSavingMemberRowId] = useState(null);
  const [teamRefreshKey, setTeamRefreshKey] = useState(0);
  const [teamAddFormOpen, setTeamAddFormOpen] = useState(false);
  const [teamAddDraft, setTeamAddDraft] = useState(() => ({ ...TEAM_ADD_INITIAL_DRAFT }));
  const [teamAddSubmitting, setTeamAddSubmitting] = useState(false);
  const [teamAddError, setTeamAddError] = useState("");
  const [teamListFilter, setTeamListFilter] = useState("active"); // active | archived | all
  const [dashboardViewDate, setDashboardViewDate] = useState("");
  const [dashboardRows, setDashboardRows] = useState([]);
  const [dashboardDaySheets, setDashboardDaySheets] = useState([]);
  /** Today's timesheets (company TZ) for live “currently working” list; extra fetch only when selected date ≠ today. */
  const [dashboardTodaySheets, setDashboardTodaySheets] = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [dashboardClockPick, setDashboardClockPick] = useState({});
  /** user_id -> project_id[] for active project_assignments (Dashboard manual clock-in only). */
  const [dashboardAssignmentsByUserId, setDashboardAssignmentsByUserId] = useState({});
  /** Bumps when Projects tab data changes; dashboard refetches assignment map for clock-in picks. */
  const [projectsScreenRefreshKey, setProjectsScreenRefreshKey] = useState(0);
  const [dashboardActionFeedback, setDashboardActionFeedback] = useState(null);
  const [dashboardSavingUserId, setDashboardSavingUserId] = useState(null);
  const [dashboardLiveLocations, setDashboardLiveLocations] = useState([]);
  const [dashboardLiveLocationsLoading, setDashboardLiveLocationsLoading] = useState(false);
  const [dashboardLiveLocationsError, setDashboardLiveLocationsError] = useState("");

  /** Reports tab (owner/supervisor): date range + timesheet rows loaded only when tab is active. */
  const [reportsDateFrom, setReportsDateFrom] = useState("");
  const [reportsDateTo, setReportsDateTo] = useState("");
  const [reportsScreenRows, setReportsScreenRows] = useState([]);
  const [reportsScreenLoading, setReportsScreenLoading] = useState(false);
  const [reportsScreenError, setReportsScreenError] = useState("");
  const [reportsRangePreset, setReportsRangePreset] = useState(null);
  /** Reports breakdown dimensions: Level 1 required; Level 2/3 optional (none). */
  const [reportsLevel1, setReportsLevel1] = useState("project");
  const [reportsLevel2, setReportsLevel2] = useState("none");
  const [reportsLevel3, setReportsLevel3] = useState("none");
  const [reportsCostCentreAll, setReportsCostCentreAll] = useState(true);
  const [reportsCostCentrePicked, setReportsCostCentrePicked] = useState([]);
  const [reportsExpandedL1, setReportsExpandedL1] = useState({});
  const [reportsExpandedL2, setReportsExpandedL2] = useState({});

  useEffect(() => {
    setSettingsTzDraft(userCompany?.time_zone || "America/Toronto");
  }, [userCompany?.id, userCompany?.time_zone]);

  useEffect(() => {
    if (!userCompany?.id) return;
    setDashboardViewDate(calendarDateKeyInTimeZone(new Date(), userCompany.time_zone || DEFAULT_COMPANY_TIME_ZONE));
  }, [userCompany?.id]);

  useEffect(() => {
    if (!isAdmin || activeTab !== "reports") return;
    const todayKey = calendarDateKeyInTimeZone(new Date(), companyTimeZone);
    if (!todayKey) return;
    const [yStr, mStr] = todayKey.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    if (!y || !m) return;
    const fromKey = `${y}-${String(m).padStart(2, "0")}-01`;
    setReportsDateFrom((prev) => prev || fromKey);
    setReportsDateTo((prev) => prev || todayKey);
  }, [isAdmin, activeTab, companyTimeZone]);

  useEffect(() => {
    if (!isAdmin || activeTab !== "reports" || !userCompany?.id) {
      return;
    }
    const fromKey = reportsDateFrom.trim();
    const toKey = reportsDateTo.trim();
    if (!fromKey || !toKey) {
      setReportsScreenRows([]);
      return;
    }
    if (fromKey > toKey) {
      setReportsScreenError("Date from must be on or before date to.");
      setReportsScreenRows([]);
      setReportsScreenLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setReportsScreenLoading(true);
      setReportsScreenError("");
      try {
        const startIso = wallDateTimeToUtcIso(fromKey, "00:00:00", companyTimeZone);
        const endIso = wallDateTimeToUtcIso(toKey, "23:59:59", companyTimeZone);
        if (!startIso || !endIso) {
          throw new Error("Invalid date range for company timezone.");
        }
        const { data, error } = await supabase
          .from("timesheets")
          .select("*")
          .eq("company_id", userCompany.id)
          .gte("clock_in", startIso)
          .lte("clock_in", endIso)
          .order("clock_in", { ascending: false });
        if (error) throw error;
        const mapped = (data || []).map(mapTimesheetRowFromSupabase);
        const filtered = mapped.filter((r) => {
          const k = calendarDateKeyInTimeZone(r.clockIn, companyTimeZone);
          return k >= fromKey && k <= toKey;
        });
        const uids = filtered.map((r) => r.userId).filter(Boolean);
        const pmap = await fetchProfilesByTimesheetUserIds(supabase, uids);
        const enriched = filtered.map((rec) => {
          const pr = pmap[rec.userId] || {};
          return {
            ...rec,
            profileDisplayName: pr.full_name || "",
            profileEmailForRow: pr.email || "",
          };
        });
        if (!cancelled) setReportsScreenRows(enriched);
      } catch (err) {
        if (!cancelled) {
          setReportsScreenRows([]);
          setReportsScreenError(getErrorMessage(err));
        }
      } finally {
        if (!cancelled) setReportsScreenLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, activeTab, userCompany?.id, reportsDateFrom, reportsDateTo, companyTimeZone]);

  useEffect(() => {
    if (activeTab !== "team" || !isAdmin || !userCompany?.id || !authUser?.id) return;
    let cancelled = false;
    setTeamLoading(true);
    setTeamError("");
    setTeamRoleFeedback({ type: "", text: "" });
    setTeamSchemaWarning("");
    (async () => {
      try {
        const { data: members, error: mErr } = await supabase
          .from("company_members")
          .select("id, user_id, role, created_at")
          .eq("company_id", userCompany.id)
          .order("created_at", { ascending: true });
        if (mErr) throw mErr;
        const list = members || [];
        const ids = [...new Set(list.map((m) => m.user_id).filter(Boolean))];
        const profilesMap = {};
        if (ids.length > 0) {
          const extendedSelect =
            "id, full_name, email, role, hourly_rate, pay_rate_effective_date, employment_status, joining_date";
          let { data: profs, error: pErr } = await supabase.from("profiles").select(extendedSelect).in("id", ids);
          if (pErr && isMissingDbColumnError(pErr)) {
            if (!cancelled) setTeamSchemaWarning(`Profiles table is missing columns. ${TEAM_PROFILES_SQL_HINT}`);
            const retryMid = await supabase
              .from("profiles")
              .select("id, full_name, email, role, hourly_rate, pay_rate_effective_date, employment_status")
              .in("id", ids);
            if (retryMid.error) {
              const retry = await supabase.from("profiles").select("id, full_name, email, role").in("id", ids);
              if (retry.error) throw retry.error;
              profs = retry.data || [];
            } else {
              profs = retryMid.data || [];
            }
          } else if (pErr) {
            const retry = await supabase.from("profiles").select("id, full_name, role").in("id", ids);
            if (retry.error) throw retry.error;
            profs = retry.data || [];
          }
          (profs || []).forEach((p) => {
            profilesMap[p.id] = p;
          });
        }
        const rows = list.map((m) => {
          const p = profilesMap[m.user_id] || {};
          const profileFull = (p.full_name && String(p.full_name).trim()) || "";
          const profileEmailRaw = (p.email && String(p.email).trim()) || "";
          const displayName = profileFull || profileEmailRaw || shortUserLabel(m.user_id);
          const hr = p.hourly_rate;
          const hourlyRateNum =
            hr != null && hr !== "" && Number.isFinite(Number(hr)) ? Number(hr) : null;
          const empRaw = p.employment_status != null ? String(p.employment_status).trim().toLowerCase() : "active";
          const employmentStatus = empRaw === "archived" ? "archived" : "active";
          const jd = p.joining_date;
          const joiningDate =
            jd != null && String(jd).trim() !== ""
              ? String(jd).trim().slice(0, 10)
              : null;
          return {
            memberRowId: m.id,
            userId: m.user_id,
            role: (m.role || "employee").trim(),
            joinedAt: m.created_at ?? null,
            fullName: profileFull,
            profileEmailRaw,
            displayName: displayName || shortUserLabel(m.user_id),
            hourlyRate: hourlyRateNum,
            payRateEffectiveDate: p.pay_rate_effective_date ?? null,
            employmentStatus,
            joiningDate,
          };
        });

        if (!cancelled) setTeamRows(rows);
      } catch (err) {
        if (!cancelled) {
          setTeamError(getErrorMessage(err));
          setTeamRows([]);
        }
      } finally {
        if (!cancelled) setTeamLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, isAdmin, userCompany?.id, authUser?.id, teamRefreshKey]);

  useEffect(() => {
    setTeamEditingMemberRowId(null);
    setTeamEditDraft(null);
    setTeamEditInlineError("");
    setTeamAddFormOpen(false);
    setTeamAddError("");
    setTeamAddDraft({ ...TEAM_ADD_INITIAL_DRAFT });
  }, [activeTab, userCompany?.id]);

  useEffect(() => {
    if (
      activeTab !== "dashboard" ||
      !isAdmin ||
      !userCompany?.id ||
      !authUser?.id ||
      !dashboardViewDate ||
      !companyChecked
    ) {
      return;
    }
    let cancelled = false;
    setDashboardLoading(true);
    setDashboardError("");
    (async () => {
      try {
        const { data: members, error: mErr } = await supabase
          .from("company_members")
          .select("id, user_id, role, created_at")
          .eq("company_id", userCompany.id)
          .order("created_at", { ascending: true });
        if (mErr) throw mErr;
        const list = members || [];
        const ids = [...new Set(list.map((m) => m.user_id).filter(Boolean))];
        const profilesMap = {};
        if (ids.length > 0) {
          let { data: profs, error: pErr } = await supabase
            .from("profiles")
            .select("id, full_name, email, role, employment_status, hourly_rate")
            .in("id", ids);
          if (pErr) {
            const retry = await supabase.from("profiles").select("id, full_name, role").in("id", ids);
            if (retry.error) throw retry.error;
            profs = retry.data || [];
          }
          (profs || []).forEach((p) => {
            profilesMap[p.id] = p;
          });
        }
        const rows = list.map((m) => {
          const p = profilesMap[m.user_id] || {};
          const profileFull = (p.full_name && String(p.full_name).trim()) || "";
          const profileEmailRaw = (p.email && String(p.email).trim()) || "";
          const displayName = profileFull || profileEmailRaw || shortUserLabel(m.user_id);
          const empRaw = p.employment_status != null ? String(p.employment_status).trim().toLowerCase() : "active";
          const employmentStatus = empRaw === "archived" ? "archived" : "active";
          const hr = p.hourly_rate;
          const hourlyRate =
            hr != null && hr !== "" && Number.isFinite(Number(hr)) ? Number(hr) : null;
          return {
            memberRowId: m.id,
            userId: m.user_id,
            role: (m.role || "employee").trim(),
            joinedAt: m.created_at ?? null,
            fullName: profileFull,
            profileEmailRaw,
            displayName: displayName || shortUserLabel(m.user_id),
            employmentStatus,
            hourlyRate,
          };
        });

        const { data: paData, error: paErr } = await supabase
          .from("project_assignments")
          .select("user_id, project_id")
          .eq("company_id", userCompany.id)
          .eq("status", "active");
        if (paErr) throw paErr;
        const assignByUser = {};
        for (const r of paData || []) {
          const u = String(r.user_id);
          if (!assignByUser[u]) assignByUser[u] = [];
          assignByUser[u].push(r.project_id);
        }

        const dayStartIso = wallDateTimeToUtcIso(dashboardViewDate, "00:00:00", companyTimeZone);
        const dayEndIso = wallDateTimeToUtcIso(dashboardViewDate, "23:59:59", companyTimeZone);
        const todayKeyLive = calendarDateKeyInTimeZone(new Date(), companyTimeZone);
        const todayStartIso = wallDateTimeToUtcIso(todayKeyLive, "00:00:00", companyTimeZone);
        const todayEndIso = wallDateTimeToUtcIso(todayKeyLive, "23:59:59", companyTimeZone);
        if (!dayStartIso || !dayEndIso || !todayStartIso || !todayEndIso) {
          if (!cancelled) {
            setDashboardRows(rows);
            setDashboardDaySheets([]);
            setDashboardTodaySheets([]);
            setDashboardAssignmentsByUserId(assignByUser);
          }
          return;
        }
        const { data: tsData, error: tsErr } = await supabase
          .from("timesheets")
          .select("*")
          .eq("company_id", userCompany.id)
          .gte("clock_in", dayStartIso)
          .lte("clock_in", dayEndIso)
          .order("clock_in", { ascending: false });
        if (tsErr) throw tsErr;
        const mappedTs = (tsData || []).map(mapTimesheetRowFromSupabase);
        const dateFiltered = mappedTs.filter(
          (r) => calendarDateKeyInTimeZone(r.clockIn, companyTimeZone) === dashboardViewDate
        );

        let todayFiltered = dateFiltered;
        if (todayKeyLive !== dashboardViewDate) {
          const { data: tsToday, error: tsTodayErr } = await supabase
            .from("timesheets")
            .select("*")
            .eq("company_id", userCompany.id)
            .gte("clock_in", todayStartIso)
            .lte("clock_in", todayEndIso)
            .order("clock_in", { ascending: false });
          if (tsTodayErr) throw tsTodayErr;
          const mappedToday = (tsToday || []).map(mapTimesheetRowFromSupabase);
          todayFiltered = mappedToday.filter(
            (r) => calendarDateKeyInTimeZone(r.clockIn, companyTimeZone) === todayKeyLive
          );
        }

        if (!cancelled) {
          setDashboardRows(rows);
          setDashboardDaySheets(dateFiltered);
          setDashboardTodaySheets(Array.isArray(todayFiltered) ? todayFiltered : []);
          setDashboardAssignmentsByUserId(assignByUser);
        }
      } catch (err) {
        if (!cancelled) {
          setDashboardError(getErrorMessage(err));
          setDashboardRows([]);
          setDashboardDaySheets([]);
          setDashboardTodaySheets([]);
          setDashboardAssignmentsByUserId({});
        }
      } finally {
        if (!cancelled) setDashboardLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    isAdmin,
    userCompany?.id,
    authUser?.id,
    companyChecked,
    dashboardViewDate,
    companyTimeZone,
    dashboardRefreshKey,
    projectsScreenRefreshKey,
  ]);

  useEffect(() => {
    if (activeTab !== "dashboard" || !isAdmin || !userCompany?.id) {
      setDashboardLiveLocations([]);
      setDashboardLiveLocationsError("");
      setDashboardLiveLocationsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setDashboardLiveLocationsLoading(true);
      setDashboardLiveLocationsError("");
      try {
        const { data, error } = await supabase
          .from("live_locations")
          .select("employee_id, latitude, longitude, accuracy, updated_at, status, project_name, cost_centre")
          .eq("company_id", userCompany.id);
        if (error) throw error;
        const raw = Array.isArray(data) ? data : [];
        const clockedIn = raw.filter((r) => String(r.status ?? "").trim().toLowerCase() === "clocked_in");
        const uids = [...new Set(clockedIn.map((r) => r.employee_id).filter(Boolean))];
        const pmap = await fetchProfilesByTimesheetUserIds(supabase, uids);
        const enriched = clockedIn.map((r) => {
          const pr = pmap[r.employee_id] || {};
          const full = (pr.full_name && String(pr.full_name).trim()) || "";
          const em = (pr.email && String(pr.email).trim()) || "";
          const displayName = full || em || shortUserLabel(r.employee_id);
          return { ...r, displayName };
        });
        enriched.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
        if (!cancelled) setDashboardLiveLocations(enriched);
      } catch (err) {
        if (!cancelled) {
          setDashboardLiveLocations([]);
          setDashboardLiveLocationsError(getErrorMessage(err));
        }
      } finally {
        if (!cancelled) setDashboardLiveLocationsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, isAdmin, userCompany?.id, dashboardRefreshKey]);

  useEffect(() => {
    setDashboardActionFeedback(null);
  }, [dashboardViewDate]);

  const teamProfileFullNameByUserId = useMemo(() => {
    const m = {};
    teamRows.forEach((r) => {
      const fn = (r.fullName && String(r.fullName).trim()) || "";
      if (r.userId != null && fn) m[r.userId] = fn;
    });
    return m;
  }, [teamRows]);

  const dashboardSelectedDateLabel = useMemo(() => {
    if (!dashboardViewDate) return "";
    const iso = wallDateTimeToUtcIso(dashboardViewDate, "12:00:00", companyTimeZone);
    if (!iso) return dashboardViewDate;
    return formatDate(iso, companyTimeZone);
  }, [dashboardViewDate, companyTimeZone]);

  const fetchTimesheetsFromSupabase = useCallback(async () => {
    if (!authUser?.id || !userCompany?.id || !userCompanyRole) return;

    setTimesheetsLoading(true);
    setTimesheetsError("");
    try {
      let query = supabase
        .from("timesheets")
        .select("*")
        .eq("company_id", userCompany.id)
        .order("clock_in", { ascending: false });

      if (isEmployeeRole) {
        query = query.eq("user_id", authUser.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      const mapped = (data || []).map(mapTimesheetRowFromSupabase);
      const uids = mapped.map((r) => r.userId).filter(Boolean);
      const pmap = await fetchProfilesByTimesheetUserIds(supabase, uids);
      const enriched = mapped.map((rec) => {
        const pr = pmap[rec.userId] || {};
        return {
          ...rec,
          profileDisplayName: pr.full_name || "",
          profileEmailForRow: pr.email || "",
        };
      });
      setRecords(enriched);
    } catch (err) {
      const msg = getErrorMessage(err);
      setTimesheetsError(msg);
      setRecords((prev) => (prev.length > 0 ? prev : localTimesheetBackupRef.current));
    } finally {
      setTimesheetsLoading(false);
    }
  }, [authUser?.id, userCompany?.id, userCompanyRole, isEmployeeRole]);

  useEffect(() => {
    if (!authUser?.id || !userCompany?.id || !userCompanyRole) return;
    fetchTimesheetsFromSupabase();
  }, [authUser?.id, userCompany?.id, userCompanyRole, fetchTimesheetsFromSupabase]);

  // V2.1: company projects + cost centres (Supabase-backed)
  const [companyProjects, setCompanyProjects] = useState([]); // [{ id, name }]
  const [costCentresByProjectId, setCostCentresByProjectId] = useState({}); // { [projectId]: string[] }
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState("");
  const [useProjectFallback, setUseProjectFallback] = useState(false);

  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectCostCentres, setNewProjectCostCentres] = useState("");
  const [addProjectLoading, setAddProjectLoading] = useState(false);
  const [addProjectError, setAddProjectError] = useState("");

  /** Read-only Projects tab: fetched only when tab is active (not clock onboarding lists). */
  const [projectsScreenRows, setProjectsScreenRows] = useState([]);
  const [projectsScreenLoading, setProjectsScreenLoading] = useState(false);
  const [projectsScreenError, setProjectsScreenError] = useState("");
  const [companyProjectsRefreshKey, setCompanyProjectsRefreshKey] = useState(0);
  /** Active project_ids from project_assignments for the signed-in employee (Clock filter only). */
  const [employeeClockAssignedProjectIds, setEmployeeClockAssignedProjectIds] = useState([]);
  /** Employee Clock only: project_id -> assigned active cost centre names (from project_cost_centre_assignments). */
  const [employeeClockAssignedCostNamesByProjectId, setEmployeeClockAssignedCostNamesByProjectId] = useState({});

  const [projectsAddFormOpen, setProjectsAddFormOpen] = useState(false);
  const [projectsAddName, setProjectsAddName] = useState("");
  const [projectsAddCostCentres, setProjectsAddCostCentres] = useState("");
  const [projectsAddSaving, setProjectsAddSaving] = useState(false);
  const [projectsAddError, setProjectsAddError] = useState("");
  const [projectsAddSuccess, setProjectsAddSuccess] = useState("");

  const [projectsListFilter, setProjectsListFilter] = useState("active"); // active | archived | all
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [projectEditDraft, setProjectEditDraft] = useState(null);
  const [projectEditSaving, setProjectEditSaving] = useState(false);
  const [projectEditError, setProjectEditError] = useState("");
  const [projectsEditSuccess, setProjectsEditSuccess] = useState("");

  const [assignmentsManageProjectId, setAssignmentsManageProjectId] = useState(null);
  const [assignmentsEditorLoading, setAssignmentsEditorLoading] = useState(false);
  const [assignmentsEditorMembers, setAssignmentsEditorMembers] = useState([]);
  const [assignmentsEditorChecks, setAssignmentsEditorChecks] = useState({});
  /** Active cost centres for the assignment editor project (id + name). */
  const [assignmentsEditorCostCentres, setAssignmentsEditorCostCentres] = useState([]);
  /** `${userId}::${costCentreId}` -> checked */
  const [assignmentsEditorCcChecks, setAssignmentsEditorCcChecks] = useState({});
  const [assignmentsEditorCcInitial, setAssignmentsEditorCcInitial] = useState({});
  /** `${userId}::${costCentreId}` -> existing assignment row id (if any). */
  const [assignmentsEditorPccaByKey, setAssignmentsEditorPccaByKey] = useState({});
  const [assignmentsEditorSaving, setAssignmentsEditorSaving] = useState(false);
  const [assignmentsEditorError, setAssignmentsEditorError] = useState("");
  const [assignmentsSuccess, setAssignmentsSuccess] = useState("");

  const pccaKey = (uid, ccid) => `${String(uid)}::${String(ccid)}`;

  const displayedProjectsScreenRows = useMemo(() => {
    const rows = projectsScreenRows || [];
    const norm = (s) => String(s ?? "").trim().toLowerCase();
    if (projectsListFilter === "all") return rows;
    if (projectsListFilter === "archived") return rows.filter((p) => norm(p.status) === "archived");
    return rows.filter((p) => norm(p.status) !== "archived");
  }, [projectsScreenRows, projectsListFilter]);

  const fallbackProjects = useMemo(() => adminProjects.map((p) => ({ id: p.id, name: p.name })), []);
  const effectiveProjects = useMemo(() => {
    if (useProjectFallback) return fallbackProjects;
    return companyProjects;
  }, [useProjectFallback, fallbackProjects, companyProjects]);

  const effectiveCostCentresByProjectId = useMemo(() => {
    if (useProjectFallback) {
      return adminProjects.reduce((acc, p) => {
        acc[p.id] = p.costCenters || [];
        return acc;
      }, {});
    }
    return costCentresByProjectId;
  }, [useProjectFallback, costCentresByProjectId]);

  /** Clock tab Start Shift / Change Task: admins see all active cost centres; employees see assigned centres only. */
  const clockCostCentreOptionsForProject = useCallback(
    (pid) => {
      const all =
        effectiveCostCentresByProjectId[String(pid)] ||
        effectiveCostCentresByProjectId[Number(pid)] ||
        [];
      if (isAdmin) return all;
      const assigned =
        employeeClockAssignedCostNamesByProjectId[String(pid)] ||
        employeeClockAssignedCostNamesByProjectId[Number(pid)] ||
        [];
      const allSet = new Set(all);
      return assigned.filter((n) => allSet.has(n)).sort((a, b) => a.localeCompare(b));
    },
    [isAdmin, effectiveCostCentresByProjectId, employeeClockAssignedCostNamesByProjectId]
  );

  /** Clock tab only: employees see assigned active projects; admins see all active company projects. */
  const clockSelectableProjects = useMemo(() => {
    if (useProjectFallback) {
      if (isAdmin) return effectiveProjects;
      return [];
    }
    if (isAdmin) return companyProjects;
    const ids = new Set((employeeClockAssignedProjectIds || []).map((id) => String(id)));
    return companyProjects.filter((p) => ids.has(String(p.id)));
  }, [useProjectFallback, isAdmin, effectiveProjects, companyProjects, employeeClockAssignedProjectIds]);

  const clockSelectedProject = useMemo(() => {
    const list = clockSelectableProjects;
    if (!list || list.length === 0) return null;
    const found = list.find((p) => String(p.id) === String(projectId));
    return found || list[0];
  }, [clockSelectableProjects, projectId]);

  const clockCostCentresActive = useMemo(
    () =>
      clockSelectedProject?.id != null ? clockCostCentreOptionsForProject(clockSelectedProject.id) : [],
    [clockSelectedProject?.id, clockCostCentreOptionsForProject]
  );

  const dashboardRowsForAttendance = useMemo(() => {
    const rows = Array.isArray(dashboardRows) ? dashboardRows : [];
    return rows.filter((r) => r?.employmentStatus !== "archived");
  }, [dashboardRows]);

  const dashboardLiveLocationByUserId = useMemo(() => {
    const m = {};
    for (const loc of dashboardLiveLocations || []) {
      if (loc?.employee_id == null) continue;
      m[String(loc.employee_id)] = loc;
    }
    return m;
  }, [dashboardLiveLocations]);

  /** Clocked-in employees today for live strip (defensive arrays). */
  const dashboardLiveWorkingCards = useMemo(() => {
    if (!isAdmin) return [];
    const attendance = Array.isArray(dashboardRowsForAttendance) ? dashboardRowsForAttendance : [];
    const sheets = Array.isArray(dashboardTodaySheets) ? dashboardTodaySheets : [];
    const byUid = {};
    for (const ts of sheets) {
      const uid = ts?.userId ?? ts?.employeeId;
      if (uid == null) continue;
      const k = String(uid);
      if (!byUid[k]) byUid[k] = [];
      byUid[k].push(ts);
    }
    const cards = [];
    for (const row of attendance) {
      if (row == null || row.userId == null) continue;
      const uid = String(row.userId);
      const rep = pickLatestActiveTimesheetForLiveDashboard(byUid[uid]);
      if (!rep) continue;
      const displayName =
        (row.displayName && String(row.displayName).trim()) || shortUserLabel(row.userId);
      cards.push({ row, rep, uid, displayName });
    }
    cards.sort((a, b) =>
      String(a.displayName || "").localeCompare(String(b.displayName || ""), undefined, { sensitivity: "base" })
    );
    return cards;
  }, [isAdmin, dashboardRowsForAttendance, dashboardTodaySheets]);

  const updateLiveLocationOnce = useCallback(
    async ({ status, projectName, costCentre, coords }) => {
      if (!authUser?.id || !userCompany?.id) return;
      if (isAdmin) return; // employee-only for now
      if (!coords) return;
      const { error } = await saveLiveLocationRowManual(supabase, {
        companyId: userCompany.id,
        employeeId: authUser.id,
        status,
        projectName,
        costCentre,
        coords,
      });
      // Must not break clock-in/out; warn only.
      if (error) console.warn("[LIVE GPS] error", error);
    },
    [authUser?.id, userCompany?.id, isAdmin]
  );

  const displayedTeamRows = useMemo(() => {
    const selfRows = teamRows.filter((r) => String(r.userId) === String(authUser?.id));
    const base = isAdmin ? teamRows : selfRows;
    if (!isAdmin) return base;
    if (teamListFilter === "all") return base;
    if (teamListFilter === "archived") return base.filter((r) => r.employmentStatus === "archived");
    return base.filter((r) => r.employmentStatus !== "archived");
  }, [isAdmin, teamRows, authUser?.id, teamListFilter]);

  useEffect(() => {
    if (activeTab !== "dashboard" || !isAdmin) return;
    setDashboardClockPick((prev) => {
      const next = { ...prev };
      const ccFor = (pid) =>
        effectiveCostCentresByProjectId[String(pid)] ||
        effectiveCostCentresByProjectId[Number(pid)] ||
        [];
      for (const r of dashboardRowsForAttendance) {
        const uid = String(r.userId);
        const assignedIds = new Set((dashboardAssignmentsByUserId[uid] || []).map((id) => String(id)));
        const options = effectiveProjects.filter((p) => assignedIds.has(String(p.id)));
        const defPid = options[0] ? String(options[0].id) : "";
        const defCc = defPid ? ccFor(defPid)[0] || "" : "";
        if (!options.length) {
          next[uid] = { projectId: "", costCenter: "" };
          continue;
        }
        const existing = next[uid];
        if (
          !existing ||
          !options.some((p) => String(p.id) === String(existing.projectId))
        ) {
          next[uid] = { projectId: defPid, costCenter: defCc };
        } else {
          const ccList = ccFor(existing.projectId);
          const cc =
            existing.costCenter && ccList.includes(existing.costCenter)
              ? existing.costCenter
              : ccList[0] || "";
          next[uid] = { projectId: String(existing.projectId), costCenter: cc };
        }
      }
      return next;
    });
  }, [
    activeTab,
    isAdmin,
    dashboardRowsForAttendance,
    effectiveProjects,
    effectiveCostCentresByProjectId,
    dashboardAssignmentsByUserId,
  ]);

  const getWorkedMinutes = (record) => {
    const total = minutesBetween(record.clockIn, record.clockOut || new Date());
    const breakTotal = record.breakStart && record.breakEnd ? minutesBetween(record.breakStart, record.breakEnd) : 0;
    return Math.max(0, total - breakTotal);
  };

  const getLabourCost = (record) => {
    if (record == null) return 0;
    const hasOut = Boolean(record.clockOut);
    const st = normalizeStatus(record.status);
    const closed = st === "submitted" || hasOut;
    if (closed && record.labour_cost != null && record.labour_cost !== "") {
      const stored = Number(record.labour_cost);
      if (Number.isFinite(stored)) return stored;
    }
    const end = hasOut ? record.clockOut : new Date();
    return computeLabourCostFromWallTimes(record.clockIn, end, Number(record.hourlyRate ?? 0));
  };

  const visibleRecords = isAdmin
    ? records
    : records.filter((record) => (record.userId || record.user_id || record.employeeId) === authUser?.id);
  const visibleCurrentShift = currentShift && (isAdmin || (currentShift.userId || currentShift.user_id || currentShift.employeeId) === authUser?.id)
    ? currentShift
    : null;

  const reportsDistinctCostCentres = useMemo(() => {
    const s = new Set();
    for (const r of reportsScreenRows) {
      s.add(reportsCostCentreKeyFromRow(r));
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [reportsScreenRows]);

  const reportsRowsFilteredForUi = useMemo(() => {
    if (reportsCostCentreAll) return reportsScreenRows;
    if (!reportsCostCentrePicked.length) return [];
    const allowed = new Set(reportsCostCentrePicked.map((x) => String(x).trim()));
    return reportsScreenRows.filter((r) => allowed.has(reportsCostCentreKeyFromRow(r)));
  }, [reportsScreenRows, reportsCostCentreAll, reportsCostCentrePicked]);

  const REPORT_DIMS = ["employee", "project", "cost_center"];

  const reportsBreakdownTree = useMemo(() => {
    if (!isAdmin || activeTab !== "reports") {
      return { level1Rows: [], d1: "project", d2: "none", d3: "none", hasL2: false, hasL3: false };
    }

    const d1 = REPORT_DIMS.includes(reportsLevel1) ? reportsLevel1 : "project";
    let d2 = reportsLevel2 === "none" || !REPORT_DIMS.includes(reportsLevel2) ? "none" : reportsLevel2;
    let d3 = reportsLevel3 === "none" || !REPORT_DIMS.includes(reportsLevel3) ? "none" : reportsLevel3;

    if (d2 === d1) d2 = "none";
    if (d3 === d1 || d3 === d2) d3 = "none";
    if (d2 === "none") d3 = "none";

    const rows = reportsRowsFilteredForUi || [];

    const getDim = (dim, rec) => {
      if (dim === "employee") {
        const uid = String(rec?.userId ?? rec?.employeeId ?? "").trim();
        const name = resolveTimesheetEmployeeTitle(rec, {
          profileFullName,
          authUser,
          teamProfileFullNameByUserId,
        });
        const label = name || "Employee";
        const key = uid ? `emp:${uid}` : `empn:${label}`;
        return { key, label };
      }
      if (dim === "project") {
        const label = (rec?.project && String(rec.project).trim()) || "Unassigned";
        return { key: `proj:${label}`, label };
      }
      if (dim === "cost_center") {
        const cc = reportsCostCentreKeyFromRow(rec);
        return { key: `cc:${cc}`, label: cc === "—" ? "(none)" : cc };
      }
      return { key: "?", label: "—" };
    };

    const l1Map = {};
    for (const r of rows) {
      const k1 = getDim(d1, r);
      const k1s = String(k1.key);
      const wm = getWorkedMinutes(r);
      const lc = getLabourCost(r);

      if (!l1Map[k1s]) {
        l1Map[k1s] = { key: k1s, label: k1.label, minutes: 0, cost: 0, children: {} };
      }
      const n1 = l1Map[k1s];
      n1.minutes += wm;
      n1.cost += lc;

      if (d2 === "none") continue;

      const k2 = getDim(d2, r);
      const k2s = String(k2.key);
      if (!n1.children[k2s]) {
        n1.children[k2s] = { key: k2s, label: k2.label, minutes: 0, cost: 0, children: {} };
      }
      const n2 = n1.children[k2s];
      n2.minutes += wm;
      n2.cost += lc;

      if (d3 === "none") continue;

      const k3 = getDim(d3, r);
      const k3s = String(k3.key);
      if (!n2.children[k3s]) {
        n2.children[k3s] = { key: k3s, label: k3.label, minutes: 0, cost: 0 };
      }
      n2.children[k3s].minutes += wm;
      n2.children[k3s].cost += lc;
    }

    const level1Rows = Object.values(l1Map)
      .map((n1) => ({
        ...n1,
        children: Object.values(n1.children)
          .map((n2) => ({
            ...n2,
            children: Object.values(n2.children).sort((a, b) => String(a.label).localeCompare(String(b.label))),
          }))
          .sort((a, b) => String(a.label).localeCompare(String(b.label))),
      }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));

    return {
      level1Rows,
      d1,
      d2,
      d3,
      hasL2: d2 !== "none",
      hasL3: d2 !== "none" && d3 !== "none",
    };
  }, [
    isAdmin,
    activeTab,
    reportsLevel1,
    reportsLevel2,
    reportsLevel3,
    reportsRowsFilteredForUi,
    getWorkedMinutes,
    getLabourCost,
    profileFullName,
    authUser,
    teamProfileFullNameByUserId,
  ]);

  useEffect(() => {
    if (!isAdmin || activeTab !== "reports") return;
    const l1 = REPORT_DIMS.includes(reportsLevel1) ? reportsLevel1 : "project";
    let l2 = reportsLevel2;
    if (l2 !== "none" && (!REPORT_DIMS.includes(l2) || l2 === l1)) l2 = "none";
    let l3 = reportsLevel3;
    if (l2 === "none") l3 = "none";
    else if (l3 !== "none" && (!REPORT_DIMS.includes(l3) || l3 === l1 || l3 === l2)) l3 = "none";
    if (l2 !== reportsLevel2) setReportsLevel2(l2);
    if (l3 !== reportsLevel3) setReportsLevel3(l3);
  }, [isAdmin, activeTab, reportsLevel1, reportsLevel2, reportsLevel3]);

  const reportsAggregates = useMemo(() => {
    if (!isAdmin || activeTab !== "reports") {
      return {
        totalMinutes: 0,
        totalCost: 0,
        missingOut: 0,
        byEmployee: [],
        byProject: [],
      };
    }
    const rows = reportsRowsFilteredForUi;
    let totalMinutes = 0;
    let totalCost = 0;
    let missingOut = 0;
    const empMap = {};
    const projMap = {};
    for (const r of rows) {
      const wm = getWorkedMinutes(r);
      const lc = getLabourCost(r);
      totalMinutes += wm;
      totalCost += lc;
      if (!r.clockOut) missingOut += 1;
      const uid = String(r.userId ?? r.employeeId ?? "");
      const name = resolveTimesheetEmployeeTitle(r, {
        profileFullName,
        authUser,
        teamProfileFullNameByUserId,
      });
      if (!empMap[uid]) {
        empMap[uid] = { key: uid, name, minutes: 0, cost: 0 };
      }
      empMap[uid].minutes += wm;
      empMap[uid].cost += lc;
      const pLabel = (r.project && String(r.project).trim()) || "Unassigned";
      const pid = r.projectId != null ? String(r.projectId) : "";
      const pkey = pid ? `id:${pid}` : `n:${pLabel}`;
      if (!projMap[pkey]) {
        projMap[pkey] = { key: pkey, project: pLabel, minutes: 0, cost: 0 };
      }
      projMap[pkey].minutes += wm;
      projMap[pkey].cost += lc;
    }
    const byEmployee = Object.values(empMap).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const byProject = Object.values(projMap).sort((a, b) => String(a.project).localeCompare(String(b.project)));
    return {
      totalMinutes,
      totalCost,
      missingOut,
      byEmployee,
      byProject,
    };
  }, [
    isAdmin,
    activeTab,
    reportsRowsFilteredForUi,
    getWorkedMinutes,
    getLabourCost,
    profileFullName,
    authUser,
    teamProfileFullNameByUserId,
    now,
  ]);

  const dashboardSummary = useMemo(() => {
    if (!isAdmin || !dashboardViewDate) {
      return { clockedIn: 0, totalMinutes: 0, totalCost: 0, missingOut: 0 };
    }
    const ctx = {
      selectedDateKey: dashboardViewDate,
      companyTimeZone,
      now,
      authUser,
      visibleCurrentShift,
    };
    let clockedIn = 0;
    let totalMinutes = 0;
    let totalCost = 0;
    let missingOut = 0;
    for (const row of dashboardRowsForAttendance) {
      const userDayRows = dashboardDaySheets.filter((t) => String(t.userId) === String(row.userId));
      const rep = pickRepresentativeTeamDayTimesheet(userDayRows);
      const att = teamAttendanceStatusForRecord(rep, ctx);
      if (att.code === "clocked_in") clockedIn += 1;
      if (att.code === "missing_out") missingOut += 1;
      for (const ts of userDayRows) {
        totalMinutes += getWorkedMinutes(ts);
        totalCost += getLabourCost(ts);
      }
    }
    return { clockedIn, totalMinutes, totalCost, missingOut };
  }, [isAdmin, dashboardViewDate, dashboardRowsForAttendance, dashboardDaySheets, companyTimeZone, now, authUser, visibleCurrentShift]);

  useEffect(() => {
    if (!isAdmin || activeTab !== "dashboard") return;
    console.log("[LABOUR] dashboard totals", {
      labourCostSum: dashboardSummary.totalCost,
      minutesSum: dashboardSummary.totalMinutes,
      date: dashboardViewDate,
    });
  }, [isAdmin, activeTab, dashboardSummary.totalCost, dashboardSummary.totalMinutes, dashboardViewDate]);

  const activeShiftTitle = useMemo(
    () =>
      visibleCurrentShift
        ? resolveTimesheetEmployeeTitle(visibleCurrentShift, {
            profileFullName,
            authUser,
            teamProfileFullNameByUserId,
          })
        : "",
    [visibleCurrentShift, profileFullName, authUser, teamProfileFullNameByUserId]
  );

  const activeShiftEmailSecondary = useMemo(() => {
    if (!visibleCurrentShift) return null;
    const t = resolveTimesheetEmployeeTitle(visibleCurrentShift, {
      profileFullName,
      authUser,
      teamProfileFullNameByUserId,
    });
    return resolveTimesheetEmployeeSecondary(visibleCurrentShift, t);
  }, [visibleCurrentShift, profileFullName, authUser, teamProfileFullNameByUserId]);

  const pollInAppNotifications = useCallback(async () => {
    if (!authUser?.id || !userCompany?.id) return;
    try {
      const uid = authUser.id;
      const [listRes, countRes] = await Promise.all([
        supabase
          .from("notifications")
          .select("*")
          .eq("recipient_user_id", uid)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("notifications")
          .select("*", { count: "exact", head: true })
          .eq("recipient_user_id", uid)
          .is("read_at", null),
      ]);
      if (listRes.error) throw listRes.error;
      const rows = listRes.data || [];
      setInAppNotifications(rows);
      if (!countRes.error) setInAppNotifUnread(countRes.count ?? 0);
      setInAppNotifError("");

      if (isAdmin) {
        const unreadIds = new Set(
          rows.filter((n) => n.read_at == null && n.is_read !== true).map((n) => String(n.id))
        );
        if (!notifPollBootstrappedRef.current) {
          notifPollBootstrappedRef.current = true;
          notifLastUnreadIdsRef.current = unreadIds;
        } else {
          const previous = notifLastUnreadIdsRef.current;
          const newUnreadIds = [...unreadIds].filter((id) => !previous.has(id));
          for (const id of newUnreadIds) {
            const row = rows.find((r) => String(r.id) === id);
            if (row) tryShowClockBrowserNotification(row, systemNotifShownIdsRef);
          }
          const firstToastRow = newUnreadIds
            .map((id) => rows.find((r) => String(r.id) === id))
            .find(Boolean);
          if (firstToastRow) {
            setLiveToast({
              id: firstToastRow.id,
              title: firstToastRow.title,
              message: firstToastRow.message,
            });
          }
          notifLastUnreadIdsRef.current = unreadIds;
        }
      }
    } catch (e) {
      console.warn("[NOTIFY] poll failed", e);
      setInAppNotifError(getErrorMessage(e));
    }
  }, [authUser?.id, userCompany?.id, isAdmin]);

  useEffect(() => {
    if (!authUser?.id || !userCompany?.id) {
      setInAppNotifUnread(0);
      setInAppNotifications([]);
      setLiveToast(null);
      notifPollBootstrappedRef.current = false;
      notifLastUnreadIdsRef.current = new Set();
      systemNotifShownIdsRef.current = new Set();
      return;
    }
    void pollInAppNotifications();
    const interval = setInterval(() => void pollInAppNotifications(), 15000);
    return () => clearInterval(interval);
  }, [authUser?.id, userCompany?.id, pollInAppNotifications]);

  useEffect(() => {
    if (!isAdmin && activeTab === "notifications") setActiveTab("clock");
  }, [isAdmin, activeTab]);

  useEffect(() => {
    if (!isAdmin && activeTab === "dashboard") setActiveTab("clock");
  }, [isAdmin, activeTab]);

  useEffect(() => {
    if (!isAdmin && activeTab === "projects") setActiveTab("clock");
  }, [isAdmin, activeTab]);

  useEffect(() => {
    if (isEmployeeRole && activeTab === "team") setActiveTab("clock");
  }, [isEmployeeRole, activeTab]);

  useEffect(() => {
    notifPollBootstrappedRef.current = false;
    notifLastUnreadIdsRef.current = new Set();
    systemNotifShownIdsRef.current = new Set();
  }, [authUser?.id, userCompany?.id]);

  useEffect(() => {
    if (!isAdmin) {
      setMobileNotifPermissionUi("unknown");
      return;
    }
    if (typeof window === "undefined" || !("Notification" in window)) {
      setMobileNotifPermissionUi("not_supported");
      return;
    }
    const p = Notification.permission;
    if (p === "granted") setMobileNotifPermissionUi("enabled");
    else if (p === "denied") setMobileNotifPermissionUi("blocked");
    else setMobileNotifPermissionUi("default");
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setBackgroundPushUi("unknown");
      setBackgroundPushError("");
      setBackgroundPushSaveMessage("");
      return;
    }
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setBackgroundPushUi("not_supported");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (cancelled) return;
        const sub = await reg.pushManager.getSubscription();
        if (Notification.permission === "denied") setBackgroundPushUi("blocked");
        else if (sub && Notification.permission === "granted") setBackgroundPushUi("enabled");
        else setBackgroundPushUi("default");
      } catch {
        if (!cancelled) setBackgroundPushUi("unknown");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const schedulePhotoNotificationAfterUpload = useCallback(() => {
    const uid = authUser?.id;
    const cid = userCompany?.id;
    const vs = visibleCurrentShift;
    if (!uid || !cid || !vs) return;
    const actorName = (profileFullName || "").trim() || authUser?.email || "Someone";
    const batchKey = `${cid}|${uid}|${String(vs.projectId ?? "")}|${vs.project}|${vs.costCenter}`;
    const payload = {
      companyId: cid,
      actorUserId: uid,
      actorRole: resolvedCompanyRole,
      actorName,
      projectId: vs.projectId,
      projectName: vs.project,
      costCentre: vs.costCenter,
      relatedTimesheetId: vs.supabaseTimesheetId ?? null,
      relatedFolder: vs.projectFolder || getProjectFolderName(vs.project),
    };
    const r = photoNotifyBatchRef.current;
    if (r.timer && r.key && r.key !== batchKey && r.count > 0 && r.payload) {
      clearTimeout(r.timer);
      r.timer = null;
      const prevC = r.count;
      const prevP = r.payload;
      r.count = 0;
      r.payload = null;
      r.key = "";
      void sendPhotoBatchNotifications(supabase, prevP, prevC);
    }
    if (r.key !== batchKey) {
      r.key = batchKey;
      r.count = 0;
    }
    r.payload = payload;
    r.count += 1;
    if (r.timer) clearTimeout(r.timer);
    r.timer = setTimeout(() => {
      const c = r.count;
      const p = r.payload;
      r.count = 0;
      r.payload = null;
      r.key = "";
      r.timer = null;
      if (p && c > 0) void sendPhotoBatchNotifications(supabase, p, c);
    }, 45000);
  }, [authUser, userCompany, resolvedCompanyRole, visibleCurrentShift, profileFullName]);

  const canEditTimesheetRecord = (record) => {
    const st = normalizeStatus(record.status);
    const isLiveOpen = isTimesheetLiveOpenRow(record, visibleCurrentShift, now, companyTimeZone);
    if (isLiveOpen && st === "active" && !record.clockOut) return false;
    if (isAdmin) return true;
    const uid = record.userId || record.employeeId;
    if (String(uid) !== String(authUser?.id)) return false;
    if (st === "submitted") return true;
    if (st === "active") return !isLiveOpen || Boolean(record.clockOut);
    return false;
  };

  const filterRecordsByRange = () => {
    const nowDate = new Date();
    return records.filter((record) => {
      const date = new Date(record.clockIn);
      if (reportRange === "today") return date.toDateString() === nowDate.toDateString();
      if (reportRange === "weekly") {
        const weekAgo = new Date();
        weekAgo.setDate(nowDate.getDate() - 7);
        return date >= weekAgo;
      }
      if (reportRange === "monthly") return date.getMonth() === nowDate.getMonth() && date.getFullYear() === nowDate.getFullYear();
      if (reportRange === "yearly") return date.getFullYear() === nowDate.getFullYear();
      if (reportRange === "custom" && customFrom && customTo) return date >= new Date(customFrom) && date <= new Date(customTo);
      return true;
    });
  };

  const filteredRecords = filterRecordsByRange();

  const reportScopedRecords = filteredRecords.filter((record) => {
    if (reportType === "employee" && reportEmployeeId !== "all") return record.employeeId === Number(reportEmployeeId);
    if (reportType === "project" && reportProjectId !== "all") {
      const selectedReportProject = adminProjects.find((project) => project.id === reportProjectId);
      return selectedReportProject ? record.project === selectedReportProject.name : true;
    }
    return true;
  });

  const reportTotalMinutes = reportScopedRecords.reduce((total, record) => total + getWorkedMinutes(record), 0);
  const reportTotalCost = reportScopedRecords.reduce((total, record) => total + getLabourCost(record), 0);

  const employeeReportRows = reportScopedRecords.map((record) => ({
    id: record.id,
    date: formatDateParts(record.clockIn, companyTimeZone),
    employee: resolveTimesheetEmployeeTitle(record, {
      profileFullName,
      authUser,
      teamProfileFullNameByUserId,
    }),
    project: record.project,
    costCenter: record.costCenter,
    cost: getLabourCost(record),
  }));

  const projectReportRows = Object.values(
    reportScopedRecords.reduce((acc, record) => {
      const key = `${record.project}-${record.costCenter}`;
      if (!acc[key]) {
        acc[key] = {
          key,
          date: formatDateParts(record.clockIn, companyTimeZone),
          project: record.project,
          costCenter: record.costCenter,
          minutes: 0,
          cost: 0,
        };
      }
      acc[key].minutes += getWorkedMinutes(record);
      acc[key].cost += getLabourCost(record);
      return acc;
    }, {})
  );

  const photoFolders = Object.keys(scopedProjectPhotos);
  const visiblePhotoFolders = selectedPhotoFolder === "all" ? photoFolders : photoFolders.filter((folder) => folder === selectedPhotoFolder);
  const receiptFolders = Object.keys(scopedProjectReceipts);
  const visibleReceiptFolders = selectedReceiptFolder === "all" ? receiptFolders : receiptFolders.filter((folder) => folder === selectedReceiptFolder);
  const receiptTotal = visibleReceiptFolders.reduce((total, folder) => {
    return total + (scopedProjectReceipts[folder] || []).reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0);
  }, 0);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    authUserRef.current = authUser;
  }, [authUser]);

  useEffect(() => {
    userCompanyRef.current = userCompany;
  }, [userCompany]);

  useEffect(() => {
    companyCheckedRef.current = companyChecked;
  }, [companyChecked]);

  useEffect(() => {
    const companyId = userCompany?.id || null;
    if (!companyId || !authUser) return;

    let cancelled = false;

    const loadProjects = async () => {
      setProjectsLoading(true);
      setProjectsError("");
      setUseProjectFallback(false);
      try {
        const { data: projects, error: projectsErr } = await supabase
          .from("projects")
          .select("id, name")
          .eq("company_id", companyId)
          .eq("status", "active")
          .order("name", { ascending: true });

        if (projectsErr) throw projectsErr;

        const projectList = Array.isArray(projects) ? projects : [];
        if (cancelled) return;
        setCompanyProjects(projectList);

        if (projectList.length === 0) {
          setCostCentresByProjectId({});
          return;
        }

        const projectIds = projectList.map((p) => p.id);
        const { data: centres, error: centresErr } = await supabase
          .from("cost_centres")
          .select("id, name, project_id")
          .in("project_id", projectIds)
          .eq("status", "active")
          .order("name", { ascending: true });

        if (centresErr) throw centresErr;

        const map = (Array.isArray(centres) ? centres : []).reduce((acc, c) => {
          const pid = c.project_id;
          if (!acc[pid]) acc[pid] = [];
          acc[pid].push(c.name);
          return acc;
        }, {});

        if (cancelled) return;
        setCostCentresByProjectId(map);
      } catch (err) {
        console.log("Project load failed, using fallback:", err);
        if (cancelled) return;
        setProjectsError(getErrorMessage(err));
        setUseProjectFallback(true);
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    };

    loadProjects();

    return () => {
      cancelled = true;
    };
  }, [userCompany?.id, authUser?.id, companyProjectsRefreshKey]);

  useEffect(() => {
    if (!userCompany?.id || !authUser?.id || isAdmin) {
      setEmployeeClockAssignedProjectIds([]);
      setEmployeeClockAssignedCostNamesByProjectId({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("project_assignments")
        .select("project_id")
        .eq("company_id", userCompany.id)
        .eq("user_id", authUser.id)
        .eq("status", "active");
      if (cancelled) return;
      if (error) {
        setEmployeeClockAssignedProjectIds([]);
        setEmployeeClockAssignedCostNamesByProjectId({});
        return;
      }
      setEmployeeClockAssignedProjectIds((data || []).map((r) => r.project_id).filter(Boolean));

      const { data: pccaRows, error: pccaErr } = await supabase
        .from("project_cost_centre_assignments")
        .select("project_id, cost_centre_id")
        .eq("company_id", userCompany.id)
        .eq("user_id", authUser.id)
        .eq("status", "active");
      if (cancelled) return;
      if (pccaErr) {
        setEmployeeClockAssignedCostNamesByProjectId({});
        return;
      }
      const rows = Array.isArray(pccaRows) ? pccaRows : [];
      if (rows.length === 0) {
        setEmployeeClockAssignedCostNamesByProjectId({});
        return;
      }
      const ccIds = [...new Set(rows.map((r) => r.cost_centre_id).filter(Boolean))];
      const { data: ccRows, error: ccErr } = await supabase
        .from("cost_centres")
        .select("id, name, project_id, status")
        .in("id", ccIds);
      if (cancelled) return;
      if (ccErr) {
        setEmployeeClockAssignedCostNamesByProjectId({});
        return;
      }
      const ccById = Object.fromEntries((ccRows || []).map((c) => [String(c.id), c]));
      const byProject = {};
      for (const r of rows) {
        const cc = ccById[String(r.cost_centre_id)];
        if (!cc) continue;
        if (String(cc.status ?? "").toLowerCase() !== "active") continue;
        if (String(cc.project_id) !== String(r.project_id)) continue;
        const pk = String(r.project_id);
        if (!byProject[pk]) byProject[pk] = [];
        byProject[pk].push(cc.name);
      }
      for (const k of Object.keys(byProject)) {
        byProject[k] = [...new Set(byProject[k])].sort((a, b) => a.localeCompare(b));
      }
      setEmployeeClockAssignedCostNamesByProjectId(byProject);
    })();
    return () => {
      cancelled = true;
    };
  }, [userCompany?.id, authUser?.id, isAdmin, companyProjectsRefreshKey, projectsScreenRefreshKey]);

  useEffect(() => {
    if (activeTab !== "projects" || !isAdmin || !userCompany?.id) return;

    let cancelled = false;

    (async () => {
      setProjectsScreenLoading(true);
      setProjectsScreenError("");
      try {
        const { data: projects, error: projectsErr } = await supabase
          .from("projects")
          .select("id, name, status")
          .eq("company_id", userCompany.id)
          .order("name", { ascending: true });

        if (projectsErr) throw projectsErr;

        const projectList = Array.isArray(projects) ? projects : [];
        if (projectList.length === 0) {
          if (!cancelled) setProjectsScreenRows([]);
          return;
        }

        const projectIds = projectList.map((p) => p.id);
        const { data: centres, error: centresErr } = await supabase
          .from("cost_centres")
          .select("id, name, project_id, status")
          .in("project_id", projectIds)
          .order("name", { ascending: true });

        if (centresErr) throw centresErr;

        const byProjectId = {};
        for (const c of Array.isArray(centres) ? centres : []) {
          const pid = String(c.project_id);
          if (!byProjectId[pid]) byProjectId[pid] = [];
          byProjectId[pid].push({
            id: c.id,
            name: c.name,
            status: c.status,
          });
        }

        const { data: pas, error: pasErr } = await supabase
          .from("project_assignments")
          .select("id, project_id, user_id, status")
          .eq("company_id", userCompany.id)
          .in("project_id", projectIds);

        if (pasErr) throw pasErr;

        const assignList = Array.isArray(pas) ? pas : [];
        const activeAssignUserIds = [
          ...new Set(
            assignList
              .filter((a) => String(a.status ?? "").toLowerCase() === "active")
              .map((a) => a.user_id)
              .filter(Boolean)
          ),
        ];

        const assignProfileMap = {};
        if (activeAssignUserIds.length > 0) {
          const { data: profAssign, error: profAssignErr } = await supabase
            .from("profiles")
            .select("id, full_name, email")
            .in("id", activeAssignUserIds);
          if (profAssignErr) throw profAssignErr;
          (profAssign || []).forEach((p) => {
            assignProfileMap[p.id] = p;
          });
        }

        const { data: pccaRows, error: pccaErr } = await supabase
          .from("project_cost_centre_assignments")
          .select("project_id, user_id, cost_centre_id, status")
          .eq("company_id", userCompany.id)
          .in("project_id", projectIds);
        if (pccaErr) throw pccaErr;
        const pccaListAll = Array.isArray(pccaRows) ? pccaRows : [];

        const ccNameById = {};
        for (const c of Array.isArray(centres) ? centres : []) {
          ccNameById[String(c.id)] = c.name;
        }

        const assignedSummariesForProject = (pid) => {
          const act = assignList.filter(
            (a) =>
              String(a.project_id) === String(pid) && String(a.status ?? "").toLowerCase() === "active"
          );
          const rowsOut = act.map((a) => {
            const p = assignProfileMap[a.user_id];
            const full = p?.full_name && String(p.full_name).trim();
            const em = p?.email && String(p.email).trim();
            const displayName = full || em || shortUserLabel(a.user_id);
            const labels = pccaListAll
              .filter(
                (r) =>
                  String(r.project_id) === String(pid) &&
                  String(r.user_id) === String(a.user_id) &&
                  String(r.status ?? "").toLowerCase() === "active"
              )
              .map((r) => ccNameById[String(r.cost_centre_id)])
              .filter(Boolean)
              .sort((x, y) => x.localeCompare(y));
            return { displayName, costCentreLabels: labels };
          });
          rowsOut.sort((a, b) => a.displayName.localeCompare(b.displayName));
          return rowsOut;
        };

        const rows = projectList.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          costCentres: byProjectId[String(p.id)] || [],
          assignedSummaries: assignedSummariesForProject(p.id),
        }));

        if (!cancelled) setProjectsScreenRows(rows);
      } catch (err) {
        if (!cancelled) {
          setProjectsScreenError(getErrorMessage(err));
          setProjectsScreenRows([]);
        }
      } finally {
        if (!cancelled) setProjectsScreenLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, isAdmin, userCompany?.id, projectsScreenRefreshKey]);

  useEffect(() => {
    // When projects load/switch, ensure we have a valid project + cost centre selected (Clock uses clockSelectableProjects).
    if (!clockSelectableProjects || clockSelectableProjects.length === 0) return;

    const hasProject = clockSelectableProjects.some((p) => String(p.id) === String(projectId));
    const nextProject = hasProject
      ? clockSelectableProjects.find((p) => String(p.id) === String(projectId))
      : clockSelectableProjects[0];

    if (nextProject && String(nextProject.id) !== String(projectId)) {
      setProjectId(nextProject.id);
      return;
    }

    const pid = nextProject?.id;
    const centres = clockCostCentreOptionsForProject(pid);

    if (centres.length === 0) {
      if (costCenter !== "") setCostCenter("");
      return;
    }
    if (!centres.includes(costCenter)) {
      setCostCenter(centres[0]);
    }
  }, [clockSelectableProjects, clockCostCentreOptionsForProject, projectId, costCenter]);

  useEffect(() => {
    localStorage.setItem("orp_current_shift", JSON.stringify(currentShift));
  }, [currentShift]);

  useEffect(() => {
    localStorage.setItem("orp_timesheet_records", JSON.stringify(records));
  }, [records]);

  useEffect(() => {
    localStorage.setItem("orp_project_photos", JSON.stringify(projectPhotos));
  }, [projectPhotos]);

  useEffect(() => {
    localStorage.setItem("orp_project_receipts", JSON.stringify(projectReceipts));
  }, [projectReceipts]);

  useEffect(() => {
    localStorage.setItem("orp_photo_notification_count", JSON.stringify(photoNotificationCount));
  }, [photoNotificationCount]);

  useEffect(() => {
    if (!isAdmin && activeTab === "reports") setActiveTab("clock");
  }, [isAdmin, activeTab]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    if (window.matchMedia("(display-mode: standalone)").matches) setIsInstalled(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    const ensureProfile = async (user, fullName) => {
      if (!user) return;
      const payload = { id: user.id };
      if (fullName) payload.full_name = fullName;
      if (user.email) payload.email = user.email;
      // Leave role as-is if it already exists; default to employee for new users.
      payload.role = "employee";
      const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
      if (error) throw error;
    };

    const loadCompanyForUser = async (user, { background = false } = {}) => {
      if (!user) {
        if (!background) {
          setUserCompany(null);
          setUserCompanyRole(null);
          setCompanyChecked(true);
        }
        return;
      }

      if (!background) setCompanyChecked(false);
      try {
        const { data: member, error: memberError } = await withTimeout(
          supabase
            .from("company_members")
            .select("company_id, role")
            .eq("user_id", user.id)
            .limit(1)
            .maybeSingle(),
          12000,
          "Company lookup timed out"
        );

        if (memberError) throw memberError;

        if (!member?.company_id) {
          if (!background) {
            setUserCompany(null);
            setUserCompanyRole(null);
            setCompanyChecked(true);
          }
          return;
        }

        const { data: company, error: companyError } = await withTimeout(
          supabase
            .from("companies")
            .select("id, name, code, time_zone")
            .eq("id", member.company_id)
            .single(),
          12000,
          "Company fetch timed out"
        );

        if (companyError) throw companyError;

        setUserCompany(company || null);
        setUserCompanyRole(normalizeCompanyMemberRole(member.role));
        if (!background) setCompanyChecked(true);
      } catch (err) {
        if (background) {
          console.warn("Company load error (background):", err);
          return;
        }
        console.log("Company load error:", err);
        setStartupError(`Company load failed: ${getErrorMessage(err)}`);
        setUserCompany(null);
        setUserCompanyRole(null);
        setCompanyChecked(true);
      }
    };

    const loadRoleForUser = async (user) => {
      if (!user) {
        setAuthRole(null);
        setProfileFullName("");
        setProfileEmploymentStatus("active");
        return;
      }
      try {
        const { data: profile, error: profileError } = await withTimeout(
          supabase
            .from("profiles")
            .select("role, full_name, email, employment_status")
            .eq("id", user.id)
            .single(),
          12000,
          "Profile fetch timed out"
        );

        if (profileError) throw profileError;

        if (user.email && !(profile?.email && String(profile.email).trim())) {
          const { error: patchErr } = await supabase.from("profiles").update({ email: user.email }).eq("id", user.id);
          if (patchErr) console.warn("Profile email patch:", patchErr);
        }

        setAuthRole(profile?.role || "employee");
        setProfileFullName(profile?.full_name || "");
        setProfileEmploymentStatus(normalizeEmploymentStatus(profile?.employment_status));
      } catch (err) {
        console.log("Profile load error:", err);
        setStartupError(`Profile load failed: ${getErrorMessage(err)}`);
        setAuthRole("employee");
        setProfileFullName("");
        setProfileEmploymentStatus("active");
      }
    };

    const loadUserContext = async (user, options) => {
      await loadRoleForUser(user);
      await loadCompanyForUser(user, options);
    };

    const loadSession = async () => {
      setInitialLoading(true);
      setStartupError("");
      console.log("Checking session...");

      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.log("Session error:", error);
        }

        // If the user is already actively logging in, do not override.
        if (hasSuccessfulLoginRef.current || loginClickedRef.current) return;

        const user = data?.session?.user || null;
        console.log("User:", user);

        if (!user) {
          setAuthUser(null);
          setAuthRole(null);
          setProfileFullName("");
          setProfileEmploymentStatus("active");
          setUserCompany(null);
          setUserCompanyRole(null);
          setCompanyChecked(true);
          setAuthStep("login");
          return;
        }

        setAuthUser(user);
        await ensureProfile(user);
        await loadUserContext(user, { background: false });
        setAuthStep("login");
      } catch (err) {
        // Never block startup on session errors. Default to login.
        console.log("Session check failed:", err);
        if (!hasSuccessfulLoginRef.current && !loginClickedRef.current) {
          setAuthUser(null);
          setAuthRole(null);
          setProfileFullName("");
          setProfileEmploymentStatus("active");
          setUserCompany(null);
          setUserCompanyRole(null);
          setCompanyChecked(true);
          setAuthStep("login");
        }
      } finally {
        setInitialLoading(false);
      }
    };
    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("AUTH EVENT", event);
      setStartupError("");

      if (event === "SIGNED_OUT") {
        console.log("AUTH EVENT signed out");
        setAuthUser(null);
        setAuthRole(null);
        setProfileFullName("");
        setProfileEmploymentStatus("active");
        setCurrentShift(null);
        setUserCompany(null);
        setUserCompanyRole(null);
        setCompanyChecked(true);
        setAuthStep("login");
        return;
      }

      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
        console.log("AUTH EVENT ignored background refresh");
        return;
      }

      const user = session?.user || null;
      if (!user) return;

      if (event === "SIGNED_IN") {
        // If we already have a user, ignore this (prevents stale closure treating refresh as first sign-in).
        if (authUserRef.current) {
          console.log("AUTH EVENT ignored background refresh");
          return;
        }

        // If handleLogin already succeeded and loaded context, ignore.
        if (hasSuccessfulLoginRef.current) {
          console.log("AUTH EVENT ignored background refresh");
          return;
        }

        console.log("AUTH EVENT first sign-in context load");
        try {
          setAuthUser(user);
          await ensureProfile(user);
          await loadUserContext(user, { background: false });
          setAuthStep("login");
        } catch (err) {
          // Inline error only; don't full-screen load.
          setStartupError(`Auth context load failed: ${getErrorMessage(err)}`);
          setCompanyChecked(true);
        }
      }
    });

    return () => {
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    console.log("LOGIN CLICKED");
    loginClickedRef.current = true;
    setLoginLoading(true);
    setLoginError("");
    setCompanyError("");
    setStartupError("");
    setLoginDebug(`Clicked. Email: ${loginEmail}`);

    try {
      console.log("LOGIN ATTEMPT", loginEmail.trim());
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });

      if (error) {
        console.error("LOGIN ERROR", error);
        setLoginError(error.message);
        setLoginDebug(`Login error: ${error.message}`);
        return;
      }

      // Requirement: treat signInWithPassword success as authoritative.
      const user = data.user;
      hasSuccessfulLoginRef.current = true;

      console.log("LOGIN SUCCESS user id", user.id);
      setLoginDebug(`Login success. User: ${user.id}`);

      setAuthUser(user);
      setCompanyChecked(false);

      // Load profile (name/role) and company membership directly (do NOT rely on getSession()).
      try {
        console.log("COMPANY CHECK START");

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role, full_name, email, employment_status")
          .eq("id", user.id)
          .single();

        if (profileError) throw profileError;

        if (user.email && !(profile?.email && String(profile.email).trim())) {
          const { error: patchErr } = await supabase.from("profiles").update({ email: user.email }).eq("id", user.id);
          if (patchErr) console.warn("Profile email patch on login:", patchErr);
        }

        setAuthRole(profile?.role || "employee");
        setProfileFullName(profile?.full_name || "");
        setProfileEmploymentStatus(normalizeEmploymentStatus(profile?.employment_status));

        const { data: member, error: memberError } = await supabase
          .from("company_members")
          .select("company_id, role")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (memberError) throw memberError;

        if (member?.company_id) {
          const { data: company, error: companyError } = await supabase
            .from("companies")
            .select("id, name, code, time_zone")
            .eq("id", member.company_id)
            .single();

          if (companyError) throw companyError;

          setUserCompany(company || null);
          setUserCompanyRole(normalizeCompanyMemberRole(member.role));
          console.log("COMPANY CHECK RESULT:", { hasCompany: true, companyId: company?.id, role: member.role });
          setAuthStep("login"); // proceed into main app
        } else {
          setUserCompany(null);
          setUserCompanyRole(null);
          console.log("COMPANY CHECK RESULT:", { hasCompany: false });
          setAuthStep("company_choice");
        }
      } catch (err) {
        console.log("COMPANY CHECK ERROR:", err);
        setCompanyError(`Company check failed: ${getErrorMessage(err)}`);
        setAuthStep("company_choice");
      } finally {
        setCompanyChecked(true);
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignup = async (event) => {
    event.preventDefault();
    setSignupLoading(true);
    setSignupError("");
    setCompanyError("");

    try {
      const email = signupEmail.trim();
      const password = signupPassword;
      const fullName = signupName.trim();

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        setSignupError(signUpError.message);
        setSignupLoading(false);
        return;
      }

      // Depending on email confirmation settings, session may or may not exist.
      let user = signUpData?.user || null;

      if (!user) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          setSignupError(signInError.message);
          setSignupLoading(false);
          return;
        }
        user = signInData?.user || null;
      }

      setAuthUser(user);

      if (user) {
        await supabase.from("profiles").upsert(
          {
            id: user.id,
            full_name: fullName || null,
            email: email || null,
            role: "employee",
          },
          { onConflict: "id" }
        );

        setAuthRole("employee");
        setUserCompany(null);
        setUserCompanyRole(null);
        setCompanyChecked(true);
        setAuthStep("company_choice");
      } else {
        setSignupError("Signup created, but no user session. Check email confirmation settings.");
      }
    } catch (err) {
      setSignupError(getErrorMessage(err));
    } finally {
      setSignupLoading(false);
    }
  };

  const generateCompanyCode = () => {
    const num = Math.floor(100000 + Math.random() * 900000);
    return `ORP-${num}`;
  };

  const handleCreateCompany = async (event) => {
    event.preventDefault();
    if (!authUser) return;

    setCompanyLoading(true);
    setCompanyError("");
    setCreatedCompanyCode("");

    try {
      // RLS requires an authenticated session (auth.uid()) and created_by matching that uid.
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const uid = userData?.user?.id || null;
      if (userError || !uid) {
        setCompanyError("You are not fully authenticated yet. Please logout and login again, then create the company.");
        setCompanyLoading(false);
        return;
      }

      const name = companyName.trim();
      if (!name) {
        setCompanyError("Company name is required.");
        setCompanyLoading(false);
        return;
      }

      let created = null;
      let lastError = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        const code = generateCompanyCode();
        const { data, error } = await supabase
          .from("companies")
          .insert([{ name, code, created_by: uid, time_zone: DEFAULT_COMPANY_TIME_ZONE }])
          .select("id, name, code, time_zone")
          .single();

        if (!error && data) {
          created = data;
          break;
        }
        lastError = error;
      }

      if (!created) {
        setCompanyError(lastError?.message || "Failed to create company.");
        setCompanyLoading(false);
        return;
      }

      const { error: memberError } = await supabase.from("company_members").insert([
        { company_id: created.id, user_id: uid, role: "owner" },
      ]);

      if (memberError) {
        setCompanyError(memberError.message);
        setCompanyLoading(false);
        return;
      }

      await supabase.from("profiles").upsert(
        { id: uid, role: "supervisor" },
        { onConflict: "id" }
      );
      setAuthRole("supervisor");

      setUserCompany(created);
      setUserCompanyRole("owner");
      setCreatedCompanyCode(created.code);
      setAuthStep("company_created");
    } catch (err) {
      setCompanyError(getErrorMessage(err));
    } finally {
      setCompanyLoading(false);
    }
  };

  const handleJoinCompany = async (event) => {
    event.preventDefault();
    if (!authUser) return;

    setCompanyLoading(true);
    setCompanyError("");

    try {
      const code = joinCompanyCode.trim().toUpperCase();
      if (!code) {
        setCompanyError("Company code is required.");
        setCompanyLoading(false);
        return;
      }

      const { data: company, error: companyError } = await supabase
        .from("companies")
        .select("id, name, code, time_zone")
        .eq("code", code)
        .single();

      if (companyError) {
        setCompanyError(companyError.message);
        setCompanyLoading(false);
        return;
      }

      const { error: memberError } = await supabase.from("company_members").insert([
        { company_id: company.id, user_id: authUser.id, role: "employee" },
      ]);

      if (memberError) {
        setCompanyError(memberError.message);
        setCompanyLoading(false);
        return;
      }

      await supabase.from("profiles").upsert(
        {
          id: authUser.id,
          email: authUser.email || null,
          full_name: (profileFullName || "").trim() || null,
          role: "employee",
        },
        { onConflict: "id" }
      );
      setAuthRole("employee");

      setUserCompany(company);
      setUserCompanyRole("employee");
      setCompanyChecked(true);
      setAuthStep("login");
    } catch (err) {
      setCompanyError(getErrorMessage(err));
    } finally {
      setCompanyLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAuthUser(null);
    setAuthRole(null);
    setProfileEmploymentStatus("active");
    setCurrentShift(null);
    setIsMenuOpen(false);
  };

  const liveSeconds = useMemo(() => {
    if (!visibleCurrentShift) return 0;
    const totalSeconds = Math.max(0, Math.floor((now - new Date(visibleCurrentShift.clockIn)) / 1000));
    const activeBreakSeconds = visibleCurrentShift.breakStart && !visibleCurrentShift.breakEnd
      ? Math.max(0, Math.floor((now - new Date(visibleCurrentShift.breakStart)) / 1000))
      : 0;
    return Math.max(0, totalSeconds - activeBreakSeconds);
  }, [visibleCurrentShift, now]);

  const liveEarnings = visibleCurrentShift ? (liveSeconds / 3600) * Number(visibleCurrentShift.hourlyRate || 0) : 0;

  const handleProjectChange = (newProjectId) => {
    const nextProject =
      clockSelectableProjects.find((project) => String(project.id) === String(newProjectId)) ||
      clockSelectableProjects[0];
    if (!nextProject) return;
    setProjectId(nextProject.id);
    const centres = clockCostCentreOptionsForProject(nextProject.id);
    if (centres.length > 0) setCostCenter(centres[0]);
    else setCostCenter("");
  };

  const insertCompanyProjectWithCentres = async ({ companyId, userId, projectName, costCentresCsv }) => {
    const name = String(projectName || "").trim();
    if (!name) {
      const err = new Error("Project name is required.");
      throw err;
    }
    const centres = String(costCentresCsv || "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    const projectPayload = {
      company_id: companyId,
      name,
      status: "active",
      created_by: userId,
    };

    const { data: created, error: projectErr } = await supabase
      .from("projects")
      .insert([projectPayload])
      .select("id, name")
      .single();

    if (projectErr) throw projectErr;

    if (centres.length > 0) {
      const rows = centres.map((c, index) => ({
        company_id: companyId,
        project_id: created.id,
        name: c,
        status: "active",
        display_order: index,
        created_by: userId,
      }));
      const { error: centresErr } = await supabase.from("cost_centres").insert(rows);
      if (centresErr) throw centresErr;
    }

    return created;
  };

  const handleAddProject = async (event) => {
    event.preventDefault();

    if (!authUser?.id || !userCompany?.id) {
      setAddProjectError("Company/user missing. Please logout and login again.");
      return;
    }
    if (!isAdmin) return;

    setAddProjectLoading(true);
    setAddProjectError("");
    try {
      const name = newProjectName.trim();
      if (!name) {
        setAddProjectError("Project name is required.");
        return;
      }

      await insertCompanyProjectWithCentres({
        companyId: userCompany.id,
        userId: authUser.id,
        projectName: name,
        costCentresCsv: newProjectCostCentres,
      });

      setNewProjectName("");
      setNewProjectCostCentres("");
      setCompanyProjectsRefreshKey((k) => k + 1);
    } catch (err) {
      setAddProjectError(getErrorMessage(err));
    } finally {
      setAddProjectLoading(false);
    }
  };

  const cancelProjectsAddForm = () => {
    setProjectsAddFormOpen(false);
    setProjectsAddName("");
    setProjectsAddCostCentres("");
    setProjectsAddError("");
    setProjectsAddSuccess("");
  };

  const handleProjectsScreenSaveNewProject = async (event) => {
    event.preventDefault();
    if (!authUser?.id || !userCompany?.id) {
      setProjectsAddError("Company/user missing. Please logout and login again.");
      return;
    }
    if (!isAdmin) return;

    setProjectsAddSaving(true);
    setProjectsAddError("");
    setProjectsAddSuccess("");
    setAssignmentsSuccess("");
    try {
      const name = projectsAddName.trim();
      if (!name) {
        setProjectsAddError("Project name is required.");
        return;
      }

      await insertCompanyProjectWithCentres({
        companyId: userCompany.id,
        userId: authUser.id,
        projectName: name,
        costCentresCsv: projectsAddCostCentres,
      });

      setCompanyProjectsRefreshKey((k) => k + 1);
      setProjectsScreenRefreshKey((k) => k + 1);
      setProjectsAddName("");
      setProjectsAddCostCentres("");
      setProjectsAddFormOpen(false);
      setProjectsAddError("");
      setProjectsEditSuccess("");
      setProjectsAddSuccess("Project added.");
    } catch (err) {
      setProjectsAddError(getErrorMessage(err));
    } finally {
      setProjectsAddSaving(false);
    }
  };

  const beginProjectEdit = (row) => {
    setProjectsAddSuccess("");
    setProjectsEditSuccess("");
    setAssignmentsSuccess("");
    setProjectEditError("");
    setProjectsAddFormOpen(false);
    setAssignmentsManageProjectId(null);
    setAssignmentsEditorMembers([]);
    setAssignmentsEditorChecks({});
    setAssignmentsEditorError("");
    setEditingProjectId(row.id);
    const normSt = (s) => (String(s ?? "").trim().toLowerCase() === "archived" ? "archived" : "active");
    setProjectEditDraft({
      name: row.name || "",
      status: normSt(row.status),
      lines: (row.costCentres || []).map((cc) => ({
        key: `db-${cc.id}`,
        dbId: cc.id,
        name: cc.name || "",
        status: normSt(cc.status),
        isNew: false,
      })),
      initialCcIds: (row.costCentres || []).map((cc) => cc.id).filter((id) => id != null),
    });
  };

  const cancelProjectEdit = () => {
    setEditingProjectId(null);
    setProjectEditDraft(null);
    setProjectEditError("");
    setProjectEditSaving(false);
  };

  const handleProjectsScreenSaveEdit = async () => {
    if (!editingProjectId || !projectEditDraft || !authUser?.id || !userCompany?.id || !isAdmin) return;

    setProjectEditSaving(true);
    setProjectEditError("");
    setAssignmentsSuccess("");
    try {
      const name = String(projectEditDraft.name || "").trim();
      if (!name) {
        setProjectEditError("Project name is required.");
        return;
      }
      const projStatus = projectEditDraft.status === "archived" ? "archived" : "active";

      const { error: pErr } = await supabase
        .from("projects")
        .update({ name, status: projStatus })
        .eq("id", editingProjectId)
        .eq("company_id", userCompany.id);
      if (pErr) throw pErr;

      const initialIds = projectEditDraft.initialCcIds || [];
      const lines = projectEditDraft.lines || [];
      const currentDbIds = new Set(
        lines.filter((l) => l.dbId != null).map((l) => String(l.dbId))
      );

      for (const cid of initialIds) {
        if (!currentDbIds.has(String(cid))) {
          const { error: archErr } = await supabase
            .from("cost_centres")
            .update({ status: "archived" })
            .eq("id", cid)
            .eq("project_id", editingProjectId);
          if (archErr) throw archErr;
        }
      }

      const { data: maxOrdRows, error: maxErr } = await supabase
        .from("cost_centres")
        .select("display_order")
        .eq("project_id", editingProjectId)
        .order("display_order", { ascending: false })
        .limit(1);
      if (maxErr) throw maxErr;
      let nextOrder =
        maxOrdRows?.[0]?.display_order != null && Number.isFinite(Number(maxOrdRows[0].display_order))
          ? Number(maxOrdRows[0].display_order) + 1
          : 0;

      for (const line of lines) {
        const ccName = String(line.name || "").trim();
        const ccStatus = line.status === "archived" ? "archived" : "active";

        if (line.dbId != null) {
          if (!ccName) {
            setProjectEditError("Cost centre name cannot be empty.");
            return;
          }
          const { error: uErr } = await supabase
            .from("cost_centres")
            .update({ name: ccName, status: ccStatus })
            .eq("id", line.dbId)
            .eq("project_id", editingProjectId);
          if (uErr) throw uErr;
        } else if (line.isNew && ccName) {
          const { error: iErr } = await supabase.from("cost_centres").insert({
            company_id: userCompany.id,
            project_id: editingProjectId,
            name: ccName,
            status: ccStatus,
            display_order: nextOrder,
            created_by: authUser.id,
          });
          if (iErr) throw iErr;
          nextOrder += 1;
        }
      }

      setCompanyProjectsRefreshKey((k) => k + 1);
      setProjectsScreenRefreshKey((k) => k + 1);
      setEditingProjectId(null);
      setProjectEditDraft(null);
      setProjectsAddSuccess("");
      setProjectsEditSuccess("Project saved.");
    } catch (err) {
      setProjectEditError(getErrorMessage(err));
    } finally {
      setProjectEditSaving(false);
    }
  };

  const closeAssignmentsEditor = () => {
    if (assignmentsEditorSaving) return;
    setAssignmentsManageProjectId(null);
    setAssignmentsEditorMembers([]);
    setAssignmentsEditorChecks({});
    setAssignmentsEditorCostCentres([]);
    setAssignmentsEditorCcChecks({});
    setAssignmentsEditorCcInitial({});
    setAssignmentsEditorPccaByKey({});
    setAssignmentsEditorError("");
    setAssignmentsEditorLoading(false);
  };

  const openAssignmentsEditor = async (projectId) => {
    if (!userCompany?.id || !authUser?.id || !isAdmin) return;
    setAssignmentsEditorError("");
    setAssignmentsSuccess("");
    setProjectsAddSuccess("");
    setProjectsEditSuccess("");
    setAssignmentsManageProjectId(projectId);
    setAssignmentsEditorLoading(true);
    setAssignmentsEditorMembers([]);
    setAssignmentsEditorChecks({});
    setAssignmentsEditorCostCentres([]);
    setAssignmentsEditorCcChecks({});
    setAssignmentsEditorCcInitial({});
    setAssignmentsEditorPccaByKey({});
    try {
      const { data: members, error: mErr } = await supabase
        .from("company_members")
        .select("id, user_id, role")
        .eq("company_id", userCompany.id);
      if (mErr) throw mErr;
      const userIds = [...new Set((members || []).map((m) => m.user_id).filter(Boolean))];
      const profilesMap = {};
      if (userIds.length > 0) {
        const { data: profs, error: pErr } = await supabase
          .from("profiles")
          .select("id, full_name, email, employment_status")
          .in("id", userIds);
        if (pErr) throw pErr;
        (profs || []).forEach((p) => {
          profilesMap[p.id] = p;
        });
      }

      const { data: paRows, error: paErr } = await supabase
        .from("project_assignments")
        .select("id, user_id, status")
        .eq("company_id", userCompany.id)
        .eq("project_id", projectId);
      if (paErr) throw paErr;
      const byUser = {};
      for (const r of paRows || []) {
        byUser[String(r.user_id)] = { id: r.id, status: r.status };
      }

      const eligible = (members || []).filter((m) => {
        const p = profilesMap[m.user_id];
        const emp =
          p?.employment_status != null ? String(p.employment_status).trim().toLowerCase() : "active";
        return emp !== "archived";
      });

      const list = eligible.map((m) => {
        const p = profilesMap[m.user_id] || {};
        const full = (p.full_name && String(p.full_name).trim()) || "";
        const em = (p.email && String(p.email).trim()) || "";
        const displayName = full || em || shortUserLabel(m.user_id);
        const au = byUser[String(m.user_id)];
        const st = au?.status != null ? String(au.status).toLowerCase() : "";
        const initialChecked = st === "active";
        return {
          userId: m.user_id,
          displayName: displayName || shortUserLabel(m.user_id),
          role: (m.role || "employee").trim(),
          assignmentId: au?.id ?? null,
          assignmentStatus: au?.status ?? null,
          initialChecked,
        };
      });

      list.sort((a, b) => a.displayName.localeCompare(b.displayName));

      const { data: ccRows, error: ccErr } = await supabase
        .from("cost_centres")
        .select("id, name")
        .eq("project_id", projectId)
        .eq("status", "active")
        .order("name", { ascending: true });
      if (ccErr) throw ccErr;
      const costCentres = Array.isArray(ccRows) ? ccRows : [];

      const { data: pccaRaw, error: pccaErr } = await supabase
        .from("project_cost_centre_assignments")
        .select("id, user_id, cost_centre_id, status")
        .eq("company_id", userCompany.id)
        .eq("project_id", projectId);
      if (pccaErr) throw pccaErr;
      const pccaList = Array.isArray(pccaRaw) ? pccaRaw : [];

      const pccaByKey = {};
      for (const r of pccaList) {
        pccaByKey[pccaKey(r.user_id, r.cost_centre_id)] = { id: r.id };
      }

      const ccCh = {};
      const ccInit = {};
      for (const row of list) {
        const uid = String(row.userId);
        for (const cc of costCentres) {
          const k = pccaKey(uid, cc.id);
          const pr = pccaList.find(
            (x) => String(x.user_id) === uid && String(x.cost_centre_id) === String(cc.id)
          );
          const active = pr && String(pr.status ?? "").toLowerCase() === "active";
          ccCh[k] = active;
          ccInit[k] = active;
        }
      }

      setAssignmentsEditorMembers(list);
      const checks = {};
      for (const row of list) {
        checks[String(row.userId)] = row.initialChecked;
      }
      setAssignmentsEditorChecks(checks);
      setAssignmentsEditorCostCentres(costCentres);
      setAssignmentsEditorPccaByKey(pccaByKey);
      setAssignmentsEditorCcChecks(ccCh);
      setAssignmentsEditorCcInitial(ccInit);
    } catch (err) {
      setAssignmentsEditorError(getErrorMessage(err));
    } finally {
      setAssignmentsEditorLoading(false);
    }
  };

  const handleSaveProjectAssignments = async () => {
    if (!assignmentsManageProjectId || !userCompany?.id || !authUser?.id || !isAdmin) return;
    setAssignmentsEditorSaving(true);
    setAssignmentsEditorError("");
    try {
      for (const m of assignmentsEditorMembers) {
        const uid = String(m.userId);
        const want = Boolean(assignmentsEditorChecks[uid]);
        if (want === m.initialChecked) continue;

        if (want) {
          if (m.assignmentId) {
            const { error: uErr } = await supabase
              .from("project_assignments")
              .update({ status: "active", assigned_by: authUser.id })
              .eq("id", m.assignmentId)
              .eq("company_id", userCompany.id);
            if (uErr) throw uErr;
          } else {
            const { error: iErr } = await supabase.from("project_assignments").insert({
              company_id: userCompany.id,
              project_id: assignmentsManageProjectId,
              user_id: m.userId,
              assigned_by: authUser.id,
              status: "active",
            });
            if (iErr) {
              const { data: existing, error: exErr } = await supabase
                .from("project_assignments")
                .select("id")
                .eq("company_id", userCompany.id)
                .eq("project_id", assignmentsManageProjectId)
                .eq("user_id", m.userId)
                .maybeSingle();
              if (exErr) throw iErr;
              if (existing?.id) {
                const { error: rErr } = await supabase
                  .from("project_assignments")
                  .update({ status: "active", assigned_by: authUser.id })
                  .eq("id", existing.id)
                  .eq("company_id", userCompany.id);
                if (rErr) throw rErr;
              } else {
                throw iErr;
              }
            }
          }
        } else if (m.assignmentId) {
          const { error: aErr } = await supabase
            .from("project_assignments")
            .update({ status: "archived" })
            .eq("id", m.assignmentId)
            .eq("company_id", userCompany.id);
          if (aErr) throw aErr;
        }
      }

      const removedFromProjectUids = assignmentsEditorMembers
        .filter((m) => m.initialChecked && !assignmentsEditorChecks[String(m.userId)])
        .map((m) => String(m.userId));
      if (removedFromProjectUids.length > 0) {
        const { error: archPccaErr } = await supabase
          .from("project_cost_centre_assignments")
          .update({ status: "archived" })
          .eq("company_id", userCompany.id)
          .eq("project_id", assignmentsManageProjectId)
          .in("user_id", removedFromProjectUids);
        if (archPccaErr) throw archPccaErr;
      }

      for (const m of assignmentsEditorMembers) {
        const uid = String(m.userId);
        if (!assignmentsEditorChecks[uid]) continue;
        for (const cc of assignmentsEditorCostCentres) {
          const k = pccaKey(uid, cc.id);
          const want = Boolean(assignmentsEditorCcChecks[k]);
          const init = Boolean(assignmentsEditorCcInitial[k]);
          if (want === init) continue;
          const meta = assignmentsEditorPccaByKey[k];
          if (want) {
            if (meta?.id) {
              const { error: uErr } = await supabase
                .from("project_cost_centre_assignments")
                .update({ status: "active", assigned_by: authUser.id })
                .eq("id", meta.id)
                .eq("company_id", userCompany.id);
              if (uErr) throw uErr;
            } else {
              const { error: iErr } = await supabase.from("project_cost_centre_assignments").insert({
                company_id: userCompany.id,
                project_id: assignmentsManageProjectId,
                cost_centre_id: cc.id,
                user_id: m.userId,
                assigned_by: authUser.id,
                status: "active",
              });
              if (iErr) {
                const { data: existing, error: exErr } = await supabase
                  .from("project_cost_centre_assignments")
                  .select("id")
                  .eq("company_id", userCompany.id)
                  .eq("project_id", assignmentsManageProjectId)
                  .eq("user_id", m.userId)
                  .eq("cost_centre_id", cc.id)
                  .maybeSingle();
                if (exErr) throw iErr;
                if (existing?.id) {
                  const { error: rErr } = await supabase
                    .from("project_cost_centre_assignments")
                    .update({ status: "active", assigned_by: authUser.id })
                    .eq("id", existing.id)
                    .eq("company_id", userCompany.id);
                  if (rErr) throw rErr;
                } else {
                  throw iErr;
                }
              }
            }
          } else if (meta?.id) {
            const { error: aErr } = await supabase
              .from("project_cost_centre_assignments")
              .update({ status: "archived" })
              .eq("id", meta.id)
              .eq("company_id", userCompany.id);
            if (aErr) throw aErr;
          }
        }
      }

      setProjectsScreenRefreshKey((k) => k + 1);
      setAssignmentsManageProjectId(null);
      setAssignmentsEditorMembers([]);
      setAssignmentsEditorChecks({});
      setAssignmentsEditorCostCentres([]);
      setAssignmentsEditorCcChecks({});
      setAssignmentsEditorCcInitial({});
      setAssignmentsEditorPccaByKey({});
      setProjectsAddSuccess("");
      setProjectsEditSuccess("");
      setAssignmentsSuccess("Assignments saved.");
    } catch (err) {
      setAssignmentsEditorError(getErrorMessage(err));
    } finally {
      setAssignmentsEditorSaving(false);
    }
  };

  const getInstallInstructions = () => {
    const ua = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isAndroid = /android/.test(ua);
    const isChrome = /chrome|crios/.test(ua);
    const isSafari = /safari/.test(ua) && !/crios|chrome/.test(ua);
    if (isIOS && isSafari) return "iPhone: Tap the Share button → Add to Home Screen.";
    if (isIOS && !isSafari) return "iPhone: Open this link in Safari, then tap Share → Add to Home Screen.";
    if (isAndroid && isChrome) return "Android: Tap Chrome menu (⋮) → Install App or Add to Home Screen.";
    return "Use your browser menu and choose Install App or Add to Home Screen.";
  };

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return;
    }
    alert(getInstallInstructions());
  };

  const startLiveLocationTracking = () => {
    if (!navigator.geolocation) {
      setLocationStatus("Live GPS not supported on this device");
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const liveLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date().toISOString(),
        };

        setCurrentShift((previousShift) => {
          if (!previousShift) return previousShift;
          return {
            ...previousShift,
            liveLocation,
            locationTrail: [...(previousShift.locationTrail || []), liveLocation].slice(-50),
          };
        });
      },
      () => setLocationStatus("Live GPS permission denied or unavailable"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    setWatchId(id);
  };

  const handleClockIn = async () => {
    if (isProfileArchived) {
      setLocationStatus("Your account is archived. Please contact your supervisor.");
      return;
    }

    if (!authUser) {
      alert("User not logged in");
      return;
    }

    if (!clockSelectedProject) {
      setLocationStatus("No projects assigned. Please contact your supervisor.");
      return;
    }

    const allActiveOnProject =
      effectiveCostCentresByProjectId[String(clockSelectedProject.id)] ||
      effectiveCostCentresByProjectId[Number(clockSelectedProject.id)] ||
      [];
    const clockInCentres = clockCostCentreOptionsForProject(clockSelectedProject.id);
    if (clockInCentres.length === 0 || !costCenter || !clockInCentres.includes(costCenter)) {
      if (!isAdmin && allActiveOnProject.length > 0) {
        setLocationStatus(
          "No cost centres assigned for this project. Please contact your supervisor."
        );
      } else {
        setLocationStatus("No cost centres available for this project.");
      }
      return;
    }

    setLocationStatus("Getting location...");
    const locResult = await getCurrentLocation();
    const gps = locResult.coords;

    let employeeHourlyRate = 0;
    try {
      const { data: payProf } = await supabase
        .from("profiles")
        .select("hourly_rate")
        .eq("id", authUser.id)
        .maybeSingle();
      employeeHourlyRate = hourlyRateFromProfileValue(payProf?.hourly_rate);
    } catch {
      employeeHourlyRate = 0;
    }
    console.log("[LABOUR] clockIn hourlyRate", employeeHourlyRate);

    const clockInLocation = gps
      ? {
          latitude: gps.latitude,
          longitude: gps.longitude,
          accuracy: gps.accuracy,
          capturedAt: gps.capturedAt,
        }
      : null;
    const clockInTime = new Date().toISOString();
    const clockInEmployeeName = (profileFullName || "").trim() || authUser?.email || null;

    const newShift = {
      userId: authUser?.id || null,
      employee: clockInEmployeeName || authUser?.email || "Employee",
      employeeName: clockInEmployeeName || authUser?.email || "",
      employeeEmail: authUser?.email || null,
      profileDisplayName: (profileFullName || "").trim(),
      profileEmailForRow: (authUser?.email || "").trim(),
      companyId: userCompany?.id || null,
      companyName: userCompany?.name || null,
      hourlyRate: employeeHourlyRate,
      project: clockSelectedProject.name,
      projectId: clockSelectedProject.id,
      costCenter,
      date: clockInTime,
      clockIn: clockInTime,
      clockInLocation,
      breakStart: null,
      breakEnd: null,
      status: "Active",
      photosTaken: 0,
      lastPhotoAt: null,
      projectFolder: getProjectFolderName(clockSelectedProject.name),
      liveLocation: null,
      locationTrail: [],
    };

    setCurrentShift(newShift);
    setLocationStatus("Saving clock-in…");

    const clockInInsertBase = {
      user_id: authUser.id,
      employee_email: authUser.email || null,
      employee_name: clockInEmployeeName,
      company_id: userCompany?.id || null,
      company_name: userCompany?.name || null,
      project_id: clockSelectedProject.id,
      project_name: clockSelectedProject.name,
      hourly_rate: employeeHourlyRate,
      cost_centre: costCenter,
      clock_in: clockInTime,
      status: "Active",
      clock_in_latitude: gps?.latitude ?? null,
      clock_in_longitude: gps?.longitude ?? null,
      ...(gps != null && gps.accuracy != null ? { clock_in_accuracy: gps.accuracy } : {}),
    };

    const { data, error } = await supabaseInsertTimesheetRow(supabase, clockInInsertBase);

    if (error) {
      // Backward compatibility if DB columns aren't added yet
      const msg = error?.message || "";
      const missingColumn = msg.includes("column") && (msg.includes("employee_email") || msg.includes("company_id") || msg.includes("company_name"));
      if (missingColumn) {
        const legacyInsert = {
          user_id: authUser.id,
          employee_name: clockInEmployeeName,
          project_name: clockSelectedProject.name,
          hourly_rate: employeeHourlyRate,
          cost_centre: costCenter,
          clock_in: clockInTime,
          status: "Active",
          clock_in_latitude: gps?.latitude ?? null,
          clock_in_longitude: gps?.longitude ?? null,
          ...(gps != null && gps.accuracy != null ? { clock_in_accuracy: gps.accuracy } : {}),
        };
        const { data: legacyData, error: legacyError } = await supabaseInsertTimesheetRow(supabase, legacyInsert);

        if (legacyError) {
          console.log("Supabase clock-in error:", legacyError);
          setLocationStatus("Database save failed. Your shift is still active locally.");
          alert("Clock-in saved locally, but database save failed.");
          return;
        }

        setCurrentShift({ ...newShift, supabaseTimesheetId: legacyData?.[0]?.id || null });
        setLocationStatus(
          gps
            ? "Clock-in saved. Location captured."
            : locResult.error === "denied"
              ? "Clock-in saved. Location unavailable / permission denied."
              : "Clock-in saved. Location unavailable."
        );
        void updateLiveLocationOnce({
          status: "clocked_in",
          projectName: clockSelectedProject.name,
          costCentre: costCenter,
          coords: gps,
        });
        const actorLabel = clockInEmployeeName || authUser?.email || "Someone";
        void createCompanyNotifications(supabase, {
          companyId: userCompany?.id,
          actorUserId: authUser.id,
          actorRole: resolvedCompanyRole,
          type: "clock_in",
          title: clockInTitleForActorRole(resolvedCompanyRole),
          message: `${actorLabel} clocked in at ${clockSelectedProject.name} - ${costCenter}`,
          projectId: clockSelectedProject.id,
          projectName: clockSelectedProject.name,
          costCentre: costCenter,
          relatedTimesheetId: legacyData?.[0]?.id ?? null,
          relatedFolder: getProjectFolderName(clockSelectedProject.name),
          itemCount: null,
        });
        return;
      }

      console.log("Supabase clock-in error:", error);
      setLocationStatus("Database save failed. Your shift is still active locally.");
      alert("Clock-in saved locally, but database save failed.");
      return;
    }

    setCurrentShift({ ...newShift, supabaseTimesheetId: data?.[0]?.id || null });
    setLocationStatus(
      gps
        ? "Clock-in saved. Location captured."
        : locResult.error === "denied"
          ? "Clock-in saved. Location unavailable / permission denied."
          : "Clock-in saved. Location unavailable."
    );
    void updateLiveLocationOnce({
      status: "clocked_in",
      projectName: clockSelectedProject.name,
      costCentre: costCenter,
      coords: gps,
    });
    const actorLabelMain = clockInEmployeeName || authUser?.email || "Someone";
    void createCompanyNotifications(supabase, {
      companyId: userCompany?.id,
      actorUserId: authUser.id,
      actorRole: resolvedCompanyRole,
      type: "clock_in",
      title: clockInTitleForActorRole(resolvedCompanyRole),
      message: `${actorLabelMain} clocked in at ${clockSelectedProject.name} - ${costCenter}`,
      projectId: clockSelectedProject.id,
      projectName: clockSelectedProject.name,
      costCentre: costCenter,
      relatedTimesheetId: data?.[0]?.id ?? null,
      relatedFolder: getProjectFolderName(clockSelectedProject.name),
      itemCount: null,
    });
  };
  const handleChangeTask = () => {
    if (!visibleCurrentShift) return;
    setIsChangingTask(true);
  };

  const applyTaskChange = () => {
    if (!visibleCurrentShift) return;
    const updatedProject =
      clockSelectableProjects.find((p) => String(p.id) === String(projectId)) ||
      effectiveProjects.find((p) => String(p.id) === String(projectId)) ||
      adminProjects.find((p) => p.id === projectId) ||
      adminProjects[0];
    const taskCentres = clockCostCentreOptionsForProject(updatedProject.id);
    if (taskCentres.length === 0 || !taskCentres.includes(costCenter)) return;
    setCurrentShift({
      ...visibleCurrentShift,
      project: updatedProject.name,
      projectId: updatedProject.id,
      costCenter,
      projectFolder: getProjectFolderName(updatedProject.name),
    });
    setIsChangingTask(false);
  };

  const handleBreak = () => {
    if (!visibleCurrentShift) return;
    if (!visibleCurrentShift.breakStart) {
      setCurrentShift({ ...visibleCurrentShift, breakStart: new Date().toISOString() });
      return;
    }
    if (!visibleCurrentShift.breakEnd) setCurrentShift({ ...visibleCurrentShift, breakEnd: new Date().toISOString() });
  };


const compressImage = (file, maxWidth = 1000, quality = 0.6) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (event) => {
      img.src = event.target.result;
    };

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(maxWidth / img.width, 1);

      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Image compression failed"));
            return;
          }

          const compressedFile = new File(
            [blob],
            file.name.replace(/\.[^/.]+$/, ".jpg"),
            { type: "image/jpeg" }
          );

          resolve(compressedFile);
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = reject;
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const handlePhotoCapture = async (event) => {
  const file = event.target.files?.[0];
  if (!file || !visibleCurrentShift || !authUser) return;

  const folderName = getProjectFolderName(visibleCurrentShift.project);

  try {
    setPhotoStatus("Compressing photo...");
    setUploadProgress(10);

    const compressedFile = await compressImage(file, 700, 0.45);

    console.log("Original size:", file.size);
    console.log("Compressed size:", compressedFile.size);

    setPhotoStatus(`Uploading small photo... ${Math.round(compressedFile.size / 1024)} KB`);
    setUploadProgress(30);

    const filePath = `${folderName}/${authUser.id}-${Date.now()}.jpg`;

    const uploadPromise = supabase.storage
      .from("project-photos")
      .upload(filePath, compressedFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: "image/jpeg",
      });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Cloud upload timed out after 60 seconds")), 60000)
    );

    let progressTimer = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev === null) return 30;
        if (prev >= 95) return 95;
        return prev + 5;
      });
    }, 2000);

    const result = await Promise.race([uploadPromise, timeoutPromise]);

    clearInterval(progressTimer);

    if (result.error) {
      console.log("Cloud upload error:", result.error);
      showErrorPopup("Cloud upload failed", result.error);
      setPhotoStatus("Cloud upload failed.");
      setUploadProgress(null);
      event.target.value = "";
      return;
    }

    const { data } = supabase.storage
      .from("project-photos")
      .getPublicUrl(filePath);

    const photoUrl = data?.publicUrl || "";

    const photo = {
      id: Date.now(),
      project: visibleCurrentShift.project,
      folderName,
      costCenter: visibleCurrentShift.costCenter,
      employee: visibleCurrentShift.employee,
      employeeId: visibleCurrentShift.employeeId,
      capturedAt: new Date().toISOString(),
      location: null,
      dataUrl: "",
      imageUrl: photoUrl,
      type: "photo",
    };

    setProjectPhotos((previous) => ({
      ...previous,
      [folderName]: [photo, ...(previous[folderName] || [])],
    }));

    setPhotoNotificationCount((count) => count + 1);

    setCurrentShift((previousShift) =>
      previousShift
        ? {
            ...previousShift,
            photosTaken: (previousShift.photosTaken || 0) + 1,
            lastPhotoAt: photo.capturedAt,
          }
        : previousShift
    );

    setUploadProgress(100);
    setPhotoStatus("Photo uploaded ✅");
    void schedulePhotoNotificationAfterUpload();

    setTimeout(() => {
      setUploadProgress(null);
    }, 1500);

    event.target.value = "";
  } catch (err) {
    console.log("Photo upload failed:", err);
    showErrorPopup("Photo upload failed", err);
    setPhotoStatus("Photo upload failed.");
    setUploadProgress(null);
    event.target.value = "";
  }
};
  const handleReceiptCapture = (event) => {
    const file = event.target.files?.[0];
    if (!file || !visibleCurrentShift) return;

    const amountInput = window.prompt("Enter receipt amount:");
    const amount = Number(amountInput || 0);
    const category = window.prompt("Receipt category? Example: Materials, Fuel, Tools, Parking, Other") || "Other";
    const note = window.prompt("Optional note for this receipt:") || "";

    const reader = new FileReader();
    reader.onload = () => {
      const folderName = getProjectFolderName(visibleCurrentShift.project);
      const receipt = {
        id: Date.now(),
        project: visibleCurrentShift.project,
        folderName,
        costCenter: visibleCurrentShift.costCenter,
        employee: visibleCurrentShift.employee,
        employeeId: visibleCurrentShift.employeeId,
        amount: Number.isFinite(amount) ? amount : 0,
        category,
        note,
        capturedAt: new Date().toISOString(),
        location: visibleCurrentShift.liveLocation || visibleCurrentShift.clockInLocation || null,
        dataUrl: reader.result,
        type: "receipt",
      };

      setProjectReceipts((previous) => ({ ...previous, [folderName]: [receipt, ...(previous[folderName] || [])] }));
      setPhotoStatus(`Receipt saved: ${formatMoney(receipt.amount)}`);
      if (authUser?.id && userCompany?.id) {
        const actorLabel = (profileFullName || "").trim() || authUser.email || "Someone";
        void createCompanyNotifications(supabase, {
          companyId: userCompany.id,
          actorUserId: authUser.id,
          actorRole: resolvedCompanyRole,
          type: "receipt_uploaded",
          title: "Receipt uploaded",
          message: `${actorLabel} uploaded a receipt for ${visibleCurrentShift.project} - ${visibleCurrentShift.costCenter}`,
          projectId: visibleCurrentShift.projectId,
          projectName: visibleCurrentShift.project,
          costCentre: visibleCurrentShift.costCenter,
          relatedTimesheetId: visibleCurrentShift.supabaseTimesheetId ?? null,
          relatedFolder: folderName,
          itemCount: null,
        });
      }
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleClockOut = async () => {
    if (!visibleCurrentShift) return;

    if (!visibleCurrentShift.photosTaken || visibleCurrentShift.photosTaken < 1) {
      alert("Please take at least one final project picture before clocking out.");
      return;
    }

    if (watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }

    setLocationStatus("Getting location...");
    const locResult = await getCurrentLocation();
    const clockOutGps = locResult.coords;
    const clockOutTime = new Date().toISOString();
    let didSaveClockOut = false;

    if (visibleCurrentShift.supabaseTimesheetId) {
      const { update: labourUpdate, debug: labourDebug } = await buildTimesheetClockOutUpdate(supabase, {
        userId: authUser.id,
        clockInIso: visibleCurrentShift.clockIn,
        clockOutIso: clockOutTime,
        timesheetHourlyRate: visibleCurrentShift.hourlyRate,
      });
      console.log("[LABOUR] clockOut", {
        clockIn: labourDebug.clockInIso,
        clockOut: labourDebug.clockOutIso,
        hourlyRate: labourDebug.hourlyRate,
        hours: labourDebug.hours,
        cost: labourDebug.labourCost,
      });
      const updatePayload = {
        ...labourUpdate,
        clock_out_latitude: clockOutGps?.latitude ?? null,
        clock_out_longitude: clockOutGps?.longitude ?? null,
        ...(clockOutGps != null && clockOutGps.accuracy != null
          ? { clock_out_accuracy: clockOutGps.accuracy }
          : {}),
      };
      const { error } = await supabaseUpdateTimesheetRow(
        supabase,
        visibleCurrentShift.supabaseTimesheetId,
        updatePayload
      );

      if (error) {
        console.log("Supabase clock-out error:", error);
      } else if (authUser?.id && userCompany?.id) {
        didSaveClockOut = true;
        const actorLabel = (profileFullName || "").trim() || authUser?.email || "Someone";
        void createCompanyNotifications(supabase, {
          companyId: userCompany.id,
          actorUserId: authUser.id,
          actorRole: resolvedCompanyRole,
          type: "clock_out",
          title: clockOutTitleForActorRole(resolvedCompanyRole),
          message: `${actorLabel} clocked out from ${visibleCurrentShift.project} - ${visibleCurrentShift.costCenter}`,
          projectId: visibleCurrentShift.projectId,
          projectName: visibleCurrentShift.project,
          costCentre: visibleCurrentShift.costCenter,
          relatedTimesheetId: visibleCurrentShift.supabaseTimesheetId,
          relatedFolder: visibleCurrentShift.projectFolder || getProjectFolderName(visibleCurrentShift.project),
          itemCount: null,
        });
      }
    }

    setCurrentShift(null);
    if (didSaveClockOut) {
      void updateLiveLocationOnce({
        status: "clocked_out",
        projectName: visibleCurrentShift.project,
        costCentre: visibleCurrentShift.costCenter,
        coords: clockOutGps,
      });
    }
    setLocationStatus(
      clockOutGps
        ? "Clock-out saved. Location captured."
        : locResult.error === "denied"
          ? "Clock-out saved. Location unavailable / permission denied."
          : "Clock-out saved. Location unavailable."
    );
    setActiveTab("clock");
    void fetchTimesheetsFromSupabase();
  };

  const costCentresForEditProject = (pid) =>
    effectiveCostCentresByProjectId[String(pid)] ||
    effectiveCostCentresByProjectId[Number(pid)] ||
    [];

  const handleDashboardEmployeeClockIn = async (row) => {
    if (!isAdmin || !authUser?.id || !userCompany?.id) return;
    if (row.employmentStatus === "archived") {
      setDashboardActionFeedback({
        type: "error",
        text: "This employee is archived and cannot be clocked in.",
      });
      return;
    }
    if (!window.confirm("Clock in this employee now?")) return;
    const uid = String(row.userId);
    const assignedIds = new Set((dashboardAssignmentsByUserId[uid] || []).map((id) => String(id)));
    const rowProjects = effectiveProjects.filter((p) => assignedIds.has(String(p.id)));
    if (rowProjects.length === 0) {
      setDashboardActionFeedback({
        type: "error",
        text: "No projects assigned to this employee.",
      });
      return;
    }
    const rawPick =
      dashboardClockPick[uid] || {
        projectId: String(rowProjects[0]?.id ?? ""),
        costCenter: costCentresForEditProject(rowProjects[0]?.id)[0] || "",
      };
    const proj = rowProjects.find((p) => String(p.id) === String(rawPick.projectId));
    if (!proj) {
      setDashboardActionFeedback({
        type: "error",
        text: "No projects assigned to this employee.",
      });
      return;
    }
    const centres = costCentresForEditProject(proj.id);
    if (centres.length === 0) {
      setDashboardActionFeedback({
        type: "error",
        text: "No cost centres available for this project.",
      });
      return;
    }
    let cc = rawPick.costCenter || "";
    if (!cc || !centres.includes(cc)) cc = centres[0] || "";

    setDashboardSavingUserId(uid);
    setDashboardActionFeedback(null);
    const clockInTime = new Date().toISOString();
    const employeeName = (row.displayName || "").trim() || shortUserLabel(row.userId);
    const employeeEmail = row.profileEmailRaw || null;
    let hourlyRate = hourlyRateFromProfileValue(row.hourlyRate);
    if (!hourlyRate) {
      const { data: payProf } = await supabase
        .from("profiles")
        .select("hourly_rate")
        .eq("id", row.userId)
        .maybeSingle();
      hourlyRate = hourlyRateFromProfileValue(payProf?.hourly_rate);
    }
    console.log("[LABOUR] clockIn hourlyRate", hourlyRate);

    try {
      const { error } = await supabase
        .from("timesheets")
        .insert([
          {
            user_id: row.userId,
            employee_email: employeeEmail,
            employee_name: employeeName,
            company_id: userCompany.id,
            company_name: userCompany.name || null,
            project_id: proj.id,
            project_name: proj.name,
            hourly_rate: hourlyRate,
            cost_centre: cc,
            clock_in: clockInTime,
            status: "Active",
            clock_in_latitude: null,
            clock_in_longitude: null,
          },
        ])
        .select();

      if (error) {
        const msg = error?.message || "";
        const missingColumn =
          msg.includes("column") &&
          (msg.includes("employee_email") || msg.includes("company_id") || msg.includes("company_name"));
        if (missingColumn) {
          const { error: legacyError } = await supabase
            .from("timesheets")
            .insert([
              {
                user_id: row.userId,
                employee_name: employeeName,
                project_name: proj.name,
                hourly_rate: hourlyRate,
                cost_centre: cc,
                clock_in: clockInTime,
                status: "Active",
                clock_in_latitude: null,
                clock_in_longitude: null,
              },
            ])
            .select();
          if (legacyError) throw legacyError;
        } else {
          throw error;
        }
      }

      setDashboardActionFeedback({ type: "success", text: `${employeeName} clocked in.` });
      setDashboardRefreshKey((k) => k + 1);
      await fetchTimesheetsFromSupabase();
    } catch (e) {
      setDashboardActionFeedback({ type: "error", text: getErrorMessage(e) });
    } finally {
      setDashboardSavingUserId(null);
    }
  };

  const handleDashboardEmployeeClockOutOrFix = async (row, rep, mode) => {
    if (!isAdmin || !rep?.supabaseTimesheetId) return;
    const confirmMsg =
      mode === "fix"
        ? "Fix missing clock-out for this employee using current time?"
        : "Clock out this employee now?";
    if (!window.confirm(confirmMsg)) return;

    setDashboardSavingUserId(String(row.userId));
    setDashboardActionFeedback(null);
    const clockOutTime = new Date().toISOString();
    const { update: labourUpdate, debug: labourDebug } = await buildTimesheetClockOutUpdate(supabase, {
      userId: row.userId,
      clockInIso: rep.clockIn,
      clockOutIso: clockOutTime,
      timesheetHourlyRate: rep.hourlyRate,
    });
    console.log("[LABOUR] clockOut", {
      clockIn: labourDebug.clockInIso,
      clockOut: labourDebug.clockOutIso,
      hourlyRate: labourDebug.hourlyRate,
      hours: labourDebug.hours,
      cost: labourDebug.labourCost,
    });

    try {
      const { error } = await supabaseUpdateTimesheetRow(supabase, rep.supabaseTimesheetId, {
        ...labourUpdate,
        clock_out_latitude: null,
        clock_out_longitude: null,
        clock_out_accuracy: null,
      });
      if (error) throw error;
      setDashboardActionFeedback({
        type: "success",
        text: mode === "fix" ? "Clock-out saved." : "Employee clocked out.",
      });
      setDashboardRefreshKey((k) => k + 1);
      await fetchTimesheetsFromSupabase();
    } catch (e) {
      setDashboardActionFeedback({ type: "error", text: getErrorMessage(e) });
    } finally {
      setDashboardSavingUserId(null);
    }
  };

  const startEditRecord = (record) => {
    if (!canEditTimesheetRecord(record)) return;
    const inParts = wallClockPartsInTimeZone(record.clockIn, companyTimeZone);
    setEditingRecordId(record.id);
    setEditClockInDate(inParts.dateStr);
    setEditClockInTime(inParts.timeStr.slice(0, 5));
    if (record.clockOut) {
      const outParts = wallClockPartsInTimeZone(record.clockOut, companyTimeZone);
      setEditClockOutDate(outParts.dateStr);
      setEditClockOutTime(outParts.timeStr.slice(0, 5));
    } else {
      setEditClockOutDate(inParts.dateStr);
      setEditClockOutTime("");
    }
    const pidStr = record.projectId != null ? String(record.projectId) : "";
    const matchProj = effectiveProjects.find((p) => String(p.id) === pidStr);
    const resolvedPid = matchProj ? String(matchProj.id) : String(effectiveProjects[0]?.id ?? "");
    setEditProjectId(resolvedPid);
    const centres = costCentresForEditProject(resolvedPid);
    const cc =
      record.costCenter && centres.includes(record.costCenter) ? record.costCenter : (centres[0] || record.costCenter || "");
    setEditCostCenter(cc);
  };

  const saveEditedRecord = async (record) => {
    if (!canEditTimesheetRecord(record)) return;
    const rowId = record.supabaseTimesheetId ?? record.id;
    if (rowId == null) {
      alert("Missing timesheet id. Cannot save.");
      return;
    }
    if (!editClockInDate || !editClockInTime) {
      alert("Clock in date and time are required.");
      return;
    }
    if (!editClockOutDate || !editClockOutTime) {
      alert("Clock out date and time are required.");
      return;
    }
    const clockInIso = wallDateTimeToUtcIso(editClockInDate, editClockInTime, companyTimeZone);
    const clockOutIso = wallDateTimeToUtcIso(editClockOutDate, editClockOutTime, companyTimeZone);
    if (!clockInIso || !clockOutIso) {
      alert("Invalid date or time.");
      return;
    }
    if (new Date(clockOutIso).getTime() <= new Date(clockInIso).getTime()) {
      alert("Clock out must be after clock in.");
      return;
    }
    const proj = effectiveProjects.find((p) => String(p.id) === String(editProjectId));
    if (!proj) {
      alert("Please select a project.");
      return;
    }
    const centres = costCentresForEditProject(proj.id);
    if (centres.length > 0 && (!editCostCenter || !centres.includes(editCostCenter))) {
      alert("Pick a cost centre for this project.");
      return;
    }

    setEditTimesheetSaving(true);
    try {
      const { update: labourUpdate } = await buildTimesheetClockOutUpdate(supabase, {
        userId: record.userId,
        clockInIso,
        clockOutIso,
        timesheetHourlyRate: record.hourlyRate,
      });
      const { error } = await supabase
        .from("timesheets")
        .update({
          clock_in: clockInIso,
          clock_out: clockOutIso,
          project_id: proj.id,
          project_name: proj.name,
          cost_centre: editCostCenter || "",
          ...labourUpdate,
        })
        .eq("id", rowId);
      if (error) throw error;
      cancelEditRecord();
      await fetchTimesheetsFromSupabase();
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setEditTimesheetSaving(false);
    }
  };

  const cancelEditRecord = () => {
    setEditingRecordId(null);
    setEditClockInDate("");
    setEditClockInTime("");
    setEditClockOutDate("");
    setEditClockOutTime("");
    setEditProjectId("");
    setEditCostCenter("");
  };

  const handleDeleteTimesheetRecord = async (record) => {
    if (!isAdmin) return;
    const rowId = record.supabaseTimesheetId ?? record.id;
    if (rowId == null) return;
    if (
      !window.confirm(
        "Are you sure you want to delete this timesheet entry? This cannot be undone."
      )
    ) {
      return;
    }
    setDeletingTimesheetId(String(rowId));
    try {
      const { error } = await supabase.from("timesheets").delete().eq("id", rowId);
      if (error) throw error;
      setRecords((prev) => prev.filter((r) => String(r.supabaseTimesheetId ?? r.id) !== String(rowId)));
      const myLiveId = visibleCurrentShift?.supabaseTimesheetId;
      if (myLiveId != null && String(myLiveId) === String(rowId)) {
        setCurrentShift(null);
      }
      await fetchTimesheetsFromSupabase();
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setDeletingTimesheetId(null);
    }
  };

  const getFolderShareLink = (folderName) => `${window.location.origin}/photos/${folderName}`;

  const shareProjectFolder = async (folderName) => {
    const shareUrl = getFolderShareLink(folderName);
    if (navigator.share) {
      await navigator.share({ title: "Project Photos", text: `Project photo folder: ${shareUrl}`, url: shareUrl });
      return;
    }
    await navigator.clipboard.writeText(shareUrl);
    alert("Project folder link copied. After Supabase setup, this will become a real customer share link.");
  };

  const openPhotosTab = () => {
    setActiveTab("photos");
    setPhotoNotificationCount(0);
    setIsMenuOpen(false);
  };

  const openMenuTab = (tabName) => {
    const employeeAllowedTabs = new Set(["clock", "timesheet", "photos", "receipts", "settings"]);
    if (isEmployeeRole && !employeeAllowedTabs.has(tabName)) {
      setIsMenuOpen(false);
      setActiveTab("clock");
      return;
    }
    setActiveTab(tabName);
    if (tabName === "photos") setPhotoNotificationCount(0);
    setIsMenuOpen(false);
  };

  const handleEnableMobileNotifications = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setMobileNotifPermissionUi("not_supported");
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") setMobileNotifPermissionUi("enabled");
      else if (perm === "denied") setMobileNotifPermissionUi("blocked");
      else setMobileNotifPermissionUi("default");
    } catch {
      setMobileNotifPermissionUi("blocked");
    }
  };

  const handleEnableBackgroundPush = async () => {
    setBackgroundPushError("");
    setBackgroundPushSaveMessage("");
    const permAtStart = typeof Notification !== "undefined" ? Notification.permission : "denied";

    const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (typeof vapid !== "string" || !vapid.trim()) {
      setBackgroundPushUi("error");
      setBackgroundPushError("Missing VITE_VAPID_PUBLIC_KEY");
      return;
    }
    if (typeof window === "undefined" || !("Notification" in window)) {
      setBackgroundPushUi("not_supported");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setBackgroundPushUi("not_supported");
      return;
    }
    if (!authUser?.id || !userCompany?.id) {
      setBackgroundPushUi("error");
      setBackgroundPushError("Sign in and select a company first.");
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setBackgroundPushUi(perm === "denied" ? "blocked" : "default");
        return;
      }

      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register("/service-worker.js");
      }
      await navigator.serviceWorker.ready;

      const registration =
        (await navigator.serviceWorker.getRegistration()) || reg;
      if (!registration?.pushManager) {
        setBackgroundPushUi("not_supported");
        return;
      }

      const subAtStart = await registration.pushManager.getSubscription();
      let sub = subAtStart;
      if (!sub) {
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid.trim()),
        });
      }

      const subJson = sub.toJSON();
      const keys = subJson.keys || {};

      const payload = {
        company_id: userCompany.id,
        user_id: authUser.id,
        endpoint: sub.endpoint,
        p256dh: keys.p256dh ?? "",
        auth: keys.auth ?? "",
        user_agent: typeof navigator.userAgent === "string" ? navigator.userAgent : "",
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      console.log("[PUSH SUB] save payload", payload);

      const { data: existing, error: selErr } = await supabase
        .from("push_subscriptions")
        .select("id")
        .eq("user_id", authUser.id)
        .eq("endpoint", sub.endpoint)
        .maybeSingle();

      if (selErr) {
        console.error("[PUSH SUB] save error", selErr);
        throw selErr;
      }

      console.log("[PUSH SUB] existing row", existing);

      if (existing?.id != null) {
        const { error: upErr } = await supabase
          .from("push_subscriptions")
          .update(payload)
          .eq("id", existing.id);
        if (upErr) {
          console.error("[PUSH SUB] save error", upErr);
          throw upErr;
        }
        console.log("[PUSH SUB] update success");
      } else {
        const { error: insErr } = await supabase.from("push_subscriptions").insert(payload);
        if (insErr) {
          console.error("[PUSH SUB] save error", insErr);
          throw insErr;
        }
        console.log("[PUSH SUB] insert success");
      }

      const repeatEnable =
        permAtStart === "granted" && subAtStart != null;
      setBackgroundPushSaveMessage(
        repeatEnable ? "Already enabled / Subscription saved" : "Subscription saved"
      );
      setBackgroundPushUi("enabled");
    } catch (e) {
      console.error("[PUSH SUB] save error", e);
      setBackgroundPushUi("error");
      setBackgroundPushError(getErrorMessage(e));
    }
  };

  const handleMarkNotificationRead = async (n) => {
    if (!isAdmin || !authUser?.id || !n?.id) return;
    setMarkingNotifId(String(n.id));
    try {
      const ts = new Date().toISOString();
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: ts, is_read: true })
        .eq("id", n.id)
        .eq("recipient_user_id", authUser.id);
      if (error) throw error;
      setInAppNotifications((prev) =>
        prev.map((x) => (String(x.id) === String(n.id) ? { ...x, read_at: ts, is_read: true } : x))
      );
      setLiveToast((t) => (t && String(t.id) === String(n.id) ? null : t));
      await pollInAppNotifications();
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setMarkingNotifId(null);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    if (!isAdmin || !authUser?.id) return;
    setMarkingAllNotifs(true);
    try {
      const ts = new Date().toISOString();
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: ts, is_read: true })
        .eq("recipient_user_id", authUser.id)
        .is("read_at", null);
      if (error) throw error;
      setInAppNotifications((prev) => prev.map((x) => (x.read_at ? x : { ...x, read_at: ts, is_read: true })));
      setLiveToast(null);
      await pollInAppNotifications();
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setMarkingAllNotifs(false);
    }
  };

  const handleCopyTeamJoinCode = async () => {
    const code = userCompany?.code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setTeamCopyOk(true);
      setTimeout(() => setTeamCopyOk(false), 2000);
    } catch {
      alert("Could not copy to clipboard.");
    }
  };

  const handleSubmitAddEmployee = async (event) => {
    event.preventDefault();
    if (!isAdmin || !userCompany?.id) return;
    setTeamAddError("");
    const name = String(teamAddDraft.fullName || "").trim();
    const email = String(teamAddDraft.email || "").trim();
    const password = String(teamAddDraft.password || "");
    if (!name) {
      setTeamAddError("Name is required.");
      return;
    }
    if (!email) {
      setTeamAddError("Email is required.");
      return;
    }
    if (!looksLikeEmail(email)) {
      setTeamAddError("Enter a valid email.");
      return;
    }
    if (password.length < 6) {
      setTeamAddError("Password must be at least 6 characters.");
      return;
    }
    const eff = String(teamAddDraft.payRateEffectiveDate || "").trim();
    if (!eff) {
      setTeamAddError("Effective date is required.");
      return;
    }
    const hourlyNum = parseFloat(String(teamAddDraft.hourlyRate).replace(",", "."));
    if (!Number.isFinite(hourlyNum) || hourlyNum < 0) {
      setTeamAddError("Enter a valid pay rate.");
      return;
    }
    const role = teamAddDraft.role === "supervisor" ? "supervisor" : "employee";
    let joining_date = String(teamAddDraft.joiningDate || "").trim().slice(0, 10);
    if (!joining_date) {
      joining_date = calendarDateKeyInTimeZone(
        new Date(),
        userCompany.time_zone || DEFAULT_COMPANY_TIME_ZONE
      );
    }
    setTeamAddSubmitting(true);
    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        setTeamAddError("Not signed in.");
        return;
      }
      const res = await fetch("/api/create-employee", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          company_id: userCompany.id,
          full_name: name,
          email: email.toLowerCase(),
          password,
          role,
          hourly_rate: hourlyNum,
          pay_rate_effective_date: eff,
          joining_date,
          employment_status: "active",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTeamAddError(typeof json.error === "string" ? json.error : "Could not create employee.");
        return;
      }
      setTeamAddDraft({ ...TEAM_ADD_INITIAL_DRAFT });
      setTeamAddFormOpen(false);
      setTeamRefreshKey((k) => k + 1);
      setTeamRoleFeedback({ type: "success", text: "Employee added." });
    } catch (err) {
      setTeamAddError(getErrorMessage(err));
    } finally {
      setTeamAddSubmitting(false);
    }
  };

  const beginTeamMemberEdit = (row) => {
    if (!isAdmin) return;
    setTeamAddFormOpen(false);
    setTeamAddError("");
    setTeamAddDraft({ ...TEAM_ADD_INITIAL_DRAFT });
    const rowRoleNorm = normalizeMemberRole(row.role);
    const eff =
      row.payRateEffectiveDate != null && row.payRateEffectiveDate !== ""
        ? String(row.payRateEffectiveDate).slice(0, 10)
        : "";
    setTeamEditingMemberRowId(String(row.memberRowId));
    setTeamEditInlineError("");
    setTeamRoleFeedback({ type: "", text: "" });
    const joinEff =
      row.joiningDate != null && row.joiningDate !== ""
        ? String(row.joiningDate).slice(0, 10)
        : "";
    setTeamEditDraft({
      fullName: (row.fullName && String(row.fullName).trim()) || "",
      email: (row.profileEmailRaw && String(row.profileEmailRaw).trim()) || "",
      newPassword: "",
      memberRole:
        rowRoleNorm === "supervisor"
          ? "supervisor"
          : rowRoleNorm === "owner"
            ? "owner"
            : "employee",
      hourlyRate: row.hourlyRate != null ? String(row.hourlyRate) : "",
      payRateEffectiveDate: eff,
      joiningDate: joinEff,
      employmentStatus: row.employmentStatus === "archived" ? "archived" : "active",
    });
  };

  const cancelTeamMemberEdit = () => {
    setTeamEditingMemberRowId(null);
    setTeamEditDraft(null);
    setTeamEditInlineError("");
  };

  const handleTeamMemberSave = async (row) => {
    if (!isAdmin || !userCompany?.id || !teamEditDraft || String(teamEditingMemberRowId) !== String(row.memberRowId)) {
      return;
    }
    const isOwner = normalizeMemberRole(row.role) === "owner";
    if (isOwner && teamEditDraft.employmentStatus === "archived") {
      setTeamEditInlineError("The owner cannot be archived.");
      return;
    }

    const nameDraft = String(teamEditDraft.fullName || "").trim();
    const emailDraft = String(teamEditDraft.email || "").trim().toLowerCase();
    const passwordDraft = String(teamEditDraft.newPassword || "").trim();

    if (!nameDraft) {
      setTeamEditInlineError("Name is required.");
      return;
    }
    if (!looksLikeEmail(emailDraft)) {
      setTeamEditInlineError("Enter a valid email.");
      return;
    }
    if (passwordDraft && passwordDraft.length < 6) {
      setTeamEditInlineError("New password must be at least 6 characters.");
      return;
    }

    const origName = (row.fullName && String(row.fullName).trim()) || "";
    const origEmail = ((row.profileEmailRaw && String(row.profileEmailRaw).trim()) || "").toLowerCase();

    const loginFieldsDirty =
      nameDraft !== origName || emailDraft !== origEmail || passwordDraft.length > 0;

    const ownerLoginLocked = isOwner && String(authUser?.id) !== String(row.userId);

    if (loginFieldsDirty && ownerLoginLocked) {
      setTeamEditInlineError("Only the owner can change this account's login email or password.");
      return;
    }

    setTeamSavingMemberRowId(String(row.memberRowId));
    setTeamEditInlineError("");
    const hourlyNum = parseFloat(String(teamEditDraft.hourlyRate).replace(",", "."));
    const hourly_rate = Number.isFinite(hourlyNum) ? hourlyNum : 0;
    let pay_date = teamEditDraft.payRateEffectiveDate?.trim() || null;
    if (pay_date === "") pay_date = null;
    let join_date = teamEditDraft.joiningDate?.trim() || null;
    if (join_date === "") join_date = null;

    let newCompanyRole = normalizeMemberRole(row.role);
    if (!isOwner) {
      newCompanyRole = teamEditDraft.memberRole === "supervisor" ? "supervisor" : "employee";
    }

    try {
      if (loginFieldsDirty && !ownerLoginLocked) {
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;
        const accessToken = sessionData?.session?.access_token;
        if (!accessToken) {
          throw new Error("Not signed in.");
        }
        const apiBody = {
          company_id: userCompany.id,
          target_user_id: row.userId,
          full_name: nameDraft,
          email: emailDraft,
        };
        if (passwordDraft) {
          apiBody.new_password = passwordDraft;
        }
        const res = await fetch("/api/update-employee-login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(apiBody),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(typeof json.error === "string" ? json.error : "Could not update login details.");
        }
        if (String(row.userId) === String(authUser?.id)) {
          setProfileFullName(nameDraft);
        }
      }

      if (!isOwner && newCompanyRole !== normalizeMemberRole(row.role)) {
        const { error: mErr } = await supabase
          .from("company_members")
          .update({ role: newCompanyRole })
          .eq("id", row.memberRowId)
          .eq("company_id", userCompany.id)
          .eq("user_id", row.userId);
        if (mErr) throw mErr;
      }

      const profilePayload = {
        full_name: nameDraft,
        email: emailDraft,
        hourly_rate,
        pay_rate_effective_date: pay_date,
        joining_date: join_date,
        employment_status: isOwner ? "active" : teamEditDraft.employmentStatus,
      };
      if (!isOwner) {
        profilePayload.role = newCompanyRole === "supervisor" ? "supervisor" : "employee";
      }

      const { error: pErr } = await supabase.from("profiles").update(profilePayload).eq("id", row.userId);
      if (pErr) {
        if (isMissingDbColumnError(pErr)) {
          throw new Error(`Missing profiles columns. ${TEAM_PROFILES_SQL_HINT} (${getErrorMessage(pErr)})`);
        }
        throw pErr;
      }

      if (!isOwner && String(row.userId) === String(authUser?.id)) {
        setUserCompanyRole(normalizeCompanyMemberRole(newCompanyRole));
        setAuthRole(newCompanyRole === "supervisor" ? "supervisor" : "employee");
        setProfileEmploymentStatus(normalizeEmploymentStatus(teamEditDraft.employmentStatus));
      }

      const newDisplay =
        nameDraft || emailDraft
          ? nameDraft || emailDraft.split("@")[0] || shortUserLabel(row.userId)
          : row.displayName;

      setTeamRows((prev) =>
        prev.map((r) =>
          String(r.memberRowId) === String(row.memberRowId)
            ? {
                ...r,
                role: !isOwner ? newCompanyRole : r.role,
                fullName: nameDraft,
                profileEmailRaw: emailDraft,
                displayName: newDisplay || r.displayName,
                hourlyRate: hourly_rate,
                payRateEffectiveDate: pay_date,
                joiningDate: join_date,
                employmentStatus: teamEditDraft.employmentStatus,
              }
            : r
        )
      );
      setTeamRefreshKey((k) => k + 1);
      setTeamRoleFeedback({
        type: "success",
        text: loginFieldsDirty ? "Member saved (including login details)." : "Member saved.",
      });
      cancelTeamMemberEdit();
    } catch (err) {
      setTeamEditInlineError(getErrorMessage(err));
    } finally {
      setTeamSavingMemberRowId(null);
    }
  };

  const handleSaveCompanyTimeZone = async (event) => {
    event.preventDefault();
    if (!isAdmin || !userCompany?.id) return;
    setSettingsTzSaving(true);
    setSettingsTzMessage("");
    try {
      const { error } = await supabase
        .from("companies")
        .update({ time_zone: settingsTzDraft })
        .eq("id", userCompany.id);
      if (error) throw error;
      setUserCompany((prev) => (prev ? { ...prev, time_zone: settingsTzDraft } : prev));
      setSettingsTzMessage("Company time zone saved.");
    } catch (err) {
      setSettingsTzMessage(getErrorMessage(err));
    } finally {
      setSettingsTzSaving(false);
    }
  };

  const handleCloseStaleShift = async (record) => {
    if (!isAdmin) return;
    const rowId = record.supabaseTimesheetId ?? record.id;
    if (rowId == null) return;
    if (
      !window.confirm(
        "Close this shift now? Clock-out will be set to the current time and the row marked Submitted."
      )
    ) {
      return;
    }
    setClosingShiftId(String(rowId));
    try {
      const clockOutTime = new Date().toISOString();
      const { update: labourUpdate } = await buildTimesheetClockOutUpdate(supabase, {
        userId: record.userId,
        clockInIso: record.clockIn,
        clockOutIso: clockOutTime,
        timesheetHourlyRate: record.hourlyRate,
      });
      const { error } = await supabase.from("timesheets").update(labourUpdate).eq("id", rowId);
      if (error) throw error;
      const myLiveId = visibleCurrentShift?.supabaseTimesheetId;
      if (myLiveId != null && String(myLiveId) === String(rowId)) {
        setCurrentShift(null);
      }
      if (authUser?.id && userCompany?.id) {
        const empLabel =
          pickGoodFreeformEmployeeName(record) ||
          (record.employeeEmail && String(record.employeeEmail).trim()) ||
          shortUserLabel(record.userId || record.employeeId);
        void createCompanyNotifications(supabase, {
          companyId: userCompany.id,
          actorUserId: authUser.id,
          actorRole: resolvedCompanyRole,
          type: "clock_out",
          title: clockOutTitleForActorRole(resolvedCompanyRole),
          message: `${empLabel} clocked out from ${record.project} - ${record.costCenter}`,
          projectId: record.projectId,
          projectName: record.project,
          costCentre: record.costCenter,
          relatedTimesheetId: rowId,
          relatedFolder: record.projectFolder || getProjectFolderName(record.project || ""),
          itemCount: null,
        });
      }
      await fetchTimesheetsFromSupabase();
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setClosingShiftId(null);
    }
  };

  const renderTimesheetCard = (record, allowEdit = true) => {
    const st = normalizeStatus(record.status);
    const statusBadgeLabel =
      st === "active"
        ? "Active"
        : st === "submitted"
          ? "Submitted"
          : (String(record.status ?? "").trim() || "Submitted");
    const statusBadgeClass =
      st === "admin approval required" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700";

    const recordRowId = record.supabaseTimesheetId ?? record.id;
    const isLiveOpen = isTimesheetLiveOpenRow(record, visibleCurrentShift, now, companyTimeZone);

    let outText = "—";
    let outClass = "font-semibold text-slate-900";
    let staleActiveMissingOut = false;
    let submittedMissingClockOut = false;
    let showCloseShift = false;

    if (st === "active" && !record.clockOut) {
      if (isLiveOpen) {
        outText = "Still clocked in";
      } else {
        outText = "Missing clock-out";
        outClass = "font-semibold text-amber-700";
        staleActiveMissingOut = true;
        if (isAdmin) showCloseShift = true;
      }
    } else if (st === "submitted" && record.clockOut) {
      outText = formatTime(record.clockOut, companyTimeZone);
    } else if (st === "submitted" && !record.clockOut) {
      outText = "Missing clock-out";
      outClass = "font-semibold text-amber-700";
      submittedMissingClockOut = true;
    } else if (record.clockOut) {
      outText = formatTime(record.clockOut, companyTimeZone);
    }

    const busyClose = closingShiftId != null && String(recordRowId) === closingShiftId;
    const busyDelete = deletingTimesheetId != null && String(recordRowId) === deletingTimesheetId;
    const editCentres =
      editingRecordId === record.id ? costCentresForEditProject(editProjectId) : [];

    const timesheetTitle = resolveTimesheetEmployeeTitle(record, {
      profileFullName,
      authUser,
      teamProfileFullNameByUserId,
    });
    const timesheetEmailSecondary = resolveTimesheetEmployeeSecondary(record, timesheetTitle);

    const rateFromTimesheet = Number(record.hourlyRate ?? 0);
    const totalCostDisplay =
      record.clockOut && record.labour_cost != null && record.labour_cost !== ""
        ? Number(record.labour_cost)
        : getLabourCost(record);

    return (
    <div key={record.id} className="rounded-2xl border bg-white p-4">
      <div className="flex justify-between gap-3">
        <div>
          <p className="font-semibold">{timesheetTitle}</p>
          {timesheetEmailSecondary && (
            <p className="text-[11px] text-slate-500 mt-0.5 break-all">{timesheetEmailSecondary}</p>
          )}
          <p className="text-xs text-slate-600">{record.project}</p>
          <p className="text-xs text-slate-500">Cost Centre: {record.costCenter || "Not selected"}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs h-fit ${statusBadgeClass}`}>
          {statusBadgeLabel}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 text-xs text-slate-600">
        <div><p>Hours</p><p className="font-semibold text-slate-900">{formatDuration(getWorkedMinutes(record))}</p></div>
        <div><p>Rate</p><p className="font-semibold text-slate-900">{formatMoney(rateFromTimesheet)}/hr</p></div>
        <div>
          <p>Total Cost</p>
          <p className="font-semibold text-slate-900">
            {formatMoney(Number.isFinite(totalCostDisplay) ? totalCostDisplay : getLabourCost(record))}
          </p>
        </div>
      </div>

      {editingRecordId === record.id ? (
        <div className="mt-3 border-t pt-2 space-y-2">
          <p className="text-[10px] text-slate-500 leading-tight">Edit in {companyTimeZone}</p>
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500">Clock in</label>
            <div className="flex gap-1">
              <input
                type="date"
                className="min-w-0 flex-1 rounded-lg border px-1 py-1 text-[11px]"
                value={editClockInDate}
                onChange={(e) => setEditClockInDate(e.target.value)}
              />
              <input
                type="time"
                className="w-[6.25rem] shrink-0 rounded-lg border px-1 py-1 text-[11px]"
                value={editClockInTime}
                onChange={(e) => setEditClockInTime(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500">Clock out</label>
            <div className="flex gap-1">
              <input
                type="date"
                className="min-w-0 flex-1 rounded-lg border px-1 py-1 text-[11px]"
                value={editClockOutDate}
                onChange={(e) => setEditClockOutDate(e.target.value)}
              />
              <input
                type="time"
                className="w-[6.25rem] shrink-0 rounded-lg border px-1 py-1 text-[11px]"
                value={editClockOutTime}
                onChange={(e) => setEditClockOutTime(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500">Project</label>
            <select
              className="w-full rounded-lg border py-1.5 px-2 text-xs"
              value={editProjectId}
              onChange={(e) => {
                const v = e.target.value;
                setEditProjectId(v);
                const c = effectiveCostCentresByProjectId[v] || effectiveCostCentresByProjectId[Number(v)] || [];
                setEditCostCenter(c[0] || "");
              }}
            >
              {effectiveProjects.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500">Cost centre</label>
            <select
              className="w-full rounded-lg border py-1.5 px-2 text-xs"
              value={editCostCenter}
              onChange={(e) => setEditCostCenter(e.target.value)}
              disabled={editCentres.length === 0}
            >
              {editCentres.length === 0 ? (
                <option value="">—</option>
              ) : (
                editCentres.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <Button
              type="button"
              className="rounded-lg h-9 text-[11px] font-semibold"
              disabled={editTimesheetSaving}
              onClick={() => void saveEditedRecord(record)}
            >
              {editTimesheetSaving ? "Saving…" : "Save"}
            </Button>
            <Button type="button" className="rounded-lg h-9 text-[11px]" disabled={editTimesheetSaving} onClick={cancelEditRecord}>
              Cancel
            </Button>
          </div>
          {isAdmin && !editTimesheetSaving && (
            <Button
              type="button"
              className="w-full rounded-xl h-9 text-[11px] font-semibold bg-red-600 text-white border border-red-800 shadow-sm active:bg-red-700 disabled:opacity-100 disabled:bg-red-500 disabled:text-white"
              disabled={busyDelete}
              onClick={() => void handleDeleteTimesheetRecord(record)}
            >
              {busyDelete ? "Deleting…" : "🗑 Delete"}
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-slate-600 border-t pt-3">
            <div><p>In</p><p className="font-semibold text-slate-900">{formatTime(record.clockIn, companyTimeZone)}</p></div>
            <div><p>Out</p><p className={outClass}>{outText}</p></div>
          </div>
          {(record.clockInLocation || record.clockOutLocation) && (
            <div className="mt-2 space-y-1 text-[11px] text-slate-600 border-t border-slate-100 pt-2">
              {record.clockInLocation && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span>Clock In Location:</span>
                  <button
                    type="button"
                    className="text-blue-700 font-semibold underline"
                    onClick={() => openMap(record.clockInLocation)}
                  >
                    View Map
                  </button>
                </div>
              )}
              {record.clockOutLocation && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span>Clock Out Location:</span>
                  <button
                    type="button"
                    className="text-blue-700 font-semibold underline"
                    onClick={() => openMap(record.clockOutLocation)}
                  >
                    View Map
                  </button>
                </div>
              )}
            </div>
          )}
          {staleActiveMissingOut && (
            <p className="mt-1 text-[11px] text-amber-700">This shift was never clocked out.</p>
          )}
          {submittedMissingClockOut && (
            <p className="mt-1 text-[11px] text-amber-700">No clock-out on file for this submitted row.</p>
          )}
          {showCloseShift && (
            <Button
              type="button"
              className="w-full rounded-xl h-9 text-xs mt-2 border border-slate-300 bg-white text-slate-800 font-semibold"
              disabled={busyClose}
              onClick={() => void handleCloseStaleShift(record)}
            >
              {busyClose ? "Closing…" : "Close shift"}
            </Button>
          )}
          {record.edited && <p className="mt-2 text-xs text-red-600">Time edited by employee — waiting for admin approval.</p>}
          {((allowEdit && canEditTimesheetRecord(record)) || isAdmin) && (
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {allowEdit && canEditTimesheetRecord(record) && (
                <Button
                  type="button"
                  className="rounded-xl h-9 text-[11px] col-span-2 sm:col-span-1"
                  disabled={busyDelete}
                  onClick={() => startEditRecord(record)}
                >
                  ✏️ Edit
                </Button>
              )}
              {isAdmin && (
                <Button
                  type="button"
                  className="rounded-xl h-9 text-[11px] font-semibold bg-red-600 text-white border border-red-800 shadow-sm active:bg-red-700 col-span-2 sm:col-span-1 disabled:opacity-100 disabled:bg-red-500 disabled:text-white"
                  disabled={busyDelete || busyClose}
                  onClick={() => void handleDeleteTimesheetRecord(record)}
                >
                  {busyDelete ? "Deleting…" : "🗑 Delete"}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
    );
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="text-4xl mb-3">⏱️</div>
          <p className="text-sm text-slate-300">Loading Clock App...</p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    if (authStep === "signup") {
      return (
        <div className="min-h-screen bg-neutral-950 flex justify-center items-center text-slate-900 p-4">
          <div className="w-full max-w-sm bg-slate-50 rounded-3xl shadow-2xl overflow-hidden">
            <div className="bg-white border-b p-5">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl">⏱️</div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Clock App</h1>
                  <p className="text-sm text-slate-600">Create Account</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSignup} className="p-5 space-y-4">
              <div>
                <h2 className="text-xl font-bold">Sign up</h2>
                <p className="text-sm text-slate-500 mt-1">Create an account to start using the clock app.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <input
                  type="text"
                  className="w-full rounded-2xl border bg-white p-3 text-sm"
                  value={signupName}
                  onChange={(event) => setSignupName(event.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <input
                  type="email"
                  className="w-full rounded-2xl border bg-white p-3 text-sm"
                  value={signupEmail}
                  onChange={(event) => setSignupEmail(event.target.value)}
                  placeholder="email@company.com"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Password</label>
                <input
                  type="password"
                  className="w-full rounded-2xl border bg-white p-3 text-sm"
                  value={signupPassword}
                  onChange={(event) => setSignupPassword(event.target.value)}
                  placeholder="Password"
                  autoComplete="new-password"
                  required
                />
              </div>

              {signupError && (
                <div className="rounded-2xl bg-red-50 border border-red-100 p-3 text-sm text-red-700">
                  {signupError}
                </div>
              )}

              <Button type="submit" className="w-full rounded-2xl h-14 text-base font-bold" disabled={signupLoading}>
                {signupLoading ? "Creating account..." : "Create account"}
              </Button>

              <button
                type="button"
                className="w-full text-sm text-slate-600 underline"
                onClick={() => {
                  setSignupError("");
                  setAuthStep("login");
                }}
              >
                Back to login
              </button>
            </form>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-neutral-950 flex justify-center items-center text-slate-900 p-4">
        <div className="w-full max-w-sm bg-slate-50 rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-white border-b p-5">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl">⏱️</div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Clock App</h1>
                <p className="text-sm text-slate-600">Ottawa Renovation Pro LTD</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleLogin} className="p-5 space-y-4">
            <div>
              <h2 className="text-xl font-bold">Login</h2>
              <p className="text-sm text-slate-500 mt-1">Enter your employee email and password.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <input
                type="email"
                className="w-full rounded-2xl border bg-white p-3 text-sm"
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                placeholder="employee@email.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <input
                type="password"
                className="w-full rounded-2xl border bg-white p-3 text-sm"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                required
              />
            </div>

            {loginError && (
              <div className="rounded-2xl bg-red-50 border border-red-100 p-3 text-sm text-red-700">
                {loginError}
              </div>
            )}

            <Button type="submit" className="w-full rounded-2xl h-14 text-base font-bold" disabled={loginLoading}>
              {loginLoading ? "Logging in..." : "Login"}
            </Button>

            {loginDebug && (
              <div className="rounded-2xl bg-slate-100 border border-slate-200 p-3 text-xs text-slate-700 whitespace-pre-wrap">
                Debug: {loginDebug}
              </div>
            )}

            <button
              type="button"
              className="w-full text-sm text-slate-600 underline"
              onClick={() => {
                setLoginError("");
                setAuthStep("signup");
              }}
            >
              Create new account
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Logged in, but still checking company membership.
  if (!companyChecked) {
    // Inline (non-blocking) loader: do not take over the whole app once opened.
    if (hasOpenedAppRef.current) {
      return (
        <div className="min-h-[100dvh] max-h-[100dvh] h-[100dvh] bg-neutral-950 flex justify-center text-slate-900 overflow-hidden">
          <div className="w-full max-w-sm h-full min-h-0 max-h-[100dvh] bg-slate-50 shadow-2xl relative flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-2.5 sm:p-4 space-y-2 sm:space-y-3 pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))]">
              <div className="rounded-3xl bg-white border shadow-sm p-2.5 sm:p-4">
                <p className="text-sm text-slate-700 font-semibold">Refreshing workspace…</p>
                <p className="text-xs text-slate-500 mt-1">You can keep using the app.</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="text-4xl mb-3">⏱️</div>
          <p className="text-sm text-slate-300">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  // Logged in, but not in a company yet → onboarding
  if (!userCompany) {
    if (authStep === "create_company") {
      return (
        <div className="min-h-screen bg-neutral-950 flex justify-center items-center text-slate-900 p-4">
          <div className="w-full max-w-sm bg-slate-50 rounded-3xl shadow-2xl overflow-hidden">
            <div className="bg-white border-b p-5">
              <h1 className="text-2xl font-bold tracking-tight">Create Company</h1>
              <p className="text-sm text-slate-600 mt-1">You’ll get a company code to share with employees.</p>
              <p className="text-[11px] text-slate-400 mt-1">Signed in as {authUser.email}</p>
            </div>

            <form onSubmit={handleCreateCompany} className="p-5 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Company name</label>
                <input
                  type="text"
                  className="w-full rounded-2xl border bg-white p-3 text-sm"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="Example: Ottawa Renovation Pro LTD"
                  required
                />
              </div>

              {companyError && (
                <div className="rounded-2xl bg-red-50 border border-red-100 p-3 text-sm text-red-700">
                  {companyError}
                </div>
              )}

              <Button type="submit" className="w-full rounded-2xl h-14 text-base font-bold" disabled={companyLoading}>
                {companyLoading ? "Creating company..." : "Create company"}
              </Button>

              <button
                type="button"
                className="w-full text-sm text-slate-600 underline"
                onClick={() => {
                  setCompanyError("");
                  setAuthStep("company_choice");
                }}
              >
                Back
              </button>
            </form>
          </div>
        </div>
      );
    }

    if (authStep === "join_company") {
      return (
        <div className="min-h-screen bg-neutral-950 flex justify-center items-center text-slate-900 p-4">
          <div className="w-full max-w-sm bg-slate-50 rounded-3xl shadow-2xl overflow-hidden">
            <div className="bg-white border-b p-5">
              <h1 className="text-2xl font-bold tracking-tight">Join Company</h1>
              <p className="text-sm text-slate-600 mt-1">Enter the company code your supervisor shared.</p>
              <p className="text-[11px] text-slate-400 mt-1">Signed in as {authUser.email}</p>
            </div>

            <form onSubmit={handleJoinCompany} className="p-5 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Company code</label>
                <input
                  type="text"
                  className="w-full rounded-2xl border bg-white p-3 text-sm uppercase"
                  value={joinCompanyCode}
                  onChange={(event) => setJoinCompanyCode(event.target.value)}
                  placeholder="ORP-123456"
                  required
                />
              </div>

              {companyError && (
                <div className="rounded-2xl bg-red-50 border border-red-100 p-3 text-sm text-red-700">
                  {companyError}
                </div>
              )}

              <Button type="submit" className="w-full rounded-2xl h-14 text-base font-bold" disabled={companyLoading}>
                {companyLoading ? "Joining..." : "Join company"}
              </Button>

              <button
                type="button"
                className="w-full text-sm text-slate-600 underline"
                onClick={() => {
                  setCompanyError("");
                  setAuthStep("company_choice");
                }}
              >
                Back
              </button>
            </form>
          </div>
        </div>
      );
    }

    if (authStep === "company_created" && createdCompanyCode) {
      return (
        <div className="min-h-screen bg-neutral-950 flex justify-center items-center text-slate-900 p-4">
          <div className="w-full max-w-sm bg-slate-50 rounded-3xl shadow-2xl overflow-hidden">
            <div className="bg-white border-b p-5">
              <h1 className="text-2xl font-bold tracking-tight">Company Created</h1>
              <p className="text-sm text-slate-600 mt-1">Share this code with employees so they can join.</p>
              <p className="text-[11px] text-slate-400 mt-1">Signed in as {authUser.email}</p>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-3xl border bg-white p-4 text-center">
                <p className="text-xs text-slate-500">Company code</p>
                <p className="text-3xl font-black tracking-widest mt-1">{createdCompanyCode}</p>
              </div>

              <Button
                className="w-full rounded-2xl h-14 text-base font-bold"
                onClick={async () => {
                  await navigator.clipboard?.writeText(createdCompanyCode).catch(() => {});
                  alert("Company code copied (or ready to copy).");
                }}
              >
                Copy code
              </Button>

              <Button
                className="w-full rounded-2xl h-14 text-base font-bold"
                onClick={() => {
                  setAuthStep("login");
                }}
              >
                Continue to Clock App
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // Default onboarding choice
    return (
      <div className="min-h-screen bg-neutral-950 flex justify-center items-center text-slate-900 p-4">
        <div className="w-full max-w-sm bg-slate-50 rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-white border-b p-5">
            <h1 className="text-2xl font-bold tracking-tight">Welcome</h1>
            <p className="text-sm text-slate-600 mt-1">Choose what you want to do next.</p>
            <p className="text-[11px] text-slate-400 mt-1">Signed in as {authUser.email}</p>
          </div>

          <div className="p-5 space-y-3">
            {companyError && (
              <div className="rounded-2xl bg-red-50 border border-red-100 p-3 text-sm text-red-700">
                {companyError}
              </div>
            )}

            <Button className="w-full rounded-2xl h-14 text-base font-bold" onClick={() => setAuthStep("create_company")}>
              Create new company
            </Button>
            <Button className="w-full rounded-2xl h-14 text-base font-bold" onClick={() => setAuthStep("join_company")}>
              Join existing company
            </Button>

            <button
              type="button"
              className="w-full text-sm text-slate-600 underline"
              onClick={() => handleLogout()}
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!hasOpenedAppRef.current) hasOpenedAppRef.current = true;

  return (
    <div className="min-h-[100dvh] max-h-[100dvh] h-[100dvh] bg-neutral-950 flex justify-center text-slate-900 overflow-hidden">
      <div className="w-full max-w-sm h-full min-h-0 max-h-[100dvh] bg-slate-50 shadow-2xl relative flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-2.5 sm:p-4 space-y-2 sm:space-y-3 pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))]">
          <div className="rounded-3xl bg-white border shadow-sm p-2.5 sm:p-4">
            <div className="flex items-start justify-between gap-2 sm:gap-3">
              <button onClick={() => setIsMenuOpen(true)} className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-slate-100 flex items-center justify-center text-lg sm:text-xl">☰</button>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">Clock App</h1>
                <p className="text-xs sm:text-sm text-slate-600 mt-0.5">{formatDate(now, companyTimeZone)}</p>
                <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">
                  Company time now: {formatTime(now, companyTimeZone)}
                </p>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-snug">Logged in as: {employeeDisplayName || authUser.email}</p>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-snug">Company: {userCompany?.name || "—"}</p>
                <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5">Role: {resolvedCompanyRole || authRole || "employee"}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Times: {companyTimeZone}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("notifications")}
                    className="relative h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-slate-100 flex items-center justify-center text-base sm:text-lg"
                    aria-label="Notifications"
                  >
                    🔔
                    {inAppNotifUnread > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[1.125rem] h-[1.125rem] px-0.5 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                        {inAppNotifUnread > 99 ? "99+" : inAppNotifUnread}
                      </span>
                    )}
                  </button>
                )}
                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-xl sm:text-2xl">⏱️</div>
              </div>
            </div>
          </div>

          {activeTab === "clock" && !visibleCurrentShift && isProfileArchived && (
            <Card className="rounded-3xl border border-slate-300 bg-slate-100 shadow-sm">
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-800">Account archived</p>
                <p className="text-xs text-slate-700 leading-snug">
                  Your account is archived. Please contact your supervisor.
                </p>
              </CardContent>
            </Card>
          )}

          {activeTab === "clock" && !isInstalled && (
            <Card className="rounded-3xl border-blue-100 bg-blue-50 shadow-sm">
              <CardContent className="p-3 space-y-2">
                <div>
                  <h2 className="font-bold text-sm sm:text-base">Install on Phone</h2>
                  <p className="text-xs text-slate-600 leading-snug">Add this PWA to the home screen and use it like an app.</p>
                </div>
                <Button onClick={handleInstallApp} className="w-full rounded-2xl h-11 text-sm">📲 Install App</Button>
                {!deferredPrompt && (
                  <p className="text-xs text-slate-500">
                    iPhone: Open in Safari → Tap Share → Add to Home Screen<br />
                    Android: Tap ⋮ → Install App / Add to Home Screen
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "clock" && !visibleCurrentShift && !isProfileArchived && (
            <Card className="rounded-3xl shadow-sm">
              <CardContent className="p-2.5 sm:p-4 space-y-2">
                <div className="flex items-center gap-1.5">
                  <div className="h-9 w-9 sm:h-11 sm:w-11 rounded-2xl bg-slate-100 flex items-center justify-center text-base sm:text-xl shrink-0">👷</div>
                  <div className="min-w-0">
                    <h2 className="font-bold text-sm sm:text-lg leading-tight">Start Shift</h2>
                    <p className="text-[11px] sm:text-xs text-slate-500 leading-snug">Choose project and cost centre</p>
                  </div>
                </div>

                {!useProjectFallback && !projectsLoading && effectiveProjects.length === 0 && (
                  <div className="rounded-2xl border bg-white p-3 space-y-1.5">
                    <p className="font-semibold">No projects yet</p>
                    <p className="text-xs text-slate-500">Ask your supervisor to add a project, or create one now if you're an owner/supervisor.</p>
                  </div>
                )}

                {projectsError && (
                  <div className="rounded-2xl bg-amber-50 border border-amber-100 p-3 text-xs text-amber-900">
                    Project loading failed — using emergency fallback projects.<br />
                    <span className="text-[11px] text-amber-800">{projectsError}</span>
                  </div>
                )}

                {!useProjectFallback &&
                  !projectsLoading &&
                  !isAdmin &&
                  effectiveProjects.length > 0 &&
                  clockSelectableProjects.length === 0 && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                      <p className="text-sm text-amber-950 leading-snug">
                        No projects assigned. Please contact your supervisor.
                      </p>
                    </div>
                  )}

                {!useProjectFallback && !projectsLoading && effectiveProjects.length === 0 && isAdmin && (
                  <form onSubmit={handleAddProject} className="rounded-3xl border bg-white p-2.5 space-y-2">
                    <div>
                      <p className="font-semibold">Add Project</p>
                      <p className="text-xs text-slate-500">Add a project and cost centres (comma-separated).</p>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs sm:text-sm font-medium">Project name</label>
                      <input
                        type="text"
                        className="w-full rounded-2xl border bg-white py-2 px-2.5 text-sm h-10"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="Example: Basement Renovation"
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs sm:text-sm font-medium">Cost centres</label>
                      <input
                        type="text"
                        className="w-full rounded-2xl border bg-white py-2 px-2.5 text-sm h-10"
                        value={newProjectCostCentres}
                        onChange={(e) => setNewProjectCostCentres(e.target.value)}
                        placeholder="Framing, Drywall, Painting"
                      />
                    </div>

                    {addProjectError && (
                      <div className="rounded-2xl bg-red-50 border border-red-100 p-3 text-xs text-red-700">
                        {addProjectError}
                      </div>
                    )}

                    <Button type="submit" className="w-full rounded-2xl h-11 text-sm font-bold" disabled={addProjectLoading}>
                      {addProjectLoading ? "Adding..." : "Add Project"}
                    </Button>
                  </form>
                )}

                <div className="space-y-1">
                  <label className="text-xs sm:text-sm font-medium">Project / Job Site</label>
                  <select
                    className="w-full rounded-2xl border bg-white py-2 px-2.5 text-sm h-10 sm:h-11 leading-tight"
                    value={projectId}
                    disabled={clockSelectableProjects.length === 0}
                    onChange={(event) => handleProjectChange(event.target.value)}
                  >
                    {clockSelectableProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs sm:text-sm font-medium">Cost Centre</label>
                  <select
                    className="w-full rounded-2xl border bg-white py-2 px-2.5 text-sm h-10 sm:h-11 leading-tight"
                    value={costCenter}
                    disabled={
                      !clockSelectedProject ||
                      clockSelectableProjects.length === 0 ||
                      clockCostCentresActive.length === 0
                    }
                    onChange={(event) => setCostCenter(event.target.value)}
                  >
                    {clockCostCentresActive.map((center) => (
                      <option key={center} value={center}>
                        {center}
                      </option>
                    ))}
                  </select>
                </div>

                {clockSelectedProject && clockCostCentresActive.length === 0 && (
                  <p className="text-xs text-amber-800 leading-snug">
                    {!isAdmin &&
                    (
                      effectiveCostCentresByProjectId[String(clockSelectedProject.id)] ||
                      effectiveCostCentresByProjectId[Number(clockSelectedProject.id)] ||
                      []
                    ).length > 0
                      ? "No cost centres assigned for this project. Please contact your supervisor."
                      : "No cost centres available for this project."}
                  </p>
                )}

                <Button
                  className="w-full rounded-2xl h-12 sm:h-14 text-sm sm:text-base font-bold"
                  disabled={
                    !clockSelectedProject ||
                    clockCostCentresActive.length === 0 ||
                    !costCenter
                  }
                  onClick={handleClockIn}
                >
                  ✅ Clock In
                </Button>
                {locationStatus && <p className="text-xs text-slate-500 text-center">{locationStatus}</p>}
              </CardContent>
            </Card>
          )}

          {activeTab === "clock" && visibleCurrentShift && (
            <Card className="rounded-3xl shadow-sm border-green-100 bg-green-50">
              <CardContent className="p-2.5 flex flex-col gap-2">
                {isProfileArchived && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-950 leading-snug">
                    Your account is archived. Please contact your supervisor. You can still clock out this shift.
                  </div>
                )}
                <div className="space-y-0.5">
                  <h2 className="font-bold text-sm sm:text-lg leading-tight">Active Shift</h2>
                  <p className="text-xs sm:text-sm text-slate-700 leading-snug">{activeShiftTitle}</p>
                  {activeShiftEmailSecondary && (
                    <p className="text-[10px] sm:text-[11px] text-slate-500 leading-snug break-all">{activeShiftEmailSecondary}</p>
                  )}
                  <p className="text-[11px] sm:text-xs text-slate-600 leading-snug">{visibleCurrentShift.project} • {visibleCurrentShift.costCenter}</p>
                  <p className="text-[11px] sm:text-xs text-slate-500">Rate: {formatMoney(visibleCurrentShift.hourlyRate)}/hr</p>
                  <p className="text-[11px] sm:text-xs text-slate-500">Folder: {visibleCurrentShift.projectFolder}</p>
                  <p className="text-[11px] sm:text-xs text-slate-500">Photos: {visibleCurrentShift.photosTaken || 0}</p>
                </div>

                <div className="text-center py-0">
                  <p className="text-[10px] sm:text-xs text-slate-500">Live Timer</p>
                  <p className="text-5xl sm:text-6xl font-black tabular-nums leading-none mt-0.5">{formatTimer(liveSeconds)}</p>
                  <p className="text-lg sm:text-xl font-bold mt-0.5 text-green-700">{formatMoney(liveEarnings)}</p>
                  <p className="text-[10px] sm:text-[11px] text-slate-500">Money earned</p>
                </div>

                {isChangingTask ? (
                  <div className="space-y-1.5">
                    <select className="w-full rounded-2xl border py-2 px-2 text-sm h-10" value={projectId} onChange={(e) => handleProjectChange(e.target.value)}>
                      {clockSelectableProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="w-full rounded-2xl border py-2 px-2 text-sm h-10"
                      value={costCenter}
                      disabled={clockCostCentresActive.length === 0}
                      onChange={(e) => setCostCenter(e.target.value)}
                    >
                      {clockCostCentresActive.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    {clockCostCentresActive.length === 0 && (
                      <p className="text-[10px] text-amber-800 leading-snug">
                        {!isAdmin &&
                        (
                          effectiveCostCentresByProjectId[String(clockSelectedProject.id)] ||
                          effectiveCostCentresByProjectId[Number(clockSelectedProject.id)] ||
                          []
                        ).length > 0
                          ? "No cost centres assigned for this project. Please contact your supervisor."
                          : "No cost centres available for this project."}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-1.5">
                      <Button
                        className="h-9 rounded-xl text-sm"
                        disabled={clockCostCentresActive.length === 0 || !costCenter}
                        onClick={applyTaskChange}
                      >
                        Save
                      </Button>
                      <Button className="h-9 rounded-xl text-sm" onClick={() => setIsChangingTask(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="block w-full rounded-2xl h-9 bg-slate-900 text-white text-center leading-9 text-xs sm:text-sm font-semibold cursor-pointer">
                        📷 Photo
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoCapture} />
                      </label>
                      <label className="block w-full rounded-2xl h-9 bg-green-700 text-white text-center leading-9 text-xs sm:text-sm font-semibold cursor-pointer">
                        🧾 Receipt
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleReceiptCapture} />
                      </label>
                    </div>
                    {photoStatus && <p className="text-xs text-slate-500 text-center">{photoStatus}</p>}
{uploadProgress !== null && (
  <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
    <div
      className="bg-green-600 h-3 rounded-full transition-all"
      style={{ width: `${uploadProgress}%` }}
    />
  </div>
)}

{uploadProgress !== null && (
  <p className="text-xs text-center text-slate-500">{uploadProgress}%</p>
)}
                    <div className="grid grid-cols-2 gap-1.5">
                      <Button className="w-full rounded-2xl h-11 text-sm" onClick={handleChangeTask}>🔄 Change Task</Button>
                      <Button className="w-full rounded-2xl h-11 text-sm" onClick={handleBreak}>☕ {!visibleCurrentShift.breakStart ? "Break" : !visibleCurrentShift.breakEnd ? "End Break" : "Done"}</Button>
                    </div>
                    <Button className="w-full rounded-2xl h-11 text-sm font-bold" onClick={handleClockOut}>🚪 Clock Out</Button>
                    {locationStatus && (
                      <p className="text-xs text-slate-500 text-center pt-0.5">{locationStatus}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "timesheet" && (
            <Card className="rounded-3xl shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-bold text-lg">My Timesheet</h2>
                    <p className="text-xs text-slate-500">
                      {isAdmin ? "All timesheets for this company" : "Only your submitted timesheets"}
                    </p>
                  </div>
                </div>
                {timesheetsLoading && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 mb-3">
                    Loading timesheets…
                  </div>
                )}
                {timesheetsError && (
                  <div className="rounded-2xl bg-amber-50 border border-amber-100 p-3 text-xs text-amber-900 mb-3">
                    Could not load timesheets from the server. Showing saved offline copy if available.<br />
                    <span className="text-[11px] text-amber-800">{timesheetsError}</span>
                  </div>
                )}
                <div className="space-y-3">
                  {visibleCurrentShift && (
                    <div className="rounded-2xl border bg-blue-50 p-4">
                      <div className="flex justify-between gap-3">
                        <div>
                          <p className="font-semibold">{activeShiftTitle}</p>
                          {activeShiftEmailSecondary && (
                            <p className="text-[11px] text-slate-500 break-all">{activeShiftEmailSecondary}</p>
                          )}
                          <p className="text-xs text-slate-600">{visibleCurrentShift.project}</p>
                          <p className="text-xs text-slate-500">Cost Centre: {visibleCurrentShift.costCenter}</p>
                          <p className="text-xs text-slate-500">Rate: {formatMoney(visibleCurrentShift.hourlyRate)}/hr</p>
                          <p className="text-xs text-slate-500">Live GPS: {formatLocation(visibleCurrentShift.liveLocation)}</p>
                        </div>
                        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-700 h-fit">Active</span>
                      </div>
                      <p className="text-sm mt-3">In: {formatTime(visibleCurrentShift.clockIn, companyTimeZone)}</p>
                      <p className="text-2xl font-black tabular-nums mt-2">{formatTimer(liveSeconds)}</p>
                      <p className="text-sm font-semibold mt-1 text-green-700">Money Earned: {formatMoney(liveEarnings)}</p>
                    </div>
                  )}
                  {!timesheetsLoading && visibleRecords.length === 0 && !visibleCurrentShift && (
                    <p className="text-sm text-slate-500 text-center py-8">No timesheet records for this user yet.</p>
                  )}
                  {visibleRecords.map((record) => renderTimesheetCard(record, true))}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "photos" && (
            <Card className="rounded-3xl shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div>
                  <h2 className="font-bold text-lg">Project Photos</h2>
                  <p className="text-xs text-slate-500">Supervisor can view photos saved by employees</p>
                </div>
                <select className="w-full rounded-2xl border p-3 text-sm" value={selectedPhotoFolder} onChange={(event) => setSelectedPhotoFolder(event.target.value)}>
                  <option value="all">All Project Folders</option>
                  {photoFolders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
                </select>
                {photoFolders.length === 0 && <p className="text-sm text-slate-500 text-center py-8">No project photos yet.</p>}
                <div className="space-y-4">
                  {visiblePhotoFolders.map((folder) => (
                    <div key={folder} className="rounded-2xl border bg-white p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div><p className="font-semibold">{folder}</p><p className="text-xs text-slate-500">{(scopedProjectPhotos[folder] || []).length} photos</p></div>
                        <Button className="rounded-xl h-10 text-xs" onClick={() => shareProjectFolder(folder)}>Share Link</Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {(scopedProjectPhotos[folder] || []).map((photo) => (
                          <div key={photo.id} className="rounded-xl overflow-hidden border bg-slate-50">
                            <img src={photo.imageUrl || photo.dataUrl} alt="Project" className="w-full h-28 object-cover" />
                            <div className="p-2 text-[10px] text-slate-600">
                              <p className="font-semibold">{photo.employee}</p>
                              <p>{photo.costCenter}</p>
                              <p>{formatDate(new Date(photo.capturedAt), companyTimeZone)}</p>
                              <button className="underline text-blue-700" onClick={() => openMap(photo.location)}>Map</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "receipts" && (
            <Card className="rounded-3xl shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div><h2 className="font-bold text-lg">Receipts</h2><p className="text-xs text-slate-500">Receipt photos and totals by project</p></div>
                <select className="w-full rounded-2xl border p-3 text-sm" value={selectedReceiptFolder} onChange={(event) => setSelectedReceiptFolder(event.target.value)}>
                  <option value="all">All Project Folders</option>
                  {receiptFolders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
                </select>
                <div className="rounded-2xl bg-slate-100 p-4"><p className="text-xs text-slate-500">Receipt Total</p><p className="text-2xl font-bold">{formatMoney(receiptTotal)}</p></div>
                {receiptFolders.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-8">No receipts captured yet.</p>
                )}
                <div className="space-y-4">
                  {visibleReceiptFolders.map((folder) => {
                    const folderReceipts = scopedProjectReceipts[folder] || [];
                    const folderTotal = folderReceipts.reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0);
                    return (
                      <div key={folder} className="rounded-2xl border bg-white p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div><p className="font-semibold">{folder}</p><p className="text-xs text-slate-500">{folderReceipts.length} receipts</p></div>
                          <p className="font-bold">{formatMoney(folderTotal)}</p>
                        </div>
                        <div className="space-y-3">
                          {folderReceipts.map((receipt) => (
                            <div key={receipt.id} className="rounded-xl border bg-slate-50 overflow-hidden">
                              <img src={receipt.dataUrl} alt="Receipt" className="w-full h-36 object-cover" />
                              <div className="p-3 text-xs text-slate-600 space-y-1">
                                <div className="flex justify-between"><p className="font-semibold">{receipt.category}</p><p className="font-bold text-slate-900">{formatMoney(receipt.amount)}</p></div>
                                <p>{receipt.employee} • {receipt.costCenter}</p>
                                <p>{formatDate(new Date(receipt.capturedAt), companyTimeZone)}</p>
                                {receipt.note && <p>Note: {receipt.note}</p>}
                                <button className="underline text-blue-700" onClick={() => openMap(receipt.location)}>Map</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "notifications" && isAdmin && (
            <Card className="rounded-3xl shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between gap-2 items-start">
                  <div>
                    <h2 className="font-bold text-lg">Notifications</h2>
                    <p className="text-xs text-slate-500">{inAppNotifUnread} unread</p>
                  </div>
                  <Button
                    type="button"
                    className="rounded-xl h-9 px-3 text-xs font-semibold shrink-0"
                    disabled={markingAllNotifs || inAppNotifUnread === 0}
                    onClick={() => void handleMarkAllNotificationsRead()}
                  >
                    {markingAllNotifs ? "…" : "Mark all read"}
                  </Button>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Mobile alerts</p>
                  <Button
                    type="button"
                    className="w-full rounded-xl h-10 text-xs font-semibold"
                    onClick={() => void handleEnableMobileNotifications()}
                  >
                    Enable Mobile Notifications
                  </Button>
                  <p className="text-[11px] text-slate-600">
                    Status:{" "}
                    <span className="font-semibold">
                      {mobileNotifPermissionUi === "enabled"
                        ? "Enabled"
                        : mobileNotifPermissionUi === "blocked"
                          ? "Blocked"
                          : mobileNotifPermissionUi === "not_supported"
                            ? "Not supported"
                            : mobileNotifPermissionUi === "default"
                              ? "Not yet enabled"
                              : "—"}
                    </span>
                  </p>
                  <p className="text-[10px] text-slate-500 leading-snug">
                    Clock in and clock out only. Other alerts stay in the app until you allow more later.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Background (PWA)</p>
                  <Button
                    type="button"
                    className="w-full rounded-xl h-10 text-xs font-semibold"
                    onClick={() => void handleEnableBackgroundPush()}
                  >
                    Enable Background Notifications
                  </Button>
                  <p className="text-[11px] text-slate-600">
                    Status:{" "}
                    <span className="font-semibold">
                      {backgroundPushUi === "enabled"
                        ? "Enabled"
                        : backgroundPushUi === "blocked"
                          ? "Blocked"
                          : backgroundPushUi === "not_supported"
                            ? "Not supported"
                            : backgroundPushUi === "error"
                              ? "Error"
                              : backgroundPushUi === "default"
                                ? "Not yet enabled"
                                : "—"}
                    </span>
                  </p>
                  {backgroundPushError && (
                    <p className="text-[11px] text-red-700 leading-snug break-words">{backgroundPushError}</p>
                  )}
                  {backgroundPushSaveMessage && !backgroundPushError && (
                    <p className="text-[11px] text-emerald-800 leading-snug break-words">{backgroundPushSaveMessage}</p>
                  )}
                  <p className="text-[10px] text-slate-500 leading-snug">
                    Uses Web Push when the app or PWA is closed (requires deploy with push API and env keys).
                  </p>
                </div>
                {inAppNotifError && (
                  <div className="rounded-xl bg-amber-50 border border-amber-100 p-2 text-xs text-amber-900">{inAppNotifError}</div>
                )}
                {!inAppNotifError && inAppNotifications.length === 0 && (
                  <p className="text-xs text-slate-500 text-center py-4">No notifications yet.</p>
                )}
                <div className="space-y-2">
                  {inAppNotifications.map((n) => {
                    const unread = n.read_at == null && n.is_read !== true;
                    const ts = n.created_at
                      ? `${formatDate(parseStoredInstant(n.created_at), companyTimeZone)} · ${formatTime(n.created_at, companyTimeZone)}`
                      : "—";
                    return (
                      <div
                        key={n.id}
                        className={`rounded-xl border p-2.5 space-y-1 ${unread ? "border-slate-300 bg-white" : "border-slate-100 bg-slate-50"}`}
                      >
                        <p className={`text-sm leading-snug ${unread ? "font-semibold text-slate-900" : "font-medium text-slate-600"}`}>{n.title}</p>
                        <p className="text-xs text-slate-600 leading-snug">{n.message}</p>
                        <p className="text-[10px] text-slate-400">{ts}</p>
                        {unread && (
                          <Button
                            type="button"
                            className="rounded-lg h-8 text-[11px] px-2 mt-0.5"
                            disabled={markingNotifId === String(n.id)}
                            onClick={() => void handleMarkNotificationRead(n)}
                          >
                            {markingNotifId === String(n.id) ? "…" : "Mark as read"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "dashboard" && !isAdmin && (
            <Card className="rounded-3xl shadow-sm">
              <CardContent className="p-5 space-y-3">
                <h2 className="font-bold text-lg">Access restricted</h2>
                <p className="text-sm text-slate-600">Dashboard is only available to supervisors and company owners.</p>
                <Button type="button" className="w-full rounded-2xl h-11 text-sm font-semibold" onClick={() => setActiveTab("clock")}>
                  Back to Clock
                </Button>
              </CardContent>
            </Card>
          )}

          {activeTab === "dashboard" && isAdmin && (
            <Card className="rounded-3xl shadow-sm">
              <CardContent className="p-4 sm:p-5 space-y-4">
                <div>
                  <h2 className="font-bold text-lg">Dashboard</h2>
                  <p className="text-[10px] text-slate-400 mt-0.5">Times: {companyTimeZone}</p>
                </div>
                {!userCompany?.id || !companyChecked ? (
                  <p className="text-sm text-slate-600 rounded-xl border border-slate-200 bg-slate-50 p-3">Company not loaded. Please wait…</p>
                ) : null}
                {dashboardActionFeedback && (
                  <div
                    className={`rounded-xl border p-2.5 text-xs ${
                      dashboardActionFeedback.type === "success"
                        ? "border-green-100 bg-green-50 text-green-900"
                        : "border-red-100 bg-red-50 text-red-800"
                    }`}
                  >
                    {dashboardActionFeedback.text}
                  </div>
                )}
                {userCompany?.id && companyChecked ? (
                  <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-3 sm:p-4 space-y-3 min-w-0">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3 min-w-0">
                      <h3 className="text-sm font-bold text-slate-900">Live team (today)</h3>
                      <p className="text-sm text-slate-800 min-w-0">
                        <span className="text-slate-600 font-medium">Currently Working: </span>
                        <span className="font-bold tabular-nums text-slate-900">
                          {dashboardLoading ? "—" : (dashboardLiveWorkingCards || []).length}
                        </span>
                      </p>
                    </div>
                    {dashboardLiveLocationsLoading ? (
                      <p className="text-[11px] text-slate-600">Refreshing live GPS…</p>
                    ) : null}
                    {dashboardLiveLocationsError ? (
                      <p className="text-[11px] text-amber-800">{String(dashboardLiveLocationsError)}</p>
                    ) : null}
                    {dashboardLoading ? (
                      <p className="text-xs text-slate-600">Loading active employees…</p>
                    ) : null}
                    {!dashboardLoading &&
                      (dashboardLiveWorkingCards || []).map((card) => {
                        const { rep, uid, displayName } = card || {};
                        if (!rep || !uid) return null;
                        const liveCtx = {
                          selectedDateKey: calendarDateKeyInTimeZone(now, companyTimeZone) || "",
                          companyTimeZone,
                          now,
                          authUser,
                          visibleCurrentShift,
                        };
                        const att = teamAttendanceStatusForRecord(rep, liveCtx);
                        const statusLabel = att?.label ? String(att.label) : "—";
                        const clockInDisp = rep?.clockIn ? formatTime(rep.clockIn, companyTimeZone) : "—";
                        const liveLoc = dashboardLiveLocationByUserId?.[String(uid)];
                        const latRaw = liveLoc?.latitude ?? liveLoc?.lat;
                        const lngRaw = liveLoc?.longitude ?? liveLoc?.lng;
                        const hasLiveGps =
                          latRaw != null &&
                          lngRaw != null &&
                          Number.isFinite(Number(latRaw)) &&
                          Number.isFinite(Number(lngRaw));
                        const ciLoc = rep?.clockInLocation;
                        const hasClockInGps =
                          ciLoc &&
                          ciLoc.latitude != null &&
                          ciLoc.longitude != null &&
                          Number.isFinite(Number(ciLoc.latitude)) &&
                          Number.isFinite(Number(ciLoc.longitude));
                        return (
                          <div
                            key={`live-${String(uid)}`}
                            className="rounded-xl border border-white/90 bg-white p-3 space-y-2 shadow-sm min-w-0 max-w-full"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                              <p className="text-sm font-semibold text-slate-900 leading-snug break-words min-w-0 flex-1">
                                {displayName || "—"}
                              </p>
                              <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900 max-w-[55%] text-right break-words">
                                {statusLabel}
                              </span>
                            </div>
                            <dl className="grid grid-cols-1 gap-1.5 text-sm text-slate-800 min-w-0">
                              <div className="min-w-0">
                                <dt className="text-xs font-medium text-slate-500">Project</dt>
                                <dd className="font-medium break-words">{rep?.project != null ? String(rep.project) : "—"}</dd>
                              </div>
                              <div className="min-w-0">
                                <dt className="text-xs font-medium text-slate-500">Cost centre</dt>
                                <dd className="font-medium break-words">{rep?.costCenter != null ? String(rep.costCenter) : "—"}</dd>
                              </div>
                              <div className="min-w-0">
                                <dt className="text-xs font-medium text-slate-500">Clock-in</dt>
                                <dd className="font-semibold tabular-nums">{clockInDisp}</dd>
                              </div>
                            </dl>
                            <div className="text-xs leading-snug pt-1 border-t border-slate-100 min-w-0">
                              {hasLiveGps ? (
                                <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-start sm:gap-2">
                                  <span className="text-slate-700 break-all min-w-0">
                                    Live GPS:{" "}
                                    {formatLocation({
                                      latitude: Number(latRaw),
                                      longitude: Number(lngRaw),
                                    })}
                                  </span>
                                  <button
                                    type="button"
                                    className="text-blue-700 font-semibold underline shrink-0 text-left"
                                    onClick={() =>
                                      openMap({ latitude: Number(latRaw), longitude: Number(lngRaw) })
                                    }
                                  >
                                    Map
                                  </button>
                                </div>
                              ) : hasClockInGps ? (
                                <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-start sm:gap-2">
                                  <span className="text-slate-700 break-all min-w-0">
                                    Clock-in GPS: {formatLocation(ciLoc)}
                                  </span>
                                  <button
                                    type="button"
                                    className="text-blue-700 font-semibold underline shrink-0 text-left"
                                    onClick={() =>
                                      openMap({
                                        latitude: Number(ciLoc.latitude),
                                        longitude: Number(ciLoc.longitude),
                                      })
                                    }
                                  >
                                    Map
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-500">Location not available.</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    {!dashboardLoading && (!dashboardLiveWorkingCards || dashboardLiveWorkingCards.length === 0) ? (
                      <p className="text-sm text-slate-700 text-center py-2">No employees currently clocked in.</p>
                    ) : null}
                  </div>
                ) : null}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700" htmlFor="dashboard-view-date">
                    Date
                  </label>
                  <input
                    id="dashboard-view-date"
                    type="date"
                    className="w-full rounded-xl border bg-white px-2 py-2 text-sm"
                    value={dashboardViewDate}
                    onChange={(e) => setDashboardViewDate(e.target.value)}
                    disabled={!dashboardViewDate}
                  />
                  {dashboardSelectedDateLabel && (
                    <p className="text-xs text-slate-600">
                      Selected (company time): {dashboardSelectedDateLabel}
                    </p>
                  )}
                </div>
                {dashboardLoading && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Loading dashboard…
                  </div>
                )}
                {dashboardError && (
                  <div className="rounded-2xl bg-amber-50 border border-amber-100 p-3 text-xs text-amber-900">{dashboardError}</div>
                )}
                {!dashboardLoading && !dashboardError && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Clocked In</p>
                        <p className="text-base font-bold text-slate-900 tabular-nums">{dashboardSummary.clockedIn}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Total Hours</p>
                        <p className="text-base font-bold text-slate-900 tabular-nums leading-tight">
                          {formatDuration(dashboardSummary.totalMinutes)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Labour Cost</p>
                        <p className="text-base font-bold text-slate-900 tabular-nums leading-tight">
                          {formatMoney(dashboardSummary.totalCost)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Missing Clock-out</p>
                        <p className="text-base font-bold text-slate-900 tabular-nums">{dashboardSummary.missingOut}</p>
                      </div>
                    </div>
                    <div className="space-y-1.5 pt-1">
                      {dashboardRowsForAttendance.map((row) => {
                        const rowRoleNorm = normalizeMemberRole(row.role);
                        const userDayRows = dashboardDaySheets.filter((t) => String(t.userId) === String(row.userId));
                        const rep = pickRepresentativeTeamDayTimesheet(userDayRows);
                        const att = teamAttendanceStatusForRecord(rep, {
                          selectedDateKey: dashboardViewDate,
                          companyTimeZone,
                          now,
                          authUser,
                          visibleCurrentShift,
                        });
                        const dayMetrics = computeDashboardEmployeeDayMetrics(
                          userDayRows,
                          rep,
                          companyTimeZone,
                          getWorkedMinutes,
                          getLabourCost
                        );
                        const { inDisp, outDisp, totalDisp, labourDisp, projectDisp, costDisp } = dayMetrics;
                        const uid = String(row.userId);
                        const dashAssignedIds = new Set(
                          (dashboardAssignmentsByUserId[uid] || []).map((id) => String(id))
                        );
                        const dashProjectsForRow = effectiveProjects.filter((p) =>
                          dashAssignedIds.has(String(p.id))
                        );
                        const pickRaw =
                          dashboardClockPick[uid] || {
                            projectId: String(dashProjectsForRow[0]?.id ?? ""),
                            costCenter: costCentresForEditProject(dashProjectsForRow[0]?.id)[0] || "",
                          };
                        const pickProjectId =
                          dashProjectsForRow.some((p) => String(p.id) === String(pickRaw.projectId))
                            ? String(pickRaw.projectId)
                            : String(dashProjectsForRow[0]?.id ?? "");
                        const centresForPick = costCentresForEditProject(pickProjectId);
                        const pickCost =
                          pickRaw.costCenter && centresForPick.includes(pickRaw.costCenter)
                            ? pickRaw.costCenter
                            : centresForPick[0] || "";
                        const pick = { projectId: pickProjectId, costCenter: pickCost };
                        const showDashClockIn =
                          att.code === "none" || att.code === "clocked_out";
                        const showDashClockOut = att.code === "clocked_in";
                        const showDashFixOut = att.code === "missing_out";
                        const dashRowSaving = dashboardSavingUserId === uid;
                        const dashClockInBlocked =
                          dashProjectsForRow.length === 0 ||
                          !pickProjectId ||
                          centresForPick.length === 0;
                        const liveLoc = dashboardLiveLocationByUserId[uid];
                        const hasLiveMap =
                          att.code === "clocked_in" &&
                          liveLoc &&
                          liveLoc.latitude != null &&
                          liveLoc.longitude != null &&
                          Number.isFinite(Number(liveLoc.latitude)) &&
                          Number.isFinite(Number(liveLoc.longitude));
                        const isRowClockedIn = att.code === "clocked_in";
                        return (
                          <div
                            key={row.memberRowId}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-3 space-y-2"
                          >
                            <div className="flex items-start justify-between gap-3 min-w-0">
                              <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-slate-900 break-words">
                                {row.displayName}
                              </p>
                              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium capitalize leading-snug text-slate-700">
                                {rowRoleNorm}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0 text-xs">
                              {isRowClockedIn ? (
                                <span className="inline-flex items-center gap-1 font-semibold text-green-700">
                                  <span className="text-green-600" aria-hidden>
                                    ●
                                  </span>
                                  Clocked In
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-semibold text-red-700">
                                  <span className="text-red-600" aria-hidden>
                                    ●
                                  </span>
                                  Not Clocked In
                                </span>
                              )}
                              {hasLiveMap && (
                                <>
                                  <span className="text-slate-300 select-none" aria-hidden>
                                    ·
                                  </span>
                                  <button
                                    type="button"
                                    className="text-blue-700 font-semibold underline decoration-blue-700/50 underline-offset-2"
                                    onClick={() =>
                                      openMap({
                                        latitude: Number(liveLoc.latitude),
                                        longitude: Number(liveLoc.longitude),
                                      })
                                    }
                                  >
                                    Live Location
                                  </button>
                                </>
                              )}
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[13px] leading-snug text-slate-800">
                              <div className="min-w-0 break-words">
                                <span className="text-slate-500">In:</span>{" "}
                                <span className="font-semibold text-slate-900 tabular-nums">{inDisp}</span>
                              </div>
                              <div className="min-w-0 break-words">
                                <span className="text-slate-500">Out:</span>{" "}
                                <span className="font-semibold text-slate-900 tabular-nums">{outDisp}</span>
                              </div>
                              <div className="min-w-0 break-words">
                                <span className="text-slate-500">Total:</span>{" "}
                                <span className="font-semibold text-slate-900 tabular-nums">{totalDisp}</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[13px] leading-snug text-slate-800">
                              <div className="min-w-0 break-words">
                                <span className="text-slate-500">Labour:</span>{" "}
                                <span className="font-semibold text-slate-900 tabular-nums">{labourDisp}</span>
                              </div>
                              <div className="min-w-0 break-words">
                                <span className="text-slate-500">Project:</span>{" "}
                                <span className="font-semibold text-slate-900">{projectDisp}</span>
                              </div>
                              <div className="min-w-0 break-words">
                                <span className="text-slate-500">Cost:</span>{" "}
                                <span className="font-semibold text-slate-900">{costDisp}</span>
                              </div>
                            </div>
                            <div className="border-t border-slate-100 pt-2 mt-1 space-y-2">
                              {showDashClockIn && (
                                <>
                                  <div className="grid grid-cols-2 gap-2">
                                    <label className="block min-w-0 text-[10px] font-medium text-slate-600">
                                      Project
                                      <select
                                        className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-xs"
                                        value={pick.projectId}
                                        disabled={dashRowSaving || dashClockInBlocked}
                                        onChange={(e) => {
                                          const pid = e.target.value;
                                          const cents = costCentresForEditProject(pid);
                                          setDashboardClockPick((prev) => ({
                                            ...prev,
                                            [uid]: { projectId: pid, costCenter: cents[0] || "" },
                                          }));
                                        }}
                                      >
                                        {dashProjectsForRow.map((p) => (
                                          <option key={p.id} value={String(p.id)}>
                                            {p.name}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="block min-w-0 text-[10px] font-medium text-slate-600">
                                      Cost centre
                                      <select
                                        className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-xs"
                                        value={pick.costCenter}
                                        disabled={dashRowSaving || dashClockInBlocked}
                                        onChange={(e) =>
                                          setDashboardClockPick((prev) => ({
                                            ...prev,
                                            [uid]: {
                                              ...(prev[uid] || pick),
                                              costCenter: e.target.value,
                                            },
                                          }))
                                        }
                                      >
                                        {centresForPick.length === 0 ? (
                                          <option value="">—</option>
                                        ) : (
                                          centresForPick.map((c) => (
                                            <option key={c} value={c}>
                                              {c}
                                            </option>
                                          ))
                                        )}
                                      </select>
                                    </label>
                                  </div>
                                  {effectiveProjects.length === 0 && (
                                    <p className="text-[10px] text-amber-800">Add a company project to clock in.</p>
                                  )}
                                  {effectiveProjects.length > 0 && dashProjectsForRow.length === 0 && (
                                    <p className="text-[10px] text-amber-900 leading-snug">
                                      No projects assigned to this employee.
                                    </p>
                                  )}
                                  {effectiveProjects.length > 0 &&
                                    dashProjectsForRow.length > 0 &&
                                    pickProjectId &&
                                    centresForPick.length === 0 && (
                                      <p className="text-[10px] text-amber-900 leading-snug">
                                        No cost centres available for this project.
                                      </p>
                                    )}
                                  <Button
                                    type="button"
                                    className="w-full rounded-lg h-9 text-xs font-semibold"
                                    disabled={dashRowSaving || dashClockInBlocked}
                                    onClick={() => void handleDashboardEmployeeClockIn(row)}
                                  >
                                    {dashRowSaving ? "…" : "Clock In"}
                                  </Button>
                                </>
                              )}
                              {showDashClockOut && (
                                <Button
                                  type="button"
                                  className="w-full rounded-lg h-9 text-xs font-semibold"
                                  disabled={dashRowSaving || !rep?.supabaseTimesheetId}
                                  onClick={() => void handleDashboardEmployeeClockOutOrFix(row, rep, "clock_out")}
                                >
                                  {dashRowSaving ? "…" : "Clock Out"}
                                </Button>
                              )}
                              {showDashFixOut && (
                                <Button
                                  type="button"
                                  className="w-full rounded-lg h-9 text-xs font-semibold border border-amber-200 bg-amber-50 text-amber-900"
                                  disabled={dashRowSaving || !rep?.supabaseTimesheetId}
                                  onClick={() => void handleDashboardEmployeeClockOutOrFix(row, rep, "fix")}
                                >
                                  {dashRowSaving ? "…" : "Fix Clock Out"}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {dashboardRows.length === 0 && (
                      <p className="text-xs text-slate-500 text-center py-2">No members in this company.</p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "reports" && isAdmin && (
            <Card className="rounded-3xl shadow-sm">
              <CardContent className="p-4 sm:p-5 space-y-5">
                <div>
                  <h2 className="font-bold text-lg">Reports</h2>
                  <p className="text-[10px] text-slate-400 mt-0.5">Read-only · Times: {companyTimeZone}</p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-700">Quick range</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: "weekly", label: "Weekly" },
                      { id: "monthly", label: "Monthly" },
                      { id: "yearly", label: "Yearly" },
                      { id: "last_year", label: "Last Year" },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`rounded-full px-3.5 py-2 text-sm font-semibold border transition-colors leading-none ${
                          reportsRangePreset === p.id
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white text-slate-800 border-slate-200 active:bg-slate-50"
                        }`}
                        onClick={() => {
                          const { from, to } = computeReportsQuickRange(p.id, new Date(), companyTimeZone);
                          if (from && to) {
                            setReportsDateFrom(from);
                            setReportsDateTo(to);
                            setReportsRangePreset(p.id);
                          }
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-800">Group report</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="space-y-1 text-xs font-medium text-slate-700 min-w-0">
                      Level 1
                      <select
                        className="w-full rounded-xl border bg-white px-2 py-2 text-sm font-normal min-w-0"
                        value={reportsLevel1}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!REPORT_DIMS.includes(v)) return;
                          setReportsLevel1(v);
                          setReportsLevel2((p) => (p === v ? "none" : p));
                          setReportsLevel3((p) => (p === v ? "none" : p));
                          setReportsExpandedL1({});
                          setReportsExpandedL2({});
                        }}
                      >
                        <option value="employee">Employee</option>
                        <option value="project">Project</option>
                        <option value="cost_center">Cost Centre</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-xs font-medium text-slate-700 min-w-0">
                      Level 2
                      <select
                        className="w-full rounded-xl border bg-white px-2 py-2 text-sm font-normal min-w-0"
                        value={reportsLevel2}
                        onChange={(e) => {
                          const v = e.target.value;
                          setReportsLevel2(v);
                          if (v === "none") setReportsLevel3("none");
                          else
                            setReportsLevel3((p) =>
                              p === v || p === reportsLevel1 ? "none" : p
                            );
                          setReportsExpandedL1({});
                          setReportsExpandedL2({});
                        }}
                      >
                        <option value="none">None</option>
                        {REPORT_DIMS.filter((d) => d !== reportsLevel1).map((d) => (
                          <option key={d} value={d}>
                            {d === "employee"
                              ? "Employee"
                              : d === "project"
                                ? "Project"
                                : "Cost Centre"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-xs font-medium text-slate-700 min-w-0">
                      Level 3
                      <select
                        className="w-full rounded-xl border bg-white px-2 py-2 text-sm font-normal min-w-0 disabled:bg-slate-100 disabled:text-slate-500"
                        disabled={reportsLevel2 === "none"}
                        value={reportsLevel2 === "none" ? "none" : reportsLevel3}
                        onChange={(e) => {
                          setReportsLevel3(e.target.value);
                          setReportsExpandedL1({});
                          setReportsExpandedL2({});
                        }}
                      >
                        <option value="none">None</option>
                        {REPORT_DIMS.filter((d) => d !== reportsLevel1 && d !== reportsLevel2).map((d) => (
                          <option key={d} value={d}>
                            {d === "employee"
                              ? "Employee"
                              : d === "project"
                                ? "Project"
                                : "Cost Centre"}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                <div className="space-y-1 text-xs font-medium text-slate-600 min-w-0">
                  <span className="block text-[11px] font-medium text-slate-500">Secondary filter · Cost centres</span>
                  <details className="rounded-xl border border-slate-200 bg-white overflow-hidden group">
                      <summary className="px-2 py-2 cursor-pointer text-sm font-normal text-slate-900 list-none flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">
                          {reportsCostCentreAll
                            ? "All cost centres"
                            : reportsCostCentrePicked.length
                              ? `${reportsCostCentrePicked.length} selected`
                              : "Choose cost centres"}
                        </span>
                        <span className="text-slate-400 text-[10px] shrink-0 group-open:rotate-180 transition-transform">▼</span>
                      </summary>
                      <div className="border-t border-slate-100 px-2 py-2 space-y-2 max-h-44 overflow-y-auto overscroll-y-contain">
                        <label className="flex items-start gap-2 text-xs font-normal">
                          <input
                            type="checkbox"
                            className="mt-0.5 shrink-0"
                            checked={reportsCostCentreAll}
                            onChange={(e) => {
                              const on = e.target.checked;
                              setReportsCostCentreAll(on);
                              setReportsExpandedL1({});
                              setReportsExpandedL2({});
                              if (on) {
                                setReportsCostCentrePicked([]);
                              } else {
                                setReportsCostCentrePicked((prev) => {
                                  if (prev.length > 0) return prev;
                                  const next = reportsDistinctCostCentres.slice();
                                  return next;
                                });
                              }
                            }}
                          />
                          <span>All cost centres</span>
                        </label>
                        {!reportsCostCentreAll && (
                          <div className="space-y-1.5 pl-1 border-l-2 border-slate-100 ml-1">
                            {reportsDistinctCostCentres.length === 0 ? (
                              <p className="text-[11px] text-slate-500 leading-snug">No cost centres in loaded timesheets for this range.</p>
                            ) : (
                              reportsDistinctCostCentres.map((cc) => (
                                <label key={cc} className="flex items-start gap-2 text-xs font-normal">
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 shrink-0"
                                    checked={reportsCostCentrePicked.includes(cc)}
                                    onChange={(ev) => {
                                      const checked = ev.target.checked;
                                      setReportsExpandedL1({});
                                      setReportsExpandedL2({});
                                      setReportsCostCentrePicked((prev) => {
                                        if (checked) return [...new Set([...prev, cc])];
                                        return prev.filter((x) => x !== cc);
                                      });
                                    }}
                                  />
                                  <span className="min-w-0 break-words">{cc === "—" ? "(none)" : cc}</span>
                                </label>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </details>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-xs font-medium text-slate-700">
                    Date from
                    <input
                      type="date"
                      className="w-full rounded-xl border bg-white px-2 py-2 text-sm font-normal"
                      value={reportsDateFrom}
                      onChange={(e) => {
                        setReportsDateFrom(e.target.value);
                        setReportsRangePreset(null);
                        setReportsExpandedL1({});
                        setReportsExpandedL2({});
                      }}
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-slate-700">
                    Date to
                    <input
                      type="date"
                      className="w-full rounded-xl border bg-white px-2 py-2 text-sm font-normal"
                      value={reportsDateTo}
                      onChange={(e) => {
                        setReportsDateTo(e.target.value);
                        setReportsRangePreset(null);
                        setReportsExpandedL1({});
                        setReportsExpandedL2({});
                      }}
                    />
                  </label>
                </div>
                {reportsScreenLoading && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Loading reports…
                  </div>
                )}
                {reportsScreenError && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 leading-snug break-words">
                    {reportsScreenError}
                  </div>
                )}
                {!reportsScreenLoading && !reportsScreenError && reportsDateFrom && reportsDateTo && reportsDateFrom <= reportsDateTo && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Total hours</p>
                        <p className="text-lg font-bold text-slate-950 tabular-nums leading-snug">
                          {formatDuration(reportsAggregates.totalMinutes)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Labour cost</p>
                        <p className="text-lg font-bold text-slate-950 tabular-nums leading-snug">
                          {formatMoney(reportsAggregates.totalCost)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Missing clock-out</p>
                        <p className="text-lg font-bold text-slate-950 tabular-nums leading-snug">{reportsAggregates.missingOut}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-base font-bold text-slate-950 leading-snug">
                        Breakdown
                        <span className="text-sm font-semibold text-slate-600 block sm:inline sm:ml-1.5 mt-1 sm:mt-0 leading-snug">
                          ·{" "}
                          {reportsBreakdownTree.d1 === "employee"
                            ? "Employee"
                            : reportsBreakdownTree.d1 === "project"
                              ? "Project"
                              : "Cost Centre"}
                          {reportsBreakdownTree.d2 !== "none" && (
                            <>
                              {" "}
                              →{" "}
                              {reportsBreakdownTree.d2 === "employee"
                                ? "Employee"
                                : reportsBreakdownTree.d2 === "project"
                                  ? "Project"
                                  : "Cost Centre"}
                            </>
                          )}
                          {reportsBreakdownTree.d3 !== "none" && (
                            <>
                              {" "}
                              →{" "}
                              {reportsBreakdownTree.d3 === "employee"
                                ? "Employee"
                                : reportsBreakdownTree.d3 === "project"
                                  ? "Project"
                                  : "Cost Centre"}
                            </>
                          )}
                        </span>
                      </h3>

                      {reportsScreenRows.length > 0 && reportsRowsFilteredForUi.length === 0 ? (
                        <p className="text-sm text-slate-600 py-1 leading-snug">
                          No timesheets match the selected cost centres.
                        </p>
                      ) : reportsBreakdownTree.level1Rows.length === 0 ? (
                        <p className="text-sm text-slate-600 py-1 leading-snug">No timesheets in this range.</p>
                      ) : (
                        <div className="rounded-2xl border border-slate-200 overflow-x-hidden divide-y divide-slate-100 bg-white min-w-0">
                          {reportsBreakdownTree.level1Rows.map((n1) => {
                            const l1Key = String(n1.key);
                            const l2List = Array.isArray(n1.children) ? n1.children : [];
                            const openL1 = reportsBreakdownTree.hasL2 && Boolean(reportsExpandedL1[l1Key]);
                            return (
                              <div key={l1Key} className="px-3 py-3 space-y-2 min-w-0">
                                {reportsBreakdownTree.hasL2 ? (
                                  <button
                                    type="button"
                                    className="w-full text-left flex items-start justify-between gap-3 min-w-0"
                                    onClick={() =>
                                      setReportsExpandedL1((prev) => ({
                                        ...prev,
                                        [l1Key]: !prev[l1Key],
                                      }))
                                    }
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-bold text-slate-950 leading-snug break-words">
                                        <span className="mr-1.5 inline-block w-4 text-slate-400" aria-hidden>
                                          {openL1 ? "▾" : "▸"}
                                        </span>
                                        {n1.label}
                                      </p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <p className="text-sm font-bold text-slate-950 tabular-nums leading-snug">
                                        {formatDuration(n1.minutes)}
                                      </p>
                                      <p className="text-sm font-semibold text-slate-900 tabular-nums leading-snug">
                                        {formatMoney(n1.cost)}
                                      </p>
                                    </div>
                                  </button>
                                ) : (
                                  <div className="flex items-start justify-between gap-3 min-w-0">
                                    <p className="text-sm font-bold text-slate-950 leading-snug break-words min-w-0 flex-1">
                                      {n1.label}
                                    </p>
                                    <div className="shrink-0 text-right">
                                      <p className="text-sm font-bold text-slate-950 tabular-nums leading-snug">
                                        {formatDuration(n1.minutes)}
                                      </p>
                                      <p className="text-sm font-semibold text-slate-900 tabular-nums leading-snug">
                                        {formatMoney(n1.cost)}
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {reportsBreakdownTree.hasL2 && openL1 && (
                                  <div className="pl-4 border-l border-slate-100 space-y-2 min-w-0">
                                    {l2List.length === 0 ? (
                                      <p className="text-[13px] text-slate-600 leading-snug py-0.5">No breakdown data</p>
                                    ) : (
                                      l2List.map((n2) => {
                                        const l2Composite = `${l1Key}|||${String(n2.key)}`;
                                        const l3List = Array.isArray(n2.children) ? n2.children : [];
                                        const openL2 =
                                          reportsBreakdownTree.hasL3 && Boolean(reportsExpandedL2[l2Composite]);
                                        return (
                                          <div key={String(n2.key)} className="space-y-1.5 min-w-0">
                                            {reportsBreakdownTree.hasL3 ? (
                                              <>
                                                <button
                                                  type="button"
                                                  className="w-full text-left flex items-start justify-between gap-3 min-w-0"
                                                  onClick={() =>
                                                    setReportsExpandedL2((prev) => ({
                                                      ...prev,
                                                      [l2Composite]: !prev[l2Composite],
                                                    }))
                                                  }
                                                >
                                                  <div className="min-w-0 flex-1">
                                                    <p className="text-[13px] font-semibold text-slate-900 leading-snug break-words">
                                                      <span className="mr-1 inline-block w-3.5 text-slate-400 text-xs" aria-hidden>
                                                        {openL2 ? "▾" : "▸"}
                                                      </span>
                                                      {n2.label}
                                                    </p>
                                                  </div>
                                                  <div className="shrink-0 text-right tabular-nums">
                                                    <p className="text-[13px] font-semibold text-slate-900 leading-snug">
                                                      {formatDuration(n2.minutes)}
                                                    </p>
                                                    <p className="text-[13px] font-medium text-slate-800 leading-snug">
                                                      {formatMoney(n2.cost)}
                                                    </p>
                                                  </div>
                                                </button>
                                                {openL2 && (
                                                  <div className="pl-3 border-l border-slate-100 space-y-1 min-w-0">
                                                    {l3List.length === 0 ? (
                                                      <p className="text-[12px] text-slate-600 leading-snug py-0.5">
                                                        No breakdown data
                                                      </p>
                                                    ) : (
                                                      l3List.map((n3) => (
                                                        <div
                                                          key={String(n3.key)}
                                                          className="flex items-start justify-between gap-3 py-0.5 min-w-0"
                                                        >
                                                          <p className="min-w-0 flex-1 text-[12px] font-semibold text-slate-900 leading-snug break-words">
                                                            {n3.label}
                                                          </p>
                                                          <div className="shrink-0 text-right tabular-nums">
                                                            <p className="text-[12px] font-semibold text-slate-900 leading-snug">
                                                              {formatDuration(n3.minutes)}
                                                            </p>
                                                            <p className="text-[12px] font-medium text-slate-800 leading-snug">
                                                              {formatMoney(n3.cost)}
                                                            </p>
                                                          </div>
                                                        </div>
                                                      ))
                                                    )}
                                                  </div>
                                                )}
                                              </>
                                            ) : (
                                              <div className="flex items-start justify-between gap-3 py-0.5 min-w-0">
                                                <p className="min-w-0 flex-1 text-[13px] font-semibold text-slate-900 leading-snug break-words">
                                                  {n2.label}
                                                </p>
                                                <div className="shrink-0 text-right tabular-nums">
                                                  <p className="text-[13px] font-semibold text-slate-900 leading-snug">
                                                    {formatDuration(n2.minutes)}
                                                  </p>
                                                  <p className="text-[13px] font-medium text-slate-800 leading-snug">
                                                    {formatMoney(n2.cost)}
                                                  </p>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "projects" && isAdmin && (
            <Card className="rounded-3xl shadow-sm">
              <CardContent className="p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-bold text-lg">Projects</h2>
                    <p className="text-xs text-slate-500">Company projects and cost centres</p>
                  </div>
                  {!projectsAddFormOpen && (
                    <Button
                      type="button"
                      className="shrink-0 rounded-xl h-9 px-3 text-xs font-semibold"
                      onClick={() => {
                        setProjectsEditSuccess("");
                        setEditingProjectId(null);
                        setProjectEditDraft(null);
                        setProjectEditError("");
                        setProjectsAddSuccess("");
                        setProjectsAddError("");
                        setAssignmentsManageProjectId(null);
                        setAssignmentsEditorMembers([]);
                        setAssignmentsEditorChecks({});
                        setAssignmentsEditorError("");
                        setAssignmentsSuccess("");
                        setProjectsAddFormOpen(true);
                      }}
                    >
                      Add Project
                    </Button>
                  )}
                </div>
                {projectsAddFormOpen && (
                  <form
                    onSubmit={(e) => void handleProjectsScreenSaveNewProject(e)}
                    className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 space-y-2.5"
                  >
                    <p className="text-xs font-semibold text-slate-800">New project</p>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-slate-600" htmlFor="projects-add-name">
                        Project name
                      </label>
                      <input
                        id="projects-add-name"
                        type="text"
                        className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                        value={projectsAddName}
                        onChange={(e) => setProjectsAddName(e.target.value)}
                        placeholder="e.g. Basement Renovation"
                        disabled={projectsAddSaving}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="block text-[11px] font-medium text-slate-600">Status</p>
                      <p className="text-xs font-medium text-slate-900">active</p>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-slate-600" htmlFor="projects-add-cc">
                        Cost centres
                      </label>
                      <input
                        id="projects-add-cc"
                        type="text"
                        className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                        value={projectsAddCostCentres}
                        onChange={(e) => setProjectsAddCostCentres(e.target.value)}
                        placeholder="Comma-separated, e.g. Framing, Drywall, Painting"
                        disabled={projectsAddSaving}
                      />
                    </div>
                    {projectsAddError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-900 leading-snug">
                        {projectsAddError}
                      </div>
                    )}
                    <div className="flex gap-2 pt-0.5">
                      <Button
                        type="submit"
                        className="flex-1 rounded-lg h-9 text-xs font-semibold"
                        disabled={projectsAddSaving}
                      >
                        {projectsAddSaving ? "Saving…" : "Save"}
                      </Button>
                      <Button
                        type="button"
                        className="flex-1 rounded-lg h-9 text-xs font-semibold !bg-white !text-slate-900 border-2 border-slate-400 shadow-sm hover:!bg-slate-100"
                        disabled={projectsAddSaving}
                        onClick={cancelProjectsAddForm}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}
                {projectsAddSuccess && (
                  <div className="rounded-2xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900">
                    {projectsAddSuccess}
                  </div>
                )}
                {projectsEditSuccess && (
                  <div className="rounded-2xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900">
                    {projectsEditSuccess}
                  </div>
                )}
                {assignmentsSuccess && (
                  <div className="rounded-2xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900">
                    {assignmentsSuccess}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide shrink-0">Show:</span>
                  <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                    {[
                      { id: "active", label: "Active" },
                      { id: "archived", label: "Archived" },
                      { id: "all", label: "All" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                          projectsListFilter === opt.id
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                        onClick={() => setProjectsListFilter(opt.id)}
                        disabled={
                          Boolean(projectEditSaving) ||
                          Boolean(projectsAddSaving) ||
                          Boolean(assignmentsEditorSaving)
                        }
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {projectsScreenLoading && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Loading projects…
                  </div>
                )}
                {projectsScreenError && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900 leading-snug">
                    {projectsScreenError}
                  </div>
                )}
                {!projectsScreenLoading && !projectsScreenError && projectsScreenRows.length === 0 && (
                  <p className="text-xs text-slate-500 text-center py-4">No projects for this company yet.</p>
                )}
                {!projectsScreenLoading &&
                  !projectsScreenError &&
                  projectsScreenRows.length > 0 &&
                  displayedProjectsScreenRows.length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-4">
                      {projectsListFilter === "all"
                        ? "No projects match this filter."
                        : `No ${projectsListFilter === "active" ? "active" : "archived"} projects in this view.`}
                    </p>
                  )}
                {!projectsScreenLoading && !projectsScreenError && displayedProjectsScreenRows.length > 0 && (
                  <div className="space-y-2.5">
                    {displayedProjectsScreenRows.map((proj) => {
                      const isEditing = editingProjectId != null && String(editingProjectId) === String(proj.id);
                      return (
                        <div
                          key={proj.id}
                          className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 shadow-sm"
                        >
                          {isEditing && projectEditDraft ? (
                            <div className="space-y-2.5">
                              <p className="text-xs font-semibold text-slate-800">Edit project</p>
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-slate-600" htmlFor={`pe-name-${proj.id}`}>
                                  Project name
                                </label>
                                <input
                                  id={`pe-name-${proj.id}`}
                                  type="text"
                                  className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                                  value={projectEditDraft.name}
                                  onChange={(e) =>
                                    setProjectEditDraft((d) => (d ? { ...d, name: e.target.value } : d))
                                  }
                                  disabled={projectEditSaving}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-slate-600" htmlFor={`pe-st-${proj.id}`}>
                                  Project status
                                </label>
                                <select
                                  id={`pe-st-${proj.id}`}
                                  className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                                  value={projectEditDraft.status}
                                  onChange={(e) =>
                                    setProjectEditDraft((d) =>
                                      d
                                        ? {
                                            ...d,
                                            status: e.target.value === "archived" ? "archived" : "active",
                                          }
                                        : d
                                    )
                                  }
                                  disabled={projectEditSaving}
                                >
                                  <option value="active">active</option>
                                  <option value="archived">archived</option>
                                </select>
                              </div>
                              <div className="space-y-1.5">
                                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
                                  Cost centres
                                </p>
                                {projectEditDraft.lines.length === 0 && (
                                  <p className="text-xs text-slate-500">None — add one below if needed.</p>
                                )}
                                {projectEditDraft.lines.map((line) => (
                                  <div
                                    key={line.key}
                                    className="flex flex-col gap-1.5 rounded-lg border border-slate-100 bg-slate-50/80 p-2"
                                  >
                                    <div className="flex flex-wrap items-end gap-2">
                                      <div className="min-w-0 flex-1 space-y-0.5">
                                        <label className="text-[10px] font-medium text-slate-600">Name</label>
                                        <input
                                          type="text"
                                          className="w-full rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-xs"
                                          value={line.name}
                                          onChange={(e) =>
                                            setProjectEditDraft((d) => {
                                              if (!d) return d;
                                              return {
                                                ...d,
                                                lines: d.lines.map((l) =>
                                                  l.key === line.key ? { ...l, name: e.target.value } : l
                                                ),
                                              };
                                            })
                                          }
                                          disabled={projectEditSaving}
                                        />
                                      </div>
                                      <div className="w-full min-w-0 sm:w-32 space-y-0.5">
                                        <label className="text-[10px] font-medium text-slate-600">Status</label>
                                        <select
                                          className="w-full rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-xs"
                                          value={line.status}
                                          onChange={(e) =>
                                            setProjectEditDraft((d) => {
                                              if (!d) return d;
                                              return {
                                                ...d,
                                                lines: d.lines.map((l) =>
                                                  l.key === line.key
                                                    ? {
                                                        ...l,
                                                        status: e.target.value === "archived" ? "archived" : "active",
                                                      }
                                                    : l
                                                ),
                                              };
                                            })
                                          }
                                          disabled={projectEditSaving}
                                        >
                                          <option value="active">active</option>
                                          <option value="archived">archived</option>
                                        </select>
                                      </div>
                                    </div>
                                    <div className="flex justify-end">
                                      <button
                                        type="button"
                                        className="text-[11px] font-semibold text-slate-600 underline"
                                        disabled={projectEditSaving}
                                        onClick={() =>
                                          setProjectEditDraft((d) => {
                                            if (!d) return d;
                                            return {
                                              ...d,
                                              lines: d.lines.filter((l) => l.key !== line.key),
                                            };
                                          })
                                        }
                                      >
                                        Remove from list
                                      </button>
                                    </div>
                                  </div>
                                ))}
                                <Button
                                  type="button"
                                  className="w-full rounded-lg h-8 text-[11px] font-semibold !bg-white !text-slate-900 border border-slate-300"
                                  disabled={projectEditSaving}
                                  onClick={() =>
                                    setProjectEditDraft((d) => {
                                      if (!d) return d;
                                      return {
                                        ...d,
                                        lines: [
                                          ...d.lines,
                                          {
                                            key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                                            dbId: null,
                                            name: "",
                                            status: "active",
                                            isNew: true,
                                          },
                                        ],
                                      };
                                    })
                                  }
                                >
                                  + Add cost centre
                                </Button>
                              </div>
                              {projectEditError && (
                                <div className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-900 leading-snug">
                                  {projectEditError}
                                </div>
                              )}
                              <div className="flex gap-2 pt-0.5">
                                <Button
                                  type="button"
                                  className="flex-1 rounded-lg h-9 text-xs font-semibold"
                                  disabled={projectEditSaving}
                                  onClick={() => void handleProjectsScreenSaveEdit()}
                                >
                                  {projectEditSaving ? "Saving…" : "Save"}
                                </Button>
                                <Button
                                  type="button"
                                  className="flex-1 rounded-lg h-9 text-xs font-semibold !bg-white !text-slate-900 border-2 border-slate-400 shadow-sm hover:!bg-slate-100"
                                  disabled={projectEditSaving}
                                  onClick={cancelProjectEdit}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                                <h3 className="font-semibold text-sm text-slate-900 leading-snug break-words min-w-0 flex-1">
                                  {proj.name}
                                </h3>
                                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                  <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-800 ring-1 ring-slate-200/80 capitalize">
                                    {proj.status != null && String(proj.status).trim() !== ""
                                      ? String(proj.status).replace(/_/g, " ")
                                      : "—"}
                                  </span>
                                  <Button
                                    type="button"
                                    className="rounded-lg h-8 px-2.5 text-[11px] font-semibold"
                                    disabled={
                                      Boolean(projectsAddSaving) ||
                                      Boolean(projectEditSaving) ||
                                      projectsAddFormOpen ||
                                      assignmentsManageProjectId != null ||
                                      (editingProjectId != null &&
                                        String(editingProjectId) !== String(proj.id))
                                    }
                                    onClick={() => beginProjectEdit(proj)}
                                  >
                                    Edit
                                  </Button>
                                </div>
                              </div>
                              <div className="border-t border-slate-100 pt-2 space-y-1">
                                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
                                  Cost centres
                                </p>
                                {proj.costCentres.length === 0 ? (
                                  <p className="text-xs text-slate-500">None</p>
                                ) : (
                                  <ul className="space-y-1.5">
                                    {proj.costCentres.map((cc) => (
                                      <li
                                        key={cc.id}
                                        className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-xs text-slate-800"
                                      >
                                        <span className="font-medium break-words min-w-0">{cc.name}</span>
                                        {cc.status != null &&
                                          String(cc.status).trim() !== "" &&
                                          String(cc.status).toLowerCase() !== "active" && (
                                            <span className="shrink-0 text-[10px] text-slate-500 capitalize">
                                              {String(cc.status).replace(/_/g, " ")}
                                            </span>
                                          )}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              <div className="border-t border-slate-100 pt-2 space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
                                    Assigned employees
                                  </p>
                                  <Button
                                    type="button"
                                    className="shrink-0 rounded-lg h-8 px-2.5 text-[11px] font-semibold"
                                    disabled={
                                      Boolean(projectsAddSaving) ||
                                      Boolean(projectEditSaving) ||
                                      projectsAddFormOpen ||
                                      Boolean(assignmentsEditorSaving) ||
                                      Boolean(assignmentsEditorLoading) ||
                                      editingProjectId != null ||
                                      assignmentsManageProjectId != null
                                    }
                                    onClick={() => void openAssignmentsEditor(proj.id)}
                                  >
                                    Manage Assignments
                                  </Button>
                                </div>
                                {(proj.assignedSummaries || []).length === 0 ? (
                                  <p className="text-xs text-slate-500">No employees assigned</p>
                                ) : (
                                  <ul className="space-y-1.5">
                                    {(proj.assignedSummaries || []).map((s, ni) => (
                                      <li
                                        key={`${proj.id}-asgn-${ni}`}
                                        className="text-xs text-slate-800 leading-snug break-words"
                                      >
                                        <span className="font-semibold text-slate-900">{s.displayName}</span>
                                        {s.costCentreLabels && s.costCentreLabels.length > 0 ? (
                                          <span className="text-slate-600"> · {s.costCentreLabels.join(", ")}</span>
                                        ) : (
                                          <span className="text-amber-800 font-medium"> · No cost centres assigned</span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              {assignmentsManageProjectId != null &&
                                String(assignmentsManageProjectId) === String(proj.id) && (
                                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 space-y-2.5">
                                    <p className="text-xs font-semibold text-slate-900">Assignment editor</p>
                                    {assignmentsEditorLoading ? (
                                      <p className="text-xs text-slate-600">Loading company members…</p>
                                    ) : (
                                      <>
                                        <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-0.5">
                                          {assignmentsEditorMembers.map((m) => {
                                            const uid = String(m.userId);
                                            const projectAssigned = Boolean(assignmentsEditorChecks[uid]);
                                            const anyCcChecked =
                                              assignmentsEditorCostCentres.some((cc) =>
                                                Boolean(assignmentsEditorCcChecks[pccaKey(m.userId, cc.id)])
                                              );
                                            return (
                                              <div
                                                key={uid}
                                                className="rounded-lg bg-white/95 border border-slate-200 px-2.5 py-2 space-y-2"
                                              >
                                                <label className="flex items-start gap-2.5 cursor-pointer">
                                                  <input
                                                    type="checkbox"
                                                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
                                                    checked={projectAssigned}
                                                    disabled={assignmentsEditorSaving}
                                                    onChange={(e) => {
                                                      const checked = e.target.checked;
                                                      setAssignmentsEditorChecks((prev) => ({
                                                        ...prev,
                                                        [uid]: checked,
                                                      }));
                                                      if (!checked) {
                                                        setAssignmentsEditorCcChecks((prev) => {
                                                          const next = { ...prev };
                                                          for (const cc of assignmentsEditorCostCentres) {
                                                            next[pccaKey(m.userId, cc.id)] = false;
                                                          }
                                                          return next;
                                                        });
                                                      }
                                                    }}
                                                  />
                                                  <span className="min-w-0 flex-1">
                                                    <span className="block text-xs font-semibold text-slate-900 break-words">
                                                      {m.displayName}
                                                    </span>
                                                    <span className="block text-[10px] text-slate-500 capitalize mt-0.5">
                                                      {m.role || "employee"}
                                                    </span>
                                                  </span>
                                                </label>
                                                {projectAssigned && assignmentsEditorCostCentres.length > 0 && (
                                                  <div className="pl-6 space-y-1.5 border-t border-slate-100 pt-2">
                                                    <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
                                                      Cost centres
                                                    </p>
                                                    {assignmentsEditorCostCentres.map((cc) => (
                                                      <label
                                                        key={String(cc.id)}
                                                        className="flex items-center gap-2 cursor-pointer"
                                                      >
                                                        <input
                                                          type="checkbox"
                                                          className="h-3.5 w-3.5 shrink-0 rounded border-slate-300"
                                                          checked={Boolean(
                                                            assignmentsEditorCcChecks[pccaKey(m.userId, cc.id)]
                                                          )}
                                                          disabled={assignmentsEditorSaving}
                                                          onChange={(e) => {
                                                            const k = pccaKey(m.userId, cc.id);
                                                            setAssignmentsEditorCcChecks((prev) => ({
                                                              ...prev,
                                                              [k]: e.target.checked,
                                                            }));
                                                          }}
                                                        />
                                                        <span className="text-[11px] text-slate-800">{cc.name}</span>
                                                      </label>
                                                    ))}
                                                  </div>
                                                )}
                                                {projectAssigned &&
                                                  assignmentsEditorCostCentres.length > 0 &&
                                                  !anyCcChecked && (
                                                    <p className="text-[10px] text-amber-800 leading-snug pl-6">
                                                      No cost centres assigned
                                                    </p>
                                                  )}
                                                {projectAssigned && assignmentsEditorCostCentres.length === 0 && (
                                                  <p className="text-[10px] text-slate-500 leading-snug pl-6">
                                                    No active cost centres on this project.
                                                  </p>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                        {assignmentsEditorMembers.length === 0 && (
                                          <p className="text-xs text-slate-500">No active employees in this company.</p>
                                        )}
                                        {assignmentsEditorError && (
                                          <div className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-900 leading-snug">
                                            {assignmentsEditorError}
                                          </div>
                                        )}
                                        <div className="flex gap-2 pt-0.5">
                                          <Button
                                            type="button"
                                            className="flex-1 rounded-lg h-9 text-xs font-semibold"
                                            disabled={assignmentsEditorSaving || assignmentsEditorLoading}
                                            onClick={() => void handleSaveProjectAssignments()}
                                          >
                                            {assignmentsEditorSaving ? "Saving…" : "Save"}
                                          </Button>
                                          <Button
                                            type="button"
                                            className="flex-1 rounded-lg h-9 text-xs font-semibold !bg-white !text-slate-900 border-2 border-slate-400 shadow-sm hover:!bg-slate-100"
                                            disabled={assignmentsEditorSaving || assignmentsEditorLoading}
                                            onClick={closeAssignmentsEditor}
                                          >
                                            Cancel
                                          </Button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "team" && !isAdmin && (
            <Card className="rounded-3xl shadow-sm">
              <CardContent className="p-5 space-y-3">
                <h2 className="font-bold text-lg">Access restricted</h2>
                <p className="text-sm text-slate-600">You do not have access to the team screen.</p>
                <Button type="button" className="w-full rounded-2xl h-11 text-sm font-semibold" onClick={() => setActiveTab("clock")}>
                  Back to Clock
                </Button>
              </CardContent>
            </Card>
          )}

          {activeTab === "team" && isAdmin && (
            <Card className="rounded-3xl shadow-sm">
              <CardContent className="p-4 sm:p-5 space-y-3">
                <div>
                  <h2 className="font-bold text-lg">Team</h2>
                  <p className="text-xs text-slate-500">Company members</p>
                </div>
                {isAdmin && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide shrink-0">Show:</span>
                    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                      {[
                        { id: "active", label: "Active" },
                        { id: "archived", label: "Archived" },
                        { id: "all", label: "All" },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                            teamListFilter === opt.id
                              ? "bg-white text-slate-900 shadow-sm"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                          onClick={() => setTeamListFilter(opt.id)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="rounded-2xl border bg-slate-50 p-3 space-y-2">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide">Join code</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 min-w-0 rounded-lg bg-white border px-2 py-1.5 text-sm font-mono tracking-wide truncate">
                      {userCompany?.code || "—"}
                    </code>
                    <Button
                      type="button"
                      className="rounded-xl h-9 px-3 text-xs font-semibold shrink-0"
                      onClick={() => void handleCopyTeamJoinCode()}
                      disabled={!userCompany?.code}
                    >
                      {teamCopyOk ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>
                {teamLoading && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">Loading team…</div>
                )}
                {teamError && (
                  <div className="rounded-2xl bg-amber-50 border border-amber-100 p-3 text-xs text-amber-900">{teamError}</div>
                )}
                {teamRoleFeedback.text && (
                  <div
                    className={`rounded-2xl border p-3 text-xs ${
                      teamRoleFeedback.type === "success"
                        ? "bg-green-50 border-green-100 text-green-800"
                        : "bg-red-50 border-red-100 text-red-700"
                    }`}
                  >
                    {teamRoleFeedback.text}
                  </div>
                )}
                {teamSchemaWarning && (
                  <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-950 leading-snug">
                    {teamSchemaWarning}
                  </div>
                )}
                {isAdmin && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
                    {!teamAddFormOpen ? (
                      <Button
                        type="button"
                        className="w-full sm:w-auto rounded-lg h-9 text-xs font-semibold"
                        onClick={() => {
                          cancelTeamMemberEdit();
                          setTeamAddError("");
                          setTeamAddDraft({ ...TEAM_ADD_INITIAL_DRAFT });
                          setTeamAddFormOpen(true);
                        }}
                        disabled={Boolean(teamAddSubmitting) || Boolean(teamSavingMemberRowId)}
                      >
                        Add Employee
                      </Button>
                    ) : (
                      <form className="space-y-2" onSubmit={(e) => void handleSubmitAddEmployee(e)} noValidate>
                        {teamAddError && (
                          <div className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-900 leading-snug">
                            {teamAddError}
                          </div>
                        )}
                        <div className="space-y-1">
                          <label className="block text-[11px] font-medium text-slate-600" htmlFor="team-add-name">
                            Name
                          </label>
                          <input
                            id="team-add-name"
                            type="text"
                            autoComplete="name"
                            className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                            value={teamAddDraft.fullName}
                            disabled={teamAddSubmitting}
                            onChange={(e) => setTeamAddDraft((d) => ({ ...d, fullName: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[11px] font-medium text-slate-600" htmlFor="team-add-email">
                            Email
                          </label>
                          <input
                            id="team-add-email"
                            type="email"
                            autoComplete="email"
                            className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                            value={teamAddDraft.email}
                            disabled={teamAddSubmitting}
                            onChange={(e) => setTeamAddDraft((d) => ({ ...d, email: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[11px] font-medium text-slate-600" htmlFor="team-add-password">
                            Temporary password
                          </label>
                          <input
                            id="team-add-password"
                            type="password"
                            autoComplete="new-password"
                            className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                            value={teamAddDraft.password}
                            disabled={teamAddSubmitting}
                            onChange={(e) => setTeamAddDraft((d) => ({ ...d, password: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-medium text-slate-600" htmlFor="team-add-role">
                            Role
                          </label>
                          <select
                            id="team-add-role"
                            className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                            value={teamAddDraft.role === "supervisor" ? "supervisor" : "employee"}
                            disabled={teamAddSubmitting}
                            onChange={(e) =>
                              setTeamAddDraft((d) => ({
                                ...d,
                                role: e.target.value === "supervisor" ? "supervisor" : "employee",
                              }))
                            }
                          >
                            <option value="employee">employee</option>
                            <option value="supervisor">supervisor</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[11px] font-medium text-slate-600" htmlFor="team-add-pay">
                            Pay rate ($/hr)
                          </label>
                          <input
                            id="team-add-pay"
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.01"
                            className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                            value={teamAddDraft.hourlyRate}
                            disabled={teamAddSubmitting}
                            onChange={(e) => setTeamAddDraft((d) => ({ ...d, hourlyRate: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[11px] font-medium text-slate-600" htmlFor="team-add-eff">
                            Effective date
                          </label>
                          <input
                            id="team-add-eff"
                            type="date"
                            className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                            value={teamAddDraft.payRateEffectiveDate}
                            disabled={teamAddSubmitting}
                            onChange={(e) => setTeamAddDraft((d) => ({ ...d, payRateEffectiveDate: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[11px] font-medium text-slate-600" htmlFor="team-add-join">
                            Joining date
                          </label>
                          <input
                            id="team-add-join"
                            type="date"
                            className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                            value={teamAddDraft.joiningDate}
                            disabled={teamAddSubmitting}
                            onChange={(e) => setTeamAddDraft((d) => ({ ...d, joiningDate: e.target.value }))}
                          />
                          <p className="text-[10px] text-slate-500 leading-snug">
                            Optional — defaults to today (company time zone) if left empty.
                          </p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[11px] font-medium text-slate-600">Status</p>
                          <p className="text-xs font-medium text-slate-900">active</p>
                        </div>
                        {teamAddSubmitting && (
                          <p className="text-xs text-slate-600">Creating employee…</p>
                        )}
                        <div className="flex gap-2 pt-1">
                          <Button
                            type="submit"
                            className="flex-1 rounded-lg h-9 text-xs font-semibold"
                            disabled={teamAddSubmitting}
                          >
                            {teamAddSubmitting ? "Saving…" : "Save"}
                          </Button>
                          <Button
                            type="button"
                            className="flex-1 rounded-lg h-9 text-xs font-semibold !bg-white !text-slate-900 border-2 border-slate-400 shadow-sm hover:!bg-slate-100 hover:border-slate-500 active:!bg-slate-200"
                            disabled={teamAddSubmitting}
                            onClick={() => {
                              setTeamAddFormOpen(false);
                              setTeamAddError("");
                              setTeamAddDraft({ ...TEAM_ADD_INITIAL_DRAFT });
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  {displayedTeamRows.map((row) => {
                    const rowRoleNorm = normalizeMemberRole(row.role);
                    const isOwnerMember = rowRoleNorm === "owner";
                    const emailLine = (row.profileEmailRaw && String(row.profileEmailRaw).trim()) || "—";
                    const isEditing = isAdmin && String(teamEditingMemberRowId) === String(row.memberRowId);
                    const payDisp =
                      row.hourlyRate != null && Number.isFinite(Number(row.hourlyRate))
                        ? `${formatMoney(Number(row.hourlyRate))}/hr`
                        : "Not set";
                    const effDisp = row.payRateEffectiveDate
                      ? String(row.payRateEffectiveDate).slice(0, 10)
                      : "Not set";
                    const joinDisp = row.joiningDate ? String(row.joiningDate).slice(0, 10) : "Not set";
                    const empArchived = row.employmentStatus === "archived";
                    const ownerLoginLocked =
                      isOwnerMember && String(authUser?.id) !== String(row.userId);
                    return (
                      <div
                        key={row.memberRowId}
                        className={`rounded-xl border p-3 space-y-2.5 ${
                          empArchived
                            ? "border-slate-300 bg-slate-50"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p
                                className={`font-semibold text-sm leading-snug break-words ${
                                  empArchived ? "text-slate-600" : "text-slate-900"
                                }`}
                              >
                                {row.displayName}
                              </p>
                              {empArchived && !isEditing && (
                                <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-slate-300/80 text-slate-800 ring-1 ring-slate-400/80">
                                  Archived
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-slate-600">
                              <span className="font-medium text-slate-500">Email: </span>
                              <span className="break-all">{emailLine}</span>
                            </p>
                          </div>
                          {isAdmin && !isEditing && (
                            <Button
                              type="button"
                              className="shrink-0 rounded-lg h-8 px-3 text-xs font-semibold"
                              onClick={() => beginTeamMemberEdit(row)}
                              disabled={Boolean(teamSavingMemberRowId)}
                            >
                              Edit
                            </Button>
                          )}
                        </div>
                        {isEditing && teamEditDraft ? (
                          <div className="space-y-2 border-t border-slate-100 pt-2">
                            {teamEditInlineError && (
                              <div className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-900 leading-snug">
                                {teamEditInlineError}
                              </div>
                            )}
                            <div className="space-y-1">
                              <label
                                className="block text-[11px] font-medium text-slate-600"
                                htmlFor={`team-name-${row.memberRowId}`}
                              >
                                Name
                              </label>
                              <input
                                id={`team-name-${row.memberRowId}`}
                                type="text"
                                autoComplete="name"
                                className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                                value={teamEditDraft.fullName}
                                disabled={Boolean(teamSavingMemberRowId) || ownerLoginLocked}
                                onChange={(e) =>
                                  setTeamEditDraft((d) => (d ? { ...d, fullName: e.target.value } : d))
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <label
                                className="block text-[11px] font-medium text-slate-600"
                                htmlFor={`team-email-${row.memberRowId}`}
                              >
                                Email
                              </label>
                              <input
                                id={`team-email-${row.memberRowId}`}
                                type="email"
                                autoComplete="email"
                                inputMode="email"
                                className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                                value={teamEditDraft.email}
                                disabled={Boolean(teamSavingMemberRowId) || ownerLoginLocked}
                                onChange={(e) =>
                                  setTeamEditDraft((d) => (d ? { ...d, email: e.target.value } : d))
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <label
                                className="block text-[11px] font-medium text-slate-600"
                                htmlFor={`team-pass-${row.memberRowId}`}
                              >
                                New password <span className="font-normal text-slate-500">(optional)</span>
                              </label>
                              <input
                                id={`team-pass-${row.memberRowId}`}
                                type="password"
                                autoComplete="new-password"
                                placeholder="Leave blank to keep current"
                                className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                                value={teamEditDraft.newPassword}
                                disabled={Boolean(teamSavingMemberRowId) || ownerLoginLocked}
                                onChange={(e) =>
                                  setTeamEditDraft((d) => (d ? { ...d, newPassword: e.target.value } : d))
                                }
                              />
                            </div>
                            {ownerLoginLocked && (
                              <p className="text-[10px] text-slate-500 leading-snug">
                                Only the owner can change this account&apos;s name, email, or password.
                              </p>
                            )}
                            <div className="space-y-1.5">
                              <label className="block text-[11px] font-medium text-slate-600">Role</label>
                              {isOwnerMember ? (
                                <p className="text-xs font-medium text-slate-900 capitalize">owner</p>
                              ) : (
                                <select
                                  className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                                  value={teamEditDraft.memberRole === "supervisor" ? "supervisor" : "employee"}
                                  disabled={Boolean(teamSavingMemberRowId)}
                                  onChange={(e) =>
                                    setTeamEditDraft((d) =>
                                      d
                                        ? {
                                            ...d,
                                            memberRole: e.target.value === "supervisor" ? "supervisor" : "employee",
                                          }
                                        : d
                                    )
                                  }
                                >
                                  <option value="employee">employee</option>
                                  <option value="supervisor">supervisor</option>
                                </select>
                              )}
                            </div>
                            <div className="space-y-1">
                              <label className="text-[11px] font-medium text-slate-600" htmlFor={`team-pay-${row.memberRowId}`}>
                                Pay rate ($/hr)
                              </label>
                              <input
                                id={`team-pay-${row.memberRowId}`}
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="0.01"
                                className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                                value={teamEditDraft.hourlyRate}
                                disabled={Boolean(teamSavingMemberRowId)}
                                onChange={(e) =>
                                  setTeamEditDraft((d) => (d ? { ...d, hourlyRate: e.target.value } : d))
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[11px] font-medium text-slate-600" htmlFor={`team-eff-${row.memberRowId}`}>
                                Effective date
                              </label>
                              <input
                                id={`team-eff-${row.memberRowId}`}
                                type="date"
                                className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                                value={teamEditDraft.payRateEffectiveDate}
                                disabled={Boolean(teamSavingMemberRowId)}
                                onChange={(e) =>
                                  setTeamEditDraft((d) => (d ? { ...d, payRateEffectiveDate: e.target.value } : d))
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[11px] font-medium text-slate-600">Status</label>
                              {isOwnerMember ? (
                                <div>
                                  <p className="text-xs font-medium text-slate-900">active</p>
                                  <p className="text-[10px] text-slate-500 mt-0.5">Owner cannot be archived.</p>
                                </div>
                              ) : (
                                <select
                                  className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                                  value={teamEditDraft.employmentStatus}
                                  disabled={Boolean(teamSavingMemberRowId)}
                                  onChange={(e) =>
                                    setTeamEditDraft((d) =>
                                      d
                                        ? {
                                            ...d,
                                            employmentStatus: e.target.value === "archived" ? "archived" : "active",
                                          }
                                        : d
                                    )
                                  }
                                >
                                  <option value="active">active</option>
                                  <option value="archived">archived</option>
                                </select>
                              )}
                            </div>
                            <div className="space-y-1">
                              <label
                                className="text-[11px] font-medium text-slate-600"
                                htmlFor={`team-join-${row.memberRowId}`}
                              >
                                Joining date
                              </label>
                              <input
                                id={`team-join-${row.memberRowId}`}
                                type="date"
                                className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                                value={teamEditDraft.joiningDate ?? ""}
                                disabled={Boolean(teamSavingMemberRowId)}
                                onChange={(e) =>
                                  setTeamEditDraft((d) => (d ? { ...d, joiningDate: e.target.value } : d))
                                }
                              />
                            </div>
                            <div className="flex gap-2 pt-1">
                              <Button
                                type="button"
                                className="flex-1 rounded-lg h-9 text-xs font-semibold"
                                disabled={Boolean(teamSavingMemberRowId)}
                                onClick={() => void handleTeamMemberSave(row)}
                              >
                                {teamSavingMemberRowId === String(row.memberRowId) ? "Saving…" : "Save"}
                              </Button>
                              <Button
                                type="button"
                                className="flex-1 rounded-lg h-9 text-xs font-semibold !bg-white !text-slate-900 border-2 border-slate-400 shadow-sm hover:!bg-slate-100 hover:border-slate-500 active:!bg-slate-200"
                                disabled={Boolean(teamSavingMemberRowId)}
                                onClick={cancelTeamMemberEdit}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1.5 text-xs leading-snug">
                            <div className="flex justify-between gap-3">
                              <span className="text-slate-500 shrink-0">Role</span>
                              <span className="font-medium text-slate-900 text-right capitalize">{rowRoleNorm}</span>
                            </div>
                            <div className="flex justify-between gap-3 items-center">
                              <span className="text-slate-500 shrink-0">Status</span>
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                                  empArchived
                                    ? "bg-slate-200 text-slate-800 ring-slate-400"
                                    : "bg-green-50 text-green-800 ring-green-100"
                                }`}
                              >
                                {empArchived ? "Archived" : "Active"}
                              </span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="text-slate-500 shrink-0">Pay rate</span>
                              <span className="font-medium text-slate-700 text-right">{payDisp}</span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="text-slate-500 shrink-0">Effective date</span>
                              <span className="font-medium text-slate-700 text-right">{effDisp}</span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="text-slate-500 shrink-0">Joining date</span>
                              <span className="font-medium text-slate-700 text-right">{joinDisp}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {!teamLoading &&
                  !teamError &&
                  displayedTeamRows.length === 0 &&
                  (isAdmin ? teamRows.length === 0 : !teamRows.some((r) => String(r.userId) === String(authUser?.id))) && (
                    <p className="text-xs text-slate-500 text-center py-3">No members found.</p>
                  )}
                {!teamLoading &&
                  !teamError &&
                  isAdmin &&
                  teamRows.length > 0 &&
                  displayedTeamRows.length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-3">
                      {teamListFilter === "all"
                        ? "No members in this view."
                        : `No ${teamListFilter === "active" ? "active" : "archived"} members in this view.`}
                    </p>
                  )}
              </CardContent>
            </Card>
          )}

          {activeTab === "settings" && (
            <Card className="rounded-3xl shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div>
                  <h2 className="font-bold text-lg">Settings</h2>
                  <p className="text-xs text-slate-500">Company time zone (display only — stored times stay as ISO UTC in the database).</p>
                </div>
                <div className="rounded-2xl border bg-slate-50 p-4 space-y-1">
                  <p className="text-xs text-slate-500">Company</p>
                  <p className="font-semibold text-slate-900">{userCompany?.name || "—"}</p>
                </div>
                <div className="rounded-2xl border bg-slate-50 p-4 space-y-1">
                  <p className="text-xs text-slate-500">Current time zone</p>
                  <p className="font-semibold text-slate-900">{companyTimeZone}</p>
                  <p className="text-[11px] text-slate-600 mt-1">
                    Company time now: {formatTime(now, companyTimeZone)}
                  </p>
                </div>
                {isAdmin ? (
                  <form onSubmit={handleSaveCompanyTimeZone} className="space-y-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Company time zone</label>
                      <select
                        className="w-full rounded-2xl border bg-white py-2 px-3 text-sm"
                        value={settingsTzDraft}
                        onChange={(e) => setSettingsTzDraft(e.target.value)}
                      >
                        {COMPANY_TIME_ZONE_OPTIONS.map((tz) => (
                          <option key={tz} value={tz}>{tz}</option>
                        ))}
                      </select>
                    </div>
                    {settingsTzMessage && (
                      <div
                        className={`rounded-2xl border p-3 text-xs ${
                          settingsTzMessage.includes("saved")
                            ? "bg-green-50 border-green-100 text-green-800"
                            : "bg-red-50 border-red-100 text-red-700"
                        }`}
                      >
                        {settingsTzMessage}
                      </div>
                    )}
                    <Button type="submit" className="w-full rounded-2xl h-12 text-sm font-bold" disabled={settingsTzSaving}>
                      {settingsTzSaving ? "Saving…" : "Save time zone"}
                    </Button>
                  </form>
                ) : (
                  <p className="text-xs text-slate-500">Only an owner or supervisor can change the company time zone. Contact your supervisor if this should be updated.</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {liveToast && isAdmin && (
          <div
            role="status"
            className="pointer-events-auto absolute left-2 right-2 z-[55] rounded-2xl border border-slate-200 bg-white shadow-lg p-3"
            style={{ bottom: "calc(4.25rem + env(safe-area-inset-bottom, 0px))" }}
          >
            <div className="flex justify-between gap-2 items-start">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 leading-snug">{liveToast.title}</p>
                <p className="text-xs text-slate-600 mt-0.5 leading-snug break-words">{liveToast.message}</p>
              </div>
              <button
                type="button"
                className="shrink-0 text-xs font-semibold text-slate-600 underline px-1"
                onClick={() => setLiveToast(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {isMenuOpen && (
          <div className="fixed inset-0 z-[60] bg-black/40" onClick={() => setIsMenuOpen(false)}>
            <div className="h-full w-72 bg-white shadow-2xl p-4 space-y-4" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-lg">Menu</h2>
                  <p className="text-xs text-slate-500">
                    {employeeDisplayName || authUser.email} • {resolvedCompanyRole || authRole || "employee"}
                  </p>
                </div>
                <button className="text-xl" onClick={() => setIsMenuOpen(false)}>×</button>
              </div>
              <div className="space-y-2">
                <button className="w-full text-left rounded-2xl p-3 bg-slate-100 font-semibold" onClick={() => openMenuTab("timesheet")}>📄 Timesheet</button>
                {isAdmin && (
                  <button
                    type="button"
                    className="relative w-full text-left rounded-2xl p-3 bg-slate-100 font-semibold"
                    onClick={() => openMenuTab("notifications")}
                  >
                    🔔 Notifications
                    {inAppNotifUnread > 0 && (
                      <span className="ml-2 rounded-full bg-red-600 text-white text-[10px] px-2 py-0.5">
                        {inAppNotifUnread > 99 ? "99+" : inAppNotifUnread}
                      </span>
                    )}
                  </button>
                )}
                <button className="relative w-full text-left rounded-2xl p-3 bg-slate-100 font-semibold" onClick={openPhotosTab}>🖼 Photos {photoNotificationCount > 0 && <span className="ml-2 rounded-full bg-red-600 text-white text-[10px] px-2 py-0.5">{photoNotificationCount}</span>}</button>
                <button className="w-full text-left rounded-2xl p-3 bg-slate-100 font-semibold" onClick={() => openMenuTab("receipts")}>🧾 Receipts</button>
                <button className="w-full text-left rounded-2xl p-3 bg-slate-100 font-semibold" onClick={() => openMenuTab("settings")}>⚙️ Settings</button>
                {isAdmin && (
                  <button className="w-full text-left rounded-2xl p-3 bg-slate-100 font-semibold" onClick={() => openMenuTab("team")}>👥 Team</button>
                )}
                {isAdmin && (
                  <>
                    <button
                      type="button"
                      className="w-full text-left rounded-2xl p-3 bg-slate-100 font-semibold"
                      onClick={() => openMenuTab("projects")}
                    >
                      📁 Projects
                    </button>
                    <button
                      type="button"
                      className="w-full text-left rounded-2xl p-3 bg-slate-100 font-semibold"
                      onClick={() => openMenuTab("quotations")}
                    >
                      📝 Quotations
                    </button>
                    <button
                      type="button"
                      className="w-full text-left rounded-2xl p-3 bg-slate-100 font-semibold"
                      onClick={() => openMenuTab("reports")}
                    >
                      📊 Reports
                    </button>
                  </>
                )}
                <button className="w-full text-left rounded-2xl p-3 bg-red-50 text-red-700 font-semibold" onClick={handleLogout}>🚪 Logout</button>
              </div>
            </div>
          </div>
        )}

        <div
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm border-t bg-white/95 backdrop-blur px-3 pt-1.5 z-50 shadow-lg pb-[max(0.375rem,env(safe-area-inset-bottom,0px))]"
        >
          <div className={`grid gap-1.5 ${isAdmin ? "grid-cols-3" : "grid-cols-2"}`}>
            <button onClick={() => setActiveTab("clock")} className={`rounded-2xl py-2.5 px-2 text-sm font-semibold ${activeTab === "clock" ? "bg-slate-900 text-white" : "text-slate-500"}`}>⏱ Clock</button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab("dashboard")}
                className={`rounded-2xl py-2.5 px-2 text-sm font-semibold ${activeTab === "dashboard" ? "bg-slate-900 text-white" : "text-slate-500"}`}
              >
                📊 Dashboard
              </button>
            )}
            <button onClick={() => setActiveTab("timesheet")} className={`rounded-2xl py-2.5 px-2 text-sm font-semibold ${activeTab === "timesheet" ? "bg-slate-900 text-white" : "text-slate-500"}`}>📄 Timesheet</button>
          </div>
        </div>
      </div>
    </div>
  );
}
