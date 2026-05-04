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
    labour_cost: row.labour_cost != null ? Number(row.labour_cost) : undefined,
    breakStart: null,
    breakEnd: null,
    employeeId: row.user_id,
    projectFolder: projectName ? getProjectFolderName(projectName) : "",
    clockInLocation: null,
    clockOutLocation:
      row.clock_out_latitude != null && row.clock_out_longitude != null
        ? {
            latitude: row.clock_out_latitude,
            longitude: row.clock_out_longitude,
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

function getCurrentLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date().toISOString(),
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 3000,
        maximumAge: 0,
      }
    );
  });
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
    } catch (e) {
      console.error("[NOTIFY] rpc exception", e);
    }
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
  const isAdmin = userCompanyRole === "owner" || userCompanyRole === "supervisor";
  const companyTimeZone = userCompany?.time_zone || "America/Toronto";

  const [settingsTzDraft, setSettingsTzDraft] = useState(DEFAULT_COMPANY_TIME_ZONE);
  const [closingShiftId, setClosingShiftId] = useState(null);
  const [settingsTzMessage, setSettingsTzMessage] = useState("");
  const [settingsTzSaving, setSettingsTzSaving] = useState(false);

  const [teamRows, setTeamRows] = useState([]);
  const [teamDaySheets, setTeamDaySheets] = useState([]);
  const [teamViewDate, setTeamViewDate] = useState("");
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState("");
  const [teamCopyOk, setTeamCopyOk] = useState(false);
  const [teamRoleFeedback, setTeamRoleFeedback] = useState({ type: "", text: "" });
  const [teamRoleSavingId, setTeamRoleSavingId] = useState(null);

  useEffect(() => {
    setSettingsTzDraft(userCompany?.time_zone || "America/Toronto");
  }, [userCompany?.id, userCompany?.time_zone]);

  useEffect(() => {
    if (!userCompany?.id) return;
    setTeamViewDate(calendarDateKeyInTimeZone(new Date(), userCompany.time_zone || DEFAULT_COMPANY_TIME_ZONE));
  }, [userCompany?.id]);

  useEffect(() => {
    if (activeTab !== "team" || !userCompany?.id || !authUser?.id || !teamViewDate) return;
    let cancelled = false;
    setTeamLoading(true);
    setTeamError("");
    setTeamRoleFeedback({ type: "", text: "" });
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
          let { data: profs, error: pErr } = await supabase.from("profiles").select("id, full_name, email, role").in("id", ids);
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
          return {
            memberRowId: m.id,
            userId: m.user_id,
            role: (m.role || "employee").trim(),
            joinedAt: m.created_at ?? null,
            fullName: profileFull,
            profileEmailRaw,
            displayName: displayName || shortUserLabel(m.user_id),
          };
        });

        const dayStartIso = wallDateTimeToUtcIso(teamViewDate, "00:00:00", companyTimeZone);
        const dayEndIso = wallDateTimeToUtcIso(teamViewDate, "23:59:59", companyTimeZone);
        if (!dayStartIso || !dayEndIso) {
          if (!cancelled) {
            setTeamRows(rows);
            setTeamDaySheets([]);
          }
          return;
        }
        let tsQuery = supabase
          .from("timesheets")
          .select("*")
          .eq("company_id", userCompany.id)
          .gte("clock_in", dayStartIso)
          .lte("clock_in", dayEndIso)
          .order("clock_in", { ascending: false });
        if (!isAdmin) {
          tsQuery = tsQuery.eq("user_id", authUser.id);
        }
        const { data: tsData, error: tsErr } = await tsQuery;
        if (tsErr) throw tsErr;
        const mappedTs = (tsData || []).map(mapTimesheetRowFromSupabase);
        const dateFiltered = mappedTs.filter(
          (r) => calendarDateKeyInTimeZone(r.clockIn, companyTimeZone) === teamViewDate
        );

        if (!cancelled) {
          setTeamRows(rows);
          setTeamDaySheets(dateFiltered);
        }
      } catch (err) {
        if (!cancelled) {
          setTeamError(getErrorMessage(err));
          setTeamRows([]);
          setTeamDaySheets([]);
        }
      } finally {
        if (!cancelled) setTeamLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, userCompany?.id, authUser?.id, teamViewDate, companyTimeZone, isAdmin]);

  const teamProfileFullNameByUserId = useMemo(() => {
    const m = {};
    teamRows.forEach((r) => {
      const fn = (r.fullName && String(r.fullName).trim()) || "";
      if (r.userId != null && fn) m[r.userId] = fn;
    });
    return m;
  }, [teamRows]);

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

      if (userCompanyRole === "employee") {
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
  }, [authUser?.id, userCompany?.id, userCompanyRole]);

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

  const selectedProject =
    effectiveProjects.find((project) => String(project.id) === String(projectId)) ||
    effectiveProjects[0] ||
    { id: adminProjects[0].id, name: adminProjects[0].name };

  const getWorkedMinutes = (record) => {
    const total = minutesBetween(record.clockIn, record.clockOut || new Date());
    const breakTotal = record.breakStart && record.breakEnd ? minutesBetween(record.breakStart, record.breakEnd) : 0;
    return Math.max(0, total - breakTotal);
  };

  const getLabourCost = (record) => {
    const hours = getWorkedMinutes(record) / 60;
    const rate = Number(record.hourlyRate || 0);
    return hours * rate;
  };

  const visibleRecords = isAdmin
    ? records
    : records.filter((record) => (record.userId || record.user_id || record.employeeId) === authUser?.id);
  const visibleCurrentShift = currentShift && (isAdmin || (currentShift.userId || currentShift.user_id || currentShift.employeeId) === authUser?.id)
    ? currentShift
    : null;

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
      actorRole: userCompanyRole,
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
  }, [authUser, userCompany, userCompanyRole, visibleCurrentShift, profileFullName]);

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

  const photoFolders = Object.keys(projectPhotos);
  const visiblePhotoFolders = selectedPhotoFolder === "all" ? photoFolders : photoFolders.filter((folder) => folder === selectedPhotoFolder);
  const receiptFolders = Object.keys(projectReceipts);
  const visibleReceiptFolders = selectedReceiptFolder === "all" ? receiptFolders : receiptFolders.filter((folder) => folder === selectedReceiptFolder);
  const receiptTotal = visibleReceiptFolders.reduce((total, folder) => {
    return total + (projectReceipts[folder] || []).reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0);
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
  }, [userCompany?.id, authUser?.id]);

  useEffect(() => {
    // When projects load/switch, ensure we have a valid project + cost centre selected.
    if (!effectiveProjects || effectiveProjects.length === 0) return;

    const hasProject = effectiveProjects.some((p) => String(p.id) === String(projectId));
    const nextProject = hasProject ? effectiveProjects.find((p) => String(p.id) === String(projectId)) : effectiveProjects[0];

    if (nextProject && String(nextProject.id) !== String(projectId)) {
      setProjectId(nextProject.id);
    }

    const centres = effectiveCostCentresByProjectId[nextProject?.id] || [];
    if (centres.length > 0 && !centres.includes(costCenter)) {
      setCostCenter(centres[0]);
    }
  }, [effectiveProjects, effectiveCostCentresByProjectId]);

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
        setUserCompanyRole(member.role || null);
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
        return;
      }
      try {
        const { data: profile, error: profileError } = await withTimeout(
          supabase
            .from("profiles")
            .select("role, full_name, email")
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
      } catch (err) {
        console.log("Profile load error:", err);
        setStartupError(`Profile load failed: ${getErrorMessage(err)}`);
        setAuthRole("employee");
        setProfileFullName("");
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
          .select("role, full_name, email")
          .eq("id", user.id)
          .single();

        if (profileError) throw profileError;

        if (user.email && !(profile?.email && String(profile.email).trim())) {
          const { error: patchErr } = await supabase.from("profiles").update({ email: user.email }).eq("id", user.id);
          if (patchErr) console.warn("Profile email patch on login:", patchErr);
        }

        setAuthRole(profile?.role || "employee");
        setProfileFullName(profile?.full_name || "");

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
          setUserCompanyRole(member.role || null);
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
    const nextProject = effectiveProjects.find((project) => String(project.id) === String(newProjectId)) || effectiveProjects[0];
    if (!nextProject) return;
    setProjectId(nextProject.id);
    const centres = effectiveCostCentresByProjectId[nextProject.id] || [];
    if (centres.length > 0) setCostCenter(centres[0]);
  };

  const handleAddProject = async (event) => {
    event.preventDefault();
    console.log("ADD PROJECT authUser.id", authUser?.id);
    console.log("ADD PROJECT userCompany", userCompany);
    console.log("ADD PROJECT userCompanyRole", userCompanyRole);

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

      const centres = newProjectCostCentres
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);

      const projectPayload = {
        company_id: userCompany.id,
        name,
        status: "active",
        created_by: authUser.id,
      };
      console.log("ADD PROJECT payload", projectPayload);

      const { data: created, error: projectErr } = await supabase
        .from("projects")
        .insert([projectPayload])
        .select("id, name")
        .single();

      if (projectErr) throw projectErr;

      if (centres.length > 0) {
        const rows = centres.map((c, index) => ({
          company_id: userCompany.id,
          project_id: created.id,
          name: c,
          status: "active",
          display_order: index,
          created_by: authUser.id,
        }));
        const { error: centresErr } = await supabase.from("cost_centres").insert(rows);
        if (centresErr) throw centresErr;
      }

      setNewProjectName("");
      setNewProjectCostCentres("");

      // Reload lists
      setProjectsLoading(true);
      setProjectsError("");
      setUseProjectFallback(false);
      const { data: projects, error: projectsErr } = await supabase
        .from("projects")
        .select("id, name")
        .eq("company_id", userCompany.id)
        .eq("status", "active")
        .order("name", { ascending: true });
      if (projectsErr) throw projectsErr;
      setCompanyProjects(projects || []);
    } catch (err) {
      setAddProjectError(getErrorMessage(err));
    } finally {
      setAddProjectLoading(false);
      setProjectsLoading(false);
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
  setLocationStatus("Clocking in...");

  const clockInLocation = null;
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
    hourlyRate: 0,
    project: selectedProject.name,
    projectId: selectedProject.id,
    costCenter,
    date: clockInTime,
    clockIn: clockInTime,
    clockInLocation,
    breakStart: null,
    breakEnd: null,
    status: "Active",
    photosTaken: 0,
    lastPhotoAt: null,
    projectFolder: getProjectFolderName(selectedProject.name),
    liveLocation: null,
    locationTrail: [],
  };

  setCurrentShift(newShift);
  setLocationStatus("Clock-in saved locally.");

  if (!authUser) {
    alert("User not logged in");
    return;
  }

  const { data, error } = await supabase
    .from("timesheets")
    .insert([{
      user_id: authUser.id,
      employee_email: authUser.email || null,
      employee_name: clockInEmployeeName,
      company_id: userCompany?.id || null,
      company_name: userCompany?.name || null,
      project_id: selectedProject.id,
      project_name: selectedProject.name,
      hourly_rate: 0,
      cost_centre: costCenter,
      clock_in: clockInTime,
      status: "Active",
      clock_in_latitude: null,
      clock_in_longitude: null,
    }])
    .select();

  if (error) {
    // Backward compatibility if DB columns aren't added yet
    const msg = error?.message || "";
    const missingColumn = msg.includes("column") && (msg.includes("employee_email") || msg.includes("company_id") || msg.includes("company_name"));
    if (missingColumn) {
      const { data: legacyData, error: legacyError } = await supabase
        .from("timesheets")
        .insert([{
          user_id: authUser.id,
          employee_name: clockInEmployeeName,
          project_name: selectedProject.name,
          hourly_rate: 0,
          cost_centre: costCenter,
          clock_in: clockInTime,
          status: "Active",
          clock_in_latitude: null,
          clock_in_longitude: null,
        }])
        .select();

      if (legacyError) {
        console.log("Supabase clock-in error:", legacyError);
        alert("Clock-in saved locally, but database save failed.");
        return;
      }

      setCurrentShift({ ...newShift, supabaseTimesheetId: legacyData?.[0]?.id || null });
      setLocationStatus("Clock-in saved.");
      const actorLabel = clockInEmployeeName || authUser?.email || "Someone";
      void createCompanyNotifications(supabase, {
        companyId: userCompany?.id,
        actorUserId: authUser.id,
        actorRole: userCompanyRole,
        type: "clock_in",
        title: clockInTitleForActorRole(userCompanyRole),
        message: `${actorLabel} clocked in at ${selectedProject.name} - ${costCenter}`,
        projectId: selectedProject.id,
        projectName: selectedProject.name,
        costCentre: costCenter,
        relatedTimesheetId: legacyData?.[0]?.id ?? null,
        relatedFolder: getProjectFolderName(selectedProject.name),
        itemCount: null,
      });
      return;
    }

    console.log("Supabase clock-in error:", error);
    alert("Clock-in saved locally, but database save failed.");
    return;
  }

  setCurrentShift({ ...newShift, supabaseTimesheetId: data?.[0]?.id || null });
  setLocationStatus("Clock-in saved.");
  const actorLabelMain = clockInEmployeeName || authUser?.email || "Someone";
  void createCompanyNotifications(supabase, {
    companyId: userCompany?.id,
    actorUserId: authUser.id,
    actorRole: userCompanyRole,
    type: "clock_in",
    title: clockInTitleForActorRole(userCompanyRole),
    message: `${actorLabelMain} clocked in at ${selectedProject.name} - ${costCenter}`,
    projectId: selectedProject.id,
    projectName: selectedProject.name,
    costCentre: costCenter,
    relatedTimesheetId: data?.[0]?.id ?? null,
    relatedFolder: getProjectFolderName(selectedProject.name),
    itemCount: null,
  });
};
  const handleChangeTask = () => {
    if (!visibleCurrentShift) return;
    setIsChangingTask(true);
  };

  const applyTaskChange = () => {
    if (!visibleCurrentShift) return;
    const updatedProject = adminProjects.find((p) => p.id === projectId) || adminProjects[0];
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
          actorRole: userCompanyRole,
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

    setLocationStatus("Getting clock-out location...");
    const clockOutLocation = await getCurrentLocation();
    const clockOutTime = new Date().toISOString();

    const completedRecord = {
      id: Date.now(),
      ...visibleCurrentShift,
      clockOut: clockOutTime,
      clockOutLocation,
      status: "Submitted",
    };

    if (visibleCurrentShift.supabaseTimesheetId) {
      const labourCost = getLabourCost(completedRecord);
      const { error } = await supabase
        .from("timesheets")
        .update({
          clock_out: clockOutTime,
          status: "Submitted",
          labour_cost: labourCost,
          clock_out_latitude: clockOutLocation?.latitude || null,
          clock_out_longitude: clockOutLocation?.longitude || null,
        })
        .eq("id", visibleCurrentShift.supabaseTimesheetId);

      if (error) {
        console.log("Supabase clock-out error:", error);
      } else if (authUser?.id && userCompany?.id) {
        const actorLabel = (profileFullName || "").trim() || authUser?.email || "Someone";
        void createCompanyNotifications(supabase, {
          companyId: userCompany.id,
          actorUserId: authUser.id,
          actorRole: userCompanyRole,
          type: "clock_out",
          title: clockOutTitleForActorRole(userCompanyRole),
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
    setLocationStatus(clockOutLocation ? "Clock-out location captured" : "Clock-out saved. Location not available.");
    setActiveTab("clock");
    void fetchTimesheetsFromSupabase();
  };

  const costCentresForEditProject = (pid) =>
    effectiveCostCentresByProjectId[String(pid)] ||
    effectiveCostCentresByProjectId[Number(pid)] ||
    [];

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

    const updatedRecord = {
      ...record,
      clockIn: clockInIso,
      clockOut: clockOutIso,
      status: "Submitted",
      projectId: proj.id,
      project: proj.name,
      projectFolder: getProjectFolderName(proj.name),
      costCenter: editCostCenter || "",
    };
    const labourCost = getLabourCost(updatedRecord);

    setEditTimesheetSaving(true);
    try {
      const { error } = await supabase
        .from("timesheets")
        .update({
          clock_in: clockInIso,
          clock_out: clockOutIso,
          status: "Submitted",
          project_id: proj.id,
          project_name: proj.name,
          cost_centre: editCostCenter || "",
          labour_cost: labourCost,
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

  const handleTeamMemberRoleChange = async (row, newRole) => {
    if (!isAdmin || !userCompany?.id) return;
    if (newRole !== "employee" && newRole !== "supervisor") return;
    if (normalizeMemberRole(row.role) === "owner") return;
    if (normalizeMemberRole(newRole) === normalizeMemberRole(row.role)) return;
    if (!window.confirm("Change this member role?")) return;
    setTeamRoleFeedback({ type: "", text: "" });
    setTeamRoleSavingId(String(row.memberRowId));
    try {
      const { error: mErr } = await supabase
        .from("company_members")
        .update({ role: newRole })
        .eq("id", row.memberRowId)
        .eq("company_id", userCompany.id)
        .eq("user_id", row.userId);
      if (mErr) throw mErr;
      const profileRole = newRole === "supervisor" ? "supervisor" : "employee";
      const { error: pErr } = await supabase.from("profiles").update({ role: profileRole }).eq("id", row.userId);
      if (pErr) throw pErr;
      if (String(row.userId) === String(authUser?.id)) {
        setUserCompanyRole(newRole);
        setAuthRole(profileRole);
      }
      setTeamRows((prev) =>
        prev.map((r) => (r.memberRowId === row.memberRowId ? { ...r, role: newRole } : r))
      );
      setTeamRoleFeedback({ type: "success", text: "Role updated." });
    } catch (err) {
      setTeamRoleFeedback({ type: "error", text: getErrorMessage(err) });
    } finally {
      setTeamRoleSavingId(null);
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
      const provisional = { ...record, clockOut: clockOutTime, status: "Submitted" };
      const labourCost = getLabourCost(provisional);
      const { error } = await supabase
        .from("timesheets")
        .update({
          status: "Submitted",
          clock_out: clockOutTime,
          labour_cost: labourCost,
        })
        .eq("id", rowId);
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
          actorRole: userCompanyRole,
          type: "clock_out",
          title: clockOutTitleForActorRole(userCompanyRole),
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
        <div><p>Rate</p><p className="font-semibold text-slate-900">{formatMoney(record.hourlyRate || 0)}/hr</p></div>
        <div><p>Total Cost</p><p className="font-semibold text-slate-900">{formatMoney(getLabourCost(record))}</p></div>
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
                <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5">Role: {userCompanyRole || authRole || "employee"}</p>
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

          {activeTab === "clock" && !visibleCurrentShift && (
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
                  <select className="w-full rounded-2xl border bg-white py-2 px-2.5 text-sm h-10 sm:h-11 leading-tight" value={projectId} onChange={(event) => handleProjectChange(event.target.value)}>
                    {effectiveProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs sm:text-sm font-medium">Cost Centre</label>
                  <select className="w-full rounded-2xl border bg-white py-2 px-2.5 text-sm h-10 sm:h-11 leading-tight" value={costCenter} onChange={(event) => setCostCenter(event.target.value)}>
                    {(effectiveCostCentresByProjectId[selectedProject.id] || []).map((center) => <option key={center} value={center}>{center}</option>)}
                  </select>
                </div>

                <Button className="w-full rounded-2xl h-12 sm:h-14 text-sm sm:text-base font-bold" onClick={handleClockIn}>✅ Clock In</Button>
                {locationStatus && <p className="text-xs text-slate-500 text-center">{locationStatus}</p>}
              </CardContent>
            </Card>
          )}

          {activeTab === "clock" && visibleCurrentShift && (
            <Card className="rounded-3xl shadow-sm border-green-100 bg-green-50">
              <CardContent className="p-2.5 flex flex-col gap-2">
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
                      {effectiveProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <select className="w-full rounded-2xl border py-2 px-2 text-sm h-10" value={costCenter} onChange={(e) => setCostCenter(e.target.value)}>
                      {(effectiveCostCentresByProjectId[selectedProject.id] || []).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Button className="h-9 rounded-xl text-sm" onClick={applyTaskChange}>Save</Button>
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
                        <div><p className="font-semibold">{folder}</p><p className="text-xs text-slate-500">{(projectPhotos[folder] || []).length} photos</p></div>
                        <Button className="rounded-xl h-10 text-xs" onClick={() => shareProjectFolder(folder)}>Share Link</Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {(projectPhotos[folder] || []).map((photo) => (
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
                    const folderReceipts = projectReceipts[folder] || [];
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

          {activeTab === "team" && (
            <Card className="rounded-3xl shadow-sm">
              <CardContent className="p-4 sm:p-5 space-y-3">
                <div>
                  <h2 className="font-bold text-lg">Team</h2>
                  <p className="text-xs text-slate-500">
                    {isAdmin ? "Company members and daily attendance" : "Your attendance for the selected date"}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Times use {companyTimeZone}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">View date</label>
                  <input
                    type="date"
                    className="w-full rounded-xl border bg-white px-2 py-2 text-sm"
                    value={teamViewDate}
                    onChange={(e) => setTeamViewDate(e.target.value)}
                    disabled={!teamViewDate}
                  />
                </div>
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
                <div className="space-y-1.5">
                  {(isAdmin ? teamRows : teamRows.filter((r) => String(r.userId) === String(authUser?.id))).map((row) => {
                    const rowRoleNorm = normalizeMemberRole(row.role);
                    const isOwnerMember = rowRoleNorm === "owner";
                    const showRoleSelect = isAdmin && !isOwnerMember;
                    const userDayRows = teamDaySheets.filter((t) => String(t.userId) === String(row.userId));
                    const rep = pickRepresentativeTeamDayTimesheet(userDayRows);
                    const att = teamAttendanceStatusForRecord(rep, {
                      selectedDateKey: teamViewDate,
                      companyTimeZone,
                      now,
                      authUser,
                      visibleCurrentShift,
                    });
                    const statusBadgeClass =
                      att.code === "clocked_in"
                        ? "bg-green-50 text-green-800 border border-green-100"
                        : att.code === "clocked_out"
                          ? "bg-slate-100 text-slate-800 border border-slate-200"
                          : att.code === "missing_out"
                            ? "bg-amber-50 text-amber-900 border border-amber-100"
                            : "bg-slate-50 text-slate-600 border border-slate-100";
                    const inDisp = rep?.clockIn ? formatTime(rep.clockIn, companyTimeZone) : "—";
                    const outDisp = rep?.clockOut ? formatTime(rep.clockOut, companyTimeZone) : "—";
                    const projectDisp = rep?.project ? String(rep.project) : "—";
                    const costDisp = rep?.costCenter ? String(rep.costCenter) : "—";
                    const labourDisp = rep ? formatMoney(getLabourCost(rep)) : "—";
                    return (
                      <div key={row.memberRowId} className="rounded-xl border border-slate-200 bg-white p-2 space-y-1">
                        <div className="flex justify-between gap-2 items-start min-w-0">
                          <p className="font-semibold text-[13px] leading-tight text-slate-900 min-w-0 break-words pr-1">
                            {row.displayName}
                          </p>
                          {!showRoleSelect && (
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 shrink-0 capitalize leading-none">
                              {row.role}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 leading-tight">
                          <span className="text-slate-500">Status:</span>{" "}
                          <span className={`inline rounded px-1.5 py-0.5 font-semibold ${statusBadgeClass}`}>
                            {att.label}
                          </span>
                        </p>
                        <div className="flex justify-between gap-2 text-[11px] leading-tight">
                          <div className="min-w-0 shrink">
                            <span className="text-slate-500">In:</span>{" "}
                            <span className="font-semibold text-slate-900 tabular-nums">{inDisp}</span>
                          </div>
                          <div className="min-w-0 shrink text-right">
                            <span className="text-slate-500">Out:</span>{" "}
                            <span className="font-semibold text-slate-900 tabular-nums">{outDisp}</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-700 leading-snug break-words">
                          <span className="text-slate-500">Proj:</span>{" "}
                          <span className="font-semibold text-slate-900">{projectDisp}</span>
                          <span className="text-slate-300 px-1" aria-hidden="true">
                            |
                          </span>
                          <span className="text-slate-500">Cost:</span>{" "}
                          <span className="font-semibold text-slate-900">{costDisp}</span>
                          <span className="text-slate-300 px-1" aria-hidden="true">
                            |
                          </span>
                          <span className="text-slate-500">Labour:</span>{" "}
                          <span className="font-semibold text-slate-900 tabular-nums">{labourDisp}</span>
                        </p>
                        {showRoleSelect && (
                          <div className="pt-1 mt-0.5 border-t border-slate-100">
                            <label className="sr-only">Role</label>
                            <select
                              className="w-full rounded-md border py-1 px-1.5 text-[11px] leading-tight"
                              value={rowRoleNorm === "supervisor" ? "supervisor" : "employee"}
                              disabled={teamRoleSavingId === String(row.memberRowId)}
                              onChange={(e) => void handleTeamMemberRoleChange(row, e.target.value)}
                            >
                              <option value="employee">employee</option>
                              <option value="supervisor">supervisor</option>
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {!teamLoading && !teamError && (isAdmin ? teamRows.length === 0 : !teamRows.some((r) => String(r.userId) === String(authUser?.id))) && (
                  <p className="text-xs text-slate-500 text-center py-3">No members found.</p>
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
                    {employeeDisplayName || authUser.email} • {userCompanyRole || authRole || "employee"}
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
                <button className="w-full text-left rounded-2xl p-3 bg-slate-100 font-semibold" onClick={() => openMenuTab("team")}>👥 Team</button>
                <button className="w-full text-left rounded-2xl p-3 bg-red-50 text-red-700 font-semibold" onClick={handleLogout}>🚪 Logout</button>
                {isAdmin && <><button className="w-full text-left rounded-2xl p-3 bg-slate-100 font-semibold" onClick={() => openMenuTab("quotations")}>📝 Quotations</button><button className="w-full text-left rounded-2xl p-3 bg-slate-100 font-semibold" onClick={() => openMenuTab("reports")}>📊 Reports</button></>}
              </div>
            </div>
          </div>
        )}

        <div
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm border-t bg-white/95 backdrop-blur px-3 pt-1.5 z-50 shadow-lg pb-[max(0.375rem,env(safe-area-inset-bottom,0px))]"
        >
          <div className="grid grid-cols-2 gap-1.5">
            <button onClick={() => setActiveTab("clock")} className={`rounded-2xl py-2.5 px-2 text-sm font-semibold ${activeTab === "clock" ? "bg-slate-900 text-white" : "text-slate-500"}`}>⏱ Clock</button>
            <button onClick={() => setActiveTab("timesheet")} className={`rounded-2xl py-2.5 px-2 text-sm font-semibold ${activeTab === "timesheet" ? "bg-slate-900 text-white" : "text-slate-500"}`}>📄 Timesheet</button>
          </div>
        </div>
      </div>
    </div>
  );
}
