// Detail van één belegging: koers in goud, scrubbare grafiek, positie, bewaarplekken, dividend, transacties.
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { LineChart, scrubIndex } from '../components/LineChart';
import { ScreenIn } from '../components/motion';
import { T } from '../components/T';
import { Button, Card, IconButton, Segmented } from '../components/ui';
import { POSITIONS, TRANSACTIONS } from '../data/sample';
import { currencyPrefix, num, pct, signedEur } from '../lib/format';
import { positionStats } from '../lib/position';
import { PER, PERIODS, portfolioSeries, positionSeries, type Period } from '../lib/series';
import { useMoney } from '../hooks/useMoney';
import { useApp, useColors } from '../state/app';

export function Detail({ id }: { id: string }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { say } = useApp();
  const { money, privacy, hide } = useMoney();
  const pos = POSITIONS.find((p) => p.id === id) ?? POSITIONS[0];
  const [period, setPeriod] = useState<Period>('1J');
  const [scrub, setScrub] = useState<number | null>(null);

  const chart = useMemo(() => {
    if (!pos.price || !pos.returns) return null;
    const arr = positionSeries(pos.id, pos.price, pos.returns[PERIODS.indexOf(period)], period, pos.cat === 'cr');
    return { arr, labels: portfolioSeries(period).labels };
  }, [pos, period]);

  const fmtPrice = (x: number) => currencyPrefix(pos.cur ?? 'EUR') + num(x, 2);
  let price: string;
  let delta: string;
  let deltaColor = c.muted;
  if (chart && pos.price) {
    const i = scrubIndex(scrub, chart.arr.length);
    const pv = i == null ? pos.price : chart.arr[i];
    const dd = ((pv - chart.arr[0]) / chart.arr[0]) * 100;
    price = fmtPrice(pv);
    delta = `${pct(dd)}  ${i == null ? PER[period].word : chart.labels[i]}`;
    deltaColor = dd >= 0 ? c.pos : c.neg;
  } else {
    price = money(pos.value, true);
    delta = pos.rate ?? 'Saldo';
  }

  const stats = positionStats(pos, money, hide, privacy);
  const tx = TRANSACTIONS.filter((t) => t.tk === pos.tk).slice(0, 4);

  return (
    <ScreenIn style={{ backgroundColor: c.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 4, height: 56 }}>
        <IconButton name="arrow_back" size={24} onPress={() => router.back()} />
        <T size={16} w={700} style={{ flex: 1, marginLeft: 4 }}>{pos.tk}</T>
        <IconButton
          name="notification_add"
          onPress={() => say(pos.price ? 'Koersalerts komen in een volgende stap' : 'Alerts zijn er voor koersen, niet voor saldi')}
        />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingTop: 4, paddingHorizontal: 24 }}>
          <T size={13} color={c.muted}>{pos.cls} · {pos.src}</T>
          <T serif size={26} style={{ marginTop: 2 }}>{pos.name}</T>
          <T serif size={38} lh={1.1} num numberOfLines={1} color={c.gold} style={{ marginTop: 12 }}>{price}</T>
          <T size={13} w={600} num color={deltaColor} style={{ marginTop: 8 }}>{delta}</T>
        </View>

        {chart ? (
          <View style={{ paddingTop: 20, paddingHorizontal: 24 }}>
            <LineChart
              lines={[{ arr: chart.arr, show: true, stroke: c.accent, width: 2 }]}
              labels={chart.labels}
              height={140}
              scrub={scrub}
              onScrub={setScrub}
              areaFill={c.accent}
              areaOpacity={0.08}
              axisColor={c.faint}
              scrubLine={c.faint}
              dot={{ color: c.accent, border: c.bg }}
              revealKey={period}
            />
            <Segmented
              items={PERIODS.map((p) => [p, p])}
              value={period}
              onChange={(p) => { setPeriod(p); setScrub(null); }}
              weights={[700, 500]}
              style={{ marginTop: 14, flex: undefined }}
            />
          </View>
        ) : null}

        {pos.note ? (
          <View style={{ marginTop: 16, marginHorizontal: 16, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: c.surface, borderRadius: 16 }}>
            <T size={13} lh={1.5} color={c.muted}>{pos.note}</T>
          </View>
        ) : null}

        <Heading>Jouw positie</Heading>
        <Card style={{ marginHorizontal: 12, flexDirection: 'row', flexWrap: 'wrap' }}>
          {stats.map((s, i) => (
            <View key={s.k} style={{ width: '50%', paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: i > 1 ? 1 : 0, borderLeftWidth: i % 2 ? 1 : 0, borderColor: c.line }}>
              <T size={12} color={c.muted}>{s.k}</T>
              <T size={15} w={700} num numberOfLines={1} color={s.color === 'pos' ? c.pos : s.color === 'neg' ? c.neg : c.ink} style={{ marginTop: 4 }}>{s.v}</T>
            </View>
          ))}
        </Card>

        {pos.wallets ? (
          <>
            <Heading>Per bewaarplek</Heading>
            <Card style={{ marginHorizontal: 12, paddingVertical: 4 }}>
              {pos.wallets.map((w) => (
                <View key={w.name} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={w.icon} size={20} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T size={15} w={600}>{w.name}</T>
                    <T size={12} color={c.muted} style={{ marginTop: 2 }}>{w.note}</T>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <T size={15} w={600} num>{money(w.value)}</T>
                    <T size={12} num color={c.muted} style={{ marginTop: 2 }}>{w.qty}</T>
                  </View>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {pos.dividend ? (
          <>
            <Heading>Dividend</Heading>
            <Card style={{ marginHorizontal: 12, paddingVertical: 6 }}>
              {pos.dividend.map((x) => (
                <View key={x} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16 }}>
                  <Icon name="payments" size={18} color={c.muted} />
                  <T size={14} style={{ flex: 1 }}>{x}</T>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {tx.length ? (
          <>
            <Heading>Transacties</Heading>
            <Card style={{ marginHorizontal: 12, paddingVertical: 4 }}>
              {tx.map((t) => (
                <View key={t.date + t.title} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 12, paddingHorizontal: 16 }}>
                  <View style={{ flex: 1 }}>
                    <T size={14} w={600}>{t.title}</T>
                    <T size={12} color={c.muted} style={{ marginTop: 2 }}>{t.date} · {t.sub}</T>
                  </View>
                  <T size={14} w={600} num color={t.amount > 0 ? c.pos : c.ink}>
                    {t.amount === 0 ? '—' : hide(signedEur(t.amount, true))}
                  </T>
                </View>
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>

      {pos.trade ? (
        <View style={{ flexDirection: 'row', gap: 8, paddingTop: 12, paddingHorizontal: 12, paddingBottom: 16 + insets.bottom, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.bg }}>
          <Button label="Verkopen" variant="outline" onPress={() => say('Handelen komt in een volgende stap')} />
          <Button label="Kopen" onPress={() => say('Handelen komt in een volgende stap')} />
        </View>
      ) : (
        <View style={{ paddingTop: 12, paddingHorizontal: 12, paddingBottom: 16 + insets.bottom, borderTopWidth: 1, borderTopColor: c.line }}>
          <Button
            label={pos.manual ? 'Waarde bijwerken' : 'Geld overboeken'}
            icon="edit"
            variant="surface"
            style={{ flex: undefined }}
            onPress={() => say(pos.manual ? 'Waarde bijgewerkt naar spotprijs' : 'Overboeken opent je bank-app')}
          />
        </View>
      )}
    </ScreenIn>
  );
}

function Heading({ children }: { children: string }) {
  return <T serif size={20} style={{ paddingTop: 30, paddingHorizontal: 24, paddingBottom: 12 }}>{children}</T>;
}
