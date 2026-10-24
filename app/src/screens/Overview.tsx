// Overzicht: begroeting, hero, kerncijfers, verdeling, bronnen, doelen en zaken buiten belegd vermogen.
import { router } from 'expo-router';
import { Pressable, RefreshControl, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Hero } from '../components/Hero';
import { Icon } from '../components/Icon';
import { T } from '../components/T';
import { Card, IconButton, OutlineCard, SectionTitle } from '../components/ui';
import { BOX3, FEES_YTD, GOALS, RETURN_IRR, type Outside } from '../data/sample';
import { eur, num, pct, share } from '../lib/format';
import { monthsToTarget, reachLabel } from '../lib/goals';
import { allocation } from '../lib/portfolio';
import { useMoney } from '../hooks/useMoney';
import { useApp, useColors } from '../state/app';
import { useData } from '../state/data';
import { ErrorBanner, greeting, longDate } from '../components/LiveStatus';
import type { Filter } from '../lib/portfolio';

/** Kolom die naar verhouding meegroeit, zoals `fr` in CSS grid. Zet padding in een binnenvak, anders telt die mee. */
const fr = (n: number) => ({ flexGrow: n, flexShrink: 1, flexBasis: 0, minWidth: 0 });

export function Overview() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { togglePrivacy, say, goTab } = useApp();
  const { privacy, money, signed, hide } = useMoney();
  const soon = () => say('Komt in een volgende stap');
  const toPortfolio = (filter: Filter) => () => goTab('portfolio', { filter, group: 'cat' });

  const { live, positions, total, dayChange, invested, cost, sources, outside, loading, refresh } = useData();
  const a = allocation(positions);
  const fireMonths = monthsToTarget(total, GOALS.monthly, GOALS.returnPct, GOALS.fire);
  const buffer = live ? a.savings : GOALS.bufferSaved;
  const sharePct = (v: number) => share(total ? (v / total) * 100 : 0);
  const openSources = () => (live ? router.push('/server') : soon());

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 104 + insets.bottom }}
      showsVerticalScrollIndicator={false}
      refreshControl={live ? <RefreshControl refreshing={loading} onRefresh={() => refresh(true)} tintColor={c.gold} colors={[c.accent]} progressViewOffset={insets.top} /> : undefined}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingRight: 8, paddingLeft: 20 }}>
        <View>
          <T size={13} color={c.muted}>{live ? greeting() : 'Goedemiddag, Joris'}</T>
          <T serif size={22} numberOfLines={1}>{live ? longDate() : '18 oktober 2026'}</T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <IconButton name={privacy ? 'visibility_off' : 'visibility'} onPress={togglePrivacy} />
          <IconButton name="search" onPress={soon} />
          <IconButton onPress={soon}>
            <Icon name="notifications" />
            <View style={{ position: 'absolute', top: 11, right: 11, width: 12, height: 12, borderRadius: 6, backgroundColor: c.accent, borderWidth: 2, borderColor: c.bg }} />
          </IconButton>
          <IconButton onPress={() => router.push('/meer')}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <T size={12} w={700}>JV</T>
            </View>
          </IconButton>
        </View>
      </View>

      <ErrorBanner />
      <Hero />

      <Card style={{ marginTop: 12, marginHorizontal: 16, flexDirection: 'row' }}>
        <Stat label="Vandaag" value={dayChange == null ? '—' : signed(dayChange, true)} color={dayChange == null ? undefined : dayChange >= 0 ? c.pos : c.neg} />
        {live ? (
          <Stat label="Ongerealiseerd" value={cost ? signed(invested - cost) : '—'} color={!cost ? undefined : invested >= cost ? c.pos : c.neg} divider />
        ) : (
          <Stat label="Rendement (IRR)" value={`${pct(RETURN_IRR, 1)} /jr`} color={c.pos} divider />
        )}
        <Stat label="Kosten 2026" value={live ? '—' : money(FEES_YTD, true)} divider onPress={soon} />
      </Card>

      <SectionTitle title="Waar het staat" link="Inzichten" onLink={soon} />
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 12, height: 166 }}>
        <Pressable onPress={toPortfolio('Aandelen & ETF')} style={{ ...fr(48.8), backgroundColor: c.t1, borderRadius: 18 }}>
          <View style={{ flex: 1, padding: 14, justifyContent: 'space-between' }}>
            <T size={13} color={c.t1m}>{"Aandelen & ETF's"}</T>
            <View>
              <T serif size={24} num color={c.t1i} numberOfLines={1}>{money(a.eq)}</T>
              <T size={12} color={c.t1m} style={{ marginTop: 2 }} numberOfLines={1}>{[sharePct(a.eq), ...a.eqSources].join(' · ')}</T>
            </View>
          </View>
        </Pressable>
        <View style={{ ...fr(51.2), gap: 6 }}>
          <Pressable onPress={toPortfolio('Crypto')} style={{ height: 96, backgroundColor: c.t2, borderRadius: 18, padding: 14, justifyContent: 'space-between' }}>
            <T size={13} color={c.t2m} numberOfLines={1}>{['Crypto', a.crSources.map((s) => s.replace(' Safe 5', '')).join(' + ')].filter(Boolean).join(' · ')}</T>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <T serif size={22} num color={c.t2i} numberOfLines={1}>{money(a.cr)}</T>
              <T size={12} color={c.t2m}>{sharePct(a.cr)}</T>
            </View>
          </Pressable>
          <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
            <Pressable onPress={toPortfolio('Cash')} style={{ ...fr(27), backgroundColor: c.t3, borderRadius: 18 }}>
              <View style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, justifyContent: 'space-between' }}>
                <T size={12} color={c.t3m}>Sparen</T>
                <T size={15} w={700} num color={c.t3i} numberOfLines={1}>{money(a.savings)}</T>
              </View>
            </Pressable>
            <View style={{ ...fr(24.2), gap: 6 }}>
              <MiniTile label="Betaal" value={hide(num(a.payment))} bg={c.t4} onPress={toPortfolio('Cash')} />
              <MiniTile label="Goud" value={hide(num(a.gold))} bg={c.t5} onPress={toPortfolio('Goud')} />
            </View>
          </View>
        </View>
      </View>

      <SectionTitle title="Bronnen" link="Beheren" onLink={openSources} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12 }}>
        {sources.map((s) => (
          <Card key={s.id} onPress={openSources} style={{ flexGrow: 1, flexBasis: '40%', borderRadius: 18, padding: 14 }}>
            <T size={13} color={c.muted} numberOfLines={1}>{s.name}</T>
            <T size={17} w={700} num style={{ marginTop: 12 }}>{s.status === 'fout' ? '—' : money(s.value)}</T>
            {s.status === 'fout' || s.status === 'oud' ? (
              <T size={12} style={{ marginTop: 2 }} color={c.neg} numberOfLines={1}>{s.status === 'fout' ? 'Koppeling mislukt' : 'Laatst bekende stand'}</T>
            ) : (
              <T size={12} num style={{ marginTop: 2 }} color={s.change != null ? (s.change >= 0 ? c.pos : c.neg) : c.muted}>
                {s.change != null ? hide(`${pct(s.change)} vandaag`) : s.sub ?? ' '}
              </T>
            )}
          </Card>
        ))}
        {live && !sources.length ? (
          <Card onPress={openSources} style={{ flexGrow: 1, padding: 14 }}>
            <T size={13} color={c.muted}>Nog geen bronnen gekoppeld. Voeg ze toe op je server (zie docs/SERVER.md).</T>
          </Card>
        ) : null}
      </View>

      <Card onPress={() => goTab('goals')} style={{ marginTop: 24, marginHorizontal: 16, paddingVertical: 18, paddingHorizontal: 20 }}>
        <GoalRow title="FIRE · € 500.000" pctLabel={share(total / 5000)} width={Math.min(total / 5000, 100)} color={c.accent} />
        <T size={12} color={c.muted} style={{ marginTop: 10 }}>
          Bij {eur(GOALS.monthly)} p/m en {GOALS.returnPct}% rendement: bereikt in {reachLabel(fireMonths)}
        </T>
        <View style={{ height: 1, backgroundColor: c.line, marginVertical: 14 }} />
        <GoalRow title="Noodbuffer · € 15.000" pctLabel={share(buffer / 150)} width={Math.min(buffer / 150, 100)} color={c.pos} />
      </Card>

      {outside ? <OutsideCard outside={outside} /> : null}

      {/* Box 3 rekent met je vermogen op 1 januari; dat weet de server pas na een jaarwisseling. */}
      {!live ? (
        <OutlineCard onPress={soon} style={{ marginTop: 12, marginHorizontal: 16, paddingVertical: 18, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <T size={14} w={600}>Box 3 · schatting 2026</T>
            <T size={12} color={c.muted} style={{ marginTop: 2 }}>Vermogen 1 jan {money(BOX3.base)} · heffingsvrij {eur(BOX3.free)}</T>
          </View>
          <T size={16} w={700} num>{hide(`≈ ${eur(BOX3.tax)}`)}</T>
        </OutlineCard>
      ) : null}
    </ScrollView>
  );
}

