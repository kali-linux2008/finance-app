// Vergrendeling: pincode (als hash in versleutelde opslag), vingerafdruk en opnieuw vergrendelen
// als de app langer dan een minuut op de achtergrond stond.
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { lockoutEnds, lockoutRemaining, parsePinRecord, pinRecord, RELOCK_AFTER_MS } from '../lib/pin';
import { getItem, KEYS, setItem } from '../lib/storage';

/**
 * checking: opslag lezen · setup: nog geen pincode, eerst kiezen · locked: vergrendeld ·
 * loading: ontgrendeld, bronnen synchroniseren (± 1,5 s) · open: app zichtbaar
 */
export type LockPhase = 'checking' | 'setup' | 'locked' | 'loading' | 'open';
export type PinResult = 'ok' | 'wrong' | 'wait';

type LockState = {
  phase: LockPhase;
  /** Tijdstip (ms) tot wanneer je na te veel fouten moet wachten; 0 = geen wachttijd (kan in het verleden liggen). */
  waitUntil: number;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  setBiometricEnabled: (on: boolean) => Promise<void>;
  setupPin: (pin: string) => Promise<void>;
  submitPin: (pin: string) => Promise<PinResult>;
  unlockWithBiometric: () => Promise<boolean>;
  lock: () => void;
};

const Ctx = createContext<LockState | null>(null);
const LOADING_MS = 1500;

async function hash(salt: string, pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

function randomSalt(): string {
  return Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
}

type Failures = { n: number; at: number };

/** Leest het tellertje foute pogingen; beschadigde opslag telt als een volle ronde (dus even wachten). */
function parseFailures(raw: string | null): Failures {
  if (!raw) return { n: 0, at: 0 };
  try {
    const f = JSON.parse(raw) as Failures;
    if (Number.isFinite(f.n) && Number.isFinite(f.at)) return f;
  } catch {}
  return { n: 5, at: Date.now() };
}

export function LockProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<LockPhase>('checking');
  const [failures, setFailures] = useState<Failures>({ n: 0, at: 0 });
  const [biometricAvailable, setAvailable] = useState(false);
  const [biometricEnabled, setEnabled] = useState(true);
  const loadingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const backgroundSince = useRef<number | null>(null);

  // Bij opstarten: is er al een pincode, hoeveel foute pogingen, kan dit toestel vingerafdruk?
  useEffect(() => {
    (async () => {
      const [rec, fail, bio] = await Promise.all([getItem(KEYS.pin), getItem(KEYS.failures), getItem(KEYS.biometric)]);
      setFailures(parseFailures(fail));
      if (bio === 'off') setEnabled(false);
      if (Platform.OS !== 'web') {
        const ok = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
        setAvailable(ok);
      }
      setPhase(rec && parsePinRecord(rec) ? 'locked' : 'setup');
      // Bij een fout nooit naar "pincode kiezen": dan zou je een bestaande pincode kunnen omzeilen.
    })().catch(() => setPhase('locked'));
  }, []);

  const finishUnlock = useCallback(() => {
    setPhase('loading');
    clearTimeout(loadingTimer.current);
    loadingTimer.current = setTimeout(() => setPhase('open'), LOADING_MS);
  }, []);

  const saveFailures = useCallback((f: Failures) => {
    setFailures(f);
    setItem(KEYS.failures, JSON.stringify(f)).catch(() => {});
  }, []);

  const setupPin = useCallback(async (pin: string) => {
    const salt = randomSalt();
    await setItem(KEYS.pin, pinRecord(salt, await hash(salt, pin)));
    saveFailures({ n: 0, at: 0 });
    finishUnlock();
  }, [finishUnlock, saveFailures]);

  const submitPin = useCallback(async (pin: string): Promise<PinResult> => {
    if (lockoutRemaining(failures.n, failures.at, Date.now()) > 0) return 'wait';
    const rec = parsePinRecord((await getItem(KEYS.pin)) ?? '');
    if (rec && (await hash(rec.salt, pin)) === rec.hash) {
      saveFailures({ n: 0, at: 0 });
      finishUnlock();
      return 'ok';
    }
    saveFailures({ n: failures.n + 1, at: Date.now() });
    return 'wrong';
  }, [failures, finishUnlock, saveFailures]);

  const unlockWithBiometric = useCallback(async () => {
    if (!biometricAvailable || !biometricEnabled) return false;
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Ontgrendel Meridian',
      cancelLabel: 'Pincode gebruiken',
      disableDeviceFallback: true,
    });
    if (r.success) {
      saveFailures({ n: 0, at: 0 });
      finishUnlock();
    }
    return r.success;
  }, [biometricAvailable, biometricEnabled, finishUnlock, saveFailures]);

  const setBiometricEnabled = useCallback(async (on: boolean) => {
    setEnabled(on);
    await setItem(KEYS.biometric, on ? 'on' : 'off');
  }, []);

  const lock = useCallback(() => {
    clearTimeout(loadingTimer.current);
    setPhase((p) => (p === 'setup' || p === 'checking' ? p : 'locked'));
  }, []);

  // Langer dan een minuut weg geweest? Dan opnieuw vergrendelen.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') backgroundSince.current = Date.now();
      if (s === 'active' && backgroundSince.current != null) {
        if (Date.now() - backgroundSince.current > RELOCK_AFTER_MS) lock();
        backgroundSince.current = null;
      }
    });
    return () => sub.remove();
  }, [lock]);

  useEffect(() => () => clearTimeout(loadingTimer.current), []);

  const waitUntil = lockoutEnds(failures.n, failures.at);

  const value = useMemo<LockState>(() => ({
    phase, waitUntil, biometricAvailable, biometricEnabled, setBiometricEnabled,
    setupPin, submitPin, unlockWithBiometric, lock,
  }), [phase, waitUntil, biometricAvailable, biometricEnabled, setBiometricEnabled, setupPin, submitPin, unlockWithBiometric, lock]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLock(): LockState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLock buiten LockProvider');
  return v;
}
