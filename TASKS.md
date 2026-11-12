# Matcha Wallet — Remaining Tasks

> Cross-reference: every rule and convention referenced below is documented in
> **[GUIDE.md](./GUIDE.md)**. Read it first.

---

## Status

- **Phases 0–6**: committed and stable. Phase 6 landed as `2ab8c7f`; the
  post-commit Matcha Night audit landed as `7affc43`; the web-export visual
  pass (invisible-heading fix, navigator theme, per-screen backdrop) as
  `8d321a9`. The Phase 6 release pass followed: `5b0f74f` (block
  `SYSTEM_ALERT_WINDOW`, drop `edgeToEdgeEnabled`, add `eas.json`, document
  the JDK 21 Gradle build), `a99ede2` (compact Home so the empty-state CTA
  clears the floating tab bar without scrolling) and `1ce2b86` (on-device UAT
  flaw sweep — DECISIONS `P6-23`…`P6-30`).
- **Verification**: TypeScript 0 errors · Jest 157 passing · Android bundle
  exports (`npx expo export --platform android --no-bytecode`) · web export
  boots and renders all screens in Light and Matcha Night (Playwright).
- **Release-hardening UAT sweep** (on-device, emulator 1080×2340): eight flaws
  found and fixed, all verified on the release APK — DECISIONS `P6-23`…`P6-29`
  cover them (route-backed add-expense store + Reports CTA, grocery loading
  gate, conditional `ItemSheet` mount, budgets duplicate caption, allowance
  runway copy, goals shared-input state, Settings PIN keypad overflow).
  Font scale 130% checked and restored; README acceptance (Rice + Milk → one
  ₱195 Groceries expense) passed end-to-end.
- **Extended UAT sweep** (untested screens, same emulator): four more flaws
  found, fixed and re-verified on a rebuilt release APK — DECISIONS `P6-31`…
  `P6-34`. Swipe sides were inverted (P6-31), the swipe icon escaped its
  button (P6-32), the revealed Delete button never received a tap because
  RNGH's hidden opposite container swallows touches on Android (P6-33, upstream
  #3223), and every expense-creation path except the add sheet wrote
  `budget_id = NULL`, so the budget card claimed "Nothing spent yet" while
  Allowance counted the same spend (P6-34). Verified on device: swipe left →
  Delete → 5→4 entries → Undo → 5; swipe right → Copy → 5→6; budget card now
  reads ₱805.00 / 20%. Test 3 added flaw 13 — the floating tab bar rendered
  above the inline filter sheet, so Apply/Reset sat in a dead zone and filters
  could never be applied (P6-35, bar now hides while a scene sheet is open);
  verified: Food chip → Apply → "1 filter on" / 2 entries → Reset → 6 entries.
- T1–T8 all done — including the icon/stroke audit (every remaining
  hard-coded `colors.*` is either resolved through `resolveTone()` or sits on
  a permanently-light surface such as a primary button or pastel chip) and
  the static `StyleSheet` divider sweep (now inline `palette.divider`).
- `Palette` gained `warningBg`; see DECISIONS `P6-11`…`P6-14`. The visual
  pass added `P6-15` (transparent navigator theme + per-screen backdrop),
  `P6-16` (web harness `.wasm`/COOP/COEP) and `P6-17` (expo-updates disabled).

---

## T1  Fix dark-mode TypeScript errors *(done)*

> GUIDE §4.5, §5

The `resolveTone()` / `usePalette()` refactor was applied to some files
automatically but left several components with `palette` references that have
no binding in scope. Three error categories:

