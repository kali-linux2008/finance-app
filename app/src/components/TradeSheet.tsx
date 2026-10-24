// Handelen (bottom sheet): kies een belegging → kopen/verkopen → candles → bedrag → markt/limiet →
// controleren → vingerafdruk of pincode → klaar. Met voorbeelddata wordt er niets verstuurd;
// met je server gaat de order naar het oefenaccount (demo) van Trading 212 of OKX.
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, BackHandler, Easing, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getOhlc, getTradeQuote, placeOrder, type OrderResult } from '../lib/api';
import { currencyPrefix, num } from '../lib/format';
import { PIN_LENGTH, pressKey } from '../lib/pin';
import {
  estimate, parseAmount, pressAmount, requestId, sampleCandles, sampleQuote, stepLimit, tradeVia,
  type Candle, type OrderType, type Quote, type Side,
} from '../lib/trade';
import { useApp, useColors } from '../state/app';
import { useData } from '../state/data';
import { useLock } from '../state/lock';
import { useTrade, type TradeTarget } from '../state/trade';
import { tileColors } from '../theme/tiles';
import { Icon } from './Icon';
import { T } from './T';
import { TickerBox } from './ui';

type Step = 'pick' | 'form' | 'confirm' | 'auth' | 'sending' | 'done' | 'failed';

const AMOUNT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'];
const PIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'backspace'];
const tap = () => {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
};
const euro = (v: number) => '€ ' + num(v, 2);
const qtyText = (v: number) => num(v, 0, v < 1 ? 6 : 4);

export function TradeSheet() {
  const { target, closeTrade } = useTrade();
  if (!target) return null;
  return <Sheet key={target.key} target={target} onClose={closeTrade} />;
}

