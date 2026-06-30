# B.2 Phase 2 - WhatsApp Business Daily Timesheet Reports

## Goal
Prepare OPERA.AI to send concise Manager/Admin daily timesheet summaries through the official WhatsApp Business Platform / Cloud API.

This is not WhatsApp Web automation. Personal WhatsApp scraping or browser automation must not be used.

## Required Environment Variables
Prepare these in Vercel when Controller approves real WhatsApp setup. Do not commit real values.

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_DAILY_REPORT_TEMPLATE_NAME`
- `WHATSAPP_DAILY_REPORT_TEMPLATE_LANGUAGE`
- `WHATSAPP_SEND_ENABLED`

`WHATSAPP_SEND_ENABLED` must stay unset or false until Controller approves real test sends.

## Backend Route
Route added:

- `api/send-daily-timesheet-whatsapp.js`

Route behavior:

- Requires authenticated Supabase bearer token.
- Verifies requester is owner/admin/supervisor for the requested company.
- Generates the daily timesheet summary server-side from `timesheets`.
- Scopes all queries by `company_id`.
- Returns preview/dry-run JSON if WhatsApp is not configured or sending is disabled.
- Uses backend-only WhatsApp token if real sending is explicitly enabled.
- Never returns the WhatsApp access token.

## Report Content
The WhatsApp body is intentionally concise:

- company name
- report date
- employees worked
- entries
- total hours
- labour cost
- missing clock-out issue count
- top project/task summaries
- app link

Full private timesheet tables should not be sent by WhatsApp unless a separate Controller-approved setting exists.

## Template Strategy
Suggested Meta template:

- Name: `daily_timesheet_report`
- Category: Utility
- Language: `en`

Template body idea:

`Daily Timesheet Report for {{1}} on {{2}}. Employees worked: {{3}}, total hours: {{4}}, labour cost: {{5}}. Open app: {{6}}`

Template parameters:

1. Company name
2. Report date
3. Employees worked
4. Total hours
5. Labour cost
6. App URL

Meta template approval may be required before production sending, especially for business-initiated daily notifications outside the service window.

## UI
Manager/Admin Reports now includes:

- WhatsApp Business Reports card
- manager/admin phone number field
- preview button
- disabled Send WhatsApp Test button unless backend configuration and approval are present
- exact message preview
- missing configuration warning

Employee role must not see Reports or WhatsApp report controls.

## Scheduling Strategy
Do not blindly start cron sending.

Approved options:

1. Manual preview/send test from Reports.
2. Future daily cron route after Controller approval.
3. External scheduler after Controller approval.

Current build uses manual preview only unless `WHATSAPP_SEND_ENABLED=true` is configured server-side.

## Advisor Status
Sanitized advisor review was attempted, but the shared advisor setup could not produce a review. Local review continued with the same privacy rules.

## QA Checklist
- WhatsApp tokens are backend-only.
- No WhatsApp token is exposed to frontend or logs.
- No real WhatsApp message is sent unless Controller approves and server env enables sending.
- Employee cannot access WhatsApp report controls.
- Manager/Admin authorization is checked in backend route.
- Report data is scoped by `company_id`.
- Missing env returns a clean preview warning.
- Template requirement is documented.
- Development build passes.
- Development deployment updates only.
