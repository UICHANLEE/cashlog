# Cashlog Implementation Plan

## Steps
1. Scaffold Vite + React + TypeScript and configure Vitest.
2. Add domain tests for mock photo analysis, expense creation, calendar data, and daily logs.
3. Implement `src/domain/cashlog.ts` as the stable product boundary.
4. Replace the starter UI with the Cashlog MVP screens.
5. Persist expenses to `localStorage`.
6. Verify with `npm test`, `npm run lint`, and `npm run build`.

## Test Coverage
- Domain tests cover the AI boundary, expense mapping, daily summary, filtering, totals, and calendar grid.
- UI tests cover the photo-based add flow and manual add flow.

## Future Implementation Notes
- Replace `analyzePhoto(file)` with a server-backed Vision API implementation.
- Replace `localStorage` with Supabase or Firebase when login and cross-device sync become necessary.
