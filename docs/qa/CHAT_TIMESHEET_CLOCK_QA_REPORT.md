# OPERA.AI Chat + Timesheet + Clock QA Report

Date: 2026-07-01
Branch: develop
Environment: development only

## Scope

This report covers:

- WhatsApp-style OPERA chat UI QA
- Pinned Apple Reminders-style chat lists
- Timesheet break fields, edit path, and calculation wiring
- Cross-device clock session source-of-truth wiring

## Implementation Status

### Chat Lists

Implemented:
- New `chat_lists` table.
- New `chat_list_items` table.
- RLS policies scoped by company and active conversation membership.
- Create list from chat composer list icon.
- Pinned list cards at top of chat thread.
- List detail modal.
- Add/edit/delete/check/uncheck items.
- Archive list for creator or manager roles.
- Stable numbering using max item number + 1; deleted items do not cause renumbering.

Verified:
- List creation works in development.
- List appears pinned in the thread.
- Item edit works.
- Item add works.
- Check state persists after refresh.
- Delete item #2 through development API leaves item numbers `[1, 3, 4]`.

### Chat Management

Existing/retained:
- Group create endpoint/UI path.
- Direct chat endpoint/UI path.
- Own/admin message delete path.
- Chat pin path.
- Leave group path.
- Admin remove member path.
- Archive conversation path.
- Photo attachment path.

Needs more QA:
- Destructive browser flows need retest because the automation session got stuck on a confirm dialog.
- Role matrix needs authenticated member/non-member/supervisor/admin/cross-company tests.

### Timesheet Breaks

Implemented:
- `timesheets.break_start_at`.
- `timesheets.break_end_at`.
- `timesheets.break_minutes`.
- `timesheets.break_note`.
- Matching requested break fields on `timesheet_change_requests`.
- Timesheet cards show Break start, Break stop, Break total when present.
- Edit form includes break start/stop date/time.
- Validation enforces complete break start/stop, break end after start, and break inside shift.
- Break minutes are excluded from worked time/labour/report calculations.
- Auto-clockout and daily report calculations account for breaks.
- Employee timesheet edit approval carries break changes.

Verified:
- Migration applied on development DB.
- `verify:b2-dev` confirms break columns are readable.
- `test:timesheet-sanity` passes.
- Code paths use `breakMinutesBetween` / `workedMinutesWithBreaks`.

Needs more QA:
- Actual break-record screenshot.
- Admin edit with break values.
- Employee change request approval/rejection with break values.
- Reports output with break-adjusted totals.
- Overnight/DST/boundary edge cases.

### Cross-Device Clock Session

Implemented/verified by code review:
- Active timesheets are mapped from Supabase rows into current shift state.
- Reload/login hydration uses DB row values.
- Clock out updates the same Supabase timesheet row.
- Task changes and break state persist to the active row.
- Optional-column fallback protects older schemas.

Needs more QA:
- Manual two-device test: clock in on device A, login on device B, verify timer and same row, clock out from device B, refresh device A.
- Race-condition hardening for duplicate active shifts should be reviewed before production.

## Verification

- `npm.cmd run verify:migrations`: pass.
- `npm.cmd run verify:b2-dev`: pass.
- `npm.cmd run lint`: pass with existing warnings only.
- `npm.cmd run build`: pass.
- `npm.cmd run verify:release`: pass after the checkbox patch.

## Development Deployment

Development deployment completed and aliased:

https://project-rui1d-development.vercel.app

No production deployment was run.

## Advisor Result

Advisor review completed. Final decision: blocked for production promotion until remaining QA gaps are closed.

Key blockers:
- Browser/mobile destructive chat flows.
- Authenticated RLS/role matrix.
- Actual break-record QA.
- Cross-device manual QA.
- Duplicate active shift race protection review.

## Production Readiness

Development implementation is deployed and build-verified. Production promotion is not recommended until the remaining QA blockers above are closed.

## Chat List UX Fixes

Implemented on develop:

- Title input now uses a mobile-safe 16px font size to avoid zooming.
- New list title field uses placeholder-only text: `List name`.
- Add-item flow is optimistic and the item appears immediately.
- Item input keeps focus after add so the keyboard stays open.
- Mark-done flow updates immediately in the UI.
- Completed items are hidden by default.
- Eye toggle added at the top of the list to show or hide completed items.
- Tapping the item text enters edit mode.
- Separate visible edit/delete row was removed from every item card.
- Item numbering remains stable because completed rows are filtered, not renumbered.

Deployment:

- Development alias refreshed to `https://project-rui1d-development.vercel.app`
- Verified via bundle string check that `List name`, `Hide completed`, and `Show completed` are present in the deployed build.

Screenshot QA:

- Browser screenshot capture was attempted for the list/chat flow, but the browser automation session was interrupted and became unstable before the capture could complete.
- Screenshot review remains the next manual QA step if the browser session is re-run.

Advisor review:

- Advisor reviewed the implementation notes and said the list UX is directionally production-safe.
- Advisor marked the work as needing changes/verification before a production-ready signoff because screenshots and real phone interaction are still unverified.
- Advisor specifically called out mobile screenshot proof, optimistic failure handling, completed-item toggle behavior, and tap-target validation as the remaining checks.

## Chat List Placement + Pin Behavior Follow-Up

Implemented on develop:

- Chat lists now render as inline cards inside the chat thread instead of only appearing as a top sliding modal.
- The pinned ribbon is now pinned-shortcut only and no longer acts like the main editing surface.
- Tapping a pinned shortcut scrolls to the matching list card in the chat thread.
- Editing still happens from the thread card.
- The list card keeps the mobile-safe title field, placeholder-only title, optimistic add, open keyboard, optimistic done toggle, stable numbering, and hidden-completed default behavior.

Verification:

- `npm.cmd run verify:release`: pass.
- Development deployment refreshed and aliased to `https://project-rui1d-development.vercel.app`.
- Preview deployment URL: `https://project-rui1d-iul14iqnm-samrental70-7859s-projects.vercel.app`.

Screenshot QA:

- Browser runtime reconnect was interrupted before a fresh screenshot pass could be completed.
- A clean mobile screenshot review is still recommended, but the code and dev deployment have been updated for the new inline-card placement.


Chat/List WhatsApp-style UX refinement:
- Company name now shows only on Home; non-Home pages use a compact user-only header.
- Chat pinned list shortcuts were reduced in height/width to feel more compact on mobile.
- Tapping a list card now opens a full-page list detail view with a back arrow.
- Editing happens from the list card/detail view instead of a separate edit line.
- Delete actions were changed from visible text buttons to compact minus/icon controls.
- Chat sending now uses an optimistic local append and keeps the composer focused/open after send.
- Mobile composer/list-item keyboard behavior still needs a real phone screenshot pass for final UI sign-off.
- verify:release passed after the refactor.
- Development deployment was refreshed and aliased to https://project-rui1d-development.vercel.app.
- Advisor re-review: the mobile structure is aligned; remaining recommendation is manual phone/screenshot QA.
