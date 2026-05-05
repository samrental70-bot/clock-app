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

const SCHEDULE_FORM_EMPTY = {
  title: "",
  notes: "",
  projectId: "",
  costCentre: "",
  startDate: "",
  startTime: "09:00",
  endDate: "",
  endTime: "",
  durationMinutes: "",
  /** `user_id` strings from company_members for scheduled_task_assignees */
  assignedUserIds: [],
  assignedTeamPlaceholder: "",
  status: "scheduled",
};

/** Day timeline: first labeled hour (inclusive) and last (exclusive) for grid height. */
const SCHEDULE_GRID_HOUR_START = 6;
const SCHEDULE_GRID_HOUR_END = 22;
const SCHEDULE_GRID_TOTAL_MINUTES = (SCHEDULE_GRID_HOUR_END - SCHEDULE_GRID_HOUR_START) * 60;
/** Pixel height per hour in schedule day columns (readability on mobile). */
const SCHEDULE_GRID_PX_PER_HOUR = 56;
const SCHEDULE_MONTH_CHIP_MAX = 3;

/** Ignore taps meant for chips/cards/dialogs—not empty calendar background. Handles non-Element targets safely. */
function isAdminScheduleCalendarBackgroundIgnored(ev) {
  const te = ev?.target;
  const el =
    te instanceof Element ? te : te?.parentNode instanceof Element ? te.parentNode : null;
  if (!(el instanceof Element)) return true;
  if (
    el.closest(
      ".sched-day-task-block, [data-sched-task-chip], button, a[href], input, select, textarea, label"
    )
  )
    return true;
  if (el.closest('[role="dialog"]')) return true;
  if (el.closest("form")) return true;
  return false;
}

function scheduleTimelineAdminTone(task) {
  const s = String(task?.status ?? "scheduled").trim().toLowerCase();
  if (s === "cancelled") return "neutral";
  if (s === "completed") return "accepted";
  return "scheduled";
}

function scheduleTimelineEmployeeTone(task, linkByTaskId) {
  const row = task?.id != null ? linkByTaskId?.[String(task.id)] : undefined;
  const rs = normalizeScheduleAssigneeResponseStatus(row?.response_status);
  if (rs === "accepted") return "accepted";
  if (rs === "declined") return "declined";
  return "scheduled";
}

function scheduleTimelineBlockClasses(tone, compact) {
  const pad = compact ? "rounded-md px-1 py-0.5" : "rounded-xl px-2 py-1.5";
  const type = compact ? "text-[12px] leading-tight" : "text-[15px] leading-snug";
  if (tone === "accepted") return `${pad} ${type} bg-emerald-600 text-white shadow-sm`;
  if (tone === "declined") return `${pad} ${type} bg-rose-600 text-white shadow-sm`;
  if (tone === "neutral") return `${pad} ${type} bg-slate-500 text-white shadow-sm`;
  return `${pad} ${type} bg-[#1a73e8] text-white shadow-sm`;
}

/** V2a.2 scheduled_task_assignees.response_status */
function normalizeScheduleAssigneeResponseStatus(raw) {
  const s = String(raw ?? "pending").trim().toLowerCase();
  if (s === "accepted" || s === "declined") return s;
  return "pending";
}

function scheduleAssigneeResponseLabel(status) {
  const s = normalizeScheduleAssigneeResponseStatus(status);
  if (s === "accepted") return "Accepted";
  if (s === "declined") return "Declined";
  return "Pending";
}

function scheduleAssigneeResponseBadgeClass(status) {
  const s = normalizeScheduleAssigneeResponseStatus(status);
  if (s === "accepted") return "bg-emerald-100 text-emerald-900 ring-emerald-200";
  if (s === "declined") return "bg-rose-100 text-rose-900 ring-rose-200";
  return "bg-amber-100 text-amber-900 ring-amber-200";
}

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

/** Populate schedule edit form from a scheduled_tasks row + assignee rows. */
function buildScheduleEditDraftFromTask(task, assigneeRows, timeZone) {
  const tz = timeZone || DEFAULT_COMPANY_TIME_ZONE;
  const startParts = wallClockPartsInTimeZone(task?.start_time, tz);
  const endParts = task?.end_time ? wallClockPartsInTimeZone(task.end_time, tz) : { dateStr: "", timeStr: "" };
  const ar = Array.isArray(assigneeRows) ? assigneeRows : [];
  const ids = ar.map((r) => r?.user_id).filter((x) => x != null).map((x) => String(x));
  const dmRaw = task?.duration_minutes;
  const dm =
    dmRaw != null && dmRaw !== "" && Number.isFinite(Number(dmRaw)) ? String(Math.round(Number(dmRaw))) : "";
  return {
    title: String(task?.task_title ?? ""),
    notes: String(task?.notes ?? ""),
    projectId: task?.project_id != null ? String(task.project_id) : "",
    costCentre: String(task?.cost_centre ?? ""),
    startDate: startParts.dateStr,
    startTime: startParts.timeStr || "09:00",
    endDate: endParts.dateStr,
    endTime: endParts.timeStr,
    durationMinutes: dm,
    assignedUserIds: ids,
    assignedTeamPlaceholder: String(task?.assigned_team ?? ""),
    status: String(task?.status ?? "scheduled"),
  };
}

/** Clock Start Shift: dropdown label for a scheduled task (title + day + time in company TZ). */
function formatClockScheduledTaskOptionLabel(task, timeZone) {
  const tz = timeZone || DEFAULT_COMPANY_TIME_ZONE;
  const title = String(task?.task_title ?? "").trim() || "Task";
  const st = task?.start_time;
  if (st == null || st === "") return title;
  const todayKey = calendarDateKeyInTimeZone(new Date(), tz);
  const nextKey = addWallDaysInTimeZone(todayKey, 1, tz);
  const dk = calendarDateKeyInTimeZone(st, tz);
  let dayPart = formatDate(st, tz);
  if (dk === todayKey) dayPart = "Today";
  else if (dk === nextKey) dayPart = "Tomorrow";
  const tm = formatTime(st, tz);
  return `${title} · ${dayPart} · ${tm}`;
}

/** Wall date YYYY-MM-DD + time HH:mm in `timeZone` → UTC ISO string. */
/** Normalize user time input (e.g. "9:00" or "09:00") to HH:mm:ss for wall clock helpers. */
function normalizeTimeInputForWallClock(timeInput) {
  const s = String(timeInput ?? "").trim();
  if (!s) return "09:00:00";
  const parts = s.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  const sec = Number(parts[2] ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "09:00:00";
  const ss = Number.isFinite(sec) ? sec : 0;
  return `${String(Math.max(0, Math.min(23, h))).padStart(2, "0")}:${String(Math.max(0, Math.min(59, m))).padStart(2, "0")}:${String(Math.max(0, Math.min(59, ss))).padStart(2, "0")}`;
}

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

/** Inclusive list of YYYY-MM-DD keys from startKey through endKey (wall calendar in `timeZone`). */
function enumerateScheduleDayKeys(startKey, endKey, timeZone) {
  const tz = timeZone || DEFAULT_COMPANY_TIME_ZONE;
  if (!startKey || !endKey) return [];
  const out = [];
  let k = startKey;
  for (let guard = 0; guard < 400; guard += 1) {
    out.push(k);
    if (k === endKey) break;
    const next = addWallDaysInTimeZone(k, 1, tz);
    if (!next || next === k) break;
    k = next;
  }
  return out;
}

function compareScheduleTaskStart(a, b) {
  const ta = parseStoredInstant(a?.start_time).getTime();
  const tb = parseStoredInstant(b?.start_time).getTime();
  const va = Number.isNaN(ta) ? 0 : ta;
  const vb = Number.isNaN(tb) ? 0 : tb;
  return va - vb;
}

function filterScheduledTasksByWallDateRange(tasks, rangeStartKey, rangeEndKey, timeZone) {
  const tz = timeZone || DEFAULT_COMPANY_TIME_ZONE;
  if (!rangeStartKey || !rangeEndKey) return [];
  return (Array.isArray(tasks) ? tasks : []).filter((t) => {
    const dk = calendarDateKeyInTimeZone(t?.start_time, tz);
    if (!dk || dk === "") return false;
    return dk >= rangeStartKey && dk <= rangeEndKey;
  });
}

function wallMinutesFromScheduleGridStart(taskInstant, dayKey, timeZone, gridStartHour = SCHEDULE_GRID_HOUR_START) {
  const tz = timeZone || DEFAULT_COMPANY_TIME_ZONE;
  const parts = wallClockPartsInTimeZone(taskInstant, tz);
  if (!parts.dateStr || parts.dateStr !== dayKey) return null;
  const [h, mi] = parts.timeStr.split(":").map((v) => Number(v));
  if (!Number.isFinite(h)) return null;
  const m = Number.isFinite(mi) ? mi : 0;
  const mm = (h - gridStartHour) * 60 + m;
  return Math.max(0, Math.min(SCHEDULE_GRID_TOTAL_MINUTES, mm));
}

function scheduleTaskDurationMinutes(task, timeZone) {
  const tz = timeZone || DEFAULT_COMPANY_TIME_ZONE;
  const startMs = parseStoredInstant(task?.start_time).getTime();
  const endMs = task?.end_time ? parseStoredInstant(task.end_time).getTime() : NaN;
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
    return Math.max(15, Math.round((endMs - startMs) / 60000));
  }
  const dm = task?.duration_minutes;
  if (dm != null && String(dm).trim() !== "" && Number.isFinite(Number(dm))) {
    return Math.max(15, Math.round(Number(dm)));
  }
  return 60;
}

/** Move/reschedule: only start_time, end_time, duration_minutes — preserves wall duration or uses duration_minutes / 60. */
function buildScheduledTaskClockMovePayload(task, newStartIso, companyTimeZone) {
  const tz = companyTimeZone || DEFAULT_COMPANY_TIME_ZONE;
  const oldStartMs = parseStoredInstant(task?.start_time).getTime();
  const oldEndMs = task?.end_time ? parseStoredInstant(task.end_time).getTime() : NaN;
  const newStartMs = parseStoredInstant(newStartIso).getTime();
  if (!Number.isFinite(oldStartMs) || !Number.isFinite(newStartMs)) return null;
  const hadValidEnd = Number.isFinite(oldEndMs) && oldEndMs > oldStartMs;
  if (hadValidEnd) {
    const newEndIso = new Date(newStartMs + (oldEndMs - oldStartMs)).toISOString();
    return { start_time: newStartIso, end_time: newEndIso, duration_minutes: null };
  }
  const durMinFallback = scheduleTaskDurationMinutes(task, tz);
  return { start_time: newStartIso, end_time: null, duration_minutes: durMinFallback };
}

function addOneHourToWallStart(dateKey, timeHHmm, timeZone) {
  const tz = timeZone || DEFAULT_COMPANY_TIME_ZONE;
  const parts = String(timeHHmm || "09:00").trim().split(":");
  let H = Number(parts[0]);
  let M = Number(parts[1] ?? 0);
  if (!Number.isFinite(H)) H = 9;
  if (!Number.isFinite(M)) M = 0;
  H += 1;
  let endDate = dateKey;
  if (H >= 24) {
    H -= 24;
    endDate = addWallDaysInTimeZone(dateKey, 1, tz) || dateKey;
  }
  const endTime = `${String(Math.min(23, H)).padStart(2, "0")}:${String(Math.min(59, M)).padStart(2, "0")}`;
  return { endDate, endTime };
}

