// Koersalert: een melding als een koers boven of onder een doel komt. De server kijkt elke
// twee minuten, ook als je telefoon uit staat; de melding komt via de gewone meldingen.
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View, type LayoutChangeEvent } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Icon } from '../components/Icon';
import { ScreenIn } from '../components/motion';
import { T } from '../components/T';
import { ToggleRow } from '../components/Toggle';
import { Button, GoldCaption, IconButton, Segmented } from '../components/ui';
import { addAlert, getCandles, getQuote, removeAlert, type PriceAlert as Alert, type PriceQuote } from '../lib/api';
import { fmtDayMonth } from '../lib/format';
import { alertSub, clampPct, pctLabel, price, QUICK, STEP, target, type Direction } from '../lib/watch';
import { useApp, useColors } from '../state/app';
import { useData } from '../state/data';

const H = 120;

export function PriceAlert({ alertKey }: { alertKey: string }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { say } = useApp();
  const { server } = useData();
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [history, setHistory] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dir, setDir] = useState<Direction>('boven');
  const [pctv, setPctv] = useState(5);
  const [repeat, setRepeat] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!server) return;
    try {
      const q = await getQuote(server, alertKey);
      setQuote(q);
      setAlerts(q.alerts);
      setError(null);
      if (alertKey.startsWith('okx:')) {
        const pts = await getCandles(server, alertKey.slice(4), '1M').catch(() => []);
        setHistory(pts.map((p) => p.v));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [server, alertKey]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const goal = quote ? target(quote.price, dir, pctv) : 0;

  const save = async () => {
    if (!server || !quote || saving) return;
    setSaving(true);
    try {
      await addAlert(server, { key: alertKey, dir, price: Number(goal.toPrecision(6)), repeat });
      say(`Alert: ${quote.tk} ${dir} ${price(goal, quote.cur)}`);
      router.back();
    } catch (e) {
      say((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: Alert) => {
    if (!server) return;
    try {
      setAlerts((await removeAlert(server, a.id)).filter((x) => x.key === alertKey));
      say('Alert verwijderd');
    } catch (e) {
      say((e as Error).message);
    }
  };

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 4, height: 56 }}>
      <IconButton name="arrow_back" size={24} onPress={() => router.back()} />
      <T size={16} w={700} style={{ marginLeft: 4 }}>Koersalert</T>
    </View>
  );

  if (!server || !quote) {
    return (
      <ScreenIn style={{ backgroundColor: c.bg, paddingTop: insets.top }}>
        {header}
        <View style={{ padding: 24, alignItems: 'center', gap: 12 }}>
          {!server ? (
            <T size={15} color={c.muted} style={{ textAlign: 'center' }}>Koersalerts werken met je eigen server. Koppel hem via Meer → Server.</T>
          ) : error ? (
            <>
              <T size={15} color={c.muted} style={{ textAlign: 'center' }}>{error}</T>
              <Button label="Opnieuw" variant="surface" block onPress={load} />
            </>
          ) : (
            <ActivityIndicator color={c.gold} />
          )}
        </View>
      </ScreenIn>
    );
  }

  return (
    <ScreenIn style={{ backgroundColor: c.bg, paddingTop: insets.top }}>
      {header}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <T size={10} w={700}>{quote.tk.slice(0, 5)}</T>
          </View>
          <View>
            <T size={15} w={600}>{quote.name}</T>
            <T size={12} num color={c.muted} style={{ marginTop: 2 }}>Nu {price(quote.price, quote.cur)}</T>
          </View>
        </View>

        <Segmented
          items={[['boven', 'Stijgt boven'], ['onder', 'Daalt onder']]}
          value={dir}
          onChange={setDir}
          weights={[700, 600]}
          style={{ marginTop: 18, marginHorizontal: 16 }}
        />

        <View style={{ alignItems: 'center', marginTop: 20 }}>
          <T serif size={46} lh={1.1} num color={c.gold} numberOfLines={1}>{price(goal, quote.cur)}</T>
          <T size={13} color={c.muted} style={{ marginTop: 4 }}>{pctLabel(dir, pctv)}</T>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 16, paddingHorizontal: 16 }}>
          <Round icon="remove" onPress={() => setPctv(clampPct(pctv - STEP))} />
          <View style={{ flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
            {QUICK.map((q) => {
              const on = pctv === q;
              return (
                <Pressable key={q} onPress={() => setPctv(q)} style={{ height: 36, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: on ? c.ink : c.line, backgroundColor: on ? c.ink : 'transparent' }}>
                  <T size={13} w={600} color={on ? c.bg : c.ink}>{`${dir === 'boven' ? '+' : '−'}${q}%`}</T>
                </Pressable>
              );
            })}
          </View>
          <Round icon="add" onPress={() => setPctv(clampPct(pctv + STEP))} />
        </View>

        <TargetChart history={history} now={quote.price} goal={goal} label={price(goal, quote.cur)} />

        <View style={{ marginTop: 12, marginHorizontal: 16, borderRadius: 20, backgroundImage: c.surfaceGrad, boxShadow: `inset 0 0 0 1px ${c.line}` }}>
          <ToggleRow label="Elke keer melden" sub="Anders vervalt de alert na één melding" on={repeat} onToggle={() => setRepeat(!repeat)} />
        </View>

        {alerts.length ? (
          <>
            <View style={{ paddingTop: 20, paddingHorizontal: 24, paddingBottom: 6 }}>
              <GoldCaption>Actieve alerts</GoldCaption>
            </View>
            <View style={{ marginHorizontal: 12, borderWidth: 1, borderColor: c.line, borderRadius: 20, paddingVertical: 4 }}>
              {alerts.map((a) => (
                <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 16, paddingRight: 4 }}>
                  <View style={{ flex: 1 }}>
                    <T size={14} w={600}>{a.tk} · {a.dir} {price(a.price, a.cur)}</T>
                    <T size={12} color={c.muted} style={{ marginTop: 2 }}>{alertSub(a, fmtDayMonth)}</T>
                  </View>
                  <IconButton name="delete" size={20} color={c.faint} label="Verwijderen" onPress={() => remove(a)} />
                </View>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
      <View style={{ paddingTop: 12, paddingHorizontal: 12, paddingBottom: 16 + insets.bottom, borderTopWidth: 1, borderTopColor: c.line }}>
        <Button label={saving ? 'Opslaan…' : 'Alert opslaan'} block onPress={save} />
      </View>
    </ScreenIn>
  );
}

function Round({ icon, onPress }: { icon: 'add' | 'remove'; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={{ width: 40, height: 40, borderRadius: 20, boxShadow: `inset 0 0 0 1px ${c.goldLine}`, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={20} color={c.gold} />
    </Pressable>
  );
}

/** Koers van de afgelopen maand met een gestippelde gouden doellijn. Zonder historie (aandelen) alleen de lijnen. */
function TargetChart({ history, now, goal, label }: { history: number[]; now: number; goal: number; label: string }) {
  const c = useColors();
  const [w, setW] = useState(0);
  const geo = useMemo(() => {
    const arr = history.length > 1 ? history : [now, now];
    const all = [...arr, goal];
    const mn = Math.min(...all);
    const mx = Math.max(...all);
    const pad = (mx - mn || mx * 0.05) * 0.08;
    const y = (v: number) => H - ((v - mn + pad) / (mx - mn + 2 * pad || 1)) * H;
    const d = w ? arr.map((v, i) => `${i ? 'L' : 'M'}${((i / (arr.length - 1)) * w).toFixed(1)} ${y(v).toFixed(1)}`).join(' ') : '';
    return { d, ty: y(goal) };
  }, [history, now, goal, w]);
  return (
    <View style={{ marginTop: 16, marginHorizontal: 16, paddingTop: 16, paddingHorizontal: 14, paddingBottom: 12, borderRadius: 20, backgroundImage: c.surfaceGrad, boxShadow: `inset 0 0 0 1px ${c.line}` }}>
      <View style={{ height: H }} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
        {w ? (
          <Svg width={w} height={H} style={{ position: 'absolute' }}>
            <Path d={geo.d} fill="none" stroke={c.accent} strokeWidth={1.75} strokeDasharray={history.length > 1 ? undefined : '2 4'} />
          </Svg>
        ) : null}
        <View style={{ position: 'absolute', left: 0, right: 0, top: geo.ty, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: c.gold }}>
          <T size={11} w={700} num color={c.gold} style={{ position: 'absolute', right: 0, top: -22, backgroundColor: c.surface, paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 }}>{label}</T>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
        <T size={11} color={c.faint}>{history.length > 1 ? '1 maand geleden' : 'Geen koershistorie voor aandelen'}</T>
        <T size={11} color={c.faint}>nu</T>
      </View>
    </View>
  );
}
