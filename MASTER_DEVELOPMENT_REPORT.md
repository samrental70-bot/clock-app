# OPERA.AI Master Development Report

## Release Line
- Production/beta branch: main
- Development branch: develop
- Current development version: Beta Release B candidate from B.1-fix-45
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

## B.1-fix-27 Timesheets Royal Navy Mockup Polish
- Updated the visible Timesheets screen to follow the controller-provided reference layout using the approved Royal Navy Luxury FieldOps colors.
- Rebuilt the Timesheets page header with a compact clock icon tile, large `Timesheets` title, and `Review labour hours and costs` subtitle.
- Restyled the filter card with a Filters label/icon, Royal Navy Share report button, Today/Week/Month/Custom chips, and compact date/employee/project summary row.
- Restyled the manual time entry trigger as a compact bordered row with a plus icon while preserving the existing manual time request flow.
- Redesigned timesheet cards with employee initials avatar, name/email, status chip, project/task line, metric tiles for hours/rate/cost, in/out tiles, and compact Edit/More actions.
- Kept map actions and Delete inside the More/overflow path, preserving delete confirmation and existing map/location logic.
- Preserved timesheet fetching, filters, share report, edit request/admin edit, labour calculations, RBAC/company restrictions, and React hook order.
- No SQL, database, AI, production deployment, main push, or destructive data action was run.

## B.1-fix-27 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-oq1z3dyof-samrental70-7859s-projects.vercel.app
- Screenshots/checklist status: Authenticated Timesheets screenshot captured after development alias update.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-28 Royal Navy Date Picker / Filter Sheet Polish
- Updated the shared date range button to the approved Royal Navy field-operations style with compact label, calendar icon, date range text, and navy preset chip.
- Redesigned the shared standard date range modal used by Timesheets, Photos, and Receipts to match the controller reference: bottom sheet, drag handle, Royal Navy title treatment, segmented Today/Week/Month/Custom controls, selected range card, native date inputs, and Reset/Apply-style button hierarchy.
- Updated the Timesheets filter sheet to match the provided filter mockup with compact bottom-sheet layout, Date Range row, Employee and Project select rows with icons/chevrons, Completed shifts control, and Royal Navy Reset/Apply buttons.
- Reused the shared date picker styling for Reports so the old bright-blue Reports date picker no longer uses a separate modal style.
- Preserved existing date range logic, quick ranges, custom date entry, employee/project filters, completed-only filtering, share report, RBAC/company restrictions, and React hook order.
- No SQL, database, AI, production deployment, main push, or destructive data action was run.

## B.1-fix-28 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-oplqo17ij-samrental70-7859s-projects.vercel.app
- Screenshots/checklist status: Authenticated Timesheets filter sheet and date picker sheet screenshots captured after development alias update.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-29 Photos / Receipts / Reports Date Filter Alignment
- Extended the Royal Navy date/filter pattern to Photos, Receipts, and Reports.
- Photos now uses a matching filter card with Filters header, Photos chip, shared Date Range row, and Royal Navy Project/Employee select rows.
- Receipts now uses a matching filter card with Filters header, Receipts chip, shared Date Range row, and Royal Navy Project/Employee/Task select rows.
- Reports date control now uses the same shared Date Range button and a cleaner Royal Navy report header instead of the older gradient/blue-heavy treatment.
- Shared date picker modal remains the source for Timesheets, Photos, Receipts, and Reports, preserving quick ranges and custom date behavior.
- Preserved existing photo/media filtering, receipt filtering, reports date filtering, RBAC/company restrictions, V3/V4 media backend, OCR/AI hooks, and React hook order.
- No SQL, database, AI, production deployment, main push, or destructive data action was run.

## B.1-fix-29 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-59ekdw3km-samrental70-7859s-projects.vercel.app
- Screenshot/checklist status: Photos and Receipts verified with authenticated QA screenshots; Reports code/build verified, with full Reports screenshot requiring an admin signed-in QA session.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-30 Home Quick Actions / Bottom Navigation Update
- Updated the Home quick-action row for admin dashboard users to show Schedule, Photos, Receipts, and Reports.
- Replaced the Team quick action with Reports while preserving Team access from Menu.
- Removed Schedule from the fixed bottom navigation.
- Bottom navigation now shows Home, Clock, Timesheets, and More.
- Schedule remains accessible from the Home quick action and Menu.
- More now shows the active navigation state for overflow screens such as Schedule, Photos, Receipts, Reports, Team, Settings, Projects, and Lists.
- Preserved existing Home, Schedule, Reports, Menu, RBAC/company restriction, and React hook order logic.
- No SQL, database, AI, production deployment, main push, or destructive data action was run.

## B.1-fix-30 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-7jkj61bks-samrental70-7859s-projects.vercel.app
- Browser verification status: Development app loads; signed-in Home visual QA is gated by login session.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-31 Timesheets Reference Layout Update
- Updated the Timesheets screen toward the provided reference design.
- Added a Royal Navy header band with compact title/subtitle treatment.
- Moved the Today/Week/Month/Custom range controls into a compact segmented strip under the header.
- Simplified the date/filter row into one compact white control with date range, employee, project, and completed-only summary.
- Converted Share report into a full-width Royal Navy action with subtle gold icon accent.
- Converted Add manual time into a compact gold-outline action for employee manual-time requests.
- Redesigned timesheet entry cards into slimmer white cards with employee, project/task, amount, status, and In/Out/Total columns.
- Large metric tiles were removed from the normal card view; edit, map, delete, and approval actions remain available through existing edit/overflow flows.
- Preserved existing date filtering, employee filtering, project filtering, Share Report, manual time request, edit/delete confirmation, map, RBAC/company restriction, and React hook order logic.
- No SQL, database, AI, production deployment, main push, or destructive data action was run.

## B.1-fix-31 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-j1m4pyrf1-samrental70-7859s-projects.vercel.app
- Browser verification status: Development app loads; signed-in Timesheets visual QA is gated by login session.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-32 Reports Reference Layout Update
- Updated the Reports screen toward the provided reference design using approved Royal Navy Luxury colours.
- Rebuilt the top Reports area with a clean page title, gold scope label, compact date range card, and Today/Week/Month/Custom preset chip.
- Replaced the older report summary card with an Overview card showing Team Hours, Entries, Employees, Projects, and Estimated Pay.
- Used Royal Navy for text/actions, Luxury Gold for the overview accent, Success Green for Estimated Pay, and approved soft surfaces/borders.
- Preserved existing report date range logic, quick range presets, report calculations, project/employee/task breakdown drill-down, RBAC/company restriction, and React hook order logic.
- Screenshot verification completed in the signed-in demo company session.
- Screenshot: `screenshots/b1-fix-32-reports-final.png`
- No SQL, database, AI, production deployment, main push, or destructive data action was run.

## B.1-fix-32 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-ia5h4g1yp-samrental70-7859s-projects.vercel.app
- Browser verification status: Passed in signed-in demo company session.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-33 Shared Date Picker Royal Navy Update
- Updated the shared date picker used by Timesheets, Photos, Receipts, and Reports to match the approved bottom-sheet reference design.
- Refined the date chooser overlay, drag handle, close button, segmented Today/Week/Month/Custom controls, selected range panel, From/To date inputs, and Cancel/Apply actions.
- Updated shared date range trigger cards to use approved Royal Navy, white surface, slate border, and compact calendar-icon styling.
- Preserved existing date range state, quick range calculations, custom date selection, filtering behavior, reports integration, RBAC/company restrictions, and React hook order.
- Screenshot verification completed in the signed-in demo company session.
- Screenshots:
  - `screenshots/b1-fix-33-timesheets-date-picker.png`
  - `screenshots/b1-fix-33-photos-date-picker.png`
  - `screenshots/b1-fix-33-receipts-date-picker.png`
  - `screenshots/b1-fix-33-reports-date-picker.png`
- No SQL, database, AI, production deployment, main push, or destructive data action was run.

## B.1-fix-33 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-1g15zv3uo-samrental70-7859s-projects.vercel.app
- Browser verification status: Passed in signed-in demo company session.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-34 Schedule Reference Layout Update
- Updated the Schedule screen toward the provided reference layout using approved Royal Navy Luxury colors.
- Refined the Schedule page header with a larger title, Team work plan subtitle, and compact Royal Navy New task action with gold accent.
- Rebuilt the List / Calendar segmented control with compact icon labels and approved active-state styling.
- Redesigned list-mode schedule day groups with compact uppercase date headings and gold calendar accents.
- Redesigned schedule task rows as slim white cards with a Royal Navy task icon, task title, time range, assignment/status chip, and gold chevron.
- Applied the same compact list-row styling to the employee assigned-schedule list while preserving accept/decline actions.
- Preserved existing schedule loading, list/calendar switching, new task creation, task edit flow, assignment display, employee response flow, RBAC/company restrictions, and React hook order.
- Screenshot verification completed in the signed-in demo company session.
- Screenshot: `screenshots/b1-fix-34-schedule-reference-layout.png`
- No SQL, database, AI, production deployment, main push, or destructive data action was run.

## B.1-fix-34 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-kmhwx7bf1-samrental70-7859s-projects.vercel.app
- Browser verification status: Passed in signed-in demo company session.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-35 Reports Reference Layout Polish
- Updated the Reports screen toward the latest provided reference using approved Royal Navy Luxury colors.
- Enlarged the Reports title and preserved the gold project/scope label under it.
- Restyled the date range card with compact Date Range label, one-line date range, and Royal Navy Today chip with calendar icon.
- Refined the Overview card header with gold accent and compact white surface.
- Reworked Overview KPI cells to better match the reference layout, including larger Team Hours, Entries, Employees, Projects, and a soft-green Estimated Pay panel.
- Kept View by and Breakdown controls visible below the Overview card with matching compact Royal Navy styling.
- Preserved existing report date range logic, quick range presets, calculations, drill-down grouping, RBAC/company restrictions, and React hook order.
- Screenshot verification completed in the signed-in demo company session.
- Screenshot: `screenshots/b1-fix-35-reports-reference-layout.png`
- No SQL, database, AI, production deployment, main push, or destructive data action was run.

## B.1-fix-35 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-cl20fnvhp-samrental70-7859s-projects.vercel.app
- Browser verification status: Passed in signed-in demo company session.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-36 Royal Navy Top Header Update
- Updated the shared global AppHeader toward the provided dark Royal Navy reference.
- Replaced the white header card treatment with a full-width Royal Navy brand bar using approved `#061426`, `#0B1F33`, and Luxury Gold accents.
- Reworked header layout to show the company/logo lockup on the left and compact user name, gold DEV chip, and notification bell on the right.
- Reduced header spacing and badge sizes so the bar feels more like a premium mobile SaaS app header.
- Preserved notification click behavior, unread badge logic, dynamic company name, dynamic user label, development-only chip behavior, and React hook order.
- Screenshot verification completed in the signed-in demo company session.
- Screenshot: `screenshots/b1-fix-36-royal-navy-header.png`
- No SQL, database, AI, production deployment, main push, or destructive data action was run.

## B.1-fix-36 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-50rvo8unc-samrental70-7859s-projects.vercel.app
- Browser verification status: Passed in signed-in demo company session.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-37 Schedule Edit Job Form Polish
- Updated the Schedule edit UI toward the provided reference layout using approved Royal Navy Luxury colors.
- Renamed the visible scheduled work title concept from Task title to Job in Schedule create/edit UI so it is distinct from Project and Task.
- Updated Schedule admin primary action from New task to New job.
- Rebuilt the inline edit state into a compact Edit Job card with header icon, close action, Job field, Project/Task row, Start date/Start time/End time row, employee picker, notes, Save, Cancel, and Delete Job actions.
- Added selected employee count to the edit form.
- Kept Project and Task dropdown logic, assignment persistence, schedule save/delete confirmation, RBAC/company restrictions, and React hook order unchanged.
- Screenshot verification completed in the signed-in demo company session.
- Screenshot: `screenshots/b1-fix-37-schedule-edit-job-final.png`
- No SQL, database, AI, production deployment, main push, or destructive data action was run.

## B.1-fix-37 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-5t11s0ro5-samrental70-7859s-projects.vercel.app
- Browser verification status: Passed in signed-in demo company session.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-38 Reports Overview No-Icon Polish
- Updated the Reports overview card toward the provided no-icon reference using approved Royal Navy Luxury colors.
- Removed circular KPI icons from Team Hours, Entries, Employees, Projects, and Estimated Pay.
- Rebuilt the Overview grid with clean labels, large numeric values, subtle dividers, a gold Overview accent, and a soft green Estimated Pay panel.
- Kept the Reports title, gold scope label, compact Date Range card, Today action, View by control, report calculations, drill-down logic, RBAC/company restrictions, and React hook order unchanged.
- Replaced the remaining blue Breakdown label accent with approved Luxury Gold.
- Screenshot verification completed in the signed-in demo company session.
- Screenshot: `screenshots/b1-fix-38-reports-no-icons.png`
- No SQL, database, AI, production deployment, main push, or destructive data action was run.

## B.1-fix-38 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-3sg7uhg9a-samrental70-7859s-projects.vercel.app
- Browser verification status: Passed in signed-in demo company session.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-39 Header And Clock Reference Polish
- Updated the shared top header toward the provided light reference using the approved Royal Navy Luxury colors and Inter font stack.
- Moved the DEV chip beside the company name, kept the user name as compact secondary text, and kept the notification bell as the only right-side control.
- Updated the before-shift Clock state with a green-accented Start shift card, helper subtitle, Royal Navy Clock In button, and compact Camera / Receipt / Lists actions inside the same premium card.
- Updated the active-shift Clock state with a green-accented Current shift card, Working chip, compact project/task text, bordered Live timer panel, green earned amount, Royal Navy Clock Out button, compact Camera / Receipt / Change Task / Break actions, and a Lists dropdown.
- Preserved project/task dropdowns with add-new options, clock-in, clock-out, camera/photo, receipt, change-task, break, task-list, material-list logic, RBAC/company restrictions, and React hook order.
- Added `screenshots/` to `.gitignore` and `.vercelignore` so local QA images are not committed or uploaded with development deployments.
- Screenshot verification completed for the signed-in before-shift Clock state.
- Screenshot: `screenshots/b1-fix-39-clock-before-light-header.png`
- Active Clock Out screenshot was not created because the browser blocked safe local preview-state injection and creating a real active shift would write demo timesheet data.
- No SQL, database, AI, production deployment, main push, or destructive data action was run.

## B.1-fix-39 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-26v4d66sj-samrental70-7859s-projects.vercel.app
- Browser verification status: Before-shift screenshot passed in signed-in demo company session; active-shift visual path verified by source/build only to avoid DB writes.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-40 Clock Reference Action Layout Polish
- Updated the Clock screen action area to match the latest reference more closely.
- Before clock-in now keeps Camera / Receipt, Change Task / Break, and Lists actions inside the Start shift card in compact two-column rows.
- Lists now opens as a compact in-card dropdown with Task List and Material List rows using line icons.
- Clock In and Clock Out buttons were reduced to the slimmer reference-style Royal Navy button height.
- Project and Task dropdown heights were compacted while preserving existing project/task selection and add-new options.
- Active-shift action rows reuse the same compact Camera / Receipt, Change Task / Break, and Lists dropdown style.
- Preserved clock-in, clock-out, camera/photo, receipt, change-task, break, task-list, material-list logic, RBAC/company restrictions, and React hook order.
- Screenshot verification completed for the signed-in before-shift Clock state.
- Screenshot: `screenshots/b1-fix-40-clock-reference-actions.png`
- Active Clock Out screenshot was not created because creating a real active shift would write demo timesheet data.
- No SQL, database, AI, production deployment, main push, or destructive data action was run.

