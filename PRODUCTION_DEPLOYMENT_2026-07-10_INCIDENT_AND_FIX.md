# OPERA.AI Production Deployment — Incident Caught and Fixed During Merge

Date: 2026-07-10

## Summary

During the final "deploy to production" step of this merge, verification caught a **live misconfiguration in Vercel's Production environment variables**: the app would have loaded normally with no visible error, while silently connecting to the **development** Supabase project instead of production. This was found and fixed before being left in that state, as part of the same deployment step — not a separate incident after the fact.

## What was wrong

Vercel's Production environment had `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` updated 1 day ago, but `VITE_SUPABASE_URL`, `SUPABASE_URL`, and `VITE_SUPABASE_PRODUCTION_PROJECT_REF` were 3 days stale and pointed at the **development** Supabase project (`jvlxahskximvbajjwbut`) instead of production (`vunwijmdewrlsrevhyjm`).

Because the app's own environment-mismatch guard (`src/lib/supabaseClient.js`) compares the *actual* connected project ref against an *expected* ref that itself comes from `VITE_SUPABASE_PRODUCTION_PROJECT_REF`, and both of those were wrong in the same (dev) direction, the guard saw no mismatch and let the app load normally — the failure mode was silent, not a visible error screen. Confirmed live: the first production deploy of this session rendered a normal login screen with zero errors, while its JS bundle contained only the development Supabase URL and made zero Supabase network calls until a user action (e.g. login) — at which point it would have authenticated against the wrong project entirely.

## How it was caught

Standard post-deploy verification for this session (matching the practice already used for every development deploy): fetched the live bundle and grepped for the Supabase URL baked into it, rather than assuming the deploy was correct because it returned HTTP 200. This is what surfaced the dev URL.

## Fix applied

1. Retrieved current, verified-correct production API keys directly from Supabase via the authenticated `supabase` CLI (`projects api-keys --project-ref vunwijmdewrlsrevhyjm`) rather than guessing or reusing a possibly-stale local file.
2. Removed the 6 stale Production environment variables in Vercel (`VITE_SUPABASE_URL`, `SUPABASE_URL`, `VITE_SUPABASE_PRODUCTION_PROJECT_REF`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) and re-added all 6 with the verified-correct production values via the Vercel API.
3. Redeployed to production so the corrected environment variables were baked into a fresh build.
4. Re-aliased `project-rui1d.vercel.app` (the primary production domain, which was also found to still be pointing at a deployment from 75 days ago and had not moved on the first deploy of this session either) to the corrected build.

## Verification after the fix

- Live bundle now contains only `https://vunwijmdewrlsrevhyjm.supabase.co` as its active Supabase connection URL.
- Loaded the live production site in a real browser: normal login screen, no guard error, `document.readyState: complete`.
- Submitted a harmless test login (fake credentials, no real account touched) and confirmed via live network inspection that the resulting `POST .../auth/v1/token?grant_type=password` request went to `vunwijmdewrlsrevhyjm.supabase.co` — the correct production project.
- API routes smoke-tested: `/api/chat` → 401, `/api/project-media` → 401, unknown route → 404 — all correctly gated, matching expected behavior.

## Note for the future

Two separate instances of "production URL correct, but the paired secret/ref pointed at dev" surfaced in this session (this Vercel Production env issue, and a local `.env.production.local` file with the same class of mistake, fixed earlier). Worth treating as a pattern: when refreshing one Supabase credential for an environment, refresh the paired URL/ref at the same time, and always verify the *actual connected project* post-deploy rather than only checking that the site returns 200.
