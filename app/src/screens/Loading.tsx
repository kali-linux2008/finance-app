// Laadscherm na ontgrendelen: skeletten in de vorm van het Overzicht, terwijl de bronnen synchroniseren.
import { useEffect, useState } from 'react';
import { Animated, Easing, View, type DimensionValue, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { T } from '../components/T';
import { useApp } from '../state/app';

/** Eén gedeelde animatie (1,3 s lineair, oneindig) voor alle skeletten. */
function useShimmer(): Animated.Value {
  const [k] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(k, { toValue: 1, duration: 1300, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [k]);
  return k;
}

function Bone({ shimmer, style, width, height }: { shimmer: Animated.Value; style?: ViewStyle; width?: DimensionValue; height?: DimensionValue }) {
  const { colors: c } = useApp();
  const [w, setW] = useState(0);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={[{ width, height, backgroundColor: c.surface, overflow: 'hidden' }, style]}>
      {w ? (
        // Band van 3× de breedte met in het midden een lichtere streep, die van links naar rechts schuift.
        <Animated.View
          style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, width: w * 3,
            backgroundImage: `linear-gradient(100deg, ${c.surface} 30%, ${c.surface2} 50%, ${c.surface} 70%)`,
            transform: [{ translateX: shimmer.interpolate({ inputRange: [0, 1], outputRange: [-2 * w, 0] }) }],
          }}
        />
      ) : null}
    </View>
  );
}

export function Loading() {
  const { colors: c } = useApp();
  const insets = useSafeAreaInsets();
  const s = useShimmer();
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 8, paddingHorizontal: 12, gap: 10 }} accessibilityLabel="Bezig met laden">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8 }}>
        <View style={{ gap: 8 }}>
          <Bone shimmer={s} width={110} height={12} style={{ borderRadius: 6 }} />
          <Bone shimmer={s} width={170} height={20} style={{ borderRadius: 8 }} />
        </View>
        <Bone shimmer={s} width={32} height={32} style={{ borderRadius: 16 }} />
      </View>
      <Bone shimmer={s} height={330} style={{ borderRadius: 28 }} />
      <Bone shimmer={s} height={68} style={{ borderRadius: 20 }} />
      <View style={{ flexDirection: 'row', gap: 6, height: 166 }}>
        <Bone shimmer={s} style={{ flexGrow: 48.8, flexBasis: 0, borderRadius: 18 }} />
        <View style={{ flexGrow: 51.2, flexBasis: 0, gap: 6 }}>
          <Bone shimmer={s} height={96} style={{ borderRadius: 18 }} />
          <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
            <Bone shimmer={s} style={{ flexGrow: 27, flexBasis: 0, borderRadius: 18 }} />
            <Bone shimmer={s} style={{ flexGrow: 24.2, flexBasis: 0, borderRadius: 12 }} />
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }}>
        <Animated.View style={{ transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
          <Icon name="sync" size={18} color={c.muted} />
        </Animated.View>
        <T size={13} color={c.muted}>Synchroniseren · Trading 212, ING, OKX, Trezor</T>
      </View>
    </View>
  );
}
