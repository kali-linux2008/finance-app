// Meer: profiel, links naar de overige schermen en de schakelaars (thema, privacy, vingerafdruk).
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components/Icon';
import { ScreenIn } from '../components/motion';
import { T } from '../components/T';
import { Card, IconButton } from '../components/ui';
import { OPEN_ORDERS } from '../data/sample';
import { useApp, useColors } from '../state/app';
import { useData } from '../state/data';
import { useLock } from '../state/lock';

const ROWS: [IconName, string, string][] = [
  ['pending_actions', 'Lopende orders', `${OPEN_ORDERS} open`],
  ['autorenew', 'Periodiek inleggen', 'Plannen, pauzeren, historie'],
  ['balance', 'Herbalanceren', 'Doel vs. nu'],
  ['calendar_month', 'Dividendkalender', 'Ex- en uitbetaaldata'],
  ['summarize', 'Rapporten', 'Maand- en jaaroverzicht'],
  ['insights', 'Inzichten & allocatie', 'Regio, valuta, kosten, Box 3'],
  ['payments', 'Inkomen & dividend', 'Afgelopen 12 maanden'],
  ['link', 'Bronnen', '5 gekoppeld'],
  ['notifications', 'Meldingen', '4 typen aan'],
];

export function More() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { theme, setTheme, privacy, togglePrivacy, say } = useApp();
  const { lock, biometricAvailable, biometricEnabled, setBiometricEnabled } = useLock();
  const { server, error } = useData();
  const soon = () => say('Komt in een volgende stap');
  return (
    <ScreenIn style={{ backgroundColor: c.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 4, height: 56 }}>
        <IconButton name="arrow_back" size={24} onPress={() => router.back()} />
        <T size={16} w={700} style={{ marginLeft: 4 }}>Meer</T>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 4, paddingHorizontal: 24, paddingBottom: 16 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <T size={18} w={700}>JV</T>
          </View>
          <View>
            <T serif size={22}>Joris de Vries</T>
            <T size={13} color={c.muted}>Basisvaluta EUR · 5 bronnen</T>
          </View>
        </View>

        <Card style={{ marginHorizontal: 12, paddingVertical: 4 }}>
          <Pressable onPress={() => router.push('/server')} style={{ flexDirection: 'row', gap: 16, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 }}>
            <Icon name="sync" size={22} color={server ? (error ? c.neg : c.pos) : c.muted} />
            <View style={{ flex: 1 }}>
              <T size={15} w={600}>Server</T>
              <T size={12} color={c.muted} style={{ marginTop: 2 }} numberOfLines={1}>
                {server ? `${error ? 'Niet bereikbaar' : 'Gekoppeld'} · ${server.url.replace(/^https?:\/\//, '')}` : 'Niet gekoppeld · je ziet voorbeelddata'}
              </T>
            </View>
            <Icon name="chevron_right" size={20} color={c.faint} />
          </Pressable>
          {ROWS.map(([icon, label, sub]) => (
            <Pressable key={label} onPress={soon} style={{ flexDirection: 'row', gap: 16, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 }}>
              <Icon name={icon} size={22} color={c.muted} />
              <View style={{ flex: 1 }}>
                <T size={15} w={600}>{label}</T>
                <T size={12} color={c.muted} style={{ marginTop: 2 }}>{sub}</T>
              </View>
              <Icon name="chevron_right" size={20} color={c.faint} />
            </Pressable>
          ))}
        </Card>

        <Card style={{ marginTop: 12, marginHorizontal: 16, paddingVertical: 4 }}>
          <ToggleRow label="Donker thema" sub="Volgt anders het systeem" on={theme === 'dark'} onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
          <ToggleRow label="Privacymodus" sub="Bedragen verbergen" on={privacy} onToggle={togglePrivacy} />
          <ToggleRow
            label="Vingerafdruk bij openen"
            sub={biometricAvailable ? 'Pincode als terugval' : 'Geen vingerafdruk ingesteld op dit toestel'}
            on={biometricAvailable && biometricEnabled}
            onToggle={() => (biometricAvailable ? setBiometricEnabled(!biometricEnabled) : say('Stel eerst een vingerafdruk in bij de Android-instellingen'))}
          />
        </Card>

        <Pressable onPress={lock} style={{ marginTop: 12, marginHorizontal: 16, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: c.line, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="lock" size={20} />
          <T size={15} w={600}>Vergrendelen</T>
        </Pressable>
      </ScrollView>
    </ScreenIn>
  );
}

function ToggleRow({ label, sub, on, onToggle }: { label: string; sub: string; on: boolean; onToggle: () => void }) {
  const c = useColors();
  const [k] = useState(() => new Animated.Value(on ? 1 : 0));
  useEffect(() => {
    Animated.timing(k, { toValue: on ? 1 : 0, duration: 200, easing: Easing.bezier(0.3, 0.7, 0.2, 1.3), useNativeDriver: true }).start();
  }, [on, k]);
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 }}>
      <View style={{ flex: 1 }}>
        <T size={15} w={600}>{label}</T>
        <T size={12} color={c.muted} style={{ marginTop: 2 }}>{sub}</T>
      </View>
      <Pressable onPress={onToggle} accessibilityRole="switch" accessibilityState={{ checked: on }} style={{ width: 52, height: 32, borderRadius: 16, backgroundColor: on ? c.accent : c.faint }}>
        <Animated.View style={{ position: 'absolute', top: 4, left: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF', transform: [{ translateX: k.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) }] }} />
      </Pressable>
    </View>
  );
}
