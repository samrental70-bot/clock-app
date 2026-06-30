import assert from "node:assert/strict";
import {
  buildTimesheetSanityChecks,
  getVisibleTimesheetSanityIssues,
} from "../src/lib/timesheetSanity.js";

function titles(issues) {
  return issues.map((issue) => issue.title);
}

function baseRecord(overrides = {}) {
  return {
    id: overrides.id || "row-1",
    userId: overrides.userId || "user-1",
    employeeName: overrides.employeeName || "Samrat",
    project: overrides.project ?? "905 Riverside Renovation",
    costCenter: overrides.costCenter ?? "Mudding",
    clockIn: overrides.clockIn ?? "2026-05-24T13:00:00Z",
    clockOut: overrides.clockOut ?? "2026-05-24T17:00:00Z",
    ...overrides,
  };
}

{
  const issues = buildTimesheetSanityChecks([baseRecord()]);
  assert.deepEqual(issues, [], "normal completed row should be all clear");
}

{
  const issues = buildTimesheetSanityChecks([baseRecord({ clockOut: null })]);
  assert.ok(titles(issues).includes("Missing clock-out time"), "missing clock-out should be flagged");
}

{
  const issues = buildTimesheetSanityChecks([
    baseRecord({
      clockIn: "2026-05-24T05:00:00Z",
      clockOut: "2026-05-25T00:30:00Z",
    }),
  ]);
  assert.ok(titles(issues).includes("Long shift"), "shift over 14 hours should be flagged");
}

{
  const issues = buildTimesheetSanityChecks([
    baseRecord({ id: "a", clockIn: "2026-05-24T13:00:00Z", clockOut: "2026-05-24T16:00:00Z" }),
    baseRecord({ id: "b", clockIn: "2026-05-24T15:30:00Z", clockOut: "2026-05-24T17:00:00Z" }),
  ]);
  assert.ok(titles(issues).includes("Overlapping time entries"), "same-employee overlaps should be flagged");
}

{
  const issues = buildTimesheetSanityChecks([
    baseRecord({ project: "", costCenter: "" }),
  ]);
  assert.ok(titles(issues).includes("Missing job site"), "missing project/job site should be flagged");
  assert.ok(titles(issues).includes("Missing task"), "missing task should be flagged");
}

{
  const issues = buildTimesheetSanityChecks([
    baseRecord({ clockIn: "not-a-date" }),
  ]);
  assert.ok(titles(issues).includes("Missing clock-in time"), "malformed clock-in should be flagged");
}

{
  const issues = buildTimesheetSanityChecks([
    baseRecord({
      clockIn: "2026-05-24T22:00:00-04:00",
      clockOut: "2026-05-25T06:00:00-04:00",
    }),
  ]);
  assert.deepEqual(issues, [], "valid overnight 8-hour row should not be flagged");
}

{
  const fakeIssues = Array.from({ length: 7 }, (_, index) => ({ id: `issue-${index}` }));
  assert.equal(getVisibleTimesheetSanityIssues(fakeIssues, false).length, 5, "collapsed issues should cap at 5");
  assert.equal(getVisibleTimesheetSanityIssues(fakeIssues, true).length, 7, "expanded issues should show all");
}

console.log("Timesheet sanity tests passed.");
