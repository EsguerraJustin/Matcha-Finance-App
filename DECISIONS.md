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

## Phase 1 — Expenses & History

| # | Decision | Why |
|---|---|---|
| P1-1 | Expense amounts use a **custom numpad** (no system keyboard); digits are centavos throughout. | Brief Section 6.1: speed-first entry. |
| P1-2 | Categories show as glass chips tinted with the category pastel; types appear underneath the chosen category. | iOS-style chip row from the brief. |
| P1-3 | Smart defaults: last-used payment method; category/type by time of day (e.g., 11–14 → Food/Lunch). | Brief Section 6.1. |
| P1-4 | Quick-add templates (favorites) persist in `quick_templates` table; one-tap from Home. | Brief Section 6.1. |
| P1-5 | History uses a single `GlassSurface` wrapping a `SectionList` — rows are plain translucent fills with hairline dividers, never one `BlurView` per row. | Performance budget: ~4 visible blurs, smooth with 5,000+ rows. |
| P1-6 | Swipe left = delete (with undo toast), swipe right = duplicate, long-press = bulk select. | Brief Section 4.3. |
| P1-7 | Soft delete (`deleted_at`), excluded from all totals; hard purge after 30 days on boot. | Business rule 10. |
| P1-8 | Categories/types/payment methods are user-editable (rename, recolor, reorder, archive); defaults are archivable but not deletable. | Brief Section 6.2. |

## Phase 2 — Allowance & Budgets

| # | Decision | Why |
|---|---|---|
| P2-1 | Allowance supports multiple entries per month + recurring rules (weekly/monthly/specific day) that auto-add on app open. | Brief Section 6.4. |
| P2-2 | Budgets: weekly/monthly/custom; per-category limits; rollover toggle; auto-create next week toggle. | Brief Section 6.3. |
| P2-3 | Safe-to-spend = `max(0, remaining) / max(1, days left)`; subtracts "set aside" savings contributions when enabled. | Brief Section 6.3, business rule 5. |
| P2-4 | Warning at 80%, exceeded at 100%; each fires once per budget and re-arms if spend drops back. Local notification on each threshold. | Business rule 4. |
| P2-5 | Savings goals: name, target, optional date, color; progress ring; optional "reduce safe-to-spend" toggle per goal. | Brief Section 6.8. |
| P2-6 | Recurring rules (expenses + allowances) catch up on app open (idempotent, cap 60); "auto" creates silently, "remind" shows notification. | Brief Section 6.7. |

## Phase 3 — Groceries

