# OPERA.AI Master Development Report

## Release Line
- Production/beta branch: main
- Development branch: develop
- Current development version: B.1-fix-17
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
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-10 Dashboard Polish V1
- App header vertical padding reduced and notification badge size tightened.
- Dashboard hero header flattened with cleaner company title truncation and compact refresh icon button.
- Dashboard typography hierarchy adjusted so primary company text is stronger and secondary date/user text is quieter.
- Dashboard quick action cards reduced in size and saturation while preserving Schedule, Pictures, Receipts, Employees order.
- Quick action shadows and glow effects flattened for a more enterprise SaaS feel.
- Active Team cards redesigned into compact rows with employee name, inline live time/cost, project/task, live location, and clock-out action.
- Active Team timer/status pill sizing reduced without changing live time/labour calculation logic.
- Worked Today and dashboard card surfaces flattened to reduce bubble/glow styling.
- Bottom navigation height and selected pill size reduced with a subtler glass-style surface.
- No SQL, database, or business-logic changes were made.

## B.1-fix-10 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-bsaviyzs5-samrental70-7859s-projects.vercel.app
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1 Release QA Preparation
- B.1 release QA is now pending real mobile testing.
- B.1-fix-6 through B.1-fix-10 are locked for QA unless a clear QA-blocking bug is found.
- SQL settings are marked completed by the user before this QA preparation step.
- Development app for QA: https://project-rui1d-development.vercel.app
- Production/main remains untouched.
- Mobile QA checklist location: `docs/B1_RELEASE_MOBILE_QA_CHECKLIST.md`
- QA checklist covers Owner/Admin, Supervisor, Employee, and core regression flows.
- QA preparation build status: Passed on develop.
- Development deployment not required because only docs/report files changed.
- Non-blocking warnings remain documented: Vite bundle-size warning and old Auracut docs verifier warning.

## B.1-fix-11A Enterprise Mobile Redesign Phase 1
- Bottom navigation updated from Activities / Clock / More to Home / Schedule / Clock / More.
- Bottom Clock tab is navigation only; clock in/out remains inside Clock/Home actions.
- Global app header kept compact with smaller controls and lighter notification badge.
- Admin Home label/hierarchy simplified and duplicate in-page refresh removed because the global header refresh remains.
- Admin Home live operations KPI strip added with Active, Hours, Labour, and Issues.
- Admin Home redundant section labels reduced across Active Team, Worked Today, Team Events, Shift Coverage, and Live Job Sites.
- Employee Home state added on the Home tab with current shift, elapsed time, earned amount, quick clock, camera/receipt entry, next scheduled task, and personal activity.
- Clock pre-clock-in screen simplified around Project, Task, compact Add Project/Add Task actions, primary Clock In, and secondary Camera/Receipt tools.
- Clock active-shift screen changed from a giant timer card to a structured current shift card with project/task, elapsed, earned, and sync status.
- Clock active-shift action row cleaned into compact Camera, Receipt, Task, Break, and Clock Out actions.
- Task List and Material List controls were reduced to secondary linked sections.
- Existing clock/location/photo/receipt/project-task setting logic was preserved.
- No SQL, database, or AI changes were made.

## B.1-fix-11A Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-4ameviexk-samrental70-7859s-projects.vercel.app
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-11B Enterprise Mobile Redesign Phase 2
- Schedule screen flattened into the shared enterprise mobile style.
- Schedule New Task remains a compact header action for admin/supervisor users.
- Schedule view control was cleaned into a compact List / Calendar segmented switch with calendar range selection only when needed.
- Schedule list cards were made denser while preserving existing calendar/list behaviour, assignment status, and edit flows.
- Timesheets header, Share action, and date/filter layout were compacted.
- Timesheets filters now open from a compact summary bar into a bottom sheet while preserving date, employee, project, completed-only, and Share Report logic.
- Timesheet cards were simplified to core employee, project/task, hours, rate, cost, clock in/out, and status data.
- Timesheet Edit/Delete actions were reduced visually while keeping existing confirmation and RBAC safeguards.
- Pictures screen was polished as a clean media gallery with only Project, Employee, and Date Range filters visible.
- Pictures gallery cards were tightened and Project Documentation wording remains absent.
- Receipts screen now uses the shared compact media/filter style with Project, Employee, and Date Range controls.
- Receipt total was reduced from a large hero into a compact KPI in the page header.
- Receipt cards were made more compact and scannable while preserving receipt upload/storage/project_media behaviour.
- Standard date range modal remains reused for Pictures, Receipts, and Timesheets.
- Empty states were polished for Schedule, Timesheets, Pictures, and Receipts.
- No SQL, database, AI, or business-logic changes were made.

