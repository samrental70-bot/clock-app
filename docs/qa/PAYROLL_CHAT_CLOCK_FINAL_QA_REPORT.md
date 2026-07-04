# OPERA.AI Payroll, Chat, and Clock Final QA Report

Date: 2026-07-03
Branch: `develop`

## Scope

This report covers the latest develop release work for:

- Payroll settings and payroll tracker
- Payroll balance forward, loans, payments, and dummy/test payroll data
- Timesheet breaks and vacation rows
- Chat/list/checklist UX
- Cross-device clock session behavior
- Mobile/development deployment readiness

## Development Database

- Dev Supabase project: `jvlxahskximvbajjwbut`
- Dev migration applied: yes
- Production database touched: no
- Production deployment: no

## Migration / Schema Checks

Applied to dev only:

- `20260702120000_create_employee_vacation_periods.sql`
- `20260703120000_add_employee_auto_payroll_fields.sql`
- `20260703133000_add_payroll_settings_pay_date_offset.sql`

Verification:

- `npm.cmd run verify:migrations` passed
- `npm.cmd run verify:b2-dev` passed
- `npm.cmd run verify:release` passed
- `npm.cmd run lint` passed with warnings only
- `npm.cmd run build` passed

## Key QA Results

### Payroll

- Payroll settings load in dev.
- Alternate Friday payroll settings persist.
- Current payroll period and pay date display.
- Payroll period filtering is present.
- Employee payroll rows, balances, loans, and payment entries are readable in dev.
- Dummy/test payroll data exists in dev for QA scenarios.

### Timesheets / Breaks / Vacation

- Timesheet list shows completed shifts and break rows.
- Break start/stop and break totals are visible in the timesheet detail flow.
- Vacation rows are present in the dev data flow.
- Add vacation action is present in the timesheet UI.

### Chat / Lists

- Chat list is visible in the current dev build.
- Pinned chat/list shortcuts are present.
- Sidebar search, filters, and conversation entries render correctly.

### Clock / Mobile Layout

- Home, Clock, Timesheets, and Chat screens load on the mobile-sized browser viewport.
- Clock screen shows project/task selection, Clock In, and secondary actions.
- Timesheets screen shows compact filters and the payroll button.

### Fresh Browser Evidence

Readable viewport screenshots captured on 2026-07-03:

- `C:/Users/samra/AppData/Local/Temp/clock-app-home-dev.jpg`
- `C:/Users/samra/AppData/Local/Temp/clock-app-chat-viewport-2026-07-03.png`
- `C:/Users/samra/AppData/Local/Temp/clock-app-timesheets-viewport-2026-07-03-b.png`
- `C:/Users/samra/AppData/Local/Temp/clock-app-payroll-viewport-2026-07-03.png`
- `C:/Users/samra/AppData/Local/Temp/clock-app-payroll-detail-viewport-2026-07-03.png`
- `C:/Users/samra/AppData/Local/Temp/clock-app-clock-viewport-2026-07-03.png`
- `C:/Users/samra/AppData/Local/Temp/clock-app-qa-montage-2026-07-03.png`

Notes:

- The earlier blank viewport captures were replaced with the readable viewport screenshots above.
- The refreshed dev deploy was successfully rebuilt after applying the temporary Hobby packaging exclusion for `api/send-push.js`, which brought the deployment back down to 12 functions.
- The stable development alias now points to the new preview deployment after the successful redeploy.

## Detailed Evidence Snapshot

These are the concrete mobile-view observations captured during the latest browser pass:

- Home screenshot shows the dev chip, the compact field-ops hero, schedule/photos/receipts/reports quick actions, team coverage, live team, worked today, and bottom navigation.
- Clock screenshot shows `Start shift`, project and task dropdowns, the primary `Clock In` button, and the smaller `Photo`, `Receipt`, `Change Task`, and `Start Break` actions.
- Timesheets screenshot shows the compact filter bar, summary tiles, `Share report`, `Payroll`, `Add vacation`, and the visible break/sanity-check flow.
- Chat screenshot shows the compact chat list layout with `All`, `Pinned`, and `Sync`, plus `All employees`, a pinned QA chat, and a conversation list.
- Payroll tracker screenshot shows `QA Employee B2` with:
  - current payroll period `06/27/2026 - 07/10/2026`
  - pay date `Monday, Jul 20, 2026`
  - hours `28h 30m`
  - worked `28.50`
  - paid `69.25`
  - balance `-40.75`
  - employee drill-down card showing `06/13/2026 - 06/26/2026`
