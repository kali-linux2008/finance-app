// Versleutelde opslag op het toestel (Android Keystore). In de browser alleen voor testen: localStorage.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const web = Platform.OS === 'web';

export async function getItem(key: string): Promise<string | null> {
  if (web) return globalThis.localStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (web) return globalThis.localStorage?.setItem(key, value);
  return SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (web) return globalThis.localStorage?.removeItem(key);
  return SecureStore.deleteItemAsync(key);
}

export const KEYS = {
  pin: 'meridian.pin',
  failures: 'meridian.pinFailures',
  biometric: 'meridian.biometric',
  server: 'meridian.server',
};
