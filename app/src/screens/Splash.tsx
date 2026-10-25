// Opstartscherm (ontwerp 5b): verschijnt kort bij het openen, daarna volgt het vergrendelscherm.
// Donker thema: blauw verloop; licht thema: crème. De gouden balk loopt vol tijdens het opstarten.
import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { BrandMark } from '../components/BrandMark';
import { T } from '../components/T';
import { useApp } from '../state/app';

export const SPLASH_MS = 1200;

export function Splash({ onDone }: { onDone: () => void }) {
  const { theme } = useApp();
  const dark = theme === 'dark';
  const [progress] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const run = Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: SPLASH_MS, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.timing(fade, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]);
    run.start(({ finished }) => finished && onDone());
    return () => run.stop();
  }, [progress, fade, onDone]);

  const gold = dark ? '#E2CB98' : '#8A6420';
  return (
    <Animated.View
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, opacity: fade,
        backgroundColor: dark ? undefined : '#F5F0E6',
        backgroundImage: dark ? 'radial-gradient(130% 90% at 100% 0%, #4361D6 0%, #2840A8 42%, #141F5A 100%)' : undefined,
      }}
    >
      {dark ? <View style={{ position: 'absolute', top: 14, left: 14, right: 14, bottom: 14, borderWidth: 1, borderColor: 'rgba(217,188,130,0.18)', borderRadius: 26 }} /> : null}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22 }}>
        <BrandMark size={112} />
        <View style={{ alignItems: 'center' }}>
          <T serif size={38} color={dark ? '#F6E7C4' : '#1B1912'} style={{ letterSpacing: 0.38 }}>Meridian</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <View style={{ width: 14, height: 1, backgroundColor: gold }} />
            <T size={11} w={600} color={gold} style={{ letterSpacing: 11 * 0.14, textTransform: 'uppercase' }}>Vermogen in één lijn</T>
          </View>
        </View>
      </View>
      {dark ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 56, alignItems: 'center', gap: 14 }}>
          <View style={{ width: 120, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' }}>
            <Animated.View style={{ height: '100%', backgroundColor: '#D9BC82', width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
          </View>
          <T size={12} color="#C4CCEF">Synchroniseren…</T>
        </View>
      ) : null}
    </Animated.View>
  );
}