## B.1-fix-40 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-fe4avhm31-samrental70-7859s-projects.vercel.app
- Browser verification status: Before-shift screenshot passed in signed-in demo company session.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-28 Employee Role Navigation + Default Clock Screen
- Employee role navigation now defaults to the Clock screen after login/session load.
- Employee bottom navigation now renders Clock / Schedule / Timesheets / More and removes Home for employee users.
- Added employee tab normalization so saved or manually reached restricted tabs such as Home/activities, dashboard, team, reports, and admin-only areas redirect back to Clock.
- Employee Schedule remains assigned-work focused and preserves the existing accept/decline workflow.
- Employee Schedule empty state now says `No upcoming scheduled tasks.`
- Employee More menu no longer exposes Request Center, Team, Reports, or owner/admin controls; Settings remains available as App preferences.
- Employee Timesheets remains scoped through existing RBAC/company filtering logic.
- Owner/Supervisor/Admin navigation and Home dashboard behavior were preserved.
- Royal Navy design system styling, RBAC/company restrictions, existing data safety, and React hook order were preserved.
- No SQL, database, AI, production deployment, main push, or destructive data action was run.

## B.1-fix-28 Employee Role Navigation Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-q42yo87t8-samrental70-7859s-projects.vercel.app
- Browser screenshot status: Authenticated screenshot verification was attempted, but the bundled in-app browser bridge file was unavailable in this Codex environment and temporary Chromium automation exited before opening a debuggable session.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-41 Timesheets Reference Layout Polish
- Updated the Timesheets screen to match the latest controller reference using approved Royal Navy Luxury colors and font styling.
- Replaced the dark Timesheets hero with a white header area, clock icon tile, large Timesheets title, and compact review subtitle.
- Enlarged and polished the Today / Week / Month / Custom segmented control.
- Updated the date/filter row to a compact white card with calendar icon, date range, active employee/project labels, and chevron.
- Added a two-column summary KPI card showing Total time and Total labour for the currently visible filtered records.
- Moved Share report and Add manual time into the reference-style two-button action row while preserving existing manual-time role logic.
- Redesigned the empty Timesheets state with a larger white card, muted clipboard/time icon, and approved empty-state copy.
- Slightly polished timesheet record cards to align with the same rounded white-card system.
- Preserved existing timesheet fetching, filters, date picker/filter sheet, share report, manual time requests, edit/delete overflow logic, RBAC/company restrictions, and React hook order.
- No SQL, database, AI, production deployment, main push, or destructive data action was run.

## B.1-fix-41 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-brs7a6ze6-samrental70-7859s-projects.vercel.app
- Browser screenshot status: Not captured in this environment; authenticated in-app browser bridge remains unavailable.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-42 Clock Lists Default Collapsed
- Updated the shared Clock screen Lists control so it is collapsed by default in both before clock-in and active clock-out states.
- Task List and Material List remain accessible after tapping Lists.
- Preserved Clock In, Clock Out, photo/camera, receipt, change-task, break, list modal logic, RBAC/company restrictions, and React hook order.
- No SQL, database, AI, production deployment, main push, or destructive data action was run.

## B.1-fix-42 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-6qrltxjsh-samrental70-7859s-projects.vercel.app
- Browser screenshot status: Not captured in this environment; authenticated in-app browser bridge remains unavailable.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-43 Schedule List Current-First + Notification Prompt Cleanup
- Updated Schedule list view ordering so today and future schedule sections appear first on the current screen.
- Older/past schedule sections remain available below the current/future work so users can scroll down to review previous schedule items.
- Applied the same current-first list ordering to both employee assigned Schedule and admin/company Schedule list views.
- Added employee schedule notification permission state so the `Enable phone notifications` button is hidden once phone/background push notifications are enabled.
- Preserved schedule list/calendar views, accept/decline workflow, admin schedule editing, push subscription saving, RBAC/company restrictions, and React hook order.
- No SQL, database, AI, production deployment, main push, or destructive data action was run.

## B.1-fix-43 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-nk08k47o7-samrental70-7859s-projects.vercel.app
- Browser screenshot status: Not captured in this environment; authenticated in-app browser bridge remains unavailable.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-44 Timesheets Summary Icon Removal
- Removed the Total time and Total labour KPI icons from the Timesheets summary card so the values have more horizontal room.
- Updated KPI value text to stay on one line without truncating normal hour/minute and currency values.
- Preserved Timesheets filters, date picker/filter sheet, share report, manual time requests, record cards, RBAC/company restrictions, and React hook order.
- No SQL, database, AI, production deployment, main push, or destructive data action was run.

## B.1-fix-44 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-4sykbnobq-samrental70-7859s-projects.vercel.app
- Browser screenshot status: Not captured in this environment; authenticated in-app browser bridge remains unavailable.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## B.1-fix-45 Employee Timesheets Own-Records Enforcement
- Tightened employee-role Timesheets scoping so employee users only see timesheet records belonging to the signed-in auth user.
- Added an explicit own-record helper that checks `user_id`/employee id first, with email fallback only for legacy rows missing a user id.
- Applied employee ownership filtering to Supabase Timesheets fetch results, cached/offline fallback records, and final visible Timesheets records.
- Reset stale employee filters when an employee user/session loads and replaced the employee filter control with a read-only `My timesheets` row for employee-role users.
- Updated timesheet row title resolution so the signed-in employee profile name is preferred over stale stored `employee_name` values on that employee's own rows.
- Preserved owner/supervisor all-company Timesheets visibility, filters, share report, manual time requests, record cards, RBAC/company restrictions, and React hook order.
- No SQL, database, AI, production deployment, main push, or destructive data action was run.

## B.1-fix-45 Build / Deployment
- Local build status: Passed on develop.
- Development preview deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-h1x99onrp-samrental70-7859s-projects.vercel.app
- Browser screenshot status: Not captured in this environment; authenticated in-app browser bridge remains unavailable.
- Production/main deployment: Not run.
- Secrets/env files: Not changed.

## Beta Release B Candidate
- UI professionalization completed across the current B.1 development line.
- Royal Navy Luxury design system applied as the official field-operations UI direction.
- Home / Clock / Schedule / Timesheets / Team / Photos / Receipts / More polished for mobile-first production use.
- Employee navigation and RBAC/company restrictions preserved, including employee Timesheets own-record scoping.
- Receipt OCR work is paused and not included in this release promotion.
- No new SQL is included in this release promotion.
- Production Release A remains the previous stable version until this promotion completes.

## Release B Notes
- Professional Royal Navy UI.
- Improved mobile navigation.
- Improved dashboard/Home experience.
- Improved Clock experience.
- Improved Timesheets/Team/Photos/Receipts/Menu UI.
- RBAC and company restrictions preserved.

## Beta Release B Promotion Verification
- Develop branch verified before promotion.
- Develop build status: Passed.
- Development URL verification: Passed, HTTP 200 at https://project-rui1d-development.vercel.app.
- Unwanted file check: no env/secrets files changed; untracked temporary browser folder remains excluded from release commits.
- OCR work: Not run.
- SQL/database changes: Not run.

## Beta Release B App Store / Google Play Launch Package
- Store launch package prepared under `store-launch/Beta-B/`.
- App Store Connect metadata draft created.
- Google Play metadata draft created.
- Privacy policy draft created for legal review.
- Google Play Data Safety notes created.
- Apple App Privacy notes created.
- App review notes and demo-account placeholders created.
- Screenshot plan created for real Beta Release B UI using safe demo data.
- Asset checklist created for common, Apple-specific, and Google-specific store assets.
- Technical build plan documented current app as a Vite/React PWA with manifest, service worker, and icons already present.
- Native wrapper plan documented Capacitor as the recommended future path, but no native packages were installed and no native folders were created.
- Beta Release B store release notes and pre-submission testing checklist created.
- Build status: Passed on develop via approval wrapper.
- Next step is controller decision on final app name, legal company name, privacy/support URLs, demo accounts, screenshots, and native wrapper implementation.
- Existing app functionality unchanged.
- OCR work not started.
- SQL/database changes: Not run.
- Production deployment: Not run for this launch-preparation task.

## B.2 Phase 1 - Employee Project/Task Creation + Pay Rates + Smart Receipt OCR
- Development line B.2 started from the Release B UI baseline on `develop`.
- Added backend employee project/task creation API:
  - Employees can create projects/tasks only when `allow_employee_project_task_creation` is true.
  - Owner/admin/supervisor project/task creation remains allowed.
  - Company membership, `company_id`, and role are validated server-side.
  - Service-role inserts are used behind the API; RLS is not loosened.
  - New project/task assignment follows `assign_all_projects_to_all_employees` and `assign_all_tasks_to_all_projects`.
  - Owner/supervisor notifications are inserted for employee-created projects/tasks.
- Updated Clock and Projects screen creation flows:
  - `+ Add new project` and `+ Add new task` now call the backend API for employee-role users.
  - Clear UI errors remain when employee project/task creation is off or save fails.
- Added effective-date pay-rate foundation:
  - Added `getEffectiveHourlyRate(...)` helper using `employee_pay_rates` when present.
  - New clock-in/clock-out labour calculations use the rate effective on the shift clock-in date/time.
  - Team screen displays the current active pay rate as of today when pay history exists.
  - Existing `profiles.hourly_rate` remains a safe fallback if the pay-history table is not present.
  - Existing stored timesheet hourly rate/labour data is not destructively rewritten.
- Added additive SQL migration for manual review only:
  - `supabase/migrations/20260610120000_add_b2_pay_rates_and_receipt_ocr_fields.sql`
  - Creates `employee_pay_rates`.
  - Adds structured receipt OCR fields to `project_media`.
  - No SQL was run automatically.
- Added Smart Receipt OCR foundation:
  - Reused existing receipt upload, Supabase storage, and `project_media`.
  - Updated `api/ai-field-docs.js` receipt OCR prompt and normalization for supplier/date/subtotal/HST/total/currency/material category/type/confidence/notes.
  - `OPENAI_API_KEY` remains backend-only; no frontend key exposure was added.
  - Employees may run receipt OCR only on their own company media rows; supervisor-only AI actions remain restricted.
  - Receipt capture/upload now bypasses the legacy manual "Enter receipt amount" form in the normal flow.
  - Captured receipt images upload first, then immediately open the Smart Receipt OCR review flow.
  - OCR review pre-fills supplier/date/subtotal/HST/total/material fields when AI extraction is available, with manual correction fallback for unclear receipts.
  - Review form defaults project/task from the active clocked-in shift where available.
  - Legacy manual amount/category entry remains only as dormant fallback support and is no longer called by receipt capture/upload.
  - Receipt review saves structured fields when the additive SQL is applied, and falls back to legacy receipt fields when new columns are missing.
  - Saved receipt data is prepared for future supervisor PDF grouping by project, employee, date, supplier, category/type, subtotal, HST, total, and task/cost centre.
- Advisor checkpoints:
  - Pre-receipt/final checkpoints were attempted through `chatgpt_advisor`.
  - Latest advisor attempt was rejected by the tool policy because it would send non-public internal implementation details to an external advisor service.
  - A privacy-safe generic advisor review was completed without code, private data, or implementation details.
  - Advisor conclusion: OCR-first receipt readiness is blocked until a signed-in QA/demo session can verify camera capture, file upload, OCR success/failure fallback, persistence, and role/company restrictions.
  - Advisor recommended fixture receipt tests with known supplier/date/subtotal/HST/total/material values, plus authenticated regression checks for clock, schedule, timesheets, photos, receipts, reports, team/menu, RBAC, and company boundaries.
  - Post-fix advisor review of authenticated RBAC/media QA findings was rejected by tool policy as private data exfiltration risk; no workaround was attempted.
- Verification status:
  - Build passed via approval wrapper after the receipt OCR-first flow correction.
  - API syntax checks passed for changed API files.
  - Focused API ESLint passed for changed API files.
  - Broad ESLint remains blocked by the local `.codex_pdf_deps/bin` EPERM scan issue and historical `src/EmployeeClockApp.jsx` lint noise.
  - Receipt capture/upload handlers were checked in code and now call `uploadReceiptForOcrReview(...)` instead of the legacy manual amount helper.
  - Deployed development app loaded to the login screen with no browser console errors in the in-app browser.
  - Authenticated employee QA was completed after Samrat signed in as employee `Anm`.
  - Employee login/default navigation passed: employee lands on Clock and bottom nav shows Clock, Schedule, Timesheets, More with no Home tab.
  - Clock project/task dropdown behavior passed: selecting project `905` loads assigned task options including `drywall`; task is disabled with helper text until a project is selected.
  - Clock receipt entry check passed for the visible UI: clicking Receipt no longer opens a manual amount prompt; missing project/task shows "Select project and task first."
  - Timesheets employee scoping passed: Today and Month views show `My timesheets`, no All Employees filter, and no Sam/Samrat records while logged in as Anm.
  - Timesheets date picker passed: Custom opens the Royal Navy "Choose dates" sheet and Cancel closes it.
  - Employee More menu passed for major admin restrictions: Reports, Team/Employees, and Request Center are not visible.
  - Employee Photos/Receipts QA initially found an RBAC/privacy leak: employee Anm could see All Employees/Sam media filters and Sam receipt/photo metadata.
  - Fixed employee media scoping by forcing Photos/Receipts filters to the signed-in employee and replacing the employee dropdown with a read-only "My media" state for employee role.
  - Added stricter employee media label filtering so stale cross-account cached media with mismatched employee labels is hidden from employee Photos/Receipts.
  - Retest passed: Photos now shows My media, no All Employees, and no Sam/Samrat text for employee Anm.
  - Retest passed: Receipts now shows My media, no All Employees, no Sam/Samrat text, no leaked Sam receipt, and receipt total resets to $0.00 for Anm when no own receipts match.
  - Browser console error checks passed during employee Clock/Schedule/Timesheets/Photos/Receipts/More smoke tests.
  - Full OCR-after-upload could not be completed in browser automation because no receipt file/camera upload was performed; no test data was uploaded.
- Build status: Passed via approval wrapper.
- Development deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-lvq67rn54-samrental70-7859s-projects.vercel.app
- Development URL verification: Passed, HTTP 200.
- SQL/database changes: Not run.
- Production deployment: Not run.
- Main push: Not run.
- Secrets/env files: Not changed.
- Remaining issues:
  - Manual Supabase review/run is required for the B.2 SQL migration before pay history and structured receipt OCR columns are fully persisted.
  - Schedule employee past-task visibility was fixed in B.2-fix-4; employee Upcoming assigned work now filters out dates before the current company-local day.
  - Full receipt OCR extraction still needs a real test receipt upload/camera capture in a demo account to verify OCR success/failure persistence end to end.
  - Advisor review flags authenticated OCR and full-role workflow QA as the remaining release-readiness blocker.
  - Build warnings remain for bundle size and existing workspace verifier Auracut docs.

## B.2-fix-4 - Employee Schedule Upcoming Work Filter
- Scope:
  - Employee Schedule only.
  - No Owner/Supervisor/Admin schedule redesign was performed.
  - No database schema or SQL change was made.
