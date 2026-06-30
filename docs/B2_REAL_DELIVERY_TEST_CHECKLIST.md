# B.2-fix-8 Real Delivery Test Checklist

Use this checklist before production merge or production send enablement. Do not paste secrets into this file.

## Gmail Test

- [ ] Approved test recipient email:
- [ ] Recipient is on allowlist:
- [ ] Recipient consent/approval recorded:
- [ ] Controller approval recorded:
- [ ] Provider credentials configured in development/staging:
- [ ] Sender/from address configured:
- [ ] Send flag remains disabled before test:
- [ ] Send one test daily report:
- [ ] Verify recipient received exactly one email:
- [ ] Verify subject/date/company are correct:
- [ ] Verify email body totals are correct:
- [ ] Verify no private data from another company appears:
- [ ] Verify `daily_report_logs` row created:
- [ ] Verify status transitions:
- [ ] Verify duplicate prevention by repeating same company/date/channel/recipient:
- [ ] Verify failed send can be retried:
- [ ] Verify no unauthorized recipients are configured:
- [ ] Verify no non-allowlisted recipients are configured:
- [ ] Verify provider auth failure is handled safely:
- [ ] Verify quota/rate-limit failure plan documented:
- [ ] Return send flag to disabled after test if not launching:

## WhatsApp Test

- [ ] Approved test WhatsApp number:
- [ ] Test number is on allowlist:
- [ ] Recipient opt-in/consent confirmed:
- [ ] Controller approval recorded:
- [ ] WhatsApp token configured in development/staging:
- [ ] Phone number ID configured:
- [ ] Business account ID configured:
- [ ] Template name configured:
- [ ] Template language configured:
- [ ] Template approved in Meta:
- [ ] Send flag remains disabled before test:
- [ ] Send one test template report:
- [ ] Verify recipient received exactly one WhatsApp message:
- [ ] Verify template values are correct:
- [ ] Verify no private data from another company appears:
- [ ] Verify `daily_report_logs` row created:
- [ ] Verify status transitions:
- [ ] Verify duplicate prevention by repeating same company/date/channel/recipient:
- [ ] Verify failed send can be retried:
- [ ] Verify no unauthorized recipients are configured:
- [ ] Verify no non-allowlisted recipients are configured:
- [ ] Verify invalid template/language handling:
- [ ] Verify rate-limit failure plan documented:
- [ ] Return send flag to disabled after test if not launching:

## Receipt OCR

- [ ] Upload safe test receipt:
- [ ] OCR extracts supplier:
- [ ] OCR extracts date where visible:
- [ ] OCR extracts subtotal:
- [ ] OCR extracts HST/tax:
- [ ] OCR extracts total:
- [ ] OCR extracts currency:
- [ ] Material category classified:
- [ ] Material type classified:
- [ ] Project/task defaults from active shift where available:
- [ ] Review-before-save appears:
- [ ] User can edit values:
- [ ] Manual fallback works when image is missing/unreadable:
- [ ] Structured receipt data saves only after review:
- [ ] Employee RBAC remains scoped to allowed records:

## RBAC / Tenant Safety

- [ ] Employee cannot access report controls:
- [ ] Employee cannot trigger email route:
- [ ] Employee cannot trigger WhatsApp route:
- [ ] Unauthenticated email route returns 401:
- [ ] Unauthenticated WhatsApp route returns 401:
- [ ] Wrong-company email request returns 403 or safe empty response:
- [ ] Wrong-company WhatsApp request returns 403 or safe empty response:
- [ ] Employee cannot view other employees' timesheets unless explicitly allowed:
- [ ] Employee cannot view other employees' receipts/media unless explicitly allowed:
- [ ] Employee cannot access company-wide report logs:
- [ ] Same-company admin can preview:
- [ ] Same-company supervisor can preview if allowed:
- [ ] Same-company admin/supervisor can still view allowed timesheets after RLS hardening:

## Scheduler / Cron

- [ ] `CRON_SECRET` configured server-side only:
- [ ] Unauthorized scheduler request is blocked:
- [ ] Authorized dry-run works:
- [ ] Company-local 12 PM window behavior verified:
- [ ] Timezone/DST behavior reviewed:
- [ ] Cron frequency verified:
- [ ] Concurrent duplicate run behavior verified or mitigated:
- [ ] Duplicate scheduled run does not duplicate delivery:
- [ ] Failed send can retry:
- [ ] Missing provider config returns safe warning:
- [ ] Missing recipients returns safe warning:
- [ ] Scheduler logs are visible in Vercel:

## Rollback Drill

- [ ] Gmail send flag disabled:
- [ ] Gmail send path attempted/simulated:
- [ ] No Gmail send occurred:
- [ ] WhatsApp send flag disabled:
- [ ] WhatsApp send path attempted/simulated:
- [ ] No WhatsApp send occurred:
- [ ] Cron flag disabled:
- [ ] Scheduler path attempted/simulated:
- [ ] Scheduler did not send:
- [ ] Rollback owner recorded:
- [ ] Verification timestamp recorded:

## Monitoring / Evidence

- [ ] Monitoring owner assigned:
- [ ] Rollback owner assigned:
- [ ] Escalation contact assigned:
- [ ] Vercel function logs reviewed:
- [ ] `daily_report_logs` status summary captured:
- [ ] Provider delivery summary captured:
- [ ] Duplicate blocked send summary captured:
- [ ] Failed-send retry summary captured:
- [ ] Unauthorized access attempt summary captured:
- [ ] OCR error summary captured:
- [ ] 30-minute canary observation completed:
- [ ] First scheduler observation completed if scheduler enabled:
- [ ] Evidence uses masked recipients only:

## Production Go / No-Go

- [ ] Gmail staged test passed:
- [ ] WhatsApp staged test passed:
- [ ] Receipt OCR retest passed:
- [ ] RBAC negative tests passed:
- [ ] Production env checklist reviewed:
- [ ] Monitoring checklist reviewed:
- [ ] Rollback plan reviewed:
- [ ] Rollback drill verified:
- [ ] Recipient allowlist verified:
- [ ] Named approvers recorded:
- [ ] Controller gave production approval:
- [ ] Production send flags remain disabled until exact enablement step:
