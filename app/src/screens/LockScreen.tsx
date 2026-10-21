// Vergrendelscherm: pincode instellen (eerste keer) of ontgrendelen met pincode of vingerafdruk.
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { T } from '../components/T';
import { isTooSimple, PIN_LENGTH, pressKey } from '../lib/pin';
import { useApp } from '../state/app';
import { useLock } from '../state/lock';
import { hero } from '../theme/tokens';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'fingerprint', '0', 'backspace'] as const;
const ERROR = '#FFC9BC';

const tap = () => {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
};
const buzz = () => {
  if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
};

export function LockScreen() {
  const { colors: c } = useApp();
  const insets = useSafeAreaInsets();
  const { phase, waitUntil, biometricAvailable, biometricEnabled, setupPin, submitPin, unlockWithBiometric } = useLock();
  const setup = phase === 'setup';
  const bio = !setup && biometricAvailable && biometricEnabled;

  const [pin, setPin] = useState('');
  const [first, setFirst] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [shake] = useState(() => new Animated.Value(0));
  const prompted = useRef(false);

  const waitSec = Math.ceil(Math.max(0, waitUntil - now) / 1000);
  const waiting = waitSec > 0;

  // Aftellen zolang je na te veel fouten moet wachten (meteen bijwerken, daarna elke 250 ms).
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 250);
    const stop = setTimeout(() => clearInterval(t), Math.max(0, waitUntil - Date.now()) + 300);
    return () => {
      clearTimeout(first);
      clearTimeout(stop);
      clearInterval(t);
    };
  }, [waitUntil]);

  // Vraag meteen om de vingerafdruk zodra het scherm opent.
  useEffect(() => {
    if (bio && !prompted.current) {
      prompted.current = true;
      unlockWithBiometric().catch(() => {});
    }
  }, [bio, unlockWithBiometric]);

  const wrong = (msg: string) => {
    buzz();
    setMessage(msg);
    setPin('');
    Animated.sequence(
      [10, -10, 7, -7, 3, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 50, useNativeDriver: true })),
    ).start();
  };

  const complete = async (code: string) => {
    if (setup) {
      if (!first) {
        if (isTooSimple(code)) return wrong('Te makkelijk te raden. Kies een andere code.');
        setFirst(code);
        setMessage(null);
        setPin('');
        return;
      }
      if (code !== first) {
        setFirst(null);
        return wrong('De pincodes komen niet overeen. Kies opnieuw.');
      }
      setBusy(true);
      await setupPin(code);
      return;
    }
    setBusy(true);
    const r = await submitPin(code);
    setBusy(false);
    if (r === 'wrong') wrong('Onjuiste pincode');
    if (r === 'wait') setPin('');
  };

  const press = (key: (typeof KEYS)[number]) => {
    if (busy || waiting) return;
    if (key === 'fingerprint') {
      if (bio) unlockWithBiometric().catch(() => {});
      return;
    }
    tap();
    const next = pressKey(pin, key);
    setPin(next);
    if (key !== 'backspace') setMessage(null);
    if (next.length === PIN_LENGTH) complete(next).catch(() => setBusy(false));
  };

  const sub = setup ? (first ? 'Herhaal je pincode' : `Kies een pincode van ${PIN_LENGTH} cijfers`) : 'Welkom terug, Joris';
  const hint = waiting
    ? `Te veel pogingen. Probeer het over ${waitSec} s opnieuw.`
    : message ?? (setup ? 'Je pincode blijft versleuteld op dit toestel' : bio ? 'Tik op de vingerafdruk of voer je pincode in' : 'Voer je pincode in');

  return (
    <View style={{ flex: 1, backgroundImage: c.heroBg, alignItems: 'center', paddingTop: insets.top + 48, paddingHorizontal: 32, paddingBottom: insets.bottom + 24 }}>
      <T serif size={34} color={hero.amount}>Meridian</T>
      <T size={14} color={c.heroMuted} style={{ marginTop: 6 }}>{sub}</T>

      <Animated.View
        accessibilityLabel={`${pin.length} van ${PIN_LENGTH} cijfers ingevoerd`}
        style={{ flexDirection: 'row', gap: 16, marginTop: 48, marginBottom: 40, transform: [{ translateX: shake }] }}
      >
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <View key={i} style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: hero.rule, backgroundColor: i < pin.length ? '#FFFFFF' : 'transparent' }} />
        ))}
      </Animated.View>

      <View style={{ width: 72 * 3 + 28 * 2, flexDirection: 'row', flexWrap: 'wrap', columnGap: 28, rowGap: 16, opacity: waiting ? 0.4 : 1 }}>
        {KEYS.map((k) => {
          const icon = k === 'fingerprint' || k === 'backspace';
          if (k === 'fingerprint' && !bio) return <View key={k} style={{ width: 72, height: 72 }} />;
          return (
            <Pressable
              key={k}
              onPress={() => press(k)}
              disabled={waiting}
              accessibilityLabel={k === 'fingerprint' ? 'Vingerafdruk' : k === 'backspace' ? 'Wissen' : k}
              style={({ pressed }) => ({
                width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center',
                backgroundColor: icon ? (pressed ? 'rgba(255,255,255,0.12)' : 'transparent') : pressed ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.12)',
              })}
            >
              {icon ? <Icon name={k} size={26} color="#FFFFFF" /> : <T size={26} color="#FFFFFF">{k}</T>}
            </Pressable>
          );
        })}
      </View>

      <View style={{ flex: 1 }} />
      <T size={13} color={message || waiting ? ERROR : c.heroMuted} style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">{hint}</T>
    </View>
  );
}
