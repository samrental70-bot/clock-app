# OPERA.AI V3/V4 QA Checklist

Date: May 8, 2026
Branch: develop

## Manual Supabase SQL Required

Run this in Supabase SQL Editor before testing AI save/persistence:

```sql
alter table public.project_media
  add column if not exists ai_extracted_json jsonb,
  add column if not exists ai_tags text[] not null default '{}',
  add column if not exists ai_category text,
  add column if not exists ai_summary text,
  add column if not exists ai_review_status text,
  add column if not exists ai_processed_at timestamptz,
  add column if not exists ai_confidence numeric,
  add column if not exists ai_error text;

create index if not exists project_media_ai_category_idx
  on public.project_media (company_id, ai_category)
  where ai_category is not null;

create index if not exists project_media_ai_processed_idx
  on public.project_media (company_id, ai_processed_at desc)
  where ai_processed_at is not null;

create index if not exists project_media_ai_tags_idx
  on public.project_media using gin (ai_tags);
```

AI fallback works without this SQL, but confirmed AI results cannot be saved to `project_media` until the SQL is applied.

## Environment Safety

- Confirm `OPENAI_API_KEY` is configured only in Vercel/server environment.
- Confirm no OpenAI key appears in frontend source or browser bundle.
- Confirm `/api/ai-field-docs` returns "AI not configured yet" when the key is missing.

## Role QA

- Owner login opens dashboard and can navigate to Project Documentation.
- Supervisor login opens dashboard and can navigate to Project Documentation.
- Employee login opens Clock screen first.
- Employee can upload own documentation only.
- Employee sees only own uploaded project media.
- Supervisor/Owner sees company-wide `project_media` records.
- Employee cannot use supervisor-only AI review actions.

## Field Documentation QA

- Open Project Documentation screen.
- Verify empty state when no media exists.
- Verify project grouping with photos, videos, receipts, latest upload date, and uploader names.
- Verify missing project name falls back to a safe "Project" label.
- Verify missing uploader name falls back to "Employee".
- Verify timeline view with mixed photos, videos, and receipts.
- Verify timeline shows media type, documentation type, employee, project, task, date/time.
- Verify receipt timeline item shows supplier and amount when available.
- Verify video timeline item shows duration when available and does not crash when missing.
- Verify broken/missing media URL does not white-screen the app.
- Verify many records remain scrollable and no horizontal overflow appears.

## Filters QA

- Filter by project.
- Filter by date range.
- Filter by employee.
- Filter by task/cost centre.
- Filter by media type: all, photo, video, receipt.
- Filter by documentation type: Daily Progress, Before, After, Receipt, Video, Clock-out, Document, Other.
- Verify no-result filter shows a clean empty state.

## Upload QA

- Upload daily progress photo.
- Upload before photo.
- Upload after photo.
- Upload receipt.
- Upload video up to 30 seconds.
- Confirm video over 30 seconds is blocked.
- Confirm mandatory clock-out photo still opens camera and saves as `clockout`.
- Confirm normal photo default is `daily_progress`.
- Confirm receipt default is `receipt`.
- Confirm video default is `video`.

## AI QA

- With no OpenAI key, click AI status/check and confirm fallback message.
- With OpenAI key configured server-side, run AI Read Receipt.
- Confirm receipt OCR suggests supplier, date, subtotal/tax/total where visible, category, and line items.
- Confirm receipt data is not saved until user clicks save/confirm.
- Confirm AI Tag suggests tags and documentation category.
- Confirm AI tags are not saved until user clicks save/confirm.
- Generate daily work summary.
- Generate customer update draft.
- Confirm customer update draft does not include labour cost by default.
- Generate AI alerts for missing documentation/high-risk items.
- Confirm AI failures do not crash Project Documentation.

## V2/V2a Regression QA

- Auth/company/RBAC.
- Clock in/out.
- GPS/live location.
- Timesheets and manual time approval.
- Labour cost.
- Photo upload.
- Multi-photo batch upload.
- 30-second video upload.
- Receipt capture.
- Employee management.
- Reports drilldown.
- Supervisor dashboard.
- Scheduling.
- Accept/decline.
- Clock scheduled task dropdown.
- Schedule list and calendar views.
- Notifications and 1-hour alarm.

## Release Gate

- Build passes on develop.
- Lint/test status reviewed.
- Supabase AI SQL applied if AI save is part of the release.
- Vercel preview has server-side `OPENAI_API_KEY` if live AI is part of the release.
- No push to main until Controller approves promotion.
