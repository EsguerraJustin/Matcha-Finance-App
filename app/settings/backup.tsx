/**
 * Backup & restore (brief Section 6.12).
 *
 * Local backup is **mandatory**, not optional — there is no cloud to fall back
 * on. Export produces one JSON file shared through the OS share sheet; restore
 * replaces current data inside a single transaction.
 */

import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Database, DownloadCloud, ShieldCheck, Trash2, UploadCloud } from 'lucide-react-native';

import { GlassSurface } from '../../src/components/glass/GlassSurface';
import { GlassButton } from '../../src/components/glass/GlassButton';
import { AppText } from '../../src/components/ui/AppText';
import { ScreenScaffold } from '../../src/components/ui/ScreenScaffold';
import { GlassSegmented } from '../../src/components/glass/GlassSegmented';
import { useDb } from '../../src/state/dbStore';
import { showToast } from '../../src/state/toastStore';
import { useSettingsStore } from '../../src/state/settingsStore';
import { withAlpha } from '../../src/components/glass/GlassChip';
import { categoryTint } from '../../src/hooks/useAppTheme';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/typography';
import {
  createBackup,
  eraseAllData,
  readBackupUri,
  restoreBackup,
  shareBackup,
  summariseBackup,
} from '../../src/lib/backup';
import { diffDaysISO, formatHumanDate, todayISO } from '../../src/lib/date';
import { notifyDbChanged } from '../../src/state/dbStore';

