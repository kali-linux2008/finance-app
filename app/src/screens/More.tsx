// Meer: profiel, links naar de overige schermen en de schakelaars (thema, privacy, vingerafdruk).
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components/Icon';
import { ScreenIn } from '../components/motion';
import { T } from '../components/T';
import { ToggleRow } from '../components/Toggle';
import { UpdateRow } from '../components/UpdateCard';
import { Card, IconButton } from '../components/ui';
import { OPEN_ORDERS } from '../data/sample';
import { disableNotifications, enableNotifications, inExpoGo } from '../lib/alerts';
import { getItem, KEYS } from '../lib/storage';
import { useApp, useColors } from '../state/app';
import { useData } from '../state/data';
import { useLock } from '../state/lock';

// Vierde waarde: het scherm dat al bestaat; zonder route volgt het in een latere stap.
const ROWS: [IconName, string, string, string?][] = [
  ['pending_actions', 'Lopende orders', `${OPEN_ORDERS} open`, '/orders'],
  ['autorenew', 'Periodiek inleggen', 'Plannen, pauzeren, historie', '/periodiek'],
  ['star', 'Volglijst', 'Koersen volgen en koersalerts', '/volglijst'],
  ['balance', 'Herbalanceren', 'Doel vs. nu'],
  ['calendar_month', 'Dividendkalender', 'Ex- en uitbetaaldata'],
  ['summarize', 'Rapporten', 'Maand- en jaaroverzicht'],
  ['insights', 'Inzichten & allocatie', 'Regio, valuta, kosten, Box 3'],
  ['payments', 'Inkomen & dividend', 'Afgelopen 12 maanden'],
  ['link', 'Bronnen', '5 gekoppeld'],
  ['notifications', 'Meldingen', 'Alle meldingen van je server', '/meldingen'],
];

export function More() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { theme, setTheme, privacy, togglePrivacy, say } = useApp();
  const { lock, biometricAvailable, biometricEnabled, setBiometricEnabled } = useLock();
  const { server, error } = useData();
  const soon = () => say('Komt in een volgende stap');
  const [notify, setNotify] = useState(false);

  useEffect(() => {
    getItem(KEYS.notify).then((v) => setNotify(v === 'on')).catch(() => {});
  }, []);

  const toggleNotify = async () => {
    try {
      if (notify) {
        await disableNotifications();
        setNotify(false);
        say('Meldingen uit');
      } else {
        await enableNotifications();
        setNotify(true);
        say(inExpoGo ? 'Meldingen aan (in Expo Go alleen als de app open is)' : 'Meldingen aan');
      }
    } catch (e) {
      say((e as Error).message);
    }
  };
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
          <UpdateRow />
          {ROWS.map(([icon, label, sub, route]) => (
            <Pressable key={label} onPress={route ? () => router.push(route as never) : soon} style={{ flexDirection: 'row', gap: 16, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 }}>
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
            label="Meldingen"
            sub={inExpoGo ? 'In Expo Go alleen als de app open is' : 'Ook als de app dicht is (ongeveer elk kwartier)'}
            on={notify}
            onToggle={toggleNotify}
          />
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
