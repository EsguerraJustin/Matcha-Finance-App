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

  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Day check-in',
      body: 'Two minutes to log anything you spent today.',
      sound: false,
    },
    trigger: dailyAt(hour, minute),
  });
}

/** Every two weeks, nudge the user to back up (brief Section 6.12). */
export async function scheduleBackupReminder(days = 14, from = new Date()): Promise<string | null> {
  if (!(await canNotify())) return null;
  await ensureChannel();

  const triggerDate = new Date(from.getTime() + days * 86_400_000);
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Quick backup?',
      body: 'Two weeks since your last one. A tap keeps your data safe.',
      sound: false,
    },
    trigger: onceAt(triggerDate),
  });
}

/** 80 % / 100 % budget alerts — fired once per threshold per budget. */
export async function notifyBudgetThreshold(params: {
  budgetName: string;
  threshold: 'warning' | 'exceeded';
  usage: number;
  spentCents: number;
}): Promise<string | null> {
  if (!(await canNotify())) return null;
  await ensureChannel();

  const percent = Math.round(params.usage * 100);
  const spent = formatMoney(params.spentCents, { compactZeroDecimals: true });

  return Notifications.scheduleNotificationAsync({
    content: {
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
    trigger: onceAt(new Date(Date.now() + 1_000)),
  });
}

/** A reminder-mode recurring item wants a tap tomorrow morning. */
export async function notifyBillDue(label: string, amountCents: number, when: Date): Promise<string | null> {
  if (!(await canNotify())) return null;
  await ensureChannel();

  return Notifications.scheduleNotificationAsync({
    content: {
      title: label,
      body: `${formatMoney(amountCents)} is due. One tap to log it.`,
      sound: false,
    },
    trigger: onceAt(when),
  });
}

export async function cancelAll(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Having nothing scheduled is a valid state.
  }
}