## B.1-fix-11B Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-31p2kov8k-samrental70-7859s-projects.vercel.app
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-11C Enterprise Mobile Redesign Phase 3
- Employees screen converted toward compact rows/slim cards with name, role, status, pay rate, and quick manager action visible.
- Employee Active / Archived / All segmented control preserved and paired with compact employee search.
- Manager Clock In / Clock Out action remains on each employee row and continues to use existing timesheet logic.
- Employee project/task clock-in selectors were moved behind a compact row detail so the main list stays scannable.
- Company code/invite/share utility compacted into a smaller utility card.
- Settings screen flattened into grouped compact sections for Company, Time Tracking, Projects & Tasks, Account, and Team Management.
- More/Menu drawer reduced from large navigation cards into a tighter grouped-list style while preserving access to operations, media, reports, requests, settings, and account/logout.
- Request Center remains accessible outside dashboard/Home through the menu/timesheets path.
- Activity Feed / Team Events rows were made denser with smaller icon chips and one consistent title style.
- Notification badge visual weight reduced.
- Final B.1 mobile QA checklist updated for Employees, More/Menu, Settings, Activity Feed, Request Center, notifications, destructive action checks, and cross-screen visual QA.
- No SQL, database, AI, or business-logic changes were made.

## B.1-fix-11C Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-re4j6x1zi-samrental70-7859s-projects.vercel.app
- Production/main deployment: Not run.
- Secrets/env files: Not changed.
- Enterprise Mobile Redesign 11A/11B/11C status: complete on develop pending user QA.

## B.1-fix-12 Clock App UI Professionalization V1
- Global app font stack standardized to `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Global design tokens added for navy, slate, blue, green, amber, purple, red, surfaces, borders, text, and elevation.
- Global app background standardized to `#F4F7FB`.
- Shared Card component now uses the standard white surface, `#E2E8F0` border, 20px radius, and subtle `0 8px 24px rgba(15, 23, 42, 0.06)` shadow.
- Shared Button component now uses the standard navy primary style with 14px radius and lighter typography.
- Date range button/modal styling tightened to match the same surface, radius, and shadow system.
- CSS token layer added under `.opera-shell` to reduce old heavy shadows, oversized radii, and inconsistent slate backgrounds across touched screens.
- Auth/onboarding/error surfaces updated to the same app background and calmer card elevation.
- Bottom navigation now uses the standard Home / Schedule / Clock / More shell with 64px safe-area height, glass white surface, navy active state, and subdued inactive labels.
- Activities remains out of the main bottom nav and is preserved as Home/More content.
- No SQL, database, AI, or business-logic changes were made.

## B.1-fix-12 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-mj9xffuwi-samrental70-7859s-projects.vercel.app
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-13 Home Screen Redesign V1
- Home screen reordered into a manager operations dashboard flow: quick actions, live operations, active team, worked today, team coverage, live job sites, and recent activity.
- Global app header tightened around a 72px compact layout with menu, logo, company name, date/user metadata, refresh, and notification bell.
- Header "Logged in:" wording removed; the secondary header line now shows date and user name only.
- Development chip reduced to a tiny dev-only label and notification badge size capped with `99+` handling.
- Duplicate Home refresh action remains removed because the global header refresh is the single refresh control.
- Install app banner slimmed to `Install Clock App` with short subtitle, compact Install action, and dismiss control.
- Home quick actions renamed to Schedule, Photos, Receipts, and Team while preserving their existing routes/modules.
- Quick action cards resized to one professional row with white surfaces and muted icon color.
- Live operations KPI tiles polished while preserving live active hours/labour calculations.
- Active Team empty state and active employee rows compacted while preserving live time/cost, location, and clock-out actions.
- Worked Today cleaned with Employees / Entries / Labour KPIs, Total hours / Labour cost summary, and a maximum of 3 recent rows on Home.
- Team coverage renamed and empty chart state compacted.
- Live job sites map compacted when there are no active locations.
- Recent activity renamed, limited to 6 Home rows, and linked to the full activity view.
- No SQL, database, AI, or business-logic changes were made.

