# B.2-fix-8 Production Readiness Runbook

## A. Current Status

- B.2 daily reports, receipt OCR, scheduler foundation, duplicate-send protection, and RBAC tenant-isolation remediation are complete on `develop`.
- Advisor re-review passed for development remediation/merge readiness only.
- Development and production database separation has been confirmed.
- SQL was run on development only.
- Receipt OCR success and fallback paths were tested in development.
- Gmail real delivery was skipped because credentials and approved test recipient are not configured.
- WhatsApp real delivery was skipped because Cloud API credentials, approved template, and approved test recipient are not configured.
- Production is not ready until the real delivery tests and production readiness checklist pass.

### 2026-06-26 B.2 Release Candidate Update

- Latest production-readiness advisor review is **blocked** for production merge until DB/RBAC/live-location/chat/OCR QA evidence is complete.
- `npm run verify:migrations` passes for B.2 202606 migrations.
- `npm run verify:b2-dev` currently fails because `bridge-app-dev` does not yet have the B.2 chat/live-location/report/pay-rate/OCR schema applied.
- Supabase CLI is linked to `bridge-app-dev` (`...jjwbut`).
- `npx supabase db push --dry-run` cannot run until `SUPABASE_DB_PASSWORD` is provided for `bridge-app-dev`.
- Production SQL must not run until a separate approval, backup/checkpoint, and final release gate pass.

## B. Production Prerequisites

- Gmail provider/test credentials configured server-side only.
- WhatsApp Cloud API credentials configured server-side only.
- WhatsApp daily report template approved in Meta.
- Approved test email recipient confirmed by Controller.
- Approved test WhatsApp recipient confirmed by Controller, including opt-in/consent.
- Production send flags remain disabled until final Controller approval.
- Production cron flag remains disabled until final Controller approval.
- Rollback plan reviewed before enabling any production send.
- Monitoring plan reviewed before enabling any production send.
- Production deployment plan reviewed separately from this runbook.
- No `.env` files, private keys, tokens, service role keys, or provider credentials are committed.

## C. Environment Variables Checklist

Do not include real values in code, docs, commits, screenshots, or ChatGPT/advisor reports.

### Gmail / Email

- `EMAIL_PROVIDER` or `GMAIL_PROVIDER`
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- `EMAIL_FROM`
- Current implementation sender variable: `GMAIL_SENDER_EMAIL`
- Requested production safety flag: `DAILY_REPORT_EMAIL_ENABLED=false` by default
- Current implementation safety flag: `GMAIL_SEND_ENABLED=false` by default

