# Test Results

## Completed Static Checks

- Current project contents were inspected before edits.
- `DESIGN.md` was copied to `docs/frontend-baseline.md` as the visual baseline.
- The provided `screen.png` was inspected and contains only `<FIFE Image failed to fetch>`, so no visual screenshot comparison was possible from that file.
- Supabase changelog and RLS/Edge Function docs were checked before creating schema and functions:
  - https://supabase.com/changelog.md
  - https://supabase.com/docs/guides/functions
  - https://supabase.com/docs/guides/database/postgres/row-level-security

## Not Completed Locally

The local shell did not provide `npm`, `pnpm`, `yarn`, `bun`, or `supabase`, so these commands could not be executed in this environment:

- `npm install`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run electron:dev`
- `npm run dist:win`
- `npm run dist:portable`
- `npm run dist:mac`
- `supabase db push`
- `supabase functions deploy`

## Manual Scenarios to Run After Configuration

1. New activation code first activation.
2. Invalid activation code.
3. Expired activation code.
4. Suspended activation code.
5. Revoked activation code.
6. Device limit exceeded.
7. Admin device deactivation and reactivation.
8. Admin expiry extension.
9. Local clock modification.
10. Offline startup.
11. Temporary license server outage.
12. Same device repeated activation.
13. Portable folder copied to another device.
14. Local license file tampering.
15. Direct call to protected AI endpoint.
16. Auto update from an older version.
17. Forced update.
18. Failed update download.
19. License remains valid after update.
20. Visual comparison with `docs/frontend-baseline.md`.
