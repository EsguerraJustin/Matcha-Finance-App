# Matcha Wallet — Development Guide

> **The single source of truth** for how this codebase works, how to extend it,
> and what rules must never be broken. Every task in `TASKS.md` references
> sections here.

---

## 1  Identity

| Field | Value |
|---|---|
| Name | **Matcha Wallet** |
| Bundle | `com.matchawallet.app` |
| Scheme | `matchawallet` |
| Target | Android phone (no tablet, no iOS-only APIs) |
| Locale | Philippines — `₱`, `Asia/Manila`, integer centavos |
| Constraint | **Fully offline.** Zero network calls, zero `INTERNET` permission. |

---

## 2  Stack

| Layer | Library | Version |
|---|---|---|
| Framework | Expo SDK 57, managed workflow | 57.x |
| Runtime | React Native 0.86 · React 19 | — |
| Language | TypeScript 6 — `strict`, `noUnusedLocals`, `noUnusedParameters` | — |
| Router | `expo-router` (file-based) | 5.x |
| Database | `expo-sqlite` — single file, WAL mode | — |
| State | **Zustand** for UI state only; data lives in SQLite | — |
| Dates | `date-fns` + `Intl.DateTimeFormat` in `Asia/Manila` | — |
| Icons | `lucide-react-native` | — |
| Sheets | `@gorhom/bottom-sheet` | — |
| Fonts | Bundled Inter (400/500/600/700) via `@expo-google-fonts/inter` | — |
| Animations | `react-native-reanimated` | — |

### Known RN 0.86 gotchas

- `StyleSheet.absoluteFillObject` — **removed**. Use `StyleSheet.absoluteFill`.
- `BlurView.blurAmount` — **removed**. Use `intensity`.
- `expo-router` `Tabs` — **deprecated**. Use `import { Tabs } from 'expo-router/js-tabs'`.
- `AccessibilityInfo.colorSchemeChanged` — does not exist. Use `useColorScheme()`.
- `expo-file-system` SDK 57 API: `new File(…).copy(dest, { overwrite: true })`, `.text()`, `.write()`, `Directory(Paths.document, …)`.
- `expo-notifications` triggers: `SchedulableTriggerInputTypes.DAILY|DATE` with `channelId`.
- `babel.config.js` must keep `react-native-worklets/plugin` **last**.
- `react-native-gesture-handler` `ReanimatedSwipeable` (2.32.0) — the **hidden
  opposite action container swallows taps on Android**. Both action containers
  are `StyleSheet.absoluteFill`, `rightElement` renders after `leftElement`
  (so it sits on top in z-order), and the hidden side animates only `opacity`
  — an opacity-0 view still receives touches. Upstream issue **#3223** (PR
  #4192 unmerged). `app/(tabs)/history.tsx` therefore keeps **both** press
  targets as `position: absolute` strips inside the *right* container: row
  content covers them while closed, and each is exposed exactly when its own
  side opens. Moving a target into the visually-revealed container makes it go
  dead again — see DECISIONS `P6-33`.
- **Anything rendered inline inside a tab scene sits *under* the floating tab
  bar.** `BottomTabView` renders the custom `tabBar` after the scenes, and
  `GlassTabBar` has Android elevation 6/8 — its pill and Add orb cover
  in-scene overlays, and taps there hit the bar (tab switch / Add sheet)
  instead of the control. Any future in-scene sheet or floating action bar
  must mirror its open flag into `src/state/sheetOverlayStore.ts` (see
  `app/(tabs)/history.tsx`, which does this for both the filter sheet and bulk
  selection) so `GlassTabBar` hides while it is up. Root-route sheets don't
  need this — they push above the tab shell. **The flag must also clear when
  the scene loses focus or back closes the overlay**: Android back popped the
  History scene with the filter sheet still mounted, so `sheetOverlayStore.open`
  stayed `true` and the bar disappeared app-wide until restart. Every overlay
  now resolves back itself via `src/lib/backPress.ts` (`resolveOverlayBack`:
  close sheet → clear selection → pass through; sheet wins), and `history.tsx`
  clears both flags in a `useFocusEffect` cleanup on blur. Root-route sheets
  (Add expense, grocery item) register their own `BackHandler` while open in
  `GlassSheet` — back closes the sheet instead of popping the route. RN
  `BackHandler` is LIFO, so register after navigation (i.e. inside the
  component, not at module load). See DECISIONS `P6-35`, `P6-36`, `P6-38`.