function addWallMonthsSafe(dateKey, deltaMonths, timeZone) {
  const tz = timeZone || DEFAULT_COMPANY_TIME_ZONE;
  const seg = String(dateKey || "").split("-");
  let y = Number(seg[0]);
  let m = Number(seg[1]);
  let d = Number(seg[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return dateKey;
  if (!Number.isFinite(d)) d = 1;
  m += deltaMonths;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  const last = lastWallDayOfMonthInTimeZone(y, m, tz);
  const lastD = Number(last.split("-")[2]);
  const day = Math.min(d, lastD);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Sunday-first month grid: 6 rows × 7 cols; cells may be outside anchor month (greyed). */
function buildMonthGridCells(anchorKey, timeZone) {
  const tz = timeZone || DEFAULT_COMPANY_TIME_ZONE;
  const seg = String(anchorKey || "").split("-");
  const y0 = Number(seg[0]);
  const m0 = Number(seg[1]);
  if (!Number.isFinite(y0) || !Number.isFinite(m0)) return { cells: [], monthYearLabel: "", firstOfMonth: "", lastOfMonth: "" };
  const firstOfMonth = `${y0}-${String(m0).padStart(2, "0")}-01`;
  const lastOfMonth = lastWallDayOfMonthInTimeZone(y0, m0, tz);
  let k = firstOfMonth;
  for (let guard = 0; guard < 14; guard += 1) {
    if (wallWeekdayLongInTimeZone(k, tz) === "Sunday") break;
    const prev = addWallDaysInTimeZone(k, -1, tz);
    if (!prev || prev === k) break;
    k = prev;
  }
  const cells = [];
  let cursor = k;
  for (let i = 0; i < 42; i += 1) {
    const inMonth = cursor >= firstOfMonth && cursor <= lastOfMonth;
    const dn = Number(cursor.split("-")[2]);
    cells.push({ dayKey: cursor, inMonth, dayNum: Number.isFinite(dn) ? dn : 0 });
    const next = addWallDaysInTimeZone(cursor, 1, tz);
    if (!next) break;
    cursor = next;
  }
  const isoMid = wallDateTimeToUtcIso(firstOfMonth, "12:00:00", tz);
  const monthYearLabel = isoMid
    ? new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "long", year: "numeric" }).format(new Date(isoMid))
    : `${y0}-${String(m0).padStart(2, "0")}`;
  return { cells, monthYearLabel, firstOfMonth, lastOfMonth };
}

function formatHourLabel12(h24) {
  if (!Number.isFinite(h24)) return "";
  const h = Math.max(0, Math.min(23, Math.floor(h24)));
  const am = h < 12;
  const hr12 = h % 12 === 0 ? 12 : h % 12;
  return `${hr12} ${am ? "AM" : "PM"}`;
}

function wallWeekdayShort(dateKey, timeZone) {
  const long = wallWeekdayLongInTimeZone(dateKey, timeZone);
  return long ? long.slice(0, 3) : "";
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
  const t0 = new Date(start).getTime();
  const t1 = new Date(end).getTime();
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return 0;
  return Math.max(0, Math.round((t1 - t0) / 60000));
}

function formatDuration(minutes) {
  const raw = Number(minutes);
  const safeMin = Number.isFinite(raw) ? Math.max(0, raw) : 0;
  const h = Math.floor(safeMin / 60);
  const m = safeMin % 60;
  return `${h}h ${m}m`;
}

function formatTimer(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatMoney(amount) {
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(safe);
}

function formatLocation(location) {
  if (!location) return "Location not captured";
  const lat = Number(location.latitude);
  const lng = Number(location.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "Location not available";
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
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
    hourlyRate: (() => {
      const hr = Number(row.hourly_rate ?? 0);
      return Number.isFinite(hr) ? hr : 0;
    })(),
    clockIn: row.clock_in,
    clockOut: row.clock_out ?? null,
    status: row.status || "Submitted",
    labour_cost: (() => {
      if (row.labour_cost == null || row.labour_cost === "") return undefined;
      const n = Number(row.labour_cost);
      return Number.isFinite(n) ? n : undefined;
    })(),
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
function scheduleAssignmentMessageSignature(row) {
  const title = String(row?.title ?? "").trim();
  const message = String(row?.message ?? "").trim();
  const taskId = String(row?.scheduledTaskId ?? row?.scheduled_task_id ?? "").trim();
  return `${taskId}|${title}|${message}`;
}

function buildScheduleAssignmentDisplay(task, companyTimeZone) {
  const taskTitle = String(task?.task_title ?? "").trim() || "Scheduled task";
  const wallKey = task?.start_time ? calendarDateKeyInTimeZone(task.start_time, companyTimeZone) : "";
  const wallParts = task?.start_time ? wallClockPartsInTimeZone(task.start_time, companyTimeZone) : {};
  const whenDisp =
    wallKey && wallParts.timeStr
      ? `${wallWeekdayShort(wallKey, companyTimeZone)} ${wallKey} - ${wallParts.timeStr}`
      : "";
  const projectName = String(task?.project_name ?? "").trim();
  const costCentre = String(task?.cost_centre ?? "").trim();
  const notes = String(task?.notes ?? "").trim();
  const msgParts = [
    `Task: ${taskTitle}`,
    whenDisp ? `When: ${whenDisp}` : "",
    projectName ? `Project: ${projectName}` : "",
    costCentre ? `Cost centre: ${costCentre}` : "",
    notes ? `Notes: ${notes}` : "",
  ].filter(Boolean);
  return {
    title: "New task assigned",
    taskTitle,
    whenDisp,
    projectName,
    costCentre,
    message: msgParts.join("\n") || "You were assigned a scheduled task.",
    browserBody: [taskTitle, whenDisp].filter(Boolean).join(" - ") || "Open the app to view your assignment.",
  };
}

function tryShowScheduleBrowserNotification(notificationRow, shownIdsRef) {
  const id = String(notificationRow?.id ?? notificationRow?.assignmentId ?? "");
  if (!id || shownIdsRef.current.has(id)) return;
  if (typeof window === "undefined" || !window.Notification) return;
  if (window.Notification.permission !== "granted") return;
  try {
    shownIdsRef.current.add(id);
    const n = new window.Notification("New task assigned", {
      body: String(notificationRow?.browserBody || notificationRow?.message || "").trim(),
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: `schedule-${id}`,
      data: { url: "/" },
    });
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        // ignore
      }
    };
  } catch (e) {
    console.warn("[NOTIFY] schedule system Notification failed", e);
    shownIdsRef.current.delete(id);
  }
}

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

/** Direct notification to specific recipients (e.g. scheduled task assignment). */
async function createDirectNotificationsForRecipients(supabase, params) {
  const {
    companyId,
    actorUserId,
    type,
    title,
    message,
    projectId,
    projectName,
    costCentre,
    relatedFolder,
    itemCount,
    recipientUserIds,
  } = params || {};
  if (!companyId || !actorUserId) return [];
  const ids = (Array.isArray(recipientUserIds) ? recipientUserIds : [])
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  if (ids.length === 0) return [];

  const createdNotificationIds = [];
  for (const recipient_user_id of ids) {
    const notificationRow = {
      company_id: companyId,
      recipient_user_id,
      actor_user_id: actorUserId,
      type: String(type || ""),
      title: String(title || ""),
      message: String(message || ""),
      read_at: null,
      is_read: false,
      project_id: projectId != null && projectId !== "" ? String(projectId) : null,
      project_name: projectName != null ? String(projectName) : null,
      cost_centre: costCentre != null ? String(costCentre) : null,
      related_timesheet_id: null,
      related_folder: relatedFolder != null ? String(relatedFolder) : null,
      item_count: itemCount != null && Number.isFinite(Number(itemCount)) ? Number(itemCount) : null,
    };
    const rpcPayload = {
      p_company_id: companyId,
      p_recipient_user_id: recipient_user_id,
      p_actor_user_id: actorUserId,
      p_type: notificationRow.type,
      p_title: notificationRow.title,
      p_message: notificationRow.message,
      p_project_id: notificationRow.project_id,
      p_project_name: notificationRow.project_name,
      p_cost_centre: notificationRow.cost_centre,
      p_related_timesheet_id: null,
      p_related_folder: notificationRow.related_folder,
      p_item_count: notificationRow.item_count,
    };
    try {
      const { data, error } = await supabase.rpc("create_company_notification", rpcPayload);
      if (error) {
        console.warn("[NOTIFY] direct rpc error", error);
      } else {
        const nid = rpcReturnedNotificationId(data);
        if (nid) {
          createdNotificationIds.push(nid);
          continue;
        }
        console.warn("[NOTIFY] direct rpc returned no notification id", data);
      }
    } catch (e) {
      console.warn("[NOTIFY] direct rpc exception", e);
    }

    try {
      const { data: inserted, error: insertError } = await supabase
        .from("notifications")
        .insert([notificationRow])
        .select("id")
        .maybeSingle();
      if (insertError) {
        console.warn("[NOTIFY] direct table insert error", insertError);
        continue;
      }
      const nid = inserted?.id != null ? String(inserted.id) : null;
      if (nid) createdNotificationIds.push(nid);
      else console.warn("[NOTIFY] direct table insert returned no notification id", inserted);
    } catch (e) {
      console.warn("[NOTIFY] direct table insert exception", e);
    }
  }
  if (createdNotificationIds.length > 0) {
    void requestSendPushForNotificationIds(createdNotificationIds);
  }
  return createdNotificationIds;
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

  // Employee assignment notification pop-up (confirm/OK)
  const [activeAssignNotif, setActiveAssignNotif] = useState(null);
  const [assignNotifSaving, setAssignNotifSaving] = useState(false);
  const shownAssignNotifIdsRef = useRef(new Set());
  const shownAssignMessageSignaturesRef = useRef(new Set());
  const [employeeNotifPermMessage, setEmployeeNotifPermMessage] = useState("");

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
  const scheduleRouteHandledRef = useRef(false);
  /** Once per login session: land employees on Schedule after company/role resolve (no repeated overrides). */
  const employeeScheduleLandingAppliedRef = useRef(false);
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

  useEffect(() => {
    if (!authUser?.id) {
      employeeScheduleLandingAppliedRef.current = false;
      return;
    }
    if (!companyChecked || !userCompany?.id || !isEmployeeRole) return;
    if (employeeScheduleLandingAppliedRef.current) return;
    employeeScheduleLandingAppliedRef.current = true;
    setActiveTab("schedule");
  }, [authUser?.id, companyChecked, userCompany?.id, isEmployeeRole]);

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

  /** V2a.1 Schedule: company-scoped scheduled_tasks (supervisor/owner only for team view). */
  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [scheduleAssigneesByTaskId, setScheduleAssigneesByTaskId] = useState({});
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0);
  /** list | cal1 | cal3 | cal7 | cal30 — Schedule tab list vs rolling calendar windows (company TZ). */
  const [scheduleViewMode, setScheduleViewMode] = useState("list");
  /** First day (YYYY-MM-DD) of the visible calendar range in company TZ. */
  const [scheduleCalendarAnchor, setScheduleCalendarAnchor] = useState("");
  /** List/compact: which task id is expanded for full detail (accept/decline) below the grid. */
  const [scheduleCalendarFocusTaskId, setScheduleCalendarFocusTaskId] = useState(null);
  /** Selected wall day for calendar headers / month highlighting (timeline + month). */
  const [scheduleCalendarSelectedDayKey, setScheduleCalendarSelectedDayKey] = useState("");
  /** Admin calendar Move Mode: task id string being repositioned via tap-on-slot (supervisor/owner only). */
  const [scheduleMoveModeTaskId, setScheduleMoveModeTaskId] = useState(null);
  /** Admin calendar drag state (timeline views only). */
  const [scheduleDragTaskId, setScheduleDragTaskId] = useState(null);
  const scheduleTimelineColsRef = useRef(null);
  const scheduleAdminDragRef = useRef({
    pointerId: null,
    task: null,
    anchorKeys: [],
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    dragging: false,
  });
  const [scheduleRescheduleSavingId, setScheduleRescheduleSavingId] = useState(null);
  const [scheduleCalendarMoveError, setScheduleCalendarMoveError] = useState("");
  const [scheduleFormOpen, setScheduleFormOpen] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState(() => ({ ...SCHEDULE_FORM_EMPTY }));
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleSaveError, setScheduleSaveError] = useState("");
  /** Members for Schedule assignee checkboxes (company_members + profiles; loaded on Schedule tab). */
  const [schedulePickMembers, setSchedulePickMembers] = useState([]);
  const [schedulePickMembersLoading, setSchedulePickMembersLoading] = useState(false);
  const [schedulePickMembersError, setSchedulePickMembersError] = useState("");
  /** Employee role: tasks linked via scheduled_task_assignees only. */
  const [employeeScheduledTasks, setEmployeeScheduledTasks] = useState([]);
  const [employeeScheduleLoading, setEmployeeScheduleLoading] = useState(false);
  const [employeeScheduleError, setEmployeeScheduleError] = useState("");
  /** task id string → current user's assignee row (for accept/decline + display). */
  const [employeeScheduleLinkByTaskId, setEmployeeScheduleLinkByTaskId] = useState({});
  const employeeScheduleKnownAssignmentIdsRef = useRef(new Set());
  const employeeScheduleBootstrappedRef = useRef(false);
  const employeeScheduleRefreshInFlightRef = useRef(false);
  const shownAssignmentRowIdsRef = useRef(new Set());
  /** Clock tab: this user's assigned tasks (assignee = auth user) for today / tomorrow — Scheduled Task dropdown. */
  const [clockEmployeeScheduledTasks, setClockEmployeeScheduledTasks] = useState([]);
  const [clockEmployeeScheduleLoading, setClockEmployeeScheduleLoading] = useState(false);
  const [clockSelectedScheduledTaskId, setClockSelectedScheduledTaskId] = useState("");
  const [scheduleResponseSavingAssigneeId, setScheduleResponseSavingAssigneeId] = useState(null);
  const [scheduleEmployeeDeclineTaskId, setScheduleEmployeeDeclineTaskId] = useState(null);
  const [scheduleEmployeeDeclineReason, setScheduleEmployeeDeclineReason] = useState("");
  const [scheduleEmployeeResponseInlineError, setScheduleEmployeeResponseInlineError] = useState("");
  const [scheduleEditingTaskId, setScheduleEditingTaskId] = useState(null);
  const [scheduleEditDraft, setScheduleEditDraft] = useState(null);
  const [scheduleEditSaving, setScheduleEditSaving] = useState(false);
  const [scheduleEditError, setScheduleEditError] = useState("");
  const [scheduleDeleteSavingId, setScheduleDeleteSavingId] = useState(null);

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
    if (!companyChecked) return;
    setScheduleCalendarAnchor((prev) => prev || calendarDateKeyInTimeZone(new Date(), companyTimeZone));
  }, [companyChecked, companyTimeZone]);

  useEffect(() => {
    setScheduleCalendarFocusTaskId(null);
  }, [scheduleViewMode, activeTab, scheduleCalendarAnchor]);

  const scheduleWallTodayKey = useMemo(
    () => calendarDateKeyInTimeZone(now, companyTimeZone),
    [now, companyTimeZone]
  );

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

  useEffect(() => {
    if (activeTab !== "schedule" || !isAdmin || !userCompany?.id || !companyChecked || !authUser?.id) {
      return;
    }
    let cancelled = false;
    setScheduleLoading(true);
    setScheduleError("");
    setSchedulePickMembersLoading(true);
    setSchedulePickMembersError("");
    (async () => {
      try {
        const tasksPromise = supabase
          .from("scheduled_tasks")
          .select("*")
          .eq("company_id", userCompany.id)
          .order("start_time", { ascending: true });
        const assigneesPromise = supabase
          .from("scheduled_task_assignees")
          .select(
            "id, scheduled_task_id, user_id, employee_name, employee_email, response_status, decline_reason, responded_at, updated_at"
          )
          .eq("company_id", userCompany.id);
        const membersPromise = supabase
          .from("company_members")
          .select("id, user_id, role, created_at")
          .eq("company_id", userCompany.id)
          .order("created_at", { ascending: true });

        const [{ data: taskData, error: taskErr }, { data: assignData, error: assignErr }, { data: membersRaw, error: memErr }] =
          await Promise.all([tasksPromise, assigneesPromise, membersPromise]);

        if (taskErr) throw taskErr;
        if (assignErr) throw assignErr;
        if (memErr) throw memErr;

        const byTask = {};
        for (const row of Array.isArray(assignData) ? assignData : []) {
          const tid = row?.scheduled_task_id;
          if (tid == null) continue;
          const k = String(tid);
          if (!byTask[k]) byTask[k] = [];
          byTask[k].push(row);
        }

        const list = Array.isArray(membersRaw) ? membersRaw : [];
        const ids = [...new Set(list.map((m) => m.user_id).filter(Boolean))];
        const profilesMap = {};
        if (ids.length > 0) {
          let { data: profs, error: pErr } = await supabase
            .from("profiles")
            .select("id, full_name, email, employment_status")
            .in("id", ids);
          if (pErr) {
            const retry = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
            if (retry.error) throw retry.error;
            profs = retry.data || [];
          }
          for (const p of profs || []) {
            profilesMap[p.id] = p;
          }
        }

        const pickRows = [];
        for (const m of list) {
          const p = profilesMap[m.user_id] || {};
          const empRaw = p.employment_status != null ? String(p.employment_status).trim().toLowerCase() : "active";
          if (empRaw === "archived") continue;
          const profileFull = (p.full_name && String(p.full_name).trim()) || "";
          const profileEmailRaw = (p.email && String(p.email).trim()) || "";
          const displayName = profileFull || profileEmailRaw || shortUserLabel(m.user_id);
          pickRows.push({
            userId: m.user_id,
            displayName: displayName || shortUserLabel(m.user_id),
            profileEmailRaw,
            role: (m.role || "employee").trim(),
          });
        }
        pickRows.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));

        if (!cancelled) {
          setScheduledTasks(Array.isArray(taskData) ? taskData : []);
          setScheduleAssigneesByTaskId(byTask);
          setSchedulePickMembers(pickRows);
        }
      } catch (err) {
        if (!cancelled) {
          setScheduleError(getErrorMessage(err));
          setScheduledTasks([]);
          setScheduleAssigneesByTaskId({});
          setSchedulePickMembersError(getErrorMessage(err));
          setSchedulePickMembers([]);
        }
      } finally {
        if (!cancelled) {
          setScheduleLoading(false);
          setSchedulePickMembersLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, isAdmin, userCompany?.id, companyChecked, authUser?.id, scheduleRefreshKey]);

  const refreshEmployeeAssignedSchedule = useCallback(
    async ({ detectNew = false, showLoading = false } = {}) => {
      if (isAdmin || !isEmployeeRole || !userCompany?.id || !companyChecked || !authUser?.id) return;
      if (employeeScheduleRefreshInFlightRef.current) return;
      employeeScheduleRefreshInFlightRef.current = true;
      if (showLoading) setEmployeeScheduleLoading(true);
      setEmployeeScheduleError("");
      try {
        const { data: links, error: linkErr } = await supabase
          .from("scheduled_task_assignees")
          .select(
            "id, scheduled_task_id, user_id, response_status, decline_reason, responded_at, updated_at, created_at, employee_name"
          )
          .eq("company_id", userCompany.id)
          .eq("user_id", authUser.id);
        if (linkErr) throw linkErr;
        const rawLinks = Array.isArray(links) ? links : [];
        const linkByTaskId = {};
        for (const row of rawLinks) {
          const tid = row?.scheduled_task_id;
          if (tid == null) continue;
          linkByTaskId[String(tid)] = row;
        }
        const taskIds = [...new Set(rawLinks.map((r) => r?.scheduled_task_id).filter(Boolean))];
        let taskRows = [];
        if (taskIds.length > 0) {
          const { data, error: tErr } = await supabase
            .from("scheduled_tasks")
            .select("*")
            .eq("company_id", userCompany.id)
            .in("id", taskIds)
            .order("start_time", { ascending: true });
          if (tErr) throw tErr;
          taskRows = Array.isArray(data) ? data : [];
        }

        setEmployeeScheduledTasks(taskRows);
        setEmployeeScheduleLinkByTaskId(linkByTaskId);
        const todayKey = calendarDateKeyInTimeZone(new Date(), companyTimeZone);
        const nextKey = addWallDaysInTimeZone(todayKey, 1, companyTimeZone);
        setClockEmployeeScheduledTasks(
          taskRows.filter((t) => {
            const dk = calendarDateKeyInTimeZone(t?.start_time, companyTimeZone);
            return dk === todayKey || dk === nextKey;
          })
        );

        const assignmentIds = new Set(rawLinks.map((r) => String(r?.id ?? "")).filter(Boolean));
        if (!employeeScheduleBootstrappedRef.current) {
          employeeScheduleBootstrappedRef.current = true;
          employeeScheduleKnownAssignmentIdsRef.current = assignmentIds;
          return;
        }

        const previousIds = employeeScheduleKnownAssignmentIdsRef.current;
        const newLinks = rawLinks
          .filter((r) => {
            const id = String(r?.id ?? "");
            return id && !previousIds.has(id) && !shownAssignmentRowIdsRef.current.has(id);
          })
          .sort((a, b) => String(a?.created_at || "").localeCompare(String(b?.created_at || "")));
        employeeScheduleKnownAssignmentIdsRef.current = assignmentIds;
        if (!detectNew || newLinks.length === 0 || activeAssignNotif || assignNotifSaving) return;

        const link = newLinks[0];
        const assignmentId = String(link.id);
        const task = taskRows.find((t) => String(t?.id) === String(link.scheduled_task_id)) || {};
        const display = buildScheduleAssignmentDisplay(task, companyTimeZone);
        let linkedNotification = null;
        try {
          const { data: notifRows } = await supabase
            .from("notifications")
            .select("*")
            .eq("recipient_user_id", authUser.id)
            .eq("company_id", userCompany.id)
            .eq("type", "schedule_assigned")
            .is("read_at", null)
            .order("created_at", { ascending: false })
            .limit(1);
          linkedNotification = Array.isArray(notifRows) && notifRows.length > 0 ? notifRows[0] : null;
        } catch {
          linkedNotification = null;
        }

        const popupRow = {
          ...(linkedNotification || {}),
          assignmentId,
          scheduledTaskId: link.scheduled_task_id,
          id: linkedNotification?.id ?? null,
          type: "schedule_assigned",
          title: "New task assigned",
          message: linkedNotification?.message || display.message,
          browserBody: display.browserBody,
          taskTitle: display.taskTitle,
          whenDisp: display.whenDisp,
          projectName: display.projectName,
          costCentre: display.costCentre,
        };
        shownAssignmentRowIdsRef.current.add(assignmentId);
        if (popupRow.id) shownAssignNotifIdsRef.current.add(String(popupRow.id));
        shownAssignMessageSignaturesRef.current.add(scheduleAssignmentMessageSignature(popupRow));
        setActiveAssignNotif(popupRow);
        tryShowScheduleBrowserNotification(popupRow, systemNotifShownIdsRef);
      } catch (err) {
        setEmployeeScheduleError(getErrorMessage(err));
        setEmployeeScheduledTasks([]);
        setEmployeeScheduleLinkByTaskId({});
      } finally {
        employeeScheduleRefreshInFlightRef.current = false;
        if (showLoading) setEmployeeScheduleLoading(false);
      }
    },
    [
      isAdmin,
      isEmployeeRole,
      userCompany?.id,
      companyChecked,
      authUser?.id,
      companyTimeZone,
      activeAssignNotif,
      assignNotifSaving,
    ]
  );

  /** Employee Schedule: only tasks where user appears in scheduled_task_assignees (same company). */
  useEffect(() => {
    if (isAdmin || !isEmployeeRole || !userCompany?.id || !companyChecked || !authUser?.id) {
      employeeScheduleKnownAssignmentIdsRef.current = new Set();
      employeeScheduleBootstrappedRef.current = false;
      shownAssignmentRowIdsRef.current = new Set();
      return;
    }
    void refreshEmployeeAssignedSchedule({ detectNew: false, showLoading: true });
  }, [
    isAdmin,
    isEmployeeRole,
    userCompany?.id,
    companyChecked,
    authUser?.id,
    scheduleRefreshKey,
    refreshEmployeeAssignedSchedule,
  ]);

  /** Clock tab: fetch current user's assignee-linked tasks for today + next calendar day (company TZ); any role. */
  useEffect(() => {
    if (activeTab !== "clock" || !userCompany?.id || !companyChecked || !authUser?.id) {
      return;
    }
    let cancelled = false;
    setClockEmployeeScheduleLoading(true);
    (async () => {
      try {
        const { data: links, error: linkErr } = await supabase
          .from("scheduled_task_assignees")
          .select("scheduled_task_id")
          .eq("company_id", userCompany.id)
          .eq("user_id", authUser.id);
        if (linkErr) throw linkErr;
        const rawLinks = Array.isArray(links) ? links : [];
        const idSet = [...new Set(rawLinks.map((r) => r?.scheduled_task_id).filter(Boolean))];
        if (idSet.length === 0) {
          if (!cancelled) setClockEmployeeScheduledTasks([]);
          return;
        }
        const { data: taskRows, error: tErr } = await supabase
          .from("scheduled_tasks")
          .select("id, task_title, start_time, project_id, project_name, cost_centre")
          .eq("company_id", userCompany.id)
          .in("id", idSet)
          .order("start_time", { ascending: true });
        if (tErr) throw tErr;
        const tz = companyTimeZone;
        const todayKey = calendarDateKeyInTimeZone(new Date(), tz);
        const nextKey = addWallDaysInTimeZone(todayKey, 1, tz);
        const rows = Array.isArray(taskRows) ? taskRows : [];
        const filtered = rows.filter((t) => {
          const dk = calendarDateKeyInTimeZone(t?.start_time, tz);
          return dk === todayKey || dk === nextKey;
        });
        if (!cancelled) setClockEmployeeScheduledTasks(filtered);
      } catch {
        if (!cancelled) setClockEmployeeScheduledTasks([]);
      } finally {
        if (!cancelled) setClockEmployeeScheduleLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, userCompany?.id, companyChecked, authUser?.id, companyTimeZone, scheduleRefreshKey]);

  /** Drop clock scheduled-task selection if that task is no longer in the filtered list. */
  useEffect(() => {
    if (!clockSelectedScheduledTaskId) return;
    const ok = (clockEmployeeScheduledTasks || []).some(
      (t) => String(t?.id) === String(clockSelectedScheduledTaskId)
    );
    if (!ok) setClockSelectedScheduledTaskId("");
  }, [clockEmployeeScheduledTasks, clockSelectedScheduledTaskId]);

  const scheduleTasksGroupedByDate = useMemo(() => {
    const rows = Array.isArray(scheduledTasks) ? scheduledTasks : [];
    const groups = {};
    for (const task of rows) {
      const rawStart = task?.start_time;
      let dateKey = "—";
      if (rawStart != null && rawStart !== "") {
        const k = calendarDateKeyInTimeZone(rawStart, companyTimeZone);
        dateKey = k && String(k).trim() !== "" ? k : "—";
      }
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(task);
    }
    const keys = Object.keys(groups).sort((a, b) => a.localeCompare(b));
    return keys.map((dateKey) => ({ dateKey, tasks: Array.isArray(groups[dateKey]) ? groups[dateKey] : [] }));
  }, [scheduledTasks, companyTimeZone]);

  const adminScheduledTaskById = useMemo(() => {
    const m = {};
    for (const t of Array.isArray(scheduledTasks) ? scheduledTasks : []) {
      if (t?.id != null) m[String(t.id)] = t;
    }
    return m;
  }, [scheduledTasks]);

  const employeeScheduleTasksGroupedByDate = useMemo(() => {
    const rows = Array.isArray(employeeScheduledTasks) ? employeeScheduledTasks : [];
    const groups = {};
    for (const task of rows) {
      const rawStart = task?.start_time;
      let dateKey = "—";
      if (rawStart != null && rawStart !== "") {
        const k = calendarDateKeyInTimeZone(rawStart, companyTimeZone);
        dateKey = k && String(k).trim() !== "" ? k : "—";
      }
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(task);
    }
    const keys = Object.keys(groups).sort((a, b) => a.localeCompare(b));
    return keys.map((dateKey) => ({ dateKey, tasks: Array.isArray(groups[dateKey]) ? groups[dateKey] : [] }));
  }, [employeeScheduledTasks, companyTimeZone]);

  const scheduleCalendarDaySpan = useMemo(() => {
    if (scheduleViewMode === "cal1") return 1;
    if (scheduleViewMode === "cal3") return 3;
    if (scheduleViewMode === "cal7") return 7;
    if (scheduleViewMode === "cal30") return 30;
    return 0;
  }, [scheduleViewMode]);

  const scheduleCalendarRangeEndKey = useMemo(() => {
    if (scheduleCalendarDaySpan < 1) return "";
    const tz = companyTimeZone;
    const start = scheduleCalendarAnchor || calendarDateKeyInTimeZone(new Date(), tz);
    if (!start) return "";
    if (scheduleViewMode === "cal30") {
      const [y, m] = start.split("-").map(Number);
      if (!Number.isFinite(y) || !Number.isFinite(m)) return "";
      return lastWallDayOfMonthInTimeZone(y, m, tz);
    }
    return addWallDaysInTimeZone(start, scheduleCalendarDaySpan - 1, tz);
  }, [scheduleCalendarDaySpan, scheduleCalendarAnchor, companyTimeZone, scheduleViewMode]);

  const scheduleCalendarVisibleDayKeys = useMemo(() => {
    if (scheduleViewMode === "list" || scheduleCalendarDaySpan < 1 || scheduleViewMode === "cal30") return [];
    const tz = companyTimeZone;
    const start = scheduleCalendarAnchor || calendarDateKeyInTimeZone(new Date(), tz);
    const end = scheduleCalendarRangeEndKey;
    if (!start || !end) return [];
    return enumerateScheduleDayKeys(start, end, tz);
  }, [
    scheduleViewMode,
    scheduleCalendarDaySpan,
    scheduleCalendarAnchor,
    scheduleCalendarRangeEndKey,
    companyTimeZone,
  ]);

  const scheduleMonthGridInfo = useMemo(() => {
    if (scheduleViewMode !== "cal30") {
      return { cells: [], monthYearLabel: "", firstOfMonth: "", lastOfMonth: "" };
    }
    return buildMonthGridCells(
      scheduleCalendarAnchor || calendarDateKeyInTimeZone(new Date(), companyTimeZone),
      companyTimeZone
    );
  }, [scheduleViewMode, scheduleCalendarAnchor, companyTimeZone]);

  const scheduleAdminTasksInCalendarRange = useMemo(() => {
    if (scheduleViewMode === "list" || scheduleCalendarDaySpan < 1) return [];
    const tz = companyTimeZone;
    const start = scheduleCalendarAnchor || calendarDateKeyInTimeZone(new Date(), tz);
    if (!start) return [];
    if (scheduleViewMode === "cal30") {
      const [y, m] = start.split("-").map(Number);
      if (!Number.isFinite(y) || !Number.isFinite(m)) return [];
      const fromKey = `${y}-${String(m).padStart(2, "0")}-01`;
      const toKey = lastWallDayOfMonthInTimeZone(y, m, tz);
      return filterScheduledTasksByWallDateRange(scheduledTasks, fromKey, toKey, tz);
    }
    const end = scheduleCalendarRangeEndKey;
    if (!end) return [];
    return filterScheduledTasksByWallDateRange(scheduledTasks, start, end, tz);
  }, [
    scheduleViewMode,
    scheduleCalendarDaySpan,
    scheduleCalendarAnchor,
    scheduleCalendarRangeEndKey,
    scheduledTasks,
    companyTimeZone,
  ]);

  const scheduleEmployeeTasksInCalendarRange = useMemo(() => {
    if (scheduleViewMode === "list" || scheduleCalendarDaySpan < 1) return [];
    const tz = companyTimeZone;
    const start = scheduleCalendarAnchor || calendarDateKeyInTimeZone(new Date(), tz);
    if (!start) return [];
    if (scheduleViewMode === "cal30") {
      const [y, m] = start.split("-").map(Number);
      if (!Number.isFinite(y) || !Number.isFinite(m)) return [];
      const fromKey = `${y}-${String(m).padStart(2, "0")}-01`;
      const toKey = lastWallDayOfMonthInTimeZone(y, m, tz);
      return filterScheduledTasksByWallDateRange(employeeScheduledTasks, fromKey, toKey, tz);
    }
    const end = scheduleCalendarRangeEndKey;
    if (!end) return [];
    return filterScheduledTasksByWallDateRange(employeeScheduledTasks, start, end, tz);
  }, [
    scheduleViewMode,
    scheduleCalendarDaySpan,
    scheduleCalendarAnchor,
    scheduleCalendarRangeEndKey,
    employeeScheduledTasks,
    companyTimeZone,
  ]);

  const adminScheduleTasksByDay = useMemo(() => {
    const map = {};
    for (const t of scheduleAdminTasksInCalendarRange) {
      const dk = calendarDateKeyInTimeZone(t?.start_time, companyTimeZone);
      if (!dk) continue;
      if (!map[dk]) map[dk] = [];
      map[dk].push(t);
    }
    for (const k of Object.keys(map)) {
      map[k].sort(compareScheduleTaskStart);
    }
    return map;
  }, [scheduleAdminTasksInCalendarRange, companyTimeZone]);

  const employeeScheduleTasksByDay = useMemo(() => {
    const map = {};
    for (const t of scheduleEmployeeTasksInCalendarRange) {
      const dk = calendarDateKeyInTimeZone(t?.start_time, companyTimeZone);
      if (!dk) continue;
      if (!map[dk]) map[dk] = [];
      map[dk].push(t);
    }
    for (const k of Object.keys(map)) {
      map[k].sort(compareScheduleTaskStart);
    }
    return map;
  }, [scheduleEmployeeTasksInCalendarRange, companyTimeZone]);

  useEffect(() => {
    if (scheduleViewMode !== "cal1" && scheduleViewMode !== "cal3" && scheduleViewMode !== "cal7") return;
    const keys = scheduleCalendarVisibleDayKeys;
    if (!Array.isArray(keys) || keys.length === 0) return;
    const t = calendarDateKeyInTimeZone(now, companyTimeZone);
    setScheduleCalendarSelectedDayKey((prev) => {
      if (prev && keys.includes(prev)) return prev;
      return keys.includes(t) ? t : keys[0];
    });
  }, [scheduleViewMode, scheduleCalendarVisibleDayKeys, now, companyTimeZone]);

  useEffect(() => {
    if (scheduleViewMode !== "cal30") return;
    const tz = companyTimeZone;
    const anchor = scheduleCalendarAnchor || calendarDateKeyInTimeZone(new Date(), tz);
    const t = calendarDateKeyInTimeZone(now, tz);
    const cells = Array.isArray(scheduleMonthGridInfo?.cells) ? scheduleMonthGridInfo.cells : [];
    const keySet = new Set(cells.map((c) => c?.dayKey).filter(Boolean));
    setScheduleCalendarSelectedDayKey((prev) => {
      if (prev && keySet.has(prev)) return prev;
      if (t && keySet.has(t)) return t;
      if (anchor && keySet.has(anchor)) return anchor;
      const first = cells[0]?.dayKey;
      return first && keySet.has(first) ? first : "";
    });
  }, [scheduleViewMode, scheduleMonthGridInfo, scheduleCalendarAnchor, now, companyTimeZone]);

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

  const scheduleCostCentreOptions = useMemo(() => {
    const pid = scheduleDraft?.projectId;
    if (pid == null || String(pid).trim() === "") return [];
    const list =
      effectiveCostCentresByProjectId[String(pid)] || effectiveCostCentresByProjectId[Number(pid)] || [];
    return Array.isArray(list) ? list : [];
  }, [scheduleDraft?.projectId, effectiveCostCentresByProjectId]);

  const scheduleEditCostCentreOptions = useMemo(() => {
    const pid = scheduleEditDraft?.projectId;
    if (pid == null || String(pid).trim() === "") return [];
    const list =
      effectiveCostCentresByProjectId[String(pid)] || effectiveCostCentresByProjectId[Number(pid)] || [];
    return Array.isArray(list) ? list : [];
  }, [scheduleEditDraft?.projectId, effectiveCostCentresByProjectId]);

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
    const raw = computeLabourCostFromWallTimes(record.clockIn, end, Number(record.hourlyRate ?? 0));
    return Number.isFinite(raw) ? raw : 0;
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

  // Employee pop-up for new unread assignment notifications (WhatsApp-style confirm).
  useEffect(() => {
    if (isAdmin) return; // employees only
    if (!authUser?.id || !userCompany?.id) return;
    if (activeAssignNotif || assignNotifSaving) return;
    const rows = Array.isArray(inAppNotifications) ? inAppNotifications : [];
    const first = rows.find((n) => {
      const id = String(n?.id ?? "");
      if (!id) return false;
      if (shownAssignNotifIdsRef.current.has(id)) return false;
      if (shownAssignMessageSignaturesRef.current.has(scheduleAssignmentMessageSignature(n))) return false;
      const unread = n?.read_at == null && n?.is_read !== true;
      if (!unread) return false;
      const t = String(n?.type ?? "").trim().toLowerCase();
      return t === "schedule_assigned" || t === "scheduled_task_assigned" || t === "task_assigned";
    });
    if (!first) return;
    const nid = String(first.id);
    shownAssignNotifIdsRef.current.add(nid);
    const popupRow = { ...first, title: "New task assigned" };
    shownAssignMessageSignaturesRef.current.add(scheduleAssignmentMessageSignature(popupRow));
    setActiveAssignNotif(popupRow);
    // Trigger background refresh so the Schedule tab updates even if user stays on another tab.
    setScheduleRefreshKey((k) => k + 1);

    // Optional system notification if permission already granted.
    tryShowScheduleBrowserNotification(popupRow, systemNotifShownIdsRef);
  }, [isAdmin, authUser?.id, userCompany?.id, inAppNotifications, activeAssignNotif, assignNotifSaving]);

  useEffect(() => {
    if (!authUser?.id || !userCompany?.id) {
      setInAppNotifUnread(0);
      setInAppNotifications([]);
      setLiveToast(null);
      notifPollBootstrappedRef.current = false;
      notifLastUnreadIdsRef.current = new Set();
      systemNotifShownIdsRef.current = new Set();
      shownAssignNotifIdsRef.current = new Set();
      shownAssignMessageSignaturesRef.current = new Set();
      scheduleRouteHandledRef.current = false;
      return;
    }
    void pollInAppNotifications();
    const interval = setInterval(() => void pollInAppNotifications(), 15000);
    return () => clearInterval(interval);
  }, [authUser?.id, userCompany?.id, pollInAppNotifications]);

  useEffect(() => {
    if (isAdmin || !isEmployeeRole || !authUser?.id || !userCompany?.id || !companyChecked) return;

    const refresh = () => {
      void refreshEmployeeAssignedSchedule({ detectNew: true, showLoading: false });
    };

    refresh();
    const interval = setInterval(refresh, 7000);
    const onFocus = () => refresh();
    const onVisibility = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [
    isAdmin,
    isEmployeeRole,
    authUser?.id,
    userCompany?.id,
    companyChecked,
    refreshEmployeeAssignedSchedule,
  ]);

  useEffect(() => {
    if (!authUser?.id || !userCompany?.id || !companyChecked || scheduleRouteHandledRef.current) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search || "");
    if (params.get("tab") !== "schedule") return;
    scheduleRouteHandledRef.current = true;
    setActiveTab("schedule");
    if (!isAdmin && isEmployeeRole) {
      void refreshEmployeeAssignedSchedule({ detectNew: false, showLoading: true });
    }
    const notificationId = String(params.get("notificationId") || "").trim();
    if (notificationId) {
      const ts = new Date().toISOString();
      void supabase
        .from("notifications")
        .update({ read_at: ts, is_read: true })
        .eq("id", notificationId)
        .eq("recipient_user_id", authUser.id)
        .then(({ error }) => {
          if (error) console.warn("[NOTIFY] mark schedule URL read failed", error);
          else {
            setInAppNotifications((prev) =>
              (Array.isArray(prev) ? prev : []).map((x) =>
                String(x?.id) === notificationId ? { ...x, read_at: ts, is_read: true } : x
              )
            );
          }
        });
    }
  }, [
    authUser?.id,
    userCompany?.id,
    companyChecked,
    isAdmin,
    isEmployeeRole,
    refreshEmployeeAssignedSchedule,
  ]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
    const onMessage = (event) => {
      const data = event?.data || {};
      if (data.type !== "OPEN_SCHEDULE") return;
      setActiveTab("schedule");
      if (!isAdmin && isEmployeeRole) {
        void refreshEmployeeAssignedSchedule({ detectNew: false, showLoading: true });
      }
      const notificationId = String(data.notificationId || "").trim();
      if (notificationId && authUser?.id) {
        const ts = new Date().toISOString();
        void supabase
          .from("notifications")
          .update({ read_at: ts, is_read: true })
          .eq("id", notificationId)
          .eq("recipient_user_id", authUser.id)
          .then(({ error }) => {
            if (error) console.warn("[NOTIFY] mark schedule click read failed", error);
            else {
              setInAppNotifications((prev) =>
                (Array.isArray(prev) ? prev : []).map((x) =>
                  String(x?.id) === notificationId ? { ...x, read_at: ts, is_read: true } : x
                )
              );
            }
          });
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [authUser?.id, isAdmin, isEmployeeRole, refreshEmployeeAssignedSchedule]);

  useEffect(() => {
    if (!isAdmin && activeTab === "notifications") setActiveTab("schedule");
  }, [isAdmin, activeTab]);

  useEffect(() => {
    if (!isAdmin && activeTab === "dashboard") setActiveTab("schedule");
  }, [isAdmin, activeTab]);

  useEffect(() => {
    if (!isAdmin && activeTab === "projects") setActiveTab("schedule");
  }, [isAdmin, activeTab]);

  useEffect(() => {
    if (isEmployeeRole && activeTab === "team") setActiveTab("schedule");
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
    if (!isAdmin && activeTab === "reports") setActiveTab("schedule");
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
    if (!visibleCurrentShift?.clockIn) return 0;
    const tIn = new Date(visibleCurrentShift.clockIn).getTime();
    const tNow = now instanceof Date ? now.getTime() : new Date(now).getTime();
    if (!Number.isFinite(tIn) || !Number.isFinite(tNow)) return 0;
    const totalSeconds = Math.max(0, Math.floor((tNow - tIn) / 1000));
    let activeBreakSeconds = 0;
    if (visibleCurrentShift.breakStart && !visibleCurrentShift.breakEnd) {
      const tBreak = new Date(visibleCurrentShift.breakStart).getTime();
      if (Number.isFinite(tBreak)) {
        activeBreakSeconds = Math.max(0, Math.floor((tNow - tBreak) / 1000));
      }
    }
    return Math.max(0, totalSeconds - activeBreakSeconds);
  }, [visibleCurrentShift, now]);

  const liveEarnings = (() => {
    if (!visibleCurrentShift) return 0;
    const rate = Number(visibleCurrentShift.hourlyRate ?? 0);
    const r = Number.isFinite(rate) ? rate : 0;
    const earned = (liveSeconds / 3600) * r;
    return Number.isFinite(earned) ? earned : 0;
  })();

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
    const employeeAllowedTabs = new Set(["clock", "timesheet", "photos", "receipts", "settings", "schedule"]);
    if (isEmployeeRole && !employeeAllowedTabs.has(tabName)) {
      setIsMenuOpen(false);
      setActiveTab("schedule");
      return;
    }
    setActiveTab(tabName);
    if (tabName === "photos") setPhotoNotificationCount(0);
    setIsMenuOpen(false);
  };

  const handleEmployeeScheduleAccept = useCallback(
    async (assigneeRowId) => {
      const aid = assigneeRowId != null ? String(assigneeRowId).trim() : "";
      if (!aid || !authUser?.id || !userCompany?.id) return;
      setScheduleEmployeeResponseInlineError("");
      setScheduleResponseSavingAssigneeId(aid);
      try {
        const nowIso = new Date().toISOString();
        const { error } = await supabase
          .from("scheduled_task_assignees")
          .update({
            response_status: "accepted",
            decline_reason: null,
            responded_at: nowIso,
          })
          .eq("id", aid)
          .eq("user_id", authUser.id)
          .eq("company_id", userCompany.id);
        if (error) throw error;
        setScheduleEmployeeDeclineTaskId(null);
        setScheduleEmployeeDeclineReason("");
        setScheduleRefreshKey((k) => k + 1);
      } catch (err) {
        setScheduleEmployeeResponseInlineError(getErrorMessage(err));
      } finally {
        setScheduleResponseSavingAssigneeId(null);
      }
    },
    [authUser?.id, userCompany?.id]
  );

  const handleEmployeeScheduleDecline = useCallback(
    async (assigneeRowId, reasonRaw) => {
      const aid = assigneeRowId != null ? String(assigneeRowId).trim() : "";
      const reason = String(reasonRaw ?? "").trim();
      if (!aid || !authUser?.id || !userCompany?.id) return;
      if (!reason) {
        setScheduleEmployeeResponseInlineError("Please enter a reason for declining.");
        return;
      }
      setScheduleEmployeeResponseInlineError("");
      setScheduleResponseSavingAssigneeId(aid);
      try {
        const nowIso = new Date().toISOString();
        const { error } = await supabase
          .from("scheduled_task_assignees")
          .update({
            response_status: "declined",
            decline_reason: reason,
            responded_at: nowIso,
          })
          .eq("id", aid)
          .eq("user_id", authUser.id)
          .eq("company_id", userCompany.id);
        if (error) throw error;
        setScheduleEmployeeDeclineTaskId(null);
        setScheduleEmployeeDeclineReason("");
        setScheduleRefreshKey((k) => k + 1);
      } catch (err) {
        setScheduleEmployeeResponseInlineError(getErrorMessage(err));
      } finally {
        setScheduleResponseSavingAssigneeId(null);
      }
    },
    [authUser?.id, userCompany?.id]
  );

  const openScheduleCreateFromSlot = useCallback(
    (dateKey, timeHHmm = "09:00") => {
      setScheduleSaveError("");
      setScheduleEditingTaskId(null);
      setScheduleEditDraft(null);
      setScheduleEditError("");
      const tm = String(timeHHmm ?? "09:00").trim();
      const safeTime = tm.length >= 5 ? tm.slice(0, 5) : "09:00";
      const { endDate, endTime } = addOneHourToWallStart(dateKey, safeTime, companyTimeZone);
      setScheduleDraft({
        ...SCHEDULE_FORM_EMPTY,
        assignedUserIds: [],
        startDate: dateKey,
        startTime: safeTime,
        endDate: endDate,
        endTime: endTime,
        durationMinutes: "",
      });
      setScheduleFormOpen(true);
    },
    [companyTimeZone]
  );

  const openAdminScheduleEditFromCalendar = useCallback(
    (task) => {
      const tidKey = task?.id != null ? String(task.id) : "";
      const rawAssignList = tidKey ? scheduleAssigneesByTaskId?.[tidKey] : undefined;
      const assignRowsForTask = Array.isArray(rawAssignList) ? rawAssignList : [];
      setScheduleMoveModeTaskId(null);
      setScheduleViewMode("list");
      setScheduleFormOpen(false);
      setScheduleSaveError("");
      setScheduleEditError("");
      setScheduleEditDraft(buildScheduleEditDraftFromTask(task, assignRowsForTask, companyTimeZone));
      setScheduleEditingTaskId(tidKey);
    },
    [scheduleAssigneesByTaskId, companyTimeZone]
  );

  const beginScheduleMoveMode = useCallback((task) => {
    if (!isAdmin || !task?.id) return;
    setScheduleCalendarMoveError("");
    setScheduleFormOpen(false);
    setScheduleSaveError("");
    setScheduleEditingTaskId(null);
    setScheduleEditDraft(null);
    setScheduleEditError("");
    setScheduleMoveModeTaskId(String(task.id));
  }, [isAdmin]);

  const persistAdminScheduledTaskClockMove = useCallback(
    async (task, newStartIso) => {
      if (!isAdmin || !userCompany?.id || !task?.id || !newStartIso) return;
      const tid = String(task.id);
      const payload = buildScheduledTaskClockMovePayload(task, newStartIso, companyTimeZone);
      if (!payload) {
        setScheduleCalendarMoveError("Could not compute the new schedule.");
        return;
      }
      setScheduleCalendarMoveError("");
      setScheduleRescheduleSavingId(tid);
      try {
        const { error } = await supabase
          .from("scheduled_tasks")
          .update(payload)
          .eq("id", tid)
          .eq("company_id", userCompany.id);
        if (error) throw error;
        setScheduleMoveModeTaskId(null);
        setScheduleRefreshKey((k) => k + 1);
      } catch (err) {
        const msg = getErrorMessage(err);
        setScheduleCalendarMoveError(msg);
        setScheduleRefreshKey((k) => k + 1);
      } finally {
        setScheduleRescheduleSavingId(null);
      }
    },
    [isAdmin, userCompany?.id, companyTimeZone]
  );

  const handleAdminTimelineTaskPointerDown = useCallback(
    (e, task, anchorKeys) => {
      if (!isAdmin || !task?.id) return;
      const tid = String(task.id);
      const te = e.target;
      const el =
        te instanceof Element ? te : te?.parentNode instanceof Element ? te.parentNode : null;
      if (el instanceof Element && el.closest("button, a[href], input, select, textarea, label")) return;
      if (scheduleEditSaving || scheduleDeleteSavingId === tid || scheduleRescheduleSavingId === tid) return;
      if (scheduleMoveModeTaskId) setScheduleMoveModeTaskId(null);

      e.preventDefault();
      e.stopPropagation();

      const pid = e.pointerId;
      scheduleAdminDragRef.current = {
        pointerId: pid,
        task,
        anchorKeys: Array.isArray(anchorKeys) ? anchorKeys : [],
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        dragging: false,
      };
      setScheduleDragTaskId(tid);

      try {
        e.currentTarget?.setPointerCapture?.(pid);
      } catch {
        // ignore
      }
    },
    [
      isAdmin,
      scheduleEditSaving,
      scheduleDeleteSavingId,
      scheduleRescheduleSavingId,
      scheduleMoveModeTaskId,
    ]
  );

  const handleAdminTimelineTaskPointerMove = useCallback((e) => {
    const st = scheduleAdminDragRef.current;
    if (!st?.pointerId || e.pointerId !== st.pointerId) return;
    e.preventDefault();
    st.lastX = e.clientX;
    st.lastY = e.clientY;
    if (!st.dragging) {
      if (Math.hypot(st.lastX - st.startX, st.lastY - st.startY) > 8) st.dragging = true;
    }
  }, []);

  const handleAdminTimelineTaskPointerUp = useCallback(
    (e) => {
      const st = scheduleAdminDragRef.current;
      if (!st?.pointerId || e.pointerId !== st.pointerId) return;
      e.preventDefault();
      e.stopPropagation();

      const task = st.task;
      const tid = task?.id != null ? String(task.id) : "";
      const anchorKeys = Array.isArray(st.anchorKeys) ? st.anchorKeys : [];
      const wasDragging = Boolean(st.dragging);
      const dropX = st.lastX;
      const dropY = st.lastY;

      scheduleAdminDragRef.current = {
        pointerId: null,
        task: null,
        anchorKeys: [],
        startX: 0,
        startY: 0,
        lastX: 0,
        lastY: 0,
        dragging: false,
      };
      setScheduleDragTaskId(null);

      if (!task || !tid) return;

      if (!wasDragging) {
        openAdminScheduleEditFromCalendar(task);
        return;
      }

      const colsNode = scheduleTimelineColsRef.current;
      if (!(colsNode instanceof Element)) {
        setScheduleCalendarMoveError("Unable to determine drop target. Try again.");
        return;
      }
      const rect = colsNode.getBoundingClientRect();
      const colCount = anchorKeys.length || 1;
      const w = rect.width > 0 ? rect.width : 1;
      const x = Math.min(Math.max(0, dropX - rect.left), w - 1);
      const dayIndex = Math.min(colCount - 1, Math.max(0, Math.floor((x / w) * colCount)));
      const dayKey = anchorKeys[dayIndex];
      if (!dayKey) return;

      const h = rect.height > 0 ? rect.height : 1;
      const y = Math.min(Math.max(0, dropY - rect.top), h - 1);
      const pct = Math.max(0, Math.min(1, y / h));
      const minsRaw = pct * SCHEDULE_GRID_TOTAL_MINUTES;
      const snapped = Math.round(minsRaw / 15) * 15;
      const totalMin = Math.max(0, Math.min(SCHEDULE_GRID_TOTAL_MINUTES - 15, snapped));
      const h0 = SCHEDULE_GRID_HOUR_START + Math.floor(totalMin / 60);
      const m0 = totalMin % 60;
      const hh = String(Math.min(23, Math.max(0, h0))).padStart(2, "0");
      const mm = String(Math.min(59, m0)).padStart(2, "0");
      const wallTime = `${hh}:${mm}`;

      const newStartIso = wallDateTimeToUtcIso(dayKey, normalizeTimeInputForWallClock(wallTime), companyTimeZone);
      if (!newStartIso) {
        setScheduleCalendarMoveError("Could not compute the new start time.");
        return;
      }

      const origDay = calendarDateKeyInTimeZone(task?.start_time, companyTimeZone);
      const origM = wallMinutesFromScheduleGridStart(task?.start_time, origDay, companyTimeZone);
      const origSnap = origM != null ? Math.round(Number(origM) / 15) * 15 : null;
      if (origDay === dayKey && origSnap === totalMin) return;

      void persistAdminScheduledTaskClockMove(task, newStartIso);
    },
    [companyTimeZone, openAdminScheduleEditFromCalendar, persistAdminScheduledTaskClockMove]
  );

  const handleAdminScheduleDayBackgroundClick = useCallback(
    (e, dayKey) => {
      if (isAdminScheduleCalendarBackgroundIgnored(e)) return;
      const colH = (SCHEDULE_GRID_HOUR_END - SCHEDULE_GRID_HOUR_START) * SCHEDULE_GRID_PX_PER_HOUR;
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const pct = colH > 0 ? Math.max(0, Math.min(1, y / colH)) : 0;
      const minsRaw = pct * SCHEDULE_GRID_TOTAL_MINUTES;
      const snapped = Math.round(minsRaw / 15) * 15;
      const totalMin = Math.max(0, Math.min(SCHEDULE_GRID_TOTAL_MINUTES - 1, snapped));
      const h0 = SCHEDULE_GRID_HOUR_START + Math.floor(totalMin / 60);
      const m0 = totalMin % 60;
      const hh = String(Math.min(23, Math.max(0, h0))).padStart(2, "0");
      const mm = String(Math.min(59, m0)).padStart(2, "0");
      const wallTime = `${hh}:${mm}`;
      if (scheduleMoveModeTaskId) {
        const task = adminScheduledTaskById[String(scheduleMoveModeTaskId)];
        if (!task) {
          setScheduleCalendarMoveError("Could not find that task. Cancel Move and refresh.");
          return;
        }
        const newStartIso = wallDateTimeToUtcIso(
          dayKey,
          normalizeTimeInputForWallClock(wallTime),
          companyTimeZone
        );
        if (!newStartIso) {
          setScheduleCalendarMoveError("Could not compute the new start time.");
          return;
        }
        const origDay = calendarDateKeyInTimeZone(task?.start_time, companyTimeZone);
        const origM = wallMinutesFromScheduleGridStart(task?.start_time, origDay, companyTimeZone);
        const origSnap = origM != null ? Math.round(Number(origM) / 15) * 15 : null;
        if (origDay === dayKey && origSnap === totalMin) return;
        void persistAdminScheduledTaskClockMove(task, newStartIso);
        return;
      }
      openScheduleCreateFromSlot(dayKey, wallTime);
    },
    [
      openScheduleCreateFromSlot,
      scheduleMoveModeTaskId,
      adminScheduledTaskById,
      persistAdminScheduledTaskClockMove,
      companyTimeZone,
    ]
  );

  const handleScheduleSubmit = useCallback(
    async (event) => {
      event?.preventDefault?.();
      if (!isAdmin || !userCompany?.id || !authUser?.id) return;
      setScheduleSaveError("");
      const taskTitle = String(scheduleDraft?.title ?? "").trim();
      const startDate = String(scheduleDraft?.startDate ?? "").trim();
      if (!taskTitle || !startDate) {
        setScheduleSaveError("Task title and start date are required.");
        return;
      }
      const startIso = wallDateTimeToUtcIso(startDate, normalizeTimeInputForWallClock(scheduleDraft?.startTime), companyTimeZone);
      if (!startIso) {
        setScheduleSaveError("Invalid start date or time.");
        return;
      }
      let endTimeVal = null;
      let durationMinutesVal = null;
      const endDateRaw = String(scheduleDraft?.endDate ?? "").trim();
      const endTimeRaw = String(scheduleDraft?.endTime ?? "").trim();
      if (endDateRaw && endTimeRaw) {
        const endIso = wallDateTimeToUtcIso(endDateRaw, normalizeTimeInputForWallClock(endTimeRaw), companyTimeZone);
        if (!endIso) {
          setScheduleSaveError("Invalid end date or time.");
          return;
        }
        endTimeVal = endIso;
      } else {
        const dmRaw = String(scheduleDraft?.durationMinutes ?? "").trim();
        if (dmRaw !== "") {
          const n = Number(dmRaw);
          if (!Number.isFinite(n) || n <= 0) {
            setScheduleSaveError("Duration must be a positive number of minutes.");
            return;
          }
          durationMinutesVal = Math.round(n);
        }
      }

      const pidRaw = String(scheduleDraft?.projectId ?? "").trim();
      const projectIdVal = pidRaw === "" ? null : pidRaw;
      let projectNameVal = null;
      if (projectIdVal) {
        const proj = (companyProjects || []).find((p) => String(p?.id) === String(projectIdVal));
        const nm = proj?.name != null ? String(proj.name).trim() : "";
        projectNameVal = nm || null;
      }

      const costCentreVal = projectIdVal
        ? String(scheduleDraft?.costCentre ?? "").trim() || null
        : null;
      const notesVal = String(scheduleDraft?.notes ?? "").trim() || null;
      const assignTeamVal = String(scheduleDraft?.assignedTeamPlaceholder ?? "").trim() || null;
      const selectedIdsRaw = Array.isArray(scheduleDraft?.assignedUserIds) ? scheduleDraft.assignedUserIds : [];
      const selectedIds = [...new Set(selectedIdsRaw.map((id) => String(id)).filter(Boolean))];
      const nameParts = selectedIds
        .map((uid) => {
          const m = (schedulePickMembers || []).find((x) => String(x.userId) === String(uid));
          return m?.displayName ? String(m.displayName).trim() : "";
        })
        .filter(Boolean);
      const namesCsv = nameParts.length > 0 ? nameParts.join(", ") : null;

      const statusVal = String(scheduleDraft?.status ?? "scheduled").trim() || "scheduled";

      const payload = {
        company_id: userCompany.id,
        task_title: taskTitle,
        notes: notesVal,
        start_time: startIso,
        end_time: endTimeVal,
        duration_minutes: durationMinutesVal,
        project_id: projectIdVal,
        project_name: projectNameVal,
        cost_centre: costCentreVal,
        status: statusVal,
        created_by: authUser.id,
        assigned_employee_name: namesCsv,
        assigned_team: assignTeamVal,
      };

      setScheduleSaving(true);
      try {
        const { data: createdRow, error: insertErr } = await supabase
          .from("scheduled_tasks")
          .insert([payload])
          .select("id")
          .maybeSingle();
        if (insertErr) throw insertErr;
        let newTaskId = createdRow?.id != null ? String(createdRow.id) : null;
        if (!newTaskId && selectedIds.length > 0) {
          const { data: fbRow } = await supabase
            .from("scheduled_tasks")
            .select("id")
            .eq("company_id", userCompany.id)
            .eq("created_by", authUser.id)
            .eq("task_title", taskTitle)
            .eq("start_time", startIso)
            .order("id", { ascending: false })
            .limit(1)
            .maybeSingle();
          newTaskId = fbRow?.id != null ? String(fbRow.id) : null;
        }

        if (selectedIds.length > 0 && newTaskId == null) {
          setScheduleSaveError(
            "The task was saved, but employees could not be assigned because the new task id was not returned. Check RLS (scheduled_tasks insert must allow returning id, or run a fresh sync)."
          );
          setScheduleDraft({
            ...SCHEDULE_FORM_EMPTY,
            startDate: calendarDateKeyInTimeZone(new Date(), companyTimeZone),
          });
          setScheduleFormOpen(false);
          setScheduleRefreshKey((k) => k + 1);
          return;
        }

        if (selectedIds.length > 0 && newTaskId != null) {
          const assignRows = selectedIds.map((uid) => {
            const m = (schedulePickMembers || []).find((x) => String(x.userId) === String(uid));
            const display = m?.displayName ? String(m.displayName).trim() : shortUserLabel(uid);
            const em = m?.profileEmailRaw ? String(m.profileEmailRaw).trim() : "";
            return {
              scheduled_task_id: newTaskId,
              company_id: userCompany.id,
              user_id: uid,
              employee_name: display,
              employee_email: em || null,
              created_by: authUser.id,
              response_status: "pending",
            };
          });
          const { error: assignInsErr } = await supabase.from("scheduled_task_assignees").insert(assignRows);
          if (assignInsErr) {
            setScheduleSaveError(
              `The task was saved, but employee assignments failed: ${getErrorMessage(assignInsErr)}`
            );
            setScheduleDraft({
              ...SCHEDULE_FORM_EMPTY,
              startDate: calendarDateKeyInTimeZone(new Date(), companyTimeZone),
            });
            setScheduleFormOpen(false);
            setScheduleRefreshKey((k) => k + 1);
            return;
          }

          // Assignment notifications (direct to employees).
          try {
            const wallKey = calendarDateKeyInTimeZone(startIso, companyTimeZone);
            const wallParts = wallClockPartsInTimeZone(startIso, companyTimeZone);
            const whenDisp =
              wallKey && wallParts.timeStr
                ? `${wallWeekdayShort(wallKey, companyTimeZone)} ${wallKey} · ${wallParts.timeStr}`
                : "";
            const msgParts = [
              `Task: ${taskTitle}`,
              whenDisp ? `When: ${whenDisp}` : "",
              projectNameVal ? `Project: ${projectNameVal}` : "",
              costCentreVal ? `Cost centre: ${costCentreVal}` : "",
              notesVal ? `Notes: ${String(notesVal)}` : "",
            ].filter(Boolean);
            await createDirectNotificationsForRecipients(supabase, {
              companyId: userCompany.id,
              actorUserId: authUser.id,
              type: "schedule_assigned",
              title: "New task assigned",
              message: msgParts.join("\n"),
              projectId: projectIdVal,
              projectName: projectNameVal,
              costCentre: costCentreVal,
              recipientUserIds: selectedIds,
            });
          } catch (e) {
            console.warn("[SCHEDULE] assignment notification failed", e);
          }
        }

        setScheduleSaveError("");
        setScheduleDraft({
          ...SCHEDULE_FORM_EMPTY,
          startDate: calendarDateKeyInTimeZone(new Date(), companyTimeZone),
        });
        setScheduleFormOpen(false);
        setScheduleRefreshKey((k) => k + 1);
      } catch (err) {
        setScheduleSaveError(getErrorMessage(err));
      } finally {
        setScheduleSaving(false);
      }
    },
    [isAdmin, userCompany?.id, authUser?.id, scheduleDraft, companyTimeZone, companyProjects, schedulePickMembers]
  );

  const handleScheduleUpdateTask = useCallback(
    async (event) => {
      event?.preventDefault?.();
      if (!isAdmin || !userCompany?.id || !authUser?.id || !scheduleEditingTaskId || !scheduleEditDraft) return;
      setScheduleEditError("");
      const d = scheduleEditDraft;
      const taskTitle = String(d?.title ?? "").trim();
      const startDate = String(d?.startDate ?? "").trim();
      if (!taskTitle || !startDate) {
        setScheduleEditError("Task title and start date are required.");
        return;
      }
      const startIso = wallDateTimeToUtcIso(startDate, normalizeTimeInputForWallClock(d?.startTime), companyTimeZone);
      if (!startIso) {
        setScheduleEditError("Invalid start date or time.");
        return;
      }
      let endTimeVal = null;
      let durationMinutesVal = null;
      const endDateRaw = String(d?.endDate ?? "").trim();
      const endTimeRaw = String(d?.endTime ?? "").trim();
      if (endDateRaw && endTimeRaw) {
        const endIso = wallDateTimeToUtcIso(endDateRaw, normalizeTimeInputForWallClock(endTimeRaw), companyTimeZone);
        if (!endIso) {
          setScheduleEditError("Invalid end date or time.");
          return;
        }
        endTimeVal = endIso;
      } else {
        const dmRaw = String(d?.durationMinutes ?? "").trim();
        if (dmRaw !== "") {
          const n = Number(dmRaw);
          if (!Number.isFinite(n) || n <= 0) {
            setScheduleEditError("Duration must be a positive number of minutes.");
            return;
          }
          durationMinutesVal = Math.round(n);
        }
      }

      const pidRaw = String(d?.projectId ?? "").trim();
      const projectIdVal = pidRaw === "" ? null : pidRaw;
      let projectNameVal = null;
      if (projectIdVal) {
        const proj = (companyProjects || []).find((p) => String(p?.id) === String(projectIdVal));
        const nm = proj?.name != null ? String(proj.name).trim() : "";
        projectNameVal = nm || null;
      }

      const costCentreVal = projectIdVal ? String(d?.costCentre ?? "").trim() || null : null;
      const notesVal = String(d?.notes ?? "").trim() || null;
      const assignTeamVal = String(d?.assignedTeamPlaceholder ?? "").trim() || null;
      const selectedIdsRaw = Array.isArray(d?.assignedUserIds) ? d.assignedUserIds : [];
      const selectedIds = [...new Set(selectedIdsRaw.map((id) => String(id)).filter(Boolean))];
      const nameParts = selectedIds
        .map((uid) => {
          const m = (schedulePickMembers || []).find((x) => String(x.userId) === String(uid));
          return m?.displayName ? String(m.displayName).trim() : "";
        })
        .filter(Boolean);
      const namesCsv = nameParts.length > 0 ? nameParts.join(", ") : null;
      const statusVal = String(d?.status ?? "scheduled").trim() || "scheduled";
      const taskId = String(scheduleEditingTaskId);
      const prevAssignedUserIds = new Set(
        (Array.isArray(scheduleAssigneesByTaskId?.[taskId]) ? scheduleAssigneesByTaskId[taskId] : [])
          .map((row) => String(row?.user_id ?? "").trim())
          .filter(Boolean)
      );

      const updatePayload = {
        task_title: taskTitle,
        notes: notesVal,
        start_time: startIso,
        end_time: endTimeVal,
        duration_minutes: durationMinutesVal,
        project_id: projectIdVal,
        project_name: projectNameVal,
        cost_centre: costCentreVal,
        status: statusVal,
        assigned_employee_name: namesCsv,
        assigned_team: assignTeamVal,
      };

      setScheduleEditSaving(true);
      try {
        const { error: upErr } = await supabase
          .from("scheduled_tasks")
          .update(updatePayload)
          .eq("id", taskId)
          .eq("company_id", userCompany.id);
        if (upErr) throw upErr;

        const { error: delErr } = await supabase
          .from("scheduled_task_assignees")
          .delete()
          .eq("scheduled_task_id", taskId)
          .eq("company_id", userCompany.id);
        if (delErr) throw delErr;

        if (selectedIds.length > 0) {
          const assignRows = selectedIds.map((uid) => {
            const m = (schedulePickMembers || []).find((x) => String(x.userId) === String(uid));
            const display = m?.displayName ? String(m.displayName).trim() : shortUserLabel(uid);
            const em = m?.profileEmailRaw ? String(m.profileEmailRaw).trim() : "";
            return {
              scheduled_task_id: taskId,
              company_id: userCompany.id,
              user_id: uid,
              employee_name: display,
              employee_email: em || null,
              created_by: authUser.id,
              response_status: "pending",
            };
          });
          const { error: assignInsErr } = await supabase.from("scheduled_task_assignees").insert(assignRows);
          if (assignInsErr) throw assignInsErr;

          // Notify only newly assigned employees (avoid duplicates on edits).
          const notifyUserIds = selectedIds.filter((uid) => !prevAssignedUserIds.has(String(uid)));
          if (notifyUserIds.length > 0) {
            try {
              const wallKey = calendarDateKeyInTimeZone(startIso, companyTimeZone);
              const wallParts = wallClockPartsInTimeZone(startIso, companyTimeZone);
              const whenDisp =
                wallKey && wallParts.timeStr
                  ? `${wallWeekdayShort(wallKey, companyTimeZone)} ${wallKey} · ${wallParts.timeStr}`
                  : "";
              const msgParts = [
                `Task: ${taskTitle}`,
                whenDisp ? `When: ${whenDisp}` : "",
                projectNameVal ? `Project: ${projectNameVal}` : "",
                costCentreVal ? `Cost centre: ${costCentreVal}` : "",
                notesVal ? `Notes: ${String(notesVal)}` : "",
              ].filter(Boolean);
              await createDirectNotificationsForRecipients(supabase, {
                companyId: userCompany.id,
                actorUserId: authUser.id,
                type: "schedule_assigned",
                title: "New task assigned",
                message: msgParts.join("\n"),
                projectId: projectIdVal,
                projectName: projectNameVal,
                costCentre: costCentreVal,
                recipientUserIds: notifyUserIds,
              });
            } catch (e) {
              console.warn("[SCHEDULE] assignment notification failed", e);
            }
          }
        }

        setScheduleEditingTaskId(null);
        setScheduleEditDraft(null);
        setScheduleRefreshKey((k) => k + 1);
      } catch (err) {
        setScheduleEditError(getErrorMessage(err));
      } finally {
        setScheduleEditSaving(false);
      }
    },
    [isAdmin, userCompany?.id, authUser?.id, scheduleEditingTaskId, scheduleEditDraft, companyTimeZone, companyProjects, schedulePickMembers, scheduleAssigneesByTaskId]
  );

  const handleScheduleDeleteTask = useCallback(
    async (taskIdRaw) => {
      const tid = taskIdRaw != null ? String(taskIdRaw).trim() : "";
      if (!tid || !isAdmin || !userCompany?.id || !authUser?.id) return;
      if (
        typeof window !== "undefined" &&
        !window.confirm("Delete this scheduled task? This cannot be undone.")
      ) {
        return;
      }
      setScheduleDeleteSavingId(tid);
      try {
        const { error } = await supabase
          .from("scheduled_tasks")
          .delete()
          .eq("id", tid)
          .eq("company_id", userCompany.id);
        if (error) throw error;
        if (String(scheduleEditingTaskId) === tid) {
          setScheduleEditingTaskId(null);
          setScheduleEditDraft(null);
          setScheduleEditError("");
        }
        if (String(scheduleMoveModeTaskId) === tid) setScheduleMoveModeTaskId(null);
        setScheduleRefreshKey((k) => k + 1);
      } catch (err) {
        alert(getErrorMessage(err));
      } finally {
        setScheduleDeleteSavingId(null);
      }
    },
    [isAdmin, userCompany?.id, authUser?.id, scheduleEditingTaskId, scheduleMoveModeTaskId]
  );

  const ensurePushSubscription = useCallback(async () => {
    const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (typeof vapid !== "string" || !vapid.trim()) {
      throw new Error("Missing VITE_VAPID_PUBLIC_KEY");
    }
    if (typeof window === "undefined" || !("Notification" in window)) {
      throw new Error("Notifications are not supported on this device/browser.");
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error("Background push is not supported on this device/browser.");
    }
    if (!authUser?.id || !userCompany?.id) {
      throw new Error("Sign in and select a company first.");
    }

    const permAtStart = Notification.permission;
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      return { permission: perm, subscribed: false, repeatEnable: false };
    }

    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      reg = await navigator.serviceWorker.register("/service-worker.js");
    }
    await navigator.serviceWorker.ready;

    const registration = (await navigator.serviceWorker.getRegistration()) || reg;
    if (!registration?.pushManager) {
      throw new Error("Background push is not supported on this device/browser.");
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

    return {
      permission: perm,
      subscribed: true,
      repeatEnable: permAtStart === "granted" && subAtStart != null,
    };
  }, [authUser?.id, userCompany?.id]);

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
      const result = await ensurePushSubscription();
      if (result.permission !== "granted") {
        setBackgroundPushUi(result.permission === "denied" ? "blocked" : "default");
        return;
      }
      setBackgroundPushSaveMessage(
        result.repeatEnable ? "Already enabled / Subscription saved" : "Subscription saved"
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

  const handleEmployeeConfirmAssignmentNotification = useCallback(async (goToSchedule) => {
    if (!activeAssignNotif || !authUser?.id || !userCompany?.id) return;
    setAssignNotifSaving(true);
    try {
      if (activeAssignNotif?.id) {
        const ts = new Date().toISOString();
        const { error } = await supabase
          .from("notifications")
          .update({ read_at: ts, is_read: true })
          .eq("id", activeAssignNotif.id)
          .eq("recipient_user_id", authUser.id);
        if (error) throw error;
        setInAppNotifications((prev) =>
          (Array.isArray(prev) ? prev : []).map((x) =>
            String(x?.id) === String(activeAssignNotif.id) ? { ...x, read_at: ts, is_read: true } : x
          )
        );
      }
      setActiveAssignNotif(null);
      if (goToSchedule) {
        setActiveTab("schedule");
        await refreshEmployeeAssignedSchedule({ detectNew: false, showLoading: true });
        setScheduleRefreshKey((k) => k + 1);
      }
      await pollInAppNotifications();
    } catch (e) {
      alert(getErrorMessage(e));
    } finally {
      setAssignNotifSaving(false);
    }
  }, [activeAssignNotif, authUser?.id, userCompany?.id, pollInAppNotifications, refreshEmployeeAssignedSchedule]);

  const handleEmployeeRequestNotificationPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setEmployeeNotifPermMessage("Notifications are not supported on this device/browser.");
      setTimeout(() => setEmployeeNotifPermMessage(""), 7000);
      return;
    }
    const isiPhone =
      typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(String(navigator.userAgent || ""));
    if (isiPhone && !isInstalled) {
      setEmployeeNotifPermMessage(
        "On iPhone, open in Safari -> Share -> Add to Home Screen, then open the installed app and enable notifications."
      );
      setTimeout(() => setEmployeeNotifPermMessage(""), 9000);
      return;
    }
    try {
      const result = await ensurePushSubscription();
      const p = result.permission;
      if (p === "granted") setEmployeeNotifPermMessage("Phone notifications enabled.");
      else if (p === "denied") setEmployeeNotifPermMessage("Notifications blocked in browser settings.");
      else setEmployeeNotifPermMessage("Notifications not enabled yet.");
      setTimeout(() => setEmployeeNotifPermMessage(""), 7000);
    } catch (e) {
      console.warn("[NOTIFY] permission request failed", e);
      setEmployeeNotifPermMessage(getErrorMessage(e) || "Could not enable phone notifications.");
      setTimeout(() => setEmployeeNotifPermMessage(""), 7000);
    }
  }, [ensurePushSubscription, isInstalled]);

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

  const renderEmployeeScheduleTaskCard = (task, dateKey) => {
    const ttitle = String(task?.task_title ?? "").trim() || "Untitled task";
    const proj = String(task?.project_name ?? "").trim();
    const projLine = proj.length > 0 ? proj : "No project selected";
    const cc = String(task?.cost_centre ?? "").trim();
    const ccLine = cc.length > 0 ? cc : "No cost centre";
    const startDisp = task?.start_time ? formatTime(task.start_time, companyTimeZone) : "—";
    const endRaw = task?.end_time;
    const durRaw = task?.duration_minutes;
    let windowLabel = "—";
    if (endRaw) windowLabel = formatTime(endRaw, companyTimeZone);
    else if (durRaw != null && String(durRaw).trim() !== "" && Number.isFinite(Number(durRaw)))
      windowLabel = `${Number(durRaw)} min`;
    const linkRow =
      task?.id != null ? employeeScheduleLinkByTaskId?.[String(task.id)] : undefined;
    const respStatus = normalizeScheduleAssigneeResponseStatus(linkRow?.response_status);
    const declineReasonOwn = String(linkRow?.decline_reason ?? "").trim();
    const respondedAt = linkRow?.responded_at;
    const respondedDisp =
      respondedAt != null && respondedAt !== ""
        ? `${formatDate(respondedAt, companyTimeZone)} · ${formatTime(respondedAt, companyTimeZone)}`
        : null;
    const assigneeRowId = linkRow?.id != null ? String(linkRow.id) : "";
    const savingThis = assigneeRowId && scheduleResponseSavingAssigneeId === assigneeRowId;
    const tidStr = task?.id != null ? String(task.id) : "";
    const declineOpen = tidStr && scheduleEmployeeDeclineTaskId === tidStr;
    const at = String(task?.assigned_team ?? "").trim();
    const notesDisp = String(task?.notes ?? "").trim();
    const st = String(task?.status ?? "").trim() || "—";
    return (
      <div
        key={String(task?.id ?? `${dateKey}-${ttitle}-${startDisp}`)}
        className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2 shadow-sm min-w-0"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-sm font-bold text-slate-900 leading-snug min-w-0">{ttitle}</p>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
            {st}
          </span>
        </div>
        <p className="text-[12px] text-slate-700">
          <span className="font-semibold text-slate-600">Project: </span>
          {projLine}
        </p>
        <p className="text-[12px] text-slate-700">
          <span className="font-semibold text-slate-600">Cost centre: </span>
          {ccLine}
        </p>
        <p className="text-[12px] text-slate-800">
          <span className="font-semibold text-slate-600">Time: </span>
          {startDisp}
          {" → "}
          {windowLabel}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="font-semibold text-slate-600">Your response:</span>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${scheduleAssigneeResponseBadgeClass(respStatus)}`}
          >
            {scheduleAssigneeResponseLabel(respStatus)}
          </span>
        </div>
        {respondedDisp ? (
          <p className="text-[11px] text-slate-500">
            Responded: {respondedDisp}
          </p>
        ) : null}
        {respStatus === "declined" && declineReasonOwn ? (
          <p className="text-[11px] text-slate-700 leading-snug">
            <span className="font-semibold text-slate-600">Your decline reason: </span>
            {declineReasonOwn}
          </p>
        ) : null}
        {respStatus === "pending" && assigneeRowId ? (
          <div className="space-y-2 pt-0.5">
            {!declineOpen ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={Boolean(savingThis)}
                  onClick={() => void handleEmployeeScheduleAccept(assigneeRowId)}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                >
                  {savingThis ? "Saving…" : "Accept"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(savingThis)}
                  onClick={() => {
                    setScheduleEmployeeResponseInlineError("");
                    setScheduleEmployeeDeclineTaskId(tidStr);
                    setScheduleEmployeeDeclineReason("");
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-800 disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            ) : (
              <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
                <label className="block text-[10px] font-medium text-slate-600" htmlFor={`decl-reason-${tidStr}`}>
                  Reason for declining <span className="text-red-600">*</span>
                </label>
                <textarea
                  id={`decl-reason-${tidStr}`}
                  rows={3}
                  value={scheduleEmployeeDeclineReason}
                  onChange={(e) => setScheduleEmployeeDeclineReason(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-[11px] resize-y min-h-[3rem]"
                  placeholder="Required"
                  disabled={Boolean(savingThis)}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={Boolean(savingThis)}
                    onClick={() =>
                      void handleEmployeeScheduleDecline(assigneeRowId, scheduleEmployeeDeclineReason)
                    }
                    className="rounded-lg bg-rose-700 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                  >
                    {savingThis ? "Saving…" : "Confirm decline"}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(savingThis)}
                    onClick={() => {
                      setScheduleEmployeeDeclineTaskId(null);
                      setScheduleEmployeeDeclineReason("");
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-800 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}
        {at ? (
          <p className="text-[12px] text-slate-700">
            <span className="font-semibold text-slate-600">Team: </span>
            {at}
          </p>
        ) : null}
        {notesDisp ? (
          <p className="text-[12px] text-slate-600 leading-snug whitespace-pre-wrap">{notesDisp}</p>
        ) : null}
      </div>
    );
  };

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

          {!isAdmin && activeAssignNotif ? (
            <div className="fixed inset-0 z-[72] bg-black/40 px-3 py-6" role="dialog" aria-modal="true">
              <div className="mx-auto w-full max-w-md">
                <div className="rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-slate-50/60">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Schedule update</p>
                    <p className="mt-1 text-[18px] font-bold text-slate-900 leading-snug break-words">
                      New task assigned
                    </p>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-[13px] text-slate-800 leading-snug whitespace-pre-wrap break-words">
                        {String(activeAssignNotif?.message ?? "").trim() || "You were assigned a scheduled task."}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={assignNotifSaving}
                        onClick={() => void handleEmployeeConfirmAssignmentNotification(true)}
                        className="flex-1 rounded-xl bg-[#1a73e8] px-4 py-3 text-[14px] font-bold text-white disabled:opacity-50"
                      >
                        View Schedule
                      </button>
                      <button
                        type="button"
                        disabled={assignNotifSaving}
                        onClick={() => void handleEmployeeConfirmAssignmentNotification(false)}
                        className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-[14px] font-bold text-slate-800 disabled:opacity-50"
                      >
                        {assignNotifSaving ? "Saving…" : "OK"}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      “OK” confirms you saw the assignment. Accept/decline is separate inside Schedule.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

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
                  <label className="text-xs sm:text-sm font-medium">Scheduled Task</label>
                  <select
                    className="w-full rounded-2xl border bg-white py-2 px-2.5 text-sm h-10 sm:h-11 leading-tight"
                    disabled={clockEmployeeScheduleLoading}
                    value={clockSelectedScheduledTaskId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setClockSelectedScheduledTaskId(v);
                      if (!v) return;
                      const task = (clockEmployeeScheduledTasks || []).find(
                        (t) => String(t?.id) === String(v)
                      );
                      if (!task) return;
                      const pid = task.project_id != null ? String(task.project_id) : "";
                      const nameFromRow = String(task.project_name ?? "").trim();
                      const ccRaw = String(task.cost_centre ?? "").trim();
                      let project =
                        pid &&
                        clockSelectableProjects.find((p) => String(p.id) === pid);
                      if (!project && nameFromRow) {
                        const lower = nameFromRow.toLowerCase();
                        project = clockSelectableProjects.find(
                          (p) => String(p.name).trim().toLowerCase() === lower
                        );
                      }
                      if (project) {
                        handleProjectChange(String(project.id));
                        const centres = clockCostCentreOptionsForProject(project.id);
                        if (ccRaw && centres.includes(ccRaw)) {
                          setCostCenter(ccRaw);
                        }
                      }
                    }}
                  >
                    <option value="">No scheduled task / Manual clock-in</option>
                    {(clockEmployeeScheduledTasks || []).map((t) => (
                      <option key={String(t.id)} value={String(t.id)}>
                        {formatClockScheduledTaskOptionLabel(t, companyTimeZone)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs sm:text-sm font-medium">Project / Job Site</label>
                  <select
                    className="w-full rounded-2xl border bg-white py-2 px-2.5 text-sm h-10 sm:h-11 leading-tight"
                    value={projectId}
                    disabled={clockSelectableProjects.length === 0}
                    onChange={(event) => {
                      setClockSelectedScheduledTaskId("");
                      handleProjectChange(event.target.value);
                    }}
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
                    onChange={(event) => {
                      setClockSelectedScheduledTaskId("");
                      setCostCenter(event.target.value);
                    }}
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

          {activeTab === "schedule" && !isAdmin && (
            <Card className="rounded-3xl shadow-sm">
              <CardContent className="p-4 sm:p-5 space-y-3">
                <div className="space-y-3">
                  <div>
                    <h2 className="font-bold text-[clamp(24px,5.5vw,28px)] leading-tight tracking-tight">Schedule</h2>
                    <p className="text-[15px] text-slate-500 mt-0.5">Your assignments · Times: {companyTimeZone}</p>
                  </div>
                  <button
                    type="button"
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3 px-3 text-[14px] font-semibold text-slate-800 relative z-[1] pointer-events-auto"
                    onClick={() => void handleEmployeeRequestNotificationPermission()}
                  >
                    Enable phone notifications
                  </button>
                  {employeeNotifPermMessage ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-[12px] font-semibold text-slate-700">
                      {employeeNotifPermMessage}
                    </div>
                  ) : null}
                  <div className="space-y-1">
                    <label className="text-[15px] font-medium text-slate-800" htmlFor="sched-employee-view">
                      View
                    </label>
                    <select
                      id="sched-employee-view"
                      className="w-full rounded-2xl border border-slate-200 bg-white py-3 px-3 text-[16px] h-12 font-medium"
                      value={scheduleViewMode}
                      onChange={(e) => setScheduleViewMode(e.target.value)}
                    >
                      <option value="list">List View</option>
                      <option value="cal1">1 Day Calendar</option>
                      <option value="cal3">3 Day Calendar</option>
                      <option value="cal7">7 Day Calendar</option>
                      <option value="cal30">30 Day Calendar</option>
                    </select>
                  </div>
                  {scheduleViewMode !== "list" ? (
                    <div className="flex flex-wrap items-center gap-2 justify-between rounded-2xl border border-slate-100 bg-slate-50/90 px-2.5 py-2">
                      <button
                        type="button"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[15px] font-semibold text-slate-800"
                        onClick={() => {
                          const tz = companyTimeZone;
                          const anchor =
                            scheduleCalendarAnchor || calendarDateKeyInTimeZone(new Date(), tz);
                          if (scheduleViewMode === "cal30") {
                            setScheduleCalendarAnchor(addWallMonthsSafe(anchor, -1, tz));
                            return;
                          }
                          const step = scheduleCalendarDaySpan || 1;
                          setScheduleCalendarAnchor(addWallDaysInTimeZone(anchor, -step, tz));
                        }}
                      >
                        ← Prev
                      </button>
                      <button
                        type="button"
                        className="rounded-xl bg-slate-900 px-3 py-2 text-[15px] font-semibold text-white"
                        onClick={() =>
                          setScheduleCalendarAnchor(calendarDateKeyInTimeZone(new Date(), companyTimeZone))
                        }
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[15px] font-semibold text-slate-800"
                        onClick={() => {
                          const tz = companyTimeZone;
                          const anchor =
                            scheduleCalendarAnchor || calendarDateKeyInTimeZone(new Date(), tz);
                          if (scheduleViewMode === "cal30") {
                            setScheduleCalendarAnchor(addWallMonthsSafe(anchor, 1, tz));
                            return;
                          }
                          const step = scheduleCalendarDaySpan || 1;
                          setScheduleCalendarAnchor(addWallDaysInTimeZone(anchor, step, tz));
                        }}
                      >
                        Next →
                      </button>
                    </div>
                  ) : null}
                </div>
                {scheduleEmployeeResponseInlineError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-900 leading-snug">
                    {scheduleEmployeeResponseInlineError}
                  </div>
                ) : null}
                {employeeScheduleLoading ? (
                  <p className="text-sm text-slate-600 py-4 text-center">Loading your schedule…</p>
                ) : employeeScheduleError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">{employeeScheduleError}</div>
                ) : scheduleViewMode !== "list" ? (
                  scheduleViewMode === "cal30" ? (
                    <div className="w-full min-w-0 space-y-3">
                      <p className="text-center text-[clamp(22px,5vw,26px)] font-bold text-slate-900">
                        {scheduleMonthGridInfo.monthYearLabel}
                      </p>
                      <div className="grid grid-cols-7 gap-px border border-slate-200 bg-slate-200 text-[clamp(13px,3vw,15px)] font-semibold text-slate-600">
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                          <div key={d} className="bg-white py-2 text-center">
                            {d}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-px border-x border-b border-slate-200 bg-slate-200">
                        {(scheduleMonthGridInfo.cells || []).map((cell) => {
                          const taskArr = employeeScheduleTasksByDay[cell.dayKey];
                          const tasks = Array.isArray(taskArr) ? taskArr : [];
                          const chips = tasks.slice(0, SCHEDULE_MONTH_CHIP_MAX);
                          const more = tasks.length - chips.length;
                          const isToday = cell.dayKey === scheduleWallTodayKey;
                          const isSel =
                            !!scheduleCalendarSelectedDayKey && cell.dayKey === scheduleCalendarSelectedDayKey;
                          return (
                            <div
                              key={cell.dayKey}
                              role="button"
                              tabIndex={0}
                              onClick={() => cell.inMonth && setScheduleCalendarSelectedDayKey(cell.dayKey)}
                              onKeyDown={(e) => {
                                if (!cell.inMonth) return;
                                if (e.key === "Enter" || e.key === " ") setScheduleCalendarSelectedDayKey(cell.dayKey);
                              }}
                              className={`relative flex min-h-[6.5rem] flex-col gap-1.5 px-2 py-2 text-left outline-none ring-inset ${
                                cell.inMonth ? "bg-white" : "bg-slate-50/95 opacity-80"
                              } ${isSel ? "ring-2 ring-[#174ea6]/40" : ""}`}
                            >
                              <div className="flex items-start gap-2">
                                <span
                                  className={`flex h-[1.875rem] min-w-[1.875rem] items-center justify-center text-[clamp(17px,4.2vw,20px)] font-bold tabular-nums leading-none ${
                                    isToday
                                      ? "rounded-full bg-[#1a73e8] text-white"
                                      : cell.inMonth
                                        ? "text-slate-900"
                                        : "text-slate-400"
                                  }`}
                                >
                                  {cell.dayNum}
                                </span>
                              </div>
                              <div className="flex min-h-0 flex-1 flex-col gap-1">
                                {chips.map((task) => (
                                  <button
                                    key={String(task.id)}
                                    type="button"
                                    data-sched-task-chip="1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setScheduleCalendarFocusTaskId(String(task.id));
                                    }}
                                    className="truncate rounded-md bg-[#1a73e8] px-1.5 py-1 text-left text-[13px] font-semibold text-white shadow-sm"
                                  >
                                    {String(task?.task_title ?? "").trim() || "Task"}
                                  </button>
                                ))}
                                {more > 0 ? (
                                  <span className="inline-flex px-1 text-[13px] font-semibold tabular-nums text-slate-600">
                                    +{more} more
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {scheduleCalendarFocusTaskId ? (
                        (() => {
                          const t = (scheduleEmployeeTasksInCalendarRange || []).find(
                            (x) => String(x?.id) === String(scheduleCalendarFocusTaskId)
                          );
                          if (!t) return null;
                          const dk = calendarDateKeyInTimeZone(t?.start_time, companyTimeZone) || "—";
                          return (
                            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/90 p-2">
                              {renderEmployeeScheduleTaskCard(t, dk)}
                            </div>
                          );
                        })()
                      ) : null}
                    </div>
                  ) : scheduleCalendarVisibleDayKeys.length === 0 ? (
                    <p className="text-sm text-slate-600 py-3 text-center">Unable to build calendar range.</p>
                  ) : (
                    <div className="w-full min-w-0 space-y-2 pb-24 sm:pb-6">
                      {(() => {
                        const colH =
                          (SCHEDULE_GRID_HOUR_END - SCHEDULE_GRID_HOUR_START) * SCHEDULE_GRID_PX_PER_HOUR;
                        const compact = scheduleViewMode === "cal7";
                        return (
                          <>
                            <div className="sticky top-0 z-30 rounded-t-2xl border border-slate-200 border-b-slate-100 bg-white shadow-sm">
                              <div className="flex min-w-0">
                                <div className="w-[3.5rem] shrink-0 border-r border-slate-100 sm:w-[3.75rem]" aria-hidden />
                                <div className="flex min-w-0 flex-1 divide-x divide-slate-100">
                                  {scheduleCalendarVisibleDayKeys.map((dayKey) => {
                                    const dn = Number(String(dayKey).split("-")[2]) || 0;
                                    const dayIsToday = dayKey === scheduleWallTodayKey;
                                    const daySel =
                                      !!scheduleCalendarSelectedDayKey &&
                                      dayKey === scheduleCalendarSelectedDayKey;
                                    const labelAccent = dayIsToday || daySel;
                                    return (
                                      <button
                                        key={`hdr-${dayKey}`}
                                        type="button"
                                        onClick={() => setScheduleCalendarSelectedDayKey(dayKey)}
                                        className="min-w-0 flex-1 px-0.5 py-2.5 text-center outline-none focus-visible:ring-2 focus-visible:ring-[#174ea6]/40"
                                      >
                                        <span
                                          className={`block text-[13px] font-bold uppercase tracking-wide ${
                                            labelAccent ? "text-[#174ea6]" : "text-slate-500"
                                          }`}
                                        >
                                          {wallWeekdayShort(dayKey, companyTimeZone)}
                                        </span>
                                        <span
                                          className={`mx-auto mt-1 flex h-11 min-w-[2.75rem] max-w-[2.75rem] items-center justify-center rounded-full text-[clamp(17px,4.8vw,20px)] font-bold tabular-nums leading-none ${
                                            dayIsToday
                                              ? "bg-[#1a73e8] text-white shadow-sm"
                                              : daySel
                                                ? "bg-blue-100 text-[#174ea6]"
                                                : "text-slate-900"
                                          }`}
                                        >
                                          {dn}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                            <div className="overflow-hidden rounded-b-2xl border border-t-0 border-slate-200 bg-white shadow-sm">
                              <div className="flex min-h-0 w-full">
                                <div
                                  className="w-[3.5rem] shrink-0 border-r border-slate-200 bg-white py-2 pr-2 text-right text-[clamp(13px,3.8vw,15px)] tabular-nums leading-none text-slate-500 sm:w-[3.75rem]"
                                  style={{ minHeight: colH }}
                                >
                                  {Array.from(
                                    { length: SCHEDULE_GRID_HOUR_END - SCHEDULE_GRID_HOUR_START },
                                    (_, i) => SCHEDULE_GRID_HOUR_START + i
                                  ).map((h) => (
                                    <div
                                      key={`egl-${h}`}
                                      className="relative -translate-y-[0.65rem]"
                                      style={{ height: SCHEDULE_GRID_PX_PER_HOUR }}
                                    >
                                      {formatHourLabel12(h)}
                                    </div>
                                  ))}
                                </div>
                                <div className="flex min-w-0 flex-1 divide-x divide-slate-200 bg-white">
                                  {scheduleCalendarVisibleDayKeys.map((dayKey) => {
                                    const colTasks = employeeScheduleTasksByDay[dayKey];
                                    const taskList = Array.isArray(colTasks) ? colTasks : [];
                                    return (
                                      <div
                                        key={dayKey}
                                        className="relative min-w-0 flex-1"
                                        style={{ height: colH }}
                                      >
                                        {Array.from(
                                          { length: SCHEDULE_GRID_HOUR_END - SCHEDULE_GRID_HOUR_START },
                                          (_, i) => SCHEDULE_GRID_HOUR_START + i
                                        ).map((hr) => (
                                          <div
                                            key={`${dayKey}-ln-${hr}`}
                                            className="pointer-events-none border-b border-slate-100"
                                            style={{ height: SCHEDULE_GRID_PX_PER_HOUR }}
                                          />
                                        ))}
                                        {taskList.map((task) => {
                                          const topM = wallMinutesFromScheduleGridStart(
                                            task?.start_time,
                                            dayKey,
                                            companyTimeZone
                                          );
                                          if (topM == null) return null;
                                          const dur = scheduleTaskDurationMinutes(task, companyTimeZone);
                                          const topPx = (topM / 60) * SCHEDULE_GRID_PX_PER_HOUR;
                                          const hPx = Math.min(
                                            Math.max(compact ? 30 : 38, (dur / 60) * SCHEDULE_GRID_PX_PER_HOUR),
                                            Math.max(compact ? 30 : 38, colH - topPx)
                                          );
                                          const tone = scheduleTimelineEmployeeTone(
                                            task,
                                            employeeScheduleLinkByTaskId
                                          );
                                          const blockCls = `${scheduleTimelineBlockClasses(
                                            tone,
                                            compact
                                          )} absolute left-[3px] right-[3px] z-[5] overflow-hidden text-left shadow-sm touch-manipulation`;
                                          const title = String(task?.task_title ?? "").trim() || "Task";
                                          return (
                                            <button
                                              key={String(task.id)}
                                              type="button"
                                              className={blockCls}
                                              style={{ top: topPx, height: hPx, minHeight: compact ? 30 : 38 }}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setScheduleCalendarFocusTaskId(String(task.id));
                                              }}
                                            >
                                              <p
                                                className={`text-left font-bold leading-snug ${
                                                  compact ? "truncate text-[14px]" : "line-clamp-2 text-[15px]"
                                                }`}
                                                title={title}
                                              >
                                                {title}
                                              </p>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                      {scheduleCalendarFocusTaskId ? (
                        (() => {
                          const t = (scheduleEmployeeTasksInCalendarRange || []).find(
                            (x) => String(x?.id) === String(scheduleCalendarFocusTaskId)
                          );
                          if (!t) return null;
                          const dk = calendarDateKeyInTimeZone(t?.start_time, companyTimeZone) || "—";
                          return (
                            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/90 p-2">
                              {renderEmployeeScheduleTaskCard(t, dk)}
                            </div>
                          );
                        })()
                      ) : null}
                    </div>
                  )
                ) : (employeeScheduleTasksGroupedByDate || []).length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-center">
                    <p className="text-sm text-slate-700 leading-snug">Your assigned tasks will appear here.</p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {(employeeScheduleTasksGroupedByDate || []).map(({ dateKey, tasks }) => {
                      const labelIso =
                        dateKey && dateKey !== "—"
                          ? wallDateTimeToUtcIso(dateKey, "12:00:00", companyTimeZone)
                          : null;
                      const dateHeading =
                        labelIso && dateKey !== "—"
                          ? `${wallWeekdayLongInTimeZone(dateKey, companyTimeZone)} · ${formatDate(labelIso, companyTimeZone)}`
                          : "Date unknown";
                      const taskList = Array.isArray(tasks) ? tasks : [];
                      return (
                        <div key={dateKey} className="space-y-2">
                          <p className="text-[14px] font-bold text-slate-800 uppercase tracking-wide">{dateHeading}</p>
                          <div className="space-y-2">
                            {taskList.map((task) => renderEmployeeScheduleTaskCard(task, dateKey))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "schedule" && isAdmin && (
            <Card className="rounded-3xl shadow-sm">
              <CardContent className="p-4 sm:p-5 space-y-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="font-bold text-[clamp(24px,5.5vw,28px)] leading-tight tracking-tight">
                        Schedule
                      </h2>
                      <p className="text-[15px] text-slate-500 mt-0.5">Team tasks · Times: {companyTimeZone}</p>
                    </div>
                    {!scheduleFormOpen && (
                      <Button
                        type="button"
                        className="shrink-0 rounded-xl h-11 px-4 text-[15px] font-semibold"
                        onClick={() => {
                          setScheduleSaveError("");
                          setScheduleEditingTaskId(null);
                          setScheduleEditDraft(null);
                          setScheduleEditError("");
                          setScheduleMoveModeTaskId(null);
                          setScheduleCalendarMoveError("");
                          const todayKey = calendarDateKeyInTimeZone(new Date(), companyTimeZone);
                          setScheduleDraft({ ...SCHEDULE_FORM_EMPTY, assignedUserIds: [], startDate: todayKey });
                          setScheduleFormOpen(true);
                        }}
                      >
                        New task
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[15px] font-medium text-slate-800" htmlFor="sched-admin-view">
                      View
                    </label>
                    <select
                      id="sched-admin-view"
                      className="w-full rounded-2xl border border-slate-200 bg-white py-3 px-3 text-[16px] h-12 font-medium"
                      value={scheduleViewMode}
                      onChange={(e) => setScheduleViewMode(e.target.value)}
                    >
                      <option value="list">List View</option>
                      <option value="cal1">1 Day Calendar</option>
                      <option value="cal3">3 Day Calendar</option>
                      <option value="cal7">7 Day Calendar</option>
                      <option value="cal30">30 Day Calendar</option>
                    </select>
                  </div>
                  {scheduleViewMode !== "list" ? (
                    <div className="flex flex-wrap items-center gap-2 justify-between rounded-2xl border border-slate-100 bg-slate-50/90 px-2.5 py-2">
                      <button
                        type="button"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[15px] font-semibold text-slate-800"
                        onClick={() => {
                          const tz = companyTimeZone;
                          const anchor =
                            scheduleCalendarAnchor || calendarDateKeyInTimeZone(new Date(), tz);
                          if (scheduleViewMode === "cal30") {
                            setScheduleCalendarAnchor(addWallMonthsSafe(anchor, -1, tz));
                            return;
                          }
                          const step = scheduleCalendarDaySpan || 1;
                          setScheduleCalendarAnchor(addWallDaysInTimeZone(anchor, -step, tz));
                        }}
                      >
                        ← Prev
                      </button>
                      <button
                        type="button"
                        className="rounded-xl bg-slate-900 px-3 py-2 text-[15px] font-semibold text-white"
                        onClick={() =>
                          setScheduleCalendarAnchor(calendarDateKeyInTimeZone(new Date(), companyTimeZone))
                        }
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[15px] font-semibold text-slate-800"
                        onClick={() => {
                          const tz = companyTimeZone;
                          const anchor =
                            scheduleCalendarAnchor || calendarDateKeyInTimeZone(new Date(), tz);
                          if (scheduleViewMode === "cal30") {
                            setScheduleCalendarAnchor(addWallMonthsSafe(anchor, 1, tz));
                            return;
                          }
                          const step = scheduleCalendarDaySpan || 1;
                          setScheduleCalendarAnchor(addWallDaysInTimeZone(anchor, step, tz));
                        }}
                      >
                        Next →
                      </button>
                    </div>
                  ) : null}
                </div>

                {scheduleMoveModeTaskId ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <p className="text-[14px] font-semibold text-amber-950 leading-snug min-w-0 flex-1">
                      Move mode active — tap a new slot or date on the calendar, or cancel.
                    </p>
                    <button
                      type="button"
                      className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-2 text-[13px] font-semibold text-amber-900"
                      onClick={() => {
                        setScheduleMoveModeTaskId(null);
                        setScheduleCalendarMoveError("");
                      }}
                    >
                      Cancel Move
                    </button>
                  </div>
                ) : null}

                {scheduleFormOpen && (
                  <form
                    onSubmit={(e) => void handleScheduleSubmit(e)}
                    className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-800">Create scheduled task</p>
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-slate-600 underline"
                        disabled={scheduleSaving}
                        onClick={() => {
                          setScheduleFormOpen(false);
                          setScheduleSaveError("");
                        }}
                      >
                        Close
                      </button>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-slate-600" htmlFor="sched-title">
                        Task title
                      </label>
                      <input
                        id="sched-title"
                        type="text"
                        className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                        value={scheduleDraft.title}
                        onChange={(e) => setScheduleDraft((d) => ({ ...d, title: e.target.value }))}
                        placeholder="e.g. Rough-in inspection"
                        disabled={scheduleSaving}
                        required
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-medium text-slate-600" htmlFor="sched-project">
                          Project
                        </label>
                        <select
                          id="sched-project"
                          className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                          value={scheduleDraft.projectId}
                          onChange={(e) =>
                            setScheduleDraft((d) => ({
                              ...d,
                              projectId: e.target.value,
                              costCentre: "",
                            }))
                          }
                          disabled={scheduleSaving}
                        >
                          <option value="">— Optional —</option>
                          {(effectiveProjects || []).map((p) => (
                            <option key={String(p.id)} value={String(p.id)}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        {scheduleDraft.projectId ? (
                          <p className="text-[10px] text-slate-500">Project id: {scheduleDraft.projectId}</p>
                        ) : null}
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[11px] font-medium text-slate-600" htmlFor="sched-cc">
                          Cost centre / task
                        </label>
                        <select
                          id="sched-cc"
                          className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                          value={scheduleDraft.costCentre}
                          onChange={(e) => setScheduleDraft((d) => ({ ...d, costCentre: e.target.value }))}
                          disabled={scheduleSaving || !scheduleDraft.projectId}
                        >
                          <option value="">
                            {scheduleDraft.projectId ? "— Select cost centre —" : "Pick a project first"}
                          </option>
                          {(scheduleCostCentreOptions || []).map((name) => (
                            <option key={String(name)} value={String(name)}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-medium text-slate-600" htmlFor="sched-start-date">
                          Start date
                        </label>
                        <input
                          id="sched-start-date"
                          type="date"
                          className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                          value={scheduleDraft.startDate}
                          onChange={(e) => setScheduleDraft((d) => ({ ...d, startDate: e.target.value }))}
                          disabled={scheduleSaving}
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[11px] font-medium text-slate-600" htmlFor="sched-start-time">
                          Start time
                        </label>
                        <input
                          id="sched-start-time"
                          type="time"
                          className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                          value={scheduleDraft.startTime}
                          onChange={(e) => setScheduleDraft((d) => ({ ...d, startTime: e.target.value }))}
                          disabled={scheduleSaving}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-medium text-slate-600" htmlFor="sched-end-date">
                          End date
                        </label>
                        <input
                          id="sched-end-date"
                          type="date"
                          className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                          value={scheduleDraft.endDate}
                          onChange={(e) => setScheduleDraft((d) => ({ ...d, endDate: e.target.value }))}
                          disabled={scheduleSaving}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[11px] font-medium text-slate-600" htmlFor="sched-end-time">
                          End time
                        </label>
                        <input
                          id="sched-end-time"
                          type="time"
                          className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                          value={scheduleDraft.endTime}
                          onChange={(e) => setScheduleDraft((d) => ({ ...d, endTime: e.target.value }))}
                          disabled={scheduleSaving}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-slate-600" htmlFor="sched-dur">
                        Duration (minutes) — if end time is not used
                      </label>
                      <input
                        id="sched-dur"
                        type="number"
                        min={1}
                        className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                        value={scheduleDraft.durationMinutes}
                        onChange={(e) => setScheduleDraft((d) => ({ ...d, durationMinutes: e.target.value }))}
                        placeholder="e.g. 120"
                        disabled={scheduleSaving}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <p className="block text-[11px] font-medium text-slate-600">Assign employees</p>
                      {schedulePickMembersLoading ? (
                        <p className="text-[11px] text-slate-500">Loading team members…</p>
                      ) : schedulePickMembersError ? (
                        <p className="text-[11px] text-red-700 leading-snug">{schedulePickMembersError}</p>
                      ) : (schedulePickMembers || []).length === 0 ? (
                        <p className="text-[11px] text-slate-600">No employees found.</p>
                      ) : (
                        <div className="rounded-lg border border-slate-200 bg-white p-2 max-h-40 overflow-y-auto space-y-1.5">
                          {(schedulePickMembers || []).map((m, pickIdx) => {
                            const uid = String(m?.userId ?? "");
                            const picked = (Array.isArray(scheduleDraft?.assignedUserIds)
                              ? scheduleDraft.assignedUserIds
                              : []
                            ).some((x) => String(x) === uid);
                            return (
                              <label
                                key={uid || `sched-member-${pickIdx}`}
                                className="flex items-start gap-2 cursor-pointer text-xs text-slate-800"
                              >
                                <input
                                  type="checkbox"
                                  className="mt-0.5 rounded border-slate-300"
                                  checked={picked}
                                  disabled={scheduleSaving}
                                  onChange={() => {
                                    setScheduleDraft((d) => {
                                      const prev = Array.isArray(d?.assignedUserIds) ? d.assignedUserIds : [];
                                      const set = new Set(prev.map((x) => String(x)));
                                      if (set.has(uid)) set.delete(uid);
                                      else set.add(uid);
                                      return { ...d, assignedUserIds: [...set] };
                                    });
                                  }}
                                />
                                <span className="leading-snug">
                                  <span className="font-semibold">{m?.displayName ?? uid}</span>
                                  {m?.profileEmailRaw ? (
                                    <span className="block text-[10px] text-slate-500 font-normal">{m.profileEmailRaw}</span>
                                  ) : null}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      {(() => {
                        const ids = Array.isArray(scheduleDraft?.assignedUserIds) ? scheduleDraft.assignedUserIds : [];
                        if (ids.length === 0) return null;
                        const labels = ids
                          .map((id) => {
                            const m = (schedulePickMembers || []).find((x) => String(x.userId) === String(id));
                            return m?.displayName ? String(m.displayName).trim() : "";
                          })
                          .filter(Boolean);
                        if (labels.length === 0) return null;
                        return (
                          <p className="text-[11px] text-slate-700">
                            <span className="font-semibold text-slate-600">Selected: </span>
                            {labels.join(", ")}
                          </p>
                        );
                      })()}
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-slate-600" htmlFor="sched-assign-team">
                        Assigned team (optional)
                      </label>
                      <input
                        id="sched-assign-team"
                        type="text"
                        className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                        value={scheduleDraft.assignedTeamPlaceholder}
                        onChange={(e) =>
                          setScheduleDraft((d) => ({ ...d, assignedTeamPlaceholder: e.target.value }))
                        }
                        placeholder="Crew or group"
                        disabled={scheduleSaving}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-slate-600" htmlFor="sched-notes">
                        Notes / instructions
                      </label>
                      <textarea
                        id="sched-notes"
                        rows={3}
                        className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs resize-y min-h-[4rem]"
                        value={scheduleDraft.notes}
                        onChange={(e) => setScheduleDraft((d) => ({ ...d, notes: e.target.value }))}
                        disabled={scheduleSaving}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-slate-600" htmlFor="sched-status">
                        Status
                      </label>
                      <select
                        id="sched-status"
                        className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                        value={scheduleDraft.status}
                        onChange={(e) => setScheduleDraft((d) => ({ ...d, status: e.target.value }))}
                        disabled={scheduleSaving}
                      >
                        <option value="scheduled">scheduled</option>
                        <option value="in_progress">in_progress</option>
                        <option value="completed">completed</option>
                        <option value="cancelled">cancelled</option>
                      </select>
                    </div>
                    {scheduleSaveError ? (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-900 leading-snug">
                        {scheduleSaveError}
                      </div>
                    ) : null}
                    <div className="flex gap-2 pt-0.5">
                      <Button type="submit" className="flex-1 rounded-lg h-9 text-xs font-semibold" disabled={scheduleSaving}>
                        {scheduleSaving ? "Saving…" : "Save task"}
                      </Button>
                    </div>
                  </form>
                )}

                {scheduleLoading ? (
                  <p className="text-sm text-slate-600 py-4 text-center">Loading schedule…</p>
                ) : scheduleError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">{scheduleError}</div>
                ) : scheduleViewMode !== "list" ? (
                  <>
                    {scheduleCalendarMoveError ? (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[14px] leading-snug text-red-900">
                        {scheduleCalendarMoveError}
                      </div>
                    ) : null}
                    {scheduleViewMode === "cal30" ? (
                    <div className="w-full min-w-0 space-y-3">
                      <p className="text-center text-[clamp(22px,5vw,26px)] font-bold text-slate-900">
                        {scheduleMonthGridInfo.monthYearLabel}
                      </p>
                      <div className="grid grid-cols-7 gap-px border border-slate-200 bg-slate-200 text-[clamp(13px,3vw,15px)] font-semibold text-slate-600">
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                          <div key={d} className="bg-white py-2 text-center">
                            {d}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-px border-x border-b border-slate-200 bg-slate-200">
                        {(scheduleMonthGridInfo.cells || []).map((cell) => {
                          const rawArr = adminScheduleTasksByDay[cell.dayKey];
                          const tasks = Array.isArray(rawArr) ? rawArr : [];
                          const chips = tasks.slice(0, SCHEDULE_MONTH_CHIP_MAX);
                          const more = tasks.length - chips.length;
                          const isToday = cell.dayKey === scheduleWallTodayKey;
                          const isSel =
                            !!scheduleCalendarSelectedDayKey && cell.dayKey === scheduleCalendarSelectedDayKey;
                          return (
                            <div
                              key={cell.dayKey}
                              role="presentation"
                              onClick={(e) => {
                                if (isAdminScheduleCalendarBackgroundIgnored(e)) return;
                                if (!cell.inMonth) return;
                                setScheduleCalendarSelectedDayKey(cell.dayKey);
                                if (scheduleMoveModeTaskId) {
                                  const task = adminScheduledTaskById[String(scheduleMoveModeTaskId)];
                                  if (!task) {
                                    setScheduleCalendarMoveError(
                                      "Could not find that task. Cancel Move and try again."
                                    );
                                    return;
                                  }
                                  const parts = wallClockPartsInTimeZone(task?.start_time, companyTimeZone);
                                  const wallTime = parts.timeStr || "09:00";
                                  const newStartIso = wallDateTimeToUtcIso(
                                    cell.dayKey,
                                    normalizeTimeInputForWallClock(wallTime),
                                    companyTimeZone
                                  );
                                  if (!newStartIso) {
                                    setScheduleCalendarMoveError("Could not compute the new start time.");
                                    return;
                                  }
                                  const oldDay = calendarDateKeyInTimeZone(task?.start_time, companyTimeZone);
                                  if (oldDay === cell.dayKey) return;
                                  void persistAdminScheduledTaskClockMove(task, newStartIso);
                                  return;
                                }
                                openScheduleCreateFromSlot(cell.dayKey, "09:00");
                              }}
                              className={`relative flex min-h-[6.5rem] flex-col gap-1.5 px-2 py-2 transition-colors active:bg-slate-50 ${
                                cell.inMonth ? "cursor-pointer bg-white" : "bg-slate-50/95 opacity-80"
                              } ${isSel ? "ring-2 ring-inset ring-[#174ea6]/35" : ""} touch-manipulation`}
                            >
                              <span
                                className={`flex h-[1.875rem] min-w-[1.875rem] max-w-fit items-center justify-center text-[clamp(17px,4.2vw,20px)] font-bold tabular-nums leading-none ${
                                  isToday
                                    ? "rounded-full bg-[#1a73e8] px-2 text-white"
                                    : cell.inMonth
                                      ? "text-slate-900"
                                      : "text-slate-400"
                                }`}
                              >
                                {cell.dayNum}
                              </span>
                              <div className="flex min-h-0 flex-1 flex-col gap-1">
                                {chips.map((task) => (
                                  <button
                                    key={String(task.id)}
                                    type="button"
                                    data-sched-task-chip="1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openAdminScheduleEditFromCalendar(task);
                                    }}
                                    className={`truncate rounded-md bg-[#1a73e8] px-2 py-1.5 text-left text-[14px] font-bold text-white shadow-sm ${
                                      scheduleMoveModeTaskId === String(task?.id ?? "")
                                        ? "ring-2 ring-amber-300 ring-offset-1"
                                        : ""
                                    }`}
                                  >
                                    {String(task?.task_title ?? "").trim() || "Task"}
                                  </button>
                                ))}
                                {more > 0 ? (
                                  <span className="inline-flex px-1 text-[13px] font-semibold tabular-nums text-slate-600">
                                    +{more} more
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : scheduleCalendarVisibleDayKeys.length === 0 ? (
                    <p className="text-sm text-slate-600 py-3 text-center">Unable to build calendar range.</p>
                  ) : (
                    <div className="w-full min-w-0 space-y-2 pb-24 sm:pb-6">
                      {(() => {
                        const colH =
                          (SCHEDULE_GRID_HOUR_END - SCHEDULE_GRID_HOUR_START) * SCHEDULE_GRID_PX_PER_HOUR;
                        const compact = scheduleViewMode === "cal7";
                        const anchorKeys = scheduleCalendarVisibleDayKeys;
                        return (
                          <>
                            <div className="sticky top-0 z-30 rounded-t-2xl border border-slate-200 border-b-slate-100 bg-white shadow-sm">
                              <div className="flex min-w-0">
                                <div className="w-[3.5rem] shrink-0 border-r border-slate-100 sm:w-[3.75rem]" aria-hidden />
                                <div className="flex min-w-0 flex-1 divide-x divide-slate-100">
                                  {(anchorKeys || []).map((dayKey) => {
                                    const dn = Number(String(dayKey).split("-")[2]) || 0;
                                    const dayIsToday = dayKey === scheduleWallTodayKey;
                                    const daySel =
                                      !!scheduleCalendarSelectedDayKey &&
                                      dayKey === scheduleCalendarSelectedDayKey;
                                    const labelAccent = dayIsToday || daySel;
                                    return (
                                      <button
                                        key={`adm-hdr-${dayKey}`}
                                        type="button"
                                        onClick={() => setScheduleCalendarSelectedDayKey(dayKey)}
                                        className="min-w-0 flex-1 px-0.5 py-2.5 text-center outline-none focus-visible:ring-2 focus-visible:ring-[#174ea6]/40"
                                      >
                                        <span
                                          className={`block text-[13px] font-bold uppercase tracking-wide ${
                                            labelAccent ? "text-[#174ea6]" : "text-slate-500"
                                          }`}
                                        >
                                          {wallWeekdayShort(dayKey, companyTimeZone)}
                                        </span>
                                        <span
                                          className={`mx-auto mt-1 flex h-11 min-w-[2.75rem] max-w-[2.75rem] items-center justify-center rounded-full text-[clamp(17px,4.8vw,20px)] font-bold tabular-nums leading-none ${
                                            dayIsToday
                                              ? "bg-[#1a73e8] text-white shadow-sm"
                                              : daySel
                                                ? "bg-blue-100 text-[#174ea6]"
                                                : "text-slate-900"
                                          }`}
                                        >
                                          {dn}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                            <div className="overflow-hidden rounded-b-2xl border border-t-0 border-slate-200 bg-white shadow-sm">
                              <div className="flex min-h-0 w-full">
                                <div
                                  className="w-[3.5rem] shrink-0 border-r border-slate-200 bg-white py-2 pr-2 text-right text-[clamp(13px,3.8vw,15px)] tabular-nums leading-none text-slate-500 sm:w-[3.75rem]"
                                  style={{ minHeight: colH }}
                                >
                                  {Array.from(
                                    { length: SCHEDULE_GRID_HOUR_END - SCHEDULE_GRID_HOUR_START },
                                    (_, i) => SCHEDULE_GRID_HOUR_START + i
                                  ).map((h) => (
                                    <div
                                      key={`agl-${h}`}
                                      className="relative -translate-y-[0.65rem]"
                                      style={{ height: SCHEDULE_GRID_PX_PER_HOUR }}
                                    >
                                      {formatHourLabel12(h)}
                                    </div>
                                  ))}
                                </div>
                                <div ref={scheduleTimelineColsRef} className="flex min-w-0 flex-1 divide-x divide-slate-200 bg-white">
                                  {(anchorKeys || []).map((dayKey) => {
                                    const colTasks = adminScheduleTasksByDay[dayKey];
                                    const taskList = Array.isArray(colTasks) ? colTasks : [];
                                    return (
                                      <div
                                        key={dayKey}
                                        role="presentation"
                                        className="relative min-w-0 flex-1 cursor-pointer touch-manipulation"
                                        style={{ height: colH }}
                                        onClick={(e) => handleAdminScheduleDayBackgroundClick(e, dayKey)}
                                      >
                                        {Array.from(
                                          { length: SCHEDULE_GRID_HOUR_END - SCHEDULE_GRID_HOUR_START },
                                          (_, i) => SCHEDULE_GRID_HOUR_START + i
                                        ).map((hr) => (
                                          <div
                                            key={`${dayKey}-aln-${hr}`}
                                            className="pointer-events-none border-b border-slate-100"
                                            style={{ height: SCHEDULE_GRID_PX_PER_HOUR }}
                                          />
                                        ))}
                                        {taskList.map((task) => {
                                          const topM = wallMinutesFromScheduleGridStart(
                                            task?.start_time,
                                            dayKey,
                                            companyTimeZone
                                          );
                                          if (topM == null) return null;
                                          const dur = scheduleTaskDurationMinutes(task, companyTimeZone);
                                          const topPx = (topM / 60) * SCHEDULE_GRID_PX_PER_HOUR;
                                          const hPx = Math.min(
                                            Math.max(compact ? 32 : 40, (dur / 60) * SCHEDULE_GRID_PX_PER_HOUR),
                                            Math.max(compact ? 32 : 40, colH - topPx)
                                          );
                                          const tidKey = task?.id != null ? String(task.id) : "";
                                          const tone = scheduleTimelineAdminTone(task);
                                          const isMoveHighlighted = scheduleMoveModeTaskId === tidKey;
                                          const dragging = scheduleRescheduleSavingId === tidKey;
                                          const blockCls = `${scheduleTimelineBlockClasses(
                                            tone,
                                            compact
                                          )} sched-day-task-block absolute left-[3px] right-[3px] z-[8] overflow-hidden shadow-sm select-none touch-none cursor-grab${
                                            isMoveHighlighted ? " ring-[3px] ring-amber-300 ring-offset-1 ring-offset-white" : ""
                                          }${scheduleDragTaskId === tidKey ? " cursor-grabbing opacity-75" : ""}`;
                                          return (
                                            <div
                                              key={String(task.id)}
                                              className={blockCls}
                                              style={{
                                                top: topPx,
                                                height: hPx,
                                                minHeight: compact ? 32 : 40,
                                                opacity: dragging ? 0.55 : 1,
                                              }}
                                              onPointerDown={(e) => handleAdminTimelineTaskPointerDown(e, task, anchorKeys)}
                                              onPointerMove={handleAdminTimelineTaskPointerMove}
                                              onPointerUp={handleAdminTimelineTaskPointerUp}
                                              onPointerCancel={handleAdminTimelineTaskPointerUp}
                                            >
                                              <p
                                                className={`text-left font-bold leading-snug ${
                                                  compact ? "truncate text-[14px]" : "line-clamp-2 text-[15px]"
                                                }`}
                                                title={String(task?.task_title ?? "").trim() || "Task"}
                                              >
                                                {String(task?.task_title ?? "").trim() || "Task"}
                                              </p>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </>
                ) : (scheduleTasksGroupedByDate || []).length === 0 ? (
                  <p className="text-sm text-slate-600 py-4 text-center">No scheduled tasks.</p>
                ) : (
                  <div className="space-y-5">
                    {(scheduleTasksGroupedByDate || []).map(({ dateKey, tasks }) => {
                      const labelIso =
                        dateKey && dateKey !== "—"
                          ? wallDateTimeToUtcIso(dateKey, "12:00:00", companyTimeZone)
                          : null;
                      const dateHeading =
                        labelIso && dateKey !== "—"
                          ? `${wallWeekdayLongInTimeZone(dateKey, companyTimeZone)} · ${formatDate(labelIso, companyTimeZone)}`
                          : "Date unknown";
                      const taskList = Array.isArray(tasks) ? tasks : [];
                      return (
                        <div key={dateKey} className="space-y-2">
                          <p className="text-xs font-bold text-slate-800 uppercase tracking-wide">{dateHeading}</p>
                          <div className="space-y-2">
                            {taskList.map((task) => {
                              const ttitle = String(task?.task_title ?? "").trim() || "Untitled task";
                              const proj = String(task?.project_name ?? "").trim();
                              const projLine = proj.length > 0 ? proj : "No project selected";
                              const cc = String(task?.cost_centre ?? "").trim();
                              const ccLine = cc.length > 0 ? cc : "No cost centre";
                              const startDisp = task?.start_time ? formatTime(task.start_time, companyTimeZone) : "—";
                              const endRaw = task?.end_time;
                              const durRaw = task?.duration_minutes;
                              let windowLabel = "—";
                              if (endRaw) windowLabel = formatTime(endRaw, companyTimeZone);
                              else if (durRaw != null && String(durRaw).trim() !== "" && Number.isFinite(Number(durRaw)))
                                windowLabel = `${Number(durRaw)} min`;
                              const rawAssignList =
                                task?.id != null ? scheduleAssigneesByTaskId?.[String(task.id)] : undefined;
                              const assignRowsForTask = Array.isArray(rawAssignList) ? rawAssignList : [];
                              const sortedAssignees = [...assignRowsForTask].sort((a, b) =>
                                String(a?.employee_name ?? "").localeCompare(String(b?.employee_name ?? ""))
                              );
                              const at = String(task?.assigned_team ?? "").trim();
                              const notesDisp = String(task?.notes ?? "").trim();
                              const st = String(task?.status ?? "").trim() || "—";
                              const tidKey = task?.id != null ? String(task.id) : "";
                              const isEditingThis =
                                tidKey && scheduleEditingTaskId === tidKey && scheduleEditDraft != null;
                              return (
                                <div
                                  key={String(task?.id ?? `${dateKey}-${ttitle}-${startDisp}`)}
                                  className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2 shadow-sm min-w-0"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <p className="text-sm font-bold text-slate-900 leading-snug min-w-0 flex-1">{ttitle}</p>
                                    <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                        {st}
                                      </span>
                                      <button
                                        type="button"
                                        disabled={
                                          Boolean(scheduleEditSaving) ||
                                          scheduleDeleteSavingId === tidKey ||
                                          Boolean(scheduleRescheduleSavingId)
                                        }
                                        onClick={() => {
                                          setScheduleFormOpen(false);
                                          setScheduleSaveError("");
                                          setScheduleEditError("");
                                          setScheduleEditDraft(
                                            buildScheduleEditDraftFromTask(task, assignRowsForTask, companyTimeZone)
                                          );
                                          setScheduleEditingTaskId(tidKey);
                                        }}
                                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-800 disabled:opacity-50"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        disabled={
                                          Boolean(scheduleEditSaving) ||
                                          scheduleDeleteSavingId === tidKey ||
                                          Boolean(scheduleRescheduleSavingId)
                                        }
                                        onClick={() => beginScheduleMoveMode(task)}
                                        className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-900 disabled:opacity-50"
                                      >
                                        Move
                                      </button>
                                      <button
                                        type="button"
                                        disabled={
                                          Boolean(scheduleEditSaving) ||
                                          scheduleDeleteSavingId === tidKey ||
                                          Boolean(scheduleRescheduleSavingId)
                                        }
                                        onClick={() => void handleScheduleDeleteTask(task?.id)}
                                        className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-800 disabled:opacity-50"
                                      >
                                        {scheduleDeleteSavingId === tidKey ? "…" : "Delete"}
                                      </button>
                                    </div>
                                  </div>
                                  {isEditingThis ? (
                                    <form
                                      onSubmit={(e) => void handleScheduleUpdateTask(e)}
                                      className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/90 p-2.5"
                                    >
                                      <p className="text-[11px] font-semibold text-slate-800">Edit task</p>
                                      <div className="space-y-1">
                                        <label className="block text-[11px] font-medium text-slate-600" htmlFor={`sched-edit-title-${tidKey}`}>
                                          Task title
                                        </label>
                                        <input
                                          id={`sched-edit-title-${tidKey}`}
                                          type="text"
                                          className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                                          value={scheduleEditDraft.title}
                                          onChange={(e) =>
                                            setScheduleEditDraft((prev) =>
                                              prev ? { ...prev, title: e.target.value } : prev
                                            )
                                          }
                                          disabled={scheduleEditSaving}
                                          required
                                        />
                                      </div>
                                      <div className="grid grid-cols-1 gap-2">
                                        <div className="space-y-1">
                                          <label className="block text-[11px] font-medium text-slate-600" htmlFor={`sched-edit-proj-${tidKey}`}>
                                            Project
                                          </label>
                                          <select
                                            id={`sched-edit-proj-${tidKey}`}
                                            className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                                            value={scheduleEditDraft.projectId}
                                            onChange={(e) =>
                                              setScheduleEditDraft((prev) =>
                                                prev ? { ...prev, projectId: e.target.value, costCentre: "" } : prev
                                              )
                                            }
                                            disabled={scheduleEditSaving}
                                          >
                                            <option value="">— Optional —</option>
                                            {(effectiveProjects || []).map((p) => (
                                              <option key={String(p.id)} value={String(p.id)}>
                                                {p.name}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        <div className="space-y-1">
                                          <label className="block text-[11px] font-medium text-slate-600" htmlFor={`sched-edit-cc-${tidKey}`}>
                                            Cost centre / task
                                          </label>
                                          <select
                                            id={`sched-edit-cc-${tidKey}`}
                                            className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                                            value={scheduleEditDraft.costCentre}
                                            onChange={(e) =>
                                              setScheduleEditDraft((prev) =>
                                                prev ? { ...prev, costCentre: e.target.value } : prev
                                              )
                                            }
                                            disabled={scheduleEditSaving || !scheduleEditDraft.projectId}
                                          >
                                            <option value="">
                                              {scheduleEditDraft.projectId ? "— Select —" : "Pick a project first"}
                                            </option>
                                            {(scheduleEditCostCentreOptions || []).map((name) => (
                                              <option key={String(name)} value={String(name)}>
                                                {name}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                          <label className="block text-[11px] font-medium text-slate-600" htmlFor={`sched-edit-sd-${tidKey}`}>
                                            Start date
                                          </label>
                                          <input
                                            id={`sched-edit-sd-${tidKey}`}
                                            type="date"
                                            className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                                            value={scheduleEditDraft.startDate}
                                            onChange={(e) =>
                                              setScheduleEditDraft((prev) =>
                                                prev ? { ...prev, startDate: e.target.value } : prev
                                              )
                                            }
                                            disabled={scheduleEditSaving}
                                            required
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="block text-[11px] font-medium text-slate-600" htmlFor={`sched-edit-st-${tidKey}`}>
                                            Start time
                                          </label>
                                          <input
                                            id={`sched-edit-st-${tidKey}`}
                                            type="time"
                                            className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                                            value={scheduleEditDraft.startTime}
                                            onChange={(e) =>
                                              setScheduleEditDraft((prev) =>
                                                prev ? { ...prev, startTime: e.target.value } : prev
                                              )
                                            }
                                            disabled={scheduleEditSaving}
                                          />
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                          <label className="block text-[11px] font-medium text-slate-600" htmlFor={`sched-edit-ed-${tidKey}`}>
                                            End date
                                          </label>
                                          <input
                                            id={`sched-edit-ed-${tidKey}`}
                                            type="date"
                                            className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                                            value={scheduleEditDraft.endDate}
                                            onChange={(e) =>
                                              setScheduleEditDraft((prev) =>
                                                prev ? { ...prev, endDate: e.target.value } : prev
                                              )
                                            }
                                            disabled={scheduleEditSaving}
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="block text-[11px] font-medium text-slate-600" htmlFor={`sched-edit-et-${tidKey}`}>
                                            End time
                                          </label>
                                          <input
                                            id={`sched-edit-et-${tidKey}`}
                                            type="time"
                                            className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                                            value={scheduleEditDraft.endTime}
                                            onChange={(e) =>
                                              setScheduleEditDraft((prev) =>
                                                prev ? { ...prev, endTime: e.target.value } : prev
                                              )
                                            }
                                            disabled={scheduleEditSaving}
                                          />
                                        </div>
                                      </div>
                                      <div className="space-y-1">
                                        <label className="block text-[11px] font-medium text-slate-600" htmlFor={`sched-edit-dur-${tidKey}`}>
                                          Duration (minutes) if no end time
                                        </label>
                                        <input
                                          id={`sched-edit-dur-${tidKey}`}
                                          type="number"
                                          min={1}
                                          className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                                          value={scheduleEditDraft.durationMinutes}
                                          onChange={(e) =>
                                            setScheduleEditDraft((prev) =>
                                              prev ? { ...prev, durationMinutes: e.target.value } : prev
                                            )
                                          }
                                          disabled={scheduleEditSaving}
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <p className="text-[11px] font-medium text-slate-600">Assign employees</p>
                                        {schedulePickMembersLoading ? (
                                          <p className="text-[11px] text-slate-500">Loading…</p>
                                        ) : (schedulePickMembers || []).length === 0 ? (
                                          <p className="text-[11px] text-slate-600">No employees found.</p>
                                        ) : (
                                          <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 space-y-1.5">
                                            {(schedulePickMembers || []).map((m, pickIdx) => {
                                              const uid = String(m?.userId ?? "");
                                              const picked = (
                                                Array.isArray(scheduleEditDraft?.assignedUserIds)
                                                  ? scheduleEditDraft.assignedUserIds
                                                  : []
                                              ).some((x) => String(x) === uid);
                                              return (
                                                <label
                                                  key={uid || `sched-edit-m-${pickIdx}`}
                                                  className="flex items-start gap-2 cursor-pointer text-xs text-slate-800"
                                                >
                                                  <input
                                                    type="checkbox"
                                                    className="mt-0.5 rounded border-slate-300"
                                                    checked={picked}
                                                    disabled={scheduleEditSaving}
                                                    onChange={() => {
                                                      setScheduleEditDraft((prev) => {
                                                        if (!prev) return prev;
                                                        const pr = Array.isArray(prev.assignedUserIds)
                                                          ? prev.assignedUserIds
                                                          : [];
                                                        const set = new Set(pr.map((x) => String(x)));
                                                        if (set.has(uid)) set.delete(uid);
                                                        else set.add(uid);
                                                        return { ...prev, assignedUserIds: [...set] };
                                                      });
                                                    }}
                                                  />
                                                  <span className="leading-snug">
                                                    <span className="font-semibold">{m?.displayName ?? uid}</span>
                                                  </span>
                                                </label>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                      <div className="space-y-1">
                                        <label className="block text-[11px] font-medium text-slate-600" htmlFor={`sched-edit-team-${tidKey}`}>
                                          Assigned team (optional)
                                        </label>
                                        <input
                                          id={`sched-edit-team-${tidKey}`}
                                          type="text"
                                          className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                                          value={scheduleEditDraft.assignedTeamPlaceholder}
                                          onChange={(e) =>
                                            setScheduleEditDraft((prev) =>
                                              prev ? { ...prev, assignedTeamPlaceholder: e.target.value } : prev
                                            )
                                          }
                                          disabled={scheduleEditSaving}
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="block text-[11px] font-medium text-slate-600" htmlFor={`sched-edit-notes-${tidKey}`}>
                                          Notes
                                        </label>
                                        <textarea
                                          id={`sched-edit-notes-${tidKey}`}
                                          rows={2}
                                          className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs resize-y min-h-[3rem]"
                                          value={scheduleEditDraft.notes}
                                          onChange={(e) =>
                                            setScheduleEditDraft((prev) =>
                                              prev ? { ...prev, notes: e.target.value } : prev
                                            )
                                          }
                                          disabled={scheduleEditSaving}
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="block text-[11px] font-medium text-slate-600" htmlFor={`sched-edit-status-${tidKey}`}>
                                          Status
                                        </label>
                                        <select
                                          id={`sched-edit-status-${tidKey}`}
                                          className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                                          value={scheduleEditDraft.status}
                                          onChange={(e) =>
                                            setScheduleEditDraft((prev) =>
                                              prev ? { ...prev, status: e.target.value } : prev
                                            )
                                          }
                                          disabled={scheduleEditSaving}
                                        >
                                          <option value="scheduled">scheduled</option>
                                          <option value="in_progress">in_progress</option>
                                          <option value="completed">completed</option>
                                          <option value="cancelled">cancelled</option>
                                        </select>
                                      </div>
                                      {scheduleEditError ? (
                                        <div className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-900">
                                          {scheduleEditError}
                                        </div>
                                      ) : null}
                                      <div className="flex flex-wrap gap-2 pt-0.5">
                                        <Button
                                          type="submit"
                                          className="flex-1 min-w-[8rem] rounded-lg h-9 text-xs font-semibold"
                                          disabled={scheduleEditSaving || Boolean(scheduleRescheduleSavingId)}
                                        >
                                          {scheduleEditSaving ? "Saving…" : "Save changes"}
                                        </Button>
                                        <button
                                          type="button"
                                          disabled={scheduleEditSaving || Boolean(scheduleRescheduleSavingId)}
                                          onClick={() => beginScheduleMoveMode(task)}
                                          className="flex-1 min-w-[7rem] rounded-lg h-9 text-xs font-semibold border border-amber-300 bg-amber-50 text-amber-900"
                                        >
                                          Move
                                        </button>
                                        <button
                                          type="button"
                                          disabled={scheduleEditSaving}
                                          onClick={() => {
                                            setScheduleEditingTaskId(null);
                                            setScheduleEditDraft(null);
                                            setScheduleEditError("");
                                          }}
                                          className="flex-1 min-w-[8rem] rounded-lg h-9 text-xs font-semibold border border-slate-300 bg-white text-slate-800"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </form>
                                  ) : (
                                    <>
                                      <p className="text-[12px] text-slate-700">
                                        <span className="font-semibold text-slate-600">Project: </span>
                                        {projLine}
                                      </p>
                                      <p className="text-[12px] text-slate-700">
                                        <span className="font-semibold text-slate-600">Cost centre: </span>
                                        {ccLine}
                                      </p>
                                      <p className="text-[12px] text-slate-800">
                                        <span className="font-semibold text-slate-600">Time: </span>
                                        {startDisp}
                                        {" → "}
                                        {windowLabel}
                                      </p>
                                      <div className="rounded-lg border border-slate-100 bg-slate-50/90 p-2.5 space-y-1.5 min-w-0">
                                        <p className="text-[11px] font-semibold text-slate-700">
                                          Assigned employees and responses
                                        </p>
                                        {sortedAssignees.length === 0 ? (
                                          <p className="text-[11px] text-slate-600">No employees assigned.</p>
                                        ) : (
                                          <ul className="space-y-2 list-none p-0 m-0">
                                            {sortedAssignees.map((ar) => {
                                              const aname = String(ar?.employee_name ?? "").trim() || "—";
                                              const rs = normalizeScheduleAssigneeResponseStatus(ar?.response_status);
                                              const rreason = String(ar?.decline_reason ?? "").trim();
                                              const rAt = ar?.responded_at;
                                              const rDisp =
                                                rAt != null && rAt !== ""
                                                  ? `${formatDate(rAt, companyTimeZone)} · ${formatTime(rAt, companyTimeZone)}`
                                                  : null;
                                              return (
                                                <li
                                                  key={String(ar?.id ?? `${task?.id}-${aname}`)}
                                                  className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] min-w-0"
                                                >
                                                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                                                    <span className="font-semibold text-slate-800 break-words min-w-0 flex-1">{aname}</span>
                                                    <span
                                                      className={`shrink-0 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 ${scheduleAssigneeResponseBadgeClass(rs)}`}
                                                    >
                                                      {scheduleAssigneeResponseLabel(rs)}
                                                    </span>
                                                  </div>
                                                  {rDisp ? (
                                                    <p className="text-[10px] text-slate-500 mt-0.5">Response time: {rDisp}</p>
                                                  ) : null}
                                                  {rs === "declined" && rreason ? (
                                                    <p className="text-[10px] text-slate-700 mt-0.5 leading-snug break-words">
                                                      <span className="font-semibold text-slate-600">Decline reason: </span>
                                                      {rreason}
                                                    </p>
                                                  ) : null}
                                                </li>
                                              );
                                            })}
                                          </ul>
                                        )}
                                      </div>
                                      {at ? (
                                        <p className="text-[12px] text-slate-700">
                                          <span className="font-semibold text-slate-600">Team: </span>
                                          {at}
                                        </p>
                                      ) : null}
                                      {notesDisp ? (
                                        <p className="text-[12px] text-slate-600 leading-snug whitespace-pre-wrap">{notesDisp}</p>
                                      ) : null}
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
                <button className="w-full text-left rounded-2xl p-3 bg-slate-100 font-semibold" onClick={() => openMenuTab("schedule")}>📅 Schedule</button>
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
          <div className={`grid gap-1.5 grid-cols-3`}>
            {!isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab("schedule")}
                className={`rounded-2xl py-2.5 px-2 text-sm font-semibold ${activeTab === "schedule" ? "bg-slate-900 text-white" : "text-slate-500"}`}
              >
                📅 Schedule
              </button>
            )}
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
