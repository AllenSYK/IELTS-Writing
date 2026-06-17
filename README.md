# IELTS Writing Desktop

This repository packages an IELTS writing interface as an Electron desktop app with:

- Next.js app shell for the writing UI, settings page, and separate admin console.
- Electron activation window shown before the main app.
- Supabase PostgreSQL migration for license keys, devices, events, releases, and rate limits.
- Supabase Edge Functions for activation, validation, deactivation, admin key generation, and app update checks.
- electron-builder configuration for Windows installer, Windows portable build, and macOS Apple Silicon DMG.
- electron-updater integration for stable/beta release channels.

The original visual baseline is recorded in `docs/frontend-baseline.md`. The supplied `screen.png` contains the text `<FIFE Image failed to fetch>` and is kept as-is.

## Commands

```bash
npm install
npm run dev
npm run electron:dev
npm run build
npm run dist:win
npm run dist:portable
npm run dist:mac
npm run release
npm run supabase:migrate
npm run supabase:functions:deploy
```

## Required Configuration

Copy `.env.example` to `.env.local` for local web/server work and configure the same secrets in Supabase Edge Function secrets for production.

Generate ES256 token keys with:

```bash
node scripts/generate-signing-keys.mjs
```

Never commit the private key, Supabase service role key, code signing certificates, or AI provider keys.

## Desktop Startup

On startup Electron:

1. Enforces a single app instance.
2. Validates the encrypted local license token with the configured license server.
3. Shows the independent activation window if no valid license exists.
4. Starts the bundled Next.js server on `127.0.0.1` using an available port after validation.
5. Opens the main writing UI.
6. Revalidates every 6 hours and checks updates after successful validation.

## Important Limits

The local environment used to prepare this project did not include `npm`, `pnpm`, `yarn`, or the Supabase CLI in PATH, so dependencies and desktop installers could not be built locally here. The source, scripts, and GitHub Actions are prepared for a normal Node/npm environment.
