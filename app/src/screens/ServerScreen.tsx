// Server koppelen en de status van je bronnen bekijken.
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, TextInput, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { ScreenIn } from '../components/motion';
import { T } from '../components/T';
import { Button, Card, GoldCaption, IconButton } from '../components/ui';
import { fmtTime } from '../lib/format';
import { useMoney } from '../hooks/useMoney';
import { useApp, useColors } from '../state/app';
import { useData } from '../state/data';
import { font } from '../theme/tokens';

export function ServerScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { server, error, loading, sources, warnings, asOf, refresh, pair, unpair } = useData();
  const { say } = useApp();
  const { money } = useMoney();
  const [url, setUrl] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const doPair = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await pair(url, code);
      say('Gekoppeld met je server');
      setCode('');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Koppelen mislukt');
    } finally {
      setBusy(false);
    }
  };

  const confirmUnpair = () => {
    const go = () => unpair().then(() => say('Ontkoppeld; je ziet weer de voorbeelddata'));
    if (Platform.OS === 'web') return go();
    Alert.alert('Server ontkoppelen?', 'De app toont daarna weer de voorbeelddata. Je kunt altijd opnieuw koppelen.', [
      { text: 'Annuleren', style: 'cancel' },
      { text: 'Ontkoppelen', style: 'destructive', onPress: go },
    ]);
  };

  const input = { height: 52, borderRadius: 16, paddingHorizontal: 16, backgroundColor: c.surface, color: c.ink, fontFamily: font.sansSemi, fontSize: 16, boxShadow: `inset 0 0 0 1px ${c.line}` } as const;

  return (
    <ScreenIn style={{ backgroundColor: c.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 4, height: 56 }}>
        <IconButton name="arrow_back" size={24} onPress={() => router.back()} />
        <T size={16} w={700} style={{ marginLeft: 4 }}>Server</T>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 + insets.bottom }} keyboardShouldPersistTaps="handled">
        {!server ? (
          <View style={{ paddingHorizontal: 24, gap: 14 }}>
            <T serif size={26}>Koppel je server</T>
            <T size={14} lh={1.5} color={c.muted}>
              Je eigen Meridian-server haalt je saldi op bij Trading 212, OKX en je Trezor. De app praat alleen met
              die server; je API-sleutels blijven daar.
            </T>
            <T size={14} lh={1.5} color={c.muted}>
              Op de server: <T size={14} w={700}>python -m meridian koppelcode</T> (of met Docker:{' '}
              <T size={14} w={700}>docker compose exec meridian python -m meridian koppelcode</T>).
            </T>
            <View style={{ gap: 6 }}>
              <T size={12} w={600} color={c.muted}>Adres van de server</T>
              <TextInput
                value={url}
                onChangeText={setUrl}
                placeholder="192.168.1.20:8000"
                placeholderTextColor={c.faint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={input}
              />
            </View>
            <View style={{ gap: 6 }}>
              <T size={12} w={600} color={c.muted}>Koppelcode (6 cijfers, 10 minuten geldig)</T>
              <TextInput
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="123456"
                placeholderTextColor={c.faint}
                keyboardType="number-pad"
                style={[input, { letterSpacing: 4 }]}
              />
            </View>
            {message ? <T size={13} color={c.neg}>{message}</T> : null}
            {busy ? <ActivityIndicator color={c.accent} /> : (
              <Button label="Koppelen" onPress={doPair} block style={{ opacity: url && code.length === 6 ? 1 : 0.5 }} />
            )}
            <T size={12} lh={1.5} color={c.faint}>
              Zolang er geen server gekoppeld is, toont de app voorbeelddata. Hoe je de server installeert staat in
              docs/SERVER.md op GitHub.
            </T>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <Card style={{ marginHorizontal: 16, padding: 20, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: error ? c.neg : c.pos }} />
                <T size={15} w={700}>{error ? 'Niet bereikbaar' : 'Verbonden'}</T>
              </View>
              <T size={13} color={c.muted}>{server.url}</T>
              {asOf ? <T size={12} color={c.muted}>Laatst bijgewerkt om {fmtTime(new Date(asOf * 1000))}</T> : null}
              {error ? <T size={13} color={c.neg}>{error}</T> : null}
            </Card>

            <View style={{ paddingTop: 12, paddingHorizontal: 24, paddingBottom: 4 }}>
              <GoldCaption>Bronnen</GoldCaption>
            </View>
            <Card style={{ marginHorizontal: 12, paddingVertical: 4 }}>
              {sources.length ? sources.map((s) => (
                <View key={s.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.status === 'ok' ? c.pos : c.neg }} />
                  <View style={{ flex: 1 }}>
                    <T size={15} w={600}>{s.name}</T>
                    <T size={12} color={s.status === 'ok' ? c.muted : c.neg} style={{ marginTop: 2 }}>
                      {s.status === 'ok' ? 'In orde' : s.status === 'oud' ? `Laatst bekende stand · ${s.error}` : s.error ?? 'Mislukt'}
                    </T>
                  </View>
                  <T size={14} w={600} num>{s.status === 'fout' ? '—' : money(s.value)}</T>
                </View>
              )) : (
                <T size={13} color={c.muted} style={{ padding: 16 }}>
                  Nog geen bronnen. Voeg ze toe op de server met python -m meridian bron trading212 (of okx, trezor) en
                  python -m meridian handmatig.
                </T>
              )}
            </Card>

            {warnings.length ? (
              <Card style={{ marginHorizontal: 16, padding: 16, gap: 6 }}>
                {warnings.map((w) => (
                  <View key={w} style={{ flexDirection: 'row', gap: 8 }}>
                    <Icon name="notifications" size={16} color={c.gold} />
                    <T size={13} color={c.muted} style={{ flex: 1 }}>{w}</T>
                  </View>
                ))}
              </Card>
            ) : null}

            <View style={{ marginHorizontal: 16, gap: 10, marginTop: 8 }}>
              {loading ? <ActivityIndicator color={c.accent} /> : <Button label="Nu vernieuwen" icon="sync" onPress={() => refresh(true)} block />}
              <Button label="Ontkoppelen" variant="outline" onPress={confirmUnpair} block />
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenIn>
  );
}