- Changes:
  - Added a memoized `employeeUpcomingScheduledTasks` source for employee Schedule views.
  - Employee upcoming tasks are filtered to today/future tasks only using the company-local date key.
  - Employee upcoming tasks are sorted by soonest start date/time using the existing schedule comparator.
  - Employee list grouping and employee calendar range views now use the upcoming-only task source.
  - Past employee assignments, including previously observed May 7, 2026 items, no longer qualify for Upcoming assigned work on June 11, 2026.
  - Accept/Decline actions now verify that the assignee link belongs to a valid upcoming assigned task before updating.
  - Employee schedule scoping remains tied to the signed-in employee assignment map and company id.
  - Owner/Supervisor/Admin schedule views continue to use the existing company schedule source.
  - Added `bridge/` to `.vercelignore` so unrelated local files are not included in development deployment.
- Advisor:
  - Sanitized advisor review completed with no code, schema, secrets, employee records, or company data sent.
  - Recommendations covered company/local date boundaries, employee-assigned RBAC, accept/decline gating, admin/supervisor regression, sorting, and UI clarity.
- Verification:
  - Build passed via approval wrapper.
  - Development app deployed and aliased to `https://project-rui1d-development.vercel.app`.
  - Development URL returned HTTP 200 after deployment.
  - Code inspection confirmed the employee Schedule source excludes task date keys earlier than the current company-local day.
  - Hook order was preserved; new memoized values were added before returns and are not conditional hooks.
  - Authenticated in-app browser automation was blocked in this session because the Browser plugin runtime file `browser-client.mjs` is missing; manual signed-in QA is still recommended.
- Build status: Passed.
- Development deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-haer2j0c8-samrental70-7859s-projects.vercel.app
- SQL/database changes: Not run.
- Production deployment: Not run.
- Main push: Not run.
- Destructive commands: Not run.
- Remaining issues:
  - Full signed-in UI QA should be completed manually or when Browser plugin automation is available.
  - Existing build warnings remain for bundle size and old Auracut docs.
  - Existing B.2 SQL migration remains prepared only and was not run.

## B.2 Phase 2 - Google Login + Daily Timesheet Email Reports + Advisor QA
- Scope:
  - Development-only B.2 update on `develop`.
  - No SQL was run.
  - No production deployment was run.
  - No real email was sent.
  - No OAuth/Gmail/API secrets were added or exposed.
- Current auth inspection:
  - The app uses Supabase Auth.
  - Existing email/password login remains preserved.
  - Existing OAuth login path uses Supabase `signInWithOAuth`.
  - Company role and app access are resolved from `company_members`; OAuth provider claims are not trusted for owner/supervisor/admin access.
  - New/no-company OAuth users remain in controlled company/create/join flow.
- Google login changes:
  - Visible OAuth UI was simplified to `Continue with Google`.
  - Signup/login copy now references Google or email/user ID only.
  - Google login remains identity-only; no Gmail send scope was requested.
  - OAuth profile linking was tightened so existing profile roles are not overwritten to employee during OAuth/session profile upsert.
  - Existing email/password login remains available.
- Daily timesheet report foundation:
  - Added Manager/Admin-only daily timesheet email preview in Reports.
  - Preview content includes company name, selected date range, generated timestamp, employee summary, total hours, total labour, project/task breakdown, missing clock-out/issues, receipt summary from available receipt metadata, and app link.
  - Real sending is disabled by `DAILY_REPORT_EMAIL_SEND_ENABLED = false`.
  - `Send test report` remains disabled and labelled pending setup.
  - Preview can be copied for review; no provider, Gmail API call, cron email job, or recipient send path was added.
- Documentation:
  - Added `docs/B2_PHASE2_GOOGLE_LOGIN_DAILY_REPORTS.md`.
  - Documented Supabase Google OAuth setup, expected redirect URLs, Gmail send safety rules, provider-vs-Gmail strategy, cron plan, and advisor follow-up checklist.
- Advisor status:
  - Architecture advisor review attempted with sanitized summary only; blocked because the shared advisor setup could not produce a review.
  - Final sanitized QA/security advisor review completed.
  - Advisor final decision: `needs_changes` for production readiness.
  - Advisor recommendations: verify provider scopes/redirects, complete RBAC and tenant-isolation tests, prove no send path can trigger real email, verify OAuth account-linking cases, validate timezone/date boundaries, and keep sending disabled until a separate backend review.
  - No code, schemas, secrets, employee records, company records, OAuth tokens, Gmail tokens, API keys, or environment variables were sent to advisor.
- Local QA status:
  - Build passed via approval wrapper.
  - Development deployment completed and aliased to `https://project-rui1d-development.vercel.app`.
  - Development URL returned HTTP 200.
  - Code inspection confirmed Reports UI is rendered only for `isAdmin`.
  - Daily report generation handler returns early when `!isAdmin`.
  - Email sending remains disabled by runtime flag and no backend email provider route was added.
  - B.2-fix-4 schedule upcoming filter remains in place.
  - Employee Timesheets and Photos/Receipts RBAC changes remain in the working tree.
- Build status: Passed.
- Development deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-3934paq1q-samrental70-7859s-projects.vercel.app
- SQL/database changes: Not run.
- Production deployment: Not run.
- Main push: Not run.
- Destructive commands: Not run.
- Remaining issues:
  - Full signed-in screen QA could not be automated in this session because the in-app Browser plugin runtime file `browser-client.mjs` is missing.
  - Advisor marked production readiness as `needs_changes` until RBAC/tenant isolation, OAuth provider settings, and no-send guarantees are manually verified.
  - Real daily email sending needs a separate provider/Gmail backend implementation and security review.
  - Google provider setup must be verified in Supabase/Google Cloud; Codex did not inspect secrets or dashboard credentials.
  - Existing build warnings remain for bundle size and old Auracut docs.
  - Existing B.2 SQL migration remains prepared only and was not run.

## B.2 Phase 2 Part F - WhatsApp Business Daily Timesheet Reports
- Scope:
  - Development-only WhatsApp Business report foundation.
  - Official WhatsApp Business Platform / Cloud API path only.
  - No personal WhatsApp Web automation was added.
  - No real WhatsApp messages were sent.
  - No WhatsApp tokens or credentials were added to code or frontend.
  - No SQL was run.
- Backend:
  - Added `api/send-daily-timesheet-whatsapp.js`.
  - Route requires authenticated Supabase bearer token.
  - Route verifies requester membership and requires owner/admin/supervisor role for the requested company.
  - Route generates the daily timesheet summary server-side from `timesheets`, scoped by `company_id`.
  - Route returns preview/dry-run JSON when `send` is not requested, WhatsApp env is missing, or sending is disabled.
  - Route uses WhatsApp Cloud API endpoint `POST /{Version}/{Phone-Number-ID}/messages` only when server env is configured and `WHATSAPP_SEND_ENABLED=true`.
  - Route never returns or exposes `WHATSAPP_ACCESS_TOKEN`.
- Environment placeholders documented:
  - `WHATSAPP_ACCESS_TOKEN`
  - `WHATSAPP_PHONE_NUMBER_ID`
  - `WHATSAPP_BUSINESS_ACCOUNT_ID`
  - `WHATSAPP_DAILY_REPORT_TEMPLATE_NAME`
  - `WHATSAPP_DAILY_REPORT_TEMPLATE_LANGUAGE`
  - `WHATSAPP_SEND_ENABLED`
- WhatsApp report content:
  - Daily Timesheet Report title.
  - Company name.
  - Report date.
  - Employees worked.
  - Total entries.
  - Total hours.
  - Labour cost.
  - Missing clock-out issues.
  - Top project/task summaries.
  - App Timesheets link.
  - Full detailed timesheet tables are intentionally not included.
- UI:
  - Added Manager/Admin-only WhatsApp Business Reports card inside Reports.
  - Added manager/admin phone input.
  - Added preview button that calls the backend route in dry-run mode.
  - Added exact WhatsApp message preview and copy action.
  - Added clean missing-configuration warning.
  - `Send WhatsApp Test` remains disabled unless backend reports WhatsApp env configured and `WHATSAPP_SEND_ENABLED=true`.
- Documentation:
  - Added `docs/B2_PHASE2_WHATSAPP_BUSINESS_REPORTS.md`.
  - Documented Cloud API strategy, required env placeholders, backend route behavior, template plan, scheduling strategy, and QA checklist.
  - Suggested template name: `daily_timesheet_report`.
  - Suggested template category: Utility.
  - Suggested language: `en`.
  - Documented Meta template approval requirement before production sending where required.
- Scheduling:
  - No cron sending was added.
  - Manual preview/send-test path prepared only.
  - Daily cron/external scheduler remains a future Controller-approved step.
- Advisor status:
  - Sanitized WhatsApp advisor review was attempted.
  - Advisor blocked because the shared advisor setup could not produce a review.
  - No code, schema, tokens, employee data, company data, or internal files were sent.
  - Local security review continued.
- Verification:
  - New API route passed `node --check`.
  - Build passed via approval wrapper.
  - Development deployment completed and aliased to `https://project-rui1d-development.vercel.app`.
  - Development URL returned HTTP 200.
  - Code inspection confirmed no frontend WhatsApp token usage.
  - Code inspection confirmed backend RBAC and company scoping.
- Build status: Passed.
- Development deployment: Completed.
- Development URL: https://project-rui1d-development.vercel.app
- Preview deployment URL: https://project-rui1d-78elqlq9p-samrental70-7859s-projects.vercel.app
- SQL/database changes: Not run.
- Production deployment: Not run.
- Main push: Not run.
- Destructive commands: Not run.
- Remaining issues:
  - WhatsApp env values are not configured by Codex.
  - Real WhatsApp sending remains disabled until Controller approval and `WHATSAPP_SEND_ENABLED=true`.
  - Meta WhatsApp template approval is required where business-initiated templates are needed.
  - Full signed-in UI QA could not be automated in this session because the in-app Browser plugin runtime file `browser-client.mjs` is missing.
  - Existing build warnings remain for bundle size and old Auracut docs.

## B.2-fix-6 Daily Report Email + 12 PM Scheduler

Date: 2026-06-11

Status: Completed on develop for build + development deployment.

Summary:
- Added shared backend daily report generator in `api/_lib/dailyReport.js`.
- Added Gmail/email daily report backend route in `api/send-daily-timesheet-email.js`.
- Refactored WhatsApp daily report route to use the shared report generator where safe.
- Added disabled-safe scheduler foundation route in `api/daily-supervisor-report-cron.js`.
- Added duplicate-send protection SQL package in `supabase/migrations/20260611120000_create_daily_report_logs.sql`.
- Extended Manager/Admin Reports UI with email recipient input, backend email preview, gated Email Test button, Gmail status, and scheduler-disabled note.
- Preserved WhatsApp preview/test UI and kept real WhatsApp sending gated by `WHATSAPP_SEND_ENABLED=true`.
- Kept real Gmail sending gated by `GMAIL_SEND_ENABLED=true`.
- Kept automatic cron reporting disabled by default and documented that real scheduled sends need controller approval.

Advisor:
- Sanitized advisor review completed.
- No code, database schema, tokens, employee data, payroll data, phone numbers, emails, or internal implementation files were sent.
- Advisor final decision: `needs_changes` for real scheduled sends until duplicate-send SQL, authorization tests, tenant isolation, recipient opt-in/configuration, audit logging, dry-run parity, WhatsApp compliance, and rollback/kill-switch checks are verified.

Verification:
- `node --check` passed for:
  - `api/_lib/dailyReport.js`
  - `api/send-daily-timesheet-email.js`
  - `api/send-daily-timesheet-whatsapp.js`
  - `api/daily-supervisor-report-cron.js`
- Build passed via approval wrapper.
- Development deployment completed and aliased to `https://project-rui1d-development.vercel.app`.
- Development URL returned HTTP 200.
- Email and WhatsApp daily report routes returned unauthorized/fail-closed responses when called without auth.

Deployment:
- Development preview deployment: `https://project-rui1d-cdhevdf0b-samrental70-7859s-projects.vercel.app`
- Development alias: `https://project-rui1d-development.vercel.app`
- Production deployment: Not run.
- Main push: Not run.

Important limitation:
- Vercel Hobby deployment is at the 12 Serverless Function limit after adding the email route.
- The scheduler foundation route is committed in the repo and documented, but excluded from Vercel deployment through `.vercelignore` until the project upgrades plan capacity or consolidates API routes.
- Automatic cron sending remains disabled and not deployed in this development build.

SQL/database:
- SQL prepared but not run:
  - `supabase/migrations/20260611120000_create_daily_report_logs.sql`
- No SQL was executed by Codex.
- No database changes were made by Codex.

Remaining issues:
- Apply and test `daily_report_logs` migration before real sends.
- Add recipient settings/opt-in before scheduled sends.
- Validate multi-company tenant isolation and employee blocking with authenticated QA.
- Validate daylight-saving/company-local time behavior before production scheduler enablement.
- Configure Gmail/WhatsApp provider env only after controller approval.
- Existing build warnings remain for bundle size and old Auracut docs.

## B.2 Database Separation Preparation

Date: 2026-06-11

Status: Preparation completed on develop. SQL remains blocked.

Current state confirmed:
- Production app: `https://project-rui1d.vercel.app`
- Development app: `https://project-rui1d-development.vercel.app`
- Production app bundle references Supabase ref `...evhyjm`.
- Development app bundle references Supabase ref `...evhyjm`.
- Development and production currently share the same Supabase database target.

Safety result:
- This is unsafe for B.2 SQL/database testing.
- No SQL was run.
- No migrations were run.
- Production Vercel environment variables were not changed.
- Production deployment was not run.
- Main was not pushed.

Supabase project creation:
- Supabase CLI is installed, but cloud project access is not authenticated in this workspace.
- Manual Supabase Dashboard setup is required for a separate dev project, suggested name `opera-ai-dev`.

Documentation added/updated:
- `docs/DATABASE_ENVIRONMENT_SAFETY.md`
  - documents the shared database risk
  - blocks SQL until dev/prod refs differ
  - includes Preview/Production env separation instructions
  - includes migration strategy, QC gate, demo data plan, and rollback steps
- `.env.development.example`
  - placeholder-only local development env template
- `.gitignore`
  - explicitly protects `.env`, `.env.local`, `.env.development`, `.env.production`, and `*.env`

Code safety check:
- Runtime Supabase client uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Backend API routes use server env values and `SUPABASE_SERVICE_ROLE_KEY`.
- No hardcoded production Supabase ref was found in runtime source.
- Service role usage was found in backend API routes only, not frontend runtime source.

Advisor:
- Sanitized advisor review completed.
- No code, schema, secrets, keys, project refs, employee data, or internal data were sent.
- Advisor final decision: `needs_changes` until environment separation, credential scopes, RBAC/access, migration runbook, demo-data-only policy, and post-cutover smoke tests are verified.

Manual next steps for Samrat:
- Create a separate Supabase dev project.
- Add dev Supabase URL/anon key/service role key to Vercel Preview/development only.
- Keep Production env pointed to production Supabase.
- Redeploy development only.
- Confirm development and production deployed bundles show different masked refs.
- Only then approve dev SQL/migration execution.

## B.2 Development Database Cutover To Shared Dev Supabase

Date: 2026-06-14

Status: Development environment separated from production at deployed app level.

Database routing:
- Production app remains at `https://project-rui1d.vercel.app`.
- Development app remains at `https://project-rui1d-development.vercel.app`.
- Production app bundle verified against Supabase ref `...evhyjm`.
- Development app bundle verified against shared development Supabase ref `...jjwbut`.
- Development now uses the shared `bridge-app-dev` Supabase project.

Environment changes:
- Vercel Preview environment updated for:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Vercel Production environment was not changed.
- Local ignored `.env.development` was updated for the shared development Supabase project.
- No `.env` files were committed.

