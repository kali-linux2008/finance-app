// Herbalanceren: je doel per klasse naast wat je nu hebt, en wat je moet doen om er te komen.
// "Alleen bijkopen" verdeelt je maandelijkse inleg; "Kopen & verkopen" stelt orders voor die je
// met je vingerafdruk bevestigt. De server rekent de orders uit en voert ze uit.
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { ConfirmAuth } from '../components/ConfirmAuth';
import { HeroFrame } from '../components/Hero';
import { Icon, type IconName } from '../components/Icon';
import { FadeUp, ScreenIn } from '../components/motion';
import { T } from '../components/T';
import { Button, GoldCaption, IconButton, Segmented } from '../components/ui';
import { TARGETS, type Category } from '../data/sample';
import { useMoney } from '../hooks/useMoney';
import { executeRebalance, getRebalance, saveTargets, type RebalanceResult, type RebalanceState } from '../lib/api';
import { fmtDayMonth, share } from '../lib/format';
import { requestId } from '../lib/trade';
import { monthlyInvesting } from '../lib/portfolio';
import {
  bump, buyOnly, CLASS_COLORS, current, dial, extraNeeded, rows as classRows, sampleSteps, shift, STEP, stepsFromServer,
  targetSum, verb, type Step, type Targets,
} from '../lib/rebalance';
import { useApp, useColors } from '../state/app';
import { useData } from '../state/data';
import { hero } from '../theme/tokens';

type Mode = 'buy' | 'full';

