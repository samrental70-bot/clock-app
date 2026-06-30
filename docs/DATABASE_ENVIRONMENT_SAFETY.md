# OPERA.AI Database Environment Safety

## Current Status

Production and development are now separated at the deployed app level.

- Production app: `https://project-rui1d.vercel.app`
- Development app: `https://project-rui1d-development.vercel.app`
- Production Supabase ref: `...evhyjm`
- Development Supabase ref: `...jjwbut`

Development uses the shared `bridge-app-dev` Supabase project. This database is shared with other development apps, so B.2 SQL still requires explicit review before running. Production remains protected and must not be used for development testing.

## Hard Rule

Production database must never be used for develop testing.

Development SQL must only run against a development Supabase project. Production SQL requires separate explicit Controller approval.

No destructive SQL is allowed:

- no `DROP`
- no `DELETE`
- no `TRUNCATE`
- no database reset
- no destructive `ALTER`
- no production data deletion

Allowed SQL patterns for development review:

- `CREATE TABLE IF NOT EXISTS`
- `ADD COLUMN IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- additive constraints/indexes after review

## Required Confirmation Before Any Future SQL

Before SQL is allowed, confirm:

1. Branch is `develop`.
2. Vercel target is Preview/development.
3. Development Supabase project is different from production.
4. Development app bundle references the development Supabase ref.
5. Production app bundle still references the production Supabase ref.
6. Production Vercel environment variables were not changed.
7. SQL is additive only.
8. Backup/export plan exists if production is ever involved.
9. Service role keys remain backend-only.
10. Local `.env` files are not committed.

If there is any doubt about the database target, stop and do not run SQL.

## QC Gate Before B.2 SQL

Every item must be marked pass before migrations run:

- Preview/development Vercel env uses the dev Supabase URL.
- Preview/development Vercel env uses the dev anon key.
- Preview/development server env uses the dev service role key only.
- Production Vercel env is unchanged.
- Production app bundle still references production Supabase.
- Development app bundle references a different dev Supabase ref.
- Backend runtime routes are verified against the dev Supabase target.
- Local `.env.development` points to dev only.
- No production auth users, storage files, logs, receipts, photos, or timesheets are copied into dev.
- Dev seed data is synthetic/demo only.
- RLS/storage policies are reviewed after schema setup.
- Service role keys are not exposed in frontend bundles.
- SQL file is additive only.
- Controller approves the target and SQL before execution.

## Development Supabase Setup

Development is currently connected to the existing shared development Supabase project:

- Project name: `bridge-app-dev`
- Ref: `...jjwbut`
- Purpose: shared development database

This project is not production and is different from OPERA production `...evhyjm`.

Do not paste the service role key into frontend code. Do not commit keys.

## Vercel Environment Separation

Preview/development environment variables point to the shared dev Supabase project:

```text
VITE_SUPABASE_URL=<DEV_SUPABASE_URL>
VITE_SUPABASE_ANON_KEY=<DEV_SUPABASE_ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<DEV_SERVICE_ROLE_KEY>
```

Production environment variables must remain pointed to production Supabase.

`VITE_` variables are public browser variables. Only the anon key may be exposed through `VITE_`. Service role keys must be server-side only.

After changing Preview/development env values, redeploy the development app only and verify masked refs from:

- `https://project-rui1d-development.vercel.app`
- `https://project-rui1d.vercel.app`

They are currently different. SQL is still blocked until the Controller approves the exact additive migration and confirms it is safe for the shared development database.

## Local Development Environment

Use `.env.development` locally after the dev Supabase project exists.

Do not commit:

- `.env`
- `.env.local`
- `.env.development`
- `.env.production`
- any file containing real keys

Use `.env.development.example` as the safe placeholder template.

## Migration Strategy For New Dev Database

Recommended approach: schema-only plus safe demo data.

Option A: Fresh dev schema

- Apply required app migrations to the dev Supabase project only.
- Use no real production data.
- Create safe demo data.

Option B: Production-like dev

- Export schema only from production.
- Import schema into dev.
- Add safe demo company/users/projects/tasks.
- Do not copy real employee/customer/receipt/photo data unless Controller explicitly approves.

Before running migrations on dev:

- confirm dev Supabase URL differs from production URL
- confirm dev project ref differs
- confirm development Vercel uses dev ref
- confirm production Vercel still uses production ref
- confirm SQL is additive only
- confirm the migration runner target is the dev project
- record the approval/time/operator in `MASTER_DEVELOPMENT_REPORT.md`

## Migration Runbook

When the dev project exists:

1. Confirm current branch is `develop`.
2. Confirm the migration target project ref is the dev ref.
3. Confirm production ref is different.
4. Run a build before SQL.
5. Run only reviewed additive migrations.
6. Verify tables/columns exist in dev.
7. Seed only demo data.
8. Redeploy development only.
9. Smoke test login, Clock, Schedule, Timesheets, Reports, Photos, Receipts, and More on development.
10. Verify production app still loads and still references production Supabase.

Rollback for dev mistakes:

- Stop further SQL immediately.
- Disable development deployment if it points to the wrong project.
- Restore Preview env values to the approved dev Supabase project.
- Recreate the dev database if needed.
- Do not touch production without separate Controller approval and backup/export plan.

## Demo Data Plan

Create safe demo data in development only:

- Demo company: `Ottawa Renovation Pro Demo`
- Demo owner/admin user
- Demo supervisor user
- Demo employee user
- Projects:
  - `905`
  - `Euphoria`
  - `Test Project`
- Tasks:
  - `drywall`
  - `framing`
  - `mudding`
  - `receipts/materials`

Do not copy real production data unless Controller explicitly approves.

## B.2 Pending SQL Review

Pending migration:

- `supabase/migrations/20260611120000_create_daily_report_logs.sql`

Review result:

- additive only
- uses `create table if not exists`
- uses `create index if not exists`
- no `DROP`
- no `DELETE`
- no `TRUNCATE`
- no reset
- no destructive alter
- existing data untouched

Do not run this migration until the development Supabase project is separate and confirmed.

## B.2 Production Readiness Gate - 2026-06-26

Current linked development project:

- `bridge-app-dev`
- masked ref: `...jjwbut`

Current production/older clock project:

- masked ref: `...evhyjm`

Codex confirmed:

- Supabase CLI login works.
- Local Supabase link points to `bridge-app-dev`.
- B.2 migration safety scan passes for the 202606 migration set.
- No production SQL has been run.
- `npm run verify:b2-dev` currently fails because B.2 tables are not present in `bridge-app-dev`.
- `npx supabase db push --dry-run` currently cannot run because `SUPABASE_DB_PASSWORD` is missing or invalid for `bridge-app-dev`.

Required next command sequence after the development database password is available:

```powershell
$env:SUPABASE_DB_PASSWORD="<bridge-app-dev database password>"
npm.cmd run verify:migrations
npx.cmd supabase db push --dry-run
npx.cmd supabase db push
npm.cmd run verify:b2-dev
npm.cmd run verify:release
```

Rules:

- Use the development database password for `bridge-app-dev` only.
- Do not use the production database password for development verification.
- Do not run production SQL until a separate production backup/checkpoint and controller approval exist.
- If `verify:b2-dev` fails, do not merge to production.