| # | Decision | Why |
|---|---|---|
| P3-1 | Grocery lists have store selector (from Settings' default stores + custom), quantity + unit, est/actual price. | Brief Section 6.5. |
| P3-2 | Price memory: normalised name + store + unit → last actual price; suggests on add. Singular/plural matched. | Brief Section 6.5. |
| P3-3 | Live running totals: estimated total, purchased total, to-buy estimate, remaining budget after trip; pastel warning if over. | Brief Section 6.5. |
| P3-4 | Finish trip creates **exactly one** Groceries expense (category Groceries, type = store if it matches); amount = sum of purchased items' actual (fallback est) × quantity. Unbought items carried to a new list. | Business rule 8. |
| P3-5 | Deleting a grocery-linked expense reopens the list (status → open) instead of orphaning. Undoing the delete re-completes it only if the list is still untouched. | Business rule 9. |
| P3-6 | Templates are just grocery lists with `is_template=1`; one tap duplicates items into a new open list. | Brief Section 6.5. |

## Phase 4 — Reports & Insights

| # | Decision | Why |
|---|---|---|
| P4-1 | Period switcher: Day / Week / Month / Custom (30 days); every chart/number derives from expenses in that range. | Brief Section 6.9. |
| P4-2 | Charts: category donut, daily spending bars, payment-method segmented bars; all plain Views/ProgressBars — no chart library (offline). | Brief Section 6.9. |
| P4-3 | Insight sentences from simple rules (top category, top payment method, biggest expense, grocery share, no-spend days); never shaming. | Brief Sections 6.9 + 4.5. |
| P4-4 | CSV export via `expo-sharing` + `expo-file-system`; no network. | Brief Section 6.9. |

## Phase 5 — Safety & Privacy

| # | Decision | Why |
|---|---|---|
| P5-1 | Backup is a single JSON with all 16 tables, shared via OS share sheet. Restore runs in one transaction; on failure nothing changes. | Business rule 13; mandatory local backup (brief Section 6.12). |
| P5-2 | App lock: optional 4–6 digit PIN (hashed in `expo-secure-store`, device-only) + biometrics (`expo-local-authentication`). The whole navigator is unmounted while locked, so the app-switcher preview contains no amounts. | Brief Section 6.12. |
| P5-3 | The lock state initialises from the hydrated setting, and any `AppState` change away from `active` relocks; enabling the lock while already in the app does not immediately re-lock. | Cold-start privacy without a flash of content; predictable relock. |
| P5-4 | Restore disables foreign keys for the replay (the schema is circular: `expenses.grocery_list_id` ↔ `grocery_lists.expense_id`), then runs `PRAGMA foreign_key_check` inside the same transaction. Unknown columns are ignored; known columns are validated per table. | Business rule 13 while still rejecting corrupt files. |
| P5-5 | Erase keeps preferences, clears last-used/last-backup values, removes receipt files, and re-seeds the default taxonomies. Settings re-hydrates after both restore and erase. Restore never changes this device's app-lock setting, even if the file was made with the lock on. | The app must be immediately usable after an erase, and a file must not be able to turn a device lock off (or on without a PIN). |
| P5-6 | Recently deleted screen: soft-deleted expenses with age, restore/purge actions; purge also deletes the receipt file. Boot purges anything older than 30 days. | Business rule 10. |
| P5-7 | Settings: currency, week/month start, theme (Light/Night/System), glass intensity (Low/Med/High), haptics, reduce motion, reduce transparency, notification times, backup reminder interval, app lock toggle, PIN entry. | Brief Section 6.13. |
| P5-8 | Recurring rules and savings goals (brief Sections 6.7/6.8) shipped with Phase 2 alongside allowance and budgets; Phase 5 adds the safety layer around them. | Keeps the data model in one place. |
| P5-9 | Every scheduled notification has a stable identifier and is cancelled before re-scheduling, so repeated boots replace rather than duplicate. The backup nudge anchors on `lastBackupAt` (or first use), fires at most once per interval at 9:00 AM, and stays quiet while one is already pending. | A boot-time scheduler has to be idempotent. |
| P5-10 | Recurring `remind` rules schedule exactly one local nudge for the newest due occurrence, record it in `last_created_on`, and advance `next_due_on`. The create form offers Auto-add / Remind me, and "Log now" records the oldest owed occurrence without pausing the rule. | Makes reminder mode reachable and idempotent; pausing on one log silently cancelled all future bills. |

## Phase 6 — Polish

| # | Decision | Why |
|---|---|---|
| P6-1 | All interactive elements have `accessibilityRole`, `accessibilityLabel`, `accessibilityState`; `ProgressRing`, `ProgressBar` expose progress to screen readers; touch targets ≥ 48pt via hitSlop. | Brief Section 12 UX checklist. |
| P6-2 | `maxFontSizeMultiplier={1.3}` on every text node; `reduceMotion` disables springs; `reduceTransparency` (OS + in-app) switches all glass to solid fallback. | Brief Section 12 UX checklist. |
| P6-3 | `src/db/seedPerf.ts` seeds 5,000 expenses across the current month from a `__DEV__`-only Settings row, so scrolling and reports can be checked on a low-end device. The action is unreachable in production builds. | Brief Section 12 UX checklist; `expo-sqlite` only exists inside the app, so the seed must run in-app. |
| P6-4 | Matcha Night dark mode fully wired: theme setting toggles `AuroraBackground` (night gradient/orbs) and `GlassSurface` (dark tokens); `Settings` exposes Light/Night/System. | Brief Section 4.4. Superseded by P6-15: the aurora now renders per screen via `BackdropLayers`. |
| P6-5 | `app.json` config plugins cover splash, image picker (photos/camera strings, no microphone), Face ID string, secure store and local notifications. The app is phone-only (`supportsTablet: false`). | Brief Section 14 and least-permission install. |
| P6-6 | README documents EAS and local Gradle APK/AAB builds; `android.blockedPermissions` strips INTERNET, ACCESS_NETWORK_STATE and ACCESS_WIFI_STATE. | Brief Section 14. |
| P6-7 | `resolveTone()` maps light tokens to semantic palette colours so every `<AppText>` and icon is readable in Matcha Night without per-file branches. | GUIDE §4.5. |
| P6-8 | `usePalette()` lightweight hook for components that only need colours (no glass tokens). | GUIDE §4.5. |
| P6-9 | Unused `onboardingComplete` setting removed (no onboarding screen exists). | GUIDE §4.9. |
| P6-10 | `ScreenScaffold` ScrollView gets `automaticallyAdjustKeyboardInsets` and `keyboardDismissMode="on-drag"` so form screens don't hide behind the keyboard. | GUIDE §4.5. |
| P6-11 | The leaf `<Text>` nodes in the glass primitives (`GlassButton`, `GlassChip`, `GlassSegmented`, `GlassTabBar`) also carry `maxFontSizeMultiplier={1.3}`; the documented RN-`Text` exemption no longer weakens Dynamic Type. | GUIDE §4.4; closes a gap in P6-2. |
| P6-12 | `Palette` gained `warningBg` (light amber pastel in light mode; 15 % amber overlay on Matcha Night) and `resolveTone()` maps `colors.warningBg` to it. The Home budget banner uses `palette.warningBg` — before, it stayed light amber under light text in dark mode. | GUIDE §4.5; fixes a contrast failure on the warning banner. |
| P6-13 | Static `StyleSheet` hairline dividers were moved inline as `palette.divider` across row/list components. The light `#E4EEDD` rule was a bright stripe on the Matcha Night background. | GUIDE §4.5. |
| P6-14 | Pressed-state fills, off-state switch tracks and pastel pressed tints became neutral white overlays on Matcha Night; secondary/ghost button text uses `palette.emphasis`; colour-dot selection rings use `palette.emphasis`; the Reports chart's empty bars use `palette.divider`; primary badge on History uses `palette.primary`/`palette.onPrimary`. | GUIDE §4.5. |
| P6-15 | React Navigation's `DefaultTheme` paints `rgb(242,242,242)` behind every screen, which hid the aurora entirely (flat gray both themes). Fixed with a transparent navigator `ThemeProvider` plus an opaque per-screen backdrop (`BackdropLayers` inside `ScreenScaffold`) — on web, inactive tab scenes stay mounted below the active one and only hide behind an opaque screen background. | Found via `expo export --platform web` + browser inspection; Android renders the same pixels (native detach works there already). |
| P6-16 | `metro.config.js` registers `.wasm` as an asset so the web export can bundle `expo-sqlite`'s wa-sqlite worker, and web pages need COOP/COEP headers (cross-origin isolation) or the worker never boots. Web is a dev-only visual verification harness, not a supported distribution; Android remains the shipping target. | Verified with Playwright screenshots of Home/History/Groceries/Reports/Settings in Light and Matcha Night. |
| P6-17 | `expo-updates` is disabled in `app.json` (`enabled: false`, `checkAutomatically: "NEVER"`) so the binary can never contact the update server; the release checklist guards it. `@expo/ngrok` stays as dev tooling for `expo start --tunnel`; the app itself has no network path. | GUIDE §4.7; belt-and-braces for the offline constraint. |
| P6-18 | `SYSTEM_ALERT_WINDOW` added to `android.blockedPermissions`. It arrives from Expo's default manifest template (`@expo/config-plugins` → `withAndroidBaseMods.js`), not from any dependency this app uses — no feature draws overlay windows. | Verified against the built APK's merged manifest; least-permission install (GUIDE §7 step 7). |
| P6-19 | `edgeToEdgeEnabled` removed from `app.json`. It is a no-op on Android 16 and `expo prebuild` warned about it on every run. | Warning-free prebuild; no behaviour change on any supported API level. |
| P6-20 | `eas.json` created with two profiles: `preview` → APK (`buildType: "apk"`, `distribution: "internal"`) and `production` → AAB. README previously implied one profile produced both — corrected. | One profile can only yield one artifact type; sideloading needs an APK, Play needs an AAB. |
| P6-21 | Local Gradle builds must run on **JDK 21**, not the JDK 24 that `JAVA_HOME` points at: AGP's prefab/CMake task treats JDK 24's `WARNING: A restricted method in java.lang.System has been called` stderr line as fatal. Documented in GUIDE §2 with the exact `JAVA_HOME` override. | Environment constraint discovered during the release build; the command that works is now part of the release checklist. |
| P6-22 | Home was compacted so the empty-state CTA and insight footnote clear the floating tab bar **without scrolling**: `ScreenScaffold` content padding/gap `md→xs`, hero card padding `lg→12`, safe-to-spend amount `44/52→36/44`, minis/chip paddings trimmed, compact `EmptyState` leaf `64→48`, and the footnote copy shortened to one line. Verified with `uiautomator` bounds on the 1080×2340 emulator (CTA bottom 1920 < tab-bar top 2098). | The primary call to action was previously pinned behind the `+` orb at rest — a first-run dead end. |
| P6-23 | The add-expense store is **route-backed**: `show()` sets the flag *and* `router.push('/add-expense-sheet')`, `hide()` clears the flag and pops (guarded — `onChange(-1)` and `onClose` can both fire for one dismissal), and `reset()` clears the flag without navigating; the sheet route calls `reset()` in its unmount cleanup. Every opener (orb, Home/History CTAs, Reports empty-state CTA) goes through `openAddExpense()`. | The store used to be a plain boolean the sheet route never read, so several CTAs opened nothing; an Android back press also popped the route without clearing the flag, making the next open a no-op. Verified on device (Reports "Add an expense" CTA). |
| P6-24 | `grocery-list.tsx` gates the "This list is gone." empty state on `!list && !listLoading`. | `useDbQuery` starts at `null` **while loading**, so the gone-message flashed on every open before the read settled. |
| P6-25 | `ItemSheet` on the grocery list is mounted only while open (`{itemSheetOpen ? <ItemSheet/> : null}`). | `@gorhom/bottom-sheet@5.2.14` ships `DEFAULT_ENABLE_TOUCH_THROUGH=false`; a permanently-mounted sheet keeps its backdrop at index −1 with `pointerEvents="auto"`, swallowing **every** tap on the route. Same pattern as `FilterSheet`. Verified on device. |
| P6-26 | The duplicate date-range caption below the Budgets Create button was removed (the range already shows in the section header above). | Redundant line broke the create-card's spacing. |
| P6-27 | `runwayCopy()` expanded to five branches taking `allowance_cents`: nothing logged / over-spent / exactly used / ≥31 days / <1 day / N days. | The old three-branch copy said "This cycle is covered" even with ₱0 logged and never warned when the pace wouldn't outlast the cycle. |
| P6-28 | Goals got a dedicated `contributionText` state for the Add-contribution input, separate from the New-goal `targetText`; cleared on open and after a successful add. | Both inputs shared one string: typing a contribution leaked into the New-goal Target field, and the disabled check read the wrong value. |
| P6-29 | Settings PIN UI restacked vertically: digit-length chips on their own row, `PinDots` full-width below (dots + Delete row over a `flex: 1` key row). | The old horizontal `pinRow` pushed the keypad past the Group card's right edge, where overflow:hidden clipped every digit key — absent from the uiautomator tree, edge taps dead, so **App lock could never be enabled**. Verified on device: keypad renders, PIN 1234 → toggle → toast "App lock is on.", relaunch (incl. after emulator reboot) → "Welcome back" PIN screen → unlock, toggle → toast "App lock turned off." |
| P6-30 | Money groups thousands with a **thin space** (`\u2009` → `₱1 000.00`) instead of a comma; `parseAmountToCents` strips `\s` (which includes it) along with `₱` and `,`. | A comma reads as a decimal separator in many locales; the thin space is locale-neutral and round-trips through the parser. |
| P6-31 | History swipe sides corrected: **swipe left reveals Delete** (right side, `renderRightActions`) and **swipe right reveals Copy** (left side, `renderLeftActions`). | They were inverted — swipe left showed Copy, swipe right showed Delete — contradicting DECISIONS P1-6 and the screen's own header comment ("swipe left to delete … swipe right to duplicate"). Verified on device: swipe left → Delete button at `[805,625][1025,795]`; swipe right → tap at the left edge duplicates (5 → 6 entries). |
| P6-32 | `SwipeAction` is now a **visual-only** element: `opacity: progress` is its sole animated style, and the wrapper hides itself from assistive tech (`accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`). | It used to animate `translateX` from the swipe, which pushed the trash icon **outside** the 80-wide button as the row opened. The real buttons now carry the labels, so hiding the decorative copy costs no accessibility. Verified in screenshot: icon and label both centred inside the red button. |
| P6-33 | Both swipe press targets live as `position: absolute` strips inside the **right** container (the one that is always on top in z-order): `actionTargetLeft` → Copy, `actionTargetRight` → Delete. | RNGH 2.32.0 renders `rightElement` after `leftElement`, both `absoluteFill`, and animates only `opacity` on the hidden side — so on Android an opacity-0 view swallows taps meant for the revealed action (upstream issue **#3223**, open; PR #4192 unmerged). Previously Delete was dead on tap. Living in the top container turns that quirk into the mechanism: each target is covered by the row content when closed and exposed exactly when its own side is open. Absolute positioning keeps RNGH's measured swipe width at 80 dp per side. Verified on device: swipe left → tap Delete → 5 → 4 entries + "Moved to Recently deleted." toast → Undo → 5 entries. |
| P6-34 | Business rule 2 (attach an expense to the budget whose period owns `spent_on`) moved **into the repositories**: `createExpense` resolves `budget_id` when the field is omitted (an explicit `null` still means "deliberately unbudgeted"), and `finishTrip` resolves it before its insert. | Only the add-expense sheet resolved a budget. One-tap adds, History Copy, recurring logging/catch-up and grocery trips all wrote `budget_id = NULL`, so the budget reported **₱0 / 0% / "Nothing spent yet. Nice and easy."** while Allowance (which aggregates by date) counted the same spend — the two cards disagreed. Centralising it fixes every path at once and keeps rule 2 out of the UI. Verified on device after rebuild: a Copy-created expense moves the card to **₱805.00 left / 20% used / "5 days left and you're doing great."** |
| P6-35 | The floating tab bar hides while an in-scene sheet is open: `history.tsx` mirrors `filterSheetOpen` into a new `src/state/sheetOverlayStore.ts`, and `GlassTabBar` returns `null` while the flag is set. | `BottomTabView` renders the custom tab bar **after** the scenes, and the bar has Android elevation 6/8 — so inside a tab scene the pill + Add orb draw *above* the inline `FilterSheet`, covering its Apply/Reset row (Apply `[55,2130][1025,2273]` vs. tab hitboxes `[293,2098]…[1034,2274]` and orb `[463,2033][617,2187]`). Taps meant for Apply switched tabs or opened the Add sheet instead, so filters had **never** been applied on device. Root-route sheets (Add expense, grocery item) were unaffected because they push above the whole tab shell. Hiding the bar also keeps the backdrop's tap-to-dismiss region live — the tap that used to fall through now dismisses correctly. Verified on device after rebuild: sheet open → tab bar + orb absent from the a11y dump → Food chip → Apply (tapped in the former dead zone) → **"1 filter on", 2 entries (Dinner, Coffee)** → reopen → Reset → Apply → all 6 entries back, tab bar restored. |