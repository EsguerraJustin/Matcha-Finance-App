/**
 * `<QuickTemplateSheet />` — create, edit or remove a Home "one-tap add"
 * (a `quick_templates` row). The repo (`quickTemplatesRepo`) has always had
 * full CRUD; this sheet is the UI that finally calls it.
 *
 * Mounted only while open (GUIDE §4.3 — a mounted sheet holds its backdrop
 * and swallows taps). Home mirrors the open state into `sheetOverlayStore`
 * so the floating tab bar hides underneath the sheet (P6-35 rule).
 */

import { memo, useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { GlassSheet } from './glass/GlassSheet';
import { GlassButton } from './glass/GlassButton';
import { GlassInput } from './ui/GlassInput';
import { AppText } from './ui/AppText';
import { ChipRow, type ChipRowItem } from './expense/ChipRow';
import { categoryTint, usePalette } from '../hooks/useAppTheme';
import { useDb, useDbQuery } from '../state/dbStore';
import { showToast } from '../state/toastStore';
import { parseAmountToCents, validateAmount } from '../lib/money';
import {
  listCategories,
  listPaymentMethods,
  type CategoryWithTypes,
  type PaymentMethod,
} from '../db/repositories/categoriesRepo';
import {
  createQuickTemplate,
  deleteQuickTemplate,
  updateQuickTemplate,
  type QuickTemplateInput,
  type QuickTemplateRow,
} from '../db/repositories/quickTemplatesRepo';
import { spacing } from '../../theme/typography';

export interface QuickTemplateSheetProps {
  /** `'new'` opens an empty form; a row opens the same form in edit mode. */
  mode: 'new' | QuickTemplateRow;
  onClose: () => void;
}

function QuickTemplateSheetImpl({ mode, onClose }: QuickTemplateSheetProps) {
  const palette = usePalette();
  const db = useDb();
  const editing = mode === 'new' ? null : mode;

  const { data: categories } = useDbQuery<CategoryWithTypes[]>((handle) => listCategories(handle), [], []);
  const { data: payments } = useDbQuery<PaymentMethod[]>((handle) => listPaymentMethods(handle), [], []);

  const [label, setLabel] = useState(editing?.label ?? '');
  const [amountText, setAmountText] = useState(editing ? (editing.amount_cents / 100).toFixed(2) : '');
  const [categoryId, setCategoryId] = useState<string | null>(editing?.category_id ?? null);
  const [typeId, setTypeId] = useState<string | null>(editing?.type_id ?? null);
  const [paymentId, setPaymentId] = useState<string | null>(editing?.payment_method_id ?? null);
  const [note, setNote] = useState(editing?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const categoryChips = useMemo<ChipRowItem[]>(
    () => categories.map((category) => ({ id: category.id, label: category.name, tint: categoryTint(category.name) })),
    [categories],
  );

  const selectedCategory = categories.find((category) => category.id === categoryId) ?? null;

  const typeChips = useMemo<ChipRowItem[]>(
    () =>
      (selectedCategory?.types ?? []).map((type) => ({
        id: type.id,
        label: type.name,
        tint: categoryTint(selectedCategory?.name),
      })),
    [selectedCategory],
  );

  const paymentChips = useMemo<ChipRowItem[]>(
    () => payments.map((method) => ({ id: method.id, label: method.name })),
    [payments],
  );

  const save = useCallback(async () => {
    if (!db) return;
    const trimmed = label.trim();
    if (!trimmed) {
      setError('Give the chip a label — that is what Home shows.');
      return;
    }
    const cents = parseAmountToCents(amountText);
    if (cents === null) {
      setError('Enter an amount like 13 or 13.50.');
      return;
    }
    const check = validateAmount(cents);
    if (!check.ok) {
      setError(check.reason);
      return;
    }
    if (!categoryId) {
      setError('Pick a category.');
      return;
    }
    if (!paymentId) {
      setError('Pick what you pay with.');
      return;
    }

    const input: QuickTemplateInput = {
      label: trimmed,
      amount_cents: cents,
      category_id: categoryId,
      type_id: typeId,
      payment_method_id: paymentId,
      note: note.trim() || null,
    };

    if (editing) {
      await updateQuickTemplate(db, editing.id, input);
      showToast({ message: `Updated ${trimmed}.`, tone: 'success' });
    } else {
      await createQuickTemplate(db, input);
      showToast({ message: `Added ${trimmed} to One-tap adds.`, tone: 'success' });
    }
    onClose();
  }, [amountText, categoryId, db, editing, label, note, onClose, paymentId, typeId]);

  // Removal is irreversible (no soft-delete table for templates), so it goes
  // through the toast's action slot — the same confirm-with-Undo pattern the
  // expense rows use — before the row actually goes away.
  const remove = useCallback(() => {
    if (!db || !editing) return;
    const target = editing;
    showToast({
      message: `Remove ${target.label} from One-tap adds?`,
      tone: 'warning',
      actionLabel: 'Remove',
      onAction: () => {
        void (async () => {
          await deleteQuickTemplate(db, target.id);
          showToast({ message: `Removed ${target.label}.`, tone: 'success' });
        })();
      },
    });
    onClose();
  }, [db, editing, onClose]);

  return (
    <GlassSheet snapPoints={['85%']} scrollable onClose={onClose} title={editing ? 'Edit one-tap add' : 'New one-tap add'}>
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <GlassInput
          label="Label"
          value={label}
          onChangeText={(text) => {
            setLabel(text);
            setError(null);
          }}
          placeholder="Jeep, Coffee, Lunch…"
          autoCapitalize="words"
        />
        <GlassInput
          label="Amount (₱)"
          value={amountText}
          onChangeText={(text) => {
            setAmountText(text);
            setError(null);
          }}
          placeholder="13.00"
          keyboardType="decimal-pad"
        />

        <View style={styles.section}>
          <AppText variant="footnote" color={palette.textMuted}>
            Category
          </AppText>
          <ChipRow
            items={categoryChips}
            selectedIds={categoryId ? [categoryId] : []}
            onToggle={(id) => {
              // Category is required — re-tapping the selected one keeps it.
              if (id !== categoryId) setTypeId(null);
              setCategoryId(id);
              setError(null);
            }}
            wrap
            size="small"
          />
        </View>

        {typeChips.length ? (
          <View style={styles.section}>
            <AppText variant="footnote" color={palette.textMuted}>
              Type (optional)
            </AppText>
            <ChipRow
              items={typeChips}
              selectedIds={typeId ? [typeId] : []}
              onToggle={(id) => {
                setTypeId((current) => (current === id ? null : id));
                setError(null);
              }}
              wrap
              size="small"
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <AppText variant="footnote" color={palette.textMuted}>
            Paid with
          </AppText>
          <ChipRow
            items={paymentChips}
            selectedIds={paymentId ? [paymentId] : []}
            onToggle={(id) => {
              setPaymentId(id);
              setError(null);
            }}
            wrap
            size="small"
          />
        </View>

        <GlassInput label="Note (optional)" value={note} onChangeText={setNote} placeholder="Anything worth remembering" />

        {error ? (
          <AppText variant="caption" color={palette.dangerText}>
            {error}
          </AppText>
        ) : null}

        <View style={styles.actions}>
          <GlassButton
            label={editing ? 'Save changes' : 'Add to Home'}
            onPress={() => void save()}
            hapticFeedback="success"
          />
          {editing ? <GlassButton label="Remove" variant="destructive" onPress={remove} /> : null}
        </View>
      </ScrollView>
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.xs,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});

export const QuickTemplateSheet = memo(QuickTemplateSheetImpl);
export default QuickTemplateSheet;
