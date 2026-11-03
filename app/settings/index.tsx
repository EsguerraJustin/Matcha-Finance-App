/**
 * Settings (brief Section 6.13).
 *
 * Currency, week start, month start (allowance cycle), theme (Light /
 * Matcha Night), notification toggles, haptics, reduce motion, reduce
 * transparency, glass intensity, app lock and a link into Backup.
 *
 * Every row writes through the settings store, which persists to SQLite.
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { ChevronRight } from 'lucide-react-native';
import { router } from 'expo-router';

import { GlassSurface } from '../../src/components/glass/GlassSurface';
import { GlassButton } from '../../src/components/glass/GlassButton';
import { AppText } from '../../src/components/ui/AppText';
import { ScreenScaffold } from '../../src/components/ui/ScreenScaffold';
import { ChipRow, type ChipRowItem } from '../../src/components/expense/ChipRow';
import { GlassSegmented } from '../../src/components/glass/GlassSegmented';
import { useAppTheme, usePalette } from '../../src/hooks/useAppTheme';
import { useSettingsStore } from '../../src/state/settingsStore';
import { notifyDbChanged, useDb } from '../../src/state/dbStore';
import { showToast } from '../../src/state/toastStore';
import { seedPerfExpenses } from '../../src/db/seedPerf';
import { scheduleDailyReminder } from '../../src/lib/notifications';
import { biometricAvailable, removePin, savePin, validPin } from '../../src/lib/appLock';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/typography';

const CURRENCIES = ['₱', '$', '€', 'Rp', 'RM'];

export default function SettingsScreen() {
  const settings = useSettingsStore();
  const update = useSettingsStore((state) => state.update);
  const db = useDb();
  const { glass, solidGlass, isDark, palette } = useAppTheme();
  const [pinDraft, setPinDraft] = useState('');
  const [biometric, setBiometric] = useState(false);

  useEffect(() => {
    void biometricAvailable().then(setBiometric);
  }, []);

  const currencyChips: ChipRowItem[] = CURRENCIES.map((symbol) => ({ id: symbol, label: symbol }));
  const monthChips: ChipRowItem[] = [1, 5, 10, 15, 25].map((day) => ({ id: String(day), label: `Day ${day}` }));

  const handleLock = useCallback(
    async (enabled: boolean) => {
      try {
        if (!enabled) {
          await removePin();
          await update({ appLockEnabled: false });
          showToast({ message: 'App lock turned off.', tone: 'warning' });
          return;
        }
        if (!validPin(pinDraft)) {
          showToast({ message: 'Choose a 4–6 digit PIN first.', tone: 'warning' });
          return;
        }
        await savePin(pinDraft);
        await update({ appLockEnabled: true });
        setPinDraft('');
        showToast({ message: 'App lock is on.', tone: 'success' });
      } catch {
        showToast({ message: 'Could not reach the device keychain.', tone: 'warning' });
      }
    },
    [pinDraft, update],
  );

  const handleReminderTime = useCallback(async () => {
    const permission = await Notifications.requestPermissionsAsync();
    const granted = permission.granted;
    await update({ notificationsEnabled: granted });
    if (granted) await scheduleDailyReminder(settings.dailyReminderTime);
    else showToast({ message: 'Notifications are off for Matcha Wallet.', tone: 'warning' });
  }, [settings.dailyReminderTime, update]);

  const handleSeedPerf = useCallback(() => {
    if (!db) return;
    Alert.alert(
      'Seed 5,000 expenses?',
      'Adds test data across this month so scrolling and reports can be checked on a slow device. Development builds only.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Seed',
          onPress: () => {
            void (async () => {
              try {
                const count = await seedPerfExpenses(db);
                notifyDbChanged();
                showToast({ message: `Added ${count} test expenses.`, tone: 'success' });
              } catch {
                showToast({ message: 'Could not seed test data.', tone: 'warning' });
              }
            })();
          },
        },
      ],
    );
  }, [db]);

  return (
    <ScreenScaffold title="Settings" subtitle="Everything stays on this device">
      {/* Money & cycles ---------------------------------------------- */}
      <Group title="Money and cycles">
        <Row label="Currency symbol">
          <ChipRow items={currencyChips} selectedIds={[settings.currencySymbol]} onToggle={(symbol) => void update({ currencySymbol: symbol })} size="small" />
        </Row>
        <Row label="Week starts on">
          <GlassSegmented
            options={[
              { value: '1', label: 'Monday' },
              { value: '0', label: 'Sunday' },
            ]}
            value={String(settings.weekStartsOn)}
            onChange={(value) => void update({ weekStartsOn: Number(value) as 0 | 1 })}
          />
        </Row>
        <Row label="Allowance month starts" hint="Your money cycle, not necessarily the 1st">
          <ChipRow items={monthChips} selectedIds={[String(settings.monthStartsOn)]} onToggle={(day) => void update({ monthStartsOn: Number(day) })} size="small" />
        </Row>
      </Group>

      {/* Look --------------------------------------------------------- */}
      <Group title="Look and feel">
        <Row label="Theme" hint={isDark ? 'Matcha Night' : 'Matcha Morning'}>
          <GlassSegmented
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Night' },
              { value: 'system', label: 'System' },
            ]}
            value={settings.theme}
            onChange={(value) => void update({ theme: value })}
          />
        </Row>
        <Row label="Glass intensity" hint={solidGlass ? 'Solid fallback active' : `Blur at ${settings.glassIntensity}`}>
          <GlassSegmented
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
            ]}
            value={settings.glassIntensity}
            onChange={(value) => void update({ glassIntensity: value })}
          />
        </Row>
      </Group>

      {/* Accessibility ------------------------------------------------ */}
      <Group title="Accessibility and motion">
        <ToggleRow
          label="Haptics"
          hint="Small taps when chips change and budgets warn"
          value={settings.hapticsEnabled}
          onChange={(value) => void update({ hapticsEnabled: value })}
        />
        <ToggleRow
          label="Reduce motion"
          hint="Turns off springs and rolling amounts"
          value={settings.reduceMotion}
          onChange={(value) => void update({ reduceMotion: value })}
        />
        <ToggleRow
          label="Reduce transparency"
          hint="Every glass surface becomes a calm solid pastel"
          value={settings.reduceTransparency}
          onChange={(value) => void update({ reduceTransparency: value })}
          last
        />
        <View style={styles.glassPreview}>
          <View style={[styles.swatch, { backgroundColor: glass.fill, borderColor: glass.border, borderRadius: 20 }]} />
          <AppText variant="caption" color={palette.textMuted}>
            {solidGlass ? 'Rendering the solid fallback — the look is kept, the blur is not.' : 'Blur is enabled at your chosen intensity.'}
          </AppText>
        </View>
      </Group>

      {/* Notifications ------------------------------------------------ */}
      <Group title="Reminders">
        <ToggleRow
          label="Daily reminder"
          hint={settings.notificationsEnabled ? `Every day at ${settings.dailyReminderTime}` : 'Off'}
          value={settings.notificationsEnabled}
          onChange={(value) => {
            if (value) void handleReminderTime();
            else void update({ notificationsEnabled: false });
          }}
        />
        <Row label="Delivery time">
          <GlassSegmented
            options={[
              { value: '18:00', label: '6 PM' },
              { value: '20:00', label: '8 PM' },
              { value: '21:30', label: '9:30 PM' },
            ]}
            value={settings.dailyReminderTime}
            onChange={(value) => {
              void update({ dailyReminderTime: value });
              if (settings.notificationsEnabled) void scheduleDailyReminder(value);
            }}
          />
        </Row>
        <Row label="Backup reminder" hint="Local notification only">
          <GlassSegmented
            options={[
              { value: '0', label: 'Off' },
              { value: '7', label: '7 days' },
              { value: '14', label: '14 days' },
            ]}
            value={String(settings.backupReminderDays)}
            onChange={(value) => void update({ backupReminderDays: Number(value) })}
          />
        </Row>
      </Group>

      {/* Privacy ------------------------------------------------------ */}
      <Group title="Privacy">
        <ToggleRow
          label="App lock"
          hint={settings.appLockEnabled ? 'PIN required to open the app' : 'Optional PIN and biometrics'}
          value={settings.appLockEnabled}
          onChange={(value) => void handleLock(value)}
        />
        {!settings.appLockEnabled ? (
          <Row label="New PIN" hint="4 to 6 digits, kept in the device keychain — never in the database or a backup">
            <View style={styles.pinRow}>
              <ChipRow
                items={['4', '5', '6'].map((length) => ({ id: length, label: `${length} digits` }))}
                selectedIds={[String(pinDraft.length || 4)]}
                onToggle={() => undefined}
                size="small"
              />
              <View style={styles.pinInput}>
                <PinDots value={pinDraft} onChange={setPinDraft} />
              </View>
            </View>
          </Row>
        ) : null}
        <LinkRow label="Backup and restore" hint="Export, restore and erase" onPress={() => router.push('/settings/backup')} />
        <LinkRow label="Recently deleted" hint="Restore a mistaken swipe" onPress={() => router.push('/recently-deleted')} last />
        {biometric ? (
          <AppText variant="footnote" color={palette.textMuted}>
            Biometrics are available on this device and offered on the lock screen.
          </AppText>
        ) : null}
      </Group>

      {/* Language ------------------------------------------------------ */}
      <Group title="Language">
        <Row label="Language" hint="English for now; strings are structured so Filipino can be added later" last>
          <GlassButton label="English" variant="secondary" size="small" onPress={() => undefined} fullWidth={false} disabled />
        </Row>
      </Group>

      {__DEV__ ? (
        <Group title="Developer">
          <LinkRow
            label="Seed 5,000 expenses"
            hint="Performance test data — development builds only"
            onPress={handleSeedPerf}
            last
          />
        </Group>
      ) : null}

      <AppText variant="footnote" color={palette.textMuted} center>
        Matcha Wallet is offline by design. Nothing here leaves your phone.
      </AppText>
    </ScreenScaffold>
  );
}

