// Schakelaar met label en uitleg (Meer, Koersalert).
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { useColors } from '../state/app';
import { T } from './T';

export function ToggleRow({ label, sub, on, onToggle }: { label: string; sub: string; on: boolean; onToggle: () => void }) {
  const c = useColors();
  const [k] = useState(() => new Animated.Value(on ? 1 : 0));
  useEffect(() => {
    Animated.timing(k, { toValue: on ? 1 : 0, duration: 200, easing: Easing.bezier(0.3, 0.7, 0.2, 1.3), useNativeDriver: true }).start();
  }, [on, k]);
  return (
    <Pressable onPress={onToggle} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 }}>
      <View style={{ flex: 1 }}>
        <T size={15} w={600}>{label}</T>
        <T size={12} color={c.muted} style={{ marginTop: 2 }}>{sub}</T>
      </View>
      <Pressable onPress={onToggle} accessibilityRole="switch" accessibilityState={{ checked: on }} style={{ width: 52, height: 32, borderRadius: 16, backgroundColor: on ? c.accent : c.faint }}>
        <Animated.View style={{ position: 'absolute', top: 4, left: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF', transform: [{ translateX: k.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) }] }} />
      </Pressable>
    </Pressable>
  );
}
