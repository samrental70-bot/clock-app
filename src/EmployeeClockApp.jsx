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

function safeWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`[STORAGE] Could not save ${key}`, err);
    return false;
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
/** Pixel height per hour in schedule day columns (compact enough for mobile calendar-first views). */
const SCHEDULE_GRID_PX_PER_HOUR = 46;
const SCHEDULE_MONTH_CHIP_MAX = 1;

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
  const pad = compact ? "rounded-lg px-1.5 py-1" : "rounded-2xl px-2.5 py-2";
  const type = compact ? "text-[12px] leading-tight" : "text-[15px] leading-snug";
  const base = `${pad} ${type} text-white ring-1 ring-white/20`;
  if (tone === "accepted") return `${base} bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-[0_10px_18px_rgba(5,150,105,0.24)]`;
  if (tone === "declined") return `${base} bg-gradient-to-br from-rose-500 to-rose-700 shadow-[0_10px_18px_rgba(225,29,72,0.22)]`;
  if (tone === "neutral") return `${base} bg-gradient-to-br from-slate-500 to-slate-700 shadow-[0_10px_18px_rgba(71,85,105,0.20)]`;
  return `${base} bg-gradient-to-br from-[#1a73e8] to-[#1558d6] shadow-[0_10px_20px_rgba(26,115,232,0.28)]`;
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

function reportDimensionLabel(value) {
  if (value === "employee") return "Employee";
  if (value === "project") return "Project";
  if (value === "cost_center") return "Cost Centre";
  return "None";
}

function mediaItemId(item, index = 0) {
  return String(
    item?.storagePath ||
      item?.videoUrl ||
      item?.imageUrl ||
      item?.dataUrl ||
      item?.id ||
      `media-${index}`
  );
}

function isVideoMediaItem(item) {
  return item?.media_type === "video" || item?.mediaType === "video" || item?.type === "video";
}

function mediaItemUrl(item) {
  return item?.videoUrl || item?.imageUrl || item?.dataUrl || "";
}