/* ------------------------------------------------------------------ */

function PinDots({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const palette = usePalette();
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  return (
    <View style={styles.pinGrid}>
      <View style={styles.dots}>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <View key={index} style={[styles.dot, value.length > index && styles.dotOn]} />
        ))}
      </View>
      <View style={styles.keys}>
        {keys.map((key) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={key}
            onPress={() => onChange(value.length >= 6 ? value : value + key)}
            style={({ pressed }) => [styles.key, { backgroundColor: palette.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.55)' }, pressed && { backgroundColor: palette.isDark ? 'rgba(255,255,255,0.18)' : colors.matcha100 }]}
          >
            <AppText variant="subhead">
              {key}
            </AppText>
          </Pressable>
        ))}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Backspace" onPress={() => onChange(value.slice(0, -1))} style={styles.backspace}>
        <AppText variant="caption" color={palette.emphasis}>
          Delete
        </AppText>
      </Pressable>
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <AppText variant="headline">{title}</AppText>
      <GlassSurface level="high" radius={20} padding={spacing.md} style={styles.groupCard}>
        {children}
      </GlassSurface>
    </View>
  );
}

function Row({ label, hint, children, last }: { label: string; hint?: string; children: React.ReactNode; last?: boolean }) {
  const palette = usePalette();
  return (
    <View style={[styles.row, { borderBottomColor: palette.divider }, last && styles.rowLast]}>
      <View style={styles.rowHeader}>
        <AppText variant="subhead">{label}</AppText>
        {hint ? (
          <AppText variant="caption" color={palette.textMuted}>
            {hint}
          </AppText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
  last,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  last?: boolean;
}) {
  const palette = usePalette();
  return (
    <View style={[styles.toggleRow, { borderBottomColor: palette.divider }, last && styles.rowLast]}>
      <View style={styles.rowHeader}>
        <AppText variant="subhead">{label}</AppText>
        {hint ? (
          <AppText variant="caption" color={palette.textMuted}>
            {hint}
          </AppText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: palette.emphasis, false: palette.isDark ? 'rgba(255,255,255,0.16)' : colors.matcha200 }}
        thumbColor="#FFFFFF"
        accessibilityLabel={label}
      />
    </View>
  );
}

function LinkRow({ label, hint, onPress, last }: { label: string; hint: string; onPress: () => void; last?: boolean }) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.toggleRow, { borderBottomColor: palette.divider }, last && styles.rowLast, pressed && { backgroundColor: palette.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(232,243,221,0.5)' }]}
    >
      <View style={styles.rowHeader}>
        <AppText variant="subhead">{label}</AppText>
        <AppText variant="caption" color={palette.textMuted}>
          {hint}
        </AppText>
      </View>
      <ChevronRight size={18} strokeWidth={1.75} color={palette.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.xs,
  },
  groupCard: {
    gap: spacing.md,
  },
  row: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLast: {
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  rowHeader: {
    gap: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  glassPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  swatch: {
    width: 56,
    height: 56,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  pinInput: {
    flex: 1,
  },
  pinGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.matcha400,
  },
  dotOn: {
    backgroundColor: colors.matcha500,
  },
  keys: {
    flexDirection: 'row',
    gap: 4,
  },
  key: {
    width: 32,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backspace: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
});