- **Boolean repo filters must not conflate the two conditions.**
  `listCategories` required `!includeArchived && !typeArchived`, so asking for
  archived rows dropped *all* types (`0 types` everywhere). The pattern is
  `includeArchived || rowArchived !== 1` — see DECISIONS `P6-37`.

### Environment notes

- `npx expo install` fails in this environment (`EALLOWSCRIPTS`); install with `npm install <pkg>@<version>` using the version from `node_modules/expo/bundledNativeModules.json`.
- **Gradle must run on JDK 21, not JDK 24.** JDK 24 prints `WARNING: A restricted method in java.lang.System has been called` on stderr, and Android Gradle Plugin's prefab/CMake task treats *any* stderr warning as fatal — `configureCMakeRelWithDebInfo` for `react-native-worklets` and `react-native-screens` fails with that warning as the only message. Build with:
  ```powershell
  cd android
  $env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
  .\gradlew.bat assembleRelease
  ```
  JDK 21 lives in `C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot`; `java` on `PATH` already resolves there, but `JAVA_HOME` points at `C:\Program Files\Java\jdk-24`, which Gradle uses instead.
- Git is local-only, user `Matcha Wallet Dev <dev@matchawallet.local>`.
- `.claude/`, `.kilo/`, `.playwright-mcp/`, `dist-web/`, `android/`, `dist/`, `.expo/` are gitignored.
- `dist-web/` is a dev-only web export for visual verification; it is **not** a supported distribution (Android only).
- Jest prints a harmless "worker process has failed to exit gracefully" warning after passing — ignore it.

---

## 3  Project layout

```
app/                        Expo Router file-based routes
  _layout.tsx               Root: fonts → migrations → seed → settings → boot → navigator + app lock
  (tabs)/                   Home · History · Groceries · Reports
    _layout.tsx             GlassTabBar + tab definitions
  add-expense-sheet.tsx     Add/Edit expense sheet (numpad, chips, receipt)
  allowance.tsx             Money-in entries + recurring allowance setup
  budgets.tsx               Create/list budgets, category limits, rollover
  goals.tsx                 Savings goals with progress ring
  grocery-list.tsx          Grocery list detail + finish-trip
  more.tsx                  Hub linking to all non-tab screens
  recently-deleted.tsx      Soft-deleted expenses (30-day grace)
  recurring.tsx             Recurring rules (auto-add / remind)
  +not-found.tsx            404 fallback
  settings/
    index.tsx               All settings: currency, cycles, theme, lock, reminders
    backup.tsx              Export/restore/erase
    categories.tsx          Category/type/payment method manager

theme/                      Design tokens (brief Section 4.1 exact values)
  colors.ts                 Matcha palette, category pastels, Matcha Night, Palette type, resolveTone()
  glass.ts                  Glassmorphism tokens + solid fallback resolver
  typography.ts             Type scale, radii, 8-pt spacing grid, layout constants

src/
  db/
    client.ts               SQLite connection, PRAGMAs, migration runner
    migrations/
      001_init.sql           Full schema (16 tables)
      index.ts               Ordered migration list
    repositories/            One file per table (CRUD + queries)
    seed.ts                  First-launch default categories/types/methods
    settings.ts              Typed settings contract (SettingsShape, parsers, serializers)
    boot.ts                  Boot routine (purge, catch-up, thresholds, reminders)
    seedPerf.ts              __DEV__-only 5,000-expense perf seed
  lib/                       Pure logic (no React, no DB access)
    money.ts                 Integer-centavo arithmetic, formatting
    date.ts                  Asia/Manila YYYY-MM-DD helpers, week/month ranges
    id.ts                    UUID v4 via expo-crypto, seededId()
    haptics.ts               Expo Haptics wrappers
    expenses.ts              Filter state, toggleInList
    budgets.ts               Budget math, threshold logic, summaries
    groceries.ts             Item totals, finish-trip breakdown
    recurring.ts             dueOccurrences, advanceNextDue, MAX_CATCH_UP
    reports.ts               Period aggregation, insights, CSV generation
    receipts.ts              Image compress/persist/delete
    notifications.ts         Stable-id local notifications (daily, backup, budget, bill)
    appLock.ts               PIN hash/verify, biometric check
    backup.ts                FS I/O for export/restore/erase
    backupFormat.ts          Pure shape + validation (no FS, no SQLite)
  state/                     Zustand stores (UI state only)
    dbStore.ts               DB ref + reactive query hook (useDbQuery)
    settingsStore.ts         Hydrated settings from SQLite
    addExpenseStore.ts       Route-backed sheet open/close (push/pop + reset), editing target
    toastStore.ts            Global toast state
  hooks/
    useAppTheme.ts           Accessibility prefs + glass resolution + palette
  components/
    AppLockScreen.tsx        PIN + biometric unlock overlay
    glass/                   AuroraBackground (root + `BackdropLayers` per screen), GlassCard, GlassSheet,
                             GlassTabBar, GlassButton, GlassSegmented, GlassChip, GlassSurface
    ui/                      AppText, MoneyText, ScreenScaffold (opaque per-screen backdrop), LargeTitleHeader,
                             EmptyState, GlassInput, ProgressBar, ProgressRing, Toast
    expense/                 AmountNumpad, ChipRow, FilterSheet, BulkActionBar, ExpenseRow

__tests__/                   Jest unit tests
metro.config.js             .wasm registered as an asset so the web export bundles expo-sqlite's worker (dev harness only)
```

