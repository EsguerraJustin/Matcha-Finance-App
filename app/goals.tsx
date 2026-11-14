/**
 * Savings goals — small, kind targets.
 *
 * Each goal has a target, a pastel colour, optional date, and contributions.
 * "Count as set aside" reduces the safe-to-spend figure so money you have
 * already promised yourself isn't spent twice.
 */

import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Plus, Trash2 } from 'lucide-react-native';

import { GlassCard } from '../src/components/glass/GlassCard';
import { GlassSurface } from '../src/components/glass/GlassSurface';
import { GlassButton } from '../src/components/glass/GlassButton';
import { GlassInput } from '../src/components/ui/GlassInput';
import { GlassDatePickerField } from '../src/components/ui/GlassDatePickerField';
import { AppText, MoneyText } from '../src/components/ui/AppText';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ScreenScaffold } from '../src/components/ui/ScreenScaffold';
import { ProgressRing } from '../src/components/ui/ProgressRing';
import { withAlpha } from '../src/components/glass/GlassChip';
import { useDb, useDbQuery } from '../src/state/dbStore';
import { usePalette } from '../src/hooks/useAppTheme';
import { showToast } from '../src/state/toastStore';
import { ratio } from '../src/lib/money';
import {
  addContribution,
  createGoal,
  deleteGoal,
  listGoals,
  type GoalWithTotals,
} from '../src/db/repositories/goalsRepo';
import { categoryColorList } from '../theme/colors';
import { colors } from '../theme/colors';
import { spacing } from '../theme/typography';

