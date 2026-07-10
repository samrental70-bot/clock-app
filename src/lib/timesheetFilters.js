const DEFAULT_COMPANY_TIME_ZONE = "America/Toronto";

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

export function timesheetRecordOverlapsDateRange(record, fromKey, toKey, timeZone) {
  const from = String(fromKey || "").trim();
  const to = String(toKey || "").trim();
  if (!from || !to || from > to) return false;

  const clockIn =
    record?.clockIn ??
    record?.clock_in ??
    record?.start_time ??
    record?.startTime ??
    null;
  const clockOut =
    record?.clockOut ??
    record?.clock_out ??
    record?.end_time ??
    record?.endTime ??
    null;

  const startKey = calendarDateKeyInTimeZone(clockIn, timeZone);
  const endKey = calendarDateKeyInTimeZone(clockOut || clockIn, timeZone);
  const effectiveStart = startKey || endKey;
  const effectiveEnd = endKey || startKey;

  if (!effectiveStart || !effectiveEnd) return false;
  return !(effectiveEnd < from || effectiveStart > to);
}

export function timesheetRecordMatchesFilters(
  record,
  {
    employeeFilter = "all",
    projectFilter = "all",
    taskFilter = "all",
    completedOnly = false,
    fromKey = "",
    toKey = "",
    timeZone,
    isCompletedRecord = () => true,
  } = {}
) {
  const employeeId = String(record?.userId ?? record?.user_id ?? record?.employeeId ?? "").trim();
  if (employeeFilter !== "all" && employeeId !== String(employeeFilter)) return false;

  const projectId = String(record?.projectId ?? record?.project_id ?? "").trim();
  const projectName = String(record?.project || record?.project_name || "").trim();
  if (projectFilter !== "all") {
    const filterValue = String(projectFilter).trim();
    const matchesProject =
      (projectId && projectId === filterValue) ||
      (projectName && projectName.toLowerCase() === filterValue.toLowerCase());
    if (!matchesProject) return false;
  }

  const taskName = String(record?.costCenter || record?.cost_centre || record?.task || "").trim();
  if (taskFilter !== "all" && taskName.toLowerCase() !== String(taskFilter).trim().toLowerCase()) return false;

  if (!timesheetRecordOverlapsDateRange(record, fromKey, toKey, timeZone)) return false;
  if (completedOnly && !isCompletedRecord(record)) return false;
  return true;
}
