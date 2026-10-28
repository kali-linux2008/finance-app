// Rabo-CSV: saldi uit een gedownload bestand, voor rekeningen die de bankkoppeling niet doorgeeft
// (zoals je spaarrekening). Je krijgt er elke week een herinnering voor.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { ScreenIn } from '../components/motion';
import { T } from '../components/T';
import { Button, Card, GoldCaption, IconButton } from '../components/ui';
import { getBankCsv, uploadBankCsv, type CsvState } from '../lib/api';
import { eur, fmtDayMonth, fmtTime } from '../lib/format';
import { useApp, useColors } from '../state/app';
import { useData } from '../state/data';

const STEPS = [
  'Open rabobank.nl in je browser en log in (Rabo Online Bankieren).',
  'Kies je spaarrekening → Download transacties.',
  'Kies het formaat CSV en een periode, bijvoorbeeld de afgelopen maand.',
  'Tik hieronder op "Kies CSV-bestand" en kies het bestand uit Downloads.',
];

/** Leest het gekozen bestand als tekst. */
async function pickText(): Promise<string | null> {
  const DocumentPicker = await import('expo-document-picker');
  const res = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.length) return null;
  const uri = res.assets[0].uri;
  if (Platform.OS === 'web') return (await fetch(uri)).text();
  const { File } = await import('expo-file-system');
  return new File(uri).text();
}

export function BankCsv() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { say } = useApp();
  const { server, refresh } = useData();
  const [state, setState] = useState<CsvState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!server) return;
    try {
      setState(await getBankCsv(server));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [server]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const choose = async () => {
    if (!server || busy) return;
    setBusy(true);
    setError(null);
    try {
      const text = await pickText();
      if (text == null) return;
      const r = await uploadBankCsv(server, text);
      setState(r);
      say(`${r.found ?? 0} ${r.found === 1 ? 'rekening' : 'rekeningen'} bijgewerkt`);
      refresh(true).catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const uploaded = state?.uploaded ? new Date(state.uploaded * 1000) : null;

  return (
    <ScreenIn style={{ backgroundColor: c.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 4, height: 56 }}>
        <IconButton name="arrow_back" size={24} onPress={() => router.back()} />
        <T size={16} w={700} style={{ marginLeft: 4 }}>Rabo-CSV</T>
      </View>
      {!server ? (
        <T size={15} color={c.muted} style={{ padding: 24 }}>Koppel eerst je server via Meer → Server.</T>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 + insets.bottom }} showsVerticalScrollIndicator={false}>
          <T size={14} color={c.muted} lh={1.5} style={{ paddingHorizontal: 24 }}>
            Je spaarrekening komt niet mee via de bankkoppeling. Stuur daarom af en toe een CSV-bestand; Meridian leest
            er het saldo uit. Het bestand blijft op je eigen server.
          </T>

          <View style={{ paddingTop: 20, paddingHorizontal: 24, paddingBottom: 8 }}>
            <GoldCaption>Zo werkt het</GoldCaption>
          </View>
          <Card style={{ marginHorizontal: 16, paddingVertical: 6 }}>
            {STEPS.map((s, i) => (
              <View key={s} style={{ flexDirection: 'row', gap: 12, paddingVertical: 8, paddingHorizontal: 16 }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, boxShadow: `inset 0 0 0 1px ${c.goldLine}`, alignItems: 'center', justifyContent: 'center' }}>
                  <T size={11} w={700} color={c.gold}>{i + 1}</T>
                </View>
                <T size={14} lh={1.45} style={{ flex: 1 }}>{s}</T>
              </View>
            ))}
          </Card>

          <View style={{ paddingTop: 16, paddingHorizontal: 16 }}>
            <Button label={busy ? 'Bezig…' : 'Kies CSV-bestand'} icon="add" block onPress={choose} />
            {busy ? <ActivityIndicator color={c.gold} style={{ marginTop: 12 }} /> : null}
            {error ? <T size={13} color={c.neg} lh={1.45} style={{ marginTop: 12 }}>{error}</T> : null}
          </View>

          {state?.accounts.length ? (
            <>
              <View style={{ paddingTop: 24, paddingHorizontal: 24, paddingBottom: 8 }}>
                <GoldCaption>Uit je laatste bestand</GoldCaption>
              </View>
              <Card style={{ marginHorizontal: 16, paddingVertical: 4 }}>
                {state.accounts.map((a) => {
                  const d = new Date(`${a.date}T12:00:00`);
                  return (
                    <View key={a.iban} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 }}>
                      <Icon name="account_balance" size={20} color={c.muted} />
                      <View style={{ flex: 1 }}>
                        <T size={15} w={600}>Rekening {a.iban}</T>
                        <T size={12} color={c.muted} style={{ marginTop: 2 }}>Laatste transactie {fmtDayMonth(d)}</T>
                      </View>
                      <T size={15} w={600} num>{eur(a.balance, true)}</T>
                    </View>
                  );
                })}
              </Card>
            </>
          ) : null}

          <T size={12} color={c.faint} lh={1.5} style={{ paddingTop: 16, paddingHorizontal: 24 }}>
            {uploaded ? `Laatst gestuurd: ${fmtDayMonth(uploaded)} om ${fmtTime(uploaded)}. ` : ''}
            Herinnering: {state?.reminder ?? '…'}. Aanpassen op de server: python -m meridian melding csv zo 10
          </T>
        </ScrollView>
      )}
    </ScreenIn>
  );
}
