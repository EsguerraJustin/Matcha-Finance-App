/**
 * Add / Edit expense sheet.
 *
 * Speed first (brief Section 6.1): a custom numpad, category chips with the
 * types appearing right underneath, payment chips, date chips, a note with
 * local autocomplete, an optional receipt, and a 5-second Undo after saving.
 * The whole thing opens as a large-detent glass bottom sheet.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import type BottomSheet from '@gorhom/bottom-sheet';
import { Camera, ImageIcon } from 'lucide-react-native';

import { GlassSheet } from '../src/components/glass/GlassSheet';
import { GlassButton } from '../src/components/glass/GlassButton';
import { AppText, MoneyText } from '../src/components/ui/AppText';
import { GlassInput } from '../src/components/ui/GlassInput';
import { AmountNumpad } from '../src/components/expense/AmountNumpad';
import { ChipRow, type ChipRowItem } from '../src/components/expense/ChipRow';
import { categoryTint } from '../src/hooks/useAppTheme';
import { useAddExpenseStore } from '../src/state/addExpenseStore';
import { showToast } from '../src/state/toastStore';
import { useDb, useDbQuery } from '../src/state/dbStore';
import { useSettingsStore } from '../src/state/settingsStore';
import {
  listCategories,
  listNoteSuggestions,
  listPaymentMethods,
  type CategoryWithTypes,
  type PaymentMethod,
} from '../src/db/repositories/categoriesRepo';
import {
  createExpense,
  getExpense,
  hardDeleteExpense,
  restoreExpense,
  softDeleteExpense,
  updateExpense,
} from '../src/db/repositories/expensesRepo';
import { captureReceipt, deleteReceipt, pickReceipt, receiptFile } from '../src/lib/receipts';
import { evaluateBudgetThresholds, resolveBudgetId } from '../src/db/repositories/budgetGlue';
import {
  loggedMessage,
  numpadCents,
  smartDefaultNow,
  validateExpenseDraft,
  type ExpenseDraft,
} from '../src/lib/expenses';
import { addDaysISO, formatHumanDate, todayISO } from '../src/lib/date';
import { colors } from '../theme/colors';
import { spacing } from '../theme/typography';
import { successHaptic } from '../src/lib/haptics';

export default function AddExpenseSheetRoute() {
  const open = useAddExpenseStore((state) => state.open);
  const hide = useAddExpenseStore((state) => state.hide);
  const editingId = useAddExpenseStore((state) => state.editingId);

  const sheetRef = useRef<BottomSheet>(null);
  const db = useDb();
  const currencySymbol = useSettingsStore((state) => state.currencySymbol);

  const { data: categories } = useDbQuery<CategoryWithTypes[]>((handle) => listCategories(handle), [], []);
  const { data: paymentMethods } = useDbQuery<PaymentMethod[]>((handle) => listPaymentMethods(handle), [], []);

  const [digits, setDigits] = useState('');
  const [spentOn, setSpentOn] = useState(() => todayISO());
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [explicitBudgetId, setExplicitBudgetId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loadedForEdit, setLoadedForEdit] = useState<string | null>(null);

  const today = todayISO();

  /* -------------------------------------------------------------- */
  /* Reset the form whenever the sheet opens                           */
  /* -------------------------------------------------------------- */
  useEffect(() => {
    if (!open) return;
    setErrors({});

    if (editingId) {
      if (loadedForEdit === editingId || !db) return;
      setLoadedForEdit(editingId);
      void getExpense(db, editingId).then((existing) => {
        if (!existing) return;
        setDigits(String(existing.amount_cents));
        setSpentOn(existing.spent_on);
        setCategoryId(existing.category_id);
        setTypeId(existing.type_id);
        setPaymentMethodId(existing.payment_method_id);
        setNote(existing.note ?? '');
        setReceiptPath(existing.receipt_path);
        setExplicitBudgetId(existing.budget_id);
      });
      return;
    }

    setLoadedForEdit(null);
    setDigits('');
    setSpentOn(today);
    setReceiptPath(null);
    setNote('');
    setExplicitBudgetId(null);

    // Smart defaults: last-used payment method, plus category/type by hour.
    void (async () => {
      const smart = smartDefaultNow();
      if (!smart || !categories.length) return;
      const match = categories.find((entry) => entry.name === smart.categoryName);
      if (!match) return;
      setCategoryId(match.id);
      const type = match.types.find((entry) => entry.name === smart.typeName);
      setTypeId(type?.id ?? null);
    })();

    if (paymentMethods.length) {
      setPaymentMethodId((current) => current ?? paymentMethods[0].id);
    }
  }, [categories, db, editingId, loadedForEdit, open, paymentMethods, today]);

  const activeCategory = useMemo(
    () => categories.find((entry) => entry.id === categoryId) ?? null,
    [categories, categoryId],
  );

  const cents = numpadCents(digits);

  const categoryChips: ChipRowItem[] = useMemo(
    () =>
      categories.map((category) => ({
        id: category.id,
        label: category.name,
        tint: categoryTint(category.name),
      })),
    [categories],
  );

  const typeChips: ChipRowItem[] = useMemo(
    () =>
      (activeCategory?.types ?? []).map((type) => ({
        id: type.id,
        label: type.name,
        tint: categoryTint(activeCategory?.name),
      })),
    [activeCategory],
  );

  const paymentChips: ChipRowItem[] = useMemo(
    () => paymentMethods.map((method) => ({ id: method.id, label: method.name })),
    [paymentMethods],
  );

  const dateChips: ChipRowItem[] = useMemo(
    () => [
      { id: today, label: 'Today' },
      { id: addDaysISO(today, -1), label: 'Yesterday' },
      { id: addDaysISO(today, -2), label: addDaysISO(today, -2) === today ? 'Today' : formatHumanDate(addDaysISO(today, -2)) },
    ],
    [today],
  );

  const { data: noteSuggestions } = useDbQuery<string[]>(
    (handle) => listNoteSuggestions(handle, note, 5),
    [note],
    [],
  );

  /* -------------------------------------------------------------- */
  /* Save                                                            */
  /* -------------------------------------------------------------- */
  const buildDraft = (): ExpenseDraft => ({
    amountCents: cents,
    spentOn,
    categoryId,
    typeId,
    paymentMethodId,
    note,
  });

  const handleSave = useCallback(
    async (options: { keepOpen?: boolean } = {}) => {
      if (!db || saving) return;

      const validation = validateExpenseDraft(buildDraft(), { today });
      setErrors(validation.errors);
      if (!validation.ok || cents === null) return;

      setSaving(true);
      try {
        const previousReceipt = editingId ? (await getExpense(db, editingId))?.receipt_path ?? null : null;
        // Business rule 2: attach to the budget that owns this date, unless
        // the user pinned one explicitly.
        const budgetId = explicitBudgetId ?? (await resolveBudgetId(db, spentOn));

        const id =
          editingId
            ? (await updateExpense(db, editingId, {
                amount_cents: cents,
                spent_on: spentOn,
                category_id: categoryId ?? undefined,
                type_id: typeId,
                payment_method_id: paymentMethodId ?? undefined,
                note: note.trim() || null,
                receipt_path: receiptPath,
                budget_id: budgetId,
              }),
              editingId)
            : await createExpense(db, {
                amount_cents: cents,
                spent_on: spentOn,
                category_id: categoryId!,
                type_id: typeId,
                payment_method_id: paymentMethodId!,
                note: note.trim() || null,
                receipt_path: receiptPath,
                budget_id: budgetId,
              });

        // Replacing a receipt file orphans the old one.
        if (previousReceipt && previousReceipt !== receiptPath) deleteReceipt(previousReceipt);

        // Business rule 4: re-evaluate thresholds after every write.
        await evaluateBudgetThresholds(db, today);

        successHaptic();

        if (editingId) {
          showToast({ message: 'Updated.', tone: 'success' });
        } else {
          showToast({
            message: loggedMessage(`${currencySymbol}${(cents / 100).toFixed(2)}`, activeCategory?.types.find((t) => t.id === typeId)?.name ?? null),
            tone: 'success',
            actionLabel: 'Undo',
            onAction: () => {
              void hardDeleteExpense(db, id);
            },
          });
        }

        if (!options.keepOpen) hide();
        else {
          setDigits('');
          setNote('');
          setReceiptPath(null);
        }
      } finally {
        setSaving(false);
      }
    },
    [
      activeCategory,
      cents,
      categoryId,
      currencySymbol,
      db,
      editingId,
      hide,
      note,
      paymentMethodId,
      receiptPath,
      saving,
      spentOn,
      today,
      typeId,
    ],
  );

  const handleReceipt = useCallback(async () => {
    const result = (await pickReceipt()) ?? (await captureReceipt());
    if (result) setReceiptPath(result.relativePath);
  }, []);

  const handleClearReceipt = useCallback(() => {
    deleteReceipt(receiptPath);
    setReceiptPath(null);
  }, [receiptPath]);

  const canSave = cents !== null && categoryId !== null && (paymentMethodId !== null || paymentMethods.length === 0);

  return (
    <GlassSheet
      ref={sheetRef}
      index={open ? 0 : -1}
      snapPoints={['94%']}
      scrollable
      onChange={(nextIndex) => {
        if (nextIndex === -1) hide();
      }}
      onClose={hide}
      title={editingId ? 'Edit expense' : 'Add expense'}
    >
      <View style={styles.sheet}>
        {/* Amount ------------------------------------------------------ */}
        <View style={styles.amountBlock}>
          <View style={styles.amountRow}>
            <AppText variant="title2" color={colors.textMuted}>
              {currencySymbol}
            </AppText>
            <AppText variant="largeTitle" numeric accessibilityLabel={`Amount ${(cents ?? 0) / 100}`} style={styles.amount}>
              {formatDigits(digits)}
            </AppText>
          </View>
          <AppText variant="footnote" color={colors.textMuted}>
            {spentOn === today ? 'Today' : formatHumanDate(spentOn)} · {activeCategory?.name ?? 'Pick a category'}
          </AppText>
        </View>

        {/* Numpad ------------------------------------------------------ */}
        <View style={styles.numpadAndPreview}>
          <AmountNumpad digits={digits} onChange={setDigits} style={styles.numpad} />

          <View style={styles.previewColumn}>
            <AppText variant="caption" color={colors.textMuted}>
              Preview
            </AppText>
            <MoneyText cents={cents ?? 0} variant="title2" />

            <Pressable
              onPress={handleReceipt}
              accessibilityRole="button"
              accessibilityLabel={receiptPath ? 'Replace receipt photo' : 'Add receipt photo'}
              style={styles.receiptButton}
            >
              {receiptPath ? (
                <Image source={{ uri: receiptFile(receiptPath).uri }} style={styles.receiptPreview} />
              ) : (
                <View style={styles.receiptEmpty}>
                  <ImageIcon size={20} strokeWidth={1.75} color={colors.matcha700} />
                  <Camera size={14} strokeWidth={1.75} color={colors.matcha700} />
                </View>
              )}
            </Pressable>

            {receiptPath ? (
              <Pressable onPress={handleClearReceipt} accessibilityRole="button" accessibilityLabel="Remove receipt photo" hitSlop={8}>
                <AppText variant="caption" color={colors.dangerText}>
                  Remove
                </AppText>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Category chips ---------------------------------------------- */}
        <Section label="Category" error={errors.category}>
          <ChipRow items={categoryChips} selectedIds={categoryId ? [categoryId] : []} onToggle={(id) => {
            setCategoryId(id);
            setTypeId(null);
          }} />
        </Section>

        {/* Type chips appear right under the chosen category ------------- */}
        {activeCategory && activeCategory.types.length ? (
          <Section label="Type">
            <ChipRow items={typeChips} selectedIds={typeId ? [typeId] : []} onToggle={setTypeId} size="small" />
          </Section>
        ) : null}

        {/* Payment ----------------------------------------------------- */}
        <Section label="Paid with" error={errors.payment}>
          <ChipRow items={paymentChips} selectedIds={paymentMethodId ? [paymentMethodId] : []} onToggle={setPaymentMethodId} size="small" />
        </Section>

        {/* Date ------------------------------------------------------- */}
        <Section label="When" error={errors.date}>
          <ChipRow items={dateChips} selectedIds={[spentOn]} onToggle={setSpentOn} size="small" />
        </Section>

        {/* Note with local autocomplete --------------------------------- */}
        <Section label="Note" error={errors.note}>
          <GlassInput
            value={note}
            onChangeText={setNote}
            placeholder="Anything worth remembering"
            maxLength={140}
            returnKeyType="done"
            autoCorrect
          />
          {noteSuggestions.length ? (
            <View style={styles.suggestions}>
              {noteSuggestions.slice(0, 3).map((suggestion) => (
                <Pressable key={suggestion} onPress={() => setNote(suggestion)} accessibilityRole="button">
                  <AppText variant="caption" color={colors.matcha700}>
                    {suggestion}
                  </AppText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </Section>

        {/* Actions ------------------------------------------------------ */}
        {errors.amount ? (
          <AppText variant="footnote" color={colors.dangerText}>
            {errors.amount}
          </AppText>
        ) : null}

        <GlassButton label={editingId ? 'Save changes' : 'Save'} onPress={() => void handleSave()} disabled={!canSave} loading={saving} hapticFeedback="success" />
        {!editingId ? (
          <GlassButton label="Save & add another" variant="secondary" onPress={() => void handleSave({ keepOpen: true })} disabled={!canSave} />
        ) : (
          <GlassButton
            label="Delete expense"
            variant="destructive"
            onPress={() => {
              if (!db || !editingId) return;
              const id = editingId;
              void softDeleteExpense(db, id);
              showToast({
                message: 'Moved to Recently deleted.',
                tone: 'warning',
                actionLabel: 'Undo',
                onAction: () => {
                  void restoreExpense(db, id);
                },
              });
              hide();
            }}
          />
        )}
      </View>
    </GlassSheet>
  );
}

/* ------------------------------------------------------------------ */

function formatDigits(digits: string): string {
  if (digits === '') return '0.00';
  const padded = digits.padStart(3, '0');
  const pesos = padded.slice(0, -2);
  const centavos = padded.slice(-2);
  return `${Number(pesos).toLocaleString('en-PH')}.${centavos}`;
}

function Section({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <AppText variant="footnote" color={colors.textMuted}>
          {label}
        </AppText>
        {error ? (
          <AppText variant="caption" color={colors.dangerText}>
            {error}
          </AppText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  amountBlock: {
    gap: 2,
    paddingTop: spacing.xs,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  amount: {
    fontSize: 44,
    lineHeight: 52,
  },
  numpadAndPreview: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'stretch',
  },
  numpad: {
    flex: 1,
  },
  previewColumn: {
    width: 104,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    gap: spacing.xs,
  },
  receiptButton: {
    marginTop: spacing.xs,
  },
  receiptPreview: {
    width: 72,
    height: 72,
    borderRadius: 16,
  },
  receiptEmpty: {
    width: 72,
    height: 72,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.matcha200,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  section: {
    gap: spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  suggestions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: 4,
    flexWrap: 'wrap',
  },
});