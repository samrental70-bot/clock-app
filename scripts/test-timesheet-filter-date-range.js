import assert from "node:assert/strict";
import {
  timesheetRecordMatchesFilters,
  timesheetRecordOverlapsDateRange,
} from "../src/lib/timesheetFilters.js";

function row(overrides = {}) {
  return {
    clockIn: "2026-06-14T12:00:00Z",
    clockOut: "2026-06-14T20:00:00Z",
    ...overrides,
  };
}

assert.equal(
  timesheetRecordOverlapsDateRange(row(), "2026-06-14", "2026-06-14", "America/Toronto"),
  true,
  "same-day completed row should match its wall date"
);

assert.equal(
  timesheetRecordOverlapsDateRange(row(), "2026-06-15", "2026-06-15", "America/Toronto"),
  false,
  "row outside the selected wall date should be filtered out"
);

assert.equal(
  timesheetRecordOverlapsDateRange(
    row({
      clockIn: "2026-06-14T23:30:00-04:00",
      clockOut: "2026-06-15T02:00:00-04:00",
    }),
    "2026-06-14",
    "2026-06-14",
    "America/Toronto"
  ),
  true,
  "overnight row should still appear on its start date"
);

assert.equal(
  timesheetRecordOverlapsDateRange(
    row({
      clockIn: "2026-06-14T23:30:00-04:00",
      clockOut: "2026-06-15T02:00:00-04:00",
    }),
    "2026-06-15",
    "2026-06-15",
    "America/Toronto"
  ),
  true,
  "overnight row should still appear on its end date"
);

assert.equal(
  timesheetRecordOverlapsDateRange(
    row({
      clockIn: "2026-06-14T08:00:00-04:00",
      clockOut: null,
    }),
    "2026-06-14",
    "2026-06-14",
    "America/Toronto"
  ),
  true,
  "active row without clock-out should match using clock-in date"
);

assert.equal(
  timesheetRecordOverlapsDateRange(
    row({
      clockIn: null,
      clockOut: null,
    }),
    "2026-06-14",
    "2026-06-14",
    "America/Toronto"
  ),
  false,
  "rows without usable timestamps should not match"
);

assert.equal(
  timesheetRecordOverlapsDateRange(
    {
      clock_in: "2026-06-14T23:30:00-04:00",
      clock_out: "2026-06-15T02:00:00-04:00",
    },
    "2026-06-15",
    "2026-06-15",
    "America/Toronto"
  ),
  true,
  "snake_case clock fields should match the selected wall date"
);

assert.equal(
  timesheetRecordOverlapsDateRange(row(), "2026-06-20", "2026-06-14", "America/Toronto"),
  false,
  "invalid ranges should safely return false"
);

assert.equal(
  timesheetRecordMatchesFilters(
    row({ userId: "employee-1", projectId: "project-1", project: "QA Payroll Seed - 905", costCenter: "drywall" }),
    {
      employeeFilter: "employee-1",
      projectFilter: "project-1",
      taskFilter: "drywall",
      completedOnly: false,
      fromKey: "2026-06-14",
      toKey: "2026-06-14",
      timeZone: "America/Toronto",
    }
  ),
  true,
  "combined employee/project/task filters should keep matching rows"
);

assert.equal(
  timesheetRecordMatchesFilters(
    row({ userId: "employee-2", projectId: "project-1", project: "QA Payroll Seed - 905", costCenter: "drywall" }),
    {
      employeeFilter: "employee-1",
      fromKey: "2026-06-14",
      toKey: "2026-06-14",
      timeZone: "America/Toronto",
    }
  ),
  false,
  "employee filter should exclude rows for other employees"
);

assert.equal(
  timesheetRecordMatchesFilters(
    row({ projectId: "project-2", project: "RLS Positive QA", costCenter: "drywall" }),
    {
      projectFilter: "project-1",
      fromKey: "2026-06-14",
      toKey: "2026-06-14",
      timeZone: "America/Toronto",
    }
  ),
  false,
  "project filter should exclude rows outside the selected project"
);

assert.equal(
  timesheetRecordMatchesFilters(
    row({ projectId: "project-1", project: "QA Payroll Seed - 905", costCenter: "mudding" }),
    {
      taskFilter: "drywall",
      fromKey: "2026-06-14",
      toKey: "2026-06-14",
      timeZone: "America/Toronto",
    }
  ),
  false,
  "task filter should exclude rows outside the selected task"
);

assert.equal(
  timesheetRecordMatchesFilters(
    row({ clockOut: null }),
    {
      completedOnly: true,
      fromKey: "2026-06-14",
      toKey: "2026-06-14",
      timeZone: "America/Toronto",
      isCompletedRecord: (record) => Boolean(record.clockIn && record.clockOut),
    }
  ),
  false,
  "completed-only filter should exclude open timesheets"
);

console.log("Timesheet date range filter tests passed.");