function OutsideCard({ outside }: { outside: Outside }) {
  const c = useColors();
  const { money } = useMoney();
  return (
    <OutlineCard style={{ marginTop: 12, marginHorizontal: 16, paddingVertical: 18, paddingHorizontal: 20, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {outside.pension != null ? (
          <View style={{ flex: 1 }}>
            <T size={12} color={c.muted}>Pensioen · {outside.pensionName ?? 'pensioenfonds'}</T>
            <T serif size={20} num style={{ marginTop: 4 }}>{money(outside.pension)}</T>
          </View>
        ) : null}
        {outside.equity != null ? (
          <View style={{ flex: 1 }}>
            <T size={12} color={c.muted}>Overwaarde woning</T>
            <T serif size={20} num style={{ marginTop: 4 }}>{money(outside.equity)}</T>
          </View>
        ) : null}
      </View>
      <T size={12} color={c.faint}>
        {outside.woz != null
          ? `Buiten belegd vermogen · WOZ ${money(outside.woz)} − hypotheek ${money(outside.mortgage ?? 0)}`
          : 'Buiten belegd vermogen'}
      </T>
    </OutlineCard>
  );
}

function Stat({ label, value, color, divider, onPress }: { label: string; value: string; color?: string; divider?: boolean; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flex: 1, minWidth: 0, padding: 14, borderLeftWidth: divider ? 1 : 0, borderLeftColor: c.line }}>
      <T size={11} color={c.muted}>{label}</T>
      <T size={14} w={700} num numberOfLines={1} color={color} style={{ marginTop: 4 }}>{value}</T>
    </Pressable>
  );
}

function MiniTile({ label, value, bg, onPress }: { label: string; value: string; bg: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={{ flex: 1, backgroundColor: bg, borderRadius: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <T size={11} color={c.muted}>{label}</T>
      <T size={11} w={700} num>{value}</T>
    </Pressable>
  );
}

function GoalRow({ title, pctLabel, width, color }: { title: string; pctLabel: string; width: number; color: string }) {
  const c = useColors();
  return (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <T size={15} w={700}>{title}</T>
        <T size={13} num color={c.muted}>{pctLabel}</T>
      </View>
      <View style={{ height: 6, backgroundColor: c.surface2, borderRadius: 3, marginTop: 12, overflow: 'hidden' }}>
        <View style={{ width: `${width}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
      </View>
    </>
  );
}
