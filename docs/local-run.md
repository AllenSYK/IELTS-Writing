# Local Run

## Prerequisites

- Node.js 24 or newer.
- npm.
- Supabase CLI for migrations and Edge Function deployment.

## Setup

```bash
npm install
cp .env.example .env.local
node scripts/generate-signing-keys.mjs
```

Paste the generated public/private key values into `.env.local`. The private key is server-only.

## Web App

```bash
npm run dev
```

Open `http://127.0.0.1:3000`.

## Electron Development

```bash
npm run electron:dev
```

The activation window appears first. Set `LICENSE_SERVER_URL` in `.env.local` to your deployed Supabase `license` Edge Function URL.

## Production Build

```bash
npm run build
npm run dist:mac
npm run dist:win
npm run dist:portable
```

Cross-building Windows packages from macOS is not reliable. Use the included GitHub Actions workflow or a Windows machine for Windows installers.
