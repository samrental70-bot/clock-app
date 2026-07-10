# OPERA.AI Production Merge Readiness Report

Date: 2026-07-10

**Status: PREPARATION ONLY. Nothing has been merged, pushed, or deployed to production. No production SQL has been executed. This report exists so a merge can be approved and executed quickly and safely later — it is not itself an approval or an action.**

## 1. Current git state (confirmed via Codex read-only investigation)

- `main` (production branch) is at commit `0a84637` "prepare beta release b" (SHA `0a846375e484c71d68ef7edd6b53c2142d4cb380`).
- `develop` is exactly **5 commits ahead** of `main`, and `main` has **0 commits** not already in `develop` — this is a clean fast-forward situation, not a diverging history. No merge conflicts are expected.
- The 5 commits `main` is behind by:
  - `636c1af` track beta b store launch docs
  - `8ecfcfc` B2 V3 V4 production readiness foundation
  - `adf4a60` Add payroll tracking settings and payment balances
  - `f90865e` Payroll UI refinements
  - `8214c01` Finalize payroll chat breaks clock green QA
- `git diff --stat main...develop`: **69 files changed, 22,283 insertions(+), 3,761 deletions(-)**. This is a large change set (chat feature, payroll tracking, B2 readiness work, plus this session's chat redesign and API auth hardening once committed).
- **The working tree is currently dirty** with substantial uncommitted work (this session's chat redesign, auth fixes, plus pre-existing WIP per project memory). None of this is committed to `develop` yet. A real merge to `main` requires first committing and reviewing this work on `develop`.
- No GitHub Actions or repo-defined CI/CD pipeline exists (`.github/workflows` does not exist, `vercel.json` is empty `{}`). Production deployment is controlled externally via Vercel's Git integration — **pushing to `main` may auto-trigger a production deployment** depending on the Vercel project's dashboard settings. This must be confirmed before any push to `main`.

## 2. Production database backup

- A complete, verified backup was taken today: `backups/production/OPERA_PROD_BACKUP_2026-07-10T13-46-05-621Z.json` (2,796,137 bytes, SHA256 `055196ef6d1ab88747fc1f8199f3550c64e2043b4f6d4819cdb5f622c0561383`).
- Full report: `PRODUCTION_DB_BACKUP_2026-07-10T13-46-05-621Z_REPORT.md`.
- Covers all 26 Clock App application tables (companies, profiles, timesheets, chat, payroll, vacation, etc.) with real row counts. Read-only export, no production writes.
- Folder `backups/` is gitignored — this backup is local-only, matching established practice.

## 3. Credential issue found (action needed before any live production SQL work)

- I attempted to take my own fresh backup as a double-check and it failed: `SUPABASE_SERVICE_ROLE_KEY` in `.env.production.local` is now rejected by Supabase with **401 "Invalid API key"**.
- This is a genuine rotation/change, not a fluke — I re-tested with a single isolated request and got the same 401.
- The **same key, in the same file, worked successfully ~45 minutes earlier** (it produced the backup in section 2), so this was rotated very recently.
- **Action needed from you**: before any live production SQL execution (not needed for this preparation step, but needed for the actual future execution), refresh `.env.production.local` with a current production `SUPABASE_SERVICE_ROLE_KEY` (Supabase dashboard → Project Settings → API, or `vercel env pull --environment=production`). I did not attempt to guess or find a replacement key myself.

## 4. Schema status: outstanding production migrations

Cross-referenced the full migration history against prior verified execution reports (`PRODUCTION_DB_SQL_EXECUTION_PAYROLL_CHAT_CLOCK_REPORT.md`, `PRODUCTION_DB_SQL_EXECUTION_REPORT.md`) and directly confirmed column presence/absence in today's backup data. Result:

**22 of 25 Clock App migrations are already applied to production** (everything through `20260703133000_add_payroll_settings_pay_date_offset.sql`, confirmed both by historical execution reports and by column presence in the fresh backup, e.g. `companies.allow_employee_project_task_creation` and `companies.auto_clock_out_time` are present).

**3 migrations are confirmed outstanding** (columns confirmed absent in today's backup):

| Migration | Verified missing in production |
|---|---|
| `20260704160000_add_special_projects_and_manual_contracts.sql` | special-project/manual-contract columns absent from `projects`/`cost_centres` |
| `20260707103000_add_chat_list_hierarchy.sql` | `parent_item_id`, `item_level`, `child_order`, `sort_order` absent from `chat_list_items` |
| `20260707143000_add_chat_list_assignments.sql` | `assigned_user_id` absent from `chat_list_items` |

All three were re-checked line-by-line and contain no `DROP`/`DELETE`/`TRUNCATE`/`RESET`/`ALTER...DROP` statements (confirmed via both a manual grep and the repo's own `verify:migrations` script, which passed).

**1 migration must never be run against Clock App production**: `20260707120000_create_orpl_customer_portal.sql` creates ORPL Customer Portal tables, including a `create table if not exists public.profiles` that could collide with Clock App's own `profiles` table. The repo's own `verify-b2-migration-safety.js` script already explicitly excludes this file by filename — I followed the same exclusion.

A ready-to-review SQL bundle of just the 3 outstanding migrations (with clear begin/end markers per file) has been prepared at:
**`PRODUCTION_SQL_BUNDLE_2026-07-10_MERGE_PREP.sql`** — prepared only, not executed.

## 5. Code verification (current `develop`, uncommitted included)

`npm run verify:release` passed end-to-end just now:
- `verify:migrations`: passed (15 migration files checked, ORPL correctly excluded)
- `lint`: 0 errors (130 pre-existing warnings, unchanged)
- `build`: succeeded
- `test:timesheet-sanity`: passed
- `test:receipt-ocr`: passed

## 6. Rollback plan (prepared, not exercised)

**Application/deployment rollback** (fast, low-risk):
- Vercel retains prior production deployments. If a production deploy misbehaves, promote the previous known-good deployment via `vercel rollback` or the Vercel dashboard — this reverts the live app in seconds without touching git or the database.
- Because the additive DB migrations (section 4) only add tables/columns, the *previous* app version continues to work fine against the *new* schema (it simply won't use the new tables/columns). This means an app-level rollback does **not** require a database rollback — the two are decoupled by the additive-only migration discipline.

**Git rollback**:
- Since `main` will only ever be fast-forwarded (never diverged), reverting `main` to `0a846375e484c71d68ef7edd6b53c2142d4cb380` (its current commit) fully undoes the code merge if needed, with no merge-conflict risk either direction.

**Database rollback** (slow path, last resort):
- The 3 outstanding migrations are purely additive (new tables/columns) — the standard rollback for additive-only changes is to leave them in place (they're inert to old code) rather than drop them live, since dropping columns/tables on a live production database is itself a destructive, higher-risk operation than leaving unused columns in place.
- If full data recovery is ever needed, `backups/production/OPERA_PROD_BACKUP_2026-07-10T13-46-05-621Z.json` (and the matching SHA256 in its report) is the current restore point. This is an application-table JSON export, not a full Supabase platform/Storage backup — for a full point-in-time restore, use Supabase's own dashboard backup/restore feature in addition to this file if available on the project's plan.

## 7. What is explicitly NOT done (per instruction)

- No push to `main`.
- No production deployment.
- No production SQL executed.
- No production database or Storage modified.
- No commit was made to `develop` (the current session's uncommitted work is still uncommitted — see below).

## 8. Recommended next steps, in order, when you're ready to actually merge

1. Review and commit the current `develop` working tree (this session's chat redesign + auth hardening, plus pre-existing WIP) — I have not committed anything without being asked.
2. Refresh the production service-role key in `.env.production.local` (see section 3).
3. Re-run a live precheck against production with the refreshed key to reconfirm section 4's findings are still current (schema doesn't change on its own, but re-confirming immediately before execution is the established safe practice from prior gates).
4. Get explicit approval to run `PRODUCTION_SQL_BUNDLE_2026-07-10_MERGE_PREP.sql` against production, execute it, and capture a postflight verification report (row-count and column-presence comparison against the section 2 backup), matching the format of `PRODUCTION_DB_SQL_EXECUTION_PAYROLL_CHAT_CLOCK_REPORT.md`.
5. Confirm in the Vercel dashboard whether pushing `main` auto-deploys production, so there are no surprises.
6. Fast-forward `main` to `develop` and push, only with explicit approval.
7. Verify the production deployment (URL, build/version marker) and watch for errors immediately after.
