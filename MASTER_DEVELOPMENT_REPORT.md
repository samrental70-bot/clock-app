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

## B.1-fix-18 Photos Screen Redesign V1
- Pictures screen visible UI renamed to `Photos`.
- Photos subtitle updated to `Job site media by project`.
- Project Documentation wording remains absent from the visible Photos screen.
- Visible Photos filters remain limited to Project, Employee, and Date Range.
- Project and Employee filters were compacted, and the shared Date Range button was tightened.
- Project media sections now show project name and current filtered photo count.
- Project counts use the filtered photo bucket for the selected project/employee/date range.
- Selection mode now starts with a compact Select action, then shows selected count, Share, and Clear when photos are selected.
- Share is disabled only at zero selected and uses a light disabled state.
- Photo grid now uses two columns with 8px gap, 12px thumbnail corners, and 28px top-left selection checkboxes.
- Video display is preserved with a small tile indicator.
- Existing media fetching, photo/video upload, project_media, AI/documentation backend, and RBAC logic were preserved.
- No SQL, database, AI, or destructive data changes were made.

## B.1-fix-18 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-ppjratuk3-samrental70-7859s-projects.vercel.app
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-19 Receipts Screen Redesign V1
- Receipts header kept as `Receipts` and subtitle updated to `Expenses by project`.
- Receipts filters are organized as Project, Date Range, Employee, and Task.
- Receipt Project, Employee, and Task filters were compacted, and Date Range continues to use the shared calendar modal.
- Receipt task filter now feeds the existing media bucket filtering path.
- Receipt total was moved into a compact premium dark navy KPI card.
- Receipt project sections now show project name, filtered total amount, and filtered receipt count.
- Receipt cards were redesigned into compact expense rows with 12px thumbnail corners, supplier/category, amount, project/task, uploaded-by employee, date/time, status chip, map action, and admin OCR action where allowed.
- Missing or broken receipt images now reveal a clean receipt-image placeholder.
- Existing receipt upload/storage, project_media, OCR/AI hooks, reports integration, RBAC, and employee visibility logic were preserved.
- No SQL, database, AI, or destructive data changes were made.

## B.1-fix-19 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-7l6hul85n-samrental70-7859s-projects.vercel.app
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-20 Final UI Professionalization Pass V1
- Shared design primitives were standardized in the app layer: AppHeader, BottomNav, PageCard, SectionCard, KPIBox, PrimaryButton, SecondaryButton, DangerAction, EmptyState, ActivityRow, FilterCard, and StatusChip.
- Global CSS tokens now expose the final field-operations UI system for navy, slate, blue, green, amber, purple, red, surfaces, borders, spacing-friendly radii, and light shadows.
- AppHeader now renders through one shared compact component with menu, logo, company name, date/user metadata, refresh, and notification bell.
- Bottom navigation now renders through one shared component with visible Home / Schedule / Clock / More only.
- Hidden legacy emoji navigation markup was removed.
- Global `No emp` fallback was replaced with `Unassigned`.
- Visible `Pictures` menu fallback wording was changed to `Photos`.
- Existing Home, Clock, Schedule, Timesheets, Team, Photos, Receipts, and More/Menu logic remains unchanged.
- Development screenshot smoke capture reached the deployed Login screen only; authenticated screen-by-screen screenshots still require a signed-in browser session or QA credentials.
- No SQL, database, AI, or destructive data changes were made.

## B.1-fix-20 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-f689vm45c-samrental70-7859s-projects.vercel.app
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-21 Duration Display Cleanup
- Visible duration labels now use hours-and-minutes formatting instead of decimal hour formatting.
- Home live operations, Worked Today totals, Timesheets cards/share text, Reports summaries, and legacy dashboard summary displays now render values like `2h 38m` instead of `2.63h`.
- Underlying labour, rate, and payroll calculations remain numeric and unchanged.
- No SQL, database, AI, or destructive data changes were made.

## B.1-fix-21 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-m23m62rhx-samrental70-7859s-projects.vercel.app
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-21 Home Screen Final UI Polish V2
- Mobile AppHeader was simplified to logo, company name, tiny development chip, optional user subline, and notification bell only.
- Visible hamburger and refresh controls were removed from the mobile header/Home chrome.
- Bottom navigation was updated to five compact items: Home, Schedule, Clock, Timesheets, and More.
- Home hero now uses a time-aware greeting with the user's first name and a single Today/date subtitle.
- Home quick actions remain Schedule, Photos, Receipts, and Team with muted professional action cards.
- Live operations was reduced to three KPIs: Active, Hours, and Labour; the Issues KPI was removed.
- Active Team, Worked Today, Team Coverage, Live Job Sites, and Recent Activity sections were tightened with dark luxury navy styling, softer surfaces, better alignment, and smaller chips/buttons.
- Recent Activity remains limited to the first six Home rows with View all activity preserved.
- Existing Home data queries, live time/labour calculations, clock-out actions, map actions, RBAC, and company restrictions were preserved.
- No SQL, database, AI, or destructive data changes were made.