---

## 4  Architecture rules

### 4.1  Money

- **Always integer centavos.** No floats anywhere in data or calculations.
- `src/lib/money.ts` is the only parser (`parseAmountToCents`).
- `<MoneyText />` is the only renderer.
- Thousands group with a **thin space** (`\u2009`, e.g. `₱1 000.00`), never a comma; the parser strips `\s` so pasted `₱1,000.00` and `₱1 000.00` both round-trip.

### 4.2  Dates

- Calendar dates are **`YYYY-MM-DD` strings in Asia/Manila**, derived via `Intl.DateTimeFormat`.
- Timestamps are ISO-8601 UTC strings.
- All helpers live in `src/lib/date.ts` — never use `new Date().toISOString().slice(0,10)`.
- Date **inputs** are never free text: use `GlassDatePickerField` (`src/components/ui/GlassDatePickerField.tsx`) — native calendar dialog on Android, compact picker on iOS, `allowClear` for optional dates. It takes/returns the same `YYYY-MM-DD` string; `isoToLocalDate` in `date.ts` converts for the picker.
- Times use the same rule: Settings → Delivery time keeps preset segments plus a **Custom** segment that mounts `DateTimePicker` (`mode="time"`) and stores `HH:MM` (see DECISIONS `P6-44`); `formatClockTime` in `date.ts` renders stored times as 12-hour labels.

### 4.3  Glass budget

- At most **~4 visible `BlurView`s** on screen at once.
- Never place a BlurView inside another blurred surface.
- `GlassSurface` is the single blurred primitive; list rows use plain translucent fills with hairline dividers.
- Blur is disabled when: device API < 31 (Android), user toggles "Reduce transparency", or OS reports reduce-transparency.
- **Sheens are tint-aware and never over an opaque fill.** `GlassSurface`'s diagonal sheen sits at 0.12 (dark) / 0.28 (light) — never the old untinted 0.50, which read as a grey band across the card. `GlassTabBar` skips its sheen entirely while `solidGlass` (Reduce transparency) is on, because a "highlight" over a solid pastel is just a grey block behind the active tab. Orb/button sheens are exempt (they are accents, not fills). See DECISIONS `P6-43`.
- **Bottom sheets mount only while open.** `@gorhom/bottom-sheet@5.2.14` keeps `DEFAULT_ENABLE_TOUCH_THROUGH=false`, so a sheet that stays mounted holds its backdrop at index −1 with `pointerEvents="auto"` and swallows every tap on the route. Render `{open ? <Sheet …/> : null}` (see `ItemSheet` in `grocery-list.tsx`, `FilterSheet`).

### 4.4  Text rendering

- **No raw RN `<Text>`.** Use `<AppText>` or `<MoneyText>` — they set `maxFontSizeMultiplier={1.3}` and resolve palette colour.
- Exception: glass primitives (`GlassButton`, `GlassChip`, `GlassSegmented`, `GlassTabBar`) use RN `Text` internally because they are leaf components with their own sizing logic — all of them still cap at `maxFontSizeMultiplier={1.3}`.

### 4.5  Dark mode