Deployment:
- Build passed via approval wrapper.
- Development preview deployed and aliased to `https://project-rui1d-development.vercel.app`.
- Preview deployment URL: `https://project-rui1d-dedvqlj1a-samrental70-7859s-projects.vercel.app`
- Development app returned HTTP 200.
- Production app returned HTTP 200.
- Production deployment was not run.
- Main was not pushed.

SQL/database:
- No SQL was run.
- No migrations were run.
- No database data was copied.
- Production database was not touched.
- B.2 SQL is now eligible for a separate approval review against shared development DB only; it must still not run automatically.

Remaining:
- Verify the shared dev database has the required baseline OPERA schema before app QA.
- Run only approved additive B.2 migrations on shared development DB after Controller approval.
- Seed/use safe demo data only.
- Confirm no other development apps sharing `bridge-app-dev` are affected by OPERA migrations.

## Required SQL
- B.2 Phase 1 requires manual Supabase review before enabling pay-rate history and structured receipt OCR persistence:
  - `supabase/migrations/20260610120000_add_b2_pay_rates_and_receipt_ocr_fields.sql`
  - SQL was prepared but not run by Codex.
- B.2-fix-6 requires manual Supabase review before real daily email/WhatsApp sends:
  - `supabase/migrations/20260611120000_create_daily_report_logs.sql`
  - SQL was prepared but not run by Codex.
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
- B.1-fix-27 does not require new SQL.
- B.1-fix-28 does not require new SQL.
- B.1-fix-29 does not require new SQL.
- B.1-fix-30 does not require new SQL.
- B.1-fix-31 does not require new SQL.
- B.1-fix-32 does not require new SQL.
- B.1-fix-33 does not require new SQL.
- B.1-fix-34 does not require new SQL.
- B.1-fix-35 does not require new SQL.
- B.1-fix-36 does not require new SQL.
- B.1-fix-37 does not require new SQL.
- B.1-fix-38 does not require new SQL.
- B.1-fix-39 does not require new SQL.
- B.1-fix-40 does not require new SQL.
- B.1-fix-41 does not require new SQL.
- B.1-fix-42 does not require new SQL.
- B.1-fix-43 does not require new SQL.
- B.1-fix-44 does not require new SQL.
- B.1-fix-45 does not require new SQL.
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

## Advisor Feature Loop Iteration 1 - Timesheet Sanity Check

Date: 2026-06-14

Status: implemented on develop, pending build/development deployment verification.

Advisor input:
- A sanitized app status report was sent to chatgpt-advisor for the next safe feature recommendation.
- Advisor recommended a read-only Timesheet sanity check panel using already-loaded Timesheets data.
- Advisor constraints: no SQL, no migrations, no production deployment, no persistence, no auto-fixes, no real notifications/sends, and no secrets.

Implemented:
- Added a read-only Timesheet sanity checker for the current filtered Timesheets range.
- The checker flags likely review items:
  - missing clock-in time
  - missing clock-out time
  - long shifts over 14 hours
  - overlapping entries for the same employee
  - missing project/job site
  - missing task
- Added a compact Royal Navy themed Timesheet sanity check card above the Timesheets record list.
- The card shows an All clear state when no issues are found and caps visible review items to the first 5 when issues exist.

Safety:
- Existing Timesheets data loading/filtering/RBAC paths are reused.
- The feature is UI-only and read-only.
- No SQL was run.
- No migrations were run.
- No database data was changed.
- No production deployment was performed.

Remaining issues:
- Continue advisor loop one safe, scoped iteration at a time after build/development verification.

## Advisor Feature Loop Iteration 2 - Timesheet Sanity Issue Expansion

Date: 2026-06-14

Status: implemented on develop, pending build/development deployment verification.

Advisor input:
- Advisor approved Iteration 1 as safe for development.
- Advisor recommended the next single safe feature: add a compact Show all / Show fewer control for the Timesheet sanity check panel.

Implemented:
- Added collapsed-by-default local UI state for Timesheet sanity issues.
- The panel still shows the first 5 issues by default.
- When more than 5 issues exist, users can tap Show all to reveal all read-only review items and Show fewer to collapse again.

Safety:
- UI-only local state.
- No SQL was run.
- No migrations were run.
- No database writes were added.
- No RBAC paths were changed.
- No production deployment was performed.

Remaining issues:
- Continue advisor loop one safe, scoped iteration at a time.
- Advisor recommended future helper-level tests and employee/admin manual QA before any production promotion.

## Advisor Feature Loop Iteration 3 - Timesheet Sanity Tests

Date: 2026-06-14

Status: implemented on develop, pending build/development deployment verification.

Advisor input:
- Advisor approved Iteration 2 as safe for development.
- Advisor recommended tests instead of another feature for Iteration 3.

Implemented:
- Extracted Timesheet sanity check logic into `src/lib/timesheetSanity.js`.
- Added local fixture tests in `scripts/test-timesheet-sanity.js`.
- Added npm script: `npm run test:timesheet-sanity`.

Test coverage:
- all-clear completed row
- missing clock-out
- long shift over 14 hours
- overlapping same-employee entries
- missing project/job site
- missing task
- malformed clock-in time
- valid overnight 8-hour shift
- collapsed versus expanded issue display

Verification:
- `npm run test:timesheet-sanity` passed.

Safety:
- Tests use local fixtures only.
- No SQL was run.
- No migrations were run.
- No database writes were added.
- No production deployment was performed.

Remaining issues:
- Authenticated dev-only manual QA is still needed for admin and employee-scoped Timesheets views.
- Continue advisor loop one safe, scoped iteration at a time.

## Advisor Feature Loop Iteration 4 - Authenticated QA Attempt

Date: 2026-06-14

Status: blocked by login gate in browser automation session.

Advisor input:
- Advisor approved Iteration 3 as safe for development.
- Advisor recommended authenticated dev-only QA before additional features.

QA attempted:
- Opened `https://project-rui1d-development.vercel.app/` in the in-app browser automation session.
- App loaded successfully with title `OPERA.AI Development`.
- The automation session reached the Login screen.

Result:
- Authenticated Timesheets UI/RBAC QA could not be completed because the automation browser session was not signed in.
- No app data was changed.
- No SQL was run.
- No production deployment was performed.

Remaining issues:
- Sign in to the dev app in the browser automation-accessible session, then verify:
  - Timesheet sanity all-clear state
  - 1-5 issue state
  - more than 5 issues with Show all / Show fewer
  - employee role only sees own Timesheets rows
  - admin/supervisor role sees allowed company/team rows

## Development Login Fetch Header Fix

Date: 2026-06-14

Issue:
- Development login showed browser error: `Failed to execute 'fetch' on 'Window': Failed to read the 'headers' property from 'RequestInit': String contains non ISO-8859-1 code point.`

Root cause:
- The deployed development bundle contained an invisible BOM character before the public Supabase URL / anon key values.
- Supabase uses the anon key in request headers, and the browser rejects header strings containing that non-Latin character.

Fix:
- Added public env value cleaning in `src/lib/supabaseClient.js`.
- The Supabase URL and anon key now strip hidden BOM characters and trim whitespace before `createClient`.

Verification:
- Build passed.
- Development preview deployed and aliased to `https://project-rui1d-development.vercel.app`.
- Development URL returned HTTP 200.
- Deployed bundle confirmed to include the sanitizer.

Safety:
- No SQL was run.
- No database data was changed.
- No production deployment was performed.
- No push to main was performed.

## Development Clock App Schema + Login Setup

Date: 2026-06-14

Scope:
- Development-only Clock App schema setup on the shared development Supabase project.
- Development login reset for `samratsood001@gmail.com`.
- Development app render verification after schema setup.

Database target:
- Development Supabase project: `bridge-app-dev` / `...jjwbut`.
- Production Supabase project remained untouched.

Changes:
- Added development-only Clock App bootstrap SQL under `supabase/dev-only/`.
- Created/verified core OPERA Clock App tables in development:
  - `profiles`
  - `companies`
  - `company_members`
  - `projects`
  - `cost_centres`
  - `project_assignments`
  - `project_cost_centre_assignments`
  - `timesheets`
  - `scheduled_tasks`
  - `scheduled_task_assignees`
  - `live_locations`
  - `push_subscriptions`
- Applied existing additive OPERA migrations to the development database only.
- Seeded development demo company data:
  - company `Ottawa Renovation Pro Demo`
  - company code `ORP-DEV`
  - projects `905`, `Euphoria`, and `Test Project`
  - demo tasks/cost centres for each project
- Reset development auth login for `samratsood001@gmail.com` with the temporary password requested by the controller.
- Added dev-only RLS fixes for `company_members`, `companies`, and `live_locations`.
- Aligned development `live_locations` schema with app expectations by adding `employee_id`, `status`, `project_name`, `cost_centre`, and `updated_at`.

App fix:
- Fixed a React hook-order crash by removing late Reports `useMemo` / `useCallback` hooks that were declared after the unauthenticated login return.
- This prevented React #310 after login while preserving report preview behavior.

Verification:
- Development anon Supabase login verified successfully for `samratsood001@gmail.com`.
- Profile/member/company/project/task reads verified through the dev anon client.
- Local build passed with `npm.cmd run build`.
- Development preview deployed and aliased to `https://project-rui1d-development.vercel.app`.
- In-app browser verification passed:
  - app loaded signed in as Samrat
  - no React #310 error
  - Home loaded with Royal Navy UI
  - live location missing-column error cleared

Safety:
- SQL was run on development only.
- Production SQL was not run.
- Production deployment was not performed.
- No push to main was performed.
- No destructive database commands were run.

## B.2 Receipt Capture + OCR Hardening QA

Date: 2026-06-14

Scope:
- Receipt capture, upload, OCR/manual review fallback, receipt display, and receipt OCR API safety on `develop`.
- Development Supabase only: `bridge-app-dev` / `...jjwbut`.

Advisor review:
- Sent a sanitized receipt/OCR implementation report to advisor.
- Advisor required stronger fallback, error-code, persistence, and browser QA evidence before calling the receipt section ready.
- Sent a follow-up QC report after implementation; advisor confirmed provider configuration remains the main automatic-OCR blocker but requested browser/readback/error-branch evidence.

Implemented:
- Hardened `api/ai-field-docs.js` with stable receipt OCR/API error codes:
  - `invalid_auth`
  - `validation_failed`
  - `forbidden_company`
  - `forbidden_role`
  - `media_not_found`
  - `forbidden_media`
  - `provider_not_configured`
  - `provider_timeout`
  - `provider_request_failed`
  - `provider_bad_response`
  - `image_unavailable`
  - `server_error`
- Added OCR provider timeout handling.
- Added receipt OCR normalization coverage for supplier, date, subtotal, HST, total, currency, material category/type, confidence, and notes.
- Removed the legacy receipt amount/category prompt path so the normal receipt flow no longer asks for a manual amount before OCR/manual review.
- Receipt capture now saves the image and opens a single receipt review flow.
- Receipt review supports OCR results when available and manual review fallback when OCR is not configured.
- Receipt review save validates totals/subtotal/HST and persists structured receipt fields.
- Receipts screen totals/cards now prefer structured receipt metadata.
- Receipts `AI read` now opens the receipt review modal in-place instead of switching to the Photos screen.
- Added focused receipt OCR normalization test script:
  - `scripts/test-receipt-ocr-normalization.js`
  - `npm.cmd run test:receipt-ocr`
- Added dev-only storage policy fix for the `project-photos` bucket:
  - `supabase/dev-only/20260614_clock_app_dev_storage_policy_fix.sql`

Development database/storage verification:
- Created/verified development storage bucket `project-photos`.
- Applied dev-only storage upload/read/update policy for authenticated development users.
- Synthetic receipt image upload to development storage passed.
- `project_media` metadata insert for the receipt passed.
- Manual fallback structured receipt save/readback passed:
  - supplier `QA Supplier`
  - subtotal `$50.25`
  - HST `$6.53`
  - total `$56.78`
  - status `manual_reviewed`

API verification:
- Deployed development `/api/ai-field-docs` status endpoint returned:
  - HTTP 200
  - `configured: false`
  - `code: provider_not_configured`
- Authenticated receipt OCR call against saved dev receipt returned:
  - HTTP 200
  - `ok: false`
  - `configured: false`
  - `code: provider_not_configured`
- Error-code contract verified against development deployment:
  - missing auth -> `invalid_auth`
  - missing media id -> `validation_failed`
  - unsupported action -> `unsupported_action`
  - missing media -> `media_not_found`
  - wrong company -> `forbidden_company`

Browser QA:
- Signed into development app as Samrat.
- Home loaded with recent receipt activity.
- Receipts screen displayed the QA receipt with structured supplier, HST, total, status, and project/task metadata.
- Receipt total KPI reflected `$56.78`.
- Receipts `AI read` stayed on the Receipts screen.
- Receipt review modal opened with:
  - receipt preview image
  - manual review state
  - `Smart OCR is not configured in this environment...` fallback message
  - structured fields prefilled from saved receipt data
- Confirmed the old `Enter receipt amount` / `Confirm receipt amount` prompt did not appear.

Build/deployment:
- `npm.cmd run test:receipt-ocr` passed.
- `node --check api\ai-field-docs.js` passed.
- `npm.cmd run build` passed.
- Development preview deployed and aliased to `https://project-rui1d-development.vercel.app`.

Remaining issues:
- Automatic OCR extraction cannot run until `OPENAI_API_KEY` is configured as a server-only Vercel environment variable and the app is redeployed.
- Provider-enabled OCR success, timeout, malformed response, and real receipt camera capture still need QA after the provider secret is configured.
- Vercel Preview project-level `SUPABASE_SERVICE_ROLE_KEY` was not re-added through `vercel env add` because the CLI required branch/project configuration; current development deployment was created with deployment-scoped dev runtime env overrides.

Safety:
- SQL was run on development only.
- Production database was not touched.
- Production deployment was not performed.
- No push to main was performed.
- No secrets were printed or committed.

## B.2 Receipt OCR Shared Bridge AI Resource

Date: 2026-06-14

Scope:
- Wire OPERA.AI receipt OCR to the shared Bridge App AI resource pattern.
- Development deployment only.
- No production deployment, no main push, and no production database change.

Bridge common resource:
- Inspected `C:\Users\samra\bridge-app\common-resources\README.md`.
- Inspected Bridge shared env resolver pattern under `C:\Users\samra\bridge-app\api\_lib\sdosSharedEnvResolver.js`.
- Confirmed Bridge common env has `OPENAI_API_KEY` by variable name only; no secret value was printed or committed.

Implementation:
- Added `api/_lib/sharedEnv.js`.
- The helper loads allowed server-side AI env names from:
  1. active Clock App env files
  2. Bridge common env files
  3. process env
- Updated `api/ai-field-docs.js` to use the shared AI config helper.
- `/api/ai-field-docs` status now reports safe AI status fields:
  - configured
  - provider
  - model
  - source type
  - key name only
- No frontend/client exposure of the AI key was added.

Verification:
- Local shared AI resolver returned:
  - configured: true
  - provider: openai
  - key name: `OPENAI_API_KEY`
  - source type: Bridge common env file
- `node --check api\_lib\sharedEnv.js` passed.
- `node --check api\ai-field-docs.js` passed.
- `npm.cmd run test:receipt-ocr` passed.
- `npm.cmd run build` passed.

Development deployment:
- Deployed development preview with the shared Bridge OpenAI key passed as server-only runtime env.
- Development alias updated:
  - `https://project-rui1d-development.vercel.app`
