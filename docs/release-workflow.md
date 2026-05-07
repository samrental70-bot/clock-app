# OPERA.AI Release Workflow

## Apps

- Production / trial app: `main` branch, deployed with `npx.cmd vercel --prod`
- Development app: `develop` branch, deployed without `--prod` for testing

## Phone Installs

Production and development can both be installed on the same phone.

- Production installs as `OPERA.AI`
- Development installs as `OPERA.AI Development`
- Development uses separate PWA manifest and icon files

Use the production link for the team trial:

```text
https://project-rui1d.vercel.app
```

Use the latest development preview link for testing new changes before release.

## Rules

1. Build new features and fixes on `develop`.
2. Deploy `develop` to the development Vercel link for internal testing.
3. When stable, increment the app version.
4. Merge `develop` into `main`.
5. Deploy `main` to the production / trial app.

## Versioning

Use normal patch version increases for small fixes:

```powershell
npm.cmd version patch --no-git-tag-version
```

Use minor version increases for feature releases:

```powershell
npm.cmd version minor --no-git-tag-version
```

Commit the version change with the release:

```powershell
git add .
git commit -m "release vX.Y.Z"
```

## Development Deploy

```powershell
git checkout develop
npm.cmd run build
git push origin develop
npx.cmd vercel
```

## Production / Trial Deploy

```powershell
git checkout main
git merge develop
npm.cmd run build
git push origin main
npx.cmd vercel --prod
```

Current production / trial app:

```text
https://project-rui1d.vercel.app
```
