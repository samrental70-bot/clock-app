# OPERA.AI Production SQL Execution Verification Report

Date: June 29, 2026

Status:
- Manual production SQL execution reported by Controller: yes
- Codex production verification performed: yes, read-only Supabase REST checks only
- Production deployment run: no
- Push to main performed: no
- Supabase Storage touched: no
- Secrets printed: no

## Target Confirmation

- Production Supabase ref confirmed: `...evhyjm`
- Development Supabase ref confirmed separate: `...jjwbut`
- Verification target was production, not development.

## New Tables Verified

| Table | Status | Row count |
| --- | --- | ---: |
| employee_pay_rates | exists | 0 |
| daily_report_logs | exists | 0 |
| chat_conversations | exists | 0 |
| chat_messages | exists | 0 |
| chat_conversation_members | exists | 0 |

Note: `chat_members` remains absent. The final approved bundle creates `chat_conversation_members` as the chat membership table, and the latest Controller verification checklist requested `chat_conversation_members`.

## New Columns Verified

### project_media AI Columns

All required AI columns were verified through a read-only column select:

- ai_extracted_json
- ai_tags
- ai_category
- ai_summary
- ai_review_status
- ai_processed_at
- ai_confidence
- ai_error

### project_media Receipt OCR Columns

Receipt OCR fields were verified through a read-only column select, including:

- receipt_supplier
- receipt_date
- receipt_subtotal
- receipt_hst
- receipt_total
- receipt_currency
- receipt_material_category
- receipt_material_type
- receipt_ocr_status
- receipt_ocr_confidence
- receipt_reviewed_at
- receipt_reviewed_by
- receipt_source

### notifications Columns

Required notification hardening columns were verified:

- body
- entity_type
- entity_id

### live_locations Columns

Required live location additive columns were verified:

- timesheet_id
- created_at

## Row Count Comparison

| Table | Preflight | Current | Match |
| --- | ---: | ---: | --- |
| companies | 4 | 4 | yes |
| company_members | 22 | 22 | yes |
| profiles | 24 | 24 | yes |
| projects | 12 | 12 | yes |
| cost_centres | 91 | 91 | yes |
| timesheets | 260 | 260 | yes |
| project_media | 553 | 553 | yes |
| notifications | 772 | 772 | yes |
| live_locations | 11 | 11 | yes |

Data preservation status: existing production row counts match preflight exactly for all tracked production tables.

## RLS / Policy Verification

- Direct `pg_policies` catalog reads are not exposed through the production REST API, so Codex could not directly enumerate policy rows without running a SQL catalog query.
- The approved bundle contains guarded/idempotent RLS and policy creation for the new daily report, chat, and live location surfaces.
- Read-only REST smoke checks confirmed the new protected tables are reachable without schema errors.
- No data mutation was performed during verification.

If Controller requires catalog-level policy proof, run a read-only SQL Editor query against `pg_policies` in Supabase Dashboard and save the output before production deployment.

## Postflight Result

- Production target check: passed
- New table existence checks: passed
- New column checks: passed
- Preflight/current row-count comparison: passed
- Data preservation check: passed
- RLS/policy verification: partially verified from Codex; direct policy catalog confirmation requires Supabase SQL Editor/catalog access

## Errors / Warnings

- Warning: `pg_policies` is not readable through the REST API in this environment.
- Warning: `chat_members` table is not present, but the approved final bundle uses `chat_conversation_members` as the membership table.

## Remaining Blockers

- No schema/data blocker found by Codex verification.
- Optional: Controller may perform direct `pg_policies` catalog confirmation in Supabase SQL Editor if policy-row proof is required before deployment.

## Safety Confirmation

- Production DB altered by Codex: no
- Production Storage altered: no
- Production deployment: no
- Push to main: no