function encodeSharePayload(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeSharePayload(raw) {
  const value = String(raw || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function formatPlainDuration(seconds) {
  const raw = Number(seconds);
  if (!Number.isFinite(raw) || raw <= 0) return "";
  const s = Math.round(raw);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
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
    if (typeof navigator === "undefined" || !navigator.geolocation) {
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

async function readGeolocationPermissionState() {
  try {
    if (
      typeof navigator === "undefined" ||
      !navigator.geolocation ||
      !navigator.permissions?.query
    ) {
      return "unknown";
    }
    const result = await navigator.permissions.query({ name: "geolocation" });
    return result?.state || "unknown";
  } catch {
    return "unknown";
  }
}

function clockLocationStorageKey(userId) {
  return `orp_clock_location_enabled_${userId || "anonymous"}`;
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
  if (!ids.length) return { ok: true, skipped: true, sent: 0 };
  try {
    const res = await fetch("/api/send-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notification_ids: ids }),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) console.warn("[NOTIFY] send-push HTTP", res.status);
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    console.warn("[NOTIFY] send-push fetch failed", e);
    return { ok: false, error: e };
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
    new window.Notification(String(notificationRow.title || "OPERA.AI"), {
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

function scheduleShortEmployeeName(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const base = raw.includes("@") ? raw.split("@")[0] : raw;
  const compact = base.replace(/\s+/g, " ").trim();
  return compact.slice(0, 3) || "";
}

function scheduleShortEmployeeSummary(assignRows, fallbackNames) {
  const names = [];
  for (const row of Array.isArray(assignRows) ? assignRows : []) {
    const short = scheduleShortEmployeeName(row?.employee_name || row?.employee_email || row?.user_id);
    if (short) names.push(short);
  }
  if (names.length === 0 && fallbackNames) {
    for (const part of String(fallbackNames).split(",")) {
      const short = scheduleShortEmployeeName(part);
      if (short) names.push(short);
    }
  }
  const unique = [...new Set(names)];
  return unique.length > 0 ? unique.join(", ") : "No emp";
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

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendPushForRecentScheduleAssignmentNotifications(supabase, params) {
  const { companyId, recipientUserIds, sinceIso } = params || {};
  const company = String(companyId || "").trim();
  const userIds = [...new Set((Array.isArray(recipientUserIds) ? recipientUserIds : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean))];
  if (!supabase || !company || userIds.length === 0) return [];

  const recentSince =
    sinceIso || new Date(Date.now() - 2 * 60 * 1000).toISOString();
  console.log("[SCHEDULE_PUSH] looking for notification ids for users", userIds);

  let notificationIds = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await waitMs(attempt === 1 ? 400 : 900);
    try {
      const { data, error } = await supabase.rpc("get_recent_schedule_notification_ids", {
        p_company_id: company,
        p_recipient_user_ids: userIds,
        p_since: recentSince,
      });
      if (error) {
        console.warn("[SCHEDULE_PUSH] notification id rpc error", error);
        return [];
      }
      const rows = Array.isArray(data) ? data : [];
      console.log("[SCHEDULE_PUSH] rpc rows", rows);
      notificationIds = [...new Set(rows
        .map((row) => {
          if (typeof row === "string") return row;
          return row?.id ?? row?.notification_id ?? row?.notificationId ?? null;
        })
        .map((id) => String(id || "").trim())
        .filter(Boolean))];
      if (notificationIds.length > 0 || attempt === 2) break;
    } catch (e) {
      console.warn("[SCHEDULE_PUSH] notification id rpc exception", e);
      return [];
    }
  }

  console.log("[SCHEDULE_PUSH] found ids", notificationIds);
  if (notificationIds.length === 0) return [];

  const result = await requestSendPushForNotificationIds(notificationIds);
  if (result?.ok) console.log("[SCHEDULE_PUSH] send-push result", result);
  else console.warn("[SCHEDULE_PUSH] send-push error", result);
  return notificationIds;
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

function PublicPhotoShareView({ share, index, setIndex }) {
  const items = Array.isArray(share?.items) ? share.items : [];
  const safeIndex = items.length ? Math.max(0, Math.min(index, items.length - 1)) : 0;
  const current = items[safeIndex] || null;
  const isVideo = isVideoMediaItem(current);
  const url = mediaItemUrl(current);
  const go = (delta) => {
    if (!items.length) return;
    setIndex((prev) => {
      const next = prev + delta;
      if (next < 0) return items.length - 1;
      if (next >= items.length) return 0;
      return next;
    });
  };

  return (
    <div className="min-h-[100dvh] bg-neutral-950 text-slate-900 flex justify-center">
      <div className="w-full max-w-3xl bg-slate-50 min-h-[100dvh]">
        <header className="bg-white border-b px-4 py-4">
          <h1 className="text-2xl font-black tracking-tight">OPERA.AI</h1>
          <p className="text-sm font-medium text-slate-600">
            Shared project photos{share?.folder ? ` - ${share.folder}` : ""}
          </p>
        </header>
        <main className="p-4 space-y-4">
          {!items.length ? (
            <div className="rounded-2xl border bg-white p-5 text-center text-slate-600">
              This share link does not contain any selected photos.
            </div>
          ) : (
            <>
              <div className="rounded-2xl border bg-white overflow-hidden">
                <div className="bg-slate-950">
                  {isVideo ? (
                    <video src={url} className="w-full max-h-[72vh] bg-slate-950" controls playsInline />
                  ) : (
                    <img src={url} alt="Shared project" className="w-full max-h-[72vh] object-contain bg-slate-950" />
                  )}
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-bold text-slate-900 break-words">
                        {current?.employee || "Project media"}
                      </p>
                      <p className="text-sm text-slate-600 break-words">
                        {[current?.project, current?.costCenter].filter(Boolean).join(" - ")}
                      </p>
                      {current?.capturedAt ? (
                        <p className="text-xs text-slate-500">
                          {new Date(current.capturedAt).toLocaleString()}
                        </p>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-sm font-bold text-slate-500 tabular-nums">
                      {safeIndex + 1} / {items.length}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="rounded-2xl border border-slate-300 bg-white py-3 text-base font-bold text-slate-900"
                      onClick={() => go(-1)}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl bg-slate-900 py-3 text-base font-bold text-white"
                      onClick={() => go(1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {items.map((item, itemIndex) => {
                  const thumbUrl = mediaItemUrl(item);
                  const thumbVideo = isVideoMediaItem(item);
                  return (
                    <button
                      key={`${mediaItemId(item, itemIndex)}-${itemIndex}`}
                      type="button"
                      className={`rounded-xl overflow-hidden border bg-white ${
                        itemIndex === safeIndex ? "border-slate-900 ring-2 ring-slate-900/20" : "border-slate-200"
                      }`}
                      onClick={() => setIndex(itemIndex)}
                    >
                      {thumbVideo ? (
                        <video src={thumbUrl} className="h-20 w-full object-cover bg-slate-950" muted playsInline preload="metadata" />
                      ) : (
                        <img src={thumbUrl} alt="" className="h-20 w-full object-cover" />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default function EmployeeClockApp() {
  const [activeTab, setActiveTab] = useState("clock");
  const [projectId, setProjectId] = useState("");
  const [costCenter, setCostCenter] = useState("");
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
  const [clockLocationEnabled, setClockLocationEnabled] = useState(false);
  const [clockLocationPermissionState, setClockLocationPermissionState] = useState("unknown");
  const [photoStatus, setPhotoStatus] = useState("");
  const [uploadProgress, setUploadProgress] = useState(null);
  const [photoDrafts, setPhotoDrafts] = useState([]);
  const [photoCameraOpen, setPhotoCameraOpen] = useState(false);
  const [photoCameraMode, setPhotoCameraMode] = useState("photo");
  const [photoCameraError, setPhotoCameraError] = useState("");
  const [photoBatchUploading, setPhotoBatchUploading] = useState(false);
  const [photoBatchProgress, setPhotoBatchProgress] = useState(null);
  const [receiptDraftFile, setReceiptDraftFile] = useState(null);
  const [receiptEntryStep, setReceiptEntryStep] = useState(null);
  const [receiptAmountDraft, setReceiptAmountDraft] = useState("");
  const [receiptCategoryDraft, setReceiptCategoryDraft] = useState("");
  const [receiptSaving, setReceiptSaving] = useState(false);
  const [materialPaymentOpen, setMaterialPaymentOpen] = useState(false);
  const [materialPaymentStep, setMaterialPaymentStep] = useState("form");
  const [materialPaymentCountdown, setMaterialPaymentCountdown] = useState(10);
  const [materialSupplierDraft, setMaterialSupplierDraft] = useState("");
  const [materialAmountDraft, setMaterialAmountDraft] = useState("");
  const photoDraftsRef = useRef([]);
  const photoCameraStreamRef = useRef(null);
  const photoToolsRef = useRef(null);
  const photoUploadActionsRef = useRef(null);
  const photoVideoRef = useRef(null);
  const photoCanvasRef = useRef(null);
  const photoGalleryInputRef = useRef(null);
  const photoFallbackCameraInputRef = useRef(null);
  const photoStatusClearTimerRef = useRef(null);
  const latestPhotoStatusRef = useRef("");
  const clockSetupWarningTimerRef = useRef(null);
  const latestLocationStatusRef = useRef("");
  const materialPaymentCountdownTimerRef = useRef(null);
  const materialPaymentOpenReceiptTimerRef = useRef(null);
  const materialPaymentPendingRef = useRef(null);
  const receiptAmountInputRef = useRef(null);
  const receiptCategoryInputRef = useRef(null);
  const [videoDraft, setVideoDraft] = useState(null);
  const [videoStatus, setVideoStatus] = useState("");
  const [videoUploadProgress, setVideoUploadProgress] = useState(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoRecording, setVideoRecording] = useState(false);
  const [videoRecordSeconds, setVideoRecordSeconds] = useState(0);
  const videoDraftRef = useRef(null);
  const videoRecorderRef = useRef(null);
  const videoRecordChunksRef = useRef([]);
  const videoRecordIntervalRef = useRef(null);
  const videoRecordStopTimerRef = useRef(null);
  const videoRecordStartedAtRef = useRef(0);
  const [watchId, setWatchId] = useState(null);
  const [clockListModal, setClockListModal] = useState(null);
  const [clockListDraft, setClockListDraft] = useState("");
  const clockListPhotoInputRef = useRef(null);
  const listPhotoInputRef = useRef(null);
  const [clockListImageDraft, setClockListImageDraft] = useState(null);
  const [clockProjectLists, setClockProjectLists] = useState(() =>
    safeRead("orp_clock_project_lists", { task: {}, material: {} })
  );
  const [clockListUndo, setClockListUndo] = useState(null);
  const [listSelectedProjectId, setListSelectedProjectId] = useState("");
  const [listType, setListType] = useState("task");
  const [listDraft, setListDraft] = useState("");
  const [listImageDraft, setListImageDraft] = useState(null);
  const [listImageViewer, setListImageViewer] = useState(null);
  const [photoNotificationCount, setPhotoNotificationCount] = useState(() => safeRead("orp_photo_notification_count", 0));
  const [selectedPhotoFolder, setSelectedPhotoFolder] = useState("all");
  const [selectedReceiptFolder, setSelectedReceiptFolder] = useState("all");
  const [selectedPhotoIdsByFolder, setSelectedPhotoIdsByFolder] = useState({});
  const [photoViewer, setPhotoViewer] = useState(null);
  const [photoShareMessage, setPhotoShareMessage] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPanel, setMenuPanel] = useState("main");
  const [publicShareIndex, setPublicShareIndex] = useState(0);

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
  /** Once per login session: land supervisors/owners on Employees > Live Dashboard. */
  const adminDashboardLandingAppliedRef = useRef(false);
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
  const publicPhotoShare = useMemo(() => {
    if (typeof window === "undefined") return null;
    const raw = new URLSearchParams(window.location.search).get("photoShare");
    if (!raw) return null;
    try {
      const decoded = decodeSharePayload(raw);
      return decoded && decoded.type === "project_photos" ? decoded : { type: "project_photos", items: [] };
    } catch (err) {
      console.warn("Photo share link could not be opened:", err);
      return { type: "project_photos", items: [] };
    }
  }, []);

  useEffect(() => {
    if (!authUser?.id) {
      employeeScheduleLandingAppliedRef.current = false;
      adminDashboardLandingAppliedRef.current = false;
      return;
    }
    if (!companyChecked || !userCompany?.id || !isEmployeeRole) return;
    if (employeeScheduleLandingAppliedRef.current) return;
    employeeScheduleLandingAppliedRef.current = true;
    setActiveTab("schedule");
  }, [authUser?.id, companyChecked, userCompany?.id, isEmployeeRole]);

  useEffect(() => {
    if (!authUser?.id || !companyChecked || !userCompany?.id || !isAdmin) return;
    if (adminDashboardLandingAppliedRef.current) return;
    adminDashboardLandingAppliedRef.current = true;
    if (activeTab === "clock") setActiveTab("dashboard");
  }, [authUser?.id, companyChecked, userCompany?.id, isAdmin, activeTab]);

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
  const [settingsCompanyNameDraft, setSettingsCompanyNameDraft] = useState("");
  const [settingsCompanyEditOpen, setSettingsCompanyEditOpen] = useState(false);
  const [settingsProfileNameDraft, setSettingsProfileNameDraft] = useState("");
  const [settingsProfileEditOpen, setSettingsProfileEditOpen] = useState(false);
  const [settingsProfileSaving, setSettingsProfileSaving] = useState(false);
  const [settingsProfileMessage, setSettingsProfileMessage] = useState("");
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
  const [timesheetViewMode, setTimesheetViewMode] = useState("day");
  const [timesheetDateKey, setTimesheetDateKey] = useState("");
  const [timesheetDateFrom, setTimesheetDateFrom] = useState("");
  const [timesheetDateTo, setTimesheetDateTo] = useState("");
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
  const [scheduleDragOffset, setScheduleDragOffset] = useState({ taskId: null, dx: 0, dy: 0, active: false });
  const scheduleTimelineColsRef = useRef(null);
  const scheduleEditReturnScrollYRef = useRef(null);
  const schedulePendingScrollRestoreYRef = useRef(null);
  const schedulePendingScrollRestoreSawLoadingRef = useRef(false);
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
  const [scheduleEditReturnViewMode, setScheduleEditReturnViewMode] = useState("");
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
  const [reportsDrillPage, setReportsDrillPage] = useState("main");
  const [reportsSelectedProject, setReportsSelectedProject] = useState(null);
  const [reportsSelectedEmployee, setReportsSelectedEmployee] = useState(null);
  const [reportsProjectGroupBy, setReportsProjectGroupBy] = useState("employee");
  const [reportsDrillStack, setReportsDrillStack] = useState([]);
  const [reportsDrillViewBy, setReportsDrillViewBy] = useState("project");
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
    setSettingsCompanyNameDraft(userCompany?.name || "");
  }, [userCompany?.id, userCompany?.time_zone, userCompany?.name]);

  useEffect(() => {
    setSettingsProfileNameDraft((profileFullName || "").trim());
  }, [profileFullName, authUser?.id]);

  useEffect(() => {
    if (!companyChecked) return;
    const todayKey = calendarDateKeyInTimeZone(new Date(), companyTimeZone);
    if (!todayKey) return;
    setTimesheetDateKey((prev) => prev || todayKey);
    setTimesheetDateFrom((prev) => prev || todayKey);
    setTimesheetDateTo((prev) => prev || todayKey);
  }, [companyChecked, companyTimeZone]);

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

  const scheduleTaskSuggestionPool = useMemo(() => {
    const projects = Array.isArray(effectiveProjects) ? effectiveProjects : [];
    const projectById = new Map();
    const projectByFolder = new Map();
    const projectByName = new Map();
    for (const project of projects) {
      const id = project?.id != null ? String(project.id) : "";
      const name = String(project?.name || "").trim();
      if (id) projectById.set(id, project);
      if (name) {
        projectByName.set(name.toLowerCase(), project);
        projectByFolder.set(getProjectFolderName(name), project);
      }
    }

    const out = [];
    const seen = new Set();
    const taskBuckets = clockProjectLists?.task || {};
    for (const [sourceKey, rows] of Object.entries(taskBuckets)) {
      if (!Array.isArray(rows)) continue;
      const parts = String(sourceKey || "").split("|");
      const projectToken = parts[2] || "";
      const sourceCost = parts[3] || "";
      for (const item of rows) {
        const text = String(item?.text || "").trim();
        if (!text) continue;
        const itemProjectId = String(item?.projectId || "").trim();
        const itemProjectName = String(item?.projectName || "").trim();
        let project =
          (itemProjectId && projectById.get(itemProjectId)) ||
          (itemProjectName && projectByName.get(itemProjectName.toLowerCase())) ||
          (projectToken && projectById.get(projectToken)) ||
          (projectToken && projectByFolder.get(projectToken)) ||
          null;
        const resolvedProjectId = project?.id != null ? String(project.id) : itemProjectId;
        const resolvedProjectName = String(project?.name || itemProjectName || "").trim();
        const rawCost = String(item?.costCenter || sourceCost || "").trim();
        const resolvedCost = rawCost && rawCost !== "project" && rawCost !== "cost" ? rawCost : "";
        const key = `${text.toLowerCase()}|${resolvedProjectId}|${resolvedCost.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: item?.id || key,
          text,
          projectId: resolvedProjectId,
          projectName: resolvedProjectName,
          costCenter: resolvedCost,
        });
      }
    }
    return out.sort((a, b) => a.text.localeCompare(b.text));
  }, [clockProjectLists, effectiveProjects]);

  const getScheduleTaskTitleSuggestions = useCallback(
    (rawTitle) => {
      const q = String(rawTitle || "").trim().toLowerCase();
      if (!q) return [];
      const rows = scheduleTaskSuggestionPool.filter((item) =>
        String(item?.text || "").trim().toLowerCase().startsWith(q) &&
        String(item?.text || "").trim().toLowerCase() !== q
      );
      return rows.slice(0, 8);
    },
    [scheduleTaskSuggestionPool]
  );

  const scheduleTitleSuggestions = useMemo(
    () => getScheduleTaskTitleSuggestions(scheduleDraft?.title),
    [getScheduleTaskTitleSuggestions, scheduleDraft?.title]
  );

  const scheduleEditTitleSuggestions = useMemo(
    () => getScheduleTaskTitleSuggestions(scheduleEditDraft?.title),
    [getScheduleTaskTitleSuggestions, scheduleEditDraft?.title]
  );

  const applyScheduleTaskSuggestionToDraft = useCallback((suggestion) => {
    if (!suggestion?.text) return;
    setScheduleDraft((prev) => ({
      ...prev,
      title: suggestion.text,
      projectId: suggestion.projectId || prev?.projectId || "",
      costCentre: suggestion.costCenter || "",
    }));
  }, []);

  const applyScheduleTaskSuggestionToEditDraft = useCallback((suggestion) => {
    if (!suggestion?.text) return;
    setScheduleEditDraft((prev) =>
      prev
        ? {
            ...prev,
            title: suggestion.text,
            projectId: suggestion.projectId || prev.projectId || "",
            costCentre: suggestion.costCenter || "",
          }
        : prev
    );
  }, []);

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
    return found || null;
  }, [clockSelectableProjects, projectId]);

  const clockCostCentresActive = useMemo(
    () =>
      clockSelectedProject?.id != null ? clockCostCentreOptionsForProject(clockSelectedProject.id) : [],
    [clockSelectedProject?.id, clockCostCentreOptionsForProject]
  );

  const clockProjectSelected = Boolean(
    projectId && clockSelectedProject && String(clockSelectedProject.id) === String(projectId)
  );
  const clockCostCentreSelected = Boolean(
    clockProjectSelected && costCenter && clockCostCentresActive.includes(costCenter)
  );
  const clockSetupReady = Boolean(clockProjectSelected && clockCostCentreSelected);

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

  const clockMediaContext = useMemo(() => {
    if (visibleCurrentShift) return visibleCurrentShift;
    if (!clockSetupReady || !authUser?.id || !clockSelectedProject) return null;
    const employeeName = (profileFullName || "").trim() || authUser?.email || "Employee";
    return {
      userId: authUser.id,
      employee: employeeName,
      employeeName,
      employeeEmail: authUser?.email || null,
      companyId: userCompany?.id || null,
      companyName: userCompany?.name || null,
      project: clockSelectedProject.name,
      projectId: clockSelectedProject.id,
      costCenter,
      employeeId: authUser.id,
      projectFolder: getProjectFolderName(clockSelectedProject.name),
      clockInLocation: null,
      liveLocation: null,
      supabaseTimesheetId: null,
    };
  }, [
    authUser?.email,
    authUser?.id,
    clockSelectedProject,
    clockSetupReady,
    costCenter,
    profileFullName,
    userCompany?.id,
    userCompany?.name,
    visibleCurrentShift,
  ]);

  useEffect(() => {
    latestPhotoStatusRef.current = photoStatus;
  }, [photoStatus]);

  useEffect(() => {
    latestLocationStatusRef.current = locationStatus;
  }, [locationStatus]);

  useEffect(() => {
    return () => {
      if (photoStatusClearTimerRef.current) clearTimeout(photoStatusClearTimerRef.current);
      if (clockSetupWarningTimerRef.current) clearTimeout(clockSetupWarningTimerRef.current);
      if (materialPaymentCountdownTimerRef.current) clearInterval(materialPaymentCountdownTimerRef.current);
      if (materialPaymentOpenReceiptTimerRef.current) clearTimeout(materialPaymentOpenReceiptTimerRef.current);
    };
  }, []);

  const clearMaterialPaymentTimers = useCallback(() => {
    if (materialPaymentCountdownTimerRef.current) {
      clearInterval(materialPaymentCountdownTimerRef.current);
      materialPaymentCountdownTimerRef.current = null;
    }
    if (materialPaymentOpenReceiptTimerRef.current) {
      clearTimeout(materialPaymentOpenReceiptTimerRef.current);
      materialPaymentOpenReceiptTimerRef.current = null;
    }
  }, []);

  const schedulePhotoStatusClear = useCallback((expectedStatus, delayMs = 5000, options = {}) => {
    if (photoStatusClearTimerRef.current) clearTimeout(photoStatusClearTimerRef.current);
    photoStatusClearTimerRef.current = setTimeout(() => {
      if (latestPhotoStatusRef.current === expectedStatus) {
        setPhotoStatus("");
        if (options.clearUploadProgress) setUploadProgress(null);
        if (options.clearBatchProgress) setPhotoBatchProgress(null);
      }
      photoStatusClearTimerRef.current = null;
    }, delayMs);
  }, []);

  const showClockSetupRequired = useCallback(() => {
    const message =
      clockSelectableProjects.length === 0
        ? "No projects assigned. Please contact your supervisor."
        : "Select project and cost center first.";
    if (clockSetupWarningTimerRef.current) clearTimeout(clockSetupWarningTimerRef.current);
    setPhotoStatus("");
    setLocationStatus(message);
    clockSetupWarningTimerRef.current = setTimeout(() => {
      if (latestLocationStatusRef.current === message) setLocationStatus("");
      clockSetupWarningTimerRef.current = null;
    }, 5000);
  }, [clockSelectableProjects.length]);

  const refreshClockLocationPermission = useCallback(async () => {
    const state = await readGeolocationPermissionState();
    setClockLocationPermissionState(state);
    if (state === "granted" && authUser?.id) {
      setClockLocationEnabled(true);
      safeWrite(clockLocationStorageKey(authUser.id), true);
    }
    if (state === "denied" && authUser?.id) {
      setClockLocationEnabled(false);
      safeWrite(clockLocationStorageKey(authUser.id), false);
    }
    return state;
  }, [authUser?.id]);

  const getClockActionLocation = useCallback(async () => {
    const permissionState = await refreshClockLocationPermission();
    const allowed =
      clockLocationEnabled ||
      permissionState === "granted" ||
      Boolean(authUser?.id && safeRead(clockLocationStorageKey(authUser.id), false));
    if (!allowed) return { coords: null, error: "not_enabled" };
    const result = await getCurrentLocation();
    if (result.error === "denied" && authUser?.id) {
      setClockLocationEnabled(false);
      safeWrite(clockLocationStorageKey(authUser.id), false);
      setClockLocationPermissionState("denied");
    }
    return result;
  }, [authUser?.id, clockLocationEnabled, refreshClockLocationPermission]);

  const handleEnableClockLocation = useCallback(async () => {
    if (!authUser?.id) return;
    setLocationStatus("Enabling location...");
    const result = await getCurrentLocation();
    const nextState = await readGeolocationPermissionState();
    setClockLocationPermissionState(nextState);
    if (result.coords) {
      setClockLocationEnabled(true);
      safeWrite(clockLocationStorageKey(authUser.id), true);
      setLocationStatus("Location enabled.");
      setTimeout(() => {
        if (latestLocationStatusRef.current === "Location enabled.") setLocationStatus("");
      }, 3000);
      if (visibleCurrentShift) {
        void updateLiveLocationOnce({
          status: "clocked_in",
          projectName: visibleCurrentShift.project,
          costCentre: visibleCurrentShift.costCenter,
          coords: result.coords,
        });
      }
      return;
    }
    setClockLocationEnabled(false);
    safeWrite(clockLocationStorageKey(authUser.id), false);
    setLocationStatus(
      result.error === "denied"
        ? "Location blocked in browser settings."
        : "Location unavailable on this device."
    );
  }, [authUser?.id, updateLiveLocationOnce, visibleCurrentShift]);

  const timesheetRangeBounds = useMemo(() => {
    const todayKey = calendarDateKeyInTimeZone(new Date(), companyTimeZone);
    const anchor = timesheetDateKey || todayKey;
    if (timesheetViewMode === "week") {
      const start = anchor ? mondayStartOfWallWeekContaining(anchor, companyTimeZone) : "";
      const end = start ? addWallDaysInTimeZone(start, 6, companyTimeZone) : "";
      return { from: start, to: end || start };
    }
    if (timesheetViewMode === "range") {
      return { from: timesheetDateFrom || "", to: timesheetDateTo || "" };
    }
    return { from: anchor || "", to: anchor || "" };
  }, [timesheetViewMode, timesheetDateKey, timesheetDateFrom, timesheetDateTo, companyTimeZone]);

  const visibleTimesheetRecords = useMemo(() => {
    const rows = Array.isArray(visibleRecords) ? visibleRecords : [];
    const from = timesheetRangeBounds.from;
    const to = timesheetRangeBounds.to;
    if (!from || !to || from > to) return [];
    return rows.filter((record) => {
      const key = calendarDateKeyInTimeZone(record?.clockIn, companyTimeZone);
      return key && key >= from && key <= to;
    });
  }, [visibleRecords, timesheetRangeBounds.from, timesheetRangeBounds.to, companyTimeZone]);

  const reportsDistinctCostCentres = useMemo(() => {
    const s = new Set();
    for (const r of reportsScreenRows) {
      s.add(reportsCostCentreKeyFromRow(r));
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [reportsScreenRows]);

  const reportsRowsFilteredForUi = useMemo(() => {
    return reportsScreenRows;
  }, [reportsScreenRows]);

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
    const vs = clockMediaContext;
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
  }, [authUser, userCompany, resolvedCompanyRole, clockMediaContext, profileFullName]);

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
    // Keep manual Clock selections valid without auto-selecting a job for the user.
    if (!clockSelectableProjects || clockSelectableProjects.length === 0) {
      if (projectId !== "") setProjectId("");
      if (costCenter !== "") setCostCenter("");
      return;
    }
    const hasProject = clockSelectableProjects.some((p) => String(p.id) === String(projectId));
    if (projectId && !hasProject) {
      setProjectId("");
      if (costCenter !== "") setCostCenter("");
      return;
    }
    if (!projectId) {
      if (costCenter !== "") setCostCenter("");
      return;
    }
    const pid = projectId;
    const centres = clockCostCentreOptionsForProject(pid);
    if (!centres.includes(costCenter)) setCostCenter("");
  }, [clockSelectableProjects, clockCostCentreOptionsForProject, projectId, costCenter]);

  useEffect(() => {
    safeWrite("orp_current_shift", currentShift);
  }, [currentShift]);

  useEffect(() => {
    safeWrite("orp_timesheet_records", records);
  }, [records]);

  useEffect(() => {
    safeWrite("orp_project_photos", projectPhotos);
  }, [projectPhotos]);

  useEffect(() => {
    safeWrite("orp_project_receipts", projectReceipts);
  }, [projectReceipts]);

  useEffect(() => {
    safeWrite("orp_photo_notification_count", photoNotificationCount);
  }, [photoNotificationCount]);

  useEffect(() => {
    safeWrite("orp_clock_project_lists", clockProjectLists);
  }, [clockProjectLists]);

  useEffect(() => {
    if (!authUser?.id) {
      setClockLocationEnabled(false);
      setClockLocationPermissionState("unknown");
      return;
    }
    let cancelled = false;
    const storedEnabled = Boolean(safeRead(clockLocationStorageKey(authUser.id), false));
    setClockLocationEnabled(storedEnabled);
    (async () => {
      const state = await readGeolocationPermissionState();
      if (cancelled) return;
      setClockLocationPermissionState(state);
      if (state === "granted") {
        setClockLocationEnabled(true);
        safeWrite(clockLocationStorageKey(authUser.id), true);
      } else if (state === "denied") {
        setClockLocationEnabled(false);
        safeWrite(clockLocationStorageKey(authUser.id), false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser?.id]);

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
    setMenuPanel("main");
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
    if (!newProjectId) {
      setProjectId("");
      setCostCenter("");
      return;
    }
    const nextProject =
      clockSelectableProjects.find((project) => String(project.id) === String(newProjectId));
    if (!nextProject) return;
    setProjectId(nextProject.id);
    setCostCenter("");
  };

  const openProjectManagementFromClock = useCallback(
    (mode = "project") => {
      setClockSelectedScheduledTaskId("");
      if (!isAdmin) {
        setLocationStatus(
          mode === "costCentre"
            ? "Ask a supervisor to add the cost centre."
            : "Ask a supervisor to add the project."
        );
        setTimeout(() => setLocationStatus(""), 5000);
        return;
      }
      setProjectsEditSuccess("");
      setProjectsAddSuccess("");
      setProjectsAddError("");
      setProjectEditError("");
      setAssignmentsSuccess("");
      setAssignmentsEditorError("");
      setProjectsListFilter("active");
      setMenuPanel("settings");
      setIsMenuOpen(false);
      if (mode === "project") {
        setEditingProjectId(null);
        setProjectEditDraft(null);
        setAssignmentsManageProjectId(null);
        setProjectsAddFormOpen(true);
      }
      setActiveTab("projects");
    },
    [isAdmin]
  );

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
      showClockSetupRequired();
      return;
    }

    const allActiveOnProject =
      effectiveCostCentresByProjectId[String(clockSelectedProject.id)] ||
      effectiveCostCentresByProjectId[Number(clockSelectedProject.id)] ||
      [];
    const clockInCentres = clockCostCentreOptionsForProject(clockSelectedProject.id);
    if (clockInCentres.length === 0 || !costCenter || !clockInCentres.includes(costCenter)) {
      if (!costCenter) {
        showClockSetupRequired();
        return;
      }
      if (!isAdmin && allActiveOnProject.length > 0) {
        setLocationStatus(
          "No cost centres assigned for this project. Please contact your supervisor."
        );
      } else {
        setLocationStatus("No cost centres available for this project.");
      }
      return;
    }

    if (clockLocationEnabled || clockLocationPermissionState === "granted") {
      setLocationStatus("Getting location...");
    }
    const locResult = await getClockActionLocation();
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
        setLocationStatus("");
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
    setLocationStatus("");
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
    setProjectId(visibleCurrentShift.projectId != null ? String(visibleCurrentShift.projectId) : "");
    setCostCenter(visibleCurrentShift.costCenter || "");
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

const handlePhotoQuickUpload = async (event) => {
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
    const uploadedStatus = "Photo uploaded ✅";
    setPhotoStatus(uploadedStatus);
    void schedulePhotoNotificationAfterUpload();
    schedulePhotoStatusClear(uploadedStatus, 3000, { clearUploadProgress: true });

    event.target.value = "";
  } catch (err) {
    console.log("Photo upload failed:", err);
    showErrorPopup("Photo upload failed", err);
    setPhotoStatus("Photo upload failed.");
    setUploadProgress(null);
    event.target.value = "";
  }
};

  const revokePhotoDraftPreview = useCallback((draft) => {
    const url = String(draft?.previewUrl || "");
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
  }, []);

  const stopVideoRecording = useCallback(() => {
    if (videoRecordIntervalRef.current) {
      clearInterval(videoRecordIntervalRef.current);
      videoRecordIntervalRef.current = null;
    }
    if (videoRecordStopTimerRef.current) {
      clearTimeout(videoRecordStopTimerRef.current);
      videoRecordStopTimerRef.current = null;
    }
    const recorder = videoRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch (err) {
        console.warn("Video recording stop failed:", err);
      }
    } else {
      setVideoRecording(false);
      setVideoRecordSeconds(0);
    }
  }, []);

  const stopPhotoCamera = useCallback(() => {
    stopVideoRecording();
    const stream = photoCameraStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks?.() || []) track.stop();
    }
    photoCameraStreamRef.current = null;
    if (photoVideoRef.current) photoVideoRef.current.srcObject = null;
    setPhotoCameraOpen(false);
    setPhotoCameraMode("photo");
  }, [stopVideoRecording]);

  const applyMinimumPhotoCameraZoom = useCallback(async (stream) => {
    const track = stream?.getVideoTracks?.()?.[0];
    if (!track?.getCapabilities || !track?.applyConstraints) return;

    try {
      const capabilities = track.getCapabilities() || {};
      const zoom = capabilities.zoom;
      const minZoom = typeof zoom?.min === "number" ? zoom.min : null;
      if (minZoom == null || !Number.isFinite(minZoom)) return;

      await track.applyConstraints({ advanced: [{ zoom: minZoom }] });
    } catch (err) {
      console.warn("Minimum camera zoom unavailable:", err);
    }
  }, []);

  const scrollClockMediaIntoView = useCallback((target = "tools") => {
    const scroll = () => {
      const node = target === "upload" ? photoUploadActionsRef.current : photoToolsRef.current;
      (node || photoToolsRef.current)?.scrollIntoView?.({ behavior: "smooth", block: "end" });
    };
    setTimeout(scroll, 120);
    if (target === "upload") setTimeout(scroll, 420);
  }, []);

  useEffect(() => {
    photoDraftsRef.current = photoDrafts;
  }, [photoDrafts]);

  useEffect(() => {
    if (activeTab === "clock" && photoDrafts.length > 0) scrollClockMediaIntoView("upload");
  }, [activeTab, photoDrafts.length, scrollClockMediaIntoView]);

  useEffect(() => {
    if (activeTab === "clock" && photoCameraOpen) scrollClockMediaIntoView("upload");
  }, [activeTab, photoCameraOpen, photoCameraMode, scrollClockMediaIntoView]);

  useEffect(() => {
    return () => {
      for (const draft of photoDraftsRef.current || []) revokePhotoDraftPreview(draft);
      stopPhotoCamera();
    };
  }, [revokePhotoDraftPreview, stopPhotoCamera]);

  useEffect(() => {
    const hasMediaTarget = Boolean(clockMediaContext);
    if (photoCameraOpen && (activeTab !== "clock" || !hasMediaTarget)) stopPhotoCamera();
  }, [activeTab, clockMediaContext, photoCameraOpen, stopPhotoCamera]);

  useEffect(() => {
    if (!photoCameraOpen || !photoVideoRef.current || !photoCameraStreamRef.current) return;
    const video = photoVideoRef.current;
    video.srcObject = photoCameraStreamRef.current;
    const playPromise = video.play?.();
    if (playPromise?.catch) playPromise.catch(() => {});
  }, [photoCameraOpen]);

  useEffect(() => {
    if (receiptEntryStep !== "amount") return;
    const id = setTimeout(() => {
      receiptAmountInputRef.current?.focus?.();
      receiptAmountInputRef.current?.select?.();
    }, 80);
    return () => clearTimeout(id);
  }, [receiptEntryStep]);

  useEffect(() => {
    if (receiptEntryStep !== "category") return;
    const id = setTimeout(() => {
      receiptCategoryInputRef.current?.focus?.();
      receiptCategoryInputRef.current?.select?.();
    }, 80);
    return () => clearTimeout(id);
  }, [receiptEntryStep]);

  const addPhotoDraftFiles = useCallback(
    (files, source = "gallery") => {
      const incoming = Array.from(files || []).filter((file) => file?.type?.startsWith("image/"));
      if (incoming.length === 0) {
        setPhotoStatus("Select at least one image.");
        return;
      }

      const nowMs = Date.now();
      const drafts = incoming.map((file, index) => ({
        id: `${nowMs}-${index}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        name: file.name || `photo-${nowMs}-${index + 1}.jpg`,
        source,
      }));

      setPhotoDrafts((previous) => [...previous, ...drafts]);
      setPhotoStatus(`${drafts.length} photo${drafts.length === 1 ? "" : "s"} ready. Review, then upload all.`);
      setPhotoBatchProgress(null);
      setUploadProgress(null);
    },
    []
  );

  const handlePhotoCapture = useCallback(
    (event) => {
      addPhotoDraftFiles(event.target.files, "gallery");
      event.target.value = "";
    },
    [addPhotoDraftFiles]
  );

  const removePhotoDraft = useCallback(
    (draftId) => {
      if (photoBatchUploading) return;
      setPhotoDrafts((previous) => {
        const target = previous.find((draft) => draft.id === draftId);
        if (target) revokePhotoDraftPreview(target);
        return previous.filter((draft) => draft.id !== draftId);
      });
    },
    [photoBatchUploading, revokePhotoDraftPreview]
  );

  const clearPhotoDrafts = useCallback(() => {
    if (photoBatchUploading) return;
    setPhotoDrafts((previous) => {
      for (const draft of previous || []) revokePhotoDraftPreview(draft);
      return [];
    });
    setPhotoBatchProgress(null);
    setUploadProgress(null);
    setPhotoStatus("Photo selection cleared.");
  }, [photoBatchUploading, revokePhotoDraftPreview]);

  const startPhotoCamera = useCallback(async (options = {}) => {
    const allowFallbackCameraInput = options?.allowFallback !== false;
    const nextMode = options?.mode === "receipt" ? "receipt" : "photo";
    const readyMessage =
      typeof options?.readyMessage === "string" && options.readyMessage.trim()
        ? options.readyMessage.trim()
        : nextMode === "receipt"
          ? "Receipt camera ready. Capture receipt."
          : "Camera ready. Capture photos, then upload all.";
    if (!authUser) {
      setPhotoStatus("Sign in before using the camera.");
      return false;
    }
    if (!clockMediaContext) {
      showClockSetupRequired();
      return false;
    }
    if (photoBatchUploading) return false;
    if (!navigator.mediaDevices?.getUserMedia) {
      const message = allowFallbackCameraInput
        ? "Camera stream is not supported here."
        : "In-app camera is not supported here. Use a supported browser to capture a photo before clock out.";
      setPhotoCameraError(message);
      setPhotoStatus(message);
      if (allowFallbackCameraInput) photoFallbackCameraInputRef.current?.click();
      return false;
    }

    try {
      setPhotoCameraError("");
      stopPhotoCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      await applyMinimumPhotoCameraZoom(stream);
      photoCameraStreamRef.current = stream;
      setPhotoCameraMode(nextMode);
      setPhotoCameraOpen(true);
      setPhotoStatus(readyMessage);
      scrollClockMediaIntoView("upload");
      return true;
    } catch (err) {
      console.warn("Camera start failed:", err);
      setPhotoCameraError("Camera permission denied.");
      setPhotoStatus("Camera permission denied.");
      return false;
    }
  }, [
    applyMinimumPhotoCameraZoom,
    authUser,
    clockMediaContext,
    photoBatchUploading,
    scrollClockMediaIntoView,
    showClockSetupRequired,
    stopPhotoCamera,
  ]);

  const openMaterialPaymentFlow = useCallback(() => {
    if (!clockMediaContext) {
      showClockSetupRequired();
      return;
    }
    clearMaterialPaymentTimers();
    setMaterialSupplierDraft("");
    setMaterialAmountDraft("");
    setMaterialPaymentCountdown(10);
    setMaterialPaymentStep("form");
    setMaterialPaymentOpen(true);
  }, [clearMaterialPaymentTimers, clockMediaContext, showClockSetupRequired]);

  const cancelMaterialPaymentFlow = useCallback(() => {
    clearMaterialPaymentTimers();
    const pending = materialPaymentPendingRef.current;
    if (pending?.id && pending?.folderName) {
      setProjectReceipts((previous) => {
        const folderRows = previous[pending.folderName] || [];
        return {
          ...previous,
          [pending.folderName]: folderRows.map((receipt) =>
            String(receipt.id) === String(pending.id)
              ? { ...receipt, status: "Receipt Missing", receiptStatus: "Receipt Missing" }
              : receipt
          ),
        };
      });
      materialPaymentPendingRef.current = null;
    }
    setMaterialPaymentOpen(false);
    setMaterialPaymentStep("form");
    setMaterialPaymentCountdown(10);
  }, [clearMaterialPaymentTimers]);

  const markPendingMaterialReceiptStatus = useCallback((status) => {
    const pending = materialPaymentPendingRef.current;
    if (!pending?.id || !pending?.folderName) return;
    setProjectReceipts((previous) => {
      const folderRows = previous[pending.folderName] || [];
      return {
        ...previous,
        [pending.folderName]: folderRows.map((receipt) =>
          String(receipt.id) === String(pending.id)
            ? { ...receipt, status, receiptStatus: status }
            : receipt
        ),
      };
    });
  }, []);

  const startMaterialPaymentCountdown = useCallback(
    (event) => {
      event?.preventDefault?.();
      const mediaContext = clockMediaContext;
      if (!mediaContext) {
        showClockSetupRequired();
        return;
      }
      const supplier = String(materialSupplierDraft || "").trim();
      const amountText = String(materialAmountDraft || "").trim();
      const amount = Number(amountText);
      if (!supplier) {
        setPhotoStatus("Enter supplier or store name.");
        return;
      }
      if (!amountText || !Number.isFinite(amount) || amount <= 0) {
        setPhotoStatus("Enter estimated amount.");
        return;
      }

      clearMaterialPaymentTimers();
      const folderName = getProjectFolderName(mediaContext.project);
      const startedAt = new Date().toISOString();
      const pendingReceipt = {
        id: `material-${Date.now()}`,
        companyId: userCompany?.id || null,
        userId: authUser?.id || null,
        project: mediaContext.project,
        projectId: mediaContext.projectId ?? null,
        folderName,
        costCenter: mediaContext.costCenter,
        employee: mediaContext.employee,
        employeeId: mediaContext.employeeId ?? authUser?.id,
        amount,
        category: supplier,
        supplier,
        capturedAt: startedAt,
        paymentFlowStartedAt: startedAt,
        payment_flow_started_at: startedAt,
        receiptUploadedAt: null,
        receipt_uploaded_at: null,
        status: "Pending Receipt",
        receiptStatus: "Pending Receipt",
        dataUrl: "",
        type: "receipt",
        isMaterialPayment: true,
      };
      materialPaymentPendingRef.current = pendingReceipt;
      setProjectReceipts((previous) => ({
        ...previous,
        [folderName]: [pendingReceipt, ...(previous[folderName] || [])],
      }));
      setMaterialPaymentCountdown(10);
      setMaterialPaymentStep("countdown");
      const payStatus = "Please complete payment using Apple Wallet / Google Wallet, then return here.";
      setPhotoStatus(payStatus);
      schedulePhotoStatusClear(payStatus, 5000);

      materialPaymentCountdownTimerRef.current = setInterval(() => {
        setMaterialPaymentCountdown((seconds) => Math.max(0, seconds - 1));
      }, 1000);
      materialPaymentOpenReceiptTimerRef.current = setTimeout(() => {
        clearMaterialPaymentTimers();
        setMaterialPaymentCountdown(0);
        setMaterialPaymentOpen(false);
        setMaterialPaymentStep("form");
        void startPhotoCamera({
          allowFallback: false,
          mode: "receipt",
          readyMessage: "Receipt camera ready. Capture receipt.",
        });
      }, 10000);
    },
    [
      authUser?.id,
      clearMaterialPaymentTimers,
      clockMediaContext,
      materialAmountDraft,
      materialSupplierDraft,
      schedulePhotoStatusClear,
      showClockSetupRequired,
      startPhotoCamera,
      userCompany?.id,
    ]
  );

  const captureCameraFrameFile = useCallback((namePrefix = "camera-photo") => {
    return new Promise((resolve, reject) => {
      const video = photoVideoRef.current;
      const canvas = photoCanvasRef.current;
      if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
        reject(new Error("Camera is still starting. Try again in a moment."));
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Could not capture image. Try again."));
            return;
          }
          resolve(new File([blob], `${namePrefix}-${Date.now()}.jpg`, { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.92
      );
    });
  }, []);

  const capturePhotoFromCamera = useCallback(async () => {
    let file = null;
    try {
      file = await captureCameraFrameFile("camera-photo");
    } catch (err) {
      setPhotoStatus(getErrorMessage(err));
      return;
    }
    addPhotoDraftFiles([file], "camera");
    setPhotoStatus("");
    scrollClockMediaIntoView("upload");
  }, [addPhotoDraftFiles, captureCameraFrameFile, scrollClockMediaIntoView]);

  const uploadProjectPhotoFile = useCallback(
    async (file, index = 1, total = 1) => {
      const mediaContext = clockMediaContext;
      if (!file || !mediaContext || !authUser) {
        throw new Error("Select project and cost center before uploading photos.");
      }

      const folderName = getProjectFolderName(mediaContext.project || "");
      const progressBase = total > 1 ? Math.round(((index - 1) / total) * 100) : 10;
      const progressUpload = total > 1 ? Math.round(((index - 0.65) / total) * 100) : 30;
      const progressCap = total > 1 ? Math.max(progressUpload, Math.round(((index - 0.1) / total) * 100)) : 95;

      setPhotoBatchProgress({ current: index, total, label: `Uploading photo ${index} of ${total}` });
      setPhotoStatus(`Compressing photo ${index} of ${total}...`);
      setUploadProgress(progressBase);

      const compressedFile = await compressImage(file, 700, 0.45);
      setPhotoStatus(`Uploading photo ${index} of ${total}... ${Math.round(compressedFile.size / 1024)} KB`);
      setUploadProgress(progressUpload);

      const filePath = `${folderName}/${authUser.id}-${Date.now()}-${index}.jpg`;
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

      let progressTimer = null;
      try {
        progressTimer = setInterval(() => {
          setUploadProgress((prev) => {
            const current = typeof prev === "number" ? prev : progressUpload;
            return Math.min(progressCap, current + 3);
          });
        }, 2000);

        const result = await Promise.race([uploadPromise, timeoutPromise]);
        if (result?.error) throw result.error;
      } finally {
        if (progressTimer) clearInterval(progressTimer);
      }

      const { data } = supabase.storage.from("project-photos").getPublicUrl(filePath);
      const photoUrl = data?.publicUrl || "";
      const capturedAt = new Date().toISOString();
      const photo = {
        id: Date.now() + index,
        companyId: userCompany?.id || null,
        userId: authUser.id,
        project: mediaContext.project,
        projectId: mediaContext.projectId ?? null,
        folderName,
        costCenter: mediaContext.costCenter,
        employee: mediaContext.employee,
        employeeId: mediaContext.employeeId ?? authUser.id,
        capturedAt,
        location: null,
        dataUrl: "",
        imageUrl: photoUrl,
        storagePath: filePath,
        type: "photo",
      };

      setProjectPhotos((previous) => ({
        ...previous,
        [folderName]: [photo, ...(previous[folderName] || [])],
      }));
      setPhotoNotificationCount((count) => count + 1);
      if (visibleCurrentShift) {
        setCurrentShift((previousShift) =>
          previousShift
            ? {
                ...previousShift,
                photosTaken: (previousShift.photosTaken || 0) + 1,
                lastPhotoAt: capturedAt,
              }
            : previousShift
        );
      }
      void schedulePhotoNotificationAfterUpload();
      setUploadProgress(total > 1 ? Math.round((index / total) * 100) : 100);
      return photo;
    },
    [authUser, clockMediaContext, schedulePhotoNotificationAfterUpload, userCompany?.id, visibleCurrentShift]
  );

  const uploadAllPhotoDrafts = useCallback(async () => {
    const queued = [...(photoDraftsRef.current || [])];
    if (queued.length === 0) {
      setPhotoStatus("Select or capture photos before uploading.");
      return;
    }
    if (!clockMediaContext || !authUser) {
      showClockSetupRequired();
      return;
    }

    setPhotoBatchUploading(true);
    setPhotoBatchProgress({ current: 0, total: queued.length, label: `Preparing ${queued.length} photos` });
    setUploadProgress(0);
    const uploadedDraftIds = [];

    try {
      for (let i = 0; i < queued.length; i += 1) {
        const draft = queued[i];
        await uploadProjectPhotoFile(draft.file, i + 1, queued.length);
        uploadedDraftIds.push(draft.id);
      }

      setPhotoDrafts((previous) => {
        const uploaded = new Set(uploadedDraftIds);
        for (const draft of previous || []) {
          if (uploaded.has(draft.id)) revokePhotoDraftPreview(draft);
        }
        return previous.filter((draft) => !uploaded.has(draft.id));
      });
      setPhotoBatchProgress({ current: queued.length, total: queued.length, label: "Completed" });
      const uploadedStatus = `Uploaded ${queued.length} photo${queued.length === 1 ? "" : "s"}.`;
      setPhotoStatus(uploadedStatus);
      setUploadProgress(100);
      stopPhotoCamera();
      schedulePhotoStatusClear(uploadedStatus, 3000, {
        clearUploadProgress: true,
        clearBatchProgress: true,
      });
    } catch (err) {
      console.log("Batch photo upload failed:", err);
      const failedIndex = Math.min(uploadedDraftIds.length + 1, queued.length);
      setPhotoStatus(`Photo ${failedIndex} of ${queued.length} failed: ${getErrorMessage(err)}`);
      setPhotoBatchProgress({ current: failedIndex, total: queued.length, label: `Photo ${failedIndex} failed` });
      setUploadProgress(null);
      setPhotoDrafts((previous) => {
        const uploaded = new Set(uploadedDraftIds);
        for (const draft of previous || []) {
          if (uploaded.has(draft.id)) revokePhotoDraftPreview(draft);
        }
        return previous.filter((draft) => !uploaded.has(draft.id));
      });
      showErrorPopup("Photo upload failed", err);
    } finally {
      setPhotoBatchUploading(false);
    }
  }, [
    authUser,
    clockMediaContext,
    revokePhotoDraftPreview,
    schedulePhotoStatusClear,
    showClockSetupRequired,
    stopPhotoCamera,
    uploadProjectPhotoFile,
  ]);

  const revokeVideoDraftPreview = useCallback((draft) => {
    const url = String(draft?.previewUrl || "");
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
  }, []);

  const clearVideoDraft = useCallback(() => {
    if (videoUploading) return;
    setVideoDraft((previous) => {
      if (previous) revokeVideoDraftPreview(previous);
      return null;
    });
    setVideoUploadProgress(null);
    setVideoStatus("");
  }, [revokeVideoDraftPreview, videoUploading]);

  useEffect(() => {
    videoDraftRef.current = videoDraft;
  }, [videoDraft]);

  useEffect(() => {
    return () => {
      if (videoDraftRef.current) revokeVideoDraftPreview(videoDraftRef.current);
    };
  }, [revokeVideoDraftPreview]);

  const readVideoDurationSeconds = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const metadataUrl = URL.createObjectURL(file);
      const video = document.createElement("video");
      const cleanup = () => {
        video.removeAttribute("src");
        video.load?.();
        URL.revokeObjectURL(metadataUrl);
      };

      video.preload = "metadata";
      video.onloadedmetadata = () => {
        const duration = Number(video.duration);
        cleanup();
        if (Number.isFinite(duration) && duration > 0) resolve(duration);
        else reject(new Error("Could not read video duration."));
      };
      video.onerror = () => {
        cleanup();
        reject(new Error("Could not read video duration."));
      };
      video.src = metadataUrl;
    });
  }, []);

  const formatVideoDuration = useCallback((seconds) => {
    const raw = Number(seconds);
    if (!Number.isFinite(raw) || raw <= 0) return "";
    const total = Math.round(raw);
    const mm = Math.floor(total / 60);
    const ss = String(total % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }, []);

  const videoFileExtension = useCallback((file) => {
    const byName = String(file?.name || "").split(".").pop()?.toLowerCase() || "";
    if (/^[a-z0-9]{2,5}$/.test(byName)) return byName === "mov" ? "mov" : byName;
    const type = String(file?.type || "").toLowerCase();
    if (type.includes("quicktime")) return "mov";
    if (type.includes("webm")) return "webm";
    return "mp4";
  }, []);

  const prepareVideoDraftFromFile = useCallback(
    async (file, source = "gallery", knownDurationSeconds = null) => {
      if (!file) return false;
      if (!clockMediaContext || !authUser) {
        setVideoStatus("Select project and cost center before recording video.");
        return false;
      }
      if (!file.type?.startsWith("video/")) {
        setVideoStatus("Select a video file.");
        return false;
      }

      setVideoStatus("Checking video length...");
      setVideoUploadProgress(null);

      try {
        const knownDuration = Number(knownDurationSeconds);
        const duration =
          Number.isFinite(knownDuration) && knownDuration > 0
            ? knownDuration
            : await readVideoDurationSeconds(file);
        if (duration > 30.25) {
          setVideoStatus("Video must be 30 seconds or less.");
          return false;
        }

        const previewUrl = URL.createObjectURL(file);
        setVideoDraft((previous) => {
          if (previous) revokeVideoDraftPreview(previous);
          return {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            file,
            previewUrl,
            name: file.name || (source === "camera" ? "Recorded video" : "Selected video"),
            durationSeconds: duration,
            source,
          };
        });
        setVideoStatus("Video ready. Review, then upload.");
        return true;
      } catch (err) {
        console.warn("Video duration check failed:", err);
        setVideoStatus("Could not confirm video length. Please choose a video 30 seconds or less.");
        return false;
      }
    },
    [authUser, clockMediaContext, readVideoDurationSeconds, revokeVideoDraftPreview]
  );

  const handleMediaGallerySelection = useCallback(
    async (event) => {
      const files = Array.from(event.target.files || []);
      event.target.value = "";
      if (files.length === 0) return;

      const imageFiles = files.filter((file) => file?.type?.startsWith("image/"));
      const videoFiles = files.filter((file) => file?.type?.startsWith("video/"));

      if (imageFiles.length > 0) addPhotoDraftFiles(imageFiles, "gallery");
      if (videoFiles.length > 0) {
        if (videoFiles.length > 1) setVideoStatus("Only one video can be prepared at a time. Using the first video.");
        await prepareVideoDraftFromFile(videoFiles[0], "gallery");
      }
      if (imageFiles.length === 0 && videoFiles.length === 0) {
        setPhotoStatus("Select photos or a video.");
      }
    },
    [addPhotoDraftFiles, prepareVideoDraftFromFile]
  );

  const preferredVideoRecordingMimeType = useCallback(() => {
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
    const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }, []);

  const startVideoRecording = useCallback(() => {
    const stream = photoCameraStreamRef.current;
    if (!stream) {
      setVideoStatus("Open the camera before recording video.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setVideoStatus("Video recording is not supported on this device/browser.");
      return;
    }
    if (videoUploading || videoRecording) return;

    try {
      videoRecordChunksRef.current = [];
      const mimeType = preferredVideoRecordingMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      videoRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) videoRecordChunksRef.current.push(event.data);
      };
      recorder.onerror = (event) => {
        console.warn("Video recording error:", event?.error || event);
        setVideoStatus("Video recording failed.");
        setVideoRecording(false);
      };
      recorder.onstop = async () => {
        const recordedSeconds = Math.min(
          30,
          Math.max(1, (Date.now() - Number(videoRecordStartedAtRef.current || Date.now())) / 1000)
        );
        if (videoRecordIntervalRef.current) {
          clearInterval(videoRecordIntervalRef.current);
          videoRecordIntervalRef.current = null;
        }
        if (videoRecordStopTimerRef.current) {
          clearTimeout(videoRecordStopTimerRef.current);
          videoRecordStopTimerRef.current = null;
        }
        setVideoRecording(false);
        setVideoRecordSeconds(0);
        videoRecorderRef.current = null;

        const chunks = videoRecordChunksRef.current || [];
        videoRecordChunksRef.current = [];
        if (chunks.length === 0) {
          setVideoStatus("No video was recorded. Try again.");
          return;
        }

        const type = recorder.mimeType || chunks[0]?.type || "video/webm";
        const blob = new Blob(chunks, { type });
        const ext = type.includes("mp4") ? "mp4" : "webm";
        const file = new File([blob], `camera-video-${Date.now()}.${ext}`, { type });
        await prepareVideoDraftFromFile(file, "camera", recordedSeconds);
      };

      recorder.start(1000);
      videoRecordStartedAtRef.current = Date.now();
      setVideoRecording(true);
      setVideoRecordSeconds(0);
      setVideoStatus("Recording video... 30 seconds maximum.");
      videoRecordIntervalRef.current = setInterval(() => {
        setVideoRecordSeconds((seconds) => Math.min(30, seconds + 1));
      }, 1000);
      videoRecordStopTimerRef.current = setTimeout(() => {
        stopVideoRecording();
      }, 30000);
    } catch (err) {
      console.warn("Video recording start failed:", err);
      setVideoRecording(false);
      setVideoStatus("Video recording is not supported on this device/browser.");
    }
  }, [
    preferredVideoRecordingMimeType,
    prepareVideoDraftFromFile,
    stopVideoRecording,
    videoRecording,
    videoUploading,
  ]);

  const uploadSelectedVideo = useCallback(async () => {
    const draft = videoDraftRef.current;
    if (!draft?.file) {
      setVideoStatus("Select or record a video before uploading.");
      return;
    }
    const mediaContext = clockMediaContext;
    if (!mediaContext || !authUser) {
      setVideoStatus("Select project and cost center before uploading video.");
      return;
    }
    if (videoUploading) return;

    setVideoUploading(true);
    setVideoStatus("Uploading video...");
    setVideoUploadProgress(10);

    const folderName = getProjectFolderName(mediaContext.project || "");
    const ext = videoFileExtension(draft.file);
    const filePath = `${folderName}/videos/${authUser.id}-${Date.now()}.${ext}`;
    const uploadPromise = supabase.storage
      .from("project-photos")
      .upload(filePath, draft.file, {
        cacheControl: "3600",
        upsert: false,
        contentType: draft.file.type || "video/mp4",
      });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Video upload timed out after 120 seconds")), 120000)
    );

    let progressTimer = null;
    try {
      progressTimer = setInterval(() => {
        setVideoUploadProgress((prev) => {
          const current = typeof prev === "number" ? prev : 20;
          return Math.min(95, current + 4);
        });
      }, 2000);

      const result = await Promise.race([uploadPromise, timeoutPromise]);
      if (result?.error) throw result.error;

      const { data } = supabase.storage.from("project-photos").getPublicUrl(filePath);
      const videoUrl = data?.publicUrl || "";
      const capturedAt = new Date().toISOString();
      const media = {
        id: Date.now(),
        company_id: userCompany?.id || null,
        companyId: userCompany?.id || null,
        user_id: authUser.id,
        userId: authUser.id,
        project: mediaContext.project,
        project_id: mediaContext.projectId ?? null,
        projectId: mediaContext.projectId ?? null,
        folderName,
        cost_centre: mediaContext.costCenter,
        costCenter: mediaContext.costCenter,
        employee: mediaContext.employee,
        employeeId: mediaContext.employeeId ?? authUser.id,
        capturedAt,
        timestamp: capturedAt,
        location: null,
        dataUrl: "",
        imageUrl: videoUrl,
        videoUrl,
        storagePath: filePath,
        media_type: "video",
        mediaType: "video",
        type: "video",
        duration_seconds: draft.durationSeconds,
        durationSeconds: draft.durationSeconds,
        fileName: draft.name,
      };

      setProjectPhotos((previous) => ({
        ...previous,
        [folderName]: [media, ...(previous[folderName] || [])],
      }));
      setVideoUploadProgress(100);
      setVideoStatus("Video upload complete.");
      setVideoDraft((previous) => {
        if (previous) revokeVideoDraftPreview(previous);
        return null;
      });
      stopPhotoCamera();
      setTimeout(() => {
        setVideoUploadProgress(null);
        setVideoStatus("");
      }, 5000);
    } catch (err) {
      console.log("Video upload failed:", err);
      setVideoStatus("Video upload failed.");
      setVideoUploadProgress(null);
      showErrorPopup("Video upload failed", err);
    } finally {
      if (progressTimer) clearInterval(progressTimer);
      setVideoUploading(false);
    }
  }, [
    authUser,
    clockMediaContext,
    revokeVideoDraftPreview,
    stopPhotoCamera,
    userCompany?.id,
    videoFileExtension,
    videoUploading,
  ]);

  const saveReceiptFile = async (file, details = {}) => {
    const mediaContext = clockMediaContext;
    if (!file || !mediaContext) {
      showClockSetupRequired();
      return false;
    }
    const amount = Number(details.amount || 0);
    const category = String(details.category || "").trim() || "Other";
    const materialPayment = details.materialPayment || null;
    const supplier = String(details.supplier || materialPayment?.supplier || "").trim();
    try {
      setPhotoStatus("Saving receipt...");
      const receiptFile = await compressImage(file, 1000, 0.65);
      const receiptDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error("Receipt photo could not be read."));
        reader.readAsDataURL(receiptFile);
      });

      const folderName = getProjectFolderName(mediaContext.project);
      const capturedAt = new Date().toISOString();
      const receipt = {
        id: materialPayment?.id || Date.now(),
        companyId: userCompany?.id || null,
        userId: authUser?.id || null,
        project: mediaContext.project,
        projectId: mediaContext.projectId ?? null,
        folderName,
        costCenter: mediaContext.costCenter,
        employee: mediaContext.employee,
        employeeId: mediaContext.employeeId ?? authUser?.id,
        amount: Number.isFinite(amount) ? amount : 0,
        category,
        supplier,
        capturedAt,
        paymentFlowStartedAt: materialPayment?.paymentFlowStartedAt || materialPayment?.payment_flow_started_at || null,
        payment_flow_started_at: materialPayment?.payment_flow_started_at || materialPayment?.paymentFlowStartedAt || null,
        receiptUploadedAt: capturedAt,
        receipt_uploaded_at: capturedAt,
        status: "Receipt Uploaded",
        receiptStatus: "Receipt Uploaded",
        location: mediaContext.liveLocation || mediaContext.clockInLocation || null,
        dataUrl: receiptDataUrl,
        type: "receipt",
        isMaterialPayment: Boolean(materialPayment),
      };

      setProjectReceipts((previous) => {
        const existingRows = previous[folderName] || [];
        if (materialPayment?.id && existingRows.some((row) => String(row.id) === String(materialPayment.id))) {
          return {
            ...previous,
            [folderName]: existingRows.map((row) =>
              String(row.id) === String(materialPayment.id)
                ? { ...row, ...receipt }
                : row
            ),
          };
        }
        return {
          ...previous,
          [folderName]: [receipt, ...existingRows],
        };
      });
      if (materialPayment?.id) materialPaymentPendingRef.current = null;
      const savedStatus = `Receipt saved: ${formatMoney(receipt.amount)}`;
      setPhotoStatus(savedStatus);
      schedulePhotoStatusClear(savedStatus, 5000);
      if (authUser?.id && userCompany?.id) {
        const actorLabel = (profileFullName || "").trim() || authUser.email || "Someone";
        void createCompanyNotifications(supabase, {
          companyId: userCompany.id,
          actorUserId: authUser.id,
          actorRole: resolvedCompanyRole,
          type: "receipt_uploaded",
          title: "Receipt uploaded",
          message: `${actorLabel} uploaded a receipt for ${mediaContext.project} - ${mediaContext.costCenter}`,
          projectId: mediaContext.projectId,
          projectName: mediaContext.project,
          costCentre: mediaContext.costCenter,
          relatedTimesheetId: mediaContext.supabaseTimesheetId ?? null,
          relatedFolder: folderName,
          itemCount: null,
        });
      }
      return true;
    } catch (err) {
      console.warn("Receipt save failed:", err);
      setPhotoStatus("Receipt save failed.");
      showErrorPopup("Receipt save failed", err);
      return false;
    }
  };

  const openReceiptDetailsForm = (file) => {
    if (!file) return;
    const pendingPayment = materialPaymentPendingRef.current;
    setReceiptDraftFile(file);
    setReceiptAmountDraft(pendingPayment?.amount != null ? String(pendingPayment.amount) : "");
    setReceiptCategoryDraft(pendingPayment?.supplier || "");
    setReceiptEntryStep("amount");
    setPhotoStatus(pendingPayment ? "Confirm receipt amount." : "Enter receipt amount.");
  };

  const handleReceiptCapture = async (event) => {
    const file = event.target.files?.[0];
    try {
      openReceiptDetailsForm(file);
    } finally {
      event.target.value = "";
    }
  };

  const captureReceiptFromCamera = async () => {
    let file = null;
    try {
      file = await captureCameraFrameFile("receipt");
      openReceiptDetailsForm(file);
    } catch (err) {
      console.warn("Receipt capture failed:", err);
      setPhotoStatus(getErrorMessage(err));
    }
  };

  const cancelReceiptDetailsForm = () => {
    if (materialPaymentPendingRef.current?.id) {
      markPendingMaterialReceiptStatus("Receipt Missing");
      materialPaymentPendingRef.current = null;
    }
    setReceiptDraftFile(null);
    setReceiptEntryStep(null);
    setReceiptAmountDraft("");
    setReceiptCategoryDraft("");
    setReceiptSaving(false);
  };

  const submitReceiptAmount = (event) => {
    event.preventDefault();
    setReceiptEntryStep("category");
    setPhotoStatus("Enter receipt category.");
  };

  const submitReceiptCategory = async (event) => {
    event.preventDefault();
    if (!receiptDraftFile || receiptSaving) return;
    setReceiptSaving(true);
    const pendingPayment = materialPaymentPendingRef.current;
    const saved = await saveReceiptFile(receiptDraftFile, {
      amount: receiptAmountDraft,
      category: receiptCategoryDraft,
      supplier: pendingPayment?.supplier || receiptCategoryDraft,
      materialPayment: pendingPayment,
    });
    setReceiptSaving(false);
    if (saved) {
      cancelReceiptDetailsForm();
      stopPhotoCamera();
    }
  };

  const handleClockOut = async () => {
    if (!visibleCurrentShift) return;

    if (!visibleCurrentShift.photosTaken || visibleCurrentShift.photosTaken < 1) {
      setPhotoCameraError("");
      setPhotoStatus("Capture photo before clock out");
      if (!photoCameraOpen) {
        await startPhotoCamera({
          allowFallback: false,
          readyMessage: "Capture photo before clock out",
        });
      }
      setTimeout(() => {
        photoToolsRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      }, 80);
      return;
    }

    if (watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }

    if (clockLocationEnabled || clockLocationPermissionState === "granted") {
      setLocationStatus("Getting location...");
    }
    const locResult = await getClockActionLocation();
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
    setLocationStatus("");
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

  const togglePhotoSelected = (folderName, itemId) => {
    const folder = String(folderName || "");
    const id = String(itemId || "");
    if (!folder || !id) return;
    setSelectedPhotoIdsByFolder((prev) => {
      const current = new Set(prev[folder] || []);
      if (current.has(id)) current.delete(id);
      else current.add(id);
      return { ...prev, [folder]: [...current] };
    });
  };

  const setAllProjectPhotosSelected = (folderName, selected) => {
    const folder = String(folderName || "");
    if (!folder) return;
    const ids = (scopedProjectPhotos[folder] || []).map((item, index) => mediaItemId(item, index));
    setSelectedPhotoIdsByFolder((prev) => ({ ...prev, [folder]: selected ? ids : [] }));
  };

  const openPhotoViewer = (folderName, index) => {
    const folder = String(folderName || "");
    const items = scopedProjectPhotos[folder] || [];
    if (!folder || !items.length) return;
    setPhotoViewer({ folder, index: Math.max(0, Math.min(Number(index) || 0, items.length - 1)) });
  };

  const movePhotoViewer = (delta) => {
    setPhotoViewer((prev) => {
      if (!prev?.folder) return prev;
      const items = scopedProjectPhotos[prev.folder] || [];
      if (!items.length) return null;
      const next = (Number(prev.index) || 0) + delta;
      if (next < 0) return { ...prev, index: items.length - 1 };
      if (next >= items.length) return { ...prev, index: 0 };
      return { ...prev, index: next };
    });
  };

  const getFolderShareLink = (folderName) => {
    const folder = String(folderName || "");
    const selectedIds = new Set((selectedPhotoIdsByFolder[folder] || []).map(String));
    const selectedItems = (scopedProjectPhotos[folder] || []).filter((item, index) =>
      selectedIds.has(mediaItemId(item, index))
    );
    if (!selectedItems.length) return "";
    const payload = {
      type: "project_photos",
      app: "OPERA.AI",
      folder,
      createdAt: new Date().toISOString(),
      items: selectedItems.map((item, index) => ({
        id: mediaItemId(item, index),
        project: item?.project || folder,
        costCenter: item?.costCenter || item?.cost_centre || "",
        employee: item?.employee || "",
        capturedAt: item?.capturedAt || item?.timestamp || "",
        mediaType: isVideoMediaItem(item) ? "video" : "photo",
        type: isVideoMediaItem(item) ? "video" : "photo",
        imageUrl: item?.imageUrl || item?.dataUrl || "",
        videoUrl: item?.videoUrl || "",
        dataUrl: item?.dataUrl || "",
        durationSeconds: item?.durationSeconds || item?.duration_seconds || null,
      })),
    };
    return `${window.location.origin}/?photoShare=${encodeSharePayload(payload)}`;
  };

  const shareProjectFolder = async (folderName) => {
    const folder = String(folderName || "");
    const selectedCount = (selectedPhotoIdsByFolder[folder] || []).length;
    if (!selectedCount) {
      setPhotoShareMessage("Select photos in this project before sharing.");
      setTimeout(() => setPhotoShareMessage(""), 5000);
      return;
    }
    const shareUrl = getFolderShareLink(folder);
    if (!shareUrl) return;
    const shareText = `${selectedCount} selected project ${selectedCount === 1 ? "photo" : "photos"} from ${folder}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "OPERA.AI Project Photos", text: shareText, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setPhotoShareMessage("Share link copied.");
        setTimeout(() => setPhotoShareMessage(""), 5000);
      }
    } catch (err) {
      console.warn("Photo share failed:", err);
      setPhotoShareMessage("Could not share. Link copied when browser allows clipboard access.");
      try {
        await navigator.clipboard.writeText(shareUrl);
      } catch {}
      setTimeout(() => setPhotoShareMessage(""), 6000);
    }
  };

  const openPhotosTab = () => {
    setActiveTab("photos");
    setPhotoNotificationCount(0);
    setMenuPanel("main");
    setIsMenuOpen(false);
  };

  const openMenuTab = (tabName) => {
    const employeeAllowedTabs = new Set(["clock", "timesheet", "photos", "receipts", "settings", "schedule", "notifications", "lists"]);
    if (isEmployeeRole && !employeeAllowedTabs.has(tabName)) {
      setMenuPanel("main");
      setIsMenuOpen(false);
      setActiveTab("schedule");
      return;
    }
    setActiveTab(tabName);
    if (tabName === "photos") setPhotoNotificationCount(0);
    setMenuPanel("main");
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

  const scheduleRestoreWindowScrollY = useCallback((targetScrollY, { keepPending = false } = {}) => {
    if (typeof window === "undefined" || !Number.isFinite(Number(targetScrollY))) return;
    const y = Math.max(0, Number(targetScrollY));
    const x = Number.isFinite(Number(window.scrollX)) ? Number(window.scrollX) : 0;
    const applyScroll = () => window.scrollTo({ top: y, left: x, behavior: "auto" });
    window.requestAnimationFrame?.(() => {
      applyScroll();
      window.requestAnimationFrame?.(applyScroll);
    });
    window.setTimeout?.(applyScroll, 80);
    window.setTimeout?.(applyScroll, 180);
    if (!keepPending) schedulePendingScrollRestoreYRef.current = null;
  }, []);

  const restoreScheduleEditReturnView = useCallback((returnViewRaw) => {
    const returnView = String(returnViewRaw || "").trim();
    const targetScrollY = scheduleEditReturnScrollYRef.current;
    scheduleEditReturnScrollYRef.current = null;
    setScheduleEditReturnViewMode("");
    if (!returnView || returnView === "list") {
      schedulePendingScrollRestoreYRef.current = null;
      schedulePendingScrollRestoreSawLoadingRef.current = false;
      return;
    }
    setScheduleViewMode(returnView);
    if (!Number.isFinite(Number(targetScrollY))) {
      schedulePendingScrollRestoreYRef.current = null;
      schedulePendingScrollRestoreSawLoadingRef.current = false;
      return;
    }
    schedulePendingScrollRestoreYRef.current = Number(targetScrollY);
    schedulePendingScrollRestoreSawLoadingRef.current = false;
    scheduleRestoreWindowScrollY(targetScrollY, { keepPending: true });
  }, [scheduleRestoreWindowScrollY]);

  useEffect(() => {
    if (activeTab !== "schedule") return;
    const y = schedulePendingScrollRestoreYRef.current;
    if (!Number.isFinite(Number(y))) return;
    if (scheduleLoading) {
      schedulePendingScrollRestoreSawLoadingRef.current = true;
      return;
    }
    if (schedulePendingScrollRestoreSawLoadingRef.current) {
      scheduleRestoreWindowScrollY(y);
      schedulePendingScrollRestoreSawLoadingRef.current = false;
      return;
    }
    scheduleRestoreWindowScrollY(y, { keepPending: true });
    window.setTimeout?.(() => {
      const pendingY = schedulePendingScrollRestoreYRef.current;
      if (!Number.isFinite(Number(pendingY)) || schedulePendingScrollRestoreSawLoadingRef.current) return;
      scheduleRestoreWindowScrollY(pendingY);
    }, 500);
  }, [activeTab, scheduleLoading, scheduleViewMode, scheduleRestoreWindowScrollY]);

  const openScheduleCreateFromSlot = useCallback(
    (dateKey, timeHHmm = "09:00") => {
      setScheduleSaveError("");
      setScheduleEditingTaskId(null);
      setScheduleEditDraft(null);
      setScheduleEditReturnViewMode("");
      scheduleEditReturnScrollYRef.current = null;
      schedulePendingScrollRestoreYRef.current = null;
      schedulePendingScrollRestoreSawLoadingRef.current = false;
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
      const returnView = scheduleViewMode !== "list" ? scheduleViewMode : "";
      setScheduleMoveModeTaskId(null);
      setScheduleEditReturnViewMode(returnView);
      scheduleEditReturnScrollYRef.current =
        returnView && typeof window !== "undefined" ? window.scrollY : null;
      schedulePendingScrollRestoreYRef.current = null;
      schedulePendingScrollRestoreSawLoadingRef.current = false;
      setScheduleViewMode("list");
      setScheduleFormOpen(false);
      setScheduleSaveError("");
      setScheduleEditError("");
      setScheduleEditDraft(buildScheduleEditDraftFromTask(task, assignRowsForTask, companyTimeZone));
      setScheduleEditingTaskId(tidKey);
    },
    [scheduleAssigneesByTaskId, companyTimeZone, scheduleViewMode]
  );

  const beginScheduleMoveMode = useCallback((task) => {
    if (!isAdmin || !task?.id) return;
    setScheduleCalendarMoveError("");
    setScheduleFormOpen(false);
    setScheduleSaveError("");
    setScheduleEditingTaskId(null);
    setScheduleEditDraft(null);
    setScheduleEditReturnViewMode("");
    scheduleEditReturnScrollYRef.current = null;
    schedulePendingScrollRestoreYRef.current = null;
    schedulePendingScrollRestoreSawLoadingRef.current = false;
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
        setScheduleDragOffset({ taskId: null, dx: 0, dy: 0, active: false });
        return;
      }
      setScheduleCalendarMoveError("");
      setScheduleRescheduleSavingId(tid);
      setScheduledTasks((prev) =>
        (Array.isArray(prev) ? prev : []).map((row) =>
          String(row?.id ?? "") === tid ? { ...row, ...payload } : row
        )
      );
      setScheduleDragOffset({ taskId: null, dx: 0, dy: 0, active: false });
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
        setScheduledTasks((prev) =>
          (Array.isArray(prev) ? prev : []).map((row) =>
            String(row?.id ?? "") === tid ? { ...row, ...task } : row
          )
        );
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
      setScheduleDragOffset({ taskId: tid, dx: 0, dy: 0, active: false });

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
    const dx = st.lastX - st.startX;
    const dy = st.lastY - st.startY;
    if (!st.dragging) {
      if (Math.hypot(dx, dy) > 8) st.dragging = true;
    }
    if (st.dragging) {
      const tid = st.task?.id != null ? String(st.task.id) : "";
      setScheduleDragOffset({ taskId: tid, dx, dy, active: true });
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

      if (!task || !tid) {
        setScheduleDragOffset({ taskId: null, dx: 0, dy: 0, active: false });
        return;
      }

      if (!wasDragging) {
        setScheduleDragOffset({ taskId: null, dx: 0, dy: 0, active: false });
        openAdminScheduleEditFromCalendar(task);
        return;
      }

      const colsNode = scheduleTimelineColsRef.current;
      if (!(colsNode instanceof Element)) {
        setScheduleDragOffset({ taskId: null, dx: 0, dy: 0, active: false });
        setScheduleCalendarMoveError("Unable to determine drop target. Try again.");
        return;
      }
      const rect = colsNode.getBoundingClientRect();
      const colCount = anchorKeys.length || 1;
      const w = rect.width > 0 ? rect.width : 1;
      const x = Math.min(Math.max(0, dropX - rect.left), w - 1);
      const dayIndex = Math.min(colCount - 1, Math.max(0, Math.floor((x / w) * colCount)));
      const dayKey = anchorKeys[dayIndex];
      if (!dayKey) {
        setScheduleDragOffset({ taskId: null, dx: 0, dy: 0, active: false });
        return;
      }

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
        setScheduleDragOffset({ taskId: null, dx: 0, dy: 0, active: false });
        setScheduleCalendarMoveError("Could not compute the new start time.");
        return;
      }

      const origDay = calendarDateKeyInTimeZone(task?.start_time, companyTimeZone);
      const origM = wallMinutesFromScheduleGridStart(task?.start_time, origDay, companyTimeZone);
      const origSnap = origM != null ? Math.round(Number(origM) / 15) * 15 : null;
      if (origDay === dayKey && origSnap === totalMin) {
        setScheduleDragOffset({ taskId: null, dx: 0, dy: 0, active: false });
        return;
      }

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

  const rememberScheduledTaskInTaskList = useCallback(
    ({ taskTitle, projectId: taskProjectId, projectName, costCentre }) => {
      const text = String(taskTitle || "").trim();
      const projectIdForKey = String(taskProjectId || "").trim();
      const projectNameForKey = String(projectName || "").trim();
      if (!text || (!projectIdForKey && !projectNameForKey)) return;

      const projectToken = projectIdForKey || getProjectFolderName(projectNameForKey || "project");
      const costToken = String(costCentre || "").trim() || "project";
      const key = [
        authUser?.id || "anonymous",
        userCompany?.id || "company",
        projectToken,
        costToken,
      ].join("|");

      const item = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        projectId: projectIdForKey,
        projectName: projectNameForKey,
        costCenter: String(costCentre || "").trim(),
        createdAt: new Date().toISOString(),
        source: "schedule",
      };

      setClockProjectLists((prev) => {
        const next = {
          task: { ...(prev?.task || {}) },
          material: { ...(prev?.material || {}) },
        };
        const existing = Array.isArray(next.task?.[key]) ? next.task[key] : [];
        const textKey = text.toLowerCase();
        const alreadyExists = existing.some(
          (row) => String(row?.text || "").trim().toLowerCase() === textKey
        );
        if (alreadyExists) return prev;
        next.task[key] = [item, ...existing];
        return next;
      });
    },
    [authUser?.id, userCompany?.id]
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

        rememberScheduledTaskInTaskList({
          taskTitle,
          projectId: projectIdVal,
          projectName: projectNameVal,
          costCentre: costCentreVal,
        });

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
          const schedulePushSinceIso = new Date(Date.now() - 2 * 60 * 1000).toISOString();
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

          void sendPushForRecentScheduleAssignmentNotifications(supabase, {
            companyId: userCompany.id,
            recipientUserIds: selectedIds,
            sinceIso: schedulePushSinceIso,
          });
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
    [isAdmin, userCompany?.id, authUser?.id, scheduleDraft, companyTimeZone, companyProjects, schedulePickMembers, rememberScheduledTaskInTaskList]
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

        rememberScheduledTaskInTaskList({
          taskTitle,
          projectId: projectIdVal,
          projectName: projectNameVal,
          costCentre: costCentreVal,
        });

        const selectedIdSet = new Set(selectedIds);
        const removedUserIds = [...prevAssignedUserIds].filter((uid) => !selectedIdSet.has(String(uid)));
        if (removedUserIds.length > 0) {
          const { error: delErr } = await supabase
            .from("scheduled_task_assignees")
            .delete()
            .eq("scheduled_task_id", taskId)
            .eq("company_id", userCompany.id)
            .in("user_id", removedUserIds);
          if (delErr) throw delErr;
        }

        const notifyUserIds = selectedIds.filter((uid) => !prevAssignedUserIds.has(String(uid)));
        if (notifyUserIds.length > 0) {
          const assignRows = notifyUserIds.map((uid) => {
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
          const schedulePushSinceIso = new Date(Date.now() - 2 * 60 * 1000).toISOString();
          const { error: assignInsErr } = await supabase.from("scheduled_task_assignees").insert(assignRows);
          if (assignInsErr) throw assignInsErr;

          void sendPushForRecentScheduleAssignmentNotifications(supabase, {
            companyId: userCompany.id,
            recipientUserIds: notifyUserIds,
            sinceIso: schedulePushSinceIso,
          });
        }

        const returnView = scheduleEditReturnViewMode;
        setScheduleEditingTaskId(null);
        setScheduleEditDraft(null);
        restoreScheduleEditReturnView(returnView);
        setScheduleRefreshKey((k) => k + 1);
      } catch (err) {
        setScheduleEditError(getErrorMessage(err));
      } finally {
        setScheduleEditSaving(false);
      }
    },
    [isAdmin, userCompany?.id, authUser?.id, scheduleEditingTaskId, scheduleEditDraft, scheduleEditReturnViewMode, restoreScheduleEditReturnView, companyTimeZone, companyProjects, schedulePickMembers, scheduleAssigneesByTaskId, rememberScheduledTaskInTaskList]
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
          const returnView = scheduleEditReturnViewMode;
          setScheduleEditingTaskId(null);
          setScheduleEditDraft(null);
          setScheduleEditError("");
          restoreScheduleEditReturnView(returnView);
        }
        if (String(scheduleMoveModeTaskId) === tid) setScheduleMoveModeTaskId(null);
        setScheduleRefreshKey((k) => k + 1);
      } catch (err) {
        alert(getErrorMessage(err));
      } finally {
        setScheduleDeleteSavingId(null);
      }
    },
    [isAdmin, userCompany?.id, authUser?.id, scheduleEditingTaskId, scheduleEditReturnViewMode, restoreScheduleEditReturnView, scheduleMoveModeTaskId]
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
    if (!authUser?.id) return;
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

  const handleSaveCompanyProfile = async (event) => {
    event.preventDefault();
    if (!isAdmin || !userCompany?.id) return;
    const nameDraft = String(settingsCompanyNameDraft || "").trim();
    if (!nameDraft) {
      setSettingsTzMessage("Company name is required.");
      return;
    }
    setSettingsTzSaving(true);
    setSettingsTzMessage("");
    try {
      const { error } = await supabase
        .from("companies")
        .update({ name: nameDraft, time_zone: settingsTzDraft })
        .eq("id", userCompany.id);
      if (error) throw error;
      setUserCompany((prev) => (prev ? { ...prev, name: nameDraft, time_zone: settingsTzDraft } : prev));
      setSettingsCompanyEditOpen(false);
      setSettingsTzMessage("Company profile saved.");
    } catch (err) {
      setSettingsTzMessage(getErrorMessage(err));
    } finally {
      setSettingsTzSaving(false);
    }
  };

  const handleSaveEmployeeProfile = async (event) => {
    event.preventDefault();
    if (!authUser?.id) return;
    const nameDraft = String(settingsProfileNameDraft || "").trim();
    if (!nameDraft) {
      setSettingsProfileMessage("Name is required.");
      return;
    }
    setSettingsProfileSaving(true);
    setSettingsProfileMessage("");
    try {
      const { error } = await supabase.from("profiles").update({ full_name: nameDraft }).eq("id", authUser.id);
      if (error) throw error;
      setProfileFullName(nameDraft);
      setTeamRows((prev) =>
        prev.map((row) =>
          String(row.userId) === String(authUser.id)
            ? { ...row, fullName: nameDraft, displayName: nameDraft }
            : row
        )
      );
      setSettingsProfileEditOpen(false);
      setSettingsProfileMessage("Employee profile saved.");
    } catch (err) {
      setSettingsProfileMessage(getErrorMessage(err));
    } finally {
      setSettingsProfileSaving(false);
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
          <p className="text-[16px] font-semibold">{timesheetTitle}</p>
          {timesheetEmailSecondary && (
            <p className="text-[13px] text-slate-500 mt-0.5 break-all">{timesheetEmailSecondary}</p>
          )}
          <p className="text-[14px] text-slate-600">{record.project}</p>
          <p className="text-[14px] text-slate-500">Cost Centre: {record.costCenter || "Not selected"}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[13px] font-semibold h-fit ${statusBadgeClass}`}>
          {statusBadgeLabel}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 text-[14px] text-slate-600">
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
          <p className="text-[13px] text-slate-500 leading-tight">Edit in {companyTimeZone}</p>
          <div className="space-y-1">
            <label className="text-[13px] text-slate-500">Clock in</label>
            <div className="flex gap-1">
              <input
                type="date"
                className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-[14px]"
                value={editClockInDate}
                onChange={(e) => setEditClockInDate(e.target.value)}
              />
              <input
                type="time"
                className="w-[7rem] shrink-0 rounded-lg border px-2 py-1.5 text-[14px]"
                value={editClockInTime}
                onChange={(e) => setEditClockInTime(e.target.value)}
              />
            </div>
            </div>
          <div className="space-y-1">
            <label className="text-[13px] text-slate-500">Clock out</label>
            <div className="flex gap-1">
              <input
                type="date"
                className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-[14px]"
                value={editClockOutDate}
                onChange={(e) => setEditClockOutDate(e.target.value)}
              />
              <input
                type="time"
                className="w-[7rem] shrink-0 rounded-lg border px-2 py-1.5 text-[14px]"
                value={editClockOutTime}
                onChange={(e) => setEditClockOutTime(e.target.value)}
              />
          </div>
          </div>
          <div className="space-y-1">
            <label className="text-[13px] text-slate-500">Project</label>
            <select
              className="w-full rounded-lg border py-2 px-2 text-[14px]"
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
            <label className="text-[13px] text-slate-500">Cost centre</label>
            <select
              className="w-full rounded-lg border py-2 px-2 text-[14px]"
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
              className="rounded-lg h-10 text-[14px] font-semibold"
              disabled={editTimesheetSaving}
              onClick={() => void saveEditedRecord(record)}
            >
              {editTimesheetSaving ? "Saving…" : "Save"}
            </Button>
            <Button type="button" className="rounded-lg h-10 text-[14px]" disabled={editTimesheetSaving} onClick={cancelEditRecord}>
              Cancel
            </Button>
          </div>
          {isAdmin && !editTimesheetSaving && (
            <Button
              type="button"
              className="w-full rounded-xl h-10 text-[14px] font-semibold bg-red-600 text-white border border-red-800 shadow-sm active:bg-red-700 disabled:opacity-100 disabled:bg-red-500 disabled:text-white"
              disabled={busyDelete}
              onClick={() => void handleDeleteTimesheetRecord(record)}
            >
              {busyDelete ? "Deleting…" : "🗑 Delete"}
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 mt-3 text-[14px] text-slate-600 border-t pt-3">
            <div><p>In</p><p className="font-semibold text-slate-900">{formatTime(record.clockIn, companyTimeZone)}</p></div>
            <div><p>Out</p><p className={outClass}>{outText}</p></div>
          </div>
          {(record.clockInLocation || record.clockOutLocation) && (
            <div className="mt-2 space-y-1 text-[13px] text-slate-600 border-t border-slate-100 pt-2">
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
            <p className="mt-1 text-[13px] text-amber-700">This shift was never clocked out.</p>
          )}
          {submittedMissingClockOut && (
            <p className="mt-1 text-[13px] text-amber-700">No clock-out on file for this submitted row.</p>
          )}
          {showCloseShift && (
            <Button
              type="button"
              className="w-full rounded-xl h-10 text-[14px] mt-2 border border-slate-300 bg-white text-slate-800 font-semibold"
              disabled={busyClose}
              onClick={() => void handleCloseStaleShift(record)}
            >
              {busyClose ? "Closing…" : "Close shift"}
            </Button>
          )}
          {record.edited && <p className="mt-2 text-[13px] text-red-600">Time edited by employee — waiting for admin approval.</p>}
          {((allowEdit && canEditTimesheetRecord(record)) || isAdmin) && (
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {allowEdit && canEditTimesheetRecord(record) && (
                <Button
                  type="button"
                  className="rounded-xl h-10 text-[14px] col-span-2 sm:col-span-1"
                  disabled={busyDelete}
                  onClick={() => startEditRecord(record)}
                >
                  ✏️ Edit
                </Button>
              )}
              {isAdmin && (
                <Button
                  type="button"
                  className="rounded-xl h-10 text-[14px] font-semibold bg-red-600 text-white border border-red-800 shadow-sm active:bg-red-700 col-span-2 sm:col-span-1 disabled:opacity-100 disabled:bg-red-500 disabled:text-white"
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

  if (publicPhotoShare) {
    return (
      <PublicPhotoShareView
        share={publicPhotoShare}
        index={publicShareIndex}
        setIndex={setPublicShareIndex}
      />
    );
  }

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="text-4xl mb-3">⏱️</div>
          <p className="text-sm text-slate-300">Loading OPERA.AI...</p>
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
                  <h1 className="text-2xl font-bold tracking-tight">OPERA.AI</h1>
                  <p className="text-sm text-slate-600">Create Account</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSignup} className="p-5 space-y-4">
              <div>
                <h2 className="text-xl font-bold">Sign up</h2>
                <p className="text-sm text-slate-500 mt-1">Create an account to start using OPERA.AI.</p>
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
                <h1 className="text-2xl font-bold tracking-tight">OPERA.AI</h1>
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
                Continue to OPERA.AI
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

  const renderEmployeeScheduleListTaskCard = (task, dateKey) => {
    const ttitle = String(task?.task_title ?? "").trim() || "Untitled task";
    const startDisp = task?.start_time ? formatTime(task.start_time, companyTimeZone) : "—";
    const endDisp = task?.end_time ? formatTime(task.end_time, companyTimeZone) : "—";
    const linkRow =
      task?.id != null ? employeeScheduleLinkByTaskId?.[String(task.id)] : undefined;
    const fromTaskNames = scheduleShortEmployeeSummary([], task?.assigned_employee_name);
    const employeeSummary =
      fromTaskNames !== "No emp"
        ? fromTaskNames
        : scheduleShortEmployeeSummary(linkRow ? [linkRow] : [], "");
    const respStatus = normalizeScheduleAssigneeResponseStatus(linkRow?.response_status);
    const assigneeRowId = linkRow?.id != null ? String(linkRow.id) : "";
    const savingThis = assigneeRowId && scheduleResponseSavingAssigneeId === assigneeRowId;
    const tidStr = task?.id != null ? String(task.id) : "";
    const declineOpen = tidStr && scheduleEmployeeDeclineTaskId === tidStr;

    return (
      <div
        key={String(task?.id ?? `${dateKey}-${ttitle}-${startDisp}`)}
        className="rounded-2xl border border-slate-200 bg-white px-3 py-3.5 shadow-sm min-w-0"
      >
        <div className="min-w-0">
          <p className="text-[19px] font-extrabold text-slate-950 leading-snug break-words">
            {ttitle}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[16px] font-semibold text-slate-700 min-w-0">
            <span className="shrink-0 tabular-nums">
              {startDisp} - {endDisp}
            </span>
            <span className="text-slate-300">|</span>
            <span className="shrink-0 max-w-full truncate text-slate-900">{employeeSummary}</span>
          </div>
        </div>

        {respStatus === "pending" && assigneeRowId ? (
          <div className="mt-3">
            {!declineOpen ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={Boolean(savingThis)}
                  onClick={() => void handleEmployeeScheduleAccept(assigneeRowId)}
                  className="flex-1 rounded-xl bg-slate-900 px-3 py-2.5 text-[15px] font-bold text-white disabled:opacity-50"
                >
                  {savingThis ? "Saving..." : "Accept"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(savingThis)}
                  onClick={() => {
                    setScheduleEmployeeResponseInlineError("");
                    setScheduleEmployeeDeclineTaskId(tidStr);
                    setScheduleEmployeeDeclineReason("");
                  }}
                  className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[15px] font-bold text-slate-800 disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            ) : (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                <textarea
                  rows={2}
                  value={scheduleEmployeeDeclineReason}
                  onChange={(e) => setScheduleEmployeeDeclineReason(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-[15px] resize-y min-h-[3.25rem]"
                  placeholder="Reason required"
                  disabled={Boolean(savingThis)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={Boolean(savingThis)}
                    onClick={() =>
                      void handleEmployeeScheduleDecline(assigneeRowId, scheduleEmployeeDeclineReason)
                    }
                    className="flex-1 rounded-xl bg-rose-700 px-3 py-2.5 text-[15px] font-bold text-white disabled:opacity-50"
                  >
                    {savingThis ? "Saving..." : "Confirm"}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(savingThis)}
                    onClick={() => {
                      setScheduleEmployeeDeclineTaskId(null);
                      setScheduleEmployeeDeclineReason("");
                    }}
                    className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[15px] font-bold text-slate-800 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-bold uppercase tracking-wide ring-1 ${scheduleAssigneeResponseBadgeClass(respStatus)}`}
            >
              {scheduleAssigneeResponseLabel(respStatus)}
            </span>
          </div>
        )}
      </div>
    );
  };

  const isClockSetupWarningStatus =
    locationStatus === "Select project and cost center first." ||
    locationStatus === "No projects assigned. Please contact your supervisor.";

  const clockListContext = {
    projectId: clockMediaContext?.projectId ?? visibleCurrentShift?.projectId ?? clockSelectedProject?.id ?? projectId,
    projectName: clockMediaContext?.project || visibleCurrentShift?.project || clockSelectedProject?.name || "",
    costCenter: clockMediaContext?.costCenter || visibleCurrentShift?.costCenter || costCenter || "",
  };

  const clockListContextReady = Boolean(
    String(clockListContext.projectName || "").trim() &&
      String(clockListContext.costCenter || "").trim()
  );

  const clockProjectListKey = [
    authUser?.id || "anonymous",
    userCompany?.id || "company",
    clockListContext.projectId || getProjectFolderName(clockListContext.projectName || "project"),
    clockListContext.costCenter || "cost",
  ].join("|");

  const getClockProjectListItems = (kind) => {
    const bucket = clockProjectLists?.[kind] || {};
    const rows = bucket?.[clockProjectListKey] || [];
    return Array.isArray(rows) ? rows : [];
  };

  const activeClockListItems = clockListModal ? getClockProjectListItems(clockListModal) : [];

  const listItemImageUrl = (item) =>
    item?.imageDataUrl || item?.photoDataUrl || item?.dataUrl || "";

  const buildListImageDraft = async (file) => {
    if (!file || !String(file.type || "").startsWith("image/")) {
      throw new Error("Choose an image file.");
    }
    const smallFile = await compressImage(file, 520, 0.55);
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Could not read image."));
      reader.readAsDataURL(smallFile);
    });
    return {
      dataUrl,
      name: smallFile.name || file.name || "task-photo.jpg",
      addedAt: new Date().toISOString(),
    };
  };

  const handleClockListImagePick = async (event) => {
    const file = event?.target?.files?.[0];
    if (event?.target) event.target.value = "";
    if (!file) return;
    try {
      const draft = await buildListImageDraft(file);
      setClockListImageDraft(draft);
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  const handleListImagePick = async (event) => {
    const file = event?.target?.files?.[0];
    if (event?.target) event.target.value = "";
    if (!file) return;
    try {
      const draft = await buildListImageDraft(file);
      setListImageDraft(draft);
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  const restoreLastClockListItem = () => {
    if (!clockListUndo?.kind || !clockListUndo?.key || !clockListUndo?.item) return;
    const undo = clockListUndo;
    setClockProjectLists((prev) => {
      const next = {
        task: { ...(prev?.task || {}) },
        material: { ...(prev?.material || {}) },
      };
      const rows = Array.isArray(next[undo.kind]?.[undo.key]) ? next[undo.kind][undo.key] : [];
      const exists = rows.some((item) => String(item?.id) === String(undo.item?.id));
      next[undo.kind][undo.key] = exists ? rows : [undo.item, ...rows];
      return next;
    });
    setClockListUndo(null);
  };

  const openClockProjectList = (kind) => {
    if (!clockListContextReady) {
      showClockSetupRequired();
      return;
    }
    setClockListDraft("");
    setClockListImageDraft(null);
    setClockListModal(kind);
  };

  const addClockProjectListItem = (event) => {
    event?.preventDefault?.();
    const text = String(clockListDraft || "").trim();
    if (!text || !clockListModal || !clockListContextReady) return;

    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      projectId: clockListContext.projectId || "",
      projectName: clockListContext.projectName || "",
      costCenter: clockListContext.costCenter || "",
      createdAt: new Date().toISOString(),
      imageDataUrl: clockListModal === "task" ? clockListImageDraft?.dataUrl || "" : "",
      imageName: clockListModal === "task" ? clockListImageDraft?.name || "" : "",
    };

    setClockProjectLists((prev) => {
      const next = {
        task: { ...(prev?.task || {}) },
        material: { ...(prev?.material || {}) },
      };
      const existing = Array.isArray(next[clockListModal]?.[clockProjectListKey])
        ? next[clockListModal][clockProjectListKey]
        : [];
      next[clockListModal][clockProjectListKey] = [item, ...existing];
      return next;
    });
    setClockListDraft("");
    setClockListImageDraft(null);
  };

  const completeClockProjectListItem = (kind, itemId) => {
    if (!kind || !itemId) return;
    const existingNow = Array.isArray(clockProjectLists?.[kind]?.[clockProjectListKey])
      ? clockProjectLists[kind][clockProjectListKey]
      : [];
    const removedItem = existingNow.find((item) => String(item?.id) === String(itemId));
    if (removedItem) {
      setClockListUndo({ kind, key: clockProjectListKey, item: removedItem });
    }
    setClockProjectLists((prev) => {
      const next = {
        task: { ...(prev?.task || {}) },
        material: { ...(prev?.material || {}) },
      };
      const existing = Array.isArray(next[kind]?.[clockProjectListKey])
        ? next[kind][clockProjectListKey]
        : [];
      next[kind][clockProjectListKey] = existing.filter(
        (item) => String(item?.id) !== String(itemId)
      );
      return next;
    });
  };

  const renderClockListActionRow = () => (
    <div className="rounded-[22px] border border-slate-200 bg-white p-2 shadow-sm">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition active:bg-white"
          onClick={() => openClockProjectList("task")}
        >
          <span className="block text-[15px] font-black leading-tight text-slate-950">Task List</span>
          <span className="mt-0.5 block text-[12px] font-bold leading-tight text-slate-500">Project tasks</span>
        </button>
        <button
          type="button"
          className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition active:bg-white"
          onClick={() => openClockProjectList("material")}
        >
          <span className="block text-[15px] font-black leading-tight text-slate-950">Material List</span>
          <span className="mt-0.5 block text-[12px] font-bold leading-tight text-slate-500">Project materials</span>
        </button>
      </div>
    </div>
  );

  const listProjectOptions = (isAdmin ? effectiveProjects : clockSelectableProjects).filter(
    (project) => project?.id != null || String(project?.name || "").trim()
  );
  const effectiveListProjectId =
    listSelectedProjectId ||
    (listProjectOptions[0]?.id != null ? String(listProjectOptions[0].id) : "");
  const selectedListProject =
    listProjectOptions.find((project) => String(project?.id ?? "") === String(effectiveListProjectId)) ||
    listProjectOptions[0] ||
    null;
  const selectedListProjectToken =
    selectedListProject?.id != null
      ? String(selectedListProject.id)
      : getProjectFolderName(selectedListProject?.name || "project");
  const listStoragePrefix = [
    authUser?.id || "anonymous",
    userCompany?.id || "company",
    selectedListProjectToken || "project",
    "",
  ].join("|");
  const listProjectStorageKey = [
    authUser?.id || "anonymous",
    userCompany?.id || "company",
    selectedListProjectToken || "project",
    "project",
  ].join("|");
  const visibleProjectListItems = (() => {
    const bucket = clockProjectLists?.[listType] || {};
    return Object.entries(bucket)
      .filter(([key, rows]) => key.startsWith(listStoragePrefix) && Array.isArray(rows))
      .flatMap(([sourceKey, rows]) =>
        rows.map((item) => ({
          ...item,
          sourceKey,
          sourceCostCenter: String(item?.costCenter || sourceKey.split("|")[3] || "").trim(),
        }))
      )
      .sort((a, b) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")));
  })();

  const addListPageItem = (event) => {
    event?.preventDefault?.();
    const text = String(listDraft || "").trim();
    if (!text || !selectedListProject) return;
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      projectId: selectedListProject?.id || "",
      projectName: selectedListProject?.name || "",
      costCenter: "",
      createdAt: new Date().toISOString(),
      imageDataUrl: listType === "task" ? listImageDraft?.dataUrl || "" : "",
      imageName: listType === "task" ? listImageDraft?.name || "" : "",
    };
    setClockProjectLists((prev) => {
      const next = {
        task: { ...(prev?.task || {}) },
        material: { ...(prev?.material || {}) },
      };
      const rows = Array.isArray(next[listType]?.[listProjectStorageKey])
        ? next[listType][listProjectStorageKey]
        : [];
      next[listType][listProjectStorageKey] = [item, ...rows];
      return next;
    });
    setListDraft("");
    setListImageDraft(null);
  };

  const completeListPageItem = (sourceKey, itemId) => {
    if (!sourceKey || !itemId) return;
    const rowsNow = Array.isArray(clockProjectLists?.[listType]?.[sourceKey])
      ? clockProjectLists[listType][sourceKey]
      : [];
    const removedItem = rowsNow.find((item) => String(item?.id) === String(itemId));
    if (removedItem) {
      setClockListUndo({ kind: listType, key: sourceKey, item: removedItem });
    }
    setClockProjectLists((prev) => {
      const next = {
        task: { ...(prev?.task || {}) },
        material: { ...(prev?.material || {}) },
      };
      const rows = Array.isArray(next[listType]?.[sourceKey]) ? next[listType][sourceKey] : [];
      next[listType][sourceKey] = rows.filter((item) => String(item?.id) !== String(itemId));
      return next;
    });
  };

  const canUndoListPage =
    Boolean(clockListUndo?.kind === listType && clockListUndo?.key) &&
    String(clockListUndo.key).startsWith(listStoragePrefix);
  const canUndoClockListModal =
    Boolean(clockListUndo?.kind === clockListModal && clockListUndo?.key) &&
    String(clockListUndo.key) === String(clockProjectListKey);

  const reportsQuickRangeOptions = [
    { id: "weekly", label: "Week" },
    { id: "monthly", label: "Month" },
    { id: "yearly", label: "Year" },
  ];

  const reportsDateRangeLabel =
    reportsDateFrom && reportsDateTo
      ? `${reportsDateFrom} - ${reportsDateTo}`
      : "Choose dates";

  const reportsTotalEntries = Array.isArray(reportsRowsFilteredForUi)
    ? reportsRowsFilteredForUi.length
    : 0;

  const reportsTopProjects = [...(reportsAggregates.byProject || [])]
    .sort((a, b) => Number(b.minutes || 0) - Number(a.minutes || 0))
    .slice(0, 4);
  const reportsTopEmployees = [...(reportsAggregates.byEmployee || [])]
    .sort((a, b) => Number(b.minutes || 0) - Number(a.minutes || 0))
    .slice(0, 4);
  const reportsTopProjectMax = Math.max(
    1,
    ...reportsTopProjects.map((row) => Number(row.minutes || 0))
  );

  const getReportsDimForRow = (dim, row) => {
    if (dim === "employee") {
      const uid = String(row?.userId ?? row?.employeeId ?? "").trim();
      const label =
        resolveTimesheetEmployeeTitle(row, {
          profileFullName,
          authUser,
          teamProfileFullNameByUserId,
        }) || "Employee";
      return { key: uid ? `emp:${uid}` : `empn:${label}`, label };
    }
    if (dim === "project") {
      const label = (row?.project && String(row.project).trim()) || "Unassigned";
      const pid = row?.projectId != null ? String(row.projectId).trim() : "";
      return { key: pid ? `projid:${pid}` : `proj:${label}`, label };
    }
    if (dim === "cost_center") {
      const cc = reportsCostCentreKeyFromRow(row);
      return { key: `cc:${cc}`, label: cc === "—" ? "(none)" : cc };
    }
    return { key: "unknown", label: "Unknown" };
  };

  const summarizeReportsRows = (rows = []) => {
    let minutes = 0;
    let cost = 0;
    let missingOut = 0;
    for (const row of Array.isArray(rows) ? rows : []) {
      minutes += getWorkedMinutes(row);
      cost += getLabourCost(row);
      if (!row?.clockOut) missingOut += 1;
    }
    return { minutes, cost, missingOut, count: Array.isArray(rows) ? rows.length : 0 };
  };

  const buildReportsGroups = (rows = [], dim = "project") => {
    const safeDim = REPORT_DIMS.includes(dim) ? dim : "project";
    const map = {};
    for (const row of Array.isArray(rows) ? rows : []) {
      const d = getReportsDimForRow(safeDim, row);
      if (!map[d.key]) {
        map[d.key] = { key: d.key, label: d.label, rows: [], minutes: 0, cost: 0, missingOut: 0 };
      }
      map[d.key].rows.push(row);
      map[d.key].minutes += getWorkedMinutes(row);
      map[d.key].cost += getLabourCost(row);
      if (!row?.clockOut) map[d.key].missingOut += 1;
    }
    return Object.values(map).sort(
      (a, b) => Number(b.minutes || 0) - Number(a.minutes || 0) || String(a.label).localeCompare(String(b.label))
    );
  };

  const reportsMainGroupBy = REPORT_DIMS.includes(reportsLevel1) ? reportsLevel1 : "project";
  const reportsMainGroups = buildReportsGroups(reportsRowsFilteredForUi, reportsMainGroupBy);
  const reportsSelectedProjectRows = reportsSelectedProject?.key
    ? (reportsRowsFilteredForUi || []).filter(
        (row) => getReportsDimForRow("project", row).key === reportsSelectedProject.key
      )
    : [];
  const reportsSelectedProjectSummary = summarizeReportsRows(reportsSelectedProjectRows);
  const reportsProjectGroups = buildReportsGroups(reportsSelectedProjectRows, reportsProjectGroupBy);
  const reportsSelectedEmployeeRows = reportsSelectedEmployee?.key
    ? reportsSelectedProjectRows.filter(
        (row) => getReportsDimForRow("employee", row).key === reportsSelectedEmployee.key
      )
    : [];
  const reportsSelectedEmployeeSummary = summarizeReportsRows(reportsSelectedEmployeeRows);
  const reportsEmployeeCostCenterGroups = buildReportsGroups(reportsSelectedEmployeeRows, "cost_center");
  const reportsViewLabel = (dim) => {
    if (dim === "project") return "Project View";
    if (dim === "employee") return "Employee View";
    if (dim === "cost_center") return "Cost Center View";
    return "View";
  };
  const filterReportsRowsByStack = (rows, stack) =>
    (Array.isArray(rows) ? rows : []).filter((row) =>
      (Array.isArray(stack) ? stack : []).every(
        (step) => step?.dim && getReportsDimForRow(step.dim, row).key === step.key
      )
    );
  const reportsSafeDrillStack = Array.isArray(reportsDrillStack) ? reportsDrillStack : [];
  const reportsDrillRows = filterReportsRowsByStack(reportsRowsFilteredForUi, reportsSafeDrillStack);
  const reportsDrillSummary = summarizeReportsRows(reportsDrillRows);
  const reportsUsedDims = new Set(reportsSafeDrillStack.map((step) => step.dim));
  const reportsAvailableDims = REPORT_DIMS.filter((dim) => !reportsUsedDims.has(dim));
  const reportsCurrentViewBy = reportsAvailableDims.includes(reportsDrillViewBy)
    ? reportsDrillViewBy
    : reportsAvailableDims[0] || "project";
  const reportsCurrentGroups =
    reportsAvailableDims.length > 0 ? buildReportsGroups(reportsDrillRows, reportsCurrentViewBy) : [];
  const reportsContextCards = reportsSafeDrillStack.map((step, index) => {
    const stackSlice = reportsSafeDrillStack.slice(0, index + 1);
    return {
      ...step,
      summary: summarizeReportsRows(filterReportsRowsByStack(reportsRowsFilteredForUi, stackSlice)),
    };
  });
  const reportsVisibleSummary = reportsSafeDrillStack.length
    ? reportsDrillSummary
    : { minutes: reportsAggregates.totalMinutes, cost: reportsAggregates.totalCost };
  const reportsCurrentTitle = reportsSafeDrillStack.length
    ? reportsSafeDrillStack.map((step) => step.label).join(" / ")
    : "All reports";

  return (
    <div className="min-h-[100dvh] max-h-[100dvh] h-[100dvh] bg-neutral-950 flex justify-center text-slate-900 overflow-hidden">
      <div className="w-full max-w-sm h-full min-h-0 max-h-[100dvh] bg-slate-50 shadow-2xl relative flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-2.5 sm:p-4 space-y-2 sm:space-y-3 pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))]">
          <div className="rounded-2xl bg-white border border-slate-200 px-2.5 py-2 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setMenuPanel("main");
                  setIsMenuOpen(true);
                }}
                className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center text-lg font-bold"
                aria-label="Open menu"
              >
                ☰
              </button>
              <div className="flex-1 min-w-0">
                <h1 className="text-[18px] font-black tracking-tight leading-tight">OPERA.AI</h1>
                <p className="border-b border-slate-200 pb-1 text-[12px] font-semibold text-slate-600 leading-snug">{(profileFullName || "").trim() || "User"}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("clock");
                    setIsMenuOpen(false);
                  }}
                  className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center text-[0px] after:content-['\2302'] after:text-base after:leading-none"
                  aria-label="Home"
                >
                  âŒ‚
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("notifications")}
                  className="relative h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center text-base"
                  aria-label="Notifications"
                >
                  🔔
                  {inAppNotifUnread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[1.125rem] h-[1.125rem] px-0.5 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                      {inAppNotifUnread > 99 ? "99+" : inAppNotifUnread}
                    </span>
                  )}
                </button>
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
                  <h2 className="font-bold text-[17px]">Install on Phone</h2>
                  <p className="text-[14px] text-slate-600 leading-snug">Add this PWA to the home screen and use it like an app.</p>
                </div>
                <Button onClick={handleInstallApp} className="w-full rounded-2xl h-12 text-[15px] font-bold">📲 Install App</Button>
                {!deferredPrompt && (
                  <p className="text-[14px] text-slate-500">
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
                    <h2 className="font-bold text-[18px] leading-tight">Start Shift</h2>
                    <p className="text-[14px] text-slate-500 leading-snug">Choose project and cost center</p>
                  </div>
                </div>

                {!useProjectFallback && !projectsLoading && effectiveProjects.length === 0 && (
                  <div className="rounded-2xl border bg-white p-3 space-y-1.5">
                    <p className="text-[16px] font-semibold">No projects yet</p>
                    <p className="text-[14px] text-slate-500">Ask your supervisor to add a project, or create one now if you're an owner/supervisor.</p>
                  </div>
                )}

                {projectsError && (
                  <div className="rounded-2xl bg-amber-50 border border-amber-100 p-3 text-[14px] text-amber-900">
                    Project loading failed — using emergency fallback projects.<br />
                    <span className="text-[13px] text-amber-800">{projectsError}</span>
                  </div>
                )}

                {!useProjectFallback &&
                  !projectsLoading &&
                  !isAdmin &&
                  effectiveProjects.length > 0 &&
                  clockSelectableProjects.length === 0 && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                      <p className="text-[15px] text-amber-950 leading-snug">
                        No projects assigned. Please contact your supervisor.
                      </p>
                    </div>
                  )}

                {!useProjectFallback && !projectsLoading && effectiveProjects.length === 0 && isAdmin && (
                  <form onSubmit={handleAddProject} className="rounded-3xl border bg-white p-2.5 space-y-2">
                  <div>
                      <p className="text-[16px] font-semibold">Add Project</p>
                      <p className="text-[14px] text-slate-500">Add a project and cost centres (comma-separated).</p>
                  </div>

                    <div className="space-y-1">
                      <label className="text-[14px] font-medium">Project name</label>
                      <input
                        type="text"
                        className="w-full rounded-2xl border bg-white py-2 px-2.5 text-[15px] h-11"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="Example: Basement Renovation"
                        required
                      />
                </div>

                    <div className="space-y-1">
                      <label className="text-[14px] font-medium">Cost centres</label>
                      <input
                        type="text"
                        className="w-full rounded-2xl border bg-white py-2 px-2.5 text-[15px] h-11"
                        value={newProjectCostCentres}
                        onChange={(e) => setNewProjectCostCentres(e.target.value)}
                        placeholder="Framing, Drywall, Painting"
                      />
                    </div>

                    {addProjectError && (
                      <div className="rounded-2xl bg-red-50 border border-red-100 p-3 text-[14px] text-red-700">
                        {addProjectError}
                      </div>
                    )}

                    <Button type="submit" className="w-full rounded-2xl h-12 text-[15px] font-bold" disabled={addProjectLoading}>
                      {addProjectLoading ? "Adding..." : "Add Project"}
                    </Button>
                  </form>
                )}

                <div className="space-y-1">
                  <label className="text-[14px] font-medium">Scheduled Task</label>
                  <select
                    className="w-full rounded-2xl border bg-white py-2 px-2.5 text-[15px] h-11 leading-tight"
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
                  <label className="text-[14px] font-medium">Project / Job Site</label>
                  <select
                    className="w-full rounded-2xl border bg-white py-2 px-2.5 text-[15px] h-11 leading-tight"
                    value={projectId}
                    disabled={projectsLoading}
                    onChange={(event) => {
                      if (event.target.value === "__add_project__") {
                        openProjectManagementFromClock("project");
                        return;
                      }
                      setClockSelectedScheduledTaskId("");
                      handleProjectChange(event.target.value);
                    }}
                  >
                    <option value="">Select project</option>
                    <option value="__add_project__">+ Add project</option>
                    {clockSelectableProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[14px] font-medium">Cost Center</label>
                  <select
                    className="w-full rounded-2xl border bg-white py-2 px-2.5 text-[15px] h-11 leading-tight"
                    value={costCenter}
                    disabled={
                      !clockSelectedProject ||
                      clockSelectableProjects.length === 0
                    }
                    onChange={(event) => {
                      if (event.target.value === "__add_cost_centre__") {
                        openProjectManagementFromClock("costCentre");
                        return;
                      }
                      setClockSelectedScheduledTaskId("");
                      setCostCenter(event.target.value);
                    }}
                  >
                    <option value="">
                      {clockSelectedProject ? "Select cost center" : "Select project first"}
                    </option>
                    {clockSelectedProject ? <option value="__add_cost_centre__">+ Add cost center</option> : null}
                    {clockCostCentresActive.map((center) => (
                      <option key={center} value={center}>
                        {center}
                      </option>
                    ))}
                  </select>
                </div>

                {clockSelectedProject && clockCostCentresActive.length === 0 && (
                  <p className="text-[14px] text-amber-800 leading-snug">
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

                <div ref={photoToolsRef} className="rounded-2xl border border-slate-200 bg-slate-50 p-2 space-y-2">
                  {isClockSetupWarningStatus ? (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[14px] font-black text-red-700 text-center leading-snug">
                      {locationStatus}
                    </p>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className={`w-full rounded-2xl h-12 border text-center text-[15px] font-black transition disabled:opacity-50 ${
                        photoCameraOpen && photoCameraMode === "photo"
                          ? "border-slate-950 bg-white text-slate-950 shadow-inner ring-2 ring-slate-950/20"
                          : "border-slate-900 bg-slate-900 text-white"
                      }`}
                      onClick={() => {
                        if (!clockSetupReady) {
                          showClockSetupRequired();
                          return;
                        }
                        if (photoCameraOpen && photoCameraMode === "photo") {
                          stopPhotoCamera();
                        } else if (photoCameraOpen) {
                          stopVideoRecording();
                          setPhotoCameraMode("photo");
                          setPhotoStatus("Camera ready. Capture photos, then upload all.");
                          scrollClockMediaIntoView("upload");
                        } else {
                          void startPhotoCamera({ allowFallback: false, mode: "photo" });
                        }
                      }}
                      disabled={photoBatchUploading}
                      aria-pressed={photoCameraOpen && photoCameraMode === "photo"}
                    >
                      Camera
                    </button>
                    <button
                      type="button"
                      className={`block w-full rounded-2xl h-12 border text-center text-[15px] font-black transition disabled:opacity-50 ${
                        photoCameraOpen && photoCameraMode === "receipt"
                          ? "border-green-900 bg-white text-green-900 shadow-inner ring-2 ring-green-900/20"
                          : "border-green-700 bg-green-700 text-white"
                      }`}
                      onClick={() => {
                        if (!clockSetupReady) {
                          showClockSetupRequired();
                          return;
                        }
                        if (photoCameraOpen && photoCameraMode === "receipt") {
                          stopPhotoCamera();
                        } else if (photoCameraOpen) {
                          stopVideoRecording();
                          setPhotoCameraMode("receipt");
                          setPhotoStatus("Receipt camera ready. Capture receipt.");
                          scrollClockMediaIntoView("upload");
                        } else {
                          void startPhotoCamera({
                            allowFallback: false,
                            mode: "receipt",
                            readyMessage: "Receipt camera ready. Capture receipt.",
                          });
                        }
                      }}
                      disabled={photoBatchUploading || videoRecording || videoUploading}
                      aria-pressed={photoCameraOpen && photoCameraMode === "receipt"}
                    >
                      Receipt
                    </button>
                  </div>

                  {photoCameraError ? (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[15px] font-semibold text-amber-900 leading-snug">
                      {photoCameraError}
                    </p>
                  ) : null}

                  {photoCameraOpen ? (
                    <div ref={photoUploadActionsRef} className="space-y-2">
                      <video
                        ref={photoVideoRef}
                        className="w-full max-h-64 rounded-2xl bg-slate-950 object-cover"
                        playsInline
                        muted
                        autoPlay
                      />
                      <canvas ref={photoCanvasRef} className="hidden" />
                      {photoCameraMode === "receipt" ? (
                        <button
                          type="button"
                          className="w-full rounded-2xl h-12 bg-green-700 text-white text-[16px] font-bold disabled:opacity-50"
                          onClick={() => void captureReceiptFromCamera()}
                          disabled={photoBatchUploading || videoRecording}
                        >
                          Capture Receipt
                        </button>
                      ) : (
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            className="rounded-2xl h-12 bg-slate-900 text-white text-[15px] font-bold disabled:opacity-50"
                            onClick={() => void capturePhotoFromCamera()}
                            disabled={photoBatchUploading || videoRecording}
                          >
                            Capture Photo
                          </button>
                          <button
                            type="button"
                            className={`rounded-2xl h-12 text-[15px] font-bold disabled:opacity-50 ${
                              videoRecording
                                ? "bg-red-700 text-white"
                                : "border border-slate-300 bg-white text-slate-800"
                            }`}
                            onClick={videoRecording ? stopVideoRecording : startVideoRecording}
                            disabled={photoBatchUploading || videoUploading}
                          >
                            {videoRecording ? `Stop ${videoRecordSeconds}s` : "Record Video"}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {photoDrafts.length > 0 ? (
                    <div ref={photoUploadActionsRef} className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[15px] font-bold text-slate-900">
                          Ready to upload: {photoDrafts.length}
                        </p>
                        <button
                          type="button"
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-[14px] font-bold text-slate-800 disabled:opacity-50"
                          onClick={clearPhotoDrafts}
                          disabled={photoBatchUploading}
                        >
                          Clear all
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {photoDrafts.map((draft, index) => (
                          <div key={draft.id} className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                            <img src={draft.previewUrl} alt={`Selected photo ${index + 1}`} className="h-20 w-full object-cover" />
                            <span className="absolute left-1 top-1 rounded-full bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {index + 1}
                            </span>
                            <button
                              type="button"
                              className="absolute right-1 top-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold text-slate-900 shadow disabled:opacity-50"
                              onClick={() => removePhotoDraft(draft.id)}
                              disabled={photoBatchUploading}
                              aria-label={`Remove photo ${index + 1}`}
                            >
                              X
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="w-full rounded-2xl h-12 bg-slate-900 text-white text-[15px] font-bold disabled:opacity-50"
                        onClick={() => void uploadAllPhotoDrafts()}
                        disabled={photoBatchUploading || photoDrafts.length === 0}
                      >
                        {photoBatchUploading ? "Uploading..." : "Upload All Photos"}
                      </button>
                    </div>
                  ) : null}

                  {photoStatus && <p className="text-[15px] font-semibold text-slate-700 text-center leading-snug">{photoStatus}</p>}
                  {photoBatchProgress ? (
                    <p className="text-[15px] text-center font-semibold text-slate-700">{photoBatchProgress.label}</p>
                  ) : null}
                  {uploadProgress !== null && (
                    <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                      <div
                        className="bg-green-600 h-3 rounded-full transition-all"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  )}
                  {uploadProgress !== null && (
                    <p className="text-[14px] text-center text-slate-500">{uploadProgress}%</p>
                  )}

                  <div
                    className={`${
                      videoDraft || videoStatus || videoUploadProgress !== null
                        ? "rounded-2xl border border-slate-200 bg-white p-2.5 space-y-2"
                        : "hidden"
                    }`}
                  >
                    {videoDraft ? (
                      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-2">
                        <video
                          src={videoDraft.previewUrl}
                          className="w-full max-h-56 rounded-xl bg-slate-950"
                          controls
                          playsInline
                          preload="metadata"
                        />
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[15px] font-bold text-slate-900">
                              {videoDraft.name || "Selected video"}
                            </p>
                            <p className="text-[14px] font-semibold text-slate-600">
                              Duration: {formatVideoDuration(videoDraft.durationSeconds) || "confirmed"}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-[14px] font-bold text-slate-800 disabled:opacity-50"
                            onClick={clearVideoDraft}
                            disabled={videoUploading}
                          >
                            Remove
                          </button>
                        </div>
                        <button
                          type="button"
                          className="w-full rounded-2xl h-12 bg-slate-900 text-white text-[15px] font-bold disabled:opacity-50"
                          onClick={() => void uploadSelectedVideo()}
                          disabled={videoUploading}
                        >
                          {videoUploading ? "Uploading video..." : "Upload Video"}
                        </button>
                      </div>
                    ) : null}

                    {videoStatus ? (
                      <p className="text-[15px] text-center font-semibold text-slate-700 leading-snug">{videoStatus}</p>
                    ) : null}
                    {videoUploadProgress !== null ? (
                      <>
                        <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                          <div
                            className="bg-slate-800 h-3 rounded-full transition-all"
                            style={{ width: `${videoUploadProgress}%` }}
                          />
                        </div>
                        <p className="text-[14px] text-center text-slate-500">{videoUploadProgress}%</p>
                      </>
                    ) : null}
                  </div>
                </div>

                {!(clockLocationEnabled || clockLocationPermissionState === "granted") ? (
                  <button
                    type="button"
                    className="w-full rounded-2xl h-11 border border-slate-300 bg-white text-[15px] font-black text-slate-800"
                    onClick={() => void handleEnableClockLocation()}
                  >
                    Enable Location
                  </button>
                ) : null}

                <Button
                  className="w-full rounded-2xl h-12 sm:h-14 text-[16px] font-bold"
                  onClick={handleClockIn}
                >
                  ✅ Clock In
                </Button>
                {renderClockListActionRow()}
                {locationStatus && !isClockSetupWarningStatus && (
                  <p className="text-[14px] text-slate-600 text-center">{locationStatus}</p>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "clock" && visibleCurrentShift && (
            <Card className="rounded-3xl shadow-sm border-green-100 bg-green-50">
              <CardContent className="p-3 flex flex-col gap-2">
                {isProfileArchived && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-950 leading-snug">
                    Your account is archived. Please contact your supervisor. You can still clock out this shift.
                  </div>
                )}
                <div className="text-center py-2">
                  <p className="text-[15px] font-semibold text-slate-600">Live Timer</p>
                  <p className="text-5xl sm:text-6xl font-black tabular-nums leading-none mt-0.5">{formatTimer(liveSeconds)}</p>
                  <p className="text-lg sm:text-xl font-bold mt-0.5 text-green-700">{formatMoney(liveEarnings)}</p>
                  <p className="text-[14px] font-medium text-slate-500">Money earned</p>
                </div>

                {isChangingTask ? (
                  <div className="space-y-1.5">
                    <select
                      className="w-full rounded-2xl border py-2 px-2 text-[15px] h-11"
                      value={projectId}
                      onChange={(e) => {
                        if (e.target.value === "__add_project__") {
                          openProjectManagementFromClock("project");
                          return;
                        }
                        handleProjectChange(e.target.value);
                      }}
                    >
                      <option value="__add_project__">+ Add project</option>
                      {clockSelectableProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="w-full rounded-2xl border py-2 px-2 text-[15px] h-11"
                      value={costCenter}
                      disabled={!clockSelectedProject}
                      onChange={(e) => {
                        if (e.target.value === "__add_cost_centre__") {
                          openProjectManagementFromClock("costCentre");
                          return;
                        }
                        setCostCenter(e.target.value);
                      }}
                    >
                      <option value="__add_cost_centre__">+ Add cost center</option>
                      {clockCostCentresActive.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    {clockCostCentresActive.length === 0 && (
                      <p className="text-[14px] font-medium text-amber-800 leading-snug">
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
                        className="h-11 rounded-xl text-[15px] font-bold"
                        disabled={clockCostCentresActive.length === 0 || !costCenter}
                        onClick={applyTaskChange}
                      >
                        Save
                      </Button>
                      <Button className="h-11 rounded-xl text-[15px] font-bold" onClick={() => setIsChangingTask(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div ref={photoToolsRef} className="rounded-2xl border border-green-200 bg-white/80 p-2 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          className={`w-full rounded-2xl h-12 border text-center text-[15px] font-black transition disabled:opacity-50 ${
                            photoCameraOpen && photoCameraMode === "photo"
                              ? "border-slate-950 bg-white text-slate-950 shadow-inner ring-2 ring-slate-950/20"
                              : "border-slate-900 bg-slate-900 text-white"
                          }`}
                          onClick={() => {
                            if (photoCameraOpen && photoCameraMode === "photo") {
                              stopPhotoCamera();
                            } else if (photoCameraOpen) {
                              stopVideoRecording();
                              setPhotoCameraMode("photo");
                              setPhotoStatus("Camera ready. Capture photos, then upload all.");
                              scrollClockMediaIntoView("upload");
                            } else {
                              void startPhotoCamera({ allowFallback: false, mode: "photo" });
                            }
                          }}
                          disabled={photoBatchUploading}
                          aria-pressed={photoCameraOpen && photoCameraMode === "photo"}
                        >
                          Camera
                        </button>
                        <button
                          type="button"
                          className={`block w-full rounded-2xl h-12 border text-center text-[15px] font-black transition disabled:opacity-50 ${
                            photoCameraOpen && photoCameraMode === "receipt"
                              ? "border-green-900 bg-white text-green-900 shadow-inner ring-2 ring-green-900/20"
                              : "border-green-700 bg-green-700 text-white"
                          }`}
                          onClick={() => {
                            if (photoCameraOpen && photoCameraMode === "receipt") {
                              stopPhotoCamera();
                            } else if (photoCameraOpen) {
                              stopVideoRecording();
                              setPhotoCameraMode("receipt");
                              setPhotoStatus("Receipt camera ready. Capture receipt.");
                              scrollClockMediaIntoView("upload");
                            } else {
                              void startPhotoCamera({
                                allowFallback: false,
                                mode: "receipt",
                                readyMessage: "Receipt camera ready. Capture receipt.",
                              });
                            }
                          }}
                          disabled={photoBatchUploading || videoRecording || videoUploading}
                          aria-pressed={photoCameraOpen && photoCameraMode === "receipt"}
                        >
                          Receipt
                        </button>
                      </div>

                      <input
                        ref={photoFallbackCameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        className="hidden"
                        onChange={handlePhotoCapture}
                      />

                      {photoCameraError ? (
                        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[15px] font-semibold text-amber-900 leading-snug">
                          {photoCameraError}
                        </p>
                      ) : null}

                      {photoCameraOpen ? (
                        <div ref={photoUploadActionsRef} className="space-y-2">
                          <video
                            ref={photoVideoRef}
                            className="w-full max-h-64 rounded-2xl bg-slate-950 object-cover"
                            playsInline
                            muted
                            autoPlay
                          />
                          <canvas ref={photoCanvasRef} className="hidden" />
                          {photoCameraMode === "receipt" ? (
                            <button
                              type="button"
                              className="w-full rounded-2xl h-12 bg-green-700 text-white text-[16px] font-bold disabled:opacity-50"
                              onClick={() => void captureReceiptFromCamera()}
                              disabled={photoBatchUploading || videoRecording}
                            >
                              Capture Receipt
                            </button>
                          ) : (
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                className="rounded-2xl h-12 bg-slate-900 text-white text-[15px] font-bold disabled:opacity-50"
                                onClick={() => void capturePhotoFromCamera()}
                                disabled={photoBatchUploading || videoRecording}
                              >
                                Capture Photo
                              </button>
                              <button
                                type="button"
                                className={`rounded-2xl h-12 text-[15px] font-bold disabled:opacity-50 ${
                                  videoRecording
                                    ? "bg-red-700 text-white"
                                    : "border border-slate-300 bg-white text-slate-800"
                                }`}
                                onClick={videoRecording ? stopVideoRecording : startVideoRecording}
                                disabled={photoBatchUploading || videoUploading}
                              >
                                {videoRecording ? `Stop ${videoRecordSeconds}s` : "Record Video"}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : null}

                      {photoDrafts.length > 0 ? (
                        <div ref={photoUploadActionsRef} className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[15px] font-bold text-slate-900">
                              Ready to upload: {photoDrafts.length}
                            </p>
                            <button
                              type="button"
                              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-[14px] font-bold text-slate-800 disabled:opacity-50"
                              onClick={clearPhotoDrafts}
                              disabled={photoBatchUploading}
                            >
                              Clear all
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {photoDrafts.map((draft, index) => (
                              <div key={draft.id} className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                                <img src={draft.previewUrl} alt={`Selected photo ${index + 1}`} className="h-20 w-full object-cover" />
                                <span className="absolute left-1 top-1 rounded-full bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                  {index + 1}
                                </span>
                                <button
                                  type="button"
                                  className="absolute right-1 top-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold text-slate-900 shadow disabled:opacity-50"
                                  onClick={() => removePhotoDraft(draft.id)}
                                  disabled={photoBatchUploading}
                                  aria-label={`Remove photo ${index + 1}`}
                                >
                                  X
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            className="w-full rounded-2xl h-12 bg-slate-900 text-white text-[15px] font-bold disabled:opacity-50"
                            onClick={() => void uploadAllPhotoDrafts()}
                            disabled={photoBatchUploading || photoDrafts.length === 0}
                          >
                            {photoBatchUploading ? "Uploading..." : "Upload All Photos"}
                          </button>
                        </div>
                      ) : null}

                      {photoStatus && <p className="text-[15px] font-semibold text-slate-700 text-center leading-snug">{photoStatus}</p>}
                      {photoBatchProgress ? (
                        <p className="text-[15px] text-center font-semibold text-slate-700">{photoBatchProgress.label}</p>
                      ) : null}
                      {uploadProgress !== null && (
                        <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                          <div
                            className="bg-green-600 h-3 rounded-full transition-all"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      )}
                      {uploadProgress !== null && (
                        <p className="text-[14px] text-center text-slate-500">{uploadProgress}%</p>
                      )}

                      <div
                        className={`${
                          videoDraft || videoStatus || videoUploadProgress !== null
                            ? "rounded-2xl border border-slate-200 bg-slate-50 p-2.5 space-y-2"
                            : "hidden"
                        }`}
                      >
                        {videoDraft ? (
                          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-2">
                            <video
                              src={videoDraft.previewUrl}
                              className="w-full max-h-56 rounded-xl bg-slate-950"
                              controls
                              playsInline
                              preload="metadata"
                            />
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-[15px] font-bold text-slate-900">
                                  {videoDraft.name || "Selected video"}
                                </p>
                                <p className="text-[14px] font-semibold text-slate-600">
                                  Duration: {formatVideoDuration(videoDraft.durationSeconds) || "confirmed"}
                                </p>
                              </div>
                              <button
                                type="button"
                                className="shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-[14px] font-bold text-slate-800 disabled:opacity-50"
                                onClick={clearVideoDraft}
                                disabled={videoUploading}
                              >
                                Remove
                              </button>
                            </div>
                            <button
                              type="button"
                              className="w-full rounded-2xl h-12 bg-slate-900 text-white text-[15px] font-bold disabled:opacity-50"
                              onClick={() => void uploadSelectedVideo()}
                              disabled={videoUploading}
                            >
                              {videoUploading ? "Uploading video..." : "Upload Video"}
                            </button>
                          </div>
                        ) : null}

                        {videoStatus ? (
                          <p className="text-[15px] text-center font-semibold text-slate-700 leading-snug">{videoStatus}</p>
                        ) : null}
                        {videoUploadProgress !== null ? (
                          <>
                            <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                              <div
                                className="bg-slate-800 h-3 rounded-full transition-all"
                                style={{ width: `${videoUploadProgress}%` }}
                              />
                            </div>
                            <p className="text-[14px] text-center text-slate-500">{videoUploadProgress}%</p>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="hidden">
                      <label className="block w-full rounded-2xl h-9 bg-slate-900 text-white text-center leading-9 text-xs sm:text-sm font-semibold cursor-pointer">
                        📷 Photo
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoCapture} />
                      </label>
                      <label className="block w-full rounded-2xl h-9 bg-green-700 text-white text-center leading-9 text-xs sm:text-sm font-semibold cursor-pointer">
                        🧾 Receipt
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleReceiptCapture} />
                      </label>
                    </div>
                    {false && photoStatus && <p className="text-xs text-slate-500 text-center">{photoStatus}</p>}
{false && uploadProgress !== null && (
  <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
    <div
      className="bg-green-600 h-3 rounded-full transition-all"
      style={{ width: `${uploadProgress}%` }}
    />
  </div>
)}

{false && uploadProgress !== null && (
  <p className="text-xs text-center text-slate-500">{uploadProgress}%</p>
)}
                    <div className="grid grid-cols-2 gap-1.5">
                      <Button className="w-full rounded-2xl h-12 text-[15px] font-bold" onClick={handleChangeTask}>🔄 Change Task</Button>
                      <Button className="w-full rounded-2xl h-12 text-[15px] font-bold" onClick={handleBreak}>☕ {!visibleCurrentShift.breakStart ? "Break" : !visibleCurrentShift.breakEnd ? "End Break" : "Done"}</Button>
                    </div>
                    {!(clockLocationEnabled || clockLocationPermissionState === "granted") ? (
                      <button
                        type="button"
                        className="w-full rounded-2xl h-11 border border-slate-300 bg-white text-[15px] font-black text-slate-800"
                        onClick={() => void handleEnableClockLocation()}
                      >
                        Enable Location
                      </button>
                    ) : null}
                    <Button className="w-full rounded-2xl h-12 text-[16px] font-bold" onClick={handleClockOut}>🚪 Clock Out</Button>
                    {renderClockListActionRow()}
                    {locationStatus && (
                      <p className="text-[14px] text-slate-600 text-center pt-0.5">{locationStatus}</p>
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
                    <h2 className="font-bold text-xl">My Timesheet</h2>
                    <p className="text-[14px] text-slate-500">
                      {isAdmin ? "All timesheets for this company" : "Only your submitted timesheets"}
                    </p>
                  </div>
                </div>
                {timesheetsLoading && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[14px] text-slate-600 mb-3">
                    Loading timesheets…
                  </div>
                )}
                {timesheetsError && (
                  <div className="rounded-2xl bg-amber-50 border border-amber-100 p-3 text-[14px] text-amber-900 mb-3">
                    Could not load timesheets from the server. Showing saved offline copy if available.<br />
                    <span className="text-[13px] text-amber-800">{timesheetsError}</span>
                  </div>
                )}
                <div className="mb-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: "day", label: "Day" },
                      { id: "week", label: "Week" },
                      { id: "range", label: "Range" },
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        className={`rounded-xl py-2.5 text-[14px] font-bold ${
                          timesheetViewMode === mode.id
                            ? "bg-slate-900 text-white"
                            : "bg-white text-slate-800 border border-slate-200"
                        }`}
                        onClick={() => setTimesheetViewMode(mode.id)}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                  {timesheetViewMode === "range" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1 text-[13px] font-semibold text-slate-700">
                        From
                        <input
                          type="date"
                          className="w-full rounded-xl border bg-white px-2 py-2 text-[15px]"
                          value={timesheetDateFrom}
                          onChange={(e) => setTimesheetDateFrom(e.target.value)}
                        />
                      </label>
                      <label className="space-y-1 text-[13px] font-semibold text-slate-700">
                        To
                        <input
                          type="date"
                          className="w-full rounded-xl border bg-white px-2 py-2 text-[15px]"
                          value={timesheetDateTo}
                          onChange={(e) => setTimesheetDateTo(e.target.value)}
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="block space-y-1 text-[13px] font-semibold text-slate-700">
                      {timesheetViewMode === "week" ? "Week containing" : "Date"}
                      <input
                        type="date"
                        className="w-full rounded-xl border bg-white px-2 py-2 text-[15px]"
                        value={timesheetDateKey}
                        onChange={(e) => setTimesheetDateKey(e.target.value)}
                      />
                    </label>
                  )}
                  {timesheetRangeBounds.from && timesheetRangeBounds.to && (
                    <p className="text-[13px] font-medium text-slate-600">
                      Showing {timesheetRangeBounds.from === timesheetRangeBounds.to
                        ? timesheetRangeBounds.from
                        : `${timesheetRangeBounds.from} to ${timesheetRangeBounds.to}`}
                    </p>
                  )}
                </div>
                <div className="space-y-3">
                  {!timesheetsLoading && visibleTimesheetRecords.length === 0 && (
                    <p className="text-[15px] text-slate-500 text-center py-8">No timesheet records for this selection.</p>
                  )}
                  {visibleTimesheetRecords.map((record) => renderTimesheetCard(record, true))}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "photos" && (
            <Card className="rounded-3xl shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div>
                  <h2 className="font-bold text-lg">Project Photos</h2>
                  <p className="text-sm text-slate-500">Open, select, and share project photos.</p>
                </div>
                <select className="w-full rounded-2xl border p-3 text-[15px] font-semibold" value={selectedPhotoFolder} onChange={(event) => setSelectedPhotoFolder(event.target.value)}>
                  <option value="all">All Project Folders</option>
                  {photoFolders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
                </select>
                {photoShareMessage ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[14px] font-semibold text-slate-700">
                    {photoShareMessage}
                  </div>
                ) : null}
                {photoFolders.length === 0 && <p className="text-sm text-slate-500 text-center py-8">No project photos yet.</p>}
                <div className="space-y-4">
                  {visiblePhotoFolders.map((folder) => {
                    const folderItems = scopedProjectPhotos[folder] || [];
                    const selectedIds = new Set((selectedPhotoIdsByFolder[folder] || []).map(String));
                    const allSelected = folderItems.length > 0 && folderItems.every((item, index) => selectedIds.has(mediaItemId(item, index)));
                    return (
                      <div key={folder} className="rounded-2xl border bg-white p-4 space-y-3">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[17px] font-bold text-slate-900 break-words">{folder}</p>
                              <p className="text-sm text-slate-500">
                                {folderItems.length} media · {selectedIds.size} selected
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              className="rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-[14px] font-bold text-slate-900"
                              onClick={() => setAllProjectPhotosSelected(folder, !allSelected)}
                            >
                              {allSelected ? "Clear selected" : "Select all in project"}
                            </button>
                            <button
                              type="button"
                              className="rounded-2xl bg-slate-900 px-3 py-2.5 text-[14px] font-bold text-white disabled:opacity-50"
                              onClick={() => void shareProjectFolder(folder)}
                              disabled={selectedIds.size === 0}
                            >
                              Share selected
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {folderItems.map((photo, index) => {
                            const itemId = mediaItemId(photo, index);
                            const selected = selectedIds.has(itemId);
                            const isVideoMedia = isVideoMediaItem(photo);
                            const mediaUrl = mediaItemUrl(photo);
                            return (
                              <div key={itemId} className={`rounded-xl overflow-hidden border bg-slate-50 ${selected ? "border-slate-900 ring-2 ring-slate-900/15" : "border-slate-200"}`}>
                                <div className="relative">
                                  <button
                                    type="button"
                                    className="block w-full text-left"
                                    onClick={() => openPhotoViewer(folder, index)}
                                  >
                                    {isVideoMedia ? (
                                      <video
                                        src={mediaUrl}
                                        className="w-full h-32 bg-slate-950 object-cover"
                                        muted
                                        playsInline
                                        preload="metadata"
                                      />
                                    ) : (
                                      <img src={mediaUrl} alt="Project" className="w-full h-32 object-cover" />
                                    )}
                                  </button>
                                  <label className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-xl bg-white/95 shadow-sm">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4"
                                      checked={selected}
                                      onChange={() => togglePhotoSelected(folder, itemId)}
                                      aria-label="Select photo"
                                    />
                                  </label>
                                </div>
                                <div className="p-2 text-[12px] text-slate-600">
                                  <p className="font-semibold text-slate-900 truncate">{photo.employee || "Employee"}</p>
                                  <p className="truncate">{photo.costCenter || "No cost centre"}</p>
                                  <p>{photo.capturedAt ? formatDate(new Date(photo.capturedAt), companyTimeZone) : ""}</p>
                                  {isVideoMedia ? (
                                    <p>Video{photo.durationSeconds || photo.duration_seconds ? ` - ${formatVideoDuration(photo.durationSeconds || photo.duration_seconds)}` : ""}</p>
                                  ) : null}
                                  {photo.location ? (
                                    <button className="underline text-blue-700 font-semibold" onClick={() => openMap(photo.location)}>Map</button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
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
                              {receipt.dataUrl ? (
                                <img src={receipt.dataUrl} alt="Receipt" className="w-full h-36 object-cover" />
                              ) : (
                                <div className="flex h-36 items-center justify-center bg-slate-100 px-4 text-center text-[14px] font-bold text-slate-500">
                                  Receipt pending
                                </div>
                              )}
                              <div className="p-3 text-xs text-slate-600 space-y-1">
                                <div className="flex justify-between"><p className="font-semibold">{receipt.category}</p><p className="font-bold text-slate-900">{formatMoney(receipt.amount)}</p></div>
                                {receipt.supplier ? <p>Supplier: {receipt.supplier}</p> : null}
                                <p>{receipt.employee} • {receipt.costCenter}</p>
                                {receipt.status || receipt.receiptStatus ? (
                                  <p className="inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-800">
                                    {receipt.status || receipt.receiptStatus}
                                  </p>
                                ) : null}
                                <p>{formatDate(new Date(receipt.capturedAt), companyTimeZone)}</p>
                                {receipt.location ? (
                                  <button className="underline text-blue-700 font-semibold" onClick={() => openMap(receipt.location)}>Map</button>
                                ) : null}
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

          {activeTab === "lists" && (
            <Card className="rounded-[28px] border border-slate-200/80 bg-white shadow-[0_18px_38px_rgba(15,23,42,0.08)] overflow-hidden">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-start justify-between gap-3 rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                  <div className="min-w-0">
                    <h2 className="text-[24px] font-black leading-tight text-slate-950">List</h2>
                    <p className="mt-1 text-[14px] font-bold text-slate-500">
                      Project task and material lists
                    </p>
                  </div>
                  {canUndoListPage ? (
                    <button
                      type="button"
                      className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-black text-slate-800 active:bg-white"
                      onClick={restoreLastClockListItem}
                      aria-label="Undo last completed item"
                    >
                      Undo
                    </button>
                  ) : null}
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm space-y-3">
                  <label className="block space-y-1 text-[12px] font-black uppercase tracking-wide text-slate-500">
                    Project
                    <select
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-[16px] font-black text-slate-950 outline-none focus:border-slate-400 focus:bg-white"
                      value={effectiveListProjectId}
                      onChange={(event) => setListSelectedProjectId(event.target.value)}
                    >
                      {listProjectOptions.length === 0 ? (
                        <option value="">No projects available</option>
                      ) : (
                        listProjectOptions.map((project) => (
                          <option key={String(project.id ?? project.name)} value={String(project.id ?? "")}>
                            {project.name || "Unnamed project"}
                          </option>
                        ))
                      )}
                    </select>
                  </label>

                  <label className="block space-y-1 text-[12px] font-black uppercase tracking-wide text-slate-500">
                    List type
                    <select
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-[16px] font-black text-slate-950 outline-none focus:border-slate-400 focus:bg-white"
                      value={listType}
                      onChange={(event) => {
                        setListType(event.target.value === "material" ? "material" : "task");
                        setListDraft("");
                        setListImageDraft(null);
                      }}
                    >
                      <option value="task">Task List</option>
                      <option value="material">Material List</option>
                    </select>
                  </label>

                  <form onSubmit={addListPageItem} className="rounded-[22px] border border-slate-200 bg-slate-50 p-2.5 space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-[16px] font-bold text-slate-950 outline-none focus:border-slate-400"
                        value={listDraft}
                        onChange={(event) => setListDraft(event.target.value)}
                        placeholder={listType === "material" ? "Add material" : "Add task"}
                        disabled={!selectedListProject}
                      />
                      <button
                        type="submit"
                        className="shrink-0 rounded-2xl bg-slate-950 px-4 py-3 text-[15px] font-black text-white shadow-[0_10px_18px_rgba(15,23,42,0.16)] disabled:opacity-50"
                        disabled={!selectedListProject || !String(listDraft || "").trim()}
                      >
                        Add
                      </button>
                    </div>
                    {listType === "task" ? (
                      <div className="flex items-center gap-2">
                        <input
                          ref={listPhotoInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => void handleListImagePick(event)}
                        />
                        <button
                          type="button"
                          className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-black text-slate-800 active:bg-slate-100"
                          onClick={() => listPhotoInputRef.current?.click()}
                          disabled={!selectedListProject}
                        >
                          {listImageDraft ? "Change picture" : "Add picture"}
                        </button>
                        {listImageDraft ? (
                          <>
                            <img
                              src={listImageDraft.dataUrl}
                              alt=""
                              className="h-11 w-11 rounded-2xl border border-slate-200 object-cover shadow-sm"
                            />
                            <button
                              type="button"
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-black text-slate-500 active:bg-slate-100"
                              onClick={() => setListImageDraft(null)}
                            >
                              Remove
                            </button>
                          </>
                        ) : (
                          <p className="min-w-0 flex-1 text-[12px] font-bold text-slate-500">
                            Optional task photo
                          </p>
                        )}
                      </div>
                    ) : null}
                  </form>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-black uppercase tracking-wide text-slate-500">
                        {listType === "material" ? "Material List" : "Task List"}
                      </p>
                      <p className="mt-0.5 truncate text-[14px] font-black text-slate-950">
                        {selectedListProject?.name || "Select a project"}
                      </p>
                    </div>
                    {canUndoListPage ? (
                      <button
                        type="button"
                        className="shrink-0 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-black text-slate-800 active:bg-slate-50"
                        onClick={restoreLastClockListItem}
                        aria-label="Undo last completed item"
                      >
                        Undo
                      </button>
                    ) : null}
                  </div>
                  {visibleProjectListItems.length === 0 ? (
                    <p className="px-3 py-5 text-center text-[14px] font-bold text-slate-500">
                      {selectedListProject ? "No items yet." : "Select a project to see the list."}
                    </p>
                  ) : (
                    visibleProjectListItems.map((item) => {
                      const imageUrl = listItemImageUrl(item);
                      return (
                        <div
                          key={`${item.sourceKey}-${item.id}`}
                          className="flex items-center gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0 active:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            className="h-6 w-6 shrink-0 rounded border-slate-300 accent-emerald-600"
                            onChange={() => completeListPageItem(item.sourceKey, item.id)}
                            aria-label={`Complete ${item.text}`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-[16px] font-black leading-snug text-slate-950">
                              {item.text}
                            </p>
                            {item.sourceCostCenter && item.sourceCostCenter !== "project" ? (
                              <p className="mt-0.5 text-[12px] font-bold text-slate-500">
                                {item.sourceCostCenter}
                              </p>
                            ) : null}
                          </div>
                          {imageUrl ? (
                            <button
                              type="button"
                              className="shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm"
                              onClick={() =>
                                setListImageViewer({
                                  imageUrl,
                                  title: item.text,
                                  subtitle: [selectedListProject?.name, item.sourceCostCenter]
                                    .filter(Boolean)
                                    .join(" - "),
                                })
                              }
                              aria-label={`View picture for ${item.text}`}
                            >
                              <img src={imageUrl} alt="" className="h-16 w-16 object-cover" />
                            </button>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "notifications" && (
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
            <Card className="rounded-[28px] border border-slate-200/80 bg-white shadow-[0_22px_48px_rgba(15,23,42,0.10)] overflow-hidden">
              <CardContent className="p-3 sm:p-5 space-y-3">
                <div className="flex items-start justify-between gap-3 rounded-[24px] border border-slate-100 bg-gradient-to-br from-white via-white to-slate-50 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                  <div className="min-w-0">
                    <h2 className="text-[22px] font-black leading-tight tracking-normal text-slate-950">Employees</h2>
                    <p className="mt-1 text-[15px] font-semibold text-slate-500">Live Dashboard</p>
                  </div>
                  <div className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-700">
                    <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]" />
                    Live
                  </div>
                </div>
                {!userCompany?.id || !companyChecked ? (
                  <p className="text-[15px] text-slate-600 rounded-xl border border-slate-200 bg-slate-50 p-3">Company not loaded. Please wait…</p>
                ) : null}
                {dashboardActionFeedback && (
                  <div
                    className={`rounded-xl border p-3 text-[14px] ${
                      dashboardActionFeedback.type === "success"
                        ? "border-green-100 bg-green-50 text-green-900"
                        : "border-red-100 bg-red-50 text-red-800"
                    }`}
                  >
                    {dashboardActionFeedback.text}
                  </div>
                )}
                {userCompany?.id && companyChecked ? (
                  <div className="rounded-[26px] border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 p-3 sm:p-4 space-y-3 min-w-0 shadow-[0_16px_34px_rgba(15,23,42,0.08)]">
                    <div className="hidden">
                      <h3 className="text-[17px] font-bold text-slate-900">Live team</h3>
                      <p className="hidden">
                        <span className="text-slate-600 font-medium">Currently Working: </span>
                        <span className="font-bold tabular-nums text-slate-900">
                          {dashboardLoading ? "—" : (dashboardLiveWorkingCards || []).length}
                        </span>
                      </p>
                    </div>
                    {dashboardLiveLocationsLoading ? (
                      <p className="text-[14px] text-slate-600">Refreshing live GPS…</p>
                    ) : null}
                    {dashboardLiveLocationsError ? (
                      <p className="text-[14px] text-amber-800">{String(dashboardLiveLocationsError)}</p>
                    ) : null}
                    {dashboardLoading ? (
                      <p className="text-[14px] text-slate-600">Loading active employees…</p>
                    ) : null}
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="flex min-h-[76px] flex-col justify-between rounded-[20px] bg-slate-950 p-3 text-white shadow-[0_12px_22px_rgba(15,23,42,0.22)]">
                        <p className="text-[9px] font-black uppercase tracking-wide text-slate-300">Working</p>
                        <p className="text-[25px] font-black tabular-nums leading-none">
                          {dashboardLoading ? "..." : (dashboardLiveWorkingCards || []).length}
                        </p>
                      </div>
                      <div className="flex min-h-[76px] flex-col justify-between rounded-[20px] border border-slate-200 bg-white p-3 shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-wide">Hours</p>
                        <p className="text-[clamp(15px,4vw,19px)] font-black text-slate-950 tabular-nums leading-none whitespace-nowrap">
                          {formatDuration(dashboardSummary.totalMinutes)}
                        </p>
                      </div>
                      <div className="flex min-h-[76px] flex-col justify-between rounded-[20px] border border-slate-200 bg-white p-3 shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-wide">Labour</p>
                        <p className="text-[clamp(14px,3.7vw,18px)] font-black text-slate-950 tabular-nums leading-none whitespace-nowrap">
                          {formatMoney(dashboardSummary.totalCost)}
                        </p>
                      </div>
                    </div>
                    {!dashboardLoading &&
                      (dashboardLiveWorkingCards || []).map((card) => {
                        const { rep, uid, displayName } = card || {};
                        if (!rep || !uid) return null;
                        const timerSeconds = rep?.clockIn
                          ? Math.max(
                              0,
                              Math.floor(
                                ((now instanceof Date ? now.getTime() : new Date(now).getTime()) -
                                  parseStoredInstant(rep.clockIn).getTime()) /
                                  1000
                              )
                            )
                          : 0;
                        const clockInDisp = rep?.clockIn ? formatTime(rep.clockIn, companyTimeZone) : "—";
                        const liveLoc = dashboardLiveLocationByUserId?.[String(uid)];
                        const latRaw = liveLoc?.latitude ?? liveLoc?.lat;
                        const lngRaw = liveLoc?.longitude ?? liveLoc?.lng;
                        const hasLiveGps =
                          latRaw != null &&
                          lngRaw != null &&
                          Number.isFinite(Number(latRaw)) &&
                          Number.isFinite(Number(lngRaw));
                        const hasClockInGps = false;
                        const ciLoc = null;
                        return (
                          <div
                            key={`live-${String(uid)}`}
                            className="rounded-[22px] border border-slate-200 bg-white p-3.5 space-y-3 min-w-0 max-w-full shadow-[0_14px_28px_rgba(15,23,42,0.08)]"
                          >
                            <div className="min-w-0">
                              <p className="text-[17px] font-black text-slate-950 leading-snug break-words flex items-start justify-between gap-3">
                                {displayName || "—"}
                                <span className="shrink-0 rounded-full bg-slate-950 px-3 py-1.5 text-[13px] font-black tabular-nums text-white shadow-[0_8px_16px_rgba(15,23,42,0.20)]">{formatTimer(timerSeconds)}</span>
                              </p>
                              <p className="mt-1 text-[14px] font-bold text-slate-500 leading-snug tabular-nums">
                                Clocked in {clockInDisp}
                              </p>
                              <p className="mt-2 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-[15px] font-bold text-slate-700 leading-snug break-words">
                                {[rep?.project || "No project", rep?.costCenter || "No cost centre"].join(" - ")}
                              </p>
                            </div>
                            <div className="hidden">
                              <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
                                <p className="text-[12px] font-bold uppercase tracking-wide text-slate-500">Timer</p>
                                <p className="text-[19px] font-black tabular-nums text-slate-900">{formatTimer(timerSeconds)}</p>
                              </div>
                              <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
                                <p className="text-[12px] font-bold uppercase tracking-wide text-slate-500">Clocked in</p>
                                <p className="text-[15px] font-bold tabular-nums text-slate-900">{clockInDisp}</p>
                                {null}
                              </div>
                            </div>
                            {hasLiveGps ? (
                              <button
                                type="button"
                                className="w-fit rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-[14px] font-black text-blue-700 shadow-sm"
                                onClick={() => openMap({ latitude: Number(latRaw), longitude: Number(lngRaw) })}
                              >
                                Live location
                              </button>
                            ) : null}
                            <div className="hidden">
                              {hasLiveGps ? (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold text-slate-700">Live location</span>
                                  <button
                                    type="button"
                                    className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-blue-800 font-bold shrink-0"
                                    onClick={() =>
                                      openMap({ latitude: Number(latRaw), longitude: Number(lngRaw) })
                                    }
                                  >
                                    Open map
                                  </button>
                                </div>
                              ) : hasClockInGps ? (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold text-slate-700">Clock-in location</span>
                                  <button
                                    type="button"
                                    className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-blue-800 font-bold shrink-0"
                                    onClick={() =>
                                      openMap({
                                        latitude: Number(ciLoc.latitude),
                                        longitude: Number(ciLoc.longitude),
                                      })
                                    }
                                  >
                                    Open map
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
                      <div className="rounded-[22px] border border-dashed border-slate-200 bg-white px-4 py-6 text-center shadow-sm">
                        <p className="text-[15px] font-bold text-slate-700">No employees currently clocked in.</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="hidden">
                  <label className="text-[14px] font-medium text-slate-700" htmlFor="dashboard-view-date">
                    Date
                  </label>
                  <input
                    id="dashboard-view-date"
                    type="date"
                    className="w-full rounded-xl border bg-white px-3 py-2.5 text-[15px]"
                    value={dashboardViewDate}
                    onChange={(e) => setDashboardViewDate(e.target.value)}
                    disabled={!dashboardViewDate}
                  />
                  {false && dashboardSelectedDateLabel && (
                    <p className="text-[14px] text-slate-600">
                      Selected (company time): {dashboardSelectedDateLabel}
                    </p>
                  )}
                </div>
                {dashboardLoading && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[14px] text-slate-600">
                    Loading dashboard…
                  </div>
                )}
                {dashboardError && (
                  <div className="rounded-2xl bg-amber-50 border border-amber-100 p-3 text-[14px] text-amber-900">{dashboardError}</div>
                )}
                {!dashboardLoading && !dashboardError && (
                  <>
                    <div className="hidden">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                        <p className="text-[12px] font-bold text-slate-500 uppercase tracking-wide">Clocked In</p>
                        <p className="text-[20px] font-bold text-slate-900 tabular-nums">{dashboardSummary.clockedIn}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                        <p className="text-[12px] font-bold text-slate-500 uppercase tracking-wide">Total Hours</p>
                        <p className="text-[20px] font-bold text-slate-900 tabular-nums leading-tight">
                          {formatDuration(dashboardSummary.totalMinutes)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                        <p className="text-[12px] font-bold text-slate-500 uppercase tracking-wide">Labour Cost</p>
                        <p className="text-[20px] font-bold text-slate-900 tabular-nums leading-tight">
                          {formatMoney(dashboardSummary.totalCost)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                        <p className="text-[12px] font-bold text-slate-500 uppercase tracking-wide">Missing Clock-out</p>
                        <p className="text-[20px] font-bold text-slate-900 tabular-nums">{dashboardSummary.missingOut}</p>
                      </div>
                    </div>
                    <div className="hidden">
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
            <Card className="rounded-[28px] border border-slate-200/80 bg-white shadow-[0_18px_38px_rgba(15,23,42,0.08)] overflow-hidden">
              <CardContent className="p-3 sm:p-5 space-y-3">
                <div className="rounded-[22px] border border-slate-200 bg-white p-2.5 space-y-2 shadow-sm">
                  <div className="grid grid-cols-3 gap-1.5">
                    {reportsQuickRangeOptions.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`rounded-xl px-2 py-2 text-[11px] font-black border transition-colors leading-tight ${
                          reportsRangePreset === p.id
                            ? "bg-slate-950 text-white border-slate-950 shadow-[0_8px_14px_rgba(15,23,42,0.18)]"
                            : "bg-slate-50 text-slate-800 border-slate-200 active:bg-white"
                        }`}
                        onClick={() => {
                          const { from, to } = computeReportsQuickRange(p.id, new Date(), companyTimeZone);
                          if (from && to) {
                            setReportsDateFrom(from);
                            setReportsDateTo(to);
                            setReportsRangePreset(p.id);
                            setReportsDrillStack([]);
                            setReportsDrillViewBy("project");
                          }
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="block min-w-0 space-y-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
                      Date from
                      <input
                        type="date"
                        className="block h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2 text-[12px] font-black text-slate-950 outline-none [color-scheme:light] focus:border-slate-400 focus:bg-white"
                        value={reportsDateFrom}
                        onChange={(e) => {
                          setReportsDateFrom(e.target.value);
                          setReportsRangePreset(null);
                          setReportsDrillStack([]);
                          setReportsDrillViewBy("project");
                        }}
                      />
                    </label>
                    <label className="block min-w-0 space-y-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
                      Date to
                      <input
                        type="date"
                        className="block h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2 text-[12px] font-black text-slate-950 outline-none [color-scheme:light] focus:border-slate-400 focus:bg-white"
                        value={reportsDateTo}
                        onChange={(e) => {
                          setReportsDateTo(e.target.value);
                          setReportsRangePreset(null);
                          setReportsDrillStack([]);
                          setReportsDrillViewBy("project");
                        }}
                      />
                    </label>
                  </div>
                </div>

                {reportsAvailableDims.length ? (
                  <div className="rounded-[22px] border border-slate-200 bg-white p-2.5 shadow-sm">
                    <label className="block space-y-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
                      View by
                      <select
                        className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-[16px] font-black text-slate-950 outline-none focus:border-slate-400 focus:bg-white"
                        value={reportsCurrentViewBy}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (reportsAvailableDims.includes(v)) setReportsDrillViewBy(v);
                        }}
                      >
                        {reportsAvailableDims.map((dim) => (
                          <option key={dim} value={dim}>
                            {reportsViewLabel(dim)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}

                <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                        Reports
                      </p>
                      <h2 className="mt-1 text-[23px] font-black leading-tight tracking-normal text-slate-950 break-words">
                        {reportsCurrentTitle}
                      </h2>
                    </div>
                    {reportsSafeDrillStack.length ? (
                      <button
                        type="button"
                        className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-black text-slate-800 shadow-sm active:bg-white"
                        onClick={() => {
                          const next = reportsSafeDrillStack.slice(0, -1);
                          setReportsDrillStack(next);
                          const remaining = REPORT_DIMS.filter((dim) => !new Set(next.map((step) => step.dim)).has(dim));
                          setReportsDrillViewBy(remaining[0] || "project");
                        }}
                      >
                        Back
                      </button>
                    ) : (
                      <div className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] font-black text-slate-700">
                        {reportsTotalEntries} entries
                      </div>
                    )}
                  </div>
                </div>

                {reportsScreenLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-[14px] font-bold text-slate-600">
                    Loading reports...
                  </div>
                ) : null}
                {reportsScreenError ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-[14px] font-bold text-amber-900 leading-snug break-words">
                    {reportsScreenError}
                  </div>
                ) : null}
                {!reportsScreenLoading && !reportsScreenError && reportsDateFrom && reportsDateTo && reportsDateFrom > reportsDateTo ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-3 text-[14px] font-bold text-red-800 leading-snug">
                    Date from must be before Date to.
                  </div>
                ) : null}

                {!reportsScreenLoading && !reportsScreenError && reportsDateFrom && reportsDateTo && reportsDateFrom <= reportsDateTo ? (
                  <>
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-3 shadow-sm">
                      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2">
                        <p className="text-[12px] font-black uppercase tracking-wide text-slate-500">Current total</p>
                        <p className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-slate-600">
                          {reportsSafeDrillStack.length ? "Filtered" : "All entries"}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-3">
                        <div className="rounded-2xl bg-white px-3 py-3">
                          <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Hours</p>
                          <p className="mt-1 text-[22px] font-black tabular-nums leading-none text-slate-950">
                            {formatDuration(reportsVisibleSummary.minutes)}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-white px-3 py-3">
                          <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Amount</p>
                          <p className="mt-1 text-[22px] font-black tabular-nums leading-none text-slate-950">
                            {formatMoney(reportsVisibleSummary.cost)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-white shadow-sm overflow-hidden">
                      <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                          {reportsCurrentViewBy === "project"
                            ? "Project"
                            : reportsCurrentViewBy === "employee"
                              ? "Employee"
                              : "Cost center"}
                        </p>
                        <p className="text-right text-[11px] font-black uppercase tracking-wide text-slate-500">
                          Hours / Amount
                        </p>
                      </div>
                      {reportsCurrentGroups.length === 0 ? (
                        <p className="rounded-2xl bg-slate-50 px-3 py-4 text-center text-[14px] font-bold text-slate-500">
                          {reportsAvailableDims.length ? "No detail in this view." : "No more breakdown levels."}
                        </p>
                      ) : (
                        reportsCurrentGroups.map((row) => {
                          const nextStack = [
                            ...reportsSafeDrillStack,
                            { dim: reportsCurrentViewBy, key: row.key, label: row.label },
                          ];
                          const remainingAfterClick = REPORT_DIMS.filter(
                            (dim) => !new Set(nextStack.map((step) => step.dim)).has(dim)
                          );
                          const canDrill = remainingAfterClick.length > 0;
                          const Tag = canDrill ? "button" : "div";
                          return (
                            <Tag
                              key={`${reportsCurrentViewBy}-${row.key}`}
                              type={canDrill ? "button" : undefined}
                              className="w-full border-b border-slate-100 bg-white px-3 py-3 text-left last:border-b-0 active:bg-slate-50"
                              onClick={
                                canDrill
                                  ? () => {
                                      setReportsDrillStack(nextStack);
                                      setReportsDrillViewBy(remainingAfterClick[0]);
                                    }
                                  : undefined
                              }
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-[16px] font-black leading-snug text-slate-950 break-words">{row.label}</p>
                                  <p className="mt-1 text-[12px] font-bold text-slate-500">
                                    {row.rows.length} entries{canDrill ? " - details" : ""}
                                  </p>
                                </div>
                                <div className="shrink-0 text-right">
                                  <p className="text-[15px] font-black tabular-nums text-slate-950">{formatDuration(row.minutes)}</p>
                                  <p className="mt-1 text-[13px] font-bold tabular-nums text-slate-500">{formatMoney(row.cost)}</p>
                                </div>
                              </div>
                            </Tag>
                          );
                        })
                      )}
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>
          )}

          {false && activeTab === "reports" && isAdmin && (
            <Card className="rounded-[28px] border border-slate-200/80 bg-white shadow-[0_22px_48px_rgba(15,23,42,0.10)] overflow-hidden">
              <CardContent className="p-3 sm:p-5 space-y-3">
                <div className="rounded-[24px] border border-slate-100 bg-gradient-to-br from-white via-white to-slate-50 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-[24px] font-black leading-none tracking-normal text-slate-950">
                        {reportsDrillPage === "employee"
                          ? reportsSelectedEmployee?.label || "Employee"
                          : reportsDrillPage === "project"
                            ? reportsSelectedProject?.label || "Project"
                            : "Reports"}
                      </h2>
                      <p className="mt-2 text-[14px] font-bold text-slate-500">{reportsDateRangeLabel}</p>
                    </div>
                    {reportsDrillPage === "main" ? (
                      <div className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-black text-slate-700 shadow-sm">
                        {reportsTotalEntries} entries
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="shrink-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-black text-slate-800 shadow-sm"
                        onClick={() => {
                          if (reportsDrillPage === "employee") {
                            setReportsDrillPage("project");
                            setReportsSelectedEmployee(null);
                          } else {
                            setReportsDrillPage("main");
                            setReportsSelectedProject(null);
                            setReportsSelectedEmployee(null);
                          }
                        }}
                      >
                        Back
                      </button>
                    )}
                  </div>
                </div>

                {reportsDrillPage === "main" ? (
                  <div className="rounded-[22px] border border-slate-200 bg-white p-3 space-y-3 shadow-sm">
                    <div className="grid grid-cols-4 gap-1.5">
                      {reportsQuickRangeOptions.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className={`rounded-2xl px-2 py-2.5 text-[12px] font-black border transition-colors leading-tight ${
                            reportsRangePreset === p.id
                              ? "bg-slate-950 text-white border-slate-950 shadow-[0_8px_14px_rgba(15,23,42,0.18)]"
                              : "bg-slate-50 text-slate-800 border-slate-200 active:bg-white"
                          }`}
                          onClick={() => {
                            const { from, to } = computeReportsQuickRange(p.id, new Date(), companyTimeZone);
                            if (from && to) {
                              setReportsDateFrom(from);
                              setReportsDateTo(to);
                              setReportsRangePreset(p.id);
                              setReportsDrillPage("main");
                              setReportsSelectedProject(null);
                              setReportsSelectedEmployee(null);
                            }
                          }}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1 text-[12px] font-black uppercase tracking-wide text-slate-500">
                        From
                        <input
                          type="date"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[15px] font-bold text-slate-950"
                          value={reportsDateFrom}
                          onChange={(e) => {
                            setReportsDateFrom(e.target.value);
                            setReportsRangePreset(null);
                            setReportsDrillPage("main");
                            setReportsSelectedProject(null);
                            setReportsSelectedEmployee(null);
                          }}
                        />
                      </label>
                      <label className="space-y-1 text-[12px] font-black uppercase tracking-wide text-slate-500">
                        To
                        <input
                          type="date"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[15px] font-bold text-slate-950"
                          value={reportsDateTo}
                          onChange={(e) => {
                            setReportsDateTo(e.target.value);
                            setReportsRangePreset(null);
                            setReportsDrillPage("main");
                            setReportsSelectedProject(null);
                            setReportsSelectedEmployee(null);
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ) : null}

                {reportsScreenLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-[14px] font-bold text-slate-600">
                    Loading reports...
                  </div>
                ) : null}
                {reportsScreenError ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-[14px] font-bold text-amber-900 leading-snug break-words">
                    {reportsScreenError}
                  </div>
                ) : null}
                {!reportsScreenLoading && !reportsScreenError && reportsDateFrom && reportsDateTo && reportsDateFrom > reportsDateTo ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-3 text-[14px] font-bold text-red-800 leading-snug">
                    Date from must be before Date to.
                  </div>
                ) : null}

                {!reportsScreenLoading && !reportsScreenError && reportsDateFrom && reportsDateTo && reportsDateFrom <= reportsDateTo ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2 rounded-[24px] bg-slate-950 px-4 py-4 text-white shadow-[0_16px_28px_rgba(15,23,42,0.24)]">
                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-300">Total hours</p>
                        <p className="mt-2 text-[34px] font-black tabular-nums leading-none">
                          {formatDuration(
                            reportsDrillPage === "employee"
                              ? reportsSelectedEmployeeSummary.minutes
                              : reportsDrillPage === "project"
                                ? reportsSelectedProjectSummary.minutes
                                : reportsAggregates.totalMinutes
                          )}
                        </p>
                      </div>
                      <div className="rounded-[22px] border border-slate-200 bg-white px-3 py-3 shadow-sm">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wide">Labour</p>
                        <p className="mt-1 text-[20px] font-black text-slate-950 tabular-nums leading-tight">
                          {formatMoney(
                            reportsDrillPage === "employee"
                              ? reportsSelectedEmployeeSummary.cost
                              : reportsDrillPage === "project"
                                ? reportsSelectedProjectSummary.cost
                                : reportsAggregates.totalCost
                          )}
                        </p>
                      </div>
                      <div className="rounded-[22px] border border-slate-200 bg-white px-3 py-3 shadow-sm">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wide">Missing out</p>
                        <p className="mt-1 text-[20px] font-black text-slate-950 tabular-nums leading-tight">
                          {reportsDrillPage === "employee"
                            ? reportsSelectedEmployeeSummary.missingOut
                            : reportsDrillPage === "project"
                              ? reportsSelectedProjectSummary.missingOut
                              : reportsAggregates.missingOut}
                        </p>
                      </div>
                    </div>

                    {reportsDrillPage === "main" ? (
                      <>
                        <div className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm">
                          <label className="block space-y-1 text-[12px] font-black uppercase tracking-wide text-slate-500">
                            Group by
                            <select
                              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-[16px] font-black text-slate-950"
                              value={reportsMainGroupBy}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (!REPORT_DIMS.includes(v)) return;
                                setReportsLevel1(v);
                                setReportsLevel2("none");
                                setReportsLevel3("none");
                                setReportsDrillPage("main");
                                setReportsSelectedProject(null);
                                setReportsSelectedEmployee(null);
                              }}
                            >
                              <option value="project">Project</option>
                              <option value="employee">Employee</option>
                              <option value="cost_center">Cost Centre</option>
                            </select>
                          </label>
                        </div>

                        <div className="space-y-2">
                          {reportsMainGroups.length === 0 ? (
                            <p className="rounded-2xl bg-slate-50 px-3 py-4 text-center text-[14px] font-bold text-slate-500">
                              No timesheets in this range.
                            </p>
                          ) : (
                            reportsMainGroups.map((row) => {
                              const canOpenProject = reportsMainGroupBy === "project";
                              const Tag = canOpenProject ? "button" : "div";
                              return (
                                <Tag
                                  key={row.key}
                                  type={canOpenProject ? "button" : undefined}
                                  className="w-full rounded-[22px] border border-slate-200 bg-white p-3 text-left shadow-sm"
                                  onClick={
                                    canOpenProject
                                      ? () => {
                                          setReportsSelectedProject({ key: row.key, label: row.label });
                                          setReportsSelectedEmployee(null);
                                          setReportsProjectGroupBy("employee");
                                          setReportsDrillPage("project");
                                        }
                                      : undefined
                                  }
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[17px] font-black leading-snug text-slate-950 break-words">{row.label}</p>
                                      <p className="mt-1 text-[13px] font-bold text-slate-500">
                                        {row.rows.length} entries{canOpenProject ? " - tap for details" : ""}
                                      </p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <p className="text-[15px] font-black tabular-nums text-slate-950">{formatDuration(row.minutes)}</p>
                                      <p className="text-[13px] font-bold tabular-nums text-slate-500">{formatMoney(row.cost)}</p>
                                    </div>
                                  </div>
                                </Tag>
                              );
                            })
                          )}
                        </div>
                      </>
                    ) : null}

                    {reportsDrillPage === "project" ? (
                      <>
                        <div className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm">
                          <label className="block space-y-1 text-[12px] font-black uppercase tracking-wide text-slate-500">
                            Group project by
                            <select
                              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-[16px] font-black text-slate-950"
                              value={reportsProjectGroupBy}
                              onChange={(e) => {
                                const v = e.target.value;
                                setReportsProjectGroupBy(v === "cost_center" ? "cost_center" : "employee");
                                setReportsSelectedEmployee(null);
                              }}
                            >
                              <option value="employee">Employee</option>
                              <option value="cost_center">Cost Centre</option>
                            </select>
                          </label>
                        </div>
                        <div className="space-y-2">
                          {reportsProjectGroups.length === 0 ? (
                            <p className="rounded-2xl bg-slate-50 px-3 py-4 text-center text-[14px] font-bold text-slate-500">
                              No detail in this project.
                            </p>
                          ) : (
                            reportsProjectGroups.map((row) => {
                              const canOpenEmployee = reportsProjectGroupBy === "employee";
                              const Tag = canOpenEmployee ? "button" : "div";
                              return (
                                <Tag
                                  key={row.key}
                                  type={canOpenEmployee ? "button" : undefined}
                                  className="w-full rounded-[22px] border border-slate-200 bg-white p-3 text-left shadow-sm"
                                  onClick={
                                    canOpenEmployee
                                      ? () => {
                                          setReportsSelectedEmployee({ key: row.key, label: row.label });
                                          setReportsDrillPage("employee");
                                        }
                                      : undefined
                                  }
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[17px] font-black leading-snug text-slate-950 break-words">{row.label}</p>
                                      <p className="mt-1 text-[13px] font-bold text-slate-500">
                                        {row.rows.length} entries{canOpenEmployee ? " - tap for cost centres" : ""}
                                      </p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <p className="text-[15px] font-black tabular-nums text-slate-950">{formatDuration(row.minutes)}</p>
                                      <p className="text-[13px] font-bold tabular-nums text-slate-500">{formatMoney(row.cost)}</p>
                                    </div>
                                  </div>
                                </Tag>
                              );
                            })
                          )}
                        </div>
                      </>
                    ) : null}

                    {reportsDrillPage === "employee" ? (
                      <div className="space-y-2">
                        <div className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm">
                          <p className="text-[12px] font-black uppercase tracking-wide text-slate-500">Project</p>
                          <p className="mt-1 text-[17px] font-black text-slate-950">{reportsSelectedProject?.label || "Project"}</p>
                        </div>
                        {reportsEmployeeCostCenterGroups.length === 0 ? (
                          <p className="rounded-2xl bg-slate-50 px-3 py-4 text-center text-[14px] font-bold text-slate-500">
                            No cost centre detail for this employee.
                          </p>
                        ) : (
                          reportsEmployeeCostCenterGroups.map((row) => (
                            <div key={row.key} className="rounded-[22px] border border-slate-200 bg-white p-3 shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-[17px] font-black leading-snug text-slate-950 break-words">{row.label}</p>
                                  <p className="mt-1 text-[13px] font-bold text-slate-500">{row.rows.length} entries</p>
                                </div>
                                <div className="shrink-0 text-right">
                                  <p className="text-[15px] font-black tabular-nums text-slate-950">{formatDuration(row.minutes)}</p>
                                  <p className="text-[13px] font-bold tabular-nums text-slate-500">{formatMoney(row.cost)}</p>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </CardContent>
            </Card>
          )}

          {false && activeTab === "reports" && isAdmin && (
            <Card className="rounded-[28px] border border-slate-200/80 bg-white shadow-[0_22px_48px_rgba(15,23,42,0.10)] overflow-hidden">
              <CardContent className="p-3 sm:p-5 space-y-3">
                <div className="rounded-[24px] border border-slate-100 bg-gradient-to-br from-white via-white to-slate-50 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-[24px] font-black leading-none tracking-normal text-slate-950">Reports</h2>
                      <p className="mt-2 text-[14px] font-bold text-slate-500">{reportsDateRangeLabel}</p>
                    </div>
                    <div className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-black text-slate-700 shadow-sm">
                      {reportsTotalEntries} entries
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1 rounded-[18px] border border-slate-200 bg-slate-50 p-1 shadow-inner">
                  {[
                    { id: "overview", label: "Overview" },
                    { id: "detail", label: "Detailed" },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      className={`rounded-2xl py-2.5 text-[15px] font-black transition ${
                        reportsViewMode === mode.id
                          ? "bg-slate-950 text-white shadow-[0_10px_18px_rgba(15,23,42,0.18)]"
                          : "text-slate-700 active:bg-white"
                      }`}
                      onClick={() => setReportsViewMode(mode.id)}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                <div className="rounded-[22px] border border-slate-200 bg-white p-3 space-y-3 shadow-sm">
                  <div className="grid grid-cols-4 gap-1.5">
                    {reportsQuickRangeOptions.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`rounded-2xl px-2 py-2.5 text-[12px] font-black border transition-colors leading-tight ${
                          reportsRangePreset === p.id
                            ? "bg-slate-950 text-white border-slate-950 shadow-[0_8px_14px_rgba(15,23,42,0.18)]"
                            : "bg-slate-50 text-slate-800 border-slate-200 active:bg-white"
                        }`}
                        onClick={() => {
                          const { from, to } = computeReportsQuickRange(p.id, new Date(), companyTimeZone);
                          if (from && to) {
                            setReportsDateFrom(from);
                            setReportsDateTo(to);
                            setReportsRangePreset(p.id);
                            setReportsExpandedL1({});
                            setReportsExpandedL2({});
                          }
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1 text-[12px] font-black uppercase tracking-wide text-slate-500">
                      From
                      <input
                        type="date"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[15px] font-bold text-slate-950"
                        value={reportsDateFrom}
                        onChange={(e) => {
                          setReportsDateFrom(e.target.value);
                          setReportsRangePreset(null);
                          setReportsExpandedL1({});
                          setReportsExpandedL2({});
                        }}
                      />
                    </label>
                    <label className="space-y-1 text-[12px] font-black uppercase tracking-wide text-slate-500">
                      To
                      <input
                        type="date"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[15px] font-bold text-slate-950"
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
                {!reportsScreenLoading && !reportsScreenError && reportsDateFrom && reportsDateTo && reportsDateFrom > reportsDateTo ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-3 text-[14px] font-bold text-red-800 leading-snug">
                    Date from must be before Date to.
                  </div>
                ) : null}
                {!reportsScreenLoading && !reportsScreenError && reportsDateFrom && reportsDateTo && reportsDateFrom <= reportsDateTo && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2 rounded-[24px] bg-slate-950 px-4 py-4 text-white shadow-[0_16px_28px_rgba(15,23,42,0.24)]">
                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-300">Total hours</p>
                        <p className="mt-2 text-[34px] font-black tabular-nums leading-none">
                          {formatDuration(reportsAggregates.totalMinutes)}
                        </p>
                      </div>
                      <div className="rounded-[22px] border border-slate-200 bg-white px-3 py-3 shadow-sm">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wide">Labour</p>
                        <p className="mt-1 text-[20px] font-black text-slate-950 tabular-nums leading-tight">
                          {formatMoney(reportsAggregates.totalCost)}
                        </p>
                      </div>
                      <div className="rounded-[22px] border border-slate-200 bg-white px-3 py-3 shadow-sm">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wide">Missing out</p>
                        <p className="mt-1 text-[20px] font-black text-slate-950 tabular-nums leading-tight">{reportsAggregates.missingOut}</p>
                      </div>
                    </div>
                    {reportsViewMode === "overview" ? (
                      <div className="space-y-3">
                        <div className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-[18px] font-black text-slate-950 leading-tight">Project view</h3>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
                              Top hours
                            </span>
                          </div>
                          {reportsTopProjects.length === 0 ? (
                            <p className="rounded-2xl bg-slate-50 px-3 py-4 text-center text-[14px] font-bold text-slate-500">
                              No timesheets in this range.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {reportsTopProjects.map((row) => {
                                const pct = Math.max(7, Math.round((Number(row.minutes || 0) / reportsTopProjectMax) * 100));
                                return (
                                  <div key={row.key} className="rounded-2xl border border-slate-100 bg-slate-50 p-3 space-y-2">
                                    <div className="flex items-start justify-between gap-3">
                                      <p className="min-w-0 flex-1 text-[15px] font-black leading-snug text-slate-950 break-words">{row.project}</p>
                                      <div className="shrink-0 text-right">
                                        <p className="text-[14px] font-black tabular-nums text-slate-950">{formatDuration(row.minutes)}</p>
                                        <p className="text-[12px] font-bold tabular-nums text-slate-500">{formatMoney(row.cost)}</p>
                                      </div>
                                    </div>
                                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-[18px] font-black text-slate-950 leading-tight">Team view</h3>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
                              {reportsTopEmployees.length} people
                            </span>
                          </div>
                          {reportsTopEmployees.length === 0 ? (
                            <p className="rounded-2xl bg-slate-50 px-3 py-4 text-center text-[14px] font-bold text-slate-500">
                              No employee hours in this range.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {reportsTopEmployees.map((row) => (
                                <div key={row.key} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                                  <p className="min-w-0 flex-1 truncate text-[15px] font-black text-slate-950">{row.name || "Employee"}</p>
                                  <div className="shrink-0 text-right">
                                    <p className="text-[14px] font-black tabular-nums text-slate-950">{formatDuration(row.minutes)}</p>
                                    <p className="text-[12px] font-bold tabular-nums text-slate-500">{formatMoney(row.cost)}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-[18px] font-black text-slate-950 leading-tight">Build report</h3>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
                              Drill down
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <label className="space-y-1 text-[11px] font-black uppercase tracking-wide text-slate-500 min-w-0">
                              Group
                              <select
                                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-2 py-2.5 text-[13px] font-bold text-slate-950 min-w-0"
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
                            <label className="space-y-1 text-[11px] font-black uppercase tracking-wide text-slate-500 min-w-0">
                              Split
                              <select
                                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-2 py-2.5 text-[13px] font-bold text-slate-950 min-w-0"
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
                                    {reportDimensionLabel(d)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="space-y-1 text-[11px] font-black uppercase tracking-wide text-slate-500 min-w-0">
                              Detail
                              <select
                                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-2 py-2.5 text-[13px] font-bold text-slate-950 min-w-0 disabled:bg-slate-100 disabled:text-slate-400"
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
                                    {reportDimensionLabel(d)}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </div>

                        <div className="space-y-2">
                      <div className="flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-[18px] font-black text-slate-950 leading-tight">Breakdown</h3>
                          <p className="mt-1 text-[13px] font-bold text-slate-500 leading-snug">
                            {[
                              reportDimensionLabel(reportsBreakdownTree.d1),
                              reportsBreakdownTree.d2 !== "none" ? reportDimensionLabel(reportsBreakdownTree.d2) : "",
                              reportsBreakdownTree.d3 !== "none" ? reportDimensionLabel(reportsBreakdownTree.d3) : "",
                            ].filter(Boolean).join(" / ")}
                          </p>
                          <p className="hidden">
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
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
                          {reportsBreakdownTree.level1Rows.length} rows
                        </span>
                      </div>

                      {reportsBreakdownTree.level1Rows.length === 0 ? (
                        <p className="text-sm text-slate-600 py-1 leading-snug">No timesheets in this range.</p>
                      ) : (
                        <div className="rounded-[24px] border border-slate-200 overflow-x-hidden divide-y divide-slate-100 bg-white min-w-0 shadow-sm">
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
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "schedule" && !isAdmin && (
            <Card className="rounded-[28px] border border-slate-200/80 bg-white shadow-[0_22px_48px_rgba(15,23,42,0.10)] overflow-hidden">
              <CardContent className="p-1.5 sm:p-3 space-y-1.5">
                <div className="space-y-1.5">
                  <div className="rounded-[18px] border border-slate-100 bg-gradient-to-br from-white via-white to-slate-50 px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                    <h2 className="text-[22px] font-black leading-none tracking-normal text-slate-950">Schedule</h2>
                  </div>
                  <button
                    type="button"
                    className="w-full rounded-2xl border border-slate-200 bg-white py-2 px-3 text-[13px] font-bold text-slate-900 shadow-sm relative z-[1] pointer-events-auto"
                    onClick={() => void handleEmployeeRequestNotificationPermission()}
                  >
                    Enable phone notifications
                  </button>
                  {employeeNotifPermMessage ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-[12px] font-semibold text-slate-700">
                      {employeeNotifPermMessage}
                    </div>
                  ) : null}
                  <div className="rounded-[18px] border border-slate-200 bg-white p-1.5 shadow-sm space-y-1">
                    <label className="sr-only" htmlFor="sched-employee-view">
                      View
                    </label>
                    <select
                      id="sched-employee-view"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-1.5 px-3 text-[14px] h-9 font-bold text-slate-950"
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
                    <div className="grid grid-cols-3 gap-1 rounded-[18px] border border-slate-200 bg-slate-50/90 p-1 shadow-inner">
                      <button
                        type="button"
                        className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[12px] font-black text-slate-800 shadow-sm"
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
                        className="rounded-xl bg-slate-950 px-2 py-1.5 text-[12px] font-black text-white shadow-[0_10px_18px_rgba(15,23,42,0.18)]"
                        onClick={() =>
                          setScheduleCalendarAnchor(calendarDateKeyInTimeZone(new Date(), companyTimeZone))
                        }
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[12px] font-black text-slate-800 shadow-sm"
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
                    <div className="w-full min-w-0 overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_12px_24px_rgba(15,23,42,0.07)]">
                      <div className="border-b border-slate-100 bg-gradient-to-br from-white to-slate-50 px-3 py-1.5">
                        <p className="text-center text-[clamp(17px,4.2vw,20px)] font-black text-slate-950">
                          {scheduleMonthGridInfo.monthYearLabel}
                        </p>
                      </div>
                      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-[clamp(8px,2.3vw,10px)] font-black uppercase tracking-wide text-slate-500">
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                          <div key={d} className="py-1 text-center">
                            {d}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 bg-white">
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
                              className={`relative flex min-h-[2.45rem] flex-col gap-0.5 border-b border-r border-slate-100 px-1 py-0.5 text-left outline-none ring-inset transition-colors ${
                                cell.inMonth ? "bg-white active:bg-slate-50" : "bg-slate-50/80 opacity-75"
                              } ${isSel ? "ring-2 ring-[#174ea6]/35" : ""}`}
                            >
                              <div className="flex items-start gap-2">
                                <span
                                  className={`flex h-5 min-w-5 items-center justify-center text-[clamp(12px,3.5vw,15px)] font-black tabular-nums leading-none ${
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
                                    className="truncate rounded bg-gradient-to-br from-[#1a73e8] to-[#1558d6] px-1 py-0.5 text-left text-[9px] font-black leading-none text-white shadow-[0_5px_10px_rgba(26,115,232,0.16)]"
                                  >
                                    {String(task?.task_title ?? "").trim() || "Task"}
                                  </button>
                                ))}
                                {more > 0 ? (
                                  <span className="inline-flex px-0.5 text-[10px] font-bold tabular-nums text-slate-600">
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
                            <div className="sticky top-0 z-30 overflow-hidden rounded-t-[20px] border border-slate-200 border-b-slate-100 bg-white/95 shadow-[0_8px_18px_rgba(15,23,42,0.07)] backdrop-blur">
                              <div className="flex min-w-0">
                                <div className="w-[2.75rem] shrink-0 border-r border-slate-100 bg-slate-50 sm:w-[3rem]" aria-hidden />
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
                                        className="min-w-0 flex-1 px-0.5 py-2 text-center outline-none transition-colors active:bg-slate-50 focus-visible:ring-2 focus-visible:ring-[#174ea6]/40"
                                      >
                                        <span
                                          className={`block text-[11px] font-black uppercase tracking-wide ${
                                            labelAccent ? "text-[#174ea6]" : "text-slate-500"
                                          }`}
                                        >
                                          {wallWeekdayShort(dayKey, companyTimeZone)}
                                        </span>
                                        <span
                                          className={`mx-auto mt-1 flex h-9 min-w-[2.25rem] max-w-[2.25rem] items-center justify-center rounded-xl text-[clamp(15px,4.2vw,18px)] font-black tabular-nums leading-none ${
                                            dayIsToday
                                              ? "bg-[#1a73e8] text-white shadow-[0_10px_18px_rgba(26,115,232,0.25)]"
                                              : daySel
                                                ? "bg-blue-50 text-[#174ea6] ring-1 ring-blue-200"
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
                            <div className="overflow-hidden rounded-b-[20px] border border-t-0 border-slate-200 bg-white shadow-[0_12px_24px_rgba(15,23,42,0.07)]">
                              <div className="flex min-h-0 w-full">
                                <div
                                  className="w-[2.75rem] shrink-0 border-r border-slate-200 bg-slate-50 py-2 pr-1 text-right text-[clamp(11px,3.1vw,13px)] font-semibold tabular-nums leading-none text-slate-500 sm:w-[3rem]"
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
                                <div className="flex min-w-0 flex-1 divide-x divide-slate-100 bg-white">
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
                                            className="pointer-events-none border-b border-slate-100/90 bg-gradient-to-b from-white to-slate-50/35"
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
                                          )} absolute left-[4px] right-[4px] z-[5] overflow-hidden text-left touch-manipulation`;
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
                            {taskList.map((task) => renderEmployeeScheduleListTaskCard(task, dateKey))}
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
            <Card className="rounded-[28px] border border-slate-200/80 bg-white shadow-[0_22px_48px_rgba(15,23,42,0.10)] overflow-hidden">
              <CardContent className="p-1.5 sm:p-3 space-y-1.5">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-[18px] border border-slate-100 bg-gradient-to-br from-white via-white to-slate-50 px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                    <div className="min-w-0">
                      <h2 className="text-[22px] font-black leading-none tracking-normal text-slate-950">
                        Schedule
                      </h2>
                    </div>
                    {!scheduleFormOpen && (
                      <Button
                        type="button"
                        className="shrink-0 rounded-2xl h-10 px-3.5 text-[13px] font-black bg-slate-950 text-white shadow-[0_12px_22px_rgba(15,23,42,0.20)]"
                        onClick={() => {
                          setScheduleSaveError("");
                          setScheduleEditingTaskId(null);
                          setScheduleEditDraft(null);
                          setScheduleEditReturnViewMode("");
                          scheduleEditReturnScrollYRef.current = null;
                          schedulePendingScrollRestoreYRef.current = null;
                          schedulePendingScrollRestoreSawLoadingRef.current = false;
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
                  <div className="rounded-[18px] border border-slate-200 bg-white p-1.5 shadow-sm space-y-1">
                    <label className="sr-only" htmlFor="sched-admin-view">
                      View
                    </label>
                    <select
                      id="sched-admin-view"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-1.5 px-3 text-[14px] h-9 font-bold text-slate-950"
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
                    <div className="grid grid-cols-3 gap-1 rounded-[18px] border border-slate-200 bg-slate-50/90 p-1 shadow-inner">
                      <button
                        type="button"
                        className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[12px] font-black text-slate-800 shadow-sm"
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
                        className="rounded-xl bg-slate-950 px-2 py-1.5 text-[12px] font-black text-white shadow-[0_10px_18px_rgba(15,23,42,0.18)]"
                        onClick={() =>
                          setScheduleCalendarAnchor(calendarDateKeyInTimeZone(new Date(), companyTimeZone))
                        }
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[12px] font-black text-slate-800 shadow-sm"
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
                    className="schedule-task-form rounded-[24px] border border-slate-200 bg-white p-3.5 space-y-3 shadow-[0_16px_34px_rgba(15,23,42,0.08)]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div>
                        <p className="text-[19px] font-black leading-tight text-slate-950">New task</p>
                        <p className="text-[13px] font-semibold text-slate-500">Fill the essentials and save.</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          type="submit"
                          className="rounded-2xl h-10 px-4 text-[15px] font-black shadow-[0_12px_22px_rgba(15,23,42,0.16)]"
                          disabled={scheduleSaving}
                        >
                          {scheduleSaving ? "Saving..." : "Save"}
                        </Button>
                        <button
                          type="button"
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-black text-slate-700"
                          disabled={scheduleSaving}
                          onClick={() => {
                            setScheduleFormOpen(false);
                            setScheduleSaveError("");
                          }}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                    <div className="relative">
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
                        autoComplete="off"
                        disabled={scheduleSaving}
                        required
                      />
                      {scheduleTitleSuggestions.length > 0 ? (
                        <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_30px_rgba(15,23,42,0.16)]">
                          {scheduleTitleSuggestions.map((suggestion) => (
                            <button
                              key={`${suggestion.text}-${suggestion.projectId}-${suggestion.costCenter}`}
                              type="button"
                              className="block w-full border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 active:bg-slate-50"
                              onClick={() => applyScheduleTaskSuggestionToDraft(suggestion)}
                            >
                              <span className="block text-[15px] font-black leading-snug text-slate-950">
                                {suggestion.text}
                              </span>
                              {suggestion.projectName ? (
                                <span className="mt-0.5 block truncate text-[12px] font-bold text-slate-500">
                                  {suggestion.projectName}
                                  {suggestion.costCenter ? ` - ${suggestion.costCenter}` : ""}
                                </span>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-1 gap-2">
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
                          <p className="hidden">Project id: {scheduleDraft.projectId}</p>
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
                          onChange={(e) =>
                            setScheduleDraft((d) => ({
                              ...d,
                              startDate: e.target.value,
                              endDate: d.endTime && (!d.endDate || d.endDate === d.startDate) ? e.target.value : d.endDate,
                            }))
                          }
                          disabled={scheduleSaving}
                          required
                        />
                      </div>
                      <div className="schedule-time-row">
                        <div>
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
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600" htmlFor="sched-end-time-visible">
                            End time
                          </label>
                          <input
                            id="sched-end-time-visible"
                            type="time"
                            className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                            value={scheduleDraft.endTime}
                            onChange={(e) =>
                              setScheduleDraft((d) => ({
                                ...d,
                                endTime: e.target.value,
                                endDate: e.target.value && !d.endDate ? d.startDate : d.endDate,
                              }))
                            }
                            disabled={scheduleSaving}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="hidden">
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
                      <div className="hidden">
                        <label className="block text-[11px] font-medium text-slate-600" htmlFor="sched-end-time">
                          End time
                        </label>
                        <input
                          id="sched-end-time"
                          type="time"
                          className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                          value={scheduleDraft.endTime}
                          onChange={(e) =>
                            setScheduleDraft((d) => ({
                              ...d,
                              endTime: e.target.value,
                              endDate: e.target.value && !d.endDate ? d.startDate : d.endDate,
                            }))
                          }
                          disabled={scheduleSaving}
                        />
                      </div>
                    </div>
                    <div className="hidden">
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
                      <p className="schedule-form-label">Assign employees</p>
                      {schedulePickMembersLoading ? (
                        <p className="text-[11px] text-slate-500">Loading team members…</p>
                      ) : schedulePickMembersError ? (
                        <p className="text-[11px] text-red-700 leading-snug">{schedulePickMembersError}</p>
                      ) : (schedulePickMembers || []).length === 0 ? (
                        <p className="text-[11px] text-slate-600">No employees found.</p>
                      ) : (
                        <div className="schedule-pick-list rounded-lg border border-slate-200 bg-white p-2 max-h-40 overflow-y-auto space-y-1.5">
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
                    <div className="hidden">
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
                        rows={Math.min(
                          5,
                          Math.max(
                            1,
                            String(scheduleDraft.notes || "")
                              .split(/\r?\n/)
                              .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 44)), 0)
                          )
                        )}
                        className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs resize-none min-h-[2.25rem] overflow-hidden"
                        value={scheduleDraft.notes}
                        onChange={(e) => setScheduleDraft((d) => ({ ...d, notes: e.target.value }))}
                        disabled={scheduleSaving}
                      />
                    </div>
                    <div className="hidden">
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
                      <Button type="submit" className="flex-1 rounded-2xl h-12 text-[16px] font-black shadow-[0_12px_22px_rgba(15,23,42,0.16)]" disabled={scheduleSaving}>
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
                    <div className="w-full min-w-0 overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_12px_24px_rgba(15,23,42,0.07)]">
                      <div className="border-b border-slate-100 bg-gradient-to-br from-white to-slate-50 px-3 py-1.5">
                        <p className="text-center text-[clamp(17px,4.2vw,20px)] font-black text-slate-950">
                          {scheduleMonthGridInfo.monthYearLabel}
                        </p>
                      </div>
                      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-[clamp(8px,2.3vw,10px)] font-black uppercase tracking-wide text-slate-500">
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                          <div key={d} className="py-1 text-center">
                            {d}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 bg-white">
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
                              className={`relative flex min-h-[2.45rem] flex-col gap-0.5 border-b border-r border-slate-100 px-1 py-0.5 transition-colors active:bg-slate-50 ${
                                cell.inMonth ? "cursor-pointer bg-white" : "bg-slate-50/80 opacity-75"
                              } ${isSel ? "ring-2 ring-inset ring-[#174ea6]/35" : ""} touch-manipulation`}
                            >
                              <span
                                className={`flex h-5 min-w-5 max-w-fit items-center justify-center text-[clamp(12px,3.5vw,15px)] font-black tabular-nums leading-none ${
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
                                    className={`truncate rounded bg-gradient-to-br from-[#1a73e8] to-[#1558d6] px-1 py-0.5 text-left text-[9px] font-black leading-none text-white shadow-[0_5px_10px_rgba(26,115,232,0.16)] ${
                                      scheduleMoveModeTaskId === String(task?.id ?? "")
                                        ? "ring-2 ring-amber-300 ring-offset-1"
                                        : ""
                                    }`}
                                  >
                                    {String(task?.task_title ?? "").trim() || "Task"}
                                  </button>
                                ))}
                                {more > 0 ? (
                                  <span className="inline-flex px-0.5 text-[10px] font-bold tabular-nums text-slate-600">
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
                            <div className="sticky top-0 z-30 overflow-hidden rounded-t-[20px] border border-slate-200 border-b-slate-100 bg-white/95 shadow-[0_8px_18px_rgba(15,23,42,0.07)] backdrop-blur">
                              <div className="flex min-w-0">
                                <div className="w-[2.75rem] shrink-0 border-r border-slate-100 bg-slate-50 sm:w-[3rem]" aria-hidden />
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
                                        className="min-w-0 flex-1 px-0.5 py-2 text-center outline-none transition-colors active:bg-slate-50 focus-visible:ring-2 focus-visible:ring-[#174ea6]/40"
                                      >
                                        <span
                                          className={`block text-[11px] font-black uppercase tracking-wide ${
                                            labelAccent ? "text-[#174ea6]" : "text-slate-500"
                                          }`}
                                        >
                                          {wallWeekdayShort(dayKey, companyTimeZone)}
                                        </span>
                                        <span
                                          className={`mx-auto mt-1 flex h-9 min-w-[2.25rem] max-w-[2.25rem] items-center justify-center rounded-xl text-[clamp(15px,4.2vw,18px)] font-black tabular-nums leading-none ${
                                            dayIsToday
                                              ? "bg-[#1a73e8] text-white shadow-[0_10px_18px_rgba(26,115,232,0.25)]"
                                              : daySel
                                                ? "bg-blue-50 text-[#174ea6] ring-1 ring-blue-200"
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
                            <div className="overflow-hidden rounded-b-[20px] border border-t-0 border-slate-200 bg-white shadow-[0_12px_24px_rgba(15,23,42,0.07)]">
                              <div className="flex min-h-0 w-full">
                                <div
                                  className="w-[2.75rem] shrink-0 border-r border-slate-200 bg-slate-50 py-2 pr-1 text-right text-[clamp(11px,3.1vw,13px)] font-semibold tabular-nums leading-none text-slate-500 sm:w-[3rem]"
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
                                <div ref={scheduleTimelineColsRef} className="flex min-w-0 flex-1 divide-x divide-slate-100 bg-white">
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
                                            className="pointer-events-none border-b border-slate-100/90 bg-gradient-to-b from-white to-slate-50/35"
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
                                          const liveDrag =
                                            scheduleDragOffset?.active && scheduleDragOffset?.taskId === tidKey
                                              ? scheduleDragOffset
                                              : null;
                                          const blockCls = `${scheduleTimelineBlockClasses(
                                            tone,
                                            compact
                                          )} sched-day-task-block absolute left-[4px] right-[4px] z-[8] overflow-hidden select-none touch-none cursor-grab${
                                            isMoveHighlighted ? " ring-[3px] ring-amber-300 ring-offset-1 ring-offset-white" : ""
                                          }${scheduleDragTaskId === tidKey ? " cursor-grabbing opacity-75" : ""}${
                                            liveDrag ? " shadow-[0_18px_36px_rgba(15,23,42,0.24)] ring-2 ring-blue-200" : ""
                                          }`;
                                          return (
                                            <div
                                              key={String(task.id)}
                                              className={blockCls}
                                              style={{
                                                top: topPx,
                                                height: hPx,
                                                minHeight: compact ? 32 : 40,
                                                opacity: dragging ? 0.55 : 1,
                                                transform: liveDrag
                                                  ? `translate3d(${liveDrag.dx}px, ${liveDrag.dy}px, 0)`
                                                  : undefined,
                                                zIndex: liveDrag ? 60 : undefined,
                                                transition: liveDrag ? "none" : undefined,
                                                willChange: liveDrag ? "transform" : undefined,
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
                              const endDisp = task?.end_time ? formatTime(task.end_time, companyTimeZone) : "—";
                              const employeeSummary = scheduleShortEmployeeSummary(
                                assignRowsForTask,
                                task?.assigned_employee_name
                              );
                              const tidKey = task?.id != null ? String(task.id) : "";
                              const isEditingThis =
                                tidKey && scheduleEditingTaskId === tidKey && scheduleEditDraft != null;
                              const openThisScheduleTaskEdit = () => {
                                setScheduleFormOpen(false);
                                setScheduleSaveError("");
                                setScheduleEditError("");
                                setScheduleEditReturnViewMode("");
                                scheduleEditReturnScrollYRef.current = null;
                                schedulePendingScrollRestoreYRef.current = null;
                                schedulePendingScrollRestoreSawLoadingRef.current = false;
                                setScheduleEditDraft(
                                  buildScheduleEditDraftFromTask(task, assignRowsForTask, companyTimeZone)
                                );
                                setScheduleEditingTaskId(tidKey);
                              };
                              return (
                                <div
                                  key={String(task?.id ?? `${dateKey}-${ttitle}-${startDisp}`)}
                                  role={!isEditingThis ? "button" : undefined}
                                  tabIndex={!isEditingThis ? 0 : undefined}
                                  onClick={(e) => {
                                    if (isEditingThis) return;
                                    const target = e.target;
                                    const el =
                                      target instanceof Element
                                        ? target
                                        : target?.parentNode instanceof Element
                                          ? target.parentNode
                                          : null;
                                    if (el instanceof Element && el.closest("button, a[href], input, select, textarea, label, form")) return;
                                    openThisScheduleTaskEdit();
                                  }}
                                  onKeyDown={(e) => {
                                    if (isEditingThis) return;
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      openThisScheduleTaskEdit();
                                    }
                                  }}
                                  className={`rounded-2xl border border-slate-200 bg-white px-3 py-3.5 space-y-2 shadow-sm min-w-0 ${
                                    !isEditingThis ? "cursor-pointer active:bg-slate-50" : ""
                                  }`}
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[19px] font-extrabold text-slate-950 leading-snug break-words">{ttitle}</p>
                                      {!isEditingThis ? (
                                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[16px] font-semibold text-slate-700 min-w-0">
                                          <span className="shrink-0 tabular-nums">
                                            {startDisp} - {endDisp}
                                          </span>
                                          <span className="text-slate-300">|</span>
                                          <span className="shrink-0 max-w-full truncate text-slate-900">{employeeSummary}</span>
                                        </div>
                                      ) : null}
                                    </div>
                                    <div className="hidden">
                                      <button
                                        type="button"
                                        disabled={
                                          Boolean(scheduleEditSaving) ||
                                          scheduleDeleteSavingId === tidKey ||
                                          Boolean(scheduleRescheduleSavingId)
                                        }
                                        onClick={openThisScheduleTaskEdit}
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
                                      className="schedule-task-form space-y-3 rounded-[22px] border border-slate-200 bg-white p-3.5 shadow-[0_14px_30px_rgba(15,23,42,0.08)]"
                                    >
                                      <div className="hidden">
                                        <p className="text-[19px] font-black leading-tight text-slate-950">Edit task</p>
                                        <p className="text-[13px] font-semibold text-slate-500">Update only what changed.</p>
                                      </div>
                                      <div className="relative">
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
                                          autoComplete="off"
                                          disabled={scheduleEditSaving}
                                          required
                                        />
                                        {scheduleEditTitleSuggestions.length > 0 ? (
                                          <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_30px_rgba(15,23,42,0.16)]">
                                            {scheduleEditTitleSuggestions.map((suggestion) => (
                                              <button
                                                key={`${suggestion.text}-${suggestion.projectId}-${suggestion.costCenter}`}
                                                type="button"
                                                className="block w-full border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 active:bg-slate-50"
                                                onClick={() => applyScheduleTaskSuggestionToEditDraft(suggestion)}
                                              >
                                                <span className="block text-[15px] font-black leading-snug text-slate-950">
                                                  {suggestion.text}
                                                </span>
                                                {suggestion.projectName ? (
                                                  <span className="mt-0.5 block truncate text-[12px] font-bold text-slate-500">
                                                    {suggestion.projectName}
                                                    {suggestion.costCenter ? ` - ${suggestion.costCenter}` : ""}
                                                  </span>
                                                ) : null}
                                              </button>
                                            ))}
                                          </div>
                                        ) : null}
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
                                      <div className="grid grid-cols-1 gap-2">
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
                                                prev
                                                  ? {
                                                      ...prev,
                                                      startDate: e.target.value,
                                                      endDate:
                                                        prev.endTime && (!prev.endDate || prev.endDate === prev.startDate)
                                                          ? e.target.value
                                                          : prev.endDate,
                                                    }
                                                  : prev
                                              )
                                            }
                                            disabled={scheduleEditSaving}
                                            required
                                          />
                                        </div>
                                        <div className="schedule-time-row">
                                          <div>
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
                                          <div>
                                            <label className="block text-[11px] font-medium text-slate-600" htmlFor={`sched-edit-et-visible-${tidKey}`}>
                                              End time
                                            </label>
                                            <input
                                              id={`sched-edit-et-visible-${tidKey}`}
                                              type="time"
                                              className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-xs"
                                              value={scheduleEditDraft.endTime}
                                              onChange={(e) =>
                                                setScheduleEditDraft((prev) =>
                                                  prev
                                                    ? {
                                                        ...prev,
                                                        endTime: e.target.value,
                                                        endDate: e.target.value && !prev.endDate ? prev.startDate : prev.endDate,
                                                      }
                                                    : prev
                                                )
                                              }
                                              disabled={scheduleEditSaving}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <div className="hidden">
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
                                        <div className="hidden">
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
                                                prev
                                                  ? {
                                                      ...prev,
                                                      endTime: e.target.value,
                                                      endDate: e.target.value && !prev.endDate ? prev.startDate : prev.endDate,
                                                    }
                                                  : prev
                                              )
                                            }
                                            disabled={scheduleEditSaving}
                                          />
                                        </div>
                                      </div>
                                      <div className="hidden">
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
                                        <p className="schedule-form-label">Assign employees</p>
                                        {schedulePickMembersLoading ? (
                                          <p className="text-[11px] text-slate-500">Loading…</p>
                                        ) : (schedulePickMembers || []).length === 0 ? (
                                          <p className="text-[11px] text-slate-600">No employees found.</p>
                                        ) : (
                                          <div className="schedule-pick-list max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 space-y-1.5">
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
                                      <div className="hidden">
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
                                      <div className="hidden">
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
                                      <div className="grid grid-cols-2 gap-2 pt-1">
                                        <Button
                                          type="submit"
                                          className="rounded-2xl h-12 text-[17px] font-black shadow-[0_12px_22px_rgba(15,23,42,0.16)]"
                                          disabled={scheduleEditSaving || Boolean(scheduleRescheduleSavingId)}
                                        >
                                          {scheduleEditSaving ? "Saving…" : "Save"}
                                        </Button>
                                        <button
                                          type="button"
                                          disabled={
                                            Boolean(scheduleEditSaving) ||
                                            scheduleDeleteSavingId === tidKey ||
                                            Boolean(scheduleRescheduleSavingId)
                                          }
                                          onClick={() => void handleScheduleDeleteTask(task?.id)}
                                          className="rounded-2xl h-12 text-[17px] font-black border border-red-200 bg-red-50 text-red-800 shadow-sm disabled:opacity-50"
                                        >
                                          {scheduleDeleteSavingId === tidKey ? "Deleting…" : "Delete"}
                                        </button>
                                      </div>
                                      <div className="pt-0.5">
                                        <button
                                          type="button"
                                          disabled={scheduleEditSaving}
                                          onClick={() => {
                                            const returnView = scheduleEditReturnViewMode;
                                            setScheduleEditingTaskId(null);
                                            setScheduleEditDraft(null);
                                            setScheduleEditError("");
                                            restoreScheduleEditReturnView(returnView);
                                          }}
                                          className="w-full rounded-2xl h-11 text-[15px] font-black border border-slate-200 bg-white text-slate-700"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </form>
                                  ) : null}
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
                  <h2 className="font-bold text-xl">Profile</h2>
                  <p className="text-[14px] text-slate-500">Manage company and employee profile details.</p>
                </div>
                <div className="rounded-2xl border bg-white p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[18px] font-black text-slate-900">Company Profile</p>
                      <p className="text-[14px] text-slate-600">Company name and time zone.</p>
                    </div>
                    {isAdmin ? (
                      <button
                        type="button"
                        className="shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-[14px] font-bold text-slate-900"
                        onClick={() => setSettingsCompanyEditOpen((open) => !open)}
                      >
                        {settingsCompanyEditOpen ? "Close" : "Edit"}
                      </button>
                    ) : null}
                  </div>
                  {settingsCompanyEditOpen && isAdmin ? (
                    <form onSubmit={handleSaveCompanyProfile} className="space-y-3">
                      <label className="block space-y-1 text-[14px] font-semibold text-slate-700">
                        Company name
                        <input
                          className="w-full rounded-2xl border bg-white py-2.5 px-3 text-[15px]"
                          value={settingsCompanyNameDraft}
                          onChange={(e) => setSettingsCompanyNameDraft(e.target.value)}
                        />
                      </label>
                      <label className="block space-y-1 text-[14px] font-semibold text-slate-700">
                        Company time zone
                        <select
                          className="w-full rounded-2xl border bg-white py-2.5 px-3 text-[15px]"
                          value={settingsTzDraft}
                          onChange={(e) => setSettingsTzDraft(e.target.value)}
                        >
                          {COMPANY_TIME_ZONE_OPTIONS.map((tz) => (
                            <option key={tz} value={tz}>{tz}</option>
                          ))}
                        </select>
                      </label>
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
                      <Button type="submit" className="w-full rounded-2xl h-12 text-[15px] font-bold" disabled={settingsTzSaving}>
                        {settingsTzSaving ? "Saving..." : "Save Company Profile"}
                      </Button>
                    </form>
                  ) : (
                    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 space-y-2">
                      <div className="flex justify-between gap-3">
                        <span className="text-[14px] font-semibold text-slate-500">Company</span>
                        <span className="text-[15px] font-bold text-slate-900 text-right break-words">{userCompany?.name || "—"}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-[14px] font-semibold text-slate-500">Time zone</span>
                        <span className="text-[15px] font-bold text-slate-900 text-right break-words">{companyTimeZone}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border bg-white p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[18px] font-black text-slate-900">Employee Profile</p>
                      <p className="text-[14px] text-slate-600">Your name and login email.</p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-[14px] font-bold text-slate-900"
                      onClick={() => setSettingsProfileEditOpen((open) => !open)}
                    >
                      {settingsProfileEditOpen ? "Close" : "Edit"}
                    </button>
                  </div>
                  {settingsProfileEditOpen ? (
                    <form onSubmit={handleSaveEmployeeProfile} className="space-y-3">
                      <label className="block space-y-1 text-[14px] font-semibold text-slate-700">
                        Display name
                        <input
                          className="w-full rounded-2xl border bg-white py-2.5 px-3 text-[15px]"
                          value={settingsProfileNameDraft}
                          onChange={(e) => setSettingsProfileNameDraft(e.target.value)}
                        />
                      </label>
                      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3">
                        <p className="text-[13px] font-semibold text-slate-500">Email</p>
                        <p className="text-[15px] font-bold text-slate-900 break-all">{authUser?.email || "—"}</p>
                      </div>
                      {settingsProfileMessage && (
                        <div
                          className={`rounded-2xl border p-3 text-xs ${
                            settingsProfileMessage.includes("saved")
                              ? "bg-green-50 border-green-100 text-green-800"
                              : "bg-red-50 border-red-100 text-red-700"
                          }`}
                        >
                          {settingsProfileMessage}
                        </div>
                      )}
                      <Button type="submit" className="w-full rounded-2xl h-12 text-[15px] font-bold" disabled={settingsProfileSaving}>
                        {settingsProfileSaving ? "Saving..." : "Save Employee Profile"}
                      </Button>
                    </form>
                  ) : (
                    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 space-y-2">
                      <div className="flex justify-between gap-3">
                        <span className="text-[14px] font-semibold text-slate-500">Name</span>
                        <span className="text-[15px] font-bold text-slate-900 text-right break-words">{(profileFullName || "").trim() || "User"}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-[14px] font-semibold text-slate-500">Email</span>
                        <span className="text-[15px] font-bold text-slate-900 text-right break-all">{authUser?.email || "—"}</span>
                      </div>
                    </div>
                  )}
                </div>

                {isAdmin ? (
                  <div className="rounded-2xl border bg-white p-4 space-y-3">
                    <div>
                      <p className="text-[18px] font-black text-slate-900">Team</p>
                      <p className="text-[14px] text-slate-600">Manage employee profiles, roles, pay rates, and status.</p>
                    </div>
                    <Button
                      type="button"
                      className="w-full rounded-2xl h-12 text-[15px] font-bold"
                      onClick={() => setActiveTab("team")}
                    >
                      Open Team
                    </Button>
                  </div>
                ) : null}
                {!isAdmin ? (
                  <p className="text-xs text-slate-500">
                    Ask a supervisor or owner to update company profile details.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          )}
        </div>

        {clockListModal && (
          <div className="fixed inset-0 z-[73] bg-black/50 p-4 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
            <div className="w-full max-w-sm max-h-[86dvh] overflow-hidden rounded-3xl bg-white shadow-2xl flex flex-col">
              <div className="border-b border-slate-200 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[22px] font-black text-slate-950 leading-tight">
                      {clockListModal === "material" ? "Material List" : "Task List"}
                    </p>
                    <p className="mt-1 truncate text-[14px] font-bold text-slate-600">
                      {[clockListContext.projectName, clockListContext.costCenter].filter(Boolean).join(" - ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {canUndoClockListModal ? (
                      <button
                        type="button"
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-black text-slate-800 active:bg-white"
                        onClick={restoreLastClockListItem}
                        aria-label="Undo last completed item"
                      >
                        Undo
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="h-10 w-10 rounded-2xl bg-slate-100 text-[20px] font-black text-slate-700"
                      onClick={() => {
                        setClockListModal(null);
                        setClockListDraft("");
                        setClockListImageDraft(null);
                      }}
                      aria-label="Close list"
                    >
                      X
                    </button>
                  </div>
                </div>

                <form onSubmit={addClockProjectListItem} className="rounded-[22px] border border-slate-200 bg-slate-50 p-2.5 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      autoFocus
                      className="min-w-0 flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-[17px] font-bold text-slate-950 outline-none focus:border-slate-500"
                      value={clockListDraft}
                      onChange={(event) => setClockListDraft(event.target.value)}
                      placeholder={clockListModal === "material" ? "Add material" : "Add task"}
                    />
                    <button
                      type="submit"
                      className="shrink-0 rounded-2xl bg-slate-950 px-5 py-3 text-[15px] font-black text-white shadow-[0_10px_18px_rgba(15,23,42,0.16)] disabled:opacity-50"
                      disabled={!String(clockListDraft || "").trim()}
                    >
                      Add
                    </button>
                  </div>
                  {clockListModal === "task" ? (
                    <div className="flex items-center gap-2">
                      <input
                        ref={clockListPhotoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => void handleClockListImagePick(event)}
                      />
                      <button
                        type="button"
                        className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-black text-slate-800 active:bg-slate-100"
                        onClick={() => clockListPhotoInputRef.current?.click()}
                      >
                        {clockListImageDraft ? "Change picture" : "Add picture"}
                      </button>
                      {clockListImageDraft ? (
                        <>
                          <img
                            src={clockListImageDraft.dataUrl}
                            alt=""
                            className="h-11 w-11 rounded-2xl border border-slate-200 object-cover shadow-sm"
                          />
                          <button
                            type="button"
                            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-black text-slate-500 active:bg-slate-100"
                            onClick={() => setClockListImageDraft(null)}
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <p className="min-w-0 flex-1 text-[12px] font-bold text-slate-500">
                          Optional task photo
                        </p>
                      )}
                    </div>
                  ) : null}
                </form>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
                {activeClockListItems.map((item) => {
                  const imageUrl = listItemImageUrl(item);
                  return (
                    <div
                      key={item.id}
                      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3.5 active:bg-emerald-50"
                    >
                      <input
                        type="checkbox"
                        className="h-6 w-6 shrink-0 rounded border-slate-300 accent-emerald-600"
                        onChange={() => completeClockProjectListItem(clockListModal, item.id)}
                        aria-label={`Complete ${item.text}`}
                      />
                      <p className="min-w-0 flex-1 break-words text-[17px] font-black leading-snug text-slate-950">
                        {item.text}
                      </p>
                      {imageUrl ? (
                        <button
                          type="button"
                          className="shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                          onClick={() =>
                            setListImageViewer({
                              imageUrl,
                              title: item.text,
                              subtitle: [clockListContext.projectName, clockListContext.costCenter]
                                .filter(Boolean)
                                .join(" - "),
                            })
                          }
                          aria-label={`View picture for ${item.text}`}
                        >
                          <img src={imageUrl} alt="" className="h-16 w-16 object-cover" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {materialPaymentOpen && (
          <div className="fixed inset-0 z-[74] bg-black/50 p-4 flex items-center justify-center" role="dialog" aria-modal="true">
            <div className="w-full max-w-sm rounded-3xl bg-white p-4 shadow-2xl space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[19px] font-black text-slate-900">Material payment</p>
                  <p className="text-[14px] font-semibold text-slate-500">
                    {materialPaymentStep === "countdown"
                      ? "Please complete payment using Apple Wallet / Google Wallet, then return here."
                      : "Confirm details before paying."}
                  </p>
                </div>
                <button
                  type="button"
                  className="h-10 w-10 rounded-2xl bg-slate-100 text-[20px] font-black text-slate-700"
                  onClick={cancelMaterialPaymentFlow}
                  aria-label="Cancel material payment"
                >
                  X
                </button>
              </div>

              {materialPaymentStep === "countdown" ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-center">
                    <p className="text-[42px] font-black tabular-nums text-blue-800">{materialPaymentCountdown}</p>
                    <p className="text-[15px] font-bold text-blue-900">Receipt camera opens next</p>
                  </div>
                  <p className="text-[14px] font-semibold text-slate-600 leading-snug">
                    Finish payment, then capture the receipt in this app.
                  </p>
                </div>
              ) : (
                <form onSubmit={startMaterialPaymentCountdown} className="space-y-3">
                  <div className="grid grid-cols-1 gap-2 rounded-2xl bg-slate-50 p-3 text-[13px] font-semibold text-slate-600">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">Project</p>
                      <p className="text-[15px] font-black text-slate-900">{clockMediaContext?.project || "Selected project"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">Cost centre</p>
                      <p className="text-[15px] font-black text-slate-900">{clockMediaContext?.costCenter || "Selected cost centre"}</p>
                    </div>
                  </div>
                  <label className="block space-y-1 text-[14px] font-bold text-slate-700">
                    Supplier / store
                    <input
                      type="text"
                      inputMode="text"
                      autoFocus
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-[18px] font-black text-slate-900"
                      value={materialSupplierDraft}
                      onChange={(event) => setMaterialSupplierDraft(event.target.value)}
                      placeholder="Supplier or store"
                    />
                  </label>
                  <label className="block space-y-1 text-[14px] font-bold text-slate-700">
                    Estimated amount
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-[22px] font-black text-slate-900"
                      value={materialAmountDraft}
                      onChange={(event) => setMaterialAmountDraft(event.target.value)}
                      placeholder="0.00"
                    />
                  </label>
                  <button type="submit" className="w-full rounded-2xl bg-blue-700 py-3 text-[16px] font-black text-white">
                    Continue to payment
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {receiptEntryStep && (
          <div className="fixed inset-0 z-[75] bg-black/50 p-4 flex items-center justify-center" role="dialog" aria-modal="true">
            <div className="w-full max-w-sm rounded-3xl bg-white p-4 shadow-2xl space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[19px] font-black text-slate-900">Add receipt</p>
                  <p className="text-[14px] font-semibold text-slate-500">
                    {receiptEntryStep === "amount"
                      ? materialPaymentPendingRef.current
                        ? "Confirm the receipt amount."
                        : "Enter the receipt amount."
                      : materialPaymentPendingRef.current
                        ? "Confirm supplier/store or material."
                        : "Enter material or category."}
                  </p>
                </div>
                <button
                  type="button"
                  className="h-10 w-10 rounded-2xl bg-slate-100 text-[20px] font-black text-slate-700"
                  onClick={cancelReceiptDetailsForm}
                  disabled={receiptSaving}
                  aria-label="Cancel receipt"
                >
                  X
                </button>
              </div>

              {receiptEntryStep === "amount" ? (
                <form onSubmit={submitReceiptAmount} className="space-y-3">
                  <label className="block space-y-1 text-[14px] font-bold text-slate-700">
                    Amount
                    <input
                      ref={receiptAmountInputRef}
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      autoFocus
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-[22px] font-black text-slate-900"
                      value={receiptAmountDraft}
                      onChange={(event) => setReceiptAmountDraft(event.target.value)}
                      placeholder="0.00"
                    />
                  </label>
                  <button type="submit" className="w-full rounded-2xl bg-slate-900 py-3 text-[16px] font-black text-white">
                    OK
                  </button>
                </form>
              ) : (
                <form onSubmit={(event) => void submitReceiptCategory(event)} className="space-y-3">
                  <label className="block space-y-1 text-[14px] font-bold text-slate-700">
                    {materialPaymentPendingRef.current ? "Supplier / material" : "Material / category"}
                    <input
                      ref={receiptCategoryInputRef}
                      type="text"
                      inputMode="text"
                      autoFocus
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-[20px] font-black text-slate-900"
                      value={receiptCategoryDraft}
                      onChange={(event) => setReceiptCategoryDraft(event.target.value)}
                      placeholder={materialPaymentPendingRef.current ? "Supplier or store" : "Materials"}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="rounded-2xl border border-slate-300 bg-white py-3 text-[15px] font-black text-slate-900"
                      onClick={() => setReceiptEntryStep("amount")}
                      disabled={receiptSaving}
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className="rounded-2xl bg-green-700 py-3 text-[15px] font-black text-white disabled:opacity-50"
                      disabled={receiptSaving}
                    >
                      {receiptSaving ? "Saving..." : "Add receipt"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

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

        {listImageViewer?.imageUrl ? (
          <div className="fixed inset-0 z-[90] bg-black/85 p-3 flex items-center justify-center" role="dialog" aria-modal="true">
            <div className="w-full max-w-sm rounded-3xl bg-white overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-3">
                <div className="min-w-0">
                  <p className="text-[16px] font-black text-slate-900 truncate">
                    {listImageViewer.title || "Task picture"}
                  </p>
                  {listImageViewer.subtitle ? (
                    <p className="text-[13px] font-semibold text-slate-500 truncate">
                      {listImageViewer.subtitle}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="h-10 w-10 rounded-2xl bg-slate-100 text-xl font-black text-slate-700"
                  onClick={() => setListImageViewer(null)}
                  aria-label="Close task picture"
                >
                  ×
                </button>
              </div>
              <div className="bg-slate-950">
                <img
                  src={listImageViewer.imageUrl}
                  alt=""
                  className="w-full max-h-[70dvh] object-contain bg-slate-950"
                />
              </div>
            </div>
          </div>
        ) : null}

        {photoViewer && (() => {
          const items = scopedProjectPhotos[photoViewer.folder] || [];
          if (!items.length) return null;
          const index = Math.max(0, Math.min(Number(photoViewer.index) || 0, items.length - 1));
          const item = items[index];
          const isVideo = isVideoMediaItem(item);
          const url = mediaItemUrl(item);
          return (
            <div className="fixed inset-0 z-[70] bg-black/85 p-3 flex items-center justify-center" role="dialog" aria-modal="true">
              <div className="w-full max-w-sm rounded-3xl bg-white overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-3">
                  <div className="min-w-0">
                    <p className="text-[16px] font-black text-slate-900 truncate">{photoViewer.folder}</p>
                    <p className="text-[13px] font-semibold text-slate-500">{index + 1} of {items.length}</p>
                  </div>
                  <button
                    type="button"
                    className="h-10 w-10 rounded-2xl bg-slate-100 text-xl font-black text-slate-700"
                    onClick={() => setPhotoViewer(null)}
                    aria-label="Close photo viewer"
                  >
                    ×
                  </button>
                </div>
                <div className="bg-slate-950">
                  {isVideo ? (
                    <video src={url} className="w-full max-h-[64dvh] bg-slate-950" controls playsInline />
                  ) : (
                    <img src={url} alt="Project" className="w-full max-h-[64dvh] object-contain bg-slate-950" />
                  )}
                </div>
                <div className="p-3 space-y-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-slate-900 truncate">{item?.employee || "Employee"}</p>
                    <p className="text-[14px] text-slate-600 truncate">{item?.costCenter || "No cost centre"}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="rounded-2xl border border-slate-300 bg-white py-3 text-[15px] font-bold text-slate-900"
                      onClick={() => movePhotoViewer(-1)}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl bg-slate-900 py-3 text-[15px] font-bold text-white"
                      onClick={() => movePhotoViewer(1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {isMenuOpen && (
          <div
            className="fixed inset-0 z-[60] bg-slate-950/45 backdrop-blur-[2px]"
            onClick={() => {
              setIsMenuOpen(false);
              setMenuPanel("main");
            }}
          >
            <div
              className="h-full w-80 max-w-[88vw] bg-slate-50 shadow-2xl p-3 flex flex-col gap-3"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-black text-[22px] tracking-tight leading-tight text-slate-950">
                    {menuPanel === "settings" ? "Settings" : "Menu"}
                  </h2>
                  <p className="text-[13px] font-bold text-slate-500 truncate">{(profileFullName || "").trim() || "User"}</p>
                </div>
                <button
                  type="button"
                  className="h-10 w-10 rounded-2xl bg-slate-100 text-xl font-black text-slate-700"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setMenuPanel("main");
                  }}
                  aria-label="Close menu"
                >
                  ×
                </button>
              </div>

              {menuPanel !== "main" && (
                <button
                  type="button"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-[16px] font-black text-slate-800 shadow-sm"
                  onClick={() => setMenuPanel("main")}
                >
                  ← Back
                </button>
              )}

              <div className="flex-1 min-h-0 overflow-y-auto space-y-2 text-[17px]">
                {menuPanel === "main" && (
                  <>
                    <button
                      type="button"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left font-black text-slate-900"
                      onClick={() => openMenuTab("schedule")}
                    >
                      <span className="block text-[17px] font-black text-slate-950">Schedule</span>
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left font-black text-slate-900 flex items-center justify-between"
                      onClick={() => openMenuTab("timesheet")}
                    >
                      <span className="block text-[17px] font-black text-slate-950">Timesheet</span>
                      <span className="text-slate-400">›</span>
                    </button>
                    <button
                      type="button"
                      className="relative w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left font-black text-slate-900"
                      onClick={openPhotosTab}
                    >
                      Photos
                      {photoNotificationCount > 0 && (
                        <span className="ml-2 rounded-full bg-red-600 text-white text-[11px] px-2 py-0.5 align-middle">
                          {photoNotificationCount}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left font-black text-slate-900"
                      onClick={() => openMenuTab("receipts")}
                    >
                      Receipts
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left font-black text-slate-900"
                      onClick={() => openMenuTab("lists")}
                    >
                      <span className="block text-[17px] font-black text-slate-950">List</span>
                      <span className="block text-[13px] font-bold text-slate-500">Tasks and materials</span>
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left font-black text-slate-900 flex items-center justify-between"
                      onClick={() => setMenuPanel("settings")}
                    >
                      <span>Settings</span>
                      <span className="text-slate-400">›</span>
                    </button>
                  </>
                )}

                {menuPanel === "settings" && (
                  <>
                    <button
                      type="button"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left font-black text-slate-900"
                      onClick={() => openMenuTab("settings")}
                    >
                      Profile
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left font-black text-slate-900"
                          onClick={() => openMenuTab("team")}
                        >
                          Team
                        </button>
                        <button
                          type="button"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left font-black text-slate-900"
                          onClick={() => openMenuTab("projects")}
                        >
                          Projects
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>

              <button
                type="button"
                className="w-full rounded-[22px] border border-red-100 bg-red-50 px-4 py-4 text-left text-[17px] font-black text-red-700 shadow-sm"
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          </div>
        )}

        <div
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm border-t bg-white/95 backdrop-blur px-3 pt-1.5 z-50 shadow-lg pb-[max(0.375rem,env(safe-area-inset-bottom,0px))]"
        >
          <div className="hidden">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab("dashboard")}
                className={`rounded-2xl py-2.5 px-2 text-[15px] font-bold ${activeTab === "dashboard" ? "bg-slate-900 text-white" : "text-slate-500"}`}
              >
                Live
              </button>
            )}
            {!isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab("schedule")}
                className={`rounded-2xl py-2.5 px-2 text-[15px] font-bold ${activeTab === "schedule" ? "bg-slate-900 text-white" : "text-slate-500"}`}
              >
                📅 Schedule
              </button>
            )}
            <button onClick={() => setActiveTab("clock")} className={`rounded-2xl py-2.5 px-2 text-[15px] font-bold ${activeTab === "clock" ? "bg-slate-900 text-white" : "text-slate-500"}`}>⏱ Clock</button>
          </div>
          <div className={`grid ${isAdmin ? "grid-cols-3" : "grid-cols-2"} gap-1.5`}>
            {isAdmin ? (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab("dashboard")}
                  className={`rounded-2xl py-2.5 px-2 text-[15px] font-bold ${activeTab === "dashboard" ? "bg-slate-900 text-white" : "text-slate-500"}`}
                >
                  Live
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("clock")}
                  className={`rounded-2xl py-2.5 px-2 text-[15px] font-bold ${activeTab === "clock" ? "bg-slate-900 text-white" : "text-slate-500"}`}
                >
                  Clock
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("reports")}
                  className={`rounded-2xl py-2.5 px-2 text-[15px] font-bold ${activeTab === "reports" ? "bg-slate-900 text-white" : "text-slate-500"}`}
                >
                  Reports
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab("clock")}
                  className={`rounded-2xl py-2.5 px-2 text-[15px] font-bold ${activeTab === "clock" ? "bg-slate-900 text-white" : "text-slate-500"}`}
                >
                  Clock
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("lists")}
                  className={`rounded-2xl py-2.5 px-2 text-[15px] font-bold ${activeTab === "lists" ? "bg-slate-900 text-white" : "text-slate-500"}`}
                >
                  List
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
