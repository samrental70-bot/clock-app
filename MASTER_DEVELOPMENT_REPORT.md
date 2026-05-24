# OPERA.AI Master Development Report

## Release Line
- Production/beta branch: main
- Development branch: develop
- Current development version: B.1-fix-4
- Production promotion rule: confirm with user before pushing or deploying production.

## B.1-fix-2 Completed
- Active Team status corrected so active shifts show Working instead of Missing clock out.
- Auto clock-out setting added at company level for Manager/Owner.
- Hours and labour calculations stabilized for dashboard/timesheet display.
- Projects screen Add Task support added.
- Company-level toggles added for assigning all projects to all employees and all tasks to all projects.
- Development app deployment completed for B.1-fix-2.

## B.1-fix-3 Completed
- Active Team live hours and labour cost now use live elapsed shift time for display.
- Worked Today is separated from active shifts and limited to completed same-day timesheets.
- Employees Logged by Hour was converted to a line graph.
- Dashboard header now shows company, date, and logged-in user.
- Dashboard quick actions were reduced to Schedule, Pictures, Receipts, and Employees.
- Bottom navigation was simplified to Activities, Clock, and More.
- Activities feed was added/updated for clock events, corrections, uploads, and auto clock-out events.
- Request Center remains accessible from menu/timesheets instead of main dashboard.
- Auto clock-out default corrected to 12:00 AM midnight.

## B.1-fix-3 Build / Deployment
- Local build status: Passed.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-4 Completed
- Pictures tab header simplified from Project Documentation to Pictures.
- Pictures tab explanatory documentation wording removed from the top area.
- Pictures tab project selector added with All Projects default and project-specific filtering preserved.
- Pictures tab date range now defaults to the last 1 year and works with project/media filters.
- Employees tab now shows Manager/Owner Clock In / Clock Out controls beside Edit.
- Manager/Owner clock-in uses the existing timesheets insert flow with project/task selection and duplicate active-shift protection.
- Manager/Owner clock-out uses the existing timesheet clock-out/labour calculation helper.
- Timesheet tab now includes Employee and Project filters.
- Timesheet Share Report button added and uses current filtered records with native share/copy/download fallback.
- Existing database/team data protected; no SQL was run.

## B.1-fix-4 Build / Deployment
- Local build status: Passed.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## Required SQL
- If the previous B.1-fix-2 company settings migration has not been run, run the company settings SQL migration first.
- B.1-fix-3 adds a safe migration to update the default auto clock-out time to midnight:
  - `supabase/migrations/20260523133000_correct_auto_clock_out_default_midnight.sql`
- B.1-fix-4 does not require new SQL.

## Remaining Issues
- Vercel/build warning only: the existing bundle is larger than 500 kB after minification.
- Workspace verifier warning only: old Auracut docs exist in `docs/`; they were not touched because they are outside this OPERA.AI runtime task.
