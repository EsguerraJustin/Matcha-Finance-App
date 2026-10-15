# Matcha Wallet

A **fully offline** personal finance app for students — expenses, budgets,
allowance and grocery trips, in a soft pastel matcha-green glassmorphism UI
that feels like a native iPhone app.

> **Offline is the hard constraint.** No backend, no accounts, no cloud sync, no
> analytics, no crash reporting, no ads. The Android manifest does not even
> request the `INTERNET` permission. Everything lives in a local SQLite file on
> the device.

---

## Status

| Phase | Contents | State |
|---|---|---|
| **0 — Foundation** | Project scaffold, design tokens, bundled fonts, SQLite + migration runner, seed data, money/date helpers with unit tests, glass primitives, floating tab bar shell | Done |
| 1 — Expenses & History | Add-expense sheet, History v2, category manager | Next |
| 2 — Allowance & Budgets | Budgets, safe-to-spend, notifications, Home | Planned |
| 3 — Groceries | Lists, price memory, finish-trip | Planned |
| 4 — Reports & Insights | Charts, insight sentences, CSV/PDF export | Planned |
| 5 — Recurring, Goals, Safety | Recurring rules, savings goals, backup/restore, app lock | Planned |
| 6 — Polish | Accessibility pass, Matcha Night, performance, APK/AAB | Planned |

---

## Install & run

Requires **Node 20+** and either the Expo Go app or a native build.

```bash
npm install
npm start          # Metro; scan the QR with Expo Go
npm run android    # open on a connected device / emulator
npm run ios        # macOS only
```

## Tests & types

```bash
npm test           # Jest — money, dates, budget math (45 tests)
npm run typecheck  # tsc --noEmit
```

## Build an APK

```bash
# One-time: log in to Expo (needed for EAS-hosted builds)
npx eas login

# Preview build (internal testers)
npx eas build --platform android --profile preview

# Production build (APK + AAB), configure appVersionCode/owner in eas.json
npx eas build --platform android --profile production
```

For a fully local APK without EAS:

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

> Add `android.permission.INTERNET` removal check to your release checklist —
> `app.json` already blocks it via `android.blockedPermissions`.

---

## Project layout

```
app/                      Expo Router routes
  _layout.tsx             fonts → migrations → seed → settings → navigator
  (tabs)/                 Home · History · Groceries · Reports
  add-expense-sheet.tsx   Add/Edit expense sheet host
theme/                    design tokens (the exact brief values)
  colors.ts               matcha palette, category pastels, Matcha Night
  glass.ts                glassmorphism tokens + solid fallback resolution
  typography.ts           type scale, radii, 8-pt spacing, motion, layout
src/
  db/
    client.ts             connection, PRAGMAs, migration runner
    migrations/           001_init.sql + the ordered migration list
    repositories/         one repository file per table
    seed.ts               first-launch defaults
    settings.ts           typed settings contract
  lib/                    money.ts · date.ts · id.ts · haptics.ts  (pure, tested)
  state/                  Zustand UI stores only — data lives in SQLite
  hooks/                  useAppTheme (accessibility + glass resolution)
  components/
    glass/                AuroraBackground, GlassCard, GlassSheet, GlassTabBar,
                          GlassButton, GlassSegmented, GlassChip, GlassSurface
    ui/                   AppText, ScreenScaffold, LargeTitleHeader, EmptyState
__tests__/                Jest unit tests
```

### Where the rules live

- **Money is always integer centavos.** `src/lib/money.ts` is the only place
  that converts; `<MoneyText />` is the only thing that renders it.
- **Totals are always derived.** No running totals are ever stored
  (brief Section 9, rule 1).
- **Dates are `YYYY-MM-DD` in `Asia/Manila`.** `src/lib/date.ts` derives "today"
  from the device clock through `Intl.DateTimeFormat`, never from the host
  timezone.
- **Glass is budgeted.** At most ~4 `BlurView`s on screen, never one per list
  row. `GlassSurface` is the single blurred primitive.

---

## Accessibility & performance

- Works at **130 % font scale** (`maxFontSizeMultiplier` is capped there).
- **Reduce transparency** (iOS) or the in-app switch switches every surface to
  `glass.solidFallback` — fully readable with zero blur.
- **Reduce motion** disables spring animations.
- Touch targets ≥ 48 pt; text meets 4.5:1 against the *worst* backdrop spot.

---

## Acceptance spot-checks

- `weekly budget ₱1,000 − lunch ₱120 → remaining ₱880` — covered by
  `__tests__/date.test.ts`.
- Grocery finish-trip `Rice 2 kg @ ₱55 + Milk 1 L @ ₱85 → one ₱195 Groceries
  expense` — implemented in Phase 3.
- Grep the source for `fetch(`, `axios`, `XMLHttpRequest` or remote URLs: there
  are none.