# OPERA.AI Production DB SQL Execution Report - 2026-07-10 Merge Prep Gate

Date: 2026-07-10

## Target

- Production Supabase ref: `vunwijmdewrlsrevhyjm`
- Approved additive SQL bundle: `PRODUCTION_SQL_BUNDLE_2026-07-10_MERGE_PREP.sql`
- Execution method: `supabase db query --file PRODUCTION_SQL_BUNDLE_2026-07-10_MERGE_PREP.sql --linked` (Supabase CLI, authenticated session, Management API path — no direct Postgres password used)
- Explicit approval given by Controller before execution: yes

## Pre-execution safeguards

- Verified the query mechanism against production before running any DDL: ran a trivial read-only query (`select current_database(), count(*) from companies`) and confirmed `companies_count = 4`, matching the known production baseline, before trusting the connection.
- A live precheck (see `PRODUCTION_MERGE_READINESS_2026-07-10.md` section 7) had already reconfirmed immediately beforehand that all 25 tracked tables matched the `OPERA_PROD_BACKUP_2026-07-10T13-46-05-621Z.json` backup exactly, and that all 3 bundle migrations were still genuinely outstanding.

## Migrations executed

- `20260704160000_add_special_projects_and_manual_contracts.sql`
- `20260707103000_add_chat_list_hierarchy.sql`
- `20260707143000_add_chat_list_assignments.sql`

`20260707120000_create_orpl_customer_portal.sql` was not part of the bundle and was not executed (separate product, excluded by design).

## Postflight column verification

| Table | Columns added | Verified present |
|---|---|---|
| `projects` | `special_project_active`, `special_hourly_rate`, `special_project_notes` | yes, all 3 |
| `cost_centres` | `manual_contract_active`, `manual_contract_fixed_amount`, `manual_contract_notes`, `manual_contract_start_date`, `manual_contract_end_date` | yes, all 5 |
| `chat_list_items` | `parent_item_id`, `item_level`, `child_order`, `sort_order`, `assigned_user_id` | yes, all 5 |

Verified via direct `information_schema.columns` queries against the linked production database after execution.

## Postflight row-count verification (data preservation)

| Table | Preflight (this morning's backup / live precheck) | Postflight | Match |
|---|---:|---:|---|
| companies | 4 | 4 | yes |
| projects | 15 | 15 | yes |
| cost_centres | 157 | 157 | yes |
| chat_list_items | 2 | 2 | yes |
| timesheets | 318 | 318 | yes |

No rows were added, removed, or modified in existing tables. Only new columns (all nullable or with safe defaults) were added.

## Result

- Production SQL execution completed successfully.
- Production data preserved (row counts unchanged across all checked tables).
- No destructive SQL was run (bundle was pre-verified additive-only; only `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements were present).
- Supabase CLI was re-linked back to the development project (`jvlxahskximvbajjwbut`) immediately after execution to restore prior session state.
- ORPL Customer Portal migration was not touched.

## Safety confirmation

- Production Storage altered: no
- Production deployment run as part of this step: no (deployment is a separate subsequent step)
- Push to main run as part of this step: no (separate subsequent step)