export function Rebalance() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { say } = useApp();
  const { money, privacy } = useMoney();
  const { live, server, positions, refresh: refreshData } = useData();

  const [state, setState] = useState<RebalanceState | null>(null);
  const [saved, setSaved] = useState<Targets>(TARGETS);
  const [draft, setDraft] = useState<Targets>(TARGETS);
  const [mode, setMode] = useState<Mode>('full');
  const [skip, setSkip] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, RebalanceResult>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const reqId = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!live || !server) return;
    setLoading(true);
    try {
      const s = await getRebalance(server);
      setState(s);
      if (s.targets) {
        setSaved(s.targets);
        setDraft(s.targets);
      }
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
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const now = live ? state?.current ?? current(positions) : current(positions);
  const list = classRows(now, draft);
  const total = targetSum(now);
  const sum = targetSum(draft);
  const ok = sum === 100;
  const toShift = shift(list);
  const outside = list.filter((r) => Math.abs(r.pct - r.target) > 5).length;
  const synced = live && !!state?.targets && JSON.stringify(state.targets) === JSON.stringify(draft);
  const steps: Step[] = !ok ? [] : live
    ? (synced && state?.proposals ? stepsFromServer(state.proposals, positions, money) : [])
    : sampleSteps(list, money);
  const amount = live ? state?.amount ?? 0 : monthlyInvesting();
  const split = live && synced && state?.buyOnly ? state.buyOnly : buyOnly(list, amount);
  const chosen = steps.filter((s) => s.kind === 'order' && !skip[s.id] && !results[s.id]?.ok);

  // Doel aanpassen: meteen zichtbaar; opslaan op de server zodra het samen 100% is.
  const change = (cls: Category, delta: number) => {
    const next = bump(draft, cls, delta);
    setDraft(next);
    setSkip({});
    setResults({});
    reqId.current = null;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setPending(false);
    if (!live || !server || targetSum(next) !== 100) return;
    setPending(true);
    saveTimer.current = setTimeout(() => store(next), 700);
  };

  const store = async (next: Targets) => {
    if (!server) return;
    setPending(true);
    try {
      await saveTargets(server, next);
      setSaved(next);
      await load();
    } catch (e) {
      say((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  const reset = () => {
    setDraft(saved);
    setSkip({});
    setResults({});
  };

  const run = async () => {
    setConfirm(false);
    if (!live || !server) {
      say('Voorbeeld: koppel eerst je server');
      return;
    }
    const orders = chosen.map((s) => state!.proposals!.orders.find((o) => o.posId === s.posId && o.side === s.side)!).filter(Boolean);
    setBusy(true);
    // Zelfde id bij opnieuw proberen (bijv. na een time-out): de server voert dan niets dubbel uit.
    reqId.current ??= requestId();
    try {
      const r = await executeRebalance(server, orders, reqId.current);
      const byStep: Record<string, RebalanceResult> = { ...results };
      r.results.forEach((res) => {
        const s = chosen.find((x) => x.posId === res.posId && x.side === res.side);
        if (s) byStep[s.id] = res;
      });
      setResults(byStep);
      reqId.current = null;
      const good = r.results.filter((x) => x.ok).length;
      say(r.ok ? `${good} ${good === 1 ? 'order' : 'orders'} geplaatst` : `${good} van ${r.results.length} orders gelukt`);
      refreshData(true);
    } catch (e) {
      say((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const today = fmtDayMonth(new Date());
  const tips = buyTips(list, money);
  const need = extraNeeded(list);
  const months = amount > 0 ? Math.ceil(need / amount) : 0;

  return (
    <ScreenIn style={{ backgroundColor: c.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 4, height: 56 }}>
        <IconButton name="arrow_back" size={24} onPress={() => router.back()} />
        <T size={16} w={700} style={{ flex: 1, marginLeft: 4 }}>Herbalanceren</T>
        <IconButton name="restart_alt" label="Terug naar opgeslagen doel" onPress={reset} />
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={live ? <RefreshControl refreshing={loading} onRefresh={load} tintColor={c.gold} colors={[c.accent]} /> : undefined}
      >
        <HeroFrame>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 14, height: 1, backgroundColor: hero.label }} />
              <T size={11} w={600} color={hero.label} style={{ letterSpacing: 11 * 0.14, textTransform: 'uppercase' }}>{`Balans · ${today}`}</T>
            </View>
            <T size={11} color="#C4CCEF">Doel {draft.eq} · {draft.cr} · {draft.cash} · {draft.gold}</T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              <T size={12} color="#C4CCEF">Te verschuiven</T>
              <T serif size={40} num color={hero.amount} numberOfLines={1} adjustsFontSizeToFit style={{ marginTop: 4, lineHeight: 42 }}>{money(toShift)}</T>
              <T size={12} lh={1.45} color="#C4CCEF" style={{ marginTop: 6 }}>
                {`van ${money(total)} belegd\n${outside ? `${outside} van 4 klassen buiten marge` : 'alle klassen binnen marge'}`}
              </T>
            </View>
            <Dial list={list} label={privacy ? '••' : share(total ? (toShift / total) * 100 : 0)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 14, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(217,188,130,0.2)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF', opacity: 0.85 }} />
              <T size={11} color="#C4CCEF">binnenring = nu</T>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 2, borderRadius: 1, backgroundColor: '#FFFFFF', opacity: 0.85 }} />
              <T size={11} color="#C4CCEF">buitenring = doel</T>
            </View>
          </View>
        </HeroFrame>

        {error ? <Banner icon="error" color={c.neg} text={error} /> : null}
        {!ok ? <Banner icon="error" color={c.neg} text={`Je doelen tellen op tot ${sum}%. Maak er 100% van.`} /> : null}
        {live && state && !state.targets && ok ? (
          <Banner icon="tune" color={c.gold} text="Nog geen doel opgeslagen. Kies hieronder je verdeling en sla hem op." />
        ) : null}

        <View style={{ paddingTop: 30, paddingHorizontal: 24, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <GoldCaption>Doel per klasse</GoldCaption>
          <T size={12} color={c.muted}>totaal <T size={12} w={700} color={ok ? c.gold : c.neg}>{`${sum}%`}</T></T>
        </View>
        <View style={{ marginHorizontal: 12, backgroundImage: c.surfaceGrad, borderRadius: 20, boxShadow: `inset 0 0 0 1px ${c.line}`, paddingHorizontal: 16 }}>
          {list.map((r, i) => {
            const act = r.within ? 'binnen marge' : `${r.diff > 0 ? '+' : '−'}${money(Math.abs(r.diff))}`;
            return (
              <View key={r.cls} style={{ paddingTop: 14, paddingBottom: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CLASS_COLORS[r.cls] }} />
                      <T size={15} w={600}>{r.name}</T>
                    </View>
                    <T size={12} numberOfLines={1} style={{ marginTop: 4, paddingLeft: 16 }}>
                      <T size={12} color={c.muted}>nu {share(r.pct)} · </T>
                      <T size={12} w={700} color={r.within ? c.muted : r.diff > 0 ? c.pos : c.neg}>{act}</T>
                      <T size={12} color={c.muted}>{verb(r) ? ` ${verb(r)}` : ''}</T>
                    </T>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Round icon="remove" onPress={() => change(r.cls, -STEP)} label={`${r.name} 5% minder`} />
                    <T serif size={24} num color={c.gold} style={{ minWidth: 46, textAlign: 'center' }}>
                      {r.target}<T size={14} color={c.gold}>%</T>
                    </T>
                    <Round icon="add" onPress={() => change(r.cls, STEP)} label={`${r.name} 5% meer`} />
                  </View>
                </View>
                <View style={{ height: 3, marginTop: 12, marginLeft: 16, borderRadius: 2, backgroundColor: c.surface2 }}>
                  <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min((r.pct / 60) * 100, 100)}%`, backgroundColor: CLASS_COLORS[r.cls], borderRadius: 2 }} />
                  <View style={{ position: 'absolute', top: -3, left: `${Math.min((r.target / 60) * 100, 100)}%`, width: 9, height: 9, marginLeft: -4.5, backgroundColor: c.gold, transform: [{ rotate: '45deg' }] }} />
                </View>
              </View>
            );
          })}
        </View>

        <Segmented style={{ marginTop: 14, marginHorizontal: 16 }} items={[['buy', 'Alleen bijkopen'], ['full', 'Kopen & verkopen']]} value={mode} onChange={setMode} weights={[700, 600]} />

        {ok && mode === 'buy' ? (
          <FadeUp index={0}>
            <View style={{ marginTop: 12, marginHorizontal: 16, paddingVertical: 18, paddingHorizontal: 20, backgroundColor: c.accentSoft, borderRadius: 20 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Icon name="savings" size={22} color={c.accent} />
                <T size={14} lh={1.5} style={{ flex: 1 }}>
                  {need > 1
                    ? `Zonder te verkopen heb je ${money(need)} extra inleg nodig.${amount > 0 ? ` Bij ${money(amount)} per maand duurt dat ongeveer ${months} ${months === 1 ? 'maand' : 'maanden'}.` : ''}`
                    : 'Je kunt je doel bereiken zonder extra inleg.'}
                </T>
              </View>
              {amount > 0 && split.length ? (
                <View style={{ marginTop: 12, paddingLeft: 34, gap: 6 }}>
                  <T size={13} w={700}>{`Zo verdeel je je ${money(amount)} deze maand:`}</T>
                  {split.map((s) => (
                    <View key={s.cls} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CLASS_COLORS[s.cls] }} />
                      <T size={13} style={{ flex: 1 }}>{s.name}</T>
                      <T size={13} w={600} num>{money(s.amount)}</T>
                    </View>
                  ))}
                </View>
              ) : null}
              {tips.length ? (
                <View style={{ marginTop: 12, paddingLeft: 34, gap: 8 }}>
                  {tips.map((t) => (
                    <View key={t} style={{ flexDirection: 'row', gap: 8 }}>
                      <T size={13} color={c.gold}>◆</T>
                      <T size={13} lh={1.45} style={{ flex: 1 }}>{t}</T>
                    </View>
                  ))}
                </View>
              ) : null}
              <Pressable onPress={() => router.push('/periodiek')} style={{ marginTop: 14, marginLeft: 34, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <T size={14} w={700} color={c.accent}>Naar periodiek inleggen</T>
                <Icon name="arrow_forward" size={18} color={c.accent} />
              </Pressable>
            </View>
          </FadeUp>
        ) : null}

        {ok && mode === 'full' ? (
          <>
            <View style={{ paddingTop: 30, paddingHorizontal: 24, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <GoldCaption>{live && !synced ? 'Plan' : `Plan · ${steps.length} ${steps.length === 1 ? 'stap' : 'stappen'}`}</GoldCaption>
              {pending || loading ? <ActivityIndicator size="small" color={c.gold} /> : null}
            </View>
            {live && !synced && !pending ? (
              <View style={{ marginHorizontal: 16, gap: 12 }}>
                <T size={13} lh={1.5} color={c.muted}>Sla eerst je doel op. Dan rekent je server uit welke orders nodig zijn.</T>
                <Button block variant="outline" label="Dit doel opslaan" onPress={() => store(draft)} />
              </View>
            ) : steps.length === 0 && !pending ? (
              <View style={{ marginHorizontal: 12, paddingVertical: 20, paddingHorizontal: 18, borderRadius: 20, backgroundColor: c.surface, boxShadow: `inset 0 0 0 1px ${c.goldLine}`, flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                <Icon name="verified" size={28} color={c.gold} />
                <View style={{ flex: 1 }}>
                  <T size={15} w={700}>Je portefeuille is in balans</T>
                  <T size={13} color={c.muted} style={{ marginTop: 2 }}>Elke klasse zit dicht genoeg bij je doel.</T>
                </View>
              </View>
            ) : (
              <View style={{ marginHorizontal: 12, backgroundImage: c.surfaceGrad, borderRadius: 20, boxShadow: `inset 0 0 0 1px ${c.line}`, paddingVertical: 4 }}>
                {steps.map((s, i) => (
                  <StepRow
                    key={s.id}
                    step={s}
                    n={i + 1}
                    skipped={!!skip[s.id]}
                    result={results[s.id]}
                    onToggle={() => {
                      reqId.current = null;
                      setSkip((k) => ({ ...k, [s.id]: !k[s.id] }));
                    }}
                  />
                ))}
              </View>
            )}
            {chosen.length ? (
              <View style={{ marginTop: 16, marginHorizontal: 16, gap: 8 }}>
                <Button
                  block
                  icon="fingerprint"
                  label={busy ? 'Bezig…' : `Voer ${chosen.length} ${chosen.length === 1 ? 'order' : 'orders'} uit`}
                  onPress={() => (busy ? undefined : setConfirm(true))}
                />
                <T size={12} lh={1.45} color={c.muted} style={{ textAlign: 'center' }}>
                  Tegen marktprijs. Eerst de verkopen, dan de aankopen. Je dagmaximum geldt. Tik op een stap om hem over te slaan.
                </T>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
      {confirm ? (
        <ConfirmAuth
          title={`${chosen.length} ${chosen.length === 1 ? 'order' : 'orders'} uitvoeren`}
          sub={`${chosen.filter((s) => s.side === 'verkopen').length} verkopen, ${chosen.filter((s) => s.side === 'kopen').length} kopen`}
          onOk={run}
          onCancel={() => setConfirm(false)}
        />
      ) : null}
    </ScreenIn>
  );
}

function buyTips(list: ReturnType<typeof classRows>, money: (v: number) => string): string[] {
  const out: string[] = [];
  const by = Object.fromEntries(list.map((r) => [r.cls, r]));
  if (by.cr.diff < 0 && !by.cr.within) out.push('Leg tijdelijk minder in crypto tot je weer op je doel zit.');
  if (by.eq.diff > 0 && !by.eq.within) out.push(`Leg extra in aandelen en ETF's (nog ${money(by.eq.diff)}).`);
  if (by.gold.diff > 0 && !by.gold.within) out.push('Koop af en toe wat goud bij.');
  if (by.cash.diff > 0 && !by.cash.within) out.push(`Zet ${money(by.cash.diff)} op je spaarrekening.`);
  return out;
}

function Dial({ list, label }: { list: ReturnType<typeof classRows>; label: string }) {
  const arcs = dial(list);
  return (
    <View style={{ width: 120, height: 120 }}>
      <Svg viewBox="0 0 128 128" width={120} height={120}>
        <Circle cx={64} cy={64} r={61} fill="none" stroke="#D9BC82" strokeOpacity={0.35} strokeWidth={0.75} />
        {arcs.map((a) => (
          <Circle key={`t-${a.cls}`} cx={64} cy={64} r={49} fill="none" stroke={CLASS_COLORS[a.cls]} strokeWidth={2}
            strokeDasharray={`${a.outer[0].toFixed(2)} ${a.outer[1].toFixed(2)}`} strokeDashoffset={a.outer[2]} transform="rotate(-90 64 64)" />
        ))}
        {arcs.map((a) => (
          <Circle key={`n-${a.cls}`} cx={64} cy={64} r={39} fill="none" stroke={CLASS_COLORS[a.cls]} strokeWidth={10}
            strokeDasharray={`${a.inner[0].toFixed(2)} ${a.inner[1].toFixed(2)}`} strokeDashoffset={a.inner[2]} transform="rotate(-90 64 64)" />
        ))}
        <SvgText x={64} y={76} textAnchor="middle" fontFamily="Manrope_700Bold" fontSize={7.5} letterSpacing={1.2} fill={hero.label}>AFWIJKING</SvgText>
      </Svg>
      <T serif size={19} num color={hero.amount} style={{ position: 'absolute', left: 0, right: 0, top: 41, textAlign: 'center' }}>{label}</T>
    </View>
  );
}

function Round({ icon, onPress, label }: { icon: IconName; onPress: () => void; label: string }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={6}
      style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 16, boxShadow: `inset 0 0 0 1px ${c.goldLine}`, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.9 : 1 }] })}>
      <Icon name={icon} size={18} color={c.gold} />
    </Pressable>
  );
}

function Banner({ icon, color, text }: { icon: IconName; color: string; text: string }) {
  return (
    <View style={{ marginTop: 12, marginHorizontal: 16, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16, boxShadow: `inset 0 0 0 1px ${color}`, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <Icon name={icon} size={20} color={color} />
      <T size={14} w={600} color={color} style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

function StepRow({ step, n, skipped, result, onToggle }: { step: Step; n: number; skipped: boolean; result?: RebalanceResult; onToggle: () => void }) {
  const c = useColors();
  const order = step.kind === 'order';
  const done = result?.ok;
  const failed = result && !result.ok;
  const icon: IconName = done ? 'check' : failed ? 'close' : order ? (skipped ? 'check_box_outline_blank' : 'check_box') : step.cls === 'cash' ? 'sync_alt' : 'edit_note';
  const sub = done ? 'Geplaatst' : failed ? result!.message ?? 'Mislukt' : skipped ? 'Overgeslagen' : step.sub;
  return (
    <Pressable onPress={order && !done ? onToggle : undefined} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, opacity: skipped ? 0.5 : 1 }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: done ? c.gold : c.bg, boxShadow: `inset 0 0 0 1px ${c.goldLine}`, alignItems: 'center', justifyContent: 'center' }}>
        <T serif size={14} color={done ? c.onGold : c.gold}>{String(n)}</T>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T size={15} w={600} style={{ textDecorationLine: skipped ? 'line-through' : 'none' }}>{step.title}</T>
        <T size={12} color={failed ? c.neg : c.muted} style={{ marginTop: 2 }}>{sub}</T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {order ? null : <T size={11} w={600} color={c.muted} style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>zelf doen</T>}
        <Icon name={icon} size={20} color={done ? c.pos : failed ? c.neg : order ? c.accent : c.muted} />
      </View>
    </Pressable>
  );
}
