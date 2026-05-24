# OPERA.AI Master Development Report

## Release Line
- Production/beta branch: main
- Development branch: develop
- Current development version: B.1-fix-9
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

## B.1-fix-5 Stabilization
- Pending company settings SQL reviewed for live database safety.
- Company settings migration remains additive/idempotent with `add column if not exists`.
- Midnight default migration was tightened to avoid rewriting an existing manager-selected `12:00` value.
- No destructive SQL was found in the reviewed migrations.
- App fallback logic verified for missing company settings columns.
- Auto clock-out default verified as `00:00` in frontend and `/api/auto-clockout`.
- Development app URL responded successfully as `OPERA.AI Development`.
- Fix-3 and Fix-4 behaviour verified by code inspection and deployment availability check.
- Bundle warning reviewed: the app still builds as one large Vite app chunk; defer code splitting to a future safe refactor.
- Auracut warning reviewed: Auracut files are ignored by git and Vercel deployment rules; runtime OPERA code has no Auracut references.
- Existing database/team data protected; no SQL was run.

## B.1-fix-5 Build / Deployment
- Local build status: Passed.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-6 Dashboard Mobile Polish
- Dashboard shortcuts reordered to Schedule, Pictures, Receipts, and Employees.
- Employees shortcut label adjusted so it is fully visible on mobile.
- Active live totals now fall back to active timesheet records and employee profile hourly rate when today dashboard rows are incomplete.
- Active summary card compacted to reduce top clutter while preserving live active hours and live active labour.
- Individual Active Team employee cards no longer show duplicate Live Hours / Live Labour boxes.
- Active Team cards now focus on employee, clock-in time, Working status, project/task, live location, and manager clock-out.
- Dashboard content ordering updated so Activities appears last after operational cards.
- Employees Logged by Hour graph spacing and labels cleaned up for mobile readability.

## B.1-fix-6 Build / Deployment
- Local build status: Passed.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-7 Clock-In Cleanup + Employee Project/Task Permission
- Clock-In screen top "Start Shift" / "Choose project and task" wording removed.
- Clock-In card simplified around project selector, task selector, camera, receipt, clock action, Task List, and Material List.
- Photo Type selector removed from Clock screen; default upload metadata behaviour remains internal.
- Visible Enable Location button removed from Clock cards; location prompt now happens during Clock In when needed.
- Task List and Material List descriptions removed and buttons cleaned up.
- Company setting added in UI for "Allow employees to add projects and tasks", default OFF.
- Employees only see Add Project / Add Task when the company setting is ON.
- Employee-created project/task notifications reuse the existing `createCompanyNotifications` flow.
- New project/task creation continues to follow existing global assignment settings.

## B.1-fix-7 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-8 Date Range + Pictures Filter Cleanup
- Shared Reports-style date range button/modal added for Pictures and Timesheet date filters.
- Pictures tab visible filters simplified to Project, Employee, and Date Range only.
- Pictures project filter default remains All Projects.
- Pictures employee filter default remains All Employees.
- Pictures date range defaults to the last 1 year from today.
- Hidden task/media/type filters no longer affect the Pictures display.
- Pictures tab top wording simplified and documentation/admin wording removed from the Pictures entry.
- Pictures display now focuses on the media gallery/share flow while preserving project_media and AI/documentation backend logic.
- Timesheet date filter now uses the same modal style while preserving existing timesheet filtering and Share Report behaviour.

## B.1-fix-8 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-9 Active Team + Worked Today Polish
- Active Team employee cards now show live time and live labour amount per active employee.
- Active Team per-employee cost remains display-only and is not saved until normal clock-out.
- Active Team project/task text changed to compact `Project • Task` display with truncation for long names.
- Worked Today entry layout simplified to employee, compact project/task, time range, total hours, and labour cost.
- Removed visible `Clocked out` wording from Worked Today cards.
- Worked Today summary now includes a clear Total Time / Total Cost card below the existing Employees / Entries / Labour metrics.
- Worked Today continues to use only completed same-day shifts and excludes active shifts.

## B.1-fix-9 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Pending.
- Development URL: https://project-rui1d-development.vercel.app
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## Required SQL
- If the previous B.1-fix-2 company settings migration has not been run, run the company settings SQL migration first.
- B.1-fix-3 adds a safe migration to update the default auto clock-out time to midnight:
  - `supabase/migrations/20260523133000_correct_auto_clock_out_default_midnight.sql`
- B.1-fix-4 does not require new SQL.
- B.1-fix-6 does not require new SQL.
- B.1-fix-7 requires this safe additive SQL before the new employee project/task permission can persist:
  - `supabase/migrations/20260523160000_add_employee_project_task_creation_setting.sql`
  - SQL:
    ```sql
    alter table public.companies
      add column if not exists allow_employee_project_task_creation boolean not null default false;

    comment on column public.companies.allow_employee_project_task_creation is
      'When true, employees may add projects and tasks from the Clock screen. Default false.';
    ```
- B.1-fix-8 does not require new SQL.
- B.1-fix-9 does not require new SQL.
- B.1-fix-5 reviewed SQL package for manual Supabase execution:

```sql
alter table public.companies
  add column if not exists auto_clock_out_time text not null default '00:00',
  add column if not exists assign_all_projects_to_all_employees boolean not null default true,
  add column if not exists assign_all_tasks_to_all_projects boolean not null default true;

comment on column public.companies.auto_clock_out_time is
  'Company local wall-clock time in HH:MM for automatic clock-out. Default is 00:00 midnight.';
comment on column public.companies.assign_all_projects_to_all_employees is
  'When true, every active employee can see/select every active company project.';
comment on column public.companies.assign_all_tasks_to_all_projects is
  'When true, every active task/cost centre is available under every active project.';

alter table public.companies
  alter column auto_clock_out_time set default '00:00';

update public.companies
set auto_clock_out_time = '00:00'
where auto_clock_out_time is null
   or btrim(auto_clock_out_time) = '';

comment on column public.companies.auto_clock_out_time is
  'Company local wall-clock time in HH:MM for automatic clock-out. Default is 00:00 midnight.';
```

## Remaining Issues
- Vercel/build warning only: the existing bundle is larger than 500 kB after minification.
- Workspace verifier warning only: old Auracut docs exist in `docs/`; they were not touched because they are outside this OPERA.AI runtime task.