export default function GoalsScreen() {
  const palette = usePalette();
  const db = useDb();

  const [name, setName] = useState('');
  const [targetText, setTargetText] = useState('');
  const [contributionText, setContributionText] = useState('');
  const [date, setDate] = useState('');
  const [colorKey, setColorKey] = useState('Food');
  const [setAside, setSetAside] = useState(true);
  const [contributionIds, setContributionIds] = useState<string[]>([]);

  const { data: goals } = useDbQuery<GoalWithTotals[]>((handle) => listGoals(handle), [], []);
  const activeGoal = useMemo(() => goals.find((goal) => contributionIds.includes(goal.id)) ?? null, [goals, contributionIds]);

  const add = useCallback(() => {
    const target = Number(targetText.replace(/[^\d.]/g, ''));
    const cents = Math.round(target * 100);
    if (!db || !name.trim() || !Number.isFinite(cents) || cents <= 0) {
      showToast({ message: 'Give it a name and a target.', tone: 'warning' });
      return;
    }
    void createGoal(db, {
      name: name.trim(),
      target_cents: cents,
      target_date: date || null,
      color_key: colorKey,
      reduce_safe_to_spend: setAside,
    }).then(() => {
      setName('');
      setTargetText('');
      showToast({ message: `Goal started: ${name.trim()}.`, tone: 'success' });
    });
  }, [colorKey, date, db, name, setAside, targetText]);

  return (
    <ScreenScaffold title="Savings goals" subtitle="Small targets, big motivation">
      {goals.length === 0 ? (
        <EmptyState title="No goals yet" message="A new laptop, a course fee, a buffer for surprises." />
      ) : (
        goals.map((goal) => {
          const progress = ratio(goal.saved_cents, goal.target_cents);
          const tint = tintFor(goal.color_key);
          const isActive = contributionIds.includes(goal.id);

          return (
            <GlassCard key={goal.id} padding={14}>
              <View style={styles.goalRow}>
                <ProgressRing progress={progress} size={72} thickness={9} trackColor={withAlpha(tint, 0.35)}>
                  <AppText variant="caption" color={colors.matcha900}>
                    {Math.round(progress * 100)}%
                  </AppText>
                </ProgressRing>

                <View style={styles.goalText}>
                  <AppText variant="title2">{goal.name}</AppText>
                  <MoneyText cents={goal.saved_cents} variant="subhead" />
                  <AppText variant="caption" color={palette.textMuted}>
                    {goal.saved_cents >= goal.target_cents
                      ? 'Reached — lovely.'
                      : `${formatShort(goal.target_cents - goal.saved_cents)} to go`}
                    {goal.target_date ? ` · by ${goal.target_date}` : ''}
                  </AppText>
                  {goal.reduce_safe_to_spend ? (
                    <AppText variant="caption" color={palette.emphasis}>
                      Counts as set aside
                    </AppText>
                  ) : null}
                </View>
              </View>

              <View style={styles.goalActions}>
                <GlassButton
                  label="Add money"
                  variant="secondary"
                  size="small"
                  onPress={() => {
                    setContributionIds((current) => (current.includes(goal.id) ? current : [goal.id]));
                    setContributionText('');
                  }}
                  style={styles.action}
                />
                <Pressable
                  onPress={() => db && void deleteGoal(db, goal.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${goal.name}`}
                  hitSlop={8}
                  style={styles.deleteButton}
                >
                  <Trash2 size={18} strokeWidth={1.75} color={palette.dangerText} />
                </Pressable>
              </View>

              {isActive ? (
                <GlassSurface radius={16} padding={12} level="low">
                  <GlassInput
                    value={contributionText}
                    onChangeText={setContributionText}
                    placeholder="₱500"
                    keyboardType="decimal-pad"
                    containerStyle={styles.contributionInput}
                  />
                  <GlassButton
                    label="Add contribution"
                    size="small"
                    onPress={() => {
                      const cents = Math.round(Number(contributionText.replace(/[^\d.]/g, '')) * 100);
                      if (!db || !Number.isFinite(cents) || cents <= 0) return;
                      void addContribution(db, goal.id, cents).then(() => {
                        setContributionIds((current) => current.filter((id) => id !== goal.id));
                        setContributionText('');
                        showToast({ message: 'Added to your goal.', tone: 'success' });
                      });
                    }}
                    disabled={!contributionText.trim()}
                  />
                </GlassSurface>
              ) : null}
            </GlassCard>
          );
        })
      )}

      <GlassSurface level="low" radius={20} padding={14} style={styles.createBlock}>
        <AppText variant="headline">New goal</AppText>
        <GlassInput value={name} onChangeText={setName} placeholder="Laptop fund" label="Name" />
        <GlassInput value={targetText} onChangeText={setTargetText} placeholder="₱25,000" keyboardType="decimal-pad" label="Target" />
        <GlassDatePickerField value={date} onChange={setDate} label="By" allowClear placeholder="Optional" />
        <AppText variant="footnote" color={palette.textMuted}>
          Colour
        </AppText>
        <View style={styles.colorRow}>
          {categoryColorList.map((value) => (
            <Pressable
              key={value}
              onPress={() => setColorKey(value)}
              accessibilityRole="button"
              accessibilityState={{ selected: value === colorKey }}
              style={[styles.colorDot, { backgroundColor: value }, value === colorKey && [styles.colorDotActive, { borderColor: palette.emphasis }]]}
            />
          ))}
        </View>
        <Pressable
          onPress={() => setSetAside((current) => !current)}
          accessibilityRole="switch"
          accessibilityState={{ checked: setAside }}
          style={styles.switchRow}
        >
          <AppText variant="subhead">Count as set aside</AppText>
          <View style={[styles.switchTrack, { backgroundColor: palette.isDark ? 'rgba(255,255,255,0.16)' : colors.matcha200 }, setAside && { backgroundColor: palette.primary }]}>
            <View style={[styles.switchThumb, setAside && styles.switchThumbOn]} />
          </View>
        </Pressable>
        <GlassButton label="Create goal" icon={<Plus size={18} strokeWidth={2} color={colors.matcha900} />} onPress={add} />
      </GlassSurface>

      <AppText variant="caption" color={palette.textMuted} center>
        {activeGoal ? `Adding to ${activeGoal.name}` : 'Goals with "set aside" on lower your safe-to-spend figure.'}
      </AppText>
    </ScreenScaffold>
  );
}

function tintFor(colorKey: string): string {
  const map: Record<string, string> = {
    Food: categoryColorList[0],
    Transportation: categoryColorList[1],
    Groceries: categoryColorList[2],
    'School supplies': categoryColorList[3],
    Shopping: categoryColorList[4],
    Bills: categoryColorList[5],
    Others: categoryColorList[6],
  };
  return map[colorKey] ?? categoryColorList[0];
}

function formatShort(cents: number): string {
  const symbol = '₱';
  const pesos = Math.floor(Math.abs(cents) / 100);
  return `${symbol}${pesos.toLocaleString('en-PH')}`;
}

const styles = StyleSheet.create({
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  goalText: {
    flex: 1,
    gap: 2,
  },
  goalActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  action: {
    flex: 1,
  },
  deleteButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contributionInput: {
    marginBottom: spacing.xs,
  },
  createBlock: {
    gap: spacing.sm,
  },
  colorRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  colorDot: {
    width: 34,
    height: 34,
    borderRadius: 999,
  },
  colorDotActive: {
    borderWidth: 3,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  switchTrack: {
    width: 51,
    height: 31,
    borderRadius: 999,
    padding: 2,
    justifyContent: 'center',
  },
  switchThumb: {
    width: 27,
    height: 27,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  switchThumbOn: {
    alignSelf: 'flex-end',
  },
});