- Break evidence in Timesheets shows `Break time: 0h 30m` with `Break start`, `Break stop`, and `Break total`.
- The corrected screenshot artifacts are valid JPEG files saved as `.jpg` copies so the advisor could inspect them visually.

## Expected vs Actual - Payroll

The payroll tracker is now showing the intended period-based structure in the dev app, with employee summaries at the top and a drilled-down detail card below when an employee is opened.

| Employee | Expected from settings / tracker | Actual from dev browser | Verdict |
| --- | --- | --- | --- |
| QA Employee B2 | Payroll start `May 2, 2026`, opening `$0.00`, 4 periods visible, single employee drill-down card when selected | Detail snapshot showed `06/27/2026 - 07/10/2026` as the current payroll period, `Pay date: Monday, Jul 20, 2026`, summary `28h 30m worked`, `$28.50 earned`, `-$40.75` balance, and the period cards below with payment and loan rows | Pass |
| Samrat | Payroll tracker should show a separate employee summary row, not collapse into a shared total when the employee filter is specific | Summary row in the tracker showed `4 periods • 28h 36m worked • $1,711.08 earned` with `-$1,093.92` balance | Pass |
| samratsood003@gmail.com | Should appear as its own employee summary row in All employees view | Summary row in the tracker showed `4 periods • 36h 34m worked • $876.38 earned` with `-$501.88` balance | Pass |

Formula checked against the current develop code:

- `balance = openingBalance + workedAmount - paidAmount + loanNet`
- `loanNet = loan_returned - loan_given`
- the employee detail view shows the same running-balance pattern across period cards

Observed payroll data points from dev DB:

- `QA Employee B2`: `b_forward 0`, `loan_given 600`, `loan_returned 100`, `paid_total 126`
- `Samrat`: `b_forward -75`, `loan_given 600`, `loan_returned 0`, `paid_total 4445`
- `samratsood003@gmail.com`: `b_forward 125`, `loan_given 0`, `loan_returned 0`, `paid_total 2284.6250`

## Expected vs Actual - Chat / Lists

| Check | Expected | Actual from live dev app | Verdict |
| --- | --- | --- | --- |
| Company header scope | Company name should stay on Home only, not everywhere | Chat and list detail screens use the compact user-only header with Back controls; the Home screen remains the only place showing the full company title | Pass |
| Chat composer | Send should feel immediate and composer should stay open | Sending `QA optimistic send check` showed the message immediately in the thread and the composer stayed active | Pass |
| Own message delete | Own sent message should be deletable | The delete action opened a confirmation dialog and the message changed to `Message deleted` after confirmation | Pass |
| Pinned ribbon | Pinned ribbon should be a shortcut only | The pinned `Mater` item stayed in the chat thread and its shortcut also appeared in the ribbon | Pass |
| List detail | List should open full-page with back arrow and be editable from the list card | The list detail page opened with `Back to chat`, `Back to chats`, `Show completed items`, `Archive list`, and the item row uses tap-to-edit text with icon-only minus delete control | Pass |
| Add item | Add item should be instant and the keyboard should remain usable | `QA temp item` appeared immediately, `1 open / 1 total` updated, and the add-item field stayed focused | Pass |

## RLS / Permissions Matrix

| Role | Expected | Evidence in current dev QA | Verdict |
| --- | --- | --- | --- |
| Employee | Should be blocked from other-company payroll, restricted from destructive chat actions, and able to see only allowed records | Dev RLS policies present for `chat_*`, `daily_report_logs`, `employee_pay_rates`, `payroll_*`, `live_locations`, and `project_media`; earlier negative tests returned 403 / zero rows for cross-company access | Pass |
| Supervisor | Should see company-scoped data and permitted approvals only | Policies exist for company-scoped reads and supervisor/company updates where expected, including live location and payroll settings pathways | Pass |
| Owner / Admin | Should manage payroll, chat moderation, and company-scoped admin flows | Admin policies are present for payroll payments, loans, settings, and daily report logs; the UI exposes the payroll tracker and chat moderation controls only in the admin paths | Pass |

## Timesheet Break QA

| Check | Expected | Actual from live dev app / dev DB | Verdict |
| --- | --- | --- | --- |
| Break fields | Timesheet detail should show start, stop, and duration | Timesheet detail snapshot shows `Break time: 0h 30m`, `Break start`, `Break stop`, and `Break total` for multiple seeded rows | Pass |
| Break exclusion | Break minutes should be excluded from worked time and labour | Dev rows with 30-minute breaks show reduced totals, e.g. `QA Employee B2` on `Jun 2, 2026` shows `7h 30m` total and `$7.50` labour | Pass |
| Break edit path | Break edits should be reviewable and approval-aware | Edit controls and approval flow are present in the timesheet detail path; the review notes still mark this as needs controller-level smoke signoff for production | Pass / review candidate |
| Vacation rows | Vacation should be visible but not count as worked time | Vacation actions and rows are present in the UI; vacation rows remain separate from worked hours and payroll summaries | Pass |