- `theme/colors.ts` exports `lightPalette` and `darkPalette` (type `Palette`).
- `Palette` carries the semantic fields (`text`, `textMuted`, `emphasis`, `divider`, `primary`, `onPrimary`, `dangerText`, `dangerBg`, `successText`, `warningText`, `warningBg`) so banners and badges stay legible in Matcha Night. `warningBg` is a light amber pastel in light mode and a 15 % amber overlay on dark.
- `resolveTone(color, palette)` maps a static light-theme token (e.g. `colors.matcha700`) to the equivalent semantic colour for the active palette.
- `<AppText>` calls `resolveTone` automatically on its `color` prop.
- For **icons and non-text colours**, use `palette.emphasis`, `palette.textMuted`, `palette.dangerText`, etc., obtained via `useAppTheme()` or `usePalette()`.
- Components that only need colours (no glass) should use `usePalette()` for a lighter hook.
- **Backdrop layering.** React Navigation's default theme paints a light `rgb(242,242,242)` behind every screen and would hide the aurora; the root layout wraps the navigator in a transparent `ThemeProvider` (background and card are `transparent`) and each `ScreenScaffold` paints its own opaque backdrop (`BackdropLayers` inside the scaffold) with the palette background beneath. On web, inactive tab scenes stay mounted below the active one (`z-index: -1`), so only an opaque screen background can hide them; on Android the tab scenes detach, and the root `<AuroraBackground />` remains as a belt-and-braces fill behind everything. Non-text colours inside glass surfaces must still work over a dark gradient — pastel chips stay light in both themes by design.

### 4.6  Accessibility

- Every `<Pressable>` must have `accessibilityRole` and `accessibilityLabel` within 15 lines.
- Touch targets ≥ 48 pt. Small elements use `hitSlop` to pad to 48.
- `reduceMotion` disables springs; `reduceTransparency` switches to solid glass fallback.

### 4.7  Offline

- **Zero network calls.** No `fetch()`, `axios`, `XMLHttpRequest`, `https://` URLs.
- `app.json` sets `updates.enabled: false` and `checkAutomatically: "NEVER"`, so Expo never reaches the update server.
- No console.log/warn/error in shipped code (except behind `__DEV__`).
- No TODO/FIXME/XXX comments.

### 4.8  Notifications

- Every notification has a **stable string identifier** (e.g. `matcha.daily-reminder`, `matcha.budget.<id>.<threshold>`).
- Scheduling always **cancels the old one first** via `scheduleReplacing()` — no stacking on repeated boots.

### 4.9  Settings

- Settings live in the `settings(key, value)` SQLite table — no AsyncStorage, no preferences service.
- `src/db/settings.ts` is the typed contract: `SettingsShape`, parsers, serializers.
- The Zustand `settingsStore` hydrates from SQLite on boot and writes back on each change.

---

## 5  Commit conventions

- Phases land as `phase-N: <short description>`; follow-up fixes for a shipped phase land as separate `phase-N: ...` commits.
- Every commit must pass `npx tsc --noEmit` and `npx jest`.
- Bundle must succeed: `npx expo export --platform android --no-bytecode`.
- `.claude/` and `.kilo/` are always excluded via `.gitignore`.

---

## 6  Testing

```bash
npm test           # Jest — 8 suites, 157 tests
npm run typecheck  # tsc --noEmit (must be zero errors)
```

Tests cover: money formatting, date helpers, budget math, groceries, reports, recurring rules, backup format.

### Adding new tests

- Place in `__tests__/<feature>.test.ts`.
- Import from `src/lib/` (pure logic — no React, no DB).
- For DB-dependent logic, mock via the same patterns as `backup.test.ts`.

---

## 7  Build & release

```bash
# Local Android APK (no EAS)
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease

# EAS cloud builds
npx eas build --platform android --profile preview
npx eas build --platform android --profile production
```

Release checklist:
1. `npx tsc --noEmit` — zero errors
2. `npx jest` — all pass
3. `npx expo export --platform android --no-bytecode` — bundles
4. Confirm INTERNET permission is blocked in `app.json` → `android.blockedPermissions`
5. Confirm `expo-updates` is disabled (`updates.enabled: false` in `app.json`)
6. Grep for `fetch(`, `axios`, `console.log` — none found
7. Build the APK (JDK 21 — see §2 environment notes) and confirm the **merged**
   manifest is clean, not just `app.json`:
   ```powershell
   cd android
   $env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
   .\gradlew.bat assembleRelease
   # then inspect the merged manifest (note: the intermediate folder is
   # `merged_manifest`, and the final file sits under the task directory):
   Select-String -Path app\build\intermediates\merged_manifest\release\processReleaseMainManifest\AndroidManifest.xml -Pattern "uses-permission"
   ```
   Expected: `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`, `RECORD_AUDIO`
   and `SYSTEM_ALERT_WINDOW` are all absent (they carry `tools:node="remove"`).
   `SYSTEM_ALERT_WINDOW` ships in Expo's default manifest template and this app
   uses no overlay windows, so it is explicitly blocked in `app.json`.

