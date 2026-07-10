function parseTimesheetInstant(value) {
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

function minutesBetween(start, end) {
  const t0 = parseTimesheetInstant(start).getTime();
  const t1 = parseTimesheetInstant(end).getTime();
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return 0;
  return Math.max(0, Math.round((t1 - t0) / 60000));
}

function formatHoursMinutes(minutes) {
  const raw = Number(minutes);
  const safeMin = Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
  const h = Math.floor(safeMin / 60);
  const m = safeMin % 60;
  return `${h}h ${m}m`;
}

function timesheetSanityEmployeeLabel(record) {
  const name =
    record?.employeeName ||
    record?.employee ||
    record?.profileDisplayName ||
    record?.employeeEmail ||
    record?.profileEmailForRow ||
    "";
  return String(name || "Employee").trim() || "Employee";
}

function timesheetSanityIssueKey(record, index, suffix) {
  const rawId = record?.supabaseTimesheetId ?? record?.id ?? index;
  return `${rawId}-${suffix}`;
}

export function buildTimesheetSanityChecks(records, options = {}) {
  const rows = Array.isArray(records) ? records : [];
  const issues = [];
  const intervalsByEmployee = new Map();
  const longShiftMinutes =
    Number.isFinite(Number(options.longShiftMinutes)) && Number(options.longShiftMinutes) > 0
      ? Number(options.longShiftMinutes)
      : 14 * 60;

  rows.forEach((record, index) => {
    const employee = timesheetSanityEmployeeLabel(record);
    const project = String(record?.project || record?.project_name || "").trim();
    const task = String(record?.costCenter || record?.cost_centre || record?.task || "").trim();
    const clockInRaw = record?.clockIn ?? record?.clock_in;
    const clockOutRaw = record?.clockOut ?? record?.clock_out;
    const clockInDate = parseTimesheetInstant(clockInRaw);
    const clockOutDate = parseTimesheetInstant(clockOutRaw);
    const startMs = clockInDate.getTime();
    const endMs = clockOutDate.getTime();

    if (!Number.isFinite(startMs)) {
      issues.push({
        id: timesheetSanityIssueKey(record, index, "missing-in"),
        recordId: record?.supabaseTimesheetId ?? record?.id ?? null,
        recordIds: [record?.supabaseTimesheetId ?? record?.id ?? null].filter(Boolean),
        severity: "warning",
        title: "Missing clock-in time",
        detail: `${employee} has a timesheet row without a valid clock-in time.`,
      });
    }

    if (!clockOutRaw || !Number.isFinite(endMs)) {
      issues.push({
        id: timesheetSanityIssueKey(record, index, "missing-out"),
        recordId: record?.supabaseTimesheetId ?? record?.id ?? null,
        recordIds: [record?.supabaseTimesheetId ?? record?.id ?? null].filter(Boolean),
        severity: "warning",
        title: "Missing clock-out time",
        detail: `${employee} may still be working or needs a clock-out review.`,
      });
    }

    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      const workedMinutes = minutesBetween(clockInRaw, clockOutRaw);
      if (workedMinutes > longShiftMinutes) {
        issues.push({
          id: timesheetSanityIssueKey(record, index, "long-shift"),
          recordId: record?.supabaseTimesheetId ?? record?.id ?? null,
          recordIds: [record?.supabaseTimesheetId ?? record?.id ?? null].filter(Boolean),
          severity: "warning",
          title: "Long shift",
          detail: `${employee} has a ${formatHoursMinutes(workedMinutes)} entry. Review before payroll.`,
        });
      }

      const employeeKey =
        String(record?.userId ?? record?.user_id ?? record?.employeeId ?? record?.employee_id ?? employee).trim() ||
        `employee-${index}`;
      const intervals = intervalsByEmployee.get(employeeKey) || [];
      intervals.push({ employee, startMs, endMs, id: record?.id ?? index });
      intervalsByEmployee.set(employeeKey, intervals);
    }

    if (!project) {
      issues.push({
        id: timesheetSanityIssueKey(record, index, "missing-project"),
        recordId: record?.supabaseTimesheetId ?? record?.id ?? null,
        recordIds: [record?.supabaseTimesheetId ?? record?.id ?? null].filter(Boolean),
        severity: "info",
        title: "Missing job site",
        detail: `${employee} has a timesheet row without a project/job site.`,
      });
    }

    if (!task) {
      issues.push({
        id: timesheetSanityIssueKey(record, index, "missing-task"),
        recordId: record?.supabaseTimesheetId ?? record?.id ?? null,
        recordIds: [record?.supabaseTimesheetId ?? record?.id ?? null].filter(Boolean),
        severity: "info",
        title: "Missing task",
        detail: `${employee} has a timesheet row without a task.`,
      });
    }
  });

  intervalsByEmployee.forEach((intervals) => {
    const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs);
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      if (current.startMs < previous.endMs) {
        issues.push({
          id: `overlap-${current.id}-${previous.id}`,
          recordId: current.id ?? previous.id ?? null,
          recordIds: [current.id ?? null, previous.id ?? null].filter(Boolean),
          severity: "danger",
          title: "Overlapping time entries",
          detail: `${current.employee} has entries with overlapping times. Review before payroll.`,
        });
      }
    }
  });

  return issues;
}

export function getVisibleTimesheetSanityIssues(issues, expanded, limit = 5) {
  const rows = Array.isArray(issues) ? issues : [];
  if (expanded) return rows;
  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 5;
  return rows.slice(0, safeLimit);
}
