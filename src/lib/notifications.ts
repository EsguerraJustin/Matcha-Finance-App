/**
 * Local notifications only.
 *
 * No push, no server, no telemetry — `expo-notifications` is used purely to
 * schedule things on-device (brief Section 3). Every notification here is a
 * local or repeating local trigger.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { currentSettings } from '../state/settingsStore';
import { formatMoney } from './money';

const CHANNEL_ID = 'matcha-wallet';

/**
 * Stable identifiers. Scheduling with the same identifier replaces the pending
 * request instead of stacking a second copy, so a boot that runs twice can
 * never produce two "day check-in" reminders.
 */
const NOTIFICATION_IDS = {
  daily: 'matcha.daily-reminder',
  backup: 'matcha.backup-reminder',
} as const;

/** Identifiers are opaque keys; keep them free of user text and whitespace. */
function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._:-]/g, '-');
}

async function scheduleReplacing(
  identifier: string,
  content: Notifications.NotificationContentInput,
  trigger: Notifications.NotificationTriggerInput,
): Promise<string> {
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch {
    // Nothing pending under this id — that is the normal first-run case.
  }
  return Notifications.scheduleNotificationAsync({ identifier, content, trigger });
}

/** True while a backup nudge is still waiting to fire. */
export async function hasPendingBackupReminder(): Promise<boolean> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.some((request) => request.identifier === NOTIFICATION_IDS.backup);
  } catch {
    return false;
  }
}

/** Quiet pastel banner, even when the app is in the foreground. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let channelReady: Promise<void> | null = null;

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (!channelReady) {
    channelReady = Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Budget & bills',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 120],
      lightColor: '#7FB775',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    })
      .then(() => undefined)
      .catch(() => undefined);
  }
  return channelReady;
}

async function canNotify(): Promise<boolean> {
  try {
    if (!currentSettings().notificationsEnabled) return false;
    const status = await Notifications.getPermissionsAsync();
    if (status.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

function dailyAt(hour: number, minute: number): Notifications.DailyTriggerInput {
  return {
    type: Notifications.SchedulableTriggerInputTypes.DAILY,
    hour,
    minute,
    channelId: CHANNEL_ID,
  };
}

function onceAt(date: Date): Notifications.DateTriggerInput {
  return {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date,
    channelId: CHANNEL_ID,
  };
}

/** Daily "how's today looking" reminder (default 8:00 PM). */
export async function scheduleDailyReminder(time = '20:00'): Promise<string | null> {
  if (!(await canNotify())) return null;
  await ensureChannel();

  const [hourPart, minutePart] = time.split(':');
  const hour = Math.min(23, Math.max(0, Number(hourPart) || 0));
  const minute = Math.min(59, Math.max(0, Number(minutePart) || 0));

  return scheduleReplacing(
    NOTIFICATION_IDS.daily,
    {
      title: 'Day check-in',
      body: 'Two minutes to log anything you spent today.',
      sound: false,
    },
    dailyAt(hour, minute),
  );
}

/**
 * One nudge to back up (brief Section 6.12), default two weeks after the last
 * backup. `dueAt` is when it should surface; the boot routine passes the next
 * 9:00 AM so a due reminder does not interrupt an open session.
 */
export async function scheduleBackupReminder(dueAt: Date): Promise<string | null> {
  if (!(await canNotify())) return null;
  await ensureChannel();

  return scheduleReplacing(
    NOTIFICATION_IDS.backup,
    {
      title: 'Quick backup?',
      body: 'Two weeks since your last one. A tap keeps your data safe.',
      sound: false,
    },
    onceAt(dueAt),
  );
}

/** 80 % / 100 % budget alerts — fired once per threshold per budget. */
export async function notifyBudgetThreshold(params: {
  budgetId: string;
  budgetName: string;
  threshold: 'warning' | 'exceeded';
  usage: number;
  spentCents: number;
}): Promise<string | null> {
  if (!(await canNotify())) return null;
  await ensureChannel();

  const percent = Math.round(params.usage * 100);
  const spent = formatMoney(params.spentCents, { compactZeroDecimals: true });

  return scheduleReplacing(
    `matcha.budget.${safeId(params.budgetId)}.${params.threshold}`,
    {
      title:
        params.threshold === 'exceeded'
          ? `${params.budgetName} is over`
          : `${percent}% of ${params.budgetName}`,
      body:
        params.threshold === 'exceeded'
          ? `${spent} spent. Fresh start next period.`
          : `${spent} spent. Easy does it.`,
      sound: false,
    },
    onceAt(new Date(Date.now() + 1_000)),
  );
}

/** A reminder-mode recurring item wants a tap. */
export async function notifyBillDue(
  label: string,
  amountCents: number,
  when: Date,
  identifier?: string,
): Promise<string | null> {
  if (!(await canNotify())) return null;
  await ensureChannel();

  return scheduleReplacing(
    identifier ?? `matcha.bill.${safeId(label)}.${when.getTime()}`,
    {
      title: label,
      body: `${formatMoney(amountCents)} is due. One tap to log it.`,
      sound: false,
    },
    onceAt(when),
  );
}

/** Drops a pending bill nudge once the bill has been logged by hand. */
export async function cancelBillReminder(ruleId: string, dueOn: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(`matcha.bill.${ruleId}.${dueOn}`);
  } catch {
    // It may already have fired or never have been scheduled.
  }
}

export async function cancelAll(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Having nothing scheduled is a valid state.
  }
}