export default function BackupScreen() {
  const db = useDb();
  const settings = useSettingsStore();
  const hydrate = useSettingsStore((state) => state.hydrate);
  const [busy, setBusy] = useState(false);

  const handleExport = useCallback(async () => {
    if (!db) return;
    setBusy(true);
    try {
      const backup = await createBackup(db);
      await shareBackup(backup);
      await settings.update({ lastBackupAt: backup.createdAt });
      const summary = summariseBackup(backup);
      showToast({
        message: `Backup ready — ${summary.expenses} expenses.`,
        tone: 'success',
      });
    } catch {
      showToast({ message: 'Could not create the backup.', tone: 'warning' });
    } finally {
      setBusy(false);
    }
  }, [db, settings]);

  const handleImport = useCallback(async () => {
    if (!db) return;
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/json', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.[0]) return;

      setBusy(true);
      const backup = await readBackupUri(picked.assets[0].uri);
      if (!backup) {
        showToast({ message: 'That file is not a Matcha Wallet backup.', tone: 'warning' });
        return;
      }

      const summary = summariseBackup(backup);
      Alert.alert(
        'Restore this backup?',
        `This replaces your current data with the backup from ${formatHumanDate(summary.createdAt.slice(0, 10))}: ` +
          `${summary.expenses} expenses, ${summary.allowances} allowance entries, ${summary.budgets} budgets, ` +
          `${summary.groceryLists} grocery lists. Nothing you have now will survive.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace data',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                setBusy(true);
                // The lock is a security setting for THIS device. Restoring a
                // file must never switch it on (there may be no PIN here) or
                // silently switch it off. Keep whatever the device has.
                const lockWasOn = useSettingsStore.getState().appLockEnabled;
                try {
                  await restoreBackup(db, backup);
                  // The restored file carried its own settings; re-read them so
                  // currency, theme and cycle agree with the data on screen.
                  await hydrate();
                  await settings.update({ lastBackupAt: backup.createdAt, appLockEnabled: lockWasOn });
                  notifyDbChanged();
                  showToast({ message: 'Backup restored.', tone: 'success' });
                } catch {
                  showToast({ message: 'Restore failed — nothing was changed.', tone: 'warning' });
                } finally {
                  setBusy(false);
                }
              })();
            },
          },
        ],
      );
    } catch {
      showToast({ message: 'Could not read that file.', tone: 'warning' });
    } finally {
      setBusy(false);
    }
  }, [db, hydrate, settings]);

  const handleErase = useCallback(() => {
    if (!db) return;
    Alert.alert(
      'Erase everything?',
      'Every expense, allowance, budget and grocery list on this device is deleted. This cannot be undone — back up first.',
      [
        { text: 'Keep my data', style: 'cancel' },
        {
          text: 'Erase all',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await eraseAllData(db);
                // Erase keeps preferences but clears `lastBackupAt`, so the
                // store needs a fresh read to drop the stale "last backup" line.
                await hydrate();
                notifyDbChanged();
                showToast({ message: 'All data erased. Settings were kept.', tone: 'warning' });
              } catch {
                showToast({ message: 'Could not erase everything.', tone: 'warning' });
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  }, [db, hydrate]);

  const reminderDays = settings.backupReminderDays;
  const since = settings.lastBackupAt ? diffDaysISO(settings.lastBackupAt.slice(0, 10), todayISO()) : null;

  return (
    <ScreenScaffold title="Backup" subtitle="Your data lives only on this device">
      {/* Status ------------------------------------------------------ */}
      <GlassSurface level="high" radius={20} padding={spacing.lg} style={{ backgroundColor: withAlpha('#CDEFE3', 0.5) }}>
        <View style={styles.statusRow}>
          <ShieldCheck size={28} strokeWidth={1.75} color={colors.matcha700} />
          <View style={styles.statusText}>
            <AppText variant="headline">
              {settings.lastBackupAt ? `Last backup ${formatHumanDate(settings.lastBackupAt.slice(0, 10))}` : 'No backup yet'}
            </AppText>
            <AppText variant="caption" color={colors.textMuted}>
              {settings.lastBackupAt ? 'Safe — make a fresh copy whenever you like.' : 'A backup is the only safety net you have'}
            </AppText>
          </View>
        </View>
        {settings.lastBackupAt && since !== null && since >= reminderDays ? (
          <AppText variant="footnote" color={colors.warningText} style={{ marginTop: spacing.xs }}>
            It has been {since} days — time for a fresh copy.
          </AppText>
        ) : null}
      </GlassSurface>

      {/* Actions ----------------------------------------------------- */}
      <GlassButton
        label="Export backup"
        icon={<DownloadCloud size={18} strokeWidth={1.75} color={colors.matcha900} />}
        onPress={() => void handleExport()}
        loading={busy}
      />
      <GlassButton
        label="Restore from backup"
        variant="secondary"
        icon={<UploadCloud size={18} strokeWidth={1.75} color={colors.matcha700} />}
        onPress={() => void handleImport()}
        disabled={busy}
      />
      <GlassButton
        label="Erase all data"
        variant="destructive"
        icon={<Trash2 size={18} strokeWidth={1.75} color={colors.dangerText} />}
        onPress={handleErase}
        disabled={busy}
      />

      {/* What is in a backup ----------------------------------------- */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Database size={16} strokeWidth={1.75} color={colors.matcha700} />
          <AppText variant="headline">In the backup</AppText>
        </View>
        <GlassSurface level="high" radius={20} padding={0}>
          <BackupRow label="Expenses, notes and soft-deleted rows" />
          <BackupRow label="Allowances, budgets and category limits" />
          <BackupRow label="Grocery lists, items and price memory" />
          <BackupRow label="Recurring rules, quick templates, goals" />
          <BackupRow label="Settings and preferences (never the app-lock PIN)" last />
        </GlassSurface>
        <AppText variant="footnote" color={colors.textMuted}>
          Receipt photos are not copied — they stay in the app's private storage. A restore on a new phone brings the data and the preferences back.
        </AppText>
      </View>

      {/* Reminder ---------------------------------------------------- */}
      <View style={styles.section}>
        <AppText variant="headline">Remind me every</AppText>
        <GlassSegmented
          options={[
            { value: '7', label: '7 days' },
            { value: '14', label: '14 days' },
            { value: '30', label: '30 days' },
          ]}
          value={String(reminderDays)}
          onChange={(value) => {
            void settings.update({ backupReminderDays: Number(value) });
          }}
        />
        <AppText variant="footnote" color={colors.textMuted}>
          A local notification only — no internet, no nagging.
        </AppText>
      </View>
    </ScreenScaffold>
  );
}

function BackupRow({ label, last }: { label: string; last?: boolean }) {
  return (
    <View style={[styles.backupRow, last && styles.backupRowLast]}>
      <View style={[styles.tick, { backgroundColor: withAlpha(categoryTint('Groceries'), 0.6) }]} />
      <AppText variant="subhead" style={styles.backupLabel}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statusText: {
    flex: 1,
    gap: 2,
  },
  section: {
    gap: spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  backupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  backupRowLast: {
    borderBottomWidth: 0,
  },
  tick: {
    width: 20,
    height: 20,
    borderRadius: 999,
  },
  backupLabel: {
    flex: 1,
  },
});