### WhatsApp

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_DAILY_REPORT_TEMPLATE_NAME`
- `WHATSAPP_DAILY_REPORT_TEMPLATE_LANGUAGE`
- Requested production safety flag: `DAILY_REPORT_WHATSAPP_ENABLED=false` by default
- Current implementation safety flag: `WHATSAPP_SEND_ENABLED=false` by default

### Cron / Security

- `CRON_SECRET`
- `DAILY_REPORT_CRON_ENABLED=false` by default
- `DAILY_REPORT_TIME=12:00`
- Optional staging guard: `DAILY_REPORT_TEST_COMPANY_ID`
- Optional staged test recipients:
  - `DAILY_REPORT_CRON_EMAIL_RECIPIENTS`
  - `DAILY_REPORT_CRON_WHATSAPP_RECIPIENTS`

## D. Real Staged Test Plan

Run these in development or an approved staging environment first. Do not use production recipients until Controller approves.

1. Confirm approved Gmail test recipient.
2. Configure Gmail credentials server-side only.
3. Keep production send flags disabled.
4. Send one daily report to the approved Gmail test recipient.
5. Verify the recipient received exactly one email.
6. Verify `daily_report_logs` created a row for company/date/channel/recipient.
7. Run the same send again and verify duplicate-send prevention.
8. Force a provider failure in staging if possible and verify failed sends are retryable.
9. Confirm unauthorized employee cannot access report controls or trigger report routes.
10. Confirm wrong-company report request returns 403 or safe empty response.

WhatsApp staged test:

1. Confirm approved WhatsApp test number and consent.
2. Confirm Meta template name/language are approved.
3. Configure WhatsApp Cloud API credentials server-side only.
4. Keep production send flags disabled.
5. Send one template report to the approved WhatsApp test recipient.
6. Verify the recipient received exactly one WhatsApp message.
7. Verify `daily_report_logs` created a row for company/date/channel/recipient.
8. Run the same send again and verify duplicate-send prevention.
9. Force a provider failure in staging if possible and verify failed sends are retryable.
10. Confirm no unauthorized recipients are configured.

Receipt OCR retest:

1. Upload a safe test receipt.
2. Verify OCR extracts supplier, date, subtotal/HST/total, and currency where visible.
3. Verify material category/type are classified.
4. Verify project/task defaults use active shift context where available.
5. Verify review-before-save appears.
6. Verify the user can edit values before save.
7. Verify manual fallback works if OCR fails.
8. Verify structured receipt data saves only after review.

## E. Production Enablement Steps

Do not complete these until staged tests pass and Controller approves.

1. Confirm current `develop` candidate and release notes.
2. Confirm production database target.
3. Confirm production environment variables are present but send flags remain disabled.
4. Deploy production only after separate approval.
5. Smoke test login, Home, Clock, Schedule, Timesheets, Receipts, Reports, and More.
6. Smoke test report preview with send flags disabled.
7. Enable one channel at a time.
8. Start with Gmail or WhatsApp, not both.
9. Send to approved production test recipient only.
10. Monitor Vercel function logs and `daily_report_logs`.
11. Confirm duplicate-send prevention.
12. Enable scheduler only after manual send tests pass.
13. Monitor the first scheduled run.
14. Keep rollback commands and owner contact ready during launch window.

## F. Rollback Plan

If any issue appears:

1. Disable `DAILY_REPORT_EMAIL_ENABLED` / `GMAIL_SEND_ENABLED`.
2. Disable `DAILY_REPORT_WHATSAPP_ENABLED` / `WHATSAPP_SEND_ENABLED`.
3. Disable `DAILY_REPORT_CRON_ENABLED`.
4. Redeploy or update environment variables if required by platform behavior.
5. Do not delete report logs.
6. Do not delete receipt/OCR data.
7. Keep `daily_report_logs` for audit and debugging.
8. Review Vercel function logs and provider dashboards.
9. Communicate affected test recipients and Controller.
10. Re-enable only after root cause and retest.

## G. Monitoring Checklist

- Vercel deployment health.
- Vercel function logs for:
  - report preview
  - Gmail send
  - WhatsApp send
  - cron invocation
  - OCR route
- `daily_report_logs` status counts:
  - `sending`
  - `sent`
  - `failed`
- Duplicate blocked sends.
- Failed sends and retry behavior.
- Unauthorized report access attempts.
- Employee role access attempts.
- Wrong-company access attempts.
- OCR errors:
  - missing image
  - provider timeout
  - bad provider response
  - manual fallback usage
- Provider dashboards:
  - Gmail API errors/quota
  - Meta WhatsApp template/message delivery status
- Rollback readiness during first production run.

## Future Production Gate

Production is not ready until:

- Real Gmail staged test passes.
- Real WhatsApp staged template test passes.
- Production env/config review passes.
- Production cron/auth review passes.
- Monitoring/rollback/runbook review passes.
- Controller gives final production enablement approval.

## H. Required Approvals and Owners

Fill these before any production step:

- Controller / business approver:
- Technical release owner:
- Monitoring owner:
- Rollback owner:
- Gmail test approver:
- WhatsApp test approver:
- Production deployment approver:
- Production channel enablement approver:
- Scheduler enablement approver:

Required sign-offs:

1. Staged delivery test approval.
2. Production deploy approval with send flags disabled.
3. Gmail canary enablement approval.
4. WhatsApp canary enablement approval.
5. Scheduler enablement approval.
6. Full rollout approval.

Do not combine production deployment approval with live send or scheduler approval.

## I. Hard Go / No-Go Exit Criteria

### Staged Gmail Go Criteria

- Approved test recipient is on the allowlist.
- Recipient consent/approval is recorded.
- Exactly one test email is sent for the test company/date/channel/recipient.
- Recipient confirms receipt.
- `daily_report_logs` contains the expected company/date/channel/recipient/status.
- Repeating the same send does not send a second successful report.
- A failed send can be retried.
- Unauthorized employee route access returns 403.
- Wrong-company route access returns 403 or a safe empty response.

### Staged WhatsApp Go Criteria

- Approved test phone number is on the allowlist.
- Recipient opt-in/consent is recorded.
- Template is approved in Meta.
- Template name/language match environment config.
- Exactly one test WhatsApp message is sent for the test company/date/channel/recipient.
- Recipient confirms receipt.
- `daily_report_logs` contains the expected company/date/channel/recipient/status.
- Repeating the same send does not send a second successful report.
- A failed send can be retried.
- Provider errors are logged without exposing tokens.

### Production Deploy Go Criteria

- Production environment points to production services.
- Development environment remains isolated.
- Production send flags are disabled before deploy.
- Production cron flag is disabled before deploy.
- App smoke tests pass with sends disabled.
- Report preview works with sends disabled.
- No production SQL is run as part of this checklist.

### Production Channel Enablement Go Criteria

- One channel is enabled at a time.
- Recipient allowlist is active for canary testing.
- Test company/account is confirmed.
- Monitoring owner is watching logs during the test.
- Rollback owner is ready to disable flags.
- Post-send observation window starts immediately.

### Scheduler Go Criteria

- Manual channel canary passed.
- Duplicate prevention passed.
- Failed-send retry behavior passed.
- Authorized scheduler dry-run passed.
- Unauthorized scheduler request is blocked.
- Company-local 12 PM behavior is verified.
- Timezone/DST behavior is reviewed for configured company timezone.
- Cron frequency is verified in platform config.
- Concurrent duplicate run behavior is verified or explicitly mitigated by duplicate-send logs.

## J. Test Containment Controls

- Maintain an approved recipient allowlist for Gmail and WhatsApp tests.
- Use one-message-per-channel canary tests before broader enablement.
- Use an approved test company/account first.
- Do not send to all managers/employees during the canary.
- Do not include real customer/private payloads in test content unless Controller explicitly approves.
- Confirm test recipients before each real send.
- Confirm production recipient lists are empty or allowlisted before enabling channel flags.
- Capture evidence with timestamps and masked recipient references only.

## K. Rollback Verification Drill

Before live scheduler enablement:

1. Set Gmail send flag to disabled.
2. Attempt or simulate Gmail send path.
3. Confirm no Gmail message is sent.
4. Set WhatsApp send flag to disabled.
5. Attempt or simulate WhatsApp send path.
6. Confirm no WhatsApp message is sent.
7. Set daily report cron flag to disabled.
8. Trigger or simulate scheduler path.
9. Confirm scheduler reports disabled or does not send.
10. Record timestamp and owner who verified rollback.

Rollback is not considered ready until the disable path is verified.

## L. Monitoring Thresholds and Escalation

Observation window:

- Minimum canary observation window: 30 minutes after each real send.
- First scheduler observation window: until the next expected daily run plus 30 minutes.

Alert thresholds:

- Any unauthorized report route access spike: investigate.
- Any report send to a non-allowlisted recipient: immediate rollback.
- Any duplicate successful delivery for same company/date/channel/recipient: immediate rollback.
- Any provider authentication failure during canary: stop channel enablement.
- Any scheduler run outside expected window: disable cron and investigate.
- Any OCR provider error spike after deployment: investigate before enabling more channels.
- Any `daily_report_logs` rows stuck in `sending` beyond expected provider timeout: investigate/retry policy.

Escalation path:

1. Monitoring owner confirms issue.
2. Rollback owner disables relevant flag(s).
3. Technical release owner reviews logs.
4. Controller decides whether to resume, hold, or revert.

## M. Provider Failure Matrix

Test or document expected handling for:

- Gmail auth failure.
- Gmail quota/rate limit.
- Gmail invalid recipient/bounce.
- Gmail network timeout.
- WhatsApp invalid token.
- WhatsApp invalid phone number.
- WhatsApp template not approved.
- WhatsApp template language mismatch.
- WhatsApp rate limit.
- WhatsApp network timeout.
- Partial delivery where provider accepts one channel and rejects another.
- Duplicate retry after a failed provider attempt.
- Duplicate prevention after a successful provider attempt.

## N. Evidence Required for Release Approval

Collect sanitized evidence only:

- Checklist completion date/time.
- Approver names/roles.
- Deployment URL or deployment identifier.
- Masked test recipient references.
- `daily_report_logs` status summary without full recipient values.
- Provider delivery confirmation summary without tokens.
- Browser smoke summary.
- Rollback verification summary.
- Monitoring observation notes.
- Final go/no-go decision.

## O. Post-Release Observation

Production Release B.2 is not complete until:

- First canary channel observation window completes.
- First scheduled run observation window completes if scheduler is enabled.
- No unauthorized/duplicate/non-allowlisted sends are detected.
- Rollback was not needed, or rollback was executed and documented.
- Controller signs off on production status.
