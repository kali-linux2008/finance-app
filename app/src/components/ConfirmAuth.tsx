// Bevestigen met vingerafdruk, of met de pincode als dat niet kan of je dat liever doet.
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';
import { PIN_LENGTH, pressKey } from '../lib/pin';
import { useColors } from '../state/app';
import { useLock } from '../state/lock';
import { Icon } from './Icon';
import { T } from './T';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'backspace'];

export function ConfirmAuth({ title, sub, onOk, onCancel }: { title: string; sub: string; onOk: () => void; onCancel: () => void }) {
  const c = useColors();
  const { biometricAvailable, biometricEnabled, confirmBiometric, verifyPin } = useLock();
  const bio = biometricAvailable && biometricEnabled;
  const [pinMode, setPinMode] = useState(!bio);
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const asked = useRef(false);

  const askBio = async () => {
    if (await confirmBiometric(title)) onOk();
    else setPinMode(true);
  };

  useEffect(() => {
    if (bio && !asked.current) {
      asked.current = true;
      const t = setTimeout(askBio, 0);
      return () => clearTimeout(t);
    }
  });

  const press = async (key: string) => {
    if (!key) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    const next = pressKey(pin, key);
    setPin(next);
    if (next.length < PIN_LENGTH) return;
    const r = await verifyPin(next);
    setPin('');
    if (r === 'ok') onOk();
    else setMsg(r === 'wait' ? 'Te vaak fout. Wacht even.' : 'Onjuiste pincode');
  };

  return (
    <Modal transparent visible statusBarTranslucent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: c.scrim }}>
        <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 20, paddingHorizontal: 24, paddingBottom: 32, alignItems: 'center' }}>
          <T size={20} w={700}>{title}</T>
          <T size={14} color={c.muted} style={{ marginTop: 6, textAlign: 'center' }}>{sub}</T>
          {pinMode ? (
            <>
              <View style={{ flexDirection: 'row', gap: 14, marginTop: 24, marginBottom: 8 }}>
                {Array.from({ length: PIN_LENGTH }, (_, i) => (
                  <View key={i} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: i < pin.length ? c.gold : 'transparent', borderWidth: 1.5, borderColor: i < pin.length ? c.gold : c.faint }} />
                ))}
              </View>
              <T size={13} color={msg ? c.neg : c.muted}>{msg ?? 'Voer je pincode in'}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 4, marginTop: 12, alignSelf: 'stretch' }}>
                {KEYS.map((key, i) => (
                  <View key={i} style={{ width: '33.333%', paddingHorizontal: 2 }}>
                    <Pressable disabled={!key} onPress={() => press(key)} accessibilityLabel={key === 'backspace' ? 'Wissen' : key} style={({ pressed }) => ({ height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed && key ? c.surface2 : 'transparent' })}>
                      {key === 'backspace' ? <Icon name="backspace" size={22} /> : <T size={22} w={500}>{key}</T>}
                    </Pressable>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <>
              <Pressable onPress={askBio} style={{ width: 72, height: 72, marginTop: 24, marginBottom: 12, borderRadius: 36, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="fingerprint" size={40} color={c.accent} />
              </Pressable>
              <T size={13} color={c.muted}>Raak de vingerafdruksensor aan</T>
            </>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', marginTop: 20 }}>
            {!pinMode ? <Pressable onPress={() => setPinMode(true)}><T size={14} w={600} color={c.accent}>Pincode gebruiken</T></Pressable> : <View />}
            <Pressable onPress={onCancel}><T size={14} w={600} color={c.accent}>Annuleren</T></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
