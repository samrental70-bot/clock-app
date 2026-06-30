# B.2 Phase 2 - Google Login and Daily Timesheet Reports

## Current Auth
- The app uses Supabase Auth.
- Existing email/password login remains enabled.
- Google login should use Supabase Auth OAuth with identity/email scopes only.
- Company access and role are resolved from `company_members` after sign-in.
- OAuth provider claims must not grant owner/supervisor/admin access by themselves.

## Google Login Setup
Configure Google OAuth in the Supabase dashboard before relying on Google login:

- Enable Google provider in Supabase Auth.
- Add the Google OAuth client id/secret in Supabase, not in frontend code.
- Add allowed redirect URLs:
  - `https://project-rui1d-development.vercel.app`
  - `https://project-rui1d.vercel.app`
  - Supabase hosted auth callback URL shown in the Supabase Auth provider settings.
- Keep the app email/password login enabled until controller approval says otherwise.

Expected login behavior:

- Existing company members keep their current company and role.
- New Google users without company membership go to controlled company/join flow.
- No Google login can auto-create admin access.

## Daily Timesheet Report Email Strategy
Phase 2 adds a Manager/Admin report preview only.

Email sending is intentionally not enabled until a backend email provider or Gmail send consent flow is configured and approved.

Preferred production path:

- Use a server email provider such as Resend, SendGrid, or Postmark.
- Send only from backend routes or scheduled jobs.
- Scope every report by `company_id`.
- Send only to Manager/Admin recipients.

Gmail API alternative:

- Backend-only.
- Opt-in by Manager/Admin only.
- Request only `https://www.googleapis.com/auth/gmail.send`.
- Do not request inbox/read/modify scopes.
- Do not store Gmail refresh tokens in frontend or localStorage.
- Google OAuth verification may be required before production use.

## Cron Plan
Do not enable scheduled daily emails until:

- email provider is configured,
- recipient settings are approved,
- test mode passes,
- controller approves real sends.

Existing Vercel cron should not be repurposed for email without a separate review.

## QA Checklist
- Google login does not break email/password login.
- Existing company members keep correct role/company.
- No-company OAuth users land in pending/join flow.
- Employee role cannot access reports or daily report preview.
- Manager/Admin report preview uses current company and selected date range only.
- No real email sends during development QA.
- No OAuth tokens, Gmail tokens, API keys, or secrets are logged or stored in frontend state/localStorage.

## Advisor Follow-up Before Production
The sanitized advisor review marked this preview-only work as not production-ready until the following checks are completed:

- Verify Google provider configuration directly in Supabase/Google Cloud:
  - minimal identity scopes only for login,
  - expected redirect URLs only,
  - no Gmail send scope in the login flow.
- Run negative RBAC tests:
  - employee cannot open report preview,
  - wrong-company user cannot see another company's report rows,
  - unauthenticated user cannot access app data.
- Verify OAuth account linking:
  - existing email/password user,
  - existing Google user,
  - new Google user without company membership,
  - duplicate/mismatched email behavior.
- Keep real email sending disabled until a provider/Gmail-send implementation has a separate backend security review.
- Validate report totals across empty ranges, large ranges, timezone boundaries, and missing clock-out rows.