| Error | Cause | Fix |
|---|---|---|
| `TS2304: Cannot find name 'palette'` | The component's function body uses `palette.xxx` but never destructures it from `useAppTheme()` / `usePalette()`. | Add `const { palette } = usePalette();` in the component (import `usePalette` from `src/hooks/useAppTheme`). For **nested** helper components in the same file (e.g. `Section`, `ListRow`, `BackupRow`, `PinDots`, `Group`, `Row`, `ToggleRow`, `LinkRow`, `SwipeAction`, `TotalCell`, `ItemRow`, `ItemSheet`, `EmptyList`, `PressableRow`), each needs its own `usePalette()` call. |
| `TS2339: Property 'palette' does not exist on type 'Palette'` | `usePalette()` already returns a `Palette` — destructuring `{ palette }` from it is wrong; just use the return value directly: `const palette = usePalette();`. | Change `const { palette } = usePalette()` → `const palette = usePalette()` in the files that hit this. |
| `TS6133: 'colors' is declared but its value is never read` | After replacing `colors.textMuted` → `palette.textMuted` etc., the `colors` import is no longer used. | Remove the unused `colors` import, or keep it if the file still references `colors.matcha100`, `colors.matcha200`, etc. (non-semantic tokens that don't go through `resolveTone`). |

### Affected files (all 18)

**Screens:**
`app/(tabs)/groceries.tsx`, `app/(tabs)/history.tsx`, `app/(tabs)/index.tsx`,
`app/add-expense-sheet.tsx`, `app/allowance.tsx`, `app/budgets.tsx`,
`app/goals.tsx`, `app/grocery-list.tsx`, `app/more.tsx`,
`app/recently-deleted.tsx`, `app/settings/backup.tsx`, `app/settings/index.tsx`

**Components:**
`src/components/expense/BulkActionBar.tsx`, `src/components/expense/FilterSheet.tsx`,
`src/components/ui/EmptyState.tsx`, `src/components/ui/GlassInput.tsx`,
`src/components/ui/LargeTitleHeader.tsx`, `src/components/ui/Toast.tsx`

### Verification

```bash
npx tsc --noEmit    # must be 0 errors
npx jest            # must stay at 157 passing
```

---

## T2  Remaining icon/colour dark-mode tokens *(done)*

> GUIDE §4.5

After T1 compiles, audit **every file** for remaining hard-coded `colors.*`
references that should go through the palette in dark mode:

- `colors.matcha900` used as **icon colour** or **text colour** → replace with
  `palette.text` or `palette.onPrimary` depending on context.
- `colors.matcha700` used as **icon/link colour** → replace with `palette.emphasis`.
- `colors.dangerText` / `colors.dangerBg` → `palette.dangerText` / `palette.dangerBg`.
- `colors.warningText` → `palette.warningText`.
- `colors.successText` → `palette.successText`.
- `colors.surface` / `colors.surfaceAlt` → `palette.cardFill`.
- `colors.divider` → `palette.divider`.

Items that stay as raw `colors.*`:
- `colors.matcha50`–`matcha500` used as **fixed-palette backgrounds** (e.g.
  matcha-tinted glass, pressed states, progress bar tracks, category pastels).
- `categoryColors.*` — pastels are always light even in dark mode.
- `colors.matcha100`–`matcha300` for pressed/hover tints.

### Verification

Toggle the theme to **Matcha Night** (dark) in Settings and visually confirm no
dark-on-dark or invisible text/icons on every screen.

---

## T3  Static `StyleSheet` colours *(done)*

> GUIDE §4.5

Some `StyleSheet.create()` blocks use `colors.divider` or `colors.matcha100`
for borders/backgrounds. These are baked at module load and won't change when
the theme switches. Options:

1. Move the colour into the inline style where `palette` is accessible.
2. Or accept it for decorative borders (`divider` is close enough in both
   themes that it reads as a gentle separator).

Audit at least: `borderBottomColor`, `borderTopColor`, `backgroundColor` in
`StyleSheet.create()` blocks across all screen files.

---

## T4  `AppLockScreen` dark-mode polish *(done)*

> GUIDE §4.5, §4.6

The lock screen currently uses several raw `colors.*` tokens for dots, key
background, and pressed states. Wire them through `palette`:

- `styles.dot.borderColor` → `palette.primary` (or remain fixed)
- `styles.dotOn.backgroundColor` → `palette.primary`
- `styles.keyPressed.backgroundColor` → resolve from palette
- `styles.splash.backgroundColor` in `_layout.tsx` → use `palette.background`
  (currently `#F5FAF0`, the light background, which will flash white in dark)

---

## T5  Remove unused `onboardingComplete` setting *(done — verified)*

> GUIDE §4.9

`onboardingComplete` was removed from `SettingsShape` and its parsers/serializers
during this session. **Verify** it is fully gone:

```bash
# Should return 0 hits in app/ and src/
Select-String -Recurse -Path app,src -Include *.ts,*.tsx -Pattern "onboardingComplete"
```

If the backup format references it (column in a table or a key in the JSON
shape), keep it as a passthrough in `backupFormat.ts` so old backups still
restore cleanly, but remove it from the live settings contract.

---

## T6  Run full verification and commit Phase 6 *(done)*

> GUIDE §5

Once T1–T5 are done:

1. `npx tsc --noEmit` → 0 errors
2. `npx jest` → 157 tests pass
3. `npx expo export --platform android --no-bytecode` → bundles
4. `git add -A && git reset -- .claude .kilo dist-web .playwright-mcp`  # tool/test outputs, never in the app commit
5. `git commit -m "phase-6: polish — dark mode, accessibility, hitSlop, keyboard"`
6. Confirm `git log --oneline` shows 7 clean phase commits.

---

## T7  Update README.md and DECISIONS.md *(done)*

> GUIDE §8

After committing Phase 6:

- **README** Phase 6 row → change state from "Done" (premature) to actual "Done".
- Add an Accessibility section noting the `resolveTone` / `usePalette`
  mechanism and how dark mode works.
- **DECISIONS** Phase 6 table → add entries for:
  - `P6-7`: `resolveTone()` maps light tokens to semantic palette colours so
    every `<AppText>` and icon is readable in Matcha Night without per-file
    branches.
  - `P6-8`: `usePalette()` lightweight hook for components that only need
    colours (no glass tokens).
  - `P6-9`: Unused `onboardingComplete` setting removed (no onboarding screen
    exists).
  - `P6-10`: `ScreenScaffold` ScrollView gets `automaticallyAdjustKeyboardInsets`
    and `keyboardDismissMode="on-drag"` so form screens don't hide behind the
    keyboard.

---

## T8  Post-commit nice-to-haves *(all done)*

These are improvements worth doing after Phase 6 is committed. Each is small
and self-contained:

### T8.1  Switch `trackColor` / `thumbColor` in Settings toggles to palette

`app/settings/index.tsx` line ~368 uses `colors.matcha500`, `colors.matcha200`,
`colors.surface` for the `<Switch>`. These should resolve from `palette` so the
toggle track looks correct in Matcha Night.

### T8.2  Swipe action backgrounds

`app/(tabs)/history.tsx` SwipeAction backgrounds (`colors.matcha100`,
`colors.dangerBg`) and text colours (`colors.matcha900`, `colors.dangerText`)
are hard-coded. Resolve through palette for dark-mode consistency.

### T8.3  Pressed-state backgrounds

Several files use `rgba(232,243,221,0.6)` or `colors.matcha100` as inline
pressed-state colours in `StyleSheet.create()`. These don't update with the
theme. Consider using `palette.cardFill` with opacity or the glass
`fillTintGreen` token.

### T8.4  `GlassSheet` border colour in dark mode

`GlassSheet.tsx` line ~82 uses `colors.textMuted` for the grabber and
`colors.matcha900` for the backdrop dim. These should resolve from palette.

### T8.5  EmptyState leaf gradient

`EmptyState.tsx` uses `colors.matcha300` / `colors.matcha500` for the SVG leaf
gradient. In dark mode this is fine (green on dark = ok), but an audit pass
would confirm.

### T8.6  Add dark-mode-specific backup test

Add a test to `__tests__/backup.test.ts` that verifies restoring a backup
created before `onboardingComplete` was removed still works (the column-existence
filter should skip the unknown key gracefully).

---

## Task dependency graph

```
T1 (fix TS errors)
 ├─► T2 (icon/colour audit)
 │    └─► T3 (static StyleSheet colours)
 ├─► T4 (lock screen dark mode)
 └─► T5 (verify onboarding removal)
      │
      ▼
     T6 (verify + commit phase-6)
      │
      ▼
     T7 (update README + DECISIONS)
      │
      ▼
     T8.* (nice-to-haves, independent)
```

**Critical path:** T1 → T6 → T7.  
Everything else can be done in parallel after T1.
