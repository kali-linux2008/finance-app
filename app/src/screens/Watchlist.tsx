// Volglijst: koersen volgen zonder te kopen (crypto via OKX en je eigen aandelen).
// Tik op een tegel voor een koersalert; met het potlood haal je tegels weg.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Icon } from '../components/Icon';
import { FadeUp, ScreenIn } from '../components/motion';
import { T } from '../components/T';
import { Button, GoldCaption, IconButton } from '../components/ui';
import { getWatch, removeWatch, type PriceAlert, type WatchItem, type WatchState } from '../lib/api';
import { pct } from '../lib/format';
import { alertProgress, price, sortByChange, sparkPath, summary } from '../lib/watch';
import { useApp, useColors } from '../state/app';
import { useData } from '../state/data';

export function Watchlist() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { say } = useApp();
  const { server } = useData();
  const [state, setState] = useState<WatchState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [alertOnly, setAlertOnly] = useState(false);

  const load = useCallback(async () => {
    if (!server) return;
    setLoading(true);
    try {
      setState(await getWatch(server));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [server]);

  // Elke keer als je terugkomt (bijv. na een nieuwe alert of na zoeken) opnieuw ophalen.
  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const remove = async (item: WatchItem) => {
    if (!server) return;
    try {
      setState(await removeWatch(server, item.key));
      say(`${item.tk} verwijderd uit je volglijst`);
    } catch (e) {
      say((e as Error).message);
    }
  };

  const alertOf = (key: string): PriceAlert | undefined => state?.alerts.find((a) => a.key === key);
  const all = sortByChange(state?.items ?? []);
  const shown = alertOnly ? all.filter((i) => alertOf(i.key)) : all;
  const sum = summary(all);
  const nAlerts = all.filter((i) => alertOf(i.key)).length;
  const open = (item: WatchItem) => !editing && router.push({ pathname: '/alert', params: { key: item.key } });
  const search = () => router.push('/zoeken');

  return (
    <ScreenIn style={{ backgroundColor: c.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 4, height: 56 }}>
        <IconButton name="arrow_back" size={24} onPress={() => router.back()} />
        <T size={16} w={700} style={{ flex: 1, marginLeft: 4 }}>Volglijst</T>
        {server ? <IconButton name={editing ? 'check' : 'edit'} label={editing ? 'Klaar' : 'Bewerken'} onPress={() => setEditing(!editing)} /> : null}
        {server ? <IconButton name="add" label="Toevoegen" onPress={search} /> : null}
      </View>

      {!server ? (
        <Empty title="Koppel eerst je server" sub="De volglijst haalt koersen bij je eigen server op. Koppel hem via Meer → Server." />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading && !!state} onRefresh={load} tintColor={c.gold} colors={[c.accent]} />}
        >
          {error ? <T size={13} color={c.neg} style={{ paddingHorizontal: 24, paddingBottom: 12 }}>{error}</T> : null}

          {all.length ? (
            <View style={{ paddingHorizontal: 20 }}>
              <GoldCaption>{`Vandaag · ${all.length} gevolgd`}</GoldCaption>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
                <T serif size={34} lh={1.1} num color={sum.avg >= 0 ? c.pos : c.neg}>{pct(sum.avg)}</T>
                <T size={12} color={c.muted}>gemiddeld</T>
              </View>
              <View style={{ flexDirection: 'row', gap: 3, height: 22, marginTop: 12 }}>
                {sum.ups ? (
                  <View style={{ flex: sum.ups, borderTopLeftRadius: 6, borderBottomLeftRadius: 6, borderRadius: 2, backgroundColor: 'rgba(107,196,143,0.22)', justifyContent: 'center', paddingHorizontal: 8 }}>
                    <T size={11} w={700} color={c.pos} numberOfLines={1}>{sum.ups} {sum.ups === 1 ? 'stijger' : 'stijgers'}</T>
                  </View>
                ) : null}
                {sum.downs ? (
                  <View style={{ flex: sum.downs, borderTopRightRadius: 6, borderBottomRightRadius: 6, borderRadius: 2, backgroundColor: 'rgba(232,130,110,0.2)', justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 8 }}>
                    <T size={11} w={700} color={c.neg}>{sum.downs}</T>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {all.length ? (
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 16, paddingHorizontal: 16, paddingBottom: 12 }}>
              <Pressable
                onPress={() => setAlertOnly(!alertOnly)}
                style={{ height: 36, paddingHorizontal: 12, borderRadius: 18, boxShadow: `inset 0 0 0 1px ${c.goldLine}`, backgroundColor: alertOnly ? c.gold : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Icon name="notifications" fill size={15} color={alertOnly ? c.onGold : c.gold} />
                <T size={12} w={700} color={alertOnly ? c.onGold : c.gold}>{alertOnly ? `${nAlerts} met alert` : `Alleen alerts · ${nAlerts}`}</T>
              </Pressable>
            </View>
          ) : null}

          {state && !shown.length ? (
            alertOnly ? (
              <Empty title="Geen alerts in je volglijst" sub="Tik op een tegel om een koersalert in te stellen." />
            ) : (
              <Empty title="Je volglijst is leeg" sub="Volg de koers van een coin of van je eigen aandelen zonder te kopen." action="Zoeken" onAction={search} />
            )
          ) : null}

          {shown.length ? (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12 }}>
                {shown.map((item, i) => (
                  <FadeUp key={item.key} index={Math.min(i, 10)} step={40} style={{ width: i === 0 ? '100%' : '48.8%' }}>
                    <Tile item={item} alert={alertOf(item.key)} featured={i === 0} editing={editing} onPress={() => open(item)} onRemove={() => remove(item)} />
                  </FadeUp>
                ))}
                <Pressable onPress={search} style={{ width: '48.8%', minHeight: 168, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.goldLine, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, boxShadow: `inset 0 0 0 1px ${c.goldLine}`, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="add" color={c.gold} />
                  </View>
                  <T size={12} w={600} color={c.muted}>Volg een belegging</T>
                </Pressable>
              </View>
              <T size={12} color={c.faint} style={{ textAlign: 'center', paddingTop: 14, paddingHorizontal: 24 }}>Tik op een tegel voor een koersalert</T>
            </>
          ) : null}
        </ScrollView>
      )}
    </ScreenIn>
  );
}

function Tile({ item, alert, featured, editing, onPress, onRemove }: {
  item: WatchItem; alert?: PriceAlert; featured: boolean; editing: boolean; onPress: () => void; onRemove: () => void;
}) {
  const c = useColors();
  const chg = item.chg ?? 0;
  const up = chg >= 0;
  const tone = item.chg == null ? c.muted : up ? c.pos : c.neg;
  const k = Math.min(Math.abs(chg) / 3, 1);
  const tint = `${up ? 'rgba(107,196,143,' : 'rgba(232,130,110,'}${(0.06 + k * 0.12).toFixed(3)})`;
  const d = item.spark ? sparkPath(item.spark) : '';
  const prog = alert && item.price ? alertProgress(alert, item.price) : null;
  const sub = item.cat === 'cr' ? 'Crypto' : 'In bezit';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: featured ? 0 : 168, padding: featured ? 16 : 12, gap: 10, borderRadius: featured ? 24 : 22,
        backgroundImage: `linear-gradient(165deg, ${tint}, ${c.surface} 60%)`,
        boxShadow: `inset 0 0 0 1px ${featured || alert ? c.goldLine : c.line}`,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: featured ? 10 : 8, flex: 1, minWidth: 0 }}>
          <View style={{ width: featured ? 36 : 28, height: featured ? 36 : 28, borderRadius: 18, backgroundColor: c.surface2, boxShadow: `inset 0 0 0 1px ${c.goldLine}`, alignItems: 'center', justifyContent: 'center' }}>
            <T size={featured ? 10 : 9} w={700}>{item.tk.length > 4 ? item.tk.slice(0, 3) : item.tk}</T>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T size={featured ? 16 : 13} w={700} numberOfLines={1}>{item.tk}</T>
            <T size={featured ? 12 : 10.5} color={c.muted} numberOfLines={1}>{featured ? `${item.name} · ${sub}` : item.name}</T>
          </View>
        </View>
        {featured ? (
          <T serif size={32} lh={1} num color={tone}>{item.chg == null ? '—' : pct(chg)}</T>
        ) : alert ? (
          <Icon name="notifications" fill size={16} color={c.gold} />
        ) : null}
      </View>

      <View style={{ height: featured ? 62 : 34 }}>
        {d ? (
          <Svg width="100%" height="100%" viewBox="0 0 364 120" preserveAspectRatio="none">
            <Path d={`${d} L364 120 L0 120 Z`} fill={tone} fillOpacity={featured ? 0.14 : 0.12} />
            <Path d={d} fill="none" stroke={tone} strokeWidth={featured ? 1.75 : 1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </Svg>
        ) : (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <View style={{ height: 1, backgroundColor: c.line }} />
          </View>
        )}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: featured ? 'flex-end' : 'baseline', gap: 6 }}>
        {featured ? (
          <View>
            <T size={11} color={c.muted}>Koers</T>
            <T serif size={22} num color={c.gold} style={{ marginTop: 2 }}>{item.price == null ? '—' : price(item.price, item.cur ?? 'EUR')}</T>
          </View>
        ) : (
          <>
            <T serif size={20} lh={1} num color={tone}>{item.chg == null ? '—' : pct(chg)}</T>
            <T size={12} w={600} num>{item.price == null ? '—' : price(item.price, item.cur ?? 'EUR')}</T>
          </>
        )}
        {featured && alert ? <Icon name="notifications" fill size={18} color={c.gold} /> : null}
      </View>

      {prog ? (
        <View style={{ marginTop: featured ? 0 : 'auto' }}>
          <View style={{ height: 3, borderRadius: 2, backgroundColor: c.surface2 }}>
            <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${prog.width}%`, borderRadius: 2, backgroundImage: `linear-gradient(90deg, rgba(217,188,130,0.15), ${c.gold})` }} />
          </View>
          <T size={10.5} color={c.gold} numberOfLines={1} style={{ marginTop: 6 }}>{prog.label}</T>
        </View>
      ) : !featured ? (
        <T size={10.5} color={c.muted} numberOfLines={1} style={{ marginTop: 'auto' }}>{item.price == null ? 'Geen koers' : sub}</T>
      ) : null}

      {editing ? (
        <Pressable onPress={onRemove} hitSlop={6} accessibilityLabel={`${item.tk} verwijderen`} style={{ position: 'absolute', top: -6, right: -6, width: 28, height: 28, borderRadius: 14, backgroundColor: c.neg, alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 0 3px ${c.bg}` }}>
          <Icon name="close" size={18} color="#FFFFFF" />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function Empty({ title, sub, action, onAction }: { title: string; sub: string; action?: string; onAction?: () => void }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', paddingTop: 40, paddingHorizontal: 32 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.surface, boxShadow: `inset 0 0 0 1px ${c.goldLine}`, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="star" size={32} color={c.gold} />
      </View>
      <T serif size={22} style={{ marginTop: 16, textAlign: 'center' }}>{title}</T>
      <T size={14} color={c.muted} lh={1.5} style={{ marginTop: 6, textAlign: 'center' }}>{sub}</T>
      {action && onAction ? <Button label={action} variant="outline" onPress={onAction} style={{ marginTop: 20, flex: 0, paddingHorizontal: 20, height: 44 }} /> : null}
    </View>
  );
}
