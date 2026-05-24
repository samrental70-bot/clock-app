# OPERA.AI B.1 Release Mobile QA Checklist

Development app: https://project-rui1d-development.vercel.app

Production app must remain untouched during this QA pass.

## QA Setup
- [ ] Test on mobile Safari or installed PWA.
- [ ] Test on mobile Chrome where available.
- [ ] Confirm the app title shows OPERA.AI Development.
- [ ] Confirm test users are using the correct company.
- [ ] Confirm no production deployment is performed during QA.

## A. Owner/Admin
- [ ] Owner/Admin can log in.
- [ ] Dashboard opens after login.
- [ ] Header shows company name clearly.
- [ ] Header shows current date.
- [ ] Header shows logged-in user.
- [ ] Notification bell is visible.
- [ ] Notification bell opens notifications.
- [ ] Refresh button is visible and compact.
- [ ] Refresh button reloads dashboard data safely.
- [ ] Dashboard shortcut order is Schedule, Pictures, Receipts, Employees.
- [ ] Schedule shortcut opens Schedule.
- [ ] Pictures shortcut opens Pictures.
- [ ] Receipts shortcut opens Receipts.
- [ ] Employees shortcut opens Employees.
- [ ] Bottom nav shows Activities, Clock, More.
- [ ] Activities opens dashboard/activity view.
- [ ] Clock opens clock screen.
- [ ] More opens left menu.
- [ ] Left menu navigation works.
- [ ] Settings opens correctly.
- [ ] Settings toggles are visible for allowed admin controls.
- [ ] Employees screen opens.
- [ ] Manager can clock in an employee from Employees screen.
- [ ] Manager can clock out an employee from Employees screen.
- [ ] Manager clock-in does not create duplicate active shifts.
- [ ] Projects and tasks are visible according to company settings.
- [ ] Timesheet employee filter works.
- [ ] Timesheet project filter works.
- [ ] Timesheet date range works.
- [ ] Timesheet Share Report respects active filters.
- [ ] Pictures project filter works.
- [ ] Pictures employee filter works.
- [ ] Pictures date range filter works.
- [ ] Pictures gallery opens media.
- [ ] Reports remain accessible from left menu.

## B. Supervisor
- [ ] Supervisor can log in.
- [ ] Supervisor dashboard opens.
- [ ] Active Team view loads.
- [ ] Active Team shows Working for active shifts.
- [ ] Active Team live hours increase while employee is clocked in.
- [ ] Active Team live cost increases when hourly rate exists.
- [ ] Schedule opens and supervisor can view tasks.
- [ ] Pictures opens and filters work.
- [ ] Receipts opens and records display.
- [ ] Employees view opens for supervisor.
- [ ] Project visibility respects company settings and supervisor role.
- [ ] Task visibility respects company settings and supervisor role.
- [ ] Timesheet employee filter works.
- [ ] Timesheet project filter works.
- [ ] Timesheet Share Report respects filters.
- [ ] Supervisor cannot access owner-only controls if restricted.

## C. Employee
- [ ] Employee can log in.
- [ ] Employee starts on Clock screen.
- [ ] Clock screen layout is readable on mobile.
- [ ] Project selection is required before clock-in if configured.
- [ ] Task selection works.
- [ ] Location prompt appears only when needed during clock-in.
- [ ] Location prompt does not repeat when permission is already granted.
- [ ] Employee can clock in.
- [ ] Employee clock-in captures location if required.
- [ ] Camera button opens in-app camera.
- [ ] Employee can upload photo.
- [ ] Receipt button opens receipt capture.
- [ ] Employee can upload receipt.
- [ ] Task List opens for selected project.
- [ ] Material List opens for selected project.
- [ ] Employee can clock out.
- [ ] Mandatory clock-out photo flow still works if required.
- [ ] Employee sees only own timesheet records.
- [ ] Employee sees own uploaded pictures.
- [ ] Employee cannot access admin controls.
- [ ] Employee cannot clock in/out other employees.

## D. Core Regression
- [ ] React error #310 does not return.
- [ ] Active Team shows Working for current active shifts.
- [ ] Missing clock out appears only for old/incomplete records where appropriate.
- [ ] Worked Today excludes active shifts.
- [ ] Worked Today includes completed same-day shifts.
- [ ] Worked Today total time is correct.
- [ ] Worked Today total cost is correct.
- [ ] Auto clock-out default is 12:00 AM.
- [ ] Activities feed loads clock events.
- [ ] Activities feed loads upload events where available.
- [ ] Schedule still opens.
- [ ] Pictures still opens.
- [ ] Receipts still opens.
- [ ] Timesheets still open.
- [ ] Reports remain accessible.
- [ ] No white screen on mobile.
- [ ] No horizontal overflow on core screens.
- [ ] No blocked bottom buttons on mobile.
- [ ] No SQL was run during QA prep.
- [ ] No push to main was performed.
- [ ] No production deployment was performed.