- Production was not deployed.

AI/OCR smoke test:
- Development `/api/ai-field-docs` status returned:
  - HTTP 200
  - configured: true
  - provider: openai
  - key name: `OPENAI_API_KEY`
- Synthetic development receipt OCR call returned:
  - HTTP 200
  - ok: true
  - configured: true
  - supplier: `QA Building Supply`
  - total: `$41.81`
  - currency: `CAD`
- Browser QA passed:
  - Receipts screen stayed on Receipts after `AI read`.
  - Review modal showed `OCR ready`.
  - OCR fields were prefilled with supplier, subtotal, HST, total, currency, material category, and material type.
  - Old `Enter receipt amount` prompt did not appear.
  - Saving OCR data closed the modal and updated the Receipts KPI/card total to `$41.81`.

Remaining issues:
- The shared AI key was supplied to this development deployment as deployment-scoped runtime env.
- If future Preview deployments are made without passing the shared AI env or setting it in Vercel Preview env, OCR will return to `provider_not_configured`.
- Production AI OCR still requires separate explicit approval/configuration before production deployment.

Safety:
- No SQL was run for this shared AI resource pass.
- Production database was not touched.
- Production deployment was not performed.
- No push to main was performed.
- No secrets were printed or committed.

## B.2 Daily Report Real-Send Readiness + Scheduler QA

Date: 2026-06-14

Scope:
- Development-only implementation and QA for production-readiness.
- No production deployment.
- No main merge or main push.
- No SQL run in this pass.
- No external email or WhatsApp message sent because Gmail/WhatsApp provider credentials and recipients are not configured in local/shared/Vercel env listings.

Implementation:
- Extended `api/_lib/sharedEnv.js` so server-only daily report delivery env names can be resolved from approved shared Bridge resources when present.
- Added `api/_lib/reportDelivery.js` for gated Gmail and WhatsApp Cloud API delivery helpers.
- Updated email and WhatsApp report API routes to load shared server env before reading delivery config.
- Converted daily report scheduling from dry-run-only foundation to a gated delivery path:
  - requires `DAILY_REPORT_CRON_ENABLED=true`
  - requires `CRON_SECRET`
  - checks configured company-local report time
  - supports `dryRun=true` for no-send QA
  - supports `force=true` for secret-protected QA outside the exact report minute
  - sends email only when Gmail config, recipients, send flag, and duplicate-send log reservation are all valid
  - sends WhatsApp only when WhatsApp config, recipients, send flag, approved template config, and duplicate-send log reservation are all valid
  - masks recipients in responses
  - safely returns warnings without sending when gates are missing
- Added `api/_lib/dailyReportScheduler.js` and wired it through the existing `/api/auto-clockout` cron function to stay under the Vercel Hobby 12-function limit.
- Preserved source-only `api/daily-supervisor-report-cron.js` for future Pro/backend separation, but kept it excluded from Vercel Hobby deployment.
- Kept `vercel.json` on the existing daily `/api/auto-clockout` cron schedule.
- Updated `docs/B2_FIX_6_DAILY_REPORT_SCHEDULER.md` to reflect gated real-send readiness instead of dry-run-only foundation.

Configuration status:
- Shared Bridge common env currently provides `OPENAI_API_KEY` only by detected variable name.
- Gmail delivery env values were not detected locally or in Vercel env listing.
- WhatsApp delivery env values were not detected locally or in Vercel env listing.
- Development deployment can QA OCR and dry-run scheduler behavior, but real email/WhatsApp sends still require provider credentials, approved recipients, duplicate-send table, and explicit env flags.

Verification planned:
- API syntax checks for delivery helper, cron route, email route, WhatsApp route, and shared env helper.
- Receipt OCR normalization test.
- Build.
- Development deployment only.
- Development API smoke checks for OCR status and cron dry-run behavior.

Verification completed:
- `node --check` passed for:
  - `api/_lib/reportDelivery.js`
  - `api/_lib/sharedEnv.js`
  - `api/_lib/dailyReportScheduler.js`
  - `api/auto-clockout.js`
  - `api/daily-supervisor-report-cron.js`
  - `api/send-daily-timesheet-email.js`
  - `api/send-daily-timesheet-whatsapp.js`
- Focused ESLint passed for the changed delivery/scheduler files.
- `npm.cmd run test:receipt-ocr` passed.
- `npm.cmd run test:timesheet-sanity` passed.
- `npm.cmd run build` passed.
- Full `npm.cmd run lint` remains blocked by existing unrelated generated/dist lint noise and older API lint items, not by the new delivery/scheduler files.
- First direct deployment of `/api/daily-supervisor-report-cron` failed on Vercel Hobby because it would exceed the 12 Serverless Function limit.
- Scheduler was refactored into `api/_lib/dailyReportScheduler.js` and invoked through the existing `/api/auto-clockout` function.
- Development deployment passed and was aliased to `https://project-rui1d-development.vercel.app`.
- Preview deployment URL: `https://project-rui1d-adgci5i3x-samrental70-7859s-projects.vercel.app`.
- Scheduler-only QA trigger passed:
  - endpoint: `/api/auto-clockout?daily_report_only=true&force=true&dryRun=true`
  - auth: hidden `CRON_SECRET`
  - ok: true
  - dryRun: true
  - companies checked: 1
  - email configured: false
  - WhatsApp configured: false
  - sent count: 0
  - failed count: 0
- Unauthenticated scheduler-only endpoint returned 401, confirming cron protection.
- Email/WhatsApp routes returned 405 for GET, confirming routes are deployed and method-limited.
- Browser QA loaded the development app signed in as Samrat with no console errors.
- Browser QA confirmed the signed-in Home screen rendered after loading.

Remaining production-merge blockers:
- Configure Gmail provider credentials server-side only.
- Configure WhatsApp Cloud API credentials server-side only.
- Approve/test WhatsApp template and recipient consent.
- Apply and verify `daily_report_logs` migration before real sends.
- Configure `DAILY_REPORT_CRON_EMAIL_RECIPIENTS` and/or `DAILY_REPORT_CRON_WHATSAPP_RECIPIENTS`.
- Set production `DAILY_REPORT_CRON_ENABLED=true`, channel send flags, and `CRON_SECRET` only after production approval.

## B.2 Daily Report/OCR Advisor Remediation Gate

Date: 2026-06-14

Scope:
- Resolve advisor `needs_changes` items for the B.2 daily report/OCR/scheduler gate on `develop`.
- Development database/app only.
- No production deployment.
- No main push.
- No production email/WhatsApp flags enabled.
- No destructive SQL.
- No secrets, tokens, env values, receipt image, customer/employee records, or full identifiers were sent to advisor.

SQL safety and duplicate-send protection:
- Reviewed `supabase/migrations/20260611120000_create_daily_report_logs.sql`.
- Confirmed additive only:
  - `create table if not exists public.daily_report_logs`
  - primary key
  - unique company/report-date/channel/recipient constraint
  - company/date index
- Confirmed no `DROP`, `DELETE`, `TRUNCATE`, destructive `UPDATE`, or destructive `ALTER`.
- Confirmed local Supabase CLI target is linked to `bridge-app-dev` ending `jjwbut`.
- Confirmed separate `clock-app` Supabase project ending `evhyjm` exists and is not the linked dev target.
- Ran only the daily report logs migration against linked development DB.
- Verified table exists in development.
- Verified unique duplicate-send constraint exists in development.
- Verified supporting indexes exist in development.

RBAC and tenant safety QA:
- Unauthenticated email report request returned 401.
- Unauthenticated WhatsApp report request returned 401.
- Manager/Admin own-company email preview returned 200 dry-run with Gmail missing-config warning.
- Manager/Admin own-company WhatsApp preview returned 200 dry-run with WhatsApp missing-config warning.
- Dev DB currently has only one company, so wrong-company API test was skipped because there is no second company fixture.
- Created one additive dev-only QA employee account because no employee-role member existed in the dev company.
- QA employee email report route returned 403 `Manager/Admin access required`.
- QA employee WhatsApp report route returned 403 `Manager/Admin access required`.
- QA employee direct timesheet visibility returned zero visible rows.
- QA employee direct media visibility returned zero visible rows.
- QA employee direct daily report log visibility returned zero visible rows.

Gmail/WhatsApp staged-send gate:
- Gmail provider credentials were not detected in local/shared/Vercel env listings.
- WhatsApp Cloud API credentials/template were not detected in local/shared/Vercel env listings.
- No real Gmail email was sent.
- No real WhatsApp message was sent.
- `send=true` with safe test recipient returned safe dry-run, `sent=false`, `configured=false`, and missing-config warning for Gmail.
- `send=true` with safe test phone returned safe dry-run, `sent=false`, `configured=false`, and missing-config warning for WhatsApp.

Receipt OCR real upload QA:
- Created a synthetic fake QA receipt PNG with no real customer/vendor data.
- Uploaded the test receipt to development storage.
- Inserted a development receipt media row.
- Called the deployed OCR route.
- OCR returned:
  - configured: true
  - ok: true
  - supplier: QA Building Supply
  - subtotal: 37.00
  - HST: 4.81
  - total: 41.81
  - currency: CAD
  - material category: drywall
  - material type: screws and compound
- Saved structured receipt fields after review-equivalent validation.

Fresh browser/UI QA:
- Admin signed-in UI rendered with no console errors for:
  - Home
  - Clock
  - Timesheets
  - More/Menu
  - Schedule
  - Photos
  - Receipts
  - Reports
  - Team
  - Settings
- Reports screen showed daily email and WhatsApp report controls with send-test pending setup state.
- Employee signed-in UI rendered with no console errors.
- Employee landed on Clock.
- Employee bottom nav showed Clock, Schedule, Timesheets, More.
- Employee Home/Reports were not visible.
- Employee daily email and WhatsApp controls were not visible.
- Employee More menu did not show Reports, Team, or Request Center.
- Browser session was restored to Samrat after employee QA.

Advisor re-review:
- Sanitized advisor re-review was completed after remediation.
- Advisor final decision: approved for the development remediation/merge gate.
- Advisor also stated production readiness is not ready yet.
- Advisor remaining production blockers:
  - second-company tenant isolation fixture/test
  - staged real Gmail send with approved test recipient
  - staged real WhatsApp template send with approved test recipient
  - production env/config/cron/rollback/monitoring checklist
  - tracking pre-existing full-lint noise

Build/deployment status:
- Receipt OCR normalization test passed.
- Timesheet sanity test passed.
- Focused lint for changed delivery/scheduler files passed.
- Build passed before remediation re-review.
- Final approval-wrapper build passed.
- Development deployment completed and aliased to `https://project-rui1d-development.vercel.app`.
- Preview deployment: `https://project-rui1d-mj2erxnk2-samrental70-7859s-projects.vercel.app`.
- Development app root returned HTTP 200.
- Scheduler endpoint returned HTTP 401 without cron authorization.
- Authorized development scheduler dry-run returned ok/dry-run true.

Safety:
- Production database was not touched.
- Production deployment was not performed.
- No push to main was performed.
- No destructive commands were run.

Chat list UX follow-up:
- Mobile-safe list title input and placeholder-only composer landed on develop.
- Optimistic add/done interactions and completed-item visibility toggle landed on develop.
- Development alias refreshed again after the final code tweak.
- Browser screenshot QA was attempted but interrupted by the desktop automation session, so screenshots still need a clean retry.
- Advisor review returned "needs_changes" until clean mobile screenshots and manual phone interaction QA are captured.

Chat list placement follow-up:
- Chat lists now render as inline thread cards instead of only a top modal.
- Pinned shortcuts remain in the ribbon as jump links only.
- Tapping a pinned shortcut scrolls to the matching list card in the thread.
- `verify:release` passed after the placement update.
- Development deployment was refreshed and aliased to `https://project-rui1d-development.vercel.app`.
- Preview deployment: `https://project-rui1d-iul14iqnm-samrental70-7859s-projects.vercel.app`.
- Browser screenshot QA was still interrupted before a clean retry, so that remains the last follow-up check.

2026-07-01 env separation hardening:
- Added a client-side Supabase project-ref guard in `src/lib/supabaseClient.js`.
- Development-like builds now fail closed if they point at the production Supabase project ref.
- Added a full-screen environment gate in `src/App.jsx` so a bad env cannot silently load the app against the wrong database.
- Verified Vercel env separation via CLI:
  - Preview: `jvlx...wbut`
  - Production: `vunw...hyjm`
- Re-ran `npm.cmd run verify:release` after the guard; it passed.
- This keeps login-email overlap from ever becoming a cross-environment database leak.

## 2026-07-01 - Chat QA + Pinned Lists + Timesheet Breaks + Cross-Device Session

Development-only changes:
- Added additive migration `supabase/migrations/20260630123000_chat_lists_and_timesheet_breaks.sql`.
- Added `chat_lists` and `chat_list_items` for pinned shared chat lists.
- Added timesheet break fields:
  - `break_start_at`
  - `break_end_at`
  - `break_minutes`
  - `break_note`
- Added requested break fields to `timesheet_change_requests`.
- Added chat list API actions:
  - `create_list`
  - `add_list_item`
  - `update_list_item`
  - `toggle_list_item`
  - `delete_list_item`
  - `archive_list`
- Added chat pinned-list UI:
  - list icon near photo composer action
  - Create list modal
  - pinned list card at top of thread
  - list detail modal
  - add/edit/delete/check/uncheck item controls
  - stable item numbering after item delete
- Updated timesheet calculations so break time is excluded from worked time, labour, daily reports, and auto-clockout calculations.
- Updated timesheet edit/approval flow to carry break start/stop/minutes.
- Updated active shift task/break persistence so active DB row remains the source of truth across reload/device changes.

Development database:
- Migration applied to development Supabase only.
- Development Supabase ref verified as masked `...jjwbut`.
- Production database was not touched.

QA evidence:
- Chat QA screenshots saved in `docs/qa/chat/`.
- QA reports created:
  - `docs/qa/CHAT_QA_REPORT.md`
  - `docs/qa/CHAT_TIMESHEET_CLOCK_QA_REPORT.md`
- Pinned list stable numbering verified through development API:
  - item #2 deleted
  - remaining item numbers: `[1, 3, 4]`
  - open count: `2`
  - total count: `3`

Advisor review:
- Advisor review completed with usable screenshots and sanitized implementation notes.
- Advisor final decision: blocked for production promotion.
- Main remaining blockers:
  - destructive chat flows need reliable browser/mobile QA
  - authenticated chat list/item RLS role matrix needed
  - actual timesheet break-record display/edit/report QA needed
  - manual two-device cross-device clock session QA needed
  - duplicate active shift race protection should be reviewed before production

Verification:
- `npm.cmd run verify:migrations`: pass.
- `npm.cmd run verify:b2-dev`: pass.
- `npm.cmd run lint`: pass with existing warnings only.
- `npm.cmd run build`: pass.
- `npm.cmd run verify:release`: pass.

Deployment:
- Development preview deployment completed.
- Development alias updated:
  - `https://project-rui1d-development.vercel.app`
- Production deployment was not performed.

Safety:
- No production SQL run.
- No production deployment.
- No push to main.
- No production database touched.
- No Supabase Storage production changes.

## B.2 Dev Migration Retry Fix — June 26, 2026

Context:
- User reran release verification from `C:\Users\samra\clock-app`.
- `npx.cmd supabase db push` reached the development database but stopped on the existing notifications policy:
  - `policy "notifications_select_own" for table "notifications" already exists`
- `npm.cmd run verify:b2-dev` then failed because B.2 chat tables had not yet been created:
  - `chat_conversations` missing from schema cache

