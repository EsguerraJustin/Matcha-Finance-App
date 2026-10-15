# DECISIONS

Assumptions and choices made while building **Matcha Wallet**. Every entry is a
decision the brief left open ("pick the sensible default and keep going").

---

## Global

| # | Decision | Why |
|---|---|---|
| G1 | Working name kept as **Matcha Wallet**, bundle id `com.matchawallet.app`, scheme `matchawallet`. | The brief calls the name a working one and says rename freely. Easy to change in `app.json`. |
| G2 | **Expo SDK 57**, React Native 0.86.3, React 19.2.3, TypeScript 6 (`strict` + `noUnusedLocals` / `noUnusedParameters`). | Current stable at build time. |
| G3 | `npx expo install` was unusable in this environment (npm 11 rejects `--allow-scripts` in project-scoped installs), so dependencies were installed directly with the exact versions from Expo's `bundledNativeModules.json`. A project-local `.npmrc` with `allow-scripts=true` makes the rest work. | Environment issue, not a stack choice. |
| G4 | Folder layout: `app/` (routes) · `theme/` (tokens) · `src/` (db, lib, state, hooks, components) · `__tests__/`. | The deliverable list asks for `theme/colors.ts` specifically, so the token folder sits at the repo root rather than under `src/`. |
| G5 | All ids are **text UUID v4** (`expo-crypto`), except seed rows which use deterministic `seededId()` hashes so re-seeding is idempotent. | Brief allows either; text UUIDs survive a future import/export round trip. |
| G6 | Money is **integer centavos** everywhere, parsed with string arithmetic (no floats) and formatted through one `formatMoney()` / `<MoneyText />`. | Brief's money rule. |
| G7 | Migrations use `PRAGMA user_version` (built into SQLite) rather than a row in `settings`, because `settings` itself is created by migration 001. | Avoids the chicken-and-egg problem. |
| G8 | `.sql` migration files are inlined at build time by `babel-plugin-inline-import`. | Keeps real, editable `.sql` files (brief requirement) while still letting Metro and Jest consume them. |
| G9 | `android.blockedPermissions` strips `INTERNET`, `ACCESS_NETWORK_STATE` and `ACCESS_WIFI_STATE`. | Brief Section 2: the manifest must not request INTERNET. |

## Phase 0 — Foundation

| # | Decision | Why |
|---|---|---|
| P0-1 | Glass surfaces blur at **one** intensity level (resolved from the user's Low/Medium/High setting, default medium) rather than per-card buckets. | The brief's performance budget is ~4 visible `BlurView`s; a single knob makes that budget enforceable. `GlassSurface`'s `level` prop only scales that base value. |
| P0-2 | `resolveGlass()` returns a **solid fallback** when blur is unsupported, the OS "Reduce transparency" is on (iOS), or the user turns on the in-app switch. When solid, the top-edge sheen is dropped too. | Brief: the app must look polished with zero blur, not merely readable. |
| P0-3 | Android blur is only enabled on **API 31+**; below that the solid fallback renders. | Android's `RenderEffect` blur does not exist earlier, and the old implementations were too slow for a scrolling list. |
| P0-4 | Default theme is **light**; "Matcha Night" ships in Phase 6 as specified. `theme` already stores `light \| dark \| system` so the switch is ready. | Brief Section 4.4. |
| P0-5 | The custom numpad treats **every digit as a centavo** (`5` → ₱0.05, `85` → ₱0.85, `8550` → ₱85.50). | Standard money-keypad behaviour and it keeps one integer the whole way through. Covered by unit tests. |
| P0-6 | "Month starts on day X" clamps to the last day of short months (start-on-the-31st means "start on the last day"). | A cycle must always contain the date it was asked about — asserted as a property test across 7 start days. |
| P0-7 | Seed types for Shopping / Bills / Others (which the brief left unspecified): Shopping = Clothing, Personal care, Gadgets · Bills = Utilities, Internet, Phone load · Others = General. | The brief lists explicit types only for Food, Transportation, Groceries and School supplies. |
| P0-8 | Expo Router tabs use `expo-router/js-tabs` (the non-deprecated SDK 57 entry point) with `tabBar={props => <GlassTabBar {...props} />}`. | `import { Tabs } from 'expo-router'` is deprecated in SDK 57. |
| P0-9 | The Add orb is rendered by the tab bar itself and opens a Zustand-driven sheet route (`app/add-expense-sheet.tsx`), not a tab. | The orb must always sit centred; Phase 0 ships a placeholder sheet that Phase 1 fills in. |
| P0-10 | `maxFontSizeMultiplier` is capped at **1.3** on every text node. | Brief: support font scaling up to 130%. Past that the glass layouts stop holding. |
| P0-11 | Default payment method after seeding is **Cash**. | The sensible first default for a student budget app. Changeable in Settings. |