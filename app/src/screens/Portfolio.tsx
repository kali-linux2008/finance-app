// Portefeuille: totaal, snelkoppelingen, groeperen/filteren, posities, volglijst en buiten belegd vermogen.
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Icon, type IconName } from '../components/Icon';
import { FadeUp } from '../components/motion';
import { T } from '../components/T';
import { Card, Chip, GoldCaption, IconButton, OutlineCard, Segmented, TickerBox } from '../components/ui';
import { OPEN_ORDERS, WATCH_ALERTS, WATCHLIST, type Instrument, type Outside } from '../data/sample';
import { currencyPrefix, eur, num, pct, qty, signedEur } from '../lib/format';
import { FILTERS, groupByCategory, groupBySource, monthlyInvesting, rebalanceDeviations, type GroupRow } from '../lib/portfolio';
import { sparkPath } from '../lib/series';
import { useMoney } from '../hooks/useMoney';
import { ErrorBanner } from '../components/LiveStatus';
import { useApp, useColors } from '../state/app';
import { useData } from '../state/data';
import { tileColors } from '../theme/tiles';

export function Portfolio() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { togglePrivacy, say, portfolioView: view, setPortfolioView } = useApp();
  const { privacy, money, signed } = useMoney();
  const soon = () => say('Komt in een volgende stap');

  const { live, positions, total, dayChange, outside, loading, refresh } = useData();
  const groups = view.group === 'cat' ? groupByCategory(positions, view.filter) : groupBySource(positions, view.filter);
  const devs = rebalanceDeviations(positions, total);
  const orders = { icon: 'pending_actions' as IconName, label: 'Orders', sub: live ? 'Bekijken' : `${OPEN_ORDERS} open`, dot: false, go: () => router.push('/orders') };
  const periodic = { icon: 'autorenew' as IconName, label: 'Periodiek', sub: live ? 'Inlegplan' : `${money(monthlyInvesting())} p/m`, dot: false, go: () => router.push('/periodiek') };
  // Herbalanceren komt later; met echte data tonen we Orders en Periodiek.
  const links: { icon: IconName; label: string; sub: string; dot: boolean; go: () => void }[] = live ? [orders, periodic] : [
    orders,
    periodic,
    { icon: 'balance', label: 'Balans', sub: devs ? `${devs} ${devs === 1 ? 'afwijking' : 'afwijkingen'}` : 'in balans', dot: devs > 0, go: soon },
  ];
  const watch = [...WATCHLIST].sort((a, b) => b.change - a.change);
  let rowIndex = 0;

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 104 + insets.bottom }}
      showsVerticalScrollIndicator={false}
      refreshControl={live ? <RefreshControl refreshing={loading} onRefresh={() => refresh(true)} tintColor={c.gold} colors={[c.accent]} progressViewOffset={insets.top} /> : undefined}
    >
      <View style={{ paddingTop: 16, paddingHorizontal: 24 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T serif size={30}>Portefeuille</T>
          <IconButton name={privacy ? 'visibility_off' : 'visibility'} onPress={togglePrivacy} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'baseline', marginTop: 2 }}>
          <T serif size={26} num color={c.gold}>{money(total, true)}</T>
          {dayChange != null ? (
            <T size={13} w={600} num color={dayChange >= 0 ? c.pos : c.neg}>{signed(dayChange, true)} vandaag</T>
          ) : null}
        </View>
      </View>
      {live ? <View style={{ height: 16 }} /> : null}
      <ErrorBanner />

      <View style={{ flexDirection: 'row', gap: 6, paddingTop: live ? 0 : 16, paddingHorizontal: 12 }}>
          {links.map((q, i) => (
            <FadeUp key={q.label} index={i} step={60} style={{ flex: 1, minWidth: 0 }}>
              <Pressable onPress={q.go} style={({ pressed }) => ({ backgroundColor: c.surface, borderRadius: 16, padding: 12, gap: 12, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Icon name={q.icon} size={20} color={c.accent} />
                  {q.dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.gold }} /> : null}
                </View>
                <View>
                  <T size={14} w={700}>{q.label}</T>
                  <T size={12} color={c.muted} numberOfLines={1} style={{ marginTop: 2 }}>{q.sub}</T>
                </View>
              </Pressable>
            </FadeUp>
          ))}
        </View>

      <View style={{ flexDirection: 'row', gap: 8, paddingTop: 16, paddingHorizontal: 24 }}>
        <Segmented items={[['cat', 'Categorie'], ['src', 'Bron']]} value={view.group} onChange={(group) => setPortfolioView({ group })} />
        <Segmented items={[['dag', 'Dag'], ['tot', 'Totaal']]} value={view.metric} onChange={(metric) => setPortfolioView({ metric })} stretch={false} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 12, paddingHorizontal: 24, paddingBottom: 4 }}>
        {FILTERS.map((f) => (
          <Chip key={f} label={f} on={view.filter === f} onPress={() => setPortfolioView({ filter: f })} />
        ))}
      </ScrollView>

      {groups.map((g) => (
        <View key={g.name}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 20, paddingHorizontal: 24, paddingBottom: 4 }}>
            <GoldCaption>{g.name}</GoldCaption>
            <T size={12} num color={c.muted}>{money(g.total)}</T>
          </View>
          <Card style={{ marginHorizontal: 12, paddingVertical: 4 }}>
            {g.rows.map((r) => (
              <FadeUp key={`${view.group}-${view.filter}-${r.position.id}-${r.override?.sub ?? ''}`} index={rowIndex++}>
                <PositionRow row={r} metric={view.metric} />
              </FadeUp>
            ))}
          </Card>
        </View>
      ))}

      {/* De volglijst krijgt echte koersen bij de koersalerts (stap 6). */}
      {!live ? (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 30, paddingHorizontal: 24, paddingBottom: 10 }}>
            <GoldCaption>Volglijst</GoldCaption>
            <T size={13} w={600} color={c.accent} onPress={soon} suppressHighlighting>Alles · {WATCHLIST.length}</T>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}>
            {watch.map((u) => <WatchTile key={u.tk} u={u} onPress={soon} />)}
            <Pressable onPress={soon} style={{ width: 72, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.faint, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="add" size={24} color={c.muted} />
            </Pressable>
          </ScrollView>
        </>
      ) : null}

      {outside ? (
        <>
          <View style={{ paddingTop: 24, paddingHorizontal: 24, paddingBottom: 4 }}>
            <GoldCaption>Buiten belegd vermogen</GoldCaption>
          </View>
          <OutlineCard style={{ marginHorizontal: 12, paddingVertical: 4 }}>
            {outsideRows(outside, money, privacy).map(([k, sub, v]) => (
              <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, gap: 12 }}>
                <View>
                  <T size={14} w={600}>{k}</T>
                  <T size={12} color={c.muted} style={{ marginTop: 2 }}>{sub}</T>
                </View>
                <T size={14} w={600} num>{v}</T>
              </View>
            ))}
          </OutlineCard>
        </>
      ) : null}
    </ScrollView>
  );
}

