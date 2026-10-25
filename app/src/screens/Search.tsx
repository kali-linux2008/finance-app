// Zoeken om iets aan je volglijst toe te voegen: je eigen aandelen en elke crypto op OKX.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { FadeUp, ScreenIn } from '../components/motion';
import { T } from '../components/T';
import { IconButton } from '../components/ui';
import { addWatch, getWatch, searchInstruments, type SearchResult } from '../lib/api';
import { useApp, useColors } from '../state/app';
import { useData } from '../state/data';
import { font } from '../theme/tokens';

export function Search() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { say } = useApp();
  const { server } = useData();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [watched, setWatched] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!server) return;
    getWatch(server).then((s) => setWatched(new Set(s.items.map((i) => i.key)))).catch(() => {});
  }, [server]);

  // Pas zoeken als je even stopt met typen.
  useEffect(() => {
    if (!server) return;
    let gone = false;
    const t = setTimeout(async () => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      setBusy(true);
      try {
        const r = await searchInstruments(server, q);
        if (!gone) setResults(r);
      } catch (e) {
        if (!gone) say((e as Error).message);
      } finally {
        if (!gone) setBusy(false);
      }
    }, 300);
    return () => {
      gone = true;
      clearTimeout(t);
    };
  }, [q, server, say]);

  const add = async (r: SearchResult) => {
    if (!server) return;
    if (watched.has(r.key)) {
      router.back();
      return;
    }
    try {
      await addWatch(server, r.key);
      say(`${r.tk} staat in je volglijst`);
      router.back();
    } catch (e) {
      say((e as Error).message);
    }
  };

  return (
    <ScreenIn style={{ backgroundColor: c.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 4, height: 56 }}>
        <IconButton name="arrow_back" size={24} onPress={() => router.back()} />
        <View style={{ flex: 1, height: 44, marginRight: 12, borderRadius: 22, backgroundColor: c.surface2, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 }}>
          <Icon name="search" size={20} color={c.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="Ticker of naam (bijv. XRP of Rheinmetall)"
            placeholderTextColor={c.faint}
            style={{ flex: 1, color: c.ink, fontFamily: font.sansMedium, fontSize: 15, padding: 0 }}
          />
          {busy ? <ActivityIndicator size="small" color={c.gold} /> : null}
        </View>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}>
        {!q.trim() ? (
          <T size={13} color={c.muted} lh={1.5} style={{ paddingHorizontal: 24, paddingTop: 12 }}>
            Je kunt elke crypto op OKX volgen, en de aandelen en ETF&apos;s die je al hebt. Andere aandelen kunnen (nog) niet: daarvoor zou de server een extra koersdienst nodig hebben.
          </T>
        ) : !busy && !results.length ? (
          <T size={13} color={c.muted} style={{ paddingHorizontal: 24, paddingTop: 12 }}>Niets gevonden voor “{q.trim()}”.</T>
        ) : null}
        {results.map((r, i) => (
          <FadeUp key={r.key} index={Math.min(i, 12)}>
            <Pressable onPress={() => add(r)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 20 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <T size={10} w={700}>{r.tk.slice(0, 5)}</T>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <T size={15} w={600} numberOfLines={1}>{r.tk}</T>
                  {r.own ? (
                    <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(217,188,130,0.16)' }}>
                      <T size={9.5} w={700} color={c.gold} style={{ letterSpacing: 0.8 }}>IN BEZIT</T>
                    </View>
                  ) : null}
                </View>
                <T size={12} color={c.muted} numberOfLines={1} style={{ marginTop: 2 }}>{r.name} · {r.cat === 'cr' ? 'Crypto' : 'Aandeel of ETF'}</T>
              </View>
              <Icon name={watched.has(r.key) ? 'check' : 'add'} size={22} color={watched.has(r.key) ? c.pos : c.accent} />
            </Pressable>
          </FadeUp>
        ))}
      </ScrollView>
    </ScreenIn>
  );
}