## B.1-fix-21 Home Polish V2 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-pcsefai92-samrental70-7859s-projects.vercel.app
- Screenshots: Attempted with headless Chrome; authenticated Home screenshots are blocked by the deployed Login screen in this environment and require a signed-in browser session or QA credentials.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-22 Clock Screen Professional Redesign V2
- Clock normal working state no longer shows a permanent `Synced` badge.
- Clock sync/status messaging now only appears when attention is needed, such as an unsaved shift.
- Separate Add Project and Add Task buttons were removed from the main Clock screen.
- Project dropdowns now keep existing projects first and include `+ Add new project` at the bottom when the existing permission setting allows it.
- Task dropdowns now keep existing tasks first and include `+ Add new task` at the bottom when the existing permission setting allows it.
- Before clock-in flow was redesigned as a compact `Start shift` card with Project / Job Site, Task, primary Clock In, Quick capture, and Tools sections.
- Clock In / Clock Out remain the only dark filled primary Clock actions.
- Photo and Receipt were kept as secondary quick capture actions, with Receipt using subtle green styling.
- Task List and Material List were moved into lower-priority soft tool buttons.
- Clocked-in flow was redesigned as a `Current shift` card with Working chip, project/task, Elapsed timer, Earned amount, primary Clock Out, Quick capture, Shift tools, and Lists/tools.
- Break action label was changed to `Start Break` before a break begins.
- Change Task label and active task-change dropdowns were cleaned while preserving existing project/task assignment and notification paths.
- Existing clock-in, clock-out, photo, receipt, change-task, break, task-list, material-list, location prompt, RBAC, and employee project/task creation permission logic were preserved.
- No SQL, database, AI, or destructive data changes were made.

## B.1-fix-22 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-dm1480z8o-samrental70-7859s-projects.vercel.app
- Screenshots: Attempted with headless Chrome; authenticated Clock screenshots are blocked by the deployed Login screen in this environment and require a signed-in browser session or QA credentials.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-23 Home Section Order + Combined Live Team Card
- Home information flow was updated to Header, Hero / Quick Actions, Team Coverage, Live Team, Worked Today, Live Job Sites, and Recent Activity.
- Team Coverage now appears before the live working crew summary.
- The separate `Live operations` card was removed.
- The separate `Active team` card was replaced by a combined `Live team` card.
- Live Team now contains the Active, Hours, and Labour KPI row above the active employee list.
- The Issues KPI remains removed from Home.
- Active employee rows remain inside Live Team with clock-in time, Working chip, project/task, live duration, compact earned amount, Location, and Clock out action.
- Live Team keeps a compact empty state for zero working employees while still showing Active 0, Hours 0h, and Labour $0.
- Worked Today remains after Live Team and still uses completed same-day shifts only.
- Team Coverage only renders the employees-by-hour chart shell when there is useful chart data; otherwise it shows a compact `No login activity yet.` state.
- Existing Home queries, live hours/labour calculations, Worked Today calculations, dashboard clock-out actions, map actions, RBAC, and company restrictions were preserved.
- No SQL, database, AI, or destructive data changes were made.

## B.1-fix-23 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-61ntqwtf2-samrental70-7859s-projects.vercel.app
- Screenshots: Attempted with headless Chrome; authenticated Home screenshots are blocked by the deployed Login screen in this environment and require a signed-in browser session or QA credentials.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-24 Royal Navy Luxury Design System Implementation
- Permanent design source-of-truth document added at `CLOCK_APP_DESIGN_SYSTEM.md`.
- Royal Navy FieldOps UI brand direction, color palette, typography scale, buttons, cards, inputs, chips, navigation, empty states, do/don't rules, and screenshot checklist were documented.
- Future UI rule added: all future UI work must use the Royal Navy FieldOps UI tokens and must be checked against the design document before completion.
- Global CSS tokens were standardized around Royal Navy 950 `#061426`, Royal Navy 900 `#0B1F33`, background `#F4F7FB`, white surfaces, soft surfaces, borders, dividers, semantic status colors, shadows, and radius tokens.
- Existing `opera-*` component helpers were mapped to the new token names so PageCard, SectionCard, KPIBox, buttons, danger actions, empty states, status chips, activity rows, AppHeader, BottomNav, filters, forms, and schedule forms share the same system.
- Legacy slate/black/near-black visual utility classes were routed through Royal Navy compatibility overrides where safe.
- Visible pure black overlays/media backgrounds and old near-black chart strokes in the app code were converted to Royal Navy `#061426`.
- App error boundary primary action was converted from the older navy value to Royal Navy `#061426`.
- Top header and bottom nav theme inheritance remains centralized through the shared `opera-*` CSS layer.
- Existing Home, Clock, Schedule, Timesheets, Team, Photos, Receipts, More/Menu, Settings, Reports, Request Center, modal, dropdown, toast, empty-state, form, RBAC, and company-scoped logic remains unchanged.
- No SQL, database, AI, or destructive data changes were made.