function Sheet({ target, onClose }: { target: TradeTarget; onClose: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { live, server, positions } = useData();
  const { biometricAvailable, biometricEnabled, confirmBiometric, verifyPin } = useLock();
  const bio = biometricAvailable && biometricEnabled;

  const [step, setStep] = useState<Step>(target.posId ? 'form' : 'pick');
  const [posId, setPosId] = useState(target.posId);
  const [side, setSide] = useState<Side>(target.side);
  const [amount, setAmount] = useState('200');
  const [type, setType] = useState<OrderType>('markt');
  const [limitPct, setLimitPct] = useState(0);
  const [remote, setRemote] = useState<{ id: string; quote: Quote | null; error: string | null } | null>(null);
  const [liveCandles, setLiveCandles] = useState<{ id: string; list: Candle[] } | null>(null);
  const [result, setResult] = useState<{ ok: true; res: OrderResult | null } | { ok: false; error: string } | null>(null);
  const [pinMode, setPinMode] = useState(false);
  const [pin, setPin] = useState('');
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const reqId = useRef<string | null>(null);

  // In- en uitschuiven
  const [k] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(k, { toValue: 1, duration: 250, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [k]);
  const close = useCallback(() => {
    Animated.timing(k, { toValue: 0, duration: 180, easing: Easing.in(Easing.ease), useNativeDriver: true }).start(() => onClose());
  }, [k, onClose]);

  const picks = useMemo(() => positions.filter((p) => tradeVia(p, live)), [positions, live]);
  const pos = posId ? positions.find((p) => p.id === posId) ?? null : null;
  const via = pos ? tradeVia(pos, live) : null;

  // Koers, saldo en wat je kunt verkopen: bij echte data van de server (oefenaccount).
  useEffect(() => {
    if (!live || !server || !posId) return;
    let gone = false;
    getTradeQuote(server, posId)
      .then((q) => !gone && setRemote({ id: posId, quote: q, error: null }))
      .catch((e: Error) => !gone && setRemote({ id: posId, quote: null, error: e.message }));
    return () => {
      gone = true;
    };
  }, [live, server, posId]);

  // Candles: crypto van OKX (openbaar); voor aandelen heeft de server nog geen koershistorie.
  const ccy = live && pos?.cat === 'cr' ? pos.tk : null;
  useEffect(() => {
    if (!server || !ccy || !posId) return;
    let gone = false;
    getOhlc(server, ccy)
      .then((list) => !gone && setLiveCandles({ id: posId, list }))
      .catch(() => !gone && setLiveCandles({ id: posId, list: [] }));
    return () => {
      gone = true;
    };
  }, [server, ccy, posId]);

  const quote: Quote | null = !pos ? null : live ? (remote?.id === posId ? remote.quote : null) : sampleQuote(pos);
  const quoteError = live && remote?.id === posId ? remote.error ?? quote?.error ?? null : null;
  const loadingQuote = live && !!pos && remote?.id !== posId;
  const candles = !pos ? [] : live ? (liveCandles?.id === posId ? liveCandles.list : []) : sampleCandles(pos);

  const amt = parseAmount(amount);
  const est = quote ? estimate(quote, side, amt, type, limitPct) : null;
  const blocked = !quote || !!quoteError || !quote.connected;
  const ok = !!est && !est.error && !blocked;
  const isBuy = side === 'kopen';
  const fmtPrice = (x: number) => currencyPrefix(quote?.cur ?? pos?.cur ?? 'EUR') + num(x, 2);

  const back = useCallback(() => {
    if (step === 'auth' || step === 'failed') {
      setPinMode(false);
      setPin('');
      setStep('confirm');
    } else if (step === 'confirm') setStep('form');
    else if (step === 'form' && !target.posId) setStep('pick');
    else if (step !== 'sending') close();
  }, [step, target.posId, close]);

  // Android-terugknop: een stap terug in plaats van de app verlaten.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      back();
      return true;
    });
    return () => sub.remove();
  }, [back]);

  const send = async () => {
    if (!pos || !quote) return;
    setStep('sending');
    if (quote.sample || !server) {
      setTimeout(() => {
        setResult({ ok: true, res: null });
        setStep('done');
      }, 600);
      return;
    }
    // Eén id per bevestiging: als dit verzoek herhaald wordt, plaatst de server de order niet nog eens.
    reqId.current ??= requestId();
    try {
      const res = await placeOrder(server, { posId: pos.id, side, amount: amt, type, limitPct, requestId: reqId.current });
      setResult({ ok: true, res });
      setStep('done');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
      setStep('failed');
      reqId.current = null;
    }
  };

  const askBiometric = async () => {
    if (!pos) return;
    const okBio = await confirmBiometric(`${isBuy ? 'Koop' : 'Verkoop'} ${pos.tk} · € ${amount}`);
    if (okBio) send();
    else setPinMode(true);
  };

  const toAuth = () => {
    reqId.current = null;
    setStep('auth');
    setPin('');
    setPinMsg(null);
    if (bio) {
      setPinMode(false);
      askBiometric();
    } else setPinMode(true);
  };

  const pressPin = async (key: string) => {
    if (!key) return;
    tap();
    const next = pressKey(pin, key);
    setPin(next);
    if (next.length < PIN_LENGTH) return;
    const r = await verifyPin(next);
    setPin('');
    if (r === 'ok') send();
    else setPinMsg(r === 'wait' ? 'Te vaak fout. Wacht even.' : 'Onjuiste pincode');
  };

  const [tbg, tfg] = pos ? tileColors(c, pos.tile) : [c.surface2, c.ink];
  const translateY = k.interpolate({ inputRange: [0, 1], outputRange: [600, 0] });

  return (
    <Modal transparent visible statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={back}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.scrim, opacity: k }}>
          <Pressable style={{ flex: 1 }} onPress={step === 'sending' ? undefined : close} accessibilityLabel="Sluiten" />
        </Animated.View>
        <Animated.View style={{ backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 8, paddingBottom: 16 + insets.bottom, maxHeight: '94%', transform: [{ translateY }] }}>
          <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: c.faint, alignSelf: 'center', marginTop: 4, marginBottom: 6 }} />

          {step === 'pick' ? (
            <>
              <T serif size={24} style={{ paddingTop: 8, paddingHorizontal: 24, paddingBottom: 12 }}>Wat wil je handelen?</T>
              <ScrollView style={{ paddingHorizontal: 12 }} showsVerticalScrollIndicator={false}>
                <View style={{ backgroundImage: c.surfaceGrad, borderRadius: 20, boxShadow: `inset 0 0 0 1px ${c.line}`, paddingVertical: 4 }}>
                  {picks.length ? picks.map((p) => {
                    const [bg, fg] = tileColors(c, p.tile);
                    return (
                      <Pressable key={p.id} onPress={() => { setPosId(p.id); setStep('form'); }} style={({ pressed }) => ({ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, opacity: pressed ? 0.7 : 1 })}>
                        <TickerBox tk={p.tk} bg={bg} fg={fg} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <T size={15} w={600} numberOfLines={1}>{p.name}</T>
                          <T size={12} color={c.muted} style={{ marginTop: 2 }}>via {tradeVia(p, live)}</T>
                        </View>
                        <T size={14} w={600} num>{currencyPrefix(p.cur ?? 'EUR') + num(p.price ?? 0, 2)}</T>
                      </Pressable>
                    );
                  }) : (
                    <T size={14} color={c.muted} style={{ padding: 16 }}>Je hebt nog geen beleggingen bij Trading 212 of OKX.</T>
                  )}
                </View>
              </ScrollView>
            </>
          ) : null}

          {step === 'form' && pos ? (
            <>
              <ScrollView contentContainerStyle={{ gap: 12, paddingTop: 4, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, backgroundColor: c.surface2 }}>
                  {(['kopen', 'verkopen'] as Side[]).map((sd) => {
                    const on = side === sd;
                    return (
                      <Pressable key={sd} onPress={() => setSide(sd)} style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 999, backgroundColor: on ? (sd === 'kopen' ? c.accent : c.ink) : 'transparent' }}>
                        <T size={14} w={700} color={on ? (sd === 'kopen' ? c.onAccent : c.bg) : c.muted}>{sd === 'kopen' ? 'Kopen' : 'Verkopen'}</T>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <TickerBox tk={pos.tk} bg={tbg} fg={tfg} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T size={15} w={600} numberOfLines={1}>{pos.name}</T>
                    <T size={12} color={c.muted} style={{ marginTop: 2 }}>via {via} · {quote ? fmtPrice(quote.price) : '…'}</T>
                  </View>
                  {!target.posId ? (
                    <Pressable onPress={() => setStep('pick')} hitSlop={8}>
                      <T size={13} w={600} color={c.accent}>Wijzig</T>
                    </Pressable>
                  ) : null}
                </View>

                {quote && !quote.sample ? <DemoBadge quote={quote} /> : null}

                <Candles list={candles} fmt={fmtPrice} note={live && pos.cat !== 'cr' ? 'Koersgrafiek voor aandelen volgt later' : null} />

                <View style={{ alignItems: 'center', paddingTop: 2 }}>
                  <T serif size={44} lh={1.1} num color={c.gold}>€ {amount || '0'}</T>
                  <T size={13} color={(est?.error && amt > 0) || quoteError ? c.neg : c.muted} style={{ marginTop: 4, textAlign: 'center' }}>
                    {loadingQuote ? 'Saldo ophalen bij je server…'
                      : quoteError ? quoteError
                      : est ? est.error || `≈ ${qtyText(est.qty)} ${quote?.unit}${quote?.cur === 'USD' ? ' · omgerekend uit USD' : ''}` : ''}
                  </T>
                </View>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['markt', 'limiet'] as OrderType[]).map((t) => (
                    <Pressable key={t} onPress={() => setType(t)} style={{ flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: type === t ? c.ink : c.line, backgroundColor: type === t ? c.ink : 'transparent' }}>
                      <T size={14} w={600} color={type === t ? c.bg : c.ink}>{t === 'markt' ? 'Markt' : 'Limiet'}</T>
                    </Pressable>
                  ))}
                </View>

                {type === 'limiet' && quote ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 12, backgroundColor: c.surface, borderRadius: 14 }}>
                    <T size={14} color={c.muted}>Limietkoers</T>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Round icon="remove" onPress={() => setLimitPct((p) => stepLimit(p, -1))} />
                      <View style={{ minWidth: 104, alignItems: 'center' }}>
                        <T size={15} w={700} num>{fmtPrice(est?.limitPrice ?? quote.price)}</T>
                        <T size={11} num color={c.muted}>{limitPct === 0 ? 'koers nu' : `${limitPct > 0 ? '+' : '−'}${num(Math.abs(limitPct), 1)}%`}</T>
                      </View>
                      <Round icon="add" onPress={() => setLimitPct((p) => stepLimit(p, 1))} />
                    </View>
                  </View>
                ) : null}

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 }}>
                  {AMOUNT_KEYS.map((key) => (
                    <View key={key} style={{ width: '33.333%', paddingHorizontal: 2 }}>
                      <Pressable onPress={() => { tap(); setAmount((x) => pressAmount(x, key)); }} accessibilityLabel={key === '⌫' ? 'Wissen' : key} style={({ pressed }) => ({ height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.surface2 : 'transparent' })}>
                        {key === '⌫' ? <Icon name="backspace" size={22} /> : <T size={22} w={500}>{key}</T>}
                      </Pressable>
                    </View>
                  ))}
                </View>
              </ScrollView>
              <View style={{ paddingTop: 10, paddingHorizontal: 16 }}>
                {est && quote ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 10 }}>
                    <T size={12} color={c.muted}>
                      Kosten {euro(est.fee)}{quote.fx ? ' (FX 0,15%)' : quote.fee ? ' (± 0,10%)' : ' · geen commissie'}
                    </T>
                    <T size={12} num color={c.muted}>{isBuy ? 'Totaal ' : 'Je ontvangt '}{euro(est.total)}</T>
                  </View>
                ) : null}
                <Pressable onPress={() => ok && setStep('confirm')} style={{ height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', ...(ok ? { backgroundImage: c.btnBg, boxShadow: c.btnShadow } : { backgroundColor: c.surface2 }) }}>
                  <T size={15} w={700} color={ok ? c.onAccent : c.faint}>Controleren</T>
                </Pressable>
              </View>
            </>
          ) : null}

          {step === 'confirm' && pos && quote && est ? (
            <>
              <Header title="Controleer je order" onBack={back} />
              <View style={{ paddingTop: 8, paddingHorizontal: 24 }}>
                <T size={13} color={c.muted}>{isBuy ? 'Kopen' : 'Verkopen'} · {pos.name}</T>
                <T serif size={40} num color={c.gold} style={{ marginTop: 4 }}>€ {amount}</T>
              </View>
              <View style={{ marginTop: 14, marginHorizontal: 16, backgroundImage: c.surfaceGrad, borderRadius: 20, boxShadow: `inset 0 0 0 1px ${c.line}`, paddingVertical: 4 }}>
                {[
                  ['Order', `${isBuy ? 'Kopen' : 'Verkopen'} · ${type === 'markt' ? 'Markt' : 'Limiet'}`],
                  ['Product', `${pos.tk} via ${quote.brokerName}`],
                  ['Account', quote.sample ? 'Voorbeeld · er wordt niets verstuurd' : quote.demo ? 'Oefenaccount (demo)' : 'Echt geld'],
                  ['Geschat aantal', `${qtyText(est.qty)} ${quote.unit}`],
                  type === 'limiet' ? ['Limietkoers', fmtPrice(est.limitPrice)] : ['Koers nu', fmtPrice(quote.price)],
                  ['Kosten', euro(est.fee)],
                  ['Uitvoering', quote.exec],
                ].map(([key, v]) => <Row key={key} k={key} v={v} />)}
                <Row k={isBuy ? 'Totaal' : 'Je ontvangt'} v={euro(est.total)} bold />
              </View>
              <View style={{ paddingTop: 16, paddingHorizontal: 16 }}>
                <Pressable onPress={toAuth} style={{ height: 52, borderRadius: 26, backgroundImage: c.btnBg, boxShadow: c.btnShadow, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={bio ? 'fingerprint' : 'lock'} size={22} color={c.onAccent} />
                  <T size={15} w={700} color={c.onAccent}>{bio ? 'Bevestig met vingerafdruk' : 'Bevestig met pincode'}</T>
                </Pressable>
              </View>
            </>
          ) : null}

          {step === 'auth' && pos ? (
            <View style={{ paddingTop: 16, paddingHorizontal: 24, paddingBottom: 8, alignItems: 'center' }}>
              <T size={20} w={700}>Order bevestigen</T>
              <T size={14} color={c.muted} style={{ marginTop: 6 }}>{isBuy ? 'Kopen' : 'Verkopen'} {pos.tk} · € {amount}</T>
              {pinMode ? (
                <>
                  <View style={{ flexDirection: 'row', gap: 14, marginTop: 28, marginBottom: 8 }}>
                    {Array.from({ length: PIN_LENGTH }, (_, i) => (
                      <View key={i} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: i < pin.length ? c.gold : 'transparent', borderWidth: 1.5, borderColor: i < pin.length ? c.gold : c.faint }} />
                    ))}
                  </View>
                  <T size={13} color={pinMsg ? c.neg : c.muted}>{pinMsg ?? 'Voer je pincode in'}</T>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 4, marginTop: 12, alignSelf: 'stretch' }}>
                    {PIN_KEYS.map((key, i) => (
                      <View key={i} style={{ width: '33.333%', paddingHorizontal: 2 }}>
                        <Pressable disabled={!key} onPress={() => pressPin(key)} accessibilityLabel={key === 'backspace' ? 'Wissen' : key} style={({ pressed }) => ({ height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed && key ? c.surface2 : 'transparent' })}>
                          {key === 'backspace' ? <Icon name="backspace" size={22} /> : <T size={22} w={500}>{key}</T>}
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <Pressable onPress={askBiometric} style={{ width: 72, height: 72, marginTop: 28, marginBottom: 12, borderRadius: 36, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="fingerprint" size={40} color={c.accent} />
                  </Pressable>
                  <T size={13} color={c.muted}>Raak de vingerafdruksensor aan</T>
                </>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', marginTop: 24 }}>
                {pinMode && bio ? (
                  <Pressable onPress={() => { setPinMode(false); askBiometric(); }}><T size={14} w={600} color={c.accent}>Vingerafdruk gebruiken</T></Pressable>
                ) : !pinMode ? (
                  <Pressable onPress={() => setPinMode(true)}><T size={14} w={600} color={c.accent}>Pincode gebruiken</T></Pressable>
                ) : <View />}
                <Pressable onPress={back}><T size={14} w={600} color={c.accent}>Annuleren</T></Pressable>
              </View>
            </View>
          ) : null}

          {step === 'sending' ? (
            <View style={{ paddingVertical: 48, alignItems: 'center', gap: 16 }}>
              <ActivityIndicator color={c.gold} size="large" />
              <T size={15} color={c.muted}>Order versturen…</T>
            </View>
          ) : null}

          {step === 'done' && pos && result?.ok ? (
            <Done
              title={type === 'limiet' ? 'Limietorder geplaatst' : 'Order geplaatst'}
              text={
                result.res
                  ? `${isBuy ? 'Kopen' : 'Verkopen'} ${pos.tk} voor € ${amount} op je ${result.res.demo ? 'oefenaccount' : 'account'} bij ${result.res.brokerName}. ` +
                    (type === 'limiet' ? 'Je vindt hem onder Portefeuille → Orders.' : `${quote?.exec}.`)
                  : `Voorbeeld: ${isBuy ? 'kopen' : 'verkopen'} ${pos.tk} voor € ${amount}. Er is niets verstuurd. Koppel je server om met oefengeld te handelen.`
              }
              onClose={close}
            />
          ) : null}

          {step === 'failed' && result && !result.ok ? (
            <View style={{ paddingTop: 20, paddingHorizontal: 24, paddingBottom: 8, alignItems: 'center' }}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.neg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="close" size={40} color="#fff" />
              </View>
              <T serif size={26} style={{ marginTop: 16 }}>Order niet geplaatst</T>
              <T size={14} lh={1.5} color={c.muted} style={{ marginTop: 8, textAlign: 'center' }}>{result.error}</T>
              <Pressable onPress={back} style={{ marginTop: 24, height: 52, alignSelf: 'stretch', borderRadius: 26, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
                <T size={15} w={700} color={c.bg}>Terug</T>
              </Pressable>
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

function DemoBadge({ quote }: { quote: Quote }) {
  const c = useColors();
  const text = !quote.connected
    ? 'Nog geen handelssleutel op je server'
    : `${quote.demo ? 'Oefenaccount' : 'Echt geld'} · ${quote.sellQty ? `${qtyText(quote.sellQty)} ${quote.unit} in bezit` : `geen ${quote.tk} in bezit`}` +
      (quote.cash != null ? ` · vrij ${euro(quote.cash)}` : '');
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: c.accentSoft }}>
      <Icon name="science" size={18} color={c.accent} />
      <T size={12} w={600} color={c.accent} style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

function Candles({ list, fmt, note }: { list: Candle[]; fmt: (x: number) => string; note: string | null }) {
  const c = useColors();
  if (!list.length) {
    return note ? (
      <View style={{ backgroundColor: c.surface, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 12 }}>
        <T size={12} color={c.muted}>{note}</T>
      </View>
    ) : (
      <View style={{ backgroundColor: c.surface, borderRadius: 16, height: 132, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.faint} />
      </View>
    );
  }
  const lo = Math.min(...list.map((x) => x.l));
  const hi = Math.max(...list.map((x) => x.h));
  const vmax = Math.max(...list.map((x) => x.v)) || 1;
  const y = (v: number) => (hi === lo ? 50 : ((hi - v) / (hi - lo)) * 100);
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: 16, paddingTop: 10, paddingHorizontal: 12, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T size={11} color={c.muted}>Vandaag · 15 min</T>
        <T size={11} num color={c.muted}>H {fmt(hi)} · L {fmt(lo)}</T>
      </View>
      <View style={{ flexDirection: 'row', gap: 2, height: 78, marginTop: 8 }}>
        {list.map((x, i) => {
          const col = x.c >= x.o ? c.pos : c.neg;
          return (
            <View key={i} style={{ flex: 1 }}>
              <View style={{ position: 'absolute', left: '50%', width: 1, marginLeft: -0.5, top: `${y(x.h)}%`, height: `${Math.max(y(x.l) - y(x.h), 0.5)}%`, backgroundColor: col }} />
              <View style={{ position: 'absolute', left: 0, right: 0, top: `${y(Math.max(x.o, x.c))}%`, height: `${Math.max(Math.abs(y(x.o) - y(x.c)), 1.2)}%`, backgroundColor: col, borderRadius: 1 }} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 2, height: 22, alignItems: 'flex-end', marginTop: 4, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 2 }}>
        {list.map((x, i) => (
          <View key={i} style={{ flex: 1, height: Math.max(1, Math.round((x.v / vmax) * 20)), backgroundColor: x.c >= x.o ? c.pos : c.neg, opacity: 0.35, borderRadius: 1 }} />
        ))}
      </View>
    </View>
  );
}

function Round({ icon, onPress }: { icon: 'add' | 'remove'; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={() => { tap(); onPress(); }} accessibilityLabel={icon === 'add' ? 'Hoger' : 'Lager'} style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, boxShadow: `inset 0 0 0 1px ${c.goldLine}`, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.9 : 1 }] })}>
      <Icon name={icon} size={20} color={c.gold} />
    </Pressable>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
      <Pressable onPress={onBack} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Terug">
        <Icon name="arrow_back" size={24} />
      </Pressable>
      <T size={16} w={700}>{title}</T>
    </View>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 11, paddingHorizontal: 16 }}>
      <T size={14} color={c.muted}>{k}</T>
      <T size={14} w={bold ? 700 : 500} num style={{ textAlign: 'right', flexShrink: 1 }}>{v}</T>
    </View>
  );
}

function Done({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  const c = useColors();
  const { say } = useApp();
  const [k] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(k, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
  }, [k]);
  return (
    <View style={{ paddingTop: 20, paddingHorizontal: 24, paddingBottom: 8, alignItems: 'center' }}>
      <Animated.View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.pos, alignItems: 'center', justifyContent: 'center', transform: [{ scale: k }] }}>
        <Icon name="check" size={40} color="#fff" />
      </Animated.View>
      <T serif size={26} style={{ marginTop: 16 }}>{title}</T>
      <T size={14} lh={1.5} color={c.muted} style={{ marginTop: 8, textAlign: 'center' }}>{text}</T>
      <Pressable onPress={() => { onClose(); say(title); }} style={{ marginTop: 24, height: 52, alignSelf: 'stretch', borderRadius: 26, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
        <T size={15} w={700} color={c.bg}>Klaar</T>
      </Pressable>
    </View>
  );
}
