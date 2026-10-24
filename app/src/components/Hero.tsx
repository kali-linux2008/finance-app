// Hoofdkaart van het Overzicht: belegd vermogen, scrubbare grafiek, benchmarks en periodes.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Line as SvgLine } from 'react-native-svg';
import { EURO, pct, signedEur, splitCents } from '../lib/format';
import { PER, PERIODS, portfolioSeries, type Period } from '../lib/series';
import { getHistory, type Point } from '../lib/api';
import { useApp, useColors } from '../state/app';
import { useData } from '../state/data';
import { hero } from '../theme/tokens';
import { Icon } from './Icon';
import { LineChart, scrubIndex } from './LineChart';
import { useCountUp } from './motion';
import { T } from './T';

/** Blauwe kaart met gouden lijst; wordt ook gebruikt voor andere hero's. */
export function HeroFrame({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ marginTop: 4, marginHorizontal: 16, borderRadius: 28, padding: 1, backgroundImage: c.heroFrame, boxShadow: '0 28px 56px -28px rgba(30,50,170,0.85)' }}>
      <View style={{ borderRadius: 27, backgroundImage: `${c.heroGloss}, ${c.heroBg}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14)', paddingTop: 19, paddingHorizontal: 23, paddingBottom: 15 }}>
        <View pointerEvents="none" style={{ position: 'absolute', top: 5, left: 5, right: 5, bottom: 5, borderWidth: 1, borderColor: hero.innerFrame, borderRadius: 22 }} />
        {children}
      </View>
    </View>
  );
}

/** Reeks voor de hero: voorbeelddata, of het echte verloop dat je server bijhoudt. */
function useHeroSeries(period: Period) {
  const { live, server, asOf } = useData();
  const [points, setPoints] = useState<{ period: Period; pts: Point[] } | null>(null);
  useEffect(() => {
    if (!live || !server) return;
    let gone = false;
    getHistory(server, period)
      .then((pts) => !gone && setPoints({ period, pts }))
      .catch(() => !gone && setPoints({ period, pts: [] }));
    return () => {
      gone = true;
    };
  }, [live, server, period, asOf]);

  if (!live) {
    const s = portfolioSeries(period);
    return { pf: s.pf, sp: s.sp, bt: s.bt, labels: s.labels, benchmarks: true };
  }
  const pts = points?.period === period ? points.pts : [];
  return { pf: pts.map((p) => p.v), sp: [], bt: [], labels: pts.map((p) => PER[period].label(new Date(p.t * 1000))), benchmarks: false };
}

export function Hero() {
  const c = useColors();
  const { privacy } = useApp();
  const { total, dayChange, live } = useData();
  const [period, setPeriod] = useState<Period>('Alles');
  const [scrub, setScrub] = useState<number | null>(null);
  const [sp, setSp] = useState(true);
  const [bt, setBt] = useState(false);
  const anim = useCountUp();

  const series = useHeroSeries(period);
  const hasChart = series.pf.length >= 2;
  const cfg = PER[period];
  const i = hasChart ? scrubIndex(scrub, series.pf.length) : null;
  const value = i == null ? total : series.pf[i];
  const [whole, cents] = splitCents(i == null ? total * anim : value);

  // Verschil t.o.v. het begin van de periode; zonder verloop (nieuwe server) alleen "vandaag" als dat bekend is.
  const start = hasChart ? series.pf[0] : null;
  const diff = start != null ? value - start : dayChange;
  const word = i != null ? 't.o.v. start' : start != null ? cfg.word : 'vandaag';

  const lines = useMemo(() => [
    { arr: series.pf, show: true, stroke: '#FFFFFF', width: 2 },
    { arr: series.sp, show: sp && series.benchmarks, stroke: '#FFFFFF', width: 1.25, dash: '4 4', opacity: 0.6 },
    { arr: series.bt, show: bt && series.benchmarks, stroke: hero.btcLine, width: 1.5, dash: '1 3', round: true },
  ], [series, sp, bt]);

  return (
    <HeroFrame>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 14, height: 1, backgroundColor: hero.rule }} />
          <T size={11} color={hero.label} style={{ letterSpacing: 1.32, textTransform: 'uppercase' }}>{i == null ? 'Belegd vermogen' : 'Waarde op'}</T>
        </View>
        <T size={11} color={hero.label} style={{ letterSpacing: 0.44, textTransform: 'uppercase' }}>{i == null ? 'EUR' : series.labels[i]}</T>
      </View>

      <T serif size={46} lh={1.05} num color={hero.amount} numberOfLines={1} style={{ marginTop: 10 }}>
        {privacy ? `${EURO}••••` : whole}
        {privacy ? '' : <T serif size={26} num color={hero.cents}>{cents}</T>}
      </T>

      {diff != null ? (
        <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)' }}>
          <Icon name={diff >= 0 ? 'north_east' : 'south_east'} size={16} color="#FFFFFF" />
          <T size={13} w={600} num color="#FFFFFF">
            {privacy ? `•••• ${i == null ? word : ''}` : `${signedEur(diff)} · ${pct((diff / ((start ?? total - diff) || 1)) * 100)} ${word}`}
          </T>
        </View>
      ) : null}

      <View style={{ marginTop: 20 }}>
        {hasChart ? (
          <LineChart
            lines={lines}
            labels={series.labels}
            height={120}
            scrub={scrub}
            onScrub={setScrub}
            areaFill="#FFFFFF"
            areaOpacity={0.07}
            axisColor={c.heroMuted}
            scrubLine="rgba(255,255,255,0.6)"
            dot={{ color: '#FFFFFF' }}
            endDot={{ color: '#FFFFFF', halo: 'rgba(255,255,255,0.22)' }}
            revealKey={period}
          />
        ) : (
          <View style={{ height: 120 + 8 + 15, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Icon name="insights" size={22} color={c.heroMuted} />
            <T size={13} color={c.heroMuted} style={{ textAlign: 'center' }}>
              {live ? 'Je server houdt vanaf nu het verloop bij.\nDe grafiek vult zich vanzelf.' : ''}
            </T>
          </View>
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 14 }}>
        {series.benchmarks ? (
          <>
            <BenchChip label="S&P 500" on={sp} onPress={() => setSp(!sp)} legend={<LegendLine color="#FFFFFF" dash="4 3" />} />
            <BenchChip label="Bitcoin" on={bt} onPress={() => setBt(!bt)} legend={<LegendLine color={hero.btcLine} dash="2 3" />} />
          </>
        ) : null}
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icon name="swipe" size={16} color={c.heroMuted} />
          <T size={12} color={c.heroMuted}>Sleep</T>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 4, marginTop: 12, padding: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.22)' }}>
        {PERIODS.map((p) => {
          const on = p === period;
          return (
            <Pressable key={p} onPress={() => { setPeriod(p); setScrub(null); }} style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 999, backgroundColor: on ? hero.chipOn : 'transparent' }}>
              <T size={13} w={on ? 700 : 500} color={on ? hero.chipOnInk : c.heroMuted}>{p}</T>
            </Pressable>
          );
        })}
      </View>
    </HeroFrame>
  );
}

function LegendLine({ color, dash }: { color: string; dash: string }) {
  return (
    <Svg width={14} height={2}>
      <SvgLine x1={0} y1={1} x2={14} y2={1} stroke={color} strokeWidth={2} strokeDasharray={dash} />
    </Svg>
  );
}

function BenchChip({ label, on, onPress, legend }: { label: string; on: boolean; onPress: () => void; legend: ReactNode }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 10, borderRadius: 16, backgroundColor: on ? 'rgba(255,255,255,0.18)' : 'transparent', opacity: on ? 1 : 0.6 }}>
      {legend}
      <T size={12} w={600} color="#FFFFFF">{label}</T>
    </Pressable>
  );
}
