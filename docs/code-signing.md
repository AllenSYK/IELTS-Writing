# Code Signing

No certificates are committed to this repository.

## Windows

Configure GitHub Secrets:

- `WINDOWS_CERTIFICATE_BASE64`
- `WINDOWS_CERTIFICATE_PASSWORD`

electron-builder reads them through `CSC_LINK` and `CSC_KEY_PASSWORD` in `.github/workflows/build-desktop.yml`.

## macOS

Configure GitHub Secrets:

- `MACOS_CERTIFICATE_BASE64`
- `MACOS_CERTIFICATE_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

The macOS build uses hardened runtime and `build/entitlements.mac.plist`. Notarization requires valid Apple Developer credentials.

## Unsigned Test Builds

If no certificate secrets are set, development packages can still be built, but Windows SmartScreen and macOS Gatekeeper may show security warnings. Do not distribute unsigned builds as production releases.
