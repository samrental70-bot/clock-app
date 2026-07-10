# OPERA.AI Production DB Precheck Report

Date: June 29, 2026

Scope:
- Read-only production database inventory before any production SQL or deployment.
- Production Supabase ref: `...evhyjm`
- Development Supabase ref: `...jjwbut`
- Credentials used locally for read-only REST checks were hidden and were not printed.
- Production database was not altered.
- Production Storage was not touched.
- No migrations were run.
- No insert/update/delete/alter/drop/truncate SQL was run.

## Table Existence And Row Counts

| Table | Status | Row count |
| --- | --- | ---: |
| companies | exists | 4 |
| company_members | exists | 22 |
| profiles | exists | 24 |
| projects | exists | 12 |
| cost_centres | exists | 91 |
| timesheets | exists | 260 |
| project_media | exists | 553 |
| notifications | exists | 772 |
| chat_conversations | missing | - |
| chat_members | missing | - |
| chat_conversation_members | missing | - |
| chat_messages | missing | - |
| live_locations | exists | 11 |
| daily_report_logs | missing | - |
| employee_pay_rates | missing | - |

## Project Media AI Columns

Missing in production:
- `ai_extracted_json`
- `ai_tags`
- `ai_category`
- `ai_summary`
- `ai_review_status`
- `ai_processed_at`
- `ai_confidence`
- `ai_error`

Required migration:
- `supabase/migrations/20260507210000_add_ai_fields_to_project_media.sql`

## Receipt OCR / B.2 Project Media Columns

Missing in production:
- `receipt_supplier`
- `receipt_date`
- `receipt_subtotal`
- `receipt_hst`
- `receipt_total`
- `receipt_currency`
- `receipt_material_category`
- `receipt_material_type`
- `receipt_ocr_status`
- `receipt_ocr_confidence`
- `receipt_reviewed_at`
- `receipt_reviewed_by`
- `receipt_source`

Required migration:
- `supabase/migrations/20260610120000_add_b2_pay_rates_and_receipt_ocr_fields.sql`

## Daily Report Logs

Production table status:
- `daily_report_logs` is missing.

Required migration:
- `supabase/migrations/20260611120000_create_daily_report_logs.sql`
- `supabase/migrations/20260615110000_harden_daily_report_rls.sql`

## Chat Tables

Production table status:
- `chat_conversations` is missing.
- `chat_conversation_members` is missing.
- `chat_messages` is missing.
- `chat_members` alias/table is missing.

Required migration:
- `supabase/migrations/20260626120000_create_company_chat.sql`

Note:
- Current OPERA.AI code uses `chat_conversation_members`, not `chat_members`.

## Live Locations

Production table status:
- `live_locations` exists with 11 rows.

Missing columns:
- `timesheet_id`
- `created_at`

Present checked columns:
- `employee_id`
- `accuracy`
- `status`
- `project_name`
- `cost_centre`
- `updated_at`

Required migration:
- `supabase/migrations/20260626153000_create_live_locations.sql`

## Notifications

Production table status:
- `notifications` exists with 772 rows.

Present checked columns:
- `id`
- `company_id`
- `recipient_user_id`
- `title`
- `type`
- `is_read`
- `created_at`

Missing checked columns:
- `body`
- `entity_type`
- `entity_id`

Required migration/status:
- Notification hardening should be reviewed before production.
- `supabase/migrations/20260503140000_create_notifications.sql` has been hardened locally, but production already has the table with an older shape.
- If the app requires `body`, `entity_type`, or `entity_id`, a safe additive notification migration is needed before production deployment.

## Production Migrations Needed

Required before production B.2/V3/V4 deployment:
- `supabase/migrations/20260507210000_add_ai_fields_to_project_media.sql`
- `supabase/migrations/20260610120000_add_b2_pay_rates_and_receipt_ocr_fields.sql`
- `supabase/migrations/20260611120000_create_daily_report_logs.sql`
- `supabase/migrations/20260615110000_harden_daily_report_rls.sql`
- `supabase/migrations/20260626120000_create_company_chat.sql`
- `supabase/migrations/20260626153000_create_live_locations.sql`
- Additive notification column hardening if production notification columns are required by the promoted app.

## Safety Assessment

Reviewed migration files showed no destructive:
- `DROP`
- `DELETE`
- `TRUNCATE`
- `RESET`
- destructive `ALTER ... DROP`

Expected data impact:
- Existing production data should be preserved.
- Production contains live data in core tables and must be backed up or inventoried again immediately before approved SQL execution.

Recommended next step:
- Controller review this report.
- Prepare a single production SQL bundle from the required additive migrations.
- Before running production SQL, re-confirm target ref `...evhyjm`, create/export a backup if available, and run only approved additive SQL.
