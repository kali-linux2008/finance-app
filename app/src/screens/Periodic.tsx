// Periodiek inleggen: elke maand op een vaste dag automatisch dezelfde bedragen kopen bij Trading 212.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, TextInput, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConfirmAuth } from '../components/ConfirmAuth';
import { Icon } from '../components/Icon';
import { ScreenIn } from '../components/motion';
import { T } from '../components/T';
import { Button, GoldCaption, IconButton, TickerBox } from '../components/ui';
import { getPlan, savePlan, type PlanLine, type PlanState } from '../lib/api';
import { eur, fmtDayMonth } from '../lib/format';
import { amountText, parseEuro, planError, planTotal, samplePlan, tradeableForPlan, whenText } from '../lib/plan';
import { useApp, useColors } from '../state/app';
import { useData } from '../state/data';
import { font } from '../theme/tokens';
import { tileColors } from '../theme/tiles';

type Draft = { active: boolean; day: number; lines: (PlanLine & { text: string })[] };

const toDraft = (s: PlanState): Draft => ({
  active: s.plan.active, day: s.plan.day, lines: s.plan.lines.map((l) => ({ ...l, text: amountText(l.amount) })),
});

export function Periodic() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { say } = useApp();
  const { live, server, positions } = useData();
  const [state, setState] = useState<PlanState | null>(live ? null : samplePlan());
  const [draft, setDraft] = useState<Draft | null>(live ? null : toDraft(samplePlan()));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!live || !server) return;
    setLoading(true);
    try {
      const s = await getPlan(server);
      setState(s);
      setDraft(toDraft(s));
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

  const lines = draft?.lines.map((l) => ({ ...l, amount: parseEuro(l.text) })) ?? [];
  const total = planTotal(lines);
  const problem = state ? planError(lines, state.monthMax) : '';
  const saved = state ? toDraft(state) : null;
  const dirty = !!draft && !!saved && JSON.stringify({ ...draft, lines: lines.map((l) => [l.posId, l.amount]) }) !==
    JSON.stringify({ ...saved, lines: saved.lines.map((l) => [l.posId, l.amount]) });
  const options = tradeableForPlan(positions, live).filter((p) => !draft?.lines.some((l) => l.posId === p.id));

  const update = (fn: (d: Draft) => Draft) => setDraft((d) => (d ? fn(d) : d));

  const save = async () => {
    setConfirm(false);
    if (!draft || !state) return;
    const plan = { active: draft.active, day: draft.day, lines: lines.map(({ posId, amount, tk, name }) => ({ posId, amount, tk, name })) };
    if (!live || !server) {
      setState({ ...state, plan, total });
      say('Voorbeeld: niet opgeslagen');
      return;
    }
    setSaving(true);
    try {
      const s = await savePlan(server, plan);
      setState(s);
      setDraft(toDraft(s));
      say('Plan opgeslagen');
    } catch (e) {
      say((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const input = { width: 84, height: 40, borderRadius: 12, paddingHorizontal: 10, backgroundColor: c.surface2, color: c.ink, fontFamily: font.sansSemi, fontSize: 15, textAlign: 'right' } as const;

  return (
    <ScreenIn style={{ backgroundColor: c.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 4, height: 56 }}>
        <IconButton name="arrow_back" size={24} onPress={() => router.back()} />
        <T size={16} w={700} style={{ flex: 1, marginLeft: 4 }}>Periodiek inleggen</T>
        <IconButton name="add" label="Belegging toevoegen" onPress={() => setAdding((a) => !a)} />
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={live ? <RefreshControl refreshing={loading} onRefresh={load} tintColor={c.gold} colors={[c.accent]} /> : undefined}
      >
        {error ? <T size={13} color={c.neg} style={{ paddingTop: 8, paddingHorizontal: 24 }}>{error}</T> : null}
        {!draft || !state ? (
          error ? null : <ActivityIndicator color={c.gold} style={{ marginTop: 48 }} />
        ) : (
          <>
            <View style={{ paddingTop: 4, paddingHorizontal: 24 }}>
              <GoldCaption>{draft.active ? 'Actief · per maand' : 'Gepauzeerd · per maand'}</GoldCaption>
              <T serif size={44} num color={c.gold} style={{ marginTop: 8 }}>{eur(total, !Number.isInteger(total))}</T>
              <T size={13} color={c.muted} style={{ marginTop: 4 }}>
                {!draft.active ? 'Er wordt niets gekocht tot je het plan weer aanzet.'
                  : dirty ? `Elke maand op de ${draft.day}e, rond 15:45 · nog niet opgeslagen`
                  : state.nextRun ? `Volgende inleg: ${whenText(state.nextRun)}` : 'Voeg beleggingen toe om te beginnen.'}
              </T>
            </View>

            {live && !state.enabled ? (
              <View style={{ marginTop: 16, marginHorizontal: 16, padding: 14, borderRadius: 14, backgroundColor: c.accentSoft }}>
                <T size={13} w={600} lh={1.5} color={c.accent}>
                  Automatisch kopen staat nog uit op je server. Zet het aan met:{'\n'}python -m meridian handel periodiek aan
                </T>
              </View>
            ) : null}

            <T size={11} w={600} color={c.gold} style={{ paddingTop: 24, paddingHorizontal: 24, paddingBottom: 10, letterSpacing: 1.5 }}>BELEGGINGEN</T>
            <View style={{ marginHorizontal: 12, backgroundImage: c.surfaceGrad, borderRadius: 20, boxShadow: `inset 0 0 0 1px ${c.line}`, paddingVertical: 4 }}>
              {draft.lines.length ? draft.lines.map((l, i) => {
                const pos = positions.find((p) => p.id === l.posId);
                const [bg, fg] = pos ? tileColors(c, pos.tile) : [c.surface2, c.ink];
                const bad = !(parseEuro(l.text) >= 1);
                const share = total ? Math.round((parseEuro(l.text) / total) * 100) : 0;
                return (
                  <View key={l.posId} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 }}>
                    <TickerBox tk={l.tk || pos?.tk || '?'} bg={bg} fg={fg} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T size={15} w={600} numberOfLines={1}>{l.name || pos?.name || l.posId}</T>
                      <T size={12} color={c.muted} style={{ marginTop: 2 }}>{Number.isFinite(share) ? `${share}% van je inleg` : ''}</T>
                    </View>
                    <TextInput
                      value={l.text}
                      onChangeText={(text) => update((d) => ({ ...d, lines: d.lines.map((x, j) => (j === i ? { ...x, text } : x)) }))}
                      keyboardType="decimal-pad"
                      accessibilityLabel={`Bedrag ${l.tk}`}
                      style={{ ...input, boxShadow: bad ? `inset 0 0 0 1px ${c.neg}` : undefined }}
                    />
                    <Pressable onPress={() => update((d) => ({ ...d, lines: d.lines.filter((_, j) => j !== i) }))} hitSlop={8} accessibilityLabel={`${l.tk} weghalen`}>
                      <Icon name="close" size={20} color={c.faint} />
                    </Pressable>
                  </View>
                );
              }) : <T size={14} color={c.muted} style={{ padding: 16 }}>Nog niets in je plan. Tik op + om een belegging toe te voegen.</T>}
            </View>

            {adding ? (
              <View style={{ marginTop: 8, marginHorizontal: 12, backgroundColor: c.surface, borderRadius: 20, paddingVertical: 4 }}>
                {options.length ? options.map((p) => {
                  const [bg, fg] = tileColors(c, p.tile);
                  return (
                    <Pressable key={p.id} onPress={() => { update((d) => ({ ...d, lines: [...d.lines, { posId: p.id, tk: p.tk, name: p.name, amount: 25, text: '25' }] })); setAdding(false); }}
                      style={({ pressed }) => ({ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, opacity: pressed ? 0.7 : 1 })}>
                      <TickerBox tk={p.tk} bg={bg} fg={fg} />
                      <T size={15} w={600} numberOfLines={1} style={{ flex: 1 }}>{p.name}</T>
                      <Icon name="add" size={20} color={c.accent} />
                    </Pressable>
                  );
                }) : <T size={13} color={c.muted} style={{ padding: 14 }}>Al je Trading 212-beleggingen staan al in het plan.</T>}
              </View>
            ) : null}

            <View style={{ marginTop: 12, marginHorizontal: 12, backgroundColor: c.surface, borderRadius: 20, paddingVertical: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 16 }}>
                <View>
                  <T size={14} w={600}>Inlegdag</T>
                  <T size={12} color={c.muted} style={{ marginTop: 2 }}>Weekend: de eerstvolgende werkdag</T>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Round icon="remove" onPress={() => update((d) => ({ ...d, day: Math.max(1, d.day - 1) }))} />
                  <T size={15} w={700} num style={{ minWidth: 44, textAlign: 'center' }}>{draft.day}e</T>
                  <Round icon="add" onPress={() => update((d) => ({ ...d, day: Math.min(28, d.day + 1) }))} />
                </View>
              </View>
              <Pressable onPress={() => update((d) => ({ ...d, active: !d.active }))} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: c.line }}>
                <View>
                  <T size={14} w={600}>Plan actief</T>
                  <T size={12} color={c.muted} style={{ marginTop: 2 }}>Uit = pauzeren, je plan blijft bewaard</T>
                </View>
                <View style={{ width: 52, height: 32, borderRadius: 16, backgroundColor: draft.active ? c.accent : c.faint }}>
                  <View style={{ position: 'absolute', top: 4, left: draft.active ? 24 : 4, width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' }} />
                </View>
              </Pressable>
            </View>

            {problem ? <T size={13} color={c.neg} style={{ paddingTop: 12, paddingHorizontal: 24 }}>{problem}</T> : null}
            {dirty ? (
              <View style={{ paddingTop: 16, paddingHorizontal: 16 }}>
                <Button label={saving ? 'Opslaan…' : 'Plan opslaan'} icon="fingerprint" block onPress={() => !problem && !saving && setConfirm(true)} style={problem ? { opacity: 0.5 } : undefined} />
              </View>
            ) : null}

            {state.runs.length ? (
              <>
                <T size={11} w={600} color={c.gold} style={{ paddingTop: 28, paddingHorizontal: 24, paddingBottom: 10, letterSpacing: 1.5 }}>EERDERE INLEG</T>
                <View style={{ marginHorizontal: 12, backgroundImage: c.surfaceGrad, borderRadius: 20, boxShadow: `inset 0 0 0 1px ${c.line}`, paddingVertical: 4 }}>
                  {state.runs.map((r) => (
                    <View key={r.at} style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 16 }}>
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: r.ok ? 'rgba(107,196,143,0.14)' : 'rgba(232,130,110,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name={r.ok ? 'check' : 'close'} size={18} color={r.ok ? c.pos : c.neg} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <T size={14} w={600}>{fmtDayMonth(new Date(r.at * 1000))} · {eur(r.total, true)}</T>
                        <T size={12} lh={1.4} color={c.muted} style={{ marginTop: 2 }}>{r.message}</T>
                        {r.lines.filter((x) => !x.ok).map((x) => (
                          <T key={x.posId} size={12} lh={1.4} color={c.neg} style={{ marginTop: 2 }}>{x.tk}: {x.message}</T>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <T size={12} lh={1.5} color={c.faint} style={{ paddingTop: 16, paddingHorizontal: 24, textAlign: 'center' }}>
              De server koopt rond 15:45, als de Europese en Amerikaanse beurzen allebei open zijn. Staat er te weinig vrij saldo, dan koopt hij niets en probeert hij het de volgende werkdag opnieuw. Maandmaximum: {eur(state.monthMax)}.
            </T>
          </>
        )}
      </ScrollView>
      {confirm ? (
        <ConfirmAuth title="Plan opslaan" sub={`${eur(total, !Number.isInteger(total))} per maand, op de ${draft?.day}e`} onOk={save} onCancel={() => setConfirm(false)} />
      ) : null}
    </ScreenIn>
  );
}

function Round({ icon, onPress }: { icon: 'add' | 'remove'; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityLabel={icon === 'add' ? 'Later' : 'Eerder'} style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, boxShadow: `inset 0 0 0 1px ${c.goldLine}`, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.9 : 1 }] })}>
      <Icon name={icon} size={20} color={c.gold} />
    </Pressable>
  );
}