Fix:
- Updated `supabase/migrations/20260503140000_create_notifications.sql` so notification policies are created only when missing.
- B.2 migrations were rechecked and already use guarded `pg_policies` checks for new policies.

Verification:
- `npm.cmd run verify:migrations` passed.
- `npm.cmd run lint` passed with existing legacy warnings only.
- `npm.cmd run build` passed.
- `npm.cmd run test:timesheet-sanity` passed.
- `npm.cmd run test:receipt-ocr` passed.

Remaining gate:
- Rerun development-only Supabase migration push from the authenticated terminal that has `SUPABASE_DB_PASSWORD`.
- Rerun `npm.cmd run verify:b2-dev` and `npm.cmd run verify:release` after the push completes.

Safety:
- Production database was not touched.
- No production deployment was performed.
- No SQL was run from Codex during this retry fix.
- No push to main was performed.
- No destructive commands were run.

## B.2 Dev Database Push + Development Deploy Verification — June 26, 2026

Development database:
- User reran `npx.cmd supabase db push --dry-run`; Supabase listed the pending development migrations.
- User approved and completed `npx.cmd supabase db push` against the development/shared Supabase database ending `...jjwbut`.
- Old already-existing objects were skipped with Supabase notices.
- B.2 chat migration applied.
- B.2 live locations migration applied.

Verification:
- `npm.cmd run verify:b2-dev` passed:
  - `employee_pay_rates` readable
  - `daily_report_logs` readable
  - `chat_conversations` readable
  - `chat_conversation_members` readable
  - `chat_messages` readable
  - `live_locations` readable
  - `project_media` receipt OCR columns readable
  - API auth-boundary smoke checks returned expected statuses
- `npm.cmd run verify:release` passed from Codex:
  - migration safety passed
  - lint passed with existing warnings only
  - build passed
  - timesheet sanity test passed
  - receipt OCR normalization test passed
  - B.2 dev readiness passed

Development deployment:
- Preview deployment completed:
  - `https://project-rui1d-cp09wnahk-samrental70-7859s-projects.vercel.app`
- Development alias updated:
  - `https://project-rui1d-development.vercel.app`
- Root development app returned HTTP 200.
- Development API smoke checks returned expected auth/method statuses:
  - `/api/chat` 401
  - `/api/project-media` 401
  - `/api/create-project-task` 401
  - `/api/ai-field-docs` 401
  - `/api/send-daily-timesheet-report` 400

Vercel environment note:
- The development deployment was created with dev Supabase values injected at deploy time.
- Vercel CLI would not add all-Preview `VITE_SUPABASE_URL` because the project is not Git-connected and the CLI required a Preview branch target.
- During the Preview-env reset attempt, the shared public `VITE_SUPABASE_URL` env record was removed by Vercel CLI; it was immediately restored for Production from local `.env` using production Supabase ref ending `...evhyjm`.
- Current Production site still returns HTTP 200.
- Remaining cleanup: add/restoring Preview `VITE_SUPABASE_URL` should be done through Vercel dashboard or by continuing to use deploy-time env injection for Preview deploys.

Safety:
- Production database was not touched.
- Production deployment was not performed.
- No push to main was performed.
- No destructive database command was run.

## B.2 Development QA Checklist Pass — June 26, 2026

Scope:
- Development deployment only:
  - `https://project-rui1d-development.vercel.app`
- Branch:
  - `develop`
- Production database was not touched.
- Production deployment was not performed.
- No push to main was performed.

Automated checks:
- `npm.cmd run verify:migrations` passed.
- `npm.cmd run verify:b2-dev` passed against dev/shared Supabase ref ending `...jjwbut`.
- `npm.cmd run verify:release` passed:
  - migration safety passed
  - lint exited 0 with existing warnings only
  - build passed
  - timesheet sanity passed
  - receipt OCR normalization passed
  - B.2 dev readiness passed

Development deployment correction:
- Browser QA initially found the development app loading the error boundary:
  - `Cannot read properties of null (reading 'auth')`
- Root cause:
  - Preview runtime env existed through deploy-time injection, but Vite public Supabase env was missing at build time.
- Fix applied:
  - Redeployed development/Preview only with both build-time and runtime dev Supabase env.
  - Updated development alias to the fixed Preview deployment.
- Recheck:
  - Login screen loaded.
  - Owner login succeeded.
  - Employee login succeeded using `samratsood003@gmail.com`.

Browser/UI QA:
- Owner Home loaded with company context and owner role.
- Owner Home dashboard rendered:
  - Team coverage
  - Recent activity
  - Live job sites
  - Live team
  - Worked today
- Owner management screens rendered without error boundary:
  - Schedule
  - Photos
  - Receipts
  - Reports
  - More/Menu
- Employee default landing was Clock.
- Employee bottom nav showed:
  - Clock
  - Chat
  - Timesheets
  - More
- Employee bottom nav did not show Home or Schedule.
- Employee Timesheets showed `My timesheets` and did not show manager-only timesheet sanity panel.
- Employee Chat loaded the default `All employees` conversation.
- Employee sent a dev QA chat message successfully.

Schedule/notification QA:
- Created dev-only QA scheduled assignment rows for the employee.
- Employee received in-app schedule assignment popup.
- Employee could open Schedule from the assignment popup.
- Employee accepted one assignment; database showed `accepted`.
- Employee declined one assignment with reason; database showed `declined` and stored the reason.

Manual time QA:
- Employee opened manual time request form.
- Employee submitted a manual time request.
- Request appeared as `Waiting for supervisor approval`.
- Database showed one pending `manual_time` request.
- Timesheet count did not increase immediately, confirming pending requests do not directly create real timesheets.
- Owner approval UI surfaced Approve/Reject, but browser automation hung around the confirmation dialog; approval completion was not verified in this pass.

Database/RBAC QA:
- Owner login via Supabase auth succeeded.
- Owner membership role was `owner`.
- Employee login via Supabase auth succeeded for `samratsood003@gmail.com`.
- Employee membership role was `employee`.
- Employee timesheet RLS returned own rows only.
- Employee media RLS returned own rows only.
- Employee schedule assignment query returned own assignments only.
- Authenticated employee chat API returned HTTP 200 and included `All employees`.
- Unauthenticated API smoke checks returned expected protected responses:
  - `/api/chat` 401
  - `/api/project-media` 401
  - `/api/create-project-task` 401
  - `/api/ai-field-docs` 401
  - `/api/send-daily-timesheet-report` 400

Media/OCR/delivery QA:
- Photos screen rendered from `project_media`.
- Receipts screen rendered receipt totals and OCR/status metadata.
- Receipt OCR normalization test passed.
- `project_media` contained photo and receipt rows.
- No video rows existed in dev data, so video upload could not be validated from existing data.
- Browser/file/camera limitations prevented real camera, multi-photo, gallery, and video capture testing in this pass.
- Reports showed Gmail/WhatsApp delivery as disabled/pending configuration.
- Local env did not contain `OPENAI_API_KEY`, so AI behavior was fallback/not-configured mode.

Remaining blockers before production readiness:
- Persistent Vercel Preview env store still lacks `VITE_SUPABASE_URL`; current dev deployment is healthy because it was deployed with build-time/runtime env injection.
- Employee clock-in/out end-to-end was blocked by browser location settings:
  - UI showed `Location is blocked in browser settings. Location is needed for clock-in.`
- Manual time owner approval completion was not verified because browser automation hung around the confirmation dialog.
- Closed-app push notification and 1-hour alarm acknowledgement were not fully testable from Codex browser.
- Real camera/gallery multi-photo and video upload were not fully testable from Codex browser.
- Real email/WhatsApp sends remain disabled and require controlled staged provider tests before production.

Production readiness recommendation:
- Not ready for production promotion yet.
- Recommended before promotion:
  - Restore/persist Preview environment variables in Vercel dashboard or update deployment runbook to always include build/runtime env injection.
  - Run manual mobile QA with location permission allowed for clock-in/out and live location.
  - Complete owner approval/rejection manual time QA on a real browser session.
  - Complete camera/photo/video upload QA on mobile.
  - Complete controlled email/WhatsApp staged sends if those features are intended for production.

## B.2 Production Readiness Hardening Pass

Date: 2026-06-26

Scope:
- Continued on `develop`.
- No production deployment.
- No push to main.
- No production SQL run.
- No database data deleted.

Changes completed:
- Removed the debug startup Supabase `employees` query/log from `src/App.jsx`.
- Fixed API lint issues in `api/project-media.js` and `api/send-push.js`.
- Added `npm run verify:release` as a consolidated release gate.
- Updated ESLint config so OPERA runtime files are checked while unrelated local artifacts are ignored.
- Moved shared Vercel API helper modules from ignored `server/api-lib` to tracked `api-shared`.
- Updated API imports to use `api-shared`.
- Restored `server/` to ignored status so unrelated local server work does not ship.
- Added `bridge/` and `supabase/dev-only/` to local/deployment ignores.
- Tightened pending B.2 SQL migrations by removing non-additive policy replacement patterns.
- Confirmed pending migration scan has no `DROP`, `DELETE`, `TRUNCATE`, `RESET`, or `ALTER ... DROP` statements.

Verification:
- `npm.cmd run verify:release` passed.
- `npm.cmd run lint` exits 0 with legacy warnings only.
- `npm.cmd run build` passed.
- `npm.cmd run test:timesheet-sanity` passed.
- `npm.cmd run test:receipt-ocr` passed.
- Built frontend bundle scan found no obvious service-role/OpenAI/private-key patterns.
- Vercel Preview deployment completed and development alias updated.
- Development app: `https://project-rui1d-development.vercel.app`.
- Development API smoke:
  - `/api/chat` returns 401 without auth.
  - `/api/project-media` returns 401 without auth.
  - `/api/create-project-task` returns 401 without auth.
  - `/api/ai-field-docs` returns 401 without auth.
  - `/api/send-daily-timesheet-report` returns 400 without channel.
- Development bundle includes DEV icon and chat code.
- Employee bottom nav no longer includes Schedule.

Advisor status:
- Sanitized B.2 production-readiness advisor review completed.
- Advisor final decision: blocked for production merge until remaining high-risk gates are completed.
- No secrets, env values, receipt images, customer records, employee records, or database contents were sent.

Remaining production gates:
- Run pending migrations on a staging/production-like database and verify idempotency.
- Complete explicit RLS/RBAC tests for chat, live locations, receipt OCR fields, daily report logs, and pay rates.
- Complete manual QA on development app for owner/supervisor/employee accounts.
- Verify live location privacy behavior: only while clocked in, stops on clock-out/logout, company-scoped visibility.
- Verify chat company/membership isolation.
- Verify receipt OCR with configured provider and safe synthetic receipt.
- Verify email/WhatsApp disabled/enabled behavior with approved test recipients only.
- Confirm production Vercel server-side env readiness without exposing values.
- Prepare backup/checkpoint plan before production SQL.

Production status:
- Development candidate hardened.
- Not yet approved to merge to main.
- Not yet approved for production deployment.
- No production SQL run.

## B.2 Production Readiness Gate - Final Attempt Status

Date: 2026-06-26

Additional hardening completed:
- Added `scripts/verify-b2-migration-safety.js`.
- Added `scripts/verify-b2-dev-readiness.js`.
- Added package scripts:
  - `verify:migrations`
  - `verify:b2-dev`
  - updated `verify:release`
- Updated `docs/DATABASE_ENVIRONMENT_SAFETY.md` with the exact blocked SQL command sequence.
- Updated `docs/B2_PRODUCTION_READINESS_RUNBOOK.md` with the latest gate status.

Checks completed:
- Supabase CLI auth confirmed.
- Supabase linked target confirmed as `bridge-app-dev` / masked ref `...jjwbut`.
- Production/older clock project identified separately as masked ref `...evhyjm`.
- `npm.cmd run verify:migrations` passed for the B.2 202606 migrations.
- App-side checks passed:
  - lint exits 0 with legacy warnings only
  - build passes
  - timesheet sanity test passes
  - receipt OCR normalization test passes
- Development app remains deployed at `https://project-rui1d-development.vercel.app`.

Blocked checks:
- `npx.cmd supabase db push --dry-run` failed because `SUPABASE_DB_PASSWORD` is missing or invalid for `bridge-app-dev`.
- `npm.cmd run verify:b2-dev` failed because `public.chat_conversations` is not present in the `bridge-app-dev` schema cache.
- Because B.2 migrations are not applied on dev, authenticated RBAC/RLS QA for chat/live-location/report/pay-rate/OCR tables cannot be completed yet.

Advisor recheck:
- Sanitized advisor review rerun after adding the new gates.
- Advisor final decision: blocked.
- Advisor confirmed production merge remains blocked until the dev DB password is supplied, migrations dry-run/apply succeeds, `verify:b2-dev` passes, and role/RBAC QA is completed.
- No secrets, env values, customer data, employee records, receipt images, or database contents were sent.

Required next command sequence once `bridge-app-dev` database password is available:

```powershell
$env:SUPABASE_DB_PASSWORD="<bridge-app-dev database password>"
npm.cmd run verify:migrations
npx.cmd supabase db push --dry-run
npx.cmd supabase db push
npm.cmd run verify:b2-dev
npm.cmd run verify:release
```

Safety:
- SQL run: no.
- Production SQL run: no.
- Production deployment: no.
- Push to main: no.
- Destructive commands run: no.

## B.2 Chat + Employee Project/Task Creation Production-Readiness Work

Date: 2026-06-26
Branch: develop

Scope:
- Fixed the production-facing employee project/task creation blocker in code.
- Added in-app chat foundation for default company chat, direct messages, and named group chats.
- Kept work on develop only.
- No production deployment.
- No push to main.

Employee project/task creation:
- Updated `api/create-project-task.js` so authenticated active company employees can create projects/tasks from Clock.
- Kept server-side bearer-session validation.
- Kept same-company membership validation.
- Added optional `company_members.status` / `company_members.employment_status` inactive-member rejection when those columns exist.
- Kept profile `employment_status = archived` rejection.
- Preserved existing project/task assignment behavior:
  - all-projects setting still controls assignment breadth
  - all-tasks setting still controls task propagation
  - supervisor notifications remain preserved
- Updated Clock UI so active employees see:
  - `+ Add new project`
  - `+ Add new task`
- Updated Projects access rule so active employees can reach Projects when project/task creation is available from Clock.
- Removed hidden mutation that forced the legacy `allow_employee_project_task_creation` setting to true on company Settings save.
- Reworded Settings display to explain active employees can add from Clock and assignment rules still control visibility.

Chat implementation:
- Added `api/chat.js`.
- Added additive migration:
  - `supabase/migrations/20260626120000_create_company_chat.sql`
- Migration adds:
  - `chat_conversations`
  - `chat_conversation_members`
  - `chat_messages`
- Chat API supports:
  - default `All team` company chat
  - one-to-one direct conversations
  - named group conversations
  - paginated message loading
  - message send with idempotent client id
- Chat authorization:
  - validates Supabase bearer token
  - validates active same-company membership
  - validates conversation membership on messages and sends
  - validates direct-chat target is an active same-company member
  - validates group members are active same-company members
  - rejects archived/inactive users where schema supports the status fields
- Chat UI:
  - added `ChatScreen` as a separate component to preserve main React hook order
  - accessible from More/Menu
  - includes conversation list, New chat, New group, message thread, composer, empty/loading/error states
  - uses Royal Navy visual system
  - does not claim attachments, read receipts, or push delivery yet