## B.1-fix-24 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-4gmo54mt6-samrental70-7859s-projects.vercel.app
- Screenshots/checklist status: In-app browser screenshot attempt reached a signed-in loading state and did not expose authenticated app screens; authenticated screenshots require a signed-in QA session.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-24 Startup Loading Hotfix
- Fixed the development app hang on `Loading OPERA.AI Development...` for signed-in desktop/browser sessions.
- Root cause: the Supabase auth state callback was awaiting profile/company context loading directly during `SIGNED_IN`, which could trap the initial session check before `initialLoading` was released.
- Auth event handling now defers the async sign-in context load outside the Supabase callback path and clears `initialLoading` in the deferred completion path.
- Verified in the in-app browser that the development app now renders the signed-in Home dashboard instead of staying on the loading screen.
- Existing auth, profile, company membership, RBAC, Home, Clock, and data logic were preserved.
- No SQL, database, AI, or destructive data changes were made.

## B.1-fix-24 Startup Loading Hotfix Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-ee5gy62ui-samrental70-7859s-projects.vercel.app
- Browser verification: Passed; signed-in Home dashboard loads in the in-app browser.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-24 Royal Navy Visibility Correction
- Rechecked the signed-in Home screen in the in-app browser after user feedback that the theme still appeared black.
- Confirmed the old pure-black values were removed, but visible filled UI still read too dark because the filled layer used the deepest Royal Navy 950 tone.
- Updated the visible filled brand layer to use approved Royal Navy 800 / 900 tokens so primary pills, KPI fills, active indicators, dark chips, modals, and button surfaces read as Royal Navy blue instead of black.
- Preserved Royal Navy 950 for primary text, deepest brand accents, and high-contrast identity.
- Added the visible-filled-surface guidance to `CLOCK_APP_DESIGN_SYSTEM.md`.
- Added global CSS normalization for common Tailwind blue, purple, green, amber, orange, red, and emerald utility colors so UI elements resolve to the approved design tokens.
- Verified in the in-app browser that visible filled surfaces now compute to Royal Navy 800 `rgb(16, 42, 67)` or Royal Navy 900 `rgb(11, 31, 51)`.
- Existing app functionality, auth startup hotfix, RBAC, company restrictions, and data logic were preserved.
- No SQL, database, AI, or destructive data changes were made.

## B.1-fix-24 Royal Navy Visibility Correction Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-9pjwj4u7l-samrental70-7859s-projects.vercel.app
- Screenshots/checklist status: Signed-in in-app browser screenshot reviewed; Home visible filled surfaces now render Royal Navy 800 / 900 rather than black.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-25 Clock Screen Luxury Simplification V3
- Clock screen before-shift layout was simplified so the main `Start shift` card contains only Project / Job Site, Task, and Clock In.
- Photo, Receipt, Task List, and Material List were moved below the main Start shift card as quiet secondary/lower-priority actions.
- Clock screen labels `Quick capture`, `Tools`, `Shift tools`, and `Lists/tools` were removed.
- Current shift card was simplified into one premium Royal Navy card surface with project/task, Working chip, large elapsed timer, smaller earned amount with subtle Luxury Gold accent, and one primary Clock Out button.
- Photo, Receipt, Change Task, and Start Break are quiet secondary actions with white surfaces and subtle borders.
- Receipt action uses subtle green text/border only and is not a strong green filled button.
- Task List and Material List were reduced to smaller lower-priority soft outline actions.
- Clock In and Clock Out use Royal Navy `#061426` as the only strong primary actions in their states.
- Header cleanup and bottom nav Royal Navy active styling were preserved.
- Existing clock-in, clock-out, photo, receipt, change-task, break, task-list, material-list, project/task dropdown, `+ Add new project`, `+ Add new task`, RBAC, company restrictions, live timer, and earned calculation logic were preserved.
- No SQL, database, AI, or destructive data changes were made.

