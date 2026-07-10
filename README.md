# READ THIS FIRST - OPERA.AI / CLOCK APP SAFETY RULES

Every Codex agent, developer, or new app setup must read this section before doing any work.

## Protected Production App And Database

- Do not touch the OPERA.AI / Clock App production database unless the Controller gives explicit production approval.
- Do not run SQL on production unless there is an approved production SQL gate, backup, preflight row counts, and postflight verification.
- Do not use the production app links for new apps, experiments, previews, or unrelated deployments.
- Do not overwrite, re-alias, or redeploy these protected Clock App URLs for any new app:
  - Production: https://project-rui1d.vercel.app
  - Development: https://project-rui1d-development.vercel.app
- Do not point a development build at the production Supabase database.
- Do not copy production data into a new app unless the Controller explicitly approves a privacy-safe export/import plan.

## Development Database Rule

- New apps and new development work must use the shared Bridge App development Supabase database unless the Controller creates a separate database for that app.
- Do not create a random new Supabase database for a new app without Controller approval.
- Do not connect a new app to the OPERA.AI / Clock App production database.
- The default database for new apps is the Bridge App shared development database.
- The current shared development Supabase project ref is:
  - `jvlxahskximvbajjwbut`
- Treat the OPERA.AI production Supabase project as protected and separate:
  - `vunwijmdewrlsrevhyjm`
- If the target database is unclear, stop and report before running any SQL, migration, seed, or data operation.

## Vercel Deployment Rule

- New apps must get their own Vercel project and their own unique preview/production links.
- Do not reuse OPERA.AI / Clock App Vercel project links for a different app.
- Do not alias any new app to:
  - `project-rui1d.vercel.app`
  - `project-rui1d-development.vercel.app`
- Before deployment, confirm:
  - app name
  - Vercel project name
  - target environment
  - Supabase project ref
  - whether the URL is new and not already used by production or another development app

## Workspace Rule

- Do not build unrelated new apps inside this Clock App workspace.
- Create a new workspace folder for every new app.
- Keep OPERA.AI / Clock App work inside:
  - `C:\Users\samra\clock-app`
- New app work must use a separate folder, for example:
  - `C:\Users\samra\<new-app-name>`
- Do not add unrelated app folders, MCP projects, QuickBooks tools, or personal scripts into the Clock App repository.

## AI / ChatGPT API Key Rule

- Do not print, commit, or expose API keys.
- Do not put OpenAI or ChatGPT API keys in frontend variables such as `VITE_OPENAI_API_KEY`.
- AI keys must be server-side only, such as `OPENAI_API_KEY` in the correct Vercel environment.
- New apps must use the approved shared ChatGPT/OpenAI API resource configuration.
- Do not create a separate random ChatGPT/OpenAI key for a new app unless the Controller approves it.
- Use the Bridge App shared/common AI resource when available.
- If an AI key is missing, report that it is missing by name only. Never ask the user to paste secrets into chat.

## Environment Safety Checklist

Before coding, deploying, or running migrations, confirm:

1. Which app is being worked on.
2. Which workspace folder is being used.
3. Which Git branch is active.
4. Which Supabase project ref is targeted.
5. Which Vercel project/link is targeted.
6. Whether the task is development-only or production-approved.
7. Whether SQL is required.
8. Whether a backup is required.
9. Whether any secret/env file is at risk of being committed.

If any answer is uncertain, stop and ask the Controller.

---

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