Advisor review:
- Sanitized advisor architecture review ran before implementation.
- Advisor decision before implementation: needs changes.
- Sanitized advisor QC review ran after implementation.
- Advisor decision after implementation: needs changes for production promotion.
- Mandatory blockers remaining:
  - development chat migration has not been run yet
  - authenticated chat end-to-end flow has not been tested against a migrated dev DB
  - negative authorization tests are still needed for cross-company, non-member, inactive-member, and direct-client access
  - project/task wrong-company/stale-membership tests are still needed before production promotion

Verification completed:
- `node --check api/chat.js` passed.
- `node --check api/create-project-task.js` passed.
- Focused lint passed:
  - `api/chat.js`
  - `api/create-project-task.js`
- `npm.cmd run build` passed.
- `npm.cmd run test:receipt-ocr` passed.
- `npm.cmd run test:timesheet-sanity` passed.
- Local browser smoke opened OPERA.AI at `http://127.0.0.1:5174/` with no captured console errors.

Known limitations / remaining work:
- Chat migration was created but not run.
- No production SQL was run.
- No development SQL was run for chat in this pass.
- Chat live DB functionality must be tested after dev-only migration approval.
- Repo-wide lint remains noisy due existing/generated files and older large React-file lint issues; touched API files lint clean.
- Workspace includes prior B.2 OCR/daily report work; isolate release scope before production promotion.

Safety:
- Production database was not touched.
- Production deployment was not performed.
- No push to main was performed.
- No destructive commands were run.

## B.2 Cross-Device Active Shift Rehydrate

Date: 2026-06-26
Branch: develop

Scope:
- Ensured an employee who clocks in on one mobile device can log in on another mobile device and still see the ongoing shift.
- Ensured the same active Supabase timesheet row remains the source of truth for clock-out from any signed-in device.

Implementation:
- Updated the timesheet refresh flow to detect the signed-in user’s latest open/active server timesheet.
- Rehydrates `currentShift` from the active Supabase timesheet when local device storage has no active shift.
- Clears stale local server-backed shifts when the server no longer has an active row for the signed-in user.
- Preserves unsynced local-only shifts when database save failed and no server row exists.
- Rehydrates project, task, clock-in time, employee info, hourly rate, location, and timesheet id.
- Looks up server photo count from `project_media.related_timesheet_id` so the photo-before-clock-out rule works across devices when a photo was already uploaded from the first device.
- If no server photo exists, the second device can still capture the required photo before clocking out.

Verification:
- `npm.cmd run build` passed.
- `npm.cmd run test:timesheet-sanity` passed.
- `npm.cmd run test:receipt-ocr` passed.
- Focused API lint for current changed APIs passed.

Safety:
- No SQL run.
- No production deployment.
- No push to main.
- No destructive commands run.

## B.2-fix-8 Production Readiness Runbook + Real Delivery Test Plan

Date: 2026-06-15

Scope:
- Prepared production readiness planning documents for B.2 daily reports, receipt OCR, scheduler, Gmail, and WhatsApp.
- Documentation/runbook task only.
- No SQL run.
- No real Gmail or WhatsApp sent.
- No production send flags enabled.
- No production deployment.
- No push to main.

Files created:
- `docs/B2_PRODUCTION_READINESS_RUNBOOK.md`
- `docs/B2_REAL_DELIVERY_TEST_CHECKLIST.md`

Runbook contents:
- Current B.2 development-readiness status.
- Production prerequisites.
- Gmail, WhatsApp, and cron/security environment variable checklist without real values.
- Real Gmail staged test plan.
- Real WhatsApp staged test plan.
- Receipt OCR retest plan.
- Production enablement steps.
- Rollback plan.
- Monitoring checklist.
- Required approvals and owners.
- Hard go/no-go criteria.
- Recipient allowlist and canary controls.
- Rollback verification drill.
- Monitoring thresholds and escalation path.
- Provider failure matrix.
- Sanitized evidence requirements.
- Post-release observation window.

Real delivery checklist contents:
- Gmail real delivery checklist.
- WhatsApp real delivery checklist.
- Receipt OCR retest checklist.
- RBAC/tenant safety checklist.
- Scheduler/cron checklist.
- Rollback drill checklist.
- Monitoring/evidence checklist.
- Production go/no-go checklist.

Advisor production-readiness review:
- First sanitized advisor review returned `needs_changes`.
- Advisor requested measurable pass/fail gates, containment controls, rollback proof, monitoring thresholds/owners, scheduler-specific gates, provider failure matrix, and evidence capture.
- Updated docs to address those recommendations.
- Second sanitized advisor review returned `approved` for a production-readiness planning artifact only.
- Advisor explicitly stated this is not production enablement approval.

Remaining production blockers:
- Actual real Gmail delivery test evidence.
- Actual real WhatsApp delivery test evidence.
- Final named approver signatures/timestamps.
- Provider-side readiness evidence:
  - Gmail auth/quota/sender status
  - WhatsApp template/language/opt-in/rate-limit status
- Allowlist enforcement proof during test execution.
- Rollback drill execution evidence.
- Scheduler production timing validation for timezone/DST and cron window.

Safety:
- SQL run: no.
- Real email/WhatsApp sent: no.
- Production deployment: no.
- Production send flags remain disabled.
- No secrets or env values were documented or sent to advisor.

## B.2 Daily Report/OCR Advisor Remediation Gate - Follow-up

Date: 2026-06-15

Scope:
- Re-ran the B.2 remediation gate after a fresh advisor review returned `needs_changes`.
- Continued on `develop` only.
- No production deployment.
- No push to main.
- No production email or WhatsApp flags enabled.
- No real email or WhatsApp was sent.
- No secrets, tokens, env values, receipt images, customer records, employee records, or code were sent to advisor.

Advisor follow-up:
- First fresh advisor review on 2026-06-15 returned `needs_changes`.
- Main development-gate issue was lack of second-company tenant isolation proof.
- Additional concerns included duplicate-send retry semantics, scheduler/idempotency evidence, OCR negative paths, and positive same-company RLS checks.

RLS and tenant isolation remediation:
- Added `supabase/migrations/20260615110000_harden_daily_report_rls.sql`.
- Migration is non-destructive:
  - enables RLS on `daily_report_logs`
  - adds admin/supervisor scoped select policy for `daily_report_logs`
  - adds restrictive company-membership policy for `timesheets`
  - no data delete, no truncation, no table/column drop, no reset
- Applied the RLS hardening migration on the linked development database only.
- Created dev-only second-company/user fixture and company-scoped rows for tenant isolation QA.
- Verified main-company owner is not a member of the second company.
- Wrong-company email report API returned 403.
- Wrong-company WhatsApp report API returned 403.
- Email report GET method restriction returned 405.
- Direct signed-in main-owner query for other-company timesheets returned zero rows after RLS hardening.
- Direct signed-in main-owner query for other-company media returned zero rows.
- Direct signed-in main-owner query for other-company daily report logs returned zero rows.
- Same-company positive RLS test passed:
  - owner membership visible
  - owner own-company timesheet select succeeded
  - owner own-company timesheet insert succeeded
  - owner own-company timesheet update succeeded
  - owner own-company report log select succeeded

Duplicate-send and scheduler remediation:
- Fixed `isMissingDailyReportLogsTable` so duplicate key errors are not misclassified as missing-table errors.
- Updated `reserveDailyReportSend` so:
  - already-sent reports remain duplicate-protected
  - failed report reservations can be retried safely
- Direct duplicate test passed:
  - first sent reservation succeeded
  - second sent reservation returned duplicate
  - failed reservation retried with `retry: true`
- Scheduler-level test used dummy dev config and stubbed provider calls only.
- Scheduler unauthenticated request returned 403.
- First scheduler invocation reserved and failed safely against a stubbed provider.
- Second scheduler invocation retried the failed reservation instead of suppressing it as duplicate.
- No real email or WhatsApp provider call was allowed during this test.

Receipt OCR negative-path QA:
- Existing synthetic receipt OCR success path remained verified.
- Missing receipt image returned `image_unavailable` with manual review/save fallback message.
- Missing media returned safe `media_not_found`.
- Receipt OCR normalization test passed.

Fresh UI/browser QA:
- Refreshed development app rendered signed-in admin Home.
- Browser smoke checked:
  - Home
  - Clock
  - Timesheets
  - Schedule
  - Photos
  - Receipts
  - Reports
  - Team
  - More/Menu
- Checked screens rendered without console errors.
- Settings was present in the Admin menu DOM; the browser automation timed out clicking that offscreen item during this follow-up smoke pass.

Advisor final re-review:
- Sanitized advisor re-review completed after the RLS, duplicate retry, scheduler retry, OCR negative-path, and build checks.
- Advisor final decision: approved for development remediation/merge readiness only.
- Advisor explicitly stated production remains not ready.

Remaining production blockers:
- Controlled real Gmail staged send with an approved recipient.
- Controlled real WhatsApp template staged send with an approved recipient.
- Production cron/auth configuration verification.
- Production monitoring/alerting for failed sends, duplicate skips, OCR failures, and scheduler failures.
- Rollback/runbook checklist.
- Broader existing lint-noise tracking or cleanup.

Build/deployment status:
- Receipt OCR normalization test passed.
- Timesheet sanity test passed.
- Focused lint for changed daily-report/OCR files passed.
- Approval-wrapper build passed.
- Development deployment completed and aliased to `https://project-rui1d-development.vercel.app`.
- Preview deployment: `https://project-rui1d-ogz8v9jsm-samrental70-7859s-projects.vercel.app`.
- Development app root returned HTTP 200.
- Scheduler endpoint returned HTTP 401 without cron authorization.
- Authorized development scheduler dry-run returned ok/dry-run true.

Safety:
- Production database was not touched.
- Production deployment was not performed.
- No push to main was performed.
- No destructive commands were run.


- Chat/list WhatsApp-style UX refinement completed on develop.
- Company name limited to Home header only.
- Non-Home global header compacted to user-only branding.
- Pinned list shortcuts compacted.
- Lists now open into a full-page detail view with back arrow.
- List editing stays inside the list card/detail view.
- Delete actions converted to minus/icon controls.
- Chat sending made optimistic with composer focus preserved.
- verify:release passed after the refactor.
- Development deployment refreshed and aliased to https://project-rui1d-development.vercel.app.
- Advisor re-review completed; remaining ask is phone/screenshot QA.

- Payroll settings and payroll tracker work completed on develop.
- Added alternate Friday payroll schedule settings with anchor Friday control in Settings.
- Added Timesheets Payroll button and payroll tracker overlay with range filters, employee filter, period balances, and payment tracking.
- Payroll schema migration `20260701110000_create_payroll_tracking.sql` applied to the development database only.
- Payroll settings now persist in the dev app and the tracker opens without schema errors.
- Advisor UI/QC review completed; tracker is mobile-readable, with remaining polish suggestions noted for future refinement.
- Development build and lint remained clean for the payroll change set.
- No production deployment, no production SQL, and no push to main were performed in this payroll pass.

- Final payroll verification completed after report update.
- Development deployment refreshed to `https://project-rui1d-development.vercel.app`.
- Dev smoke check confirmed payroll settings load, alternate Friday anchor saves, payroll tracker opens, filters render, and payment tracking/balance UI remains available.
- Break exclusion and worked-vs-paid balance behavior remain in place on the deployed development app.
- Production deploy was not performed and production DB was not touched.

- Payroll UI refinement pass completed on develop.
- Payroll settings now clearly show the current payroll period range and pay date.
- Payroll tracker now includes a Payroll period filter alongside time range and employee filters.
- Payroll summary was compacted into a single slim row for hours, worked, paid, and balance.
- Development deployment refreshed again after the payroll UI refinement.

- Payroll dummy data and ledger expansion completed on develop.
- Added dev-only payroll balance brought forward table and employee loan transactions table via additive migration `20260701123000_payroll_balance_forward_and_loans.sql`.
- Added editable payroll payment row handling plus compact balance-forward and loan ledger entry cards in the payroll tracker.
- Added a dev-only payroll seeding helper that populates QA payroll periods, payments, brought-forward balances, and employee loan rows without touching production.
- Dev Supabase `jvlxahskximvbajjwbut` was verified, migration pushed, QA payroll seed rows inserted, and payroll totals now reflect balance forward plus loan adjustments.
- Final checks passed on develop: verify:migrations, verify:b2-dev, verify:release, lint, and build.
- Development deployment was refreshed and aliased to `https://project-rui1d-development.vercel.app`.
- No production deployment, no production SQL, and no push to main were performed in this payroll dummy-data pass.

- Payroll UI refinement pass completed on develop.
- Payroll tracker now shows compact numeric payroll periods like `06/13/2026 - 06/26/2026`.
- Payroll period selector keeps grouped pay-period options while the collapsed field shows the compact range only.
- Payroll payment chooser now opens a `Pay salary` / `Pay loan` menu from the plus action.
- Salary forms now use `Salary amount` and payment date + payroll period; loan forms now use payment date + loan direction.
- Duplicate mobile date icons were removed so the date inputs read more cleanly.
- Advisor final QA approved the mobile payroll UI for dev release after the compact period, salary, and loan flows were verified.

- Vacation periods were added to the timesheet and payroll UX on develop.
- Timesheets now include an `Add vacation` action that captures start date, end date, and reason.
- Vacation rows render as slim chronological lines in Timesheets and Payroll so managers can see time off inside the relevant period flow.
- Clock-in is blocked when an active vacation overlaps the current date range.
- Vacation tracking also excludes vacation time from worked-hours and labour calculations.
- A new additive migration `20260702120000_create_employee_vacation_periods.sql` was added, and the build/lint checks passed after the UI update.
- `verify:migrations` passed, but `verify:b2-dev` and the release gate are still blocked until the shared `bridge-app-dev` database receives the new `employee_vacation_periods` table.
- Development browser QA confirmed the Add vacation modal opens and the vacation line appears in both Timesheets and Payroll on the current dev session via local fallback.

- Employee auto payroll settings were added on develop.
- The employee editor now includes an Auto payroll toggle, payroll-start-period dropdown, and payroll amount field for each employee.
- Auto payroll settings are stored company-specifically and the payroll tracker now prompts managers before auto-creating payroll payments on due pay dates.
- A new additive migration `20260703120000_add_employee_auto_payroll_fields.sql` was added for company-member auto payroll fields.
- Build and lint passed after the auto payroll update; no production deployment or production DB change was performed.

- Payroll pay date offset now defaults to 10 days after the payroll period end and can be edited in Payroll Settings.
- Added additive migration `20260703133000_add_payroll_settings_pay_date_offset.sql` to persist the pay date offset.
- Employee payroll balance reminder popup now checks the next day after each completed payroll period and warns employees to clear a negative balance within 3 days before salary delay messaging appears.
- Employee payroll reminder now loads from the employee's own payroll state in the app so it can work locally without depending on a fresh Vercel function deploy.

- Final develop QA and deployment check completed for the payroll/chat/clock release candidate.
- Dev Supabase migration set was applied to `bridge-app-dev` / ref `jvlxahskximvbajjwbut`.
- `verify:migrations`, `verify:b2-dev`, `verify:release`, lint, and build all passed on develop.
- Development deployment was refreshed and the stable alias now points to `https://project-rui1d-development.vercel.app`.
- Mobile smoke screenshots were captured for Home, Clock, Timesheets, and Chat to support QA review.
- Advisor review completed but did not give production green light yet; additional production-style QA evidence is still needed for payroll tracker, chat/list, and break handling.
- QA report saved to `docs/qa/PAYROLL_CHAT_CLOCK_FINAL_QA_REPORT.md`.
- Development deployment succeeded by using a temporary packaging exclude list to stay within the Vercel Hobby function limit; the excluded non-core routes were `api/analyze-video.js`, `api/render-video.js`, `api/daily-supervisor-report-cron.js`, `api/diagnostics.js`, and `api/send-push.js`.