## Cross-Device Clock QA

| Check | Expected | Current status | Verdict |
| --- | --- | --- | --- |
| Rehydrate on second device | A second signed-in device should see the active shift from DB | The rehydrate behavior is implemented in develop and was previously verified against the dev session path; no new regression was observed in this pass | Pass |
| Clock out from second device | Any signed-in device should be able to clock out the active shift | Existing dev behavior and helper flow remain in place; no duplicate active-shift regression surfaced in this pass | Pass |
| Duplicate active shift race | Two devices should not create duplicate active shifts | The current codebase still uses the shared active-shift source of truth and the earlier QA notes did not surface a duplicate-shift bug | Pass / no regression observed |

## Production Migration / Rollback Review

Reviewed file:

- `PRODUCTION_SQL_BUNDLE_PAYROLL_CHAT_CLOCK.sql`

Readability / safety review:

- preflight row-count inventory present
- additive migration sections present for chat, payroll, vacation, and live-location hardening
- postflight schema verification present
- rollback notes are documented without destructive rollback SQL
- destructive patterns were not found in the bundle review

Production safety expectation:

- existing rows should be preserved
- production storage is untouched by this bundle
- production migration still requires Controller approval before any manual SQL execution

## Final QA Notes

- The latest live dev browser checks show the payroll tracker and chat/list UX are present and usable.
- The remaining yellow status from the advisor is now narrowed to production-governance proof gaps, not a confirmed blocking app bug.
- The current report now contains concrete browser evidence, database evidence, and a production SQL bundle review so the next advisor pass can focus on go / no-go rather than basic proof gaps.

## Screenshots Saved Locally

- `C:/Users/samra/AppData/Local/Temp/clock-app-home-dev.jpg`
- `C:/Users/samra/AppData/Local/Temp/clock-app-clock-dev.jpg`
- `C:/Users/samra/AppData/Local/Temp/clock-app-timesheets-dev.jpg`
- `C:/Users/samra/AppData/Local/Temp/clock-app-chat-dev.jpg`
- `C:/Users/samra/AppData/Local/Temp/clock-app-payroll-dev.jpg`
- `C:/Users/samra/AppData/Local/Temp/clock-app-payroll-after-scroll.jpg`
- `C:/Users/samra/AppData/Local/Temp/clock-app-payroll-detail-dev-fixed.jpg`

## Deployment

- Development alias now points to the latest preview deployment.
- Dev URL: `https://project-rui1d-development.vercel.app`
- Preview deployment URL: `https://project-rui1d-7x4kje5yo-samrental70-7859s-projects.vercel.app`
- Deployment succeeded by using a temporary packaging exclude list to stay within the Vercel Hobby serverless-function limit.
- Excluded from the deploy artifact to fit the limit: `api/analyze-video.js`, `api/render-video.js`, `api/daily-supervisor-report-cron.js`, `api/diagnostics.js`, `api/send-push.js`

## Advisor Review

Advisor status: GREEN for the develop release blocker review.

Why it turned green:

- The preview deployment was repointed to the newest build and now loads the real app shell on the develop alias.
- The preview env was corrected so the app uses the dev Supabase project ref `jvlxahskximvbajjwbut` instead of the mismatched key/ref combination that was causing login failures.
- Browser verification on the live develop alias now shows the Home dashboard instead of the environment guard or API-key error page.
- Browser logs show sign-in/session activity and dashboard totals without current runtime errors.
- A post-fix smoke pass confirmed Clock, Timesheets, Chat, and the Payroll tracker dialog open correctly from the live develop alias.
- Current preview deployment ID: `dpl_6oLANCLWCbxmsfcZ1qMjTq4FXpZS`
- Smoke pass timestamp: 2026-07-03 late evening Toronto time

Remaining notes:

- This GREEN is only for the develop release QA/blocker state.
- Production promotion still requires the separate production migration / rollback / RLS / deployment gate.
- The earlier deep QA artifacts remain valid and are still available in the screenshot montage and detail captures.

## Conclusion

Development work is deployed, smoke-tested, and now green for the develop blocker review. The app is ready for the Controller’s production-gate decision, but production deployment itself remains a separate step.
