# License Admin Guide

The admin console is available at `/admin` and is separate from the student writing UI. Login is verified by the `admin-license` Supabase Edge Function, then protected locally by an HTTP-only signed session cookie.

## Create Licenses

The console supports:

- Single license generation.
- Bulk license generation.
- Plan name.
- 1, 7, 30, 90, 180, 365 day durations.
- Permanent and custom-day durations.
- First-activation start.
- Max device count.
- Max activation count.
- Auto-update permission.
- Admin notes.

Full activation codes are displayed only immediately after creation. After refresh, only masked values remain.

## Operate Licenses

From the table, an administrator can:

- Search by masked key, plan, or note.
- Filter by status.
- Export visible rows as CSV.
- Suspend visible rows in bulk.
- Revoke visible rows in bulk.
- Set a single key active, suspended, or revoked.
- Edit expiry with an ISO date/time.
- Deactivate a device.
- Reset all active devices for a key.

## Publish Releases

The release form writes to `app_releases`. The update Edge Function returns the newest published release matching:

- channel: `stable` or `beta`
- platform: `win32` or `darwin`
- architecture: `x64` or `arm64`

Set `mandatory` for forced updates. Release assets should be uploaded by `npm run release:mac -- <version>`, which asks `admin-license` for signed Supabase Storage upload URLs and then writes the `app_releases` row.

## Required Secrets

Browser code must not contain service role keys, admin edge secrets, database passwords, license private keys, GitHub tokens, Apple credentials, or AI API keys.

Supabase Edge Function secrets:

- `SUPABASE_SERVICE_ROLE_KEY`
- `LICENSE_TOKEN_PRIVATE_KEY_PEM`
- `LICENSE_KEY_PEPPER`
- `ADMIN_PASSWORD` or `ADMIN_PASSWORD_SHA256`
- `ADMIN_EDGE_SECRET`
- `RELEASE_BUCKET`

Next.js server/admin proxy:

- `ADMIN_SESSION_SECRET`
- `ADMIN_LICENSE_FUNCTION_URL`
- `ADMIN_EDGE_SECRET`

Release machine only, in `.env.release.local`:

- `ADMIN_LICENSE_FUNCTION_URL`
- `ADMIN_EDGE_SECRET`
- `RELEASE_CHANNEL`
- `RELEASE_ARCHITECTURE`
- `MINIMUM_SUPPORTED_VERSION`
- `RELEASE_NOTES`
