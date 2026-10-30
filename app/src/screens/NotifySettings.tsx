// Meldingen instellen: welke soorten je server stuurt, vanaf hoeveel procent een dagbeweging
// een melding geeft, en je FIRE-doel voor de mijlpalen. Alles wordt op de server bewaard.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { ScreenIn } from '../components/motion';
import { T } from '../components/T';
import { ToggleRow } from '../components/Toggle';
import { Card, GoldCaption, IconButton } from '../components/ui';
import { useMoney } from '../hooks/useMoney';
import { getNotifySettings, saveNotifySettings, type NotifySettings as Settings } from '../lib/api';
import { num } from '../lib/format';
import { useApp, useColors } from '../state/app';
import { useData } from '../state/data';

const SUBS: Record<string, string> = {
  price: 'Je koersalerts en bewegingen van een positie',
  div: 'Als Trading 212 dividend uitbetaalt',
  goal: 'Elke 10% richting je FIRE-doel',
  week: 'Zondag om 18:00: je week in één melding',
  order: 'Als een limietorder is uitgevoerd',
};
const SAMPLE: Settings = {
  types: { price: true, div: true, goal: true, week: true, order: true },
  labels: { price: 'Koersalerts', div: 'Dividend ontvangen', goal: 'Doel-mijlpalen', week: 'Weekoverzicht', order: 'Orders uitgevoerd' },
  goal: 500000,
  move: 5,
  csvReminder: 'elke zondag om 10:00',
};
const MOVES = [3, 5, 8, 10];
const GOALS = [250000, 500000, 750000, 1000000];

export function NotifySettings() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { say } = useApp();
  const { money } = useMoney();
  const { live, server } = useData();
  const [s, setS] = useState<Settings | null>(live ? null : SAMPLE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!live || !server) return;
    setLoading(true);
    try {
      setS(await getNotifySettings(server));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [live, server]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  // Meteen tonen, dan opslaan; lukt dat niet, dan terug naar wat de server heeft.
  const save = async (change: { types?: Record<string, boolean>; goal?: number; move?: number }) => {
    if (!s) return;
    const before = s;
    setS({ ...s, ...change, types: { ...s.types, ...change.types } });
    if (!live || !server) return;
    try {
      setS(await saveNotifySettings(server, change));
    } catch (e) {
      setS(before);
      say((e as Error).message);
    }
  };

  return (
    <ScreenIn style={{ backgroundColor: c.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 4, height: 56 }}>
        <IconButton name="arrow_back" size={24} onPress={() => router.back()} />
        <T size={16} w={700} style={{ marginLeft: 4 }}>Meldingen instellen</T>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
        refreshControl={live ? <RefreshControl refreshing={loading} onRefresh={load} tintColor={c.gold} colors={[c.accent]} /> : undefined}
      >
        {error ? (
          <View style={{ marginTop: 4, marginHorizontal: 16, padding: 14, borderRadius: 16, boxShadow: `inset 0 0 0 1px ${c.neg}`, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Icon name="error" size={20} color={c.neg} />
            <T size={14} w={600} color={c.neg} style={{ flex: 1 }}>{error}</T>
          </View>
        ) : null}
        {!s ? (
          <ActivityIndicator style={{ marginTop: 48 }} color={c.gold} />
        ) : (
          <>
            <View style={{ paddingTop: 12, paddingHorizontal: 24, paddingBottom: 10 }}>
              <GoldCaption>Wat je krijgt</GoldCaption>
            </View>
            <Card style={{ marginHorizontal: 12, paddingVertical: 4 }}>
              {Object.keys(s.labels).map((k) => (
                <ToggleRow key={k} label={s.labels[k]} sub={SUBS[k] ?? ''} on={!!s.types[k]} onToggle={() => save({ types: { [k]: !s.types[k] } })} />
              ))}
            </Card>

            <View style={{ paddingTop: 26, paddingHorizontal: 24, paddingBottom: 10 }}>
              <GoldCaption>Grote beweging</GoldCaption>
            </View>
            <Card style={{ marginHorizontal: 12, padding: 16, opacity: s.types.price ? 1 : 0.5 }}>
              <T size={14} lh={1.45} color={c.muted}>Een melding als een positie op één dag meer stijgt of daalt dan:</T>
              <Options items={MOVES.map((m) => [m, `±${m}%`])} value={s.move} onPick={(move) => save({ move })} />
            </Card>

            <View style={{ paddingTop: 26, paddingHorizontal: 24, paddingBottom: 10 }}>
              <GoldCaption>FIRE-doel</GoldCaption>
            </View>
            <Card style={{ marginHorizontal: 12, padding: 16, opacity: s.types.goal ? 1 : 0.5 }}>
              <T size={14} lh={1.45} color={c.muted}>{`Je krijgt een melding bij elke 10% van ${money(s.goal)}.`}</T>
              <Options items={GOALS.map((g) => [g, g >= 1e6 ? `€ ${num(g / 1e6)} mln` : `€ ${num(g / 1000)}k`])} value={s.goal} onPick={(goal) => save({ goal })} />
            </Card>

            <View style={{ marginTop: 16, marginHorizontal: 24, flexDirection: 'row', gap: 10 }}>
              <Icon name="account_balance" size={18} color={c.muted} />
              <T size={13} lh={1.5} color={c.muted} style={{ flex: 1 }}>
                {`Herinnering voor je Rabo-CSV: ${s.csvReminder}. Aanpassen kan op de server met: melding csv.`}
              </T>
            </View>
          </>
        )}
      </ScrollView>
    </ScreenIn>
  );
}

function Options({ items, value, onPick }: { items: [number, string][]; value: number; onPick: (v: number) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
      {items.map(([v, label]) => {
        const on = v === value;
        return (
          <Pressable key={v} onPress={() => onPick(v)}
            style={{ flex: 1, minWidth: 64, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.surface : c.surface2, boxShadow: on ? c.goldRing : undefined }}>
            <T size={13} w={on ? 700 : 600} color={on ? c.ink : c.muted}>{label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}
