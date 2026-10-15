/**
 * Settings defaults and the typed key/value contract.
 *
 * Settings live in a tiny `settings(key, value)` table — no network, no
 * preferences service. Values are stored as strings; parse on read.
 */

import type { WeekStart } from '../lib/date';

export type ThemeMode = 'light' | 'dark' | 'system';
export type GlassIntensityValue = 'low' | 'medium' | 'high';

export interface SettingsShape {
  currencySymbol: string;
  weekStartsOn: WeekStart;
  monthStartsOn: number;
  theme: ThemeMode;
  language: string;
  hapticsEnabled: boolean;
  reduceMotion: boolean;
  reduceTransparency: boolean;
  glassIntensity: GlassIntensityValue;
  notificationsEnabled: boolean;
  dailyReminderTime: string;
  backupReminderDays: number;
  lastBackupAt: string | null;
  appLockEnabled: boolean;
  onboardingComplete: boolean;
  rolloverWeeklyBudget: boolean;
  autoCreateWeeklyBudget: boolean;
  autoCreateWeeklyAsked: boolean;
  lastUsedPaymentMethodId: string | null;
  lastUsedCategoryId: string | null;
  defaultGroceryStores: string[];
}

export const DEFAULT_STORES = ['Market', 'Dali', 'Super 8', 'SM', 'Puregold'];

export const DEFAULT_SETTINGS: SettingsShape = {
  currencySymbol: '₱',
  weekStartsOn: 1, // Monday
  monthStartsOn: 1,
  theme: 'light',
  language: 'en',
  hapticsEnabled: true,
  reduceMotion: false,
  reduceTransparency: false,
  glassIntensity: 'medium',
  notificationsEnabled: true,
  dailyReminderTime: '20:00',
  backupReminderDays: 14,
  lastBackupAt: null,
  appLockEnabled: false,
  onboardingComplete: false,
  rolloverWeeklyBudget: false,
  autoCreateWeeklyBudget: false,
  autoCreateWeeklyAsked: false,
  lastUsedPaymentMethodId: null,
  lastUsedCategoryId: null,
  defaultGroceryStores: DEFAULT_STORES,
};

/** key in the DB → parser. Keeping it here means one source of truth. */
const parsers: Record<keyof SettingsShape, (raw: string | null) => unknown> = {
  currencySymbol: (raw) => raw || DEFAULT_SETTINGS.currencySymbol,
  weekStartsOn: (raw) => {
    const value = Number(raw);
    return (value >= 0 && value <= 6 ? value : 1) as WeekStart;
  },
  monthStartsOn: (raw) => {
    const value = Number(raw);
    return value >= 1 && value <= 31 ? Math.trunc(value) : 1;
  },
  theme: (raw) => (raw === 'dark' || raw === 'system' ? raw : 'light'),
  language: (raw) => raw || 'en',
  hapticsEnabled: (raw) => raw !== '0' && raw !== 'false',
  reduceMotion: (raw) => raw === '1' || raw === 'true',
  reduceTransparency: (raw) => raw === '1' || raw === 'true',
  glassIntensity: (raw) => (raw === 'low' || raw === 'high' ? raw : 'medium'),
  notificationsEnabled: (raw) => raw !== '0' && raw !== 'false',
  dailyReminderTime: (raw) => (/^\d{2}:\d{2}$/.test(raw ?? '') ? (raw as string) : DEFAULT_SETTINGS.dailyReminderTime),
  backupReminderDays: (raw) => {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 14;
  },
  lastBackupAt: (raw) => raw || null,
  appLockEnabled: (raw) => raw === '1' || raw === 'true',
  onboardingComplete: (raw) => raw === '1' || raw === 'true',
  rolloverWeeklyBudget: (raw) => raw === '1' || raw === 'true',
  autoCreateWeeklyBudget: (raw) => raw === '1' || raw === 'true',
  autoCreateWeeklyAsked: (raw) => raw === '1' || raw === 'true',
  lastUsedPaymentMethodId: (raw) => raw || null,
  lastUsedCategoryId: (raw) => raw || null,
  defaultGroceryStores: (raw) => {
    if (!raw) return DEFAULT_STORES;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length ? (parsed as string[]) : DEFAULT_STORES;
    } catch {
      return DEFAULT_STORES;
    }
  },
};

/** Serialise a typed settings object into `key → value` rows. */
export function serializeSettings(settings: SettingsShape): Record<string, string> {
  return {
    currencySymbol: settings.currencySymbol,
    weekStartsOn: String(settings.weekStartsOn),
    monthStartsOn: String(settings.monthStartsOn),
    theme: settings.theme,
    language: settings.language,
    hapticsEnabled: settings.hapticsEnabled ? '1' : '0',
    reduceMotion: settings.reduceMotion ? '1' : '0',
    reduceTransparency: settings.reduceTransparency ? '1' : '0',
    glassIntensity: settings.glassIntensity,
    notificationsEnabled: settings.notificationsEnabled ? '1' : '0',
    dailyReminderTime: settings.dailyReminderTime,
    backupReminderDays: String(settings.backupReminderDays),
    lastBackupAt: settings.lastBackupAt ?? '',
    appLockEnabled: settings.appLockEnabled ? '1' : '0',
    onboardingComplete: settings.onboardingComplete ? '1' : '0',
    rolloverWeeklyBudget: settings.rolloverWeeklyBudget ? '1' : '0',
    autoCreateWeeklyBudget: settings.autoCreateWeeklyBudget ? '1' : '0',
    autoCreateWeeklyAsked: settings.autoCreateWeeklyAsked ? '1' : '0',
    lastUsedPaymentMethodId: settings.lastUsedPaymentMethodId ?? '',
    lastUsedCategoryId: settings.lastUsedCategoryId ?? '',
    defaultGroceryStores: JSON.stringify(settings.defaultGroceryStores),
  };
}

/** Turn raw `key → value` rows back into a typed settings object. */
export function deserializeSettings(rows: Record<string, string | null>): SettingsShape {
  const result = { ...DEFAULT_SETTINGS } as SettingsShape;
  for (const key of Object.keys(parsers) as Array<keyof SettingsShape>) {
    (result as unknown as Record<string, unknown>)[key] = parsers[key](rows[key] ?? null);
  }
  return result;
}