### Visual verification (dev-only, web)

`npx expo export --platform web --no-bytecode` produces a browsable render for
an eyeball check of Light / Matcha Night across all screens. It is a **dev
harness, not a supported target** — the app ships for Android only. Serving it
requires COOP/COEP headers (e.g. a `serve.json` beside the export) or
`expo-sqlite`'s wa-sqlite worker never boots. The `metro.config.js` at the
repo root registers `.wasm` as an asset for exactly this. A visual check here
does **not** replace the Android build as the release gate.

---

## 8  Phase history

| Phase | Commit | Contents |
|---|---|---|
| 0 | `62ae4bc` | Foundation: tokens, glass primitives, SQLite + migrations, tab shell |
| 1 | `8886c64` | Expenses: add sheet, history v2, category manager |
| 2 | `174f4eb` | Allowance, budgets, safe-to-spend, thresholds, recurring, goals |
| 3 | `276f8fb` | Groceries: lists, price memory, finish-trip |
| 4 | `8b283a8` | Reports: period switcher, charts, insights, CSV |
| 5 | `f4baab7` | Safety: backup/restore, app lock, notifications, recently deleted |
| 6 | `2ab8c7f` → `7affc43` → `8d321a9` → `5b0f74f` → `a99ede2` → `1ce2b86` → `7c384b4` → `3164d38` → `21f8a30` → `27a99a7` → `0fe7d62` → `e5da3dd` | Polish: dark mode, accessibility, hitSlop, keyboard handling; Matcha Night wired incl. per-screen backdrop; release hardening (blocked permissions, `eas.json`, JDK 21 build); Home layout compaction; on-device UAT flaw sweep (DECISIONS `P6-23`…`P6-30`); extended UAT fixes — swipe sides/icon, dead delete tap, budget attachment (`P6-31`…`P6-34`); tab bar hidden during in-scene sheets + bulk selection, archived types filter (`P6-35`…`P6-37`); Android back per-overlay resolver (flaw 16, `P6-38`); screenshot flaw sweep — keyboard avoidance, sheet chip swipes, native date pickers (flaws 17–19, `P6-39`…`P6-41`) |

---

## 9  Key files to know

| What | Where |
|---|---|
| Design tokens (exact brief values) | `theme/colors.ts`, `theme/glass.ts`, `theme/typography.ts` |
| Palette + dark mode resolver | `theme/colors.ts` → `Palette`, `resolveTone()` (incl. `warningBg`) |
| Opaque per-screen backdrop | `src/components/ui/ScreenScaffold.tsx` + `BackdropLayers` in `src/components/glass/AuroraBackground.tsx` |
| Transparent navigator theme | `app/_layout.tsx` → `ThemeProvider` + `DefaultTheme`/`DarkTheme` overridden (`background`, `card`) |
| Glass accessibility resolution | `src/hooks/useAppTheme.ts` |
| Keyboard avoidance (screens + sheets) | `src/components/ui/ScreenScaffold.tsx` (KAV `height`) · `src/components/glass/GlassSheet.tsx` (`keyboardBehavior="interactive"`, `SheetFieldContext` → `BottomSheetTextInput`) |
| Sheet pan vs. chip swipes | `src/components/glass/GlassSheet.tsx` → `failOffsetX` + `activeOffsetY` (must be paired — see DECISIONS `P6-40`) |
| Date input fields | `src/components/ui/GlassDatePickerField.tsx` · `isoToLocalDate` in `src/lib/date.ts` |
| One-tap adds (Home quick templates) | `app/(tabs)/index.tsx` (Add tile + long-press) → `src/components/QuickTemplateSheet.tsx` (create/edit/remove, toast-confirm delete) → `src/db/repositories/quickTemplatesRepo.ts` |
| Boot sequence | `app/_layout.tsx` → `src/db/boot.ts` |
| Notification scheduling | `src/lib/notifications.ts` (stable IDs, cancel-before-schedule) |
| Backup format | `src/lib/backupFormat.ts` (pure) · `src/lib/backup.ts` (FS+SQLite I/O) |
| Settings contract | `src/db/settings.ts` → `SettingsShape` |
| Migration schema | `src/db/migrations/001_init.sql` (16 tables) |