## B.1-fix-25 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-hwjpajkx1-samrental70-7859s-projects.vercel.app
- Screenshots/checklist status: Clock before-clock-in screenshot captured; project/task dropdown options verified in DOM and select screenshots captured. After-clock-in screenshot could not be captured without changing live database state because the available signed-in demo employee was not in an active personal Clock state.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-25 Clock Mockup Alignment Refinement
- Refined the Clock screen toward the controller reference mockup without changing clock business logic.
- Added a compact Royal Navy / Luxury Gold visual accent to the Start shift title and Clock In / Clock Out primary actions.
- Before clock-in, the Start shift card remains limited to Project / Job Site, Task, and Clock In.
- Photo, Receipt, and Lists were moved into compact secondary tiles below the main Start shift card.
- The Lists tile opens a small menu for Task List and Material List so both existing tools remain accessible.
- Current shift timer layout was adjusted with an Elapsed time label, centered timer emphasis, and smaller Luxury Gold earned amount.
- Clocked-in secondary actions were converted to four compact tiles for Photo, Receipt, Change Task, and Start Break.
- Task List and Material List remain lower-priority text actions below the clocked-in action tiles.
- Clock-screen camera/upload action buttons that still used slate/green filled styling were aligned to Royal Navy where safe.
- Bottom navigation active state was tightened to a Royal Navy pill with a subtle Luxury Gold indicator to match the controller reference.
- Existing clock-in, clock-out, photo, receipt, change-task, break, task-list, material-list, project/task dropdown, `+ Add new project`, `+ Add new task`, RBAC, company restrictions, live timer, and earned calculation logic were preserved.
- No SQL, database, AI, production deployment, main push, or destructive data action was run.

## B.1-fix-25 Mockup Refinement Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-9604gulp2-samrental70-7859s-projects.vercel.app
- Screenshots/checklist status: Before-clock-in Clock screenshot captured after development alias update. After-clock-in screenshot was not captured because creating an active shift would modify live team data.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-25 Clock Action Icon Refinement
- Replaced the temporary `Ph`, `Rc`, `Li`, `Ch`, and `Br` action glyph placeholders with small inline SVG line icons.
- Added matching icons for Photo, Receipt, Lists, Change Task, and Start Break without adding a new icon dependency.
- Existing Clock screen action handlers, project/task dropdowns, list menus, photo/receipt upload flow, change-task flow, break flow, RBAC, and company restrictions were preserved.
- No SQL, database, AI, production deployment, main push, or destructive data action was run.

## B.1-fix-25 Clock Action Icon Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-55mugzyx4-samrental70-7859s-projects.vercel.app
- Screenshots/checklist status: Before-clock-in Clock screenshot captured after development alias update.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-26 Official Royal Navy Color System Enforcement
- Updated `CLOCK_APP_DESIGN_SYSTEM.md` to the official Royal Navy Luxury FieldOps UI naming and color palette.
- Added the official ivory surface and receipt amber naming to the design documentation and CSS token set.
- Updated central CSS tokens so `--opera-navy` resolves to Royal Navy 950 `#061426` for primary actions and active navigation.
- Added safe compatibility aliases for older receipt token names while introducing the official `--color-receipt` and `--color-receipt-soft` tokens.
- Expanded global enforcement overrides so old slate/black utility classes inside the app resolve to the official Royal Navy/text/surface tokens.
- Replaced remaining direct `bg-slate-900` filled UI classes and one primary `bg-blue-700` action with Royal Navy `#061426` where safe.
- Preserved semantic blue, green, purple, amber, and red usage for schedule/info/link, live/success, photos/media, receipts/cost, and destructive/error states.
- Clock screen color usage was audited: Clock In/Out, timer, earned accent, working chip, inputs, and bottom nav remain aligned with the official color rules.
- Existing functionality, RBAC/company restrictions, team data, and React hook order were preserved.
- No SQL, database, AI, production deployment, main push, or destructive data action was run.

## B.1-fix-26 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-g34u8tjby-samrental70-7859s-projects.vercel.app
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
- B.1-fix-18 does not require new SQL.
- B.1-fix-19 does not require new SQL.
- B.1-fix-20 does not require new SQL.
- B.1-fix-21 does not require new SQL.
- B.1-fix-22 does not require new SQL.
- B.1-fix-23 does not require new SQL.
- B.1-fix-24 does not require new SQL.
- B.1-fix-25 does not require new SQL.
- B.1-fix-26 does not require new SQL.
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
