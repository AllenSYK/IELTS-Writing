# Release and Auto Update

## Channels

Use Semantic Versioning, for example:

- `1.0.0`
- `1.0.1`
- `1.1.0`
- `2.0.0`

Normal users should use the `stable` channel. Test users can receive `beta`.

## Build Flow

Use one command from a clean working tree:

```bash
npm run release:mac -- 1.0.1 --notes "Release notes" --mandatory
```

The script:

1. Validates the version and clean Git state.
2. Updates `package.json` and `package-lock.json`.
3. Runs typecheck and build.
4. Builds macOS arm64 DMG and ZIP.
5. Verifies DMG, ZIP, `latest-mac.yml`, and blockmaps.
6. Computes SHA-512.
7. Gets signed upload URLs from `admin-license`.
8. Uploads release files to Supabase Storage.
9. Publishes the `app_releases` row only after upload succeeds.

## Client Behavior

The desktop app checks for updates only after license validation succeeds. It waits 10-20 seconds after startup, then checks every 6 hours. Manual checks are available in the app menu and settings page.

Update discovery goes through the `app-update` Edge Function. Downloads and installation use `electron-updater` with the generic provider pointed at Supabase Storage metadata. The app-update response includes `metadataUrl`, `sha512`, `fileSize`, mandatory status, and minimum supported version.

The chosen storage scheme is Supabase Storage:

- Bucket: `ielts-app-updates`
- Public download path: `stable/darwin-arm64/latest-mac.yml`
- Uploads: release script requests short-lived signed upload URLs from `admin-license`
- No GitHub private token or Supabase service role key is embedded in the client

## Failure Safety

An update failure does not remove the existing app. User data, license tokens, logs, drafts, and caches live under Electron's standard `userData` directory, not the installation directory.

Before install, the renderer receives `aerowrite:save-drafts-before-update`, and the main process blocks restart while an AI evaluation IPC request is running.

## macOS Signing

The project is configured for hardened runtime and entitlements. Production silent update reliability requires:

- Developer ID Application certificate
- `CSC_LINK` / `CSC_KEY_PASSWORD` or local keychain identity
- Apple ID notarization credentials
- successful notarization stapling

Without those credentials, electron-builder can create local test DMG/ZIP/update metadata, but macOS production installs may show Gatekeeper prompts and automatic replacement behavior is limited.
