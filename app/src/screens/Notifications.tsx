// Meldingen: wat de server je laat weten, zoals of je periodieke inleg gelukt is.
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { FadeUp, ScreenIn } from '../components/motion';
import { T } from '../components/T';
import { IconButton } from '../components/ui';
import { screenFor } from '../lib/alerts';
import { fmtDayMonth, fmtTime } from '../lib/format';
import { useColors } from '../state/app';
import { useData } from '../state/data';

const SAMPLE = [
  { id: 2, at: new Date(2026, 9, 15, 15, 46).getTime() / 1000, title: 'Inleg gelukt', body: '€ 390,00 belegd.', kind: 'ok' as const },
  { id: 1, at: new Date(2026, 9, 1, 9, 0).getTime() / 1000, title: 'Meridian', body: 'Voorbeeld: meldingen verschijnen hier.', kind: 'info' as const },
];

export function Notifications() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { live, events, unseen, markSeen, loading, refresh } = useData();
  const list = live ? events : SAMPLE;

  // Openen = gelezen.
  useEffect(() => {
    if (unseen) markSeen();
  }, [unseen, markSeen]);

  return (
    <ScreenIn style={{ backgroundColor: c.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 4, height: 56 }}>
        <IconButton name="arrow_back" size={24} onPress={() => router.back()} />
        <T size={16} w={700} style={{ flex: 1, marginLeft: 4 }}>Meldingen</T>
        <IconButton name="tune" label="Meldingen instellen" onPress={() => router.push('/meldingen-instellen')} />
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
        refreshControl={live ? <RefreshControl refreshing={loading} onRefresh={() => refresh()} tintColor={c.gold} colors={[c.accent]} /> : undefined}
      >
        {list.length ? (
          <View style={{ marginTop: 4, marginHorizontal: 12, backgroundImage: c.surfaceGrad, borderRadius: 20, boxShadow: `inset 0 0 0 1px ${c.line}`, paddingVertical: 4 }}>
            {list.map((e, i) => {
              const d = new Date(e.at * 1000);
              const [icon, color, bg] = e.kind === 'ok' ? ['check', c.pos, 'rgba(107,196,143,0.14)'] as const
                : e.kind === 'warning' ? ['close', c.neg, 'rgba(232,130,110,0.14)'] as const
                : e.kind === 'csv' ? ['account_balance', c.gold, 'rgba(217,188,130,0.14)'] as const
                : ['notifications', c.accent, c.accentSoft] as const;
              return (
                <FadeUp key={e.id} index={i}>
                  <Pressable onPress={() => router.push(screenFor(e) as never)} style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 16 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={icon} size={18} color={color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                        <T size={15} w={600} style={{ flex: 1 }}>{e.title}</T>
                        <T size={12} color={c.muted}>{fmtDayMonth(d)} · {fmtTime(d)}</T>
                      </View>
                      <T size={13} lh={1.45} color={c.muted} style={{ marginTop: 2 }}>{e.body}</T>
                    </View>
                  </Pressable>
                </FadeUp>
              );
            })}
          </View>
        ) : (
          <View style={{ alignItems: 'center', paddingTop: 48, paddingHorizontal: 32 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="notifications" size={32} color={c.gold} />
            </View>
            <T serif size={22} style={{ marginTop: 16 }}>Nog geen meldingen</T>
            <T size={14} lh={1.5} color={c.muted} style={{ marginTop: 6, textAlign: 'center' }}>Na je periodieke inleg zie je hier of alles gelukt is.</T>
          </View>
        )}
      </ScrollView>
    </ScreenIn>
  );
}
