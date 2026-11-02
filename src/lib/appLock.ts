/**
 * App lock — optional PIN + biometrics (brief Section 6.12).
 *
 * Local only: the PIN is hashed and kept in `expo-secure-store` (Keychain /
 * Keystore), never in SQLite, and never in the backup file. Biometrics go
 * through `expo-local-authentication`, which is a device API, not a network.
 */

import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const PIN_KEY = 'matchawallet.applock.pin.v1';

export type LockMethod = 'pin' | 'biometric' | 'none';

/** Hashes so the raw PIN is never stored. Not a security boundary — just hygiene. */
function hash(pin: string): string {
  let hashValue = 2166136261;
  for (let index = 0; index < pin.length; index += 1) {
    hashValue ^= pin.charCodeAt(index);
    hashValue = Math.imul(hashValue, 16777619);
  }
  return (hashValue >>> 0).toString(36) + ':' + pin.length;
}

export async function hasPin(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(PIN_KEY);
  return Boolean(value);
}

export async function savePin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(PIN_KEY, hash(pin), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function removePin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_KEY);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(PIN_KEY);
  if (!stored) return true;
  return stored === hash(pin);
}

export async function biometricAvailable(): Promise<boolean> {
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  } catch {
    return false;
  }
}

export async function authenticateBiometric(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Matcha Wallet',
      fallbackLabel: 'Use PIN',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}

export function validPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}
