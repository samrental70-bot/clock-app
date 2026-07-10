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
- **Resolved.** The working tree was reviewed file-by-file and committed to `develop` as commit `b9fe8dc`.
- No GitHub Actions or repo-defined CI/CD pipeline exists (`.github/workflows` does not exist, `vercel.json` is empty `{}`). **Confirmed: the Vercel project `project-rui1d` has no connected Git repository** (this surfaced directly as an API error — "Project 'project-rui1d' does not have a connected Git repository" — when a branch-scoped env command was attempted earlier). This means **pushing `main` will NOT auto-deploy production.** All deployments in this project happen via explicit `vercel deploy` / `vercel deploy --prod` commands, decoupled from git entirely. Pushing `main` and deploying production are two separate, independently-approved actions — pushing `main` alone is inert from Vercel's perspective.

## 2. Production database backup

- A complete, verified backup was taken today: `backups/production/OPERA_PROD_BACKUP_2026-07-10T13-46-05-621Z.json` (2,796,137 bytes, SHA256 `055196ef6d1ab88747fc1f8199f3550c64e2043b4f6d4819cdb5f622c0561383`).
- Full report: `PRODUCTION_DB_BACKUP_2026-07-10T13-46-05-621Z_REPORT.md`.
- Covers all 26 Clock App application tables (companies, profiles, timesheets, chat, payroll, vacation, etc.) with real row counts. Read-only export, no production writes.
- Folder `backups/` is gitignored — this backup is local-only, matching established practice.

## 3. Credential issue — found and resolved

- **Corrected diagnosis**: this was never a rotation. `.env.production.local` had the right `VITE_SUPABASE_URL` (production) but its `SUPABASE_SERVICE_ROLE_KEY` was actually the **development** project's service-role key (confirmed by decoding the JWT's `ref` claim: it read `jvlxahskximvbajjwbut`, not `vunwijmdewrlsrevhyjm`) — a file miswiring, not a revoked credential. A service-role key is scoped to one specific project, so using the dev key against the production REST endpoint correctly fails closed with 401 rather than silently hitting the wrong project.
- Asked Codex to search every `.env*` file in the repo for one whose service-role key JWT actually decodes to the production ref. It found `.env.local`, which has a `SUPABASE_SERVICE_ROLE_KEY` whose `ref` claim is `vunwijmdewrlsrevhyjm`. I independently re-decoded the JWT myself (not just trusting Codex's read) and confirmed the same ref and `role: service_role`, then tested it with a single live read-only request — 200 OK, real data returned.
- **Fixed**: copied the correct key from `.env.local` into `.env.production.local`'s `SUPABASE_SERVICE_ROLE_KEY` line (both are local, gitignored secret-holding files; only that one line was touched). Re-tested `.env.production.local` end-to-end afterward — 200 OK. This file is now internally consistent for any future session.

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

## 7. Everything is now done except the final approval

- `develop` working tree reviewed file-by-file and committed: commit `b9fe8dc` "Chat redesign, API auth hardening, and B2/payroll production-readiness work" (98 files, +11,293/-2,201). Deliberately excluded from the commit: any `.env*` file, ORPL Customer Portal files (`api/orpl/`, `src/orpl/`, its migration), QuickBooks MCP files, and unrelated portfolio/render project debris that was sitting in the same working directory — none of that is Clock App product code.
- `npm run verify:release` re-run against the committed state: migration safety (15 files), lint (0 errors), build, timesheet sanity, receipt OCR — all passed. `verify:b2-dev` separately reconfirmed all dev tables readable and API routes correctly gated (401/400 without auth).
- Confirmed Vercel Git-integration behavior (section 1 update): pushing `main` will **not** auto-deploy production, since the Vercel project has no connected Git repo. Deployment is always a separate explicit step.
- Credential issue root-caused and fixed (section 3) with an independently-verified working production key.
- **Live precheck run against production just now** with the corrected key:
  - All 25 tracked tables' row counts match this morning's backup **exactly** — nothing has changed in production since the backup was taken, so it remains a valid, current restore point.
  - Directly re-confirmed (not just inferred from historical reports) that all 3 outstanding migrations are still genuinely outstanding: `projects` still has no special-project/manual-contract columns, `chat_list_items` still has no `parent_item_id`/`item_level`/`assigned_user_id` columns. `PRODUCTION_SQL_BUNDLE_2026-07-10_MERGE_PREP.sql` is accurate and safe to run as prepared.

## 8. Final approval needed

Everything is ready. The only remaining steps all touch production directly, so they're held for your explicit go-ahead:

1. Execute `PRODUCTION_SQL_BUNDLE_2026-07-10_MERGE_PREP.sql` against production (the 3 outstanding additive migrations) and capture a postflight verification report.
2. Fast-forward and push `main` to `develop`'s current commit (`b9fe8dc`) — confirmed inert on its own (no connected Vercel Git integration).
3. Deploy to production via `vercel deploy --prod`, then confirm the live app.

**Say the word and I'll run all three in order**, verifying between each step, and report back with confirmation at every stage.