## B.1-fix-13 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-hmqaexwq8-samrental70-7859s-projects.vercel.app
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-14 Clock Screen Redesign V1
- Before clock-in screen redesigned around a compact `Select work` card.
- Project / Job site and Task fields cleaned while preserving existing project/task data, assignment rules, and employee visibility.
- Task helper text now appears only when a project must be selected to load tasks.
- Add Project / Add Task moved out of primary field labels into a smaller secondary admin actions row.
- Clock In remains the primary full-width navy action.
- Photo and Receipt actions are secondary buttons below Clock In.
- Task List and Material List remain secondary links/buttons and no longer use colored competing surfaces.
- Active shift timer card flattened to the standard white surface with border, 20px radius, and subtle shadow.
- Active shift card now shows a small Working status chip, project/task, timer, earned amount, and sync status.
- Timer scale reduced to a professional mobile size while preserving live timer and live earned amount updates.
- Clock Out moved to a full-width primary navy action after clock-in.
- Photo, Receipt, Change Task, and Start Break are secondary action buttons.
- Break label changed to Start Break for the initial break action.
- Visible emoji-style action icons were removed from the Clock screen.
- Existing clock, location, photo, receipt, change-task, break, and project/task permission logic was preserved.
- No SQL, database, AI, or business-logic changes were made.

## B.1-fix-14 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-fmrt1c4de-samrental70-7859s-projects.vercel.app
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-15 Timesheet Screen Redesign V1
- Timesheet page title standardized to `Timesheets`.
- Timesheet subtitle updated to `Review labour hours and costs`.
- Employee-only `My Timesheet` wording removed while preserving employee record visibility restrictions.
- Filters compacted into one card with date range summary, employee/project summary, completed-only status, and Share report action.
- Quick range chips added for Today, Week, Month, and Custom while preserving the existing standard date picker for custom ranges.
- Employee and Project filters remain in the compact filter sheet.
- Timesheet cards redesigned with employee, email, status chip, project/task, Hours/Rate/Cost metrics, In/Out times, and location actions.
- Clock-in and clock-out map links changed from blue underlined links to small secondary map buttons.
- Large Delete button removed from the main timesheet card action area.
- Delete moved into More/overflow for normal card view and remains confirmation-protected through the existing delete handler.
- Existing timesheet fetching, filters, Share Report, labour calculations, RBAC, and employee visibility logic were preserved.
- No SQL, database, AI, or destructive data changes were made.

## B.1-fix-15 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-jplc4tgi9-samrental70-7859s-projects.vercel.app
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-16 Team Screen Redesign V1
- Employees screen visible UI renamed to `Team` with subtitle `Manage employee accounts`.
- Active / Archived / All tabs remain compact and preserve existing filtering.
- Company invite card compacted to `Invite employees` with a copyable company code pill and Share action.
- Manager employee clock-in/clock-out success feedback now appears as a temporary Team toast instead of a permanent page card.
- Employee rows were redesigned into compact professional cards with name, status chip, role, pay rate, one-line email, default assignment, and compact Clock In / Clock Out plus Edit actions.
- Email display now uses one-line truncation to prevent awkward wrapping on mobile.
- Project and task selectors remain available under a grouped `Default assignment` section.
- Effective date and joining date moved into a collapsed `More details` section.
- More/Menu and Settings entry labels now point to `Team` for consistency with Home.
- Existing employee loading, edit flow, manager clock-in/out, default assignment picks, Share invite, RBAC, and SQL-backed settings logic were preserved.
- No SQL, database, AI, or destructive data changes were made.

## B.1-fix-16 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-ixmezsx4w-samrental70-7859s-projects.vercel.app
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-17 More/Menu Screen Redesign V1
- More drawer redesigned as a compact professional `Menu` screen.
- Menu subtitle now uses the logged-in user's display name or email dynamically.
- Menu rows are grouped into Work, Operations, and Admin sections.
- Work includes Schedule, Timesheets, Projects where allowed, and Tasks & materials.
- Operations includes Team for admin users, Photos, Receipts, and Reports for admin users.
- Admin includes Request Center and Settings while preserving role-safe navigation.
- Rows now render with compact white surfaces, subtle borders, small colored icon chips, label, subtitle, chevron, and optional badge.
- Large colored menu row backgrounds were removed from the rendered menu.
- Photos and Request Center badges remain small and non-dominant.
- Logout remains at the bottom as a compact 52px soft-red row.
- Existing bottom navigation Home / Schedule / Clock / More and existing `openMenuTab` navigation guard were preserved.
- No SQL, database, AI, or destructive data changes were made.

## B.1-fix-17 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-8qej8hjvb-samrental70-7859s-projects.vercel.app
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
- B.1-fix-10 does not require new SQL.
- B.1-fix-11A does not require new SQL.
- B.1-fix-11B does not require new SQL.
- B.1-fix-11C does not require new SQL.
- B.1-fix-12 does not require new SQL.
- B.1-fix-13 does not require new SQL.
- B.1-fix-14 does not require new SQL.
- B.1-fix-15 does not require new SQL.
- B.1-fix-16 does not require new SQL.
- B.1-fix-17 does not require new SQL.
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