- Final production-readiness QA pass completed on develop for the payroll/chat/clock release candidate.
- Dev Supabase migration set was fully applied to `bridge-app-dev` / ref `jvlxahskximvbajjwbut`.
- Final development verification passed: `verify:migrations`, `verify:b2-dev`, `verify:release`, lint, and build.
- Development deployment remains live at `https://project-rui1d-development.vercel.app`.
- Mobile screenshots were regenerated as readable JPEG copies for Home, Clock, Timesheets, Chat, and Payroll tracker evidence.
- Advisor re-review status improved from blocked evidence to YELLOW review-candidate, but production deployment approval is still not granted.
- Main remaining review gaps are production-style RLS / rollback proof and fuller documented end-to-end payroll, chat/list, and break QA.
- QA report remains saved at `docs/qa/PAYROLL_CHAT_CLOCK_FINAL_QA_REPORT.md`.
- Production SQL bundle prepared for the new payroll/chat/clock migrations only: `PRODUCTION_SQL_BUNDLE_PAYROLL_CHAT_CLOCK.sql`.
- No production deployment, no production SQL run, and no push to main were performed in this final QA pass.
- Live dev browser QA now includes:
  - payroll tracker employee drill-down with current period, payment rows, loan rows, and balance-forward display
  - chat optimistic send with the composer remaining open after send
  - own-message delete confirmation and delete-to-`Message deleted` behavior
  - pinned list shortcut jumping from the ribbon to the underlying list card
  - list detail add-item, tap-to-edit, and completed-item visibility controls
- QA report updated with expected-vs-actual tables for payroll, chat/lists, RLS, timesheet breaks, cross-device clock, and production SQL review.
- Fresh readable viewport screenshots were captured for Clock, Timesheets, Payroll, and Chat after the earlier blank image artifacts were replaced.
- A single montage QA image was created so the refreshed evidence can be reviewed without the earlier blank screenshot problem.
- The latest Vercel preview deploy was restored by temporarily excluding `api/send-push.js` so the deployment stayed within the Hobby 12-function limit.
- The stable development alias was updated to the fresh preview deployment after the successful redeploy.
- The preview env mismatch was fixed by aligning the build to the dev Supabase project ref `jvlxahskximvbajjwbut`, which cleared the login/API-key blocker.
- The latest develop alias now loads the live Home dashboard instead of the environment guard page.
- Post-fix smoke QA confirmed Clock, Timesheets, Chat, and the Payroll tracker dialog all open correctly from the live develop alias.
- Advisor re-review returned GREEN for the develop release blocker state after the env/deploy fix.
- Current preview deployment ID for the green state: `dpl_6oLANCLWCbxmsfcZ1qMjTq4FXpZS`

- Development-only feature pass for special projects, manual contract tasks, payroll detail drill-down, timesheet filters, and sanity navigation was added on `develop`.
- Payroll now supports special project hourly rates and fixed manual contract pay in the dev release.
- Special Projects settings UI was added for manager/admin control of special rates.
- Manual contract task creation/editing was added in the Projects area for manager/admin use.
- Dev migration `20260704160000_add_special_projects_and_manual_contracts.sql` was linked to `bridge-app-dev` (`jvlxahskximvbajjwbut`) and pushed successfully.
- Post-migration browser smoke check on the development app confirmed Timesheets task filtering, Payroll detail drill-down/back navigation, and the main Home dashboard still loaded correctly.

## 2026-07-05 Development Chat Timeline + Cache QA

- Development-only chat timeline/cache stabilization was refreshed on `develop`.
- Chat timeline now keeps checklist cards and messages in one ascending chronological thread.
- New messages append at the bottom and pinned lists remain inside the thread while the pinned ribbon stays shortcut-only.
- Cached thread hydration now runs before quiet background sync so existing chat data opens without a blocking loading takeover.
- Optimistic message dedupe now prefers `client_id`, and optimistic checklist item merges now use a stable semantic merge key to prevent duplicate rows after sync.
- Checklist item edit/add flows were tightened for mobile: 16px inputs, placeholder-only title, stable numbering, tap-to-edit, icon-only delete, and focus restoration after add.
- QA report refreshed at `docs/qa/CHAT_QA_REPORT.md`.
- Final checks passed on develop: `verify:migrations`, `verify:b2-dev`, `verify:release`, `npm.cmd run lint`, and `npm.cmd run build`.
- Development deployment refreshed and aliased to `https://project-rui1d-development.vercel.app`.
- Preview deployment URL: `https://project-rui1d-27id2ua2d-samrental70-7859s-projects.vercel.app`
- Advisor review was attempted multiple times for the refreshed chat QA packet, but the `chatgpt-advisor` MCP transport closed before returning a verdict.
- No production deployment, no production SQL, no push to main, and no production DB changes were performed.

## 2026-07-06 Payroll Balance Calculation Fix + Previous Balance UI

- Development-only payroll balance audit completed in `src/EmployeeClockApp.jsx`.
- Payroll running balance now uses: Previous Balance + Worked Amount - Salary Paid - Loan Given + Loan Returned.
- Loan totals are now grouped by payroll period and included in both period math and employee summary math.
- Payroll UI now shows Previous Balance, Loans, and Balance more clearly in employee summary and period cards.
- Payment and loan cards remain tap-to-edit for admin/owner flows, with no visible Edit/Void buttons on the cards themselves.
- Added dev-only test helper `scripts/test-payroll-balance-calculation.js` to verify controller cases A-F plus running-balance handoff between periods.
- Verification passed on develop: `npm.cmd run verify:migrations`, `npm.cmd run verify:b2-dev`, `npm.cmd run verify:release`, `npm run lint`, `npm run build`, and `node scripts/test-payroll-balance-calculation.js`.
- No schema changes or new migrations were required for this fix.
- No production deployment, no production SQL, no push to main, and no production DB changes were performed.

## 2026-07-09 All-Areas Improvement Pass (Performance, Chat, Timesheets, API Auth)

- Local-first cache-first hydration was added to the Dashboard, Team, and Schedule loaders in `src/EmployeeClockApp.jsx`, matching the existing Timesheets/Chat/Payroll pattern: cached data renders immediately, the loading state only shows when no cache exists, and a background refresh rewrites the cache on success. Cached data is kept on fetch errors instead of being cleared.
- A Supabase realtime subscription was added for the open chat conversation (`chat_messages` postgres_changes) so incoming messages appear immediately; the existing 9-second silent polling remains as a fallback and behavior is unchanged if realtime is not enabled on the project.
- Timesheet standard date-range presets are now clamped so the range never extends into future dates (the weekly preset previously ran Monday through a future Sunday); the rolling one-month window behavior is preserved.
- API auth hardening: a shared `api-handlers/_verifyUserToken.js` helper now validates user JWTs with the anon/public Supabase client instead of the service-role client, per the standing rule. All ten user-authenticated handlers were switched over (assign-default-projects, create-employee, update-project, update-employee-profile, update-employee-login, project-media, create-project-task, ai-field-docs, chat, payroll-balance-reminder) plus `api/orpl/customers.js`. The service-role client is now used only for server-side DB reads/writes, with a safe fallback if no anon key env is configured.
- `.vercelignore` was extended so local analysis artifacts (portfolio render folders, tmp docx/pdf files, production DB report/SQL bundle files, `.codex/`) never upload with a deployment.
- Build code fallback bumped to `D20260709-allareas-dev` for phone-side version verification.
- Verification passed on develop: `verify:migrations` (15 files), `verify:b2-dev` (dev Supabase `...jjwbut`), `verify:release`, lint (0 errors), build, timesheet sanity, timesheet filter, receipt OCR, and payroll balance tests.
- Development deployment refreshed and aliased to `https://project-rui1d-development.vercel.app`.
- Preview deployment: `https://project-rui1d-pp7aqkw5l-samrental70-7859s-projects.vercel.app` (ID `dpl_5P67rRyqaa4AGqKabZMGqywBEDxD`), asset `assets/index-dEuJlg7y.js`, build code `D20260709-allareas-dev` confirmed in the served bundle.
- Post-deploy API smoke: `/api/chat` and `/api/project-media` return 401 without a token; unknown routes return 404 from the consolidated `api/[...path].js` router.
- Environment guard fix: the first deploy of this pass showed the "Supabase project mismatch / Missing Supabase public environment variables" guard page because the Vercel **Preview** environment had `VITE_SUPABASE_URL` but no `VITE_SUPABASE_ANON_KEY` (the key existed only in Production). The dev anon key (verified to decode to project ref `jvlxahskximvbajjwbut`, role `anon`) was added to the Preview environment as both `VITE_SUPABASE_ANON_KEY` and `SUPABASE_ANON_KEY` via the Vercel API, since branch-scoped `vercel env add` is unavailable without a connected Git repo.
- Redeployed and re-aliased: preview `https://project-rui1d-4q1xpmjpp-samrental70-7859s-projects.vercel.app`, asset `assets/index-D675tMjd.js`, build code `D20260709-allareas-dev`. Bundle verified to contain the dev Supabase URL and anon key, and no production ref. `/api/chat` still gates with 401.
- No production deployment, no production SQL, no push to main, no production DB changes, and no destructive operations were performed. Production env vars were not modified.

## 2026-07-10 Chat Redesign Round 2 + Production Merge Preparation

- Composer/list/keyboard follow-up fixes on develop: mobile keyboard no longer hides the chat-list item area (added a `useVisualViewportHeight` hook driving explicit inline heights on the immersive chat containers, replacing reliance on CSS `dvh` alone; also added `interactive-widget=resizes-content` to the viewport meta tag).
- Fixed a visible layout jump while typing in the chat composer: the auto-resize textarea logic was running in `useEffect` (post-paint) with a redundant duplicate call and a fixed-height pill wrapper that could not actually grow; switched to `useLayoutEffect`, removed the duplicate call, and changed the pill wrapper from a fixed `h-11` to `min-h-11` so multi-line messages grow the pill instead of clipping against it.
- Removed the non-functional video-call button and menu entry from the chat header (no video calling feature exists).
- Chat lists no longer render as large inline cards in the message thread; they now show as a compact horizontal ribbon of chips (icon, title, open-count) directly below the thread header, freeing the thread for messages only.
- Fixed a real duplicate-title bug on the Timesheets tab: the shared app shell header already renders "Timesheets" with back/notification navigation, but the Timesheets screen was also rendering its own large "Timesheets" heading directly underneath it. Removed the redundant inner heading block.
- Styled the shared `EmptyState` component, which had no CSS at all (raw unstyled `<p>` tags) despite being used across Chat, Timesheets, and other screens.
- Discovered and fixed a global CSS bug: `opera-hide-scrollbar`, used throughout the chat UI to hide scrollbars on horizontal chip rows and the message thread, was never actually defined anywhere in `index.css` — added the real implementation, fixing every usage at once.
- Fixed a cross-feature bug in chat: a single shared `sending` boolean was gating both the message-send flow and unrelated chat-list actions (add/edit/reparent/assign item, create list), so sending a message could silently block list actions with no error shown. Split into independent `sending` and `listBusy` state.
- An independent Chrome-based reviewer agent (once the extension reconnected) tested the redesigned chat live end-to-end — sent a real message, added a real checklist item — and confirmed the redesign reads as professional/enterprise rather than a consumer chat clone; it also caught a genuine desktop-only layout bug (chat's `md:` two-pane breakpoint fired based on real browser width even though the whole app shell is capped at a 384px phone-frame at all viewport sizes, causing severe overflow/clipping on desktop). Fixed by making chat consistently single-pane like every other screen in the app, matching the existing design.
- Verification passed on develop: `verify:migrations` (15 files, ORPL correctly excluded), lint (0 errors), build, timesheet sanity, receipt OCR tests.
- Development deployment refreshed and aliased to `https://project-rui1d-development.vercel.app` across several redeploys through this pass.
- Consulted Codex (read-only) for production merge context: `main` is at `0a84637` and is exactly 5 commits / 0a846375e484c71d68ef7edd6b53c2142d4cb380 behind `develop` (clean fast-forward, no divergence), 69 files / +22,283 -3,761 lines different. No repo-defined CI/CD exists; Vercel's Git integration (external dashboard config) controls whether pushing `main` auto-deploys production.
- Took a full read-only production database backup (`backups/production/OPERA_PROD_BACKUP_2026-07-10T13-46-05-621Z.json`, 26 tables, SHA256 recorded in `PRODUCTION_DB_BACKUP_2026-07-10T13-46-05-621Z_REPORT.md`).
- Cross-referenced migration history against prior execution reports and live column presence in the fresh backup: confirmed 22 of 25 Clock App migrations are already applied to production; exactly 3 are outstanding (`20260704160000_add_special_projects_and_manual_contracts.sql`, `20260707103000_add_chat_list_hierarchy.sql`, `20260707143000_add_chat_list_assignments.sql`), all verified additive-only. Prepared (not executed) `PRODUCTION_SQL_BUNDLE_2026-07-10_MERGE_PREP.sql` containing just those three. `20260707120000_create_orpl_customer_portal.sql` was explicitly excluded (separate product; the repo's own migration-safety script already excludes it too).
- Wrote a full rollback plan (app-level via Vercel deployment promotion, git-level via clean fast-forward revert, DB-level via the backup file) in `PRODUCTION_MERGE_READINESS_2026-07-10.md`.
- No production deployment, no production SQL executed, no push to main, no production DB or Storage modified, and no commit was made to develop in this pass — all working-tree changes remain uncommitted pending review, per instruction to prepare only.

## 2026-07-10 (continued) Full Production Merge Preparation Completed

- Reviewed the entire uncommitted working tree file-by-file and committed the legitimate Clock App changes to develop as commit `b9fe8dc` (98 files, +11,293/-2,201). Deliberately excluded from the commit: all `.env*` files, ORPL Customer Portal files, QuickBooks MCP files, and unrelated portfolio/render project debris sitting in the same working directory that is not Clock App product code.
- Re-ran `verify:release` and `verify:b2-dev` against the committed state: migration safety, lint, build, timesheet sanity, receipt OCR, and dev DB readiness all passed.
- Root-caused the earlier "invalid API key" finding: it was never a rotation. `.env.production.local` had the correct production URL but its service-role key actually decoded (via JWT `ref` claim) to the development project, not production — a file miswiring from an earlier session. Asked Codex to search all `.env*` files for one with a correctly-scoped production service-role key; it found `.env.local`. Independently re-verified the JWT claim and tested it live (200 OK) before trusting it, then corrected `.env.production.local` to use the right key. Re-verified end-to-end afterward.
- Ran a live read-only precheck against production with the corrected key: all 25 tracked tables' row counts match this morning's backup exactly (no drift since the backup), and all 3 previously-identified outstanding migrations were directly re-confirmed still outstanding (target columns genuinely absent). `PRODUCTION_SQL_BUNDLE_2026-07-10_MERGE_PREP.sql` remains accurate.
- Confirmed via the Vercel CLI that `project-rui1d` has no connected Git repository, so pushing `main` will not auto-trigger a production deployment — deploy is always a separate explicit `vercel deploy --prod` step.
- Status: all preparation is complete. Still no production SQL executed, no push to main, no production deployment — holding for explicit final approval before those three remaining steps, per instruction.
