// Lopende orders: per broker de status, en open orders die je kunt wijzigen (limiet ±0,5%) of annuleren.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { FadeUp, ScreenIn } from '../components/motion';
import { T } from '../components/T';
import { IconButton, TickerBox } from '../components/ui';
import { SAMPLE_ORDER_PRICES, SAMPLE_ORDERS } from '../data/sample';
import { amendOrder, cancelOrder, getOrders, type Broker, type OpenOrder } from '../lib/api';
import { currencyPrefix, num } from '../lib/format';
import { useApp, useColors } from '../state/app';
import { useData } from '../state/data';
import { tileColors } from '../theme/tiles';

const AMBER = '#D9A441';
const SAMPLE_BROKERS: Broker[] = [
  { id: 't212', name: 'Trading 212', connected: true, demo: false, error: null },
  { id: 'okx', name: 'OKX', connected: true, demo: false, error: null },
];

export function Orders() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { say } = useApp();
  const { live, server, positions } = useData();
  const [data, setData] = useState<{ orders: OpenOrder[]; brokers: Broker[] } | null>(
    live ? null : { orders: SAMPLE_ORDERS.map((o) => ({ ...o })), brokers: SAMPLE_BROKERS },
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<{ id: string; draft: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!live || !server) return;
    setLoading(true);
    try {
      setData(await getOrders(server));
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

  /** Koers nu in de valuta van de order, als we die weten (voor "x% onder koers" en de stappen van 0,5%). */
  const priceOf = (o: OpenOrder): number | null => {
    if (!live) return SAMPLE_ORDER_PRICES[o.tk] ?? null;
    const p = o.broker === 't212' ? positions.find((x) => x.id === `t212-${o.symbol}`) : positions.find((x) => x.cat === 'cr' && x.tk === o.tk);
    const cur = o.cur ?? p?.cur ?? 'EUR';
    return p?.price && (p.cur ?? 'EUR') === cur ? p.price : null;
  };

  const remove = (o: OpenOrder) => {
    const go = async () => {
      setBusy(true);
      try {
        if (live && server) await cancelOrder(server, o.id);
        setData((d) => d && { ...d, orders: d.orders.filter((x) => x.id !== o.id) });
        setOpen(null);
        say(`Order geannuleerd · ${o.tk}`);
        if (live) load();
      } catch (e) {
        say((e as Error).message);
      } finally {
        setBusy(false);
      }
    };
    if (Platform.OS === 'web') return go();
    Alert.alert('Order annuleren?', `${o.side === 'kopen' ? 'Koop' : 'Verkoop'} ${o.tk} wordt ingetrokken.`, [
      { text: 'Nee', style: 'cancel' },
      { text: 'Annuleren', style: 'destructive', onPress: go },
    ]);
  };

  const save = async (o: OpenOrder, limit: number) => {
    setBusy(true);
    try {
      const id = live && server ? (await amendOrder(server, o.id, limit)).id : o.id;
      setData((d) => d && { ...d, orders: d.orders.map((x) => (x.id === o.id ? { ...x, id, limit } : x)) });
      setOpen(null);
      say(`Limiet ${o.tk} aangepast naar ${currencyPrefix(o.cur ?? 'EUR')}${num(limit, 2)}`);
      if (live) load();
    } catch (e) {
      say((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const orders = data?.orders ?? [];
  return (
    <ScreenIn style={{ backgroundColor: c.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 4, height: 56 }}>
        <IconButton name="arrow_back" size={24} onPress={() => router.back()} />
        <T size={16} w={700} style={{ marginLeft: 4 }}>Orders</T>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={live ? <RefreshControl refreshing={loading} onRefresh={load} tintColor={c.gold} colors={[c.accent]} /> : undefined}
      >
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 12 }}>
          {(data?.brokers ?? SAMPLE_BROKERS).map((b) => {
            const [dot, s, sub] = !live
              ? b.id === 't212' ? [AMBER, 'Markt gesloten', 'Opent ma 19 okt 09:00'] : [c.pos, 'Online', '24/7 · API verbonden']
              : !b.connected ? [c.faint, 'Niet gekoppeld', 'Geen handelssleutel']
              : b.error ? [c.neg, 'Fout', b.error]
              : [c.pos, b.demo ? 'Oefenaccount' : 'Verbonden', b.id === 'okx' ? '24/7 · demo' : 'Practice · demo'];
            return (
              <View key={b.id} style={{ flex: 1, backgroundColor: c.surface, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14 }}>
                <T size={12} color={c.muted}>{b.name}</T>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
                  <T size={14} w={700}>{s}</T>
                </View>
                <T size={12} color={c.muted} numberOfLines={2} style={{ marginTop: 2 }}>{sub}</T>
              </View>
            );
          })}
        </View>

        {error ? <T size={13} color={c.neg} style={{ paddingTop: 16, paddingHorizontal: 24 }}>{error}</T> : null}
        {!data && !error ? <ActivityIndicator color={c.gold} style={{ marginTop: 48 }} /> : null}

        {orders.map((o, i) => {
          const price = priceOf(o);
          const exp = open?.id === o.id;
          const isL = o.type === 'limiet' && o.limit != null;
          const lim = exp ? open.draft : o.limit ?? 0;
          const dist = isL && price ? ((lim - price) / price) * 100 : null;
          const own = positions.find((p) => p.tk === o.tk);
          const [bg, fg] = own ? tileColors(c, own.tile) : [c.surface2, c.ink];
          const t212 = o.broker === 't212';
          const fmt = (x: number) => currencyPrefix(o.cur ?? (t212 ? own?.cur ?? 'EUR' : 'EUR')) + num(x, 2);
          const step = (price ?? o.limit ?? 0) * 0.005;
          return (
            <FadeUp key={o.id} index={i} step={50}>
              <View style={{ marginTop: 12, marginHorizontal: 16, backgroundColor: c.surface, borderRadius: 18, overflow: 'hidden' }}>
                <Pressable onPress={() => setOpen(exp ? null : { id: o.id, draft: o.limit ?? 0 })} style={{ paddingTop: 12, paddingHorizontal: 14, paddingBottom: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                    <TickerBox tk={o.tk} bg={bg} fg={fg} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <T size={15} w={600}>{o.side === 'kopen' ? 'Koop' : 'Verkoop'} {o.tk}</T>
                        <View style={{ paddingVertical: 2, paddingHorizontal: 6, borderRadius: 6, backgroundColor: c.surface2 }}>
                          <T size={10} w={700} color={c.muted}>{isL ? 'LIMIET' : 'MARKT'}</T>
                        </View>
                      </View>
                      <T size={12} color={c.muted} numberOfLines={1} style={{ marginTop: 2 }}>
                        {num(o.qty, 0, 6)} {t212 ? 'st' : o.tk}{o.filled ? ` · ${num(o.filled, 0, 6)} gevuld` : ''} · {t212 ? 'Trading 212' : 'OKX'}
                      </T>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <T size={15} w={700} num color={c.gold}>{isL ? fmt(lim) : 'Markt'}</T>
                      <T size={12} color={c.muted} style={{ marginTop: 2 }}>
                        {dist != null ? `${num(Math.abs(dist), 1, 1)}% ${dist < 0 ? 'onder' : 'boven'} koers` : isL ? '' : 'tegen openingskoers'}
                      </T>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingLeft: 52 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t212 && !live ? AMBER : c.pos }} />
                    <T size={12} w={600} color={t212 && !live ? AMBER : c.pos} style={{ flex: 1 }}>
                      {t212 && !live ? 'Wacht op opening markt' : t212 ? 'Open bij Trading 212' : 'Actief in orderboek'}
                    </T>
                    <View style={{ transform: [{ rotate: exp ? '180deg' : '0deg' }] }}>
                      <Icon name="expand_more" size={18} color={c.faint} />
                    </View>
                  </View>
                </Pressable>
                {exp ? (
                  <View style={{ borderTopWidth: 1, borderTopColor: c.line, padding: 14, gap: 12 }}>
                    {isL ? (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <T size={14} color={c.muted}>Limietkoers</T>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Round icon="remove" onPress={() => setOpen({ id: o.id, draft: Math.max(0.01, open.draft - step) })} />
                          <T size={15} w={700} num style={{ minWidth: 104, textAlign: 'center' }}>{fmt(lim)}</T>
                          <Round icon="add" onPress={() => setOpen({ id: o.id, draft: open.draft + step })} />
                        </View>
                      </View>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable disabled={busy} onPress={() => remove(o)} style={{ flex: 1, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: c.neg, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
                        <T size={14} w={700} color={c.neg}>Order annuleren</T>
                      </Pressable>
                      {isL ? (
                        <Pressable disabled={busy || lim === o.limit} onPress={() => save(o, Math.round(lim * 100) / 100)} style={{ flex: 1, height: 44, borderRadius: 22, backgroundImage: c.btnBg, boxShadow: c.btnShadow, alignItems: 'center', justifyContent: 'center', opacity: busy || lim === o.limit ? 0.5 : 1 }}>
                          <T size={14} w={700} color={c.onAccent}>Opslaan</T>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ) : null}
              </View>
            </FadeUp>
          );
        })}

        {data && !orders.length ? (
          <View style={{ alignItems: 'center', paddingTop: 48, paddingHorizontal: 32 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="pending_actions" size={32} color={c.gold} />
            </View>
            <T serif size={22} style={{ marginTop: 16 }}>Geen open orders</T>
            <T size={14} lh={1.5} color={c.muted} style={{ marginTop: 6, textAlign: 'center' }}>Limietorders en orders die op de markt wachten verschijnen hier.</T>
          </View>
        ) : null}

        <T size={12} lh={1.5} color={c.faint} style={{ paddingTop: 16, paddingHorizontal: 24, textAlign: 'center' }}>
          {live
            ? 'Je ziet hier de orders van je oefenaccounts. Wijzig je bij Trading 212 een limiet, dan plaatst de server de order opnieuw.'
            : 'Limietorders bij Trading 212 vervallen na 30 dagen. OKX-orders blijven staan tot je annuleert.'}
        </T>
      </ScrollView>
    </ScreenIn>
  );
}

function Round({ icon, onPress }: { icon: 'add' | 'remove'; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityLabel={icon === 'add' ? 'Hoger' : 'Lager'} style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, boxShadow: `inset 0 0 0 1px ${c.goldLine}`, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.9 : 1 }] })}>
      <Icon name={icon} size={20} color={c.gold} />
    </Pressable>
  );
}
