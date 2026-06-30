# B.2-fix-6 Daily Report Email + 12 PM Scheduler

## Scope

This fix adds the backend foundation for daily supervisor reports by email and WhatsApp Business, plus a disabled-safe 12 PM company-local scheduler foundation.

No SQL was run by Codex. No real email or WhatsApp sends should happen unless the deployment is explicitly configured and approved.

## Shared Report Generator

Daily report aggregation is centralized in:

- `api/_lib/dailyReport.js`

It builds a company-scoped report for one date and formats:

- plain text email
- HTML email
- WhatsApp text preview

Report content includes completed hours, live active hours, labour cost, missing clock-outs, receipts/media counts, and schedule response counts where available.

## Email / Gmail Route

Route:

- `api/send-daily-timesheet-email.js`

Backend-only env variables:

- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- `GMAIL_SENDER_EMAIL`
- `GMAIL_SEND_ENABLED`

Safety behavior:

- Manager/Admin authorization is required.
- `company_id` is required and used for report scope.
- Preview mode works without Gmail config.
- Real sending is blocked unless `GMAIL_SEND_ENABLED=true`.
- Gmail tokens are never exposed to the frontend.
- Missing config returns a safe dry-run response.

## WhatsApp Route

Route:

- `api/send-daily-timesheet-whatsapp.js`

The route now uses the shared daily report generator where safe.

Backend-only env variables:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_DAILY_REPORT_TEMPLATE_NAME`
- `WHATSAPP_DAILY_REPORT_TEMPLATE_LANGUAGE`
- `WHATSAPP_SEND_ENABLED`

Safety behavior:

- Manager/Admin authorization is required.
- Preview mode works without WhatsApp config.
- Real sending is blocked unless `WHATSAPP_SEND_ENABLED=true`.
- Meta template approval and recipient consent are required before production use.

## Scheduler Delivery Route

Standalone source route:

- `api/daily-supervisor-report-cron.js`

Deployed Vercel Hobby trigger:

- `api/auto-clockout.js`
- `api/_lib/dailyReportScheduler.js`

The scheduler route is prepared for production-style delivery but remains locked behind environment gates. The route itself is disabled unless:

- `DAILY_REPORT_CRON_ENABLED=true`

When enabled, the route also requires:

- `CRON_SECRET`
- `DAILY_REPORT_TIME` (default `12:00`)
- `DEFAULT_COMPANY_TIMEZONE` (default `America/Toronto`)
- `DAILY_REPORT_CRON_EMAIL_RECIPIENTS` and/or `DAILY_REPORT_CRON_WHATSAPP_RECIPIENTS`
- `GMAIL_SEND_ENABLED=true` and valid Gmail provider credentials for email sends
- `WHATSAPP_SEND_ENABLED=true`, valid WhatsApp Cloud API credentials, and an approved template for WhatsApp sends

The route now checks company-local 12 PM windows and can send through the approved email/WhatsApp provider paths when every gate is open. If any gate is closed, it returns safe dry-run planning details and sends nothing.

Manual QA can call the route with `dryRun=true` to prove aggregation and routing without sending external messages. Manual QA can call `force=true` with a valid cron secret to test the scheduler path outside the exact company-local report minute.

`vercel.json` includes a daily cron entry for `/api/auto-clockout` at `0 16 * * *`, which lines up with 12 PM Toronto during daylight time. Vercel Hobby does not allow more frequent cron checks or more than 12 serverless functions, so the daily report scheduler runs as a shared library from the existing auto-clockout function in development deployments. The source-only `/api/daily-supervisor-report-cron` route is kept for future Pro/backend separation but is excluded from Vercel Hobby deploys. The route itself still verifies the configured company-local report time before sending. Production activation still requires production env approval, and standard-time/DST behavior should be revisited before production enablement.

QA-only manual trigger:

- `GET /api/auto-clockout?daily_report_only=true&force=true&dryRun=true`
- Requires `Authorization: Bearer <CRON_SECRET>`
- Skips auto-clockout work and exercises only the daily report scheduler path.

## Duplicate-Send Protection

Prepared SQL:

- `supabase/migrations/20260611120000_create_daily_report_logs.sql`

This table adds a unique key on:

- company
- report date
- channel
- recipient

The migration must be reviewed and applied before real scheduled sends are enabled. If the table is missing, the send routes return a safe warning and do not send.

## Reports UI

Manager/Admin Reports now includes:

- email recipient input
- backend email preview button
- gated Send Email Test button
- Gmail config/status note
- WhatsApp preview/test controls preserved
- 12 PM scheduler safety/status note

Employee role must not see Reports or daily report controls.

## Advisor Review

Sanitized advisor review was completed. No code, schema, secrets, employee data, payroll data, email addresses, phone numbers, or internal files were sent.

Advisor final decision: `needs_changes` for real scheduled sends.

Required before enabling real sends:

- apply and test duplicate-send migration
- verify Manager/Admin authorization and employee blocking
- verify tenant isolation across companies
- verify recipient opt-in and configuration
- verify dry-run parity
- verify audit logging
- verify WhatsApp template approval and consent
- verify rollback/kill-switch process

## QA Checklist

- Build passes.
- Email preview works for Manager/Admin.
- Email missing-config state is safe.
- Email test-send button remains disabled until backend config says enabled.
- WhatsApp preview still works.
- WhatsApp test-send button remains disabled until backend config says enabled.
- Employee cannot access Reports controls.
- Cron route returns disabled when `DAILY_REPORT_CRON_ENABLED` is not true.
- Cron route requires `CRON_SECRET` when enabled.
- Cron route returns dry-run plans when provider credentials, recipients, duplicate-send table, or channel send flags are missing.
- Cron route can perform real sends only when all gates are open.
- SQL is prepared but not run by Codex.
- No production deployment.