function outsideRows(o: Outside, money: (v: number) => string, privacy: boolean): [string, string, string][] {
  const rows: [string, string, string][] = [];
  if (o.pension != null) rows.push([`Pensioen · ${o.pensionName ?? 'pensioenfonds'}`, 'Opgebouwd · UPO', money(o.pension)]);
  if (o.woz != null) rows.push(['Woning · WOZ', 'Handmatig', money(o.woz)]);
  if (o.mortgage != null) rows.push(['Hypotheek', o.mortgageNote || 'Restschuld', privacy ? '••••' : eur(-o.mortgage)]);
  if (o.equity != null) rows.push(['Overwaarde', 'WOZ − hypotheek', money(o.equity)]);
  return rows;
}

/** Regel met ticker-vak, naam + aantal, waarde + dag- of totaalrendement. */
function PositionRow({ row, metric }: { row: GroupRow; metric: 'dag' | 'tot' }) {
  const c = useColors();
  const { money, privacy } = useMoney();
  const p = row.position;
  const ov = row.override;
  const [bg, fg] = tileColors(c, p.tile);
  const total = p.cost ? ((p.value - p.cost) / p.cost) * 100 : null;
  const day = p.returns?.[0] ?? p.dayChange;
  const change = metric === 'dag' ? (day ?? null) : total;
  const sub = ov ? ov.sub : p.qty ? `${qty(p.qty)} ${p.unit} · ${p.src}` : p.rate ?? p.src;
  let chg: string;
  if (change == null) chg = p.rate ?? '—';
  else if (metric === 'dag') chg = pct(change);
  else if (p.cost == null) chg = '—';
  else {
    const gain = (p.value - (p.cost ?? 0)) * (ov ? ov.value / p.value : 1);
    chg = privacy ? '••••' : `${signedEur(gain)} · ${pct(change, 1)}`;
  }

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/positie/[id]', params: { id: p.id } })}
      style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16 }}
    >
      <TickerBox tk={p.tk} bg={bg} fg={fg} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T size={15} w={600} numberOfLines={1}>{ov ? ov.name : p.name}</T>
        <T size={12} color={c.muted} numberOfLines={1} style={{ marginTop: 2 }}>{sub}</T>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <T size={15} w={600} num numberOfLines={1}>{money(ov ? ov.value : p.value)}</T>
        <T size={12} num numberOfLines={1} style={{ marginTop: 2 }} color={change == null ? c.muted : change >= 0 ? c.pos : c.neg}>{chg}</T>
      </View>
    </Pressable>
  );
}

function WatchTile({ u, onPress }: { u: Instrument; onPress: () => void }) {
  const c = useColors();
  const up = u.change >= 0;
  const k = Math.min(Math.abs(u.change) / 3, 1);
  const tint = `rgba(${up ? c.posRgb : c.negRgb},${(0.06 + k * 0.12).toFixed(3)})`;
  const color = up ? c.pos : c.neg;
  const price = currencyPrefix(u.cur) + num(u.price, u.price >= 1000 ? 0 : 2);
  const w = 108;
  return (
    <Pressable
      onPress={onPress}
      style={{ width: 132, borderRadius: 18, padding: 12, gap: 8, backgroundImage: `linear-gradient(165deg, ${tint}, ${c.surface} 65%)`, boxShadow: `inset 0 0 0 1px ${WATCH_ALERTS.includes(u.tk) ? c.goldLine : c.line}` }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <T size={13} w={700}>{u.tk}</T>
        <T size={12} w={600} num color={color}>{pct(u.change)}</T>
      </View>
      <Svg width={w} height={30} style={{ overflow: 'visible' }}>
        <Path d={sparkPath(u.tk, u.price, u.change, w, 30)} fill="none" stroke={color} strokeWidth={1.5} />
      </Svg>
      <T size={14} w={600} num>{price}</T>
    </Pressable>
  );
}
